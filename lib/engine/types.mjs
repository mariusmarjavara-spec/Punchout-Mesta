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
 * @property {{ruleId: string, factKey: string}[]} explanation  - "why is this shown" — every (rule, fact) pair that justified it, never just a bare flag
 * @property {string} [providerId]    - resolved via CapabilityBinding when target matches a known capability (lib/runtime/types.mjs); absent for plain task targets, per Phase 6's finding that not every target is a capability
 * @property {string} [label]         - Phase 8 audit finding: nothing produced human-readable prompt text before this — resolved from Runtime.promptLabels (lib/runtime/types.mjs), falls back to "kind:target" when an organization hasn't configured one
 */

export {};
