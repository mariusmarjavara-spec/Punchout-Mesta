import { NextRequest, NextResponse } from "next/server";
// @ts-ignore
import { getActiveRuntime, resolveDeviceSession } from "@/lib/backend/state.mjs";

/**
 * Founder decision 2026-08-14 (runtime confidentiality boundary): the
 * full compiled OrganizationRuntime (schemas, rules, orders, machines,
 * knowledge graph — confidential operational configuration) now requires
 * provisioned-device authorization via the punchout_device_session cookie
 * (issued by POST /api/devices/provision). A valid session's own
 * organizationId is used — never the client-supplied ?org= query param —
 * so a device can never read another organization's Runtime by changing
 * the query string.
 *
 * An unauthenticated/unprovisioned caller (no session, or a session that
 * no longer resolves — e.g. a revoked device) still gets a 200, but only
 * this minimal, non-sensitive bootstrap/version fingerprint: enough for a
 * public health-style poll to see whether something changed, nothing an
 * attacker could use to reconstruct the organization's actual rules or
 * data. ?org= is still required for this path, same as before, since an
 * unauthenticated caller has no other way to say which organization's
 * version it's asking about.
 *
 * app/layout.tsx is itself a real caller of this route (an internal
 * server-to-server fetch, see its own fetchActiveRuntime doc comment) and
 * forwards the incoming request's punchout_device_session cookie
 * explicitly, since Next.js's server-side fetch() never does that
 * automatically.
 */
export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("org");
  if (!organizationId) return NextResponse.json({ error: "org query param required" }, { status: 400 });

  const session = resolveDeviceSession(req.cookies.get("punchout_device_session")?.value ?? null);

  if (session) {
    const runtime = getActiveRuntime(session.organizationId);
    if (!runtime) return NextResponse.json({ error: "no published runtime for organization " + session.organizationId }, { status: 404 });
    return NextResponse.json(runtime);
  }

  const runtime = getActiveRuntime(organizationId);
  if (!runtime) return NextResponse.json({ error: "no published runtime for organization " + organizationId }, { status: 404 });
  return NextResponse.json({
    organizationId: runtime.organizationId,
    runtimeVersion: runtime.runtimeVersion,
    compiledAt: runtime.compiledAt,
    checksum: runtime.checksum,
  });
}
