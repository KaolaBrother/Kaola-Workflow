# Phase 6 - Summary: issue-81

## Delivered
Resolved startup contract conflict: `cmdStartup` (and its plugin mirror) no longer auto-selects when exactly one active folder is present. All no-target calls return `verdict: no_target` (exit 1). Shape parity bug fixed: `worktree_path` now surfaced at top level for explicit-target `owned` paths. Four regression tests added. Four command/skill doc files updated with agent-side sole-active resume instruction and bash one-liner.

## Files Changed
- `scripts/kaola-workflow-claim.js` — remove sole-active branch; add worktree_path hoist
- `scripts/simulate-workflow-walkthrough.js` — four new regression tests (T1-T4)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — plugin mirror sync
- `commands/workflow-next.md` — step 5 rewritten
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md` — step 5 rewritten
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — step 5 rewritten
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md` — step 5 rewritten
- `CHANGELOG.md` — [Unreleased] entry added
- `README.md` — sole-active no-target contract clarified

## Test Coverage
No formal coverage tool. Four targeted regression tests cover: zero-active no-target, one-active no-target, multi-active no-target, and sole-active round-trip (status → derive → startup → owned + worktree_path).

## Final Validation Evidence
- Command: `node scripts/simulate-workflow-walkthrough.js`
- Result: PASSED — exit 0, "Workflow walkthrough simulation passed"
- Evidence: .cache/final-validation.md

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| none | | | | |

## Follow-Up Items
none

## Closure Decision
None needed — no deferred items, unresolved conflicts, partial work, or user-decision items found in any phase artifact. "CLAUDE.md optional affirmation" (from advisor-plan.md) was resolved by README.md + CHANGELOG.md updates; CLAUDE.md lines 21-22 confirmed correct as-is.

## Commit And Push
pending final Git gate

## GitHub Issue
81 — to be closed after commit

## Roadmap
pending regeneration

## Archive
pending — sink: merge

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan — no deferred items or user decisions found | |
| final-validation fix executors | N/A | | zero final validation failures |
| roadmap refresh | pending | | runs in Step 7 |
| archive completed folder | pending | | runs in Step 8b |
| final commit and push | ready | git status confirms clean baseline + 9 modified files | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
