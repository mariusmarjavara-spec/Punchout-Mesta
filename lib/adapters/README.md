# Adapter Platform

Punchout's motor produces exactly one deterministic truth per work day. This directory
translates that truth (`ExportEnvelope`) into whatever shape each receiver system needs — the
motor never knows any of these receivers exist.

## The pipeline

```
DayLog (motor output)
  -> buildExportEnvelope()      envelope.mjs
  -> Adapter.validate()         adapter.mjs (runAdapter orchestrates all 4 stages)
  -> Adapter.transform()
  -> Adapter.send()             mocked in every adapter here — no real network call
  -> Adapter.handleResponse()
  -> AdapterResult { ok, stage, exportId, response|error }
```

`runAdapter()` never throws — every failure, at any stage, comes back as a structured
`{ok:false, stage, error}`. `runAdapters()` fans the *same* envelope out to N adapters
concurrently (deep-frozen first, so no adapter can affect another's view of it).

## Reference adapter: Landax

[`landax-adapter.mjs`](./landax-adapter.mjs) is the adapter to copy. Its field mapping is
**illustrative only** — no real Landax API contract was available to target — but its
structure (validate/transform/send/handleResponse, mocked network call, structured
`ValidationError[]`) is the real, recommended pattern.

Two more adapters exist purely to prove the pipeline generalizes beyond one example, without
fabricating contracts for named products we don't have real integrations with:
[`csv-adapter.mjs`](./csv-adapter.mjs) (real row/escaping logic, partial capabilities) and
[`json-adapter.mjs`](./json-adapter.mjs) (the "identity baseline" every data-loss check trusts).
[`dummy-adapter.mjs`](./dummy-adapter.mjs) is the minimal valid adapter and the deliberate
negative case (declares zero capabilities, drops content on purpose — see below).

## Capability model

An adapter declares which parts of `ExportEnvelope` it can carry: `entries`, `schemas`,
`timeEntries`, `machineHours` (see [`capability.mjs`](./capability.mjs) — this is a 1:1 mirror
of the envelope's own array fields, nothing more). `uncoveredCapabilities()` tells you when an
envelope carries data for something the adapter never promised to handle — that's expected for
`DummyAdapter`, and a real bug for anything that claims a capability but doesn't honor it.

Note: `lib/runtime/types.mjs` has an unrelated, older "Capability" concept
(`CapabilityProvider`/`CapabilityBinding` — "who fulfills SJA internally?"). Deliberately not
the same thing; named `AdapterCapability` here to keep the two apart.

GPS / photos / signatures are **not** in the capability vocabulary: `DayLog`
(`hooks/use-motor-state.ts`) has no field for any of them today. Add a capability only once the
(frozen) motor actually produces that data.

## Registry

[`registry.mjs`](./registry.mjs) is the only place that knows every adapter's name. Nothing
else branches on adapter identity — `getAdapter(name)` / `listAdapters()` only.

## Writing a new adapter

1. Copy `landax-adapter.mjs` as a starting point, or write the four functions from scratch
   (`validate`, `transform`, `send`, `handleResponse` — see `adapter.mjs`'s `Adapter` typedef).
2. Use [`validation-helpers.mjs`](./validation-helpers.mjs)'s `requireFields()` and
   `checkSchemaVersion()` in `validate()` — don't hand-roll field checks; a prior gap where 3 of
   4 adapters silently accepted any `schemaVersion` was found and fixed exactly because two
   adapters had diverged here.
3. Register it with [`define-adapter.mjs`](./define-adapter.mjs)'s `defineAdapter(descriptor)`
   instead of calling `registerAdapter()` directly — it checks the descriptor is complete and
   gives you an immediate error instead of a confusing failure three stages into the pipeline.
4. Test it against [`fixtures.mjs`](./fixtures.mjs)'s `SAMPLE_DAY_LOG` /`EMPTY_DAY_LOG` /
   `buildLargeDayLog(n)` — the same fixtures the Golden/Contract/Failure suites use, so your
   adapter is covered by all three automatically the moment it's registered (nothing to wire up
   by hand).

No base class, no inheritance — an `Adapter` is a plain object.

## Running it locally

```
node lib/adapters/dry-run.mjs              # full trace against every registered adapter, human-readable
node lib/regression/adapter-performance.mjs # 100/500/1000-package timing per adapter
npm test                                    # includes Golden + Contract + Failure suites (lib/regression/adapter-*.mjs)
node lib/regression/cross-organization.mjs  # full-day scenario, all 4 organizations, through the registry
```
