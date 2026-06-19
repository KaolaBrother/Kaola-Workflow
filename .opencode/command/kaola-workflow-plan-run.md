---
description: Kaola-Workflow Adaptive Executor. Executes a frozen workflow-plan.md via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first), with serial as the degraded fallback for write nodes or when the write-parallelism conjunction is not met. Resume-safe.
---

# Kaola-Workflow Plan Run

Executes a frozen `workflow-plan.md` for an adaptive project (`workflow_path: adaptive`).
Reads and updates `kaola-workflow/{project}/workflow-state.md` throughout. The plan is
guarded by `plan_hash`; tampering is a **typed refusal**. Drive every node in the
`## Node Ledger` to `complete` or `n/a`, honoring the computed gates, then hand off to
Finalization. Stop and surface on any consent-halt or typed refusal.

Run subcommands with `--summary` for one-line output; drill into `.cache/<op>-envelope.json`
on `result: refuse` for the full envelope (includes `operator_hint`).

## Effort Variant Resolution

opencode resolves each subagent effort centrally from `opencode.json` (the two Kaola
tiers as reasoning-EFFORT VARIANTS of the inherited model): reasoning-tier roles run the
model's TOP effort variant, standard-tier roles its SECOND (e.g. max / high on GLM-5.2).
Dispatch a role with the `task` tool using `subagent_type: "<role>"`; do NOT pass a
per-call `model=` argument — the role's configured variant already selects the effort.
`mapTier(tier, provider)` resolves the variant: the reasoning tier → the TOP effort variant, the standard tier → its SECOND.

## Setup

Resolve the worktree path and `$KAOLA_SCRIPTS` before the first node call:

```bash
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] || [ ! -d "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-adaptive-node.js)")"
```

Then mirror the project folder into the worktree (idempotent, `plan_hash`-verified):

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" mirror-project \
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

## Loop Skeleton

### 1. Orient (on entry / resume)

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" orient \
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
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-next \
  --project {project} --json --summary
```

Returns `{opened:{id,role,model,declared_write_set}, nonce, evidence_file, required_tokens,
dispatch:{...}}` or `{allDone:true}`. The `dispatch` sub-object supersedes per-field assembly.
On `allDone`, run chains then route to `/kaola-workflow-finalize {project}`.

The fused `close-and-open-next` (step 4) opens every subsequent node. Re-run `open-next` only
when no node is `in_progress` (first node, or orphan from a crash between commit and fused advance).

Apply returned `taskTransitions` to the task list after every ledger-mutating call.

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

### 3. Dispatch the role agent

Dispatch the agent whose `role` matches `dispatch.role`. Set `Working directory: ${ACTIVE_WORKTREE_PATH}`
on every Agent call. The role's effort variant is applied centrally per opencode.json (reasoning-tier roles → the model's TOP effort, standard-tier roles → its SECOND); `dispatch.model` records the tier intent only. Pass `dispatch.nonce` (evidence-binding token). Instruct the role to:
- Read the seeded `.cache/{node-id}.md` (`dispatch.evidence_file`) for required tokens.
- Fill in token stubs from its work; NEVER modify the `evidence-binding:` header line.
- `finalize` sink and `main-session-gate` are non-delegable — run `main-session-direct`.
  Record compliance as `main-session-direct` for the `finalize` sink node.
- Gate roles must `post-dominate` every code/sensitive node in the `## Node Ledger`; emit
  `verdict: pass|fail` + `findings_blocking: N`. Run `--forbidden-only` for forge-touching
  nodes. Forge-port mirror nodes: instruct with the `full accumulated root diff` diff spec.
- For read-only fan-out (`quorum`/`tally-fn`/`validateNodeOutput`): dispatch concurrently,
  record evidence parent-side, `seal`, `join`.
- `FANOUT_CAP` (default 4) is a runtime limit, not a planning cap; `top-up` drains wider
  frontiers. `KAOLA_FANOUT_CAP_READONLY` (default 8) applies to read-only batches.
- Serial (`max_concurrent=1`) is the degraded mode; write parallelism requires the
  full conjunction — `KAOLA_LANE_CONTAINMENT`, `KAOLA_LEG_ISOLATION`, and
  `--write-overlap-consent` — see the activation recipe below. `opening` marker +
  `reconcile` handle batch crash-resume.
- `test_thrash` ≥ 3: escalate via `write-halt --reason test_thrash`.

<!-- PIN: leg-isolation-recipe -->
**Write-parallelism activation recipe (#500 L2).** The per-leg isolation engine is COMPLETE
and live (not dormant — #463 Closes, AC18 PASS). Three toggles together activate it:
1. `KAOLA_LANE_CONTAINMENT=true` — enable the lane-containment scheduler.
2. `KAOLA_LEG_ISOLATION=true` — provision a dedicated worktree leg for each write sibling.
3. `open-ready --write-overlap-consent` — explicitly consent to the shared-infra co-open for
   frontiers whose plan `## Meta` sets `write_overlap_policy: coarse`. Absent either `KAOLA_LEG_ISOLATION`
   or `--write-overlap-consent`, the lane-group formation check short-circuits and the frontier
   serial-degrades safely — no cross-contamination, no silent loss.

<!-- CARD: speculative-open -->
On `open-next` → `gate_not_complete` with a speculative gate (policy `speculative_open_policy:
consent` in plan `## Meta`): `docs/plan-run-cards/speculative-open.md`
(covers `open-ready --speculative-consent`, `discard-speculative`, gate verdict:fail rollback)
- **Write-leg dispatch discipline (#463 AC3).** Isolation is **discipline-dependent, not transparent** —
  the Agent tool has no cwd parameter and a provisioned `.kw/legs/<project>/<node>` leg does NOT auto-redirect
  a leg agent's edits. Dispatch each leg with its **absolute `legPath`**: every `Edit`/`Write` uses an
  absolute `<legPath>/...` path and every Bash uses `cd "<legPath>" &&` (the load-bearing instruction in the
  leg brief). The failure mode is **fail-closed containment, not construction**: a relative-path own-lane slip
  lands in the parent (invisible to the per-leg barrier, #386-exempt from the write-lane hook) and is caught by
  the **parent-clean fence** before the merge → `merge_conflict`/repair, never silent cross-contamination or
  silent loss. **Bounded thrash:** after **K = 2** repair nudges on an agent that keeps writing out-of-lane,
  escalate to a `merge_conflict` halt rather than looping.
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
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" record-evidence \
  --project {project} --node-id {node-id} --stdin --json
```

### 4. Close and advance

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" close-and-open-next \
  --project {project} --node-id {node-id} --json --summary
```

Enforces (in order): evidence-shape check → barrier (`plan_hash` re-verified, diff against
baseline, `post-dominate` gate check, `escalated_to_full: consent` / `typed refusal` on lane
overflow) → close + compliance row → selector routing → fused advance. Returns
`{closed:{...}, opened:{...}|null, allDone}` or `result: refuse`.

On `result: ok` + `opened`: dispatch the next node (step 3) — it is already open.
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

When `allDone: true`, run:

```bash
node $KAOLA_SCRIPTS/kaola-workflow-run-chains.js
```

Then proceed to `/kaola-workflow-finalize {project}`.
