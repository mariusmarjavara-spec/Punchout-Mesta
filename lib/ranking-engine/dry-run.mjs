/**
 * Del 9 dry run: "Jeg har feid RV92 med Wille." Full chain: Observation
 * -> Candidates -> Ranking -> Knowledge Graph -> Completion Engine ->
 * Prompt Queue -> Completion Path. Then the user corrects "RV92" ->
 * order 204481-0149; re-run, showing Correction Memory move the
 * ranking without touching the fact base. No AI. Run with:
 * node lib/ranking-engine/dry-run.mjs
 */
import { deriveFacts } from "../engine/facts.mjs";
import { buildPromptQueue } from "../engine/completion-engine.mjs";
import { deriveKnowledgeFacts, detectActivity } from "../knowledge-graph/derive.mjs";
import { buildCompletionPath } from "../knowledge-graph/completion-path.mjs";
import { generateCandidates } from "./candidates.mjs";
import { rankCandidates } from "./score.mjs";
import { CorrectionMemoryStore } from "../correction-memory/store.mjs";
import { topCorrectedTerms, mostValuableCorrections, unusedCorrections, falseCandidateRate, rankingAccuracy, averageScoreBreakdown } from "../operations-center/ranking-intelligence.mjs";

function section(t) { console.log("\n=== " + t + " ==="); }

const utterance = "Jeg har feid RV92 med Wille.";
const dayLog = { date: "2026-07-02", entries: [{ time: "09:00", type: "notat", text: utterance }] };

/** @type {import('../knowledge-graph/types.mjs').KnowledgeGraph} */
const kg = {
  activities: [{ id: "feiing", label: "Feiing", machineTypes: ["wille"], keywords: ["feid", "feier"] }],
  machineTypes: [{ id: "wille", label: "Wille 675", requiredSchemas: ["maskinsjekk"], recommendedSchemas: [], externalSystems: ["landax"] }],
  orderTypes: [{ id: "veidrift", label: "Veidrift", activities: ["feiing"] }],
};
const orgContext = {
  organizationId: "mesta", name: "Mesta",
  orders: [
    { id: "204481-0014", description: "Fv. 17 asfalt/brøyting", active: true },
    { id: "204481-0149", description: "Rv. 92 drift og vedlikehold", active: true },
    { id: "204481-0022", description: "Fv. 22 grøfterensk", active: false },
  ],
  machines: [{ id: "m1", type: "wille", label: "Wille 675" }],
  vehicles: [], wageCodes: [], schemas: [], procedures: [], externalLinks: [], sjaDefaults: null,
};
const COMPLETION_RULES = [
  {
    id: "rule_required_schema_from_machine",
    version: 1,
    effectiveFrom: "2026-01-01",
    trigger: { event: "factObserved", factKey: "requiredSchemaFromMachine" },
    conditions: [],
    action: { type: "requireSchema", target: "$factValue" }, // ONE generic rule, no per-machine hardcoding
    priority: 80,
    affects: {},
  },
];

// ---------------------------------------------------------------
section("1. Observation");
console.log('"' + utterance + '"');

section("2. Facts (Fact Engine, unchanged)");
const facts = deriveFacts(dayLog, orgContext);
console.log(JSON.stringify(facts, null, 2));
const activity = detectActivity(utterance, kg);
console.log("Aktivitet oppdaget via lukket nøkkelord-liste:", activity ? activity.label : "(ingen)");

section("3. Candidates (for å løse 'RV92' mot kjente ordre)");
const candidatesRaw = generateCandidates("RV92", orgContext.orders.map((o) => o.id));
const candidates = candidatesRaw.map((c) => ({
  ...c,
  contextScore: orgContext.orders.find((o) => o.id === c.value)?.active ? 10 : 0, // deterministic: active order gets a fixed context bonus
}));
console.log(candidates);

