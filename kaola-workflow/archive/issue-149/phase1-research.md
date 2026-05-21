# Phase 1 - Research / Discovery: issue-149

## Deliverable
Add `KAOLA_WORKTREE_NATIVE` env-var gate to all three forge claim scripts (GitHub, GitLab, Gitea) so worktree provisioning matches the opt-in contract documented in README. Also fix the secondary offline guard divergence in GitLab and Gitea plugins.

## Why
README documents `KAOLA_WORKTREE_NATIVE=1` as the opt-in gate before worktrees are provisioned. None of the three claim scripts check this variable — worktrees are always provisioned when git history exists (and online, for GitHub). Users who set `KAOLA_WORKTREE_NATIVE=0` or omit it (the documented default) expect no worktrees to be provisioned, but currently get them anyway.

## Affected Area

- `scripts/kaola-workflow-claim.js:340-343` — GitHub worktree provisioning gate
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:293-296` — GitLab provisioning gate (also missing OFFLINE guard)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:296-299` — Gitea provisioning gate (same gaps as GitLab)
- `scripts/simulate-workflow-walkthrough.js` — integration tests; no KAOLA_WORKTREE_NATIVE coverage yet
- `README.md:744-781` — contract documentation (accurate, no changes needed)

## Key Patterns Found

1. Module-level boolean const for env-var gates — `scripts/kaola-workflow-claim.js:17`: `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';`
2. GitHub provisioning gate — `scripts/kaola-workflow-claim.js:342`: `if (!OFFLINE && hasGitHistory(root))`
3. GitLab/Gitea provisioning gate (gap) — `kaola-gitlab-workflow-claim.js:295`/`kaola-gitea-workflow-claim.js:298`: `if (hasGitHistory(root))` — missing both `!OFFLINE` and `WORKTREE_NATIVE`
4. Silent failure pattern — all three scripts: `catch (e) { worktreePath = ''; }` — provisioning failure is non-fatal
5. Idempotent provisioning — all three `provisionWorktree()` implementations check `worktreeRegistered()` + `fs.existsSync()` before `git worktree add`
6. Env-var test injection — `scripts/simulate-workflow-walkthrough.js`: env vars set via `spawnSync` `env` spread; `runClaimOnline()` already supports extra env vars

## Test Patterns

- Framework: hand-rolled assert, no external framework
- Location: `scripts/simulate-workflow-walkthrough.js` (GitHub); `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (GitLab); `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (Gitea)
- Structure: `spawnSync` subprocesses with injected env vars; `runClaimOnline(args, cwd, binDir)` helper for online tests with PATH shim
- Worktree tests: `simulate-workflow-walkthrough.js` lines 444-462, 591-621

## Config & Env

| Env Var | Current module const | Default | Action needed |
|---|---|---|---|
| `KAOLA_WORKFLOW_OFFLINE` | `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` | false | Add to GitLab/Gitea provisioning guard |
| `KAOLA_WORKTREE_NATIVE` | **not declared** | (docs say default off) | Add `const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE === '1'` to all three scripts |

## External Docs

None — all patterns internal.

## GitHub Issue

KaolaBrother/kaola-workflow#149 (inferred from folder name and startup sink block)

## Completeness Score

10/10 — goal clarity 3, expected outcome 3, scope boundaries 2, constraints 2.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient; no external lib/API behavior needed |

## Notes / Future Considerations

- The secondary gap (GitLab/Gitea missing `!OFFLINE` guard) should be fixed in the same PR since we're touching those lines anyway.
- Tests for `KAOLA_WORKTREE_NATIVE=0` (default, no worktree) and `KAOLA_WORKTREE_NATIVE=1` (worktree provisioned) should be added to `simulate-workflow-walkthrough.js` and the two plugin test files.
- Phase 4 command files and Phase 6 skill files already use `KAOLA_WORKTREE_NATIVE` in shell conditionals — no changes needed there.
