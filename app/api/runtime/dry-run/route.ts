import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { runFullDayScenario } from "@/lib/regression/full-day-scenario.mjs";
// @ts-ignore
import { resolveOrganizationDir } from "@/lib/organization-package/loader.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Del 2 step: Dry Run. Reuses the exact Phase 10 regression scenario
 * (compile -> start day -> work -> incident -> håndrens -> lock ->
 * export -> adapter -> ranking) against real motor.js in a vm sandbox —
 * the same proof mechanism already validated across 4 organizations,
 * now callable over HTTP as the gate before publish.
 *
 * Phase A Del 1/5: admin-gated, same as compile/publish/rollback.
 */
async function handlePost(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { organizationSlug } = body;
  if (!organizationSlug) return NextResponse.json({ error: "organizationSlug required" }, { status: 400 });

  let orgDir: string;
  try {
    orgDir = resolveOrganizationDir(organizationSlug);
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }

  const result = await runFullDayScenario(orgDir);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

export const POST = withRequestLog("/api/runtime/dry-run", handlePost);
