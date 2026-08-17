# Future Operations Foundations — Readiness Assessment

**Status:** analysis. Written 2026-08-17, against `main` at the close of the
post-pilot engineering-baseline mission.

**What this is:** an assessment of whether today's Punchout Field repository
preserves the facts a future Operations / Operational Knowledge / Metrics /
Performance-Profile layer would need, and whether any low-cost decision should
be made *now* to avoid permanent loss or corrupted historical comparability.

**What this is not:** a design for Punchout Operations. No Task, Resource,
Assignment, Completion, Competency or CapacityEvent model is proposed for
implementation here. No employee scoring, dashboards, leaderboards or planning
functionality is designed or built.

**Governing principle applied throughout:** *collect facts before
interpretations; preserve history before building dashboards.*

> ## Conclusion, stated up front
>
> ### FOUNDATIONAL CHANGE WARRANTED NOW — one item.
>
> **The backend receives every locked day's full operational record, verifies
> its HMAC signature, and then discards the payload, storing only a receipt.**
> The sole surviving copy of what a worker actually did is on the worker's own
> device, in a `localStorage` array capped at 90 entries, which silently
> degrades to empty on a parse failure. Every pilot day recorded from now until
> this changes is unrecoverable once a device is lost, wiped, reinstalled or
> reaches the 90-day cap.
>
> Everything else in this assessment is **NO CHANGE REQUIRED — document the
> seam**. Details in §5. The change above was *not* implemented in this mission,
> for a reason stated explicitly in §5.1: it enlarges the system's personal-data
> footprint, which is a founder decision, not an engineering default.

---

## 1. Current readiness for the future Operations model

| Future capability | Readiness | Basis |
|---|---|---|
| Historical analysis of what was done | **Blocked** | Server keeps receipts only; see §3.1 |
| org → device → user → event attribution | **Partial** | org and device are strong; user is weak; see §4.2 |
| org → work order → event attribution | **Partial** | order id is captured but only on time entries, not on events; see §4.3 |
| Neutral event layer, decoupled from KPI logic | **Good** | Existing telemetry is already neutral; see §7 |
| Event timestamps sufficient for sequencing | **Weak** | Entries carry `HH:MM` local, no date, no timezone; see §4.4 |
| Provenance / tamper-resistance of events | **Weak** | Telemetry ingest is unauthenticated and self-attesting; see §4.5 |
| Schema versioning | **Weak in the motor, good in the registry** | The registry versions definitions; instances do not pin a version; see §4.6 |
| Production benchmarking data (quantities) | **Absent** | No quantity/mengde is captured anywhere; see §3.4 |
| Retention / audit design | **Adequate server-side, fragile device-side** | 90-day pruning with a 200-record floor server-side; unbounded silent loss device-side; see §8 |

Overall: the repository is **structurally closer to a neutral event layer than
expected**, and **further from preserved history than expected**. The event
vocabulary, the versioned schema registry, the rule engine and the
organization-scoped runtime are all real and already generalized beyond Mesta.
The gap is not modelling. The gap is that the facts are not kept.

---

## 2. Data already captured

### 2.1 On the device, in `dayLog` (`localStorage`, key `yournal_current_day`)

Genuinely rich, and more than the UI displays:

- **Day frame** — `date`, `startTime`, `startTimeSource` (`pending`/`user`/`auto`
  — i.e. *whether the worker confirmed their own start time or the system
  inferred it*, a real provenance flag), `endTime`, `phase`, `status`.
- **Entries** — `time`, `type`, `text`, plus decision flags: `ruhDecision`,
  `vaktloggConfirmed`, `vaktloggDiscarded`, `converted`, `keptAsNote`,
  `verified`, `lockedByUser`.
- **Schemas** — `id`, `type`, `origin` (`pre_day`/`running`/`drift`/`conversion`),
  `status` (`draft`/`confirmed`/`skipped`/`discarded`/`deferred`/`force_skipped`),
  `fields`, `createdAt`, `confirmedAt`, `forceSkippedAt`, `linkedEntries`.
