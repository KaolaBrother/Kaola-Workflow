# Phase 3 - Plan: issue-159

## Blueprint

### Files to Create
None. (No manifest/index in sidecar dir, per scope.)

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/simulate-workflow-walkthrough.js` | Add sc9 (untracked-only export) + sc10 (mixed export) after sc8 | Regression tests for the bug; GitHub edition |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add sc9 + sc10 after sc8 | GitLab edition regression coverage |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add sc9 + sc10 after sc8 | Gitea edition regression coverage |
| `scripts/kaola-workflow-claim.js` | `exportWorktreeDiff` (lines 145-158): add `-z` ls-files + null-byte split + sidecar copy; caller (line 727): `push(p)` → `push(...p)` | GitHub canonical fix |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Same as above (Codex mirror, same line numbers) | Codex plugin mirror fix |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Same fix; exportWorktreeDiff lines 154-167, caller line 730 | GitLab edition fix |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Same fix; exportWorktreeDiff lines 149-162, caller line 715 | Gitea edition fix |
| `docs/api.md` | Lines 328 + 340: describe sidecar directory for untracked files | User-facing documentation |

### Build Sequence

1. **Group T — write tests (3-way parallel, disjoint write sets)**
   - T-gh: add sc9 + sc10 to `scripts/simulate-workflow-walkthrough.js`
   - T-gl: add sc9 + sc10 to `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
   - T-gt: add sc9 + sc10 to `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

2. **Verify-fail checkpoint (HARD GATE — mandatory before Group I)**
   Run all 3 walkthroughs; confirm sc9/sc10 assertions fail with current (unfixed) implementation.
   Predicted failure: `out.exported` has length 1 (single string), `length >= 2` assertion fails.
   Do NOT proceed to Group I until this failure is confirmed.

3. **Group I — write implementation (4-way parallel, disjoint write sets, AFTER step 2)**
   - I-gh: fix `scripts/kaola-workflow-claim.js` (impl + caller, atomic)
   - I-codex: fix `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (impl + caller, atomic)
   - I-gl: fix `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (impl + caller, atomic)
   - I-gt: fix `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (impl + caller, atomic)

4. **Group D — docs (independent, parallel with T or I)**
   - D: update `docs/api.md` lines 328 + 340

5. **Verify-pass (all 3 walkthroughs must exit 0, including sc1–sc10)**

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| T | T-gh, T-gl, T-gt | Disjoint test files |
| I | I-gh, I-codex, I-gl, I-gt | Disjoint implementation files |
| D | D | Only touches docs/api.md |

Ordering constraint: T (write) → verify-fail → I (write) → verify-pass. D anytime.

### External Dependencies
None — only Node.js built-ins (`fs`, `path`, `os`, `child_process`) and git standard commands.

## Task List

### Task T-gh: Add sc9 + sc10 to GitHub walkthrough
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: (is the test file)
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: none
- Parallel Group: T
- Action: MODIFY
- Implement: Insert sc9 (untracked-only) and sc10 (mixed) blocks after sc8, before the `console.log('testStaleWorktreeCleanup: PASSED')` line. Use GitHub test conventions: `fs.realpathSync(mkdtempSync(...))`, `kwRoot = tmp + '.kw'`, `writeGhShim(binDir)`, `spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'])`, `runClaimOnline(args, tmp, binDir)` (3 args). sc9 asserts `exported.length >= 2`, one sidecar dir ending in `-untracked`, file preserved, worktree removed. sc10 asserts patch non-empty + sidecar with untracked file.
- Mirror: sc5 pattern at line 1329 (`initGitRepo`, `writeGhShim`, `spawnSync worktree add`, `runClaimOnline`)
- Validate: `node scripts/simulate-workflow-walkthrough.js` (MUST FAIL at sc9 before impl fix)

### Task T-gl: Add sc9 + sc10 to GitLab test suite
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: none
- Parallel Group: T
- Action: MODIFY
- Implement: Same structure as T-gh but with GitLab conventions: `writeGlabShimForStale(binDir)`, branch `workflow/gitlab-issue-200`, worktree path `path.join(kwRoot, 'issue-200')`, use inner `addWorktree(tmp, branch, wtPath)` helper. Insert before line 1641 `PASSED` log.
- Mirror: sc5 at line 1532, GitLab inner helper usage
- Validate: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

