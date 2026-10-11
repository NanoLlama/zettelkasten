// In-memory full-text index (BM25 with per-field boosts and prefix matching).
// Runs entirely on the device; rebuilt from the note files whenever the app loads.

export function normalize(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function tokenize(text) {
  return normalize(text).match(/[\p{L}\p{N}]+/gu) || [];
}

const FIELDS = ['title', 'tags', 'body', 'attach'];
const BOOST = { title: 3, tags: 2, body: 1, attach: 0.6 };
const K1 = 1.2;
const B = 0.75;

export class SearchIndex {
  constructor() {
    this.postings = new Map(); // token -> Map(docId -> [tf per field])
    this.docs = new Map(); // docId -> { lens:[...], tokens:Set, flat:string }
    this.totals = FIELDS.map(() => 0);
    this.vocab = null; // sorted token list, rebuilt lazily for prefix search
  }

  get size() {
    return this.docs.size;
  }

  add(id, fields) {
    if (this.docs.has(id)) this.remove(id);
    const lens = [];
    const tokens = new Set();
    FIELDS.forEach((f, fi) => {
      const toks = tokenize(fields[f]);
      lens.push(toks.length);
      this.totals[fi] += toks.length;
      for (const t of toks) {
        let p = this.postings.get(t);
        if (!p) {
          p = new Map();
          this.postings.set(t, p);
          this.vocab = null;
        }
        let tf = p.get(id);
        if (!tf) {
          tf = [0, 0, 0, 0];
          p.set(id, tf);
        }
        tf[fi]++;
        tokens.add(t);
      }
    });
    const flat = FIELDS.map((f) => normalize(fields[f]).replace(/\s+/g, ' ')).join(' \u0000 ');
    this.docs.set(id, { lens, tokens, flat, fields });
  }

  remove(id) {
    const doc = this.docs.get(id);
    if (!doc) return;
    doc.lens.forEach((l, i) => (this.totals[i] -= l));
    for (const t of doc.tokens) {
      const p = this.postings.get(t);
      p.delete(id);
      if (!p.size) {
        this.postings.delete(t);
        this.vocab = null;
      }
    }
    this.docs.delete(id);
  }

  _vocab() {
    if (!this.vocab) this.vocab = [...this.postings.keys()].sort();
    return this.vocab;
  }

  /** Tokens equal to or starting with `prefix`. */
  expand(prefix) {
    const vocab = this._vocab();
    let lo = 0;
    let hi = vocab.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vocab[mid] < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out = [];
    for (let i = lo; i < vocab.length && vocab[i].startsWith(prefix); i++) out.push(vocab[i]);
    return out;
  }

  /**
   * Scores documents that contain every term (exact or as a word prefix) and every phrase.
   * Returns Map(docId -> { score, fields:Set }) for matching docs; `candidates` limits the set.
   */
  match({ terms = [], phrases = [], exclude = [] }, candidates = null) {
    const N = Math.max(this.docs.size, 1);
    const avg = this.totals.map((t) => t / N || 1);
    let result = null;
    const wordTerms = [...terms.flatMap(tokenize), ...phrases.flatMap(tokenize)];

    for (const term of wordTerms) {
      const scores = new Map();
      const expansions = term.length >= 2 ? this.expand(term) : this.postings.has(term) ? [term] : [];
      for (const tok of expansions) {
        const p = this.postings.get(tok);
        const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
        const weight = tok === term ? 1 : 0.6;
        for (const [id, tf] of p) {
          if (candidates && !candidates.has(id)) continue;
          const doc = this.docs.get(id);
          let s = 0;
          const hitFields = [];
          tf.forEach((n, fi) => {
            if (!n) return;
            hitFields.push(FIELDS[fi]);
            const norm = n * (K1 + 1) / (n + K1 * (1 - B + (B * doc.lens[fi]) / avg[fi]));
            s += BOOST[FIELDS[fi]] * idf * norm;
          });
          const prev = scores.get(id);
          const entry = prev || { score: 0, fields: new Set() };
          entry.score = Math.max(entry.score, s * weight);
          hitFields.forEach((f) => entry.fields.add(f));
          scores.set(id, entry);
        }
      }
      if (!result) result = scores;
      else {
        for (const [id, e] of result) {
          const other = scores.get(id);
          if (!other) result.delete(id);
          else {
            e.score += other.score;
            other.fields.forEach((f) => e.fields.add(f));
          }
        }
      }
      if (!result.size) return result;
    }

    if (!result) {
      // No word terms: every candidate (or document) matches with score 0.
      result = new Map();
      for (const id of candidates || this.docs.keys()) if (this.docs.has(id)) result.set(id, { score: 0, fields: new Set() });
    }

    for (const phrase of phrases) {
      const needle = normalize(phrase).replace(/\s+/g, ' ');
      for (const [id] of result) if (!this.docs.get(id).flat.includes(needle)) result.delete(id);
    }
    for (const ex of exclude) {
      const toks = tokenize(ex);
      for (const [id] of result) {
        const doc = this.docs.get(id);
        if (toks.length && toks.every((t) => doc.tokens.has(t))) result.delete(id);
      }
    }
    return result;
  }

  /** The most distinctive tokens of a document (for "related notes"). */
  topTerms(id, n = 8) {
    const doc = this.docs.get(id);
    if (!doc) return [];
    const N = this.docs.size;
    const scored = [];
    for (const t of doc.tokens) {
      if (t.length < 4 || /^\d+$/.test(t)) continue;
      const p = this.postings.get(t);
      const tf = p.get(id).reduce((a, b) => a + b, 0);
      const df = p.size;
      if (df > N * 0.3 && N > 10) continue;
      scored.push([t, tf * Math.log(1 + N / df)]);
    }
    return scored.sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
  }

  /** Documents sharing tokens with `tokens` (OR query), scored by summed idf. */
  similar(tokens, excludeId) {
    const N = Math.max(this.docs.size, 1);
    const scores = new Map();
    for (const t of tokens) {
      const p = this.postings.get(t);
      if (!p) continue;
      const idf = Math.log(1 + N / p.size);
      for (const [id] of p) if (id !== excludeId) scores.set(id, (scores.get(id) || 0) + idf);
    }
    return scores;
  }
}

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A short excerpt of `text` around the first match, HTML-escaped, with matches in <mark>.
 */
export function makeSnippet(text, words, max = 180) {
  const plain = String(text || '').replace(/\s+/g, ' ').trim();
  const needles = words.map((w) => w.trim()).filter(Boolean);
  if (!needles.length) return escapeHtml(plain.slice(0, max)) + (plain.length > max ? '…' : '');
  const re = new RegExp(`(${needles.map(escapeRe).join('|')})[\\p{L}\\p{N}]*`, 'giu');
  const first = plain.search(re);
  let start = first < 0 ? 0 : Math.max(0, first - Math.floor(max / 3));
  if (start > 0) {
    const space = plain.indexOf(' ', start);
    if (space !== -1 && space < first) start = space + 1;
  }
  const slice = plain.slice(start, start + max);
  const html = escapeHtml(slice).replace(
    new RegExp(`(${needles.map((n) => escapeRe(escapeHtml(n))).join('|')})[\\p{L}\\p{N}]*`, 'giu'),
    '<mark>$&</mark>',
  );
  return (start > 0 ? '…' : '') + html + (start + max < plain.length ? '…' : '');
}
