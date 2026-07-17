---
name: kaola-workflow-adapt
description: Use when authoring an adaptive workflow-plan.md — freely compose a task-shaped DAG of role nodes, then the validator proves it in-grammar and freezes it. Mirror of commands/kaola-workflow-adapt.md for Codex runtime.
---

<!-- PIN: codex-profile-preflight -->
## Codex Profile Freshness Gate

On every entry or resume into this skill, before any role probe, retry, re-plan,
or real dispatch, run the normal preflight gate, not `--doctor`. Resolve exactly
one enabled installed Kaola edition from `codex plugin list --json`, then execute
the bundled `kaola-workflow-codex-preflight.js` from that edition's exact
marketplace/name/version cache tuple.
Never search `$PWD/plugins` or select the lexically first cache entry:

```bash
if ! KAOLA_CODEX_PLUGIN_LIST_OUT="$(codex plugin list --json 2>&1)"; then
  printf 'profile_preflight_refused: plugin metadata unavailable: %s\n' "$KAOLA_CODEX_PLUGIN_LIST_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PLUGIN_META="$(node -e '
const value=JSON.parse(process.argv[1]);
const allowed=new Set(["kaola-workflow","kaola-workflow-gitlab","kaola-workflow-gitea"]);
const rows=(Array.isArray(value.installed)?value.installed:[]).filter(row => row && row.installed === true && row.enabled === true && allowed.has(row.name));
if(rows.length!==1)throw new Error(`expected exactly one enabled installed Kaola edition; got ${rows.length}`);
const row=rows[0];
for(const [label,item] of [["marketplace",row.marketplaceName],["name",row.name],["version",row.version]])if(typeof item!=="string"||item==="."||item===".."||!/^[A-Za-z0-9._-]+$/.test(item))throw new Error(`unsafe ${label}`);
if(row.pluginId!==`${row.name}@${row.marketplaceName}`)throw new Error("plugin identity mismatch");
process.stdout.write([row.marketplaceName,row.name,row.version].join("\t"));
' "$KAOLA_CODEX_PLUGIN_LIST_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: invalid plugin metadata: %s\n' "$KAOLA_CODEX_PLUGIN_META" >&2
  exit 1
fi
IFS=$'\t' read -r KAOLA_CODEX_MARKETPLACE KAOLA_CODEX_PLUGIN_NAME KAOLA_CODEX_PLUGIN_VERSION <<< "$KAOLA_CODEX_PLUGIN_META"
KAOLA_CODEX_CACHE_ROOT="$HOME/.codex/plugins/cache"
if ! KAOLA_CODEX_PREFLIGHT="$(node -e '
const fs=require("fs"),path=require("path");
const [home,base,marketplace,name,version]=process.argv.slice(1);
const resolvedHome=path.resolve(home),resolvedBase=path.resolve(base);
if(resolvedBase!==path.join(resolvedHome,".codex","plugins","cache"))throw new Error("plugin cache root escapes HOME");
let cursor=resolvedHome;
const homeStat=fs.lstatSync(cursor);
if(homeStat.isSymbolicLink()||!homeStat.isDirectory())throw new Error("HOME is unsafe");
const parts=[".codex","plugins","cache",marketplace,name,version,"scripts","kaola-workflow-codex-preflight.js"];
for(let index=0;index<parts.length;index+=1){
  cursor=path.join(cursor,parts[index]);
  const stat=fs.lstatSync(cursor);
  if(stat.isSymbolicLink())throw new Error(`symlink cache component: ${cursor}`);
  if(index<parts.length-1&&!stat.isDirectory())throw new Error(`non-directory cache component: ${cursor}`);
  if(index===parts.length-1&&!stat.isFile())throw new Error(`preflight is not a regular file: ${cursor}`);
}
process.stdout.write(cursor);
' "$HOME" "$KAOLA_CODEX_CACHE_ROOT" "$KAOLA_CODEX_MARKETPLACE" "$KAOLA_CODEX_PLUGIN_NAME" "$KAOLA_CODEX_PLUGIN_VERSION" 2>&1)"; then
  printf 'profile_preflight_refused: exact active preflight unavailable: %s\n' "$KAOLA_CODEX_PREFLIGHT" >&2
  exit 1
fi
KAOLA_CODEX_PREFLIGHT_ARGS=(--project-root "$PWD" --no-autofix --json)
if [ -n "${KAOLA_CODEX_PREFLIGHT_PLAN:-}" ]; then
  KAOLA_CODEX_PREFLIGHT_ARGS+=(--plan "$KAOLA_CODEX_PREFLIGHT_PLAN")
fi
if ! KAOLA_CODEX_PREFLIGHT_OUT="$(node "$KAOLA_CODEX_PREFLIGHT" "${KAOLA_CODEX_PREFLIGHT_ARGS[@]}" 2>&1)"; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
if ! KAOLA_CODEX_PREFLIGHT_STATUS="$(node -e 'const v=JSON.parse(process.argv[1]);if(typeof v.status!=="string")throw new Error("missing status");process.stdout.write(v.status)' "$KAOLA_CODEX_PREFLIGHT_OUT" 2>&1)"; then
  printf 'profile_preflight_refused: malformed preflight result: %s\n' "$KAOLA_CODEX_PREFLIGHT_STATUS" >&2
  exit 1
fi
if [ "$KAOLA_CODEX_PREFLIGHT_STATUS" != ok ]; then
  printf 'profile_preflight_refused: %s\n' "$KAOLA_CODEX_PREFLIGHT_OUT" >&2
  exit 1
fi
```

