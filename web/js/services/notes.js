// Note operations: create, save, convert, trash, stubs, attachments.
import { zk, hashOf } from '../zk.js';
import { stringifyNote, parseNote } from '../core/frontmatter.js';
import { nextFreeId, noteFileName, isoLocal } from '../core/ids.js';
import { resolveTitleLinks, normalizeTag } from '../core/links.js';
import { toBytes, toText, sha256Hex } from '../core/bytes.js';
import { NOTES_DIR, TRASH_DIR, ATTACH_DIR, EXTRACT_DIR } from '../core/vault.js';

export const TYPE_LABELS = {
  fleeting: 'Fleeting',
  literature: 'Literature',
  permanent: 'Permanent',
  index: 'Index',
  project: 'Project',
  source: 'Source',
};

export const TYPE_HELP = {
  fleeting: 'A quick, rough capture. Decide later whether it deserves more.',
  literature: 'A short summary, in your own words, of something you read, watched or heard. Tied to a source.',
  permanent: 'One idea, in your own words, with tags and links to other notes. The heart of the slip-box.',
  index: 'An entry point that links to a group of notes in a meaningful order.',
  project: 'Gathers notes for a piece of writing.',
  source: 'A book, article, podcast, video or conversation that literature notes refer to.',
};

export const SOURCE_KINDS = ['book', 'article', 'podcast', 'video', 'conversation', 'website', 'other'];

function takenIds() {
  return new Set([...zk.vault.notes.keys(), ...[...zk.vault.trash.values()].map((n) => n.id)]);
}

const lookupTitle = (t) => zk.vault.byTitle(t)?.id || null;

/** Creates a note and returns its ID. */
export async function createNote({ title = '', type = 'fleeting', status, tags = [], body = '', source = null, extra = {}, attachments = [] } = {}) {
  const now = new Date();
  const id = nextFreeId(now, takenIds());
  const finalTitle = title.trim() || deriveTitle(body) || 'Untitled';
  const data = {
    id,
    title: finalTitle,
    type,
    tags: [...new Set(tags.map(normalizeTag).filter(Boolean))],
    source: source || undefined,
    created: isoLocal(now),
    modified: isoLocal(now),
    status: status || (type === 'fleeting' ? 'inbox' : 'active'),
    ...extra,
    attachments: attachments.length ? attachments.map(attachmentEntry) : undefined,
  };
  const path = NOTES_DIR + noteFileName(id, finalTitle);
  const text = stringifyNote(data, resolveTitleLinks(body, lookupTitle));
  await zk.writeFile(path, toBytes(text), `Add ${type} note: ${finalTitle}`);
  return id;
}

/** First line of a body, trimmed, as a title. */
export function deriveTitle(body) {
  const line = String(body || '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l && !/^!\[/.test(l));
  if (!line) return '';
  const urlOnly = /^https?:\/\/\S+$/.exec(line);
  if (urlOnly) {
    try {
      const u = new URL(line);
      return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '').slice(0, 80);
    } catch {
      /* fall through */
    }
  }
  return line.length > 80 ? line.slice(0, 80).replace(/\s+\S*$/, '') + '…' : line;
}

/**
 * Saves changes to a note. `changes` may include title, type, status, tags, body, source,
 * pinned, attachments and any extra front matter fields (extra: {...}).
 */
export async function saveNote(id, changes, message) {
  const note = zk.vault.get(id);
  if (!note) throw new Error('Note not found');
  const data = { ...note.data, id: note.id };
  if (changes.title !== undefined) data.title = changes.title.trim() || 'Untitled';
  if (changes.type !== undefined) data.type = changes.type;
  if (changes.status !== undefined) data.status = changes.status;
  if (changes.tags !== undefined) data.tags = [...new Set(changes.tags.map(normalizeTag).filter(Boolean))];
  if (changes.source !== undefined) data.source = changes.source || undefined;
  if (changes.pinned !== undefined) data.pinned = changes.pinned || undefined;
  if (changes.attachments !== undefined) data.attachments = changes.attachments.length ? changes.attachments.map(attachmentEntry) : undefined;
  if (changes.extra) for (const [k, v] of Object.entries(changes.extra)) data[k] = v === '' ? undefined : v;
  if (!data.created) data.created = isoLocal();
  data.modified = isoLocal();
  const body = changes.body !== undefined ? resolveTitleLinks(changes.body, lookupTitle) : note.body;
  const text = stringifyNote(data, body);
  if (text === note.text) return id;
  await zk.writeFile(note.path, toBytes(text), message || `Edit: ${data.title}`);
  return id;
}

