// Parsing of [[wikilinks]], #tags, URLs and attachment references inside a note body.
import { ID_RE } from './ids.js';

export const WIKILINK_RE = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;
const TAG_RE = /(^|[\s(,;])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu;
const URL_RE = /\bhttps?:\/\/[^\s<>()\[\]"']+[^\s<>()\[\]"'.,;:!?]/g;
export const ATTACHMENT_REF_RE = /attachment:(?:sha256-)?([a-f0-9]{64})/g;

/** Replaces code (fenced blocks and `inline`) with spaces so positions stay the same. */
export function maskCode(text) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank)
    .replace(/`[^`\n]+`/g, blank);
}

/** All wikilinks in a body: [{ target, label, index, length }] */
export function parseLinks(body) {
  const masked = maskCode(body);
  const out = [];
  for (const m of masked.matchAll(WIKILINK_RE)) {
    out.push({
      target: body.slice(m.index + 2, m.index + 2 + m[1].length).trim(),
      label: m[2] ? body.substr(m.index + 3 + m[1].length, m[2].length).trim() : null,
      index: m.index,
      length: m[0].length,
    });
  }
  return out;
}

export const isId = (s) => ID_RE.test(s);

/**
 * Converts [[Note Title]] links into [[ID|Note Title]] where a note with that title exists.
 * `lookup(title)` returns an ID or null. Unknown titles are left alone (they render as
 * "create this note" links).
 */
export function resolveTitleLinks(body, lookup) {
  const links = parseLinks(body).filter((l) => !isId(l.target));
  let out = body;
  for (const l of links.reverse()) {
    const id = lookup(l.target);
    if (!id) continue;
    const replacement = `[[${id}|${l.label || l.target}]]`;
    out = out.slice(0, l.index) + replacement + out.slice(l.index + l.length);
  }
  return out;
}

/** Inline #tags in the body (lower-cased, unique). Pure numbers like #1 are not tags. */
export function parseInlineTags(body) {
  const tags = new Set();
  for (const m of maskCode(body).matchAll(TAG_RE)) {
    const tag = m[2].replace(/[-/]+$/, '').toLowerCase();
    if (tag && !/^\d+$/.test(tag)) tags.add(tag);
  }
  return [...tags];
}

export function normalizeTag(tag) {
  return String(tag).trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
}

export function parseUrls(body) {
  return [...new Set(maskCode(body).match(URL_RE) || [])];
}

/** Attachment hashes referenced inline in the body (e.g. ![](attachment:<hash>)). */
export function parseAttachmentRefs(body) {
  return [...new Set([...body.matchAll(ATTACHMENT_REF_RE)].map((m) => m[1]))];
}

/** Replaces wikilinks with their visible text (label, or title via `titleOf`). */
export function linksToText(text, titleOf = (t) => t) {
  return text.replace(WIKILINK_RE, (_, target, label) => label || titleOf(target.trim()) || target);
}

/**
 * The sentence or line around a link, as plain text, for the backlinks panel.
 */
export function contextSnippet(body, index, titleOf, max = 160) {
  const start = Math.max(body.lastIndexOf('\n', index - 1) + 1, 0);
  let end = body.indexOf('\n', index);
  if (end === -1) end = body.length;
  let line = body.slice(start, end);
  let pos = index - start;
  if (line.length > max) {
    const from = Math.max(0, Math.min(pos - Math.floor(max / 2), line.length - max));
    line = (from > 0 ? '…' : '') + line.slice(from, from + max) + (from + max < line.length ? '…' : '');
  }
  return linksToText(line, titleOf)
    .replace(/^\s*(?:[-*+]|\d+\.|#+|>)\s+/, '')
    .replace(/(\*\*|__|\*|`|~~)/g, '')
    .trim();
}
