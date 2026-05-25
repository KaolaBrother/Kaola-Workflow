# Code Explorer — issue-162

## `archiveProjectDir()` in `scripts/kaola-workflow-claim.js`

Location: lines 496–537. The function moves a project folder to `kaola-workflow/archive/` and for `statusValue === 'closed'` only, performs roadmap cleanup in a **best-effort (non-fatal) block**:

```js
if (statusValue === 'closed') {
  try {
    if (Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
      const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
      try { fs.unlinkSync(roadmapFilePath); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    roadmapModule.regenerateRoadmap(root);
  } catch (_) { /* roadmap mirror cleanup is non-fatal; archive already completed */ }
}
```

Key behaviors:
- `archiveIssueNumber` is parsed from `workflow-state.md`. If state file unreadable, stays `null` and delete block is skipped.
- `fs.unlinkSync` silently ignores `ENOENT` (already absent = valid). Other errors are rethrown into outer `catch (_)`.
- **Outer `catch (_)` swallows ALL errors** — ENOENT re-throw AND `regenerateRoadmap` failures.
- Archive `renameSync` at line 516 runs before the cleanup block, so failures never roll back the archive.
- Roadmap cleanup is **NOT performed for `statusValue === 'abandoned'`** — `cmdRelease` passes `'abandoned'`.

Exported at line 885. Consumed by `cmdFinalize`, `cmdRelease`, `cmdWatchPr`, `cmdStaleWorktreeCleanup`.

## GitLab and Gitea Plugin Claim Scripts

All three forge plugins have **their own copy** of `archiveProjectDir`:

| File | `archiveProjectDir` line | `roadmapModule` require |
|------|--------------------------|-------------------------|
| `scripts/kaola-workflow-claim.js` | 496 | `require('./kaola-workflow-roadmap')` (line 16) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 495 | `require('./kaola-gitlab-workflow-roadmap')` (line 17) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | 480 | `require('./kaola-gitea-workflow-roadmap')` (line 17) |

Roadmap-cleanup block is **byte-identical** across all three. Only known delta: `removeLegacyStateBlocks(content)` call present in main script (line 505) but absent from GitLab/Gitea versions.

## Roadmap Generation

`scripts/kaola-workflow-roadmap.js` exports:
- `regenerateRoadmap(root)` (line 188) — already called in `archiveProjectDir`. Reads `.roadmap/issue-*.md`, rebuilds `ROADMAP.md` atomically. Returns `'generated'` or `'up-to-date'`.
- `readRoadmapIssues(dir)` (line 61) — parses `issue:`, `title:`, `status:`, `workflow_project:`, `next_step:` fields.
- `writeFileAtomicReplace(filePath, content)` (line 116) — writes to `.tmp` then `fs.renameSync`.

Each forge plugin has its own roadmap module (`kaola-gitlab-workflow-roadmap.js`, `kaola-gitea-workflow-roadmap.js`) with the same `regenerateRoadmap` signature.

## Post-Closure Invariant Checks

`CLOSURE_INVARIANTS[0]` = `roadmap-source-absent` and `CLOSURE_INVARIANTS[1]` = `roadmap-mirror-clean` exist as **data** in `kaola-workflow-closure-contract.js`. No runtime enforcement code exists yet. The receipt fields `roadmap_source_removed: ['removed', 'absent', 'failed']` and `roadmap_regenerated: ['regenerated', 'skipped', 'failed']` are defined but never populated by any code.

## Test Patterns — `simulate-workflow-walkthrough.js`

Framework: hand-rolled assertions, no external runner.

Key helpers:
- `assert(condition, message)` — throws on failure
- `runNode(script, args, cwd, extraEnv)` — `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1'`
- `json(result)` — asserts exit 0 then `JSON.parse(stdout)`
- `runClaimOnline(args, cwd, binDir, extraEnv)` — with `gh` mock via `KAOLA_GH_MOCK_SCRIPT`
- `writeShimFiles(shimPath, jsLines)` — writes a `gh.js` shim

Relevant existing tests:
- `testFinalizeCleansRoadmapEntry` (line 2054) — plants issue 910 folder + roadmap source file, runs finalize, asserts source deleted and ROADMAP.md doesn't mention #910
- `testFinalizeFromLinkedWorktreeCleansRoadmapEntry` (line 2084) — same but from linked worktree; checks git commit includes `D kaola-workflow/.roadmap/issue-911.md`

**New test scaffold needed (failure path)**: plant active folder + roadmap source, corrupt/remove `.roadmap/` dir, run finalize, assert exit 1.

## `cmdFinalize` function body

Location: lines 539–564. Calls `archiveProjectDir(root, args.project, 'closed')` unconditionally at line 544. Does not consume a return value currently. Handles worktree removal after archive.

## `sink-merge.js` / `watch-pr` archive path

- `sink-merge.js` does NOT call `archiveProjectDir`. Requires prior finalize. Guard `assertNoLiveWorkflowFolder` (line 71) enforces this.
- `watch-pr` in `kaola-workflow-claim.js` (lines 833–858) DOES call `archiveProjectDir` directly for both MERGED (`'closed'`) and CLOSED (`'abandoned'`) PR states. Any change to `archiveProjectDir` error contract affects the watch-pr path.

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-claim.js` | Main claim script; `archiveProjectDir` lines 496-537, `cmdFinalize` lines 539-564, `cmdWatchPr` lines 833-858 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | GitLab fork; `archiveProjectDir` line 495 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Gitea fork; `archiveProjectDir` line 480 |
| `scripts/kaola-workflow-roadmap.js` | `regenerateRoadmap(root)` line 188 |
| `scripts/kaola-workflow-closure-contract.js` | Receipt schema; `roadmap_source_removed`, `roadmap_regenerated` fields |
| `scripts/simulate-workflow-walkthrough.js` | Integration tests; `testFinalizeCleansRoadmapEntry` line 2054, `testFinalizeFromLinkedWorktreeCleansRoadmapEntry` line 2084 |
