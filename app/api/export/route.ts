import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { exportLog, recordExport, getDeviceSecret, isDeviceRegistered, isDeviceActive, getDeviceOrganization, getActiveRuntime } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { receiveExport } from "@/lib/relay/store.mjs";

/**
 * Del 4: the real export endpoint. Verifies the EXACT HMAC scheme
 * motor.js's real syncExports()/computeHmacSignature() already computes
 * (HMAC-SHA256 over the raw body, hex-encoded, header
 * X-Punchout-Signature) — no new auth scheme invented, this is Del 1's
 * "Identity" reduced to its honest scope: verifying which device sent
 * an export, not a login system.
 *
 * Phase A Del 1/6 hardening: an unregistered device is now REJECTED
 * (401), never accepted as "received but unverified" — closes the gap
 * where any caller could push export data under an arbitrary,
 * never-provisioned device id. Devices must go through
 * POST /api/devices/register (admin-gated) first.
 *
 * Response codes deliberately match what motor.js's syncExports()
 * already knows how to interpret (read directly from motor.js, not
 * assumed): 2xx or 409 = sent; 4xx (not 409) = failed, no retry; 5xx =
 * failed, retry with backoff. Idempotent on exportId — a duplicate
 * POST returns 409, motor.js already treats that as success.
 */
async function verifySignature(deviceId: string, rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const secret = getDeviceSecret(deviceId);
  if (!secret) return false; // unreachable in practice — caller checks isDeviceRegistered first, kept as a defensive fallback
  if (!signatureHeader) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === signatureHeader;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  let packet: any;
  try {
    packet = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const deviceId = req.headers.get("X-Punchout-Device") || packet.deviceId;
  const signatureHeader = req.headers.get("X-Punchout-Signature");
  const exportId = packet.exportId;

  if (!exportId || !deviceId) {
    return NextResponse.json({ error: "exportId and deviceId required" }, { status: 400 });
  }

  // Idempotent retry: same exportId already logged -> 409, which
  // motor.js's syncExports() already treats as success. Checked before
  // identity so a duplicate retry from an already-accepted device never
  // fails for an unrelated reason.
  const existing = exportLog.find((e: any) => e.exportId === exportId);
  if (existing) {
    return NextResponse.json({ receiptId: "receipt_" + exportId, status: "duplicate" }, { status: 409 });
  }

  if (!isDeviceRegistered(deviceId)) {
    recordExport({ receivedAt: new Date().toISOString(), exportId, organizationId: "unknown", deviceId, signatureValid: false, rejectedReason: "unregistered_device" });
    return NextResponse.json({ error: "unknown device — register it via /api/devices/register before exporting" }, { status: 401 });
  }

  // Operation Punchout Soft Launch, Phase B finding: this used to record
  // packet.userId (the worker's own id) as organizationId — confused with a
  // different field entirely, and worse, trusted a client-declared value for
  // something Identity Integrity requires to be tamper-proof. Now resolved
  // from the device registry (set once, admin-only, at /api/devices/register)
  // via the already-authenticated deviceId — never from anything the client
  // itself sends in the export packet.
  const organizationId = getDeviceOrganization(deviceId) || "unknown";

  // Execution Sprint 1 Oppgave 1: a KNOWN but disabled device is rejected
  // regardless of signature validity — checked before verifySignature so a
  // disabled device can never "win a race" against its own revocation by
  // presenting a still-valid signature. 403 (identity known, action
  // forbidden), distinct from 401 (identity unknown/invalid) above.
  if (!isDeviceActive(deviceId)) {
    recordExport({ receivedAt: new Date().toISOString(), exportId, organizationId, deviceId, signatureValid: false, rejectedReason: "device_disabled" });
    return NextResponse.json({ error: "this device has been disabled and can no longer export — contact your administrator" }, { status: 403 });
  }

  const signatureValid = await verifySignature(deviceId, rawBody, signatureHeader);
  if (!signatureValid) {
    recordExport({ receivedAt: new Date().toISOString(), exportId, organizationId, deviceId, signatureValid: false });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Operation Punchout Field Trial: the locked workday now enters the RELAY —
  // durable custody — rather than being acknowledged and discarded.
  //
  // Everything above this line is unchanged, and that ordering is the trust
  // boundary: every rejection path (unregistered device, disabled device,
  // invalid signature) has already returned, so ONLY signature-verified
  // exports can reach the Relay. A rejected delivery stays a receipt-log entry
  // and can never be promoted to a trusted delivery state.
  //
  // Relay custody deliberately does NOT gate the response. The device has
  // already done its part correctly; failing its export because the server's
  // disk is full would push an unfixable failure back onto the worker, who
  // would retry forever. A failed store is logged loudly, recorded on the
  // receipt as `relayed: false`, and surfaced by GET /api/health.
  let runtimeVersion: number | null = null;
  try {
    runtimeVersion = getActiveRuntime(organizationId)?.runtimeVersion ?? null;
  } catch {
    runtimeVersion = null;
  }

  const relayed = receiveExport({ exportId, organizationId, deviceId, packet, runtimeVersion });

  recordExport({
    receivedAt: new Date().toISOString(),
    exportId,
    organizationId,
    deviceId,
    signatureValid: true,
    // The receipt now records whether the operational record itself was
    // preserved, so "we have a receipt but no workday" is queryable rather
    // than invisible.
    relayed: relayed.stored,
    relayReason: relayed.reason,
  });

  return NextResponse.json(
    { receiptId: "receipt_" + exportId, status: "received", signatureVerified: true, relayed: relayed.stored },
    { status: 201 },
  );
}

// Dogfooding Punchout audit finding #1: this route had NO auth check at
// all — any unauthenticated caller could read the entire export log
// (device ids, organization ids, signature-validity history, no org
// scoping even available). The same class of bug Execution Sprint 4
// already fixed for /api/operations-center and /api/runtime/history, never
// applied here. Now admin-gated, matching the rest of the admin surface.
export async function GET(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  // Delivery receipts only. The operational records themselves are read
  // through /api/relay, which owns that surface — see lib/relay/store.mjs.
  return NextResponse.json({ count: exportLog.length, entries: exportLog });
}
