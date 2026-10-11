// Talks to the GitHub REST API. The vault is a private repository; each save is a commit,
// which gives full version history for every note.
import { ConflictError, OfflineError } from '../core/sync.js';
import { toBase64, fromBase64, toText } from '../core/bytes.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.body = body;
  }
}

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

export class GitHubRemote {
  constructor({ token, owner, repo, branch = null }) {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.kind = 'github';
  }

  get base() {
    return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  async api(path, { method = 'GET', body, accept, raw = false } = {}) {
    let res;
    try {
      res = await fetch(path.startsWith('http') ? path : this.base + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new OfflineError('Could not reach GitHub. Check your connection.');
    }
    if (raw && res.ok) return res;
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      let msg = data?.message || `GitHub error ${res.status}`;
      if (res.status === 401) msg = 'GitHub rejected the access token. It may have expired: create a new one in Settings.';
      if (res.status === 403 && /rate limit/i.test(msg)) msg = 'GitHub rate limit reached. Try again in a few minutes.';
      if (res.status === 403 && /Resource not accessible/i.test(msg)) msg = 'The access token is missing a permission for this action. See the setup guide.';
      throw new GitHubError(res.status, msg, data);
    }
    return data;
  }

  /** Checks the token and repository; returns repository info. */
  async connect() {
    const info = await this.api('');
    if (!this.branch) this.branch = info.default_branch || 'main';
    return info;
  }

  async listFiles() {
    if (!this.branch) await this.connect();
    let tree;
    try {
      tree = await this.api(`/git/trees/${encodeURIComponent(this.branch)}?recursive=1`);
    } catch (e) {
      if (e.status === 409 || e.status === 404) return []; // empty repository
      throw e;
    }
    return tree.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha, size: t.size }));
  }

  async getFile(path, sha) {
    const blob = await this.api(`/git/blobs/${sha}`);
    return fromBase64(blob.content);
  }

  async _currentSha(path) {
    try {
      const info = await this.api(`/contents/${encPath(path)}?ref=${encodeURIComponent(this.branch)}`);
      return info.sha;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  async putFile(path, bytes, baseSha, message) {
    if (!this.branch) await this.connect();
    const body = { message: message || `Update ${path}`, content: toBase64(bytes), branch: this.branch };
    if (baseSha) body.sha = baseSha;
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await this.api(`/contents/${encPath(path)}`, { method: 'PUT', body });
        return { sha: res.content.sha, commit: res.commit.sha };
      } catch (e) {
        if (e.status === 409 || e.status === 422) {
          const current = await this._currentSha(path);
          if (current !== (baseSha || null)) throw new ConflictError(path, current);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); // branch moved under us; retry
            continue;
          }
        }
        throw e;
      }
    }
  }

  async deleteFile(path, sha, message) {
    try {
      await this.api(`/contents/${encPath(path)}`, {
        method: 'DELETE',
        body: { message: message || `Delete ${path}`, sha, branch: this.branch },
      });
    } catch (e) {
      if (e.status === 409 || e.status === 422) {
        const current = await this._currentSha(path);
        if (current === null) return;
        throw new ConflictError(path, current);
      }
      throw e;
    }
  }

  // ---- history -------------------------------------------------------------------

  async history(path, limit = 50) {
    const list = await this.api(`/commits?path=${encodeURIComponent(path)}&sha=${encodeURIComponent(this.branch)}&per_page=${limit}`);
    return list.map((c) => ({ sha: c.sha, date: c.commit.author?.date || c.commit.committer?.date, message: c.commit.message }));
  }

  async fileAt(path, commitSha) {
    try {
      const info = await this.api(`/contents/${encPath(path)}?ref=${commitSha}`);
      return toText(fromBase64(info.content));
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // ---- backups (GitHub Actions + Releases in the vault repository) ----------------

  async listBackups() {
    const releases = await this.api('/releases?per_page=100');
    return releases
      .filter((r) => /^zk-(backup|prerestore)-/.test(r.tag_name))
      .map((r) => {
        const asset = r.assets.find((a) => a.name.endsWith('.zip'));
        return {
          name: r.tag_name,
          date: r.published_at || r.created_at,
          size: asset?.size || 0,
          url: r.html_url,
          download: asset?.browser_download_url || null,
          notes: r.body || '',
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  async workflowRuns(file, limit = 5) {
    try {
      const r = await this.api(`/actions/workflows/${file}/runs?per_page=${limit}`);
      return r.workflow_runs.map((w) => ({
        id: w.id,
        status: w.status,
        conclusion: w.conclusion,
        created: w.created_at,
        updated: w.updated_at,
        url: w.html_url,
        event: w.event,
      }));
    } catch (e) {
      if (e.status === 404) return null; // workflow not installed
      throw e;
    }
  }

  async dispatch(file, inputs = {}) {
    await this.api(`/actions/workflows/${file}/dispatches`, { method: 'POST', body: { ref: this.branch, inputs } });
  }

  async getVariable(name) {
    try {
      return (await this.api(`/actions/variables/${name}`)).value;
    } catch {
      return null;
    }
  }

  get webUrl() {
    return `https://github.com/${this.owner}/${this.repo}`;
  }
}
