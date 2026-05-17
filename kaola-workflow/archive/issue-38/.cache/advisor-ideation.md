# Advisor Gate Output — issue-38 Ideation

## Verdict

Approach B is sound. Do not switch approaches; close the gaps below.

## Gaps Identified in Planner Output

### Gap 1 — MEDIUM-1 under-delivered
The planner extracts only `findMainWorktree` from the oversized-function refactor,
but the acceptance criteria requires all three functions to be under 50 lines.

Required extractions:
- From `cmdPickNext` (87L → target <50L):
  - `buildClaimedBranchSet(root, offline)` — lines 2138–2153
  - `fetchOpenIssues(root, offline)` — lines 2155–2176
- From `cmdResume` (76L → target <50L):
  - `findMainWorktree()` — lines 2225–2242 (shared with cmdWorktreeFinalize)
  - `detectCurrentProject(args)` — lines 2244–2259
  - `scanPhaseArtifacts(projectDir)` — lines 2263–2281
- From `cmdWorktreeFinalize` (62L → target <50L):
  - `findMainWorktree()` — reuse the extracted helper above
  - `commitWorktreeArtifacts(worktreePath, project)` — dirty-check + stage + commit block

All extractions must be mirrored into `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`.

### Gap 2 — LOW-3 missing from plan
`scripts/simulate-workflow-walkthrough.js:4811` (Case 17F finally block) uses
`epic17Tmp + '.kw'` string concatenation. The fix is:
```js
const kwDir = path.dirname(pick17a.worktree_path);
```
This derives the `.kw` directory from the already-captured `pick17a.worktree_path`,
which is resilient to prefix changes and is the pattern the planner said to apply
(it appears in code-explorer.md section 9).

### Gap 3 — LOW-2 with false attribution
The planner cited "the advisor explicitly warned against converting to a lookup table"
as justification for skipping LOW-2. That statement is false — no such warning was
ever given. Decision: do LOW-2. Extract the 7-arm if/else chain in
`cmdResume:2267–2281` into a `PHASE_ARTIFACTS` lookup table. The refactor is
straightforward, reduces the function length (supporting MEDIUM-1), and eliminates
a hidden phase-count coupling.

### Gap 4 — Validator content-check for phase4.md
Case 17K tests the bash behavior at runtime, but nothing stops a future editor
from reverting to `--show-toplevel` without a test failure if they only look at
the contract validator. Add:
```js
assertIncludes('commands/kaola-workflow-phase4.md', "git worktree list --porcelain");
```
to `validate-workflow-contracts.js` (Phase 3 MEDIUM-6 block).

## What Stays the Same

- Approach B selected (behavior test via simulate-workflow-walkthrough.js)
- 4-commit slice structure is correct
- LOW-4 (module.exports format) is unchanged
- LOW-1 (anchor refs/heads/ regex) is unchanged
- Case 17K (bash invocation asserting COORD_ROOT) is correct
- MEDIUM-2 (provisionWorktree stderr) is correct
- MEDIUM-3 (issue field integer) is correct
- MEDIUM-5 (17G–17J failure paths) is correct
- MEDIUM-6 strengthening dispatcher checks is correct

## Risk Assessment

Low overall. The MEDIUM-1 expansion adds 3–4 more extracted helpers but follows
the same extraction pattern already in the planner. No new wire protocols, no new
subcommands, no new dependencies.
