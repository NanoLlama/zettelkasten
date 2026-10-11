// Reads and writes the YAML front matter at the top of a note file.
// The schema is CORE_SCHEMA so dates stay plain strings and round-trip unchanged.
import { load, dump, CORE_SCHEMA } from '../../vendor/js-yaml.mjs';

const FM_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// Keys are written in this order; anything else follows alphabetically.
const KEY_ORDER = [
  'id', 'title', 'type', 'tags', 'source', 'created', 'modified', 'status', 'pinned',
  'source_kind', 'author', 'url', 'year', 'publisher', 'accessed', 'attachments',
];

/** Splits a note file into { data, body }. Malformed YAML never loses text. */
export function parseNote(text) {
  const m = FM_RE.exec(text);
  if (!m) return { data: {}, body: text };
  let data;
  try {
    data = load(m[1], { schema: CORE_SCHEMA }) || {};
    if (typeof data !== 'object' || Array.isArray(data)) throw new Error('front matter is not a map');
  } catch (e) {
    return { data: {}, body: text, error: String(e.message || e) };
  }
  return { data, body: text.slice(m[0].length) };
}

function dumpKey(key, value) {
  const opts = { schema: CORE_SCHEMA, lineWidth: -1, quotingType: '"', noRefs: true };
  if (key === 'tags') opts.flowLevel = 1; // tags: [a, b]
  return dump({ [key]: value }, opts);
}

/** Builds a note file from front matter data and a Markdown body. */
export function stringifyNote(data, body) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined && data[k] !== null && data[k] !== '');
  keys.sort((a, b) => {
    const ia = KEY_ORDER.indexOf(a);
    const ib = KEY_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return a.localeCompare(b);
  });
  const yaml = keys
    .filter((k) => !(Array.isArray(data[k]) && data[k].length === 0 && k !== 'tags'))
    .map((k) => dumpKey(k, data[k]))
    .join('');
  const cleanBody = String(body ?? '').replace(/^\n+/, '');
  return `---\n${yaml}---\n\n${cleanBody.endsWith('\n') || !cleanBody ? cleanBody : cleanBody + '\n'}`;
}
