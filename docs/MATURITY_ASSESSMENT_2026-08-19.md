# Punchout maturity assessment

**Date:** 2026-08-19 · **Commit:** `c5f5712` · **CI:** run 32294196355, 19/19 green

Assessed against the mature-product target: *a local-first field operations
layer where a worker records work once, Punchout creates a trustworthy canonical
record, and customer-controlled integrations deliver into isolated enterprise
systems.*

## The headline finding

Punchout's CI had been **red on every recent push**, and the cost was not one
step. The component-test job failed on Node 20 (jsdom → undici 8 calling
`webidl.util.markAsUncloneable`, absent there) and **twelve downstream jobs
reported `skipped`** — the live security audit, runtime provisioning over real
HTTP, the relay delivery chain with restart and readback, the real-Chromium
workday, iPhone-viewport field readiness, the production build and the
standalone artifact.

The repository was carrying strong verification that was not running. Fixed at
`c5f5712`; all nineteen steps now pass. **Most of what follows is verified
because that pipeline was unblocked, not because new capability was added.**

## Capability assessment

| # | Domain | State | Evidence |
|---|---|---|---|
| 1 | Field reliability | **Verified** | Real-Chromium full workday, iPhone-viewport readiness run, backup/restore drill, 30-day long-running check, quota-failure and transient-write characterizations |
| 2 | Canonical record integrity | **Verified** | Duplicate-version rejection, monotonic versioning, explicit rollback, org isolation, temp-then-rename durability, 235 regression cases |
| 3 | Persistence maturity | **Contract only** | `PERSISTENCE_CONTRACT.md` states C1–C8 with enforcing regressions; no datastore chosen. C3 (non-atomic version allocation) is the open defect |
| 4 | Identity bridge | **Direction locked, unbuilt** | `DECISION_private_identity_bridge.md`. Deliberately not built — no current consumer |
| 5 | Adapter maturity | **Verified** | Adapter dry run across all registered adapters, contract and failure suites, performance at 100/500/1000 packages |
| 6 | Relay / delivery chain | **Verified** | Locked day → relay → CSV → restart → readback, in CI |
| 7 | Security & privacy | **Verified (mechanism)** | Live HTTP audit against every admin route, provision rate limiting, device revocation, signature validation. Retention now time-bounded |
| 8 | Deployment readiness | **Build-verified only** | Production build and standalone artifact green. **No deployment has occurred** |
| 9 | Customer onboarding | **Mostly verified** | Runtime provisioning exercised over live HTTP: real device → real per-org runtime |
| 10 | User experience | **Field-verified** | iPhone viewport, main hours, relay; human-factors and adversarial-pilot documents |
| 11 | Operations | **Partial** | Operations-center health module and crash telemetry exist; no consolidated operator surface |
| 12 | Commercial pilot readiness | **See below** | — |

## Evidence classes, kept apart

- **CI-verified** — 19 steps on `c5f5712`, including live-HTTP and real-browser.
- **Local-only** — nothing material; local and CI now agree.
- **Contract-only** — persistence C1–C8 describe requirements, not a chosen store.
- **Declared-not-built** — the Identity Bridge, deliberately.
- **No production evidence** — Punchout has never been deployed or used by a
  real field worker. A green build is not a deployment; a readiness gate is not
  usage.

## Remaining gaps

**External, resource-blocked — cannot be closed from this environment:**

1. **No deployment evidence.** No Fly/Railway CLI or token is present. Everything
   up to and including the standalone artifact is verified; nothing beyond it is.
2. **No physical-device evidence.** iPhone-viewport emulation in Chromium is
   real evidence, and it is not the same as a phone in a glove in the cold.

**Internal, bounded — candidates:**

3. **C3, atomic version allocation.** `compileRuntime` allocates `max+1`
   non-atomically; the duplicate guard detects the collision rather than
   preventing it. This is the defect driving the persistence migration.
4. **Cross-tab write clobbering is detected, not prevented.** Documented and
   accepted under the frozen-`motor.js` constraint. The `storage` event warns
   the *other* tab before it overwrites, so the loss is detectable — which meets
   the "no silent loss" bar, but not "no loss".
5. **No consolidated operator surface.** Health, device, publish and delivery
   state are each reachable; none is assembled into one diagnosable view.

## Pilot readiness

**Required before a paid pilot**

- A real deployment, with restore actually exercised. Currently impossible here.
- One real device in real field conditions.
- An operator able to answer "what happened to this day" without reading source.

**Safe to complete during a pilot**

- Persistence migration (C3). The invariants hold under the current store; the
  migration improves prevention over detection.
- Consolidated operator surface — reachable data, unassembled.
- Identity Bridge, when a second customer or a real identity requirement exists.

**Post-pilot maturity**

- Erasure path, once the data and identity model settles.
- Multi-instance operation, which the persistence contract must precede.

## Verdict

**`CONDITIONALLY_PILOT_READY`**

The product logic, canonical-record integrity, adapter and relay chain, security
mechanisms and field behaviour are verified — genuinely so, now that CI runs.
What is missing is not engineering confidence but **operational evidence**: this
software has never been deployed, and no real worker has used it.

Both remaining P0 items are resource-blocked rather than unsolved, and neither
is the kind of thing more autonomous engineering can produce. That is the
condition the mission names as the point to stop: further coding has sharply
diminishing value against learning from one real deployment and one real device.
