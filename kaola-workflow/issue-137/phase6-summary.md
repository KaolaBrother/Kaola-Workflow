# Phase 6 - Summary: issue-137

## Delivered

Added `assertBranchPushedToUpstream(mainRoot, branch)` guard to the merge sink scripts for all three forge editions (GitHub, GitLab, Gitea). The guard blocks `sink-merge` when the feature branch has unpushed commits ahead of its upstream tracking ref, or when no upstream tracking ref is set. Reports branch name, upstream ref, ahead count, and up to 5 representative commit titles. Skipped when `KAOLA_WORKFLOW_OFFLINE=1`. The Codex plugin copy is byte-identical to the GitHub edition per validate-script-sync.js requirements.

## Files Changed

- `scripts/kaola-workflow-sink-merge.js` — `assertBranchPushedToUpstream` function + call site
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — sync copy (byte-identical)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — identical guard
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — identical guard
- `scripts/simulate-workflow-walkthrough.js` — `initGitRepoWithBareRemote` + two new tests
- `CHANGELOG.md` — [Unreleased] entry
- `docs/api.md` — Merge Sink guard documentation

## Test Coverage

2 new integration tests added:
- `testSinkMergeBlocksUnpushedCommits` — verifies guard blocks (exit non-zero, branch name + "unpushed" in stderr, main unchanged)
- `testSinkMergeOfflineSkipsPublishGuard` — verifies OFFLINE=1 skips guard entirely (exit 0, main advances)

All 8 tests in simulate-workflow-walkthrough.js pass. Full npm test suite passes (all 4 forge editions).

## Final Validation Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `node scripts/simulate-workflow-walkthrough.js` | PASSED | All 8 tests pass including 2 new |
| `npm test` | PASSED | All 4 forge editions pass |

## Documentation Docking

DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger

| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|

(no failures)

## Follow-Up Items

- LOW (from code review): Consider adding `testSinkMergeBlocksNoUpstreamOnline` to exercise the no-upstream-ref block path in online mode

## Closure Decision

Closure scan: no deferred items, no unresolved conflicts, no partial implementation, no user-decision items. The implementation is complete — all three forge editions have the guard, tests cover both primary paths, docs are current.

## Commit And Push

pending final Git gate; final hash is reported after push

## GitHub Issue

KaolaBrother/Kaola-Workflow#137 — ready to close after push

## Roadmap

pending — will delete `.roadmap/issue-137.md` and regenerate `ROADMAP.md` in final commit

## Archive

pending — `cmdFinalize` runs after commit

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan above | No deferred items, conflicts, or user-decision items found |
| final-validation fix executors | N/A | | No final validation failures |
| roadmap refresh | pending | | runs in final commit step |
| archive completed folder | pending | | cmdFinalize runs after commit |
| final commit and push | ready | git status/diff confirmed; npm test passed | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
