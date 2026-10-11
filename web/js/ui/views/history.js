// Per-note version history (every save is a commit in the vault repository).
import { h, icon, toast, confirmDialog, formatDate } from '../dom.js';
import { zk } from '../../zk.js';
import { emptyState } from '../components.js';
import { lineDiff, compactDiff } from '../../core/diff.js';
import { parseNote } from '../../core/frontmatter.js';
import { saveNote } from '../../services/notes.js';

export function historyView(ctx) {
  const note = zk.vault.get(ctx.params.id);
  ctx.title = 'History';
  ctx.static = true;
  if (!note) return h('div', { class: 'page' }, emptyState('Note not found.'));
  const list = h('div', { class: 'cards' }, h('p', { class: 'muted' }, 'Loading versions…'));
  const detail = h('div', { class: 'history-detail' });

  (async () => {
    try {
      const versions = await zk.remote.history(note.path);
      if (!versions.length) {
        list.replaceChildren(emptyState('No saved versions yet. Versions appear after your changes upload.'));
        return;
      }
      list.replaceChildren(...versions.map((v, i) =>
        h('button', { class: 'card version', onclick: () => show(v, i === 0) },
          h('strong', null, formatDate(v.date)),
          h('span', { class: 'muted small' }, i === 0 ? 'Latest saved version' : v.message.split('\n')[0]))));
    } catch (e) {
      list.replaceChildren(h('p', { class: 'warn' }, `Could not load history: ${e.message}`));
    }
  })();

  async function show(v, isLatest) {
    detail.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
    const old = await zk.remote.fileAt(note.path, v.sha);
    if (old == null) return detail.replaceChildren(h('p', null, 'This version could not be loaded.'));
    const current = zk.vault.get(note.id)?.text || '';
    const diff = compactDiff(lineDiff(old, current), 3);
    const changed = diff.some((d) => d.op === '+' || d.op === '-');
    detail.replaceChildren(
      h('h2', null, `Version from ${formatDate(v.date)}`),
      h('p', { class: 'muted small' }, changed ? 'Differences from the current note: lines in red are in this old version only; green lines are in the current version only.' : 'Identical to the current note.'),
      changed
        ? h('pre', { class: 'diff' }, diff.map((d) => h('div', { class: `diff-line op-${d.op === '+' ? 'add' : d.op === '-' ? 'del' : d.op === '…' ? 'skip' : 'same'}` }, `${d.op === '…' ? '⋯' : d.op} ${d.line}`)))
        : null,
      !isLatest || changed
        ? h('button', { class: 'btn primary', onclick: async () => {
            if (!(await confirmDialog('Replace the current note with this version? The current version stays in history.', { ok: 'Restore' }))) return;
            const { data, body } = parseNote(old);
            await saveNote(note.id, {
              title: String(data.title || note.title),
              type: data.type || note.type,
              status: data.status || note.status,
              tags: Array.isArray(data.tags) ? data.tags : [],
              body,
              source: data.source ? String(data.source) : '',
            }, `Restore version from ${v.date}: ${note.title}`);
            toast('Restored');
            ctx.navigate(`#/note/${note.id}`, { replace: true });
          } }, icon('undo'), h('span', null, 'Restore this version'))
        : null,
    );
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return h('div', { class: 'page' },
    h('h1', null, note.title),
    h('p', { class: 'muted' }, zk.isDemo ? 'Demo mode keeps the last 30 versions of each note on this device.' : 'Every saved change is kept in your vault on GitHub. Tap a version to compare or restore it.'),
    list,
    detail);
}
