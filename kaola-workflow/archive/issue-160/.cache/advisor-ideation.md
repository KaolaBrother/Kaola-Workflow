# Advisor — Ideation Gate: issue-160

## Advisor Review Summary

### Verdict
Option A (fix docs to match code) is confirmed correct. No gotchas that change the decision.

### Gaps the Advisor Flagged (Verified)

**1. CLI help/usage text in claim scripts**
Grep result: usage strings only list subcommand names, no behavioral claims about flags. No changes needed.

**2. Plugin-edition READMEs**
Grep result: no plugin README contains stale-worktree-cleanup content. `plugins/kaola-workflow-gitlab/`, `plugins/kaola-workflow-gitea/`, `plugins/kaola-workflow/` all clean. No changes needed.

**3. --keep-branch flag docs (docs/api.md:330)**
Content: "Remove the git worktree but preserve the local branch." This is correct — `keepBranch` controls branch deletion, not dirty-worktree handling. No fix needed for this line. However `keep_branch: false` appears in the fabricated JSON schema at line 359 — this should be removed since the output does not contain `keep_branch` as a field.

**4. Contracts validator**
`validate-kaola-workflow-gitlab-contracts.js:359` asserts `testStaleWorktreeCleanup` by *name* only (as part of a concept check). No sub-case count is hardcoded. Adding sc11 does not break the validator.

**5. sc11 additional assertion (advisor)**
Also assert `failed_preserve` is absent or empty — prevents a false-positive pass if the test environment's git stash behaves unexpectedly.

### Confirmed Actual JSON Shapes

**Dry-run** (`{ dry_run: true, ...dryBuckets }`):
```json
{
  "dry_run": true,
  "would_remove": [],
  "would_delete_branch": [],
  "skipped_dirty": []
}
```

**Execute** (`{ dry_run: false, ...buckets }`):
```json
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

The fabricated docs/api.md schema had: `strategy`, `execute`, `keep_branch`, `summary.worktrees_removed`, `summary.worktrees_pending`, `summary.branches_deleted`, `summary.branches_pending`, `summary.patches_exported`, `summary.changes_stashed`, `details[]` — none of these exist in the actual output.

### Recommendation
**Option A confirmed.** The full scope of doc changes:
- `docs/api.md` lines 327-330: remove "Mutually exclusive" → describe precedence + skip-by-default
- `docs/api.md` line 339: rewrite to describe skip behavior when no flag given
- `docs/api.md` lines 354-378: replace fabricated single schema with two accurate blocks (dry-run and execute shapes)
- `README.md` line 534: change `[--archive|--export|--force]` to `[--archive] [--export] [--force]` with precedence note
- sc11 in all 3 test suites: multi-flag test `--archive --export`, assert `stashed` has dirty worktree, `exported` is empty, `failed_preserve` is empty/absent, `removed` has dirty worktree
- `CHANGELOG.md`: add Unreleased entry

No code changes to any claim script.