- **Drafts (timesheet)** — per order: `ordre`, `dato`, `fra_tid`, `til_tid`,
  `arbeidsbeskrivelse[]`, `ressurser[]`, `lonnskoder[{kode,fra,til}]`,
  `maskintimer[{maskintype,timer}]`, `entryIndices[]`, `status`, `confirmedAt`.
- **Main-time disposition** — `mainTimeHandled`, `mainTimeDiscarded`,
  `mainTimeDiscardReason` (`no_work_done` / `logged_elsewhere`).
- **External-system delegation** — `externalTasks[{system, params, openedAt,
  confirmedByUser, confirmedAt}]`.

The `status` vocabulary is a genuine asset. It already distinguishes *skipped*
from *deferred* from *discarded* from *force-skipped* — four different human
decisions that a naive model would have collapsed into "not done". A future
compliance metric can therefore ask "was this required, and what did the worker
actually do about it" rather than only "did it exist".

### 2.2 Telemetry (`localStorage` key `yournal_telemetry`, flushed to `/api/telemetry`)

Event shape: `{ id, type, occurredAt, organizationId, data, flushed }`.

Existing types: `ObservationCreated`, `FactCreated`, `RuleTriggered`,
`PromptAccepted`, `PromptDismissed`, `SchemaCompleted`, `SchemaSkipped`,
`RuntimeLoaded`, `RuntimeChanged`, `ExportSucceeded`, `ExportFailed`,
`CorrectionCreated`/`Applied`/`Ignored`/`Expired`/`Conflict`, `ClientError`.

A second, deliberately anonymous stream exists for UX observation
(`lib/telemetry/ux-events.mjs`, key `punchout_ux_telemetry`), carrying no user
or device identifier by design.

### 2.3 Server-side

- **Device registry** — `deviceId → { secret, registeredAt, registeredBy,
  status, organizationId }`. Admin-only writes.
- **Device audit log** — `{ deviceId, action, by, at }`.
- **Provision failure log** — `{ at, deviceId, ip, reason }`.
- **Runtime history** — versioned, per organization, 20 versions / 180 days.
- **Export log** — receipts only (see §3.1).
- **Telemetry log** — full events, 90 days / 200-record floor.

### 2.4 Organization package

`organizations/*/`: `orders`, `machines` (with `type`, used for machine-hours),
`vehicles`, `wageCodes`, `procedures`, `externalLinks`, `sjaDefaults`, `rules`,
`capabilityProviders`/`Bindings`, and a `knowledge_graph.json` that already maps
`machineType → requiredSchemas / recommendedSchemas / externalSystems`.

That knowledge graph is the closest existing thing to a `Requirement` concept,
and it is already organization-scoped and compiled through a versioned runtime.

---

## 3. Data currently lost

### 3.1 The entire export payload — the critical one

`motor.js` `buildExportPacket()` builds a complete record at lock:

```
{ exportVersion, exportId, deviceId, userId, dayId, createdAt,
  payload: { startTime, endTime, entries, schemas, timeEntries, machineHours } }
```

`POST /api/export` parses it, resolves the organization from the authenticated
device registry, verifies the HMAC over the raw body — and then calls:

```js
recordExport({ receivedAt, exportId, organizationId, deviceId, signatureValid: true })
```

`exportLog`'s own type annotation in `lib/backend/state.mjs` confirms the shape:
`{receivedAt, exportId, organizationId, deviceId, signatureValid}`. There is no
payload field. Verified by grep: **zero references to `.payload` anywhere under
`app/api/` or `lib/backend/`.**

So the server proves a day arrived, from a known device, in an organization, with
a valid signature — and keeps nothing about what happened in it.

The only surviving copy is device-side `yournal_history`, which:

- is capped at 90 entries (`pushToHistory` slices to 90);
- returns `[]` on any parse failure, silently, with no user-visible signal, and
  is then overwritten by the next successful push (ranked debt item 7 in
  `docs/POST_PILOT_ARCHITECTURE.md`);
- lives in `localStorage`, i.e. is destroyed by a browser data clear, a device
  reset, a reinstall, or a lost phone;
