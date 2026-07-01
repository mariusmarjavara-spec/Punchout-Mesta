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

/**
 * Kind a capability conceptually needs from its provider, for the known
 * example set only — unknown capability keys skip this check (an
 * organization-defined capability has no built-in expectation).
 */
const EXPECTED_PROVIDER_KIND = {
  sja: "schema",
  ruh: "schema",
  machine_check: "schema",
  orders: "dataset",
  timekeeping: "dataset",
  external_instruction: "link",
};

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
  const providerById = new Map(input.capabilityProviders.map((p) => [p.id, p]));
  for (const binding of input.capabilityBindings) {
    const provider = providerById.get(binding.providerId);
    if (!provider) {
      errors.push(`capability "${binding.capability}": unknown provider "${binding.providerId}"`);
      continue;
    }
    const expectedKind = EXPECTED_PROVIDER_KIND[binding.capability];
    if (expectedKind && provider.kind !== expectedKind) {
      errors.push(`capability "${binding.capability}": provider "${binding.providerId}" is kind "${provider.kind}", expected "${expectedKind}"`);
    }
  }

  // Aliases: same (system, externalKey) must never map to two different canonicalKeys.
  const seenAlias = new Map();
  for (const alias of input.aliases) {
    const key = alias.system + ":" + alias.externalKey;
    const prior = seenAlias.get(key);
    if (prior && prior !== alias.canonicalKey) {
      errors.push(`alias conflict: "${key}" maps to both "${prior}" and "${alias.canonicalKey}"`);
    }
    seenAlias.set(key, alias.canonicalKey);
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
