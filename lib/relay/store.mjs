/**
 * RELAY STORE — durable custody of locked workdays, and their delivery state.
 * ==========================================================================
 *
 * WHY THIS EXISTS. POST /api/export used to parse a locked workday,
 * HMAC-verify it against the device's registered secret — and then throw the
 * payload away. `recordExport()` stored only a delivery receipt; a grep for
 * `.payload` across app/api/ and lib/backend/ returned zero hits. The server
 * could prove a day had ARRIVED and nothing about what happened IN it. The
 * only surviving copy was device-local `localStorage` ("yournal_history"),
 * capped at 90 entries, which returns [] on any parse failure and is then
 * overwritten by the next push. A lost or reinstalled phone took the
 * operational history with it.
 *
 * THE RELAY INVARIANT, stated once and enforced structurally below:
 *
 *   Once a valid locked workday reaches the Relay, its operational payload
 *   must not disappear because an adapter or endpoint is unavailable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DESIGN: TWO FILES PER EXPORT, ONE IMMUTABLE, ONE MUTABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   relay/<organizationId>/<exportId>.json           the workday. WRITE-ONCE.
 *   relay/<organizationId>/<exportId>.delivery.json  delivery state. Rewritten.
 *
 * The separation is the whole point, not a filing convenience. Delivery state
 * changes on every attempt; the operational record must never change at all.
 * Keeping them in one file would mean every retry rewrites the workday, so a
 * crash during a retry could corrupt a record that had already been safely
 * received. Two files makes "a transient downstream error cannot destroy the
 * source payload" a property of the filesystem layout rather than a promise
 * in a code review.
 *
 * Why not an array inside backend-state.json? Because lib/backend/
 * persistence.mjs rewrites that blob IN FULL on every persistNow() — including
 * on every telemetry batch. Full day payloads there would make each of those
 * writes rewrite every day ever recorded, growing both the write window and
 * the corruption blast radius without bound.
 *
 * What the file-per-export layout gives, structurally rather than by
 * discipline:
 *   IMMUTABILITY  a new export physically cannot rewrite an existing one
 *   IDEMPOTENCY   "already relayed?" is an existsSync, not a scan
 *   ISOLATION     organizations are separate directories
 *   DURABILITY    write-temp-then-rename, atomic on POSIX and NTFS alike
 *   RECOVERY      one workday is one readable file
 *
 * TRUST BOUNDARY. Only signature-verified exports are admitted. Rejected
 * deliveries (unregistered device, disabled device, bad signature) stay in the
 * receipt log and never enter the Relay, so they can never be promoted to a
 * trusted delivery state. Enforced by the caller (app/api/export/route.ts) and
 * asserted by lib/regression/relay-cases.mjs.
 *
 * NOT A KPI LAYER. The payload is stored exactly as received — unflattened,
 * uninterpreted, no derived field. Facts before interpretations.
 */
import fs from "node:fs";
import path from "node:path";

const IS_NEXT_BUILD = process.env.NEXT_PHASE === "phase-production-build";

// Mirrors lib/backend/persistence.mjs's guard and its reasoning exactly: an
// unset PUNCHOUT_DATA_DIR in production means an ephemeral container
// filesystem, and silently taking custody of a worker's day onto a disk that
// vanishes on the next restart is worse than refusing to start. Skipped during
// `next build` for the same reason as there — a build is not a start.
if (process.env.NODE_ENV === "production" && !process.env.PUNCHOUT_DATA_DIR && !IS_NEXT_BUILD) {
  throw new Error(
    "PUNCHOUT_DATA_DIR is required when NODE_ENV=production — refusing to take Relay custody of operational " +
      "exports on a non-durable working-directory fallback.",
  );
}

const DATA_DIR = process.env.PUNCHOUT_DATA_DIR || path.join(process.cwd(), ".data");
const RELAY_ROOT = path.join(DATA_DIR, "relay");

