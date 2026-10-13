import { h, icon, btn, toast, confirmDialog, dialog, formatDate, timeAgo } from '../dom.js';
import { zk, saveConfig, dbName } from '../../zk.js';
import { getAppearance, setAppearance } from '../appearance.js';
import { formatBytes } from '../../core/bytes.js';
import { deleteDb } from '../../store/idb.js';
import { section } from '../components.js';
import { deleteAttachmentFile } from '../../services/notes.js';

export const GUIDE_URL = 'https://github.com/NanoLlama/zettelkasten/blob/main/docs/SETUP-GUIDE.md';

export function settingsView(ctx) {
  ctx.title = 'Settings';
  ctx.static = true;
  const s = zk.status;
  const page = h('div', { class: 'page settings' });

  // ---- vault & sync ----------------------------------------------------------------
  const syncInfo = h('div', { class: 'kv' });
  const drawSync = () => {
    const rows = [
      ['Vault', zk.isDemo ? 'Demo (this device only)' : `${zk.config.owner}/${zk.config.repo}`],
      ['Notes', String(zk.vault.notes.size)],
      ['Waiting to upload', String(zk.status.pending || 0)],
      ['Last synced', zk.status.lastSync ? timeAgo(zk.status.lastSync) : 'not yet'],
      ['Connection', navigator.onLine ? 'Online' : 'Offline'],
    ];
    syncInfo.replaceChildren(...rows.flatMap(([k, v]) => [h('span', { class: 'k' }, k), h('span', { class: 'v' }, v)]));
    if (zk.status.error) syncInfo.append(h('span', { class: 'k' }, 'Problem'), h('span', { class: 'v warn' }, zk.status.error));
  };
  drawSync();
  ctx.onChange = drawSync;
  const off = zk.on('status', drawSync);
  ctx.onLeave = () => off();

  page.append(section('Your vault',
    zk.isDemo ? h('p', { class: 'card nudge' }, 'You are trying the app in demo mode. Notes stay in this browser only and are not backed up. Connect a GitHub vault to keep your notes safe and use them on all your devices.') : null,
    syncInfo,
    h('div', { class: 'row gap wrap' },
      btn('Sync now', async () => { await zk.refresh(); drawSync(); toast(zk.status.error ? 'Sync had a problem' : 'Up to date'); }, { icon: 'sync' }),
      !zk.isDemo ? btn('Copy connection code', copyConnectionCode, { icon: 'clip' }) : null,
      !zk.isDemo ? h('a', { class: 'btn', href: zk.remote.webUrl, target: '_blank', rel: 'noopener' }, icon('link'), h('span', null, 'Open on GitHub')) : null,
      zk.isDemo ? h('a', { class: 'btn primary', href: '#/welcome?connect=1' }, h('span', null, 'Connect GitHub vault')) : null,
      btn(zk.isDemo ? 'Leave demo' : 'Sign out on this device', signOut, { icon: 'close' }))));

  // ---- backups -----------------------------------------------------------------------
  const backupBox = h('div', null, h('p', { class: 'muted' }, zk.isDemo ? '' : 'Checking backups…'));
  page.append(section('Backups', backupBox));
  if (zk.isDemo) {
    backupBox.replaceChildren(h('p', { class: 'muted' }, 'Backups run automatically once you connect a GitHub vault: every change is versioned, a verified archive is made every night, and a test restore runs every week. In demo mode you can still Export below.'));
  } else drawBackups(backupBox, ctx);

  // ---- appearance -------------------------------------------------------------------
  const ap = getAppearance();
  const themeGroup = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Theme' },
    [['system', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': ap.theme === v ? 'true' : 'false', class: ap.theme === v ? 'on' : '', onclick: () => { setAppearance({ theme: v }); ctx.rerender(); } }, l)));
  const size = h('input', { type: 'range', min: '0.85', max: '1.5', step: '0.05', value: String(ap.fontScale), 'aria-label': 'Text size' });
  const sizeLabel = h('span', { class: 'muted small' }, `${Math.round(ap.fontScale * 100)}%`);
  size.addEventListener('input', () => { setAppearance({ fontScale: Number(size.value) }); sizeLabel.textContent = `${Math.round(size.value * 100)}%`; });
  page.append(section('Appearance',
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Theme'), themeGroup),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Text size'), h('div', { class: 'row gap' }, h('span', { class: 'small' }, 'A'), size, h('span', { class: 'big' }, 'A'), sizeLabel))));

  // ---- attachments --------------------------------------------------------------------
  const shrink = h('input', { type: 'checkbox', checked: localStorage.getItem('zk:shrinkPhotos') !== 'off' });
  shrink.addEventListener('change', () => localStorage.setItem('zk:shrinkPhotos', shrink.checked ? 'on' : 'off'));
  const maxMb = h('input', { type: 'number', class: 'input narrow', min: '1', max: '90', value: localStorage.getItem('zk:maxAttachmentMb') || '25', inputmode: 'numeric' });
  maxMb.addEventListener('change', () => localStorage.setItem('zk:maxAttachmentMb', String(Math.min(90, Math.max(1, Number(maxMb.value) || 25)))));
  page.append(section('Attachments',
    h('label', { class: 'check' }, shrink, h('span', null, 'Shrink large photos before saving (recommended; saves space)')),
    h('label', { class: 'field' }, h('span', { class: 'label' }, 'Largest file allowed (MB)'), maxMb),
    btn('Find unused attachments', cleanupAttachments, { icon: 'clip' })));

  // ---- tools --------------------------------------------------------------------------
  const exportStatus = h('span', { class: 'muted small', role: 'status' });
  page.append(section('Tools',
    h('div', { class: 'stack-buttons' },
      btn('Export all notes (.zip)', () => runExport(false, exportStatus), { icon: 'download' }),
      btn('Export for Obsidian (.zip)', () => runExport(true, exportStatus), { icon: 'download' }),
      exportStatus,
      h('a', { class: 'btn', href: '#/trash' }, icon('trash'), h('span', null, `Trash (${zk.vault.trash.size})`)),
      btn('Reindex all', reindex, { icon: 'sync' })),
    h('p', { class: 'muted small' }, 'Reindex all throws away this device’s copy and downloads every note again. Use it if search or links ever look wrong.')));

  page.append(section('Help',
    h('p', null, h('a', { href: GUIDE_URL, target: '_blank', rel: 'noopener' }, 'Setup and user guide'), ' · ', h('a', { href: '#/search' }, 'Search tips')),
    h('p', { class: 'muted small' }, 'Slip-box keeps notes as plain Markdown files, so they will always open in other apps.')));

  return page;
}

