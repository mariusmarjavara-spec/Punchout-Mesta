/**
 * The one behavior this phase implements: can a Rule's conditions be
 * checked against a context, deterministically and safely, with no
 * arbitrary code execution? Everything else (running this on every
 * trigger, deduping, ordering by priority, actually requiring a schema)
 * is the rule engine itself — out of scope, next phase.
 */

/**
 * @param {Record<string, unknown>} context
 * @param {string} path
 * @returns {unknown}
 */
function getPath(context, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), context);
}

/**
 * @param {import('./types.mjs').RuleCondition} condition
 * @param {Record<string, unknown>} context
 * @returns {boolean}
 */
export function evaluateCondition(condition, context) {
  const actual = getPath(context, condition.field);
  switch (condition.operator) {
    case "equals":
      return actual === condition.value;
    case "notEquals":
      return actual !== condition.value;
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case "between": {
      const [lo, hi] = /** @type {[number, number]} */ (condition.value);
      return typeof actual === "number" && actual >= lo && actual <= hi;
    }
    case "gte":
      return typeof actual === "number" && actual >= /** @type {number} */ (condition.value);
    case "lte":
      return typeof actual === "number" && actual <= /** @type {number} */ (condition.value);
    case "exists":
      return actual !== undefined && actual !== null;
    default:
      // Unknown/future operator: fail closed. A rule with an operator
      // this evaluator doesn't recognize must never fire, not fire by
      // accident — safety property, not an oversight.
      return false;
  }
}

/**
 * @param {import('./types.mjs').Rule} rule
 * @param {Record<string, unknown>} context
 * @returns {boolean}
 */
export function evaluateRule(rule, context) {
  if (rule.conditions.length === 0) return true;
  return rule.conditions.every((c) => evaluateCondition(c, context));
}

/**
 * Filter + sort a rule set down to the ones matching a trigger and
 * currently in effect, highest priority first. Still doesn't execute
 * any action — returns the Rules themselves for the caller to act on.
 *
 * @param {import('./types.mjs').Rule[]} rules
 * @param {import('./types.mjs').RuleTrigger} firedTrigger
 * @param {Record<string, unknown>} context
 * @param {Date} [now]
 * @returns {import('./types.mjs').Rule[]}
 */
export function resolveMatchingRules(rules, firedTrigger, context, now = new Date()) {
  return rules
    .filter((r) => new Date(r.effectiveFrom) <= now)
    .filter((r) => r.trigger.event === firedTrigger.event)
    .filter((r) => (r.trigger.entryType ? r.trigger.entryType === firedTrigger.entryType : true))
    .filter((r) => (r.trigger.schemaType ? r.trigger.schemaType === firedTrigger.schemaType : true))
    .filter((r) => evaluateRule(r, context))
    .sort((a, b) => b.priority - a.priority);
}
