# 6. Planner-first entry before DAG shaping

Date: 2026-06-08
Status: Accepted
Issue: #287
Related: ADR 0003 (adaptive front-end planner), ADR 0004 (script-owned mechanical
transitions, #255), ADR 0005 (plan-run owns node lifecycle, #272)

## Context

ADR 0003 established `workflow-planner` as the adaptive front-end designer: it owns
the task-shaped `## Nodes` DAG, grammar validation, and the freeze + handoff packet.
ADR 0004 and ADR 0005 completed the mechanical transition layer so that once the
planner returns `handoff_status: ready_to_run`, the orchestrator drives a purely
mechanical per-node loop with no further design decisions.

A boundary leak observed during the #279 session exposed a gap in the entry
convention. Before dispatching `workflow-planner`, the main session performed deep
design governance: it prescribed the full `## Nodes` table, chose role sequences,
dependencies, shapes, and write-sets, then dispatched the planner with a prompt
framing it as a mechanical `AUTHOR EXACTLY` worker. The planner still ran grammar
validation and produced a frozen plan, but the design had already been made by the
orchestrator. This weakens the adaptive design guarantee: the planner is the declared
front-end designer, but in practice it was reduced to a transcription step.

The leak mattered because the planner's grammar and validator checks, its risk
assessment, and its carve-out reasoning are only meaningful when it is the author.
When the DAG is handed in pre-formed, those checks validate a design the planner
did not make.

## Decision

Once adaptive is selected and the target issue is known, the FIRST issue-specific
adaptive action must be dispatching `workflow-planner`. The boundary is defined by
what is allowed before that dispatch and what is not.

**Allowed before planner dispatch:**

- Reading project rules, CLAUDE.md, and ROADMAP.
- Confirming the target issue is unclaimed and the authoring-allowed switch is on.
- Git freshness check (local main up to date).
- Confirming no conflicting active worktree for the same issue.
- Stating the selected issue to the user.

**Not allowed before planner dispatch:**

- Authoring or prescribing the `## Nodes` table.
- Choosing role sequence, dependencies, node shapes, or per-node write-sets.
- Creating the orchestrator task list for the run.
- Passing a prompt that contains a mandatory full DAG, `AUTHOR EXACTLY`, or
  `do not redesign` directives to the planner.

**Typed refusal.** The planner emits `planner_control_boundary_violation` when its
dispatch prompt contains a pre-authored or mandatory `## Nodes` table, an
`AUTHOR EXACTLY` directive, or a `do not redesign` constraint. This is a hard typed
refusal; the orchestrator must not proceed past it.

**Repair carve-out.** The above constraint does NOT apply when re-dispatching the
planner after `handoff_status: plan_invalid` on an UNFROZEN plan. In that case,
passing validator error context and asking the planner to repair a specific DAG is
correct. The carve-out requires both conditions: the plan was already authored by
the planner (the planner is the author, not the orchestrator) AND the plan failed
grammar validation (a concrete error list is the repair context, not a design
prescription).

**Post-handoff task list.** The orchestrator creates its per-node task list only
after `handoff_status: ready_to_run` and after reading the frozen plan. It does not
pre-compose a task list before the planner runs.

## Enforcement

Enforcement is behavioral rather than runtime-scriptable, because no script receives
the dispatch prompt — only the planner does.

- **Agent profile prose.** `agents/workflow-planner.md` contains explicit entry-gate
  prose instructing the planner to emit `planner_control_boundary_violation` when its
  dispatch prompt contains the forbidden patterns.
- **Adapt command and skill docs.** The `/kaola-workflow-adapt` command and all
  edition skill mirrors are tightened to state the allowed-before-planner checklist
  and the prohibited patterns.
- **Contract-test pins.** `scripts/validate-workflow-contracts.js` (and its
  byte-twin `plugins/kaola-workflow/scripts/validate-workflow-contracts.js`) plus
  `scripts/validate-kaola-workflow-contracts.js` each pin the token
  `planner_control_boundary_violation` in: the adapt docs for all three forge
  editions, the codex skill mirror, and the `workflow-planner` agent body. A missing
  token in any of those surfaces fails the contract validator.

## Non-goals

- This ADR does not add a script that intercepts the planner dispatch prompt at
  runtime. There is no such script surface.
- This ADR does not change the planner's internal grammar or validator logic.
- This ADR does not restrict what the planner may ask the orchestrator after it has
  been dispatched.

## Consequences

Positive:

- The planner is unambiguously the adaptive front-end designer. The main session
  can no longer pre-shape the workflow before the planner owns it.
- The grammar validation, risk assessment, and carve-out reasoning in the planner
  are now meaningful for every adaptive run, not just runs where the orchestrator
  chose not to prescribe the DAG.
- The repair carve-out is explicit and bounded: pre-formed DAGs are only allowed
  when the planner already authored them and the validator rejected them with a
  concrete error list.

Negative:

- Enforcement is prose and contract-pin, not a runtime gate. A prompt that
  violates the boundary will not be mechanically blocked before it reaches the
  planner; it depends on the planner correctly recognizing and refusing the
  prohibited pattern.
- The contract-pin approach requires four-edition maintenance (Claude, Codex,
  GitLab, Gitea) for every adapt-doc and planner-agent change, consistent with
  the existing four-edition shipping convention.

## Lock

The main session MUST dispatch `workflow-planner` as its first issue-specific
adaptive action. It MUST NOT pass a pre-authored `## Nodes` table, an
`AUTHOR EXACTLY` directive, or a `do not redesign` constraint in the initial
planner dispatch prompt. The planner MUST emit `planner_control_boundary_violation`
if those patterns appear. The only exception is a bounded repair re-dispatch after
`plan_invalid` on a planner-authored, not-yet-frozen plan.
