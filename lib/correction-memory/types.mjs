/**
 * Correction Memory — deterministic experience from explicit user
 * decisions, never inference. Describes the USER, not the organization;
 * kept structurally separate from Runtime (lib/runtime/) on purpose
 * (Del 6): Runtime is compiled from what the organization publishes,
 * Correction Memory only ever grows from what one user explicitly typed
 * "no, I meant X" to. Nothing here can change a Rule, a Schema, an
 * Alias, or dayLog — it can only nudge which candidate is listed first.
 *
 * @typedef {"order"|"machine"|"vehicle"|"location"|"activity"|"wageCode"|"person"|"generic"} CorrectionCategory
 *   Corrections never cross categories — "Volvo" as a machine and
 *   "Volvo" as a supplier are two independent entries; category is part
 *   of the lookup key, never inferred.
 *
 * @typedef {Object} CorrectionEntry
 * @property {string} id
 * @property {CorrectionCategory} category
 * @property {string} originalValue     - what was observed/suggested
 * @property {string} correctedValue    - what the user explicitly chose instead
 * @property {string} userId
 * @property {string} organizationId
 * @property {number} count             - explicit correction actions only; never incremented by scoring/lookup use (see CorrectionApplied)
 * @property {string} createdAt
 * @property {string} lastUsedAt
 * @property {number} confidenceBonus   - cached bonusForCount(count), 0-20, see bonus.mjs
 * @property {boolean} active           - false once superseded by a conflicting correction or expired
 *
 * @typedef {Object} ScoreBreakdown
 * @property {string} value
 * @property {number} baseMatch
 * @property {number} aliasScore
 * @property {number} contextScore
 * @property {number} correctionBonus
 * @property {number} total
 * @property {string[]} explanation
 */

export {};
