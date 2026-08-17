# Post-Pilot Architecture — Ranked Technical Debt and Migration Proposal

**Status:** analysis + baseline record. Written at the close of the post-pilot
engineering-baseline mission (2026-08-17).
**Scope of that mission:** make existing pilot behaviour verifiable and safe to
build on. Not new functionality, not general refactoring.
**Explicitly not performed here:** the `window.Motor` → typed-domain-core
migration proposed in section 5. This document specifies it; it does not do it.

---

## 1. What changed in this mission, and why

Every production change below is tied to a verified defect or a missing safety
gate. Nothing was changed for style, naming, or structure.

### 1.1 Configuration-contract defects (fixed)

The configuration contract runs across five files:

```
public/punchout-config.js          static, documented, single-org fallback
lib/organization/types.mjs         toRuntimeConfig() — compiled multi-org path
app/layout.tsx                     buildInjectedConfigScript() — what ships to the browser
public/motor.js                    normalizeConfig() — what the motor consumes
hooks/use-motor-state.ts           RuntimeConfig — what React is typed against
```

Three real breaks existed on that chain. All were silent: no error, no warning,
no failing test, no log line.

| # | Defect | Verified consequence | Fix |
|---|---|---|---|
| C1 | `normalizeConfig()` read `raw.hoofdordre` and assigned to `ADMIN_CONFIG.hoofdordre`, but all 12 real reads in `motor.js` use `ADMIN_CONFIG.hovedordre` — a key only ever set to the literal `"HOVED"` | **The main-timesheet bucket key documented as admin-settable in `public/punchout-config.js` section 5 was silently ignored on every config path.** No organization could configure it; it was permanently the hardcoded literal | `normalizeConfig()` now reads `raw.hovedordre` and assigns to `ADMIN_CONFIG.hovedordre`. `hoofdordre` is kept as a *separate* passthrough value — see below, this distinction is the important part |
| C2 | `normalizeConfig()` read `lk.naam` — a spelling no producer in this repo emits | Every wage code in the documented `{ kode, navn }` form degraded to its own code as the display label: `"Ordinær arbeidstid"` rendered as `"100"` | Read `lk.navn`, with `label` still taking precedence |
| C3 | `confirmStructuredEntry()` hardcoded the wage code `"ORD"` | `confirmStructuredEntry()` is the **only** path that puts a lønnskode on an order draft in React mode. `"ORD"` is in no organization's configured `wageCodes`. Every structured order line the pilot exported carried a wage code payroll was never told about | Derives the default from `ADMIN_CONFIG.lonnskoder[0].kode`, matching `teAddLonnskode()`'s existing precedent; `"ORD"` retained only as the empty-config fallback |

Verified clean on the same pass: `kjoretoy` (passes through verbatim; explicit
`[]` correctly preserved as the documented free-text mode), `sjaDefaults`
(pre-fills `sted`/`arbeidsvarsling`, the shipped default is a legal enum option,
and `NEVER_AUTO_FILL` judgement fields stay null regardless of config), and
`externalLinks` (`id`/`title`/`url` survive in order; an explicit `[]` is not
replaced by Mesta-flavoured defaults).

**Regression coverage:** `lib/regression/config-contract.mjs`, 23 cases.

#### `hovedordre` and `hoofdordre` are not spellings of one field

This is the most important finding of the contract review, and it was reached by
getting it wrong first.

They look like a Norwegian/Dutch spelling pair. They are two different things:

| Field | Meaning | Example value |
|---|---|---|
| `hovedordre` | Reserved key of the **main timesheet bucket** — "hours for my day not attributed to a specific order". `motor.js` treats it as a **sentinel**: `getOrCreateMainDraft()` stamps `isMain`, and `endDay()`, `getUnresolvedItems()` and `getLockedHoursFromTillegg()` all deliberately *exclude* it from ordinary draft handling | `"HOVED"` |
| `hoofdordre` | The organization's **primary active work order**, produced by `toRuntimeConfig()` as `orders.find(o => o.active)`. A real order a worker books real hours against | `"204481-0014"` |

