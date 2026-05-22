# Code Explorer — issue-159

## 1. `exportWorktreeDiff()` — All Three Editions (identical)

**GitHub:** `scripts/kaola-workflow-claim.js:145-158`
**GitLab:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:154-167`
**Gitea:** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:149-162`

```js
function exportWorktreeDiff(root, wtPath, issueNumber) {
  try {
    const exportsDir = path.join(root, 'kaola-workflow', 'archive', 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const patchPath = path.join(exportsDir, 'issue-' + issueNumber + '-' + ts + '.patch');
    const diff = execFileSync('git', ['-C', wtPath, 'diff', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    fs.writeFileSync(patchPath, diff);
    return patchPath;
  } catch (_) {
    return null;
  }
}
```

Artifact: `{root}/kaola-workflow/archive/exports/issue-{N}-{ts}.patch`
Return type: string path on success, null on any exception.
Bug: writes even an empty patch (returns non-null) when worktree is dirty from untracked files only.

## 2. Dirty-Detection

`worktreeDirtyState()` — all three editions identical:
`scripts/kaola-workflow-claim.js:170-179`

```js
function worktreeDirtyState(wtPath) {
  try {
    if (!fs.existsSync(wtPath)) return 'missing';
    const out = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim().length > 0 ? 'dirty' : 'clean';
  } catch (_) {
    return 'missing';
  }
}
```

`git status --porcelain` with no flags reports untracked files as `?? file`. A worktree dirty ONLY from untracked files is classified 'dirty'. Then `exportWorktreeDiff` runs `git diff HEAD` → empty output → empty patch written → worktree removed → untracked files lost.

## 3. `cmdStaleWorktreeCleanup()` Dispatch (GitHub edition)

`scripts/kaola-workflow-claim.js:682-774`

Flag-precedence in execute path (lines 716-733):
1. `--archive` → calls `stashWorktree()` → on failure: `failed_preserve` + continue (NOT removed)
2. `else if --export` → calls `exportWorktreeDiff()` → on failure: `failed_preserve` + continue (NOT removed)
3. `--force` → no pre-step, falls through to `removeWorktree` (with --force)
4. dirty + no strategy → `skipped_dirty` + continue (NOT removed)

Key caller line (GitHub line 725):
```js
const p = exportWorktreeDiff(root, wt.path, wt.issue_number);
if (p) {
  buckets.exported.push(p);
} else {
  buckets.failed_preserve.push(wt.path);
  continue;
}
```

`removeWorktree` uses `git worktree remove --force` — removes regardless of dirty state.
Guard against data loss is entirely in the pre-step logic.

## 4. `stashWorktree()` — The Working Reference

`scripts/kaola-workflow-claim.js:135-143`

```js
function stashWorktree(wtPath, issueNumber) {
  try {
    execFileSync('git', ['-C', wtPath, 'stash', 'push', '-u', '-m', 'kaola-cleanup-issue-' + issueNumber],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}
```

`-u` = `--include-untracked`. This is why `--archive` correctly preserves untracked files.
The export path has no equivalent — it uses `git diff HEAD` which is tracked-only.

## 5. Test Coverage

### Framework
Hand-rolled assert, no external framework. `function assert(condition, msg)` throws on failure.

### Test Files
| File | Called by |
|------|-----------|
| `scripts/simulate-workflow-walkthrough.js` | `npm run test:kaola-workflow:claude` |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | `simulate-gitlab-workflow-walkthrough.js:87` via `run()` |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | `simulate-gitea-workflow-walkthrough.js:87` via `run()` |

### Relevant sub-cases (GitHub file, testStaleWorktreeCleanup starting line 1210)

| sc | line | args | what |
|----|------|------|------|
| sc1 | 1222 | (dry-run) | would_remove, would_delete_branch |
| sc2 | 1248 | --execute | clean worktree removed |
| sc3 | 1274 | --execute | dirty (untracked file) → skipped_dirty |
| sc4 | 1300 | --execute --archive | stash, then remove |
| **sc5** | **1330** | **--execute --export** | **modifies README.md (tracked) → patch, then remove** |
| sc6 | 1359 | --execute --force | force-remove dirty |
| sc7 | 1387 | --execute --keep-branch | branch preserved |
| sc8 | 1420 | --execute --archive | stash fails (index.lock) → failed_preserve |

**Gap**: sc5 uses `fs.writeFileSync(path.join(wtPath, 'README.md'), ...)` — a tracked file.
No test for untracked-only or mixed untracked+tracked dirty worktrees with `--export`.

GitLab sc5: `test-gitlab-workflow-scripts.js:1532-1557` (same pattern)
Gitea sc5: `test-gitea-workflow-scripts.js:1455-1480` (same pattern)

## 6. Export Artifact Naming

Directory: `{root}/kaola-workflow/archive/exports/`
Filename: `issue-{issueNumber}-{ts}.patch`
ts format: `new Date().toISOString().replace(/[:.]/g, '-')` → e.g. `2026-05-22T14-30-00-000Z`

## 7. Untracked File Detection Command

```bash
git -C {wtPath} ls-files --others --exclude-standard
```

Outputs newline-separated list of untracked files relative to wtPath.
Respects .gitignore. Returns empty if no untracked files.

## 8. No External Dependencies / Env Vars

No env vars affect the export path.
Only `--export` CLI flag dispatches to `exportWorktreeDiff`.
`KAOLA_WORKFLOW_OFFLINE` affects stale detection only.
No tar/zip utilities currently used anywhere in the codebase.
