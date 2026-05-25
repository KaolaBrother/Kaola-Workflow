# Phase 6 - Summary: issue-164

## Delivered
Unified closure execution behind a shared closure receipt. A `buildClosureReceipt(project, issueNumber, steps)` helper now seeds `emptyReceipt()` across all four forge claim modules; `cmdFinalize`, `cmdWatchPr`/`cmdWatchMr`, and `sink-merge` all emit `closure_receipt` + `closure_invariants`. `checkClosureInvariants` extended from 3 to 6 invariants (new local checks: `active-folder-absent`, `archive-state-closed`, `branch-worktree-resolved`; signature `(root, receipt, archiveDest)`). `sink-merge`'s `ghExec` honors `KAOLA_GH_MOCK_SCRIPT`. `sink-merge` is the only path that sets `remote_issue_closed: 'closed'` and `branch_removed: 'removed'`.

## Files Changed
- `scripts/kaola-workflow-claim.js` — helper, invariants, cmdFinalize/cmdWatchPr receipts, export
- `scripts/kaola-workflow-sink-merge.js` — KAOLA_GH_MOCK_SCRIPT, receipt emission + invariants
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` + `...-sink-merge.js` — byte-identical Codex copies
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` + `...-sink-merge.js` — structural ports
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` + `...-sink-merge.js` — structural ports
- `scripts/simulate-workflow-walkthrough.js` — 4 new tests
- `docs/api.md`, `CHANGELOG.md`, `.env.example` — docs

## Test Coverage
No coverage tool in repo (hand-rolled assert suite). Acceptance = full walkthrough green. 4 new #164 tests; 43 PASSED lines across all forge variants.

## Final Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed" — `.cache/final-validation.md`
- `node scripts/validate-script-sync.js` → in sync
- `npm test` → exit 0 (GitHub/GitLab/Gitea + Codex)

## Documentation Docking
DOCKED — `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
- **Deferred to #165 prep**: skip-path regression test asserting `receipt.archive === 'skipped'` on double-finalize (test-intent design wants tdd-guide/sonnet, which was rate-limited; the fix itself was verified by opus diff re-review).
- Invariant 5 (`remote-closed-after-publish`) and `sink:pr` runtime closure remain deferred to #165 (documented-only in #164).

## Closure Decision
Deferred items exist (skip-path test, invariant 5) — advisor consulted; see `.cache/advisor-closure.md`. Per session goal ("if human decisions needed, follow advisor's recommendation"), the advisor's recommendation governs.

## Commit And Push
pending final Git gate

## GitHub Issue
pending — close #164 after acceptance + closure gate

## Roadmap
pending — delete `.roadmap/issue-164.md`, regenerate ROADMAP.md

## Archive
pending — atomic via cmdFinalize (sink: merge path)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | .cache/advisor-closure.md | |
| final-validation fix executors | N/A | .cache/final-validation.md (all green) | no final-validation failures |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/diff | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
