import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { telemetryLog } from "@/lib/backend/state.mjs";
// @ts-ignore
import { crashSummary } from "@/lib/operations-center/metrics.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * po-crash-telemetry-aggregation: the "aggregator" half of "wire existing
 * crash-telemetry capture to an external aggregator/pager." motor.js's
 * window.onerror/unhandledrejection handlers have recorded ClientError
 * telemetry events since post-sprint-3-strategic-review.md's Oppgave 3 —
 * captured, tested, and until now completely un-surfaced: an admin had to
 * already know to filter GET /api/telemetry for type=ClientError
 * themselves, with no grouping or counts. This is that read side,
 * built on lib/operations-center/metrics.mjs::crashSummary(), the same
 * "pure function over TelemetryEvent[]" pattern operations-center already
 * established.
 *
 * The other half (a real-time webhook page on each new crash) lives in
 * lib/backend/crash-pager.mjs, invoked from recordTelemetry() in
 * state.mjs — that half needs no HTTP surface of its own.
 */
async function handleGet(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("org");
  const scoped = organizationId ? telemetryLog.filter((e: any) => e.organizationId === organizationId) : telemetryLog;

  return NextResponse.json({ organizationId: organizationId || null, ...crashSummary(scoped) });
}

export const GET = withRequestLog("/api/telemetry/crashes", handleGet);
