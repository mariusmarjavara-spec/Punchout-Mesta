/**
 * @typedef {Object} Alias
 *   Maps a Punchout-canonical key to an organization/external-system-
 *   specific name, without forcing either side to rename anything.
 *   Generalizes the ad-hoc metadata.sourceSchemaId pattern from Phase 4
 *   into one place the compiler can check for conflicts.
 * @property {string} canonicalKey    - e.g. "sja_preday"
 * @property {string} externalKey     - e.g. "HMS-forhandssjekk"
 * @property {string} system          - e.g. "landax"
 *
 * @typedef {Object} CapabilityProvider
 *   An entry in the Capability Registry — a known "thing that can
 *   fulfill a capability". `kind` constrains what a binding to it can
 *   mean, so "capability points at unknown/incompatible provider" is a
 *   structural check, not a runtime surprise.
 * @property {string} id              - e.g. "landax", "internal_schema_registry"
 * @property {"schema"|"dataset"|"link"|"adapter"} kind
 *
 * @typedef {Object} CapabilityBinding
 *   "Who delivers SJA?" answered as data — motor never asks "does this
 *   org have Landax?", it asks the runtime "who delivers capability
 *   'sja'?" and gets back a provider reference, kind-checked at compile
 *   time. Not every RuleAction target needs to be a capability: a plain
 *   reminder task (e.g. Phase 5's "fuel_before_shift_end") has no
 *   external/internal system fulfilling it and no organizational choice
 *   of provider, so it stays a bare RuleAction target — forcing it
 *   through this registry would be indirection with nothing to hide.
 * @property {string} capability      - e.g. "sja", "ruh", "machine_check", "orders", "timekeeping", "external_instruction"
 * @property {string} providerId      - references CapabilityProvider.id
 * @property {Record<string, unknown>} [config]  - provider-specific, e.g. { schemaType: "sja_preday" }
 *
 * @typedef {Object} PreferredCandidate
 *   Organization-wide ranking preference (Del 2's OrganizationBonus) —
 *   deliberately separate from Correction Memory (lib/correction-memory/):
 *   this is compiled, org-scoped Runtime data an admin publishes, never
 *   something one user's corrections write to.
 * @property {import('../correction-memory/types.mjs').CorrectionCategory} category
 * @property {string} value
 * @property {number} bonus           - capped by the Ranking Engine (lib/ranking-engine/), not here — Runtime just states the intent
 *
 * @typedef {Object} RankingWeights
 *   Phase 8 audit finding: these were hardcoded engine constants
 *   (lib/ranking-engine/score.mjs). Now Runtime-tunable, but every
 *   value is clamped by the engine's own ENGINE_SAFETY_CEILING
 *   regardless of what a Runtime declares — organizations tune within
 *   a boundary, they never move the boundary.
 * @property {number} [maxAliasBonus]
 * @property {number} [maxOrganizationBonus]
 * @property {number} [maxRecencyBonus]
 * @property {number} [recencyPerOccurrence]
 * @property {{minCount:number, bonus:number}[]} [correctionBonusThresholds]
 *
 * @typedef {Object} RuntimeCompilerInput
 * @property {import('../organization/types.mjs').OrganizationContext} organizationContext
 * @property {import('../organization/schema-registry.mjs').SchemaRegistryEntry[]} schemas
 * @property {import('../rules/types.mjs').Rule[]} rules
 * @property {CapabilityProvider[]} capabilityProviders
 * @property {CapabilityBinding[]} capabilityBindings
 * @property {Alias[]} aliases
 * @property {import('../knowledge-graph/types.mjs').KnowledgeGraph} [knowledgeGraph]
 * @property {PreferredCandidate[]} [preferredCandidates]
 * @property {RankingWeights} [rankingWeights]
 * @property {Record<string, "schema"|"dataset"|"link"|"adapter">} [capabilityKindExpectations]  - was EXPECTED_PROVIDER_KIND, hardcoded in the compiler; now organization-supplied
 * @property {Record<string,string>} [promptLabels]  - Phase 8 audit finding: action targets had no human-readable text anywhere in the engine; keyed by RuleAction.target
 * @property {{ordre?:string, location?:string, vehicle?:string}} [extractionPatterns]  - Phase 8 audit finding: Fact Engine regexes were shaped exactly like Mesta's ID format; now organization-suppliable (lib/engine/facts.mjs)
 * @property {{incidentKeywords?:string[], fuelKeywords?:string[]}} [extractionVocabularies]  - Phase 8 acceptance test finding: incident/concern keyword lists were hardcoded to Mesta's vocabulary too; a Nordhavn observation using "avvik" instead of "ulykke" silently failed to trigger its own rule until this was added
 *
 * @typedef {Object} OrganizationRuntime
 *   The ONE thing Punchout Mobile ever loads. Every cross-reference in
 *   here has already been checked by the compiler — motor never
 *   re-validates them, it trusts the Runtime completely. This is the
 *   real difference from Phase 3's "Organization Bundle": a bundle is
 *   raw, independently-versioned parts (which Phase 3 already showed
 *   has no cross-resource consistency guarantee — orders could sync to
 *   v4 while schemas were still v2); a Runtime is one compiled,
 *   internally-consistent, atomically-versioned whole.
 * @property {number} runtimeVersion
 * @property {string} organizationId
 * @property {string} compiledAt
 * @property {string} checksum
 * @property {import('../../hooks/use-motor-state.js').RuntimeConfig} runtimeConfig
 * @property {import('../organization/schema-registry.mjs').SchemaRegistryEntry[]} schemas
 * @property {import('../rules/types.mjs').Rule[]} rules
 * @property {CapabilityBinding[]} capabilities
 * @property {Alias[]} aliases
 * @property {import('../organization/types.mjs').OrderSummary[]} orders
 * @property {import('../organization/types.mjs').MachineSummary[]} machines
 * @property {import('../knowledge-graph/types.mjs').KnowledgeGraph} knowledgeGraph
 * @property {PreferredCandidate[]} preferredCandidates
 * @property {RankingWeights} rankingWeights
 * @property {Record<string, "schema"|"dataset"|"link"|"adapter">} capabilityKindExpectations
 * @property {Record<string,string>} promptLabels
 * @property {{ordre?:string, location?:string, vehicle?:string}} extractionPatterns
 * @property {{incidentKeywords?:string[], fuelKeywords?:string[]}} extractionVocabularies
 *
 * @typedef {Object} RuntimeManifest
 *   What Backend's Runtime Store persists per version (Del 3).
 * @property {number} runtimeVersion
 * @property {string} organizationId
 * @property {string} checksum
 * @property {string} signature       - mock here; would be HMAC/asymmetric-signed in a real backend, same mock-not-real posture as lib/adapters/landax-adapter.mjs's send()
 * @property {string} publishedAt
 * @property {string} publishedBy
 * @property {"active"|"superseded"|"rolledback"} status
 * @property {number} [previousVersion]
 */

export {};
