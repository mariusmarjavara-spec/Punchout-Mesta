/**
 * Phase 10 Del 6: one consolidated view — is Punchout getting more or
 * less robust? Every field here traces to an actual test result passed
 * in by the caller (regression suite output, cross-org results,
 * telemetry) — this function only aggregates, it never re-derives a
 * verdict from nothing.
 */

/**
 * @param {{
 *   regressionResults: {id:string, passed:boolean}[],
 *   crossOrgResults: {organizationId:string, ok:boolean}[],
 *   compileAttempts: {valid:boolean, errors:string[]}[],
 *   telemetry: import('../telemetry/types.mjs').TelemetryEvent[],
 *   correctionEntries: import('../correction-memory/types.mjs').CorrectionEntry[],
 * }} input
 */
export function platformHealth(input) {
  const { regressionResults, crossOrgResults, compileAttempts, telemetry, correctionEntries } = input;

  const regressionStatus = {
    total: regressionResults.length,
    passed: regressionResults.filter((r) => r.passed).length,
    failing: regressionResults.filter((r) => !r.passed).map((r) => r.id),
  };

  const organizationCompatibility = {
    total: crossOrgResults.length,
    compatible: crossOrgResults.filter((r) => r.ok).map((r) => r.organizationId),
    incompatible: crossOrgResults.filter((r) => !r.ok).map((r) => r.organizationId),
  };

  const runtimeValidation = {
    attempts: compileAttempts.length,
    validRate: compileAttempts.length ? compileAttempts.filter((a) => a.valid).length / compileAttempts.length : null,
  };

  const exportEvents = telemetry.filter((t) => t.type === "ExportSucceeded" || t.type === "ExportFailed");
  const exportSuccess = {
    total: exportEvents.length,
    successRate: exportEvents.length ? exportEvents.filter((t) => t.type === "ExportSucceeded").length / exportEvents.length : null,
  };

  const correctionMemoryHealth = {
    activeEntries: correctionEntries.filter((e) => e.active).length,
    conflicts: telemetry.filter((t) => t.type === "CorrectionConflict").length,
    expired: telemetry.filter((t) => t.type === "CorrectionExpired").length,
  };

  const motorHealth = {
    // "Motor Health" here means: does the regression suite's motor.js-
    // specific subset (vm-sandbox cases) pass — the only thing that
    // actually exercises real motor.js code, not a simulation of it.
    motorSpecificCasesPassed: regressionResults.filter((r) => r.id.startsWith("phase9_") || r.id.startsWith("phase10_")).every((r) => r.passed),
  };

  const overallRobust = regressionStatus.failing.length === 0 && organizationCompatibility.incompatible.length === 0 && (runtimeValidation.validRate === null || runtimeValidation.validRate === 1);

  return {
    regressionStatus,
    organizationCompatibility,
    runtimeValidation,
    exportSuccess,
    correctionMemoryHealth,
    motorHealth,
    overallRobust,
  };
}
