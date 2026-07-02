import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { getActiveRuntime } from "@/lib/backend/state.mjs";

/** Del 2/3: Mobile Sync + Activation source. What a device polls/syncs against. */
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) return NextResponse.json({ error: "org query param required" }, { status: 400 });

  const runtime = getActiveRuntime(organizationId);
  if (!runtime) return NextResponse.json({ error: "no published runtime for organization " + organizationId }, { status: 404 });
  return NextResponse.json(runtime);
}
