/**
 * Runtime Compiler — takes every raw organization input and produces one
 * versioned, internally-consistent OrganizationRuntime. Pure function:
 * same input always produces the same runtime (same checksum) — this is
 * asserted, not just claimed, in lib/runtime/dry-run.mjs.
 *
 * Reuses Phase 4's parseSchemaDocument/sanitizeSchemaDocument and Phase
 * 3's toRuntimeConfig unchanged — the compiler adds cross-reference
 * validation and assembly, it does not reimplement per-schema checks.
 */
import { parseSchemaDocument, sanitizeSchemaDocument } from "../organization/schema-format.mjs";
import { toRuntimeConfig } from "../organization/types.mjs";
import { CONDITION_OPERATORS, TRIGGER_EVENTS, ACTION_TYPES } from "../rules/types.mjs";
import { ENGINE_SAFETY_CEILING } from "../ranking-engine/score.mjs";

/**
 * Default capability-kind expectations. Phase 8 audit finding: this
 * used to be a hardcoded, unconditional table (EXPECTED_PROVIDER_KIND).
 * Now organization-suppliable via RuntimeCompilerInput.
 * capabilityKindExpectations — an org can extend or override any entry;
 * this is only the fallback for organizations that don't.
 */
const DEFAULT_CAPABILITY_KIND_EXPECTATIONS = {
  sja: "schema",
  ruh: "schema",
  machine_check: "schema",
  orders: "dataset",
  timekeeping: "dataset",
  external_instruction: "link",
};

/** Detect a cycle in the alias graph (externalKey -> canonicalKey), per system. @returns {string[]} error messages */
function findAliasCycles(aliases) {
  const errors = [];
  const bySystem = new Map();
  for (const a of aliases) {
    if (!bySystem.has(a.system)) bySystem.set(a.system, new Map());
    bySystem.get(a.system).set(a.externalKey, a.canonicalKey);
  }
  for (const [system, edges] of bySystem) {
    for (const start of edges.keys()) {
      const path = [];
      const onPath = new Set();
      let node = start;
      while (edges.has(node)) {
        if (onPath.has(node)) {
          errors.push(`alias cycle in system "${system}": ${[...path, node].join(" -> ")}`);
          break;
        }
        onPath.add(node);
        path.push(node);
        node = edges.get(node);
      }
    }
  }
  return [...new Set(errors)];
}

/** @param {import('../rules/types.mjs').Rule} rule @returns {string[]} */
function validateRule(rule) {
  const errors = [];
  if (!TRIGGER_EVENTS.includes(rule.trigger.event)) errors.push(`rule ${rule.id}: unknown trigger.event "${rule.trigger.event}"`);
  if (!ACTION_TYPES.includes(rule.action.type)) errors.push(`rule ${rule.id}: unknown action.type "${rule.action.type}"`);
  for (const c of rule.conditions) {
    if (!CONDITION_OPERATORS.includes(c.operator)) errors.push(`rule ${rule.id}: unknown condition operator "${c.operator}"`);
  }
  return errors;
}

/** Deterministic non-cryptographic checksum (djb2 over stable JSON). Foundation-phase mock — a real backend would use sha256. */
function checksumOf(value) {
  const s = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash + s.charCodeAt(i)) >>> 0;
  return "djb2_" + hash.toString(16);
}

/**
 * @param {import('./types.mjs').RuntimeCompilerInput} input
 * @param {{runtimeVersion: number}} publishContext
 * @returns {{valid: boolean, errors: string[], runtime: import('./types.mjs').OrganizationRuntime|null}}
 */
