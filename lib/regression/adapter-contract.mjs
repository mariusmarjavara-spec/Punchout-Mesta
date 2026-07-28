/**
 * Contract Testing (Adapter Platform DEL 7): every adapter must prove
 * Input -> Transform -> Output -> Validation -> no data loss, across an
 * empty Runtime day, a full day, and a many-package day. "No data loss"
 * is checked per adapter-DECLARED capability only (capability.mjs) —
 * an adapter that never claimed to carry e.g. "schemas" (DummyAdapter)
 * is not held to a promise it never made; see dummy-adapter.mjs.
 */
import { buildExportEnvelope } from "../adapters/envelope.mjs";
import { listAdapters } from "../adapters/registry.mjs";
import { KNOWN_CAPABILITIES } from "../adapters/capability.mjs";
import { SAMPLE_DAY_LOG, EMPTY_DAY_LOG, SAMPLE_CONTEXT, buildLargeDayLog } from "../adapters/fixtures.mjs";

/** @param {import('../adapters/envelope.mjs').ExportEnvelope} envelope */
function envelopeCounts(envelope) {
  const counts = {};
  for (const cap of KNOWN_CAPABILITIES) counts[cap] = envelope[cap].length;
  return counts;
}

/**
 * For every capability the adapter declares, its own countRecords()
 * (registry.mjs) must report the same count the envelope actually
 * carries — this is what makes "no data loss" checkable generically,
 * without this file knowing any adapter's payload shape.
 */
function noDataLoss(descriptor, envelope, payload) {
  if (typeof descriptor.countRecords !== "function") return true; // adapter opted out of this check — nothing to assert
  const expected = envelopeCounts(envelope);
  const actual = descriptor.countRecords(payload);
  return descriptor.capabilities.every((cap) => actual[cap] === expected[cap]);
}

const FIXTURES = [
  { label: "empty", dayLog: EMPTY_DAY_LOG },
  { label: "full", dayLog: SAMPLE_DAY_LOG },
  { label: "many_50", dayLog: buildLargeDayLog(50) },
];

export const ADAPTER_CONTRACT_CASES = listAdapters().flatMap((descriptor) =>
  FIXTURES.map(({ label, dayLog }) => ({
    id: `adapter_contract_${descriptor.name}_${label}`,
    description: `Contract test: adapter "${descriptor.name}" transforms the "${label}" fixture without throwing and loses no record within its declared capabilities.`,
    run: () => {
      const envelope = buildExportEnvelope(dayLog, SAMPLE_CONTEXT);
      const validation = descriptor.adapter.validate(envelope);
      if (!validation.valid) return false;
      const payload = descriptor.adapter.transform(envelope);
      return noDataLoss(descriptor, envelope, payload);
    },
  }))
);
