# docs/ index

18 reports accumulated across this engagement, in roughly chronological order within each group. None are rewritten after the fact — each is a snapshot of what was true and verified *at the time it was written*. Where a later pass superseded an earlier finding, the later doc says so explicitly; this index doesn't try to re-adjudicate that here. For the actual current state of the codebase, prefer `git log` and the code itself over any single report below.

## Start here

- **[SOFT_LAUNCH_READINESS.md](SOFT_LAUNCH_READINESS.md)** — the current, authoritative readiness verdict (🟡 READY FOR LIMITED SOFT LAUNCH WITH KNOWN CONSTRAINTS), evidence matrix, and the two remaining external actions. Read this first.
- **[deploy-runbook.md](deploy-runbook.md)** — how to actually deploy, onboard a new organization, and provision a device.
- **[pilot-operations.md](pilot-operations.md)** — daily ops checklist, incident response, backup/restore procedure.
- **[deployment-decision.md](deployment-decision.md)** — why Fly.io/Railway over Vercel (persistent-filesystem requirement), and what's actually been proven vs. still needs a real account.

## Readiness reports (most recent first)

- **[ux-stability-hardening-review.md](ux-stability-hardening-review.md)** — last quality pass before this session; found and fixed one real double-submit race, reasoned through everything else assessed-but-not-fixed.
- **[hotfix-sprint-report.md](hotfix-sprint-report.md)** — closed 3 of 4 pilot-blocking findings from the adversarial simulation (cross-tab conflict detection, `/ops` auth, refresh-safe autosave, duplicate-entry guard).
- **[adversarial-pilot-simulation.md](adversarial-pilot-simulation.md)** — 10 persona-driven attempts to break the system; source of the findings hotfix-sprint-report.md closes.
- **[end-to-end-acceptance-test.md](end-to-end-acceptance-test.md)** — full new-customer-to-export test against a from-scratch organization package; found the order-number-truncation and CSV-encoding bugs RC1 fixed.
- **[rc1-release-candidate-report.md](rc1-release-candidate-report.md)** — the fixes for end-to-end-acceptance-test.md's findings, verified.
- **[pilot-readiness-board-review.md](pilot-readiness-board-review.md)** — the most rigorous single readiness snapshot prior to Operation Punchout Soft Launch; verdict at the time: 🟡 READY FOR LIMITED PILOT.

## Protocols (written to be run by a human/real device — partially automated since)

- **[browser-readiness-protocol.md](browser-readiness-protocol.md)** — real-browser test sequence. Steps 1-8 now automated (`lib/regression/browser-verification.mjs`, Chromium only); see the doc's own update note for what's still genuinely unverified (Chrome/Edge/Firefox specifically, real network conditions, physical hardware).
- **[mobile-readiness-protocol.md](mobile-readiness-protocol.md)** — real-device test sequence (Android + iPhone). Not automated — requires physical hardware.

## Sprint reports and strategic reviews (historical)

- **[execution-sprint-4-report.md](execution-sprint-4-report.md)** — operational hardening: deploy artifacts, backup/restore drill, security audit, observability.
- **[execution-sprint-3-report.md](execution-sprint-3-report.md)** — UX fixes for the two critical usability problems found in pilot-human-factors-validation.md.
- **[post-sprint-3-strategic-review.md](post-sprint-3-strategic-review.md)** — prioritized backlog after sprint 3; source of several "important, not blocking" items later addressed (this README included).

## Deep-dive analyses

- **[pilot-human-factors-validation.md](pilot-human-factors-validation.md)** — 12-persona human-factors simulation; large (1300+ lines), the "Required schema never actually blocks" finding here is the most consequential.
- **[adapter-platform-report.md](adapter-platform-report.md)** — the export adapter architecture (landax/csv/json/dummy) and why a plugin SDK is premature at 4 adapters.
