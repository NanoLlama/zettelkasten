import { describe, it, expect } from 'vitest';
import { lineDiff, compactDiff } from '../../web/js/core/diff.js';
import { applyRetention, backupDate } from '../../web/js/core/retention.js';
import { gitBlobSha, toBase64, fromBase64, toBytes } from '../../web/js/core/bytes.js';

describe('diff', () => {
  it('produces a minimal line diff', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc\nd')).toEqual([
      { op: ' ', line: 'a' }, { op: '-', line: 'b' }, { op: '+', line: 'B' }, { op: ' ', line: 'c' }, { op: '+', line: 'd' },
    ]);
  });
  it('compacts unchanged runs', () => {
    const d = compactDiff(lineDiff('1\n2\n3\n4\n5\n6\n7', '1\n2\n3\n4\n5\n6\nX'), 1);
    expect(d[0]).toEqual({ op: '…', line: '5 unchanged lines' });
  });
});

describe('retention', () => {
  it('keeps 7 daily, 4 weekly, 12 monthly', () => {
    const names = [];
    const start = Date.UTC(2025, 0, 1, 2, 0);
    for (let i = 0; i < 500; i++) {
      const d = new Date(start + i * 86400000);
      const s = d.toISOString();
      names.push(`zk-backup-${s.slice(0, 4)}${s.slice(5, 7)}${s.slice(8, 10)}-0200`);
    }
    const { keep, prune } = applyRetention(names);
    expect(keep.length + prune.length).toBe(500);
    // 7 dailies + up to 4 weeklies + up to 12 monthlies, with overlaps
    expect(keep.length).toBeGreaterThanOrEqual(12);
    expect(keep.length).toBeLessThanOrEqual(23);
    const newest = names[names.length - 1];
    expect(keep).toContain(newest);
    for (const n of names.slice(-7)) expect(keep).toContain(n);
    expect(keep).not.toContain(names[0]);
  });
  it('never prunes names it cannot date', () => {
    expect(applyRetention(['something-else'], { daily: 0, weekly: 0, monthly: 0 }).keep).toEqual(['something-else']);
  });
  it('parses backup names', () => expect(backupDate('zk-backup-20261011-0200').toISOString()).toBe('2026-10-11T02:00:00.000Z'));
});

describe('bytes', () => {
  it('computes git blob SHAs', async () => {
    // `echo -n "hello" | git hash-object --stdin`
    expect(await gitBlobSha('hello')).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
  });
  it('round-trips base64 including non-ASCII', () => {
    const b = toBytes('Gedächtnis 記憶');
    expect(fromBase64(toBase64(b))).toEqual(b);
  });
});
