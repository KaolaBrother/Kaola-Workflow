# Phase 3 - Plan: issue-160

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `docs/api.md` | Fix flag descriptions (lines 327-329), default-behavior bullet (line 339), JSON schema (lines 354-378) | Three factual errors vs actual implementation |
| `README.md` | Fix line 534 flag syntax from pipe to independent brackets + add precedence note | Pipe syntax implies mutual exclusivity which is false |
| `scripts/simulate-workflow-walkthrough.js` | Add sc11 multi-flag precedence test in `testStaleWorktreeCleanup()` | No test coverage for multi-flag precedence behavior |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add sc11 multi-flag precedence test in `testStaleWorktreeCleanup()` | Same gap in GitLab test suite |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add sc11 multi-flag precedence test in `testStaleWorktreeCleanup()` | Same gap in Gitea test suite |
| `CHANGELOG.md` | Add `### Fixed` + `### Tests` entries under `[Unreleased]` | Doc accuracy fix + new test coverage should be documented |

### Build Sequence
1. **Group A (parallel)**: Task 1 (docs/api.md), Task 2 (README.md), Task 6 (CHANGELOG.md) — pure text edits, no interdependencies. Task 6 must land before validation (CHANGELOG drift guard).
2. **Group B (parallel)**: Task 3, Task 4, Task 5 — three independent test files.
3. **Validation gate (sequential, after A+B)**: Run all three test suites.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2, 6 | Disjoint files (docs/api.md, README.md, CHANGELOG.md) |
| B | 3, 4, 5 | Disjoint files (simulate-workflow-walkthrough.js, test-gitlab-*.js, test-gitea-*.js) |

### External Dependencies
None. Node.js built-ins only (fs, path, os, child_process).

---

## Task List

### Task 1: Fix docs/api.md (3 surgical edits)

- File: `docs/api.md`
- Test File: N/A (doc only)
- Write Set: `docs/api.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY

**Edit 1a — Lines 327-329** (remove mutual-exclusivity language):

Replace these three lines:
```
- **`--archive`** — For dirty worktrees, stash uncommitted changes before removal. Changes are recoverable via `git stash list`. Mutually exclusive with `--export` and `--force`.
- **`--export`** — For dirty worktrees, write a patch file to `kaola-workflow/archive/exports/` before removal. Tracked changes are captured in a `.patch` file (recoverable via `git apply`). Untracked files (which `git diff` does not capture) are copied verbatim into a sibling `issue-N-{timestamp}-untracked/` sidecar directory, preserving their relative paths. Mutually exclusive with `--archive` and `--force`.
- **`--force`** — For dirty worktrees, discard all uncommitted changes without recovery. Mutually exclusive with `--archive` and `--export`.
```

With:
```
- **`--archive`** — For dirty worktrees, stash uncommitted changes before removal. Changes are recoverable via `git stash list`.
- **`--export`** — For dirty worktrees, write a patch file to `kaola-workflow/archive/exports/` before removal. Tracked changes are captured in a `.patch` file (recoverable via `git apply`). Untracked files (which `git diff` does not capture) are copied verbatim into a sibling `issue-N-{timestamp}-untracked/` sidecar directory, preserving their relative paths.
- **`--force`** — For dirty worktrees, discard all uncommitted changes without recovery.
```

Then add after the `--keep-branch` bullet (after line 330), a new paragraph:
```
When no strategy flag (`--archive`, `--export`, or `--force`) is given, dirty worktrees are skipped and reported in the `skipped_dirty` field; no changes are made to them. When more than one strategy flag is given, they are not mutually exclusive and no error is raised — a silent precedence applies: `--archive` takes effect first, then `--export`, then `--force` (`archive > export > force`).
```

**Edit 1b — Line 339** (rewrite the "default if no other strategy" bullet):

Change:
```
   - With `--archive` (default if no other strategy specified): Changes are stashed; worktree is removed. User can recover via `git stash list` and `git stash pop`.
