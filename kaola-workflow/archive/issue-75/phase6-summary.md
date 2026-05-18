# Phase 6 - Summary: issue-75

## Delivered

Fixed 6 lifecycle cleanup gaps in kaola-workflow that left PR-backed folders, worktree remnants, and closed-issue local folders as undetected or uncleaned operational drift:

1. **Gap 1** — `cmdWatchPr` now passes `excludeClosedIssues: false` so PR-backed folders for closed issues are scanned and archived on PR merge/close.
2. **Gap 2 (code)** — `cmdSinkFallback` guards against recreating archived folders via `updateState` → `mkdirSync`.
3. **Gap 2 (doc)** — Phase 6 Step 8b is now conditional on `sink: merge`, fixing the PR-sink ordering conflict.
4. **Gap 3** — `cmdFinalize`, `cmdRelease`, and `cmdWatchPr` (MERGED/CLOSED) now call `removeWorktree` after archiving.
5. **Gap 4** — `cmdStatus` returns `{ active, drift, count }` partition instead of hiding closed-issue folders.
6. **Gap 5** — `workflow-next.md` documents the Git Freshness Block Recovery pattern.
7. **Gap 6** — `workflow-next.md` adds a Co-active Folders advisory paragraph.
8. **Security** — `isSafeName` guard added to `cmdSinkFallback`; `--` separator added in `removeWorktree`.
9. **Tests** — 4 new regression tests covering all 4 code-path gaps.

## Files Changed

**Code:**
- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (mirror)
- `scripts/simulate-workflow-walkthrough.js`

**Docs:**
- `commands/kaola-workflow-phase6.md`
- `commands/workflow-next.md`
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- `CHANGELOG.md`

## Test Coverage

Hand-rolled test suite. 14 tests total (10 pre-existing + 4 new). All pass.
No coverage tooling; new behaviors are directly exercised by the 4 regression tests.

## Final Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `node scripts/simulate-workflow-walkthrough.js` | PASS (exit 0, 14 tests) | .cache/final-validation.md |
| plugin mirror diff | PASS (exit 0) | verified in-session |

## Documentation Docking

DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger

None.

## Follow-Up Items

1. `cmdRelease` cannot operate on drift folders (out of scope per AC; needs separate issue)
2. `pr_url` domain validation in `cmdWatchPr` (low priority; acceptable per threat model)
3. `cmdPatchBranch` missing `isSafeName` guard (pre-existing gap; out of scope for #75)

## Closure Decision

No advisor consultation needed. All phase artifacts scanned — no partial implementations, no unresolved conflicts, no user-decision blockers. The three follow-up items are explicit out-of-scope deferrals per phase2-ideation.md and phase5-review.md. Issue #75 can close cleanly.

## Commit And Push

Pending final Git gate. Final hash reported after push.

## GitHub Issue

Closing after final commit — all 8 AC bullets satisfied.

## Roadmap

`kaola-workflow/.roadmap/issue-75.md` to be deleted; `ROADMAP.md` to be regenerated.

## Archive

`kaola-workflow/archive/issue-75/` (created by `cmdFinalize` in Step 8b)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| doc-updater | invoked | .cache/doc-updater.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| closure advisor gate | N/A | closure scan: no blocking items | All deferrals are pre-approved out-of-scope |
| final-validation fix executors | N/A | no final validation failures | |
| roadmap refresh | pending | kaola-workflow/ROADMAP.md | runs at Step 7 |
| archive completed folder | pending | | runs at Step 8b |
| final commit and push | ready | git status/git diff/upstream check | final gate runs after this file is committed |

## Status
READY FOR FINAL GIT GATE
