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
    hoofdordre: runtime.runtimeConfig?.hoofdordre ?? 'HOVED',
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
 */
async function fetchActiveRuntime(organizationId: string): Promise<any | null> {
  const port = process.env.PORT || '3000'
  try {
    const res = await fetch(`http://localhost:${port}/api/runtime/active?org=${encodeURIComponent(organizationId)}`, {
      cache: 'no-store',
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
  const runtime = organizationId ? await fetchActiveRuntime(organizationId) : null

  return (
    <html lang="no">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        {runtime ? (
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
