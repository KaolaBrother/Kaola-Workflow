evidence-binding: n6-finalize 5f0ff11db1d8

# n6 — finalize sink (docs/state only) — main-session-direct

compliance: main-session-direct

Wrote exactly the declared write-set (docs-only; no behavior change; #500 stays OPEN):
- docs/investigations/2026-06-16-500-makespan-levers-decision.md — Case-B shaping-run findings (3 levers, provenance gap, per-lever recommendation table, cross-lever coupling).
- docs/decisions/D-500-01.md — recommendation record framed Status: Proposed — PENDING OWNER APPROVAL (not a settled decision); L1 GUARDED-WIRE-or-RELABEL (the only genuine value-call), L2 WIRE (stale-dormant honesty fix), L3 WIRE-prose + separate planner-rubric follow-up; build decomposition.
- CHANGELOG.md — [Unreleased] ### Changed entry, docs-only / no behavior change, honest summary.

Worktree diff verified = exactly {CHANGELOG.md, docs/decisions/D-500-01.md, docs/investigations/2026-06-16-500-makespan-levers-decision.md} + exempt kaola-workflow/issue-500/ project state.

CHECKPOINT: #500 MUST stay OPEN. The goal_check for this run is the SHAPING goal (produce + surface the per-lever decision inputs), NOT the end-state goal (every lever reachable-or-labeled) — the build run reaches the end-state. No WIRE/RELABEL edits were made (read-only investigation + docs sink only).
