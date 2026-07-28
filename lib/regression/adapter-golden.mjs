/**
 * Golden Test Suite (Adapter Platform DEL 6): the identical fixture day,
 * pushed through runDryRun(), against EVERY adapter in the registry.
 * The pipeline mechanics must be identical for all of them — only the
 * transformed output shape is allowed to vary. Cases are generated from
 * the registry, not hand-listed, so a newly registered adapter is
 * covered automatically.
 */
import { runDryRun } from "../adapters/dry-run-framework.mjs";
import { runAdapters } from "../adapters/adapter.mjs";
import { buildExportEnvelope } from "../adapters/envelope.mjs";
import { listAdapters } from "../adapters/registry.mjs";
import { SAMPLE_DAY_LOG, SAMPLE_CONTEXT } from "../adapters/fixtures.mjs";

const perAdapterCases = listAdapters().map((descriptor) => ({
  id: `adapter_golden_${descriptor.name}`,
  description: `Golden Test Suite: adapter "${descriptor.name}" (v${descriptor.version}) completes the standard fixture day without error, and echoes back the same exportId the envelope was built with.`,
  run: async () => {
    const result = await runDryRun(SAMPLE_DAY_LOG, SAMPLE_CONTEXT, descriptor, () => {});
    return result.ok === true && result.adapterResult.exportId === result.envelope.exportId;
  },
}));

// Multi-adapter fan-out (DEL 9): the SAME envelope, exported to every
// registered adapter concurrently. One motor truth, N independent
// receivers — the envelope is deep-frozen by runAdapters() itself, so
// this also proves no adapter mutates the shared object for another.
const multiAdapterCase = {
  id: "adapter_golden_multi_adapter_fanout",
  description: "runAdapters() fans the identical ExportEnvelope out to every registered adapter concurrently; all succeed independently and the shared envelope is left unmodified (frozen).",
  run: async () => {
    const envelope = buildExportEnvelope(SAMPLE_DAY_LOG, SAMPLE_CONTEXT);
    const results = await runAdapters(
      listAdapters().map((d) => d.adapter),
      envelope
    );
    const allOk = results.every((r) => r.ok === true);
    const allSameExportId = results.every((r) => r.exportId === envelope.exportId);
    const frozen = Object.isFrozen(envelope) && Object.isFrozen(envelope.entries);
    return allOk && allSameExportId && frozen && results.length === listAdapters().length;
  },
};

export const ADAPTER_GOLDEN_CASES = [...perAdapterCases, multiAdapterCase];
