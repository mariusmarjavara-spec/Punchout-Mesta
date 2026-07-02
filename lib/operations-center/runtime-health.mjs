/**
 * Phase 8 Del 8: Runtime Health. What a compiled Runtime no longer
 * (or never) contributes. Split by what each check actually needs:
 * some are purely structural (no telemetry required — a conflicting
 * rule pair is conflicting regardless of whether it ever ran), others
 * need telemetry to say anything ("never-triggered" is meaningless
 * without an observation window). No AI, no scoring — set membership
 * and equality checks only.
 */

/** Rules whose id never appears in a RuleTriggered event within the given telemetry window. */
export function neverTriggeredRules(runtime, telemetry) {
  const triggeredIds = new Set(telemetry.filter((t) => t.type === "RuleTriggered").map((t) => t.data.ruleId));
  return runtime.rules.filter((r) => !triggeredIds.has(r.id)).map((r) => r.id);
}

/** Alias for neverTriggeredRules, product-facing name matching Del 8's list. */
export function unusedRules(runtime, telemetry) {
  return neverTriggeredRules(runtime, telemetry);
}

/**
 * Structural, not telemetry-based: two rules that share a trigger and
 * an identical condition set but produce DIFFERENT actions — neither
 * is wrong on its own, but together they make the outcome depend on
 * priority tie-breaking that an operator should see explicitly, not
 * discover by accident.
 */
export function conflictingRules(runtime) {
  const conflicts = [];
  const rules = runtime.rules;
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i], b = rules[j];
      const sameTrigger = a.trigger.event === b.trigger.event && a.trigger.factKey === b.trigger.factKey;
      const sameConditions = JSON.stringify(a.conditions) === JSON.stringify(b.conditions);
      const differentAction = JSON.stringify(a.action) !== JSON.stringify(b.action);
      if (sameTrigger && sameConditions && differentAction) conflicts.push({ ruleA: a.id, ruleB: b.id });
    }
  }
  return conflicts;
}

/** Aliases whose canonicalKey never won a ranking (aliasScore > 0 in a surviving decision) within the given decision log. */
export function deadAliases(runtime, decisions) {
  const usedCanonicalKeys = new Set(decisions.filter((d) => d.userAcceptedTop).map((d) => d.topCandidate));
  return runtime.aliases.filter((a) => !usedCanonicalKeys.has(a.canonicalKey));
}

/** Fraction of KnowledgeGraph machine types actually present in the organization's real machine roster — a graph that describes machines nobody has is graph the org forgot to prune. */
export function knowledgeCoverage(runtime) {
  const rosterTypes = new Set(runtime.machines.map((m) => m.type));
  const graphTypes = runtime.knowledgeGraph.machineTypes.map((m) => m.id);
  if (graphTypes.length === 0) return null;
  const covered = graphTypes.filter((t) => rosterTypes.has(t)).length;
  return { covered, total: graphTypes.length, rate: covered / graphTypes.length, uncovered: graphTypes.filter((t) => !rosterTypes.has(t)) };
}

/**
 * Correction Hotspots: (category, originalValue) pairs with the most
 * total correction count — where the Ranking Engine's base signals are
 * weakest and users compensate for it most.
 */
export function correctionHotspots(entries) {
  return [...entries]
    .filter((e) => e.active)
    .sort((a, b) => b.count - a.count)
    .map((e) => ({ category: e.category, originalValue: e.originalValue, count: e.count }));
}

/**
 * Ranking Drift: has the top candidate for the same (category,
 * originalValue) changed between an earlier and a later window of
 * decisions? Purely a factual comparison, not a judgment of good/bad.
 */
export function rankingDrift(earlierDecisions, laterDecisions) {
  const latestByKey = (decisions) => {
    const map = new Map();
    for (const d of decisions) map.set(d.category + ":" + d.originalValue, d.topCandidate);
    return map;
  };
  const earlier = latestByKey(earlierDecisions);
  const later = latestByKey(laterDecisions);
  const drifted = [];
  for (const [key, laterTop] of later) {
    const earlierTop = earlier.get(key);
    if (earlierTop && earlierTop !== laterTop) drifted.push({ key, from: earlierTop, to: laterTop });
  }
  return drifted;
}

/** One-call summary — what Del 8 calls "Runtime Health". */
export function runtimeHealth(runtime, telemetry, decisions = [], correctionEntries = []) {
  return {
    runtimeVersion: runtime.runtimeVersion,
    unusedRules: unusedRules(runtime, telemetry),
    conflictingRules: conflictingRules(runtime),
    deadAliases: deadAliases(runtime, decisions).map((a) => a.canonicalKey),
    knowledgeCoverage: knowledgeCoverage(runtime),
    correctionHotspots: correctionHotspots(correctionEntries).slice(0, 5),
  };
}