- is written by the same `localStorage` that can silently fail under quota
  pressure (ranked debt item 2).

**Every pilot day recorded from now until this changes is unrecoverable.** No
future Operations, Metrics or Performance-Profile layer can reconstruct it,
because the facts were never kept anywhere durable.

There is a richer contract already written for exactly this —
`lib/adapters/envelope.mjs`'s `ExportEnvelope`, carrying `organizationId`,
`schemaVersion`, `appVersion`, `shift`, `entries`, `schemas`, `timeEntries`,
`machineHours` and a free-form `metadata` bag. It is **called only from dry-runs
and tests**. No production path invokes it.

### 3.2 Entry decision flags, at the export boundary

`buildExportPacket()` sanitises entries down to `{ time, type, text }`. Dropped:
`ruhDecision`, `vaktloggConfirmed`, `vaktloggDiscarded`, `converted`,
`keptAsNote`, `verified`, `lockedByUser`.

`verified`/`lockedByUser` distinguish *the worker confirmed this structured line
on screen* from *the system inferred it from speech*. That is precisely the
provenance a future data-quality or estimate-accuracy metric would need, and it
is discarded at the boundary — even before §3.1 discards everything else.

### 3.3 Edit history

`saveEdit()` rewrites `entry.text` in place. There is no prior-value record and
no edit event. An entry that said one thing at 08:00 and something else at 15:00
is indistinguishable from one that always said the second thing.

### 3.4 Quantities / mengder — never captured at all

Nothing in the model records *how much* was produced. `maskintimer` records
machine *hours*; `lonnskoder` record labour *hours*. There is no tonnage, no
metres, no area, no unit count anywhere in `dayLog`, the schemas, the export
packet or the envelope.

Production benchmarking ("faktisk produksjon mot kalkyle") is therefore **not
merely unbuilt — its input does not exist**. This is the one Operations
capability that cannot be recovered retroactively from better retention alone,
because the fact was never observed.

### 3.5 Unflushed telemetry beyond the cap

`emitTelemetry()` trims to the most recent 500 events **regardless of
`flushed`**. A device that is offline or has `telemetryEndpoint` unset for long
enough silently drops its oldest unsent events. Low volume today, but it is
unbounded silent loss in the layer explicitly nominated as the future event
foundation.

### 3.6 Runtime version at time of event

`lib/telemetry/types.mjs` declares an optional `runtimeVersion` on
`TelemetryEvent`, documented as "which Runtime was active, for before/after
comparison". `motor.js`'s `emitTelemetry()` never sets it. Without it, a metric
computed across a runtime change cannot tell whether behaviour changed or the
rules did.

---

## 4. Schema seams

### 4.1 What is already well-shaped

- **`OrganizationRuntime` is compiled, versioned and history-retained** per
  organization. A future `TaskTemplate` or `Requirement` fits this pipeline
  without inventing new machinery.
- **The rule engine is data, not code.** `COMPLETION_RULES` uses the same
  `{trigger, conditions, action, priority, affects}` shape as
  `lib/rules/types.mjs`, and injected runtime rules already override the
  hardcoded defaults, proven by the existing regression suite.
- **`capabilityProviders` / `capabilityBindings`** already express "this
  organization satisfies capability X via provider Y", which is the natural
  attachment point for future `Competency` and `Requirement` concepts.
- **The knowledge graph** already models `machineType → requiredSchemas`, i.e.
  resource-driven requirement derivation.

### 4.2 Identity: organization strong, device strong, user weak

`organizationId` is resolved **server-side from the authenticated device
registry**, never from anything the client sends — a deliberate, documented
hardening. `deviceId` is HMAC-authenticated per export.

`userId` is not. It is read from `localStorage` (`punchout_user_id`, written once
by `/provision`) and passed through in the packet. There is no login, no session,
no verification. A device is authenticated; a *person* is asserted.

For Punchout Field this is honest and adequate. For a future **Performance
Profile** — feedback attributed to a named worker, visible to that worker and
an authorised manager — an unverified, device-local, freely editable `userId` is
not a sufficient identity basis. This is the single largest identity gap between
today and the future model, and it is a product/legal decision (does Punchout
get real user identity?) before it is a technical one.

