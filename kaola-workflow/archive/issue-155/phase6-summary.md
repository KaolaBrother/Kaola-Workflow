# Phase 6 - Summary: issue-155

## Delivered
Fixed fail-open behavior in remote issue validation across GitHub, GitLab, and Gitea forge editions. When `gh`/`glab`/`tea` issue fetch fails outside `KAOLA_WORKFLOW_OFFLINE=1`, the system now returns a typed `target_unavailable` refusal instead of silently returning `green` and claiming potentially closed/blocked issues.

Added `probeIssueState()` helper to each forge's active-folders module. Fixed 3 GitHub wrapper leak points, 2 GitLab classifier catches, and 2 Gitea classifier catches. Added `claimExplicitTarget` sibling branch and `claimProject` probe guard in all three forges. Fixed probe ordering (existing-folder check before probe) to match GitLab/Gitea pattern. Regression tests added for all three forges.

## Files Changed
- `scripts/kaola-workflow-classifier.js`
- `scripts/kaola-workflow-claim.js`
- `scripts/kaola-workflow-active-folders.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js` (byte-identical copy)
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-identical copy)
- `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` (byte-identical copy)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js`
- `scripts/simulate-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- `commands/workflow-next.md`
- `plugins/kaola-workflow-gitlab/commands/workflow-next.md`
- `plugins/kaola-workflow-gitea/commands/workflow-next.md`
- `CHANGELOG.md`
- `README.md`
- `docs/api.md`

## Test Coverage
No coverage tooling in this project. All acceptance criteria have direct regression tests:
- `testClassifierFailClosedOnRemoteError` (GitHub)
- `testClassifierOfflineBypassesFailClosed` (GitHub OFFLINE regression)
- `testClaimProjectOwnedFolderFailingRemote` (GitHub resume regression)
- `testGitLabClassifierFailClosed`, `testGitLabStartupFailClosed`, `testGitLabOfflineBypassesFailClosed` (GitLab)
- `testGiteaClassifierFailClosed`, `testGiteaOfflineBypassesFailClosed` (Gitea)

## Final Validation Evidence
| Command | Result |
|---------|--------|
| `node scripts/simulate-workflow-walkthrough.js` | PASS (exit 0) |
| `node scripts/validate-script-sync.js` | PASS — "OK: 9 common scripts in sync." |
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | PASS (exit 0) |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | PASS (exit 0) |
| `npm test` | PASS (exit 0) |

Evidence path: `.cache/final-validation.md`

## Documentation Docking
DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- [LOW] Align GitLab `probeIssueState` to include explicit `if (OFFLINE || issueIid == null)` guard for consistency with GitHub and Gitea. Behaviorally benign. Can be a future follow-up.

## Closure Decision
No deferred items, conflicts, or user decisions. Issue #155 acceptance criteria fully satisfied. Proceed to close.

## Commit And Push
pending final Git gate

## GitHub Issue
open — will close after sink

## Roadmap
pending — will regenerate after archive

## Archive
pending — will be set by cmdFinalize

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | — | No deferred items or user-decision items found |
| final-validation fix executors | N/A | — | All validation commands passed on first run |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | Will run in Step 7 |
| archive completed folder | pending | | Will run in Step 8b |
| final commit and push | ready | git status / diff / upstream check | Final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
