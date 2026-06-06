# Node `impl-commit-node` — N/A (no source change needed)

Status: **n/a** (governance decision D2; orchestrator-owned, advisor-confirmed, primary-source-verified).

## Why n/a
The declared write set is the four `kaola-workflow-commit-node.js` copies. Verified against source that
NO behavioral change to these scripts is needed (or safe) for AC6 adaptive worktree operation:

- `commit-node.js` takes an explicit `<plan-path>` argv and has ZERO git / ZERO cwd of its own; it shells
  the plan-validator with `validatorPath = path.join(__dirname, VALIDATOR)` (resolved next to itself) and
  passes the plan path through. All git lives in the validator.
- `plan-validator.js findRepoRoot(dirname(planPath))` (line 76) uses `fs.existsSync(path.join(dir,'.git'))`,
  which is TRUE for a linked worktree's `.git` FILE — so the barrier root correctly follows a worktree plan
  path with no script change. (Verified by reading plan-validator.js:73-82, 875, 801+.)
- AC6 worktree operation is delivered by `impl-plan-run` (markdown): it resolves `ACTIVE_WORKTREE_PATH`,
  mirrors the project folder into the worktree, and dispatches every contractor bracket with
  `Working directory: ${ACTIVE_WORKTREE_PATH}`. `contractor.md` (impl-adapt-contractor, Method item 5) then
  runs scripts + resolves relative paths from the worktree. commit-node.js is path-agnostic and works
  unchanged in that setup.
- Adding a `-C`/cwd/root arg or making worktree resolution mandatory would WEDGE this very run (which has
  `worktree_path: ''` → repo-root → relative plan path resolves to main → today's behavior). The repo-root
  fallback MUST be preserved; the safe behavioral-edit direction is NONE.

A filler "documenting comment" edit (the blueprint's first instinct) was REJECTED: recording a RED→GREEN
cycle for a comment-only diff is exactly the fabricated evidence the barrier exists to catch.

## Coverage
The worktree-operation behavior is PROVEN by `impl-plan-run`'s `testPlanRunWiredForWorktree` (structural) and
the `testAdaptiveWorktreeProvisionedE2E` end-to-end test (activates at impl-claim), plus the `code-reviewer`
gate over AC6. n/a here does not stall the DAG: `next-action.js` TERMINAL = {complete, n/a}, so impl-claim
still becomes ready.
