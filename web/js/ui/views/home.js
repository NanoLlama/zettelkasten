import { h, icon } from '../dom.js';
import { zk } from '../../zk.js';
import { noteCard, section, emptyState, typeBadge } from '../components.js';
import { openCapture } from '../capture.js';

export function homeView(ctx) {
  ctx.title = '';
  const v = zk.vault;
  const inbox = v.inbox();
  const pinned = v.pinned();
  const stats = v.stats();

  if (!stats.notes) {
    return h('div', { class: 'page' },
      h('h1', null, 'Your slip-box is empty'),
      h('p', null, 'Start by capturing a thought. Tap the + button anytime, or create a permanent note directly.'),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: () => openCapture() }, icon('plus'), h('span', null, 'Quick capture')),
        h('a', { class: 'btn', href: '#/new?type=permanent' }, h('span', null, 'New permanent note'))));
  }

  const random = () => {
    const n = v.random();
    if (n) ctx.navigate(`#/note/${n.id}`);
  };

  return h('div', { class: 'page home' },
    inbox.length
      ? h('div', { class: 'card inbox-card' },
          h('div', null,
            h('div', { class: 'big-number' }, String(inbox.length)),
            h('div', null, inbox.length === 1 ? 'note waiting in your inbox' : 'notes waiting in your inbox')),
          h('div', { class: 'row gap wrap' },
            h('a', { class: 'btn primary', href: '#/process' }, icon('inbox'), h('span', null, 'Process inbox')),
            h('a', { class: 'btn', href: '#/review?src=inbox' }, icon('cards'), h('span', null, 'Review'))))
      : h('div', { class: 'card inbox-card done' }, icon('check'), h('span', null, 'Inbox is empty. Nice work.')),

    pinned.length
      ? section('Entry points',
          h('div', { class: 'entry-points' },
            pinned.map((n) => h('a', { class: 'entry', href: `#/note/${n.id}` }, typeBadge(n.type), h('span', null, n.title), h('span', { class: 'muted small' }, `${v.outgoing(n.id).filter((l) => l.to).length} notes`)))))
      : null,

    section('Explore',
      h('div', { class: 'tiles' },
        tile('#/list/recent', 'history', 'Recent', `${stats.notes} notes`),
        tile('#/tags', 'tag', 'Tags', `${stats.tags} tags`),
        tile('#/list/connected', 'graph', 'Most connected', 'Where ideas cluster'),
        tile('#/list/orphans', 'link', 'Unlinked notes', `${v.orphans().length} need links`),
        h('button', { class: 'tile', onclick: random }, icon('shuffle'), h('strong', null, 'Random note'), h('span', { class: 'muted small' }, 'Rediscover something')),
        tile('#/list/type-source', 'source', 'Sources', `${stats.byType.source || 0} sources`),
        tile('#/list/type-index', 'pin', 'Index notes', `${stats.byType.index || 0} entry points`),
        tile('#/list/type-permanent', 'file', 'Permanent notes', `${stats.byType.permanent || 0} ideas`))),

    section('Recently changed',
      h('div', { class: 'cards' }, v.recent(8).map((n) => noteCard(n))),
      h('a', { class: 'btn link', href: '#/list/recent' }, 'See all')),
  );
}

function tile(href, ic, title, sub) {
  return h('a', { class: 'tile', href }, icon(ic), h('strong', null, title), h('span', { class: 'muted small' }, sub));
}
