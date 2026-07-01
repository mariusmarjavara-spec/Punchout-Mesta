/**
 * Del 5 dry run: full bidirectional schema lifecycle.
 *
 *   Landax --export--> Hub (validate+sanitize) --sync--> Punchout cache
 *   --> motor pins a schema instance --> user fills it out -->
 *   buildExportEnvelope --> LandaxAdapter --> mock response
 *
 * Reuses Phase 2 (lib/adapters) and Phase 3 (lib/sync, lib/organization)
 * modules unchanged — the only new code exercised here is schema-format.mjs
 * and rules/evaluate.mjs. No real network anywhere.
 *
 * Run with: node lib/rules/dry-run.mjs
 */
import { parseSchemaDocument, sanitizeSchemaDocument } from "../organization/schema-format.mjs";
import { resolveActiveSchemaDefinition } from "../organization/schema-registry.mjs";
import { LocalCache } from "../sync/cache.mjs";
import { buildExportEnvelope } from "../adapters/envelope.mjs";
import { runAdapter } from "../adapters/adapter.mjs";
import { LandaxAdapter } from "../adapters/landax-adapter.mjs";
import { resolveMatchingRules } from "./evaluate.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}

// ---------------------------------------------------------------
// 1. Landax publiserer ny SJA
// ---------------------------------------------------------------
section("1. Landax publiserer ny SJA (rått dokument)");

// Deliberately includes a careless submission: konsekvens/tiltak marked
// autofillable even though those are platform-locked fields.
const rawFromLandax = {
  schemaType: "sja_preday",
  version: 3,
  effectiveFrom: "2026-07-01",
  title: "SJA (før arbeid)",
  sections: [
    { id: "oppgave", title: "Oppgave", fields: ["oppgave", "sted"] },
    { id: "risiko", title: "Risikovurdering", fields: ["risiko", "konsekvens", "tiltak"] },
  ],
  fields: {
    oppgave: { label: "Oppgave", type: "text", required: true, autofillable: true },
    sted: { label: "Sted", type: "text", required: false, autofillable: true },
    risiko: { label: "Risiko", type: "text", required: false, autofillable: true },
    konsekvens: { label: "Konsekvens", type: "text", required: true, autofillable: true }, // locked field, careless submission
    tiltak: { label: "Tiltak", type: "text", required: true, autofillable: true }, // locked field, careless submission
    godkjent: { label: "Godkjent", type: "boolean", required: true, autofillable: false },
  },
  attachedRules: ["rule_ruh_on_hendelse"],
  metadata: { publishedBy: "landax", sourceSchemaId: "landax_sja_v7" },
};
console.log(JSON.stringify(rawFromLandax, null, 2));

// ---------------------------------------------------------------
// 2. Hub validerer og saniterer før lagring
// ---------------------------------------------------------------
section("2. Hub lagrer versjon (validate + sanitize)");

const parsed = parseSchemaDocument(rawFromLandax);
console.log("parseSchemaDocument():", { valid: parsed.valid, errors: parsed.errors });

const { document: sanitized, overrides } = sanitizeSchemaDocument(parsed.document);
console.log("sanitizeSchemaDocument() overstyrte autofillable=false for:", overrides.join(", ") || "(ingen)");
console.log(
  "konsekvens.autofillable etter sanitering:",
  sanitized.fields.konsekvens.autofillable,
  "| tiltak.autofillable:",
  sanitized.fields.tiltak.autofillable
);

// ---------------------------------------------------------------
// 3. Punchout synker
// ---------------------------------------------------------------
section("3. Punchout synker (gjenbruker lib/sync/cache.mjs uendret)");

const cache = new LocalCache([
  {
    resourceType: "schemas",
    version: "2",
    updatedAt: "2026-06-01T00:00:00.000Z",
    data: [{ schemaType: "sja_preday", version: 2, effectiveFrom: "2026-06-01", fields: { oppgave: { label: "Oppgave", type: "text", required: true }, godkjent: { label: "Godkjent", type: "boolean", required: true } } }],
  },
]);

const syncResponse = {
  serverTime: new Date().toISOString(),
  versions: [{ resourceType: "schemas", version: "3", updatedAt: new Date().toISOString() }],
  changes: [{ resourceType: "schemas", changeKind: "full", data: [...cache.get("schemas").data, sanitized] }],
};
const { updated } = cache.apply(syncResponse);
console.log("Synket ressurstyper:", updated.join(", "));

