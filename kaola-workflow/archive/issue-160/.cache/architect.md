# Architect — issue-160

## Design Decisions

- **Decision 1: Docs follow code, no code changes.** All four `*-claim.js` scripts already implement skip-on-no-flag and silent `archive > export > force` precedence (verified at `scripts/kaola-workflow-claim.js:711-789`). The docs are wrong; the code is right. Fix docs only.
- **Decision 2: Use issue number `200`, NOT `211`.** The shims return `{"state":"closed"}` only for issue 200 (GitHub shim at `simulate-workflow-walkthrough.js:1216`; GitLab `writeGlabShimForStale`; Gitea `writeTeaShimForStale`). A `workflow/issue-211` worktree would land in `active_worktrees` and never be stale — sc11 assertions would fail against `[]`. **sc11 must use 200 in all three suites.**
- **Decision 3: sc11 mirrors sc4 (the archive-wins template) exactly,** adding `--export` to the invocation and three extra assertions. sc4 is structurally identical across all three editions.
- **Decision 4: Two accurate JSON blocks replace the fabricated schema** — dry-run shape and execute shape, taken verbatim from the bucket initializers at `scripts/kaola-workflow-claim.js:711-712, 785-787`.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `docs/api.md` | Fix flag descriptions (327-329), default-behavior bullet (339), JSON schema (354-378) | P1 |
| `README.md` | Fix line 534 flag syntax + add precedence note | P1 |
| `scripts/simulate-workflow-walkthrough.js` | Add sc11 after sc10 (insert before line 1513) | P2 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add sc11 after sc10 (insert before line 1698) | P2 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add sc11 after sc10 (insert before line 1621) | P2 |
| `CHANGELOG.md` | Add `### Fixed` + `### Tests` entries under `[Unreleased]` | P3 |

## Files to Create
None.

---

## Task 1 — `docs/api.md` (3 surgical edits)

**Edit 1a — lines 327-329** (remove mutual-exclusivity language, document precedence + skip). Replace the three flag bullets with:

```
- **`--archive`** — For dirty worktrees, stash uncommitted changes before removal. Changes are recoverable via `git stash list`.
- **`--export`** — For dirty worktrees, write a patch file to `kaola-workflow/archive/exports/` before removal. Tracked changes are captured in a `.patch` file (recoverable via `git apply`). Untracked files (which `git diff` does not capture) are copied verbatim into a sibling `issue-N-{timestamp}-untracked/` sidecar directory, preserving their relative paths.
- **`--force`** — For dirty worktrees, discard all uncommitted changes without recovery.
```

Then add an explanatory paragraph immediately after the `--keep-branch` bullet (after line 330):

```
When no strategy flag (`--archive`, `--export`, or `--force`) is given, dirty worktrees are skipped and reported in the `skipped_dirty` field; no changes are made to them. When more than one strategy flag is given, they are not mutually exclusive and no error is raised — a silent precedence applies: `--archive` takes effect first, then `--export`, then `--force` (`archive > export > force`).
```

**Edit 1b — line 339** (rewrite the WRONG "default if no other strategy" bullet). Change from:
```
   - With `--archive` (default if no other strategy specified): Changes are stashed; worktree is removed. User can recover via `git stash list` and `git stash pop`.
```
to:
```
   - No strategy flag: dirty worktrees are skipped and reported in `skipped_dirty`. No changes are made to them.
   - With `--archive`: Changes are stashed; worktree is removed. User can recover via `git stash list` and `git stash pop`.
```
(Lines 340-341 `--export`/`--force` bullets stay as-is.)

**Edit 1c — lines 354-378** (replace fabricated schema with two accurate blocks). Replace the single JSON block with:

```json
// Dry-run (no --execute)
{
  "dry_run": true,
  "would_remove": [],
  "would_delete_branch": [],
  "skipped_dirty": []
}
```

```json
// Execute (--execute)
{
  "dry_run": false,
  "removed": [],
  "deleted_branch": [],
  "skipped_dirty": [],
  "stashed": [],
  "exported": [],
  "failed_preserve": []
}
```

Do NOT keep `strategy`, `execute`, `keep_branch`, `summary`, `details`, `changes_stashed`, or `patches_exported`.

**Validation:** visual/manual (doc only).

---

## Task 2 — `README.md` line 534 (1 edit)

Change the flag-syntax fragment from `[--archive\|--export\|--force]` to:
```
[--archive] [--export] [--force]
```
and append to description: `(no flag = skip dirty; precedence when combined: archive > export > force)`

Preserve markdown table integrity — no raw unescaped `|` inside the cell.

**Validation:** visual/manual.

---

## Task 3 — `scripts/simulate-workflow-walkthrough.js` sc11 (GitHub)

Insert immediately before the `console.log('testStaleWorktreeCleanup: PASSED');` line, after sc10 closes. Use issue **200** and `writeGhShim` (already defined in-function):

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

**Validation:** `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, exit 0.

---

## Task 4 — `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` sc11

Insert immediately before the `console.log('testStaleWorktreeCleanup: PASSED');` line, after sc10 closes. Uses `addWorktree` helper and `writeGlabShimForStale`, branch `workflow/gitlab-issue-200`:

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

**Validation:** `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → pass line, exit 0.

---

## Task 5 — `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` sc11

Insert immediately before the `console.log('testStaleWorktreeCleanup: PASSED');` line, after sc10 closes. Uses `addWorktree` helper and `writeTeaShimForStale`, branch `workflow/gitea-issue-200`:

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

**Validation:** `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → pass line, exit 0.

---

## Task 6 — `CHANGELOG.md`

Read `[Unreleased]` section first. Add under `### Fixed`:
```
- Fix `stale-worktree-cleanup` API docs: describe actual skip behavior when no strategy flag is given (dirty worktrees are skipped, not archived by default), correct silent-precedence behavior (archive > export > force when multiple flags given), and replace fabricated JSON schema with accurate dry-run and execute output shapes (#160)
```
Add under `### Tests`:
```
- Add sc11 multi-flag precedence test for `stale-worktree-cleanup`: `--archive --export` verifies archive strategy wins over export (#160)
```

**Validation:** exercised by Task 3's walkthrough run (CHANGELOG drift guard).

---

## Build Sequence

1. **Group A (parallel): Tasks 1, 2, 6** — docs/changelog, pure text, no interdependencies. Task 6 must complete before Group B validation runs (CHANGELOG drift guard).
2. **Group B (parallel): Tasks 3, 4, 5** — three independent test files. Each extends existing `testStaleWorktreeCleanup()`.
3. **Validation gate (sequential, after A+B):**
   - `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed`, exit 0
   - `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → pass, exit 0
   - `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → pass, exit 0

## Out-of-Scope

- No changes to any `*-claim.js` script
- Do NOT use issue 211 — use 200 (shims only mark 200 as closed)
- `docs/api.md` line 352 lead-in is also inaccurate but out of scope for this issue
- No new sub-cases beyond sc11
- No new helpers — reuse existing shim writers and `addWorktree`
- No reformatting of untouched lines
