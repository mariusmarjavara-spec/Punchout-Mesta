/**
 * ExportEnvelope — the one stable, receiver-agnostic contract that leaves
 * Punchout. Every adapter (Landax, ISY Road, Elrapp, ERP, Power BI, ...)
 * consumes THIS shape and maps it to its own receiver format. Nothing in
 * here is Landax-specific, or specific to any other receiver.
 *
 * The motor (public/motor.js) remains the sole source of truth and the
 * sole owner of business logic: by the time a DayLog reaches
 * buildExportEnvelope(), every decision (what's confirmed, what's
 * required, what's discarded) has already been made by the motor. This
 * function only repackages already-final data into a stable outward shape
 * — it is a pure structural mapping, not a business decision.
 *
 * Field-naming intentionally mirrors motor.js's internal buildExportPacket()
 * (exportId, deviceId, userId, dayId, entries, schemas) so the two stay
 * conceptually aligned even though this is a separate, generalized layer.
 *
 * @typedef {Object} ExportEntry
 * @property {string} time
 * @property {string} type
 * @property {string} text
 *
 * @typedef {Object} ExportSchema
 * @property {string} id
 * @property {string} type
 * @property {string} status
 * @property {Record<string, unknown>} fields
 * @property {string} createdAt
 * @property {string|null} confirmedAt
 *
 * @typedef {Object} ExportTimeEntry
 * @property {string} ordre
 * @property {string} dato
 * @property {string|null} fraTid
 * @property {string|null} tilTid
 * @property {string[]} arbeidsbeskrivelse
 * @property {Array<{kode:string, fra:string, til:string}>} lonnskoder
 *
 * @typedef {Object} ExportMachineHour
 * @property {string} ordre
 * @property {string} maskintype
 * @property {string} timer
 *
 * @typedef {Object} ExportEnvelope
 * @property {string} exportId          - unique per export attempt (idempotency key for receivers)
 * @property {string} schemaVersion     - version of THIS contract, checked by adapters
 * @property {string} appVersion        - Punchout build/version producing the export
 * @property {string} organizationId    - tenant/customer identity (e.g. "mesta")
 * @property {string} userId
 * @property {string} deviceId
 * @property {string} createdAt         - ISO timestamp of envelope creation
 * @property {string} dayId             - the calendar date this DayLog covers
 * @property {{startTime: string|null, endTime: string|null}} shift
 * @property {ExportEntry[]} entries
 * @property {ExportSchema[]} schemas
 * @property {ExportTimeEntry[]} timeEntries
 * @property {ExportMachineHour[]} machineHours
 * @property {Record<string, unknown>} metadata - free-form, receiver-agnostic extras
 */

export const ENVELOPE_SCHEMA_VERSION = "1.0";

/**
 * @param {*} exportId
 * @returns {string}
 */
function makeExportId(exportId) {
  if (exportId) return exportId;
  return "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 11);
}

/**
 * Build a stable ExportEnvelope from a motor DayLog.
 *
 * @param {import('../../hooks/use-motor-state').DayLog} dayLog
 * @param {{organizationId: string, userId: string, deviceId: string, appVersion: string}} context
 *   Identity/deployment fields the motor does not currently model (no
 *   auth, no multi-tenant config yet — deliberately out of scope here).
 *   Supplied by the caller until that concern is designed.
 * @returns {ExportEnvelope}
 */
export function buildExportEnvelope(dayLog, context) {
  if (!dayLog) throw new Error("buildExportEnvelope: dayLog is required");
  if (!context || !context.organizationId || !context.userId) {
    throw new Error("buildExportEnvelope: context.organizationId and context.userId are required");
  }

  const entries = (dayLog.entries || []).map((e) => ({
    time: e.time,
    type: e.type,
    text: e.text,
  }));

  const schemas = (dayLog.schemas || [])
    .filter((s) => s.status === "confirmed" || s.status === "discarded")
    .map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      fields: s.fields,
      createdAt: s.createdAt,
      confirmedAt: s.confirmedAt || null,
    }));

  const timeEntries = [];
  const machineHours = [];
  const drafts = dayLog.drafts || {};
  for (const ordre of Object.keys(drafts)) {
    const d = drafts[ordre];
    if (d.status !== "confirmed") continue;
    timeEntries.push({
      ordre: d.ordre,
      dato: d.dato,
      fraTid: d.fra_tid || null,
      tilTid: d.til_tid || null,
      arbeidsbeskrivelse: d.arbeidsbeskrivelse || [],
      lonnskoder: d.lonnskoder || [],
    });
    for (const m of d.maskintimer || []) {
      machineHours.push({ ordre: d.ordre, maskintype: m.maskintype, timer: m.timer });
    }
  }

  return {
    exportId: makeExportId(dayLog.exportId),
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    appVersion: context.appVersion || "0.0.0",
    organizationId: context.organizationId,
    userId: context.userId,
    deviceId: context.deviceId || "unknown-device",
    createdAt: new Date().toISOString(),
    dayId: dayLog.date,
    shift: { startTime: dayLog.startTime || null, endTime: dayLog.endTime || null },
    entries,
    schemas,
    timeEntries,
    machineHours,
    metadata: { source: "punchout-mobile" },
  };
}