async function drawBackups(box) {
  const { backupStatus, runBackupNow, restoreBackup } = await import('../../services/backups.js');
  const { installVault } = await import('../../services/setup.js');
  let st;
  try {
    st = await backupStatus();
  } catch (e) {
    box.replaceChildren(h('p', { class: 'warn' }, `Could not check backups: ${e.message}`));
    return;
  }
  if (!st.installed) {
    const progress = h('p', { class: 'muted small', role: 'status' });
    box.replaceChildren(
      h('p', { class: 'card nudge' }, 'Automatic backups are not set up in this vault yet. Setting up adds three small automation files to your vault repository: a nightly verified backup, a restore tool and a weekly test restore.'),
      btn('Set up automatic backups', async (e) => {
        e.currentTarget.disabled = true;
        try {
          await installVault({ onProgress: (m) => (progress.textContent = m) });
          toast('Backups are set up. The first one runs tonight; you can also run one now.');
          drawBackups(box);
        } catch (err) {
          progress.textContent = err.message;
          e.currentTarget.disabled = false;
        }
      }, { icon: 'download', cls: 'primary' }),
      progress);
    return;
  }
  const latest = st.backups[0];
  const running = st.lastRun && st.lastRun.status !== 'completed';
  const nextRun = nextLocal(2, 0);
  box.replaceChildren(
    st.failing ? h('p', { class: 'banner error' }, 'The last backup failed. ', h('a', { href: st.runs.find((r) => r.status === 'completed')?.url, target: '_blank', rel: 'noopener' }, 'See what went wrong')) : null,
    !st.failing && st.stale ? h('p', { class: 'banner warn' }, 'No successful backup in the last 48 hours.') : null,
    h('div', { class: 'kv' },
      h('span', { class: 'k' }, 'Last successful backup'), h('span', { class: 'v' }, st.lastSuccess ? `${formatDate(st.lastSuccess.updated)} (${timeAgo(st.lastSuccess.updated)})` : 'none yet'),
      h('span', { class: 'k' }, 'Latest archive size'), h('span', { class: 'v' }, latest ? formatBytes(latest.size) : '—'),
      h('span', { class: 'k' }, 'Next automatic backup'), h('span', { class: 'v' }, formatDate(nextRun)),
      h('span', { class: 'k' }, 'Weekly test restore'), h('span', { class: 'v' }, st.lastTest ? `${st.lastTest.conclusion === 'success' ? 'passed' : st.lastTest.conclusion || st.lastTest.status} ${timeAgo(st.lastTest.updated)}` : 'not run yet'),
      h('span', { class: 'k' }, 'Kept'), h('span', { class: 'v' }, '7 daily, 4 weekly, 12 monthly')),
    h('div', { class: 'row gap wrap' },
      btn(running ? 'Backup running…' : 'Back up now', async (e) => {
        e.currentTarget.disabled = true;
        try {
          await runBackupNow();
          toast('Backup started. It takes about a minute.');
          setTimeout(() => drawBackups(box), 15000);
        } catch (err) {
          toast(err.message, { kind: 'error' });
        }
      }, { icon: 'download', cls: 'primary', disabled: running }),
      btn('Refresh', () => drawBackups(box), { icon: 'sync' }),
      btn('Update backup tools', async () => {
        try { await installVault(); toast('Backup tools updated'); } catch (err) { toast(err.message, { kind: 'error' }); }
      }, { icon: 'sync' })),
    h('details', { class: 'panel' },
      h('summary', null, `Archives (${st.backups.length})`),
      st.backups.length
        ? h('ul', { class: 'link-list' }, st.backups.map((b) =>
            h('li', { class: 'backup-row' },
              h('div', null, h('strong', null, formatDate(b.date)), h('div', { class: 'muted small' }, `${b.name} · ${formatBytes(b.size)}`)),
              h('div', { class: 'row gap' },
                h('a', { class: 'btn small', href: b.url, target: '_blank', rel: 'noopener' }, icon('download'), h('span', null, 'Download')),
                btn('Restore', async () => {
                  const ok = await confirmDialog(`Replace all notes and attachments with the backup from ${formatDate(b.date)}? A safety backup of the current state is taken first, so this can be undone.`, { ok: 'Restore', danger: true, title: 'Restore backup' });
                  if (!ok) return;
                  try {
                    await restoreBackup(b.name);
                    toast('Restore started. It takes 1–2 minutes; then tap Sync now.', { timeout: 8000 });
                  } catch (err) {
                    toast(err.message, { kind: 'error' });
                  }
                }, { icon: 'undo', cls: 'small' })))))
        : h('p', { class: 'muted small' }, 'No archives yet.')),
    h('p', { class: 'muted small' }, 'Archives are stored privately in your vault repository (under Releases). For a copy off GitHub, use Export below and save the file to iCloud Drive, or add an S3/Backblaze bucket as described in the guide.'),
  );
}