/** What a note still needs before it is a good permanent note. */
export function permanentChecklist({ title, tags, body }) {
  const links = /\[\[[^\]]+\]\]/.test(body || '');
  const inlineTags = /(^|\s)#[\p{L}\p{N}_]/u.test(body || '');
  return [
    { ok: !!String(title || '').trim(), label: 'A title that states the idea' },
    { ok: (tags || []).length > 0 || inlineTags, label: 'At least one tag (keyword)' },
    { ok: links, label: 'At least one link to another note' },
  ];
}

export async function convertNote(id, type) {
  const note = zk.vault.get(id);
  const status = note.status === 'inbox' && type !== 'fleeting' ? 'active' : note.status;
  return saveNote(id, { type, status }, `Convert to ${type}: ${note.title}`);
}

export async function setStatus(id, status) {
  return saveNote(id, { status }, `Mark ${status}: ${zk.vault.get(id).title}`);
}

/** Moves a note to the trash folder (kept 30 days, then removed by the nightly job). */
export async function trashNote(id) {
  const note = zk.vault.get(id);
  if (!note) return;
  const data = { ...note.data, id: note.id, deleted: isoLocal() };
  const trashPath = TRASH_DIR + note.path.slice(NOTES_DIR.length);
  await zk.writeFile(trashPath, toBytes(stringifyNote(data, note.body)), `Move to trash: ${note.title}`);
  await zk.removeFile(note.path, `Delete: ${note.title}`);
}

export async function restoreFromTrash(path) {
  const note = zk.vault.trash.get(path);
  if (!note) return null;
  const data = { ...note.data };
  delete data.deleted;
  let notePath = NOTES_DIR + path.slice(TRASH_DIR.length);
  if (zk.vault.get(note.id)) {
    data.id = nextFreeId(new Date(), takenIds());
    notePath = NOTES_DIR + noteFileName(data.id, note.title);
  }
  await zk.writeFile(notePath, toBytes(stringifyNote(data, note.body)), `Restore from trash: ${note.title}`);
  await zk.removeFile(path, `Remove from trash: ${note.title}`);
  return data.id || note.id;
}

/**
 * Creates a stub for a [[Title]] link that points nowhere yet, then rewrites the
 * link in `fromId` to the new ID.
 */
export async function createStub(title, fromId) {
  const existing = zk.vault.byTitle(title);
  const id = existing ? existing.id : await createNote({ title, type: 'permanent', status: 'inbox', body: '' });
  if (fromId) {
    const from = zk.vault.get(fromId);
    if (from) await saveNote(fromId, { body: from.body }, `Link to new note: ${title}`); // resolves [[Title]] -> [[ID|Title]]
  }
  return id;
}

/** Builds the conflict copy saved when a note was changed in two places at once. */
export async function conflictCopy(path, remoteBytes) {
  if (!path.startsWith(NOTES_DIR)) return null;
  const { data, body } = parseNote(toText(remoteBytes));
  const now = new Date();
  const id = nextFreeId(now, takenIds());
  const title = `${data.title || 'Note'} (conflict copy ${now.toLocaleDateString()})`;
  const copy = { ...data, id, title, status: 'inbox', conflict_of: data.id ? String(data.id) : undefined, created: isoLocal(now), modified: isoLocal(now) };
  return { path: NOTES_DIR + noteFileName(id, title), bytes: toBytes(stringifyNote(copy, body)) };
}

// ---- attachments -----------------------------------------------------------------

const BLOCKED_EXT = new Set(['exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'pif', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'ps1', 'sh', 'app', 'dmg', 'pkg', 'apk', 'jar', 'dll', 'lnk', 'reg', 'hta', 'cpl', 'msc', 'html', 'htm', 'svg']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif']);
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'csv', 'epub', 'pages', 'numbers', 'key']);

export const MAX_ATTACHMENT_MB = 25;

