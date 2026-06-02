# Phase 6 - Summary: issue-221

## Delivered
Close-mid-merge FAILURE regression coverage for the GitLab and Gitea `sink-merge` suites. Each forge sink test (`test-gitlab-sinks.js`, `test-gitea-sinks.js`) gains a block cloned from its existing online-close success test, where the spawned mock forge CLI exits non-zero on the close subcommand. The test asserts process exit 0, the forge-specific manual-close WARNING, `remote_issue_closed==='failed'`, and `claim_label_removed==='removed'` (negative control). No production code changed — the `:269` failure branch was already correct and byte-equivalent to root; only the test gap is closed.

## Files Changed
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — new close-failure block (+41)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — new close-failure block (+40)
- `CHANGELOG.md` — `### Fixed` entry under `[Unreleased]`
- `kaola-workflow/archive/issue-221/` — archived workflow folder
- `kaola-workflow/ROADMAP.md` — regenerated (no active work)

## Test Coverage
Adds coverage for the previously-untested forge close-failure branch. RED→GREEN proven: setting `remoteIssueClosed='failed'→'closed'` in gitlab `:269` made the new test fail (`'closed' !== 'failed'`); reverted → GREEN. Wired into both npm targets via `simulate-*-walkthrough.js → run('test-*-sinks.js')` (execFileSync stdio:'pipe' propagates non-zero exit).

## Final Validation Evidence
- `npm test` (claude + codex + gitlab + gitea) → exit 0. Evidence: `.cache/final-validation.log`.
- Independent forge re-run: `npm run test:kaola-workflow:gitlab` → exit 0; `:gitea` → exit 0.

## Documentation Docking
DOCKED — see `.cache/doc-docking.md` (CHANGELOG updated; README/api/.env/arch no-impact).

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| n/a | — | — | — | no failures |

## Follow-Up Items
- None.

## Closure Decision
#221 fully closes audit #8 — the forge close-failure path now has parity coverage with root. Acceptance met (GREEN, RED-proven, full suite green). No new deferred items, conflicts, or user-decision items. User pre-authorized closure (full sink per convention). No advisor-closure gate required.

## Commit And Push
[pending final Git gate; final hash reported after push]

## GitHub Issue
[pending close via sink-merge]

## Roadmap
Regenerated (no .roadmap source; "No active work").

## Archive
[pending — cmdFinalize Step 8b]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | skipped | .cache/doc-docking.md | test-only change; only CHANGELOG impacted, entry written directly (precise facts; anti-fabrication) — README/api/.env/arch no-impact |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan | no closure-blocking items |
| final-validation fix executors | N/A | .cache/final-validation.log | no failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | |
| final commit and push | ready | git status/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
