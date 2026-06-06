# Node `impl-next-action` — N/A (no source change needed)

Status: **n/a** (governance decision D2; orchestrator-owned, advisor-confirmed, primary-source-verified).

## Why n/a
The declared write set is the four `kaola-workflow-next-action.js` copies. Verified against source that NO
behavioral change is needed (or possible) for AC6 adaptive worktree operation:

- `next-action.js` (whole file) takes an explicit `<plan-path>` argv, does `fs.readFileSync(planPath)`, and
  computes the ready-set / next-node / allDone via pure DAG+ledger functions (`parseNodes`/`parseLedger`).
  It has ZERO git, ZERO cwd, ZERO `-C`. It literally cannot be made "worktree-aware" because it never
  touches git or the filesystem beyond reading the plan path it is handed.
- Worktree operation is a calling-convention property: with `impl-plan-run` dispatching the contractor with
  `Working directory: ${ACTIVE_WORKTREE_PATH}` and `contractor.md` Method item 5 resolving relative paths
  there, the relative `kaola-workflow/{project}/workflow-plan.md` resolves to the WORKTREE copy and
  next-action reads the worktree ledger. No script change required.
- The repo-root fallback (empty `worktree_path` → cwd = repo-root → relative path resolves to main) is
  preserved automatically and is what THIS run depends on.

A filler "documenting comment" edit was REJECTED (fabricated RED→GREEN — see [[impl-commit-node]] rationale).

## Coverage
Proven by `impl-plan-run`'s structural + e2e tests and the `code-reviewer` gate. n/a does not stall the DAG
(`next-action.js` TERMINAL = {complete, n/a}); impl-claim becomes ready after both engine nodes are n/a.
