# Workflow Plan — issue-256

<!-- plan_hash: c8fde5a997f519ff8e6c1d8043ae5fbdffc322b8c288e55b6a106112ac340b29 -->

## Meta
labels: good first issue, area:scripts
summary: Commit the deferred-from-#246 worktree_error provision-failure regression test. TEST-ONLY, single file — `scripts/simulate-workflow-walkthrough.js`. Add `testWorktreeNativeSurfacesProvisionFailure()` (registered right after `testWorktreeNativeOfflineWins()`) that plants a regular FILE at the `.kw` worktree-parent dir (`fs.realpathSync(tmp) + '.kw'`) under KAOLA_WORKTREE_NATIVE=1 so `mkdirSync(path.dirname(wtPath),{recursive:true})` throws EEXIST, then asserts claim still `acquired`, `worktree_path === ''`, and `worktree_error` matches /EEXIST/; plus a `result.worktree_error === undefined` regression assert in BOTH `testWorktreeNativeDefaultOff` and `testWorktreeNativeOfflineWins`. The production fix already landed in #246 (worktree_error surfaced in claim.js), so the test is GREEN against current main; its RED appears ONLY when the #246 catch-un-silencing is temporarily reverted in claim.js — that revert is local/uncommitted proof-of-RED and is NOT in any declared_write_set. No production code, no docs/public-interface change, no security-sensitive path (no G2).

## Nodes

| id | role | depends_on | declared_write_set | cardinality | shape |
|----|------|-----------|--------------------|-------------|-------|
| impl | tdd-guide | — | scripts/simulate-workflow-walkthrough.js | 1 | sequence |
| review | code-reviewer | impl | — | 1 | sequence |
| finalize | finalize | review | CHANGELOG.md | 1 | sequence |

## Node Ledger

| id | status | evidence | notes |
|----|--------|----------|-------|
| impl | complete | .cache/impl.md (repo-root) | closed 2026-06-06 |
| review | complete | .cache/review.md (repo-root) | closed 2026-06-06 |
| finalize | complete | .cache/finalize.md (repo-root) | CHANGELOG.md [Unreleased] #256 entry; barrierCheck pass |

## Required Agent Compliance

| node | status | evidence |
|------|--------|----------|
| code-reviewer | subagent-invoked | `review` node (G1 GATE over impl) — `.cache/review.md`: VERDICT: APPROVE; Blocking: none; per-node barrier pass (barrierCheck exit 0, empty write set; gateVerify informational:true pending ledger close); suite exit 0 sentinel "Workflow walkthrough simulation passed" |
