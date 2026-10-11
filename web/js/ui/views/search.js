import { h, icon } from '../dom.js';
import { zk } from '../../zk.js';
import { noteCard, emptyState } from '../components.js';

const FILTERS = [
  ['type:permanent', 'Permanent'],
  ['type:literature', 'Literature'],
  ['type:fleeting', 'Fleeting'],
  ['type:index', 'Index'],
  ['type:source', 'Sources'],
  ['status:inbox', 'Inbox'],
  ['has:attachment', 'Has attachment'],
  ['is:orphan', 'Unlinked'],
  ['-status:archived', 'Hide archived'],
];

export function searchView(ctx) {
  ctx.title = 'Search';
  ctx.static = true;
  const input = h('input', {
    type: 'search',
    class: 'input search-input',
    placeholder: 'Search words, "phrases", tag:…, type:…',
    'aria-label': 'Search notes',
    value: ctx.query.q || '',
    autocomplete: 'off',
    autocapitalize: 'none',
    enterkeyhint: 'search',
  });
  const chips = h('div', { class: 'filter-chips', role: 'group', 'aria-label': 'Filters' });
  const info = h('div', { class: 'muted small', role: 'status' });
  const results = h('div', { class: 'cards' });
  const reviewLink = h('a', { class: 'btn small', hidden: true }, icon('cards'), h('span', null, 'Review these'));

  const hasToken = (tok) => input.value.split(/\s+/).includes(tok);
  const drawChips = () => {
    chips.replaceChildren(...FILTERS.map(([tok, label]) =>
      h('button', {
        type: 'button',
        class: `chip filter ${hasToken(tok) ? 'on' : ''}`,
        'aria-pressed': hasToken(tok) ? 'true' : 'false',
        onclick: () => {
          const parts = input.value.split(/\s+/).filter(Boolean);
          input.value = (hasToken(tok) ? parts.filter((p) => p !== tok) : [...parts, tok]).join(' ') + ' ';
          run();
          input.focus();
        },
      }, label)));
  };

  let timer = null;
  const run = () => {
    const text = input.value.trim();
    history.replaceState(null, '', text ? `#/search?q=${encodeURIComponent(text)}` : '#/search');
    drawChips();
    if (!text) {
      info.textContent = 'Recently viewed';
      let ids = [];
      try { ids = JSON.parse(localStorage.getItem('zk:viewed') || '[]'); } catch { /* ignore */ }
      const notes = ids.map((id) => zk.vault.get(id)).filter(Boolean).slice(0, 15);
      results.replaceChildren(...(notes.length ? notes : zk.vault.recent(15)).map((n) => noteCard(n, { compact: true })));
      reviewLink.hidden = true;
      return;
    }
    const t0 = performance.now();
    const res = zk.vault.search(text, { limit: 100 });
    const ms = Math.round(performance.now() - t0);
    info.textContent = `${res.total} result${res.total === 1 ? '' : 's'}${res.total > res.length ? ` (showing ${res.length})` : ''} · ${ms} ms`;
    results.replaceChildren(
      ...(res.length
        ? res.map((r) => noteCard(r.note, { snippet: r.snippet || null, extra: r.inAttachment ? h('div', { class: 'chip small' }, icon('clip', 'tiny'), 'Found in an attachment') : null }))
        : [emptyState('No notes match. Try fewer words or remove a filter.')]),
    );
    reviewLink.hidden = !res.length;
    reviewLink.href = `#/review?src=${encodeURIComponent('search:' + text)}`;
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(run, 80);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
      run();
    }
  });
  ctx.onChange = run;

  const help = h('details', { class: 'help' },
    h('summary', null, 'Search tips'),
    h('table', { class: 'syntax' },
      h('tbody', null,
        [
          ['memory', 'notes containing a word (or a word starting with it)'],
          ['"spaced repetition"', 'an exact phrase'],
          ['-cramming', 'leave out notes with this word'],
          ['tag:learning', 'notes with a tag'],
          ['type:permanent', 'fleeting, literature, permanent, index, project, source'],
          ['status:inbox', 'inbox, active or archived'],
          ['has:attachment', 'also has:image, has:link, has:url, has:source'],
          ['linked-to:202610111208', 'notes that link to a note (ID or title)'],
          ['created:>2026-01-01', 'also created:2026-03, modified:<2026-02-01'],
          ['is:orphan', 'notes with no links in or out (also is:pinned)'],
        ].map(([code, text]) => h('tr', null, h('td', null, h('code', null, code)), h('td', null, text))))));

  setTimeout(() => {
    run();
    if (!ctx.query.q) input.focus();
  }, 0);

  return h('div', { class: 'page search-page' },
    h('div', { class: 'search-bar' }, icon('search'), input),
    chips,
    h('div', { class: 'row between' }, info, reviewLink),
    results,
    help);
}
