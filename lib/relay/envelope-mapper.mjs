/**
 * RELAY RECORD -> ExportEnvelope
 * ==============================
 * The Relay stores what the phone actually sent: motor.js's own
 * `buildExportPacket()` shape. Adapters (lib/adapters/) consume
 * `ExportEnvelope` — the stable, receiver-agnostic contract that
 * lib/adapters/envelope.mjs already defines and that every existing adapter
 * and its golden tests are written against.
 *
 * Those two shapes are close but NOT identical, and the differences are real:
 *
 *   packet.payload.timeEntries[].fra_tid   ->  envelope.timeEntries[].fraTid
 *   packet.payload.timeEntries[].til_tid   ->  envelope.timeEntries[].tilTid
 *   packet.{userId,deviceId,dayId}         ->  envelope top level
 *   (absent in packet)                     ->  envelope.organizationId
 *   packet.payload.{startTime,endTime}     ->  envelope.shift
 *
 * `buildExportEnvelope()` cannot be reused here: it maps a live `dayLog`
 * (with `drafts` keyed by order, statuses still present), whereas the Relay
 * holds the already-projected payload, where draft filtering and schema
 * filtering have ALREADY happened on the device. Re-deriving would mean
 * re-implementing motor.js's decisions on the server — precisely the
 * duplication the ExportEnvelope contract exists to prevent. This function
 * therefore does a pure structural rename, and makes no business decision:
 * every row present in the packet appears in the envelope, and none is added.
 *
 * organizationId comes from the RELAY RECORD (server-resolved from the device
 * registry at receipt), never from the payload — the same identity-integrity
 * rule /api/export already enforces.
 */
import { ENVELOPE_SCHEMA_VERSION } from "../adapters/envelope.mjs";

/**
 * @param {import('./store.mjs').RelayRecord} record
 * @param {{appVersion?: string}} [opts]
 * @returns {import('../adapters/envelope.mjs').ExportEnvelope}
 */
export function relayRecordToEnvelope(record, opts = {}) {
  if (!record) throw new Error("relayRecordToEnvelope: record is required");
  const payload = record.payload || {};

  return {
    exportId: record.exportId,
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    appVersion: opts.appVersion || "0.0.0",
    organizationId: record.organizationId,
    // The envelope contract types these as strings. A packet that omitted them
    // still has to produce a valid envelope rather than throw mid-delivery, so
    // they degrade to an explicit "unknown" marker the adapter can see, not to
    // undefined which would silently vanish from a CSV cell.
    userId: record.userId || "unknown-user",
    deviceId: record.deviceId || "unknown-device",
    createdAt: record.receivedAt,
    dayId: record.dayId || "unknown-day",
    shift: {
      startTime: payload.startTime ?? null,
      endTime: payload.endTime ?? null,
    },
    entries: (payload.entries || []).map((e) => ({
      time: e.time,
      type: e.type,
      text: e.text,
    })),
    schemas: (payload.schemas || []).map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      fields: s.fields,
      createdAt: s.createdAt,
      confirmedAt: s.confirmedAt ?? null,
    })),
    timeEntries: (payload.timeEntries || []).map((t) => ({
      ordre: t.ordre,
      dato: t.dato,
      fraTid: t.fra_tid ?? t.fraTid ?? null,
      tilTid: t.til_tid ?? t.tilTid ?? null,
      arbeidsbeskrivelse: t.arbeidsbeskrivelse || [],
      lonnskoder: t.lonnskoder || [],
    })),
    machineHours: (payload.machineHours || []).map((m) => ({
      ordre: m.ordre,
      maskintype: m.maskintype,
      timer: m.timer,
    })),
    metadata: {
      relayRecordVersion: record.relayRecordVersion,
      exportVersion: record.exportVersion,
      runtimeVersion: record.runtimeVersion,
      lockedAt: record.lockedAt,
      receivedAt: record.receivedAt,
      userIdVerified: record.userIdVerified === true,
      // Quantities are carried through untouched when present. Nothing in the
      // field UI produces them yet (docs/FUTURE_OPERATIONS_FOUNDATIONS.md
      // §3.4) — this is the seam, not a feature, and it must not invent a
      // value when none was observed.
      ...(Array.isArray(payload.quantities) && payload.quantities.length > 0
        ? { quantities: payload.quantities }
        : {}),
    },
  };
}
