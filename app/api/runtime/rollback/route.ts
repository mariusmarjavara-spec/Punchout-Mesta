import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { rollback } from "@/lib/backend/state.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";

/** Del 2/6: Rollback — reactivates an older manifest, nothing deleted (lib/runtime/store.mjs, unchanged since Phase 6). Phase A Del 1/5: admin-gated. */
export async function POST(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { organizationId, toVersion } = body;
  if (!organizationId || typeof toVersion !== "number") {
    return NextResponse.json({ error: "organizationId and numeric toVersion required" }, { status: 400 });
  }
  const result = rollback(organizationId, toVersion);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
