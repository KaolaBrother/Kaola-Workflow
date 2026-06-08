# Finalize node evidence — issue-287 (adaptive Phase-6 sink)

n/a — the `finalize` node is the Phase-6 sink, not a dispatchable subagent (resolve-agent-model finalize is empty). Its evidence is the Phase-6 substantive work, recorded below. Declared write set: CHANGELOG.md (the [Unreleased] entry), authored inline by the orchestrator (Trivial-scope docs write).

## Final Validation
- Command: `npm test` (full suite, all four editions: claude/codex/gitlab/gitea) — run from the worktree.
- Result: **exit 0** (green). Evidence: kaola-workflow/issue-287/.cache/final-validation.md
- Adaptive barrier gates (re-run at Phase-6, finalize in_progress): resume-check=0, gate-verify=0, barrier-check=pass, verdict-check=ok.

## Acceptance criteria (all satisfied — verified by G1 code-review verdict:pass)
- AC1 adapt docs order non-design preflight → workflow-planner dispatch; main session must not pre-author the DAG.
- AC2 workflow-planner established as first to author a complete ## Nodes table.
- AC3 mandatory full DAG + AUTHOR EXACTLY refused as planner_control_boundary_violation (agent-profile prose).
- AC4 that prompt shape allowed only in the unfrozen-plan validator-repair path (carve-out, no contradiction).
- AC5 orchestrator task list created only after handoff_status: ready_to_run + reading the frozen plan.
- AC6 contract tests pin planner_control_boundary_violation across all three editions' adapt command docs, the codex skill mirror, and agents/workflow-planner.md.

## Documentation Docking: DOCKED (kaola-workflow/issue-287/.cache/doc-docking.md)

## Closure Decision scan
- No deferred items, conflicts, partial work, or user-decision items block closure.
- Non-blocking observation R1 from G1 code-review (out_of_scope/document): gitlab/gitea adapt pins live in the Claude validator via the routedFixFiles cross-edition precedent rather than the per-edition validators — an established counter-precedent (recon Deliverable 3a), intentional, not a follow-up.
- Closure decision: issue #287 is complete; safe to close on merge.

## Required Agent Compliance (this run)
- code-architect (recon): subagent-invoked
- implementer (author-boundary, pin-contracts): subagent-invoked
- code-reviewer (code-review G1): subagent-invoked, verdict: pass, findings_blocking: 0
- doc-updater (doc-sync): subagent-invoked
- doc docking: invoked (DOCKED)
- final validation: npm test exit 0

## Status: READY FOR FINAL GIT GATE (sink: merge, branch workflow/issue-287)
