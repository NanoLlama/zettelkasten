import { describe, it, expect } from 'vitest';
import { formatId, nextFreeId, slugify, noteFileName, idFromFileName, isoLocal, idToDate } from '../../web/js/core/ids.js';

describe('ids', () => {
  const d = new Date(2026, 9, 11, 12, 8, 33);
  it('formats the ID as YYYYMMDDHHmm', () => expect(formatId(d)).toBe('202610111208'));
  it('round-trips through idToDate', () => expect(formatId(idToDate('202610111208'))).toBe('202610111208'));
  it('moves forward a minute when the ID is taken', () => {
    expect(nextFreeId(d, new Set(['202610111208', '202610111209']))).toBe('202610111210');
  });
  it('rolls over hours and days', () => {
    expect(nextFreeId(new Date(2026, 11, 31, 23, 59), new Set(['202612312359']))).toBe('202701010000');
  });
  it('slugifies, keeping non-Latin letters', () => {
    expect(slugify('Retrieval practice strengthens memory!')).toBe('retrieval-practice-strengthens-memory');
    expect(slugify('Gedächtnis & Lernen')).toBe('gedachtnis-lernen');
    expect(slugify('記憶の仕組み')).toBe('記憶の仕組み');
    expect(slugify('???')).toBe('note');
    expect(slugify('a'.repeat(80)).length).toBe(50);
  });
  it('builds and parses file names', () => {
    expect(noteFileName('202610111208', 'Example idea')).toBe('20261011-1208-example-idea.md');
    expect(idFromFileName('notes/20261011-1208-example-idea.md')).toBe('202610111208');
    expect(idFromFileName('notes/random.md')).toBe(null);
  });
  it('writes local ISO timestamps with an offset', () => {
    expect(isoLocal(d)).toMatch(/^2026-10-11T12:08:33[+-]\d{2}:\d{2}$/);
  });
});
