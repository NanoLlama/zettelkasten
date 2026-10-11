// Parses the search box syntax:
//   plain words, "exact phrase", -excluded, tag:memory, type:permanent, status:inbox,
//   has:attachment, linked-to:ID, created:>2026-01-01, modified:<2026-02, is:orphan, is:pinned
// Filters can be negated with a leading minus, e.g. -tag:draft.

const FILTER_KEYS = new Set(['tag', 'type', 'status', 'has', 'linked-to', 'links-to', 'created', 'modified', 'is', 'source']);
const KEY_ALIASES = { 'links-to': 'linked-to' };

export function parseQuery(input) {
  const q = { terms: [], phrases: [], exclude: [], filters: [], text: String(input || '') };
  const re = /(-?)(?:([a-z-]+):)?(?:"([^"]*)"?|(\S+))/gi;
  for (const m of q.text.matchAll(re)) {
    const negate = m[1] === '-';
    let key = m[2] ? m[2].toLowerCase() : null;
    const quoted = m[3];
    const value = quoted ?? m[4] ?? '';
    if (key && !FILTER_KEYS.has(key)) {
      // Not a known filter (e.g. "note:"); treat the whole thing as text.
      const word = `${m[2]}:${value}`;
      (negate ? q.exclude : q.terms).push(word);
      continue;
    }
    if (key) {
      key = KEY_ALIASES[key] || key;
      if (!value) continue;
      q.filters.push(parseFilter(key, value, negate));
    } else if (quoted !== undefined) {
      if (quoted.trim()) (negate ? q.exclude : q.phrases).push(quoted.trim());
    } else if (value) {
      if (negate && value.length > 0) q.exclude.push(value);
      else q.terms.push(value);
    }
  }
  return q;
}

function parseFilter(key, value, negate) {
  if (key === 'created' || key === 'modified') {
    const m = /^(>=|<=|>|<|=)?(\d{4}(?:-\d{2}(?:-\d{2})?)?)$/.exec(value);
    if (m) return { key, op: m[1] || '=', value: m[2], negate };
    return { key, op: 'invalid', value, negate };
  }
  return { key, value: value.toLowerCase(), negate };
}

/** Compares a full ISO timestamp against a partial date (YYYY, YYYY-MM or YYYY-MM-DD). */
export function matchDate(stamp, op, value) {
  if (!stamp) return false;
  const s = String(stamp).slice(0, value.length);
  switch (op) {
    case '=': return s === value;
    case '>': return s > value;
    case '>=': return s >= value;
    case '<': return s < value;
    case '<=': return s <= value;
    default: return false;
  }
}

export function isEmptyQuery(q) {
  return !q.terms.length && !q.phrases.length && !q.exclude.length && !q.filters.length;
}
