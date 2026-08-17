# Prism Activation — Current State and Remaining Work

**Written:** 2026-08-17, during Operation Punchout Field Trial.
**Verdict:** **Prism ran, and produced real findings.** No activation project is
required before the Punchout field test.

This document exists anyway, because half of Prism did *not* run, and the
boundary between the half that did and the half that did not is worth recording
precisely rather than discovering again next time.

---

## 1. What was attempted

Punchout was evaluated as a real product under Prism, not smoke-tested:

- six field-worker personas authored and registered
  (`src/domain/profiles/field-worker.ts`);
- five Punchout flows hand-authored as `ProductStep[]`
  (`tests/punchout/punchout-field-flows.ts`), read off the shipped React
  components rather than off documentation;
- the deterministic pipeline run across all 30 persona × scenario pairs
  (`tests/punchout/punchout-field-evaluation.test.ts`).

Result: **64 Signals**, traceable to specific rules and specific steps, plus
friction/degradation tracking per persona.

Findings were acted on in Punchout the same session — see commit
"Apply Prism UX findings: trust signals at commitment points".

## 2. What worked, and why it worked

```
ProductStep[]  ->  applyRulesForStep  ->  detectSignals  ->  determineSeverityCeiling
```

Every stage is deterministic and LLM-free. `INPUT_ARCHITECTURE.md` claims
exactly this — that the engine is coupled to `ProductStep[]`, not to the LLM
decomposer that happens to be its only shipped adapter. **That claim held.**
This is the second empirical demonstration of it (the first being the CanonWard
run recorded in `PROJECT_STATUS.md`), and the first against a different product
*and* a different adapter class.

The adapter used was "Human editor (direct `ProductStep[]` authoring)", already
recognised in `INPUT_ARCHITECTURE.md`'s adapter table, `MeasurementClass:
estimated`. The only gate it had to pass was `ProductStepSchema.parse()`, which
is exactly what the contract says. No engine change was needed. No new canonical
object was introduced.

**One correction made during the work:** the fixtures were initially typed as
`ProductStep` (the schema's *output* type, where every optional field is
required). They are now typed as `z.input<typeof ProductStepSchema>` and parsed
in the runner — which is what the adapter contract actually prescribes, and
which lets a fixture omit fields that have declared defaults.

## 3. What did not run

**The LLM half.** No `ANTHROPIC_API_KEY` is configured in this environment.
That blocks:

| Stage | Blocked | Consequence |
|---|---|---|
| `decompose()` | yes | Cannot turn prose product descriptions into `ProductStep[]`. Irrelevant here — the human-editor adapter bypasses it by design. |
| `generateEvidenceForStep()` narrative | yes | Evidence has no `observation`/`reasoning` prose. The rule-derived structural fields are all present. |
| `aggregateRisks()` narrative | yes | **No `Risk` objects exist**, so no what/why/where/fixSuggestion. |
| Severity | **no** | `determineSeverityCeiling()` is algorithmic and ran normally. |
| Confidence state | **no** | `deriveConfidenceState()` is algorithmic. Not reported here only because it consumes Risks. |

### Why this is stated so carefully

Because the difference matters for how much weight the findings carry. What was
produced is **Signal-level evidence**, not a completed Prism Review. There is no
`Risk`, no Human Decision, and no `ObservedOutcome` — so this run does **not**
advance Prism's own "0 of 100 validated Reviews" counter, and should not be
recorded as if it did. Calling it a Review would overstate it in exactly the way
`PROJECT_STATUS.md` is careful not to.

## 4. Root cause of the blocked half

Not a defect. A missing credential.

`src/lib/llm-client.ts` requires `ANTHROPIC_API_KEY`. `INPUT_ARCHITECTURE.md`
already names this as "the current operational blocker" and was written
specifically to establish that it does not block the engine. It doesn't.

## 5. To activate the remaining half

Small, and not required before the field test:

1. Set `ANTHROPIC_API_KEY` in Prism's environment.
2. Run the existing `/api/analyze` route against the Punchout fixture to
   produce Risks and narratives from the Signals already generated.
3. Record a Human Decision on at least one Risk (the `PATCH
   /api/reviews/[id]/risks/[riskId]` surface already exists and is tested).
4. That would make it Prism's **first completed Review** — a genuine milestone
   for Prism, tracked in `PROJECT_STATUS.md`, and independent of Punchout.

**Estimated effort:** under an hour, assuming the key. **Risk:** low. **Do it
before the field test?** No. The findings that changed Punchout came from the
deterministic half; the narratives would restate them in prose.

## 6. Gaps worth recording for Prism itself

Observations from being Prism's second real user, offered as input to Prism's
own roadmap rather than as work items for Punchout:

1. **The shipped profiles encode a consumer-adoption frame.** `skeptic` and
   `professional` both model someone deciding whether to trust and buy. For a
   tool the user is *required* to use, trust is about whether the work was
   recorded, and excess friction produces degraded compliance rather than
   churn. The six field profiles added here are the first non-consumer set;
   `03_PERSONA_LIBRARY.md` may want to name that axis explicitly.

2. **`ProductStage` is a funnel.** `discovery → registration → trial →
   commitment → post-commitment` does not fit an operational tool. A mapping
   was chosen and documented in the fixture, but it is an approximation, and
   another evaluator would likely choose differently — which weakens
   cross-product comparability.

3. **No rule models "did the user believe it was saved?"** Prism's rule set is
   strong on trust-before-commitment, choice overload and dead ends. The
   dominant failure mode for field tools — *the worker cannot tell whether
   their work persisted* — has no rule, and had to be reasoned about outside
   the engine. This is the single most valuable rule Prism could add for this
   product category.

4. **Severity saturates low without Risk aggregation.** All 64 Signals landed
   at `low`, because `determineSeverityCeiling()` needs evidence counts and
   quality scores that the LLM evidence stage would raise. Signal *strength*
   (`strong`/`weak`) and `isAtCommitmentPoint` carried the discrimination
   instead. Worth knowing before reading a deterministic-only run's severities
   as meaningful.

## 7. Verification

Prism after these additions: **230 tests passing** (was 227), `tsc --noEmit`
clean, `eslint src --max-warnings 0` clean. Nothing in Prism's existing engine,
domain or app code was modified — the changes are two new profile files, one new
fixture, and one new test.
