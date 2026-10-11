// Review mode: read through a list of notes one at a time. Built for a phone held sideways:
// note on the left, its links on the right; swipe or tap the big arrows to move.
import { h, icon, toast } from '../dom.js';
import { zk } from '../../zk.js';
import { noteHeader, noteBody, linkPanels, emptyState, typeBadge } from '../components.js';
import { setStatus } from '../../services/notes.js';

const sessions = new Map(); // src -> { ids, index, stack }
let wakeLock = null;

function describe(src) {
  if (src === 'inbox') return 'Inbox';
  if (src === 'random') return 'Random notes';
  if (src === 'recent') return 'Recent';
  if (src === 'orphans') return 'Unlinked notes';
  if (src === 'connected') return 'Most connected';
  if (src.startsWith('tag:')) return '#' + src.slice(4);
  if (src.startsWith('index:')) return zk.vault.titleOf(src.slice(6)) || 'Index';
  if (src.startsWith('search:')) return `“${src.slice(7)}”`;
  return 'Review';
}

function buildList(src) {
  const v = zk.vault;
  let notes = [];
  if (src === 'inbox') notes = v.inbox();
  else if (src === 'recent') notes = v.recent(200);
  else if (src === 'orphans') notes = v.orphans();
  else if (src === 'connected') notes = v.mostConnected(100).map((x) => x.note);
  else if (src.startsWith('tag:')) notes = v.withTag(src.slice(4));
  else if (src.startsWith('index:')) notes = v.children(src.slice(6));
  else if (src.startsWith('search:')) notes = v.search(src.slice(7), { limit: 500 }).map((r) => r.note);
  else {
    notes = v.list().filter((n) => n.status !== 'archived' && n.type !== 'source');
    for (let i = notes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [notes[i], notes[j]] = [notes[j], notes[i]];
    }
  }
  return notes.map((n) => n.id);
}

async function setWake(on) {
  try {
    if (on && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
    return true;
  } catch {
    return false;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && localStorage.getItem('zk:awake') === 'on' && document.body.dataset.route === 'review') setWake(true);
});

