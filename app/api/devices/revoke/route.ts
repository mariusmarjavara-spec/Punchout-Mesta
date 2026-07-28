import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { revokeDevice } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Execution Sprint 1 Oppgave 1: disables a device's export access without
 * deleting its identity or history — for a lost/stolen/decommissioned
 * device. Admin-gated, same bearer token as Runtime administration.
 */
async function handlePost(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deviceId, revokedBy } = body;
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const result = revokeDevice(deviceId, revokedBy || "unknown");
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

export const POST = withRequestLog("/api/devices/revoke", handlePost);
