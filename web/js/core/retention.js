// Backup retention: keep the newest backup of each of the last N days, weeks and months.
// Used by the nightly backup job in the vault repository.

/** Parses "zk-backup-YYYYMMDD-HHmm" (any prefix) into a UTC Date, or null. */
export function backupDate(name) {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(name);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - yearStart) / 86400000 + 1) / 7)}`;
}

/**
 * Splits backup names into { keep, prune }.
 * policy = { daily: 7, weekly: 4, monthly: 12 }. The newest backup is always kept,
 * and names without a recognizable date are never pruned.
 */
export function applyRetention(names, policy = { daily: 7, weekly: 4, monthly: 12 }) {
  const dated = names
    .map((name) => ({ name, date: backupDate(name) }))
    .filter((b) => b.date)
    .sort((a, b) => b.date - a.date);
  const keep = new Set(names.filter((n) => !backupDate(n)));
  if (dated.length) keep.add(dated[0].name);

  const buckets = [
    [policy.daily ?? 7, (d) => d.toISOString().slice(0, 10)],
    [policy.weekly ?? 4, isoWeek],
    [policy.monthly ?? 12, (d) => d.toISOString().slice(0, 7)],
  ];
  for (const [count, keyOf] of buckets) {
    const seen = new Set();
    for (const b of dated) {
      const k = keyOf(b.date);
      if (seen.has(k)) continue;
      if (seen.size >= count) break;
      seen.add(k);
      keep.add(b.name);
    }
  }
  return { keep: names.filter((n) => keep.has(n)), prune: names.filter((n) => !keep.has(n)) };
}
