# Phase 6 - Summary: issue-147

## Delivered
Added `regenerateRoadmap(root)` export to GitLab and Gitea roadmap modules, and added a GitHub-parity cleanup block to `archiveProjectDir` in both claim scripts. When an issue is archived as `closed`, the claim script now deletes `.roadmap/issue-N.md` and regenerates `ROADMAP.md`, eliminating the stale-entry drift bug.

## Files Changed
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` — `regenerateRoadmap` function + export; `cmdGenerate` delegates to it
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` — same for Gitea
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — `require` roadmap module; extract `archiveIssueNumber`; cleanup block before return
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same for Gitea
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — watcher test plants roadmap state and asserts cleanup
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — same for Gitea
- `CHANGELOG.md` — [Unreleased] entry
- `docs/api.md` — `regenerateRoadmap(root)` documented for both editions

## Test Coverage
Watcher test covers: plant `.roadmap/issue-44.md` + generate ROADMAP.md → run watcher → assert both source file deleted and `#44` absent from ROADMAP.md. RED confirmed before implementation; GREEN after. All 5 validation commands pass.

## Final Validation Evidence
| Command | Result | Phase |
|---------|--------|-------|
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | PASS | 4+6 |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | PASS | 4+6 |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | PASS | 4+6 |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | PASS | 4+6 |
| `node scripts/simulate-workflow-walkthrough.js` | PASS | 4+6 |

## Documentation Docking
DOCKED — evidence: `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
(none)

## Follow-Up Items
None. Out-of-scope items (shared cross-edition module, retry/rethrow, abandoned-path cleanup) were explicit non-goals documented in phase2-ideation.md.

## Closure Decision
None needed — no deferred items, no unresolved conflicts, no partial implementation.

## Commit And Push
pending final Git gate

## GitHub Issue
pending close (#147)

## Roadmap
pending refresh (delete `.roadmap/issue-147.md`, regenerate ROADMAP.md)

## Archive
pending (cmdFinalize)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | | no deferred items or user-decision items found |
| final-validation fix executors | N/A | | all validation passed first run |
| roadmap refresh | pending | | runs in Step 7 |
| archive completed folder | pending | | runs in Step 8b (cmdFinalize) |
| final commit and push | ready | | final gate runs after this file |

## Status
READY FOR FINAL GIT GATE
