/**
 * @typedef {Object} RankingContext
 * @property {import('../correction-memory/types.mjs').CorrectionCategory} category
 * @property {string} originalValue
 * @property {string} userId
 * @property {string} organizationId
 * @property {Array<{id:string, externalKey:string, canonicalKey:string, system:string}>} [aliases]  - Runtime aliases (lib/runtime/types.mjs Alias, matched by externalKey)
 * @property {string[]} [todaysConfirmedValues]  - same-day, already-confirmed values in THIS dayLog only — the deterministic basis for RecencyBonus
 *
 * @typedef {Object} RankingDecision
 *   One completed ranking event, recorded by the caller (not this
 *   module) once the outcome is known — the basis for Del 7/8's
 *   Operations Center analyses (false-candidate rate, ranking
 *   accuracy). Not produced automatically; there is no live wiring
 *   into motor.js this phase, same posture as Correction Memory in
 *   Phase 6.6.
 * @property {string} category
 * @property {string} originalValue
 * @property {string} topCandidate
 * @property {number} topScore
 * @property {boolean} userAcceptedTop
 * @property {string} [correctedTo]
 */

export {};
