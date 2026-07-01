/**
 * Del 9 dry run: "Riksvei 92" is ambiguous between two road-name
 * candidates. Day 1 the user corrects the system's top pick. By Day 10,
 * after repeated explicit correction, ranking has shifted — bounded,
 * explainable, and proven deterministic. No AI, no statistical model.
 *
 * Run with: node lib/correction-memory/dry-run.mjs
 */
import { CorrectionMemoryStore } from "./store.mjs";
import { rankCandidates } from "./scoring.mjs";
import { bonusForCount } from "./bonus.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}
function printRanking(label, ranking) {
  console.log(label + ":");
  for (const r of ranking) console.log("  " + r.value + " -> " + r.explanation.join(", "));
}

const ctx = { category: "location", originalValue: "Riksvei 92", userId: "user_4471", organizationId: "mesta" };
const candidates = ["RV92", "FV17", "E6"];
// FV17 deliberately scores highest on base match alone — the correction
// bonus must EARN its way past it through repeated explicit correction,
// never flip it on the first correction. This is the "cannot override an
// obviously wrong candidate" bound made visible, not just asserted.
const baseScores = {
  RV92: { baseMatch: 60, aliasScore: 0, contextScore: 0 },
  FV17: { baseMatch: 65, aliasScore: 0, contextScore: 0 },
  E6: { baseMatch: 20, aliasScore: 0, contextScore: 0 },
};

// ---------------------------------------------------------------
section("Dag 1 — observasjon 'Riksvei 92', ingen korreksjon ennå");
const freshStore = new CorrectionMemoryStore();
printRanking("Rangering uten Correction Memory", rankCandidates(candidates, baseScores, freshStore, ctx));
console.log("Brukeren velger RV92 i stedet for topp-forslaget FV17 -> eksplisitt korreksjon lagres.");
const store = new CorrectionMemoryStore();
const corrected = store.recordCorrection({ category: ctx.category, originalValue: ctx.originalValue, correctedValue: "RV92", userId: ctx.userId, organizationId: ctx.organizationId });
console.log("Lagret:", corrected);

// ---------------------------------------------------------------
section("Dag 2 — samme observasjon");
console.log("Uten Correction Memory (uendret fra dag 1):");
printRanking("  ", rankCandidates(candidates, baseScores, new CorrectionMemoryStore(), ctx));
console.log("\nMed Correction Memory (count=1, bonus=" + bonusForCount(1) + "):");
const day2Ranking = rankCandidates(candidates, baseScores, store, ctx);
printRanking("  ", day2Ranking);
console.log(
  "\nMerk: RV92 rykket opp (62 vs. 60), men FV17 (65) vinner fortsatt — én korreksjon flytter ikke rangeringen automatisk, kun prioriterer."
);

// ---------------------------------------------------------------
section("Dag 3-11 — 9 flere eksplisitte korreksjoner av samme sammenheng (totalt 10)");
for (let day = 3; day <= 11; day++) {
  store.recordCorrection({ category: ctx.category, originalValue: ctx.originalValue, correctedValue: "RV92", userId: ctx.userId, organizationId: ctx.organizationId });
}
const memoryEntry = store.findActive(ctx.category, ctx.originalValue, ctx.userId, ctx.organizationId);
console.log("count etter 10 eksplisitte korreksjoner:", memoryEntry.count, "| confidenceBonus:", memoryEntry.confidenceBonus);

const day10Ranking = rankCandidates(candidates, baseScores, store, ctx);
printRanking("Rangering etter 10 korreksjoner (bonus-terskel 'Ti: +15')", day10Ranking);
console.log("\nRV92 vinner nå (" + day10Ranking[0].total + " > " + day10Ranking[1].total + ") — utelukkende fra akkumulerte eksplisitte valg, ingen gjetning.");

const repeat = rankCandidates(candidates, baseScores, store, ctx);
console.log("\nDeterminisme: identisk rangering ved gjentatt kjøring på samme minne-tilstand:", JSON.stringify(day10Ranking) === JSON.stringify(repeat));

// ---------------------------------------------------------------
section("Kontrakt-verifisering: konflikt, utløp, nullstilling");
const conflictStore = new CorrectionMemoryStore();
conflictStore.recordCorrection({ category: "machine", originalValue: "Volvo", correctedValue: "hjullaster", userId: "u1", organizationId: "mesta" });
conflictStore.recordCorrection({ category: "machine", originalValue: "Volvo", correctedValue: "gravemaskin", userId: "u1", organizationId: "mesta" }); // contradicts
console.log("Konflikt håndtert deterministisk (siste eksplisitte valg vinner, gammel deaktivert, ikke slettet):");
console.log("  aktiv:", conflictStore.findActive("machine", "Volvo", "u1", "mesta").correctedValue);
console.log("  telemetri:", conflictStore.telemetry.map((e) => e.type).join(", "));

const staleStore = new CorrectionMemoryStore();
const staleEntry = staleStore.recordCorrection({ category: "generic", originalValue: "x", correctedValue: "y", userId: "u2", organizationId: "mesta" }, new Date("2025-01-01"));
staleStore.expireStale(new Date("2026-07-01"), 180);
console.log("\nUtløpt korreksjon (>180 dager ubrukt):", staleStore.findActive("generic", "x", "u2", "mesta") === null ? "deaktivert korrekt" : "FEIL");

const removed = store.clearForUser(ctx.userId, ctx.organizationId);
console.log("\nBruker ba om nullstilling av egen Correction Memory: fjernet", removed, "oppføring(er). Aktiv etterpå:", store.findActive(ctx.category, ctx.originalValue, ctx.userId, ctx.organizationId));
