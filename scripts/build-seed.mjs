// Builds the sample vault from scripts/seed-notes.mjs and seed/assets/:
//   seed/vault/      a real vault folder (open it in Obsidian or any editor)
//   web/seed.json    the same files, packed for the app's demo mode and "add sample notes"
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringifyNote } from '../web/js/core/frontmatter.js';
import { noteFileName, idToDate, isoLocal } from '../web/js/core/ids.js';
import { notes } from './seed-notes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'seed', 'vault');
rmSync(out, { recursive: true, force: true });
for (const d of ['notes', 'attachments', '.zk/extracted']) mkdirSync(join(out, d), { recursive: true });

const files = {};
const add = (path, buf, text) => {
  writeFileSync(join(out, path), buf);
  files[path] = text != null ? { text } : { base64: buf.toString('base64') };
};

// Attachments, named by content hash.
const att = {};
for (const name of readdirSync(join(root, 'seed', 'assets'))) {
  const buf = readFileSync(join(root, 'seed', 'assets', name));
  const hash = createHash('sha256').update(buf).digest('hex');
  const ext = name.split('.').pop().toLowerCase();
  att[name] = { hash, size: buf.length, kind: ext === 'pdf' ? 'document' : 'image' };
  add(`attachments/${hash}.${ext}`, buf);
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      text += c.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n';
    }
    add(`.zk/extracted/${hash}.txt`, Buffer.from(text), text);
  }
}

// Notes (timestamps come from the IDs; written as UTC-4 so the output is stable).
process.env.TZ = 'America/New_York';
for (const n of notes(att)) {
  const created = isoLocal(idToDate(n.id));
  const data = {
    id: n.id,
    title: n.title,
    type: n.type,
    tags: n.tags || [],
    source: n.source,
    created,
    modified: created,
    status: n.status || 'active',
    pinned: n.pinned || undefined,
    ...(n.extra || {}),
    attachments: n.attachments?.map((a) => ({ hash: 'sha256-' + a.hash, name: a.name, kind: a.kind, size: a.size })),
  };
  const text = stringifyNote(data, n.body);
  add(`notes/${noteFileName(n.id, n.title)}`, Buffer.from(text), text);
}

writeFileSync(join(root, 'web', 'seed.json'), JSON.stringify({ format: 1, files }));
console.log(`Sample vault: ${Object.keys(files).filter((p) => p.startsWith('notes/')).length} notes, ${Object.keys(att).length} attachments.`);
