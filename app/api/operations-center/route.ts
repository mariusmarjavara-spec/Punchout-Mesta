import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { telemetryLog, exportLog, getHistory } from "@/lib/backend/state.mjs";

/**
 * Del 5 (Phase 11) / Del 4 (Phase A): Operations Center must never show
 * placeholder data as if it were a real measurement.
 *
 * Phase A finding: this route previously called platformHealth() with
 * regressionResults/crossOrgResults/correctionEntries hardcoded to []
 * and compileAttempts derived from publish HISTORY (which by
 * construction can only ever contain successes — a failed compile is
 * never stored anywhere). That made regressionStatus.failing.length===0
 * and organizationCompatibility.incompatible.length===0 read as "zero
 * failures measured," and runtimeValidation.validRate read as a
 * meaningful 100% — none of which was true; it was an artifact of
 * feeding a CI-shaped function empty/incomplete inputs. platformHealth()
 * itself is untouched and still correct when fed real CI data (see
 * lib/regression/*, still used that way) — the fix is in what this
 * per-organization LIVE endpoint is honest about.
 *
 * This route now computes only what it can actually observe from real
 * backend state (telemetry, export log, publish history) and marks
 * everything else explicitly unavailable, with a reason, in
 * `dataAvailability`. No panel here is a guess.
 */
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) return NextResponse.json({ error: "org query param required" }, { status: 400 });

  const orgTelemetry = telemetryLog.filter((e: any) => e.organizationId === organizationId);
  const orgExports = exportLog.filter((e: any) => e.organizationId === organizationId);
  const history = getHistory(organizationId);

  const exportEvents = orgTelemetry.filter((t: any) => t.type === "ExportSucceeded" || t.type === "ExportFailed");
  const exportSuccess = {
    total: exportEvents.length,
    successRate: exportEvents.length ? exportEvents.filter((t: any) => t.type === "ExportSucceeded").length / exportEvents.length : null,
  };

  const health = {
    exportSuccess,
    publishHistory: { totalPublishes: history.length, activeVersion: history.find((m: any) => m.status === "active")?.runtimeVersion ?? null },
    regressionStatus: null,
    organizationCompatibility: null,
    runtimeValidation: null,
    correctionMemoryHealth: null,
    overallRobust: null,
  };

  return NextResponse.json({
    organizationId,
    runtimeHistory: history,
    exportLog: orgExports,
    telemetryEventCount: orgTelemetry.length,
    health,
    dataAvailability: {
      exportSuccess: "live — computed from telemetry received by this backend",
      publishHistory: "live — computed from this organization's Runtime Store",
      regressionStatus: "not_available — regression suite is a whole-codebase CI signal, not per-organization production data; not wired to this endpoint",
      organizationCompatibility: "not_available — cross-organization suite is a CI signal, not per-organization production data",
      runtimeValidation: "not_available — publish history only ever contains successful compiles by construction; a validRate computed from it would be a meaningless constant 100%, not a real measurement",
      correctionMemoryHealth: "not_available — Correction Memory is user-scoped and client-side; the backend has no visibility into it",
    },
    dataSource: "live", // every non-null field above is computed from real backend state, never fabricated
  });
}
