# Phase 6 - Summary: issue-127

## Delivered
Added `workflow:in-progress` label removal when a linked issue is successfully closed via sink-merge, across all three forge editions (GitHub, GitLab, Gitea). Label is removed as a non-fatal best-effort call immediately after the issue close call at each close site.

## Files Changed
- `scripts/kaola-workflow-sink-merge.js` — Step 8: added `ghExec(['issue', 'edit', ..., '--remove-label', 'workflow:in-progress'])` inside `!OFFLINE && args.issue != null` guard
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — synced copy of above
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — `forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] })` at `closeLinkedIssue` + Step 8
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — `forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] })` at `closeLinkedIssue` + Step 8
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — extended Test 6 with `updateIssue` stub + 3 assertions
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — extended Test 6 with `updateIssueLabels` stub + 3 assertions
- `CHANGELOG.md` — ### Fixed entry under [Unreleased]

## Test Coverage
4 forge test suites pass. GitLab and Gitea have new unit assertions for label removal via `closeLinkedIssue` path. GitHub path regression-checked via walkthrough simulation.

## Final Validation Evidence
`npm test` from worktree — all 4 forge editions pass. Exit 0. Evidence: .cache/final-validation.md (Phase 4 run, no files changed after).

## Documentation Docking
DOCKED — .cache/doc-docking.md. CHANGELOG updated; all other doc classes reviewed and confirmed no impact.

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| npm test (script-sync) | build | Trivial Inline Edit Exception — cp canonical sink-merge to plugin copy | n/a | resolved |

## Follow-Up Items
- Gitea Step 8 double `readProjectInfo` call — minor inefficiency noted by reviewer, not a bug; out of scope
- Step 8 production-merge path (skipGit:false) in GitLab/Gitea has no new unit test — accepted per Phase 3 plan
- Root cause of `cmdFinalize`'s `clearAdvisoryClaim` not preventing 14 stale labels — future investigation item

## Closure Decision
No deferred items, conflicts, or user decisions block closure. Closing issue #127.

## One-Time Cleanup
14 closed issues carrying stale `workflow:in-progress` label at time of Phase 1: #126, #125, #119, #117, #116, #115, #113, #103, #89, #88, #86, #85, #82, #81. Run cleanup now (not committed):

## Commit And Push
pending final Git gate

## GitHub Issue
pending close

## Roadmap
pending update

## Archive
pending

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | no deferred items or user decisions found in closure scan | |
| final-validation fix executors | N/A | sync fix was Trivial Inline Edit Exception; no routed fix needed | |
| roadmap refresh | pending | | |
| archive completed folder | pending | | |
| final commit and push | ready | npm test exit 0; git diff will be staged after this file | |

## Status
READY FOR FINAL GIT GATE
