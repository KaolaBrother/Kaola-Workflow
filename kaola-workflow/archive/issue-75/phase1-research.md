# Phase 1 - Research / Discovery: issue-75

## Deliverable
Fix 6 lifecycle cleanup gaps in kaola-workflow scripts so PR-backed folders, worktree sibling dirs, and closed-issue local remnants are reliably cleaned up and visible. Add regression tests for all code-path changes.

## Why
Merged/closed PRs can leave orphaned active folders. Released or finalized projects leave `.kw/` worktree remnants. Closed-issue local folders are invisible to `status` and `watch-pr`, causing silent operational drift that requires manual intervention to resolve.

## Affected Area

### Code changes
- `scripts/kaola-workflow-claim.js` — Gaps 1, 3, 4: `cmdWatchPr`, `cmdFinalize`, `cmdRelease`, `cmdStatus`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — mirror of above (identical file, same edits)
- `scripts/simulate-workflow-walkthrough.js` — regression tests for Gaps 1, 3, 4

### Doc changes
- `commands/kaola-workflow-phase6.md` — Gap 2: step ordering fix (sink-pr before cmdFinalize)
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — Gap 2 mirror
- `commands/workflow-next.md` — Gap 5: add cleanup note after startup transaction
- `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` — Gap 5 mirror

## Key Patterns Found

1. **excludeClosedIssues: false pattern** — `scripts/kaola-workflow-sink-merge.js:225` is the existing reference: `readActiveFolders(root, { excludeClosedIssues: false })`. Any cleanup operation that must find folders whose linked issue has already been closed on GitHub must use this option.

2. **removeWorktree signature** — `kaola-workflow-claim.js:119`. Takes `(root, project, folder)` where `folder` provides cached `worktree_path`. Never throws; returns `{ removed: bool, path?, reason? }`. Mirror of call pattern: `sink-merge.js:227` for reference.

3. **archiveProjectDir is worktree-unaware** — `kaola-workflow-claim.js:413`. Does `fs.renameSync(src, dest)` only on the workflow folder; caller must call `removeWorktree` separately if the sibling `.kw/` dir should be cleaned.

4. **sink-pr writes to active path** — `scripts/kaola-workflow-sink-pr.js updateStateSinkBlock()` constructs `path.join(root, 'kaola-workflow', args.project, 'workflow-state.md')`. After `cmdFinalize` renames the folder, this path no longer exists and the write silently skips via `if (!fs.existsSync(stateFile)) return;`.

5. **Phase 6 step ordering** — `commands/kaola-workflow-phase6.md`: Step 8b (cmdFinalize/archive) currently precedes Step 9 (sink-pr dispatch). Fix: move sink-pr before cmdFinalize so PR metadata is in the active folder when it gets archived.

6. **startup transaction ordering** — `commands/workflow-next.md` Step 0b (startup transaction: creates folder + worktree) runs before Step 1 (Git freshness check). Fix: doc note that if Step 1 fails, agent should run `cmdRelease` to clean up.

## Test Patterns

- **Framework**: Hand-rolled, single `assert(condition, message)` function, async `main()`
- **Location**: `scripts/simulate-workflow-walkthrough.js`
- **Structure**: `async function testXxx(tmp)` called from `main()`, uses `try/finally` cleanup for isolation
- **Helpers**: `runNode`, `runClaimOnline`, `json`, `writeProject`, `plantActiveFolder`, `writeGhShimForStartup`, `initGitRepo`
- **Online tests** (needing gh shim): `mkdtempSync` → `initGitRepo` → write `binDir/gh` shell shim → `runClaimOnline`
- **Offline tests**: use `KAOLA_WORKFLOW_OFFLINE=1`, no gh shim needed

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — disables all `gh` calls and remote checks
- `KAOLA_TARGET_ISSUE=N` — used by startup to specify target issue
- No new env vars needed for these fixes

## External Docs
N/A — internal patterns sufficient

## GitHub Issue
KaolaBrother/kaola-workflow#75

## Completeness Score
10/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns only, no external deps |

## Notes / Future Considerations

- Gap 2 has two valid resolutions per AC ("PR sink before archive" OR "PR sink writes into archived path"). Chose "sink-pr before archive" as the simpler doc-only fix that avoids changing sink-pr.js path logic.
- Gap 6 is advisory per AC wording — no mechanical guard added.
- Both `scripts/` and `plugins/kaola-workflow/scripts/` copies of kaola-workflow-claim.js are identical mirrors; both must receive the same edits.
- `activeByIssue`, `activeByProject`, `cmdStartup`, `cmdResume` call sites should keep default `excludeClosedIssues: true` — they are for managing unclaimed/active-only folders.
