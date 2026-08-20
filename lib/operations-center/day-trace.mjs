/**
 * DAY TRACE — "what happened to this day?", answered from existing evidence.
 *
 * The facts needed to answer that question already exist. They are simply
 * scattered across three places that no single surface joins:
 *
 *   - `exportLog` (lib/backend/state.mjs) knows every export ATTEMPT, including
 *     the ones that were turned away: unregistered device, disabled device,
 *     bad signature. Each carries `rejectedReason`.
 *   - the Relay record (lib/relay/store.mjs) knows every export that was
 *     ACCEPTED — the locked workday itself, its device, its runtime version.
 *   - the delivery state knows what happened AFTERWARDS, per target, with a
 *     full transition history and an attempt count.
 *
 * The gap this closes is specific and was the hard case. A rejected day never
 * reaches the Relay, so `GET /api/relay?org=…&exportId=…` answers 404 — and an
 * operator asking "where is Tuesday?" learns nothing from the surface that
 * looks like it should know. The rejection is recorded, just not anywhere the
 * operator was looking. Joining the two sources is the whole job.
 *
 * Deliberately pure and I/O-free: it receives evidence and returns a reading of
 * it. No new state is persisted anywhere — there is nothing here that could
 * drift from the truth it describes, because it owns none of it.
 */

/**
 * The stages an operator actually asks about, in the order a day passes
 * through them.
 */
export const TRACE_STAGES = /** @type {const} */ ([
  "RECORDED",
  "LOCKED",
  "SIGNED",
  "ACCEPTED_BY_RELAY",
  "TRANSFORMED",
  "DELIVERY_ATTEMPTED",
  "DESTINATION_OUTCOME",
]);

/**
 * `UNKNOWN` is a first-class answer and not a failure.
 *
 * The server cannot see a day that was never exported. Reporting that as "not
 * recorded" would be a claim about a device this process has never heard from,
 * which is exactly the kind of confident wrong answer an operations surface
 * must not give.
 */
export const STAGE_STATUS = /** @type {const} */ (["OK", "FAILED", "PENDING", "UNKNOWN"]);

/**
 * The one-line answer, chosen so an operator can act on it without reading the
 * stages underneath.
 */
export const TRACE_OUTCOMES = /** @type {const} */ ([
  /** Nothing was ever received for this id. The day may still be on the device. */
  "NEVER_ARRIVED",
  /** The server saw it and turned it away. Nothing is in custody. */
  "REJECTED_AT_INGEST",
  /** Accepted and held, but no delivery has been attempted yet. */
  "IN_CUSTODY_UNDELIVERED",
  /** A delivery is in flight right now. */
  "DELIVERING",
  /** Delivered to at least one destination, none outstanding. */
  "DELIVERED",
  /** Failed, but the state machine allows another attempt. */
  "RETRYING",
  /** Failed terminally. The payload is still held; this is an outcome, not a loss. */
  "FAILED_FINAL",
  /** Delivered to one target while another is unresolved. */
  "PARTIALLY_DELIVERED",
]);

function stage(name, status, detail, at = null) {
  return { stage: name, status, detail, at };
}

/**
 * Pick the export-log entry that decided this day's fate.
 *
 * A single exportId can appear more than once — a device retrying after a
 * rejection is the ordinary case. The accepted attempt is what matters if one
 * exists, because acceptance is terminal for ingest; otherwise the most recent
 * rejection is the live explanation, not the first one.
 */
export function decisiveAttempt(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (list.length === 0) return null;
  const accepted = list.filter((e) => e.signatureValid === true && !e.rejectedReason);
  const pool = accepted.length > 0 ? accepted : list;
  return pool.reduce((latest, e) =>
    !latest || String(e.receivedAt ?? "") >= String(latest.receivedAt ?? "") ? e : latest,
  null);
}

/**
 * Reduce one target's delivery state to a stage reading.
 * `attempts` is reported as-is: an operator asking "did it retry?" wants the
 * count, not a boolean derived from it.
 */
function readTarget(name, state) {
  const status = state?.status ?? "RECEIVED";
  const attempts = state?.attempts ?? 0;
  const history = Array.isArray(state?.history) ? state.history : [];
  const lastAt = history.length > 0 ? history[history.length - 1].at : null;
  return { target: name, status, attempts, lastTransitionAt: lastAt, history };
}

/**
 * Collapse per-target outcomes into the single answer.
 *
 * Kept separate from `buildDayTrace` so the precedence is inspectable on its
 * own: any in-flight delivery dominates, then terminal failure, then a mix,
 * then success.
 */
