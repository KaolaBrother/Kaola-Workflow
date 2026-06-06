# docs node — evidence record (issue #255)

## Files edited

1. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/CLAUDE.md`
2. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/README.md`
3. `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/docs/api.md`

---

## CLAUDE.md addition

Added after the `kaola-workflow-commit-node.js` entry in `## Key Scripts`:

```
- `scripts/kaola-workflow-adaptive-handoff.js` — adaptive aggregator (#255): collapses the contractor classify/freeze/orient/advance chain into ONE mechanical planner→first-node transaction. Branches on validator `result` (in-grammar → freeze + resume-check + open node1 + baseline + roadmap + Planning Evidence → `ready_to_dispatch_first_node`; refuse → `plan_invalid`, no mutation). `decision:ask` is audit metadata, not a gate. Run by the `workflow-planner`; the orchestrator drives the bounded repair loop on `plan_invalid`.
```

---

## README.md changes (3 spots + 1 gloss)

### 1. Agent table cell (line 118) — corrected planner description

Before:
```
| `workflow-planner` | Adaptive path — front-end (claims + authors the `## Nodes` DAG; main governs + freezes) | Opus | no |
```

After:
```
| `workflow-planner` | Adaptive path — front-end (claims + authors the `## Nodes` DAG; runs the handoff which freezes mechanically) | Opus | no |
```

### 2. workflow-planner paragraph (lines 137-146) — corrected boundary

Before (stale):
> The main Opus session then reads the durable files, runs git-freshness,
> **governs** the risk decision (auto-run / ask / typed-refusal), and the `contractor` stamps the
> freeze + checkpoint + roadmap. It never freezes, judges risk, asks the user, or dispatches a subagent

After (new reality):
> then **runs `kaola-workflow-adaptive-handoff.js`** — which freezes mechanically on `result:in-grammar`,
> resume-checks, opens the first ready node (ledger `in_progress`), records the node1 baseline, stages
> the roadmap, and writes `## Planning Evidence` into `workflow-state.md` (preserving the `## Sink`
> block) — returning a checklist-backed packet (`handoff_status: ready_to_dispatch_first_node` with
> `first_node` on success; `plan_invalid` with no mutation on `refuse`). The orchestrator reads the
> packet and dispatches the first node directly, then runs `/kaola-workflow-plan-run`. It never
> **judges** risk and never asks the user — `decision:auto-run` vs `ask` is audit metadata recorded by
> the handoff; the run proceeds either way with no approval gate.

### 3. Adaptive path prose (line 563) — corrected flow

Before (stale):
> The main session then reads the durable files, runs git-freshness, and **governs** one fail-closed risk
> decision: in-grammar **and** provably low-risk → provisional auto-run; any sensitivity, write-role
> fan-out, shared-infrastructure touch, over-ceiling, loop, or uncertainty → **ask the user first**;
> out-of-grammar → typed refusal. On approval the `contractor` stamps the freeze ...

After (new reality):
> The handoff script branches on the plan-validator `--json` `result`: on `in-grammar` it freezes
> mechanically — writing a `plan_hash` inside `workflow-plan.md` ... — resume-checks, opens the first
> ready node (ledger `in_progress`), records the node1 baseline, stages the roadmap, and writes
> `## Planning Evidence` into `workflow-state.md`, then returns `handoff_status: ready_to_dispatch_first_node`
> with a checklist and `first_node` packet. `decision:auto-run` vs `ask` is **audit metadata** recorded
> in the packet — the run proceeds either way with no user-approval gate. On `refuse` the handoff returns
> `plan_invalid` with no mutation; the orchestrator drives a bounded repair loop ...

### 4. Pattern table gloss (line 569) — corrected `ask` semantics

Before:
> `ask` = surfaces the DAG for your approval before it freezes, because write concurrency or a loop carries blast-radius risk

After:
> `ask` = recorded as audit metadata by the handoff, which still freezes and proceeds — no approval gate — but the blast-radius reason is surfaced in the packet for the orchestrator

---

## docs/api.md change (around line 489)

### Hard boundary section — updated

Before:
```
### Hard boundary — never freeze, judge, ask, or dispatch

- **Never freezes.** The `plan_hash` freeze is the contractor's stamp, governed by the main session;
  the agent's validator `--json` run is orientation only.
- **Never judges risk.** The auto-run / ask / typed-refusal governance is the main session's call.
- **Never asks the user.** User consent is an orchestrator responsibility.
- **Never dispatches a subagent.** A subagent cannot dispatch a subagent (governing harness
  constraint); the agent returns control to main, which owns the entire dispatch loop, the freeze,
  and all governance.
```

After:
```
### Hard boundary — never judge risk, never ask, never dispatch

- **Freeze is mechanical.** The planner RUNS `kaola-workflow-adaptive-handoff.js`, which stamps the
  `plan_hash` freeze automatically on `result:in-grammar`. The planner does not decide to freeze —
  the script does it on an in-grammar result.
- **Never judges risk.** `decision:auto-run` vs `ask` is audit metadata recorded by the handoff;
  the run proceeds either way. The planner makes the plan in-grammar, runs the handoff, and returns
  the packet — it does not govern the risk decision.
- **Never asks the user.** User consent is an orchestrator responsibility; `decision:ask` is not a
  pre-handoff approval gate.
- **Never dispatches a subagent.** A subagent cannot dispatch a subagent (governing harness
  constraint); the agent runs scripts (shells the handoff) and returns the packet to main.
```

---

## Verification against real script behavior

All field names confirmed from script code (not just header comment):
- `handoff_status: 'ready_to_dispatch_first_node'` — line 14 header + grep on return objects
- `handoff_status: 'plan_invalid'` — line 18 header + lines 283, 298, 315, 329, etc.
- checklist keys: `claim_acquired, plan_in_grammar, plan_frozen, resume_check_ok, first_node_opened, baseline_recorded, roadmap_staged` — lines 15-16 header + wired into returned object
- `validator_verdict` — line 18 header + lines 286, 301, 318, 332, etc.
- `decision:ask` freezes-and-proceeds — line 20-21 header: "2-state only: branch on validator --json `result`... decision:ask is audit METADATA that freezes-and-proceeds — NO needs_user_approval"

No fabricated flags or fields; no invented CLI flags (confirmed `--project`, `--plan`, `--json`, `--state-mtime` are the real CLI from line 11).

---

## Validator exit codes

- `node scripts/validate-workflow-contracts.js` (KAOLA_WORKFLOW_OFFLINE=1): **EXIT 0** — "Workflow contract validation passed"
- `node scripts/simulate-workflow-walkthrough.js`: **EXIT 0** — "Workflow walkthrough simulation passed"

---

## n/a: GREEN — documentation node, no test cycle; verification = validators green + content matches script --json behavior
