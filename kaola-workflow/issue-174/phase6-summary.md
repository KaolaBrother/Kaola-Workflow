# Phase 6 - Summary: issue-174

## Delivered
1. Aligned GitLab Codex `kaola-workflow-next/SKILL.md` to GitHub router parity: renamed `PICK_NEXT_PROJECT` → `KAOLA_PROJECT` (3 occurrences), added `KAOLA_VERDICT=`/`KAOLA_REASONING=` extraction, added `target_unverified` to typed-refusal list, added startup refusal diagnostics print block, added target-existence validation step (online: `glab issue view --output json`; offline: roadmap file check), moved Co-active Folders Advisory from Routing to Startup section.
2. Same 7-gap alignment applied to Gitea Codex `kaola-workflow-next/SKILL.md` (online: `tea issues view --output json`).
3. Added `assertBefore` helper function to both forge validators (`validate-kaola-workflow-gitlab-contracts.js`, `validate-kaola-workflow-gitea-contracts.js`).
4. Added 7 contract assertions per forge validator to catch this class of drift: `!PICK_NEXT_PROJECT`, `KAOLA_VERDICT=`, `KAOLA_REASONING=`, `target_unverified`, `Startup refusal:` print, offline roadmap path, Co-active Advisory placement before Routing.
5. Added CHANGELOG.md entry under [Unreleased] for the parity fix.

## Files Changed
- `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md`
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`
- `CHANGELOG.md`

## Test Coverage
No new test cases added to `simulate-workflow-walkthrough.js` — the contract validator assertions ARE the regression guard. Both forge validators newly pass 7 additional assertions. Hand-rolled assert suite; no formal % metric.

## Final Validation Evidence
- Command: `npm test`
- Result: EXIT 0
- All 4 suites: claude, codex, gitlab (incl. GitLab Codex), gitea (incl. Gitea Codex) — all passed
- Evidence path: `.cache/final-validation.md`

## Documentation Docking
DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
(none)

## Follow-Up Items
- LOW: Gap 4 diagnostics-block placement varies across editions (cosmetic ordering; content present in all)
- LOW: Pre-existing `glab issue list --json <fields>` idiom on unchanged lines (outside write set)

## Closure Decision
Scanned all phase artifacts. Only LOW nits (see Follow-Up Items). No user-owned decisions, no partial implementations, no unresolved conflicts. Implementation is complete; AC all pass. No advisor consultation needed.

## GitHub Issue
Issue #174 open; will be closed after PR merges. Issue comment will be posted with implementation evidence.

## Roadmap
Pending — `kaola-workflow/.roadmap/issue-174.md` to be deleted; `generate` runs in Step 7.

## Commit And Push
pending — final git gate runs after this file is committed

## Archive
pending — active folder (`kaola-workflow/issue-174/`) remains open per `sink: pr`; `watch-pr` archives when PR merges.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan in this file | All deferred items are LOW nits; no user-owned decisions |
| final-validation fix executors | N/A | | No final validation failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | issue-174.md deleted; generate ran (up-to-date) |
| archive completed folder | pending | | sink: pr — watch-pr archives on PR merge |
| final commit and push | ready | git diff HEAD confirms changed files; sink: pr path | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE

PR URL: pending (sink-pr will create)
