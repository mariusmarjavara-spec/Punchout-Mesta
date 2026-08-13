import React from "react"
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import Script from 'next/script'
import { cookies } from 'next/headers'
// @ts-ignore
import { getActiveRuntime } from '@/lib/backend/state.mjs'
import './globals.css'

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
  const runtime = organizationId ? getActiveRuntime(organizationId) : null

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
        <Analytics />
      </body>
    </html>
  )
}
