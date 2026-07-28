# Execution Sprint 4, Oppgave 2. Every step in this file was verified locally
# before being written down: `npm run build` succeeds, `output: "standalone"`
# (next.config.mjs) produces a working server (`node .next/standalone/server.js`,
# manually confirmed to serve /, /api/health, and /motor.js correctly), and
# .next/standalone already includes public/ and organizations/ via Next's file
# tracing (organizations/*/*.json is read with fs.readFileSync by
# lib/organization-package/loader.mjs, not imported, so the tracer needs it) —
# still copied explicitly below rather than relied on implicitly, since tracing
# behavior is not a contract this Dockerfile should depend on silently.
#
# NOT deployed anywhere by this sprint — no Fly.io/Railway account or
# credentials were available. This is a reviewed, buildable artifact; actual
# deployment is a documented next step (docs/deploy-runbook.md).

FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# PUNCHOUT_DATA_DIR must point at a mounted persistent volume in production
# (see fly.toml) — lib/backend/persistence.mjs writes backend-state.json here.
ENV PUNCHOUT_DATA_DIR=/data
RUN mkdir -p /data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/organizations ./organizations

EXPOSE 3000
ENV PORT=3000

# PUNCHOUT_ADMIN_TOKEN must be set as a real secret at deploy time
# (`fly secrets set PUNCHOUT_ADMIN_TOKEN=...`) — the app fails closed
# (rejects every admin request) if it's unset, by design (lib/backend/auth.mjs).
CMD ["node", "server.js"]
