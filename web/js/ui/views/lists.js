import { h, icon, toast, confirmDialog, timeAgo } from '../dom.js';
import { zk } from '../../zk.js';
import { noteCard, emptyState, typeBadge } from '../components.js';
import { restoreFromTrash, TYPE_LABELS } from '../../services/notes.js';

const LISTS = {
  recent: ['Recently changed', 'All notes, newest first.', () => zk.vault.recent(500), 'recent'],
  all: ['All notes', '', () => zk.vault.recent(100000), 'recent'],
  orphans: ['Unlinked notes', 'These notes have no links in or out. Link each one to something related so you can find it again.', () => zk.vault.orphans(), 'orphans'],
  connected: ['Most connected', 'Notes with the most links in and out: where your thinking is clustering.', null, 'connected'],
};

export function listView(ctx) {
  const name = ctx.params.name;
  let title;
  let help;
  let notes;
  let reviewSrc;
  let degrees = null;
  if (name.startsWith('type-')) {
    const type = name.slice(5);
    title = `${TYPE_LABELS[type] || type} notes`;
    help = '';
    notes = zk.vault.ofType(type);
    reviewSrc = `search:type:${type}`;
  } else if (name === 'connected') {
    [title, help] = LISTS.connected;
    const list = zk.vault.mostConnected(50);
    degrees = new Map(list.map((x) => [x.note.id, x.degree]));
    notes = list.map((x) => x.note);
    reviewSrc = 'connected';
  } else if (LISTS[name]) {
    const [t, hp, fn, src] = LISTS[name];
    title = t;
    help = hp;
    notes = fn();
    reviewSrc = src;
  } else {
    title = 'Notes';
    notes = [];
  }
  ctx.title = title;
  return h('div', { class: 'page' },
    h('div', { class: 'row between' }, h('h1', null, title), notes.length ? h('a', { class: 'btn small', href: `#/review?src=${encodeURIComponent(reviewSrc)}` }, icon('cards'), h('span', null, 'Review')) : null),
    help ? h('p', { class: 'muted' }, help) : null,
    notes.length
      ? h('div', { class: 'cards' }, notes.slice(0, 300).map((n) => noteCard(n, { extra: degrees ? h('div', { class: 'small muted' }, `${degrees.get(n.id)} connections`) : null })))
      : emptyState(name === 'orphans' ? 'Every note is linked. 🎉' : 'Nothing here yet.'),
    notes.length > 300 ? h('p', { class: 'muted' }, `Showing 300 of ${notes.length}. Use search to narrow down.`) : null,
  );
}

export function tagsView(ctx) {
  ctx.title = 'Tags';
  const tags = zk.vault.tagCounts();
  const max = Math.max(1, ...tags.map(([, c]) => c));
  let sort = sessionStorage.getItem('zk:tagSort') || 'count';
  const list = sort === 'name' ? [...tags].sort((a, b) => a[0].localeCompare(b[0])) : tags;
  return h('div', { class: 'page' },
    h('div', { class: 'row between' },
      h('h1', null, `Tags (${tags.length})`),
      h('button', { class: 'btn small', onclick: () => { sessionStorage.setItem('zk:tagSort', sort === 'name' ? 'count' : 'name'); ctx.rerender(); } }, sort === 'name' ? 'Sort by count' : 'Sort A–Z')),
    h('p', { class: 'muted' }, 'Bigger tags have more notes. Tap a tag to see its notes.'),
    tags.length
      ? h('div', { class: 'tag-cloud' }, list.map(([t, c]) =>
          h('a', { class: 'chip tag cloud', href: `#/search?q=${encodeURIComponent('tag:' + t)}`, style: { fontSize: `${0.85 + (0.7 * c) / max}rem` } }, `#${t}`, h('span', { class: 'count' }, String(c)))))
      : emptyState('No tags yet. Add keywords to your notes as you write them.'),
  );
}

export function trashView(ctx) {
  ctx.title = 'Trash';
  const items = [...zk.vault.trash.entries()].sort((a, b) => String(b[1].data.deleted).localeCompare(String(a[1].data.deleted)));
  return h('div', { class: 'page' },
    h('h1', null, 'Trash'),
    h('p', { class: 'muted' }, 'Deleted notes stay here for 30 days, then the nightly backup job removes them (they remain inside older backups).'),
    items.length
      ? h('div', { class: 'cards' }, items.map(([path, n]) =>
          h('div', { class: 'card note-card' },
            h('div', { class: 'card-top' }, typeBadge(n.type), h('span', { class: 'muted small right' }, `Deleted ${timeAgo(n.data.deleted)}`)),
            h('div', { class: 'card-title' }, n.title),
            h('div', { class: 'row gap' }, h('button', { class: 'btn small', onclick: async () => {
              const id = await restoreFromTrash(path);
              toast('Restored');
              ctx.navigate(`#/note/${id}`);
            } }, icon('undo'), h('span', null, 'Restore'))))))
      : emptyState('The trash is empty.'),
  );
}
