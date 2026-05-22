# Phase 1 - Research / Discovery: issue-160

## Deliverable

Align `stale-worktree-cleanup` documentation with the actual implementation. The implementation and tests agree that dirty worktrees are **skipped** (not archived) when no strategy flag is given, and that multiple strategy flags are silently accepted with `archive > export > force` precedence. `docs/api.md` makes two false claims: (1) `--archive` is the default when no flag given, and (2) the three flags are mutually exclusive. Fix the docs to match the code (preferred), or fix the code to match the docs (riskier). Add regression tests for multi-flag precedence behavior. Fix the JSON schema in docs/api.md to match actual output field names.

## Why

Users may expect dirty worktrees to be stashed by default (per docs) but the implementation skips them. For cleanup tooling that removes worktrees, this discrepancy is a safety risk: a user following the docs may assume dirty worktrees will be preserved when they won't be touched at all (skip), or vice versa if they assume mutually exclusive flags are rejected when they're silently accepted.

## Affected Area

**Implementation (decision-dependent):**
- `scripts/kaola-workflow-claim.js` — `cmdStaleWorktreeCleanup()` at line 697; `parseArgs()` at line 24
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` — same (Codex mirror)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — same at line 700
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same at line 685
- All 4 files are byte-identical in strategy selection logic; any code fix must be applied to all 4.

**Docs (always updated):**
- `docs/api.md` — lines 327-330 (mutual exclusivity claims), line 339 (default behavior claim), lines 354-378 (JSON schema)
- `README.md` — line 534 (subcommand table, `[--archive|--export|--force]` syntax)

**Tests (always updated):**
- `scripts/simulate-workflow-walkthrough.js` — `testStaleWorktreeCleanup()`, add sc11 (multi-flag precedence)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — same
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — same

## Key Patterns Found

1. **Skip behavior is the actual implementation** (`scripts/kaola-workflow-claim.js:719`): `if (state === 'dirty' && !(args.archive || args.export || args.force)) { buckets.skipped_dirty.push(wt.path); continue; }` — no flag means skip, not archive.

2. **Silent precedence order** (`kaola-workflow-claim.js:732-748`): `if (args.archive) { ... } else if (args.export) { ... }` — `--force` is only the implicit fall-through. Multiple flags silently accepted; highest-priority branch fires.

3. **sc3 test validates skip behavior** (`simulate-workflow-walkthrough.js:1274`): `const out = runClaimOnline(['stale-worktree-cleanup', '--execute'], tmp, binDir)` with a dirty worktree, asserts `out.skipped_dirty.some(p => p === wtPath)`. This test directly contradicts the doc claim.

4. **docs/api.md line 339 is wrong**: "With `--archive` (default if no other strategy specified)" — the code never enters the archive branch without an explicit `--archive` flag.

5. **docs/api.md lines 354-378 JSON schema is wrong**: Shows `"strategy": "archive|export|force"`, `"changes_stashed"`, `"patches_exported"` — actual JSON fields are `stashed`, `exported`, `skipped_dirty`, `failed_preserve`, `removed`, `deleted_branch`.

6. **No multi-flag precedence test exists** — gap between "silent precedence behavior" and test coverage.

## Test Patterns

- Framework: hand-rolled assert (throws on failure), no external test runner
- Locations:
  - GitHub: `scripts/simulate-workflow-walkthrough.js` — `testStaleWorktreeCleanup()` starting line 1210; sc1-sc10 sub-cases
  - GitLab: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — `testStaleWorktreeCleanup()` starting line 1431
  - Gitea: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — `testStaleWorktreeCleanup()` starting line 1354
- Structure: each sub-case creates a temp git repo + linked worktree, runs `runClaimOnline([...], tmp, binDir)`, asserts JSON output, cleans up in `finally`
- New test (sc11): multi-flag scenario. `--archive --export` → assert `stashed` contains worktree (archive wins), `exported` is empty.

## Config & Env

- No env vars affect strategy selection. `KAOLA_WORKFLOW_OFFLINE` affects stale detection only.
- `--execute` flag is required for actual removal; without it, the command runs dry-run mode.

## External Docs

None — all git commands and Node.js built-ins.

## GitHub Issue

KaolaBrother/Kaola-Workflow#160

## Completeness Score

10/10

- Goal clarity: 3/3 — exact discrepancies identified (line-level), two resolution paths clear
- Expected outcome: 3/3 — docs corrected (Option A) or code + docs aligned (Option B); tests added for multi-flag precedence; JSON schema in docs fixed
- Scope boundaries: 2/2 — docs/api.md, README.md, 3 test files; 4 claim scripts only if Option B chosen
- Constraints: 2/2 — no external deps; Option A has no code changes; Option B must update all 4 editions identically

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns only; no external library/API behavior |

## Notes / Future Considerations

- Option A (fix docs to match code) is lower risk: no behavior change, sc3 continues passing. Recommended unless the product intent was always to archive by default.
- Option B (fix code to match docs): would break sc3, require rewriting it, and change observable behavior. Riskier.
- The `failed_preserve` safety bucket (worktree not removed when preserve fails) is unaffected by either option.
- Issue #159 (untracked files in `--export`) is already fixed and merged. Issue #160 is purely docs/contract alignment.
