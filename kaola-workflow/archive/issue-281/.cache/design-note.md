# design-note evidence — issue #281 parallel ready-set execution

node: design-note
role: implementer

non_tdd_reason: durable design documentation — no behavioral unit under test; code-architect is read-only and cannot Write the file

## Verification

build-green — the only production change is `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md` (new file, markdown, no behavioral code). `git status --porcelain` shows it as a single untracked addition; no existing tracked file was modified. The markdown is well-formed with no broken section structure.

## Summary

Authored `docs/investigations/2026-06-07-parallel-ready-set-execution-design.md` (the dangling reference from issue #281's "Design Reference" section). The note covers:

1. The load-bearing STATE-vs-DISPATCH split: `parallel-batch.js` owns batch STATE only and never dispatches; the plan-run SKILL (main session) owns concurrent `Agent()` dispatch.
2. All five `parallel-batch.js` subcommands (`open-batch`, `seal-member`, `seal`, `join`, `status`) with their JSON shapes, composition over `next-action`/`commit-node`, and the manifest at `kaola-workflow/{project}/.cache/active-batch.json`.
3. `BATCH_STATES` placement in `parallel-batch.js` (not `adaptive-schema.js`) with the WHY: no node writes the schema in the frozen plan, and states are aggregator-local.
4. All five lifecycle states (open/dispatched/sealed/joining/joined) with per-state durable artifacts and crash/resume reconstruction paths; the multiple-`in_progress` legality rule.
5. `next-action.js` pure-subset additive change (`readyPending` + `active`); byte-unchanged back-compat.
6. Ordered capability: read-only batches ship complete (AC#2); write-role batches are an honest partial degrading to serialized where host lacks worktree support (AC#3).
7. Gate/Phase-6 compatibility (zero new surface), four-edition parity (AC#8), and honest infeasibility (wall-clock not demonstrable by tests; build DAG sequential; write-role join is the hard edge).
8. Full AC-coverage table (AC#1–AC#8), with AC#3 explicitly labeled honest partial.

All eight acceptance criteria from issue #281 are addressed; AC#3 is marked as honest partial per §10 of the blueprint.
