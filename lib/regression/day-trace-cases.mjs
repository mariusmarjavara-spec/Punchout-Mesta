/**
 * DAY TRACE REGRESSION CASES
 * ==========================
 * The operator question is "what happened to this day?", and the answer has to
 * hold in the cases where it is hardest to get: a day that was refused at
 * ingest and therefore has no Relay record at all, and a day that was never
 * sent, where the honest answer is "this server has never heard of it" rather
 * than any claim about the device.
 *
 * Most cases drive `buildDayTrace` directly, because it is pure and the
 * composition is the logic worth pinning. The last few go through the real
 * Relay store so the shapes this depends on are the shapes that actually exist.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDayTrace,
  decisiveAttempt,
  summarizeDelivery,
} from "../operations-center/day-trace.mjs";

/**
 * Do NOT claim PUNCHOUT_DATA_DIR if something already set it.
 *
 * relay-cases.mjs sets it at module load and explains why isolating by
 * directory is the wrong axis: the store reads the variable once, at load, so a
 * later reassignment hands this file a store instance still bound to the
 * earlier directory while pointing new writes somewhere else. Overwriting it
 * here broke six relay cases with ENOENT before this guard existed — they were
 * reading from the directory they had been created in, which this file had
 * quietly moved.
 *
 * Isolation is by ORGANIZATION, exactly as relay-cases.mjs does it, which is
 * also what production looks like: one server, many organizations, the store's
 * own directory-level separation doing the work.
 */
if (!process.env.PUNCHOUT_DATA_DIR) {
  process.env.PUNCHOUT_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "punchout-daytrace-"));
}

const store = await import("../relay/store.mjs");

let counter = 0;
function freshOrg() {
  counter += 1;
  return `dtcase${counter}`;
}

function packetFor(exportId) {
  return {
    exportId,
    userId: "user_dt_1",
    dayId: "2026-08-20",
    createdAt: "2026-08-20T15:30:00.000Z",
    exportVersion: "1.0",
    payload: { entries: [], schemas: [], timeEntries: [], machineHours: [] },
  };
}

function stageOf(trace, name) {
  return trace.stages.find((s) => s.stage === name);
}

