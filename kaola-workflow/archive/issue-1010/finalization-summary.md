# Finalization — Summary: issue-1010

Issue **#1010** — "Codex: restore fixed Luna max standard-tier dispatch".
Branch `workflow/issue-1010`.

## Delivered

- Live Codex next/finalize routing now dispatches every existing standard-tier role with `gpt-5.6-luna` / `max` and every existing reasoning-tier role with `gpt-5.6-sol` / `high`.
- Both canonical routing skeletons and exactly the six generated GitHub, GitLab, and Gitea Codex next/finalize skill surfaces carry the fixed policy with no per-task escalation, downgrade, availability fallback, or alternate pair.
- Role classifications, initialization, role profiles, installers, preflight migration recognition, parent-session configuration, non-Codex runtimes, lifecycle, sink, and release behavior are unchanged.
- Live routing assertions are decoupled from historical Sol/medium stale-profile migration constants in the Codex validator and reachability test.
- README, D-687, changelog, API, architecture, and conventions prose distinguish current live routing from historical #925 and stale-profile behavior. The issue carries both premise corrections discovered by the run.

## Files Changed

16 files, +252 / -116 before finalization artifacts:

- Canonical routing: `templates/routing/next.skeleton.md`, `templates/routing/finalize.skeleton.md`
- Generated routing: six GitHub/GitLab/Gitea Codex next/finalize `SKILL.md` surfaces
- Contracts: `scripts/test-route-reachability.js`, `scripts/validate-kaola-workflow-contracts.js`
- Documentation: `README.md`, `CHANGELOG.md`, `docs/decisions/D-687-01.md`, `docs/api.md`, `docs/architecture.md`, `docs/conventions.md`

## Test Coverage

- Route contract failed against untouched Sol/medium production across all six shipped skills before implementation.
- Adversarial counterexamples drove the alternate-pair guard to 504 assertions; quoted, bare, backticked, reverse-order, shorthand, fallback, duplicate-canonical, and exemption-smuggled pair claims all red, including the superseded Sol/xhigh live route.
- `node scripts/test-route-reachability.js`: 504 assertions passed after the owner revision.
- `node scripts/test-generate-routing-surfaces.js`: 434 assertions passed.
- `node scripts/generate-routing-surfaces.js --check`: all 18 surfaces byte-match.
- `node scripts/simulate-workflow-walkthrough.js`: 186/186 scenarios passed at full unsharded scope.
- `node scripts/validate-kaola-workflow-contracts.js` and final diff/scope checks passed.

## Validation

Four-chain receipt at `kaola-workflow/issue-1010/.cache/chain-receipt.json`, bound exactly to final implementation commit `73ce31d799754b7ee48234ff78099f640543d896` with a clean worktree and code-tree hash `ef5d714bbb5771803038ece64e6ff646f42420d3714c89ce48e4e00b14ce2038`.

| chain | exit | timed out | waived |
|---|---:|---|---|
| claude | 0 | false | false |
| codex | 0 | false | false |
| gitlab | 0 | false | false |
| gitea | 0 | false | false |

All four chains are green with no waiver on the owner-revised Luna/max and Sol/high candidate.

## Changed Paths

The finalize transaction records the authoritative path list here. Before it runs, the authored set is the 16 files listed under Files Changed and contains no unrelated path.

## Mission List

Ten items, all `done`, at `kaola-workflow/issue-1010/mission-list.md`. The run recorded the stale validator coupling, adversarial guard counterexamples, the owner-revised Sol/high pair, their custody fixes, and final validation results.

## Documentation Docking

`DOCKED` — evidence at `.cache/doc-updater.md` and `.cache/doc-docking.md`. No API signature, schema, CLI, configuration, environment, setup, role classification, initialization, installer, preflight, non-Codex runtime, or workflow-state behavior changed.

## Run gaps

- none

## Follow-Up Items

- None. Every run-discovered defect was corrected within #1010.

## Status: ARCHIVED AFTER FINAL GIT GATE

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1010/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1010/.cache/dispatch-log.jsonl
- kaola-workflow/archive/issue-1010/.cache/doc-docking.md
- kaola-workflow/archive/issue-1010/.cache/doc-updater.md
- kaola-workflow/archive/issue-1010/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1010/.cache/run-gaps.json
- kaola-workflow/archive/issue-1010/finalization-summary.md
- kaola-workflow/archive/issue-1010/mission-list.md
- kaola-workflow/archive/issue-1010/workflow-state.md