section("4. Ranking (uten korreksjon)");
const store = new CorrectionMemoryStore();
const rankingCtx = { category: "order", originalValue: "RV92", userId: "user_4471", organizationId: "mesta", todaysConfirmedValues: ["204481-0014", "204481-0014"] };
const rankingBefore = rankCandidates(candidates, store, [], rankingCtx);
for (const r of rankingBefore) console.log("  " + r.value + " -> " + r.explanation.join(", "));
console.log(
  "\nMerk: " + rankingBefore[0].value + " vinner pga. Recency (allerede brukt i dag), IKKE fordi noe faktisk knytter 'RV92' til denne ordren." +
  " Systemet har ingen ekte grunn til å velge riktig ordre ennå — nettopp derfor er dette et eksplisitt korreksjonsbehov, ikke noe systemet bør gjette seg til."
);

section("5. Knowledge Graph (Wille -> påkrevde skjema)");
const kgResult = deriveKnowledgeFacts(facts, kg);
console.log("Avledede fakta:", kgResult.derivedFacts);
console.log("Spor:", kgResult.trace);

section("6. Completion Engine (Prompt Queue)");
const allFacts = [...facts, ...kgResult.derivedFacts];
const queue = buildPromptQueue(allFacts, COMPLETION_RULES);
console.log(queue);

section("7. Completion Path (Del 5, hele resonnementet)");
const machineFact = facts.find((f) => f.key === "machineUsed");
const path = buildCompletionPath({ observationText: utterance, activity, machineFact, kgTrace: kgResult.trace, missingSchema: queue[0] ? queue[0].target : null });
for (const step of path) console.log("  " + step.step + ": " + step.detail);

// ---------------------------------------------------------------
section("8. Bruker korrigerer: 'RV92' -> Ordre 204481-0149");
store.recordCorrection({ category: "order", originalValue: "RV92", correctedValue: "204481-0149", userId: "user_4471", organizationId: "mesta" });

section("9. Samme scenario på nytt — faktagrunnlaget er UENDRET, kun rangeringen flytter seg");
const factsAgain = deriveFacts(dayLog, orgContext); // identical call, proves fact base untouched
console.log("Faktagrunnlag uendret:", JSON.stringify(facts) === JSON.stringify(factsAgain));
const rankingAfter = rankCandidates(candidates, store, [], rankingCtx);
for (const r of rankingAfter) console.log("  " + r.value + " -> " + r.explanation.join(", "));
console.log("\n204481-0149 rykket opp (+2, count=1) men vinner ikke ennå — samme bundethet som Phase 6.6, ikke en ny regel.");

section("10. Flere korreksjoner -> rangeringen flipper (samme mekanisme, ikke ny logikk)");
store.recordCorrection({ category: "order", originalValue: "RV92", correctedValue: "204481-0149", userId: "user_4471", organizationId: "mesta" });
store.recordCorrection({ category: "order", originalValue: "RV92", correctedValue: "204481-0149", userId: "user_4471", organizationId: "mesta" });
const rankingFinal = rankCandidates(candidates, store, [], rankingCtx);
for (const r of rankingFinal) console.log("  " + r.value + " -> " + r.explanation.join(", "));
const rankingFinalAgain = rankCandidates(candidates, store, [], rankingCtx);
console.log("\nDeterminisme (identisk rangering ved gjentatt kjøring):", JSON.stringify(rankingFinal) === JSON.stringify(rankingFinalAgain));

// ---------------------------------------------------------------
section("Operations Center — Ranking Intelligence (Del 7/8)");
console.log("Top Corrected Terms:", topCorrectedTerms(store.entries));
console.log("Most Valuable Corrections:", mostValuableCorrections(store.entries).map((e) => e.originalValue + "->" + e.correctedValue + " (+" + e.confidenceBonus + ")"));
console.log("Unused Corrections:", unusedCorrections(store.entries, store.telemetry).length);

const decisions = [
  { category: "order", originalValue: "RV92", topCandidate: rankingBefore[0].value, topScore: rankingBefore[0].total, userAcceptedTop: false, correctedTo: "204481-0149" },
  { category: "order", originalValue: "RV92", topCandidate: rankingFinal[0].value, topScore: rankingFinal[0].total, userAcceptedTop: rankingFinal[0].value === "204481-0149" },
];
console.log("False Candidate Rate:", falseCandidateRate(decisions));
console.log("Ranking Accuracy:", rankingAccuracy(decisions));
console.log("Average Score Breakdown:", averageScoreBreakdown([...rankingBefore, ...rankingFinal]));
