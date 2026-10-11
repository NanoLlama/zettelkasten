// Keeps a local copy of the vault on the device and syncs it with the remote store.
//
// - Every change is written to the local cache first (so it works offline), then queued.
// - The queue is sent to the remote one change at a time when online.
// - If the remote file changed since we last saw it, the local edit wins and the remote
//   version is saved as a separate "conflict copy" note, so nothing is lost silently.

export class ConflictError extends Error {
  constructor(path, remoteSha) {
    super(`Conflict on ${path}`);
    this.name = 'ConflictError';
    this.path = path;
    this.remoteSha = remoteSha;
  }
}

export class OfflineError extends Error {
  constructor(msg = 'offline') {
    super(msg);
    this.name = 'OfflineError';
  }
}

/** Which remote files are mirrored with their content (attachments are fetched on demand). */
export const isMirrored = (p) =>
  (p.startsWith('notes/') && p.endsWith('.md')) ||
  (p.startsWith('.zk/extracted/') && p.endsWith('.txt')) ||
  (p.startsWith('.zk/trash/') && p.endsWith('.md'));

export class SyncEngine {
  /**
   * remote: { listFiles(), getFile(path, sha), putFile(path, bytes, baseSha, msg), deleteFile(path, sha, msg) }
   * cache:  { getAll(), get(path), put(rec), delete(path), getQueue(), putQueue(op), deleteQueue(key) }
   * onConflict(path, remoteBytes, localBytes) -> Promise<{ path, bytes } | null>  (the conflict copy to save)
   * onChange({ changed:[{path, text|null}], removed:[path], files:[{path, sha, size}] })
   */
  constructor({ remote, cache, onConflict, onChange, onStatus, isOnline = () => true }) {
    this.remote = remote;
    this.cache = cache;
    this.onConflict = onConflict || (async () => null);
    this.onChange = onChange || (() => {});
    this.onStatus = onStatus || (() => {});
    this.isOnline = isOnline;
    this.flushing = null;
    this.pulling = null;
    this.remoteFiles = new Map(); // path -> { sha, size }
    this.lastError = null;
  }

  async pending() {
    return (await this.cache.getQueue()).length;
  }

  /** Downloads everything that changed remotely since the last pull. */
  pull() {
    if (!this.pulling) this.pulling = this._pull().finally(() => (this.pulling = null));
    return this.pulling;
  }

  async _pull() {
    const files = await this.remote.listFiles();
    this.remoteFiles = new Map(files.map((f) => [f.path, f]));
    const queue = await this.cache.getQueue();
    const pendingPaths = new Set(queue.map((q) => q.path));
    const local = new Map((await this.cache.getAll()).map((r) => [r.path, r]));
    const changed = [];
    const removed = [];

    const toFetch = files.filter((f) => isMirrored(f.path) && !pendingPaths.has(f.path) && local.get(f.path)?.sha !== f.sha);
    let done = 0;
    const worker = async () => {
      while (toFetch.length) {
        const f = toFetch.shift();
        const bytes = await this.remote.getFile(f.path, f.sha);
        await this.cache.put({ path: f.path, sha: f.sha, bytes, dirty: false });
        changed.push({ path: f.path, bytes });
        done++;
        if (done % 20 === 0) this.onStatus({ phase: 'pull', done, total: done + toFetch.length });
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));

    for (const [path, rec] of local) {
      if (!isMirrored(path) || this.remoteFiles.has(path) || pendingPaths.has(path) || rec.dirty) continue;
      if (!rec.sha) continue; // never synced; keep
      await this.cache.delete(path);
      removed.push(path);
    }
    this.onChange({ changed, removed, files });
    return { changed: changed.length, removed: removed.length };
  }

  /** Saves a file locally and queues it for upload. */
  async write(path, bytes, message) {
    const prev = await this.cache.get(path);
    await this.cache.put({ path, sha: prev?.sha ?? null, bytes, dirty: true });
    await this._enqueue({ op: 'put', path, baseSha: prev?.sha ?? this.remoteFiles.get(path)?.sha ?? null, message });
    this.flush().catch(() => {});
  }

  /** Deletes a file locally and queues the deletion. */
  async remove(path, message) {
    const prev = await this.cache.get(path);
    await this.cache.delete(path);
    const baseSha = prev?.sha ?? this.remoteFiles.get(path)?.sha ?? null;
    await this._enqueue({ op: 'delete', path, baseSha, message });
    this.flush().catch(() => {});
  }