export function extOf(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

export function kindOf(name) {
  const ext = extOf(name);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (DOC_EXT.has(ext)) return 'document';
  return 'other';
}

function attachmentEntry(a) {
  return { hash: 'sha256-' + a.hash.replace(/^sha256-/, ''), name: a.name, kind: a.kind, size: a.size };
}

export function attachmentPath(hash, name) {
  const ext = extOf(name);
  return `${ATTACH_DIR}${hash}${ext ? '.' + ext : ''}`;
}

/** Shrinks big photos (longest side 2560 px, JPEG) to save space. Other files pass through. */
async function maybeShrink(file) {
  const ext = extOf(file.name);
  if (!['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(ext) || file.size < 1.5 * 1024 * 1024) return file;
  if (localStorage.getItem('zk:shrinkPhotos') === 'off') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && ext !== 'heic' && ext !== 'heif' && file.size < 4 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/**
 * Stores a file in the vault (named by its content hash, so the same file is kept once)
 * and extracts its text for search. Returns { hash, name, kind, size }.
 */
export async function storeAttachment(file, onProgress = () => {}) {
  const ext = extOf(file.name);
  if (BLOCKED_EXT.has(ext)) throw new Error(`.${ext} files are blocked for safety.`);
  const maxMb = Number(localStorage.getItem('zk:maxAttachmentMb')) || MAX_ATTACHMENT_MB;
  onProgress('Preparing…');
  const f = await maybeShrink(file);
  if (f.size > maxMb * 1024 * 1024) throw new Error(`${file.name} is larger than ${maxMb} MB.`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const path = attachmentPath(hash, f.name);
  const entry = { hash, name: f.name, kind: kindOf(f.name), size: bytes.length };
  await zk.local.putBlob(hash, bytes, f.type || mimeOf(f.name));
  if (!zk.vault.attachmentFiles.has(hash)) {
    zk.vault.setAttachmentFile(hash, { path, size: bytes.length });
    await zk.sync.write(path, bytes, `Add attachment ${f.name}`);
  }
  onProgress('Reading text for search…');
  try {
    const { extractText } = await import('./extract.js');
    const text = await extractText(f.name, bytes);
    if (text && text.trim()) await zk.writeFile(`${EXTRACT_DIR}${hash}.txt`, toBytes(text), `Index text of ${f.name}`);
  } catch (e) {
    console.warn('Text extraction failed', e);
  }
  zk.flush();
  return entry;
}

export function mimeOf(name) {
  const ext = extOf(name);
  return (
    {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', heic: 'image/heic',
      pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }[ext] || 'application/octet-stream'
  );
}

const urlCache = new Map();

/** A blob: URL for an attachment, downloading it once and caching it on the device. */
export async function attachmentUrl(hash, name) {
  if (urlCache.has(hash)) return urlCache.get(hash);
  const p = (async () => {
    let rec = await zk.local.getBlob(hash);
    if (!rec) {
      const info = zk.vault.attachmentFiles.get(hash);
      const path = info?.path || attachmentPath(hash, name || '');
      const local = await zk.local.get(path);
      let bytes = local?.bytes;
      if (!bytes) {
        const remote = zk.sync.remoteFiles.get(path) || info;
        if (!remote?.sha) throw new Error('Attachment not found (it may still be uploading from another device).');
        bytes = await zk.remote.getFile(path, remote.sha);
      }
      rec = { bytes, type: mimeOf(name || path) };
      await zk.local.putBlob(hash, bytes, rec.type);
    }
    return URL.createObjectURL(new Blob([rec.bytes], { type: rec.type || mimeOf(name || '') }));
  })();
  urlCache.set(hash, p);
  p.catch(() => urlCache.delete(hash));
  return p;
}

export async function deleteAttachmentFile(hash) {
  const info = zk.vault.attachmentFiles.get(hash);
  if (!info) return;
  await zk.removeFile(info.path, `Remove unused attachment ${info.path}`);
  zk.vault.setAttachmentFile(hash, null);
  await zk.local.deleteBlob(hash);
  if (zk.vault.extracted.has(hash)) await zk.removeFile(`${EXTRACT_DIR}${hash}.txt`, 'Remove extracted text');
}

export { hashOf };
