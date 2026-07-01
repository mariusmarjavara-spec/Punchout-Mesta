/**
 * Del 6 dry run: organization publishes a new order list, a new machine,
 * and a new SJA version. A user opens Punchout. No network — the
 * "backend" is an in-memory mock, the "device" cache is an in-memory Map.
 *
 * Run with: node lib/sync/dry-run.mjs
 */
import { LocalCache, assembleOrganizationContext } from "./cache.mjs";
import { MockBackendProvider } from "./mock-backend-provider.mjs";
import { toRuntimeConfig } from "../organization/types.mjs";
import { resolveActiveSchemaDefinition, resolveSchemaDefinitionForInstance } from "../organization/schema-registry.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}

const organizationId = "mesta";
const deviceId = "dev_pixel7_a1";

// ---------------------------------------------------------------
// Device already has yesterday's data cached (orders v3, machines v1,
// schemas v2 — all about to be superseded; everything else current).
// ---------------------------------------------------------------
section("Utgangspunkt: lokal cache før synk (fra i går)");

const cache = new LocalCache([
  { resourceType: "orders", version: "3", updatedAt: "2026-07-01T06:00:00.000Z", data: [{ id: "HOVED", description: "Hovedordre", active: true }] },
  { resourceType: "machines", version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: [{ id: "m1", type: "hjullaster", label: "Hjullaster 12t" }] },
  { resourceType: "vehicles", version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: [{ regNr: "AB 12345" }, { regNr: "CD 67890" }, { regNr: "EF 11111" }] },
  { resourceType: "wageCodes", version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: [{ kode: "100", label: "Ordinær arbeidstid" }, { kode: "200", label: "Overtid 50%" }, { kode: "300", label: "Overtid 100%" }] },
  { resourceType: "schemas", version: "2", updatedAt: "2026-06-01T00:00:00.000Z", data: [{ schemaType: "sja_preday", version: 2, effectiveFrom: "2026-06-01", fields: { oppgave: { label: "Oppgave", type: "text", required: true }, godkjent: { label: "Godkjent", type: "boolean", required: true } } }] },
  { resourceType: "procedures", version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: [] },
  { resourceType: "externalLinks", version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: [{ id: "elrapp", title: "Logg inn i Elrapp", url: "https://elrapp.atlas.vegvesen.no/login" }, { id: "linx", title: "Linx-innlogging", url: "https://linx.no" }] },
  { resourceType: "config", version: "1", updatedAt: "2026-06-01T00:00:00.000Z", data: { name: "Mesta", sjaDefaults: { sted: "", arbeidsvarsling: "enkel" } } },
]);
console.log("Kjente versjoner på enheten:", cache.knownVersions().map((v) => `${v.resourceType}=${v.version}`).join(", "));

// ---------------------------------------------------------------
// Backend
// ---------------------------------------------------------------
section("Backend (MockBackendProvider) — SyncRequest -> SyncResponse");

/** @type {import('./types.mjs').SyncRequest} */
const request = { organizationId, deviceId, knownVersions: cache.knownVersions() };
console.log("SyncRequest:", JSON.stringify(request));

const response = await MockBackendProvider.fetchOrganizationContext(request);
console.log("SyncResponse.versions:", response.versions.map((v) => `${v.resourceType}=${v.version}`).join(", "));
console.log(
  "SyncResponse.changes:",
  response.changes.map((c) => `${c.resourceType}:${c.changeKind}`).join(", ")
);

// ---------------------------------------------------------------
// Local Cache — apply only what changed
// ---------------------------------------------------------------
section("Local Cache — hva som synkes vs. ignoreres");

const { updated, unchanged } = cache.apply(response);
console.log("SYNKET (ny data skrevet til cache):", updated.join(", "));
console.log("IGNORERT (uendret, cache rørt ikke):", unchanged.join(", "));

// ---------------------------------------------------------------
// Motor — consumes only the RuntimeConfig projection, never the cache
// or sync machinery directly.
// ---------------------------------------------------------------
section("Motor — RuntimeConfig slik motoren mottar den (uendret grensesnitt)");

const orgContext = assembleOrganizationContext(cache, organizationId);
const runtimeConfig = toRuntimeConfig(orgContext);
console.log(JSON.stringify(runtimeConfig, null, 2));
console.log(
  "\n(Motoren ser aldri orgContext, cache, SyncResponse eller MockBackendProvider — kun dette objektet, samme shape som public/punchout-config.js gir i dag.)"
);

// ---------------------------------------------------------------
// Start-fase — what a fresh day would now offer
// ---------------------------------------------------------------
section("Start-fase — hva brukeren møter");

console.log("Ordre tilgjengelig (hoofdordre):", runtimeConfig.hoofdordre);
console.log("Alle aktive ordre (fra orgContext, for fremtidig ordrevelger-UI):", orgContext.orders.map((o) => o.id).join(", "));
console.log("Maskiner i registeret:", orgContext.machines.map((m) => m.label).join(", "));

const activeSja = resolveActiveSchemaDefinition("sja_preday", orgContext.schemas);
console.log(
  "SJA-versjon en NY dag ville brukt:",
  activeSja ? `v${activeSja.version} (felter: ${Object.keys(activeSja.fields).join(", ")})` : "ingen"
);
console.log(
  "En allerede PÅGÅENDE dag (om noen fantes) ville fortsatt brukt sin opprinnelige pinnede versjon — sync rører aldri dayLog.schemas."
);

const hypotheticalOpenDaySchema = { schemaVersion: 2 };
const pinned = resolveSchemaDefinitionForInstance(hypotheticalOpenDaySchema, orgContext.schemas);
console.log(
  "Bevis: instans pinnet til v2 løses fortsatt til v2 selv om v3 nå finnes i registeret ->",
  pinned ? `v${pinned.version}` : "ikke funnet"
);
