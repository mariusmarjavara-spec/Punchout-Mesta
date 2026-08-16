import { createHash } from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const rawHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!token || !rawHost) {
    return NextResponse.json({
      configured: false,
      tokenConfigured: Boolean(token),
      hostConfigured: Boolean(rawHost),
      ingestOk: false,
    });
  }

  const host = rawHost.replace(/\/$/, "");
  const tokenFingerprint = createHash("sha256").update(token).digest("hex").slice(0, 16);

  try {
    const response = await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        distinct_id: `punchout-health-${crypto.randomUUID()}`,
        event: "telemetry healthcheck",
        properties: {
          $process_person_profile: false,
          product: "punchout",
          source: "vercel-health-probe",
        },
      }),
      cache: "no-store",
    });

    return NextResponse.json({
      configured: true,
      tokenConfigured: true,
      hostConfigured: true,
      hostLooksEu: host === "https://eu.i.posthog.com",
      tokenFingerprint,
      ingestOk: response.ok,
      ingestStatus: response.status,
    });
  } catch {
    return NextResponse.json({
      configured: true,
      tokenConfigured: true,
      hostConfigured: true,
      hostLooksEu: host === "https://eu.i.posthog.com",
      tokenFingerprint,
      ingestOk: false,
      ingestStatus: null,
    });
  }
}
