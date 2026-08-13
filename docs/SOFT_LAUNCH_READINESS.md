# Punchout — Soft Launch Readiness

**Operation Punchout Soft Launch — final deliverable.** Written after 20 commits across this
mission, closing this engagement's own stated highest-priority objective (the real vertical
integration path) and fixing six previously-undiscoverable defects found by using two
capabilities — Docker and a real Chromium browser (Playwright) — that every prior report in
this engagement's history stated were unavailable, but were not. This document does not
restate that history; see [docs/README.md](README.md) for the full report index.

## Executive Verdict

## 🟡 READY FOR LIMITED SOFT LAUNCH WITH KNOWN CONSTRAINTS

Not full readiness, and not "not ready." The product logic, security, identity integrity, and
the complete real vertical integration path (organization package → compiled Runtime → device
provisioning → real browser → real signed export → correct Operations Center attribution) are
now proven with real evidence at the highest proof level achievable in this environment — real
HTTP, a real production Docker build, and a real Chromium browser, including mobile-viewport
emulation. What remains unproven is proven **only** by two things this environment cannot
provide: a real cloud deployment and a real physical mobile device. Both are named explicitly
below, with the exact human action required.

## Evidence Matrix

Proof levels, most to least rigorous: **Real device** > **Real browser** > **Real HTTP/Docker**
> **VM-sandbox** > **Unit**. Per this mission's First Principle, a lower level is never
represented as satisfying a higher one.

