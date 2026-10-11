// App state: which vault is open, the on-device copy, the sync engine and the in-memory model.
import { Vault, isNotePath, ATTACH_DIR } from './core/vault.js';
import { SyncEngine, OfflineError } from './core/sync.js';
import { toText } from './core/bytes.js';
import { openDb } from './store/idb.js';
import { GitHubRemote } from './store/github.js';
import { DemoRemote } from './store/demo.js';
import { conflictCopy } from './services/notes.js';

const CONFIG_KEY = 'zk:config';

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveConfig(cfg) {
  if (cfg) localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(CONFIG_KEY);
}

export function dbName(cfg) {
  return cfg.mode === 'demo' ? 'zk-demo' : `zk-gh-${cfg.owner}-${cfg.repo}`.toLowerCase();
}

export const zk = {
  config: null,
  remote: null,
  local: null,
  sync: null,
  vault: new Vault(),
  bus: new EventTarget(),
  status: { phase: 'idle', pending: 0, online: navigator.onLine, lastSync: null, error: null, loaded: false },
  repoInfo: null,

  emit(type, detail) {
    this.bus.dispatchEvent(new CustomEvent(type, { detail }));
  },
  on(type, fn) {
    this.bus.addEventListener(type, fn);
    return () => this.bus.removeEventListener(type, fn);
  },

  get isDemo() {
    return this.config?.mode === 'demo';
  },

  async start(cfg) {
    this.config = cfg;
    this.vault = new Vault();
    this.local = await openDb(dbName(cfg));
    if (cfg.mode === 'demo') {
      this.remote = await DemoRemote.open();
      if (await this.remote.isEmpty()) await this.remote.seed();
    } else {
      this.remote = new GitHubRemote({ token: cfg.token, owner: cfg.owner, repo: cfg.repo, branch: cfg.branch || null });
    }
    this.sync = new SyncEngine({
      remote: this.remote,
      cache: this.local,
      isOnline: () => this.isDemo || navigator.onLine,
      onConflict: (path, remoteBytes) => conflictCopy(path, remoteBytes),
      onChange: (c) => this._applyChanges(c),
      onStatus: (s) => this._onSyncStatus(s),
    });

    // 1. Show what is on this device right away (works offline).
    const t0 = performance.now();
    for (const rec of await this.local.getAll()) {
      if (rec.path.startsWith(ATTACH_DIR)) {
        this.vault.setAttachmentFile(hashOf(rec.path), { path: rec.path, size: rec.bytes?.length || 0 });
        continue;
      }
      this.vault.loadFile(rec.path, toText(rec.bytes));
    }
    for (const f of (await this.local.getMeta('remoteFiles', [])) || []) {
      if (f.path.startsWith(ATTACH_DIR)) this.vault.setAttachmentFile(hashOf(f.path), { path: f.path, size: f.size });
    }
    this.status.loaded = true;
    this.status.lastSync = await this.local.getMeta('lastSync');
    this.status.pending = await this.sync.pending();
    console.info(`Loaded ${this.vault.notes.size} notes from this device in ${Math.round(performance.now() - t0)} ms`);
    this.emit('change', { initial: true });
    this.emit('status', this.status);
  },

  /** Fetches changes from the vault and sends queued edits. */
  async refresh({ quiet = false } = {}) {
    if (!this.sync) return;
    if (!this.isDemo && !navigator.onLine) {
      this.status.online = false;
      this.emit('status', this.status);
      return;
    }
    try {
      this.status.phase = 'pull';
      this.emit('status', this.status);
      await this.sync.flush();
      await this.sync.pull();
      this.status.lastSync = new Date().toISOString();
      await this.local.setMeta('lastSync', this.status.lastSync);
      this.status.error = null;
    } catch (e) {
      this.status.error = e instanceof OfflineError ? null : e.message;
      this.status.online = !(e instanceof OfflineError);
      if (!quiet && !(e instanceof OfflineError)) this.emit('error', e);
    } finally {
      this.status.phase = 'idle';
      this.status.pending = await this.sync.pending();
      this.emit('status', this.status);
    }
  },

  async flush() {
    try {
      await this.sync.flush();
      this.status.error = null;
    } catch (e) {
      if (!(e instanceof OfflineError)) {
        this.status.error = e.message;
        this.emit('error', e);
      }
    } finally {
      this.status.pending = await this.sync.pending();
      this.emit('status', this.status);
    }
  },

  _applyChanges({ changed, removed, files }) {
    for (const c of changed) this.vault.loadFile(c.path, toText(c.bytes));
    for (const p of removed) this.vault.removePath(p);
    if (files) {
      const attach = files.filter((f) => f.path.startsWith(ATTACH_DIR));
      for (const f of attach) this.vault.setAttachmentFile(hashOf(f.path), { path: f.path, size: f.size, sha: f.sha });
      this.local.setMeta('remoteFiles', attach).catch(() => {});
    }
    if (changed.length || removed.length) this.emit('change', { changed: changed.map((c) => c.path), removed });
  },

  _onSyncStatus(s) {
    if (s.phase === 'conflict') this.emit('conflict', s);
    if (s.phase === 'error') this.status.error = s.error?.message;
    this.status.syncPhase = s.phase;
    this.emit('status', this.status);
  },

  /** Writes a file locally (instantly visible) and queues it for upload. */
  async writeFile(path, bytes, message) {
    if (isNotePath(path) || path.startsWith('.zk/')) this.vault.loadFile(path, toText(bytes));
    await this.sync.write(path, bytes, message);
    this.status.pending = await this.sync.pending();
    this.emit('change', { changed: [path], removed: [] });
    this.emit('status', this.status);
    this.flush();
  },

  async removeFile(path, message) {
    this.vault.removePath(path);
    await this.sync.remove(path, message);
    this.status.pending = await this.sync.pending();
    this.emit('change', { changed: [], removed: [path] });
    this.flush();
  },
};

export const hashOf = (path) => path.slice(ATTACH_DIR.length).replace(/\.[^.]*$/, '');
