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

/** @param {number} count @returns {number} */
export function bonusForCount(count) {
  let bonus = 0;
  for (const t of CORRECTION_BONUS_THRESHOLDS) if (count >= t.minCount) bonus = t.bonus;
  return Math.min(bonus, MAX_CORRECTION_BONUS);
}
