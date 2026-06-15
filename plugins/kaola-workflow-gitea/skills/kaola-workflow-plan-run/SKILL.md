---
name: kaola-workflow-plan-run
description: Use when executing a frozen adaptive workflow-plan.md — executes via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first), with serial as the degraded fallback for write nodes or when lane containment is off. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.
---

# Skill: kaola-workflow-plan-run (Gitea)

Adaptive executor. Runs a frozen `workflow-plan.md` (`workflow_path: adaptive`) by
traversing its DAG + `## Node Ledger` instead of the fixed phaseN ladder. Reads and
updates `kaola-workflow/{project}/workflow-state.md` throughout. The plan is guarded by
`plan_hash`; tampering is a **typed refusal**. Drive every node to `complete` or `n/a`,
honoring the computed gates, then route to `kaola-workflow-finalize`.

Run subcommands with `--summary` for one-line output; drill into `.cache/<op>-envelope.json`
on `result: refuse` for the full envelope (includes `operator_hint`).

## Setup

Resolve the worktree path and `$KAOLA_SCRIPTS` before the first node call:

```bash
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/' + process.env.KAOLA_PROJECT + '/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
KAOLA_SCRIPTS="plugins/kaola-workflow-gitea/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-adaptive-node.js' -print -quit 2>/dev/null)")"
fi
```

Then mirror the project folder into the worktree (idempotent, `plan_hash`-verified):

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" mirror-project \
  --project {project} --json
```

`status: mirrored | exists | skipped` → proceed. `result: refuse` → STOP and surface verbatim.

Then **enter the worktree** — every adaptive lifecycle call below runs from the worktree cwd:

```bash
[ -n "$ACTIVE_WORKTREE_PATH" ] && [ "$ACTIVE_WORKTREE_PATH" != "$(pwd)" ] && cd "$ACTIVE_WORKTREE_PATH"
```

**Worktree-cwd contract (#466):** the mutating lifecycle subcommands (`open-next` / `open-ready` /
`record-evidence --stdin` / `close-and-open-next` / `close-node` / `reconcile-running-set` /
`write-halt` / `clear-halt` / `reopen-node` / `revert-overflow` / `repair-node` / `route-findings`)
resolve the project folder — `workflow-plan.md`, the `## Node Ledger`, `.cache/{node-id}.md` evidence,
and the barrier baselines — **cwd-relative**. Run them ALL from the worktree so durable state lands
where the role agents write. Running one from the main repo root while a worktree is linked refuses
with `worktree_authority_split` (zero mutation) — `cd "$ACTIVE_WORKTREE_PATH"` and re-run. (`orient`
and `record-evidence --verify` are read-only and exempt; `mirror-project` is the main→worktree copy
and must run from the main root, above.)

## Dispatch

