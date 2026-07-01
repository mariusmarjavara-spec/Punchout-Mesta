/**
 * LandaxAdapter — a demonstration adapter for the ExportEnvelope -> Adapter
 * pipeline. Landax is a Norwegian QA/HMS system; the field mapping below is
 * ILLUSTRATIVE ONLY (no real Landax API contract was available to target),
 * meant to prove the pipeline can carry receiver-specific shape without any
 * of that shape leaking back into the motor or the generic adapter layer.
 *
 * send() performs NO real network call — it is a mock that logs what it
 * would have sent and resolves with a fabricated response.
 *
 * @implements {import('./adapter.mjs').Adapter}
 */

const MOCK_ENDPOINT = "https://mock.landax.example/api/v1/dagsrapport";

/**
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').ValidationResult}
 */
function validate(envelope) {
  const errors = [];
  if (!envelope.exportId) errors.push("missing exportId");
  if (!envelope.dayId) errors.push("missing dayId");
  if (!envelope.organizationId) errors.push("missing organizationId");
  if (!envelope.userId) errors.push("missing userId");
  if (envelope.schemaVersion !== "1.0") errors.push("unsupported schemaVersion: " + envelope.schemaVersion);
  return { valid: errors.length === 0, errors };
}

/**
 * Map the generic envelope to a fictional Landax-shaped payload.
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {Object}
 */
function transform(envelope) {
  return {
    eksternId: envelope.exportId,
    organisasjon: envelope.organizationId,
    ansattId: envelope.userId,
    enhetId: envelope.deviceId,
    dato: envelope.dayId,
    skiftStart: envelope.shift.startTime,
    skiftSlutt: envelope.shift.endTime,
    hendelseslogg: envelope.entries.map((e) => ({
      klokkeslett: e.time,
      kategori: e.type,
      tekst: e.text,
    })),
    hmsSkjema: envelope.schemas.map((s) => ({
      skjemaId: s.id,
      skjematype: s.type,
      status: s.status === "confirmed" ? "godkjent" : "forkastet",
      felter: s.fields,
    })),
    timeregistreringer: envelope.timeEntries.map((t) => ({
      ordre: t.ordre,
      fra: t.fraTid,
      til: t.tilTid,
      lonnskoder: t.lonnskoder,
    })),
    maskinbruk: envelope.machineHours,
    kilde: envelope.metadata && envelope.metadata.source,
  };
}

/**
 * Simulated network call — no fetch, no real I/O.
 * @param {Object} payload
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {Promise<Object>}
 */
async function send(payload, envelope) {
  console.log(`[LandaxAdapter] SIMULERT POST -> ${MOCK_ENDPOINT}`);
  console.log(`[LandaxAdapter] payload.eksternId=${payload.eksternId} skjema=${payload.hmsSkjema.length} tidsreg=${payload.timeregistreringer.length}`);
  // Mock response — a real adapter would `await fetch(...)` here instead.
  return {
    status: 201,
    body: { mottattId: "landax_" + envelope.exportId, status: "MOTTATT" },
  };
}

/**
 * @param {{status:number, body:{mottattId:string, status:string}}} rawResponse
 * @param {import('./envelope.mjs').ExportEnvelope} envelope
 * @returns {import('./adapter.mjs').AdapterResult}
 */
function handleResponse(rawResponse, envelope) {
  const ok = rawResponse.status >= 200 && rawResponse.status < 300;
  return {
    ok,
    stage: "handleResponse",
    adapterName: "landax",
    exportId: envelope.exportId,
    response: ok ? rawResponse.body : undefined,
    error: ok ? undefined : `Landax responded with status ${rawResponse.status}`,
  };
}

export const LandaxAdapter = {
  name: "landax",
  validate,
  transform,
  send,
  handleResponse,
};
