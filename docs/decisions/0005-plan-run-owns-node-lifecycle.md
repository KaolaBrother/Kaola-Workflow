# 5. plan-run owns the complete per-node adaptive lifecycle

Date: 2026-06-07
Status: Accepted
Issue: #272
Extends: `docs/decisions/0004-script-owned-mechanical-transitions.md` (ADR 0004
introduced the aggregator layer; ADR 0005 completes Migration Step 2 — the
adaptive between-node executor — replacing the remaining contractor prose brackets
with a single typed transaction script.)

## Context

ADR 0004 established the principle that mechanical state transitions belong in
scripts, not contractor prose, and completed Step 1: the adaptive planner-to-first-node
handoff (`kaola-workflow-adaptive-handoff.js`, #255). After that change, ownership
was split across two agents and phases:

- The `workflow-planner` (via the handoff script) opened the first node and recorded
  its baseline, then returned `handoff_status: ready_to_dispatch_first_node`.
- `/kaola-workflow-plan-run` (via the contractor) opened and committed all subsequent
  nodes using separate `next-action` + `commit-node` calls with hand-written ledger
  coordination prose in between.

This split had two concrete problems. First, the first node was a special case: it
was opened by the planner subagent, making it structurally different from every
subsequent node even though the lifecycle is identical. Second, the per-node advance
and commit brackets were contractor prose — not typed transactions — so the same
category of error ADR 0004 was designed to prevent (prose-transcribed bookkeeping)
remained in the executor loop.

## Decision

`/kaola-workflow-plan-run` is the sole owner of the per-node adaptive lifecycle,
including the first node. This is implemented by `kaola-workflow-adaptive-node.js`
(#272), a new aggregator that owns the five typed transactions in the lifecycle:

| Subcommand | Mutates? | Responsibility |
|---|---|---|
| `orient` | Read-only | Shells `plan-validator --resume-check` + `next-action`; scans state/plan for escalation and consent-halt markers |
| `open-next` | Ledger + baseline | Transitions the next ready node `pending → in_progress` in the `## Node Ledger`; records its per-node baseline via `commit-node --start` |
| `record-evidence` | `.cache` | Writes verbatim stdin content to `.cache/<nodeId>.md` |
| `close-and-open-next` | Ledger + state + plan | Evidence-shape check → `commit-node` barrier → close node (`in_progress → complete`) + compliance row → selector routing → fused advance (open the next node + record its baseline) |
| `write-halt` | State + plan | Writes `escalated_to_full` + `consent_halt: pending` markers for consent/security/test_thrash escalation |

The crash-safe write order is binding for all mutation subcommands:
`.cache` evidence first, `## Node Ledger` row next, `workflow-state.md` pointer last.

**Handoff change.** `kaola-workflow-adaptive-handoff.js` no longer opens the first
node or records its baseline. It returns `handoff_status: ready_to_run` (replacing
`ready_to_dispatch_first_node`). The `first_node` field in the packet is advisory
metadata — the node is not yet opened. `/kaola-workflow-adapt` routes straight into
`/kaola-workflow-plan-run`, which opens and dispatches every node including the first
via `open-next`.

**Recursion-safety invariant.** `kaola-workflow-adaptive-node.js` is a pure
composition layer: it shells `next-action.js` and `commit-node.js` via
`child_process.execFileSync` and read-only-imports `plan-validator.js`'s exported
`parseNodes` parser. It does not import-and-mutate any engine script, and the engine
scripts never call back up into `adaptive-node.js`. This keeps the dependency graph
acyclic and the engine idempotent under resume.

**Four-edition shipping.** The new script ships in all four editions: the canonical
`scripts/kaola-workflow-adaptive-node.js`, the Codex byte-identical copy in
`plugins/kaola-workflow/scripts/`, plus GitLab and Gitea forge-named ports
(`kaola-gitlab-workflow-adaptive-node.js`, `kaola-gitea-workflow-adaptive-node.js`).
All four are registered in `validate-script-sync.js` COMMON_SCRIPTS and in all three
`install.sh` SUPPORT_SCRIPT_NAMES blocks.

## Non-goals

- Do not move judgment into scripts.
- Do not move role dispatch into scripts.
- This ADR does not change Phase 6 finalization (the contractor exception from ADR 0004
  remains in effect until a dedicated finalization transaction script is designed and
  tested).

## Consequences

Positive:

- Removes the first-node special case: every node in the adaptive lifecycle, including
  the first, is opened by the same `open-next` transaction. The planner's job ends
  after freeze + roadmap init + Planning Evidence.
- Replaces remaining contractor prose brackets in the executor loop with a single typed
  script call per node transition. The same correctness properties (idempotent,
  crash-safe, typed JSON output) that applied to the handoff now apply to every node.
- Reduces the surface where prose-transcribed bookkeeping can drift: the per-node
  lifecycle is now a closed-form contract expressed in `kaola-workflow-adaptive-node.js`.

Negative:

- Requires four-edition shipping and sync registration (as with all prior aggregators).
- The contractor still ships (Phase 6 finalization exception from ADR 0004), so the
  contractor profile is not yet removable.

## Lock

The first node in the adaptive lifecycle MUST be opened by `/kaola-workflow-plan-run`
via `kaola-workflow-adaptive-node.js open-next`, not by the planner or handoff.
`handoff_status: ready_to_run` is the only valid successful handoff terminal status;
`ready_to_dispatch_first_node` is retired and must not appear in live code or commands.
