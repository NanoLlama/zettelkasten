// The in-memory model of the slip-box: notes parsed from files, the link graph,
// tags and the search index. Everything here can be rebuilt from the files alone.
import { parseNote } from './frontmatter.js';
import { idFromFileName, ID_RE } from './ids.js';
import { parseLinks, parseInlineTags, parseUrls, parseAttachmentRefs, normalizeTag, contextSnippet, isId, linksToText } from './links.js';
import { SearchIndex, makeSnippet, tokenize, normalize } from './search.js';
import { parseQuery, matchDate, isEmptyQuery } from './query.js';

export const NOTE_TYPES = ['fleeting', 'literature', 'permanent', 'index', 'project', 'source'];
export const STATUSES = ['inbox', 'active', 'archived'];
export const NOTES_DIR = 'notes/';
export const ATTACH_DIR = 'attachments/';
export const EXTRACT_DIR = '.zk/extracted/';
export const TRASH_DIR = '.zk/trash/';

export const isNotePath = (p) => p.startsWith(NOTES_DIR) && p.endsWith('.md') && !p.slice(NOTES_DIR.length).includes('/');

const titleKey = (t) => normalize(t).replace(/\s+/g, ' ').trim();

export function noteFromFile(path, text) {
  const { data, body, error } = parseNote(text);
  const id = data.id != null && ID_RE.test(String(data.id)) ? String(data.id) : idFromFileName(path);
  const heading = /^#\s+(.+)$/m.exec(body);
  const title = String(data.title ?? '').trim() || (heading ? heading[1].trim() : '') || path.split('/').pop().replace(/\.md$/, '');
  const fmTags = (Array.isArray(data.tags) ? data.tags : data.tags ? String(data.tags).split(/[,\s]+/) : [])
    .map(normalizeTag)
    .filter(Boolean);
  const inlineTags = parseInlineTags(body);
  const type = NOTE_TYPES.includes(String(data.type)) ? String(data.type) : 'permanent';
  const status = STATUSES.includes(String(data.status)) ? String(data.status) : type === 'fleeting' ? 'inbox' : 'active';
  const attachments = (Array.isArray(data.attachments) ? data.attachments : [])
    .filter((a) => a && a.hash)
    .map((a) => ({ ...a, hash: String(a.hash).replace(/^sha256-/, '') }));
  return {
    id,
    path,
    text,
    data,
    body,
    error,
    title,
    type,
    status,
    fmTags,
    tags: [...new Set([...fmTags, ...inlineTags])],
    source: data.source != null ? String(data.source) : null,
    created: data.created ? String(data.created) : null,
    modified: data.modified ? String(data.modified) : data.created ? String(data.created) : null,
    pinned: data.pinned === true,
    attachments,
    links: parseLinks(body),
    urls: parseUrls(body),
    inlineAttachments: parseAttachmentRefs(body),
  };
}

export class Vault {
  constructor() {
    this.notes = new Map(); // id -> note
    this.pathToId = new Map();
    this.trash = new Map(); // path -> note
    this.extracted = new Map(); // attachment hash -> text
    this.attachmentFiles = new Map(); // hash -> { path, size }
    this.index = new SearchIndex();
    this._graph = null;
    this.duplicates = []; // files whose id clashed with another file
  }

  // ---- loading -----------------------------------------------------------------

  loadFile(path, text) {
    if (path.startsWith(TRASH_DIR)) {
      this.trash.set(path, noteFromFile(path, text));
      return;
    }
    if (path.startsWith(EXTRACT_DIR)) {
      const hash = path.slice(EXTRACT_DIR.length).replace(/\.txt$/, '');
      this.extracted.set(hash, text);
      for (const n of this.notes.values()) if (this._attachHashes(n).includes(hash)) this._indexNote(n);
      return;
    }
    if (!isNotePath(path)) return;
    const note = noteFromFile(path, text);
    if (!note.id) note.id = 'x' + path; // file without a recognizable ID still shows up
    const prevId = this.pathToId.get(path);
    if (prevId && prevId !== note.id) this._removeId(prevId);
    const existing = this.notes.get(note.id);
    if (existing && existing.path !== path) {
      this.duplicates.push(path);
      return;
    }
    this.notes.set(note.id, note);
    this.pathToId.set(path, note.id);
    this._indexNote(note);
    this._graph = null;
  }

