import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { runFullDayScenario } from "@/lib/regression/full-day-scenario.mjs";

/**
 * Del 2 step: Dry Run. Reuses the exact Phase 10 regression scenario
 * (compile -> start day -> work -> incident -> håndrens -> lock ->
 * export -> adapter -> ranking) against real motor.js in a vm sandbox —
 * the same proof mechanism already validated across 4 organizations,
 * now callable over HTTP as the gate before publish.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { organizationSlug } = body;
  if (!organizationSlug) return NextResponse.json({ error: "organizationSlug required" }, { status: 400 });

  const result = await runFullDayScenario("./organizations/" + organizationSlug);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
