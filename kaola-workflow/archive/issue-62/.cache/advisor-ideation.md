# Phase 2 - Advisor Gate (issue-62)

## Verdict on planner recommendation

Option A is correct. Cheap-but-verified cleanup is correct.

## Reasoning

Phase 6 Step 8a (artifact mirror) is documented as running BEFORE Step 8b (cmdFinalize). That makes `linked ⊇ main` an invariant at archive time. If that invariant ever breaks, the fix belongs in the mirror or ordering — not in a sentinel directory that hides the breakage. `mainleak-{ts}/` adds surface without value. Skip it.

For `cmdRelease`: discarding means discarding. The user typed `release`. Sentinel preservation surprises more than `rmSync` does.

For `cmdWatchPr`: `mainRoot === root` → cleanup never runs. Untouched as required.

## Watchpoints carried to Phase 3

1. **`realpathSync` on both sides of comparison** — handles macOS `/tmp` vs `/private/tmp` and `/var/folders` symlinks. This is the real failure mode, not the policy.
2. **Verify `getCoordRoot` shape from main worktree once** — should return `<main>/.git` absolute or `.git` relative, both stripped by `mainRootFromCoord` to yield `<main>`. Trace with one `console.error` in a throwaway test.
3. **Don't add the `main_repo_cleanup` return field** — keep `archiveProjectDir`'s return shape stable to avoid test churn. The simulator can verify by checking the filesystem directly.
4. **Regression test must cover THREE cases**, not two:
   - finalize from linked worktree → main cleaned
   - main-root caller (KAOLA_WORKTREE_NATIVE=0 equivalent) → no error, archive present, no spurious behavior
   - `cmdRelease` from linked worktree → main cleaned (this is the test that proves Option A vs Option B — without it, the test passes for either)
5. **GitLab mirror needs `mainRootFromCoord` ported first** — confirm in build order.

## Decision

Proceed to Phase 3 with Option A, cheap-but-verified policy, three-case regression test.
