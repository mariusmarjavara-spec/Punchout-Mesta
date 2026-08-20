# Guided Forms — SJA and RUH

**Status:** CURRENT · **Date:** 2026-08-20 · **Commits:** `2ea428f`, `173e229`

**Verdict: `GUIDED FORMS NOT READY` for physical field test.** The domain core
and the mobile surface are built, tested and falsified. Three blockers remain,
listed at the end. None of them is a design question.

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

## Blockers

1. **Not mounted.** `GuidedForm` is not yet wired into the day flow, so no
   worker can reach it. `start-day-phase.tsx` still opens the old schema-edit
   overlay. This is the blocker that makes the verdict NOT READY.
2. **No real-browser mobile pass.** `browser-field-readiness.mjs` does not yet
   cover the guided flow: prefill acceptance, editing a prefill, risk
   accept/remove/add, back navigation, interruption/resume, refresh, review,
   confirmation, export persistence.
3. **No Prism run.** The six personas have not been simulated against this
   flow. Confirmation fatigue and commitment-before-trust are the specific
   risks worth testing, and neither is measurable from unit tests.

Two smaller items, neither blocking: the work-warning plan needs an optional
SJA field to be visible in the form rather than only in context, and export
provenance (`schema.fieldProvenance`) is written but not yet asserted to
survive lock → sign → Relay → adapter.

## Not built, deliberately

No AI safety advisor, no automatic cause determination, no form-builder
platform, no motor.js rewrite. The abstraction supports exactly SJA and RUH.