  removePath(path) {
    if (path.startsWith(TRASH_DIR)) return void this.trash.delete(path);
    if (path.startsWith(EXTRACT_DIR)) return void this.extracted.delete(path.slice(EXTRACT_DIR.length).replace(/\.txt$/, ''));
    const id = this.pathToId.get(path);
    if (id) this._removeId(id);
  }

  setAttachmentFile(hash, info) {
    if (info) this.attachmentFiles.set(hash, info);
    else this.attachmentFiles.delete(hash);
  }

  _removeId(id) {
    const n = this.notes.get(id);
    if (!n) return;
    this.notes.delete(id);
    this.pathToId.delete(n.path);
    this.index.remove(id);
    this._graph = null;
  }

  _attachHashes(n) {
    return [...new Set([...n.attachments.map((a) => a.hash), ...n.inlineAttachments])];
  }

  _indexNote(n) {
    const attach = this._attachHashes(n)
      .map((h) => this.extracted.get(h) || '')
      .join('\n');
    const names = n.attachments.map((a) => a.name || '').join(' ');
    this.index.add(n.id, {
      title: n.title,
      tags: n.tags.join(' '),
      body: linksToText(n.body, (t) => this.notes.get(t)?.title || t),
      attach: `${names}\n${attach}`,
    });
  }

  // ---- lookups -----------------------------------------------------------------

  get(id) {
    return this.notes.get(id) || null;
  }

  list() {
    return [...this.notes.values()];
  }

  titleOf(id) {
    return this.notes.get(id)?.title || null;
  }

  byTitle(title) {
    const key = titleKey(title);
    if (!key) return null;
    for (const n of this.notes.values()) if (titleKey(n.title) === key) return n;
    return null;
  }

  idForTarget(target) {
    if (isId(target)) return this.notes.has(target) ? target : null;
    return this.byTitle(target)?.id || null;
  }

  // ---- link graph ----------------------------------------------------------------

  _buildGraph() {
    const out = new Map();
    const back = new Map();
    const titles = new Map();
    for (const n of this.notes.values()) if (!titles.has(titleKey(n.title))) titles.set(titleKey(n.title), n.id);
    const resolve = (t) => (isId(t) ? (this.notes.has(t) ? t : null) : titles.get(titleKey(t)) || null);
    for (const n of this.notes.values()) {
      const links = [];
      for (const l of n.links) {
        const to = resolve(l.target);
        links.push({ to, target: l.target, label: l.label, index: l.index });
        if (to && to !== n.id) {
          if (!back.has(to)) back.set(to, []);
          back.get(to).push({ from: n.id, index: l.index });
        }
      }
      out.set(n.id, links);
    }
    this._graph = { out, back };
    return this._graph;
  }

  graph() {
    return this._graph || this._buildGraph();
  }

