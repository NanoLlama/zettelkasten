// Small IndexedDB wrapper: the on-device copy of the vault, the upload queue,
// cached attachments and settings. One database per vault.

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function openDb(name) {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore('files', { keyPath: 'path' });
    db.createObjectStore('queue', { keyPath: 'key' });
    db.createObjectStore('blobs', { keyPath: 'key' });
    db.createObjectStore('meta', { keyPath: 'key' });
  };
  const db = await req(open);
  return new LocalStore(db);
}

export async function deleteDb(name) {
  await req(indexedDB.deleteDatabase(name));
}

export class LocalStore {
  constructor(db) {
    this.db = db;
  }

  _tx(store, mode = 'readonly') {
    return this.db.transaction(store, mode).objectStore(store);
  }

  // files: { path, sha, bytes, dirty }
  getAll() { return req(this._tx('files').getAll()); }
  async get(path) { return (await req(this._tx('files').get(path))) || null; }
  put(rec) { return req(this._tx('files', 'readwrite').put(rec)); }
  delete(path) { return req(this._tx('files', 'readwrite').delete(path)); }

  // upload queue
  getQueue() { return req(this._tx('queue').getAll()); }
  putQueue(op) { return req(this._tx('queue', 'readwrite').put(op)); }
  deleteQueue(key) { return req(this._tx('queue', 'readwrite').delete(key)); }

  // attachment cache: { key: path, bytes, type }
  async getBlob(key) { return (await req(this._tx('blobs').get(key))) || null; }
  putBlob(key, bytes, type) { return req(this._tx('blobs', 'readwrite').put({ key, bytes, type })); }
  deleteBlob(key) { return req(this._tx('blobs', 'readwrite').delete(key)); }

  async getMeta(key, fallback = null) {
    const r = await req(this._tx('meta').get(key));
    return r ? r.value : fallback;
  }
  setMeta(key, value) { return req(this._tx('meta', 'readwrite').put({ key, value })); }
}
