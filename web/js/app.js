// App entry: boot, routing, layout (top bar, bottom navigation, quick-capture button).
import { zk, loadConfig } from './zk.js';
import { h, icon, toast, clear } from './ui/dom.js';
import { openCapture } from './ui/capture.js';
import { applyAppearance } from './ui/appearance.js';

import { homeView } from './ui/views/home.js';
import { noteView } from './ui/views/note.js';
import { editView } from './ui/views/edit.js';
import { searchView } from './ui/views/search.js';
import { listView, tagsView, trashView } from './ui/views/lists.js';
import { processView } from './ui/views/process.js';
import { reviewView, reviewPicker } from './ui/views/review.js';
import { historyView } from './ui/views/history.js';
import { settingsView } from './ui/views/settings.js';
import { welcomeView } from './ui/views/welcome.js';

const routes = [
  ['/', homeView],
  ['/note/:id', noteView],
  ['/edit/:id', editView],
  ['/new', editView],
  ['/search', searchView],
  ['/list/:name', listView],
  ['/tags', tagsView],
  ['/trash', trashView],
  ['/process', processView],
  ['/review', reviewView],
  ['/review-pick', reviewPicker],
  ['/history/:id', historyView],
  ['/settings', settingsView],
  ['/welcome', welcomeView],
];

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  for (const [pattern, view] of routes) {
    const names = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '/?$');
    const m = re.exec(path);
    if (m) {
      const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      return { path, pattern, view, params, query };
    }
  }
  return { path, pattern: '/', view: homeView, params: {}, query };
}

export function navigate(hash, { replace = false } = {}) {
  if (replace) {
    history.replaceState(null, '', hash);
    render();
  } else location.hash = hash;
}

export function goBack() {
  if (navDepth > 0) history.back();
  else navigate('#/', { replace: true });
}

// ---- navigation guard (unsaved edits) ----------------------------------------------

let guard = null;
export function setLeaveGuard(fn) {
  guard = fn;
}
let lastHash = location.hash;
let navDepth = 0;
let suppress = false;

