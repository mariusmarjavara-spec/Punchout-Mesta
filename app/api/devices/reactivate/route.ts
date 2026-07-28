import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { reactivateDevice } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Execution Sprint 1 Oppgave 1: re-enables a previously revoked device
 * (e.g. a found phone, or a decommission reversed). Admin-gated.
 */
async function handlePost(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deviceId, reactivatedBy } = body;
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const result = reactivateDevice(deviceId, reactivatedBy || "unknown");
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}

export const POST = withRequestLog("/api/devices/reactivate", handlePost);
