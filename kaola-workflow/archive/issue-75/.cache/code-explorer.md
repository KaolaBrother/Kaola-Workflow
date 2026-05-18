# Code Explorer Output — issue-75

## Summary

All 6 lifecycle gaps confirmed by reading source. Both `scripts/` and `plugins/kaola-workflow/scripts/` copies are identical and both need the same fixes.

## Gap 1 — watch-pr skips closed-issue folders

`cmdWatchPr` (kaola-workflow-claim.js:543) calls `readActiveFolders(root)` with no options — defaults to `excludeClosedIssues: true`. When GitHub closes a linked issue before `watch-pr` runs, the PR-backed local folder is invisible, `watched` stays 0, `archiveProjectDir` is never called.

Fix: change to `readActiveFolders(root, { excludeClosedIssues: false })` at line 543.

## Gap 2 — Phase 6 archive order conflicts with PR sink

`cmdFinalize` (phase6.md Step 8b) calls `archiveProjectDir` which does `fs.renameSync(src, dest)` moving `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/`. Sink-pr (Step 9) then calls `updateStateSinkBlock(stateFile)` where `stateFile = path.join(root, 'kaola-workflow', args.project, 'workflow-state.md')` — this path no longer exists after archive. `updateStateSinkBlock` checks `if (!fs.existsSync(stateFile)) return;` and silently skips. PR metadata never written to archived state file.

Fix: Reorder Phase 6 so sink-pr dispatch (create PR, write `pr_url`/`pr_number`) runs BEFORE `cmdFinalize`. The archived artifact will then already contain PR metadata. Doc change in both `commands/kaola-workflow-phase6.md` and `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`.

## Gap 3 — Worktree cleanup missing

`cmdRelease` (line 451), `cmdFinalize` (line 435), and `cmdWatchPr` (line 538) all call `archiveProjectDir` without calling `removeWorktree`. `archiveProjectDir` is unaware of the sibling `.kw/` worktree. Reference pattern: `scripts/kaola-workflow-sink-merge.js:225` which does `readActiveFolders(root, { excludeClosedIssues: false })` and then calls `removeWorktree`. `removeWorktree` never throws; callers must check `removed` field.

Fix: add `removeWorktree(root, folder.project, folder)` call after each `archiveProjectDir` in all three functions.

## Gap 4 — status hides closed-issue remnants

`cmdStatus` (line 462-465) uses `readActiveFolders(root)` with no options — defaults `excludeClosedIssues: true`. Operator cannot see local folders whose GitHub issue has already closed.

Fix: change to `readActiveFolders(root, { excludeClosedIssues: false })` so all local folders appear in status output.

## Gap 5 — Startup claims before Git freshness

`commands/workflow-next.md` Startup Step 0b runs the startup transaction (creates active folder + worktree) before Startup Step 1 (Git freshness checks: `git fetch`, dirty/behind/diverged classification). If Git freshness fails at Step 1, folder and worktree remnants already exist.

Fix: doc-only. Add guidance under Step 0b that if Step 1 Git freshness subsequently blocks, agent should run `cmdRelease --project ...` to clean up before stopping.

## Gap 6 — Parallel write-set isolation is advisory

No mechanical guard proposed in issue. Advisory/doc only per AC wording ("mostly prompt-level discipline"). No code change needed.

## All readActiveFolders Call Sites

- `kaola-workflow-active-folders.js` CLI entry: `readActiveFolders(getRoot())` — no change needed
- `cmdStartup` line 370: `readActiveFolders(root)` — no change (should only see unclaimed active folders)
- `cmdResume` line 399: `readActiveFolders(root)` — no change (resume should target active folders)
- `activeByIssue` line 294: `readActiveFolders(root)` — no change (helper for finding by issue)
- `activeByProject` line 298: `readActiveFolders(root)` — no change (helper for finding by project)
- `cmdStatus` line 464: **CHANGE** → `excludeClosedIssues: false`
- `cmdWatchPr` line 543: **CHANGE** → `excludeClosedIssues: false`
- `kaola-workflow-sink-merge.js:225`: already uses `excludeClosedIssues: false` correctly
- `kaola-workflow-classifier.js:322`: correctly uses default (should not include closed-issue folders as overlap candidates)

## Test Patterns

Framework: hand-rolled, single `assert(condition, message)` function, async `main()`.

Key helpers:
- `runNode(script, args, cwd, extraEnv)` — offline spawnSync
- `runClaimOnline(args, cwd, binDir, extraEnv)` — online spawnSync with gh shim
- `json(result)` — asserts exit 0, parses stdout JSON
- `writeProject(root, project, files)` — creates workflow folder with files
- `plantActiveFolder(root, project, issueNumber, phase3Body, status)` — writes workflow-state.md with Sink block
- `writeGhShimForStartup(binDir)` — writes shell gh shim
- `initGitRepo(tmp)` — git init with commit

Gh shim pattern for closed-issue tests: `case "$ARGS" in *"issue view 80"*) echo '{"state":"closed"}' ;; *"pr view"*) echo '{"state":"MERGED","number":1}' ;; esac`

For Gap 1 regression: use `plantActiveFolder` with `pr_url` set, write gh shim that returns `state: closed` for issue and `state: MERGED` for PR, call `watch-pr`, assert folder is archived.
For Gap 3 regression: use `initGitRepo` to enable real worktrees, startup to provision worktree, assert worktree removed after finalize/release.
For Gap 4 regression: `plantActiveFolder` with closed-issue, call `status`, assert folder appears in output.

## Key Files

| File | Fix Type |
|------|----------|
| `scripts/kaola-workflow-claim.js` | Code: Gaps 1, 3, 4 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Mirror of above |
| `commands/kaola-workflow-phase6.md` | Doc: Gap 2 step ordering |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Doc: Gap 2 mirror |
| `commands/workflow-next.md` | Doc: Gap 5 |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Doc: Gap 5 mirror |
| `scripts/simulate-workflow-walkthrough.js` | Tests: regression coverage |
