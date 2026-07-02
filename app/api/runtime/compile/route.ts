import { NextRequest, NextResponse } from "next/server";
// @ts-ignore - plain JS module, allowJs handles the type surface
import { compileFromPackage } from "@/lib/backend/state.mjs";

/**
 * Del 2 step: Draft -> Compile -> Validate. Does not publish. Loads the
 * organization's package fresh every call (no in-memory "draft" state) —
 * the package files on disk ARE the draft, consistent with Phase 8's
 * package format.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { organizationSlug } = body;
  if (!organizationSlug) return NextResponse.json({ error: "organizationSlug required" }, { status: 400 });

  try {
    const result = compileFromPackage(organizationSlug);
    if (!result.valid || !result.runtime) {
      return NextResponse.json({ ok: false, stage: "validate", errors: result.errors }, { status: 422 });
    }
    return NextResponse.json({ ok: true, stage: "validate", checksum: result.runtime.checksum, runtimeVersion: result.runtime.runtimeVersion, organizationId: result.organizationId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, stage: "compile", error: String(e?.message || e) }, { status: 400 });
  }
}
