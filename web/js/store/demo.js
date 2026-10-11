// "Try it" mode: a pretend remote that lives only in this browser (IndexedDB).
// It behaves like the GitHub store so the rest of the app doesn't need to know the difference.
import { openDb } from './idb.js';
import { gitBlobSha, fromBase64, toBytes } from '../core/bytes.js';
import { ConflictError } from '../core/sync.js';

export class DemoRemote {
  constructor(store) {
    this.store = store; // LocalStore used as the fake server
    this.kind = 'demo';
  }

  static async open(name = 'zk-demo-remote') {
    return new DemoRemote(await openDb(name));
  }

  async isEmpty() {
    return (await this.store.getAll()).length === 0;
  }

  /** Loads the sample vault (web/seed.json). */
  async seed(seedUrl = 'seed.json') {
    const res = await fetch(seedUrl);
    const seed = await res.json();
    for (const [path, f] of Object.entries(seed.files)) {
      const bytes = f.base64 != null ? fromBase64(f.base64) : toBytes(f.text);
      await this.store.put({ path, sha: await gitBlobSha(bytes), bytes, history: [] });
    }
  }

  async connect() {
    return { private: true, full_name: 'demo (this device only)' };
  }

  async listFiles() {
    return (await this.store.getAll()).map((f) => ({ path: f.path, sha: f.sha, size: f.bytes.length }));
  }

  async getFile(path) {
    const f = await this.store.get(path);
    if (!f) throw Object.assign(new Error('not found'), { status: 404 });
    return f.bytes;
  }

  async putFile(path, bytes, baseSha, message) {
    const cur = await this.store.get(path);
    if ((cur && cur.sha !== baseSha) || (!cur && baseSha)) throw new ConflictError(path, cur?.sha);
    const sha = await gitBlobSha(bytes);
    const history = cur ? [...(cur.history || []), { sha: cur.sha, date: cur.date || new Date().toISOString(), message: cur.message || 'Earlier version', bytes: cur.bytes }].slice(-30) : [];
    await this.store.put({ path, sha, bytes, history, date: new Date().toISOString(), message: message || 'Update' });
    return { sha };
  }

  async deleteFile(path, sha) {
    const cur = await this.store.get(path);
    if (!cur) return;
    if (cur.sha !== sha) throw new ConflictError(path, cur.sha);
    await this.store.delete(path);
  }

  // Demo history: kept per file (last 30 versions) so the History screen can be tried out.
  async history(path) {
    const cur = await this.store.get(path);
    if (!cur) return [];
    const all = [{ sha: cur.sha, date: cur.date || new Date().toISOString(), message: cur.message || 'Sample note' }, ...[...(cur.history || [])].reverse()];
    return all.map((h) => ({ sha: h.sha, date: h.date, message: h.message }));
  }

  async fileAt(path, sha) {
    const cur = await this.store.get(path);
    if (!cur) return null;
    if (cur.sha === sha) return new TextDecoder().decode(cur.bytes);
    const h = (cur.history || []).find((x) => x.sha === sha);
    return h ? new TextDecoder().decode(h.bytes) : null;
  }
}
