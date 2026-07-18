// Pure, storage-free derivations. These are computed at read time in queries and
// MUST NOT be persisted (see CLAUDE.md invariants).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between committed and needed dates. null when no committed date. */
export function slackDays(
  neededByDate: number,
  committedDate: number | undefined,
): number | null {
  if (committedDate === undefined) return null;
  return Math.round((neededByDate - committedDate) / DAY_MS);
}

/** Risk exposure = probability × impact (both 1–5). */
export function riskScore(probability: number, impact: number): number {
  return probability * impact;
}
