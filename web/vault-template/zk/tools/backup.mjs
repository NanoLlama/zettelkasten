#!/usr/bin/env node
// Backup tools for a Slip-box vault. Run by the GitHub Actions workflows in .github/workflows.
//
//   node .zk/tools/backup.mjs purge-trash            remove trashed notes older than 30 days
//   node .zk/tools/backup.mjs archive <dir> [prefix] build + verify a zip of the vault
//   node .zk/tools/backup.mjs prune                  delete old backup releases (7 daily, 4 weekly, 12 monthly)
//   node .zk/tools/backup.mjs verify <zip>           unzip to a temp folder, check checksums, rebuild the index
//   node .zk/tools/backup.mjs restore <zip>          replace notes/attachments with the backup's contents
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, rmSync, existsSync, mkdirSync, cpSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const policy = {
  daily: Number(process.env.ZK_KEEP_DAILY || 7),
  weekly: Number(process.env.ZK_KEEP_WEEKLY || 4),
  monthly: Number(process.env.ZK_KEEP_MONTHLY || 12),
};

function stamp(d = new Date()) {
  // Local time of the TZ environment variable (set in the workflow).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TZ || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

function output(key, value) {
  console.log(`${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function walk(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, base, out);
    else out.push(p.slice(base.length + 1).split('\\').join('/'));
  }
  return out;
}

function vaultFiles() {
  return sh('git', ['ls-files', '-z'], { cwd: root }).split('\0').filter(Boolean);
}

function purgeTrash(days = 30) {
  const dir = join(root, '.zk', 'trash');
  if (!existsSync(dir)) return console.log('Trash is empty.');
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const text = readFileSync(join(dir, name), 'utf8');
    const m = /^deleted:\s*"?([^"\n]+)"?/m.exec(text);
    if (m && Date.now() - new Date(m[1]).getTime() > days * 86400000) {
      rmSync(join(dir, name));
      removed++;
    }
  }
  console.log(`Removed ${removed} note(s) from the trash.`);
}

async function archive(outDir, prefix = 'zk-backup') {
  const files = vaultFiles();
  const manifest = {
    format: 1,
    created: new Date().toISOString(),
    notes: files.filter((f) => /^notes\/[^/]+\.md$/.test(f)).length,
    attachments: files.filter((f) => f.startsWith('attachments/')).length,
    files: files.map((path) => {
      const buf = readFileSync(join(root, path));
      return { path, size: buf.length, sha256: sha256(buf) };
    }),
  };
  const name = `${prefix}-${stamp()}`;
  mkdirSync(outDir, { recursive: true });
  const zip = join(outDir, `${name}.zip`);
  writeFileSync(join(root, 'zk-manifest.json'), JSON.stringify(manifest, null, 2));
  try {
    sh('zip', ['-X', '-q', zip, '-@'], { cwd: root, input: [...files, 'zk-manifest.json'].join('\n') });
  } finally {
    rmSync(join(root, 'zk-manifest.json'), { force: true });
  }
  writeFileSync(join(outDir, `${name}.manifest.json`), JSON.stringify(manifest, null, 2));
  const result = verifyZip(zip, { keep: true });
  try {
    result.indexed = await reindexCheck(result.dir, manifest.notes);
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
  const size = statSync(zip).size;
  output('name', name);
  output('zip', zip);
  output('manifest', join(outDir, `${name}.manifest.json`));
  output('size', size);
  writeFileSync(join(outDir, `${name}.notes.md`),
    `Automatic backup of the vault.\n\n- Notes: ${manifest.notes}\n- Attachments: ${manifest.attachments}\n- Files: ${manifest.files.length}\n- Size: ${(size / 1048576).toFixed(2)} MB\n- Verified: ${result.checked} checksums OK, index rebuilt with ${result.indexed} notes\n`);
  output('notes_file', join(outDir, `${name}.notes.md`));
}

/** Unzips into a temp folder, checks every checksum and rebuilds the search index from the files. */
function verifyZip(zip, { keep = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'zk-verify-'));
  try {
    sh('unzip', ['-q', zip, '-d', dir]);
    const manifest = JSON.parse(readFileSync(join(dir, 'zk-manifest.json'), 'utf8'));
    const present = walk(dir).filter((f) => f !== 'zk-manifest.json');
    if (present.length !== manifest.files.length) throw new Error(`File count mismatch: zip has ${present.length}, manifest lists ${manifest.files.length}`);
    for (const f of manifest.files) {
      const buf = readFileSync(join(dir, f.path));
      if (sha256(buf) !== f.sha256) throw new Error(`Checksum mismatch: ${f.path}`);
    }
    return { checked: manifest.files.length, indexed: manifest.notes, dir, manifest };
  } finally {
    if (!keep) rmSync(dir, { recursive: true, force: true });
  }
}

async function reindexCheck(dir, expectedNotes) {
  const { Vault } = await import('./js/core/vault.js');
  const v = new Vault();
  const notesDir = join(dir, 'notes');
  let files = 0;
  if (existsSync(notesDir)) for (const name of readdirSync(notesDir)) {
    if (!name.endsWith('.md')) continue;
    v.loadFile(`notes/${name}`, readFileSync(join(notesDir, name), 'utf8'));
    files++;
  }
  const exDir = join(dir, '.zk', 'extracted');
  if (existsSync(exDir)) for (const name of readdirSync(exDir)) v.loadFile(`.zk/extracted/${name}`, readFileSync(join(exDir, name), 'utf8'));
  const broken = v.list().reduce((n, note) => n + v.outgoing(note.id).filter((l) => !l.to).length, 0);
  const probe = v.list()[0];
  if (probe && !v.search(probe.title.split(/\s+/)[0] || probe.id).length) throw new Error('Search index check failed');
  if (expectedNotes != null && v.notes.size + v.duplicates.length !== expectedNotes) throw new Error(`Expected ${expectedNotes} notes, indexed ${v.notes.size}`);
  console.log(`Index rebuilt: ${v.notes.size} notes from ${files} files, ${v.tagCounts().length} tags, ${broken} link(s) to notes not written yet.`);
  return v.notes.size;
}

async function verify(zip) {
  const r = verifyZip(zip, { keep: true });
  try {
    console.log(`Checksums OK for ${r.checked} files.`);
    await reindexCheck(r.dir, r.manifest.notes);
    console.log('Test restore passed.');
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
}

async function prune() {
  const { applyRetention } = await import('./js/core/retention.js');
  const list = JSON.parse(sh('gh', ['release', 'list', '--limit', '500', '--json', 'tagName']));
  const backups = list.map((r) => r.tagName).filter((t) => t.startsWith('zk-backup-'));
  const safety = list.map((r) => r.tagName).filter((t) => t.startsWith('zk-prerestore-')).sort().reverse();
  const { prune: old } = applyRetention(backups, policy);
  const oldSafety = safety.slice(5); // keep the last 5 pre-restore snapshots
  for (const tag of [...old, ...oldSafety]) {
    console.log(`Deleting old backup ${tag}`);
    sh('gh', ['release', 'delete', tag, '--yes', '--cleanup-tag']);
  }
  console.log(`Kept ${backups.length - old.length} backups, removed ${old.length + oldSafety.length}.`);
}

async function restore(zip) {
  const r = verifyZip(zip, { keep: true });
  try {
    await reindexCheck(r.dir, r.manifest.notes);
    for (const dir of ['notes', 'attachments', '.zk/extracted', '.zk/trash']) {
      rmSync(join(root, dir), { recursive: true, force: true });
      if (existsSync(join(r.dir, dir))) cpSync(join(r.dir, dir), join(root, dir), { recursive: true });
    }
    for (const f of ['.zk/vault.json', 'README.md']) if (existsSync(join(r.dir, f))) cpSync(join(r.dir, f), join(root, f));
    console.log(`Restored ${r.manifest.notes} notes and ${r.manifest.attachments} attachments.`);
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
}

const [cmd, arg, arg2] = process.argv.slice(2);
const commands = {
  'purge-trash': () => purgeTrash(),
  archive: () => archive(arg || join(tmpdir(), 'zk-backups'), arg2),
  verify: () => verify(arg),
  prune: () => prune(),
  restore: () => restore(arg),
};
if (!commands[cmd]) {
  console.error('Usage: backup.mjs purge-trash | archive <dir> [prefix] | verify <zip> | prune | restore <zip>');
  process.exit(2);
}
Promise.resolve(commands[cmd]()).catch((e) => {
  console.error(`::error::${e.message}`);
  process.exit(1);
});
