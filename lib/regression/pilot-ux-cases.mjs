/**
 * Execution Sprint 3 (Pilot UX Hardening) regression cases — pure logic
 * extracted from components/punchout/*.tsx so it's testable without a
 * jsdom/testing-library setup (this repo has neither; see
 * docs/execution-sprint-3-report.md).
 */
import { getUnconfirmedRequiredSchemas } from "../pilot-ux/required-schemas.mjs";
import { describeLockReason } from "../pilot-ux/lock-reason.mjs";
import { deriveSyncStatus } from "../pilot-ux/sync-status.mjs";
import { logUxEvent, getUxTelemetryLog, initUxTelemetrySync } from "../telemetry/ux-events.mjs";
import { isCrossTabConflictEvent, STORAGE_KEY_CURRENT } from "../pilot-ux/cross-tab-conflict.mjs";
import { buildAdminAuthHeader } from "../pilot-ux/ops-auth-header.mjs";
import { CsvAdapter } from "../adapters/csv-adapter.mjs";
import { readDraft, writeDraft } from "../pilot-ux/draft-storage.mjs";
import { shouldAllowSubmit } from "../pilot-ux/submit-guard.mjs";

/** Minimal in-memory fake satisfying the {getItem,setItem,removeItem} duck-type — no DOM/jsdom needed. */
function fakeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
    removeItem: (k) => { delete store[k]; },
    _dump: () => store,
  };
}

