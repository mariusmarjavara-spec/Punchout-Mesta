import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { telemetryLog, exportLog, getHistory } from "@/lib/backend/state.mjs";
// @ts-ignore
import { completionRate, exportHealth, runtimeAdoption, ruleFrequency, promptOutcomeByTarget } from "@/lib/operations-center/metrics.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Del 5 (Phase 11) / Del 4 (Phase A) / Del 7 (Validation Sprint):
 * Operations Center must never show placeholder data as if it were a
 * real measurement.
 *
 * Phase A finding: this route previously called platformHealth() with
 * regressionResults/crossOrgResults/correctionEntries hardcoded to []
 * — fixed by only reporting what's actually observable per-organization
 * (see git history for that finding's full detail).
 *
 * Validation Sprint Del 7 finding: lib/operations-center/metrics.mjs
 * (completionRate, exportHealth, runtimeAdoption, ruleFrequency,
 * promptOutcomeByTarget) has existed since Phase 6.5 as pure functions
 * over TelemetryEvent[] — real, already-tested analytics — but this
 * live route never called them; it only surfaced a small hand-rolled
 * subset. Del 7 explicitly asks "kan man se Completion Rate / se
 * Runtime-adopsjon?" — the honest answer was no, not because the data
 * didn't exist, but because nothing wired it up. This wires them in,
 * fed by the SAME real orgTelemetry array already computed below. No
 * new metric is invented; every one of these already existed and was
 * already covered by earlier phases' dry runs against synthetic data —
 * this is the first time they run against live backend telemetry.
 *
 * Execution Sprint 4, Oppgave 3 finding: this route had NO auth check at
 * all — confirmed live (200 with full telemetry/export/runtime data, no
 * Authorization header, for any guessed ?org=). Execution Sprint 1
 * Oppgave 5 already fixed this exact class of bug for
 * /api/runtime/history (see that file) but it was never applied here,
 * even though this route leaks strictly more: telemetry content and
 * export logs, not just publish metadata. Now admin-gated, matching the
 * rest of the admin surface.
 */
async function handleGet(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) return NextResponse.json({ error: "org query param required" }, { status: 400 });

  const orgTelemetry = telemetryLog.filter((e: any) => e.organizationId === organizationId);
  const orgExports = exportLog.filter((e: any) => e.organizationId === organizationId);
  const history = getHistory(organizationId);

  const health = {
    exportHealth: exportHealth(orgTelemetry),
    completionRate: completionRate(orgTelemetry),
    runtimeAdoption: runtimeAdoption(orgTelemetry),
    ruleFrequency: ruleFrequency(orgTelemetry),
    promptOutcomeByTarget: promptOutcomeByTarget(orgTelemetry),
    publishHistory: { totalPublishes: history.length, activeVersion: history.find((m: any) => m.status === "active")?.runtimeVersion ?? null },
    regressionStatus: null,
    organizationCompatibility: null,
    runtimeValidation: null,
    correctionMemoryHealth: null,
  };

  return NextResponse.json({
    organizationId,
    runtimeHistory: history,
    exportLog: orgExports,
    telemetryEventCount: orgTelemetry.length,
    health,
    dataAvailability: {
      exportHealth: "live — lib/operations-center/metrics.mjs::exportHealth() over telemetry received by this backend",
      completionRate: "live — lib/operations-center/metrics.mjs::completionRate() over telemetry received by this backend",
      runtimeAdoption: "live — lib/operations-center/metrics.mjs::runtimeAdoption() over telemetry received by this backend",
      ruleFrequency: "live — lib/operations-center/metrics.mjs::ruleFrequency() over telemetry received by this backend",
      promptOutcomeByTarget: "live — lib/operations-center/metrics.mjs::promptOutcomeByTarget() over telemetry received by this backend",
      publishHistory: "live — computed from this organization's Runtime Store",
      regressionStatus: "not_available — regression suite is a whole-codebase CI signal, not per-organization production data; not wired to this endpoint",
      organizationCompatibility: "not_available — cross-organization suite is a CI signal, not per-organization production data",
      runtimeValidation: "not_available — publish history only ever contains successful compiles by construction; a validRate computed from it would be a meaningless constant 100%, not a real measurement",
      correctionMemoryHealth: "not_available — Correction Memory is user-scoped and client-side; the backend has no visibility into it",
    },
    dataSource: "live", // every non-null field above is computed from real backend state via already-existing, already-tested pure functions — nothing fabricated, nothing new invented
  });
}

export const GET = withRequestLog("/api/operations-center", handleGet);
