import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { rollback } from "@/lib/backend/state.mjs";

/** Del 2/6: Rollback — reactivates an older manifest, nothing deleted (lib/runtime/store.mjs, unchanged since Phase 6). */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { organizationId, toVersion } = body;
  if (!organizationId || typeof toVersion !== "number") {
    return NextResponse.json({ error: "organizationId and numeric toVersion required" }, { status: 400 });
  }
  const result = rollback(organizationId, toVersion);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