The first attempt at C1 treated them as aliases and mapped `hoofdordre` into
`hovedordre`. `lib/regression/cross-organization.mjs` caught it. The failure mode
is severe, and was then reproduced directly:

- the worker's **confirmed work draft becomes the main-time bucket** (same key,
  same object);
- `getUnresolvedItems()` returns **zero items** while `mainTimeHandled` stays
  `false` — so `lockDay()` is blocked forever with **nothing shown to resolve**.
  A hard deadlock the worker cannot escape;
- a main-time discard then silently flips the worker's real, confirmed work to
  `"discarded"`, and it never reaches the export.

The original code's separation of the two was accidental — it fell out of
reading one key and writing another — but it was **behaviourally protective**.
The corrected fix keeps them strictly separate and documents why at every site.

Two test harnesses encoded the same conflation
(`lib/regression/full-day-scenario.mjs`, `lib/organization-package/phase9-dry-run.mjs`,
both setting `hovedordre: runtimeConfig.hoofdordre`). Both were harmless only
because the defect meant `hovedordre` was ignored; both are corrected.

Pinned by `config_contract_primary_active_order_must_not_become_the_main_bucket`
so it cannot be reintroduced.

The `hoofdordre` spelling itself remains embedded in published runtime JSON.
Renaming it is a data migration, ranked as debt item 6 below.

### 1.2 Engineering gate (fixed)

| # | Defect | Verified consequence | Fix |
|---|---|---|---|
| G1 | `lib/backend/persistence.mjs` threw at module load whenever `NODE_ENV=production` and `PUNCHOUT_DATA_DIR` was unset. `next build` sets `NODE_ENV=production` and its page-data collection step imports every Route Handler | **`npm run build` failed.** So did the Dockerfile's builder stage (which sets the variable only in the runner stage) and CI's own "Production build" step (which never sets it). The repository could not produce a deployable artifact by any documented path | Guard now also checks `NEXT_PHASE !== "phase-production-build"`, Next's own signal for the build window. A real server start with `NODE_ENV=production` and no data directory still fails fast — proven by the pre-existing `production_without_data_dir_fails_fast` case, which is unchanged and still passes |
| G2 | `next.config.mjs` set `typescript.ignoreBuildErrors: true` | The build never typechecked. `tsc --noEmit` in CI is *not* the same guarantee — only the build sees Next's generated route types in `.next/types/**` | Removed. Verified clean at removal: typecheck and build both pass with zero errors, so nothing was being hidden |
| G3 | `vitest.config.mts`'s `exclude` **replaces** Vitest's defaults, and omitted `.next/**`. `output: "standalone"` copies the whole source tree, tests included, into `.next/standalone/` | After any production build, `vitest run` collected every test file twice and failed 3 of 6 files against the standalone tree's pruned `node_modules`. Exit code 1, purely from build output | Added `.next/**` and `dist/**` |
| G4 | `npm run test:components` was never referenced by `.github/workflows/ci.yml` | The entire jsdom/React suite ran only if a human remembered — the same class of gap as the lint one this repo already documented and closed | Added as a CI step, after the regression suite |

An `npm run verify` script now chains the whole gate in fail-fast order:
`lint → typecheck → test → test:components → build`.

### 1.3 Gate status at close of mission

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 13 warnings (pre-existing, documented, accepted — see debt item 11) |
| `npm run typecheck` | 0 errors |
| `npm test` | **189 cases, all passed** (117 before this mission) |
| `npm run test:components` | 3 files, 13 tests, all passed |
| `npm run build` | succeeds, with `ignoreBuildErrors` removed and `PUNCHOUT_DATA_DIR` unset |

### 1.4 Characterization suite (added)

`lib/regression/motor-characterization.mjs`, 49 cases, covering day start,
pre-day, drift, schema editing, Håndrens, timeføring, lock, stale-day recovery,
storage corruption and write failure, and refresh/resume.

These cases assert what the motor **does**, not what it should do. They exist so
the migration in section 5 has an executable definition of "no behaviour
changed". Where today's behaviour contradicts a comment or an obvious
expectation, the case pins the actual behaviour and says so — three such
contradictions are pinned and are debt items 1, 2 and 3 below. Silently
"correcting" them in the suite would destroy the baseline it exists to provide.

