import { ConflictError } from '../../web/js/core/sync.js';
import { gitBlobSha, toBytes } from '../../web/js/core/bytes.js';

export class MemoryCache {
  constructor() {
    this.files = new Map();
    this.queue = new Map();
  }
  async getAll() { return [...this.files.values()]; }
  async get(path) { return this.files.get(path) || null; }
  async put(rec) { this.files.set(rec.path, { ...rec }); }
  async delete(path) { this.files.delete(path); }
  async getQueue() { return [...this.queue.values()].map((q) => ({ ...q })); }
  async putQueue(op) { this.queue.set(op.key, { ...op }); }
  async deleteQueue(key) { this.queue.delete(key); }
}

export class MemoryRemote {
  constructor() {
    this.files = new Map(); // path -> { sha, bytes }
    this.online = true;
    this.calls = [];
  }
  async seed(path, content) {
    const bytes = toBytes(content);
    this.files.set(path, { sha: await gitBlobSha(bytes), bytes });
  }
  _check() { if (!this.online) throw Object.assign(new Error('network down'), { status: 0 }); }
  async listFiles() {
    this._check();
    return [...this.files.entries()].map(([path, f]) => ({ path, sha: f.sha, size: f.bytes.length }));
  }
  async getFile(path, sha) {
    this._check();
    const f = [...this.files.entries()].find(([p, x]) => x.sha === sha || (p === path && !sha));
    if (!f) throw Object.assign(new Error('not found'), { status: 404 });
    return f[1].bytes;
  }
  async putFile(path, bytes, baseSha) {
    this._check();
    this.calls.push(['put', path]);
    const cur = this.files.get(path);
    if ((cur && cur.sha !== baseSha) || (!cur && baseSha)) throw new ConflictError(path, cur?.sha);
    const sha = await gitBlobSha(bytes);
    this.files.set(path, { sha, bytes });
    return { sha };
  }
  async deleteFile(path, sha) {
    this._check();
    this.calls.push(['delete', path]);
    const cur = this.files.get(path);
    if (!cur) throw Object.assign(new Error('not found'), { status: 404 });
    if (cur.sha !== sha) throw new ConflictError(path, cur.sha);
    this.files.delete(path);
  }
}
