# docs/ index

Twenty-five documents accumulated across this engagement. None are rewritten
after the fact — each is a snapshot of what was true and verified *at the time
it was written*. That is a virtue for an engineering record and a hazard for a
reader, because a readiness verdict does not announce that it has been
superseded.

So every document below carries one of four classifications, and the
classification is the first thing to read:

| Class | What it means |
|---|---|
| **CURRENT** | Describes present truth. Safe to act on. |
| **DECISION** | A choice and its reasoning. Still binding unless a later decision says otherwise. |
| **RUNBOOK** | Instructions for doing something. Correctness depends on the system, not on its date. |
| **HISTORICAL** | A snapshot of a past state. Real evidence of what happened then; **not** a claim about now. |

A HISTORICAL readiness report is not wrong — it was verified when written. It
is simply not an answer to "is this ready today?". For the live state of the
code, `git log` and the CI run on `main` outrank every document here.

---

## CURRENT

- **[PILOT_HARDENING_REPORT_2026-08-20.md](PILOT_HARDENING_REPORT_2026-08-20.md)** —
  the authoritative readiness verdict: **PILOT_READY for the in-repo scope**,
  measured at `cdc0f53` with CI run 32342865908 green (7/7 jobs). Keeps
  CI-verified, deployment-verified and physical-device-verified strictly apart;
  the last two are empty. **Read this first.**
- **[MATURITY_ASSESSMENT_2026-08-19.md](MATURITY_ASSESSMENT_2026-08-19.md)** —
  the prior verdict, CONDITIONALLY_PILOT_READY at `c5f5712`. Still current for
  the dimensions the hardening mission did not touch (scale, cost, DM workflow
  measurement); superseded on operability, CI topology and persistence.
- **[PERSISTENCE_CONTRACT.md](PERSISTENCE_CONTRACT.md)** — C1–C8, what canonical
  state must guarantee independent of what stores it. Binding on any future
  datastore.
- **[DATA_INVARIANTS.md](DATA_INVARIANTS.md)** — the ten invariants behind the
  central promise: from "Start day" until lock and handoff, normal failures must
  not silently destroy recorded work.

## DECISION

- **[deployment-decision.md](deployment-decision.md)** — Fly.io/Railway over
  Vercel, driven by the persistent-filesystem requirement; states what is proven
  versus what still needs a real account.
- **[POST_PILOT_ARCHITECTURE.md](POST_PILOT_ARCHITECTURE.md)** — ranked technical
  debt and migration proposal (2026-08-17).
- **[adapter-platform-report.md](adapter-platform-report.md)** — the export
  adapter architecture, and why a plugin SDK is premature at four adapters.
- **[FUTURE_OPERATIONS_FOUNDATIONS.md](FUTURE_OPERATIONS_FOUNDATIONS.md)** —
  which operations foundations are worth building, and which are not yet.
- **[PRISM_ACTIVATION_PLAN.md](PRISM_ACTIVATION_PLAN.md)** — Prism ran and
  produced real findings; no activation project is needed.

## RUNBOOK

- **[deploy-runbook.md](deploy-runbook.md)** — deploy, onboard an organization,
  provision a device.
- **[pilot-operations.md](pilot-operations.md)** — daily checklist, incident
  response, backup/restore.
- **[FIELD_TEST_PLAYBOOK.md](FIELD_TEST_PLAYBOOK.md)** — for the founder,
  standing with a phone, about to run the first real workday.
- **[browser-readiness-protocol.md](browser-readiness-protocol.md)** — steps 1–8
  are automated (`lib/regression/browser-verification.mjs`, Chromium only). Its
  own update note states what remains genuinely unverified: Chrome/Edge/Firefox
  specifically, real network conditions, physical hardware.
- **[mobile-readiness-protocol.md](mobile-readiness-protocol.md)** — Android and
  iPhone sequence. **Not automated; requires physical hardware.**

## HISTORICAL — readiness snapshots, newest first

Each was accurate when written. None describes today.

- **[SOFT_LAUNCH_READINESS.md](SOFT_LAUNCH_READINESS.md)** — final deliverable of
  Operation Punchout Soft Launch. This index previously called it "the current,
  authoritative readiness verdict"; it has since been superseded by
  MATURITY_ASSESSMENT_2026-08-19.md, which is why the classification above
  exists at all.
- **[FIELD_TEST_READINESS.md](FIELD_TEST_READINESS.md)** — Operation Punchout
  Field Trial, 2026-08-17.
- **[ux-stability-hardening-review.md](ux-stability-hardening-review.md)** — found
  and fixed one real double-submit race.
- **[hotfix-sprint-report.md](hotfix-sprint-report.md)** — closed 3 of 4
  pilot-blocking findings from the adversarial simulation.
- **[adversarial-pilot-simulation.md](adversarial-pilot-simulation.md)** — ten
  persona-driven attempts to break the system.
- **[end-to-end-acceptance-test.md](end-to-end-acceptance-test.md)** — full
  new-customer-to-export test; found the order-number-truncation and
  CSV-encoding bugs RC1 fixed.
- **[rc1-release-candidate-report.md](rc1-release-candidate-report.md)** — those
  fixes, verified.
- **[pilot-readiness-board-review.md](pilot-readiness-board-review.md)** — the
  most rigorous snapshot prior to Soft Launch.

## HISTORICAL — sprint reports and analyses

- **[execution-sprint-4-report.md](execution-sprint-4-report.md)** — deploy
  artifacts, backup/restore drill, security audit, observability.
- **[execution-sprint-3-report.md](execution-sprint-3-report.md)** — UX fixes for
  the two critical usability problems found in human-factors validation.
- **[post-sprint-3-strategic-review.md](post-sprint-3-strategic-review.md)** —
  prioritized backlog after sprint 3.
- **[pilot-human-factors-validation.md](pilot-human-factors-validation.md)** —
  twelve-persona simulation, 1300+ lines. Its "Required schema never actually
  blocks" finding is the most consequential in this directory.
