import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { exportLog, DEVICE_SECRETS } from "@/lib/backend/state.mjs";

/**
 * Del 4: the real export endpoint. Verifies the EXACT HMAC scheme
 * motor.js's real syncExports()/computeHmacSignature() already computes
 * (HMAC-SHA256 over the raw body, hex-encoded, header
 * X-Punchout-Signature) — no new auth scheme invented, this is Del 1's
 * "Identity" reduced to its honest scope: verifying which device sent
 * an export, not a login system.
 *
 * Response codes deliberately match what motor.js's syncExports()
 * already knows how to interpret (read directly from motor.js, not
 * assumed): 2xx or 409 = sent; 4xx (not 409) = failed, no retry; 5xx =
 * failed, retry with backoff. Idempotent on exportId — a duplicate
 * POST returns 409, motor.js already treats that as success.
 */
async function verifySignature(deviceId: string, rawBody: string, signatureHeader: string | null): Promise<boolean | null> {
  const secret = DEVICE_SECRETS[deviceId as keyof typeof DEVICE_SECRETS];
  if (!secret) return null; // unknown device — caller decides how to treat "null"
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
  // motor.js's syncExports() already treats as success.
  const existing = exportLog.find((e: any) => e.exportId === exportId);
  if (existing) {
    return NextResponse.json({ receiptId: "receipt_" + exportId, status: "duplicate" }, { status: 409 });
  }

  const signatureValid = await verifySignature(deviceId, rawBody, signatureHeader);
  // Known device, signature required but wrong/missing -> reject (4xx, no retry — correct: retrying won't fix a bad signature).
  if (signatureValid === false) {
    exportLog.push({ receivedAt: new Date().toISOString(), exportId, organizationId: packet.userId || "unknown", deviceId, signatureValid: false });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  exportLog.push({ receivedAt: new Date().toISOString(), exportId, organizationId: packet.userId || "unknown", deviceId, signatureValid });
  return NextResponse.json({ receiptId: "receipt_" + exportId, status: "received", signatureVerified: signatureValid === true }, { status: 201 });
}

export async function GET() {
  return NextResponse.json({ count: exportLog.length, entries: exportLog });
}
