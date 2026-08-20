# Punchout

A deterministic, local-first day-logging system for field workers in Norwegian construction/infrastructure — voice-first entry, offline-safe, per-organization configuration compiled into a signed Runtime.

## Quickstart (local dev)

```bash
npm install
npm run dev          # http://localhost:3000
```

**npm, not pnpm or yarn.** `package-lock.json` is the only lockfile the project
maintains, and CI installs with `npm ci` from it. A `pnpm-lock.yaml` used to sit
beside it containing nothing but a `lockfileVersion` header and two settings —
no packages at all — which meant `pnpm install` would have resolved the whole
dependency graph fresh instead of reproducing CI's. It has been removed rather
than kept as a courtesy, because an empty lockfile is worse than none: it makes
an unsupported package manager look supported.

Cold, an un-provisioned browser serves the static demo config
(`public/punchout-config.js`, Mesta-shaped). To see a real organization's
compiled Runtime, publish one and provision a device — see
[docs/deploy-runbook.md](docs/deploy-runbook.md) §2 and §6.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `PUNCHOUT_ADMIN_TOKEN` | Yes, for any admin action | Bearer token for every admin-gated route (`/api/runtime/*`, `/api/devices/*`, `/api/operations-center`, `/api/relay`, `/api/day-trace`, `/api/export` GET, `/api/telemetry` GET). Unset = every admin request is rejected (fail closed by design, see `lib/backend/auth.mjs`) — never optional in a real deploy. |
| `PUNCHOUT_DATA_DIR` | Yes, in production | Where the single backend-state JSON file (Runtime history, export/telemetry log, device registry) is persisted. Must point at a real, persistent volume in production — a serverless/ephemeral filesystem loses all state between invocations (this is why Fly.io/Railway were chosen over Vercel; see [docs/deployment-decision.md](docs/deployment-decision.md)). |
| `PORT` | No (defaults to 3000) | Also used internally by `app/layout.tsx` to reach the app's own `/api/runtime/active` route via a same-process HTTP call — must match whatever port the server actually listens on. |
| `NODE_ENV` | No | Standard Next.js production/dev switch. |

`.env.example` lists every variable the code reads, with empty values. It used
to document only the two PostHog keys — omitting both variables above, which are
the ones that decide whether the admin surface is reachable at all and where a
pilot's workdays are stored.

This paragraph previously said no `.env.example` was checked in "on purpose",
on the reasoning that a committed placeholder for `PUNCHOUT_ADMIN_TOKEN` could
be copy-pasted into production. The file was in fact checked in the whole time,
so the README and the repository disagreed. The concern behind it was sound and
is preserved literally: every value in that file is empty, so there is nothing
to copy-paste, and no secret is committed even in placeholder form.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm run start` | Standard Next.js dev/build/production-start. |
| `npm test` | Fast deterministic regression suite (`lib/regression/run.mjs`) — motor.js, engine, backend auth/persistence. No server needed. |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / `eslint .`. |

The fast suite above is intentionally not the whole picture — several checks require a real running server and are run standalone (also wired into CI, see `.github/workflows/ci.yml`):

| Script | Proves |
|---|---|
| `lib/regression/cross-organization.mjs` | The exact same full-day scenario against every organization package under `organizations/*` (discovered dynamically — never a hardcoded list). |
| `lib/regression/security-audit.mjs` | Every admin route actually rejects an unauthenticated request, over real HTTP against a real server. |
| `lib/regression/runtime-provisioning.mjs` | The real Field Client Provisioning path (device registration → self-provisioning → per-organization Runtime delivery), including cross-organization isolation, over real HTTP. |
| `lib/regression/browser-verification.mjs` | The same path end-to-end through a real headless Chromium browser (Playwright) — cold load, provision, a complete real workday, lock, export. Requires `npx playwright install chromium` first. |
| `lib/regression/backup-restore-drill.mjs` | Full disaster/restore drill against the persistence layer. |
| `lib/adapters/dry-run.mjs` / `lib/regression/adapter-performance.mjs` | Every registered export adapter, and export performance at 100/500/1000-package scale. |

## Architecture, in one paragraph

`public/motor.js` is the single, deliberately frozen source of truth for a workday — one file, no build step, loaded before the React UI and exposed as `window.Motor`. Per-organization behavior (wage codes, extraction patterns, schemas) comes from a compiled **Runtime** (`lib/runtime/`), built from an **Organization Package** (`organizations/<slug>/`) via `/api/runtime/compile` → `/api/runtime/dry-run` → `/api/runtime/publish`, and delivered to a real field browser via one-time device provisioning (`/provision`) plus a server-rendered injection in `app/layout.tsx`. Backend state (Runtime history, export log, telemetry, device registry) lives in a single in-memory-plus-persisted-JSON-file store (`lib/backend/state.mjs`) — no database.

## Where to look next

- [docs/SOFT_LAUNCH_READINESS.md](docs/SOFT_LAUNCH_READINESS.md) — current readiness verdict and evidence matrix.
- [docs/](docs/) — the full engineering history: readiness reports, protocols, sprint reports. See [docs/README.md](docs/README.md) for an index.
- [docs/deploy-runbook.md](docs/deploy-runbook.md) — how to actually deploy, onboard a new organization, and provision a device.
- [docs/pilot-operations.md](docs/pilot-operations.md) — daily ops checklist, incident response, backup.
