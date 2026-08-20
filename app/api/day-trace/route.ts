import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { exportLog } from "@/lib/backend/state.mjs";
// @ts-ignore
import { readRelayRecord, readDeliveryState, listRelayExportIds } from "@/lib/relay/store.mjs";
// @ts-ignore
import { buildDayTrace } from "@/lib/operations-center/day-trace.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * DAY TRACE — the operator answer to "what happened to this day?".
 *
 *   GET /api/day-trace?org=mesta                  every day this org has, newest first
 *   GET /api/day-trace?org=mesta&exportId=…       one day, full stage-by-stage trace
 *
 * Admin-gated, matching the rest of the admin surface (/api/relay,
 * /api/operations-center, /api/runtime/history, /api/export).
 *
 * This route owns no state. It joins three existing sources — the export log,
 * the Relay record and the delivery state — and returns a reading of them. The
 * join is the point: a day REJECTED at ingest never reaches the Relay, so
 * /api/relay answers 404 and the operator learns nothing from the surface that
 * looks like it should know. The rejection was recorded the whole time, in the
 * export log, where nobody was looking.
 *
 * The listing deliberately includes ids that exist only as rejections, which is
 * why it unions relay ids with export-log ids rather than listing the Relay.
 */
async function handleGet(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) {
    return NextResponse.json({ error: "org query param required" }, { status: 400 });
  }
  const exportId = req.nextUrl.searchParams.get("exportId");

  if (exportId) {
    return NextResponse.json(traceOne(organizationId, exportId));
  }

  // Union, not concatenation: an id can be present in both sources.
  const ids = new Set<string>(listRelayExportIds(organizationId));
  for (const e of exportLog as any[]) {
    if (!e?.exportId) continue;
    // "unknown" rows are included so an unprovisioned device's rejected days
    // are visible to someone rather than to no one.
    if (e.organizationId === organizationId || e.organizationId === "unknown") {
      ids.add(String(e.exportId));
    }
  }

  const traces = [...ids]
    .map((id) => traceOne(organizationId, id))
    .sort((a, b) => String(receivedAtOf(b)).localeCompare(String(receivedAtOf(a))));

  return NextResponse.json({
    organizationId,
    count: traces.length,
    // A count per outcome, so "is anything stuck?" is answerable at a glance
    // rather than by reading every row.
    byOutcome: traces.reduce<Record<string, number>>((acc, t) => {
      acc[t.outcome] = (acc[t.outcome] ?? 0) + 1;
      return acc;
    }, {}),
    days: traces.map((t) => ({
      exportId: t.exportId,
      outcome: t.outcome,
      headline: t.headline,
      dayId: t.identity.dayId,
      deviceId: t.identity.deviceId,
      receivedAt: receivedAtOf(t),
      delivery: t.delivery.map((d: any) => ({
        target: d.target,
        status: d.status,
        attempts: d.attempts,
      })),
    })),
  });
}

function receivedAtOf(trace: any): string | null {
  const accepted = trace.stages.find((s: any) => s.stage === "ACCEPTED_BY_RELAY" && s.at);
  if (accepted) return accepted.at;
  const signed = trace.stages.find((s: any) => s.stage === "SIGNED" && s.at);
  return signed?.at ?? null;
}

function traceOne(organizationId: string, exportId: string) {
  let exportEntries = (exportLog as any[]).filter(
    (e) => e?.exportId === exportId && e?.organizationId === organizationId,
  );

  // An export from an UNREGISTERED device is logged with organizationId
  // "unknown", because there is no device registry entry to resolve an
  // organization from. Filtering strictly by org would therefore hide exactly
  // the rejection an operator is most likely to be hunting — a new or
  // re-imaged phone that was never provisioned. Falling back is honest: the
  // organization is genuinely unknown, not mismatched.
  if (exportEntries.length === 0) {
    exportEntries = (exportLog as any[]).filter(
      (e) => e?.exportId === exportId && e?.organizationId === "unknown",
    );
  }
  const relayRecord = readRelayRecord(organizationId, exportId);
  const deliveryTargets = relayRecord
    ? readDeliveryState(organizationId, exportId).targets
    : {};

  return buildDayTrace({ exportId, organizationId, exportEntries, relayRecord, deliveryTargets });
}

export const GET = withRequestLog("/api/day-trace", handleGet);
