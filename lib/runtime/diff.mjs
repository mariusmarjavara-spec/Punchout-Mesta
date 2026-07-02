/**
 * Phase 6: Runtime Diff Engine. Deterministic structural diff between
 * two compiled OrganizationRuntime objects — set comparison by id plus
 * JSON-equality per changed item. No AI summarization: every entry
 * traces to an exact id and an exact field, always reproducible.
 */
function diffById(before, after, idFn) {
  const beforeById = new Map(before.map((x) => [idFn(x), x]));
  const afterById = new Map(after.map((x) => [idFn(x), x]));
  const added = [...afterById.keys()].filter((id) => !beforeById.has(id));
  const removed = [...beforeById.keys()].filter((id) => !afterById.has(id));
  const changed = [...afterById.keys()]
    .filter((id) => beforeById.has(id) && JSON.stringify(beforeById.get(id)) !== JSON.stringify(afterById.get(id)))
    .map((id) => ({ id, before: beforeById.get(id), after: afterById.get(id) }));
  return { added, removed, changed };
}

/**
 * @param {import('./types.mjs').OrganizationRuntime} a
 * @param {import('./types.mjs').OrganizationRuntime} b
 * @returns {{
 *   versions: {from: number, to: number},
 *   rules: ReturnType<typeof diffById>,
 *   aliases: ReturnType<typeof diffById>,
 *   schemas: ReturnType<typeof diffById>,
 *   capabilities: ReturnType<typeof diffById>,
 *   rankingWeightsChanged: boolean,
 *   operationalImpact: string[]
 * }}
 */
export function diffRuntimes(a, b) {
  const rules = diffById(a.rules, b.rules, (r) => r.id);
  const aliases = diffById(a.aliases, b.aliases, (al) => al.system + ":" + al.externalKey);
  const schemas = diffById(a.schemas, b.schemas, (s) => s.schemaType);
  const capabilities = diffById(a.capabilities, b.capabilities, (c) => c.capability);
  const rankingWeightsChanged = JSON.stringify(a.rankingWeights) !== JSON.stringify(b.rankingWeights);

  // Deterministic, factual impact statements — never a prediction, only what structurally changed.
  const operationalImpact = [];
  if (rules.added.length) operationalImpact.push(`${rules.added.length} new rule(s) can now trigger prompts that never appeared before: ${rules.added.join(", ")}`);
  if (rules.removed.length) operationalImpact.push(`${rules.removed.length} rule(s) removed — prompts they produced will stop appearing: ${rules.removed.join(", ")}`);
  const priorityChanges = rules.changed.filter((c) => c.before.priority !== c.after.priority);
  if (priorityChanges.length) operationalImpact.push(`${priorityChanges.length} rule(s) changed priority, affecting Prompt Queue ordering: ${priorityChanges.map((c) => c.id).join(", ")}`);
  if (schemas.changed.some((c) => c.before.version !== c.after.version)) operationalImpact.push("one or more schemas changed version — new instances will pin to the new definition, open days keep the old one");
  if (rankingWeightsChanged) operationalImpact.push("ranking weights changed — candidate ordering for ambiguous observations may shift");

  return { versions: { from: a.runtimeVersion, to: b.runtimeVersion }, rules, aliases, schemas, capabilities, rankingWeightsChanged, operationalImpact };
}
