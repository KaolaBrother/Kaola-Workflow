---
description: Kaola-Workflow Adaptive Executor. Executes a frozen workflow-plan.md via a running-set scheduler; each frontier unit dispatched concurrently up to the fan-out cap (critical-path-first); planner-proven-disjoint (parallel_safe) write frontiers co-open in isolated legs BY DEFAULT — no operator toggles — with serial as the fallback for overlapping/uncertain writes or hosts without worktree support. Resume-safe.
argument-hint: <project name>
---

# Kaola-Workflow Plan Run

Executes a frozen `workflow-plan.md` for an adaptive project (`workflow_path: adaptive`).
Reads and updates `kaola-workflow/{project}/workflow-state.md` throughout. The plan is
guarded by `plan_hash`; tampering is a **typed refusal**. Drive every node in the
`## Node Ledger` to `complete` or `n/a`, honoring the computed gates, then hand off to
Finalization. Stop and surface on any consent-halt or typed refusal.

Run subcommands with `--summary` for one-line output. For an opening call (`open-next` /
`open-ready` / `close-and-open-next`), the summary line already carries the dispatch
essentials: `summary: ok | opened=<node-id> role=<role> task=<codex_task_name>
mode=<codex_dispatch_mode> effort=<effort|inherit>` (one `opened=` segment per member on a
batch open; `effort=inherit` when no explicit tier was set; the leg path is NOT in the
summary line). The full envelope — every field, including `dispatch.leg_path` and the
complete `dispatch:{...}` object — needs `--json` without `--summary`, or the cached
`.cache/<op>-envelope.json`. Drill into the full envelope on `result: refuse` (includes
`operator_hint`), AND — whenever running with `--summary` — before every dispatch: take the
dispatch card from the summary line's `opened=` segment or from `.cache/<op>-envelope.json`.
Never dispatch without the card in view.

## Agent Model Badge

Every role dispatch carries an explicit `model=` line. Always pass it exactly as shown.
The installer fills each `model="{` placeholder for registered roles (e.g. `TDD_GUIDE_MODEL`,
`CODE_REVIEWER_MODEL`).

You MUST pass `model=` in every Agent call — do not omit it. For a dynamically-dispatched
node, resolve the model with `scripts/kaola-workflow-resolve-agent-model.js <role>` and
pass that exact value.

## Setup

Resolve the worktree path and `$KAOLA_SCRIPTS` before the first node call:

```bash
ACTIVE_WORKTREE_PATH="$(node -e "try{const fs=require('fs');const s=fs.readFileSync('kaola-workflow/{project}/workflow-state.md','utf8');const m=s.match(/^worktree_path:\\s*(.+)$/m);process.stdout.write(m?m[1].trim():'');}catch(e){}" 2>/dev/null)" || true
[ -z "$ACTIVE_WORKTREE_PATH" ] || [ ! -d "$ACTIVE_WORKTREE_PATH" ] && ACTIVE_WORKTREE_PATH="$(pwd)"
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-adaptive-node.js)")"
```

**Resolve the scripts path per command, not once.** The Bash tool does NOT persist
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

**Worktree-cwd contract:** the mutating lifecycle subcommands (`open-next` / `open-ready` /
`record-evidence --stdin` / `close-and-open-next` / `close-node` / `reconcile-running-set` /
`write-halt` / `clear-halt` / `reopen-node` / `revert-overflow` / `repair-node` / `route-findings`)
resolve the project folder — `workflow-plan.md`, the `## Node Ledger`, `.cache/{node-id}.md` evidence,
and the barrier baselines — **cwd-relative**. Run them ALL from the worktree so durable state lands
where the role agents write. Running one from the main repo root while a worktree is linked refuses
with `worktree_authority_split` (zero mutation) — `cd "$ACTIVE_WORKTREE_PATH"` and re-run. (`orient`
and `record-evidence --verify` are read-only and exempt; `mirror-project` is the main→worktree copy
and must run from the main root, above.)

## Gate-Role Degradation Notice

