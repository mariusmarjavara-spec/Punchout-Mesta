# Guided Forms — SJA and RUH

**Status:** CURRENT · **Date:** 2026-08-20

**Verdict: `GUIDED FORMS READY FOR PHYSICAL RE-TEST`.**

Both SJA and RUH are reachable through the real worker path and proven end to
end on a phone-sized real browser. The three in-repo blockers that produced the
earlier NOT READY are closed, and both non-blockers with them.

The gate is the reachable worker flow, not the engine tests: 19 guided SJA
checks inside `browser-field-readiness.mjs` (44 total) and 17 in
`browser-guided-ruh.mjs`, each starting from provisioning and ending at a
confirmed schema. This is `CODE-VERIFIED`, `TEST-VERIFIED` and
`BROWSER-VERIFIED`. It is not `PHYSICAL-DEVICE-VERIFIED` or
`REAL-WORKDAY-VERIFIED`. What remains unproven is what a browser cannot prove
— real touch, real keyboards, real Safari, real weather. That is what the
physical re-test is for.

---

## The product rule

> Prompten spør etter meningen. Hintet hjelper brukeren å huske detaljene.
> Punchout bygger skjemaet.

> Ikke spør arbeideren om informasjon Punchout allerede kan vite sikkert.

Workers should not fill out forms. They should answer meaningful questions, and
Punchout should construct the form behind them.

## Old interaction versus new

| | Old | New |
|---|---|---|
| Shape | Whole schema as a field grid in an overlay | One prompt per screen |
| Prefill | `sja_preday` created at day start with `sted: null`, never back-filled | Context reused; inference shown as *Punchout oppfattet …* |
| Judgement | Empty fields in the same grid as factual ones | Separate step, no accept shortcut, suggestions unselected |
| Narrative | No narrative field ahead of structure | RUH opens with *Hva har skjedd?* and derives structure after |
| Resume | Overlay id persisted; no progress | Step index, answers and follow-up queue persisted in `dayLog` |

## Architecture

Three pure modules and one boundary. The engine owns progression, which is why
a refresh cannot lose a form and why voice and text cannot diverge.

- `lib/guided-forms/model.mjs` — information classes, provenance, adaptive
  hints, follow-up evaluation, prefill resolution.
- `lib/guided-forms/flows.mjs` — SJA and RUH **as data**. Deliberately not a
  form builder: the abstraction exists so two flows share an engine.
- `lib/guided-forms/engine.mjs` — the state machine. Plain JSON in, plain JSON
  out.
- `public/motor.js` — `buildGuidedFormContext()`, `getGuidedFormState()`,
  `setGuidedFormState()`, `applyGuidedFormToSchema()`.
- `components/punchout/guided-form.tsx` — renders a projection, owns no
  progression.

## Information classes

| Class | Rule | Fields |
|---|---|---|
| **A — system-known** | Reused silently, shown once in review | date, time, organisation, user, order |
| **B — inferred** | Proposed as *Punchout oppfattet …*, `INFERRED_UNCONFIRMED` until accepted | location, activity, machine, work-warning plan, crew |
| **C — judgement** | Never prefilled. Suggestions only, explicitly selected | risiko, konsekvens, årsak, tiltak, umiddelbare tiltak, godkjent |

`NEVER_AUTO_FILL` gained **risiko** and **godkjent** during this work. Nothing
filled them, but the boundary was being enforced by the absence of code, and
this feature adds prefill code for the first time.

## Provenance

Every stored value carries where it came from: `SYSTEM`,
`INFERRED_UNCONFIRMED`, `INFERRED_CONFIRMED`, `WORKER`, `SUGGESTION_ACCEPTED`.

Two distinctions do real work. An inference the worker has **not seen** is a
proposal and never reaches a schema. And a risk the worker **agreed to** is a
different fact from a risk the worker **thought of** — a reviewer must be able
to tell them apart. Descriptive only; nothing scores anyone.

## Prefill sources

All from domain state — `dayLog` entries, confirmed schemas, the compiled
Runtime. **Never scraped from rendered UI.** Confirmed schema values outrank
extraction, so a correction is not undone by re-proposing what was corrected.

`Arbeidsvarsling 24-184` is carried as its own context key. The SJA field of
that name is an enum for the warning **type** (`ingen/enkel/manuell/full`);
forcing a plan number into it would corrupt a schema contract that adapters and
export depend on. **Surfacing it in the SJA needs a new optional field** — see
blockers.

## Adaptive hints and follow-ups

A cue disappears once its fact is known: with the road in context, RUH no
longer asks *Hvor var du?*. Asking anyway tells the worker Punchout is not
paying attention, which costs trust in every other prefill.

Follow-ups are targeted. `"Traff autovernet."` raises both *Var noen andre
involvert?* and *Ble noe skadet?*; the richer narrative naming no injuries and a
dented guardrail raises neither. Follow-ups stay out of the progress
denominator — a bar that grows while someone adds detail reads as punishment for
being thorough.

## Verification

**290 regression cases** (from 264) and **23 component tests** (from 13). Every
guarantee was falsified by reverting it:

| Reverted | Tests that failed |
|---|---|
| Judgement-prefill refusal | 1 |
| Context from domain state | 2 |
| Second `NEVER_AUTO_FILL` check on schema write | 1 |
| Hint-cue dropping | 1 |
| Prefill shown as agreement | 1 |
| Persistence on transition | 1 |

