/**
 * Ranking Engine — the ONLY component that ranks. Never creates
 * candidates (lib/ranking-engine/candidates.mjs does that); never
 * decides what "context" means for a category (the caller supplies
 * contextScore per candidate — Ranking Engine stays domain-agnostic).
 *
 * FinalScore = BaseMatch + AliasScore + ContextScore + CorrectionBonus
 *            + OrganizationBonus + RecencyBonus
 *
 * Additive, same reasoning as lib/correction-memory/scoring.mjs.
 *
 * Phase 8 audit finding: the bonus CAPS below used to be hardcoded
 * constants — organization-specific tuning baked into engine code.
 * Now Runtime-configurable (RankingWeights, lib/runtime/types.mjs), but
 * every value is clamped against a fixed ENGINE_SAFETY_CEILING no
 * Runtime can raise. This is the same split already established for
 * schema autofill (lib/organization/schema-format.mjs's
 * LOCKED_NON_AUTOFILL_FIELDS): organizations tune within a boundary,
 * they never get to move the boundary itself — otherwise a careless or
 * malicious Runtime could set a bonus high enough to defeat "a
 * candidate can never be overridden once the base-match gap is large
 * enough", which is a safety property, not a preference.
 */
export const ENGINE_SAFETY_CEILING = 30;
const DEFAULT_WEIGHTS = {
  maxAliasBonus: 15,
  maxOrganizationBonus: 5,
  maxRecencyBonus: 5,
  recencyPerOccurrence: 2,
};

/** @param {import('../runtime/types.mjs').RankingWeights} [weights] */
function resolveWeights(weights) {
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const clamp = (v) => Math.min(v, ENGINE_SAFETY_CEILING);
  return {
    maxAliasBonus: clamp(w.maxAliasBonus),
    maxOrganizationBonus: clamp(w.maxOrganizationBonus),
    maxRecencyBonus: clamp(w.maxRecencyBonus),
    recencyPerOccurrence: clamp(w.recencyPerOccurrence),
  };
}

function aliasScoreFor(candidateValue, ctx, w) {
  const alias = (ctx.aliases || []).find((a) => a.canonicalKey === candidateValue && a.externalKey.toLowerCase() === ctx.originalValue.toLowerCase());
  return alias ? w.maxAliasBonus : 0;
}

function organizationBonusFor(candidateValue, preferredCandidates, ctx, w) {
  const pref = (preferredCandidates || []).find((p) => p.category === ctx.category && p.value === candidateValue);
  return pref ? Math.min(w.maxOrganizationBonus, pref.bonus) : 0;
}

function recencyBonusFor(candidateValue, ctx, w) {
  const count = (ctx.todaysConfirmedValues || []).filter((v) => v === candidateValue).length;
  return Math.min(w.maxRecencyBonus, count * w.recencyPerOccurrence);
}

/**
 * @param {{value: string, baseMatch: number, contextScore?: number}[]} candidates
 * @param {import('../correction-memory/store.mjs').CorrectionMemoryStore} correctionStore
 * @param {import('../runtime/types.mjs').PreferredCandidate[]} preferredCandidates
 * @param {import('./types.mjs').RankingContext} ctx
 * @param {import('../runtime/types.mjs').RankingWeights} [rankingWeights]  - from OrganizationRuntime; defaults used if omitted
 * @returns {(import('../correction-memory/types.mjs').ScoreBreakdown & {organizationBonus: number, recencyBonus: number})[]}
 */
export function rankCandidates(candidates, correctionStore, preferredCandidates, ctx, rankingWeights) {
  const w = resolveWeights(rankingWeights);
  const correction = correctionStore.findActive(ctx.category, ctx.originalValue, ctx.userId, ctx.organizationId);

  const results = candidates.map((c) => {
    const aliasScore = aliasScoreFor(c.value, ctx, w);
    const contextScore = c.contextScore || 0;
    const correctionBonus = correction && correction.correctedValue === c.value ? correction.confidenceBonus : 0;
    const organizationBonus = organizationBonusFor(c.value, preferredCandidates, ctx, w);
    const recencyBonus = recencyBonusFor(c.value, ctx, w);
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
