/**
 * Phase 9 Del 7: Runtime/schema-focused Operations Center analyses.
 * Goal stated explicitly in the brief: help the product team improve
 * Runtime, not code. Every function here is read-only over telemetry
 * and a compiled Runtime — none of them can change a schema, a rule, or
 * a field.
 */

/** Count of SchemaCompleted+SchemaSkipped events per schemaType, sorted descending — "Most/Least Used Schemas" is the same list read from either end. */
export function schemaUsageFrequency(telemetry) {
  const counts = {};
  for (const t of telemetry) {
    if (t.type === "SchemaCompleted" || t.type === "SchemaSkipped") {
      const key = t.data.schemaType || "(unknown)";
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([schemaType, count]) => ({ schemaType, count }));
}

/** Fields declared in a schema that never appear non-empty across a sample of filled instances — a field nobody fills is either mis-required or genuinely dead. */
export function unusedFields(schema, filledInstancesFields) {
  const declared = Object.keys(schema.fields);
  const everFilled = new Set();
  for (const fields of filledInstancesFields) {
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined && v !== "") everFilled.add(k);
    }
  }
  return declared.filter((k) => !everFilled.has(k));
}

/** How often compileRuntime() has rejected a candidate Runtime, and why — a product signal that package authoring is error-prone for this organization, not just a one-off mistake. */
export function validationFailureRate(compileAttempts) {
  if (compileAttempts.length === 0) return null;
  const failed = compileAttempts.filter((a) => !a.valid);
  const errorFrequency = {};
  for (const a of failed) for (const e of a.errors) errorFrequency[e] = (errorFrequency[e] || 0) + 1;
  return { attempts: compileAttempts.length, failed: failed.length, rate: failed.length / compileAttempts.length, mostCommonErrors: Object.entries(errorFrequency).sort((a, b) => b[1] - a[1]).slice(0, 5) };
}

/** Accept-vs-dismiss rate per prompt label — "Prompt Effectiveness". Reuses the same PromptAccepted/Dismissed+SchemaCompleted/Skipped taxonomy already in lib/operations-center/metrics.mjs, grouped by label instead of raw target. */
export function promptEffectiveness(telemetry, promptLabels) {
  const outcomes = {};
  for (const t of telemetry) {
    const isAccept = t.type === "PromptAccepted" || t.type === "SchemaCompleted";
    const isDismiss = t.type === "PromptDismissed" || t.type === "SchemaSkipped";
    if (!isAccept && !isDismiss) continue;
    const target = t.data.schemaType || t.data.id;
    const label = promptLabels[target] || target;
    outcomes[label] = outcomes[label] || { accepted: 0, dismissed: 0 };
    if (isAccept) outcomes[label].accepted++; else outcomes[label].dismissed++;
  }
  return Object.entries(outcomes).map(([label, { accepted, dismissed }]) => ({ label, accepted, dismissed, effectiveness: accepted + dismissed ? accepted / (accepted + dismissed) : null }));
}

/** Structural comparison of what two organizations' Runtimes actually declare — not a diff of one org over time (lib/runtime/diff.mjs already does that), a snapshot comparison across organizations. */
export function organizationDifferences(runtimeA, runtimeB) {
  const setDiff = (a, b) => ({ onlyInA: a.filter((x) => !b.includes(x)), onlyInB: b.filter((x) => !a.includes(x)), shared: a.filter((x) => b.includes(x)) });
  return {
    organizations: [runtimeA.organizationId, runtimeB.organizationId],
    schemaTypes: setDiff(runtimeA.schemas.map((s) => s.schemaType), runtimeB.schemas.map((s) => s.schemaType)),
    machineTypes: setDiff(runtimeA.knowledgeGraph.machineTypes.map((m) => m.id), runtimeB.knowledgeGraph.machineTypes.map((m) => m.id)),
    capabilities: setDiff(runtimeA.capabilities.map((c) => c.capability), runtimeB.capabilities.map((c) => c.capability)),
    rankingWeightsDiffer: JSON.stringify(runtimeA.rankingWeights) !== JSON.stringify(runtimeB.rankingWeights),
  };
}
