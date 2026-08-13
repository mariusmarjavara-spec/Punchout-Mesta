import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { telemetryLog, recordTelemetry } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";

/**
 * Del 5 (Phase 11) / Del 3 (Phase A): receives telemetry batches.
 * motor.js now auto-flushes unflushed events on an interval, batched,
 * with per-event ids for idempotency — recordTelemetry() dedupes by
 * id, so a batch resent after a lost response (client never saw the
 * 2xx) is safely a no-op on the events already stored, and the
 * response is persisted immediately (Phase A Del 2).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const events = Array.isArray(body) ? body : body?.events;
  if (!Array.isArray(events)) return NextResponse.json({ error: "expected an array of telemetry events (or {events:[...]})" }, { status: 400 });

  const stored = recordTelemetry(events);
  return NextResponse.json({ received: events.length, storedNew: stored, totalStored: telemetryLog.length }, { status: 201 });
}

// Dogfooding Punchout audit finding #1: this route had NO auth check at
// all — any unauthenticated caller could read the full telemetry log
// (optionally scoped by ?org=). The same class of bug Execution Sprint 4
// already fixed for /api/operations-center and /api/runtime/history, never
// applied here. Now admin-gated, matching the rest of the admin surface.
export async function GET(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("org");
  const filtered = organizationId ? telemetryLog.filter((e: any) => e.organizationId === organizationId) : telemetryLog;
  return NextResponse.json({ count: filtered.length, events: filtered });
}
