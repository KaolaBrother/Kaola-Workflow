# Advisor Ideation Review — Issue #89

## Summary

Approach C is correct. Five refinements to apply:

### 1. closeLinkedIssue: Option A

Use **Option A**: keep `closeLinkedIssue` untouched for the legacy `skipGit` path. Add inline close logic in `postMergeCleanup` for the new pipeline. The close must be gated on `!OFFLINE && args.issue != null`. Do NOT modify `closeLinkedIssue` to serve both paths — that would tangle the legacy seam.

### 2. Explicit Pipeline Order

The `finalValidationPassed` check must run **before** the worktree escape (chdir + removeWorktree). Correct order:

```
0. finalValidationPassed check (GitLab extra gate)
1. chdir(os.tmpdir()) + removeWorktree + register exit hook
2. git fetch origin (skip if OFFLINE)
3. git checkout branch
4. merge-base skip-check
5. doRebase
6. npm test (skip if alreadyUpToDate or OFFLINE)
7. ffMergeLoop → exit 2 if exhausted
8. postMergeCleanup (push → classify → receipt on fail; closeIssue + createNote + branch delete on success)
```

### 3. GitLab Walkthrough Confirmed

Both `simulate-gitlab-workflow-walkthrough.js` and `simulate-gitlab-codex-workflow-walkthrough.js` exist. The Phase 6 exit-code validation runs the sink-merge script directly via Phase 6 orchestration, not via the walkthrough. Phase 4 validates via `node test-gitlab-sinks.js`.

### 4. Tighten classifyMergeError Patterns

Drop `server rejected` — too generic, will match unrelated push errors. Replace with explicit GitLab-specific patterns:

```js
function classifyMergeError(e) {
  const msg = (e.stderr || e.message || '');
  const token = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE;
  if (token) return token;
  if (/protected branch|pre-receive hook declined/i.test(msg)) return 'branch_protected';
  if (/rejected/.test(msg) && /non-fast-forward/.test(msg)) return 'non_fast_forward';
  if (/conflicts with target/i.test(msg)) return 'non_fast_forward';
  if (/permission denied|403|not authorized|not allowed to push|not allowed to merge/i.test(msg)) return 'permission_denied';
  return null;
}
```

### 5. FORCE_FF_FAIL Semantics

`KAOLA_WORKFLOW_FORCE_FF_FAIL=N` means fail the first N FF merge attempts **inside the retry loop** (counter is per-attempt, decremented each iteration). `FORCE_FF_FAIL=3` with `MAX_AUTOMERGE_RETRIES=3` means all 3 attempts fail → `ffMergeLoop` returns false → exit 2. This matches the GitHub reference behavior.

## Verdict

Approach C is sound. No missed approaches. Risks are accurately assessed. Apply the five refinements above and proceed to Phase 3.
