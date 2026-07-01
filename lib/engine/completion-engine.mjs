/**
 * buildPromptQueue() — Facts -> Capabilities -> Rule Evaluation ->
 * Required Actions -> Priority -> Prompt Queue. Reuses
 * lib/rules/evaluate.mjs unchanged; adds fact->trigger wiring, capability
 * resolution, dedup/sort, and an explanation trail per item (Del 3: the
 * engine must say why each item is shown, never just show it).
 */
import { resolveMatchingRules } from "../rules/evaluate.mjs";

/**
 * @param {import('./types.mjs').Fact[]} facts
 * @param {import('../rules/types.mjs').Rule[]} rules
 * @param {import('../runtime/types.mjs').CapabilityBinding[]} [capabilityBindings]
 * @param {Date} [now]
 * @returns {import('./types.mjs').PromptQueueItem[]}
 */
export function buildPromptQueue(facts, rules, capabilityBindings = [], now = new Date()) {
  // Flat key->value context for condition evaluation. If multiple facts
  // share a key, last one wins — called out, not silently arbitrary.
  const context = {};
  for (const fact of facts) context[fact.key] = fact.value;

  const uniqueKeys = [...new Set(facts.map((f) => f.key))];
  const bindingByCapability = new Map(capabilityBindings.map((b) => [b.capability, b]));

  /** @type {{ruleId: string, factKey: string, action: import('../rules/types.mjs').RuleAction, priority: number}[]} */
  const required = [];
  for (const factKey of uniqueKeys) {
    const matched = resolveMatchingRules(rules, { event: "factObserved", factKey }, context, now);
    for (const rule of matched) required.push({ ruleId: rule.id, factKey, action: rule.action, priority: rule.priority });
  }

  /** @type {Map<string, import('./types.mjs').PromptQueueItem>} */
  const byId = new Map();
  for (const req of required) {
    const id = req.action.type + ":" + req.action.target;
    const binding = bindingByCapability.get(req.action.target);
    const existing = byId.get(id);
    if (existing) {
      existing.priority = Math.max(existing.priority, req.priority);
      existing.triggeredByRuleIds.push(req.ruleId);
      existing.explanation.push({ ruleId: req.ruleId, factKey: req.factKey });
    } else {
      byId.set(id, {
        id,
        kind: req.action.type,
        target: req.action.target,
        priority: req.priority,
        triggeredByRuleIds: [req.ruleId],
        explanation: [{ ruleId: req.ruleId, factKey: req.factKey }],
        providerId: binding ? binding.providerId : undefined,
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.priority - a.priority);
}
