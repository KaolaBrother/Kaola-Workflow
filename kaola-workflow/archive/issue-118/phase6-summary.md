# Phase 6 - Summary: issue-118

## Delivered
Added `--forge=gitea` support to `uninstall.sh`: usage string, two-arg error message, case validation, and a new `remove_dir "$HOME/.claude/kaola-workflow-gitea"` block. Fixed `--forge=all` to also remove the Gitea edition directory. Updated README uninstall docs. Added 4 contract assertions to the Gitea validator. Added CHANGELOG entry.

## Files Changed
- `uninstall.sh` — 4 spots patched
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` — 4 assertions added
- `README.md` — 1 line inserted
- `CHANGELOG.md` — 1 bullet added

## Test Coverage
- 4 targeted contract assertions covering all 4 change points in `uninstall.sh`
- Gitea contract validator: passed
- Workflow walkthrough: 6/6 passed
- `bash -n uninstall.sh`: OK

## Final Validation Evidence
- `bash -n uninstall.sh` → OK
- `./uninstall.sh --forge=badforge 2>&1 | grep -q 'gitea'` → OK
- `node plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js` → passed
- `node scripts/simulate-workflow-walkthrough.js` → passed (6/6)
- All evidence from .cache/final-validation (inline)

## Documentation Docking
DOCKED — see .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
(none)

## Follow-Up Items
none

## Closure Decision
none needed — all phase artifacts clean, no deferred items, no open follow-ups, no user decisions required

## Commit And Push
pending final Git gate; final hash reported after push

## GitHub Issue
pending closure (after final commit)

## Roadmap
pending update (after final commit)

## Archive
pending (sink: merge — cmdFinalize will archive)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | — | no deferred items, no user decisions |
| final-validation fix executors | N/A | — | all validations passed |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs in Step 7 |
| archive completed folder | pending | | cmdFinalize in Step 8b |
| final commit and push | ready | git status/diff confirm | final gate runs after this file |

## Status
READY FOR FINAL GIT GATE
