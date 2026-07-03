import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { getDeviceAuditLog } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";

/**
 * Execution Sprint 1 Oppgave 1: read-only, append-only audit trail of
 * every register/revoke/reactivate action, admin-gated. Answers "who
 * disabled this device and when" during an incident.
 */
export async function GET(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });
  return NextResponse.json({ entries: getDeviceAuditLog() });
}