### 4.3 Work-order linkage exists, but only on time entries

`ordre` is captured on drafts and time entries, extracted from speech via the
organization's own `extractionPatterns.ordre`. But **events do not carry it**.
`SchemaCompleted` carries `{id, action, schemaType}`; nothing ties it to the
order or work being performed at the time.

A future "F-SJA compliance per contract" or "production per work order" metric
needs order context on the *event*, not only on the timesheet line. This is the
cheapest high-value seam to widen later — `emitTelemetry`'s `data` bag is
free-form, so adding `ordre` is additive and non-breaking.

### 4.4 Timestamps are mixed-precision and timezone-free

Three different conventions coexist:

| Field | Format | Sufficient for sequencing? |
|---|---|---|
| `telemetryEvent.occurredAt` | full ISO 8601 UTC | yes |
| `schema.confirmedAt`, `draft.confirmedAt` | full ISO 8601 UTC | yes |
| `dayLog.date` | `YYYY-MM-DD` local | date only |
| `entry.time`, `schema.createdAt`, `lonnskode.fra/til` | `HH:MM` **local, no date, no offset** | **no** |

`schema.createdAt` being `HH:MM` while `confirmedAt` is full ISO is a genuine
inconsistency inside one object. Across a DST boundary or a midnight shift,
`HH:MM` alone cannot be ordered. `calculateHoursBetween()` already patches around
this with `if (diff < 0) diff += 24*60` — a heuristic that silently assumes any
backwards interval is an overnight shift rather than a data error.

For future duration and sequencing analysis this is the most consequential
low-level gap after §3.1.

### 4.5 Provenance of telemetry is self-attested

`POST /api/telemetry` performs **no authentication and no device-session check**.
It accepts an array of events and stores them, with `organizationId` taken from
the event body — i.e. from the client. (The `GET` on the same route *is*
admin-gated, and `/api/export` *is* HMAC-verified; telemetry is the outlier.)

This is defensible for the current purpose — product observability, best-effort,
"never blocks the day". It is **not** a sufficient basis for a Metrics layer
whose output affects how a worker is assessed. If telemetry is ever to become
the operational event layer described in the future direction, its ingest must
be authenticated to the same standard as `/api/export` *before* the first event
that matters is written, not after.

### 4.6 Schema versioning: the registry versions definitions, instances do not pin them

`lib/organization/schema-registry.mjs` versions schema *definitions*, and
`hooks/use-motor-state.ts` already declares the field that would close the loop:

```ts
/** Pins the SchemaRegistryEntry.version this instance was created under ...
 *  what lets a future dynamic-schema motor resolve an already-open instance
 *  back to its exact original definition instead of a newer one */
schemaVersion?: number;
```

`motor.js` never writes it. `createSchemaInstance()` sets `type`, `origin`,
`status`, `createdAt`, `fields`, `linkedEntries` — no version.

Consequence for future analysis: a completed SJA from March and one from
September are indistinguishable in *which definition of "an SJA" they satisfied*.
If a required field is added in between, historical comparability is silently
corrupted — the older instances look incomplete against a standard that did not
exist when they were created. This is exactly the "history should not be
rewritten because the formula changed" failure mode, arriving through the schema
rather than the KPI.

This is the strongest *second* candidate for acting now (§5.2).

### 4.7 Would the future concepts require disruptive migration?

