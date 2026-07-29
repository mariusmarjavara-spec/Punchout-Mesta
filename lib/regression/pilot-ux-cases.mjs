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
];
