/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Execution Sprint 4, Oppgave 2: produces .next/standalone — a minimal,
  // self-contained server bundle (own node_modules subset + server.js)
  // instead of requiring `next start` + the full node_modules tree in
  // the deploy image. Required for the Dockerfile added this sprint.
  output: "standalone",
  // Execution Sprint 4, Oppgave 3: removes the default `X-Powered-By: Next.js`
  // response header — a low-severity but real version-fingerprinting leak,
  // no behavior change otherwise.
  poweredByHeader: false,
}

export default nextConfig
