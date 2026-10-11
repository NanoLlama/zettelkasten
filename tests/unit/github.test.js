// Exercises the GitHub store against a small in-memory imitation of the GitHub REST API.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubRemote } from '../../web/js/store/github.js';
import { SyncEngine, ConflictError } from '../../web/js/core/sync.js';
import { gitBlobSha, toBase64, fromBase64, toBytes, toText } from '../../web/js/core/bytes.js';
import { MemoryCache } from './helpers.js';

function fakeGitHub() {
  const files = new Map(); // path -> { sha, bytes }
  const commits = []; // { sha, path, message }
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const handler = async (url, init = {}) => {
    const u = new URL(url);
    expect(init.headers.Authorization).toBe('Bearer tok');
    const m = /^\/repos\/me\/vault(\/.*)?$/.exec(u.pathname);
    if (!m) return json(404, { message: 'Not Found' });
    const rest = m[1] || '';
    const method = init.method || 'GET';
    if (!rest) return json(200, { private: true, default_branch: 'main', permissions: { push: true }, owner: { login: 'me' }, name: 'vault' });
    if (rest.startsWith('/git/trees/')) {
      if (!files.size) return json(409, { message: 'Git Repository is empty.' });
      return json(200, { tree: [...files].map(([path, f]) => ({ path, type: 'blob', sha: f.sha, size: f.bytes.length })) });
    }
    if (rest.startsWith('/git/blobs/')) {
      const sha = rest.split('/').pop();
      const f = [...files.values()].find((x) => x.sha === sha);
      return f ? json(200, { content: toBase64(f.bytes), encoding: 'base64' }) : json(404, { message: 'Not Found' });
    }
    if (rest.startsWith('/contents/')) {
      const path = decodeURIComponent(rest.slice('/contents/'.length));
      const cur = files.get(path);
      if (method === 'GET') return cur ? json(200, { sha: cur.sha, content: toBase64(cur.bytes) }) : json(404, { message: 'Not Found' });
      const body = JSON.parse(init.body);
      if (method === 'PUT') {
        if (cur && !body.sha) return json(422, { message: '"sha" wasn\'t supplied.' });
        if (cur && body.sha !== cur.sha) return json(409, { message: 'does not match' });
        const bytes = fromBase64(body.content);
        const sha = await gitBlobSha(bytes);
        files.set(path, { sha, bytes });
        const commit = { sha: 'c' + commits.length, path, message: body.message, date: new Date().toISOString() };
        commits.push(commit);
        return json(cur ? 200 : 201, { content: { sha }, commit: { sha: commit.sha } });
      }
      if (method === 'DELETE') {
        if (!cur) return json(404, { message: 'Not Found' });
        if (body.sha !== cur.sha) return json(409, { message: 'does not match' });
        files.delete(path);
        return json(200, {});
      }
    }
    if (rest.startsWith('/commits')) {
      const path = u.searchParams.get('path');
      return json(200, commits.filter((c) => c.path === path).reverse().map((c) => ({ sha: c.sha, commit: { message: c.message, author: { date: c.date } } })));
    }
    return json(404, { message: 'Not Found' });
  };
  return { files, commits, handler };
}

describe('GitHub store', () => {
  let gh;
  let remote;
  beforeEach(() => {
    gh = fakeGitHub();
    vi.stubGlobal('fetch', vi.fn((url, init) => gh.handler(url, init)));
    remote = new GitHubRemote({ token: 'tok', owner: 'me', repo: 'vault' });
  });

  it('connects and handles an empty repository', async () => {
    const info = await remote.connect();
    expect(info.private).toBe(true);
    expect(remote.branch).toBe('main');
    expect(await remote.listFiles()).toEqual([]);
  });

  it('creates, updates, reads and deletes files; each save is a commit', async () => {
    const a = await remote.putFile('notes/x.md', toBytes('one'), null, 'add');
    const b = await remote.putFile('notes/x.md', toBytes('two'), a.sha, 'edit');
    expect(toText(await remote.getFile('notes/x.md', b.sha))).toBe('two');
    const hist = await remote.history('notes/x.md');
    expect(hist.map((h) => h.message)).toEqual(['edit', 'add']);
    await remote.deleteFile('notes/x.md', b.sha, 'del');
    expect(await remote.listFiles()).toEqual([]);
  });

  it('reports a conflict when the file changed elsewhere', async () => {
    const a = await remote.putFile('notes/x.md', toBytes('one'), null);
    await remote.putFile('notes/x.md', toBytes('laptop'), a.sha);
    await expect(remote.putFile('notes/x.md', toBytes('phone'), a.sha)).rejects.toBeInstanceOf(ConflictError);
    await expect(remote.putFile('notes/x.md', toBytes('phone'), null)).rejects.toBeInstanceOf(ConflictError);
  });

  it('syncs end to end with a conflict copy', async () => {
    const a = await remote.putFile('notes/20260101-0900-a.md', toBytes('A1'), null);
    const cache = new MemoryCache();
    const engine = new SyncEngine({
      remote,
      cache,
      onConflict: async (path, remoteBytes) => ({ path: 'notes/20260101-0901-copy.md', bytes: remoteBytes }),
    });
    await engine.pull();
    await remote.putFile('notes/20260101-0900-a.md', toBytes('edited on laptop'), a.sha);
    await engine.write('notes/20260101-0900-a.md', toBytes('edited on phone'), 'edit');
    await engine.flush();
    expect(toText(gh.files.get('notes/20260101-0900-a.md').bytes)).toBe('edited on phone');
    expect(toText(gh.files.get('notes/20260101-0901-copy.md').bytes)).toBe('edited on laptop');
  });

  it('gives a clear message for a bad token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"Bad credentials"}', { status: 401 })));
    await expect(remote.connect()).rejects.toThrow(/access token/);
  });
});
