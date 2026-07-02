/**
 * Ranking Engine — the ONLY component that ranks. Never creates
 * candidates (lib/ranking-engine/candidates.mjs does that); never
 * decides what "context" means for a category (the caller supplies
 * contextScore per candidate — e.g. "is this order active today" for
 * orders, a Knowledge Graph signal for machines — Ranking Engine only
 * composes the sum, it stays domain-agnostic).
 *
 * FinalScore = BaseMatch + AliasScore + ContextScore + CorrectionBonus
 *            + OrganizationBonus + RecencyBonus
 *
 * Additive (see lib/correction-memory/scoring.mjs for why this diverges
 * from Del 3's literal product notation — same reasoning applies here:
 * a bounded sum can never let a capped bonus override an obviously
 * wrong candidate; an unbounded product could). Every term is capped
 * and every candidate carries a full explanation, always, win or lose.
 */
const MAX_ALIAS_BONUS = 15;
const MAX_ORGANIZATION_BONUS = 5;
const MAX_RECENCY_BONUS = 5;
const RECENCY_PER_OCCURRENCE = 2;

function aliasScoreFor(candidateValue, ctx) {
  const alias = (ctx.aliases || []).find((a) => a.canonicalKey === candidateValue && a.externalKey.toLowerCase() === ctx.originalValue.toLowerCase());
  return alias ? MAX_ALIAS_BONUS : 0;
}

function organizationBonusFor(candidateValue, preferredCandidates, ctx) {
  const pref = (preferredCandidates || []).find((p) => p.category === ctx.category && p.value === candidateValue);
  return pref ? Math.min(MAX_ORGANIZATION_BONUS, pref.bonus) : 0;
}

function recencyBonusFor(candidateValue, ctx) {
  const count = (ctx.todaysConfirmedValues || []).filter((v) => v === candidateValue).length;
  return Math.min(MAX_RECENCY_BONUS, count * RECENCY_PER_OCCURRENCE);
}

/**
 * @param {{value: string, baseMatch: number, contextScore?: number}[]} candidates
 * @param {import('../correction-memory/store.mjs').CorrectionMemoryStore} correctionStore
 * @param {import('../runtime/types.mjs').PreferredCandidate[]} preferredCandidates
 * @param {import('./types.mjs').RankingContext} ctx
 * @returns {(import('../correction-memory/types.mjs').ScoreBreakdown & {organizationBonus: number, recencyBonus: number})[]}
 */
export function rankCandidates(candidates, correctionStore, preferredCandidates, ctx) {
  const correction = correctionStore.findActive(ctx.category, ctx.originalValue, ctx.userId, ctx.organizationId);

  const results = candidates.map((c) => {
    const aliasScore = aliasScoreFor(c.value, ctx);
    const contextScore = c.contextScore || 0;
    const correctionBonus = correction && correction.correctedValue === c.value ? correction.confidenceBonus : 0;
    const organizationBonus = organizationBonusFor(c.value, preferredCandidates, ctx);
    const recencyBonus = recencyBonusFor(c.value, ctx);
    const total = c.baseMatch + aliasScore + contextScore + correctionBonus + organizationBonus + recencyBonus;
    return {
      value: c.value, baseMatch: c.baseMatch, aliasScore, contextScore, correctionBonus, organizationBonus, recencyBonus, total,
      explanation: [
        "Base Match: " + c.baseMatch,
        "Alias: +" + aliasScore,
        "Context: +" + contextScore,
        "Correction Memory: +" + correctionBonus,
        "Organization: +" + organizationBonus,
        "Recency: +" + recencyBonus,
        "Total: " + total,
      ],
    };
  });
  results.sort((a, b) => b.total - a.total);

  if (correction) {
    const applicable = candidates.some((c) => c.value === correction.correctedValue);
    correctionStore.emit(applicable ? "CorrectionApplied" : "CorrectionIgnored", ctx.organizationId, { id: correction.id, category: ctx.category, originalValue: ctx.originalValue });
  }
  return results;
}