export const RELAY_RECORD_VERSION = "1.0";

/**
 * DELIVERY LIFECYCLE. Deterministic and total — every transition is listed
 * here, and `canTransition()` is the only thing that decides.
 *
 *   RECEIVED ──▶ READY ──▶ DELIVERING ──▶ DELIVERED        (terminal, success)
 *                  ▲            │
 *                  │            ├──▶ FAILED_RETRYABLE ──▶ READY   (retry)
 *                  └────────────┘
 *                               └──▶ FAILED_FINAL         (terminal, failure)
 *
 * RECEIVED           payload is durably on disk; nothing has been attempted.
 * READY              validated against the target adapter; eligible to send.
 * DELIVERING         an attempt is in flight. A process crash here leaves the
 *                    record in DELIVERING — see reclaimStuckDeliveries().
 * DELIVERED          downstream accepted it. Terminal.
 * FAILED_RETRYABLE   transient failure (network, 5xx, adapter unavailable).
 *                    Returns to READY on the next dispatch.
 * FAILED_FINAL       the payload cannot be delivered to this target as-is
 *                    (validation failure, 4xx). Terminal WITHOUT data loss —
 *                    the workday itself is untouched and still readable.
 *
 * Note what is absent: there is no transition out of DELIVERED, and no
 * transition that deletes the payload. A terminal failure is a delivery
 * outcome, never a reason to discard the operational record.
 */
export const DELIVERY_STATES = /** @type {const} */ ([
  "RECEIVED",
  "READY",
  "DELIVERING",
  "DELIVERED",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
]);

const ALLOWED_TRANSITIONS = {
  RECEIVED: ["READY", "FAILED_FINAL"],
  READY: ["DELIVERING", "FAILED_FINAL"],
  DELIVERING: ["DELIVERED", "FAILED_RETRYABLE", "FAILED_FINAL"],
  DELIVERED: [],
  FAILED_RETRYABLE: ["READY", "DELIVERING", "FAILED_FINAL"],
  FAILED_FINAL: [],
};

/**
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function canTransition(from, to) {
  return Array.isArray(ALLOWED_TRANSITIONS[from]) && ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Both id components build a filesystem path, so both are format-constrained
 * before reaching path.join — the same chokepoint pattern
 * lib/organization-package/loader.mjs already applies to organizationSlug
 * (finding PO-05). `organizationId` is server-resolved from the device
 * registry and never client-supplied, but `exportId` comes straight out of the
 * posted packet, so this is a real boundary: an exportId of
 * "../../backend-state" must not be able to address anything.
 */
const SAFE_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** @returns {boolean} */
export function isSafeRelayId(value) {
  return typeof value === "string" && SAFE_ID_PATTERN.test(value) && value !== "." && value !== "..";
}

function relayDir(organizationId) {
  if (!isSafeRelayId(organizationId)) throw new Error(`unsafe organizationId for relay path: "${organizationId}"`);
  return path.resolve(RELAY_ROOT, organizationId);
}

/**
 * Resolve one relay file, refusing anything that would escape the relay root.
 * Belt-and-suspenders beyond SAFE_ID_PATTERN, so a future loosening of that
 * regex cannot silently open a traversal.
 */
function relayPath(organizationId, exportId, suffix) {
  if (!isSafeRelayId(exportId)) throw new Error(`unsafe exportId for relay path: "${exportId}"`);
  const resolved = path.resolve(relayDir(organizationId), exportId + suffix);
  const root = path.resolve(RELAY_ROOT);
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error(`relay path for "${organizationId}/${exportId}" resolves outside the relay root`);
  }
  return resolved;
}

const payloadPath = (org, id) => relayPath(org, id, ".json");
const deliveryPath = (org, id) => relayPath(org, id, ".delivery.json");

/** Atomic write: temp file then rename, so a crash mid-write cannot leave a partial file. */
function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