Reasoning effort (#451, supersedes #405): the xhigh effort-variant profiles are retired — always
delegate to the base `dispatch.agent_type` profile (= the node's role). Codex 0.139 has no per-spawn
reasoning-effort override, so effort rides the parent SESSION: when `dispatch.codex_reasoning_effort`
is non-null (the planner gave the node `model: opus` → `xhigh`), ensure the Codex session reasoning
effort equals it BEFORE spawning; when null (`sonnet`/absent → `role_default`), leave the standing
session effort untouched. Base profiles OMIT `model_reasoning_effort`, so the spawned agent inherits
the session (agent-config wins over project-profile, PR #14807). Never append a max-effort profile
suffix and never emit a variant-missing note. Pass `Working directory: ${ACTIVE_WORKTREE_PATH}` to
every role delegation.

## Loop Skeleton

### 1. Orient (on entry / resume)

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" orient \
  --project {project} --json --summary
```

`orient` is read-only: re-checks `plan_hash`, the ready set from `next-action`, any `in_progress`
node and its `.cache/{node-id}.md` state, `escalated_to_full` / `consent_halt: pending` markers,
and the `allDone` flag. Makes NO mutations.

<!-- CARD: resume -->
On crash/interrupt resume, read the card: `docs/plan-run-cards/resume.md`
(covers `requires_redispatch`, complete-evidence crash, consent-halt `clear-halt`, unfrozen plan)

<!-- CARD: governance -->
On `plan_not_frozen` / governance: `docs/plan-run-cards/governance.md`
(covers `decision:auto-run`/`decision:ask` audit metadata; `provisional` run authorization;
`auto-run` vs `ask` — a frozen in-grammar plan RUNS either way; `typed refusal` on out-of-grammar)

### 2. Open next node

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" open-next \
  --project {project} --json --summary
```

Returns `{opened:{id,role,model,declared_write_set}, nonce, evidence_file, required_tokens,
dispatch:{...}}` or `{allDone:true}`. On `allDone`, run chains then route to finalize.

The fused `close-and-open-next` (step 4) opens every subsequent node. Re-run `open-next` only
when no node is `in_progress`.

### 3. Dispatch the role agent

Delegate to the base role profile matching `dispatch.agent_type`. Apply the reasoning-effort rule
above (session effort = `dispatch.codex_reasoning_effort` when non-null). Pass `dispatch.nonce`
(evidence-binding token). Instruct the role to:
- Read the seeded `.cache/{node-id}.md` (`dispatch.evidence_file`) for required tokens.
- Fill in token stubs; NEVER modify the `evidence-binding:` header line.
- `finalize` sink and `main-session-gate` are non-delegable — run `main-session-direct`.
  Record compliance as `main-session-direct` for the `finalize` sink node.
- Gate roles must `post-dominate` every code/sensitive node in the `## Node Ledger`; emit
  `verdict: pass|fail` + `findings_blocking: N`. Run `--forbidden-only` for forge-touching
  nodes. Forge-port mirror nodes: instruct with the `full accumulated root diff` diff spec.
- For read-only fan-out (`quorum`/`tally-fn`/`validateNodeOutput`): dispatch concurrently,
  record evidence parent-side, `seal`, `join`.
- `FANOUT_CAP` (default 4) is a runtime limit, not a planning cap; `top-up` drains wider
  frontiers. `KAOLA_FANOUT_CAP_READONLY` (default 8) applies to read-only batches.
- Serial (`max_concurrent=1`) is the degraded mode; `opening` marker + `reconcile` handle
  batch crash-resume. `test_thrash` ≥ 3: escalate via `write-halt --reason test_thrash`.
- `merge_conflict` (#463 write-overlap): a write-leg level whose FIRST-detection refusal —
  `member_vacuity` (a no-op leg), `write_set_overflow` (an overflow), or the synthesizer's octopus
  bail (a real same-file conflict) — survives `MERGE_CONFLICT_REPAIR_LIMIT` (K=3) bounded repairs.
  Repair each first by its own recovery (re-dispatch the leg · `revert-overflow` · a reasoning-class
  **Opus**-floor `synthesizer` agent resolves a real conflict by intent), re-running `close-node`; on
  the K-th failure escalate via `write-halt --reason merge_conflict`. Routed exactly like `test_thrash`
  (a schema constant the orchestrator applies — NO script counter on the adaptive path); the
  COMMIT-based union barrier on M, never the counter, is the fail-closed gate, so a resumed run safely
  re-counts from zero. RESUMABLE consent-style halt — resolve, then `clear-halt --reason consent`.

Record durable evidence after the role returns:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" record-evidence \
  --project {project} --node-id {node-id} --stdin --json
```

### 4. Close and advance

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-adaptive-node.js" close-and-open-next \
  --project {project} --node-id {node-id} --json --summary
```

Enforces (in order): evidence-shape check → barrier (`plan_hash` re-verified, diff against
baseline, `post-dominate` gate check, `escalated_to_full: consent` / `typed refusal` on lane
overflow) → close + compliance row → selector routing → fused advance. Returns
`{closed:{...}, opened:{...}|null, allDone}` or `result: refuse`.

On `result: ok` + `opened`: dispatch the next node (step 3).
On `allDone: true`: run chains then route to Finalization.

<!-- CARD: repair-routing -->
On barrier refusal / `route-findings` result: `docs/plan-run-cards/repair-routing.md`
(covers `write_set_granularity` / `write_set_overflow` / `sensitive_write_unreviewed` /
`foreign_archive` / `unattributed_write`; `revert-overflow` vs `repair-node`; `halt for consent`;
`write-halt --reason consent`; `escalated_to_full: consent` / `escalated_to_full: security`;
`triage` / `proposed_repair` object; plan-repair via `--freeze`; `--forbidden-only` check)

<!-- CARD: reopen-complete-node -->
On reopening a complete node: `docs/plan-run-cards/reopen-complete-node.md`
(covers `reopen-node` for Finalization-surfaced failures; `would_orphan_in_progress` refusal;
`mid-gate` repair; `read-only` fan-out quorum bounded controller; `LOOP_CAP` / `dry_streak`;
`test_thrash` escalation; `validateNodeOutput` absent-but-never-script-enforced note)

<!-- CARD: frontier-batch -->
**Dispatch fidelity (#472) — concurrent dispatch is the DEFAULT, not an option.** `open-next` (and
`orient` / `close-and-open-next`) return `enterBatch: true` + a `frontier: [...]` whenever the planner
authored an INDEPENDENT frontier of width ≥2 — that is authored parallelism, and you MUST run it as
authored. On `enterBatch: true`: run `open-ready` (it marks the whole frontier `in_progress`), then
dispatch the returned nodes' role agents **in ONE assistant message** — multiple `Agent` calls in a
single turn. The single-message dispatch is the *only* thing that yields real concurrency; dispatching
one agent per turn is itself a serial barrier and silently serializes a frontier the planner authored as
parallel. Do NOT `open-next`-then-single-dispatch a ≥2 frontier (the script now refuses to single-open
it). **Width stays the planner's scope-driven call:** a width-1 frontier or a dependency chain returns
NO `enterBatch` and runs serially (the normal single-dispatch path) — never force a minimum width, a
"default to ≥2," or a "prefer wide" posture.

On `enterBatch: true` the concurrent one-message dispatch above is the DEFAULT (not optional); this card
covers only the batch MECHANICS (crash-safe open/seal/join, write-role serial-degrade) for each frontier
unit:

<!-- PIN: frontier unit -->
frontier unit

`docs/plan-run-cards/frontier-batch.md`
(covers `open-batch` / `top-up` / `seal-member` / `seal` / `join` / `reconcile`; write-role
serial-degrade `cwd_unenforceable`; `opening` crash-safe marker; `running-set` scheduler;
`open-ready` / `close-node`; `reconcile-running-set`; `FANOUT_CAP` vs `KAOLA_FANOUT_CAP_READONLY`)

### 5. All done

When `allDone: true`, run chains then delegate to `kaola-workflow-finalize {project}`.