Determine dispatch availability BEFORE opening the first node, and re-check if it changes mid-run:
subagent role profiles are absent at BOTH the project-local `.codex/agents/kaola-workflow/` path
and the global `~/.codex/agents/kaola-workflow/` path, OR the runtime dispatch mode model-refuses
spawns. When dispatch is unavailable, post a PROMINENT run-start notice — before dispatching any
node — naming every gate role the plan will run inline as self-review: `adversarial-verifier`,
`code-reviewer`, `security-reviewer`.

For `adversarial-verifier` and `code-reviewer`, an inline gate reviewing its own writer-context is
no gate: do NOT dispatch the gate node inline and silently record a self-issued `verdict: pass`.
Instead route through the consent-halt valve (`write-halt --reason consent`) and await operator
resolution before the gate node is considered satisfied. Forward roles — `code-explorer`,
`knowledge-lookup`, `implementer`, `tdd-guide`, `doc-updater`, and `security-reviewer` when it runs
as a forward check — may still record the documented local fallback
(`local-fallback-tool-unavailable`) and proceed inline.

When a node runs inline under this degradation notice, announce it instead of the pre-spawn
format above:

```text
→ running {node_id} · {role} inline (…reason token…)
```

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

Announce the run once, right after this orient succeeds and before opening the first node:

```text
plan-run orchestrator: driving {project} — {N} nodes; each role subagent will be announced at dispatch.
```

Substitute `{project}` for the project name and `{N}` for the total row count of `## Nodes`.

### 2. Open next node

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-adaptive-node.js" open-next \
  --project {project} --json --summary
```

Under `--summary` (the canonical invocation above), the printed line is `summary: ok |
opened=<node-id> role=<role> task=<codex_task_name> mode=<codex_dispatch_mode>
effort=<effort|inherit>` or `summary: ok | allDone: true` — read the dispatch card straight
off the `opened=` segment. The full envelope needs `--json` without `--summary` (or the
cached `.cache/open-next-envelope.json`): `{opened:{id,role,model,declared_write_set}, nonce,
evidence_file, required_tokens, dispatch:{...}}` or `{allDone:true}`; the `dispatch`
sub-object there supersedes per-field assembly and is the only source for
`dispatch.leg_path`. On `allDone`, run chains then route to `/kaola-workflow-finalize
{project}`.

The fused `close-and-open-next` (step 4) opens every subsequent node. Re-run `open-next` only
when no node is `in_progress` (first node, or orphan from a crash between commit and fused advance).

Apply returned `taskTransitions` to the task list after every ledger-mutating call.

**Dispatch fidelity — concurrent dispatch is the DEFAULT, not an option.** `open-next` (and
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

Dispatch the base role profile in `dispatch.agent_type` (legacy `dispatch.role` is only
descriptive). Set `Working directory: ${ACTIVE_WORKTREE_PATH}` on every Agent call.

**Every spawn parameter comes from the dispatch card.** NEVER improvise a task name, omit
`agent_type`, or drop the effort tier because the card was not in view — go get the card
first (the summary line's `opened=` segment, or `.cache/<op>-envelope.json`).

Immediately before every spawn, announce the dispatch:

```text
→ dispatching {node_id} · {role} as subagent task "{task_name}" (model {model|default}, effort {effort|inherit})
```

`{task_name}` is `dispatch.codex_task_name` on Codex, the agent name/description on Claude, the
child task label on opencode.

For any non-null `dispatch.codex_reasoning_effort`, require a fresh child-session effort proof
for that exact requested effort before dispatch. The proof must inspect the spawned child's session
JSONL `turn_context.effort`; config text, `codex features list`, spawn arguments, and parent-side
descriptors are not proof. This applies to both V2 and V1 tiered Codex dispatch. If proof is absent,
stale, or failing, refuse before dispatch with `codex_effort_override_unavailable`.

For Codex v2 task-name mode (`dispatch.codex_dispatch_mode: "v2-task-name"`), after the proof gate
passes, pass `task_name: dispatch.codex_task_name` and `agent_type: dispatch.agent_type`. When
`dispatch.codex_reasoning_effort` is non-null, also pass `fork_turns: "none"` and
`reasoning_effort: dispatch.codex_reasoning_effort`; inherited-history forks are not a valid path
for tiered nodes. When the effort is null, omit `reasoning_effort` and let the base
profile/session default stand.

For Codex v1 fallback (`"v1-thread-id"`), omit `task_name` and prefix the prompt with a compact
identity header: `Node: <id> | Role: <role> | Effort: <dispatch.codex_reasoning_effort or default>`.
V1 wait/close rows may still show thread IDs; the prompt and evidence carry the node mapping.
Never append a max-effort profile suffix and never emit a
variant-missing note. Pass `dispatch.nonce` (evidence-binding token). Instruct the role to:
- Read the seeded `.cache/{node-id}.md` (`dispatch.evidence_file`) for required tokens.
- Fill in token stubs from its work; NEVER modify the `evidence-binding:` header line.
- `finalize` sink and `main-session-gate` are non-delegable — run `main-session-direct`.
  Record compliance as `main-session-direct` for the `finalize` sink node.
- Gate roles must `post-dominate` every code/sensitive node in the `## Node Ledger`; emit
  `verdict: pass|fail` + `findings_blocking: N`. Run `--forbidden-only` for forge-touching
  nodes. Forge-port mirror nodes: instruct with the `full accumulated root diff` diff spec.