---

## 2. Ranked technical debt

Ranked by *risk to correctness of data already being collected*, then by
migration cost. Rank 1–4 are things that are wrong now. Rank 5–12 are things
that make change expensive.

### Rank 1 — Main time can only ever be discarded, never confirmed

**Severity: high. Data correctness. Affects every pilot day recorded so far.**

The main timesheet cannot be confirmed through the shipped React app:

- confirming requires at least one lønnskode line (`resolveMainTime`, and
  `confirmMainTimeEntry` independently);
- `grovutfyllMainDraft()` deliberately adds none ("Lønnskoder are NOT
  pre-filled — user adds them explicitly");
- `confirmStructuredEntry()` only ever writes lønnskoder onto a **parsed order**
  draft, never the main one;
- `teAddLonnskode()` / `addLonnskode()` are vanilla-DOM functions and are
  **not on the `window.Motor` bridge**;
- `components/punchout/handrens-phase.tsx` renders the confirm button
  `disabled={lonnskoder.length === 0}` and tells the worker to use
  "Forkast timeføring" instead.

`buildExportPacket()` exports only drafts with `status === "confirmed"`.
Therefore **no pilot day has ever exported a main-time line.** Main hours have
either been discarded with a reason, or the day was not lockable at all.

Not fixed here: closing it means building a lønnskode editor for the main draft,
which is feature work and outside this mission. Pinned by
`char_main_time_confirm_is_UNREACHABLE_through_the_react_bridge_today`.

**Recommendation:** treat as the highest-priority product bug, not as
architecture. Decide deliberately whether main hours are meant to be captured in
Punchout at all, or whether "logged elsewhere" is the intended pilot workflow —
the answer changes what the Operations model in
`docs/FUTURE_OPERATIONS_FOUNDATIONS.md` can assume about hours data.

### Rank 2 — A failed storage write leaves memory ahead of disk, with no retry

**Severity: high. Silent data loss under a condition field devices actually hit.**

When `localStorage.setItem` throws — quota exceeded, Safari private mode,
storage pressure on an old Android device — `saveCurrentDay()` catches it and
publishes `storageError` of type `save`. But the in-memory day keeps advancing.
There is no retry, no write-ahead buffer, and no blocking of further input. A
refresh or a tab kill at that point loses everything since the last successful
write, silently.

Mitigating factor, verified: `saveCurrentDay()` always serialises the **entire**
day, so the first successful write after a transient failure fully repairs the
persisted copy. The failure is survivable as long as the tab is not reloaded.

Pinned by `char_failed_write_surfaces_a_save_storage_error_but_keeps_the_day_in_memory`
and `char_recovered_writes_flush_the_full_current_state_not_a_delta`.

**Recommendation:** in the storage adapter proposed in section 5, add a bounded
retry and make `storageError.type === "save"` a hard UI block on further entry
until a write succeeds. Small, deterministic, independently testable.

### Rank 3 — `force_skipped` does not block lock, despite the comment saying it must

**Severity: medium, currently dormant.**

`forceStartDay()`'s comment states: *"force_skipped items MUST be resolved in
Håndrens — they block lockDay."* They do not. `getUnresolvedItems()` drops every
`origin === "pre_day"` schema **before** examining status, so the
`"force_skipped"` branch in that status check is unreachable. And
`forceStartDay()` only ever sets that status on pre-day schemas.

Dormant today because nothing can populate `ADMIN_CONFIG.requiredSchemas` — it
is hardcoded empty and no injected runtime path writes it (confirmed by grep;
`lib/regression/pilot-ux-cases.mjs` documents the same dormancy). So an
organization cannot currently make a schema required, and therefore cannot
force-skip one.

Not fixed: the mechanism is unreachable, so changing `getUnresolvedItems()` would
be a behaviour change with no observed failure behind it — exactly what this
mission's rules exclude. Pinned by
`char_force_skipped_pre_day_schema_does_NOT_block_lock_today`.

**Recommendation:** fix it *at the same time* as wiring `requiredSchemas` from
the organization runtime, not before. A safety guarantee that is written down
but not implemented is worse than one that is absent, because people rely on it.

### Rank 4 — One incident utterance produces two uncoordinated schemas

**Severity: medium. UX and data quality.**

"Nestenulykke ved påkjøring" creates **two** schemas by two unrelated
mechanisms:

- `uonsket_hendelse`, from `RUNNING_SCHEMAS` keyword triggers;
- `ruh`, from the `COMPLETION_RULES` fact rule on `incidentReported`.

Both land in Håndrens as separate items the worker must resolve independently,
and neither knows the other exists. The worker is asked twice about one event,
and the exported day contains two records of it.

There are two parallel derivation systems here — a keyword/trigger system baked
into schema definitions, and a fact/rule engine — with no arbitration between
them. Pinned by `char_one_incident_utterance_produces_two_independent_schemas`.

**Recommendation:** consolidate onto the rule engine during the migration, and
treat the keyword triggers as one more rule *source* rather than a second
mechanism. Do it as a deliberate, visible change with the characterization case
updated in the same commit.

### Rank 5 — `motor.js` is a 6182-line module of global mutable state

**Severity: medium. This is the migration cost driver, not a correctness bug.**

Measured, not estimated:

| Metric | Count |
|---|---|
| Lines | 6182 |
| Top-level `function` declarations | 218 |
| Module-level `var` declarations (mutable global state) | 63 |
| `REACT_MODE` guards | 95 |
| `document.` references | 117 |
| `innerHTML` assignments | 41 |
| Functions exposed on `window.Motor` | 52 |

`REACT_MODE` is a hardcoded `true`. Every one of those 95 guards, and
essentially all 117 DOM references and 41 `innerHTML` sites, is dead code in the
shipped app — a complete second UI implementation carried alongside the live one.
It is not merely unused: it is the reason several capabilities (adding a
lønnskode, above all) exist only as DOM handlers and are therefore unreachable
from React. Rank 1 is a direct consequence of rank 5.

### Rank 6 — `hoofdordre` is a typo embedded in persisted data

**Severity: low-medium. Migration cost, not correctness.**

Now handled by accepting and emitting both spellings (§1.1). Eliminating the
alias means rewriting stored `OrganizationRuntime` JSON and every
`organizations/*/runtime.json` consumer. Do it as an explicit data migration
with a version bump, or not at all. Do **not** do it opportunistically inside
another change.

### Rank 7 — Corrupt history degrades to empty, silently

`getHistory()` catches a parse failure, logs to console, and returns `[]`. No
`storageError`, no user-visible signal. This is the right *availability*
tradeoff — losing the archive must not stop today's work — but the worker is
never told that up to 90 days of locked days just became unreadable, and
`pushToHistory()` will then happily overwrite the corrupt blob with a
single-entry array, destroying any chance of recovery.

Pinned by `char_corrupt_history_degrades_silently_and_never_blocks_the_day`.

**Recommendation:** on parse failure, preserve the corrupt raw value under a
side key before overwriting, and surface a non-blocking notice. Small,
deterministic, independently testable.

### Rank 8 — `startDay()` overwrites an open day with no guard in the motor

`startDay()` replaces `dayLog` unconditionally. It does **not** archive a stale
open day first, unlike `discardStaleDay()`, which explicitly does. The only
thing preventing data loss is that the React UI does not offer the button in
that state. The invariant lives in the UI, not in the domain.

Pinned by `char_starting_a_new_day_over_a_stale_one_replaces_it_without_archiving`.

### Rank 9 — Schema instances do not pin the definition version they were created under

`Schema.schemaVersion` exists in `hooks/use-motor-state.ts` and is documented as
the field that lets a future dynamic-schema motor resolve an open instance back
to its exact original definition. `motor.js` never sets it.
`createSchemaInstance()` writes `type`, `origin`, `status`, `createdAt`,
`fields`, `linkedEntries` — no version.

Consequence: a schema instance created today and edited after a runtime update
is validated against the **new** definition. If a required field is added, an
already-open instance silently becomes invalid. This is also the single most
important seam for future historical comparability — see
`docs/FUTURE_OPERATIONS_FOUNDATIONS.md`, which treats it as the one place where
acting now is arguably warranted.

### Rank 10 — `PUNCHOUT_CONFIG` is normalised but never validated

`normalizeConfig()` applies fallbacks; it does not validate. A wage code with a
non-string `kode`, an external link with a `javascript:` URL, or an
`arbeidsvarsling` default outside the schema's enum all pass through unexamined.
`zod` is already a dependency and is used elsewhere in the repo.

The three defects in §1.1 would all have been caught at boot by a schema with a
strict shape, instead of by reading 6182 lines.

### Rank 11 — The lint gate is "0 errors", not "0 warnings"

13 `react-hooks/set-state-in-effect` warnings are documented and accepted. That
is a legitimate decision, but it means the gate cannot detect a *new* warning of
the same class — it will simply become the 14th. Either ratchet the count or
suppress the accepted 13 individually with justification, so that new
occurrences fail.

### Rank 12 — React discovers the motor by 50 ms polling

`useMotorState`, `useMotorSnapshot` and `useMotor` each `setInterval(..., 50)`
until `window.Motor` appears, and re-render on a revision counter for **every**
motor event regardless of the key subscribed to. Correct, and deliberately so
(it fixed a real mobile race), but it means the subscription key is decorative:
every hook re-renders on every change. In the migration, a real store with
per-key subscriptions removes both the polling and the over-rendering.

---

## 3. What is *not* debt

Recorded so a future reader does not "fix" these:

- **`startTime: null` with `startTimeSource: "pending"` on day start.** Opening
  the app is deliberately not clocking in. Load-bearing HMS/payroll property.
- **Pre-day schemas never blocking lock.** They are recommendations by design;
  `getUnresolvedItems()` skipping `origin === "pre_day"` is intentional.
- **Discarded schemas retained with `status: "discarded"` rather than deleted.**
  "The worker considered this and said no" is a preserved fact, and reaches the
  export.
- **Main-time discard requiring one of exactly two reasons.** "No hours today"
  must be an explicit, recorded choice.
- **Telemetry failures never breaking the day.** Same deliberate posture as
  `pushToHistory()`.
- **`localStorage` as the single source of truth for an in-progress day.** The
  offline-first premise. The device is the system of record until lock.

---

## 4. Migration target: typed domain core + adapters

**Proposal only. Not performed in this mission.**

### 4.1 Problem statement

Today `window.Motor` is simultaneously: the domain model, the persistence layer,
the export/outbox client, the telemetry client, the schema registry, the rule
engine, a speech-recognition controller, and a complete second DOM UI. All of it
is global mutable module state in one file, reachable only through a browser
`window` global, and typed only by a hand-maintained `declare global` block in
`hooks/use-motor-state.ts` that nothing verifies against the implementation.

The concrete costs, all evidenced above: capabilities that exist only as DOM
handlers and are therefore unreachable from React (rank 1); invariants that live
in the UI rather than the domain (rank 8); two competing derivation mechanisms
with no arbitration (rank 4); and a type declaration that can drift from reality
without any check noticing.

### 4.2 Target shape

```
lib/domain/                 pure, no browser globals, no I/O
  day.ts                    DayLog state machine: start → pre → active → ending → locked
  schema.ts                 instance creation, required-field validation, versioning
  timesheet.ts              drafts, lønnskoder, derived hours
  handrens.ts               getUnresolvedItems / resolveItem as pure projections
  config.ts                 RuntimeConfig parsing + validation (zod), one canonical shape

lib/ports/                  interfaces the core depends on, implemented outside it
  storage.ts                load/save/clear + explicit write-failure result
  clock.ts                  now() — today's Date calls are untestable in-place
  telemetry.ts              emit(event)
  export.ts                 enqueue(packet)

lib/adapters/
  local-storage-adapter.ts  implements storage.ts, owns the retry from rank 2
  browser-clock.ts
  outbox-export-adapter.ts  the existing outbox, unchanged in behaviour
  telemetry-adapter.ts      the existing side-channel, unchanged in behaviour

app/(store)/motor-store.ts  a real store with per-key subscriptions; replaces
                            the 50 ms polling and the revision counter (rank 12)
```

The domain core is pure and synchronous. Every side effect — storage, clock,
network, speech — enters through a port. That is what makes the characterization
suite runnable against the core directly, with no `vm` sandbox and no
`window` stub.

### 4.3 Sequencing

Each step is independently shippable, independently verifiable, and leaves the
app working. **The characterization suite must pass unchanged after every step**
— that is the definition of done for each one.

1. **Delete the vanilla DOM mode.** `REACT_MODE` is hardcoded `true`. Remove the
   95 guards, the 117 DOM references, the 41 `innerHTML` sites and the dead
   render/overlay functions. Largest single reduction, near-zero risk, and it
   makes rank 1 visible as an actual missing capability rather than a
   bridge-exposure accident. Do this **first** — every later step is cheaper
   against a file half the size.
2. **Extract the ports.** Introduce `storage.ts` and `clock.ts` and route
   `motor.js`'s existing calls through them, still from inside `motor.js`. No
   behaviour change. This is the test seam that lets the characterization suite
   run without a `vm` sandbox.
3. **Extract `config.ts`.** Move `normalizeConfig()` out, add strict validation
   (rank 10), and collapse the `hovedordre`/`hoofdordre` alias to a single
   internal field with the alias handled only at the parse boundary.
4. **Extract `handrens.ts`.** `getUnresolvedItems()` is already a pure
   projection of `dayLog` — the characterization suite proves it survives a
   reboot with no in-memory queue. This is the easiest real domain extraction.
5. **Extract `day.ts` and `timesheet.ts`.** The state machine and the draft
   model. Address rank 8 here, by moving the "do not overwrite an open day"
   invariant into the domain.
6. **Extract `schema.ts`.** Address rank 9 here — pin `schemaVersion` at
   instance creation. Consolidate the two derivation mechanisms (rank 4) in the
   same step, updating the characterization case deliberately.
7. **Replace the `window.Motor` bridge with the store.** `window.Motor` remains
   as a thin, deprecated shim during transition, since
   `lib/regression/*.mjs` and `browser-verification.mjs` drive it directly.
8. **Retire the shim** once the regression harnesses target the core.

### 4.4 Invariants the migration must not break

Drawn from the characterization suite, which encodes each of them:

- Opening the app never records a start time.
- A user-confirmed start time is write-once.
- Pre-day schemas never block lock.
- Håndrens is a closed set — entries cannot be added during `ending`.
- Lock requires both zero unresolved items **and** `mainTimeHandled`.
- Lock is terminal and idempotent across process boundaries.
- Discard archives before wiping.
- A stale day keeps the date the work was performed on.
- Corrupt current-day storage blocks with a recoverable error; corrupt history
  never blocks.
- `getUnresolvedItems()` is a pure projection of `dayLog`, not a queue.
- Legacy persisted shapes (`FINISHED`, missing `phase`/`schemas`) migrate on
  load.

### 4.5 Explicit non-goals

- Do not introduce a backend as part of this migration. The device stays the
  system of record until lock.
- Do not change the export envelope shape. `lib/adapters/` and its golden tests
  are a separate contract with external consumers.
- Do not build Operations, KPI or profile functionality. See
  `docs/FUTURE_OPERATIONS_FOUNDATIONS.md` for what may be worth preserving now,
  and what must wait.

---

## 5. Suggested order of work after this mission

1. Decide the product question behind rank 1 (are main hours captured in
   Punchout at all?). It gates both the fix and the Operations model.
2. Fix rank 2 (storage write retry + hard block). Small, deterministic,
   independently testable, and it protects data already being collected.
3. Fix rank 7 (preserve corrupt history before overwriting). Same properties.
4. Migration step 1 (delete vanilla mode). Everything else gets cheaper.
5. Reassess. Steps 2–8 of the migration should be re-justified against whatever
   the product direction turns out to be, not executed on momentum.
