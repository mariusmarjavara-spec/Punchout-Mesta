import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { listRelayRecords, readRelayRecord, readDeliveryState, listRelayOrganizations, relayCounts } from "@/lib/relay/store.mjs";
// @ts-ignore
import { dispatchPending, deliverOne, listTargets } from "@/lib/relay/dispatcher.mjs";

/**
 * RELAY INSPECTION AND DISPATCH API. Admin-gated, matching the rest of the
 * admin surface (/api/operations-center, /api/runtime/history, /api/export).
 *
 * This is the "evidence inspection" surface the field trial requires — the
 * founder must be able to see what the phone delivered without developer
 * archaeology, and without a full Operations dashboard being built to do it.
 *
 *   GET  /api/relay                              organizations + record counts + targets
 *   GET  /api/relay?org=mesta                    workday metadata + delivery state, no payloads
 *   GET  /api/relay?org=mesta&exportId=...       ONE workday, full payload + delivery history
 *   POST /api/relay  {org, target?}              dispatch every pending record
 *   POST /api/relay  {org, exportId, target?}    dispatch one record
 *
 * Organization scoping is structural, not a filter: org A's directory cannot
 * name org B's files, so a cross-organization read resolves to a path that
 * does not exist (lib/relay/store.mjs).
 */
export async function GET(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("org");
  const exportId = req.nextUrl.searchParams.get("exportId");

  if (organizationId && exportId) {
    const record = readRelayRecord(organizationId, exportId);
    if (!record) {
      return NextResponse.json({ error: "no relay record for that organization and exportId" }, { status: 404 });
    }
    return NextResponse.json({ record, delivery: readDeliveryState(organizationId, exportId).targets });
  }

  if (organizationId) {
    const records = listRelayRecords(organizationId);
    return NextResponse.json({ organizationId, count: records.length, records });
  }

  return NextResponse.json({
    organizations: listRelayOrganizations(),
    counts: relayCounts(),
    targets: listTargets(),
  });
}

export async function POST(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => null);
  const organizationId = body?.org;
  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json({ error: "org is required" }, { status: 400 });
  }
  const target = typeof body?.target === "string" && body.target ? body.target : "csv-file";

  try {
    if (body?.exportId) {
      const result = deliverOne(organizationId, String(body.exportId), target);
      // A delivery that legitimately failed downstream is not an API error —
      // the request was handled correctly and the outcome is the payload. The
      // Relay still holds the workday either way, which is the point.
      return NextResponse.json(result, { status: 200 });
    }
    const summary = dispatchPending(organizationId, target);
    return NextResponse.json(summary, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 400 });
  }
}