```

To two bullets:
```
   - No strategy flag: dirty worktrees are skipped and reported in `skipped_dirty`. No changes are made to them.
   - With `--archive`: Changes are stashed; worktree is removed. User can recover via `git stash list` and `git stash pop`.
```

Lines 340-341 (`--export`/`--force` bullets) stay as-is.

**Edit 1c — Lines 354-378** (replace fabricated JSON schema with two accurate blocks):

Replace the existing single JSON block (which contains `strategy`, `execute`, `keep_branch`, `summary{}`, `details[]` — none of which exist in actual output) with two clearly labeled blocks:

```
**Dry-run** (no `--execute`):

\`\`\`json
{
  "dry_run": true,
  "would_remove": [],
  "would_delete_branch": [],
  "skipped_dirty": []
}
\`\`\`

**Execute** (`--execute`):

\`\`\`json
{
  "dry_run": false,
  "removed": [],
  "deleted_branch": [],
  "skipped_dirty": [],
  "stashed": [],
  "exported": [],
  "failed_preserve": []
}
\`\`\`
```

Source: `scripts/kaola-workflow-claim.js:711-712, 785-787`.

- Validate: visual/manual review.

---

### Task 2: Fix README.md line 534

- File: `README.md`
- Test File: N/A
- Write Set: `README.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY

Find the table row containing `stale-worktree-cleanup` in the subcommand table (line ~534). The current flag syntax is:
```
[--archive\|--export\|--force]
```
Change it to:
```
[--archive] [--export] [--force]
```
Also append to the description column of that row:
```
(no flag = skip dirty; precedence when combined: archive > export > force)
```

**Critical**: preserve markdown table integrity — no raw unescaped `|` inside the cell.

- Validate: visual/manual review.

---

### Task 3: Add sc11 to simulate-workflow-walkthrough.js (GitHub)

- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same file
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: none
- Parallel Group: B
- Action: MODIFY

Insert immediately before the `console.log('testStaleWorktreeCleanup: PASSED');` line (which closes `testStaleWorktreeCleanup()`), after the sc10 block. Use issue **200** (shims only mark 200 as closed — confirmed by grep). `writeGhShim(binDir)` is already defined in-function; do NOT call it before sc11, only inside sc11's block (consistent with sc4-sc10 pattern):

```js
  // Sub-case 11: multi-flag precedence — dirty worktree + --execute --archive --export (archive wins)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGhShim(binDir);
      const wtPath = path.join(kwRoot, 'wt-cleanup-200');
      fs.mkdirSync(kwRoot, { recursive: true });
      spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-200', '--', wtPath, 'HEAD'], {
        cwd: tmp, encoding: 'utf8'
      });
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive', '--export'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc11: archive must win — stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.exported) && out.exported.length === 0,
        'sc11: export must not fire when archive present, got: ' + JSON.stringify(out.exported));
      assert(!out.failed_preserve || out.failed_preserve.length === 0,
        'sc11: failed_preserve must be empty, got: ' + JSON.stringify(out.failed_preserve));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc11: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc11: worktree dir must be removed after archive+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }
```

- Validate: `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, exit 0.

---

### Task 4: Add sc11 to test-gitlab-workflow-scripts.js

- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Test File: same file
- Write Set: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Depends On: none
- Parallel Group: B
- Action: MODIFY

Insert immediately before the `console.log('testStaleWorktreeCleanup: PASSED');` line. Mirror sc4 from this suite: use `addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath)` helper, `writeGlabShimForStale(binDir)`, `wtPath = path.join(kwRoot, 'issue-200')`. Use issue **200**:

