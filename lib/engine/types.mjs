/**
 * Operational Completion Engine — the pipeline that answers "what's
 * missing before the workday is complete?":
 *
 *   Observation -> Facts -> Rule Evaluation -> Required Actions
 *   -> Priority -> Prompt Queue -> User
 *
 * Everything here is pure data and pure functions. No AI, no heuristic
 * scoring, no probability. deriveFacts() (lib/engine/facts.mjs) uses the
 * same closed keyword/regex technique motor.js's orchestrateEntry()
 * already uses today — this phase generalizes that technique into an
 * explicit intermediate Fact representation, it does not replace it or
 * add a smarter/fuzzier layer on top.
 *
 * @typedef {Object} Fact
 *   A single deterministically-derived piece of structured knowledge
 *   about the day. No confidence score, no probability — a Fact is
 *   either derived or it isn't; there is no "maybe".
 * @property {string} key             - e.g. "hoursWorked", "machineUsed", "incidentReported", "fuelConcern", "unresolvedLocation"
 * @property {*} value
 * @property {number} [sourceEntryIndex]  - traceability only, never re-interpreted
 *
 * @typedef {Object} RequiredAction
 * @property {string} ruleId
 * @property {import('../rules/types.mjs').RuleAction} action
 * @property {number} priority
 *
 * @typedef {Object} PromptQueueItem
 *   What HandrensPhase/getUnresolvedItems() in motor.js already renders
 *   today, generalized: this is that same flat list, now produced from
 *   Rule data instead of hardcoded motor.js branches.
 * @property {string} id              - action.type + ":" + action.target — stable across re-evaluation so the queue doesn't reshuffle identity
 * @property {string} kind            - action.type
 * @property {string} target
 * @property {number} priority
 * @property {string[]} triggeredByRuleIds  - dedup: multiple rules can independently justify the same queue item
 */

export {};
