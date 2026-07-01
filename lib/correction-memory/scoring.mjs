/**
 * Scoring model (Del 3). The prompt's Del 3 formula is written as a
 * product (BaseMatch x AliasScore x ContextScore x CorrectionBonus),
 * but Del 5's own worked example (Base 67, Alias +15, Correction +12,
 * Total 94) is arithmetically additive: 67+15+12=94, not a product —
 * a product of those numbers would be over 10,000. Implemented as
 * additive, matching the worked example exactly. Additive is also the
 * only version consistent with the invariant Del 3 itself demands
 * ("systemet skal aldri kunne overstyre en åpenbart feil kandidat"): a
 * bounded +0..20 addition can never flip a bad candidate (score near 0)
 * ahead of a good one (score near 100) once the gap exceeds 20; an
 * unbounded multiplicative factor could.
 *
 * Correction lookup never mutates the store — count only grows via
 * store.recordCorrection() (an explicit user action). Ranking only
 * emits CorrectionApplied/CorrectionIgnored, both read-only telemetry.
 */

/**
 * @param {string[]} candidates
 * @param {Record<string, {baseMatch: number, aliasScore: number, contextScore: number}>} baseScoresByValue
 * @param {import('./store.mjs').CorrectionMemoryStore} store
 * @param {{category: import('./types.mjs').CorrectionCategory, originalValue: string, userId: string, organizationId: string}} ctx
 * @returns {import('./types.mjs').ScoreBreakdown[]}
 */
export function rankCandidates(candidates, baseScoresByValue, store, ctx) {
  const correction = store.findActive(ctx.category, ctx.originalValue, ctx.userId, ctx.organizationId);

  const results = candidates.map((value) => {
    const base = baseScoresByValue[value] || { baseMatch: 0, aliasScore: 0, contextScore: 0 };
    const bonus = correction && correction.correctedValue === value ? correction.confidenceBonus : 0;
    const total = base.baseMatch + base.aliasScore + base.contextScore + bonus;
    return {
      value,
      baseMatch: base.baseMatch,
      aliasScore: base.aliasScore,
      contextScore: base.contextScore,
      correctionBonus: bonus,
      total,
      explanation: [
        "Base Match: " + base.baseMatch,
        "Alias: +" + base.aliasScore,
        "Context: +" + base.contextScore,
        "Correction Memory: +" + bonus,
        "Total: " + total,
      ],
    };
  });
  results.sort((a, b) => b.total - a.total);

  if (correction) {
    const applicable = candidates.includes(correction.correctedValue);
    store.emit(applicable ? "CorrectionApplied" : "CorrectionIgnored", ctx.organizationId, { id: correction.id, category: ctx.category, originalValue: ctx.originalValue });
  }

  return results;
}
