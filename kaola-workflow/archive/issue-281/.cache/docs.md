# docs node evidence — issue #281 parallel ready-set execution

## README.md

Added a new `#### Parallel ready-set execution (issue #281)` subsection between the adaptive
patterns table closing paragraph (line ~589) and `## Automation scripts`. The subsection covers:

- The executor now runs one FRONTIER UNIT at a time (single node or batch of ready siblings).
- The STATE vs DISPATCH split: `parallel-batch.js` owns batch state; the plan-run SKILL (main
  session) owns concurrent dispatch via multiple `Agent()` calls in one message. The script
  never spawns an agent.
- Read-only batches: fully supported, share the active worktree, no isolation required.
- Write-role batches: isolated node worktrees, disjointness proven at freeze and re-confirmed
  in `open-batch`; degrade honestly to serialized execution where the host lacks
  isolated-worktree support (correctness preserved, parallelism forgone).
- No new barrier or gate surface: `seal-member` calls the unchanged per-node `commit-node`
  barrier; Phase-6 `--barrier-check` sees normal `complete` rows after `join`.
- `workflow-planner` now authors efficient DAGs, exposing independent work as siblings.
- Link to `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

## docs/architecture.md

Added a new `**Parallel ready-set execution — fourth aggregator (issue #281).**` paragraph
in the Atomicity layer block, immediately after the `adaptive-node.js` paragraph and before
the Enforcement boundary section. The paragraph covers:

- Executor advances one FRONTIER UNIT at a time; `parallel-batch.js` is the fourth aggregator.
- `next-action.js` additive fields: `readyPending` (openable frontier) and `active`
  (all `in_progress` nodes); existing `readySet`, `nextNode`, `allDone` byte-unchanged.
- Batch manifest at `kaola-workflow/{project}/.cache/active-batch.json` (non-hashed runtime
  artifact); the five lifecycle states in a table: open / dispatched / sealed / joining / joined.
- AC#5 invariant: multiple `in_progress` rows legal only with a valid active-batch manifest
  whose `members` match exactly; otherwise `orient` emits `orphan_multi_in_progress` typed refusal.
- Crash/resume is a pure function of durable artifacts; no new gate surface introduced.
- Link to `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md`.

## Verification

build-green — `node scripts/simulate-workflow-walkthrough.js` exits 0 with
"Workflow walkthrough simulation passed" (all tests PASSED, no regression).
