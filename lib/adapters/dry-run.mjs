/**
 * Dry run: a full work day, produced by the motor (simulated here as a
 * hand-built DayLog fixture, since motor.js runs in a browser and isn't
 * invoked from Node), pushed through the adapter foundation to a mocked
 * Landax receiver. No real network call is made anywhere in this script.
 *
 * Run with: node lib/adapters/dry-run.mjs
 */
import { buildExportEnvelope } from "./envelope.mjs";
import { runAdapter } from "./adapter.mjs";
import { LandaxAdapter } from "./landax-adapter.mjs";

function section(title) {
  console.log("\n=== " + title + " ===");
}

// ---------------------------------------------------------------
// 1. Motor-data — what the deterministic engine produced for the day
//    (start dag -> SJA -> arbeid -> maskin -> avslutt dag -> lås dag)
// ---------------------------------------------------------------
section("1. Motor-data (DayLog etter lås)");

/** @type {import('../../hooks/use-motor-state').DayLog} */
const dayLog = {
  date: "2026-07-01",
  startTime: "07:00",
  startTimeSource: "user",
  endTime: "15:00",
  phase: "ending",
  status: "LOCKED",
  entries: [
    { time: "07:05", type: "notat", text: "Startet dagen, kjørt til anlegg" },
    { time: "07:40", type: "ordre", text: "204481-0014 fra 07:30 til 11:30 asfaltreparasjon" },
    { time: "12:15", type: "ordre", text: "204481-0014 fra 12:00 til 14:30 brøyting med hjullaster" },
  ],
  drafts: {
    "204481-0014": {
      ordre: "204481-0014",
      dato: "2026-07-01",
      fra_tid: "07:30",
      til_tid: "14:30",
      arbeidsbeskrivelse: ["asfaltreparasjon", "brøyting med hjullaster"],
      ressurser: ["hjullaster"],
      lonnskoder: [{ kode: "100", fra: "07:30", til: "14:30" }],
      maskintimer: [{ maskintype: "hjullaster", timer: "2.5" }],
      entryIndices: [1, 2],
      status: "confirmed",
    },
  },
  schemas: [
    {
      id: "schema_sja_1",
      type: "sja_preday",
      origin: "pre_day",
      status: "confirmed",
      fields: {
        oppgave: "Asfaltreparasjon og brøyting",
        sted: "Fv. 17, km 4-6",
        risiko: "Trafikk, glatt føre",
        konsekvens: "Påkjørsel, fall",
        tiltak: "Varsling, brøytebom, refleksvest",
        arbeidsvarsling: "enkel",
        godkjent: true,
      },
      createdAt: "2026-07-01T07:02:00.000Z",
      confirmedAt: "2026-07-01T07:04:00.000Z",
    },
  ],
  mainTimeHandled: true,
  externalTasks: [],
};

console.log(JSON.stringify(dayLog, null, 2));

// ---------------------------------------------------------------
// 2. ExportEnvelope — motor output repackaged into the stable contract
// ---------------------------------------------------------------
section("2. ExportEnvelope");

const context = {
  organizationId: "mesta",
  userId: "user_4471",
  deviceId: "dev_pixel7_a1",
  appVersion: "0.9.0",
};

const envelope = buildExportEnvelope(dayLog, context);
console.log(JSON.stringify(envelope, null, 2));

// ---------------------------------------------------------------
// 3. Transformert payload — LandaxAdapter.transform(envelope)
// ---------------------------------------------------------------
section("3. Transformert payload (Landax-format)");

const validation = LandaxAdapter.validate(envelope);
console.log("validate():", validation);
const payload = LandaxAdapter.transform(envelope);
console.log(JSON.stringify(payload, null, 2));

// ---------------------------------------------------------------
// 4. Mock respons — LandaxAdapter.send(payload, envelope), no real network
// ---------------------------------------------------------------
section("4. Mock respons");

const rawResponse = await LandaxAdapter.send(payload, envelope);
console.log(JSON.stringify(rawResponse, null, 2));

// ---------------------------------------------------------------
// 5. Sluttstatus — LandaxAdapter.handleResponse(rawResponse, envelope)
// ---------------------------------------------------------------
section("5. Sluttstatus");

const manualResult = LandaxAdapter.handleResponse(rawResponse, envelope);
console.log(manualResult);

// ---------------------------------------------------------------
// Proof that the GENERIC orchestrator (runAdapter) reproduces the same
// result end-to-end, driving the adapter purely through its interface —
// this is what a future ISYRoadAdapter/ElrappAdapter/ERPAdapter would
// also be driven by, unchanged.
// ---------------------------------------------------------------
section("Verifisering: runAdapter() generisk pipeline");

const officialResult = await runAdapter(LandaxAdapter, envelope, (msg) => console.log(msg));
console.log("\nresultat fra runAdapter():", officialResult);

const consistent =
  officialResult.ok === manualResult.ok &&
  officialResult.exportId === manualResult.exportId &&
  JSON.stringify(officialResult.response) === JSON.stringify(manualResult.response);

section("Oppsummering");
console.log("Pipeline fullført uten feil:", officialResult.ok);
console.log("runAdapter() og manuell stegvis kjøring gir samme resultat:", consistent);
