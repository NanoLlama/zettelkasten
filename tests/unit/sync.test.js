import { describe, it, expect, beforeEach } from 'vitest';
import { SyncEngine } from '../../web/js/core/sync.js';
import { toBytes, toText } from '../../web/js/core/bytes.js';
import { MemoryCache, MemoryRemote } from './helpers.js';

describe('sync engine', () => {
  let remote, cache, engine, conflicts, online;
  beforeEach(async () => {
    remote = new MemoryRemote();
    cache = new MemoryCache();
    conflicts = [];
    online = true;
    await remote.seed('notes/20260101-0900-a.md', 'A1');
    await remote.seed('attachments/' + 'f'.repeat(64) + '.png', 'PNG');
    engine = new SyncEngine({
      remote,
      cache,
      isOnline: () => online,
      onConflict: async (path, remoteBytes) => {
        conflicts.push(path);
        return { path: 'notes/20260101-0901-conflict.md', bytes: remoteBytes };
      },
    });
  });

  it('pulls notes but not attachment contents', async () => {
    await engine.pull();
    expect(toText((await cache.get('notes/20260101-0900-a.md')).bytes)).toBe('A1');
    expect(await cache.get('attachments/' + 'f'.repeat(64) + '.png')).toBe(null);
    expect(engine.remoteFiles.size).toBe(2);
  });

  it('uploads local edits', async () => {
    await engine.pull();
    await engine.write('notes/20260101-0900-a.md', toBytes('A2'), 'edit');
    await engine.flush();
    expect(toText(remote.files.get('notes/20260101-0900-a.md').bytes)).toBe('A2');
    expect(await engine.pending()).toBe(0);
    expect((await cache.get('notes/20260101-0900-a.md')).dirty).toBe(false);
  });

  it('queues edits while offline and sends them later, collapsed into one upload', async () => {
    await engine.pull();
    online = false;
    remote.online = false;
    await engine.write('notes/20260101-0900-a.md', toBytes('A2'), 'edit 1');
    await engine.write('notes/20260101-0900-a.md', toBytes('A3'), 'edit 2');
    await engine.write('notes/20260102-0900-new.md', toBytes('N'), 'new');
    expect(await engine.pending()).toBe(2);
    online = true;
    remote.online = true;
    await engine.flush();
    expect(toText(remote.files.get('notes/20260101-0900-a.md').bytes)).toBe('A3');
    expect(toText(remote.files.get('notes/20260102-0900-new.md').bytes)).toBe('N');
    expect(remote.calls.filter((c) => c[1] === 'notes/20260101-0900-a.md').length).toBe(1);
  });

  it('keeps a conflict copy when the file changed elsewhere (local edit wins)', async () => {
    await engine.pull();
    await remote.seed('notes/20260101-0900-a.md', 'A-from-laptop');
    await engine.write('notes/20260101-0900-a.md', toBytes('A-from-phone'), 'edit');
    await engine.flush();
    expect(conflicts).toEqual(['notes/20260101-0900-a.md']);
    expect(toText(remote.files.get('notes/20260101-0900-a.md').bytes)).toBe('A-from-phone');
    expect(toText(remote.files.get('notes/20260101-0901-conflict.md').bytes)).toBe('A-from-laptop');
  });

  it('does not delete a file that was changed elsewhere', async () => {
    await engine.pull();
    await remote.seed('notes/20260101-0900-a.md', 'changed');
    await engine.remove('notes/20260101-0900-a.md', 'delete');
    await engine.flush();
    expect(remote.files.has('notes/20260101-0900-a.md')).toBe(true);
    await engine.pull();
    expect(toText((await cache.get('notes/20260101-0900-a.md')).bytes)).toBe('changed');
  });

  it('applies remote deletions and keeps unsent local files', async () => {
    await engine.pull();
    online = false;
    await engine.write('notes/20260103-0900-local.md', toBytes('L'), 'new');
    remote.files.delete('notes/20260101-0900-a.md');
    const res = await engine.pull();
    expect(res.removed).toBe(1);
    expect(await cache.get('notes/20260103-0900-local.md')).not.toBe(null);
  });

  it('creating then deleting before upload sends nothing', async () => {
    online = false;
    await engine.write('notes/20260104-0900-tmp.md', toBytes('T'), 'new');
    await engine.remove('notes/20260104-0900-tmp.md', 'delete');
    expect(await engine.pending()).toBe(0);
  });

  it('a failed upload stays queued', async () => {
    await engine.pull();
    remote.online = false;
    await engine.write('notes/20260101-0900-a.md', toBytes('A2'), 'edit');
    await expect(engine.flush()).rejects.toThrow();
    expect(await engine.pending()).toBe(1);
    remote.online = true;
    await engine.flush();
    expect(await engine.pending()).toBe(0);
  });
});
