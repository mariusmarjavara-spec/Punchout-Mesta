import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { getDeviceSecret, getDeviceOrganization, isDeviceRegistered, isDeviceActive } from "@/lib/backend/state.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Operation Punchout Soft Launch, Phase B — closes the field client
 * provisioning gap: an admin already registers a device via
 * POST /api/devices/register (admin-token gated) and receives
 * {deviceId, organizationId, secret}. Until now there was no mechanism
 * for that deviceId+secret to ever reach the physical device's browser —
 * confirmed by reading the entire real client bootstrap (app/layout.tsx)
 * and finding it only ever loaded a single static, organization-agnostic
 * public/punchout-config.js, never anything device- or org-aware.
 *
 * This route is the missing other half: a field device (not an admin —
 * no admin bearer token here) proves it holds a real deviceId+secret pair
 * an admin already issued it, and in exchange learns its own
 * organizationId and gets it set as an httpOnly cookie so
 * app/layout.tsx can read it on every subsequent request and inject that
 * organization's real, compiled, published Runtime before motor.js runs.
 * organizationId is never trusted from the request body — only ever
 * looked up server-side via the already-authenticated deviceId, matching
 * the same tamper-proof posture as export's organizationId fix.
 *
 * Deliberately NOT admin-gated: a field device has no admin token and
 * was never meant to. Its credential is the deviceId+secret pair itself,
 * the same credential /api/export already trusts for HMAC signing.
 */
async function handlePost(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { deviceId, secret } = body;
  if (!deviceId || !secret) {
    return NextResponse.json({ error: "deviceId and secret required" }, { status: 400 });
  }

  if (!isDeviceRegistered(deviceId)) {
    return NextResponse.json({ error: "unknown device — ask an administrator to register it via /api/devices/register first" }, { status: 401 });
  }
  if (!isDeviceActive(deviceId)) {
    return NextResponse.json({ error: "this device has been disabled — contact your administrator" }, { status: 403 });
  }
  if (getDeviceSecret(deviceId) !== secret) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  const organizationId = getDeviceOrganization(deviceId);
  if (!organizationId) {
    // Devices registered before this fix exist without an organizationId
    // (backward-compat default, see state.mjs) — a real, actionable gap,
    // not a bug: this device must be re-registered with an organizationId
    // before it can be provisioned.
    return NextResponse.json({ error: "this device has no organizationId on record — ask an administrator to re-register it with one" }, { status: 409 });
  }

  const res = NextResponse.json({ deviceId, organizationId }, { status: 200 });
  res.cookies.set("punchout_org_id", organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // a provisioned device stays provisioned for a year without needing this step again
  });
  return res;
}

export const POST = withRequestLog("/api/devices/provision", handlePost);
