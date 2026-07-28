import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { compileFromPackage, publish } from "@/lib/backend/state.mjs";
// @ts-ignore
import { runFullDayScenario } from "@/lib/regression/full-day-scenario.mjs";
// @ts-ignore
import { verifyAdminAuth } from "@/lib/backend/auth.mjs";
// @ts-ignore
import { withRequestLog } from "@/lib/observability/request-log.mjs";

/**
 * Del 2 steps: Approve -> Publish -> Sign -> Deploy, as one call for MVP
 * simplicity, but every stage is reported explicitly in the response —
 * "ingen skjulte overganger" means visible stages, not necessarily
 * separate HTTP round-trips for each one. `approved: true` is the
 * explicit human gate (Del 2's "Approve"); Compile+Validate+Dry Run are
 * re-run here as hard gates regardless of what a prior /compile or
 * /dry-run call returned — a publish can never skip them by only
 * calling this endpoint. Signing happens inside RuntimeStore.publish()
 * (existing Phase 6 mechanism, reused unchanged). "Deploy" = the
 * manifest becomes immediately visible to GET /api/runtime/active.
 *
 * Phase A Del 1/5: admin-gated — checked before `approved`, so an
 * unauthenticated caller can never reach the approve/compile/dry-run
 * stages at all, not just the final publish.
 */
async function handlePost(req: NextRequest) {
  const auth = verifyAdminAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { organizationSlug, publishedBy, approved } = body;
  if (!organizationSlug) return NextResponse.json({ error: "organizationSlug required" }, { status: 400 });
  if (!approved) return NextResponse.json({ ok: false, stage: "approve", error: "publish requires approved: true" }, { status: 403 });

  const compiled = compileFromPackage(organizationSlug);
  if (!compiled.valid) {
    return NextResponse.json({ ok: false, stage: "validate", errors: compiled.errors }, { status: 422 });
  }

  const dryRun = await runFullDayScenario("./organizations/" + organizationSlug);
  if (!dryRun.ok) {
    return NextResponse.json({ ok: false, stage: "dry-run", detail: dryRun }, { status: 422 });
  }

  const manifest = publish(compiled.runtime, publishedBy || "unknown");
  return NextResponse.json({
    ok: true,
    stages: { validate: true, dryRun: true, approved: true, published: true, signed: !!manifest.signature, deployed: true },
    manifest,
  }, { status: 201 });
}

export const POST = withRequestLog("/api/runtime/publish", handlePost);
