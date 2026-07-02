import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { getHistory } from "@/lib/backend/state.mjs";

export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) return NextResponse.json({ error: "org query param required" }, { status: 400 });
  return NextResponse.json(getHistory(organizationId));
}
