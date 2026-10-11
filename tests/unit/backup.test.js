// Runs the vault backup tool for real: archive -> verify -> damage the vault -> restore.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(import.meta.dirname, '..', '..');
const run = (cwd, ...args) => execFileSync('node', ['.zk/tools/backup.mjs', ...args], { cwd, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } });

describe('vault backup tool', () => {
  let vault;
  let out;
  beforeAll(() => {
    vault = mkdtempSync(join(tmpdir(), 'zk-vault-'));
    out = mkdtempSync(join(tmpdir(), 'zk-out-'));
    cpSync(join(root, 'seed', 'vault'), vault, { recursive: true });
    // Install the tools the same way the app's setup does.
    mkdirSync(join(vault, '.zk/tools/js/core'), { recursive: true });
    mkdirSync(join(vault, '.zk/tools/vendor'), { recursive: true });
    cpSync(join(root, 'web/vault-template/zk/tools/backup.mjs'), join(vault, '.zk/tools/backup.mjs'));
    for (const f of readdirSync(join(root, 'web/js/core'))) cpSync(join(root, 'web/js/core', f), join(vault, '.zk/tools/js/core', f));
    cpSync(join(root, 'web/vendor/js-yaml.mjs'), join(vault, '.zk/tools/vendor/js-yaml.mjs'));
    // An old and a fresh note in the trash
    mkdirSync(join(vault, '.zk/trash'), { recursive: true });
    writeFileSync(join(vault, '.zk/trash/20200101-0000-old.md'), '---\nid: "202001010000"\ntitle: Old\ndeleted: 2020-01-02T00:00:00+00:00\n---\nold\n');
    writeFileSync(join(vault, '.zk/trash/20260101-0000-new.md'), `---\nid: "202601010000"\ntitle: New\ndeleted: ${new Date().toISOString()}\n---\nnew\n`);
    const git = (...a) => execFileSync('git', a, { cwd: vault });
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  });
  afterAll(() => {
    rmSync(vault, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  });

  it('empties trash older than 30 days only', () => {
    run(vault, 'purge-trash');
    expect(existsSync(join(vault, '.zk/trash/20200101-0000-old.md'))).toBe(false);
    expect(existsSync(join(vault, '.zk/trash/20260101-0000-new.md'))).toBe(true);
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'purge'], { cwd: vault });
  });

  it('creates a verified archive with a manifest, then a test restore passes', () => {
    const log = run(vault, 'archive', out);
    expect(log).toMatch(/Index rebuilt: 32 notes/);
    const name = /name=(\S+)/.exec(log)[1];
    expect(name).toMatch(/^zk-backup-\d{8}-\d{4}$/);
    const manifest = JSON.parse(readFileSync(join(out, `${name}.manifest.json`), 'utf8'));
    expect(manifest.notes).toBe(32);
    expect(manifest.attachments).toBe(3);
    expect(manifest.files.every((f) => /^[a-f0-9]{64}$/.test(f.sha256))).toBe(true);
    expect(run(vault, 'verify', join(out, `${name}.zip`))).toMatch(/Test restore passed/);
  });

  it('detects a corrupted archive', () => {
    const zip = readdirSync(out).find((f) => f.endsWith('.zip'));
    const bad = join(out, 'bad.zip');
    // Re-zip with one note altered but the old manifest.
    const tmp = mkdtempSync(join(tmpdir(), 'zk-bad-'));
    execFileSync('unzip', ['-q', join(out, zip), '-d', tmp]);
    const note = readdirSync(join(tmp, 'notes'))[0];
    writeFileSync(join(tmp, 'notes', note), 'tampered');
    execFileSync('zip', ['-qr', bad, '.'], { cwd: tmp });
    expect(() => run(vault, 'verify', bad)).toThrow(/Checksum mismatch/);
    rmSync(tmp, { recursive: true, force: true });
  });

  it('restores notes and attachments exactly', () => {
    const zip = join(out, readdirSync(out).find((f) => f.startsWith('zk-backup') && f.endsWith('.zip')));
    const before = readdirSync(join(vault, 'notes')).map((f) => [f, readFileSync(join(vault, 'notes', f), 'utf8')]);
    const attBefore = readdirSync(join(vault, 'attachments')).sort();
    rmSync(join(vault, 'notes', before[0][0]));
    writeFileSync(join(vault, 'notes', before[1][0]), 'damaged');
    rmSync(join(vault, 'attachments'), { recursive: true });
    writeFileSync(join(vault, 'notes', '20990101-0000-extra.md'), 'not in backup');
    run(vault, 'restore', zip);
    const after = readdirSync(join(vault, 'notes')).map((f) => [f, readFileSync(join(vault, 'notes', f), 'utf8')]);
    expect(after).toEqual(before);
    expect(readdirSync(join(vault, 'attachments')).sort()).toEqual(attBefore);
  });
});
