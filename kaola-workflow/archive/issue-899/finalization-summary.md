# Finalization — Summary: issue-899

Closes #899. Branch `workflow/issue-899`, implementation commit `b89f8c01`.

## Delivered

**#899's premise HELD, unlike its two predecessors — and it was settled by construction, not argument.**
`assertBranchHasNonWorkflowChanges` reports `no_implementation_changes` when a branch's entire diff
versus the mainline is `kaola-workflow/**` bookkeeping. It lives in the legacy precondition block,
which `--sink` returns before reaching. The call-site fact was already known; what was not known — and
what #896 proved you cannot assume either way — is whether anything downstream substitutes for it.

Measured on a scratch clone with its own bare remote and a `gh` mock:

| leg | result |
|---|---|
| legacy, implementation-free, online | exit 1, `report`, `no_implementation_changes`, nothing merged or pushed, issue open |
| `--sink`, same fixture | exit 0, `sinked`, local **and remote** mainline advanced, **issue closed** |
| `--sink`, live-folder shape | identical — not an artifact of one fixture layout |
| legacy, one real file added | guard correctly returns no finding (specificity) |
| legacy, implementation-free, offline | merges — the guard is skipped under `KAOLA_WORKFLOW_OFFLINE=1` |

The decisive observation: the predicate, evaluated in-process against the very tree `--sink` published,
**did** return `no_implementation_changes`. The guard is never consulted on that path rather than being
satisfied by it.

**No guard was added, by owner ruling, and that is the point rather than a compromise.** The
orchestrator owns whether the branch ends up right and knows whether its own run produced work; a gate
here would be machinery for something judgement already covers. Under derive-additively the observed
surprise demanded the smallest thing that removes it — wording.

The `sink-reports-orchestrator-owns` section of `templates/routing/finalize.skeleton.md` now states
that the sink does not check the branch carries implementation, that `--sink` will merge, push and
close a bookkeeping-only branch, that **silence there is not a clearance**, and that the confirmation
belongs *before* the sink because afterwards the mainline is published and the issue closed. It was
placed immediately after "Reporting is not merging anyway" — the paragraph whose promise the gap
breaks. No provenance in the prose, per the agent-facing rule.

## Files Changed

9 files in `b89f8c01`: `templates/routing/finalize.skeleton.md` plus its 6 rendered surfaces (root
`commands/`, command+skill under the gitea and gitlab plugins, and the github plugin SKILL),
`docs/api.md`, and `CHANGELOG.md`. `--write` rendered 18 surfaces; `--check` reports all 18
byte-matching. The opencode and kimi editions render from the same registry at install time, so the
wording reaches all four runtimes with no separate edit.

`docs/api.md` additionally stops treating the two legacy-only guards as equivalent. One absence is
correct by design — `SINK_STEPS` carries its own `finalize` step, so on `--sink` the sink *is* the
finalizer. The other is a real behavioural difference. Conflating them was my own text from earlier
today, and it would have taught the next reader the wrong thing.

## Test Coverage

None added, and none is owed. No behaviour changed: this run edits prose and regenerates surfaces from
it. The generated surfaces are defended by `generate-routing-surfaces.js --check`, which runs in every
chain and reports the surface count.

## Validation

## Changed Paths

## Documentation Docking

**DOCKED.** `CHANGELOG.md` carries the entry. `docs/api.md` is corrected as above. `README.md` — no
impact, the command surface is unchanged. `docs/architecture.md` — no impact, no module or boundary
moved. `docs/conventions.md` — no impact; the rule this states belongs to the finalize prose and now
has exactly one wording there.

Both `docs/api.md` and `CHANGELOG.md` are in `SELF_HOST_TEST_CONSUMED`, so all prose was written
**before** the chain run rather than after — otherwise the receipt would have been stale on arrival.

## Run gaps

- manual:vacuous-control-from-inherited-env (the first three rounds of this investigation reused the test suite's fixture builders and inherited KAOLA_WORKFLOW_OFFLINE): noise: an investigation-method failure, not a repo defect — but the sharpest thing this run learned, and recorded in memory rather than as an issue. Reusing a suite's fixture builders can silently disable the very guard under test, and the experiment then looks conclusive while proving nothing. Only a positive control exposed it.
- manual:subagent-died-without-report (the investigator went idle twice without writing its promised report file): noise: environment, not repo. Five rounds of usable data were already on disk and were read directly; the mission-list locator is what made that recovery possible, which is the discipline working as designed.
- manual:third-legacy-only-guard (assertBranchPushedToUpstream is legacy-path-only as well): noise: its absence on --sink is benign by inspection rather than by construction — SINK_STEPS carries push_upstream as its own step, so the sink performs the push the guard exists to demand. Recorded as not-constructed rather than claimed unreachable.

## Follow-Up Items

None. #878 remains open and unscheduled by design — reference only.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-899/.cache/chain-receipt.json
- kaola-workflow/archive/issue-899/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-899/.cache/run-gaps-manual.md
- kaola-workflow/archive/issue-899/.cache/run-gaps.json
- kaola-workflow/archive/issue-899/finalization-summary.md
- kaola-workflow/archive/issue-899/mission-list.md
- kaola-workflow/archive/issue-899/workflow-state.md
