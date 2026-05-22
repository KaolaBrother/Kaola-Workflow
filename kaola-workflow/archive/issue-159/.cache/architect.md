# Code Architect — issue-159

## Design Decisions

- **Option A confirmed against source.** All 4 implementation files match the buggy snippet exactly (verified line-for-line). The fix is identical text in each; only surrounding line numbers differ. The caller change is `push(p)` → `push(...p)` in all 4.
- **`exportWorktreeDiff` returns `string[]` (always ≥ `[patchPath]`), or `null` on throw.** The `null`-on-throw contract is unchanged, so `failed_preserve` still triggers exactly as before. The new `ls-files` + `copyFileSync` calls live *inside* the existing `try` block, so any mid-copy failure → `null` → `failed_preserve`. Do not restructure the try/catch.
- **Tests-first, but the Phase 1 test sketch is NOT usable as written.** The real harness requires: `fs.realpathSync(mkdtempSync(...))`, a separate `kwRoot = tmp + '.kw'`, a `binDir` with an edition-specific forge shim, branch `workflow/[edition-]issue-200` (only issue 200 is shimmed "closed"), and `runClaimOnline(args, tmp, binDir)` (3 positional args). Blueprint encodes the real conventions.
- **sc9/sc10 go after sc8** (immediately before the `PASSED` log) in all 3 test files. GitLab/Gitea use their inner `addWorktree(repoRoot, branch, wtPath)` helper.
- **Codex/plugin mirror gets impl-only.** `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` has no stale-cleanup tests; fix implementation + caller only.
- **`issue_number` is parsed from the branch name** in all editions, so `workflow/gitlab-issue-200` → `200` → patch filename `issue-200-*.patch`.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/simulate-workflow-walkthrough.js` | Add sc9 + sc10 after sc8 (before PASSED log), GitHub conventions | P1 (tests-first) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add sc9 + sc10 after sc8 (before PASSED log), GitLab conventions | P1 (tests-first) |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add sc9 + sc10 after sc8 (before PASSED log), Gitea conventions | P1 (tests-first) |
| `scripts/kaola-workflow-claim.js` | `exportWorktreeDiff` 145-158 → sidecar fix; caller 727 `push(p)`→`push(...p)` | P2 (impl) |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | `exportWorktreeDiff` 145-158 → sidecar fix; caller 727 `push(p)`→`push(...p)` | P2 (impl) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | `exportWorktreeDiff` 154-167 → sidecar fix; caller 730 `push(p)`→`push(...p)` | P2 (impl) |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | `exportWorktreeDiff` 149-162 → sidecar fix; caller 715 `push(p)`→`push(...p)` | P2 (impl) |
| `docs/api.md` | Lines 328 + 340: describe sidecar dir for untracked files | P3 (docs) |

## Files to Create

None. (No manifest/index in the sidecar dir, per scope.)

## Data Flow

`stale-worktree-cleanup --execute --export` → for each dirty worktree → `exportWorktreeDiff(root, wt.path, wt.issue_number)`:
1. `git -C wtPath ls-files --others --exclude-standard` → newline list of untracked files (respects `.gitignore` — `--exclude-standard` is load-bearing).
2. `git -C wtPath diff HEAD` → tracked diff → written to `kaola-workflow/archive/exports/issue-N-{ts}.patch`. `artifacts = [patchPath]`.
3. If untracked files exist: copy each into `kaola-workflow/archive/exports/issue-N-{ts}-untracked/<relpath>` (recreate subdirs via `mkdirSync({recursive:true})` on `path.dirname(dest)`), then `artifacts.push(untrackedDir)`.
4. Return `artifacts` (≥1 element), or `null` if anything threw.

Caller: `const p = exportWorktreeDiff(...); if (p) { buckets.exported.push(...p); } else { buckets.failed_preserve.push(wt.path); continue; }`.

## Exact implementation patch (identical in all 4 claim files)

```js
function exportWorktreeDiff(root, wtPath, issueNumber) {
  try {
    const exportsDir = path.join(root, 'kaola-workflow', 'archive', 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const untrackedOut = execFileSync('git', ['-C', wtPath, 'ls-files', '--others', '--exclude-standard'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const untrackedFiles = untrackedOut.trim().split('\n').filter(Boolean);
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

Caller (each file): `buckets.exported.push(p);` → `buckets.exported.push(...p);`

## sc9/sc10 test code — GitHub edition (before PASSED log in testStaleWorktreeCleanup)

```js
  // Sub-case 9: untracked-only export
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc9-')));
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
      fs.writeFileSync(path.join(wtPath, 'untracked.txt'), 'hello untracked\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length >= 2,
        'sc9: exported must include patch + sidecar, got: ' + JSON.stringify(out.exported));
      const sidecars = out.exported.filter(p => p.endsWith('-untracked'));
      assert(sidecars.length === 1, 'sc9: exactly one sidecar dir, got: ' + JSON.stringify(out.exported));
      assert(fs.existsSync(path.join(sidecars[0], 'untracked.txt')),
        'sc9: untracked file must be preserved in sidecar');
      assert(!out.failed_preserve || !out.failed_preserve.some(p => p === wtPath),
        'sc9: must NOT land in failed_preserve');
      assert(!fs.existsSync(wtPath), 'sc9: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // Sub-case 10: mixed (tracked + untracked) export
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-stale-cleanup-sc10-')));
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
      fs.writeFileSync(path.join(wtPath, 'README.md'), 'modified tracked\n');
      fs.writeFileSync(path.join(wtPath, 'new-untracked.txt'), 'new file\n');
      const out = runClaimOnline(['stale-worktree-cleanup', '--execute', '--export'], tmp, binDir);
      assert(Array.isArray(out.exported) && out.exported.length >= 2,
        'sc10: exported must include patch + sidecar, got: ' + JSON.stringify(out.exported));
      const patches = out.exported.filter(p => p.endsWith('.patch'));
      assert(patches.length === 1, 'sc10: exactly one patch file');
      assert(fs.statSync(patches[0]).size > 0, 'sc10: patch must be non-empty');
      const sidecars = out.exported.filter(p => p.endsWith('-untracked'));
      assert(sidecars.length === 1, 'sc10: exactly one sidecar dir');
      assert(fs.existsSync(path.join(sidecars[0], 'new-untracked.txt')),
        'sc10: untracked file must be preserved in sidecar');
      assert(!fs.existsSync(wtPath), 'sc10: worktree dir must be removed after export+execute');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
      try { fs.rmSync(kwRoot, { recursive: true, force: true }); } catch (_) {}
    }
  }
```

## sc9/sc10 — GitLab edition (test-gitlab-workflow-scripts.js, before PASSED log)

Identical structure with: `writeGlabShimForStale`; tmp prefix `kw-gl-stale-cleanup-sc9-`/`-sc10-`; branch `workflow/gitlab-issue-200`; worktree path `path.join(kwRoot, 'issue-200')`; use inner `addWorktree(tmp, 'workflow/gitlab-issue-200', wtPath)` instead of inline `spawnSync`.

## sc9/sc10 — Gitea edition (test-gitea-workflow-scripts.js, before PASSED log)

Identical to GitLab with: `writeTeaShimForStale`; tmp prefix `kw-gt-stale-cleanup-sc9-`/`-sc10-`; branch `workflow/gitea-issue-200`; inner `addWorktree`.

## docs/api.md edits

- **Line 328** — append after existing `--export` sentence: ` Untracked files (which git diff does not capture) are copied verbatim into a sibling issue-N-{timestamp}-untracked/ sidecar directory, preserving their relative paths.`
- **Line 340** — update `--export` behavior bullet to note both the `.patch` (tracked changes) and the `-untracked/` sidecar dir (untracked files), and that recovery is `git apply` for the patch plus copying files back from the sidecar.

## Build Sequence (tests-first)

1. **Group T (parallel):** Add sc9 + sc10 to all 3 test files.
2. **Verify tests-first honored:** Run all 3 validation commands — EXPECT FAILURE. Predicted failure: `exportWorktreeDiff` returns single string `patchPath`; `push(p)` so `out.exported` has length 1; sc9's `length >= 2` assertion fails.
3. **Group I (parallel, after step 2):** Apply `exportWorktreeDiff` + caller fix to all 4 claim files.
4. **Group D (independent):** Update docs/api.md.
5. **Re-run all 3 validation commands — EXPECT PASS.**

## Task Ownership and Write Sets

| Task | Write Set |
|------|-----------|
| T-gh | `scripts/simulate-workflow-walkthrough.js` |
| T-gl | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` |
| T-gt | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` |
| I-gh | `scripts/kaola-workflow-claim.js` |
| I-codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` |
| I-gl | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` |
| I-gt | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` |
| D | `docs/api.md` |

## Parallelization Groups

- **Group T:** {T-gh, T-gl, T-gt} — 3-way parallel (disjoint write sets).
- **Group I:** {I-gh, I-codex, I-gl, I-gt} — 4-way parallel (disjoint write sets). After Group T verify-fail.
- **Group D:** {D} — fully independent, can run concurrently with T or I.

## Exact Validation Commands

```bash
node scripts/simulate-workflow-walkthrough.js
node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js
```

All three must exit 0. GitHub: prints "Workflow walkthrough simulation passed". All three print "testStaleWorktreeCleanup: PASSED".

## Out of Scope

- No manifest/index file in sidecar dir
- No dedup/hashing
- No new CLI flags
- No `git stash create` roundtrip
- No tar/external tooling
- No refactor of `failed_preserve` mechanism
- No new tests in the Codex plugin — implementation fix only

## Key Notes

- Keep new `ls-files` and `copyFileSync` calls *inside* the existing `try` block; do not split the try/catch.
- `--exclude-standard` on `git ls-files --others` is load-bearing (respects `.gitignore`).
- Implementation patch text is byte-identical across all 4 claim files; only line numbers differ (caller lines: GitHub/Codex 727, GitLab 730, Gitea 715).