The exact active cache root is
`$HOME/.codex/plugins/cache/$KAOLA_CODEX_MARKETPLACE/$KAOLA_CODEX_PLUGIN_NAME/$KAOLA_CODEX_PLUGIN_VERSION`.
The base invocation is `--project-root "$PWD" --no-autofix --json`; the gate
merges persisted config from HOME through the repository root to `"$PWD"`. When this
skill owns a frozen adaptive plan, set `KAOLA_CODEX_PREFLIGHT_PLAN` to that
exact plan before running the block so `--plan` is also enforced. Continue only
after exit 0 and parsed `status: "ok"`. Exact-byte drift such as
`profile_bytes_mismatch` is `profile_preflight_refused`: STOP before any
`agents.spawn_agent` call, never record `subagent-invoked`, and do not relabel
profile/config drift as tool unavailability or local fallback. Re-run the gate if the installed profile set changes.
<!-- /PIN -->

# Skill: kaola-workflow-adapt

## In-progress re-plan control plane

<!-- PIN: replan-adapt -->

This fence outranks normal adaptive startup and authoring. Before any claim, handoff, or planner
startup action, read the project state and transaction status. When either reports
`replan_in_progress`, keep the frozen parent `workflow-plan.md` authoritative. Read-only
orientation reports the exact `replan_phase`, `transaction_id`, `parent_plan_hash`,
`child_plan_hash` (or `none`), and `last_cas_result`; never reconstruct them from memory.

The single legal mutation while the fence is active is:

```bash
REPLAN_SCRIPT="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js"
if [ ! -f "$REPLAN_SCRIPT" ]; then
  REPLAN_SCRIPT="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-replan.js' -print -quit 2>/dev/null)"
fi
[ -n "$REPLAN_SCRIPT" ] && [ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-gitea-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

Do not run normal startup, ordinary adaptive handoff, scheduler, task-mirror refresh, archive, or
finalize during an intermediate phase. `decision:ask` remains advisory and adds no gate. If resume
returns `replan_planner_dispatch_required`, dispatch the genuine `workflow-planner` profile in its
Re-plan dispatch mode with only the repository root, project, `transaction_id`, `dispatch_nonce`,
profile identity, the exact `.cache/replan-planner-packet.json` path, and its reason/source
evidence. No role sequence, node ids, dependencies, write sets, cardinality, shape, model, or exact
DAG fragment may come from the orchestrator; that is
`planner_control_boundary_violation`. The planner alone writes the seeded
`workflow-plan.next.md` plus `.cache/replan-planner-attestation.json`, and main then invokes the
same resume command. Missing or mismatched proof is `replan_planner_attestation_invalid`.

An invalid child uses the bounded unfrozen child-repair loop with the same planner and verbatim
validator errors; the main session never repairs the child DAG. At the bound, stop with typed
evidence—never start another claim or path. A verified legacy-v1 parent enters its schema-2 child
through this transaction; normal startup and other legacy behavior remain unchanged.

Phase-0 of the adaptive path: the agent **freely authors** a task-shaped DAG for *this*
issue — which roles, how many, in what shape — into a `workflow-plan.md`. There is no
template library and no knob-binding ceremony. Mirror of `commands/kaola-workflow-adapt.md`
for the Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`.