function readJsonOrNull(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    console.error("[relay] failed to read " + filePath + ":", e?.message || e);
    return null;
  }
}

/**
 * The immutable half.
 *
 * @typedef {Object} RelayRecord
 * @property {string} relayRecordVersion   version of THIS envelope, not of the payload
 * @property {string} exportId             idempotency key; stable across retries of one locked day
 * @property {string} organizationId       server-resolved from the device registry, never client-supplied
 * @property {string} deviceId             HMAC-authenticated
 * @property {string|null} userId          asserted by the device — see userIdVerified
 * @property {boolean} userIdVerified      always false today; see docs/FUTURE_OPERATIONS_FOUNDATIONS.md §4.2
 * @property {string|null} dayId           calendar date the workday covers
 * @property {string|null} lockedAt        device clock, when the day was locked (packet.createdAt)
 * @property {string} receivedAt           server clock, when custody was taken
 * @property {string|null} exportVersion   packet contract version as sent by motor.js
 * @property {number|null} runtimeVersion  which published Runtime the device was running
 * @property {boolean} signatureValid      always true for stored records — see the trust boundary
 * @property {any} payload                 the locked workday, exactly as received
 */

/**
 * The mutable half — one entry per delivery target, so adding a payroll
 * adapter later never disturbs the CSV adapter's history.
 *
 * @typedef {Object} DeliveryAttemptState
 * @property {string} status              one of DELIVERY_STATES
 * @property {number} attempts
 * @property {string|null} lastAttemptAt
 * @property {string|null} lastError
 * @property {string|null} deliveredAt
 * @property {any} receipt                downstream reference, when the target returns one
 * @property {Array<{at: string, from: string, to: string, note?: string}>} history
 */

/**
 * Take Relay custody of one signature-verified locked workday.
 *
 * IDEMPOTENT. A repeat of an exportId already in the Relay is a no-op that
 * reports `duplicate`. It never rewrites, merges into, or mutates the stored
 * record — an accepted export is a historical observation, not a mutable row.
 * This is what makes "the system must not silently generate materially
 * different payloads for repeated sends of the same locked workday" true by
 * construction: the second send is simply never written.
 *
 * @param {Object} input
 * @param {string} input.exportId
 * @param {string} input.organizationId
 * @param {string} input.deviceId
 * @param {any} input.packet full parsed export packet as received
 * @param {number|null} [input.runtimeVersion]
 * @returns {{stored: boolean, reason: "received"|"duplicate"|"invalid_id"|"write_failed", record?: RelayRecord, error?: string}}
 */
export function receiveExport({ exportId, organizationId, deviceId, packet, runtimeVersion = null }) {
  if (!isSafeRelayId(exportId) || !isSafeRelayId(organizationId)) {
    return { stored: false, reason: "invalid_id" };
  }

  let file;
  try {
    file = payloadPath(organizationId, exportId);
  } catch (e) {
    return { stored: false, reason: "invalid_id", error: e?.message || String(e) };
  }

  if (fs.existsSync(file)) {
    return { stored: false, reason: "duplicate", record: readJsonOrNull(file) ?? undefined };
  }

  /** @type {RelayRecord} */
  const record = {
    relayRecordVersion: RELAY_RECORD_VERSION,
    exportId,
    organizationId,
    deviceId,
    userId: packet?.userId ?? null,
    userIdVerified: false,
    dayId: packet?.dayId ?? null,
    lockedAt: packet?.createdAt ?? null,
    receivedAt: new Date().toISOString(),
    exportVersion: packet?.exportVersion ?? null,
    runtimeVersion,
    signatureValid: true,
    payload: packet?.payload ?? null,
  };

  try {
    // Payload first, delivery state second. If the process dies between the
    // two, the workday is already safe and initDeliveryState() below is
    // idempotent, so the next read repairs it. The reverse order could leave
    // delivery state referring to a payload that was never written.
    writeAtomic(file, JSON.stringify(record));
  } catch (e) {
    console.error("[relay] failed to store payload " + exportId + ":", e?.message || e);
    return { stored: false, reason: "write_failed", error: e?.message || String(e) };
  }

  try {
    writeAtomic(deliveryPath(organizationId, exportId), JSON.stringify({ exportId, organizationId, targets: {} }));
  } catch (e) {
    console.error("[relay] payload stored but delivery state failed for " + exportId + ":", e?.message || e);
  }

  return { stored: true, reason: "received", record };
}

