/** @type {import('next').NextConfig} */
const nextConfig = {
  // `typescript: { ignoreBuildErrors: true }` was removed as part of the
  // post-pilot engineering baseline. It had been suppressing type errors in
  // the one check that sees Next's generated route types (.next/types/**),
  // which a bare `tsc --noEmit` before a build cannot — so "CI runs typecheck"
  // was never the same guarantee as "the shipped build typechecks". Verified
  // clean at removal: `npm run typecheck` and `npm run build` both pass with
  // zero errors, so nothing was being hidden at the time it came off. Do not
  // re-add it to get an unblocked build; fix the types instead.
  //
  // The merge of origin/main restored it on that side; it is deliberately not
  // taken. Everything else from that branch is.
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
  // Release provenance, from origin/main. Falls back through Vercel's build
  // variables to explicit ones, so it stays correct on the Docker/Fly path
  // this branch added.
  env: {
    NEXT_PUBLIC_RELEASE_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_RELEASE_SHA ?? "unknown",
    NEXT_PUBLIC_DEPLOYMENT_ENV:
      process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? "unknown",
  },
}

export default nextConfig
