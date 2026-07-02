/**
 * Confidence Bonus model (Del 8) — an explicit, auditable step table,
 * not a curve fitted to the four illustrative points (1->2, 3->6,
 * 5->10, 10->15, max->20). A lookup table is the more robust choice
 * here, not a shortcut: (1) it reproduces the given examples exactly,
 * with no fitting error to explain away; (2) it's inspectable by
 * reading five numbers, not by understanding a formula's asymptotics;
 * (3) a human can retune one threshold without touching code, same
 * "data, not logic" posture as Rules and Schema field definitions
 * elsewhere in this platform; (4) monotonic-non-decreasing and hard-
 * capped are both structurally obvious from the table, not something
 * that has to be proven about a formula.
 */
export const CORRECTION_BONUS_THRESHOLDS = [
  { minCount: 1, bonus: 2 },
  { minCount: 3, bonus: 6 },
  { minCount: 5, bonus: 10 },
  { minCount: 10, bonus: 15 },
  { minCount: 20, bonus: 20 },
];
export const MAX_CORRECTION_BONUS = 20;

/**
 * Phase 8: the threshold TABLE is Runtime-tunable (an organization may
 * want trust to build faster or slower) — passed in per
 * CorrectionMemoryStore instance. MAX_CORRECTION_BONUS is NOT tunable:
 * it is the engine safety ceiling every table gets clamped against
 * regardless of what a Runtime declares, same posture as
 * lib/ranking-engine/score.mjs's ENGINE_SAFETY_CEILING.
 * @param {number} count
 * @param {{minCount:number, bonus:number}[]} [thresholds]
 * @returns {number}
 */
export function bonusForCount(count, thresholds = CORRECTION_BONUS_THRESHOLDS) {
  let bonus = 0;
  for (const t of thresholds) if (count >= t.minCount) bonus = t.bonus;
  return Math.min(bonus, MAX_CORRECTION_BONUS);
}