- For read-only fan-out (`quorum`/`tally-fn`/`validateNodeOutput`): dispatch concurrently,
  record evidence parent-side, `close-node` per member.
- `FANOUT_CAP` (default 4) is a runtime limit, not a planning cap; a top-up re-run of `open-ready`
  drains wider frontiers as members close. `KAOLA_FANOUT_CAP_READONLY` (default 8) applies to
  read-only fan-out.
- Planner-proven-disjoint (`parallel_safe`), shared-infra, and coarse (same non-shared
  top-level area, exact-file-disjoint — e.g. two cross-edition antichains both under
  `plugins/`) write frontiers ALL co-open in isolated legs BY DEFAULT — no operator toggles —
  under the retained net (a post-dominating `code-reviewer` gate over the legs, no PROTECTED
  file in either set). Serial (`max_concurrent=1`) is the FALLBACK only for a genuine
  exact-path overlap (same file or a case-collision), a directory/glob-shaped entry that
  cannot prove exact-path disjointness, the retained net not holding, hosts without worktree
  support, or an explicit `KAOLA_PARALLEL_WRITES=0` opt-out; `--write-overlap-consent` is
  parsed for frozen-plan back-compat but is VESTIGIAL at this seam — see the leg-isolation
  note below. `opening` marker + `reconcile-running-set` handle crash-resume.
- `test_thrash` ≥ 3: escalate via `write-halt --reason test_thrash`.

<!-- PIN: leg-isolation-recipe -->
**Write-parallelism is default-on for disjoint AND same-area (coarse) frontiers.** The per-leg
isolation engine is COMPLETE and live, and every exact-file-disjoint write frontier —
planner-proven-disjoint (`parallel_safe`) siblings in different top-level areas, a shared-infra
frontier in the same infra area, or a coarse frontier in the same non-shared top-level area
(e.g. two cross-edition antichains both under `plugins/`) — co-opens as isolated parallel legs
**BY DEFAULT — no operator toggles**, gated only on the retained net: a post-dominating
`code-reviewer` gate over the legs, and no PROTECTED file in either set. Per-leg worktree
isolation + the mandatory synthesizer reconcile are the correctness net; co-open ALWAYS
provisions a dedicated leg per write sibling (group-form ⟺ legs provisioned — never the legless
attribution-blind union barrier).
- Serial is the FALLBACK only for a genuine exact-path overlap (same file or a case-collision), a
  directory/glob-shaped entry that cannot prove exact-path disjointness, the retained net not
  holding (no post-dominating gate, or a PROTECTED file in either set), hosts without worktree
  support, or an explicit `KAOLA_PARALLEL_WRITES=0` opt-out (which forces serial).
