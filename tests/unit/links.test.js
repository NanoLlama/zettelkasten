import { describe, it, expect } from 'vitest';
import { parseLinks, resolveTitleLinks, parseInlineTags, parseUrls, contextSnippet, parseAttachmentRefs } from '../../web/js/core/links.js';

describe('links', () => {
  it('parses ID links, labels and title links', () => {
    const links = parseLinks('See [[202610101430|spacing effect]] and [[202610090900]] and [[Some Title]].');
    expect(links.map((l) => [l.target, l.label])).toEqual([
      ['202610101430', 'spacing effect'],
      ['202610090900', null],
      ['Some Title', null],
    ]);
  });
  it('ignores links inside code', () => {
    expect(parseLinks('`[[202610101430]]`\n```\n[[202610101431]]\n```\n[[202610101432]]').map((l) => l.target)).toEqual(['202610101432']);
  });
  it('converts title links to ID links when the note exists', () => {
    const lookup = (t) => (t.toLowerCase() === 'spacing effect' ? '202610101430' : null);
    expect(resolveTitleLinks('A [[Spacing effect]] B [[Unknown]] C [[spacing effect|here]]', lookup)).toBe(
      'A [[202610101430|Spacing effect]] B [[Unknown]] C [[202610101430|here]]',
    );
  });
  it('finds inline tags but not headings, numbers or code', () => {
    expect(parseInlineTags('# Heading\nText #Memory and #learning/spaced, #1, `#code` (#paren)')).toEqual(['memory', 'learning/spaced', 'paren']);
  });
  it('finds URLs without trailing punctuation', () => {
    expect(parseUrls('Read https://example.com/study. Also (https://a.org/x?y=1).')).toEqual(['https://example.com/study', 'https://a.org/x?y=1']);
  });
  it('finds inline attachment references', () => {
    const h = 'a'.repeat(64);
    expect(parseAttachmentRefs(`![x](attachment:${h}) and attachment:sha256-${h}`)).toEqual([h]);
  });
  it('makes a readable context snippet', () => {
    const body = 'First line\n- Testing works, see [[202610101430|spacing]] for why.\nLast';
    expect(contextSnippet(body, body.indexOf('[['), () => 'X')).toBe('Testing works, see spacing for why.');
  });
});
