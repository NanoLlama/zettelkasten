// Service worker: makes the app open offline. App files are served from the cache
// immediately and refreshed in the background (stale-while-revalidate), so updates
// arrive on the next launch. Notes themselves live in IndexedDB, not here.
const VERSION = 'dev'; // replaced with the commit id when deployed
const CACHE = `slipbox-${VERSION}`;
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'seed.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
  'vendor/markdown-it.min.js', 'vendor/purify.es.mjs', 'vendor/js-yaml.mjs', 'vendor/fflate.mjs',
  'js/app.js', 'js/zk.js',
  'js/core/bytes.js', 'js/core/diff.js', 'js/core/frontmatter.js', 'js/core/ids.js', 'js/core/links.js',
  'js/core/query.js', 'js/core/retention.js', 'js/core/search.js', 'js/core/sync.js', 'js/core/vault.js',
  'js/store/demo.js', 'js/store/github.js', 'js/store/idb.js',
  'js/services/backups.js', 'js/services/export.js', 'js/services/extract.js', 'js/services/notes.js', 'js/services/setup.js',
  'js/ui/appearance.js', 'js/ui/autocomplete.js', 'js/ui/capture.js', 'js/ui/components.js', 'js/ui/dom.js', 'js/ui/markdown.js',
  'js/ui/views/edit.js', 'js/ui/views/history.js', 'js/ui/views/home.js', 'js/ui/views/lists.js', 'js/ui/views/note.js',
  'js/ui/views/process.js', 'js/ui/views/review.js', 'js/ui/views/search.js', 'js/ui/views/settings.js', 'js/ui/views/welcome.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('slipbox-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/vault-template/')) return; // always fresh
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === 'navigate' ? 'index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
