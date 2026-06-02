# Phase 6 - Summary: issue-216

## Delivered
Archive-safety guard in `postMergeCleanup` for root/Codex `sink-merge`: captures `wasArchived = !exists(live) && exists(archive)` before `git reset --hard origin/main`, runs the reset unconditionally, then skips only the `fs.mkdirSync` + `fs.writeFileSync` receipt write when `wasArchived`. Prevents phantom active folder resurrection on classified push failure after project is already archived.

Regression test `testSinkMergeSkipsArchivedProjectPhantom` added — uses real git repo with committed archive, confirms `aheadCount === '0'` (main is clean) and no phantom live folder.

## Files Changed
- `scripts/kaola-workflow-sink-merge.js` — `wasArchived` guard in `postMergeCleanup` + comment update
- `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` — byte-identical (SHA `677de466`)
- `scripts/simulate-workflow-walkthrough.js` — `testSinkMergeSkipsArchivedProjectPhantom`
- `CHANGELOG.md` — `### Fixed` entry under `[Unreleased]`
- `README.md` — one sentence noting receipt skip for archived projects
- `docs/api.md` — exit-code table updated to "root/Codex/GitLab/Gitea guard, issue #216"; narrative section updated
- `kaola-workflow/.roadmap/issue-216.md` — deleted (issue closed)
- `kaola-workflow/ROADMAP.md` — regenerated
- `kaola-workflow/archive/issue-216/` — archived workflow folder

## Test Coverage
`testSinkMergeSkipsArchivedProjectPhantom` — primary discriminators:
1. `aheadCount === '0'` (main at origin/main — reset ran) — confirmed RED when skip-reset version used (got `ahead=1`)
2. `!fs.existsSync(liveDir)` — no phantom live folder

Standard-finalize / untracked-archive path: `archiveProjectDir` calls `fs.renameSync(live, archive)` before sink-merge runs. In the untracked path, `git reset --hard origin/main` does NOT remove untracked files — archive stays on disk AND main is clean. `wasArchived` fires correctly (live was renamed away). Both invariants hold for the untracked path; the test exercises the harder committed-archive path.

## Final Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0)
- `testSinkMergeSkipsArchivedProjectPhantom: PASSED`
- aheadCount RED-proof: skip-reset version → `Error: local main must be at origin/main, got ahead=1`
- byte-sync: `diff` no output; SHA `677de466ca66608511e6ee41d533c37c23f4d581` both files
- `.cache/final-validation.md` (delegated walkthrough output)

## Documentation Docking
DOCKED — see `.cache/doc-docking.md`

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| n/a | — | — | — | no failures |

## Follow-Up Items
- LOW: Sanitize `args.project` of newlines/ANSI in stderr output (pre-existing pattern throughout the file; not #216-specific; separate hygiene pass if desired)
- `postMergeCleanup` pre-existing size overrun (81 lines > 50-line guideline); not introduced by this fix

## Closure Decision
#216 can close. LOW follow-up is pre-existing and out of scope. No follow-up issues needed unless user requests. Advisor consulted (`.cache/advisor-closure.md`).

## Commit And Push
pending final Git gate

## GitHub Issue
pending close

## Roadmap
updated (issue-216.md deleted, ROADMAP.md regenerated)

## Archive
kaola-workflow/archive/issue-216/

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | invoked | .cache/advisor-closure.md | |
| final-validation fix executors | N/A | | No final validation failures |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | pending | | runs in Step 8b |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
