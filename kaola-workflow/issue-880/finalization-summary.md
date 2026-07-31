# Finalization — Summary: issue-880

Delete the zero-consumer exports left in the Oracle Kernel after the ADR 0017 build. Closes #880.

## Delivered

`kaola-workflow-adaptive-schema.js` — the ×4 byte-identical Oracle Kernel — drops from **93 distinct
exports to 55**. The ADR 0017 demolition cut the file by roughly 73% but left its export surface as
it stood beforehand; an audit of all 93 measured 21 with no consumer anywhere and a further 18
exported despite only internal use.

Deleted outright: the per-runtime dispatch-model pair, `codexProfilePolicy`, the wait-budget cluster,
`dispatchEffortOpencode`, `modelDisplay`, `LANE_STALENESS_PROVENANCE`, two curated-root helpers,
`deriveSinkProgressFromState`, `isKernelRecordPath`, and the `emit` / `answer` envelope constructors —
plus three internal declarations orphaned by those removals, two duplicate export keys, and four
orphaned comment blocks narrating exports already gone.

Unexported but kept, each with a named internal caller: the tier vocabulary, the claim-identity field
order, four state parsers, the curated-root list, the outcome results, the self-host band and its
detectors, the stale diagnostics, and the release carry-over evaluator.

`mapTier` is deliberately **not** deleted despite having no callers: README, both edition docs and the
generated opencode agent prose all name it as the live tier-mapping mechanism, so removing it would
make shipped documentation lie. Recorded rather than resolved silently; it belongs to the
documentation work in #885.

## Files Changed

Four kernel copies (canonical + three plugin editions), `docs/api.md`, `CHANGELOG.md`, and the run
record. Roughly 290 lines leave each kernel copy.

## Test Coverage

No new tests. The audit established that no deleted or unexported symbol is read by any validator or
test in executable position — every occurrence is a comment or an assertion-message string — so there
were no pins to move and nothing to re-author. Existing coverage that exercises the survivors
(`test-oracle-kernel.js`, `test-kernel-conformance.js`) passes unchanged.

## Validation

All four chains green over a clean tree at the finalize commit, no waivers. Walkthrough green at FULL
scope: 203/203 scenarios, 2,092 spawns. `generate-routing-surfaces.js --check`: 18/18 byte-match.
Export count exactly 55; one sha256 across all four kernel copies.

Verification taken from outside the implementer's report, and one check was added mid-run that the
original brief lacked: every surviving function export — 32 of them — was called and confirmed free of
`ReferenceError`. That check exists because holding `mapTier` back revived `TIER_RANK` as a live
reader, and deleting it would have left a `ReferenceError` inside a function body, which both
`node --check` and `require()` pass straight over. A parse check and a load check do not prove a
module works; only calling it does.

## Changed Paths

Recorded by the finalize transaction.

## Documentation Docking

`docs/api.md` stops describing `emit()` and `answer()` as shared kernel constructors — the envelope is
a shape each script builds, not a library. `CHANGELOG.md` records the trim under `[Unreleased]`,
including `mapTier`'s deliberate survival.

## Run gaps

One planned dispatch was cancelled by measurement rather than performed: the contract-validator pins
were expected to move with the machinery, as they had to in the PR-879 attestation repair. The audit
refuted that for this file. The item is closed with the refutation rather than deleted, because "we
expected a dependency and measurement removed it" is worth more to a successor than silence.

## Follow-Up Items

Filed during this run from a six-agent consistency audit of the four runtimes, none of them in scope
here: #881 (`--tag` does not adopt the release-prep carry-over, so the documented release sequence
dead-ends), #882 (a validator pins the shipped plugin manifests to advertise the retired DAG design),
#883 (guard rearmament — test custody is invertible with eight guards green), #884 (cross-runtime
surface drift, plus a kernel-load-failure diagnostic that reports a load error as a missing file), and
#885 (retired-era prose surviving in installed profiles, the reviewer contract, and operator strings).

Also standing: 20 of the 55 surviving kernel exports have no production consumer — tests and contract
validators are their only readers. Measured, not acted on.

## Status: READY FOR FINAL GIT GATE