### Task T-gt: Add sc9 + sc10 to Gitea test suite
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: none
- Parallel Group: T
- Action: MODIFY
- Implement: Same as T-gl but Gitea conventions: `writeTeaShimForStale(binDir)`, branch `workflow/gitea-issue-200`, inner `addWorktree` helper. Insert before line 1564 `PASSED` log.
- Mirror: sc5 at line 1455, Gitea inner helper usage
- Validate: `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

### Task I-gh: Fix exportWorktreeDiff in GitHub claim script
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: verify-fail checkpoint (step 2)
- Parallel Group: I
- Action: MODIFY (atomic — impl + caller in same edit)
- Implement:
  1. Replace `exportWorktreeDiff` body (lines 145-158) with the sidecar implementation (see below).
  2. Change caller at line 727: `buckets.exported.push(p)` → `buckets.exported.push(...p)`.
  Both changes in one atomic write.
- Mirror: `stashWorktree()` at line 137 (uses `-u` for untracked)
- Validate: `node scripts/simulate-workflow-walkthrough.js` (must pass all sc1-sc10)

### Task I-codex: Fix exportWorktreeDiff in Codex plugin mirror
- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: verify-fail checkpoint (step 2)
- Parallel Group: I
- Action: MODIFY (atomic — impl + caller)
- Implement: Identical to I-gh (same line numbers: impl 145-158, caller 727)
- Validate: No walkthrough script — acknowledge Codex validation gap (no stale cleanup tests exist)

### Task I-gl: Fix exportWorktreeDiff in GitLab claim script
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: verify-fail checkpoint (step 2)
- Parallel Group: I
- Action: MODIFY (atomic — impl + caller)
- Implement: Same sidecar fix; impl lines 154-167, caller line 730: `push(p)` → `push(...p)`
- Validate: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`

### Task I-gt: Fix exportWorktreeDiff in Gitea claim script
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: verify-fail checkpoint (step 2)
- Parallel Group: I
- Action: MODIFY (atomic — impl + caller)
- Implement: Same sidecar fix; impl lines 149-162, caller line 715: `push(p)` → `push(...p)`
- Validate: `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

### Task D: Update docs/api.md
- File: `docs/api.md`
- Write Set: `docs/api.md`
- Depends On: none
- Parallel Group: D (independent)
- Action: MODIFY
- Implement: Line 328 — append to `--export` description: untracked files are copied to a sibling `issue-N-{timestamp}-untracked/` sidecar directory preserving relative paths. Line 340 — update `--export` behavior bullet to describe both the `.patch` artifact (tracked changes, apply with `git apply`) and the `-untracked/` sidecar (untracked files, copy back manually).
- Validate: manual review

## Implementation Patch (all 4 claim files — body of exportWorktreeDiff)

Replace lines 145-158 (GitHub/Codex) or 154-167 (GitLab) or 149-162 (Gitea):

```js
function exportWorktreeDiff(root, wtPath, issueNumber) {
  try {
    const exportsDir = path.join(root, 'kaola-workflow', 'archive', 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const untrackedOut = execFileSync('git', ['-C', wtPath, 'ls-files', '-z', '--others', '--exclude-standard'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const untrackedFiles = untrackedOut.split('\x00').filter(Boolean);
    const patchPath = path.join(exportsDir, 'issue-' + issueNumber + '-' + ts + '.patch');
    const diff = execFileSync('git', ['-C', wtPath, 'diff', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    fs.writeFileSync(patchPath, diff);
    const artifacts = [patchPath];
    if (untrackedFiles.length > 0) {
      const untrackedDir = path.join(exportsDir, 'issue-' + issueNumber + '-' + ts + '-untracked');
      for (const file of untrackedFiles) {
        const src = path.join(wtPath, file);
        const dest = path.join(untrackedDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      artifacts.push(untrackedDir);
    }
    return artifacts;
  } catch (_) {
    return null;
  }
}
```

Caller change (all 4 files): `buckets.exported.push(p)` → `buckets.exported.push(...p)`

Key: `-z` flag produces null-byte-delimited output safe for filenames with spaces, newlines, and non-ASCII characters. The `split('\x00')` replaces `trim().split('\n')`.

## Advisor Notes

- **BLOCKER applied**: architect's original patch used `split('\n')`. Advisor required `-z` flag + `split('\x00')` to handle filenames with newlines and non-ASCII chars (where `core.quotepath=true` would corrupt the path). Fix applied in phase file implementation patch above.
- **Verify-fail is a hard gate**: Phase 4 must explicitly run all 3 walkthroughs and confirm the expected failure before Group I writes.
- **Impl + caller atomic**: Both `exportWorktreeDiff` rewrite and `push(...p)` change must land in the same edit per file. Mismatched state yields nested array breaking all assertions.
- **Codex plugin gap**: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` has no walkthrough test; implementation fix only. Gap acknowledged.
- **CHANGELOG**: Phase 6 responsibility per project convention.
- **sc5 regression**: sc5 accesses `exported[0]` which still works with array return. Verify-pass step runs sc1–sc10 (not just sc9–sc10).

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found one implementation blocker (ls-files -z); fix folded directly into phase file patch; no full revision needed — change is a 2-line swap in a known location |