Adaptive is the unconditional default; `fast`/`full` are explicit path-naming
escapes, never an automatic fallback (see `kaola-workflow-next`
Startup Step 0a-1).

<!-- PIN: reviewer-contract-v2-authoring -->
## Reviewer Contract V2 Authoring

Every newly authored plan declares `plan_schema_version: 2`. Never freeze a new draft with a
missing version or `plan_schema_version: 1`. A verified already-frozen plan whose hash-covered
Meta predates the version field is the only legacy case: route it byte-preserving as
`contract_version: 1`, and never rewrite its plan, evidence vocabulary, or journal. If execution
later emits `replan_required`, return that typed packet to the owning orchestrator; this authoring
surface never thaws the frozen DAG or activates a replacement plan.

Schema-2 `## Meta` records the complete validation policy: the exact `validation_command`,
normalized `validation_cwd`, `validation_repetitions` from 1 through 5,
`validation_pass_rule: all`, `validation_timeout_minutes` from 1 through 120, and a canonical sorted
`validation_env_allowlist`. A code-producing plan requires both the command and timeout. Also
record `code_certifier`, `security_certifier`, `inherited_frontier_digest`, and
`inherited_frontier_classes`. Use `none` only when that class is absent; when authoritative
handoff state supplies an inherited digest/classes pair, copy it exactly and never synthesize,
drop, or change it.

Use this schema-2 node header exactly:

`| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |`

Every review gate has a nonempty single-line `gate_claim` and `gate_surface`.
`gate_aggregation` is `sequence` for a singleton, `replicated_majority` for replicas sharing
one surface, or `partitioned_all` for members with distinct surfaces. The graph-derived mode is
authoritative: a change-gate `adversarial-verifier` carries a canonical sorted `certifies`
producer list, an investigation verifier carries an empty one, and code/security certifier producer
sets remain validator-derived. Non-gate rows leave all four gate columns empty. Design a real common
certifier wall for every required code/security frontier; branch-local reviewers do not satisfy the
planner-designated certifier metadata. Compact-plan and exact-file write-set rules remain binding.
<!-- /PIN -->

## The grammar (the closed envelope)

Each node is one row of the `## Nodes` table:
`| id | role | depends_on | declared_write_set | cardinality | shape | model |`.
- **role** must be in the installed library (the nine canonical roles + any
  maintainer-installed role such as `adversarial-verifier`). The validator hard-rejects
  an unknown role.
- **model** (optional) — declarative reasoning/wait-budget metadata from `{reasoning|standard}`.
  Every named Codex role profile omits model and effort so the child inherits the current parent
  session; this cell never selects child strength and never conflicts with a role's historical/default
  metadata class. The legacy
  `opus`/`sonnet` aliases remain accepted as `reasoning`/`standard`; new plans author neutral tokens.
  An out-of-vocab cell is a freeze refusal (`model_invalid`); a `main-session-gate` must not carry a
  model; absent/`—` resolves through the same role-static tier, and an unresolved card refuses as
  `codex_tier_unresolved`.
- **shape** is exactly one of three productions: `sequence`, `fanout(<group>)` (N
  instances of one role over pairwise-disjoint declared write sets — author N as wide as the
  subtasks are genuinely independent; `FANOUT_CAP` caps only *runtime concurrency*, not authored
  width), or `loop(<cap>)` (one role re-invoked up to a static cap; loops do not fan out).
- **cardinality** is a **reserved / advisory** column: parsed but not validated or used
  (fan-out width is the row count in a `fanout(<group>)`); its text still feeds `plan_hash`
  as part of `## Nodes`, so keep the column present and stable.
- A single unique `finalize` sink is mandatory — it makes the gate checks decidable.
- A gate is a wall the validator finds in the graph: `code-reviewer` must
  **post-dominate** every implement node; `security-reviewer` must post-dominate every
  sensitive node. Not a flag the author can set.

Capture the **frozen issue labels** into a `## Meta` `labels:` line (a non-author field)
so the validator can derive sensitivity.