export const PILOT_UX_CASES = [
  {
    id: "pilot_ux_oppgave1_blocks_on_unconfirmed_required_schema",
    description: "Oppgave 1: a pre-day schema the (motor-supplied) predicate marks required and not yet confirmed is returned as blocking — this is what start-day-phase.tsx now shows an explanation for instead of silently no-oping.",
    run: () => {
      const schemas = [
        { type: "sja_preday", status: "draft" },
        { type: "kjoretoyssjekk", status: "confirmed" },
      ];
      const isRequired = (type) => type === "sja_preday";
      const result = getUnconfirmedRequiredSchemas(schemas, isRequired);
      return result.length === 1 && result[0].type === "sja_preday";
    },
  },
  {
    id: "pilot_ux_oppgave1_confirmed_required_schema_does_not_block",
    description: "Oppgave 1: once the required schema is confirmed, it no longer blocks — matches motor.js's own getRequiredSchemasNotConfirmed() semantics (status !== 'confirmed').",
    run: () => {
      const schemas = [{ type: "sja_preday", status: "confirmed" }];
      const isRequired = (type) => type === "sja_preday";
      return getUnconfirmedRequiredSchemas(schemas, isRequired).length === 0;
    },
  },
  {
    id: "pilot_ux_oppgave1_nothing_required_never_blocks",
    description: "Oppgave 1: when nothing is required (today's live default — ADMIN_CONFIG.requiredSchemas is empty in motor.js), no schema blocks regardless of status, matching current dormant-mechanism behavior exactly.",
    run: () => {
      const schemas = [
        { type: "sja_preday", status: "draft" },
        { type: "kjoretoyssjekk", status: "draft" },
      ];
      const isRequired = () => false;
      return getUnconfirmedRequiredSchemas(schemas, isRequired).length === 0;
    },
  },
  {
    id: "pilot_ux_oppgave2_lock_reason_matches_each_known_flag",
    description: "Oppgave 2: describeLockReason() covers every lock flag operations-phase.tsx's own isLocked check reads (vaktlogg confirm/discard, RUH yes/no, converted, keptAsNote) with a distinct, non-empty explanation for each.",
    run: () => {
      const cases = [
        { entry: { vaktloggConfirmed: true }, short: "Bekreftet" },
        { entry: { vaktloggDiscarded: true }, short: "Forkastet" },
        { entry: { ruhDecision: "yes" }, short: "RUH opprettet" },
        { entry: { ruhDecision: "no" }, short: "Ikke RUH" },
        { entry: { converted: true }, short: "Konvertert" },
        { entry: { keptAsNote: true }, short: "Beholdt" },
      ];
      return cases.every(({ entry, short }) => {
        const r = describeLockReason(entry);
        return r !== null && r.short === short && typeof r.full === "string" && r.full.length > 0;
      });
    },
  },
  {
    id: "pilot_ux_oppgave2_lock_reason_null_when_unlocked",
    description: "Oppgave 2: an entry with none of the known lock flags set (i.e. still editable) returns null, not a fabricated reason.",
    run: () => describeLockReason({}) === null,
  },
  {
    id: "pilot_ux_oppgave3_sync_status_synced_when_nothing_pending",
    description: "Oppgave 3: no pending/failed outbox entries -> 'synced' (indicator hidden), regardless of online/offline.",
    run: () =>
      deriveSyncStatus({ pending: 0, sent: 3, failed: 0 }, true) === "synced" &&
      deriveSyncStatus({ pending: 0, sent: 3, failed: 0 }, false) === "synced",
  },
  {
    id: "pilot_ux_oppgave3_sync_status_offline_pending_vs_syncing",
    description: "Oppgave 3: pending items map to 'offline_pending' when offline and 'syncing' when online — the one distinction the data (motor.js's merged pending+sending count) actually supports.",
    run: () =>
      deriveSyncStatus({ pending: 2, sent: 0, failed: 0 }, false) === "offline_pending" &&
      deriveSyncStatus({ pending: 2, sent: 0, failed: 0 }, true) === "syncing",
  },
  {
    id: "pilot_ux_oppgave3_sync_status_failed_takes_priority",
    description: "Oppgave 3: any failed export takes priority over pending/online state — a stuck failure should never be silently reported as 'syncing'.",
    run: () => deriveSyncStatus({ pending: 1, sent: 0, failed: 1 }, true) === "sync_failed",
  },
  {
    id: "pilot_ux_oppgave3_sync_status_handles_missing_outbox",
    description: "Oppgave 3: a null/undefined outboxStatus (e.g. before motor finishes booting) degrades to 'synced' rather than throwing.",
    run: () => deriveSyncStatus(undefined, true) === "synced" && deriveSyncStatus(null, false) === "synced",
  },
  {
    id: "pilot_ux_oppgave7_ux_telemetry_is_ssr_safe",
    description: "Oppgave 7: logUxEvent()/getUxTelemetryLog()/initUxTelemetrySync() never throw when window/localStorage don't exist (this Node regression run IS that environment) — required since Next.js can execute modules server-side.",
    run: () => {
      logUxEvent("RequiredSchemaBlocked", { schemaTypes: ["sja_preday"] });
      initUxTelemetrySync();
      const log = getUxTelemetryLog();
      return Array.isArray(log) && log.length === 0; // no storage -> nothing persisted, but no throw either
    },
  },
  {
    id: "hotfix1_cross_tab_conflict_key_matches_motor_js",
    description: "Hotfix 1: STORAGE_KEY_CURRENT here must stay in lockstep with motor.js:6's own constant (frozen, not exported) — this is the one invariant the whole conflict-detection hotfix depends on, so it's pinned by an explicit equality check, not just a comment.",
    run: () => STORAGE_KEY_CURRENT === "yournal_current_day",
  },
  {
    id: "hotfix1_cross_tab_conflict_detects_matching_key",
    description: "Hotfix 1: a storage event for the day-log key is recognized as a cross-tab conflict.",
    run: () => isCrossTabConflictEvent("yournal_current_day") === true,
  },
  {
    id: "hotfix1_cross_tab_conflict_ignores_other_keys",
    description: "Hotfix 1: storage events for unrelated keys (e.g. telemetry, history) and null (fired by localStorage.clear()) must NOT be treated as a conflict — a false positive here would train users to ignore the banner.",
    run: () =>
      isCrossTabConflictEvent("yournal_history") === false &&
      isCrossTabConflictEvent("yournal_telemetry") === false &&
      isCrossTabConflictEvent(null) === false,
  },
  {
    id: "hotfix2_ops_page_sends_bearer_header_when_token_present",
    description: "Hotfix 2: app/ops/page.tsx's fetch() must send Authorization: Bearer <token> once a token is entered — this is the exact fix for the page being unable to reach /api/operations-center after Execution Sprint 4's auth fix. Failed before the hotfix (the page sent no headers at all).",
    run: () => {
      const headers = buildAdminAuthHeader("real_admin_token");
      return headers.Authorization === "Bearer real_admin_token";
    },
  },
  {
    id: "hotfix2_ops_page_sends_no_auth_header_when_token_empty",
    description: "Hotfix 2: with no token entered yet, no Authorization header is sent at all (not 'Bearer undefined' or similar) — matches the server's existing 'missing bearer token' vs 'invalid token' distinction.",
    run: () => Object.keys(buildAdminAuthHeader("")).length === 0,
  },
  {
    id: "hotfix3_draft_missing_key_returns_empty_not_throw",
    description: "Hotfix 3: no draft saved yet (the normal case on first visit) reads back as an empty string, never throws — matches the pre-hotfix baseline of 'nothing typed'.",
    run: () => readDraft(fakeStorage(), "punchout_draft_input") === "",
  },
  {
    id: "hotfix3_draft_roundtrips_typed_text",
    description: "Hotfix 3: the exact bug — text typed into the manual input, then a simulated refresh (a fresh readDraft call, as if the page reloaded) must recover it. Would have failed before this hotfix: inputText was a plain useState, nothing was ever written for a later readDraft to find.",
    run: () => {
      const storage = fakeStorage();
      writeDraft(storage, "punchout_draft_input", "Jobbet på 204481-0014 fra 07:30");
      return readDraft(storage, "punchout_draft_input") === "Jobbet på 204481-0014 fra 07:30";
    },
  },
  {
    id: "hotfix3_draft_cleared_after_successful_submit",
    description: "Hotfix 3: once an entry is actually submitted, the draft must be cleared — otherwise a later, unrelated refresh would incorrectly resurrect already-logged text into the input box again.",
    run: () => {
      const storage = fakeStorage();
      writeDraft(storage, "punchout_draft_input", "en oppføring");
      writeDraft(storage, "punchout_draft_input", ""); // clearInputDraft()'s path
      return readDraft(storage, "punchout_draft_input") === "";
    },
  },
  {
    id: "hotfix4_submit_blocked_while_already_submitting",
    description: "Hotfix 4: the exact bug — a rapid second tap on 'Logg' while the first tap's 500ms debounce window is still open must be rejected, matching the isEnding/isContinuing/isLocking pattern already used elsewhere. Would have failed before this hotfix: handleSubmitEntry had no in-flight guard at all.",
    run: () => shouldAllowSubmit(true, "en tekst") === false,
  },
  {
    id: "hotfix4_submit_allowed_when_not_submitting_and_text_present",
    description: "Hotfix 4: the normal, single-tap case is unaffected by the new guard.",
    run: () => shouldAllowSubmit(false, "en tekst") === true,
  },
  {
    id: "hotfix4_submit_blocked_when_text_empty",
    description: "Hotfix 4: pre-existing behavior (disabled={!inputText.trim()}) preserved — whitespace-only text still doesn't submit.",
    run: () => shouldAllowSubmit(false, "   ") === false,
  },
  {
    id: "rc1_02_csv_starts_with_utf8_bom",
    description: "RC1-02: exported CSV must start with a UTF-8 BOM (EF BB BF / U+FEFF) so Excel doesn't fall back to the system ANSI codepage on double-click open — previously absent, risking misrendered æ/ø/å.",
    run: () => {
      const envelope = { exportId: "e1", dayId: "2026-07-29", schemaVersion: "1.0", entries: [{ time: "08:00", type: "notat", text: "test" }], timeEntries: [], machineHours: [] };
      const payload = CsvAdapter.transform(envelope);
      return payload.files["entries.csv"].startsWith("﻿");
    },
  },
  {
    id: "rc1_02_csv_uses_semicolon_delimiter",
    description: "RC1-02: columns must be semicolon-delimited, not comma — Norwegian-locale Excel uses comma as the decimal separator and expects semicolon as the list separator for automatic column-splitting on double-click open.",
    run: () => {
      const envelope = { exportId: "e1", dayId: "2026-07-29", schemaVersion: "1.0", entries: [{ time: "08:00", type: "notat", text: "test" }], timeEntries: [], machineHours: [] };
      const payload = CsvAdapter.transform(envelope);
      const headerLine = payload.files["entries.csv"].replace("﻿", "").split("\n")[0];
      return headerLine === "time;type;text";
    },
  },
  {
    id: "rc1_02_csv_preserves_norwegian_characters",
    description: "RC1-02: æ/ø/å must round-trip unchanged through transform() — the actual encoding correctness end-to-end acceptance testing found needed verifying, not just the BOM's presence.",
    run: () => {
      const text = "Åsveien, forbi Ørnhøgda bru — høyt og fuktig";
      const envelope = { exportId: "e1", dayId: "2026-07-29", schemaVersion: "1.0", entries: [{ time: "08:00", type: "notat", text }], timeEntries: [], machineHours: [] };
      const payload = CsvAdapter.transform(envelope);
      return payload.files["entries.csv"].includes(text);
    },
  },
  {
    id: "rc1_02_csv_escapes_field_containing_new_delimiter",
    description: "RC1-02: a field containing a semicolon (previously harmless under the comma delimiter) must now be quoted, since semicolon is the new delimiter — proves the escape trigger set was updated together with the delimiter, not just the delimiter alone.",
    run: () => {
      const envelope = { exportId: "e1", dayId: "2026-07-29", schemaVersion: "1.0", entries: [{ time: "08:00", type: "notat", text: "a; b" }], timeEntries: [], machineHours: [] };
      const payload = CsvAdapter.transform(envelope);
      const dataLine = payload.files["entries.csv"].split("\n")[1];
      return dataLine === '08:00;notat;"a; b"';
    },
  },
  {
    id: "rc1_02_csv_escapes_embedded_newline_and_quote",
    description: "RC1-02: a field with an embedded line break and a literal quote character must be wrapped in quotes with the quote doubled (RFC 4180), and the delimiter change must not have broken this pre-existing behavior.",
    run: () => {
      const text = 'Linje en\nLinje to med "sitat"';
      const envelope = { exportId: "e1", dayId: "2026-07-29", schemaVersion: "1.0", entries: [{ time: "08:00", type: "notat", text }], timeEntries: [], machineHours: [] };
      const payload = CsvAdapter.transform(envelope);
      return payload.files["entries.csv"].includes('"Linje en\nLinje to med ""sitat"""');
    },
  },
  {
    id: "rc1_02_csv_empty_field_stays_empty_not_undefined",
    description: "RC1-02: an empty/absent optional field renders as nothing between delimiters, never the literal string 'undefined' or 'null'.",
    run: () => {
      const envelope = { exportId: "e1", dayId: "2026-07-29", schemaVersion: "1.0", entries: [], timeEntries: [{ ordre: "GV-2026-0001", dato: "2026-07-29", fraTid: "07:30", tilTid: null, arbeidsbeskrivelse: [] }], machineHours: [] };
      const payload = CsvAdapter.transform(envelope);
      const dataLine = payload.files["time_entries.csv"].split("\n")[1];
      return dataLine === "GV-2026-0001;2026-07-29;07:30;;" && !dataLine.includes("undefined") && !dataLine.includes("null");
    },
  },
];
