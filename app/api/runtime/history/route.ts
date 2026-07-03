import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { getHistory } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";

/**
 * Execution Sprint 1 Oppgave 5 finding: this route had no auth at all —
 * unlike /api/runtime/active (which a field device legitimately polls
 * to know which Runtime to sync, with no admin token available to it),
 * history serves no field-device purpose. It leaks operational metadata
 * (publish frequency, who published, signatures, timestamps) for any
 * organizationId a caller can guess. Now admin-gated, matching compile/
 * dry-run/publish/rollback.
 */
export async function GET(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) return NextResponse.json({ error: "org query param required" }, { status: 400 });
  return NextResponse.json(getHistory(organizationId));
}