## Caps and the sink (fixed by the harness)

`FANOUT_CAP` (default **4**) is a **runtime concurrency limit**, NOT a width bound on the authored
plan: it is the maximum number of `fanout(<group>)` siblings the executor dispatches at once — the
executor opens up to `FANOUT_CAP` legs and drains the rest via rolling top-up (queue the overflow,
top up as a slot frees). Author a fan-out as wide as the work is genuinely independent over disjoint
write sets; the validator validates dependency shape / disjointness / gates / write-set safety, never
width. `LOOP_CAP` (**5**; a loop must run at least once — `loop(0)` is a typed refusal). **There is
no per-node file-count ceiling** — keep a cohesive write set in ONE node even when large
(root-level + dot-leading paths count as real writes). **Write sets are EXACT file
paths, never directories:** a directory / trailing-slash entry (`src/`) or a `..`-bearing token is
**refused at freeze** (it is dead at the exact-match barrier); semantically-coupled
cross-edition mirrors and generated-aggregator siblings stay in ONE node (they move atomically), and a
fan-out splits only genuinely-independent disjoint work — never a directory grant.
> **The one shape the freeze wall cannot catch:** a **bare token naming a path that does NOT
> exist at freeze but becomes a DIRECTORY by write-time** — the classic staged *scaffold→extend* plan
> (the very shape the adaptive path is designed to author). The freeze-time bare-directory check
> `statSync`s the token and skips a not-yet-created path as a legitimate new file, so a
> `mymod` token that an earlier node turns into the directory `mymod/` slips through. It then dies at
> the exact-path barrier as `write_set_granularity`, escalating a purely-mechanical artifact to a
> consent halt (`revalidateForResume` carries **no** shape checks — no `statSync`/`isDirectory`/
> `directory_shaped` — so resume can never re-catch it either). **Always declare the EXACT files a
> staged node will create (`mymod/a.js`, `mymod/b.js`), never a bare dir-to-be.**
The unique **`finalize`**
sink may only write docs/state (e.g. `CHANGELOG.md`); a non-docs write on the sink trips `code-reviewer`.

## A complete example (`workflow-plan.md`)

Minimal in-grammar plan to copy and adapt — explore, a `planner` node that shapes and
dominates the implements, two parallel `tdd-guide` implements over **disjoint top-level
directories**, a `code-reviewer` that post-dominates both, a `doc-updater` for the changed
docs, and the unique `finalize` sink. Being a write-role fan-out it routes to **ask**.

```markdown
# Workflow Plan — issue #<N>

## Meta
labels: enhancement

## Nodes

| id        | role          | depends_on          | declared_write_set | cardinality | shape        |
|-----------|---------------|---------------------|--------------------|-------------|--------------|
| explore   | code-explorer | —                   | —                  | 1           | sequence     |
| plan      | planner       | explore             | —                  | 1           | sequence     |
| impl-csv  | tdd-guide     | plan                | exporter/csv.js    | 1           | fanout(impl) |
| impl-html | tdd-guide     | plan                | renderer/html.js   | 1           | fanout(impl) |
| review    | code-reviewer | impl-csv, impl-html | —                  | 1           | sequence     |
| docs      | doc-updater   | review              | docs/api.md        | 1           | sequence     |
| finalize  | finalize      | review, docs        | CHANGELOG.md       | 1           | sequence     |
```

Disjointness is checked at **top-level-directory** granularity, so fan-out siblings must live
under different top-level directories.

## Shaping guidance (recommendations, not gates)

The validator enforces only the **walls** — the unique `finalize` sink, G1
(`code-reviewer` post-dominates code-producing nodes), G2 (`security-reviewer` post-dominates
sensitive nodes). Everything below is author judgment the grammar will **not** refuse;
the example above models both.

- **Plan before you build.** For a non-trivial implement, consider a `planner` (or
  `code-architect`) **node** that precedes — and so dominates — the implement nodes (the
  forward-reasoning roles). One `planner` above a fan-out's shared parent covers every leg
  (not one per leg). Trivial or mechanical work can skip it, or use the fast path.
- **Update the docs you changed.** When the change touches README / API docs /
  architecture / a public interface, consider a `doc-updater` node before `finalize` — the
  sink only does CHANGELOG / state bookkeeping.