export function reviewView(ctx) {
  ctx.layout = 'bare';
  ctx.static = true;
  ctx.title = 'Review';
  const src = ctx.query.src || 'random';
  if (!sessions.has(src) || ctx.query.fresh) sessions.set(src, { ids: buildList(src), index: 0, stack: [] });
  const s = sessions.get(src);
  if (ctx.query.i) s.index = Math.max(0, Math.min(s.ids.length - 1, Number(ctx.query.i) || 0));

  const root = h('div', { class: 'review', tabindex: '-1' });
  let sideOpen = localStorage.getItem('zk:reviewSide') !== 'closed';
  const awake = localStorage.getItem('zk:awake') === 'on';
  if (awake) setWake(true);

  const currentId = () => (s.stack.length ? s.stack[s.stack.length - 1] : s.ids[s.index]);

  const move = (delta) => {
    if (!s.ids.length) return;
    const next = s.index + delta;
    if (next < 0 || next >= s.ids.length) {
      toast(next < 0 ? 'This is the first note' : 'End of the list', { timeout: 1500 });
      return;
    }
    s.index = next;
    s.stack = [];
    draw(delta > 0 ? 'left' : 'right');
  };
  const visit = (id) => {
    if (id === currentId()) return;
    s.stack.push(id);
    draw('left');
  };
  const back = () => {
    if (s.stack.length) {
      s.stack.pop();
      draw('right');
    } else exit();
  };
  const exit = () => {
    setWake(false);
    ctx.goBack();
  };

  function draw(anim) {
    const id = currentId();
    const note = id && zk.vault.get(id);
    const visiting = s.stack.length > 0;
    const counter = s.ids.length ? `${s.index + 1} / ${s.ids.length}` : '0';

    const bar = h('header', { class: 'review-bar' },
      h('button', { class: 'btn icon-only', 'aria-label': visiting ? 'Back to previous note' : 'Exit review', onclick: back }, icon(visiting ? 'back' : 'close')),
      h('div', { class: 'review-title' },
        h('strong', null, describe(src)),
        h('span', { class: 'muted small' }, visiting ? `Following links (${s.stack.length}) · list at ${counter}` : counter)),
      h('div', { class: 'row' },
        note ? h('a', { class: 'btn icon-only', href: `#/edit/${note.id}`, 'aria-label': 'Edit note' }, icon('edit')) : null,
        h('button', {
          class: `btn icon-only ${localStorage.getItem('zk:awake') === 'on' ? 'on' : ''}`,
          'aria-label': 'Keep screen awake',
          'aria-pressed': localStorage.getItem('zk:awake') === 'on' ? 'true' : 'false',
          title: 'Keep screen awake',
          onclick: async () => {
            const on = localStorage.getItem('zk:awake') !== 'on';
            localStorage.setItem('zk:awake', on ? 'on' : 'off');
            const ok = await setWake(on);
            if (on && !ok) toast('This browser does not allow keeping the screen awake.');
            draw();
          },
        }, icon('awake')),
        h('button', {
          class: `btn icon-only ${sideOpen ? 'on' : ''}`,
          'aria-label': 'Show links panel',
          'aria-pressed': sideOpen ? 'true' : 'false',
          onclick: () => {
            sideOpen = !sideOpen;
            localStorage.setItem('zk:reviewSide', sideOpen ? 'open' : 'closed');
            draw();
          },
        }, icon('panel'))));

    let content;
    if (!note) {
      content = h('div', { class: 'review-body' }, emptyState(s.ids.length ? 'This note no longer exists.' : 'Nothing to review here.', h('button', { class: 'btn', onclick: exit }, 'Done')));
    } else {
      const quick = note.status === 'inbox'
        ? h('div', { class: 'row gap wrap review-quick' },
            h('a', { class: 'btn small primary', href: `#/edit/${note.id}?promote=permanent` }, 'Make permanent'),
            h('button', { class: 'btn small', onclick: async () => { await setStatus(note.id, 'active'); toast('Kept; left the inbox'); move(1); } }, 'Keep'),
            h('button', { class: 'btn small', onclick: async () => { await setStatus(note.id, 'archived'); toast('Archived'); move(1); } }, 'Archive'))
        : null;
      content = h('div', { class: `review-body ${sideOpen ? 'with-side' : ''}` },
        h('article', { class: `review-note ${anim ? 'slide-' + anim : ''}` },
          noteHeader(note),
          noteBody(note, { onNavigate: visit }),
          quick),
        sideOpen ? h('aside', { class: 'review-side', 'aria-label': 'Links' }, linkPanels(note, { onNavigate: visit, showRelated: true })) : null);
      attachSwipe(content);
    }

    const nav = h('div', { class: 'review-nav' },
      h('button', { class: 'btn nav-btn', 'aria-label': 'Previous note', disabled: s.index <= 0 && !visiting, onclick: () => move(-1) }, icon('back')),
      h('button', { class: 'btn nav-btn', 'aria-label': 'Next note', disabled: s.index >= s.ids.length - 1 && !visiting, onclick: () => move(1) }, icon('next')));

    root.replaceChildren(bar, content, nav);
    content.scrollTop = 0;
    history.replaceState(null, '', `#/review?src=${encodeURIComponent(src)}&i=${s.index}`);
  }

  function attachSwipe(el) {
    let x0 = null;
    let y0 = null;
    let t0 = 0;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return (x0 = null);
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
      t0 = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy) && Date.now() - t0 < 800) move(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, .overlay')) return;
    if (e.key === 'ArrowRight' || e.key === 'j') move(1);
    else if (e.key === 'ArrowLeft' || e.key === 'k') move(-1);
    else if (e.key === 'Escape' || e.key === 'Backspace') back();
  };
  document.addEventListener('keydown', onKey);
  ctx.onChange = () => draw();
  ctx.onLeave = () => {
    document.removeEventListener('keydown', onKey);
    setWake(false);
  };

  draw();
  setTimeout(() => root.focus(), 0);
  return root;
}

/** Choose what to review. */
export function reviewPicker(ctx) {
  ctx.title = 'Review';
  const v = zk.vault;
  const opt = (src, label, sub, ic) =>
    h('a', { class: 'tile', href: `#/review?src=${encodeURIComponent(src)}&fresh=1` }, icon(ic), h('strong', null, label), h('span', { class: 'muted small' }, sub));
  const indexes = v.ofType('index');
  const tags = v.tagCounts().slice(0, 24);
  return h('div', { class: 'page' },
    h('h1', null, 'Review'),
    h('p', { class: 'muted' }, 'Read through notes one at a time. Turn your phone sideways to see a note and its links side by side. Swipe left or right to move.'),
    h('div', { class: 'tiles' },
      opt('inbox', 'Inbox', `${v.inbox().length} to process`, 'inbox'),
      opt('random', 'Random', 'Shuffle the whole slip-box', 'shuffle'),
      opt('recent', 'Recent', 'Latest changes first', 'history'),
      opt('orphans', 'Unlinked', `${v.orphans().length} notes need links`, 'link'),
      opt('connected', 'Most connected', 'Your densest clusters', 'graph')),
    indexes.length
      ? h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'Follow an index note'),
          h('div', { class: 'cards' }, indexes.map((n) => h('a', { class: 'card note-card', href: `#/review?src=${encodeURIComponent('index:' + n.id)}&fresh=1` },
            h('div', { class: 'card-top' }, typeBadge(n.type)), h('div', { class: 'card-title' }, n.title), h('div', { class: 'muted small' }, `${v.children(n.id).length} linked notes`)))))
      : null,
    tags.length
      ? h('section', { class: 'section' }, h('h2', { class: 'section-title' }, 'By tag'),
          h('div', { class: 'tag-cloud' }, tags.map(([t, c]) => h('a', { class: 'chip tag', href: `#/review?src=${encodeURIComponent('tag:' + t)}&fresh=1` }, `#${t}`, h('span', { class: 'count' }, String(c))))))
      : null,
  );
}