const active = resolveActiveSchemaDefinition("sja_preday", cache.get("schemas").data);
console.log("Aktiv sja_preday-versjon for nye dager:", "v" + active.version, "| konsekvens.autofillable:", active.fields.konsekvens.autofillable);

// ---------------------------------------------------------------
// Rule contract i praksis (Del 1), uavhengig av skjema-synken over
// ---------------------------------------------------------------
section("Regelkontrakt: en hendelse-registrering trigger RUH-krav");

/** @type {import('./types.mjs').Rule[]} */
const rules = [
  {
    id: "rule_ruh_on_hendelse",
    version: 1,
    effectiveFrom: "2026-01-01",
    trigger: { event: "entrySubmitted", entryType: "hendelse" },
    conditions: [],
    action: { type: "requireSchema", target: "ruh" },
    priority: 10,
    affects: { schemaTypes: ["ruh"] },
  },
  {
    id: "rule_friksjonsrunde_winter_morning",
    version: 1,
    effectiveFrom: "2026-01-01",
    trigger: { event: "dayStarted" },
    conditions: [
      { field: "isWinter", operator: "equals", value: true },
      { field: "hour", operator: "between", value: [4, 7] },
    ],
    action: { type: "requireSchema", target: "friksjonsrunde" },
    priority: 5,
    affects: { schemaTypes: ["friksjonsrunde"] },
  },
];

const matched = resolveMatchingRules(rules, { event: "entrySubmitted", entryType: "hendelse" }, {});
console.log(
  "Regler som trigges av entrySubmitted/hendelse:",
  matched.map((r) => r.id + " -> " + r.action.type + "(" + r.action.target + ")").join(", ") || "(ingen)"
);
const noMatchSummer = resolveMatchingRules(rules, { event: "dayStarted" }, { isWinter: false, hour: 6 });
console.log("Samme friksjonsregel om sommeren (isWinter=false):", noMatchSummer.length === 0 ? "trigges ikke (korrekt)" : "FEIL: trigget uventet");

// ---------------------------------------------------------------
// 4. Bruker fyller ut (motor eier fortsatt dette — simulert dayLog)
// ---------------------------------------------------------------
section("4. Bruker fyller ut SJA (schemaVersion pinnet til v3)");

/** @type {import('../../hooks/use-motor-state.js').DayLog} */
const dayLog = {
  date: "2026-07-01",
  startTime: "07:00",
  endTime: "15:00",
  phase: "ending",
  status: "LOCKED",
  entries: [{ time: "07:05", type: "notat", text: "Startet dagen" }],
  drafts: {},
  schemas: [
    {
      id: "schema_sja_2",
      type: "sja_preday",
      origin: "pre_day",
      status: "confirmed",
      schemaVersion: active.version,
      fields: {
        oppgave: "Grøfterensk",
        sted: "Fv. 22",
        risiko: "Trafikk",
        konsekvens: "Påkjørsel",
        tiltak: "Varsling og vernebekledning",
        godkjent: true,
      },
      createdAt: "2026-07-01T07:02:00.000Z",
      confirmedAt: "2026-07-01T07:04:00.000Z",
    },
  ],
};
console.log("Utfylt schema.fields:", JSON.stringify(dayLog.schemas[0].fields));
console.log("Pinnet schemaVersion:", dayLog.schemas[0].schemaVersion, "(uavhengig av senere registerendringer)");

// ---------------------------------------------------------------
// 5. Adapter returnerer resultat (Phase 2, uendret)
// ---------------------------------------------------------------
section("5. Adapter returnerer resultat");

const envelope = buildExportEnvelope(dayLog, { organizationId: "mesta", userId: "user_4471", deviceId: "dev_1", appVersion: "0.9.0" });
const result = await runAdapter(LandaxAdapter, envelope, (msg) => console.log(msg));
console.log("\nSluttresultat:", result);
console.log(
  "Sporbarhet bevart gjennom hele reisen: sourceSchemaId =",
  sanitized.metadata.sourceSchemaId,
  "| schemaType/felt-nøkler uendret fra Landax -> Hub -> Punchout -> Adapter -> Landax"
);