- `--write-overlap-consent` and `write_overlap_policy` are parsed for frozen-plan back-compat but
  are VESTIGIAL at this seam — they neither enable nor block any co-open decision here. A
  genuinely-overlapping (exact-path or case-collision) frontier serial-degrades regardless of
  consent — no cross-contamination, no silent loss. No consent flag is needed for any disjoint,
  shared-infra, or coarse frontier.

<!-- CARD: speculative-open -->
On `open-next` → `gate_not_complete` with a speculative gate (`speculative_open_policy: auto` — the
freeze-time default — or `consent`, in plan `## Meta`): `docs/plan-run-cards/speculative-open.md`
(covers `open-ready`'s speculative activation — automatic at `auto`, `--speculative-consent` at
`consent` — `discard-speculative`, gate verdict:fail rollback)

**Speculative gate-overlap is default-on (`speculative_open_policy: auto`) under the same structural
net as the consent tier.** A node whose only unsatisfied predecessor is a still-open gate opens the
moment `open-ready` runs — no per-run consent, no `decision:ask` capture, `--speculative-consent`
accepted as a no-op. Every write-speculation safety condition holds IDENTICALLY at `auto`: exact-path
disjointness against every live writer, no PROTECTED file, exact resolvability, not the plan's unique
sink, leg capability, fan-out caps, and the close fence (`speculativeCloseGuard` — a speculative node
can never reach `complete` before its gate does). A failing gate still discards the bet (read:
KEEP-or-discard operator review; write: unconditional leg teardown, parent untouched), and every
discard now records telemetry (node id, role, gate) in the run's provenance log — the cost of a bet
that did not pay off is observable, never silent. **Serial waiting for the gate to close is now the
DEGRADED path** — run `open-ready` to admit the speculative frontier rather than idling on
`open-next`; plain serial waiting is the ONLY behavior at `speculative_open_policy: off`. The per-run
consent ceremony REMAINS authorable: set `speculative_open_policy: consent` to require the explicit
`--speculative-consent` grant before a speculative node opens.
- **Write-leg dispatch discipline.** Isolation is **discipline-dependent, not transparent** —
  the Agent tool has no cwd parameter and a provisioned `.kw/legs/<project>/<node>` leg does NOT auto-redirect
  a leg agent's edits. Dispatch each leg with its member's **`dispatch.leg_path`** (and `dispatch.leg_branch`)
  from the `open-ready` payload — every `Edit`/`Write` uses an absolute `<dispatch.leg_path>/...` path and
  every Bash uses `cd "<dispatch.leg_path>" &&` (the load-bearing instruction in the leg brief), removing the
  need for a laneGroup cross-reference (the laneGroup descriptor remains for observability). The failure mode
  is **fail-closed containment, not construction**: a relative-path own-lane slip
  lands in the parent (invisible to the per-leg barrier, exempt from the write-lane hook) and is caught by
  the **parent-clean fence** before the merge → `merge_conflict`/repair, never silent cross-contamination or
  silent loss. **Bounded thrash:** after **K = 2** repair nudges on an agent that keeps writing out-of-lane,
  escalate to a `merge_conflict` halt rather than looping.
- `merge_conflict` (write-overlap): a write-leg level whose FIRST-detection refusal —
  `member_vacuity` (a no-op leg), `write_set_overflow` (an overflow), or the synthesizer's octopus
  bail (a real same-file conflict) — survives `MERGE_CONFLICT_REPAIR_LIMIT` (K=3) bounded repairs.
  Repair each first by its own recovery (re-dispatch the leg · `revert-overflow` · a reasoning-class
  **Opus**-floor `synthesizer` agent resolves a real conflict by intent), re-running `close-node`; on
  the K-th failure escalate via `write-halt --reason merge_conflict`. Routed exactly like `test_thrash`
  (a schema constant the orchestrator applies — NO script counter on the adaptive path); the
  COMMIT-based union barrier on M, never the counter, is the fail-closed gate, so a resumed run safely
  re-counts from zero. RESUMABLE consent-style halt — resolve, then `clear-halt --reason consent`.

