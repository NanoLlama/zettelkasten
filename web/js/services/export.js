// One-click export of the whole vault as a .zip of plain Markdown.
// "Obsidian" mode names files by title and writes links as [[Title]].
import { zipSync } from '../../vendor/fflate.mjs';
import { zk } from '../zk.js';
import { toBytes } from '../core/bytes.js';
import { stringifyNote } from '../core/frontmatter.js';
import { WIKILINK_RE } from '../core/links.js';
import { attachmentPath } from './notes.js';

function safeFileName(title, used) {
  let base = String(title).replace(/[\\/:*?"<>|#^[\]]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Untitled';
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

async function attachmentBytes(hash, path) {
  const blob = await zk.local.getBlob(hash);
  if (blob) return blob.bytes;
  const local = await zk.local.get(path);
  if (local?.bytes) return local.bytes;
  const info = zk.vault.attachmentFiles.get(hash);
  const sha = zk.sync.remoteFiles.get(path)?.sha || info?.sha;
  if (!sha) return null;
  return zk.remote.getFile(path, sha);
}

export async function exportVault({ obsidian = false, onProgress = () => {} } = {}) {
  const files = {};
  const notes = zk.vault.list();
  const names = new Map();
  const used = new Set();
  if (obsidian) for (const n of notes) names.set(n.id, safeFileName(n.title, used));

  for (const n of notes) {
    if (!obsidian) {
      files[n.path] = toBytes(n.text);
      continue;
    }
    const body = n.body
      .replace(WIKILINK_RE, (m, target, label) => {
        const id = zk.vault.idForTarget(target.trim());
        if (!id) return m;
        const name = names.get(id);
        return label && label.trim() !== name ? `[[${name}|${label.trim()}]]` : `[[${name}]]`;
      })
      .replace(/\]\(attachment:(?:sha256-)?([a-f0-9]{64})\)/g, (m, hash) => {
        const info = zk.vault.attachmentFiles.get(hash);
        return info ? `](../${encodeURI(info.path)})` : m;
      });
    files[`notes/${names.get(n.id)}.md`] = toBytes(stringifyNote({ ...n.data, id: n.id }, body));
  }

  const hashes = new Set();
  for (const n of notes) for (const a of n.attachments) hashes.add(a.hash);
  for (const n of notes) for (const h of n.inlineAttachments) hashes.add(h);
  let i = 0;
  for (const hash of hashes) {
    i++;
    const info = zk.vault.attachmentFiles.get(hash);
    const name = notes.flatMap((n) => n.attachments).find((a) => a.hash === hash)?.name || '';
    const path = info?.path || attachmentPath(hash, name);
    onProgress(`Attachment ${i} of ${hashes.size}`);
    try {
      const bytes = await attachmentBytes(hash, path);
      if (bytes) files[path] = bytes;
    } catch (e) {
      console.warn('Skipped attachment', path, e);
    }
  }
  for (const [hash, text] of zk.vault.extracted) if (!obsidian) files[`.zk/extracted/${hash}.txt`] = toBytes(text);
  files['README.txt'] = toBytes(
    `Slip-box export, ${new Date().toISOString()}\n${notes.length} notes, ${hashes.size} attachments.\n` +
      (obsidian ? 'Obsidian format: open this folder as a vault in Obsidian.\n' : 'Same format as the vault repository: see docs/FORMAT.md.\n'),
  );
  onProgress('Compressing…');
  const zipped = zipSync(files, { level: 6 });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return new File([zipped], `slipbox-export-${obsidian ? 'obsidian-' : ''}${stamp}.zip`, { type: 'application/zip' });
}

export function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
