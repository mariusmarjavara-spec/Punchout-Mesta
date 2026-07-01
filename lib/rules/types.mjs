/**
 * Rule contract — data, not code. This is the foundation for the
 * deterministic rule engine, not the engine itself: this phase defines
 * the shape and one pure evaluator (lib/rules/evaluate.mjs), nothing
 * executes an action yet. Motor keeps owning rules; this contract is
 * what lets rule DATA eventually replace the `when(ctx)` JS functions
 * that live in motor.js's ADMIN_CONFIG today (requiredSchemas/
 * conditionalSchemas) without motor losing ownership of what they mean.
 *
 * @typedef {Object} RuleTrigger
 * @property {"entrySubmitted"|"dayStarted"|"dayPhaseChanged"|"schemaConfirmed"|"factObserved"} event
 * @property {string} [entryType]    - narrows entrySubmitted, e.g. "hendelse"
 * @property {string} [schemaType]   - narrows schemaConfirmed
 * @property {string} [factKey]      - narrows factObserved (see lib/engine/types.mjs); added Phase 5
 *
 * @typedef {"equals"|"notEquals"|"in"|"between"|"gte"|"lte"|"exists"} ConditionOperator
 *   Deliberately closed and small — no free-form expressions, no eval().
 *   A rule is untrusted, organization-submitted data; the operator set is
 *   the only thing standing between that and arbitrary code execution.
 *   New comparisons are added as a new operator string handled by
 *   evaluate.mjs, never by letting the rule carry code.
 *
 * @typedef {Object} RuleCondition
 * @property {string} field          - dot-path into the evaluation context, e.g. "isWinter", "hour"
 * @property {ConditionOperator} operator
 * @property {*} [value]
 *
 * @typedef {Object} RuleAction
 * @property {"requireSchema"|"suggestTask"|"requireField"|"flagUnresolved"} type
 * @property {string} target         - schemaType, taskId, or field key depending on type
 * @property {Record<string, unknown>} [params]
 *
 * @typedef {Object} Rule
 * @property {string} id
 * @property {number} version
 * @property {string} effectiveFrom  - same staging pattern as SchemaRegistryEntry
 * @property {RuleTrigger} trigger
 * @property {RuleCondition[]} conditions  - implicit AND; no OR/nesting in this phase, kept closed on purpose
 * @property {RuleAction} action
 * @property {number} priority       - higher fires/displays first when multiple rules share a trigger
 * @property {{schemaTypes?: string[], taskIds?: string[]}} affects
 */

export {};
