# Punchout — Pilot Hardening Report

**Date:** 2026-08-20 · **Commit:** `cdc0f53` · **CI:** run
[32342865908](https://github.com/mariusmarjavara-spec/Punchout-Mesta/actions/runs/32342865908),
7/7 jobs green

**Verdict: `PILOT_READY` for the in-repo scope. Not production-ready, and this
report does not claim it is.**

Those are different statements and the distinction is the point of the evidence
table below. Every in-repo blocker identified for this mission is closed and
verified. What remains is not code: it is a real deployment and a real phone,
neither of which can be produced from a repository.

---

## Evidence classes, kept apart

| Class | Status |
|---|---|
| **CI-verified** | ✅ All thirteen required gates, run 32342865908, seven independent jobs, 7/7 success. |
| **Deployment-verified** | ❌ **None.** Nothing here has been deployed. The build produces a standalone artifact; no one has run it on a real host. |
| **Physical-device-verified** | ❌ **None.** All browser evidence is headless Chromium, including the iPhone-viewport pass — a viewport is a window size, not a phone. |
| **Still external / resource-blocked** | Fly.io or Railway account and a real deploy; one real Android and one real iPhone; one real field workday by a real worker. `docs/mobile-readiness-protocol.md` is written and unautomated because it needs hardware. |

A green CI run means the code does what it claims on a CI runner. It is not
evidence about a phone in a pocket in Norwegian weather, and nothing in this
report should be read as if it were.

---

## What was done

### 1. Operations trace — an operator can now answer "what happened to this day?"

The facts already existed and nothing joined them. The export log knows every
export *attempt*, including refusals, each with a `rejectedReason`. The Relay
record knows every export that was *accepted*. The delivery state knows what
happened afterwards, per target, with a transition history and attempt count.

The hard case had no answer at all: **a day refused at ingest never reaches the
Relay**, so `GET /api/relay?exportId=…` returns 404 and an operator hunting for
Tuesday learns nothing from the surface that looks like it should know.
Tuesday's rejection was recorded the whole time, in the export log, where nobody
was looking.

- `lib/operations-center/day-trace.mjs` — pure, stores nothing, cannot drift
  from the truth it describes because it owns none of it.
- `GET /api/day-trace?org=&exportId=` — seven stages for one day; without
  `exportId`, every day with a per-outcome count. The listing unions relay ids
  with export-log ids, because ids existing *only* as rejections are the ones
  worth seeing.
- `/day-trace` — presents it. Computes nothing, same limit as `/relay` and
  `/ops`.

`UNKNOWN` is a first-class stage status rather than a failure: the server cannot
see a day that was never exported, and calling that "not recorded" would be a
confident claim about a phone it has never heard from.

Eleven regressions. Two drive the real Relay store, so a future change to
`RelayRecord` cannot pass the suite while breaking this surface.

### 2. CI evidence topology — a cheap failure no longer erases expensive evidence

One job with fifteen sequential steps is an AND-chain over evidence. That cost
is on this repository's record: a Node-version problem in the component-test
step gated twelve downstream stages, and every one reported "skipped". One real
defect became indistinguishable from twelve unknowns, and the expensive evidence
was what got lost.

Now six independent jobs with no `needs:` between them, plus a readiness gate.
**Verified rather than asserted:** all fifteen original gate commands are present
and unweakened; the only added command is the gate script.

The gate carries `if: always()` — load-bearing, because a failing dependency
otherwise *skips* the gate rather than failing it, and a skipped required check
is not a red check. It treats `skipped` and `cancelled` as failures too. Both
branches were exercised before commit.

### 3. Repository contracts now agree with the repository

- README claimed *"No `.env.example` is checked in on purpose"* — while the file
  was committed. The concern behind it (a copy-pasteable secret placeholder) was
  sound and is kept literally: every value is empty. It had documented two
  PostHog keys while omitting both variables that decide whether the admin
  surface is reachable and where a pilot's workdays live.
- `pnpm-lock.yaml` held a version header, two settings and **no packages** — it
  locked nothing while making `pnpm install` look supported. Removed; the
  npm-only contract is now stated rather than implied.
- `docs/README.md` called a superseded report "the current, authoritative
  readiness verdict", said "18 reports" against 25 files, and omitted eight
  including the persistence contract. Every document is now classified
  **CURRENT / DECISION / RUNBOOK / HISTORICAL**, because these documents are
  deliberately never rewritten — which makes them good evidence of what was true
  then and silent about having been overtaken since.

### 4. Persistence — C3 named, not migrated

C1–C8 were validated against the implementation first: every clause names an
enforcing regression, and all five files and six case ids exist and run.

C3 was the exception in a specific way. `runtime-publish-collision.mjs` covers
*detection* thoroughly, but every case hands `publish()` a hand-made runtime at a
fixed version — **none exercises the allocation**, which is where the gap lives.

It now has a name: `allocateNextRuntimeVersion(history)`. That is C3 in one pure
function — a read, with the publish that consumes it as a separate later write,
so two callers observing the same history compute the same number *every* time.
It is also the single function an atomic store replaces.

Five cases pin it, and they **pass deliberately**. A test that fails to announce
a known limitation is just a red build, and a red build gets muted. When a store
makes allocation atomic these start failing — the intended signal.

The migration seam is documented because it was measured: `persistence.mjs` has
exactly one importer and two functions; nothing anywhere reads the Relay archive
without going through `lib/relay/store.mjs`; and allocation is the function
above. **No store chosen, nothing migrated.**

### 5. Field readiness — the two handlers nothing was watching

Audited all nine failure modes. Seven are genuinely covered. Two were not, for a
structural reason: `motor.js initExportSync()` registers `visibilitychange` and
`online` recovery handlers, and **neither is reachable from the motor sandbox** —
its document stub is `addEventListener: () => {}`, and `init()` is not exported,
so `initExportSync()` never runs there. Only the sync-status *display* had cases.

This is the pilot's most ordinary failure: the phone sits out of coverage all
afternoon, the day is locked, the phone comes back. If these regress the locked
day silently never leaves the device — and the Day Trace would correctly report
`NEVER_ARRIVED` for a day the worker believes was sent.

Covered in the real browser rather than by loosening the sandbox to fake them.
Falsified by removing only the two dispatches, leaving `motor.js` untouched:
both fail.

---

## Gates

251 regression cases · 13 component tests · 25 browser field-readiness checks ·
14 browser verification checks · 12 runtime provisioning · 17 relay delivery
chain · 9 security audit. All green locally and in CI.

## What would move this to production-ready

Only three things, none of them code:

1. A real deployment on a persistent-filesystem host, with `PUNCHOUT_DATA_DIR`
   pointed at a real volume.
2. `docs/mobile-readiness-protocol.md` executed on one real Android and one real
   iPhone.
3. One real workday by one real worker, traced end-to-end — which
   `/day-trace` now makes possible without developer archaeology.