| # | Criterion | Status | Proof level | Evidence |
|---|---|---|---|---|
| 1 | Admin APIs are protected | ✅ PASS | Real HTTP | `lib/regression/security-audit.mjs`, 9/9, live against a real server |
| 2 | Real field browser retrieves and activates the correct Runtime | ✅ PASS | Real browser + Docker | `lib/regression/runtime-provisioning.mjs` (12/12) + `lib/regression/browser-verification.mjs` (14/14); this session's final independent pass (14/14, two orgs, two devices, one desktop + one mobile browser) |
| 3 | organizationId/userId/deviceId remain correctly separated, no cross-contamination | ✅ PASS | Real browser + Docker | Same final independent pass — device A (mesta) and device B (nordhavn) each received only their own org's Runtime and each export was attributed to the correct org server-side, confirmed via `GET /api/export` and `GET /api/operations-center` |
| 4 | Signed export reaches the backend | ✅ PASS | Real browser + Docker | Final pass: `signatureValid: true` for both real devices, real HMAC-SHA256 over the real payload |
| 5 | Device provisioning actually works end-to-end (register → provision → export-capable) | ✅ PASS | Real browser | Fixed this session (commit `7afa8c8`) — was silently broken (secret/userId never persisted) until found via real-browser tracing |
| 6 | Runtime delivery survives real production conditions (not just `next dev`) | ✅ PASS | Docker | Fixed this session (commit `c22c4c9`) — a Next.js Route-Handler-vs-Server-Component module boundary bug silently broke this for the first real visitor to any deployment, forever, until restart. Reproduced and fixed against the actual production Docker build, not just dev mode |
| 7 | No known silent data-loss path remains acceptable for launch | 🟡 PARTIAL | Real HTTP + VM-sandbox | The `arbeidsbeskrivelse` (work description) silent-loss bug is fixed (commit `4c74ea6`) and permanently guarded. Cross-tab/device data clobbering is *detected* (banner, prior Hotfix Sprint) but not *prevented* — an accepted, documented residual risk given the frozen-motor.js constraint, not a gap this session found new |
| 8 | Real browser DOM execution — page loads, no console errors, full workday completes | ✅ PASS | Real browser | `lib/regression/browser-verification.mjs`, 14/14 — first real browser execution in this engagement's history |
| 9 | At least one real mobile device completes the critical path | ❌ UNVERIFIED | — | **No physical Android/iPhone available in this environment.** iPhone 13 *viewport emulation* (Chromium) completed the full path and found+fixed two real overflow bugs (commits `b2c37e4`, `eca0767`) — genuinely valuable, but explicitly not equivalent to real-device proof (real touch latency, real keyboard behavior, real network conditions, battery/thermal behavior all remain untested) |
| 10 | Real deployed instance (Fly.io/Railway) | ❌ UNVERIFIED | — | **No cloud account/credentials available in this environment.** `docker build` now succeeds (first time in this engagement's history) and the resulting image is proven correct end-to-end against a real container; `fly.toml` is reviewed and accurate. Actual cloud deployment requires human action — see External Action Required below |
| 11 | Cross-browser (Chrome/Edge/Firefox specifically) | ❌ UNVERIFIED | — | This session's automation uses Chromium only, one engine. `docs/browser-readiness-protocol.md` still requires the other two for full closure |
| 12 | Backup/restore actually works | ✅ PASS | Real process restart | `lib/regression/backup-restore-drill.mjs`, part of `npm test`, prior sprint + re-confirmed unaffected this session (102/102) |
| 13 | CI enforces the above on every change | ✅ PASS | — | `.github/workflows/ci.yml`: typecheck, lint, regression suite, cross-organization, adapter dry-run/performance, security audit, runtime provisioning, browser verification (Chromium installed in CI), production build, standalone artifact — all blocking |
| 14 | App icon/branding | ✅ PASS | Real browser | Placeholder (leftover v0.app scaffold) replaced with the real Punchout brand this session (commit `1ecd2c7`), verified live |
| 15 | Crash visibility (a real field crash is not silently invisible) | ✅ PASS | VM-sandbox | Added this session (commit `166fb6e`) — was a real, named backlog gap (`post-sprint-3-strategic-review.md`), zero prior implementation |
| 16 | Onboarding documentation exists | ✅ PASS | — | Root `README.md` + `docs/README.md` index added this session (commit `1a6d259`) — was a real, named backlog gap, zero prior implementation |

## Known Constraints

1. **No real cloud deployment exists.** Everything short of the actual `fly deploy` step is
   proven (build, container correctness, full vertical path against the real image). See
   External Action Required.
2. **No real mobile device has ever run this app.** Viewport emulation is a genuine, if partial,
   substitute — it already found and fixed two real defects a desktop-only pass would have
   missed entirely — but real touch/network/battery behavior remains unverified.
3. **Cross-tab/device data clobbering is detected, not prevented.** A worker with the app open
   in two tabs/devices simultaneously can still overwrite the other's unsaved delta; the banner
   (Hotfix Sprint) makes this visible instead of silent, which is the documented, deliberate
   scope boundary given the frozen-motor.js constraint — not a defect discovered this session.
4. **Chrome/Edge/Firefox-specific behavior is unverified.** Only Chromium has been exercised via
   automation.
5. **Voice-to-text correction has no dedicated UX step.** A misheard word has no in-flow fix
   path beyond the general "Logg rettelse" mechanism — known since earlier sprints, not a new
   finding.
6. **No external error-tracking or uptime monitoring.** Client-side crash telemetry now exists
   (this session), but there is no Sentry-equivalent aggregation or paging — a third-party
   account this environment cannot create.

## Operational Playbook

Unchanged from [docs/pilot-operations.md](pilot-operations.md) (Daily Checklist, Incident
Checklist, Backup Checklist) and [docs/deploy-runbook.md](deploy-runbook.md) (deploy, organization
onboarding, **device provisioning — §6, new this session**). One addition: after any deploy,
run `node lib/backend/smoke-test.mjs <url>` **and** `PUNCHOUT_ADMIN_TOKEN=... node lib/regression/browser-verification.mjs` if a browser/Chromium is available in that environment, to catch the exact class of defect (real-browser-only) this session found twice.

## Rollback Conditions

Unchanged from the existing, already-proven mechanism: `POST /api/runtime/rollback` for a bad
Runtime publish (instant, proven repeatedly); redeploy the previous Docker image tag for a bad
code deploy (documented, not yet exercised against a real registry — no deploy has happened
yet). Trigger rollback immediately if:
- `exportHealth.successRate` drops for a published organization.
- Any real device reports a console error or failed provisioning after a deploy.
- `GET /api/health`'s `persistence.lastWriteOk` becomes `false`.

## First-Week Metrics

| Metric | Target |
|---|---|
| Silent-data-loss incidents | **0** |
| Cross-org data cross-contamination incidents | **0** |
| Failed exports not auto-recovered within 1 hour | **0** |
| Real console errors reported from a real field device | Track, investigate any non-zero |
| Devices successfully provisioned on first attempt | 100% (the `/provision` form fails closed with a clear error otherwise) |
| Support contacts about "app looks broken on my phone" | Track — the two mobile-viewport bugs fixed this session were exactly this failure mode |

## Recommendation

Proceed to the two remaining external actions in parallel — they do not block each other:

1. **Deploy**: a human with real Fly.io/Railway access runs the procedure in
   [docs/deploy-runbook.md](deploy-runbook.md) §1, then re-runs this session's own verification
   scripts (`smoke-test.mjs`, `runtime-provisioning.mjs`, `browser-verification.mjs` if Chromium
   is available there) against the real URL before onboarding any real organization.
2. **Real mobile device**: once a real URL exists, run
   [docs/mobile-readiness-protocol.md](mobile-readiness-protocol.md) on at least one real Android
   and one real iPhone — the protocol itself names step 8 (airplane-mode-mid-export) as its
   single highest-value check, since it is the one behavior no VM-sandbox or emulated test can
   prove.

Given the depth of real evidence now behind the application logic itself, neither of these two
remaining actions is expected to surface a new *product* defect — both are expected to be
confirmation, not discovery. But per this mission's own completion condition, that expectation
is not evidence, and the verdict stays 🟡 until they are actually run.

---

## EXTERNAL ACTION REQUIRED

**No further justified internal task remains before either of these two specific actions.**
Both are re-stated here from earlier in this mission for completeness of this deliverable.

### 1. Real cloud deployment

1. **Blocker**: No Fly.io/Railway account or CLI credentials in this environment.
2. **Why Gateway cannot execute it**: Requires human account creation, billing, and a real
   persistent volume.
3. **What has already been proven without it**: `docker build` succeeds; the container runs
   correctly; the complete real vertical path (publish → register → provision → real browser
   workday → locked day → signed export → correct server-side attribution) is proven against
   that actual production image, for two organizations, on both desktop and mobile-emulated
   browsers; `fly.toml` is reviewed and accurate.
4. **Exact human action required**: Create/authenticate a Fly.io account; provision; deploy.
5. **Exact command**:
   ```
   fly launch --no-deploy
   fly volumes create punchout_data --size 1 --region arn
   fly secrets set PUNCHOUT_ADMIN_TOKEN=$(openssl rand -hex 32)
   fly deploy
   ```
6. **Credentials required**: Fly.io account with billing; authenticated `flyctl`.
7. **Expected result**: `fly deploy` completes; `https://<app>.fly.dev/api/health` returns `200`.
8. **Verification**: `PUNCHOUT_ADMIN_TOKEN=<secret> node lib/backend/smoke-test.mjs https://<app>.fly.dev`, then `node lib/regression/runtime-provisioning.mjs` and (if Chromium is available in that environment) `node lib/regression/browser-verification.mjs` pointed at the real URL.
9. **What resumes once unblocked**: Real-device mobile testing (below) against the real URL; final Evidence Matrix rows 10 and 11 (partial) close.

### 2. Real mobile device testing

1. **Blocker**: No physical Android or iPhone in this environment.
2. **Why Gateway cannot execute it**: Requires physical hardware.
3. **What has already been proven without it**: The complete workday flow via Chromium's iPhone
   13 viewport emulation, including finding and fixing two real overflow bugs a desktop-only
   pass would have missed. This is real evidence at a real, if partial, proof level — not
   claimed as real-device proof.
4. **Exact human action required**: Run [docs/mobile-readiness-protocol.md](mobile-readiness-protocol.md) in full on at least one real Android and one real iPhone, against a real deployed URL.
5. **Exact procedure**: The protocol document itself, step by step — step 8 (airplane mode mid-export) is its own stated highest-value check.
6. **Credentials required**: None beyond the deployed URL and a registered/provisioned device.
7. **Expected result**: All 11 protocol steps pass; the specific finding to watch for is anything
   the viewport-emulation pass could not have caught (real touch latency, real keyboard
   behavior, real network transitions, battery/thermal behavior).
8. **Verification**: The protocol's own documented findings list (bestått/ikke bestått per step).
9. **What resumes once unblocked**: Evidence Matrix row 9 closes; full **READY FOR SOFT LAUNCH**
   verdict becomes possible if no new defect is found.
