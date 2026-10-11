// Note IDs, file names and timestamps.
// An ID is the creation time as YYYYMMDDHHmm (local time). It never changes, even if
// the note's title does, so links that point at an ID never break.

const pad = (n, w = 2) => String(n).padStart(w, '0');

export const ID_RE = /^\d{12}$/;

export function formatId(date) {
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes())
  );
}

/** Parses an ID back into a local Date (start of that minute). */
export function idToDate(id) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(id);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/**
 * Returns an unused ID for `date`. If two notes are created in the same minute the
 * later one moves forward a minute at a time until it finds a free slot (see DECISIONS.md).
 */
export function nextFreeId(date, taken) {
  const d = new Date(date.getTime());
  d.setSeconds(0, 0);
  let id = formatId(d);
  while (taken.has(id)) {
    d.setMinutes(d.getMinutes() + 1);
    id = formatId(d);
  }
  return id;
}

/** URL-safe slug that keeps non-Latin letters (e.g. "Gedächtnis" -> "gedachtnis", "記憶" -> "記憶"). */
export function slugify(title, maxLength = 50) {
  const slug = String(title || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return slug || 'note';
}

/** File name for a note: YYYYMMDD-HHmm-slug.md */
export function noteFileName(id, title) {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${slugify(title)}.md`;
}

/** Extracts the ID from a note file name or path, or null. */
export function idFromFileName(path) {
  const name = path.split('/').pop();
  const m = /^(\d{8})-(\d{4})(?:-|\.md$)/.exec(name);
  return m ? m[1] + m[2] : null;
}

/** ISO 8601 timestamp in local time with offset, e.g. 2026-10-11T12:08:00-04:00 */
export function isoLocal(date = new Date()) {
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
