# Canonical state — persistence contract

What Punchout's canonical state must guarantee, independent of what stores it.

Founder decision 2026-08-19: Punchout moves from a JSON file to a datastore
supporting atomicity, versioning and conflict control. JSON was a useful
bootstrap and is not the end architecture for canonical concurrent state. The
migration is stepwise and **no store has been chosen** — this document exists so
that a candidate can be judged instead of assumed.

The sequencing is deliberate. Choosing a database before the contract exists is
how the contract ends up being whatever the database happened to do.

Every clause names the regression that enforces it. A clause with no test is a
promise, and this file is not for promises.

## What counts as canonical state

Held in memory as the live read path, snapshotted to disk by
`lib/backend/persistence.mjs`:

| State | Owner | Notes |
|---|---|---|
| Runtime manifests and objects | `RuntimeStore` (`lib/runtime/store.mjs`) | per organization, versioned |
| Device registry and sessions | `lib/backend/state.mjs` | identity and access |
| Export log | `lib/backend/state.mjs` | deviceId-linked records |
| Telemetry log | `lib/backend/state.mjs` | deviceId-linked records |
| Provision failure log | `lib/backend/state.mjs` | operational |
| Device audit log | `lib/backend/state.mjs` | who changed device state |

Field-device local state (browser storage) is **not** canonical. It is a
client-side working copy, and the export is what makes it real.

## C1 — A write is atomic or absent

No reader may observe partially written state, including after a crash mid-write.

Today: `persistState` writes to `STATE_FILE + ".tmp"` and `renameSync`s over the
target, which is atomic on the same volume.

*A candidate store must match or exceed this, not merely differ from it.* A store
offering row-level atomicity but no snapshot consistency across the tables above
is a change in shape, not an improvement, unless the boundary is stated.

Enforced by: `lib/regression/backend-persistence.mjs`.

## C2 — No silent overwrite

A write that would replace another writer's committed state must fail loudly.

Today: `RuntimeStore.publish` rejects a runtime whose version already exists,
before mutating anything.

The ordering is part of the contract, not an implementation detail. The previous
code marked the prior manifest `superseded` as its first act, so a rejection
after that point would have left the organization with no active runtime at all —
turning a lost publish into an outage.

Enforced by: `lib/regression/runtime-publish-collision.mjs`
(`runtime_publish_rejects_duplicate_version`,
`runtime_publish_collision_does_not_replace_stored_runtime`).

## C3 — Versions are monotonic and allocated exactly once

A published version identifies exactly one runtime, permanently.

Today: `compileRuntime` allocates `max(existing) + 1`. **This read-then-write is
not atomic** — C2 catches the collision after the fact rather than preventing it.
A candidate store should make allocation atomic (a sequence, a unique constraint,
or compare-and-swap) so the conflict is impossible rather than merely detected.

This is the clearest single reason the current architecture is being replaced.

Enforced by: `runtime_publish_sequential_versions_still_work`,
`runtime_publish_history_keeps_every_version`.

## C4 — Rollback targets remain reachable

A version that rollback may be asked to reactivate must not be pruned.

Today: `pruneHistory` never removes the active version or the most recent
`keepVersions`.

Note the asymmetry with C7 and keep it: this floor is a **correctness**
constraint on operational config, not a retention floor on records. Applying
strict time-bounding here would break rollback.

Enforced by: `runtime_rollback_still_reactivates_an_earlier_version`.

## C5 — Organizations are isolated

No organization's state may be read, overwritten or pruned by activity in
another. Version numbers are per organization; version 1 exists many times.

Enforced by: `runtime_publish_version_1_is_per_organization`,
`lib/regression/cross-organization.mjs`.

## C6 — Older persisted state still loads

An upgrade must not silently disable or drop existing pilot data.

Today: fields added after a deployment default on load — devices without
`status` become `active`, devices without `organizationId` are backfilled, and
`runtimesByChecksum` is read as `runtimesByVersionKey`.

A migration to a datastore inherits this obligation. Field devices in use are
the reason: an upgrade that silently deactivates them is an outage that looks
like a bug report.

