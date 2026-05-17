# Design Constraint from Issue #44

Recorded: 2026-05-17

Source: GitHub issue #44 comment ("Cross-issue priority audit") and issue #41 comment ("Scope constraint from #44").

---

## Governing Contract

Issue #44 establishes a binding architectural contract:

> **The agent owns issue selection. Scripts only validate and claim explicit targets.**

This contract governs all of #41's implementation choices.

---

## Constraint Map for Each Gap

### Gap 1 — `analyzeIssue()` outputs

- `analyzeIssue(issue, config)` may be added as planned.
- Its outputs (`priority_tier`, `priority_label`, `recommended_path`, `path_signals`, `path_confidence`) are **advisory inputs for the agent/router**.
- The script must NOT use these outputs to autonomously pick a different issue or silently override the active target.
- `analyzeIssue` is called once the target issue is already explicit (either user-directed or agent-inferred from roadmap/GitHub context).
- Test assertions must verify: `analyzeIssue` signals are exposed; no new auto-pick code path is added.

### Gap 2 — `claim:none` recovery field

- The `recovery` field (`advance_project | consult_advisor | prompt_user`) is **informational for the agent**.
- `claim:none` must NOT trigger script-level fallback to a different issue.
- The agent reads the `recovery` field and decides: ask the user, stop, or choose a new explicit target before any subsequent claim call.
- Forbidden: any code path where `claim:none + recovery=advance_project` causes the script to auto-claim the blocking project.
- Test assertion: after `claim:none`, no subsequent auto-claim attempt happens without a new explicit target from the agent.

### Gap 3 — Phantom-Advisor Hook

- Unchanged. Not related to issue selection.

### Gap 4 — Fast-Path Routing

- `analyzeIssue` may compute and return `recommended_path: fast|full`.
- The **agent** reads this signal and decides whether to invoke `/kaola-workflow-fast` or the full workflow.
- The script does NOT auto-route to `/kaola-workflow-fast` based on `analyzeIssue` output alone.
- `KAOLA_PATH=fast|full` env override is the mechanism for the agent to pass its decision into the script layer.
- The script records `workflow_path: fast|full` in workflow-state.md after the agent has made the decision (via env override or explicit argument).
- Mid-flight escalation writes `escalated_to_full: <trigger>` — this is valid because the agent already committed to fast-path; escalation is an execution-time guard, not a selection decision.
- Startup visibility line (`Selected #245 — fast path (confidence: high, signals: ...)`) is printed by the **router/agent layer** reading `analyzeIssue` output, not by the script autonomously.

---

## New Work Introduced by #44 (NOT in #41 scope)

These belong to #44's own implementation:
- `--target-issue N` flag for `cmdStartup()` and `cmdPickNext()`
- Typed refusals: `target_occupied`, `target_unavailable`, `target_mismatch`, `user_target_blocked`, `user_target_red`
- `target_source: user_directed | agent_inferred | agent_resumed` field in startup receipt
- Removal/quarantine of script-level first-available auto-pick in workflow-next path
- Agent-side target selection step in `commands/workflow-next.md`
- Mirror in `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`

Do NOT implement these in #41. They belong to #44.

---

## Test Compatibility Requirement

Tests added in #41 must assert:
- `analyzeIssue` signals are exposed in structured output (advisory)
- No auto-pick fallback from `claim:none`
- No script-level routing to fast-path without an explicit `KAOLA_PATH` env var

---

## Implementation Order Note

Issue #44 comment recommends: "land #44 before #41/#42 changes that touch workflow-next startup semantics."

However, #41's gaps can proceed if they do not ADD new auto-pick logic. The constraint is additive (advisory-only outputs) rather than requiring #44 to land first. #41 must leave a clean handoff point for #44's `--target-issue` work.