  /** Outgoing links: [{ to (id or null if missing), target, label }] in order, unique by target. */
  outgoing(id) {
    const seen = new Set();
    return (this.graph().out.get(id) || []).filter((l) => {
      const k = l.to || 'missing:' + l.target;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Notes linking to `id`, with the text around each link. */
  backlinks(id) {
    const byNote = new Map();
    for (const b of this.graph().back.get(id) || []) {
      const from = this.notes.get(b.from);
      if (!from) continue;
      if (!byNote.has(b.from)) byNote.set(b.from, { note: from, contexts: [] });
      byNote.get(b.from).contexts.push(contextSnippet(from.body, b.index, (t) => this.titleOf(t)));
    }
    return [...byNote.values()].sort((a, b) => String(b.note.modified).localeCompare(String(a.note.modified)));
  }

  /** Ordered child notes of an index (or any) note: its resolved outgoing links. */
  children(id) {
    return this.outgoing(id).filter((l) => l.to).map((l) => this.notes.get(l.to));
  }

  degree(id) {
    const g = this.graph();
    const out = new Set((g.out.get(id) || []).filter((l) => l.to && l.to !== id).map((l) => l.to));
    const back = new Set((g.back.get(id) || []).map((b) => b.from));
    return { out: out.size, in: back.size, total: new Set([...out, ...back]).size };
  }

  neighbors(id) {
    const g = this.graph();
    return new Set([
      ...(g.out.get(id) || []).filter((l) => l.to && l.to !== id).map((l) => l.to),
      ...(g.back.get(id) || []).map((b) => b.from),
    ]);
  }

  // ---- lists ---------------------------------------------------------------------

  tagCounts() {
    const counts = new Map();
    for (const n of this.notes.values()) for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  recent(limit = 30) {
    return this.list()
      .sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
      .slice(0, limit);
  }

  inbox() {
    return this.list()
      .filter((n) => n.status === 'inbox')
      .sort((a, b) => String(a.created).localeCompare(String(b.created)));
  }

  orphans() {
    return this.list()
      .filter((n) => n.type !== 'source' && this.degree(n.id).total === 0)
      .sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  }

  mostConnected(limit = 30) {
    return this.list()
      .map((n) => ({ note: n, degree: this.degree(n.id).total }))
      .filter((x) => x.degree > 0)
      .sort((a, b) => b.degree - a.degree || a.note.title.localeCompare(b.note.title))
      .slice(0, limit);
  }

  pinned() {
    return this.list()
      .filter((n) => n.pinned)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  ofType(type) {
    return this.list()
      .filter((n) => n.type === type)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  withTag(tag) {
    return this.list()
      .filter((n) => n.tags.includes(tag))
      .sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
  }

  random(excludeId = null) {
    const pool = this.list().filter((n) => n.id !== excludeId && n.status !== 'archived');
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** Notes that reference the given attachment hash. */
  attachmentOwners(hash) {
    return this.list().filter((n) => this._attachHashes(n).includes(hash));
  }

  /** Attachment files no note refers to. */
  orphanAttachments() {
    const used = new Set();
    for (const n of this.notes.values()) this._attachHashes(n).forEach((h) => used.add(h));
    for (const n of this.trash.values()) this._attachHashes(n).forEach((h) => used.add(h));
    return [...this.attachmentFiles.entries()].filter(([h]) => !used.has(h)).map(([hash, info]) => ({ hash, ...info }));
  }

  /** Notes related by shared tags, shared neighbours and similar wording. */
  related(id, limit = 8) {
    const note = this.notes.get(id);
    if (!note) return [];
    const scores = new Map();
    const add = (oid, s, why) => {
      if (oid === id) return;
      const e = scores.get(oid) || { score: 0, why: new Set() };
      e.score += s;
      e.why.add(why);
      scores.set(oid, e);
    };
    const direct = this.neighbors(id);
    for (const t of note.tags) for (const n of this.withTag(t)) add(n.id, 2, `#${t}`);
    for (const nb of direct) for (const second of this.neighbors(nb)) if (!direct.has(second)) add(second, 1.5, 'shared link');
    const sim = this.index.similar(this.index.topTerms(id), id);
    const max = Math.max(1, ...sim.values());
    for (const [oid, s] of sim) if (s / max > 0.25) add(oid, (2 * s) / max, 'similar words');
    return [...scores.entries()]
      .filter(([oid]) => !direct.has(oid) && this.notes.has(oid))
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([oid, e]) => ({ note: this.notes.get(oid), score: e.score, why: [...e.why] }));
  }

  // ---- search ----------------------------------------------------------------------

  _passesFilter(n, f) {
    let ok;
    switch (f.key) {
      case 'tag': ok = n.tags.some((t) => t === f.value || t.startsWith(f.value + '/')); break;
      case 'type': ok = n.type === f.value; break;
      case 'status': ok = n.status === f.value; break;
      case 'source': ok = n.source === f.value; break;
      case 'linked-to': ok = this.outgoing(n.id).some((l) => l.to === f.value || (l.to && titleKey(this.titleOf(l.to)) === titleKey(f.value))); break;
      case 'has':
        ok =
          f.value.startsWith('attach') ? this._attachHashes(n).length > 0
          : f.value === 'image' ? n.attachments.some((a) => a.kind === 'image')
          : f.value === 'link' || f.value === 'links' ? this.degree(n.id).out > 0
          : f.value === 'backlink' || f.value === 'backlinks' ? this.degree(n.id).in > 0
          : f.value === 'url' ? n.urls.length > 0
          : f.value === 'source' ? !!n.source
          : f.value === 'tag' || f.value === 'tags' ? n.tags.length > 0
          : false;
        break;
      case 'is':
        ok =
          f.value === 'orphan' ? this.degree(n.id).total === 0
          : f.value === 'pinned' ? n.pinned
          : f.value === 'stub' ? !n.body.trim()
          : n.type === f.value || n.status === f.value;
        break;
      case 'created': ok = matchDate(n.created, f.op, f.value); break;
      case 'modified': ok = matchDate(n.modified, f.op, f.value); break;
      default: ok = true;
    }
    return f.negate ? !ok : ok;
  }

  /**
   * Runs a search box query. Returns [{ note, score, snippet, inAttachment }].
   * With only filters (or nothing), results are sorted newest first.
   */
  search(text, { limit = 100 } = {}) {
    const q = typeof text === 'string' ? parseQuery(text) : text;
    let candidates = null;
    if (q.filters.length) {
      candidates = new Set();
      for (const n of this.notes.values()) if (q.filters.every((f) => this._passesFilter(n, f))) candidates.add(n.id);
    }
    const matches = this.index.match(q, candidates);
    const words = [...q.terms, ...q.phrases];
    const hasText = words.length > 0;
    const results = [];
    for (const [id, m] of matches) {
      const note = this.notes.get(id);
      if (!note) continue;
      const inAttachment = hasText && m.fields.has('attach') && !m.fields.has('body') && !m.fields.has('title') && !m.fields.has('tags');
      results.push({ note, score: m.score, inAttachment, fields: m.fields });
    }
    if (hasText) results.sort((a, b) => b.score - a.score || String(b.note.modified).localeCompare(String(a.note.modified)));
    else results.sort((a, b) => String(b.note.modified).localeCompare(String(a.note.modified)));
    const total = results.length;
    const out = results.slice(0, limit);
    for (const r of out) {
      const doc = this.index.docs.get(r.note.id);
      const source = r.inAttachment ? doc.fields.attach : doc.fields.body;
      r.snippet = makeSnippet(source, words);
    }
    out.total = total;
    out.query = q;
    out.empty = isEmptyQuery(q);
    return out;
  }

  /** Fuzzy title matching for the [[ autocomplete. */
  suggestTitles(query, limit = 8, excludeId = null) {
    const q = normalize(query).trim();
    const scored = [];
    for (const n of this.notes.values()) {
      if (n.id === excludeId) continue;
      const t = normalize(n.title);
      let s = -1;
      if (!q) s = 1;
      else if (t.startsWith(q)) s = 100 - t.length / 100;
      else if (t.includes(' ' + q)) s = 80;
      else if (t.includes(q)) s = 60;
      else if (n.id.startsWith(q)) s = 50;
      else {
        // subsequence match: all query letters in order
        let i = 0;
        for (const ch of t) if (ch === q[i]) i++;
        if (i === q.length) s = 20 - (t.length - q.length) / 50;
      }
      if (s >= 0) scored.push([s + (n.type === 'permanent' || n.type === 'index' ? 1 : 0), n]);
    }
    if (!q) return this.recent(limit + 1).filter((n) => n.id !== excludeId).slice(0, limit);
    return scored
      .sort((a, b) => b[0] - a[0] || a[1].title.localeCompare(b[1].title))
      .slice(0, limit)
      .map(([, n]) => n);
  }

  suggestTags(prefix, limit = 8) {
    const p = normalizeTag(prefix);
    return this.tagCounts()
      .filter(([t]) => t.startsWith(p) && t !== p)
      .slice(0, limit)
      .map(([t]) => t);
  }

  stats() {
    const byType = {};
    for (const n of this.notes.values()) byType[n.type] = (byType[n.type] || 0) + 1;
    return { notes: this.notes.size, byType, inbox: this.inbox().length, tags: this.tagCounts().length };
  }
}

export { tokenize };