| Future concept | Nearest existing thing | Migration risk |
|---|---|---|
| `WorkOrder` | `ordre` string on drafts; `orders[]` in the org package | **Low.** Already an id with organization-scoped metadata. Needs promotion from string to entity, not replacement. |
| `Resource` | `machines[]`, `vehicles[]`, `draft.ressurser[]`, `maskintimer[].maskintype` | **Low-medium.** `ressurser` is free text extracted from speech; `maskintype` matches the org package's `machines[].type`. Reconcilable, but the free-text side will need mapping. |
| `Task` / `TaskTemplate` | none | **Low.** Greenfield. Nothing existing contradicts it. |
| `Assignment` | none — work is discovered from what the worker says, not assigned to them | **Medium.** Today's model is fundamentally *pull* (the worker declares the order). An `Assignment` is *push*. Both can coexist, but the direction of causality is currently one-way and the UI assumes it. |
| `Completion` | `draft.status === "confirmed"` + `dayLog.status === "LOCKED"` | **Low.** Already a real, guarded state transition with timestamps. |
| `Competency` | `capabilityBindings`, `knowledge_graph.requiredSchemas` | **Medium.** Requirements exist per *machine type*, not per *person*. Person-level competency needs the identity work in §4.2 first. |
| `CapacityEvent` / `Absence` | none | **Low.** Greenfield, server-side, no Field impact. |
| `Document` | `schema.fields`, `externalTasks` | **Medium.** No photo/attachment capability exists anywhere — `PHOTO_ATTACHED` in the proposed vocabulary has no current source. |

**Net:** none of the future concepts requires a disruptive migration of today's
model. The expensive dependencies are not modelling dependencies — they are
**identity** (§4.2) and **retained history** (§3.1).

---

## 5. Recommended now / later

The brief's five criteria for acting now: *(a)* protects information otherwise
permanently lost; *(b)* delay creates migration cost or corrupts historical
comparability; *(c)* compatible with current Field architecture; *(d)* small,
deterministic, independently testable; *(e)* does not delay soft launch.

### 5.1 NOW — Persist the verified export payload server-side

| Criterion | Met? | Why |
|---|---|---|
| (a) otherwise permanently lost | **Yes** | Only copy is a 90-entry device-local array that silently empties on corruption |
| (b) delay is costly | **Yes** | Every day recorded before the change is unrecoverable; this is not a migration cost, it is data that never existed |
| (c) architecture-compatible | **Yes** | **Zero motor.js changes.** `buildExportPacket()` already sends the full payload today; the server already parses and HMAC-verifies it. Only `recordExport()`'s stored shape changes |
| (d) small and testable | **Yes** | One field on the stored record, plus a retention constant. Directly testable via the existing `lib/regression/backend-persistence.mjs` and `security-audit.mjs` harnesses |
| (e) doesn't delay soft launch | **Yes** | Server-side only; no Field behaviour changes; nothing new to test on a device |

**Minimal specification** (not implemented — see below):

- store `packet.payload` alongside the existing receipt fields, only on the
  `signatureValid: true` path;
- keep the receipt-only shape for every rejection path
  (`unregistered_device`, `device_disabled`, invalid signature) — a rejected
  export's contents should not be retained;
- give payloads their own retention constant, separate from
  `EXPORT_LOG_RETENTION`, because operational history and delivery receipts have
  genuinely different lifetimes;
- do **not** route this through `lib/adapters/envelope.mjs` yet; storing the
  packet as received is the smaller, more faithful change. Promoting to
  `ExportEnvelope` is a later, independent step.

**Why this was not implemented in this mission.** It is the one recommendation
here that materially enlarges what personal data the system stores: today the
server holds delivery receipts, and afterwards it holds every worker's full daily
record — entries, incident reports, hours — durably and centrally. That is a
personvern and arbeidsrettslig decision, and the brief itself insists such
decisions be made explicitly rather than inherited as a side effect of an
engineering change. The engineering is small and ready; the authorisation is not
mine to assume. **This is a decision request, not a backlog item.**

If the answer is no, the alternative is not "do nothing" — it is to decide,
deliberately and in writing, that Punchout's operational history lives and dies
on the device, which forecloses most of the future direction described in the
brief.

### 5.2 NOW (small) — Pin `schemaVersion` on schema instances

Meets (a) partially and (b) strongly: unlike §5.1 the *fact* survives, but its
interpretability degrades irreversibly the moment any schema definition changes.
Writing a version at creation costs one field and cannot be reconstructed later.

The field is already declared and documented in `hooks/use-motor-state.ts`. The
change is one line in `createSchemaInstance()` plus a regression case. It is
deliberately **not** made in this mission because the post-pilot baseline mission
admitted no production change without a verified failure, and no schema
definition has changed yet — so nothing has actually been corrupted. It is ranked
as debt item 9 in `docs/POST_PILOT_ARCHITECTURE.md` and should be taken with the
next schema change, not later.