**A weakness found and fixed.** The first two safety tests passed *vacuously*:
no judgement step declares a prefill source, so `resolvePrefill` returned null
at its first guard and the judgement rule was never reached — reverting that
rule left every test green. The guard is now tested directly against a
constructed step that does ask for a judgement prefill, because flows are data
anyone can edit and the rule must hold against a bad flow.

## How it is reached

**SJA** — pre-day screen, the SJA card, *Fyll ut*.

**RUH** — a Hendelse entry creates the RUH draft, then end of day, håndrens,
*Behandle*, *Rediger RUH-felt*.

That RUH path was found by testing rather than assumed. A first attempt added
an inline *"Vil du registrere dette som RUH?"* prompt after logging an incident,
on the theory that `pendingRuhQuestion` simply had no React renderer. It does
have no React renderer — but the reason is deliberate, and stated in motor.js:
in React mode inline blocking is removed and decisions are deferred to
end-of-day. A Hendelse creates the draft directly. The prompt was reverted; it
would have duplicated a decision the app has purposely moved off the worker's
critical path.

## Mobile acceptance

`browser-field-readiness.mjs`, 44 checks, iPhone 13 viewport, real Chromium:

| Proven | |
|---|---|
| One prompt, not a form | later prompts absent from the DOM |
| Reuse | *Punchout oppfattet: Grøfterensk*, then RV92 km 14–18, then plan 24-184 |
| Judgement boundary | zero *Stemmer* buttons on the risk step; zero pre-selected suggestions |
| Touch targets | accept button ≥ 44px |
| No horizontal scroll | at every step and at review |
| Interruption | reload mid-flow returns to the same step index |
| Resume | reload lands back **inside** the form, not on the schema list |
| Review | authored, *Punchout fylte ut* and *Registrert automatisk* kept apart |
| Confirmation | explicit *Bekreft SJA* |
| What landed | `sted` and `arbeidsvarslingsplan` in the schema, with origins |

`browser-guided-ruh.mjs`, 17 checks, same viewport, its own script:

Reachability from håndrens · narrative prompt first · hint cues dropped ·
follow-up raised on a thin narrative · *Ingen tiltak var nødvendig* reachable ·
explicit *Bekreft RUH* · worker's words stored with `WORKER` origin · zero
console errors.

It is a separate script on purpose. Logging a Hendelse adds an unresolved item,
which shifted the håndrens indices `browser-field-readiness.mjs` depends on.
Putting RUH there would have meant changing an existing gate's expectations to
accommodate a new feature. Two scripts, two independent pieces of evidence,
neither weakened.

## Prism findings

Prism's deterministic rule engine over both guided flows, all six personas plus
skeptic and professional. No LLM: no `ANTHROPIC_API_KEY` is configured, so this
is **Signal-level evidence, not a completed Prism Review** — the same boundary
the earlier Punchout evaluation recorded.

**Severity ceiling came back `low` for every signal on both flows. No P0 or P1.**

The pattern that did emerge is the one the mission named. `Trust | strong` for
the low-digital-confidence, documentation-conscious and supervisor personas, and
for the skeptic, on guided SJA. `Navigation | strong` almost everywhere — a
guided flow is more screens than a form. `Recovery | strong` for the low-digital
and distracted personas.

**Acted on:** the prefill panel said WHAT Punchout inferred and never WHERE
FROM, so agreeing to it was an act of faith. It now reads *"Punchout oppfattet
fra det du skrev tidligere i dag"*. Naming the source turns "trust this" into
"check this" — the difference between a prefill a worker signs and one a worker
verifies.

**Not acted on:** the Navigation signals. A guided flow legitimately has more
screens than a form, the ceiling is low, and collapsing steps to reduce the
count would undo the thing the flow exists to do. Recorded rather than fixed.

## Non-blockers, closed

**Work-warning plan.** `arbeidsvarslingsplan` is now its own optional string
field on `sja_preday`, beside the `arbeidsvarsling` enum rather than inside it.
Writing `24-184` into a field declared as `ingen|enkel|manuell|full` would have
produced a value outside its own declared options, which every adapter and the
export contract treat as valid by declaration.

**Provenance through the chain.** `buildExportPacket` picks schema keys
explicitly and was dropping `fieldProvenance`; it now carries it, and
`relay-delivery-chain.mjs` asserts `WORKER`, `INFERRED_CONFIRMED` and
`SUGGESTION_ACCEPTED` all arrive at the Relay intact.

That second one produced the session's most useful lesson, twice over. The relay
assertion alone could not catch the bug: that script posts a hand-built packet
straight to `/api/export`, so motor's export mapper is never exercised there —
reverting the mapper left it green. A second case now drives `buildExportPacket`
directly. This is the same vacuous-test class as the judgement-guard tests
earlier, and both were found only by reverting the guard and watching what
stayed green.

## Known limitations

- The founder previously observed real Android failures on an earlier build.
  This document does not erase that history; it states only that the current
  code is ready to be re-tested on the phone.
- Chromium's iPhone emulation is not a phone. Real touch, real keyboards, real
  Safari and real network transitions remain unverified.
- Prism evidence is Signal-level, not a completed Review.
- Start/active voice still uses the older auto-stop session model in
  `public/motor.js`. Explicit worker-controlled finish is not part of this
  verified unit and remains a separate P1 follow-up.
- The guided flow covers SJA and RUH. `kjoretoyssjekk` and every other schema
  type still open the generic field editor, which is unchanged.
- `fieldProvenance` is null for anything completed through that editor. Honest:
  that path records no origin.

## Not built, deliberately

No AI safety advisor, no automatic cause determination, no form-builder
platform, no motor.js rewrite. The abstraction supports exactly SJA and RUH.
