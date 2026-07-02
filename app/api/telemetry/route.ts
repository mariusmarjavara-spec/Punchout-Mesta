import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { telemetryLog } from "@/lib/backend/state.mjs";

/**
 * Del 5: receives whatever telemetry the caller hands it — motor.js
 * itself has no "flush to backend" function yet (that would be new
 * motor functionality, explicitly out of scope this phase); this
 * endpoint's job is only to prove the RECEIVING side works. Accepts an
 * array of TelemetryEvent (lib/telemetry/types.mjs shape).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const events = Array.isArray(body) ? body : body?.events;
  if (!Array.isArray(events)) return NextResponse.json({ error: "expected an array of telemetry events (or {events:[...]})" }, { status: 400 });

  for (const e of events) telemetryLog.push(e);
  return NextResponse.json({ received: events.length, totalStored: telemetryLog.length }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("org");
  const filtered = organizationId ? telemetryLog.filter((e: any) => e.organizationId === organizationId) : telemetryLog;
  return NextResponse.json({ count: filtered.length, events: filtered });
}
