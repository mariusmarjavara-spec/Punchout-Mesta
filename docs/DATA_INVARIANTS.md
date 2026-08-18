# Punchout Data Invariants

Punchout's central promise is narrow and absolute:

> **From "Start day" until the day is locked and handed off, normal failures must not silently destroy recorded work.**

This file states that promise as ten named contracts. Each has an identifier, a
written definition, and at least one regression case that names it.

## Why identifiers

Readiness was previously established narratively, in a dated report. A report
ages: it describes the system on the day it was written, and nothing fails when
the system drifts away from it. These invariants are different — each one is
referenced by name from `lib/regression/data-invariants.mjs`, and
`node lib/regression/run.mjs` fails if any invariant has no covering case, or if
a case it names has disappeared.

So a regression can be traced to the specific contract it breaks, and a contract
cannot quietly lose its coverage.

## What counts as an invariant

A property that must hold **across valid state transitions** — not a happy-path
assertion. "Locking a resolved day works" is a feature test. "A locked day
cannot be mutated through normal workflow commands" is an invariant, because it
must survive every route into the system, including refresh, restart, repeated
taps and stale clients.

---

## INV-DATA-01 — Successful actions persist

If Punchout reports a user action as successfully completed, its resulting state
is either persisted, or the user receives an explicit storage failure.

Silent loss is forbidden. An operator who sees a confirmation and later finds
the work gone has been lied to, and that is the one failure this product cannot
absorb.

## INV-DATA-02 — Refresh resilience

Refreshing or reopening the application restores the last successfully persisted
active workday, including in-progress overlay state.

Field conditions make refresh routine rather than exceptional: a phone locks, a
browser reclaims a background tab, a glove hits the wrong control.

## INV-DATA-03 — Locked-day immutability

A locked workday cannot be altered through normal workflow commands.

Locking is the moment the operator hands off responsibility. After it, the
record is evidence.

## INV-DATA-04 — Safe rollover

Starting a new day never destroys the previous locked day before it is safely
retained in history or export custody.

## INV-DATA-05 — Storage corruption safety

Malformed or corrupted local storage fails visibly, avoids destructive
overwrite where possible, and offers a recovery action.

Corruption must not present as a blank screen, and recovering from it must not
require developer tools.

## INV-DATA-06 — Explicit verification boundary

Items defined as unresolved are handled before the day can be locked, and
`lockDay()` enforces this independently of the UI.

Håndrens is the transformation from a raw workday into a verified one. A guard
that exists only in the interface is not a guard.

## INV-DATA-07 — Idempotent locking

Repeated lock attempts do not duplicate history, exports or side effects.

Double taps are normal on a phone in a glove.

## INV-DATA-08 — Idempotent export

Retrying the same export does not produce duplicate logical records downstream.

A retry after a timeout must be safe, because the client cannot tell a lost
request from a lost response.

## INV-DATA-09 — User-owned judgment

Fields marked as the user's responsibility are never silently auto-filled.

Punchout assists a workflow; it does not quietly answer questions on the
operator's behalf and attribute the answer to them.

## INV-DATA-10 — No silent workflow transition

No background callback, voice result or reload jumps across a critical lifecycle
boundary without the state remaining recoverable and explainable.

---

## Coverage

The authoritative mapping from invariant to regression case lives in
`lib/regression/data-invariants.mjs`. It is data, not prose, so it can be
checked. To see current coverage:

```bash
node lib/regression/run.mjs
```

The run fails if an invariant has no covering case, or if it names a case that
no longer exists — which is what stops this document from ageing into fiction
the way the readiness report did.
