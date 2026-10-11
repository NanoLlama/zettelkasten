// Backup status and controls. The backups themselves run as GitHub Actions in the vault
// repository (see vault-template/.github/workflows), so they happen even when no device is on.
import { zk } from '../zk.js';
import { h, icon } from '../ui/dom.js';
import { setBanner } from '../app.js';

export const BACKUP_WORKFLOW = 'zk-backup.yml';
export const RESTORE_WORKFLOW = 'zk-restore.yml';
export const TEST_RESTORE_WORKFLOW = 'zk-test-restore.yml';

/** { installed, lastSuccess, lastRun, failing, stale, backups, error } */
export async function backupStatus() {
  if (zk.isDemo) return { demo: true };
  const remote = zk.remote;
  const runs = await remote.workflowRuns(BACKUP_WORKFLOW, 10);
  if (runs === null) return { installed: false };
  const done = runs.filter((r) => r.status === 'completed');
  const lastSuccess = done.find((r) => r.conclusion === 'success') || null;
  const lastRun = runs[0] || null;
  const failing = !!(done[0] && done[0].conclusion !== 'success');
  const lastTime = lastSuccess ? new Date(lastSuccess.updated) : null;
  const stale = !lastTime || Date.now() - lastTime.getTime() > 48 * 3600 * 1000;
  let backups = [];
  try {
    backups = await remote.listBackups();
  } catch { /* ignore */ }
  const testRuns = await remote.workflowRuns(TEST_RESTORE_WORKFLOW, 1).catch(() => null);
  return { installed: true, runs, lastSuccess, lastRun, failing, stale, backups, lastTest: testRuns?.[0] || null };
}

export async function runBackupNow() {
  await zk.remote.dispatch(BACKUP_WORKFLOW, { reason: 'manual' });
}

export async function restoreBackup(name) {
  await zk.remote.dispatch(RESTORE_WORKFLOW, { backup: name });
}

/** Shows a warning banner on every screen if the last backup failed or is older than 48 h. */
export async function checkBackupHealth() {
  if (zk.isDemo || !navigator.onLine) return;
  try {
    const s = await backupStatus();
    if (!s.installed) {
      setBanner(h('a', { class: 'banner warn', href: '#/settings' }, icon('download'), h('span', null, 'Automatic backups are not set up yet. Tap to set them up.')));
    } else if (s.failing || s.stale) {
      setBanner(h('a', { class: 'banner error', href: '#/settings' }, icon('download'),
        h('span', null, s.failing ? 'The last backup failed. Tap for details.' : 'No successful backup in the last 48 hours. Tap for details.')));
    } else setBanner(null);
    zk.emit('change', {});
  } catch {
    /* offline or no permission; the Settings screen shows details */
  }
}
