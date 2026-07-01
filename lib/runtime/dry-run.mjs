/**
 * Del 6 dry run: administrator imports a new SJA + new orders, edits one
 * rule, publishes. Backend compiles/validates/signs/distributes a new
 * Runtime v129. Mobile loads it and runs the Operational Completion
 * Engine using ONLY the Runtime — no further backend calls.
 *
 * No real network, no database — RuntimeStore is in-memory (same
 * posture as lib/sync/cache.mjs). Run with: node lib/runtime/dry-run.mjs
 */
import { compileRuntime } from "./compiler.mjs";
import { RuntimeStore } from "./store.mjs";
import { LocalCache } from "../sync/cache.mjs";
import { deriveFacts } from "../engine/facts.mjs";
import { buildPromptQueue } from "../engine/completion-engine.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}

const organizationId = "mesta";
const store = new RuntimeStore();

// ---------------------------------------------------------------
// Baseline: v128 already published (so this dry run's publish becomes v129)
// ---------------------------------------------------------------
const baselineOrgContext = {
  organizationId, name: "Mesta",
  orders: [{ id: "204481-0014", description: "Fv. 17 asfalt/brøyting", active: true }],
  machines: [{ id: "m1", type: "hjullaster", label: "Hjullaster 12t" }],
  vehicles: [], wageCodes: [{ kode: "100", label: "Ordinær arbeidstid" }],
  schemas: [], procedures: [], externalLinks: [], sjaDefaults: { sted: "", arbeidsvarsling: "enkel" },
};
const baselineSchema = { schemaType: "sja_preday", version: 2, effectiveFrom: "2026-06-01", fields: { oppgave: { label: "Oppgave", type: "text", required: true }, godkjent: { label: "Godkjent", type: "boolean", required: true } } };
const baselineRules = [
  { id: "rule_ruh_on_incident", version: 1, effectiveFrom: "2026-01-01", trigger: { event: "factObserved", factKey: "incidentReported" }, conditions: [{ field: "incidentReported", operator: "equals", value: true }], action: { type: "requireSchema", target: "ruh" }, priority: 100, affects: { schemaTypes: ["ruh"] } },
];
const baselineSchemas = [baselineSchema, { schemaType: "ruh", version: 1, effectiveFrom: "2026-01-01", fields: { arsak: { label: "Årsak", type: "text", required: true }, tiltak: { label: "Tiltak", type: "text", required: true } } }];
const capabilityProviders = [{ id: "internal_schema_registry", kind: "schema" }, { id: "landax", kind: "adapter" }];
const capabilityBindings = [{ capability: "sja", providerId: "internal_schema_registry", config: { schemaType: "sja_preday" } }, { capability: "ruh", providerId: "internal_schema_registry", config: { schemaType: "ruh" } }];
const aliases = [{ canonicalKey: "sja_preday", externalKey: "HMS-forhandssjekk", system: "landax" }];

const baselineCompiled = compileRuntime(
  { organizationContext: baselineOrgContext, schemas: baselineSchemas, rules: baselineRules, capabilityProviders, capabilityBindings, aliases },
  { runtimeVersion: 128 }
);
store.publish(baselineCompiled.runtime, "system_seed");

// ---------------------------------------------------------------
// 1. Administrator: importerer ny SJA, importerer nye ordre, endrer én regel
// ---------------------------------------------------------------
section("1. Administrator (Hub): importer + rediger");

const newSjaDocument = { ...baselineSchema, version: 3, effectiveFrom: "2026-07-02", fields: { ...baselineSchema.fields, utstyrskontroll: { label: "Utstyr kontrollert", type: "boolean", required: true, autofillable: true } } };
console.log("Importert SJA v3 (med careless autofillable:true på et vanlig felt — ikke låst, så ingen sanitering forventes her):", newSjaDocument.version);

const newOrders = [...baselineOrgContext.orders, { id: "204481-0022", description: "Fv. 22 grøfterensk", active: true }];
console.log("Importert ordreliste:", newOrders.map((o) => o.id).join(", "));

const editedRules = baselineRules.map((r) => (r.id === "rule_ruh_on_incident" ? { ...r, priority: 200 } : r));
console.log("Endret regel rule_ruh_on_incident: priority 100 -> 200");

const proposed = {
  organizationContext: { ...baselineOrgContext, orders: newOrders },
  schemas: [newSjaDocument, baselineSchemas[1]],
  rules: editedRules,
  capabilityProviders,
  capabilityBindings,
  aliases,
};