```js
  // Sub-case 11: multi-flag precedence — dirty worktree + --execute --archive --export (archive wins)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeGlabShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive', '--export'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc11: archive must win — stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.exported) && out.exported.length === 0,
        'sc11: export must not fire when archive present, got: ' + JSON.stringify(out.exported));
      assert(!out.failed_preserve || out.failed_preserve.length === 0,
        'sc11: failed_preserve must be empty, got: ' + JSON.stringify(out.failed_preserve));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc11: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc11: worktree dir must be removed after archive+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }
```

- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → pass line, exit 0.

---

### Task 5: Add sc11 to test-gitea-workflow-scripts.js

- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Test File: same file
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Depends On: none
- Parallel Group: B
- Action: MODIFY

Insert immediately before the `console.log('testStaleWorktreeCleanup: PASSED');` line. Mirror sc4 from this suite: use `addWorktree(tmp, 'workflow/gitea-issue-200', wtPath)` helper, `writeTeaShimForStale(binDir)`, `wtPath = path.join(kwRoot, 'issue-200')`. Use issue **200**:

```js
  // Sub-case 11: multi-flag precedence — dirty worktree + --execute --archive --export (archive wins)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-stale-cleanup-sc11-')));
    const kwRoot = tmp + '.kw';
    const binDir = path.join(tmp, 'bin');
    try {
      initGitRepo(tmp);
      writeTeaShimForStale(binDir);
      const wtPath = path.join(kwRoot, 'issue-200');
      addWorktree(tmp, 'workflow/gitea-issue-200', wtPath);
      fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'x');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--archive', '--export'], tmp, binDir);
      assert(Array.isArray(out.stashed) && out.stashed.some(p => p === wtPath),
        'sc11: archive must win — stashed must contain wtPath, got: ' + JSON.stringify(out.stashed));
      assert(Array.isArray(out.exported) && out.exported.length === 0,
        'sc11: export must not fire when archive present, got: ' + JSON.stringify(out.exported));
      assert(!out.failed_preserve || out.failed_preserve.length === 0,
        'sc11: failed_preserve must be empty, got: ' + JSON.stringify(out.failed_preserve));
      assert(Array.isArray(out.removed) && out.removed.some(p => p === wtPath),
        'sc11: removed must contain wtPath, got: ' + JSON.stringify(out.removed));
      assert(!fs.existsSync(wtPath), 'sc11: worktree dir must be removed after archive+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }
```

- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → pass line, exit 0.

---

### Task 6: CHANGELOG.md

- File: `CHANGELOG.md`
- Test File: N/A
- Write Set: `CHANGELOG.md`
- Depends On: none
- Parallel Group: A
- Action: MODIFY

Read the `[Unreleased]` section first. It currently has `### Added` (line 5) and `### Fixed` (line 9). No `### Tests` subsection exists yet in `[Unreleased]`.

Add under `### Fixed` (existing subsection):
```
- Fix `stale-worktree-cleanup` API docs: describe actual skip behavior when no strategy flag is given (dirty worktrees are skipped, not archived by default), correct silent-precedence behavior (archive > export > force when multiple flags given), and replace fabricated JSON schema with accurate dry-run and execute output shapes (#160)
```

Add a new `### Tests` subsection after `### Fixed`:
```
### Tests

- Add sc11 multi-flag precedence test for `stale-worktree-cleanup`: `--archive --export` verifies archive strategy wins over export (#160)
```

- Validate: exercised by Task 3 walkthrough run (CHANGELOG drift guard checks version heading presence, not Unreleased content).

---

## Advisor Notes

- Issue 200 confirmed by grep as the correct issue number for all 3 suites (shims mark issue 200 closed; isolation is per-test temp dir, not issue number).
- JSON blocks in Edit 1c: use markdown bold headers outside fences, not `//` comments inside fenced JSON (which is invalid JSON).
- CHANGELOG `[Unreleased]` already has `### Added` and `### Fixed`; create `### Tests` subsection for sc11 entry.
- `docs/api.md` line 352 inaccuracy is explicitly out-of-scope.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | Blueprint complete; no gaps requiring revision |
