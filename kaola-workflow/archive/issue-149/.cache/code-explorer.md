# Code Explorer: Issue #149 — Align worktree provisioning with KAOLA_WORKTREE_NATIVE docs

## Entry Points

- GitHub: `scripts/kaola-workflow-claim.js`, `claimProject()` at line 321
- GitLab: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `claimProject()` at line 274
- Gitea: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`, `claimProject()` at line 277

## 1. Exact Worktree Provisioning Code Per Forge

**GitHub** (`scripts/kaola-workflow-claim.js:340-343`):
```js
const branch = buildBranchName(issueNumber, project, args.branch);
let worktreePath = '';
if (!OFFLINE && hasGitHistory(root)) {
  try { worktreePath = provisionWorktree(root, project, branch).path; } catch (e) { worktreePath = ''; }
}
```
Gate: `!OFFLINE && hasGitHistory(root)`

**GitLab** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:293-296`):
```js
const branch = buildBranchName(issueIid, project, args.branch);
let worktreePath = '';
if (hasGitHistory(root)) {
  try { worktreePath = provisionWorktree(root, project, branch).path; } catch (_) { worktreePath = ''; }
}
```
Gate: `hasGitHistory(root)` only — **no OFFLINE check**

**Gitea** (`plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:296-299`):
```js
const branch = buildBranchName(issueIid, project, args.branch);
let worktreePath = '';
if (hasGitHistory(root)) {
  try { worktreePath = provisionWorktree(root, project, branch).path; } catch (_) { worktreePath = ''; }
}
```
Gate: `hasGitHistory(root)` only — **no OFFLINE check** (identical to GitLab gap)

**KAOLA_WORKTREE_NATIVE**: Zero occurrences in any `.js` file. Only in `.md` files (README, commands, skills, CHANGELOG).

## 2. Naming and Env-Var Check Conventions

Module-level const pattern for booleans:
- Line 17 (GitHub): `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';`
- Line 19 (GitLab/Gitea): `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';`

Non-boolean env vars (`KAOLA_SINK`, `KAOLA_PATH`) are read inline at call site.

## 3. Error Handling Patterns

All three: silent fail — `catch (e) { worktreePath = ''; }`. Claim still succeeds, `worktree_path: ''` written to workflow-state.md. `provisionWorktree()` itself does not catch; outer claimProject() catch absorbs. `provisionWorktree()` is idempotent — checks `worktreeRegistered()` and `fs.existsSync()` before `git worktree add`.

## 4. Test Locations, Framework, and Structure

- Framework: hand-rolled (`scripts/simulate-workflow-walkthrough.js`)
- Tests for worktree provisioning: lines 444-462, 591-621
- Tests pass env vars via `spawnSync` `env` spread
- `runClaimOnline()` helper sets `KAOLA_WORKFLOW_OFFLINE: '0'` + PATH shim
- No `KAOLA_WORKTREE_NATIVE` tests exist anywhere
- GitLab and Gitea have their own test files (`test-gitlab-workflow-scripts.js`, `test-gitea-workflow-scripts.js`) but no worktree-gate tests

## 5. Relevant Env Vars

| Env Var | Module-level const | Purpose |
|---|---|---|
| `KAOLA_WORKFLOW_OFFLINE` | `const OFFLINE = ...` | Skip all network calls |
| `KAOLA_SINK` | inline only | Sink mode default |
| `KAOLA_PATH` | inline only | Workflow path default |
| `KAOLA_WORKTREE_NATIVE` | **missing** | Documented as opt-in gate; not implemented |

## README Documentation (lines 744-781)

- Line 461: "Provisions a per-issue Git worktree when `KAOLA_WORKTREE_NATIVE=1`"
- Line 744: "When `KAOLA_WORKTREE_NATIVE=1`, each active issue runs in a sibling worktree"
- Line 758: "When `KAOLA_WORKTREE_NATIVE=1`, `kaola-workflow-claim.js` provisions a sibling Git worktree on every claim"
- Line 776: "when `KAOLA_WORKTREE_NATIVE=0` (the default) it is the current directory"

Phase 4 command file uses: `if [ "${KAOLA_WORKTREE_NATIVE:-0}" = "1" ]; then`

## Key Files

| File | Role |
|---|---|
| `scripts/kaola-workflow-claim.js` | GitHub forge — has `OFFLINE` guard on worktree |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | GitLab forge — missing `OFFLINE` guard + missing `KAOLA_WORKTREE_NATIVE` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Gitea forge — same gaps as GitLab |
| `scripts/simulate-workflow-walkthrough.js` | Integration tests — no `KAOLA_WORKTREE_NATIVE` tests |
| `README.md` | Documents the opt-in contract; lines 744-781 |