### 5.3 LATER — Widen telemetry event context (additive, non-breaking)

`emitTelemetry`'s `data` is a free-form bag, so adding context is additive and
requires no consumer migration. When there is a reason to, add: `ordre`,
`deviceId`, `runtimeVersion` (already declared, never set), and the schema
instance id.

No reason to do it before there is a consumer. Documented as a seam.

### 5.4 LATER — Authenticate telemetry ingest

Required *before* telemetry is used for anything that affects a person (§4.5).
Not required for its current product-observability purpose. The pattern to copy
already exists in `/api/export`.

### 5.5 LATER — Normalise timestamp precision

Move `entry.time` and `schema.createdAt` to full ISO with offset (§4.4). This is
a device-side change in the frozen motor and should ride along with the domain
extraction proposed in `docs/POST_PILOT_ARCHITECTURE.md` §4, not before it.

### 5.6 NOT NOW — everything else

No `Task`, `TaskTemplate`, `Resource`, `Assignment`, `Completion`, `Competency`,
`CapacityEvent` or `Absence` model. No metric layer. No profile. No gamification.
No scoring. None of these are blocked by today's architecture (§4.7), so building
them early buys nothing and risks modelling the business before the facts are in.

---

## 6. Migrations to avoid

1. **Do not rename or restructure existing event types.** The current vocabulary
   is already neutral (§7). Renaming `SchemaCompleted` to something
   Operations-flavoured would split history at the rename and buy nothing.
2. **Do not store computed metrics or scores as events.** Events record what
   happened; metrics are derived at read time. A stored score is a stored
   interpretation, and it is exactly what makes history un-recomputable when the
   formula changes.
3. **Do not retrofit `organizationId` from `hovedordre` or `userId`.** Both
   mistakes have already been made once in this codebase and are documented at
   their fix sites. `organizationId` comes from the device registry, server-side.
4. **Do not collapse the `status` vocabulary.** `skipped` / `deferred` /
   `discarded` / `force_skipped` are four different human decisions (§2.1).
   Collapsing them to a boolean is irreversible and destroys the one thing that
   makes "compliance where a requirement actually existed" measurable.
5. **Do not treat `hoofdordre` and `hovedordre` as one field.** They are not
   spellings of the same thing: `hovedordre` is the reserved main-timesheet
   bucket key (sentinel, default `"HOVED"`), `hoofdordre` is the organization's
   primary active work order. Merging them deadlocks `lockDay()` and silently
   discards real confirmed work — reproduced and documented in
   `POST_PILOT_ARCHITECTURE.md` §1.1. Renaming `hoofdordre` itself is a separate
   data migration (debt item 6 there), because it is embedded in published
   runtime JSON.
6. **Do not make the device the long-term system of record.** It already is, by
   accident (§3.1). Making that official would foreclose the future direction.
7. **Do not introduce person-level metrics before person-level identity.**
   Attributing a profile to an unverified, device-local, editable `userId`
   (§4.2) would produce confidently wrong feedback about real people.

---

## 7. Recommended neutral event vocabulary

The brief's proposed events map cleanly onto what exists. Assessment of each:

| Proposed event | Status today | Note |
|---|---|---|
| `SJA_CREATED` | **Derivable** | `ObservationCreated` + schema instance creation |
| `SJA_SIGNED` | **Exists** | `SchemaCompleted` with `schemaType: "sja_preday"` |
| `CHECKLIST_COMPLETED` | **Exists** | `SchemaCompleted`, generic over schema type |
| `RUH_CREATED` | **Exists** | Schema creation via `RuleTriggered` on `incidentReported` |
| `VEHICLE_CHECK_COMPLETED` | **Exists** | `SchemaCompleted` with `schemaType: "kjoretoyssjekk"` |
| `TIMESHEET_SUBMITTED` | **Partial** | Lock emits `ExportSucceeded`; no distinct submit event, and see the main-time caveat below |
| `ASSIGNMENT_STARTED` | **Absent** | No assignment concept (§4.7) |
| `MAINTENANCE_ISSUE_REPORTED` | **Partial** | `loggbok_kjoretoy` conversion target exists; no event |
| `PHOTO_ATTACHED` | **Absent** | No attachment capability exists anywhere |
| `TASK_COMPLETED` | **Absent** | No task concept |