function nextLocal(hour, minute) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function runExport(obsidian, status) {
  try {
    const { exportVault, download } = await import('../../services/export.js');
    const file = await exportVault({ obsidian, onProgress: (m) => (status.textContent = m) });
    status.textContent = `${file.name} (${formatBytes(file.size)})`;
    download(file);
  } catch (e) {
    status.textContent = '';
    toast(`Export failed: ${e.message}`, { kind: 'error' });
  }
}

async function cleanupAttachments() {
  const unused = zk.vault.orphanAttachments();
  if (!unused.length) return toast('Every attachment is used by a note.');
  const total = unused.reduce((s, a) => s + (a.size || 0), 0);
  const ok = await dialog({
    title: 'Unused attachments',
    content: h('div', null,
      h('p', null, `${unused.length} file(s), ${formatBytes(total)}, are not used by any note (or note in the trash).`),
      h('ul', { class: 'small' }, unused.slice(0, 20).map((a) => h('li', null, a.path))),
      h('p', { class: 'muted small' }, 'Deleted files stay inside earlier backups.')),
    buttons: [{ label: 'Cancel', value: false }, { label: 'Delete them', value: true, cls: 'danger' }],
  });
  if (!ok) return;
  for (const a of unused) await deleteAttachmentFile(a.hash);
  toast(`Removed ${unused.length} file(s)`);
}

async function reindex() {
  if (!(await confirmDialog('Download all notes again and rebuild search and links?', { ok: 'Reindex' }))) return;
  if (zk.status.pending) {
    await zk.flush();
    if (await zk.sync.pending()) return toast('Some changes have not uploaded yet. Connect to the internet first so nothing is lost.', { kind: 'warn' });
  }
  for (const rec of await zk.local.getAll()) if (!rec.path.startsWith('attachments/')) await zk.local.delete(rec.path);
  location.reload();
}

/** A code holding the repository and token, to connect another device or the home-screen app. */
async function copyConnectionCode() {
  const { owner, repo, branch, token } = zk.config;
  const code = 'zk1:' + btoa(JSON.stringify({ owner, repo, branch, token }));
  const ok = await confirmDialog('This copies a code that contains your access token. Paste it only into Slip-box on your own devices, and don’t share it.', { ok: 'Copy code' });
  if (!ok) return;
  try {
    await navigator.clipboard.writeText(code);
    toast('Copied. In the other app, tap “Connect my vault” and paste it into either box.', { timeout: 6000 });
  } catch {
    await dialog({ title: 'Connection code', content: h('textarea', { class: 'input', rows: 4, readonly: true, value: code, onfocus: (e) => e.target.select() }) });
  }
}

async function signOut() {
  const pending = zk.status.pending;
  const ok = await confirmDialog(
    pending
      ? `${pending} change(s) have not been uploaded yet and would be lost. Sign out anyway?`
      : zk.isDemo ? 'Leave the demo? The demo notes stay in this browser in case you come back.' : 'Sign out on this device? Your notes stay safe in your vault; this removes the copy and the access token from this device.',
    { ok: zk.isDemo ? 'Leave demo' : 'Sign out', danger: !!pending },
  );
  if (!ok) return;
  if (!zk.isDemo) {
    zk.local.db.close();
    await deleteDb(dbName(zk.config)).catch(() => {});
  }
  saveConfig(null);
  location.hash = '#/welcome';
  location.reload();
}
