// Copies the third-party libraries the web app needs from node_modules into web/vendor/.
// The app has no build step: these files are served as-is, so the app works offline
// and never loads code from a third-party CDN.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'web', 'vendor');
mkdirSync(out, { recursive: true });

const files = {
  'markdown-it/dist/markdown-it.min.js': 'markdown-it.min.js',
  'dompurify/dist/purify.es.mjs': 'purify.es.mjs',
  'js-yaml/dist/js-yaml.mjs': 'js-yaml.mjs',
  'fflate/esm/browser.js': 'fflate.mjs',
  'pdfjs-dist/legacy/build/pdf.min.mjs': 'pdf.min.mjs',
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs': 'pdf.worker.min.mjs',
  'mammoth/mammoth.browser.min.js': 'mammoth.browser.min.js',
};
for (const [from, to] of Object.entries(files)) {
  copyFileSync(join(root, 'node_modules', from), join(out, to));
  console.log(`vendor/${to}`);
}
