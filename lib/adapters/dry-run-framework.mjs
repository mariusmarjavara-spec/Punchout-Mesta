/**
 * The one Dry Run mechanism for the adapter platform. Before this
 * module existed, the same four steps (build envelope -> run adapter ->
 * inspect result) were hand-rolled twice: lib/adapters/dry-run.mjs (a
 * CLI script, never run by CI) and lib/regression/full-day-scenario.mjs
 * (run by CI, against every organization). Both now call runDryRun() —
 * one Runtime day, driven through any Adapter Registry entry, identical
 * mechanism regardless of receiver.
 */
import { buildExportEnvelope } from "./envelope.mjs";
import { runAdapter } from "./adapter.mjs";
import { uncoveredCapabilities } from "./capability.mjs";

/**
 * @typedef {Object} DryRunResult
 * @property {boolean} ok
 * @property {string} adapterName
 * @property {string} exportId
 * @property {import('./envelope.mjs').ExportEnvelope} envelope
 * @property {import('./adapter.mjs').AdapterResult} adapterResult
 * @property {import('./capability.mjs').AdapterCapability[]} uncoveredCapabilities
 * @property {number} durationMs
 */

/**
 * One work day -> ExportEnvelope -> Adapter -> mock receiver -> result.
 * Works identically for every AdapterDescriptor in the registry.
 *
 * @param {import('../../hooks/use-motor-state').DayLog} dayLog
 * @param {{organizationId: string, userId: string, deviceId: string, appVersion: string}} context
 * @param {import('./registry.mjs').AdapterDescriptor} adapterDescriptor
 * @param {(msg: string) => void} [log]
 * @returns {Promise<DryRunResult>}
 */
export async function runDryRun(dayLog, context, adapterDescriptor, log = () => {}) {
  const envelope = buildExportEnvelope(dayLog, context);
  const uncovered = uncoveredCapabilities(adapterDescriptor.capabilities, envelope);
  if (uncovered.length > 0) {
    log(`[dry-run:${adapterDescriptor.name}] WARNING: envelope carries data for uncovered capabilities: ${uncovered.join(", ")}`);
  }

  const startedAt = performance.now();
  const adapterResult = await runAdapter(adapterDescriptor.adapter, envelope, log);
  const durationMs = performance.now() - startedAt;

  return {
    ok: adapterResult.ok,
    adapterName: adapterDescriptor.name,
    exportId: envelope.exportId,
    envelope,
    adapterResult,
    uncoveredCapabilities: uncovered,
    durationMs,
  };
}
