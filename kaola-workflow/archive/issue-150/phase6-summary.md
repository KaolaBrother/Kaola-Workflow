# Phase 6 - Summary: issue-150

## Delivered

Ported priority-label sorting to GitLab and Gitea `listOpenIssues`. Both forge editions now:
- Read `priority_top_tier_labels` from `kaola-workflow/config.json` via `readPriorityConfig(root)`
- Sort open issues by priority tier (P-number labels → numeric tier; custom top-tier labels → tier 1; unlabeled → tier 99), then by issue number as tiebreaker
- Export `readPriorityConfig` for unit testing

This makes GitLab and Gitea editions behave consistently with the GitHub edition, matching the cross-forge behavior documented in README.md lines 548-552.

## Files Changed

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- `CHANGELOG.md`

## Test Coverage

8 new tests added (4 per forge):
- `readPriorityConfig` missing config → default `['P0','P1']`
- `readPriorityConfig` valid array → custom labels
- `readPriorityConfig` non-array value → default
- `listOpenIssues` priority sort: asserts `[3,5,1,9]` for issues with labels `['P0']`, `['critical']`, `[]`, `['P2']` and config `{priority_top_tier_labels:['critical']}` — non-trivial order that proves correct priority sort vs number sort `[1,3,5,9]`

Coverage target met: all new code paths exercised. No coverage tooling configured.

## Final Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | 4/4 issue-150 tests PASS; exit 1 pre-existing (testStaleWorktreeCheck, glab auth) | `.cache/final-validation-gl.txt` |
| `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 4/4 issue-150 tests PASS; exit 1 pre-existing (testStaleWorktreeCheck, tea auth) | `.cache/final-validation-gt.txt` |
| `node scripts/simulate-workflow-walkthrough.js` | exit 1 pre-existing (testStartupJsonAndSiblingWorktrees, gh auth) — no GitHub scripts modified | `.cache/final-validation-walkthrough.txt` |

## Documentation Docking
DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| GitLab/Gitea test suites (testStaleWorktreeCheck) | Pre-existing: live-auth integration test from issue #148; our diff adds 0 lines touching it | N/A — not routing (pre-existing, out of scope) | `.cache/final-validation.md` | closed/pre-existing |
| Walkthrough (testStartupJsonAndSiblingWorktrees) | Pre-existing: live-auth test; GitHub scripts not modified by issue-150 | N/A — not routing | `.cache/final-validation-walkthrough.txt` | closed/pre-existing |

## Follow-Up Items

- Security LOW (from Phase 5): `priorityTier` depends on forge `labelsOf()` contract. Informational; no action required.
- testStaleWorktreeCheck: pre-existing live-auth failure in forge test suites introduced in issue #148. Out of scope for issue-150; could be addressed in a future issue.

## Closure Decision

No deferred items, no unresolved conflicts, no partial implementation. Closure Decision Gate scan found nothing requiring advisor consultation or user permission.

## Commit And Push
pending final Git gate

## GitHub Issue
pending close (after push)

## Roadmap
pending (after issue close and archive)

## Archive
pending

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | | No deferred items or user-decision items found in closure scan |
| final-validation fix executors | N/A | | All failures are pre-existing unrelated to issue-150 |
| roadmap refresh | pending | | runs in Step 7 |
| archive completed folder | pending | | runs in Step 8b |
| final commit and push | ready | git diff HEAD confirms 6 changed files | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
