/**
 * buildPromptQueue() — Rule Evaluation -> Required Actions -> Priority ->
 * Prompt Queue. Reuses lib/rules/evaluate.mjs unchanged; this file only
 * adds the fact->trigger wiring and the dedup/sort step. Still doesn't
 * execute anything against dayLog — the queue is handed to the user
 * (React projection), same as getUnresolvedItems() already is today.
 */
import { resolveMatchingRules } from "../rules/evaluate.mjs";

/**
 * @param {import('./types.mjs').Fact[]} facts
 * @param {import('../rules/types.mjs').Rule[]} rules
 * @param {Date} [now]
 * @returns {import('./types.mjs').PromptQueueItem[]}
 */
export function buildPromptQueue(facts, rules, now = new Date()) {
  // Flat key->value context for condition evaluation. If multiple facts
  // share a key, last one wins — acceptable for this foundation phase,
  // called out rather than silently arbitrary.
  const context = {};
  for (const fact of facts) context[fact.key] = fact.value;

  const uniqueKeys = [...new Set(facts.map((f) => f.key))];

  /** @type {import('./types.mjs').RequiredAction[]} */
  const required = [];
  for (const factKey of uniqueKeys) {
    const matched = resolveMatchingRules(rules, { event: "factObserved", factKey }, context, now);
    for (const rule of matched) {
      required.push({ ruleId: rule.id, action: rule.action, priority: rule.priority });
    }
  }

  /** @type {Map<string, import('./types.mjs').PromptQueueItem>} */
  const byId = new Map();
  for (const req of required) {
    const id = req.action.type + ":" + req.action.target;
    const existing = byId.get(id);
    if (existing) {
      existing.priority = Math.max(existing.priority, req.priority);
      existing.triggeredByRuleIds.push(req.ruleId);
    } else {
      byId.set(id, {
        id,
        kind: req.action.type,
        target: req.action.target,
        priority: req.priority,
        triggeredByRuleIds: [req.ruleId],
      });
    }
  }

  return [...byId.values()].sort((a, b) => b.priority - a.priority);
}
