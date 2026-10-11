import { describe, it, expect, beforeEach } from 'vitest';
import { parseQuery } from '../../web/js/core/query.js';
import { Vault } from '../../web/js/core/vault.js';
import { stringifyNote } from '../../web/js/core/frontmatter.js';
import { noteFileName } from '../../web/js/core/ids.js';
import { makeSnippet } from '../../web/js/core/search.js';

function add(vault, id, data, body) {
  const full = { id, title: data.title, type: 'permanent', status: 'active', created: `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T10:00:00+00:00`, ...data };
  vault.loadFile('notes/' + noteFileName(id, data.title), stringifyNote(full, body));
}

describe('query parser', () => {
  it('parses words, phrases, exclusions and filters', () => {
    const q = parseQuery('memory "spaced repetition" -cramming tag:Learning type:permanent has:attachment linked-to:202610101430 created:>2026-01-01 status:inbox -tag:draft');
    expect(q.terms).toEqual(['memory']);
    expect(q.phrases).toEqual(['spaced repetition']);
    expect(q.exclude).toEqual(['cramming']);
    expect(q.filters).toEqual([
      { key: 'tag', value: 'learning', negate: false },
      { key: 'type', value: 'permanent', negate: false },
      { key: 'has', value: 'attachment', negate: false },
      { key: 'linked-to', value: '202610101430', negate: false },
      { key: 'created', op: '>', value: '2026-01-01', negate: false },
      { key: 'status', value: 'inbox', negate: false },
      { key: 'tag', value: 'draft', negate: true },
    ]);
  });
  it('treats unknown prefixes as text and tolerates an unclosed quote', () => {
    const q = parseQuery('note:thing "open phrase');
    expect(q.terms).toEqual(['note:thing']);
    expect(q.phrases).toEqual(['open phrase']);
  });
});

