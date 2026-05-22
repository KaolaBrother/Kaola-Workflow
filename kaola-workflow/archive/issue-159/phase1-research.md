# Phase 1 - Research / Discovery: issue-159

## Deliverable

Fix `exportWorktreeDiff()` in all three forge editions (GitHub, GitLab, Gitea) so that `stale-worktree-cleanup --execute --export` never silently loses untracked files. When a dirty worktree contains untracked files, the export must preserve them (patch for tracked changes + sidecar directory for untracked files) before removing the worktree. Add regression tests for untracked-only and mixed (tracked+untracked) dirty worktrees in all three test suites. Update `docs/api.md` to describe the new export artifacts.

## Why

Data-loss risk. `--export` was documented as a safe, recoverable cleanup strategy. But `git diff HEAD` only captures tracked changes. A worktree dirty solely from untracked files produces an empty patch, is then removed, and the untracked files are gone with no warning. Users relying on `--export` for recovery may not notice the loss until it is too late.

## Affected Area

**Implementation (fix):**
- `scripts/kaola-workflow-claim.js` — `exportWorktreeDiff()` lines 145-158, caller in `cmdStaleWorktreeCleanup()` line 725-731
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — same functions, lines 154-167 and 728-734
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same functions, lines 149-162 and 713-719

**Tests (new sub-cases):**
- `scripts/simulate-workflow-walkthrough.js` — add sc9 (untracked-only) and sc10 (mixed) after sc8
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — same additions
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — same additions

**Docs:**
- `docs/api.md` — update `--export` flag description and behavior section (lines 328, 340)

## Key Patterns Found

1. **`exportWorktreeDiff()` is byte-for-byte identical in all three editions** (`kaola-workflow-claim.js:145`, `kaola-gitlab-workflow-claim.js:154`, `kaola-gitea-workflow-claim.js:149`). Fix must be applied uniformly to all three.

2. **`stashWorktree()` uses `git stash push -u` (`kaola-workflow-claim.js:137`)** — the `-u` flag includes untracked files. This is the pattern that works. Export must achieve the same coverage via `git ls-files --others --exclude-standard` + `fs.copyFileSync`.

3. **`failed_preserve` is the safety bucket** (`cmdStaleWorktreeCleanup` lines 729-731): when a preserve step returns a falsy value, the worktree path goes to `failed_preserve[]` and the loop `continue`s, leaving the worktree intact. Any new failure path in `exportWorktreeDiff` (e.g., fs write error during untracked copy) must return `null` so this guard triggers.

4. **Caller pushes return value to `buckets.exported`** (`kaola-workflow-claim.js:726`). Currently expects a string. Fix: return an array of paths; caller spreads: `buckets.exported.push(...p)`. Empty array `[]` is truthy but this path will not occur — null is returned on failure.

5. **Existing sc5 test uses a tracked file modification** (`simulate-workflow-walkthrough.js:1342`: `fs.writeFileSync(path.join(wtPath, 'README.md'), ...)`) — this continues to pass after the fix since tracked changes are still captured in the patch. New test sub-cases target the gap (untracked-only and mixed).

## Test Patterns

- Framework: hand-rolled assert (throws on failure), no external test framework
- Location:
  - GitHub: `scripts/simulate-workflow-walkthrough.js` — `testStaleWorktreeCleanup()` starting line 1210
  - GitLab: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — `testStaleWorktreeCleanup()` starting line 1431, invoked via `simulate-gitlab-workflow-walkthrough.js:87`
  - Gitea: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — `testStaleWorktreeCleanup()` starting line 1354, invoked via `simulate-gitea-workflow-walkthrough.js:87`
- Structure: each sub-case creates a temp git repo, plants a linked worktree, runs the claim script via `runClaimOnline([...])`, asserts JSON output fields, then cleans up in `finally`.
- Helper: `initGitRepo(tmp)` creates a git repo with an initial commit (so README.md is tracked). `runClaimOnline` passes a fake `gh` shim that reports issue 200 as closed.

## Config & Env

- No env vars affect the export path.
- `--export` CLI flag is the only dispatch trigger.
- `KAOLA_WORKFLOW_OFFLINE` affects stale detection only; export logic is unaffected.

## External Docs

None required. All git commands (`git diff HEAD`, `git ls-files --others --exclude-standard`, `git stash push -u`) use stable, well-documented git options. Fix uses only Node.js built-in `fs` module.

## GitHub Issue

KaolaBrother/kaola-workflow#159 (inferred from context; repo owner resolved from gh CLI)

## Completeness Score

10/10

- Goal clarity: 3/3 — deliverable, bug cause, and fix approach all clear
- Expected outcome: 3/3 — all three editions patched, tests added for both gap scenarios, docs updated
- Scope boundaries: 2/2 — exactly 3 claim scripts + 3 test files + 1 doc file
- Constraints: 2/2 — no external deps, pure Node.js fs + git; `failed_preserve` safety bucket preserved

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient; only Node.js fs and standard git commands needed |

## Notes / Future Considerations

- Issue #160 (docs alignment for --archive default behavior and mutually-exclusive flag enforcement) is a separate issue. Do not conflate with this fix — #159 is purely the untracked-file data-loss bug.
- The `--export` docs currently claim flags are mutually exclusive. That enforcement gap belongs to #160.
- The untracked sidecar directory (`issue-N-{ts}-untracked/`) is discoverable by name convention alongside the patch file. No index file is needed.
- If `fs.copyFileSync` fails (e.g., permission error), the outer try/catch returns null → `failed_preserve` → worktree is NOT removed. Safe.
