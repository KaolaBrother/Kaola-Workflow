---
name: kaola-workflow-plan-run
description: Use when executing a frozen adaptive workflow-plan.md — executes via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first); planner-proven-disjoint (parallel_safe) write frontiers co-open in isolated legs BY DEFAULT — no operator toggles — with serial as the fallback for overlapping/uncertain writes or hosts without worktree support. Resume-safe. Mirror of commands/kaola-workflow-plan-run.md for Codex runtime.
---

# Skill: kaola-workflow-plan-run

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
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-adaptive-node.js' -print -quit 2>/dev/null)")"
fi
```

**Resolve the scripts path per command, not once (#546 G5).** The Bash tool does NOT persist
environment variables between calls (true for Claude Code AND opencode) — a `$KAOLA_SCRIPTS` set
in one Bash call is GONE in the next, so a later lifecycle call crashes with `Cannot find module
'/…-adaptive-node.js'`. Re-resolve the absolute scripts path in EVERY Bash call that needs it:
either repeat the resolver block above (or an equivalent absolute-path lookup) at the top of each
call, or hardcode the absolute path — never rely on a once-set `$KAOLA_SCRIPTS` carrying into a
subsequent call.

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
- Planner-proven-disjoint (`parallel_safe`) write frontiers co-open in isolated legs
  BY DEFAULT — no operator toggles. Serial (`max_concurrent=1`) is the FALLBACK only for
  OVERLAPPING/uncertain writes, hosts without worktree support, or an explicit
  `KAOLA_PARALLEL_WRITES=0` opt-out; `--write-overlap-consent` is required ONLY for
  coarse/shared-infra (non-disjoint) co-open — see the leg-isolation note below. `opening`
  marker + `reconcile` handle batch crash-resume.
  `test_thrash` ≥ 3: escalate via `write-halt --reason test_thrash`.

<!-- PIN: leg-isolation-recipe -->
**Write-parallelism is default-on for disjoint frontiers (#542, D-542-01).** The per-leg
isolation engine is COMPLETE and live (#463 Closes, AC18 PASS), and planner-proven-disjoint
(`parallel_safe`) write frontiers co-open as isolated parallel legs **BY DEFAULT — no operator
toggles**. Per-leg worktree isolation + the mandatory synthesizer reconcile are the correctness
net; co-open ALWAYS provisions a dedicated leg per write sibling (group-form ⟺ legs provisioned —
never the legless attribution-blind union barrier).
- Serial is the FALLBACK only for OVERLAPPING/uncertain writes, hosts without worktree support, or
  an explicit `KAOLA_PARALLEL_WRITES=0` opt-out (which forces serial).
- `open-ready --write-overlap-consent` is required ONLY for coarse/shared-infra (non-disjoint)
  co-open — a frontier whose plan `## Meta` sets `write_overlap_policy: coarse`. Genuinely-overlapping
  writes stay consent-gated (`--write-overlap-consent` + `write_overlap_policy` != `off`); absent that
  consent an overlapping frontier serial-degrades safely — no cross-contamination, no silent loss.
  Disjoint frontiers need NO consent flag.

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

**Evidence-persistence contract per role-kind (#546 G4).** There is ONE contract — no per-agent
guesswork:
- **READ-ONLY roles** (`code-explorer`, `knowledge-lookup`, `adversarial-verifier`, and the
  planner) CANNOT self-write `.cache` evidence — they RETURN their evidence text and the
  orchestrator persists it via `record-evidence --stdin` (below). `record-evidence` re-injects
  this node's `evidence-binding:` header, so persisting evidence cannot strip the header (#546 G3) —
  the read-only role MUST NOT try to add or modify it.
- **WRITE-role agents** (`implementer`, `tdd-guide`) SELF-WRITE their `.cache` evidence, INCLUDING
  the seeded `evidence-binding:` header (read it from the seeded file, never alter it).

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

On `result: ok` + `opened`: dispatch the next node (step 3).
On `allDone: true`: run chains then route to Finalization.
On `opened: null` + `allDone: false` (the typed `reason: 'frontier_blocked'` signal, #546 G6):
do NOT park silently. Deterministically re-run `orient` then `open-next` / `open-ready` to re-open
the recomputed frontier, draining toward `allDone` WITHOUT operator prompting. Cap the re-orient at
a small bound (e.g. 3 consecutive `frontier_blocked` cycles with no progress) before escalating with
stop+ask — a blocked-but-not-done frontier must never silently stall the run.

**Surface the narrowed barrier reason VERBATIM (#546 G7).** On a `barrier_failed` / `close-node`
refusal the ACTIONABLE narrowed reason (`write_set_overflow` / `write_set_granularity` /
`lockfile_write` / …) and the offending paths are now on the top-level `reason` / `outOfAllow`
fields. Surface them VERBATIM — print the full `reason` / `operator_hint` / `outOfAllow` — never
route the refusal through a lossy JSON-summary helper that truncates it (the #543 G7 stall, where a
truncated n6 close-node reason silently parked the run).

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

**Invoke run-chains with `--project {project}` (#546 G11).** Always pass `--project {project}` to the
run-chains script so its receipt lands at `kaola-workflow/{project}/.cache/chain-receipt.json` where
Finalization's `--finalize-check` reads it — do NOT rely on cwd to locate the receipt.

#### Validation De-Duplication

Avoid redundant validation runs.

- During the run, each node validates only its affected task scope, not the full
  project, unless the node plan explicitly requires a full command or the touched
  surface is high risk.
- If a node's recorded check already passed against the same relevant file set and no
  relevant files changed afterward, cite the prior node evidence path
  (`.cache/{node-id}.md`) instead of rerunning it.
- After any routed fix or Trivial Inline Edit Exception edit, rerun only the affected
  node command unless the fix changes shared infrastructure.
- Run the full chains once here at All-done, not per node; that is the single
  full-suite pass before Finalization.
- Use the `validation_command` recorded in the plan `## Meta` for any full-suite
  validation; do not re-derive a per-node command (the #547 record-once discipline).
- **State the actual reuse boundary, not a false absolute (#324 AC3).** When you cite a
  prior node run instead of rerunning, record WHICH node/state that run covered and that
  any later edits are outside it. Do NOT write a terminal absolute like `No files changed
  after those runs` when a node afterward changes relevant files — say e.g. `validation
  reuse covers code/test impact through node nN; the later edit is docs-only and outside
  the rerun trigger`.
