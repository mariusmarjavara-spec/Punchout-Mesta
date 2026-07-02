/**
 * loadOrganizationPackage(dir) — reads a package directory, cross-checks
 * validation.json against actual file contents, and returns a
 * RuntimeCompilerInput ready for compileRuntime(). Fails loudly (throws)
 * on a missing required file or a validation.json mismatch — never
 * partially loads a package (Phase 3: "Every package should either be
 * Valid or Rejected. Never partially accepted" — enforced here at load
 * time, before compileRuntime() even runs its own cross-reference pass).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REQUIRED_FILES = ["runtime.json", "aliases.json", "knowledge_graph.json", "schemas.json"];
const OPTIONAL_FILES = ["prompts.json", "validation.json", "corrections.json"];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * @param {string} dir
 * @returns {{input: import('../runtime/types.mjs').RuntimeCompilerInput, promptLabels: Record<string,string>, correctionFixtures: import('./types.mjs').CorrectionFixture[]}}
 */
export function loadOrganizationPackage(dir) {
  for (const f of REQUIRED_FILES) {
    if (!existsSync(join(dir, f))) throw new Error(`Organization package at "${dir}" is missing required file "${f}" — package rejected, not partially loaded.`);
  }

  const runtime = readJson(join(dir, "runtime.json"));
  const aliases = readJson(join(dir, "aliases.json"));
  const knowledgeGraph = readJson(join(dir, "knowledge_graph.json"));
  const schemas = readJson(join(dir, "schemas.json"));
  const prompts = existsSync(join(dir, "prompts.json")) ? readJson(join(dir, "prompts.json")) : {};
  const validation = existsSync(join(dir, "validation.json")) ? readJson(join(dir, "validation.json")) : null;
  const correctionFixtures = existsSync(join(dir, "corrections.json")) ? readJson(join(dir, "corrections.json")) : [];

  if (validation) {
    const mismatches = [];
    if (validation.expectedSchemaCount !== undefined && validation.expectedSchemaCount !== schemas.length) {
      mismatches.push(`schemas.json has ${schemas.length} entries, validation.json declares ${validation.expectedSchemaCount}`);
    }
    if (validation.expectedActivityCount !== undefined && validation.expectedActivityCount !== knowledgeGraph.activities.length) {
      mismatches.push(`knowledge_graph.json has ${knowledgeGraph.activities.length} activities, validation.json declares ${validation.expectedActivityCount}`);
    }
    if (validation.expectedMachineTypeCount !== undefined && validation.expectedMachineTypeCount !== knowledgeGraph.machineTypes.length) {
      mismatches.push(`knowledge_graph.json has ${knowledgeGraph.machineTypes.length} machineTypes, validation.json declares ${validation.expectedMachineTypeCount}`);
    }
    if (mismatches.length > 0) {
      throw new Error(`Organization package at "${dir}" failed its own validation.json manifest:\n  ` + mismatches.join("\n  "));
    }
  }

  /** @type {import('../runtime/types.mjs').RuntimeCompilerInput} */
  const input = {
    organizationContext: {
      organizationId: runtime.organizationId,
      name: runtime.name,
      orders: runtime.orders || [],
      machines: runtime.machines || [],
      vehicles: runtime.vehicles || [],
      wageCodes: runtime.wageCodes || [],
      procedures: runtime.procedures || [],
      externalLinks: runtime.externalLinks || [],
      sjaDefaults: runtime.sjaDefaults || null,
    },
    schemas,
    rules: runtime.rules || [],
    capabilityProviders: runtime.capabilityProviders || [],
    capabilityBindings: runtime.capabilityBindings || [],
    aliases,
    knowledgeGraph,
    preferredCandidates: runtime.preferredCandidates || [],
    rankingWeights: runtime.rankingWeights || {},
    capabilityKindExpectations: runtime.capabilityKindExpectations || {},
    promptLabels: prompts,
    extractionPatterns: runtime.extractionPatterns || {},
    extractionVocabularies: runtime.extractionVocabularies || {},
  };

  return { input, promptLabels: prompts, correctionFixtures };
}
