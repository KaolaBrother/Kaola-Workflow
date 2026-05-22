# Code Explorer — issue-160

## Implementation vs Documentation Discrepancies

### Argument Parsing (identical in all 4 editions, lines 30-35)

All four editions parse flags as independent booleans with NO mutual-exclusivity validation:
```js
if (key === '--force')       { args.force = true; continue; }
if (key === '--archive')     { args.archive = true; continue; }
if (key === '--export')      { args.export = true; continue; }
if (key === '--keep-branch') { args.keepBranch = true; continue; }
```
Multiple strategy flags are silently accepted; all three booleans can be true simultaneously.

### Dirty-worktree Strategy Selection (GitHub: lines 719-748; GitLab: ~same; Gitea: ~same)

**Skip guard (line 719):**
```js
if (state === 'dirty' && !(args.archive || args.export || args.force)) {
  (dryRun ? dryBuckets : buckets).skipped_dirty.push(wt.path);
  continue;
}
```
No strategy flag → dirty worktrees are **skipped** (pushed to `skipped_dirty`), NOT archived.

**Strategy precedence (if/else chain):**
```js
if (args.archive) {      // wins over everything
  // stash → stashed or failed_preserve
} else if (args.export) { // wins over force
  // patch + sidecar → exported or failed_preserve
}
// --force: implicit fall-through; removeWorktree passes --force to git
```

**Actual precedence: archive > export > force.** If multiple flags set, only highest-priority branch fires. This is NOT enforced with an error — silent precedence.

### All 4 Editions Are Identical

| Edition | File | cmdStaleWorktreeCleanup start |
|---------|------|-------------------------------|
| GitHub | `scripts/kaola-workflow-claim.js` | line 697 |
| Codex | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | line 697 |
| GitLab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | line 700 |
| Gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | line 685 |

### Current Documentation (docs/api.md)

**Line 327-330 — Mutual exclusivity claims (WRONG):**
- `--archive`: "Mutually exclusive with `--export` and `--force`."
- `--export`: "Mutually exclusive with `--archive` and `--force`."
- `--force`: "Mutually exclusive with `--archive` and `--export`."

**Line 339 — Default behavior claim (WRONG):**
```
- With `--archive` (default if no other strategy specified): Changes are stashed; worktree is removed.
```

The code actually **skips** dirty worktrees when no flag is given.

**Lines 354-378 — JSON schema (WRONG field names):**
Shows `"strategy": "archive|export|force"` and `"changes_stashed"`, `"patches_exported"`.
Actual fields are: `stashed`, `exported`, `skipped_dirty`, `failed_preserve`, `removed`, `deleted_branch`.

### README.md (line 534)

Uses `[--archive|--export|--force]` syntax (implies mutual exclusivity). Does NOT claim archive-as-default. Most accurate of the three doc locations.

### Existing Test Coverage

| Sub-case | File | Line | Scenario | Validates |
|----------|------|------|----------|-----------|
| sc3 | simulate-workflow-walkthrough.js | 1274 | Dirty worktree, no strategy flag | `skipped_dirty` (skip behavior) |
| sc4 | simulate-workflow-walkthrough.js | 1300 | `--archive` | stash path |
| sc5 | simulate-workflow-walkthrough.js | 1329 | `--export` tracked | export path |
| sc6 | simulate-workflow-walkthrough.js | 1359 | `--force` | force path |
| sc9 | simulate-workflow-walkthrough.js | 1450 | `--export` untracked | sidecar path |
| sc10 | simulate-workflow-walkthrough.js | 1481 | `--export` mixed | sidecar path |

**sc3** directly validates the skip behavior (contradicting the doc claim).
**No test covers multiple simultaneous strategy flags.** The precedence behavior is untested.

GitLab and Gitea test files have parallel sc1-sc10 sub-cases with identical semantics.

### Discrepancy Summary

| Claim | docs/api.md | Code | README | Tests |
|-------|-------------|------|--------|-------|
| Default for dirty worktrees | `--archive` (WRONG) | **skip** | silent | **skip** (sc3) |
| Mutual exclusivity | enforced (WRONG) | **not enforced** | implied by pipe | untested |
| Multiple flags | error | **silent precedence** (archive>export>force) | not described | no coverage |

### Options for Resolution

**Option A — Fix docs to match code (no code changes):**
- Update `docs/api.md` line 339: "dirty worktrees are skipped when no strategy flag is given" 
- Update `docs/api.md` lines 327-330: remove "mutually exclusive" → describe silent precedence (archive > export > force)
- Update `docs/api.md` lines 354-378: fix JSON schema field names
- Update `README.md` line 534: `[--archive|--export|--force]` → `[--archive] [--export] [--force]` or add precedence note
- Add tests for multi-flag precedence (sc11: --archive --export, sc12: --archive --force)

**Option B — Fix code to match docs:**
- Add mutex validation in `cmdStaleWorktreeCleanup()` — error if more than one of `--archive`/`--export`/`--force` given
- Add `--archive`-as-default logic for dirty worktrees when no flag given
- Rewrite sc3 (currently tests skip behavior; would need to test archive behavior)
- Risky: changes observable user behavior; sc3 would break and need rewriting

Code + tests agree on the skip behavior. Option A is lower-risk.