/** @returns {RelayRecord|null} */
export function readRelayRecord(organizationId, exportId) {
  try {
    return readJsonOrNull(payloadPath(organizationId, exportId));
  } catch {
    return null;
  }
}

/** @returns {{exportId: string, organizationId: string, targets: Record<string, DeliveryAttemptState>}} */
export function readDeliveryState(organizationId, exportId) {
  let existing = null;
  try {
    existing = readJsonOrNull(deliveryPath(organizationId, exportId));
  } catch {
    existing = null;
  }
  return existing ?? { exportId, organizationId, targets: {} };
}

function writeDeliveryState(organizationId, exportId, state) {
  writeAtomic(deliveryPath(organizationId, exportId), JSON.stringify(state));
}

/** @returns {DeliveryAttemptState} */
function blankTargetState() {
  return {
    status: "RECEIVED",
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
    deliveredAt: null,
    receipt: null,
    history: [],
  };
}

/**
 * Move one (export, target) pair to a new state. Refuses illegal transitions
 * rather than silently applying them — the state machine is the contract, and
 * a caller that tries to resurrect a DELIVERED record has a bug worth
 * surfacing.
 *
 * @param {string} organizationId
 * @param {string} exportId
 * @param {string} targetName
 * @param {string} to
 * @param {{error?: string|null, receipt?: any, note?: string, countAttempt?: boolean}} [opts]
 * @returns {{ok: boolean, state?: DeliveryAttemptState, error?: string}}
 */
export function transitionDelivery(organizationId, exportId, targetName, to, opts = {}) {
  if (!DELIVERY_STATES.includes(to)) return { ok: false, error: `unknown delivery state "${to}"` };
  if (!readRelayRecord(organizationId, exportId)) {
    return { ok: false, error: `no relay record for ${organizationId}/${exportId}` };
  }

  const state = readDeliveryState(organizationId, exportId);
  const current = state.targets[targetName] ?? blankTargetState();

  if (current.status === to && to !== "DELIVERING") {
    // Idempotent no-op: re-declaring the current state is not an error, but it
    // must not append a misleading history entry or inflate the attempt count.
    return { ok: true, state: current };
  }

  if (!canTransition(current.status, to)) {
    return { ok: false, error: `illegal transition ${current.status} -> ${to} for target "${targetName}"`, state: current };
  }

  const now = new Date().toISOString();
  /** @type {DeliveryAttemptState} */
  const next = {
    ...current,
    status: to,
    attempts: opts.countAttempt ? current.attempts + 1 : current.attempts,
    lastAttemptAt: opts.countAttempt ? now : current.lastAttemptAt,
    lastError: to === "DELIVERED" ? null : opts.error ?? (to === "READY" ? null : current.lastError),
    deliveredAt: to === "DELIVERED" ? now : current.deliveredAt,
    receipt: opts.receipt !== undefined ? opts.receipt : current.receipt,
    history: [...current.history, { at: now, from: current.status, to, ...(opts.note ? { note: opts.note } : {}) }],
  };

  state.targets[targetName] = next;
  try {
    writeDeliveryState(organizationId, exportId, state);
  } catch (e) {
    return { ok: false, error: `failed to persist delivery state: ${e?.message || e}` };
  }
  return { ok: true, state: next };
}

/** @returns {DeliveryAttemptState} */
export function getTargetState(organizationId, exportId, targetName) {
  return readDeliveryState(organizationId, exportId).targets[targetName] ?? blankTargetState();
}

