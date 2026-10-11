// Line-based diff (longest common subsequence) for the note History view.

/** Returns [{ op: ' ' | '+' | '-', line }] turning `a` into `b`. */
export function lineDiff(a, b) {
  const A = String(a).split('\n');
  const B = String(b).split('\n');
  // Trim common prefix/suffix to keep the table small.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const a2 = A.slice(start, endA);
  const b2 = B.slice(start, endB);
  const out = A.slice(0, start).map((line) => ({ op: ' ', line }));

  if (a2.length * b2.length > 4_000_000) {
    a2.forEach((line) => out.push({ op: '-', line }));
    b2.forEach((line) => out.push({ op: '+', line }));
  } else {
    const n = a2.length;
    const m = b2.length;
    const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a2[i] === b2[j]) {
        out.push({ op: ' ', line: a2[i] });
        i++;
        j++;
      } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ op: '-', line: a2[i++] });
      else out.push({ op: '+', line: b2[j++] });
    }
    while (i < n) out.push({ op: '-', line: a2[i++] });
    while (j < m) out.push({ op: '+', line: b2[j++] });
  }
  A.slice(endA).forEach((line) => out.push({ op: ' ', line }));
  return out;
}

/** Collapses long unchanged runs, keeping `context` lines around each change. */
export function compactDiff(diff, context = 2) {
  const keep = diff.map(() => false);
  diff.forEach((d, i) => {
    if (d.op !== ' ') for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k++) keep[k] = true;
  });
  const out = [];
  let skipped = 0;
  diff.forEach((d, i) => {
    if (keep[i]) {
      if (skipped) out.push({ op: '…', line: `${skipped} unchanged line${skipped > 1 ? 's' : ''}` });
      skipped = 0;
      out.push(d);
    } else skipped++;
  });
  if (skipped) out.push({ op: '…', line: `${skipped} unchanged line${skipped > 1 ? 's' : ''}` });
  return out;
}
