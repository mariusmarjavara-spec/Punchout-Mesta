# Field Test Readiness

**Mission:** Operation Punchout Field Trial
**Date:** 2026-08-17
**Commit tested:** `c702b2b` — the last commit containing executable change.
The only later commit (`9c8be72`) adds this document and its companions; the
gate was re-run there and still exits 0. Working tree clean.
**Companion documents:** [FIELD_TEST_PLAYBOOK.md](FIELD_TEST_PLAYBOOK.md) ·
[PRISM_ACTIVATION_PLAN.md](PRISM_ACTIVATION_PLAN.md) ·
[POST_PILOT_ARCHITECTURE.md](POST_PILOT_ARCHITECTURE.md) ·
[FUTURE_OPERATIONS_FOUNDATIONS.md](FUTURE_OPERATIONS_FOUNDATIONS.md)

---

# VERDICT: READY WITH KNOWN CONSTRAINTS

Punchout can be taken into a real workday on a real phone. A complete
workday — including main hours — can be recorded, locked, signed, delivered,
durably preserved, inspected afterwards, converted to CSV, and read back
unchanged after a server restart. This was proven against the **real production
build**, not a dev server.

Three constraints are real and are listed in [§9](#9-known-constraints). None of
them blocks the test; all of them are things the founder should know before
standing outside with the phone. The most important:

> **Voice input will not work over plain HTTP.** Browsers block the Web Speech
> API on insecure origins. Text entry works normally. To test voice, use the
> Tailscale HTTPS path in the playbook (§2).

---

## 1. What changed in this mission

Six defects were found and closed. Each was verified by reproduction before the
fix, and each has permanent regression coverage.

| # | Defect | Field consequence if untouched |
|---|---|---|
| 1 | **The server discarded every workday it received.** `/api/export` HMAC-verified the payload and then stored only a receipt — zero references to `.payload` anywhere in `app/api/` or `lib/backend/` | The founder's field test would have produced a receipt and no record. The only copy would be a 90-entry `localStorage` array that empties silently on a parse failure |
| 2 | **Main hours could only be discarded, never confirmed.** Nothing in React could add a wage-code line to the main draft | The founder would have had to knowingly operate around a broken time model, and no locked day would have exported a main-time line |
| 3 | **A failed `localStorage` write silently lost field work.** No retry; the in-memory day ran ahead of disk | A phone hitting a storage limit mid-day would lose everything since the last successful save, with no signal |
| 4 | **`force_skipped` did not block lock**, despite the code comment asserting it must | An ambiguous lock rule going into a field test |
| 5 | **The stale-day warning was factually wrong** — it claimed data "vil gå tapt" when `discardStaleDay()` archives first | Workers frightened away from the correct action by a false claim about their own data |
| 6 | **Lock said nothing about what locking does** — it archives, signs and sends | Every worker except the one who built it committing without being told to what |

Defects 5 and 6 were found by **Prism**, not by inspection. See [§6](#6-prism-result).

---

## 2. Engineering gate

| Check | Result |
|---|---|
| `npm run lint` | **0 errors**, 14 warnings (pre-existing accepted `react-hooks/set-state-in-effect` pattern; one added by the new Relay page, matching the existing `/ops` precedent) |
| `npm run typecheck` | **0 errors** |
| `npm test` (regression suite) | **221 cases, all passed** (117 at mission start) |
| `npm run test:components` (jsdom) | **3 files, 13 tests, all passed** |
| `npm run build` | **succeeds**, with `ignoreBuildErrors` removed |
| `npm run verify` (whole gate, fail-fast) | **exit 0** |

## 3. Full verification matrix

Every suite below was run at the tested commit.

| Suite | Kind | Result |
|---|---|---|
| `lib/regression/run.mjs` | in-process, 221 cases | ✅ all passed |
| `lib/regression/cross-organization.mjs` | 5 organization packages, identical full-day scenario | ✅ all passed |
| `lib/regression/security-audit.mjs` | live HTTP against every admin route | ✅ 9/9 |
| `lib/regression/runtime-provisioning.mjs` | live HTTP, real device → per-org runtime | ✅ 12/12 |
| `lib/regression/relay-delivery-chain.mjs` | live HTTP, **real server restart mid-test** | ✅ 17/17 |
| `lib/regression/browser-verification.mjs` | real Chromium, full workday | ✅ 14/14 |
| `lib/regression/browser-field-readiness.mjs` | real Chromium, **iPhone 13 viewport** | ✅ 23/23 |
| `lib/regression/production-acceptance.mjs` | **real production standalone build** | ✅ 22/22 |
| Prism evaluation (separate repo) | 6 personas × 5 scenarios | ✅ 64 Signals; Prism 230/230 tests |

**Docker:** `docker build` was not executed in this session. The Dockerfile is
unchanged from its last verified state **except** that the build it runs was
broken at mission start and is now fixed — `next build` failed for everyone
because `lib/backend/persistence.mjs` threw during page-data collection. The
Docker path is therefore *more* likely to work than before, but the container
itself is unverified this session. The playbook's Option A (standalone) is the
path that was actually proven.

---

## 4. Locked workday integrity

- The outbound unit is derived from a **successfully locked day only**.
  `lockDay()` has two independent guards — zero unresolved Håndrens items, and
  `mainTimeHandled` — and both must clear.
- **Draft work cannot be delivered as final.** `buildExportPacket()` includes
  only `status === "confirmed"` drafts, and only `confirmed`/`discarded`
  schemas.
- **Locking does not destroy the source.** The day is deep-copied to history
  before the export packet is built.
- **Stable identity.** `exportId` is minted once at lock and stored on the day;
  every retry of that day carries the same id.
- **Lock is terminal and idempotent across process boundaries** — proven by
  `char_refresh_after_lock_stays_locked_and_does_not_re_export`.

## 5. Relay

**Structure.** Two files per export, one immutable, one mutable:

```
relay/<organizationId>/<exportId>.json           the workday — WRITE-ONCE
relay/<organizationId>/<exportId>.delivery.json  delivery state — rewritten per attempt
```

The separation is the guarantee, not a filing convention: retry churn
physically cannot rewrite the operational record. It is not an array inside
`backend-state.json` because that blob is rewritten in full on every
`persistNow()` — including every telemetry batch — which would make each of
those writes rewrite every workday ever recorded.

**Lifecycle** — deterministic, total, and no transition deletes a payload:

```
RECEIVED → READY → DELIVERING → DELIVERED            (terminal, success)
                        ├──────→ FAILED_RETRYABLE → READY
                        └──────→ FAILED_FINAL       (terminal, no data loss)
```

**Verified properties:**

| Property | Evidence |
|---|---|
| Payload preserved in full | `relay_stores_the_full_locked_workday_not_just_a_receipt` |
| Survives server restart | `relay_chain_workday_survives_server_restart_with_same_facts`; `production_acceptance_same_facts_after_restart` (byte-identical payload) |
| Duplicate delivery → one logical record | `relay_duplicate_delivery_does_not_create_a_second_record` |
| Retry never mutates the original | `relay_duplicate_delivery_never_mutates_the_stored_payload` |
| Cross-organization isolation | `relay_isolates_organizations_structurally` — two orgs with the *same* exportId keep separate records |
| Path traversal refused | `relay_rejects_path_traversal_in_ids` |
| Invalid signature never enters | `relay_chain_invalid_signature_never_enters_relay` |
| Crash mid-delivery is recoverable | `relay_reclaims_deliveries_orphaned_by_a_crash` |
| Adapter failure loses nothing | `relay_payload_survives_a_failing_adapter` |
| Permanent rejection loses nothing | `relay_permanent_failure_is_terminal_but_loses_nothing` |

**Inspection.** `/relay` (admin-gated page) and `/api/relay` (list, read one
with full payload, dispatch). The page computes nothing — the moment it starts
calculating it stops being evidence. `/api/health` reports `relay.workdaysHeld`
per organization, so "receipts say N, Relay holds M" is a visible discrepancy.

## 6. Adapter boundary and CSV

**Ownership:** the store owns custody and delivery state; a target owns
translation and downstream communication; the dispatcher owns only transitions.
No target writes state; the store knows nothing about CSV. A payroll or
customer adapter is one registry entry away and touches neither side.

**The CSV target reuses the existing, already-tested `CsvAdapter` translation**
rather than forking it, inheriting the RC1-02 Norwegian-Excel conventions
(UTF-8 BOM, semicolon delimiter) instead of re-deriving them. `CsvAdapter.send()`
is a documented mock, so a real file sink is a different *target* reusing the
same *translation* — precisely the seam the adapter boundary exists to provide.

**Artifact location:**

```
<PUNCHOUT_DATA_DIR>/adapter-output/csv/<organizationId>/<exportId>/
    summary.csv  time_entries.csv  wage_codes.csv
    entries.csv  schemas.csv  machine_hours.csv
    quantities.csv   ← only when quantities were actually recorded
```

**Idempotency semantics — chosen and documented:** output is byte-compared.
Identical content → recognised as an idempotent replay, nothing written.
Absent → written. **Different content → refused**, because an immutable payload
producing different output can only mean the translation logic changed, and
silently overwriting would rewrite delivered history to match new code. Exactly
one logical CSV output per logical export.

## 7. Prism result

Prism ran. Its LLM half did not (no `ANTHROPIC_API_KEY`), which blocks Risk
narratives but **not** the rule engine, severity or the findings themselves —
see [PRISM_ACTIVATION_PLAN.md](PRISM_ACTIVATION_PLAN.md) for the precise
boundary and why this is Signal-level evidence rather than a completed Review.

Six field-worker personas were added to Prism (its shipped `skeptic` and
`professional` both model consumer adoption, the wrong frame for a tool the
worker is *required* to use). Five Punchout flows were authored from the shipped
components. 64 Signals across 30 persona × scenario pairs.

**The finding that mattered most:** TR-01 *(commitment before trust
established)* fired at the irreversible steps for **5 of 6 personas — and not
for the founder profile**, whose high baseline trust clears the threshold on its
own. The person about to run the first field test is the one person who would
not have felt it. That is why the founder persona was modelled explicitly
instead of assumed.

**Also found:** the low-digital-confidence persona was the only profile to cross
its friction/degradation ceiling, and it did so in the *error-states* scenario —
that worker's failure mode is not abandoning the app (they cannot) but quietly
giving up on documenting properly because they believe it has stopped working.

Three fixes followed (defects 5, 6 and an offline reassurance line), each
stating only what the code actually does.

## 8. Mobile emulation result

Real Chromium at iPhone 13 viewport, with deliberately long Norwegian content
including æ/ø/å:

- no horizontal scroll on **any** screen — provision, pre-day, operations,
  Håndrens (including with the wage-code editor open), and `/relay`;
- touch targets ≥ 44 px on every control the main-hours editor introduced,
  and on the lock button;
- zero console errors across a full workday;
- the suggested wage-code line arrives pre-filled from the real day
  (`07:00` → end minus hours already booked on orders).

## 9. Known constraints

**1. Voice requires HTTPS.** Browsers block the Web Speech API on insecure
origins. Over `http://<ip>:3000` the microphone will not work; text entry does.
Resolvable via `tailscale serve` with HTTPS certificates enabled — playbook §2.
`tailscale serve` was **not** run: it changes what this machine exposes on the
tailnet, which is the founder's call, not an assumption to make on their behalf.

**2. Totally unwritable phone storage still loses the tail of a day.** Punchout
now retries and reclaims space first (dropping already-sent exports and old
history, never unsent work), and a later successful write clears the error. But
if *every* write fails — Safari private mode, or a genuinely full disk with
nothing reclaimable — the in-memory day is ahead of storage and a reload loses
the difference. No client-side strategy can write to a disk that refuses every
write. Documented in the playbook's recovery section with what to do.

**3. Two cards for one incident.** A single spoken incident produces both a
`uønsket hendelse` and an `RUH` card in Håndrens, by two unrelated mechanisms
that do not know about each other. Both must be resolved independently. This is
characterized (`char_one_incident_utterance_produces_two_independent_schemas`)
and ranked as debt, not fixed — consolidating two derivation systems is
architecture work, not a field-test blocker.

**Also unresolved, deliberately** (from `FUTURE_OPERATIONS_FOUNDATIONS.md`):
`userId` is device-asserted, not verified by a login — the Relay records
`userIdVerified: false` so no future consumer can mistake it for proven
identity. Production quantities are still never observed; the seam exists and
carries them through to CSV when present, but nothing produces them yet.

## 10. Remaining external-only checks

Everything internally testable is exhausted. These require the physical phone:

- real touch, with gloves;
- the real on-screen keyboard, and whether it covers controls;
- real Safari / Chrome on Android (only Chromium was tested);
- real network transitions — tunnel, dead zone, roaming — rather than emulated
  offline;
- battery, GPS and background-suspension behaviour over a full day;
- whether the flow makes sense to someone standing in the road rather than
  sitting at a desk.

---

# READY FOR FOUNDER FIELD TEST

The next meaningful action is not another test. It is:

> **Open Punchout on the phone and run the playbook.**

**Start command** (full detail in [FIELD_TEST_PLAYBOOK.md](FIELD_TEST_PLAYBOOK.md) §1):

```bash
cd .next/standalone
PUNCHOUT_DATA_DIR="e:/punchout-field-data" \
PUNCHOUT_ADMIN_TOKEN="<velg et langt tilfeldig token>" \
HOSTNAME=0.0.0.0 PORT=3000 node server.js
```

| | |
|---|---|
| **URL on the phone** | `http://100.81.253.30:3000` (Tailscale, no setup — voice unavailable)<br>or `https://desktop-a24a2kv.tailc834b8.ts.net` (after `tailscale serve` — voice works) |
| **Organization** | `mesta` |
| **Provisioning** | publish runtime → register device → `/provision` on the phone (playbook §3) |
| **Credentials** | one admin token you choose, plus a one-time device secret from the register call |
| **Expected first screen** | Start screen: microphone button, text field, **Start dag**, Elrapp/Linx links |
| **Test sequence** | playbook §4, 15 steps |
| **Inspect afterwards** | `/relay` — then generate and open the CSV (playbook §5) |
| **Evidence to return** | playbook §8 |
