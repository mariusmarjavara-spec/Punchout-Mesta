/**
 * Failure Testing (Adapter Platform DEL 8): try to break the adapters.
 * runAdapter() must fail in a controlled, structured way for every case
 * below — never throw, never let a broken adapter affect anything
 * outside itself. The three synthetic adapters below are NOT registered
 * in the Adapter Registry — they exist only to inject failures at each
 * pipeline stage (transform/send/handleResponse), distinct from
 * csv/json/dummy which are real (if synthetic-format) receivers.
 */
import { runAdapter } from "../adapters/adapter.mjs";
import { buildExportEnvelope } from "../adapters/envelope.mjs";
import { listAdapters } from "../adapters/registry.mjs";
import { SAMPLE_DAY_LOG, SAMPLE_CONTEXT } from "../adapters/fixtures.mjs";

const baseEnvelope = buildExportEnvelope(SAMPLE_DAY_LOG, SAMPLE_CONTEXT);

/** @param {Partial<import('../adapters/envelope.mjs').ExportEnvelope>} overrides */
function brokenEnvelope(overrides) {
  return { ...baseEnvelope, ...overrides };
}

// --- Synthetic broken adapters -----------------------------------------
const ThrowingTransformAdapter = {
  name: "throwing_transform",
  validate: () => ({ valid: true, errors: [] }),
  transform: () => {
    throw new Error("transform exploded");
  },
  send: async () => ({}),
  handleResponse: () => ({ ok: true, stage: "handleResponse", adapterName: "throwing_transform", exportId: "" }),
};

const ThrowingSendAdapter = {
  name: "throwing_send",
  validate: () => ({ valid: true, errors: [] }),
  transform: (envelope) => envelope,
  send: async () => {
    throw new Error("network unreachable"); // stands in for a network failure/timeout: a real adapter's send() rejects the same way whether the cause is DNS, TCP, or a timeout wrapper.
  },
  handleResponse: () => ({ ok: true, stage: "handleResponse", adapterName: "throwing_send", exportId: "" }),
};

const InvalidResponseAdapter = {
  name: "invalid_response",
  validate: () => ({ valid: true, errors: [] }),
  transform: (envelope) => envelope,
  send: async () => ({ notAStatus: true }), // receiver returned something the adapter doesn't recognize
  handleResponse: (raw) => {
    if (typeof raw.status !== "number") throw new Error("malformed response: missing status");
    return { ok: true, stage: "handleResponse", adapterName: "invalid_response", exportId: "" };
  },
};

const pipelineStageCases = [
  {
    id: "adapter_failure_never_throws_on_transform_error",
    description: "runAdapter() catches a throwing transform() and returns a structured ok:false result at stage 'transform' instead of propagating the exception.",
    run: async () => {
      const result = await runAdapter(ThrowingTransformAdapter, baseEnvelope);
      return result.ok === false && result.stage === "transform" && typeof result.error === "string";
    },
  },
  {
    id: "adapter_failure_never_throws_on_send_error",
    description: "runAdapter() catches a rejected send() (network failure / timeout) and returns ok:false at stage 'send'.",
    run: async () => {
      const result = await runAdapter(ThrowingSendAdapter, baseEnvelope);
      return result.ok === false && result.stage === "send";
    },
  },
  {
    id: "adapter_failure_never_throws_on_malformed_response",
    description: "runAdapter() catches a throwing handleResponse() (invalid/unrecognized receiver response) and returns ok:false at stage 'handleResponse'.",
    run: async () => {
      const result = await runAdapter(InvalidResponseAdapter, baseEnvelope);
      return result.ok === false && result.stage === "handleResponse";
    },
  },
];

const perAdapterCases = listAdapters().flatMap((descriptor) => [
  {
    id: `adapter_failure_${descriptor.name}_missing_export_id`,
    description: `"${descriptor.name}" rejects an envelope with no exportId at validate(), never reaching transform/send.`,
    run: async () => {
      const result = await runAdapter(descriptor.adapter, brokenEnvelope({ exportId: "" }));
      return result.ok === false && result.stage === "validate";
    },
  },
  {
    id: `adapter_failure_${descriptor.name}_wrong_schema_version`,
    description: `"${descriptor.name}" rejects an envelope declaring an unsupported schemaVersion (wrong Runtime/contract version).`,
    run: async () => {
      const result = await runAdapter(descriptor.adapter, brokenEnvelope({ schemaVersion: "99.0" }));
      return result.ok === false && result.stage === "validate";
    },
  },
  {
    id: `adapter_failure_${descriptor.name}_empty_organization_id`,
    description: `"${descriptor.name}" never throws when organizationId is empty, whether or not it declares that field required.`,
    run: async () => {
      const result = await runAdapter(descriptor.adapter, brokenEnvelope({ organizationId: "" }));
      return typeof result.ok === "boolean"; // must always return a well-formed result, never throw — being strict about the field is the adapter's own choice
    },
  },
  {
    id: `adapter_failure_${descriptor.name}_duplicate_submission_is_stable`,
    description: `"${descriptor.name}" run twice with the identical envelope (duplicate packet) produces two structurally consistent, side-effect-free results with the same exportId.`,
    run: async () => {
      const first = await runAdapter(descriptor.adapter, baseEnvelope);
      const second = await runAdapter(descriptor.adapter, baseEnvelope);
      return first.ok === second.ok && first.exportId === second.exportId && first.exportId === baseEnvelope.exportId;
    },
  },
]);

export const ADAPTER_FAILURE_CASES = [...pipelineStageCases, ...perAdapterCases];
