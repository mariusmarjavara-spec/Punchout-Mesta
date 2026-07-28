/**
 * Execution Sprint 3 (Pilot UX Hardening) regression cases — pure logic
 * extracted from components/punchout/*.tsx so it's testable without a
 * jsdom/testing-library setup (this repo has neither; see
 * docs/execution-sprint-3-report.md).
 */
import { getUnconfirmedRequiredSchemas } from "../pilot-ux/required-schemas.mjs";
import { describeLockReason } from "../pilot-ux/lock-reason.mjs";

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
];
