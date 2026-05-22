# Planner — issue-160

## Verification Summary (all Phase 1 facts confirmed against source)

| Claim | Verified at | Status |
|-------|-------------|--------|
| No-flag skips dirty worktrees | `kaola-workflow-claim.js:719-722` | Confirmed — code skips, doc says archive-default |
| if/else-if precedence (archive > export > force), no mutex error | `kaola-workflow-claim.js:731-748` | Confirmed — silently accepts all |
| JSON output is flat buckets, not `strategy`/`summary`/`details` | `kaola-workflow-claim.js:711, 784-788` | Confirmed |
| sc3 tests skip behavior | `simulate-workflow-walkthrough.js:1288-1293` | Confirmed |
| Cleanup tests run sc1–sc10 in all 3 suites | GitHub:1222–1511, GitLab:1431–1698, Gitea:1354–1621 | Confirmed — sc11 is the correct next number |
| All 4 claim scripts share identical strategy logic | Grep on the dirty-skip predicate | Confirmed (4 script hits) |
| Contracts validator asserts `testStaleWorktreeCleanup` by name | `validate-kaola-workflow-{gitlab,gitea}-contracts.js:359` | Confirmed — extending keeps it satisfied |

One correction to the task's framing: the JSON schema fix is not just a field rename. The code emits **two distinct shapes** — dry-run `{ dry_run: true, would_remove, would_delete_branch, skipped_dirty }` (line 785) and execute `{ dry_run: false, removed, deleted_branch, skipped_dirty, stashed, exported, failed_preserve }` (line 787). The doc must show both as separate blocks.

## Approaches

### Option A — Fix docs to match code (recommended)
- **Pros**: Zero code changes; sc3 and all existing tests pass unchanged; documents the actually-shipped contract; the safer default (skip-dirty-without-consent) is preserved and explained.
- **Cons**: None material. Doc-only plus one additive test per suite.
- **Risk**: Low. Touches `docs/api.md`, `README.md`, and adds sc11 to 3 test suites.
- **Complexity**: Small.

### Option B — Fix code to match docs (reject)
- **Pros**: Docs and code converge on the doc's intent.
- **Cons**: Two breaking behavior changes — (1) `--archive`-as-default silently stashes uncommitted work when no flag is given (an unexpected mutation triggered by the *absence* of a flag — wrong direction), (2) mutex error rejects redundant-but-defined flag combos. Requires editing 4 byte-identical scripts (permanent drift risk), rewriting sc3 in 3 suites, then doing all of A's doc work anyway.
- **Risk**: High. Observable user-facing behavior change.
- **Complexity**: Large.

### Option C (hybrid) — Fix docs + add mutex validation only (reject)
A subset of B: keep skip-dirty default, but add error-on-multi-flag. Still a breaking change for any consumer passing redundant flags, for zero safety gain — the precedence chain is already defined behavior worth documenting, not rejecting.

## Recommendation: Option A — architecturally sound and lowest-risk

The code is the deployed contract; the docs are wrong by definition for shipped software. The current skip-dirty default is the *correct* safety posture (refuse to mutate uncommitted work without explicit consent). Documenting precedence is harmless; enforcing it via error is a gratuitous breaking change.

## Explicit NON-goals (do not build)
- Do NOT add `--archive`-as-default behavior in any claim script.
- Do NOT add mutex validation that errors on multi-flag input.
- Do NOT rename bucket fields to the doc's broken names (`changes_stashed`, `patches_exported`). The code names (`stashed`, `exported`, `removed`, `deleted_branch`, `skipped_dirty`, `failed_preserve`) are clearer and stay.
- Do NOT add `strategy`, `keep_branch`, `execute`, `summary`, or `details` to JSON output — entirely fabricated in the doc.
- Do NOT add per-pair precedence tests (`--archive --force`, `--export --force`). One sc11 (`--archive --export`) pins the if/else-if principle; more is over-testing.

## Implementation notes for the plan
- **`docs/api.md`**:
  - Line 327-329: remove "Mutually exclusive with..." clauses; replace with a precedence note (archive > export > force when combined; no flag = skip dirty).
  - Line 339: rewrite the bullet — no flag means dirty worktrees are *skipped* (reported in `skipped_dirty`), not stashed.
  - Lines 354-378: replace the single fictional schema with two real blocks (dry-run shape and execute shape).
- **`README.md:534`**: change `[--archive|--export|--force]` to `[--archive] [--export] [--force]` and add a one-clause note: "no flag = skip dirty; precedence when combined: archive > export > force." Avoid pipe syntax (future readers re-read it as mutex).
- **sc11 in all 3 suites** (`simulate-workflow-walkthrough.js`, `test-gitlab-workflow-scripts.js`, `test-gitea-workflow-scripts.js`): clean + dirty worktree, run `--execute --archive --export`, assert (a) `stashed` contains the dirty wtPath, (b) `exported` is empty/absent — **the load-bearing assertion**, pins precedence, (c) `removed` contains wtPath. Match each suite's local branch prefix (`workflow/issue-*`, `workflow/gitlab-issue-*`, `workflow/gitea-issue-*`) — sc1–sc10 already model this. Extending the existing `testStaleWorktreeCleanup` function keeps the contracts validator satisfied.
- **CHANGELOG.md**: add an `[Unreleased]` entry (doc-accuracy fix + new test); per the project doc checklist.
- **Verify**: `node scripts/simulate-workflow-walkthrough.js` (must print "Workflow walkthrough simulation passed"), plus the GitLab/Gitea test scripts.

## Missing facts from Phase 1
None. Code, test structure, cross-suite consistency, contracts validator, and per-edition branch prefixes are all verified.

### Relevant file paths (absolute)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/docs/api.md` (lines 324-378)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/README.md` (line 534)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/scripts/simulate-workflow-walkthrough.js` (insert sc11 after line 1511)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (insert sc11 after line ~1696)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (insert sc11 after line ~1619)
- `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/CHANGELOG.md`
