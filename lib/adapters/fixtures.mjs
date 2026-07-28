/**
 * Shared adapter-layer test fixtures — one canonical "day", reused by
 * the CLI dry-run script (lib/adapters/dry-run.mjs) and every
 * regression suite in lib/regression/adapter-*.mjs, instead of each
 * hand-rolling its own copy of the same DayLog.
 */

/** @type {import('../../hooks/use-motor-state').DayLog} */
export const SAMPLE_DAY_LOG = {
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

/** A DayLog with nothing confirmed — no entries, no schemas, no drafts. */
export const EMPTY_DAY_LOG = {
  date: "2026-07-01",
  startTime: null,
  endTime: null,
  phase: "idle",
  status: "LOCKED",
  entries: [],
  drafts: {},
  schemas: [],
  mainTimeHandled: false,
  externalTasks: [],
};

export const SAMPLE_CONTEXT = {
  organizationId: "mesta",
  userId: "user_4471",
  deviceId: "dev_pixel7_a1",
  appVersion: "0.9.0",
};

/**
 * A DayLog with N confirmed orders/schemas — used by contract/performance
 * tests to exercise "many packages" without hand-writing large fixtures.
 * @param {number} n
 * @returns {import('../../hooks/use-motor-state').DayLog}
 */
export function buildLargeDayLog(n) {
  const drafts = {};
  const entries = [];
  const schemas = [];
  for (let i = 0; i < n; i++) {
    const ordre = `20${1000 + i}-000${i}`;
    entries.push({ time: "07:0" + (i % 10), type: "ordre", text: `${ordre} arbeid ${i}` });
    drafts[ordre] = {
      ordre,
      dato: "2026-07-01",
      fra_tid: "07:00",
      til_tid: "15:00",
      arbeidsbeskrivelse: [`arbeid ${i}`],
      ressurser: [],
      lonnskoder: [{ kode: "100", fra: "07:00", til: "15:00" }],
      maskintimer: [{ maskintype: "hjullaster", timer: "1.0" }],
      entryIndices: [i],
      status: "confirmed",
    };
    schemas.push({
      id: `schema_${i}`,
      type: "sja_preday",
      origin: "pre_day",
      status: "confirmed",
      fields: { oppgave: `oppgave ${i}` },
      createdAt: "2026-07-01T07:00:00.000Z",
      confirmedAt: "2026-07-01T07:01:00.000Z",
    });
  }
  return { date: "2026-07-01", startTime: "07:00", endTime: "15:00", phase: "ending", status: "LOCKED", entries, drafts, schemas, mainTimeHandled: true, externalTasks: [] };
}
