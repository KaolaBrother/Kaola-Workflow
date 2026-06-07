# impl-legacy-editions node evidence — issue #273 Fix 1 Option B (GitLab + Gitea)

## Summary

Applied Option B (remove `would_delete_branch` from LEGACY dry-run output) to both GitLab and Gitea forge editions following the TDD Red-Green cycle.

---

## Step 1 — RED (test assertions added first)

Added identical absence assertion to both test files before the PASSED console.log in each legacy dry-run test function:

```js
assert(!('would_delete_branch' in out),
  'Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: ' + JSON.stringify(out));
```

### GitLab RED output
```
AssertionError [ERR_ASSERTION]: Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: {"dry_run":true,"would_remove":["/private/var/folders/.../kw-gl-264-legacy-cleanup-bVKnYH.kw/issue-264-legacy"],"would_delete_branch":["workflow/gitlab-issue-264-legacy"],"skipped_dirty":[]}
    at testGitlabLegacyWorktreeCleanupDryRun (.../test-gitlab-workflow-scripts.js:3191:7)
```

### Gitea RED output
```
AssertionError [ERR_ASSERTION]: Option B: legacy-worktree-cleanup dry-run must NOT emit would_delete_branch, got: {"dry_run":true,"would_remove":["/private/var/folders/.../kw-gt-264-legacy-cleanup-ny5EPl.kw/issue-264-legacy"],"would_delete_branch":["workflow/gitea-issue-264-legacy"],"skipped_dirty":[]}
    at testGiteaLegacyWorktreeCleanupDryRun (.../test-gitea-workflow-scripts.js:3157:7)
```

Both assertions genuinely failed — the subcommand was recognized (not SKIPPED) and the key was present in output.

---

## Step 2 — GREEN (claim file edits)

### Disambiguation anchor used

STALE region (DO NOT TOUCH) — identified by `deleted_branch` in `buckets`:
```js
const buckets = { removed: [], deleted_branch: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };
const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
```

LEGACY region (TARGET) — identified by NO `deleted_branch` in `buckets`:
```js
const buckets = { removed: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };
const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
```

The two-line anchor was used for Edit 1 to uniquely identify the LEGACY region.

### GitLab claim edits (`kaola-gitlab-workflow-claim.js`)

**Edit 1** — Two-line anchor replaced (L1235-1236):
```
OLD: const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
NEW: const dryBuckets = { would_remove: [], skipped_dirty: [] };
```

**Edit 2** — Deleted the push line from the LEGACY dry-run block (was L1250):
```
DELETED: if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);
```

STALE region at L960-961 / L975 left intact (different form: `if (!args.keepBranch)` without `branch &&` guard).

### Gitea claim edits (`kaola-gitea-workflow-claim.js`)

Identical edits applied. LEGACY region was at L1222-1223 and L1237.

**Edit 1** — Two-line anchor replaced:
```
OLD: const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
NEW: const dryBuckets = { would_remove: [], skipped_dirty: [] };
```

**Edit 2** — Deleted the push line from the LEGACY dry-run block:
```
DELETED: if (branch && !args.keepBranch) dryBuckets.would_delete_branch.push(branch);
```

STALE region at L947-948 / L962 left intact.

---

## Step 3 — GREEN verification

### Individual edition runs

GitLab:
```
testGitlabWorktreePathForHiddenLocal: PASSED (hasNewApi=true)
testGitlabLegacyWorktreeCleanupDryRun: PASSED
GitLab workflow script tests passed
```

Gitea:
```
testGiteaWorktreePathForHiddenLocal: PASSED (hasNewApi=true)
testGiteaLegacyWorktreeCleanupDryRun: PASSED
Gitea workflow script tests passed
```

### Full `npm test` (exit code 0)

All runners passed:
- Workflow walkthrough simulation passed
- Kaola-Workflow Codex contract validation passed
- Kaola-Workflow walkthrough simulation passed
- Kaola-Workflow GitLab contract validation passed
- GitLab workflow walkthrough simulation passed
- GitLab Codex workflow walkthrough simulation passed
- Kaola-Workflow Gitea contract validation passed
- Gitea workflow walkthrough simulation passed (including testGiteaAdaptive, testGitea237DotPathExtraction, etc.)

STALE cleanup tests (which DO assert `would_delete_branch` presence) continued to pass — stale regions were not touched.

---

## Surprises / Notes

None. Both editions matched the expected pre-edit state exactly. No partial pre-application was found (unlike impl-legacy-root). The two-line anchor correctly distinguished the LEGACY region from STALE in both files. The Edit tool left one blank line where the deleted push statement had been — this is harmless and structurally clean.
