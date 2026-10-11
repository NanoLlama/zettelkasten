// Process Inbox: one note at a time, decide what it becomes.
import { h, icon, toast } from '../dom.js';
import { zk } from '../../zk.js';
import { noteHeader, noteBody, emptyState, attachmentsList } from '../components.js';
import { setStatus, trashNote, restoreFromTrash } from '../../services/notes.js';
import { openCapture } from '../capture.js';

const SKIP_KEY = 'zk:inboxSkipped';
const skipped = () => new Set(JSON.parse(sessionStorage.getItem(SKIP_KEY) || '[]'));

export function processView(ctx) {
  ctx.title = 'Process inbox';
  const all = zk.vault.inbox();
  const skip = skipped();
  let queue = all.filter((n) => !skip.has(n.id));
  if (!queue.length && all.length) {
    sessionStorage.removeItem(SKIP_KEY);
    queue = all;
  }
  if (!queue.length) {
    return h('div', { class: 'page' },
      h('h1', null, 'Inbox'),
      emptyState('Your inbox is empty. Capture thoughts with the + button; they land here to be processed later.',
        h('button', { class: 'btn primary', onclick: () => openCapture() }, icon('plus'), h('span', null, 'Quick capture'))));
  }
  const note = queue[0];
  const position = all.indexOf(note) + 1;

  const act = async (fn, msg) => {
    await fn();
    if (msg) toast(msg);
  };
  const actions = [
    ['Make permanent', 'convert', 'primary', () => ctx.navigate(`#/edit/${note.id}?promote=permanent&next=process`),
      'Rewrite it as one idea in your own words, with tags and links.'],
    ['Make literature', 'source', '', () => ctx.navigate(`#/edit/${note.id}?promote=literature&next=process`),
      'A summary of something you read, watched or heard.'],
    ['Keep as fleeting', 'check', '', () => act(() => setStatus(note.id, 'active'), 'Kept as a fleeting note'),
      'Not ready yet, but worth keeping. Leaves the inbox.'],
    ['Archive', 'archive', '', () => act(() => setStatus(note.id, 'archived'), 'Archived'),
      'Out of the way; still searchable.'],
    ['Delete', 'trash', 'danger', async () => {
      const path = zk.vault.get(note.id).path.replace(/^notes\//, '.zk/trash/');
      await trashNote(note.id);
      toast('Deleted', { action: { label: 'Undo', run: () => restoreFromTrash(path) } });
    }, 'Not worth keeping. Recoverable for 30 days.'],
  ];

  return h('div', { class: 'page process-page' },
    h('div', { class: 'row between' },
      h('span', { class: 'muted' }, `${position} of ${all.length} in inbox`),
      h('div', { class: 'row gap' },
        h('a', { class: 'btn small', href: `#/edit/${note.id}?next=process` }, icon('edit'), h('span', null, 'Edit')),
        h('button', { class: 'btn small', onclick: () => {
          const s = skipped();
          s.add(note.id);
          sessionStorage.setItem(SKIP_KEY, JSON.stringify([...s]));
          ctx.rerender();
        } }, icon('next'), h('span', null, 'Skip')))),
    h('article', { class: 'card process-card' },
      noteHeader(note),
      note.body.trim() ? noteBody(note) : h('p', { class: 'muted' }, '(empty)'),
      attachmentsList(note)),
    h('div', { class: 'process-actions' },
      actions.map(([label, ic, cls, run, sub]) =>
        h('button', { class: `btn big ${cls}`, onclick: run }, icon(ic), h('span', { class: 'stack' }, h('strong', null, label), h('span', { class: 'small' }, sub))))),
  );
}
