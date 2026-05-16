# Phase 1 - Research / Discovery: issue-33

## Deliverable
Fix Phase 6 sink scripts to restore the Claude Code session CWD to the main repository root after `removeWorktree()` succeeds. Fix applies to:
1. `scripts/kaola-workflow-sink-merge.js` — add `process.chdir(getRoot())` after `removeWorktree()` in Step 0 for the `removed`/`abandoned` paths
2. `scripts/kaola-workflow-claim.js` `drainPendingRemovals()` — add CWD restore after the deferred removal succeeds
3. `scripts/simulate-workflow-walkthrough.js` — add test assertions to verify CWD behavior post-removal
4. `sink-pr.js` fix is in Phase 6 shell instructions (`commands/kaola-workflow-phase6.md`), not the JS script (it doesn't call `removeWorktree`)

## Why
After Phase 6 removes the worktree, the Claude Code session CWD remains set to the deleted path. Any subsequent command (`git status`, `/clear`, IDE sync) operates from a dead directory, causing silent failures and confusing errors. This affects every user who runs the full 6-phase workflow with worktree isolation.

## Affected Area
- `scripts/kaola-workflow-sink-merge.js` lines 158–165 (Step 0 block)
- `scripts/kaola-workflow-claim.js` lines 680–696 (`drainPendingRemovals()`) and lines 622–678 (`removeWorktree()`)
- `scripts/simulate-workflow-walkthrough.js` lines 3750–3763 (16G/AC13 test; no CWD assertion)
- Optionally: `commands/kaola-workflow-phase6.md` Step 9 Sink dispatch for the `sink-pr` shell-environment CWD fix

## Key Patterns Found
1. `removeWorktree()` returns `{ removed: true }`, `{ abandoned: true }`, `{ deferred: true }`, or `{ skipped: true }` — `scripts/kaola-workflow-claim.js:622`
2. In `sink-merge.js` Step 0, `coordRoot` is block-scoped inside `{ ... }` braces (line 160); not accessible after line 165 — `scripts/kaola-workflow-sink-merge.js:158`
3. `drainPendingRemovals()` processes `.pending-removal/*.json` and calls `removeWorktree()` — only called from `cmdSweep()`, never from sink scripts — `scripts/kaola-workflow-claim.js:680`
4. `getRoot()` available at module scope in `sink-merge.js` (line 23) — returns `git rev-parse --show-toplevel` — `scripts/kaola-workflow-sink-merge.js:23`
5. `process.chdir()` not called anywhere in the codebase — no existing precedent or helper

## Test Patterns
- Framework: hand-rolled assert, no framework (`simulate-workflow-walkthrough.js` header)
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: Epic sections numbered 1–N, each running scripts via `execFileSync`/`spawnSync` and asserting via custom `assert()` helper
- Relevant test: 16G / AC13 at lines 3750–3763 — asserts worktree is gone after sink-merge; runs from `epic16Tmp` (main repo root), not from inside worktree — deferred path and CWD restoration are untested
- Test limitation: tests run `sink-merge` as child process so host CWD is unaffected; CWD-restore test must verify that `removeWorktree` return values are handled and that `process.chdir` would be called — or use a worktree-as-CWD scenario

## Config & Env
- `KAOLA_SESSION_ID` — session identifier
- `KAOLA_COORD_ROOT` — overrides coordRoot (defaults to `git rev-parse --git-common-dir`)
- No feature flags relevant to this fix

## External Docs
N/A — `process.chdir()` is standard Node.js built-in; no external library behavior needed

## GitHub Issue
KaolaBrother/Kaola-Workflow#33

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient | No external APIs or libraries involved; fix uses standard Node.js `process.chdir()` |

## Notes / Future Considerations
- The deferred path (`{ deferred: true }`) means `removeWorktree()` was called while CWD was inside the worktree — in that case no removal happened so no CWD restore is needed at call time; CWD restore is needed after `drainPendingRemovals()` actually removes it
- `sink-pr.js` does not call `removeWorktree()` at all; the shell session CWD fix for `sink-pr` must be in the Phase 6 instruction text (step 9), not the JS script
- Dirty worktrees that get `abandoned` (renamed, not deleted) still leave the session inside a valid-but-abandoned path; CWD restore is still desirable after `abandoned` result
- A separate bug (stale test locks leaking into `.git/kaola-workflow/.locks/` from simulate tests) was observed and should be filed separately — relates to existing "Isolation tree gaps" memory
