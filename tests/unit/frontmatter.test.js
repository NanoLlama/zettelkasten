import { describe, it, expect } from 'vitest';
import { parseNote, stringifyNote } from '../../web/js/core/frontmatter.js';

const sample = `---
id: "202610111208"
title: "Retrieval practice strengthens memory"
type: permanent
tags: [learning, memory]
created: 2026-10-11T12:08:00-04:00
status: active
attachments:
  - hash: "sha256-ab12"
    name: "diagram.png"
    kind: image
---

Testing yourself works. See [[202610101430|spacing effect]].
`;

describe('front matter', () => {
  it('parses the spec example', () => {
    const { data, body } = parseNote(sample);
    expect(data.id).toBe('202610111208');
    expect(data.tags).toEqual(['learning', 'memory']);
    expect(data.created).toBe('2026-10-11T12:08:00-04:00'); // stays a string
    expect(data.attachments[0].name).toBe('diagram.png');
    expect(body.startsWith('\nTesting')).toBe(true);
  });
  it('round-trips without changing data', () => {
    const { data, body } = parseNote(sample);
    const again = parseNote(stringifyNote(data, body));
    expect(again.data).toEqual(data);
    expect(again.body.trim()).toBe(body.trim());
  });
  it('writes keys in a stable order with tags inline and IDs quoted', () => {
    const out = stringifyNote({ status: 'inbox', tags: ['b', 'a'], title: 'T', id: '202601010000', type: 'fleeting' }, 'Body');
    expect(out).toBe('---\nid: "202601010000"\ntitle: T\ntype: fleeting\ntags: [b, a]\nstatus: inbox\n---\n\nBody\n');
  });
  it('quotes titles that would otherwise be misread', () => {
    const out = stringifyNote({ title: 'yes: no #hash' }, '');
    expect(parseNote(out).data.title).toBe('yes: no #hash');
  });
  it('treats a file without front matter as all body', () => {
    expect(parseNote('# Hello\ntext')).toEqual({ data: {}, body: '# Hello\ntext' });
  });
  it('never loses text when the YAML is broken', () => {
    const broken = '---\ntitle: [unclosed\n---\nbody';
    const r = parseNote(broken);
    expect(r.body).toBe(broken);
    expect(r.error).toBeTruthy();
  });
  it('handles CRLF line endings', () => {
    expect(parseNote('---\r\ntitle: A\r\n---\r\nbody').data.title).toBe('A');
  });
});
