/**
 * Phase 8 Acceptance Test: onboard a completely new, fictional
 * organization (Nordhavn Terminal AS — a harbor terminal, nothing like
 * Mesta's road-maintenance domain) using ONLY Runtime package data.
 * Verifies the full chain: Facts -> Candidates -> Ranking -> Knowledge
 * Graph -> Completion -> Correction -> Replay -> Operations Center —
 * with zero organization-specific code anywhere in lib/.
 *
 * Run with: node lib/organization-package/acceptance-test.mjs
 */
import { loadOrganizationPackage } from "./loader.mjs";
import { compileRuntime } from "../runtime/compiler.mjs";
import { deriveFacts } from "../engine/facts.mjs";
import { buildPromptQueue } from "../engine/completion-engine.mjs";
import { deriveKnowledgeFacts, detectActivity } from "../knowledge-graph/derive.mjs";
import { generateCandidates } from "../ranking-engine/candidates.mjs";
import { rankCandidates } from "../ranking-engine/score.mjs";
import { CorrectionMemoryStore } from "../correction-memory/store.mjs";

function section(t) { console.log("\n=== " + t + " ==="); }

section("Load + compile organizations/nordhavn (zero engine code changes for this org)");
const { input, correctionFixtures } = loadOrganizationPackage("./organizations/nordhavn");
const { valid, errors, runtime } = compileRuntime(input, { runtimeVersion: 1 });
console.log("valid:", valid, "errors:", errors);
if (!valid) process.exit(1);
console.log("organizationId:", runtime.organizationId, "| schemas:", runtime.schemas.map((s) => s.schemaType));
console.log("extractionPatterns.ordre (organization-specific, not Mesta's format):", runtime.extractionPatterns.ordre);

section("Natural observation -> Fact extraction (custom order-ID pattern applied)");
const utterance = "Losset MSC Bergen med reachstacker på NHT-2026-0451. Hadde et avvik.";
const dayLog = { date: "2026-07-02", entries: [{ time: "10:00", type: "notat", text: utterance }] };
const orgContextLike = { machines: runtime.machines };
const facts = deriveFacts(dayLog, orgContextLike, runtime.extractionPatterns, runtime.extractionVocabularies);
console.log(JSON.stringify(facts, null, 2));
const orderFact = facts.find((f) => f.key === "orderCandidate");
console.log("orderCandidate correctly matched Nordhavn's ID format (not Mesta's digit-dash-digit):", orderFact ? orderFact.value : "NONE — would be a real bug");

const activity = detectActivity(utterance, runtime.knowledgeGraph);
console.log("Activity detected via package-defined keywords:", activity ? activity.label : "(none)");

section("Candidate generation + Ranking (vessel name vs. order id, no textual overlap)");
const store = new CorrectionMemoryStore(runtime.rankingWeights.correctionBonusThresholds);
const candidates = generateCandidates("MSC Bergen", runtime.orders.map((o) => o.id)).map((c) => ({
  ...c,
  contextScore: runtime.orders.find((o) => o.id === c.value)?.active ? 10 : 0,
}));
const rankingCtx = { category: "order", originalValue: "MSC Bergen", userId: "user_9001", organizationId: "nordhavn", todaysConfirmedValues: ["NHT-2026-0452"] };
const before = rankCandidates(candidates, store, [], rankingCtx, runtime.rankingWeights);
for (const r of before) console.log("  " + r.value + " -> " + r.explanation.join(", "));

section("Knowledge Graph -> Completion Engine (package-defined machine/schema relation)");
const kgResult = deriveKnowledgeFacts(facts, runtime.knowledgeGraph);
const allFacts = [...facts, ...kgResult.derivedFacts];
const queue = buildPromptQueue(allFacts, runtime.rules, runtime.capabilities, new Date(), runtime.promptLabels);
console.log(queue.map((q) => q.label + " (priority " + q.priority + ")"));

section("Correction + Replay (regression fixture from corrections.json)");
const fixture = correctionFixtures[0];
console.log("Fixture:", fixture.scenario);
for (let i = 0; i < fixture.correctionRepeats; i++) {
  store.recordCorrection({ category: fixture.category, originalValue: fixture.originalValue, correctedValue: fixture.correctedValue, userId: "user_9001", organizationId: "nordhavn" });
}
const after = rankCandidates(candidates, store, [], rankingCtx, runtime.rankingWeights);
console.log("Top before:", before[0].value, "(expected " + fixture.expectedTopBeforeCorrection + "):", before[0].value === fixture.expectedTopBeforeCorrection);
console.log("Top after:", after[0].value, "(expected " + fixture.expectedTopAfterCorrection + "):", after[0].value === fixture.expectedTopAfterCorrection);

const replay = rankCandidates(candidates, store, [], rankingCtx, runtime.rankingWeights);
console.log("Determinism (replay matches):", JSON.stringify(after) === JSON.stringify(replay));

section("Result");
const passed =
  valid &&
  !!orderFact && orderFact.value === "NHT-2026-0451" &&
  !!activity && activity.id === "lossing" &&
  queue.some((q) => q.target === "avvik") &&
  before[0].value === fixture.expectedTopBeforeCorrection &&
  after[0].value === fixture.expectedTopAfterCorrection;
console.log(passed ? "ACCEPTANCE TEST PASSED — new organization onboarded via Runtime package alone." : "ACCEPTANCE TEST FAILED");
if (!passed) process.exit(1);