  async _enqueue(op) {
    const queue = await this.cache.getQueue();
    const existing = queue.find((q) => q.path === op.path);
    if (existing) {
      // Collapse repeated edits to one upload; keep the original base version for conflict checks.
      if (existing.op === 'put' && existing.baseSha == null && op.op === 'delete') {
        await this.cache.deleteQueue(existing.key); // created and deleted before upload: nothing to send
        return;
      }
      await this.cache.putQueue({ ...existing, op: op.op, message: op.message, time: Date.now(), rev: (existing.rev || 0) + 1 });
      return;
    }
    await this.cache.putQueue({ ...op, key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, time: Date.now(), rev: 0 });
  }

  /** Sends queued changes. Safe to call often. */
  flush() {
    if (!this.flushing) this.flushing = this._flush().finally(() => (this.flushing = null));
    return this.flushing;
  }

  async _flush() {
    let sent = 0;
    for (;;) {
      if (!this.isOnline()) break;
      const queue = (await this.cache.getQueue()).sort((a, b) => a.key.localeCompare(b.key));
      if (!queue.length) break;
      const item = queue[0];
      this.onStatus({ phase: 'push', remaining: queue.length });
      try {
        await this._send(item);
        const now = (await this.cache.getQueue()).find((q) => q.key === item.key);
        if (!now || now.rev === item.rev) {
          await this.cache.deleteQueue(item.key);
          const rec = item.op === 'put' ? await this.cache.get(item.path) : null;
          if (rec?.dirty) await this.cache.put({ ...rec, dirty: false });
        } // else: edited again while uploading; it stays queued (with the new base version)
        sent++;
        this.lastError = null;
      } catch (e) {
        this.lastError = e;
        this.onStatus({ phase: 'error', error: e });
        throw e;
      }
    }
    this.onStatus({ phase: 'idle', sent });
    return sent;
  }

  async _send(item) {
    if (item.op === 'delete') {
      if (!item.baseSha) return;
      try {
        await this.remote.deleteFile(item.path, item.baseSha, item.message);
        this.remoteFiles.delete(item.path);
      } catch (e) {
        if (e instanceof ConflictError) {
          // Someone edited the file elsewhere: keep their version instead of deleting it.
          // The next pull brings it back.
          return;
        }
        if (e.status === 404) return;
        throw e;
      }
      return;
    }
    const rec = await this.cache.get(item.path);
    if (!rec) return; // deleted locally after being queued
    try {
      const { sha } = await this.remote.putFile(item.path, rec.bytes, item.baseSha, item.message);
      await this._markClean(item.path, sha, rec.bytes);
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      await this._resolveConflict(item, rec, e);
    }
  }

  async _resolveConflict(item, rec, err) {
    const files = await this.remote.listFiles();
    const current = files.find((f) => f.path === item.path);
    if (current && current.sha === (await this._sha(rec.bytes))) {
      return this._markClean(item.path, current.sha, rec.bytes); // same content already there
    }
    if (current && !item.path.startsWith('attachments/')) {
      const remoteBytes = await this.remote.getFile(item.path, current.sha);
      const copy = await this.onConflict(item.path, remoteBytes, rec.bytes);
      if (copy) {
        const res = await this.remote.putFile(copy.path, copy.bytes, null, `Conflict copy of ${item.path}`);
        await this.cache.put({ path: copy.path, sha: res.sha, bytes: copy.bytes, dirty: false });
        this.onChange({ changed: [{ path: copy.path, bytes: copy.bytes }], removed: [], files: null });
      }
    }
    if (item.path.startsWith('attachments/') && current) {
      return this._markClean(item.path, current.sha, rec.bytes); // content-addressed: same name, same file
    }
    const { sha } = await this.remote.putFile(item.path, rec.bytes, current ? current.sha : null, item.message);
    await this._markClean(item.path, sha, rec.bytes);
    if (err) this.onStatus({ phase: 'conflict', path: item.path });
  }

  async _markClean(path, sha, bytes) {
    const latest = await this.cache.get(path);
    if (latest) await this.cache.put({ ...latest, sha });
    // A later edit of this file must build on the version we just uploaded.
    for (const q of await this.cache.getQueue()) if (q.path === path && q.baseSha !== sha) await this.cache.putQueue({ ...q, baseSha: sha });
    this.remoteFiles.set(path, { path, sha, size: bytes?.length ?? 0 });
  }

  async _sha(bytes) {
    const { gitBlobSha } = await import('./bytes.js');
    return gitBlobSha(bytes);
  }
}
