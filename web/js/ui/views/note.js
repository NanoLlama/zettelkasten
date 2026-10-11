import { h, icon, btn, toast, dialog, confirmDialog, formatDate } from '../dom.js';
import { zk } from '../../zk.js';
import { noteHeader, noteBody, linkPanels, emptyState } from '../components.js';
import { convertNote, saveNote, trashNote, setStatus, TYPE_LABELS, TYPE_HELP, permanentChecklist } from '../../services/notes.js';

export function noteView(ctx) {
  const note = zk.vault.get(ctx.params.id);
  if (!note) {
    ctx.title = 'Not found';
    return h('div', { class: 'page' }, emptyState(zk.status.loaded ? 'This note does not exist (it may have been deleted).' : 'Loading…', h('a', { class: 'btn', href: '#/' }, 'Home')));
  }
  ctx.title = note.title;
  ctx.actions = h('a', { class: 'btn icon-only', href: `#/edit/${note.id}`, 'aria-label': 'Edit note' }, icon('edit'));
  rememberViewed(note.id);

  const nudge = note.type === 'fleeting' || note.type === 'literature'
    ? h('div', { class: 'card nudge' },
        h('p', null, note.type === 'fleeting'
          ? 'This is a fleeting note. If the idea is worth keeping, rewrite it in your own words as a permanent note, or turn it into a literature note about a source.'
          : 'Literature note. Which ideas here matter for your own thinking? Write each one as a permanent note and link it to related notes.'),
        h('div', { class: 'row gap wrap' },
          h('a', { class: 'btn primary', href: `#/edit/${note.id}?promote=permanent` }, icon('convert'), h('span', null, 'Make permanent')),
          note.type === 'literature' ? h('a', { class: 'btn', href: `#/new?type=permanent&from=${note.id}` }, icon('plus'), h('span', null, 'New permanent note from this')) : null))
    : null;

  const actions = h('div', { class: 'action-bar' },
    h('a', { class: 'btn', href: `#/edit/${note.id}` }, icon('edit'), h('span', null, 'Edit')),
    btn('Change type', () => changeType(note), { icon: 'convert' }),
    note.type === 'index' || zk.vault.children(note.id).length
      ? h('a', { class: 'btn', href: `#/review?src=${encodeURIComponent('index:' + note.id)}` }, icon('cards'), h('span', null, 'Review linked'))
      : null,
    btn(note.pinned ? 'Unpin' : 'Pin to home', async () => {
      await saveNote(note.id, { pinned: !note.pinned }, `${note.pinned ? 'Unpin' : 'Pin'}: ${note.title}`);
      toast(note.pinned ? 'Removed from home screen' : 'Pinned to home screen');
    }, { icon: 'pin' }),
    h('a', { class: 'btn', href: `#/history/${note.id}` }, icon('history'), h('span', null, 'History')),
    btn('More', () => moreMenu(note, ctx), { icon: 'more' }),
  );

  return h('div', { class: 'page note-page' },
    h('article', { class: 'note' },
      noteHeader(note),
      note.body.trim() ? noteBody(note) : h('p', { class: 'muted' }, 'This note is empty. ', h('a', { href: `#/edit/${note.id}` }, 'Write it now.')),
      h('p', { class: 'muted small dates' }, `Created ${formatDate(note.created)} · Edited ${formatDate(note.modified)} · ID ${note.id}`)),
    nudge,
    actions,
    linkPanels(note),
  );
}

function rememberViewed(id) {
  try {
    const list = JSON.parse(localStorage.getItem('zk:viewed') || '[]').filter((x) => x !== id);
    list.unshift(id);
    localStorage.setItem('zk:viewed', JSON.stringify(list.slice(0, 50)));
  } catch { /* ignore */ }
}

async function changeType(note) {
  const options = ['fleeting', 'literature', 'permanent', 'index', 'project', 'source'];
  const choice = await dialog({
    title: 'Change note type',
    content: h('div', { class: 'choice-list' },
      options.map((t) => h('button', {
        type: 'button',
        class: `choice ${t === note.type ? 'current' : ''}`,
        onclick: (e) => e.target.closest('.dialog').close(t),
      }, h('strong', null, TYPE_LABELS[t]), h('span', { class: 'muted small' }, TYPE_HELP[t])))),
    buttons: [{ label: 'Cancel', value: null }],
  });
  if (!choice || choice === note.type) return;
  if (choice === 'permanent' || choice === 'literature') {
    // Promotion goes through the editor so the user can add links, tags or a source.
    const checks = permanentChecklist(note);
    if (choice === 'literature' || checks.some((c) => !c.ok)) {
      location.hash = `#/edit/${note.id}?promote=${choice}`;
      return;
    }
  }
  await convertNote(note.id, choice);
  toast(`Now a ${TYPE_LABELS[choice].toLowerCase()} note`);
}

async function moreMenu(note, ctx) {
  const action = await dialog({
    title: note.title,
    content: h('div', { class: 'choice-list' },
      [
        ['copy', 'Copy link code', `[[${note.id}|${note.title}]]: paste it into another note`],
        note.status !== 'archived' ? ['archive', 'Archive', 'Hide from reviews and the inbox; still searchable'] : ['unarchive', 'Unarchive', 'Make it active again'],
        note.status !== 'inbox' ? ['inbox', 'Send back to inbox', 'Process it again later'] : null,
        ['delete', 'Delete', 'Moves to the trash; kept for 30 days'],
      ].filter(Boolean).map(([v, label, sub]) =>
        h('button', { type: 'button', class: `choice ${v === 'delete' ? 'danger' : ''}`, onclick: (e) => e.target.closest('.dialog').close(v) }, h('strong', null, label), h('span', { class: 'muted small' }, sub)))),
    buttons: [{ label: 'Close', value: null }],
  });
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(`[[${note.id}|${note.title}]]`);
      toast('Link copied');
    } catch {
      toast(`[[${note.id}|${note.title}]]`, { timeout: 8000 });
    }
  } else if (action === 'archive') {
    await setStatus(note.id, 'archived');
    toast('Archived');
  } else if (action === 'unarchive') {
    await setStatus(note.id, 'active');
  } else if (action === 'inbox') {
    await setStatus(note.id, 'inbox');
    toast('Back in the inbox');
  } else if (action === 'delete') {
    const back = zk.vault.backlinks(note.id).length;
    const ok = await confirmDialog(
      back ? `${back} note(s) link here. Their links will show as “not written yet”. Move to trash?` : 'Move this note to the trash? You can restore it from Settings → Trash for 30 days.',
      { ok: 'Delete', danger: true },
    );
    if (!ok) return;
    await trashNote(note.id);
    toast('Moved to trash', { action: { label: 'Undo', run: () => (location.hash = '#/trash') } });
    ctx.navigate('#/', { replace: true });
  }
}