export const DAY_TRACE_CASES = [
  {
    id: "day_trace_never_arrived_is_unknown_not_a_failure",
    description:
      "A day the server has never received must read as UNKNOWN at every stage. The server cannot see a device it has not heard from, and reporting 'not recorded' would be a confident claim about a phone this process knows nothing about.",
    run: () => {
      const trace = buildDayTrace({ exportId: "exp_missing", organizationId: "mesta" });
      return (
        trace.outcome === "NEVER_ARRIVED" &&
        trace.stages.length === 7 &&
        trace.stages.every((s) => s.status === "UNKNOWN") &&
        trace.evidence.relayRecord === false &&
        trace.evidence.exportLogEntries === 0
      );
    },
  },
  {
    id: "day_trace_answers_for_a_day_the_relay_never_received",
    description:
      "THE GAP THIS EXISTS TO CLOSE. A day rejected at ingest has no Relay record, so /api/relay answers 404 and the operator learns nothing from the surface that looks like it should know. The rejection was recorded in the export log the whole time. The trace must join the two and name the reason.",
    run: () => {
      const trace = buildDayTrace({
        exportId: "exp_rejected",
        organizationId: "mesta",
        exportEntries: [
          {
            receivedAt: "2026-08-20T16:00:00.000Z",
            exportId: "exp_rejected",
            organizationId: "mesta",
            deviceId: "dev_9",
            signatureValid: false,
            rejectedReason: "device_disabled",
          },
        ],
        relayRecord: null,
      });
      return (
        trace.outcome === "REJECTED_AT_INGEST" &&
        stageOf(trace, "SIGNED").status === "FAILED" &&
        stageOf(trace, "SIGNED").detail.includes("device_disabled") &&
        stageOf(trace, "ACCEPTED_BY_RELAY").status === "FAILED" &&
        trace.evidence.rejectedReason === "device_disabled" &&
        trace.identity.deviceId === "dev_9" &&
        typeof trace.operatorAction === "string" &&
        trace.operatorAction.length > 0
      );
    },
  },
  {
    id: "day_trace_does_not_claim_the_day_was_recorded_when_it_was_refused",
    description:
      "A refused export never had its payload stored, so whether the day was recorded and locked on the device is genuinely unobservable from here. Those stages must be UNKNOWN rather than OK or FAILED — the server has no evidence either way.",
    run: () => {
      const trace = buildDayTrace({
        exportId: "exp_r2",
        exportEntries: [
          { receivedAt: "2026-08-20T16:00:00.000Z", exportId: "exp_r2", deviceId: "d", signatureValid: false, rejectedReason: "unregistered_device" },
        ],
      });
      return (
        stageOf(trace, "RECORDED").status === "UNKNOWN" &&
        stageOf(trace, "LOCKED").status === "UNKNOWN"
      );
    },
  },
  {
    id: "day_trace_prefers_the_accepted_attempt_over_an_earlier_rejection",
    description:
      "A device retrying after a rejection is ordinary. Once an attempt succeeded, the day's fate is acceptance — an operator must not be shown the stale failure as the live answer.",
    run: () => {
      const entries = [
        { receivedAt: "2026-08-20T10:00:00.000Z", exportId: "e", signatureValid: false, rejectedReason: "device_disabled" },
        { receivedAt: "2026-08-20T11:00:00.000Z", exportId: "e", signatureValid: true },
      ];
      const chosen = decisiveAttempt(entries);
      return chosen.signatureValid === true && chosen.receivedAt === "2026-08-20T11:00:00.000Z";
    },
  },
  {
    id: "day_trace_shows_the_latest_rejection_when_none_succeeded",
    description:
      "With no accepted attempt, the most recent rejection is the live explanation. Showing the first one would describe a problem that may already have been replaced by a different one.",
    run: () => {
      const chosen = decisiveAttempt([
        { receivedAt: "2026-08-20T10:00:00.000Z", exportId: "e", signatureValid: false, rejectedReason: "unregistered_device" },
        { receivedAt: "2026-08-20T12:00:00.000Z", exportId: "e", signatureValid: false, rejectedReason: "device_disabled" },
      ]);
      return chosen.rejectedReason === "device_disabled";
    },
  },
  {
    id: "day_trace_marks_device_asserted_identity_as_unverified",
    description:
      "userId is asserted by the device and never proven. The trace surfaces it, so it must also surface that it is unverified — an operations screen is exactly where a device-asserted string would otherwise start being read as identity.",
    run: () => {
      const trace = buildDayTrace({
        exportId: "e",
        relayRecord: { exportId: "e", organizationId: "mesta", deviceId: "d", userId: "user_1", userIdVerified: false, receivedAt: "2026-08-20T16:00:00.000Z" },
      });
      return trace.identity.userId === "user_1" && trace.identity.userIdVerified === false;
    },
  },
  {
    id: "day_trace_in_custody_is_distinct_from_delivered",
    description:
      "A day held by the Relay with no adapter asked for it yet is safe but not sent. Collapsing that into either 'delivered' or 'failed' is the distinction an operator most needs.",
    run: () => {
      const trace = buildDayTrace({
        exportId: "e",
        relayRecord: { exportId: "e", organizationId: "o", deviceId: "d", receivedAt: "2026-08-20T16:00:00.000Z", lockedAt: "2026-08-20T15:00:00.000Z" },
        deliveryTargets: {},
      });
      return (
        trace.outcome === "IN_CUSTODY_UNDELIVERED" &&
        stageOf(trace, "ACCEPTED_BY_RELAY").status === "OK" &&
        stageOf(trace, "LOCKED").status === "OK" &&
        stageOf(trace, "TRANSFORMED").status === "PENDING" &&
        stageOf(trace, "DESTINATION_OUTCOME").status === "PENDING"
      );
    },
  },
  {
    id: "day_trace_names_the_adapter_and_the_attempt_count",
    description:
      "'Transformed by which adapter' and 'did it retry' are two of the questions this surface exists to answer, so the target name and the attempt count must both appear rather than being implied by a status.",
    run: () => {
      const trace = buildDayTrace({
        exportId: "e",
        relayRecord: { exportId: "e", organizationId: "o", deviceId: "d", receivedAt: "2026-08-20T16:00:00.000Z" },
        deliveryTargets: {
          "csv-file": {
            status: "DELIVERED",
            attempts: 3,
            history: [{ at: "2026-08-20T17:00:00.000Z", from: "DELIVERING", to: "DELIVERED" }],
          },
        },
      });
      return (
        trace.outcome === "DELIVERED" &&
        stageOf(trace, "TRANSFORMED").detail.includes("csv-file") &&
        stageOf(trace, "DELIVERY_ATTEMPTED").detail.includes("3 attempt") &&
        stageOf(trace, "DESTINATION_OUTCOME").at === "2026-08-20T17:00:00.000Z" &&
        trace.delivery[0].attempts === 3
      );
    },
  },
  {
    id: "day_trace_delivery_precedence_keeps_partial_and_terminal_apart",
    description:
      "Two targets with different fates must not collapse to whichever is read first. An in-flight delivery dominates, a mixed result is partial, and terminal failure is only terminal when nothing succeeded.",
    run: () => {
      const t = (status) => ({ target: "x", status, attempts: 1, lastTransitionAt: null, history: [] });
      return (
        summarizeDelivery([t("DELIVERED"), t("FAILED_FINAL")]) === "PARTIALLY_DELIVERED" &&
        summarizeDelivery([t("DELIVERING"), t("FAILED_FINAL")]) === "DELIVERING" &&
        summarizeDelivery([t("FAILED_FINAL"), t("FAILED_FINAL")]) === "FAILED_FINAL" &&
        summarizeDelivery([t("FAILED_RETRYABLE")]) === "RETRYING" &&
        summarizeDelivery([t("DELIVERED"), t("DELIVERED")]) === "DELIVERED" &&
        summarizeDelivery([]) === "IN_CUSTODY_UNDELIVERED"
      );
    },
  },
  {
    id: "day_trace_reads_the_real_relay_record_shape",
    description:
      "The pure cases above supply their own record shapes, which proves the composition and not the coupling. This one receives a genuine export through the real store and traces what actually came back, so a future change to RelayRecord cannot pass the suite while breaking the operator surface.",
    run: () => {
      const org = freshOrg();
      const packet = packetFor("exp_real_1");
      const received = store.receiveExport({
        exportId: packet.exportId,
        organizationId: org,
        deviceId: "dev_real",
        packet,
        runtimeVersion: "7",
      });
      const trace = buildDayTrace({
        exportId: packet.exportId,
        organizationId: org,
        exportEntries: [{ receivedAt: received.record.receivedAt, exportId: packet.exportId, organizationId: org, deviceId: "dev_real", signatureValid: true }],
        relayRecord: store.readRelayRecord(org, packet.exportId),
        deliveryTargets: store.readDeliveryState(org, packet.exportId).targets,
      });
      return (
        received.stored === true &&
        trace.outcome === "IN_CUSTODY_UNDELIVERED" &&
        trace.identity.dayId === "2026-08-20" &&
        trace.identity.runtimeVersion === "7" &&
        trace.identity.userIdVerified === false &&
        stageOf(trace, "RECORDED").status === "OK" &&
        stageOf(trace, "LOCKED").at === "2026-08-20T15:30:00.000Z"
      );
    },
  },
  {
    id: "day_trace_follows_a_real_delivery_through_to_the_destination",
    description:
      "End to end against the real store and its real state machine: received, made ready, delivered. The trace must report DELIVERED with the target named and a transition timestamp taken from the store rather than invented.",
    run: () => {
      const org = freshOrg();
      const packet = packetFor("exp_real_2");
      store.receiveExport({ exportId: packet.exportId, organizationId: org, deviceId: "dev_real", packet });
      store.transitionDelivery(org, packet.exportId, "csv-file", "READY");
      store.transitionDelivery(org, packet.exportId, "csv-file", "DELIVERING", { countAttempt: true });
      store.transitionDelivery(org, packet.exportId, "csv-file", "DELIVERED");

      const trace = buildDayTrace({
        exportId: packet.exportId,
        organizationId: org,
        relayRecord: store.readRelayRecord(org, packet.exportId),
        deliveryTargets: store.readDeliveryState(org, packet.exportId).targets,
      });
      return (
        trace.outcome === "DELIVERED" &&
        trace.delivery.length === 1 &&
        trace.delivery[0].target === "csv-file" &&
        trace.delivery[0].attempts === 1 &&
        typeof stageOf(trace, "DESTINATION_OUTCOME").at === "string" &&
        stageOf(trace, "DESTINATION_OUTCOME").status === "OK"
      );
    },
  },
];