export function summarizeDelivery(targets) {
  if (targets.length === 0) return "IN_CUSTODY_UNDELIVERED";

  const statuses = targets.map((t) => t.status);
  if (statuses.includes("DELIVERING")) return "DELIVERING";

  const delivered = statuses.filter((s) => s === "DELIVERED").length;
  const finalFailed = statuses.filter((s) => s === "FAILED_FINAL").length;
  const retryable = statuses.filter((s) => s === "FAILED_RETRYABLE").length;

  if (delivered === statuses.length) return "DELIVERED";
  if (finalFailed === statuses.length) return "FAILED_FINAL";
  if (delivered > 0) return "PARTIALLY_DELIVERED";
  if (retryable > 0) return "RETRYING";
  if (finalFailed > 0) return "FAILED_FINAL";
  return "IN_CUSTODY_UNDELIVERED";
}

/**
 * Build the trace.
 *
 * @param {object} input
 * @param {string} input.exportId
 * @param {string|null} [input.organizationId]
 * @param {Array<object>} [input.exportEntries]  every exportLog row for this exportId
 * @param {object|null} [input.relayRecord]      the stored RelayRecord, if accepted
 * @param {Record<string, object>} [input.deliveryTargets] delivery state, keyed by target
 */
export function buildDayTrace({
  exportId,
  organizationId = null,
  exportEntries = [],
  relayRecord = null,
  deliveryTargets = {},
}) {
  const attempt = decisiveAttempt(exportEntries);
  const targets = Object.entries(deliveryTargets ?? {}).map(([name, s]) => readTarget(name, s));

  const stages = [];

  // ── Never seen at all ────────────────────────────────────────────────────
  if (!attempt && !relayRecord) {
    for (const name of TRACE_STAGES) {
      stages.push(
        stage(
          name,
          "UNKNOWN",
          "No export attempt for this id has reached this server. The day may still be held on the device, or the id may be wrong.",
        ),
      );
    }
    return {
      exportId,
      organizationId,
      outcome: "NEVER_ARRIVED",
      headline: "No export with this id has ever reached the server.",
      operatorAction:
        "Check the id, then check the device: an unsent day stays on the device until it is exported.",
      stages,
      identity: { deviceId: null, userId: null, dayId: null, runtimeVersion: null },
      delivery: [],
      evidence: { exportLogEntries: 0, relayRecord: false },
    };
  }

  const rejected = Boolean(attempt?.rejectedReason) || attempt?.signatureValid === false;

  // ── Recorded and locked ─────────────────────────────────────────────────
  // Both are device-side facts. The server only ever learns them by receiving
  // the packet, so an accepted record is the evidence and a rejection leaves
  // them genuinely unknown rather than false.
  if (relayRecord) {
    stages.push(
      stage("RECORDED", "OK", "The workday arrived with its full payload, so it was recorded on the device."),
    );
    stages.push(
      relayRecord.lockedAt
        ? stage("LOCKED", "OK", "Locked on the device before export.", relayRecord.lockedAt)
        : stage("LOCKED", "UNKNOWN", "The record carries no lock timestamp."),
    );
  } else {
    stages.push(
      stage(
        "RECORDED",
        "UNKNOWN",
        "The export was turned away before its payload was stored, so the server never saw the day's contents.",
      ),
    );
    stages.push(stage("LOCKED", "UNKNOWN", "Not observable — the payload was never accepted."));
  }

  // ── Signed ───────────────────────────────────────────────────────────────
  if (rejected) {
    const reason = attempt?.rejectedReason ?? "invalid_signature";
    stages.push(
      stage(
        "SIGNED",
        "FAILED",
        `Rejected at ingest: ${reason}.`,
        attempt?.receivedAt ?? null,
      ),
    );
  } else {
    stages.push(
      stage("SIGNED", "OK", "Signature verified against the device secret.", attempt?.receivedAt ?? null),
    );
  }

  // ── Accepted by the Relay ────────────────────────────────────────────────
  if (relayRecord) {
    stages.push(
      stage("ACCEPTED_BY_RELAY", "OK", "Held in Relay custody with its payload.", relayRecord.receivedAt ?? null),
    );
  } else {
    stages.push(
      stage(
        "ACCEPTED_BY_RELAY",
        "FAILED",
        rejected
          ? "Never entered custody — ingest rejected it."
          : "Accepted at ingest but not stored by the Relay. This is the case GET /api/health reports as relayed:false.",
        attempt?.receivedAt ?? null,
      ),
    );
  }

  // ── Transformed / attempted / outcome ────────────────────────────────────
  if (targets.length === 0) {
    const detail = relayRecord
      ? "No adapter has been asked for this day yet."
      : "Not applicable — nothing is in custody to transform.";
    const status = relayRecord ? "PENDING" : "UNKNOWN";
    stages.push(stage("TRANSFORMED", status, detail));
    stages.push(stage("DELIVERY_ATTEMPTED", status, detail));
    stages.push(stage("DESTINATION_OUTCOME", status, detail));
  } else {
    const names = targets.map((t) => t.target).join(", ");
    stages.push(stage("TRANSFORMED", "OK", `Adapter(s) engaged: ${names}.`));

    const attempted = targets.filter((t) => t.attempts > 0);
    stages.push(
      attempted.length > 0
        ? stage(
            "DELIVERY_ATTEMPTED",
            "OK",
            attempted
              .map((t) => `${t.target}: ${t.attempts} attempt(s)`)
              .join("; "),
            attempted.map((t) => t.lastTransitionAt).filter(Boolean).sort().pop() ?? null,
          )
        : stage("DELIVERY_ATTEMPTED", "PENDING", `Queued for ${names}, not yet attempted.`),
    );

    stages.push(
      stage(
        "DESTINATION_OUTCOME",
        targets.every((t) => t.status === "DELIVERED")
          ? "OK"
          : targets.some((t) => t.status === "FAILED_FINAL")
            ? "FAILED"
            : "PENDING",
        targets.map((t) => `${t.target}: ${t.status}`).join("; "),
        targets.map((t) => t.lastTransitionAt).filter(Boolean).sort().pop() ?? null,
      ),
    );
  }

  const outcome = !relayRecord
    ? rejected
      ? "REJECTED_AT_INGEST"
      : "IN_CUSTODY_UNDELIVERED"
    : summarizeDelivery(targets);

  return {
    exportId,
    organizationId: relayRecord?.organizationId ?? attempt?.organizationId ?? organizationId,
    outcome,
    headline: HEADLINES[outcome] ?? outcome,
    operatorAction: ACTIONS[outcome] ?? null,
    stages,
    identity: {
      deviceId: relayRecord?.deviceId ?? attempt?.deviceId ?? null,
      userId: relayRecord?.userId ?? null,
      /** Device-asserted and never proven — surfaced so nobody treats it as identity. */
      userIdVerified: relayRecord?.userIdVerified ?? false,
      dayId: relayRecord?.dayId ?? null,
      runtimeVersion: relayRecord?.runtimeVersion ?? null,
      exportVersion: relayRecord?.exportVersion ?? null,
    },
    delivery: targets,
    evidence: {
      exportLogEntries: Array.isArray(exportEntries) ? exportEntries.length : 0,
      relayRecord: Boolean(relayRecord),
      rejectedReason: attempt?.rejectedReason ?? null,
    },
  };
}

