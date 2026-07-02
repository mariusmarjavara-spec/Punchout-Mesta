/**
 * Del 7/8 Operations Center extensions — Ranking Engine + Correction
 * Memory analytics. Pure functions, no AI. Goal is measuring whether
 * the Ranking Engine is getting better, never whether it is "learning"
 * (Del 7: "Mål om Ranking Engine faktisk blir bedre over tid. Ikke om
 * den lærer" — these functions report measured outcomes; nothing here
 * changes a score, a rule, or a candidate).
 */

/** @param {import('../correction-memory/types.mjs').CorrectionEntry[]} entries */
export function topCorrectedTerms(entries) {
  const byOriginal = {};
  for (const e of entries) byOriginal[e.originalValue] = (byOriginal[e.originalValue] || 0) + e.count;
  return Object.entries(byOriginal).sort((a, b) => b[1] - a[1]).map(([originalValue, totalCorrections]) => ({ originalValue, totalCorrections }));
}

/** Highest confidenceBonus first — the corrections the Ranking Engine now trusts most. */
export function mostValuableCorrections(entries) {
  return [...entries].filter((e) => e.active).sort((a, b) => b.confidenceBonus - a.confidenceBonus);
}

/** Active corrections that CorrectionApplied telemetry never once referenced. */
export function unusedCorrections(entries, telemetry) {
  const appliedIds = new Set(telemetry.filter((t) => t.type === "CorrectionApplied").map((t) => t.data.id));
  return entries.filter((e) => e.active && !appliedIds.has(e.id));
}

export function conflictingCorrections(telemetry) {
  return telemetry.filter((t) => t.type === "CorrectionConflict");
}

/** Histogram of confidenceBonus values across active entries. */
export function correctionBonusDistribution(entries) {
  const dist = {};
  for (const e of entries) if (e.active) dist[e.confidenceBonus] = (dist[e.confidenceBonus] || 0) + 1;
  return dist;
}

/** @param {import('../correction-memory/types.mjs').ScoreBreakdown[]} breakdowns */
export function averageScoreBreakdown(breakdowns) {
  if (breakdowns.length === 0) return null;
  const sum = { baseMatch: 0, aliasScore: 0, contextScore: 0, correctionBonus: 0, organizationBonus: 0, recencyBonus: 0, total: 0 };
  for (const b of breakdowns) for (const k of Object.keys(sum)) sum[k] += b[k] || 0;
  const avg = {};
  for (const k of Object.keys(sum)) avg[k] = sum[k] / breakdowns.length;
  return avg;
}

/**
 * Fraction of ranking decisions where the top-ranked candidate was NOT
 * what the user actually confirmed.
 * @param {import('../ranking-engine/types.mjs').RankingDecision[]} decisions
 */
export function falseCandidateRate(decisions) {
  if (decisions.length === 0) return null;
  return decisions.filter((d) => !d.userAcceptedTop).length / decisions.length;
}

/** Inverse of falseCandidateRate, stated as its own metric so a dashboard can show "accuracy" directly. */
export function rankingAccuracy(decisions) {
  const rate = falseCandidateRate(decisions);
  return rate === null ? null : 1 - rate;
}
