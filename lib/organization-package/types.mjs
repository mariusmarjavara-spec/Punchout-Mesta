/**
 * Organization Package — one directory, one organization, fully
 * described. The loader (loader.mjs) is the ONLY code that knows these
 * file names exist; everything downstream just receives a
 * RuntimeCompilerInput (lib/runtime/types.mjs) and has no idea whether
 * it came from a package, a hand-built object (every dry run so far),
 * or eventually a real backend.
 *
 * organizations/<id>/
 *   runtime.json          - OrganizationContext + rules + capabilities + rankingWeights (everything not covered below)
 *   aliases.json           - Alias[]
 *   knowledge_graph.json   - KnowledgeGraph
 *   schemas.json            - raw declarative schema documents (lib/organization/schema-format.mjs), NOT pre-parsed
 *   prompts.json            - Record<target, label> -> Runtime.promptLabels
 *   validation.json         - self-declared manifest {expectedSchemaCount, expectedActivityCount, expectedMachineTypeCount}, cross-checked at load time, catches a package silently missing a file's worth of content
 *   corrections.json        - regression FIXTURES for lib/regression/ (Phase 9), never live CorrectionMemoryStore seed data
 *
 * Deliberate decision (Phase 8 Del 2 audit): "corrections.json" does
 * NOT seed a user's Correction Memory. lib/correction-memory/ describes
 * the USER (Phase 6.6/6.7's whole point); an organization package
 * describes the ORGANIZATION. A file that let a package write into
 * CorrectionMemoryStore would quietly cross that boundary the moment
 * anyone used it that way. Interpreted instead as named regression
 * scenarios: "given these known values, this correction, expect this
 * ranking" — verifiable, replayable, never live memory.
 *
 * @typedef {Object} CorrectionFixture
 * @property {string} scenario
 * @property {import('../correction-memory/types.mjs').CorrectionCategory} category
 * @property {string} originalValue
 * @property {string[]} knownValues
 * @property {number} correctionRepeats
 * @property {string} correctedValue
 * @property {string} expectedTopBeforeCorrection
 * @property {string} expectedTopAfterCorrection
 * @property {string} [todaysConfirmedValue]  - Phase 10: which candidate was already confirmed earlier the same day, giving it a Recency-based lead before any correction — makes the "before" ranking's false leader an explainable, declared scenario fact instead of an accidental array-order artifact
 */

export {};
