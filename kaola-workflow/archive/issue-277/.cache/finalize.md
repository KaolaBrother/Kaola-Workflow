# Node Evidence: finalize (sink node)

## deliverable
Authored the `CHANGELOG.md` `## [Unreleased]` entry for #277 (strict lean-orchestrator
boundary — M3 procedure relocation + contractor-dispatch text-lock, M4 run_posture /
always-worktree, M1 SubagentStart dispatch-log hook, M2 warn-first closure attestation).
This is the finalize node's sole write (write-set: `CHANGELOG.md`); the sink is main-direct
(ADR 0002).

## barrier
Only `CHANGELOG.md` changed against this node's baseline (all M1–M4 + docs landed in
prior nodes, so they predate the finalize baseline recorded at open). barrierCheck: pass.

## next (Phase 6, post-allDone)
- Mechanical bookkeeping (Step 8a artifact mirror / 8b cmdFinalize archive+status-close
  --keep-worktree / 7 roadmap regen+stage / 8 `chore: finalize issue-277` commit) is
  DELEGATED to the `contractor` subagent (honoring the very seam #277 hardens — NOT run
  inline by the orchestrator).
- Step 9 sink (sink-merge: merge branch → main, close #277, delete branch, remove
  worktree) is main-direct.

## note (warn-first dogfood)
This run's own finalize will record `claim_planner_attested: missing` /
`finalize_contractor_attested: missing` + a warning, because the M1 SubagentStart hook is
not installed in this live session (it ships in this PR, installed on the NEXT install).
`closure_invariants.ok` stays `true` — the run completing green through this check is the
warn-first proof that an absent detector does not block.