describe('vault search', () => {
  let v;
  beforeEach(() => {
    v = new Vault();
    add(v, '202601010900', { title: 'Spacing effect', tags: ['memory'] }, 'Spreading study sessions over time beats cramming.');
    add(v, '202602011000', { title: 'Retrieval practice strengthens memory', tags: ['learning', 'memory'] },
      'Testing yourself works better than rereading. See [[202601010900|spacing]].');
    add(v, '202603011100', { title: 'Inbox thought', type: 'fleeting', status: 'inbox', tags: [] }, 'Maybe cramming has a place?');
    add(v, '202604011200', { title: 'Learning index', type: 'index', tags: ['learning'],
      attachments: [{ hash: 'sha256-' + 'c'.repeat(64), name: 'paper.pdf', kind: 'document' }] }, '- [[202602011000]]\n- [[Spacing effect]]');
    v.loadFile('.zk/extracted/' + 'c'.repeat(64) + '.txt', 'The hippocampus consolidates declarative memories.');
  });

  const ids = (q) => v.search(q).map((r) => r.note.id);

  it('finds words in titles, bodies and tags, title matches first', () => {
    expect(ids('memory')[0]).toBe('202602011000');
    expect(ids('memory')).toContain('202601010900'); // tag only
    expect(ids('rereading')).toEqual(['202602011000']);
  });
  it('matches word prefixes as you type', () => expect(ids('reread')).toEqual(['202602011000']));
  it('requires all words', () => expect(ids('testing spacing')).toEqual(['202602011000']));
  it('ignores accents and case', () => expect(ids('SPÁCING effect')).toContain('202601010900'));
  it('supports exact phrases', () => {
    expect(ids('"study sessions"')).toEqual(['202601010900']);
    expect(ids('"sessions study"')).toEqual([]);
  });
  it('supports exclusion', () => expect(ids('cramming -maybe')).toEqual(['202601010900']));
  it('filters by tag, type, status', () => {
    expect(ids('tag:learning').sort()).toEqual(['202602011000', '202604011200']);
    expect(ids('type:fleeting')).toEqual(['202603011100']);
    expect(ids('status:inbox')).toEqual(['202603011100']);
    expect(ids('tag:memory -tag:learning')).toEqual(['202601010900']);
  });
  it('filters by links, attachments, orphans and dates', () => {
    expect(ids('linked-to:202601010900').sort()).toEqual(['202602011000', '202604011200']);
    expect(ids('has:attachment')).toEqual(['202604011200']);
    expect(ids('is:orphan')).toEqual(['202603011100']);
    expect(ids('created:>2026-02-15').sort()).toEqual(['202603011100', '202604011200']);
    expect(ids('created:2026-01')).toEqual(['202601010900']);
    expect(ids('created:<=2026-02-01').sort()).toEqual(['202601010900', '202602011000']);
  });
  it('searches extracted attachment text and flags it', () => {
    const r = v.search('hippocampus');
    expect(r.map((x) => x.note.id)).toEqual(['202604011200']);
    expect(r[0].inAttachment).toBe(true);
    expect(r[0].snippet).toContain('<mark>hippocampus</mark>');
  });
  it('highlights snippets and escapes HTML', () => {
    expect(makeSnippet('a <b> memory test', ['memory'])).toBe('a &lt;b&gt; <mark>memory</mark> test');
  });
  it('resolves title links into backlinks with context', () => {
    const back = v.backlinks('202601010900');
    expect(back.map((b) => b.note.id).sort()).toEqual(['202602011000', '202604011200']);
    expect(back.find((b) => b.note.id === '202602011000').contexts[0]).toContain('See spacing.');
  });
  it('lists orphans, most connected, tags, inbox', () => {
    expect(v.orphans().map((n) => n.id)).toEqual(['202603011100']);
    expect(v.mostConnected().map((x) => x.degree)).toEqual([2, 2, 2]);
    expect(v.tagCounts()).toEqual([['learning', 2], ['memory', 2]]);
    expect(v.inbox().map((n) => n.id)).toEqual(['202603011100']);
  });
  it('keeps links working after a title change (links are by ID)', () => {
    add(v, '202601010900', { title: 'The spacing effect (renamed)', tags: ['memory'] }, 'Spreading study sessions.');
    expect(v.backlinks('202601010900').map((b) => b.note.id)).toContain('202602011000');
  });
  it('suggests titles fuzzily', () => {
    expect(v.suggestTitles('retr')[0].id).toBe('202602011000');
    expect(v.suggestTitles('spcng')[0].id).toBe('202601010900');
  });
  it('finds related notes', () => {
    const rel = v.related('202603011100').map((r) => r.note.id);
    expect(rel).toContain('202601010900'); // shares the word "cramming"
  });
  it('removes notes from the index', () => {
    v.removePath('notes/' + noteFileName('202602011000', 'Retrieval practice strengthens memory'));
    expect(ids('rereading')).toEqual([]);
    expect(v.backlinks('202601010900').map((b) => b.note.id)).toEqual(['202604011200']);
  });
});

describe('search performance', () => {
  it('searches 10,000 notes quickly', () => {
    const v = new Vault();
    const words = 'memory learning spacing retrieval testing habit writing reading attention focus sleep practice note link idea'.split(' ');
    for (let i = 0; i < 10000; i++) {
      const id = String(202001010000 + i);
      const body = Array.from({ length: 60 }, (_, k) => words[(i * 7 + k * 13) % words.length] + (k % 5 ? '' : i)).join(' ');
      v.loadFile(`notes/${id.slice(0, 8)}-${id.slice(8)}-n.md`, stringifyNote({ id, title: `Note ${i} ${words[i % words.length]}`, tags: [words[i % 5]] }, body));
    }
    const t0 = performance.now();
    for (const q of ['memory', 'spac', 'memory tag:sleep', '"retrieval testing"', 'note 99']) v.search(q, { limit: 50 });
    const per = (performance.now() - t0) / 5;
    expect(per).toBeLessThan(200);
  }, 60000);
});