**Recommendation: do not add a parallel vocabulary.** The existing one is already
neutral in exactly the way the brief asks — it records *that a schema of type X
reached status Y*, with no notion of whether that is good. Adding
`SJA_SIGNED` alongside `SchemaCompleted{schemaType:"sja_preday"}` would create
two names for one fact and force every future consumer to reconcile them.

The correct move when a genuinely new fact appears (a photo, an assignment, a
quantity) is to add an event **type** for it, and to keep interpretation out of
the event entirely.

**One caveat that materially affects the KPI examples in the brief.** The
proposed administrative-quality metric *"timer levert samme dag"* cannot be
computed from today's data, and not because of a missing event: the main
timesheet can only ever be **discarded** in the shipped React app, never
confirmed, so no locked day has ever exported a main-time line. See
`docs/POST_PILOT_ARCHITECTURE.md`, debt item 1. Any hours-based metric is
blocked on that product question, independently of everything in this document.

Similarly, *"faktisk produksjon mot kalkyle"* is blocked on §3.4 — quantities are
not observed at all.

The HMS and documentation metric families, by contrast, are **already supported
in principle** by the existing vocabulary plus the `status` distinctions in
§2.1 — which is a genuinely good position, provided §5.1 preserves the history to
compute them over.

---

## 8. Retention and audit design

**Server-side is adequate and already deliberate:**

| Log | Retention |
|---|---|
| `exportLog` | 90 days, minimum 200 records |
| `telemetryLog` | 90 days, minimum 200 records |
| `provisionFailureLog` | 90 days, minimum 200 records |
| Runtime history | 20 versions / 180 days |

The `keepMinimum` floor is a good design: a low-traffic organization does not
lose its whole audit trail to a date-based sweep.

**Device-side is not designed at all**, and this is where change is warranted:

- `yournal_history` — hard cap of 90 entries, silent `[]` on corruption, then
  overwritten;
- `yournal_telemetry` — hard cap of 500 events, trimmed **without regard to
  whether they were ever sent** (§3.5);
- outbox — has `cleanOldSentExports()` and `resetStuckExports()`, i.e. it is the
  one device-side store with a real lifecycle policy.

**Recommendation:** the retention question and the §5.1 question are the same
question. Once the server durably holds operational history, the device's caps
stop being data-loss risks and become what they should be — a local cache with a
bounded size. Until then, tightening device-side retention is treating the
symptom.

**Audit design gap worth recording:** there is no record of *who read what*.
`GET /api/telemetry`, `GET /api/export` and `/api/operations-center` are all
admin-gated but unlogged. For a future Performance Profile that is explicitly
"privat for arbeidstaker selv og relevant autorisert leder", access logging is
not optional — it is what makes "authorised" a verifiable claim rather than a
policy statement. It costs nothing to add now and cannot be reconstructed later.
This is a genuine seam, and it is currently absent.

---

## 9. Summary of decisions requested

| # | Decision | Owner | Blocking |
|---|---|---|---|
| 1 | Persist verified export payloads server-side? (enlarges personal-data footprint) | Founder | **All future Operations/Metrics work.** Data is being lost daily until answered |
| 2 | Are main hours captured in Punchout at all, or is "logged elsewhere" the intended workflow? | Founder / product | Every hours-based metric; also `POST_PILOT_ARCHITECTURE.md` debt item 1 |
| 3 | Does Punchout get real user identity (login), or stay device-authenticated? | Founder / product | Any person-level profile or competency model |
| 4 | Should production quantities be observed at all? | Founder / product | Production benchmarking; cannot be recovered retroactively |

Items 2–4 are product-direction questions that this assessment surfaces but does
not attempt to answer. Item 1 is engineering-ready and awaiting authorisation.