**Evidence-persistence contract per role-kind.** There is ONE contract — no per-agent
guesswork:
- **READ-ONLY roles** (`code-explorer`, `knowledge-lookup`, `adversarial-verifier`, and the
  planner) CANNOT self-write `.cache` evidence — they RETURN their evidence text and the
  orchestrator persists it via `record-evidence --stdin` (below). `record-evidence` re-injects
  this node's `evidence-binding:` header, so persisting evidence cannot strip the header —
  the read-only role MUST NOT try to add or modify it.
- **WRITE-role agents** (`implementer`, `tdd-guide`) SELF-WRITE their `.cache` evidence, INCLUDING
  the seeded `evidence-binding:` header (read it from the seeded file, never alter it).

On every return, before evidence/close bookkeeping, announce the outcome:

```text
← {node_id} · {role} returned: {verdict or one-line outcome}
```

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

After every close, print the required progress line:

```text
{node-id} → complete; opened: {next-id|—}
```

On `result: ok` + `opened`: dispatch the next node (step 3) — it is already open.
On `allDone: true`: run chains then route to Finalization.
On `opened: null` + `allDone: false` (the typed `reason: 'frontier_blocked'` signal):
do NOT park silently. Deterministically re-run `orient` then `open-next` / `open-ready` to re-open
the recomputed frontier, draining toward `allDone` WITHOUT operator prompting. Cap the re-orient at
a small bound (e.g. 3 consecutive `frontier_blocked` cycles with no progress) before escalating with
stop+ask — a blocked-but-not-done frontier must never silently stall the run.

**Surface the narrowed barrier reason VERBATIM.** On a `barrier_failed` / `close-node`
refusal the ACTIONABLE narrowed reason (`write_set_overflow` / `write_set_granularity` /
`lockfile_write` / …) and the offending paths are now on the top-level `reason` / `outOfAllow`
fields. Surface them VERBATIM — print the full `reason` / `operator_hint` / `outOfAllow` — never
route the refusal through a lossy JSON-summary helper that truncates it.

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
covers only the running-set MECHANICS (`open-ready` / `close-node` / `reconcile-running-set`;
write-role lane-group co-open in isolated legs; crash repair) for each frontier
unit:

<!-- PIN: frontier unit -->
frontier unit

`docs/plan-run-cards/frontier-batch.md`
(covers `open-ready` / `close-node` / `reconcile-running-set`; write-role lane-group co-open in
isolated legs, the synthesizer + group barrier close; the `opening` crash-safe marker; `FANOUT_CAP`
vs `KAOLA_FANOUT_CAP_READONLY`)

### 5. All done

When `allDone: true`, detect the repo type and run the appropriate validation:

**Self-host (npm) — `package.json` declares `test:kaola-workflow:*` scripts:**

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-run-chains.js" --project {project}
```

**Invoke run-chains with `--project {project}`.** Always pass `--project {project}` to the
run-chains script so its receipt lands at `kaola-workflow/{project}/.cache/chain-receipt.json` where
Finalization's `--finalize-check` reads it — do NOT rely on cwd to locate the receipt.

**Consumer (non-npm) repo — no `test:kaola-workflow:*` scripts:** Do NOT invoke `run-chains.js`
(it can only return `chains_config_missing` in a consumer repo). Instead, run the plan's `## Meta`
`validation_command` and record the result in `kaola-workflow/{project}/.cache/final-validation.md`
with a column-0 `verdict: pass`. Finalization's `--finalize-check` auto-detects consumer mode
(absence of the `test:kaola-workflow:*` scripts) and gates on `final-validation.md`.

Then proceed to `/kaola-workflow-finalize {project}`.

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
  validation; do not re-derive a per-node command (the record-once discipline).
- **State the actual reuse boundary, not a false absolute.** When you cite a
  prior node run instead of rerunning, record WHICH node/state that run covered and that
  any later edits are outside it. Do NOT write a terminal absolute like `No files changed
  after those runs` when a node afterward changes relevant files — say e.g. `validation
  reuse covers code/test impact through node nN; the later edit is docs-only and outside
  the rerun trigger`.