- **Choose the right implement role.** Default to `tdd-guide`; pick `implementer` ONLY
  for an enumerated non-test-first category — behavior-preserving refactor; scaffolding /
  boilerplate / wiring; config / IaC / scripts; UI / markup; migrations / fixtures;
  integration glue — and RECORD which one (`non_tdd_reason`). Asymmetric tie-breaker: if
  a meaningful failing unit test CAN be written for the work, use `tdd-guide`; when in
  doubt, use `tdd-guide`. "Hard to test" is NOT a valid `non_tdd_reason`; bug fixes are
  ALWAYS `tdd-guide`. A mixed node (some sub-tasks test-first, some not) should be split
  into separate nodes by lane, or routed to the stricter role (`tdd-guide`). Both
  `tdd-guide` and `implementer` require `code-reviewer` post-dominance (G1); `implementer`
  is equal-burden, different-shape — it swaps RED→GREEN for change-type-appropriate
  verification (regression-green / build-green / executable smoke-integration), NOT a
  lighter path.
- Author a `knowledge-lookup` node when the task depends on external library or API
  behavior, framework conventions, or open-web/expertise knowledge that cannot be confirmed
  from the local codebase alone. This mirrors the Phase 1 `knowledge-lookup` trigger.
- **Provision gate instrumentation upstream, never in the gate.** When a `main-session-gate`
  needs instrumentation to execute (a probe scene/test/fixture, INCLUDING build wiring), author an
  upstream writer node (`tdd-guide`/`implementer`) to produce it inside ITS OWN declared write
  set; the gate never authors or deletes files, it only RUNS what was provisioned. State the
  durability decision in the plan: durable (committed, env-gated — preferred; the probe becomes a
  regression asset) or ephemeral (the deletion is likewise owned by a downstream writer/finalize
  node, with the path in THAT node's declared write set). Out-of-repo scratch stays legal for a
  gate whose harness can probe from an external path.

### Question-shaped & bug-shaped issues

When the issue is a **question without a settled answer** ("which approach?", "is X viable?", "why does Y happen?"), the `workflow-planner` authors an **investigation**, not a build DAG around an unvalidated premise (which would launder the guess past the artifact-vs-plan verdict). The arc maps onto existing roles with **zero new grammar**: **probe → assume → adversarially critique → converge** — read-only `code-explorer`/`knowledge-lookup` probes (authored as a read-only fan-out, dispatched concurrently) → `planner` proposes 2–3 candidate answers, each with an explicit falsification test → `adversarial-verifier` (a separate subagent; read-only but has Bash, so for a bug it **runs the existing reproduction**) tries to refute the leading answer → `planner`/`synthesizer` converges. **Freeze-once split:** Case A (shape knowable, answer not) authors the whole DAG up front (or `select(<group>)` for the enumerable version); Case B (shape depends on findings — e.g. a flaky-bug diagnosis) runs a short read-only shaping epoch, then continues through the claim-preserving re-plan control plane into one immutable child epoch (new `plan_hash`, parent remains frozen). For a **bug**, the falsification criterion IS the reproduction ("root cause or symptom mask?"); cannot-reproduce-after-a-bounded-probe → the `consent`-halt valve (`write-halt --reason consent`), never a guess-fix. Escalate values, not facts; `decision:ask` stays advisory (no new gate). Full pattern: the `workflow-planner` profile.

## Front end: claim + author (the `workflow-planner` agent role)

The adaptive path opens by delegating to ONE subagent. **You MUST delegate the starting contract
and the DAG authoring to the `workflow-planner` agent role** — do NOT run the claim or author
the `## Nodes` table inline in this session. The Codex Profile Freshness Gate above is authoritative:
missing, stale, malformed, or shadowed project/global profiles are `profile_preflight_refused` and
STOP before delegation. Only after that gate succeeds, if the runtime agent tool itself is genuinely
unavailable or model-refuses the spawn, may this session run the claim + author inline; record that
runtime evidence as `local-fallback-tool-unavailable` in the compliance ledger. The planner never
freezes, judges risk, asks the user, or dispatches further — it returns control here.

The persisted detection paths are `.codex/agents/kaola-workflow/` for a trusted project override
and `~/.codex/agents/kaola-workflow/` for the global default; the preflight alone resolves precedence.

The router enters with the agent-selected target issue for fresh adaptive work; the planner RETURNS
the `{project}` used after. **Re-entry (unfrozen plan):** an *authored-but-NOT-frozen* plan (a prior
governance refusal / declined ask / abort — no `plan_hash`) routes back here; SKIP the freshness gate
+ planner delegation and re-run the planner+handoff on the existing plan (the planner MAY overwrite an unfrozen plan; never a frozen one); the handoff freezes mechanically. A pre-freeze exit
leaves a **resumable** project; `kaola-gitea-workflow-claim.js discard --project
{project}` abandons it.

**Entry guard (this session, before the delegation).** Run the **authoring guard**. It
needs no project. Adaptive authoring is always allowed, so this returns `authoring_allowed: true`;
the call preserves the mechanical gate shape and the planner's `startup` still routes the claim via
`claimProject`:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
node "$(kaola_script kaola-gitea-workflow-claim.js)" authoring-allowed
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP.

**Git freshness (BEFORE the claim).** If `authoring_allowed`, gate on a clean main *before*
delegating: nothing is claimed yet — run the Startup git-freshness checks against the MAIN repo
(`git pull --ff-only` if behind). If it cannot resolve cleanly (dirty, or a merge / rebase / stash /
reset is needed), STOP and ask — do NOT delegate, so **no folder / `workflow:in-progress`
label is created until git is clean** (the front end claims here at repo-root — the adaptive claim provisions a repo-local hidden worktree at `<repo-root>/.kw/worktrees/<project>/`, the same as full/fast paths; the planner authors + freezes at repo-root and does NOT itself cd into the worktree — so the router's post-claim freshness-block release no longer guards this path).

**Co-tenant clean-check.** The dirty-worktree check above disregards `kaola-workflow/*` and `.kw/*` paths belonging to OTHER active lanes (lanes this session did not claim), so a second concurrent session starting alongside an already-running first lane does not receive a false "dirty main" refusal. The check STILL fails on any uncommitted code change; this session's OWN in-progress state is still enforced. Only non-owned lane scratch — another session's `kaola-workflow/<project>/` folder and its `.kw/worktrees/<project>/` worktree — is selectively disregarded.

Once main is clean, **delegate to the `workflow-planner`**: it runs `kaola-gitea-workflow-claim.js startup --runtime <runtime> --workflow-path adaptive
--target-issue <issue> --attest-planner-spawn` (`--workflow-path adaptive` is REQUIRED — a subagent shell does not inherit
KAOLA_PATH; `--attest-planner-spawn` is REQUIRED on every planner-run startup — it back-fills the
planner's own dispatch marker into .cache/dispatch-log.jsonl for closure attestation; only the
dispatched workflow-planner passes it; add `--sink pr` only for a requested PR sink; on Codex, first run the same preflight
doctor detection as `kaola-workflow-next`'s Codex Dispatch Mode Detection step and append
`--codex-dispatch-mode <detected>` when a mode was found — absent detection leaves the claim on
its fail-closed `v1-thread-id` default), authors the `## Meta` + `## Nodes` DAG +
empty `## Node Ledger` into the project's `workflow-plan.md` via Write, runs the validator `--json`
as a self-check (NOT `--freeze`, NOT `authoring-allowed`), then RUNS `kaola-gitea-workflow-adaptive-handoff.js --project {project} --json` (freezes, resume-checks, stages roadmap, writes Planning Evidence; does NOT open node1 or record the node1 baseline — `kaola-workflow-plan-run` owns the full node lifecycle including the first node; decision:ask is recorded metadata, not a gate), and RETURNS the handoff packet. It never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches. If the project already has a
`workflow-plan.md` it refuses-and-returns (never overwrite a frozen plan). <!-- PIN: claim-escalate -->
On a claim refusal — any `claim_verdict` that is NOT `acquired`/`owned` — no `workflow-state.md` is
written. Surface `claim_reasoning` and classify by `result`:
- `result: refuse` (e.g. `workflow_path_refused`, `target_occupied`, `user_target_blocked`,
  `user_target_red`, `user_target_closed`, `target_unavailable`, `target_unverified`, or
  `claim: none`): **HARD STOP** (**fail closed** — do not retry a different issue, do not
  blind-read a missing state file). The determinate RED is final.
- `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
  no plan/ledger exists yet at claim time.

**Planner-first control boundary.** The main session performs ONLY the allowed non-design preflight above (read repo/session rules, confirm target issue, authoring-allowed check, git freshness, non-design target availability), then dispatches `workflow-planner` immediately as the first issue-specific action. The main session MUST NOT pre-author the `## Nodes` DAG, choose role sequence/deps/shapes/write-sets, or pass a mandatory full DAG / `AUTHOR EXACTLY` / `do not redesign` prompt to the planner — the adaptive front-end design is the planner's to own, not the main session's. Doing so earns a typed refusal: `planner_control_boundary_violation`. The ONLY exception is in the bounded unfrozen-plan validator-repair loop (after `handoff_status: plan_invalid` on an UNFROZEN plan): the orchestrator MAY re-dispatch the planner with the verbatim validator errors + the prior plan as repair context, because the planner already owns that unfrozen draft.

Use direct v2 control-plane dispatch:
```yaml
agents.spawn_agent:
  task_name: "workflow_planner_<issue-or-project>"
  agent_type: "workflow-planner"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Selected issue/set/project: <target>. Apply the kaola-workflow-adapt skill and workflow-planner profile contract. Return only the bounded durable handoff packet."
```
Sanitize the stable task suffix to lowercase letters, digits, and underscores. This is an isolated, self-contained control-plane brief; omit transient `model` and `reasoning_effort`, and never use `fork_turns: "all"`. Codex v1 keeps `fork_turns: "none"` and the established identity/header convention. The observed full-history rejection is an **argument-shape refusal**: correct the shape and retry the same workflow-planner role, task identity, isolated brief, and bounded durable return exactly once. Never author inline; reserve `local-fallback-tool-unavailable` for genuinely unavailable agent tooling.

**Read the durable state, not the planner's prose.** On success take `{project}` from the return,
re-read `kaola-workflow/{project}/workflow-state.md` (the `## Sink` block, `workflow_path: adaptive`)
and `kaola-workflow/{project}/workflow-plan.md` (internalize the `## Nodes` DAG you govern, dispatch,
and freeze). The claim (at repo-root — the adaptive claim provisions a worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root) was cut from a now-clean main (git-freshness ran before the claim, above).

**Read the handoff packet.** The planner RAN `kaola-gitea-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan already frozen, Planning Evidence written; the handoff does NOT open node1 or record the node1 baseline — `kaola-workflow-plan-run` owns the full node lifecycle including the first node). The handoff is mechanical; `decision:ask` is audit metadata only — it freezes-and-proceeds, NEVER pauses for approval.

- **`handoff_status: ready_to_run`** (all checklist true) → hand off DIRECTLY to `kaola-workflow-plan-run {project}` (even when `decision:ask`, no approval gate). `kaola-workflow-plan-run` owns the complete node lifecycle — it opens and dispatches every node including the first, via `kaola-gitea-workflow-adaptive-node.js`.

- **`handoff_status: plan_invalid`** (validator refused; plan never froze, NOTHING written) → bounded **repair loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` so it overwrites the UNFROZEN plan with a corrected DAG and re-runs the handoff. Retry ~2x (counter in the orchestrator, never in the script). After repeated failure (~2x) → real decision: **discard+restart a fresh adaptive run** (`kaola-gitea-workflow-claim.js discard --project {project}` then a fresh adaptive start) / **STOP + surface a concrete blocker** with validator evidence. This fallback applies only to normal startup while the draft is unfrozen; it is forbidden under `replan_in_progress`. NEVER downgrade to fast/full — there is no automatic fallback between paths; the only fallbacks are inside adaptive (bounded repair, in-place posture). Never silently loop.

After `handoff_status: ready_to_run` (and ONLY then), re-read `kaola-workflow/{project}/workflow-plan.md` to internalize the frozen `## Nodes` table, then create the orchestrator's task list. **The task list MUST NOT be created before `handoff_status: ready_to_run` is confirmed and the frozen plan has been read** — the planner owns the design; the task list is a mechanical reflection of the frozen result, not a pre-planned outline.

**Establish the task list = the workflow nodes** (use the runtime task surface) — one task per row of the frozen `## Nodes` table,
labeled `id · role`, in `depends_on` order; a live mirror of the `## Node Ledger` (the durable
source of truth) that the executor flips `in_progress` when it dispatches that node's role (after
`open-next`) and `completed` after the commit step closes it (`n/a` nodes → skipped). Then hand off to
`kaola-workflow-plan-run {project}`.

## Bundle Lane — Multi-Issue Adaptive Claim

When the router delivers a same-scope bundle (explicit-bundle or auto-bundle mode —
see `kaola-workflow-next` Bundle Lane section), the `workflow-planner` runs the bundle
claim instead of the single-issue claim. The issue set was already selected and
stated by the main orchestrator; the planner validates and claims it.

### Bundle startup call

The planner passes `--target-issues A,B,C` (sorted ascending, comma-separated)
instead of `--target-issue N`. On Codex, detect `KAOLA_CODEX_DISPATCH_MODE` first (the same
preflight doctor detection as the single-issue claim above), then pass it through:

```bash
KAOLA_DISPATCH_MODE_FLAG=""
[ -n "${KAOLA_CODEX_DISPATCH_MODE:-}" ] && KAOLA_DISPATCH_MODE_FLAG="--codex-dispatch-mode $KAOLA_CODEX_DISPATCH_MODE"
node "$claim_script" startup \
  --runtime codex \
  --workflow-path adaptive \
  --target-issues 42,47,53 \
  --attest-planner-spawn \
  $KAOLA_DISPATCH_MODE_FLAG
```

Compatibility rule: `--target-issue` / `KAOLA_TARGET_ISSUE` keep current one-issue
behavior unchanged. `--target-issues` / `KAOLA_TARGET_ISSUES` are the ONLY
multi-issue startup path. If both are set, the script refuses with
`target_ambiguity`; never pass both.

### Bundle project and branch shape

- Active folder (project name): `bundle-42-47-53` (sorted ascending, deduplicated).
- Branch: `workflow/bundle-42-47-53`.
- `workflow-state.md` records the primary issue as `issue_number: 42` plus three
  additive bundle fields: `issue_numbers: 42,47,53`, `bundle_id: bundle-42-47-53`,
  `closure_policy: all_or_nothing`.

### Bundle is adaptive-only

The bundle lane requires `workflow_path: adaptive`. The startup script refuses with
`bundle_requires_adaptive` when the path is `fast` or `full`.

### Bundle authoring

The planner receives the full issue set and authors ONE implementation-lane DAG in
`workflow-plan.md` — not a mechanical one-node-per-issue plan. The `## Meta` block
carries a conservative union of labels across all bundle issues so sensitivity and
security gates are derived correctly.

### Bundle finalization (one closure for all)

A bundle run ends at ONE finalization. The finalization step:
- closes every issue in `issue_numbers` (all-or-nothing);
- removes every corresponding `.roadmap/issue-N.md` source;
- regenerates `kaola-workflow/ROADMAP.md` once;
- archives one bundle folder;
- produces one closure receipt recording `primary_issue`, `issue_numbers`,
  `closed_issues`, `failed_issue_closures`, and removed roadmap sources.

### Claim refusals (bundle-specific)

| code | trigger |
|------|---------|
| `target_ambiguity` | both `--target-issue` and `--target-issues` set |
| `target_set_empty` | issue list empty or missing |
| `target_set_too_large` | list exceeds `KAOLA_BUNDLE_MAX_ISSUES` (default 4) |
| `bundle_requires_adaptive` | `workflow_path` is not `adaptive` |
| `target_set_conflicts_active_work` | any member is already claimed |
| `target_set_has_closed_issue` | any member is already closed |
| `target_set_red` | classifier returns `red` for any member |
| `target_set_unavailable` | member state probe failed (online) |
| `target_set_unverified` | member unverifiable (offline, no local evidence) |
| `target_set_label_rollback_failed` | partial claim could not be fully rolled back |
| `target_set_mismatch` | persisted `issue_numbers` in `workflow-state.md` does not match the claimed `--target-issues` set — startup validated the claim but the persisted state is inconsistent |

On any bundle claim refusal, treat it the same as a single-issue claim refusal:
surface the typed code and STOP; do not retry with a different issue set.