Enforced by: `lib/regression/backend-persistence.mjs`, and the backward-compat
branches in `lib/backend/state.mjs`.

## C7 — Retention is bounded by age

An entry older than its configured `keepDays` is removed. An entry count may
protect entries inside the window; it may not extend past it.

Founder decision 2026-08-19. Previously `keepMinimum: 200` overrode the window
and a log shorter than 200 was never pruned, so `{keepDays: 90}` meant "forever"
in a low-volume deployment.

Enforced by: `lib/regression/retention-time-bound.mjs`.

## C8 — State survives restart

A process restart loses nothing that was acknowledged.

Enforced by: `lib/regression/backup-restore-drill.mjs`,
`lib/backend/long-running-30-days.mjs`.

## Choosing a store

Judge a candidate against C1–C8, in this order:

1. **C3** — does it make version allocation atomic? This is the defect driving
   the migration; a store that leaves it as read-then-write buys little.
2. **C1** — is a multi-entity write atomic, or only per row? If only per row, say
   explicitly which consistency boundary is being given up.
3. **C6** — what is the schema-evolution story for deployed field devices?
4. Everything else — C2, C4, C5, C7 and C8 are largely application logic and
   port across stores, but each must keep its enforcing regression green.

**Smallest thing that satisfies these wins.** Operational weight is a real cost
for field deployment: a store requiring a server to administer is worse than one
that does not, at equal correctness. Local-first behaviour is a product property
here, not an implementation preference.

Explicitly out of scope for this document: naming the store. That is the next
task, and it depends on this one.

## Replacing the store

Measured on 2026-08-20 rather than assumed. The seam is already narrow, and the
point of writing it down is to keep it that way: a future SQLite or Postgres
implementation should not require touching Motor, Runtime or Relay contracts.

There are exactly three boundaries.

### 1. Backend state — `lib/backend/persistence.mjs`

`lib/backend/state.mjs` is its **only** importer, and uses **two** functions:

```
loadPersistedState()      -> snapshot | null
persistState(snapshot)    -> void          (writes tmp + renameSync, C1)
```

A datastore implementation replaces that module and nothing above it. Everything
else in `state.mjs` — the device registry, export log, telemetry log, runtime
history — is in-memory structure that happens to be snapshotted; none of it
reaches for the filesystem itself.

The cost this seam currently imposes, stated plainly: `persistState` rewrites
the entire blob on every `persistNow()`. That is the property a real store would
most obviously improve, and it is a performance characteristic rather than a
correctness one, so it does not by itself justify a migration.

### 2. Relay archive — `lib/relay/store.mjs`

A separate, file-per-record archive with its own directory-level organization
isolation (C5). Verified: **nothing reads the archive without going through this
module** — no route, no adapter and no other library resolves a relay path or
reads a payload file directly. Its exported functions are the whole surface, so
it can be reimplemented against a table without any caller changing.

Isolation is structural here rather than filtered: organization A's directory
cannot name organization B's files, so a cross-organization read resolves to a
path that does not exist. **A store replacement must reproduce that structurally
too** — a `WHERE organization_id = ?` is a filter someone can forget, and is a
weaker guarantee than the one being replaced. Say so explicitly if that trade is
made.

### 3. Version allocation — `allocateNextRuntimeVersion(history)`

`lib/backend/state.mjs`. This is C3 in one pure function, extracted so the gap
has a name: it reads the history and returns `max + 1`, and the `publish` that
consumes it is a later, separate write. Two callers observing the same history
compute the same number every time — not occasionally.

**This is the single function an atomic store replaces**, with a sequence, a
unique constraint or a compare-and-swap. When that happens,
`lib/regression/persistence-contract-cases.mjs` will start failing, and that is
the intended signal rather than a problem: those cases pin the current
behaviour deliberately, so closing the gap has to be a decision someone makes
rather than a drift nobody notices.

### What is deliberately not being done

No store has been chosen, and nothing here migrates anything. The gap is
detected (C2), named, and now regression-protected at its source. That is the
whole of what is warranted before a real blocker forces the decision — a
migration undertaken on preference rather than on evidence would replace a
known, bounded weakness with an unknown set of new ones.