window.addEventListener('hashchange', () => {
  if (suppress) {
    suppress = false;
    return;
  }
  if (guard && guard() && !confirm('You have unsaved changes. Leave without saving?')) {
    suppress = true;
    history.pushState(null, '', lastHash);
    return;
  }
  guard = null;
  navDepth++;
  lastHash = location.hash;
  render();
});
window.addEventListener('popstate', () => {
  navDepth = Math.max(0, navDepth - 2);
});
window.addEventListener('beforeunload', (e) => {
  if (guard && guard()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---- layout ------------------------------------------------------------------------

const app = document.getElementById('app');
let current = null; // { route, ctx, node }

const NAV = [
  ['#/', 'home', 'Home', (r) => r.pattern === '/'],
  ['#/search', 'search', 'Search', (r) => r.pattern === '/search'],
  ['#/process', 'inbox', 'Inbox', (r) => r.pattern === '/process'],
  ['#/review-pick', 'cards', 'Review', (r) => r.pattern === '/review-pick'],
  ['#/settings', 'gear', 'Settings', (r) => r.pattern === '/settings'],
];

function syncIndicator() {
  const s = zk.status;
  let cls = 'ok';
  let label = 'All changes saved to your vault';
  if (zk.isDemo) {
    cls = 'demo';
    label = 'Demo mode: notes are stored on this device only';
  } else if (!navigator.onLine) {
    cls = 'offline';
    label = s.pending ? `Offline. ${s.pending} change(s) will upload when you reconnect` : 'Offline. Notes saved on this device are available';
  } else if (s.error) {
    cls = 'error';
    label = `Sync problem: ${s.error}`;
  } else if (s.pending || s.phase === 'pull') {
    cls = 'busy';
    label = s.pending ? `Uploading ${s.pending} change(s)…` : 'Checking for changes…';
  }
  return h('a', { class: `sync-dot ${cls}`, href: '#/settings', title: label, 'aria-label': label }, h('span', { class: 'dot' }), h('span', { class: 'sync-text' }, cls === 'ok' ? '' : cls === 'busy' ? (s.pending ? `${s.pending}` : '') : cls === 'offline' ? 'Offline' : cls === 'error' ? 'Sync error' : 'Demo'));
}

function topBar(route, ctx) {
  const isHome = route.pattern === '/';
  return h(
    'header',
    { class: 'topbar' },
    isHome
      ? h('a', { class: 'brand', href: '#/' }, h('img', { src: 'icons/icon.svg', alt: '', width: 28, height: 28 }), h('span', null, 'Slip-box'))
      : h('button', { class: 'btn icon-only', onclick: goBack, 'aria-label': 'Back' }, icon('back')),
    h('div', { class: 'topbar-title' }, isHome ? '' : ctx.title || ''),
    h('div', { class: 'topbar-actions' },
      ctx.actions || null,
      syncIndicator(),
      route.pattern !== '/search' ? h('a', { class: 'btn icon-only', href: '#/search', 'aria-label': 'Search' }, icon('search')) : null),
  );
}

function bottomNav(route) {
  const inbox = zk.vault.inbox().length;
  return h(
    'nav',
    { class: 'bottomnav', 'aria-label': 'Main' },
    NAV.map(([href, ic, label, active]) =>
      h('a', { href, class: active(route) ? 'active' : '', 'aria-current': active(route) ? 'page' : null },
        icon(ic),
        h('span', null, label),
        ic === 'inbox' && inbox ? h('span', { class: 'badge-count', 'aria-label': `${inbox} in inbox` }, String(inbox)) : null)),
  );
}

function fab() {
  return h('button', { class: 'fab', 'aria-label': 'Quick capture', title: 'Quick capture', onclick: () => openCapture() }, icon('plus'));
}

let banner = null;
export function setBanner(node) {
  banner = node;
}

function render({ keepScroll = false } = {}) {
  if (!zk.config && !location.hash.startsWith('#/welcome')) {
    history.replaceState(null, '', '#/welcome');
  }
  const route = parseHash();
  if (current && !keepScroll) current.ctx.onLeave?.();
  const ctx = {
    params: route.params,
    query: route.query,
    navigate,
    goBack,
    title: '',
    actions: null,
    layout: 'app',
    rerender: () => render({ keepScroll: true }),
  };
  let node;
  try {
    node = route.view(ctx);
  } catch (e) {
    console.error(e);
    node = h('div', { class: 'page' }, h('h1', null, 'Something went wrong'), h('pre', { class: 'error-box' }, String(e.stack || e)));
  }
  const scroll = keepScroll ? window.scrollY : 0;
  clear(app);
  document.body.dataset.layout = ctx.layout;
  document.body.dataset.route = route.pattern.split('/')[1] || 'home';
  if (ctx.layout === 'bare') {
    app.append(node);
  } else {
    app.append(
      topBar(route, ctx),
      h('div', { class: 'shell' }, bottomNav(route), h('main', { id: 'main', class: 'main', tabindex: '-1' }, banner, node)),
      ctx.noFab ? null : fab(),
    );
  }
  document.title = ctx.title ? `${ctx.title} · Slip-box` : 'Slip-box';
  window.scrollTo(0, scroll);
  current = { route, ctx, node };
}

// Re-render on data changes, unless the view handles them itself (e.g. the editor).
let pending = null;
function scheduleRerender() {
  if (!current || current.ctx.static) {
    if (current?.ctx.onChange) current.ctx.onChange();
    return;
  }
  clearTimeout(pending);
  pending = setTimeout(() => render({ keepScroll: true }), 60);
}

function refreshChrome() {
  if (!current || current.ctx.layout === 'bare') return;
  const dot = app.querySelector('.sync-dot');
  if (dot) dot.replaceWith(syncIndicator());
  const nav = app.querySelector('.bottomnav');
  if (nav) nav.replaceWith(bottomNav(current.route));
}

// ---- boot --------------------------------------------------------------------------

async function boot() {
  applyAppearance();
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !/[?&]nosw/.test(location.search)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker not registered', e));
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});

  zk.on('change', scheduleRerender);
  zk.on('status', refreshChrome);
  zk.on('error', (e) => toast(e.detail?.message || String(e.detail), { kind: 'error', timeout: 6000 }));
  zk.on('conflict', () => toast('A note was changed in two places. Both versions were kept: look for “conflict copy” in your inbox.', { kind: 'warn', timeout: 8000 }));

  const cfg = loadConfig();
  if (cfg) {
    try {
      await zk.start(cfg);
    } catch (e) {
      console.error(e);
      toast(`Could not open your vault: ${e.message}`, { kind: 'error', timeout: 8000 });
    }
  }
  render();
  if (cfg) {
    zk.refresh({ quiet: true });
    window.addEventListener('online', () => zk.refresh({ quiet: true }));
    window.addEventListener('offline', refreshChrome);
    let lastPull = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastPull > 30_000) {
        lastPull = Date.now();
        zk.refresh({ quiet: true });
      }
    });
    setInterval(() => document.visibilityState === 'visible' && zk.refresh({ quiet: true }), 5 * 60_000);
    import('./services/backups.js').then((m) => m.checkBackupHealth()).catch(() => {});
  }
}

export function restart() {
  location.hash = '#/';
  location.reload();
}

boot();
