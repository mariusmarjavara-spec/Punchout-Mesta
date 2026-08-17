import React from "react"
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import { cookies } from 'next/headers'
import './globals.css'

// Belt-and-suspenders: cookies() usage below already opts this layout
// into per-request dynamic rendering, but this makes that guarantee
// explicit rather than implicit, given how easy the module-instance bug
// below was to get wrong.
export const dynamic = 'force-dynamic'

/**
 * Operation Punchout Soft Launch, Phase B — the missing half of "Field
 * Browser Retrieves Correct Runtime". Confirmed by direct inspection (real
 * HTTP against a real running server) that this layout previously only
 * ever loaded a single static, organization-agnostic public/
 * punchout-config.js — the entire Organization Package -> Compile ->
 * Publish -> Runtime Store system was never consumed by a real browser at
 * all, regardless of what /api/runtime/active correctly returned over
 * HTTP. A device becomes "provisioned" via POST /api/devices/provision
 * (see that route), which sets the punchout_org_id cookie read here.
 *
 * Escapes '<' in the JSON payload before embedding it in an inline
 * <script> — organization package content is admin-authored/trusted, not
 * end-user input, but an unescaped "</script>" sequence in any string
 * field would still prematurely terminate the tag; cheap to prevent.
 */
function buildInjectedConfigScript(runtime: any): string {
  const config = {
    lonnskoder: runtime.runtimeConfig?.lonnskoder ?? [],
    sjaDefaults: runtime.runtimeConfig?.sjaDefaults ?? null,
    kjoretoy: runtime.runtimeConfig?.kjoretoy ?? [],
    externalLinks: runtime.runtimeConfig?.externalLinks ?? [],
    // `hoofdordre` is the organization's PRIMARY ACTIVE WORK ORDER
    // (lib/organization/types.mjs toRuntimeConfig), not the main timesheet
    // bucket — see normalizeConfig() in public/motor.js for why those must
    // stay separate, and what breaks when they are conflated. It is passed
    // through for consumers that want it. `hovedordre` (the main bucket) is
    // deliberately NOT emitted here: no compiled OrganizationRuntime carries
    // that setting today, so motor.js applies its documented "HOVED" default,
    // which is exactly the live pilot's current behaviour.
    hoofdordre: runtime.runtimeConfig?.hoofdordre ?? '',
    organizationId: runtime.organizationId,
    // exportEndpoint/telemetryEndpoint are always this same app's own
    // routes — relative, so they're correct regardless of deploy host.
    // exportHmacSecret/userId are intentionally NOT set here: they live in
    // localStorage only (written once by /provision), never server-rendered,
    // since this script's output is visible in page source.
    exportEndpoint: '/api/export',
    telemetryEndpoint: '/api/telemetry',
  };
  const runtimeJson = JSON.stringify(runtime).replace(/</g, '\\u003c');
  const configJson = JSON.stringify(config).replace(/</g, '\\u003c');
  return (
    'window.PUNCHOUT_RUNTIME = ' + runtimeJson + ';\n' +
    'window.PUNCHOUT_CONFIG = Object.assign({}, ' + configJson + ', {\n' +
    "  exportHmacSecret: window.localStorage.getItem('punchout_export_hmac_secret'),\n" +
    "  userId: window.localStorage.getItem('punchout_user_id'),\n" +
    '});'
  );
}

const geistSans = Geist({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-geist-mono",
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Punchout - Feltlogg',
  description: 'Voice-first dagslogg for feltarbeidere',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

/**
 * Real, severe bug found via real-browser end-to-end testing (reproduced
 * identically against the actual production Docker build, not just
 * `next dev`, ruling out a dev-only artifact): a provisioned device's
 * cookie was read correctly, but the Runtime it pointed to came back
 * empty regardless — confirmed root cause via a temporary per-module
 * instance-id log: Next.js compiles Route Handlers (app/api/**) and
 * Server Components (layouts/pages) into SEPARATE bundles, and
 * lib/backend/state.mjs's module-level in-memory Maps get an
 * INDEPENDENT instantiation in each — a write made via
 * POST /api/runtime/publish (the route-handler instance) was never
 * visible to a direct getActiveRuntime() call from this layout (the
 * server-component instance), even within the same process, even in the
 * production standalone build. This was never reachable before this
 * session's Phase B work, since state.mjs had never previously been
 * imported from anywhere but a Route Handler.
 *
 * Fixed by crossing the exact boundary Next.js's architecture actually
 * respects: a real internal HTTP call to this app's own
 * GET /api/runtime/active, the same endpoint any other real client
 * already uses — not a direct in-process function call into shared
 * module state. cache: 'no-store' bypasses Next's fetch-level Data
 * Cache, matching the always-fresh-per-request requirement here.
 *
 * Founder decision 2026-08-14: that route now returns only minimal,
 * non-sensitive bootstrap metadata unless the caller presents a valid
 * punchout_device_session. This outbound fetch is a fresh server-to-
 * server request — Next.js never forwards the incoming browser request's
 * cookies to it automatically — so the incoming session cookie is read
 * explicitly (see RootLayout below) and forwarded here, or this layout
 * would silently regress to the minimal-metadata response for every
 * already-provisioned device and motor.js would never receive a real
 * Runtime again.
 */
async function fetchActiveRuntime(organizationId: string, deviceSessionCookie: string | undefined): Promise<any | null> {
  const port = process.env.PORT || '3000'
  try {
    const res = await fetch(`http://localhost:${port}/api/runtime/active?org=${encodeURIComponent(organizationId)}`, {
      cache: 'no-store',
      headers: deviceSessionCookie ? { cookie: `punchout_device_session=${deviceSessionCookie}` } : undefined,
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Phase B: a provisioned device (see /provision, /api/devices/provision)
  // carries this httpOnly cookie. Unprovisioned — no cookie, or a
  // provisioned org with nothing published yet — falls back to the
  // original static config exactly as before: never a regression for the
  // existing default/demo path or for CI, which never sets this cookie.
  const cookieStore = await cookies()
  const organizationId = cookieStore.get('punchout_org_id')?.value
  const deviceSessionCookie = cookieStore.get('punchout_device_session')?.value
  const runtime = organizationId ? await fetchActiveRuntime(organizationId, deviceSessionCookie) : null
  // Founder decision 2026-08-14: without a valid device session, the route
  // now returns only minimal bootstrap metadata (no runtimeConfig/schemas/
  // rules) — that shape can never drive motor.js, so it's treated the same
  // as "no runtime" and falls back to the static config below, exactly
  // like an expired or not-yet-provisioned device already did.
  const hasFullRuntime = runtime != null && runtime.runtimeConfig !== undefined

  return (
    <html lang="no">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {hasFullRuntime ? (
          <Script id="punchout-runtime-config" strategy="beforeInteractive">
            {buildInjectedConfigScript(runtime)}
          </Script>
        ) : (
          /* Konfig lastes FØR motor — setter window.PUNCHOUT_CONFIG */
          <Script src="/punchout-config.js" strategy="beforeInteractive" />
        )}
        {/* Motor må lastes FØR React UI */}
        <Script src="/motor.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  )
}
