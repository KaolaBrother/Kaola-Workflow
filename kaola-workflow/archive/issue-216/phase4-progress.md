# Phase 4 - Progress: issue-216

## Operational Guardrails

Phase 4 is subagent-executed.

Main session may:
- inspect diffs
- run small targeted validation commands
- delegate expensive or noisy validation
- classify failures
- update progress/evidence files
- delegate follow-up fixes
- apply the Trivial Inline Edit Exception

Main session must not:
- write implementation fixes inline except under the Trivial Inline Edit Exception
- write or rewrite tests inline except under the Trivial Inline Edit Exception
- mark a task complete while validation fails

Failure routing:
- behavior/test failure -> tdd-guide
- build/type/lint/tooling failure -> build-error-resolver
- scope/write-set violation -> stop or escalate
- emergency inline fallback -> only with explicit user authorization

## Tasks
| # | Name | Status | Files Modified | Notes |
|---|------|--------|----------------|-------|
| 1 | Write failing regression test (RED gate) | complete | scripts/simulate-workflow-walkthrough.js | RED confirmed on phantom-folder assertion |
| 2 | Root source guard (single pre-reset guard) | complete | scripts/kaola-workflow-sink-merge.js | GREEN; Layer 1 removed (fires on normal flows); single guard before reset; see deviations |
| 3 | Codex byte-identical copy | complete | plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js | SHA 607d4d97ae300c6f873272acd051ca0e1591b11d — byte-identical to root |

## Build Status
GREEN — all 3 tasks complete; full walkthrough passes (exit 0)

## Failure Routing Ledger
| Task | Failing Command | Classification | Routed To | Evidence | Status |
|------|-----------------|----------------|-----------|----------|--------|

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide executor task 1 | invoked | .cache/tdd-task-1.md | |
| tdd-guide executor task 2 | invoked | .cache/tdd-task-2.md | |
| tdd-guide executor task 3 | invoked | .cache/tdd-task-3.md | |

## Deviations from Phase 3 Plan

### Task 2 deviation: single pre-reset guard replaces two-layer fix

**Originally planned:** Layer 1 early-exit in `main()` (post-checkout) + Layer 2 guard in `postMergeCleanup` (post-reset).

**What shipped:** Single guard in `postMergeCleanup` catch, placed BEFORE `git reset --hard origin/main`.

**Why Layer 1 was not viable:** After `git checkout feature-branch`, the archive is already on disk for EVERY normal finalize→sink-merge (archiveProjectDir does `fs.renameSync`, so live is gone and archive is present before sink-merge starts). `!exists(live) && exists(archive)` = true on ALL normal flows — Layer 1 would fire unconditionally, breaking `testE2EGitHubMergeFullChain`.

**Why pre-reset position IS operative:** The catch block only runs on push failure — structurally isolated from the success path. At the catch, local main has the archive (from ffMergeLoop FF-merge). Forge's post-reset guard (GitLab lines 241–246) is not operative — reset wipes tracked archive before it runs. Root's pre-reset guard fires before the wipe.

**Why forge's pre-checkout Layer 1 doesn't apply to root:** Forge's Layer 1 runs on the main branch before checkout, where archive may be present from a prior session's finalize. Root can't reuse that position because root's `main()` structure is flat (no `runDirectMerge` wrapper), and the scenario requires the FF-merge to have happened first.

**Test scoping:** Test covers committed-archive (keep-worktree finalize) path. Standard-finalize (untracked-archive) path: archive is also absent from `exists(live)` side (renamed by `fs.renameSync` before sink-merge), so guard also fires. Both paths are covered functionally; the test exercises only the committed-archive variant.

## Last Updated
2026-06-02T07:00:00.000Z