export function compileRuntime(input, publishContext) {
  const errors = [];

  // Per-schema structural validation + autofill sanitization (Phase 4, reused).
  const sanitizedSchemas = [];
  for (const raw of input.schemas) {
    const parsed = parseSchemaDocument(raw);
    if (!parsed.valid) {
      errors.push(...parsed.errors.map((e) => `schema ${raw.schemaType ?? "?"}: ${e}`));
      continue;
    }
    sanitizedSchemas.push(sanitizeSchemaDocument(parsed.document).document);
  }
  const knownSchemaTypes = new Set(sanitizedSchemas.map((s) => s.schemaType));

  // Per-rule structural validation + "skjema mangler".
  for (const rule of input.rules) {
    errors.push(...validateRule(rule));
    for (const st of rule.affects.schemaTypes || []) {
      if (!knownSchemaTypes.has(st)) errors.push(`rule ${rule.id}: affects unknown schemaType "${st}"`);
    }
  }

  // Capabilities: "peker til ukjent provider" + kind compatibility.
  const kindExpectations = { ...DEFAULT_CAPABILITY_KIND_EXPECTATIONS, ...(input.capabilityKindExpectations || {}) };
  const providerById = new Map(input.capabilityProviders.map((p) => [p.id, p]));
  for (const binding of input.capabilityBindings) {
    const provider = providerById.get(binding.providerId);
    if (!provider) {
      errors.push(`capability "${binding.capability}": unknown provider "${binding.providerId}"`);
      continue;
    }
    const expectedKind = kindExpectations[binding.capability];
    if (expectedKind && provider.kind !== expectedKind) {
      errors.push(`capability "${binding.capability}": provider "${binding.providerId}" is kind "${provider.kind}", expected "${expectedKind}"`);
    }
  }

  // Aliases: same (system, externalKey) must never map to two different canonicalKeys, and the graph must not cycle.
  const seenAlias = new Map();
  for (const alias of input.aliases) {
    const key = alias.system + ":" + alias.externalKey;
    const prior = seenAlias.get(key);
    if (prior && prior !== alias.canonicalKey) {
      errors.push(`alias conflict: "${key}" maps to both "${prior}" and "${alias.canonicalKey}"`);
    }
    seenAlias.set(key, alias.canonicalKey);
  }
  errors.push(...findAliasCycles(input.aliases));

  // Ranking weights: reject invalid/out-of-bound values rather than
  // silently clamping — an org that declares something outside the
  // safety ceiling should be told at publish time, not surprised later.
  // lib/ranking-engine/score.mjs clamps anyway as defense-in-depth.
  const rw = input.rankingWeights || {};
  for (const key of ["maxAliasBonus", "maxOrganizationBonus", "maxRecencyBonus", "recencyPerOccurrence"]) {
    const v = rw[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) errors.push(`rankingWeights.${key}: must be a non-negative number, got ${JSON.stringify(v)}`);
    else if (v > ENGINE_SAFETY_CEILING) errors.push(`rankingWeights.${key}: ${v} exceeds engine safety ceiling (${ENGINE_SAFETY_CEILING})`);
  }
  for (const t of rw.correctionBonusThresholds || []) {
    if (typeof t.minCount !== "number" || t.minCount < 0) errors.push(`rankingWeights.correctionBonusThresholds: invalid minCount ${JSON.stringify(t.minCount)}`);
    if (typeof t.bonus !== "number" || t.bonus < 0 || t.bonus > ENGINE_SAFETY_CEILING) errors.push(`rankingWeights.correctionBonusThresholds: bonus ${JSON.stringify(t.bonus)} out of bounds`);
  }

  // Knowledge Graph (Phase 6.7): every edge must resolve to a real node —
  // "no hardcoded domain knowledge if it can be described in Runtime"
  // only holds if the graph itself can't silently reference nothing.
  //
  // Validation Sprint Del 6 finding: the old fallback (`input.knowledgeGraph
  // || {...defaults}`) only protected a completely MISSING knowledgeGraph.
  // knowledge_graph.json is a required package file, so it always exists as
  // SOME object — but a minimal, legitimate org with no machine types (e.g.
  // an office-only pilot) could reasonably omit the `machineTypes` key
  // entirely, leaving the object present but partially shaped. That crashed
  // with a raw "Cannot read properties of undefined (reading 'map')" instead
  // of compiling cleanly or failing with a real validation message. Default
  // each sub-array independently instead of the object as a whole.
  const kg = input.knowledgeGraph || {};
  const kgMachineTypes = kg.machineTypes || [];
  const kgActivities = kg.activities || [];
  const kgOrderTypes = kg.orderTypes || [];
  const machineTypeIds = new Set(kgMachineTypes.map((m) => m.id));
  const activityIds = new Set(kgActivities.map((a) => a.id));
  for (const mt of kgMachineTypes) {
    for (const st of mt.requiredSchemas || []) {
      if (!knownSchemaTypes.has(st)) errors.push(`machineType "${mt.id}": requires unknown schemaType "${st}"`);
    }
  }
  for (const a of kgActivities) {
    for (const mt of a.machineTypes || []) {
      if (!machineTypeIds.has(mt)) errors.push(`activity "${a.id}": references unknown machineType "${mt}"`);
    }
  }
  for (const ot of kgOrderTypes) {
    for (const act of ot.activities || []) {
      if (!activityIds.has(act)) errors.push(`orderType "${ot.id}": references unknown activity "${act}"`);
    }
  }

  if (errors.length > 0) return { valid: false, errors, runtime: null };

  const runtimeCore = {
    organizationId: input.organizationContext.organizationId,
    runtimeConfig: toRuntimeConfig(input.organizationContext),
    schemas: sanitizedSchemas,
    rules: input.rules,
    capabilities: input.capabilityBindings,
    aliases: input.aliases,
    orders: input.organizationContext.orders,
    machines: input.organizationContext.machines,
    knowledgeGraph: kg,
    preferredCandidates: input.preferredCandidates || [],
    rankingWeights: rw,
    capabilityKindExpectations: kindExpectations,
    promptLabels: input.promptLabels || {},
    extractionPatterns: input.extractionPatterns || {},
    extractionVocabularies: input.extractionVocabularies || {},
  };

  /** @type {import('./types.mjs').OrganizationRuntime} */
  const runtime = {
    runtimeVersion: publishContext.runtimeVersion,
    compiledAt: new Date().toISOString(),
    checksum: checksumOf(runtimeCore),
    ...runtimeCore,
  };

  return { valid: true, errors: [], runtime };
}
