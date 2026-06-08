# Phase 6 - Summary: issue-297

## Delivered
Bug fix: On an adaptive worktree run, `archiveProjectDir` now reconciles the MAIN repo's staged `.roadmap/issue-N.md` ADD orphan at finalize time. The fix gates on `git cat-file -e HEAD:<relpath>` to distinguish staged-ADD-only (fire reconcile) from committed-on-HEAD (skip — normal case, no regression). Mirrored across all four claim ports (root + byte-identical base-plugin + gitlab + gitea edition ports).

## Files Changed
- scripts/kaola-workflow-claim.js — archiveProjectDir MAIN-side reconcile (staged-ADD-only gate)
- plugins/kaola-workflow/scripts/kaola-workflow-claim.js — byte-identical mirror
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js — edition port
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js — edition port
- scripts/simulate-workflow-walkthrough.js — new test (staged-A scenario) + existing test assertion (MAIN status clean)
- CHANGELOG.md — [Unreleased] entry

## Test Coverage
New: testFinalizeFromLinkedWorktreeCleansMainStagedRoadmapSource (staged-ADD-only bug reproduction)
Updated: testFinalizeFromLinkedWorktreeCleansRoadmapEntry (MAIN status clean assertion added)

## Final Validation Evidence
1. --resume-check: PASS (exit 0)
2. --gate-verify: PASS (exit 0)
3. --barrier-check: PASS (exit 0)
4. --verdict-check: PASS (exit 0)
5. node scripts/simulate-workflow-walkthrough.js: PASS (exit 0, sentinel confirmed)
6. npm test: PASS (exit 0, all four editions)
Evidence: kaola-workflow/issue-297/.cache/final-validation.md

## Documentation Docking
DOCKED — no public API/CLI/behavior change; CHANGELOG already updated; all docs verified non-stale.
Evidence: kaola-workflow/issue-297/.cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (code-review barrier per-node) | G1 finding R1 regression | tdd-guide repair | .cache/code-review.md | Resolved |

## Follow-Up Items
None. Code-reviewer finding R1 was resolved within this run (gate gated on cat-file, test asserted both paths).

## Closure Decision
No deferred items, conflicts, or partial implementation. Closure advisor gate: N/A.

## Commit And Push
Pending final Git gate.

## GitHub Issue
#297 — pending close after merge.

## Roadmap
Pending update after cmdFinalize.

## Archive
Pending cmdFinalize.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan — no deferred items | No deferred items found |
| final-validation fix executors | invoked | tdd-guide repair (R1) | |
| roadmap refresh | pending | cmdFinalize Step 8b | |
| archive completed folder | pending | cmdFinalize Step 8b | |
| final commit and push | ready | all validation green | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
