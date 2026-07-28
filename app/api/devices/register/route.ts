import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { registerDevice, listDevices } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Phase A Del 1/6: explicit device registration. Closes the gap where
 * an export-capable device secret was a hardcoded constant. Admin-only
 * (same bearer token as Runtime administration) — a field device
 * itself never calls this; an administrator provisions it once, out of
 * band, and the returned secret is configured on that device.
 * The secret is returned ONLY in this response — it is stored server-side
 * as a hash-equivalent plain value for HMAC verification (not retrievable
 * again via GET), matching how a real secret-provisioning flow behaves.
 */
async function handlePost(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { deviceId, registeredBy } = body;
  if (!deviceId) return NextResponse.json({ error: "deviceId required" }, { status: 400 });

  const secret = registerDevice(deviceId, registeredBy || "unknown", body.secret);
  return NextResponse.json({ deviceId, secret, note: "store this secret on the device now — it will not be shown again" }, { status: 201 });
}

async function handleGet(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  return NextResponse.json({ devices: listDevices() });
}

export const POST = withRequestLog("/api/devices/register", handlePost);
export const GET = withRequestLog("/api/devices/register", handleGet);