// ---------------------------------------------------------------
// 2. Valider
// ---------------------------------------------------------------
section("2. Valider");
// Same function as Compile below — compileRuntime validates as it
// compiles (deliberate: no state where something "validates" but then
// compiles differently). Called here in valid-check-only mode.
const nextVersion = Math.max(...store.history(organizationId).map((m) => m.runtimeVersion)) + 1;
const validation = compileRuntime(proposed, { runtimeVersion: nextVersion });
console.log("valid:", validation.valid, "| errors:", validation.errors.length ? validation.errors : "(ingen)");

// ---------------------------------------------------------------
// 3. Compile -> Runtime v129 (unpublished candidate)
// ---------------------------------------------------------------
section("3. Compile -> kandidat Runtime v" + nextVersion);
const candidate = validation.runtime;
console.log("checksum:", candidate.checksum, "| schemas:", candidate.schemas.map((s) => s.schemaType + "@v" + s.version).join(", "), "| orders:", candidate.orders.map((o) => o.id).join(", "));

const recompiled = compileRuntime(proposed, { runtimeVersion: nextVersion });
console.log("Determinisme: samme input kompilert på nytt gir identisk checksum:", recompiled.runtime.checksum === candidate.checksum);

// ---------------------------------------------------------------
// 4. Dry Run — exercise the candidate through the Operational Completion Engine before publish
// ---------------------------------------------------------------
section("4. Dry Run (Operational Completion Engine mot prøvedag)");
const sampleDayLog = { date: "2026-07-02", entries: [{ time: "10:00", type: "notat", text: "Hadde en nestenulykke med hjullaster på 204481-0014" }] };
const sampleFacts = deriveFacts(sampleDayLog, { ...candidate, organizationId });
const sampleQueue = buildPromptQueue(sampleFacts, candidate.rules);
console.log("Prompt Queue mot prøvedag:", sampleQueue.map((q) => q.kind + ":" + q.target + "(" + q.priority + ")").join(", "));
const dryRunOk = sampleQueue.length > 0 && sampleQueue[0].target === "ruh";
console.log("Dry run bestått (RUH korrekt høyest prioritert):", dryRunOk);

// ---------------------------------------------------------------
// 5. Publish -> Runtime v129
// ---------------------------------------------------------------
section("5. Publish");
if (!dryRunOk) throw new Error("dry run failed — publish blocked");
const manifest = store.publish(candidate, "user_admin_1");
console.log("Publisert:", JSON.stringify(manifest, null, 2));

// ---------------------------------------------------------------
// 6. Signering (skjedde inne i publish) + Distribusjon
// ---------------------------------------------------------------
section("6. Distribusjon (sync-kontrakt, ÉN ressurstype: runtime)");
const syncResponse = {
  serverTime: new Date().toISOString(),
  versions: [{ resourceType: "runtime", version: String(manifest.runtimeVersion), updatedAt: manifest.publishedAt }],
  changes: [{ resourceType: "runtime", changeKind: "full", data: candidate }],
};
const mobileCache = new LocalCache([{ resourceType: "runtime", version: "128", updatedAt: "2026-06-01T00:00:00.000Z", data: baselineCompiled.runtime }]);
const { updated } = mobileCache.apply(syncResponse);
console.log("Mobile synket ressurstyper:", updated.join(", "), "(nettopp DENNE forenklingen — én ressurs, ikke åtte separate — er Phase 6-funnet fra Del 2)");

// ---------------------------------------------------------------
// 7. Punchout: laster Runtime, starter arbeidsdagen, Operational
//    Completion Engine bruker KUN Runtime fra her av — ingen store/
//    compiler/Hub-referanser under.
// ---------------------------------------------------------------
section("7. Punchout Mobile — kjører utelukkende på lastet Runtime");
const loadedRuntime = mobileCache.get("runtime").data;
console.log("Lastet runtimeVersion:", loadedRuntime.runtimeVersion, "checksum:", loadedRuntime.checksum);

const dayLog = { date: "2026-07-02", entries: [{ time: "07:30", type: "notat", text: "Nestenulykke rapportert med hjullaster" }] };
const facts = deriveFacts(dayLog, loadedRuntime); // loadedRuntime.machines used for machine-keyword matching, same shape as OrganizationContext.machines
const queue = buildPromptQueue(facts, loadedRuntime.rules); // loadedRuntime.rules — no backend/compiler/store call anywhere below this line
console.log("Prompt Queue (fra lastet runtime alene):", queue.map((q) => q.kind + ":" + q.target).join(" -> "));
console.log(
  "\nBekreftelse: fra steg 7 og nedover er verken RuntimeStore, compileRuntime, eller noe Hub-kontraktimport referert -" +
    " Operational Completion Engine kjørte utelukkende på det som allerede lå i mobilens lokale cache."
);