const HEADLINES = {
  NEVER_ARRIVED: "No export with this id has ever reached the server.",
  REJECTED_AT_INGEST: "The server received this day and refused it. Nothing is in custody.",
  IN_CUSTODY_UNDELIVERED: "The day is safely held, and has not been sent onward yet.",
  DELIVERING: "A delivery is in flight right now.",
  DELIVERED: "Delivered to every destination that was asked for.",
  RETRYING: "Delivery failed and is eligible to be retried.",
  FAILED_FINAL: "Delivery failed terminally. The day is still held — this is an outcome, not a loss.",
  PARTIALLY_DELIVERED: "Delivered to one destination while another is still unresolved.",
};

const ACTIONS = {
  NEVER_ARRIVED: "Check the id, then check the device: an unsent day stays on the device until it is exported.",
  REJECTED_AT_INGEST:
    "Read the rejection reason. A disabled or unregistered device must be fixed in the device registry before the day can be re-sent.",
  IN_CUSTODY_UNDELIVERED: "Dispatch it: POST /api/relay {org, exportId, target}.",
  DELIVERING: "Wait. If it stays here, reclaimStuckDeliveries() returns it to READY.",
  DELIVERED: "Nothing to do.",
  RETRYING: "Re-dispatch when the destination is healthy again.",
  FAILED_FINAL: "Investigate the destination. The payload is still in the Relay and can be re-targeted.",
  PARTIALLY_DELIVERED: "Dispatch the outstanding target.",
};
