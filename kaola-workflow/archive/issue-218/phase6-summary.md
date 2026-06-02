# Phase 6 - Summary: issue-218

## Delivered
Fail-closed fix for the GitLab and Gitea forge ports' `probeIssueState`: a degraded
but exit-0 forge CLI response (empty stdout OR non-JSON stdout) now returns
`{state:'unavailable'}` instead of `'open'`, so `claimProject`'s fail-closed guard
fires and an unverifiable/closed issue is no longer claimed. Implemented as a
three-way that fails closed on the residual (closed→closed, open→open, else→
unavailable), symmetric across both ports, with reason strings
`glab issue state unverified` / `tea issue state unverified`. Root + Codex were
already correct and are unchanged.

## Files Changed
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js
- plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js (3 new tests)
- plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js (3 new tests)
- CHANGELOG.md ([Unreleased] → Fixed entry)
- kaola-workflow/.roadmap/issue-218.md (removed at close) + kaola-workflow/ROADMAP.md (regenerated)

## Test Coverage
No coverage instrumentation in this repo (hand-rolled assertion suites; CLAUDE.md:
"Node scripts only, no formal pipeline"). Coverage % unavailable — justified by
convention. Change covered by 6 new assertion tests (empty + non-JSON exit-0 per
port, + residual-branch withForge per port) plus full-walkthrough regression.

## Final Validation Evidence
- `npm test` → PASS across all four editions (claude/codex/gitlab/gitea); evidence
  `.cache/final-validation.md`. The gitlab/gitea walkthroughs transitively run the
  new port tests.
- Direct: `node .../test-gitlab-workflow-scripts.js` + `.../test-gitea-workflow-scripts.js` PASS;
  both port contract validators PASS.

## Documentation Docking
DOCKED — `.cache/doc-docking.md`. CHANGELOG updated; all other doc classes
no-impact with evidence (fix conforms the ports to already-documented behavior).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | — | — | — | — |

## Follow-Up Items
- **Classifier latent degraded fail-open (NOT filed — surfaced for user decision):**
  both port classifiers (`checkDependsOn`, `classifyIssue`, `cmdClassify`) treat a
  degraded `state:'unknown'` as claimable-open, mirroring the bug just fixed in
  `probeIssueState`. Out of scope for #218 (issue title + suggested fix are
  probe-scoped; both reviewers + advisor confirmed). Per the advisor, surfaced in
  the issue close comment + final report rather than auto-filed; the user decides
  whether to open an issue.

## Closure Decision
Advisor consulted (`.cache/advisor-closure.md`): proceed to close #218 via merge;
surface (do not auto-file) the classifier follow-up; stage explicitly (avoid the
stray untracked investigation doc); anticipate a mechanical CHANGELOG rebase
collision with #216 (keep both entries; stop only if a port file conflicts).

## Commit And Push
pending final Git gate; final hash reported after push.

## GitHub Issue
to be closed by sink-merge (--issue 218)

## Roadmap
updated yes (issue-218.md removed, ROADMAP.md regenerated)

## Archive
pending cmdFinalize → kaola-workflow/archive/issue-218/

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | .cache/advisor-closure.md | |
| final-validation fix executors | N/A | — | final validation passed first run |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | done in cmdFinalize (Step 8b) |
| final commit and push | ready | git status/diff/upstream | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