/**
 * Every exportId the Relay holds for one organization, newest first.
 * Organization-scoped by construction: org A's directory cannot name org B's
 * files, so cross-organization reads are impossible rather than merely
 * filtered out.
 * @returns {string[]}
 */
export function listRelayExportIds(organizationId) {
  if (!isSafeRelayId(organizationId)) return [];
  let dir;
  try {
    dir = relayDir(organizationId);
  } catch {
    return [];
  }
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith(".json") && !n.endsWith(".delivery.json") && !n.endsWith(".tmp"))
      .map((n) => n.slice(0, -".json".length));
  } catch (e) {
    console.error("[relay] failed to list " + organizationId + ":", e?.message || e);
    return [];
  }
}

/**
 * Inspection listing: metadata plus delivery status, no payloads, so an
 * operator can find a workday without loading every workday.
 * @returns {Array<Omit<RelayRecord, "payload"> & {payloadSummary: object, delivery: Record<string, DeliveryAttemptState>}>}
 */
export function listRelayRecords(organizationId, { limit = 100 } = {}) {
  const out = [];
  for (const exportId of listRelayExportIds(organizationId)) {
    const record = readRelayRecord(organizationId, exportId);
    if (!record) continue;
    const { payload, ...meta } = record;
    out.push({
      ...meta,
      payloadSummary: summarizePayload(payload),
      delivery: readDeliveryState(organizationId, exportId).targets,
    });
  }
  out.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return out.slice(0, limit);
}

/**
 * Counts only — deliberately no interpretation, no scoring, no derived
 * metric. Enough for an operator to see at a glance that a day is not empty.
 */
export function summarizePayload(payload) {
  return {
    entries: Array.isArray(payload?.entries) ? payload.entries.length : 0,
    schemas: Array.isArray(payload?.schemas) ? payload.schemas.length : 0,
    timeEntries: Array.isArray(payload?.timeEntries) ? payload.timeEntries.length : 0,
    machineHours: Array.isArray(payload?.machineHours) ? payload.machineHours.length : 0,
    quantities: Array.isArray(payload?.quantities) ? payload.quantities.length : 0,
    startTime: payload?.startTime ?? null,
    endTime: payload?.endTime ?? null,
  };
}

/**
 * Records left in DELIVERING by a process that died mid-attempt would
 * otherwise never be retried, because DELIVERING is not a dispatch-eligible
 * state. On startup (or before a dispatch run) they are returned to
 * FAILED_RETRYABLE, which IS eligible. Safe because the target adapters are
 * required to be idempotent on exportId — see lib/relay/targets/.
 * @returns {number} how many records were reclaimed
 */
export function reclaimStuckDeliveries(organizationId) {
  let reclaimed = 0;
  for (const exportId of listRelayExportIds(organizationId)) {
    const state = readDeliveryState(organizationId, exportId);
    for (const [targetName, target] of Object.entries(state.targets)) {
      if (target.status !== "DELIVERING") continue;
      const result = transitionDelivery(organizationId, exportId, targetName, "FAILED_RETRYABLE", {
        error: "process ended while delivery was in flight",
        note: "reclaimed",
      });
      if (result.ok) reclaimed += 1;
    }
  }
  return reclaimed;
}

/** Every organization the Relay currently holds records for. */
export function listRelayOrganizations() {
  try {
    if (!fs.existsSync(RELAY_ROOT)) return [];
    return fs
      .readdirSync(RELAY_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch (e) {
    console.error("[relay] failed to list organizations:", e?.message || e);
    return [];
  }
}

/** Per-organization record counts — cheap enough for /api/health. */
export function relayCounts() {
  const out = {};
  for (const org of listRelayOrganizations()) out[org] = listRelayExportIds(org).length;
  return out;
}

export function relayRoot() {
  return RELAY_ROOT;
}
