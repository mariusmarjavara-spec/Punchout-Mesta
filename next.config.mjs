/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_RELEASE_SHA:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_RELEASE_SHA ?? "unknown",
    NEXT_PUBLIC_DEPLOYMENT_ENV:
      process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ?? "unknown",
  },
}

export default nextConfig
