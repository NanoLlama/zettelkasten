// First-time setup of a vault repository: README, backup workflows, backup tools,
// and (optionally) the sample notes. Re-running it updates the tools and workflows.
import { zk } from '../zk.js';
import { toBytes, fromBase64 } from '../core/bytes.js';

const TEMPLATE = [
  ['vault-template/README.md', 'README.md'],
  ['vault-template/zk/tools/backup.mjs', '.zk/tools/backup.mjs'],
  ['vault-template/github/workflows/zk-backup.yml', '.github/workflows/zk-backup.yml'],
  ['vault-template/github/workflows/zk-restore.yml', '.github/workflows/zk-restore.yml'],
  ['vault-template/github/workflows/zk-test-restore.yml', '.github/workflows/zk-test-restore.yml'],
];
// The backup job reuses the app's own parsing and search code to test that a backup restores.
const CORE = ['bytes', 'diff', 'frontmatter', 'ids', 'links', 'query', 'retention', 'search', 'sync', 'vault'];

/** Cron line (UTC) for a local time, using today's offset. */
export function localTimeToCron(hour, minute = 0, dayOfWeek = '*') {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return `${d.getUTCMinutes()} ${d.getUTCHours()} * * ${dayOfWeek}`;
}

export const VAULT_FORMAT = 1;

export async function vaultStatus() {
  const files = await zk.remote.listFiles();
  const paths = new Set(files.map((f) => f.path));
  return {
    initialized: paths.has('.zk/vault.json'),
    hasWorkflows: paths.has('.github/workflows/zk-backup.yml'),
    noteCount: files.filter((f) => f.path.startsWith('notes/')).length,
    fileCount: files.length,
  };
}

/** Writes (or updates) the vault scaffolding. `onProgress(msg)`. */
export async function installVault({ samples = false, onProgress = () => {} } = {}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const appUrl = location.origin + location.pathname.replace(/index\.html$/, '');
  const vars = {
    __CRON__: localTimeToCron(2, 0),
    __TEST_CRON__: localTimeToCron(4, 0, '0'),
    __TZ__: tz,
    __APP_URL__: appUrl,
  };
  const files = [];
  for (const [src, dest] of TEMPLATE) {
    let text = await (await fetch(src, { cache: 'no-store' })).text();
    for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
    files.push([dest, toBytes(text)]);
  }
  for (const name of CORE) {
    const text = await (await fetch(`js/core/${name}.js`, { cache: 'no-store' })).text();
    files.push([`.zk/tools/js/core/${name}.js`, toBytes(text)]);
  }
  files.push(['.zk/tools/vendor/js-yaml.mjs', toBytes(await (await fetch('vendor/js-yaml.mjs')).text())]);
  files.push(['.zk/vault.json', toBytes(JSON.stringify({ format: VAULT_FORMAT, app: appUrl, timezone: tz, installed: new Date().toISOString() }, null, 2) + '\n')]);

  if (samples) {
    const seed = await (await fetch('seed.json')).json();
    for (const [path, f] of Object.entries(seed.files)) files.push([path, f.base64 != null ? fromBase64(f.base64) : toBytes(f.text)]);
  }

  // Upload in order; skip files that are already identical.
  const existing = new Map((await zk.remote.listFiles()).map((f) => [f.path, f.sha]));
  const { gitBlobSha } = await import('../core/bytes.js');
  let i = 0;
  for (const [path, bytes] of files) {
    i++;
    const sha = existing.get(path) || null;
    if (sha && sha === (await gitBlobSha(bytes))) continue;
    onProgress(`Uploading ${i} of ${files.length}: ${path}`);
    try {
      await zk.remote.putFile(path, bytes, sha, path.startsWith('notes/') || path.startsWith('attachments/') ? `Add sample: ${path}` : `Set up Slip-box: ${path}`);
    } catch (e) {
      if (path.startsWith('.github/') && (e.status === 403 || e.status === 404)) {
        throw new Error('GitHub refused to add the backup workflows. Give the access token the “Workflows: Read and write” permission (see the setup guide), then try again.');
      }
      throw e;
    }
  }
  onProgress('Done.');
  await zk.refresh({ quiet: true });
}
