/**
 * RELAY DISPATCHER — drives the delivery state machine over registered targets.
 * ============================================================================
 *
 * OWNERSHIP, stated once so it stays clear as targets multiply:
 *   the Relay store  owns DURABLE CUSTODY and DELIVERY STATE;
 *   a target         owns TRANSLATION and DOWNSTREAM COMMUNICATION;
 *   this dispatcher  owns only the TRANSITIONS between them.
 *
 * No target may write delivery state, and the store knows nothing about CSV,
 * payroll, or any receiver. That is what lets a payroll adapter be added later
 * without touching either side.
 *
 * The dispatcher never deletes a payload. Every failure path ends in a state,
 * not in a removal — a downstream integration that is broken, misconfigured or
 * permanently rejecting cannot erase the field record.
 */
import {
  listRelayExportIds,
  readRelayRecord,
  getTargetState,
  transitionDelivery,
  reclaimStuckDeliveries,
} from "./store.mjs";
import { CsvFileTarget } from "./targets/csv-file-target.mjs";

/**
 * Target registry — data, not switch statements, matching
 * lib/adapters/registry.mjs's existing posture. A new receiver is one entry.
 * @type {Map<string, {name: string, version: string, deliver: Function}>}
 */
const targets = new Map();

export function registerTarget(target) {
  if (!target || !target.name || typeof target.deliver !== "function") {
    throw new Error("registerTarget: target must have a name and a deliver() function");
  }
  targets.set(target.name, target);
}

export function getTarget(name) {
  const target = targets.get(name);
  if (!target) {
    const known = [...targets.keys()].join(", ") || "(none registered)";
    throw new Error(`getTarget: no relay target registered as "${name}" — known targets: ${known}`);
  }
  return target;
}

export function listTargets() {
  return [...targets.values()].map((t) => ({ name: t.name, version: t.version }));
}

registerTarget(CsvFileTarget);

/** States from which a dispatch run may legitimately attempt delivery. */
const DISPATCHABLE = new Set(["RECEIVED", "READY", "FAILED_RETRYABLE"]);

/**
 * Deliver ONE relay record to ONE target, walking the full state machine.
 *
 * RECEIVED/FAILED_RETRYABLE -> READY -> DELIVERING -> DELIVERED | FAILED_*
 *
 * The DELIVERING state is written to disk BEFORE the attempt, not after. That
 * is deliberate: if the process dies mid-attempt, the record is left in
 * DELIVERING and reclaimStuckDeliveries() can find it. Marking only on
 * completion would make a crashed attempt indistinguishable from one that was
 * never started.
 *
 * @returns {{exportId: string, target: string, status: string, ok: boolean, error?: string, receipt?: any, skipped?: boolean}}
 */
export function deliverOne(organizationId, exportId, targetName, opts = {}) {
  const target = getTarget(targetName);
  const record = readRelayRecord(organizationId, exportId);
  if (!record) {
    return { exportId, target: targetName, status: "UNKNOWN", ok: false, error: "no relay record" };
  }

  const current = getTargetState(organizationId, exportId, targetName);

  if (current.status === "DELIVERED") {
    // Already delivered. Not an error, and deliberately NOT re-attempted:
    // exactly one logical delivery per logical export.
    return { exportId, target: targetName, status: "DELIVERED", ok: true, skipped: true, receipt: current.receipt };
  }
  if (current.status === "FAILED_FINAL") {
    return { exportId, target: targetName, status: "FAILED_FINAL", ok: false, skipped: true, error: current.lastError ?? "previously failed permanently" };
  }
  if (!DISPATCHABLE.has(current.status)) {
    return { exportId, target: targetName, status: current.status, ok: false, skipped: true, error: `not dispatchable from ${current.status}` };
  }

  // RECEIVED/FAILED_RETRYABLE -> READY. The record has already passed
  // signature verification at /api/export (nothing else can enter the Relay),
  // so "validated" here means "eligible for this target".
  if (current.status !== "READY") {
    const ready = transitionDelivery(organizationId, exportId, targetName, "READY", { note: "validated for target" });
    if (!ready.ok) return { exportId, target: targetName, status: current.status, ok: false, error: ready.error };
  }

  const delivering = transitionDelivery(organizationId, exportId, targetName, "DELIVERING", { countAttempt: true });
  if (!delivering.ok) {
    return { exportId, target: targetName, status: "READY", ok: false, error: delivering.error };
  }

  let result;
  try {
    result = target.deliver(record, opts);
  } catch (e) {
    // A target that throws is treated as retryable: an unexpected exception is
    // more likely a transient environment fault than a permanent rejection,
    // and a retryable state loses nothing (the payload is untouched) whereas a
    // wrongly-final state would need manual intervention.
    result = { ok: false, retryable: true, error: `target threw: ${e?.message || e}` };
  }

  if (result.ok) {
    const done = transitionDelivery(organizationId, exportId, targetName, "DELIVERED", { receipt: result.receipt ?? null });
    return { exportId, target: targetName, status: "DELIVERED", ok: true, receipt: done.state?.receipt };
  }

  const nextStatus = result.retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL";
  transitionDelivery(organizationId, exportId, targetName, nextStatus, { error: result.error ?? "unknown delivery error" });
  return { exportId, target: targetName, status: nextStatus, ok: false, error: result.error };
}

/**
 * Deliver every pending record for one organization to one target.
 * Reclaims crash-orphaned DELIVERING records first, so a dispatch run after a
 * server restart resumes rather than stalls.
 *
 * @returns {{organizationId: string, target: string, reclaimed: number, attempted: number, delivered: number, failed: number, skipped: number, results: any[]}}
 */
export function dispatchPending(organizationId, targetName = CsvFileTarget.name, opts = {}) {
  const reclaimed = reclaimStuckDeliveries(organizationId);
  const results = [];
  for (const exportId of listRelayExportIds(organizationId)) {
    const state = getTargetState(organizationId, exportId, targetName);
    if (state.status === "DELIVERED" || state.status === "FAILED_FINAL") continue;
    results.push(deliverOne(organizationId, exportId, targetName, opts));
  }
  return {
    organizationId,
    target: targetName,
    reclaimed,
    attempted: results.length,
    delivered: results.filter((r) => r.ok && !r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  };
}
