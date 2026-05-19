# Phase 1 - Research / Discovery: issue-89

## Deliverable
Update `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` to implement the full GitHub sink-merge failure and fallback contract: exit codes 0/1/2/3, FF retry loop, merge-impossible classification with fallback receipt, worktree escape/removal, merge-base skip-check, post-rebase validation, OFFLINE mode, test env hooks, and branch cleanup. Add regression tests in `test-gitlab-sinks.js` covering all paths.

## Why
GitLab can pass current tests while failing realistic merge races, protected-branch fallback, local worktree cleanup, offline validation parity, or branch cleanup scenarios that GitHub handles. Phase 6 is already wired to consume exit 2 and exit 3 — the gap is entirely in the script.

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — primary target
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — test file

## Key Patterns Found
1. GitHub exit-2 retry loop: `ffMergeLoop` with `MAX_AUTOMERGE_RETRIES=3`, returns false → `process.exitCode = 2` — `scripts/kaola-workflow-sink-merge.js:98-143,262-265`
2. GitHub exit-3 classification + receipt: `classifyMergeError` patterns → token, `git reset --hard origin/main`, write `sink-fallback.json`, return `{ exitCode: 3 }` — `scripts/kaola-workflow-sink-merge.js:40-50,145-179`
3. Worktree escape: `chdir(os.tmpdir())`, call `removeWorktree`, register `process.on('exit', () => chdir(mainRoot))` — `scripts/kaola-workflow-sink-merge.js:210-235`
4. Merge-base skip: `git merge-base HEAD origin/main` == `git rev-parse origin/main` → set `alreadyUpToDate=true`, skip rebase and npm test — `scripts/kaola-workflow-sink-merge.js:248-258`
5. OFFLINE guard: `KAOLA_WORKFLOW_OFFLINE === '1'` skips fetch, pull, push, npm test — `scripts/kaola-workflow-sink-merge.js:8`
6. `removeWorktree` is already exported from `kaola-gitlab-workflow-claim.js:617`; `getCoordRoot` from line 373
7. Phase 6 consumer already wired for exit 2/3 at `plugins/kaola-workflow-gitlab/commands/kaola-workflow-phase6.md:590-613`
8. Fallback receipt schema: `{ project, branch, issue_number, reason, timestamp }` at `.cache/sink-fallback.json` — audit-only, not consumed by cmdSinkFallback
9. Test pattern: `withForge(stubs, fn)` + `tempRoot(name)` + `writeWorkflow(root, project, issueIid)` — `test-gitlab-sinks.js:15,28,32`
10. GitLab classifyMergeError patterns must use `protected branch`, `pre-receive hook declined`, `server rejected` (not `GH006`)

## Test Patterns
- Framework: hand-rolled assert, no framework
- Location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Structure: `withForge(stubs, fn)` for forge mocking; `tempRoot()` for tmpdir; direct module calls with `{ skipGit: true }`; `spawnSync` subprocess tests with env overrides

## Config & Env

| Var | Purpose | Status |
|-----|---------|--------|
| `KAOLA_WORKFLOW_OFFLINE` | Skip all network calls | Missing from GitLab sink |
| `KAOLA_WORKFLOW_FORCE_FF_FAIL` | Test: force first N FF fails | Missing from GitLab sink |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` | Test: force merge-impossible token | Missing from GitLab sink |
| `KAOLA_WORKFLOW_DEBUG_CWD` | Test: write final cwd to path after exit | Missing from GitLab sink |

## External Docs
N/A — internal patterns sufficient; no external library/API behavior needed

## GitHub Issue
KaolaBrother/kaola-workflow#89

## Completeness Score
10/10
- Goal clarity: 3/3 — deliverable is concrete with explicit AC
- Expected outcome: 3/3 — exit codes, receipt format, test coverage, branch cleanup all specified
- Scope boundaries: 2/2 — bounded to GitLab sink-merge + test file; deliberate divergences documented
- Constraints: 2/2 — keep `finalValidationPassed` gate, use GitLab-specific error patterns, preserve module exports

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | — | All internal patterns; no external library/API behavior needed |

## Notes / Future Considerations
- Deliberate divergences to preserve: `finalValidationPassed` gate, `forge.closeIssue` + `createIssueNote` pattern, `sink: mr` in cmdSinkFallback
- `getCoordRoot` import path: `./kaola-gitlab-workflow-claim` (not the GitHub claim script)
- No forge branch-delete helper exists; use `git push origin --delete` directly
- `classifyMergeError` must NOT copy `GH006` pattern; GitLab push rejections use `protected branch`, `pre-receive hook declined`, `server rejected`
