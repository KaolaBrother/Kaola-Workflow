<!-- SLOT:ad-frontmatter -->

<!-- REGION:skill -->
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
exact plan before running the block so `--plan` is also enforced. Read
the exit code and parsed `status`. On drift such as `profile_bytes_mismatch` the
gate reports `profile_preflight_refused` with the offending profile and its
remediation: weigh that against what you are about to dispatch and decide. Drift
is a profile/config fact, not tool unavailability, so record it as what it is.
Re-run the gate if the installed profile set changes.
<!-- /PIN -->

<!-- /REGION -->
<!-- SLOT:ad-h1 -->
<!-- REGION:command -->

Phase-0 of the adaptive path: a dedicated **`workflow-planner`** subagent (reasoning tier) settles the starting
contract (claim + `workflow-state.md` at repo-root — the adaptive claim provisions a hidden worktree
at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root, not in the
worktree) and **freely authors** a task-shaped DAG into `workflow-plan.md`, which the validator proves
in-grammar. The lifecycle frame (claim → branch/worktree → this plan → Finalization sink)
is fixed; the middle is free. The full claim + author + handoff procedure (grammar, caps, example
<!-- SPLICE:ad-cmd-001 -->
command holds the dispatch handle, entry guard, and handoff routing.
<!-- /REGION -->

## In-progress re-plan control plane

<!-- PIN: replan-adapt -->

This fence outranks normal adaptive startup and authoring. Before any claim, handoff, or planner
startup action, read the project state and transaction status. When either reports
<!-- REGION:command -->
`replan_in_progress`, keep the frozen parent `workflow-plan.md` authoritative; read-only orientation
reports `replan_phase`, `transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and
`last_cas_result`. The single legal mutation while the fence is active:
<!-- /REGION -->
<!-- REGION:skill -->
`replan_in_progress`, keep the frozen parent `workflow-plan.md` authoritative. Read-only
orientation reports the exact `replan_phase`, `transaction_id`, `parent_plan_hash`,
`child_plan_hash` (or `none`), and `last_cas_result`; never reconstruct them from memory.

The single legal mutation while the fence is active is:
<!-- /REGION -->

```bash
<!-- REGION:command -->
<!-- SPLICE:ad-cmd-002 -->
<!-- /REGION -->
<!-- REGION:skill -->
<!-- SPLICE:ad-sk-001 -->
if [ ! -f "$REPLAN_SCRIPT" ]; then
<!-- SPLICE:ad-sk-002 -->
fi
<!-- SPLICE:ad-sk-003 -->
<!-- /REGION -->
node "$REPLAN_SCRIPT" resume --project {project} --json
```

<!-- REGION:command -->
Do not run normal startup, ordinary handoff, scheduler, task-mirror refresh, archive, or finalize
during an intermediate phase. `decision:ask` remains advisory and adds no gate. If resume returns
`replan_planner_dispatch_required`, dispatch the genuine `workflow-planner` in Re-plan mode with only
repo root, project, `transaction_id`, `dispatch_nonce`, profile identity, the exact
`.cache/replan-planner-packet.json` path, and its reason/source evidence. No role sequence, node ids,
dependencies, write sets, cardinality, shape, model, or exact DAG fragment may come from the
orchestrator; that is `planner_control_boundary_violation`. The planner alone writes the seeded
`workflow-plan.next.md` plus `.cache/replan-planner-attestation.json`, then main re-runs resume;
missing/mismatched proof is `replan_planner_attestation_invalid`. An invalid child uses the bounded
unfrozen child-repair loop (same planner, verbatim validator errors); the main session never repairs
the child DAG; at the bound stop with typed evidence. A legacy-v1 parent enters its schema-2 child
through this transaction.

## Goal Contract

<!-- SPLICE:ad-cmd-003 -->
it (the script stamps `plan_hash`), record the governance decision (`auto-run` vs `ask` is audit
metadata, NOT an approval gate — freeze and hand off either way), and hand off to
`/kaola-workflow-plan-run`. An out-of-grammar plan earns a **typed refusal** — fix the plan, never
clamp around the gate.
<!-- /REGION -->
<!-- REGION:skill -->
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
<!-- /REGION -->

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
<!-- REGION:command -->

## Agent Model Badge

Every subagent dispatch below carries an explicit `model=` line — the installer fills each
`model="{...}"` placeholder from the agent's frontmatter and it is what shows the model badge. You
MUST pass `model="{WORKFLOW_PLANNER_MODEL}"` in the Agent call below exactly as shown; never omit it.
<!-- /REGION -->
<!-- REGION:skill -->

## The grammar (the closed envelope)

Each node is one row of the `## Nodes` table:
`| id | role | depends_on | declared_write_set | cardinality | shape | model |`.
- **role** must be in the installed library (the nine canonical roles + any
  maintainer-installed role such as `adversarial-verifier`). The validator hard-rejects
  an unknown role.
- **model** (optional) — declarative reasoning/wait-budget metadata from `{reasoning|standard}`.
  Every named Codex role profile omits model and effort; Codex >=0.145.0 resolves the sub-agent's
  own model/reasoning effort (via the `[agents]` table's own defaults, or its own built-in default) —
  this cell never selects child strength and never conflicts with a role's historical/default
  metadata class. The legacy
  `opus`/`sonnet` aliases remain accepted as `reasoning`/`standard`; new plans author neutral tokens.
  An out-of-vocab cell is a freeze refusal (`model_invalid`); a `main-session-gate` must not carry a
  model; absent/`—` resolves through the same role-static tier — informational metadata only, never
  a dispatch gate, since Codex owns the actual model/reasoning-effort resolution independently.
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
dominates the implements, two parallel `implementer` writes over **disjoint top-level
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
| impl-csv  | implementer   | plan                | exporter/csv.js    | 1           | fanout(impl) |
| impl-html | implementer   | plan                | renderer/html.js   | 1           | fanout(impl) |
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
the example above models both. A composed unit is a paid dispatch boundary — fold mechanical
follow-ons (a rerun, a re-verify, an evidence write) into the unit that owns them.

- **Plan before you build.** For a non-trivial implement, consider a `planner` (or
  `code-architect`) **node** that precedes — and so dominates — the implement nodes (the
  forward-reasoning roles). One `planner` above a fan-out's shared parent covers every leg
  (not one per leg). Trivial or mechanical work can skip it.
- **Update the docs you changed.** When the change touches README / API docs /
  architecture / a public interface, consider a `doc-updater` node before `finalize` — the
  sink only does CHANGELOG / state bookkeeping.
- **Custody decides the implement roles, not order.** `tdd-guide` owns the test paths and
  authors nothing else; `implementer` owns the production paths and writes every kind of
  change. A node declaring a test-like path must therefore be a `tdd-guide` node — or carry a
  declared, hash-covered exemption in `## Meta`:
  `test_custody_exemption: <node-id> <path> — <one-line reason>` (a named entry with a real
  reason, e.g. a `build-error-resolver` repairing a suite-breaking test). Both roles require
  `code-reviewer` post-dominance (G1). Behavioral work composes the two: `sequence` when the
  implementer consumes the authored tests as its oracle — that IS the S1 artifact, so name the
  test files — or a `parallel_safe` pair when the acceptance surface already pins the public
  interface, since then the write sets are disjoint by construction (test paths vs source
  paths). A test-author node may itself fan out over independent lenses
  (`cardinality` / `partitioned_all`) when the stakes justify N separate contexts.
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
<!-- /REGION -->

## Entry contract — what this surface receives

The caller hands off in one of four shapes, and each has a defined rendering in the planner
dispatch below. Resolve the shape FIRST, before the authoring guard.

- **An issue number or project** — the ordinary explicit target. Use it exactly as given.
- **An issue set** (comma-separated) — the bundle lane; see Bundle Lane below.
- **A free-form task description** — the user described the work and named no issue. Resolve it
  to exactly ONE issue BEFORE the claim, because the claim, the project folder, the branch, the
  roadmap source, and the closure receipt are all keyed by issue number:
  1. Look up the OPEN issues of the active repository on the forge. If exactly one clearly
     matches the description, that is the target — state the match aloud.
  2. If none matches, file a new issue for it: the user's description verbatim as the body and a
     one-line summary of it as the title. State the new number aloud.
  3. If more than one plausibly matches, or the forge cannot be reached (including
     `KAOLA_WORKFLOW_OFFLINE=1`), STOP and ask the user which issue to use. Never guess, and
     never fall through to the orchestrator-owned no-target survey.
  The described task then enters as an explicit target, and the description travels on as the
  planner's binding scope. The no-target survey does NOT run on this shape, so roadmap priority
  cannot outrank the work the user asked for.
- **Empty (no target)** — the ORCHESTRATOR already ran the no-target survey and selected the work
  before entering here (see the router's selection contract). Enter with the resolved target plus
  the `--selection-record` path it authored; the planner never re-ranks the backlog.

## Origin evidence and the selection record

Selection is orchestrator-owned, so the orchestrator authors the record: an orchestrator-originated
claim carries `--target-source orchestrator_selected --selection-record <path>`. The claim does not
grade it and never refuses over it — a record that parses is persisted byte-for-byte as authored,
and a claim that arrives without a usable one gets the canonical "none recorded" record in its
place (persisted only if the claim acquires) plus a `selection_record_note` on the emitted envelope saying so. On an acquiring claim
the record lands at `kaola-workflow/{project}/.cache/origin/selection-record.json`, its sha256 is
stamped into `workflow-state.md` as `selection_record_digest:`, and any pre-claim reconnaissance
staged under `kaola-workflow/.origin/<target-key>/` is folded into the same `.cache/origin/`
directory.

Hand the planner **evidence PATHS, never conclusions**: name the files under
`kaola-workflow/{project}/.cache/origin/` (and the staged `kaola-workflow/.origin/<target-key>/`
paths pre-claim) in the brief and let it read them. Cite what you FOUND; never dictate what the
plan must CONCLUDE. A brief carrying a pre-authored `## Nodes` table, an `AUTHOR EXACTLY`, or a
`do not redesign` is refused `planner_control_boundary_violation` before anything is written — the
control boundary is unchanged, and it is exactly what keeps a synthesizer synthesizing.

**`clarification_required`.** When the brief is genuinely under-determined the planner returns
`{handoff_status: 'clarification_required', result: 'escalate', question, context_refs, round}`
instead of guessing. It is legal PRE-claim (nothing written) and post-claim/pre-freeze (claim held,
plan unfrozen). ASK THE USER the question verbatim, append the answer to the selection record's
`clarifications` field, and re-dispatch the planner with the answer in the brief. The channel is
bounded at THREE round-trips; a fourth returns `clarification_exhausted` with a `stop_and_ask`
posture — stop and take the design question to the user rather than looping.
<!-- REGION:command -->

## Front end: claim + author (the `workflow-planner` role)

The claim and the authoring write are the front end's product, and the main session keeps every
judgment either way. The router enters with `{issue-or-project}` — an issue number, an issue set, or the
issue a task description resolved to under the Entry contract above — always a RESOLVED target,
because the orchestrator settled the selection before entering. The planner
RETURNS `{project}`. **Re-entry:** a *frozen*
plan never reaches adapt (it resumes via `/kaola-workflow-plan-run`), but an authored-but-NOT-frozen
plan (no `plan_hash`) does — re-run the planner+handoff (it MAY overwrite an unfrozen invalid plan,
never a frozen one) with prior validator errors; a pre-freeze exit is resumable
<!-- SPLICE:ad-cmd-004 -->
<!-- /REGION -->
<!-- REGION:skill -->

## Front end: claim + author (the `workflow-planner` agent role)

The adaptive path opens with the starting contract and the DAG authoring. What the front end
PRODUCES is fixed: the claim writes its record and stamps `selection_record_digest:`, and the
`## Nodes` table is the `workflow-planner` role's product. WHERE that role runs is not — dispatch it
or run it here, whichever fits the work. The Codex Profile Freshness Gate above is authoritative for
profile/config drift; weigh a reported `profile_preflight_refused` before dispatching. The planner
never freezes, judges risk, asks the user, or dispatches further — it returns control here.

The persisted detection paths are `.codex/agents/kaola-workflow/` for a trusted project override
and `~/.codex/agents/kaola-workflow/` for the global default; the preflight alone resolves precedence.

The router enters with the agent-selected target for fresh adaptive work — an issue number, an issue
set, or the issue a task description resolved to under the Entry contract above — always a RESOLVED
target, because the orchestrator settled the selection before entering. The planner
RETURNS the `{project}` used after. **Re-entry (unfrozen plan):** an *authored-but-NOT-frozen* plan (a prior
governance refusal / declined ask / abort — no `plan_hash`) routes back here; SKIP the freshness gate
+ planner delegation and re-run the planner+handoff on the existing plan (the planner MAY overwrite an unfrozen plan; never a frozen one); the handoff freezes mechanically. A pre-freeze exit
<!-- SPLICE:ad-sk-004 -->
{project}` abandons it.
<!-- /REGION -->

Resolve the entry shape first (Entry contract above) — a task description must already be a
resolved issue number by the time this guard runs.
<!-- REGION:command -->

**Before the claim (main session):** run the authoring guard
<!-- SPLICE:ad-cmd-005 -->
kept for mechanical shape), then gate on a clean main — the front end claims at repo-root, so
freshness must gate up front (nothing to orphan): run the Startup Step 1 git-freshness checks against
the MAIN repo, `git pull --ff-only` if behind, STOP and ask if it cannot resolve cleanly (dirty
worktree, or merge/rebase/stash/reset required). That dirty check disregards `kaola-workflow/*` and
`.kw/*` scratch of OTHER active lanes but still fails on any uncommitted code change.

**Planner-first control boundary.** Do only the allowed non-design preflight, then dispatch
immediately. The main session MUST NOT pre-author the `## Nodes` DAG, choose
role/deps/shapes/write-sets, or pass a mandatory full DAG / `AUTHOR EXACTLY` / `do not redesign`
prompt — that is `planner_control_boundary_violation`. The only exception is the bounded unfrozen-plan
repair loop (after `plan_invalid`): re-dispatch with verbatim validator errors + the prior plan.

```text
Agent(
  subagent_type="workflow-planner",
  model="{WORKFLOW_PLANNER_MODEL}",
  description="Adaptive front end {issue}",
  prompt="Repository root: {repo-root}. Selected issue/set/project: {issue-or-project}. Binding scope: {task-description-or-none}. Settle the starting contract and design the adaptive workflow per the kaola-workflow-adapt skill and workflow-planner contract. Follow the Method in your agent profile (agents/workflow-planner.md) — the full procedure lives there as the sole home. Return only the bounded durable handoff packet."
)
```

<!-- /REGION -->
<!-- REGION:skill -->

**Entry guard (this session, before the delegation).** Run the **authoring guard**. It
needs no project. Adaptive authoring is always allowed, so this returns `authoring_allowed: true`;
the call preserves the mechanical gate shape and the planner's `startup` still routes the claim via
`claimProject`:

```bash
<!-- SPLICE:ad-sk-005 -->
```

If the JSON `status` is `authoring_refused`, surface the typed refusal and STOP.

**Git freshness (BEFORE the claim).** If `authoring_allowed`, gate on a clean main *before*
delegating: nothing is claimed yet — run the Startup git-freshness checks against the MAIN repo
(`git pull --ff-only` if behind). If it cannot resolve cleanly (dirty, or a merge / rebase / stash /
reset is needed), STOP and ask — do NOT delegate, so **no folder / `workflow:in-progress`
label is created until git is clean** (the front end claims here at repo-root — the adaptive claim provisions a repo-local hidden worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root and does NOT itself cd into the worktree — so the router's post-claim freshness-block release does not guard this path).

**Co-tenant clean-check.** That dirty check disregards `kaola-workflow/*` and `.kw/*` scratch of OTHER active lanes (so a co-tenant session is not falsely refused) but still fails on any uncommitted code change; this session's own in-progress state stays enforced.

<!-- SPLICE:ad-sk-006 -->
--target-issue <issue> --attest-planner-spawn` (`--attest-planner-spawn` is REQUIRED on every planner-run startup — it back-fills the
planner's own dispatch marker into .cache/dispatch-log.jsonl for closure attestation; only the
<!-- SPLICE:ad-sk-007 -->
`## Meta` + `## Nodes` DAG +
empty `## Node Ledger` into the project's `workflow-plan.md` via Write, runs the validator `--json`
<!-- SPLICE:ad-sk-008 -->
`workflow-plan.md` it refuses-and-returns (never overwrite a frozen plan). <!-- PIN: claim-escalate -->
When `claim_verdict` is NOT `acquired`/`owned`, no `workflow-state.md` was written. Surface
`claim_reasoning` and classify by `result`:
- `result: answer` (e.g. `no_target`, `target_ambiguity`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`, `target_indeterminate`): the claim did not happen and
  nothing was written. This is a fact to act on, not a stop — fix the argv, retry, go offline, or
  re-state the reason and claim a different target. Never blind-read a missing state file.
- `result: consent` (`dirty_tree_refused`): the subject is the user's own uncommitted work. **ASK
  THE USER the `ask` on the envelope verbatim** and act on the answer (commit, stash, or worktree).
- `result: refuse` (`target_occupied`, `user_target_closed`, `target_set_*` other than the
  indeterminate one, or `claim: none` with no other reading): **HARD STOP** (**fail closed** — do
  not retry a different issue, do not blind-read a missing state file).
- `result: escalate` (`target_set_indeterminate`): the bundle classifier faulted and bounded retry
  is exhausted. **PAUSE and ASK THE USER** — offer to retry, pick a different target, go offline,
  or abort. This is NOT an `adaptive-node write-halt`; no plan/ledger exists yet at claim time.

**Planner-first control boundary.** The main session performs ONLY the allowed non-design preflight above (read repo/session rules, confirm target issue, authoring-allowed check, git freshness, non-design target availability), then dispatches `workflow-planner` immediately as the first issue-specific action. The main session MUST NOT pre-author the `## Nodes` DAG, choose role sequence/deps/shapes/write-sets, or pass a mandatory full DAG / `AUTHOR EXACTLY` / `do not redesign` prompt to the planner — the adaptive front-end design is the planner's to own, not the main session's. Doing so earns a typed refusal: `planner_control_boundary_violation`. The ONLY exception is in the bounded unfrozen-plan validator-repair loop (after `handoff_status: plan_invalid` on an UNFROZEN plan): the orchestrator MAY re-dispatch the planner with the verbatim validator errors + the prior plan as repair context, because the planner already owns that unfrozen draft.

Use direct v2 control-plane dispatch:
```yaml
agents.spawn_agent:
  task_name: "workflow_planner_<issue-or-project>"
  agent_type: "workflow-planner"
  fork_turns: "none"
  message: "Repository root: <absolute-root>. Selected issue/set/project: <target>. Binding scope: <task-description-or-none>. Apply the kaola-workflow-adapt skill and workflow-planner profile contract. Return only the bounded durable handoff packet."
```
<!-- /REGION -->
Render both target slots from the entry shape; never leave a placeholder literal:

| Entry shape | `Selected issue/set/project:` renders | `Binding scope:` renders |
| --- | --- | --- |
| Issue number / project | that issue number or project name | `none` |
| Issue set | the comma-separated set | `none` |
| Task description | the issue it resolved to under the Entry contract | the user's description, verbatim, on one line |
| No target | the issue the orchestrator-owned no-target survey selected, plus `Selection record: <path>` | `none` |
<!-- REGION:command -->

This is an **isolated, self-contained control-plane brief**: never inherit the full conversation. A
spawn **argument-shape refusal** requires correcting arguments and retrying the same planner
role/identity/brief exactly once; never author inline.

## Read the durable state, not the planner's prose

<!-- PIN: claim-escalate -->
- **Any `claim_verdict` NOT `acquired` or `owned`**: NO `workflow-state.md` was written.
  Surface `claim_reasoning` and classify by `result`: `result: answer` (e.g. `no_target`,
  `target_unverified`, `target_indeterminate`) → act on the fact (fix the argv, retry, go offline,
  or claim a different target), but do not blind-read a missing state file; `result: consent`
  (`dirty_tree_refused`) → ask the user the envelope's `ask` verbatim and act on the answer;
  `result: refuse` (e.g. `target_occupied`, `claim: none` with no other reading) → **HARD STOP**,
  fail closed; `result: escalate` (`target_set_indeterminate`) → **PAUSE and ASK THE USER** (retry,
  pick another target, go offline, or abort — this is not an adaptive-node write-halt; no
  plan/ledger exists yet).
- **Plan already existed** (`plan_path: null` on an `owned` claim) → route to
  `/kaola-workflow-plan-run {project}`; never re-author over a frozen plan.
- **Success** (`acquired` | `owned`, plan authored) → take `{project}`, re-read `workflow-state.md`
  (`## Sink`, `workflow_path: adaptive`) and `workflow-plan.md` (internalize the `## Nodes` DAG).

<!-- SPLICE:ad-cmd-006 -->
frozen, Planning Evidence written; the handoff does NOT open node1 — plan-run owns the full node
lifecycle including the first). `decision:ask` is audit metadata only — it freezes-and-proceeds.

- **`handoff_status: ready_to_run`** → hand off DIRECTLY to `/kaola-workflow-plan-run {project}` (even
  when `decision:ask`, no approval gate).
- **`handoff_status: plan_invalid`** (validator refused; the plan never froze and `workflow-state.md` is
  untouched — the one write is the `.cache/acceptance-anchor.json` audit record) → bounded **repair
  loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` to overwrite
  the UNFROZEN plan. Repair may fix `## Meta` / `## Nodes` / `## Node Briefs` / ledger scaffolding to
  reach in-grammar but MUST NOT alter `## Design` (the frozen decomposition intent) or `## Acceptance`
  (the human-values statement of what done means, which is hard-fenced) — if in-grammar is unreachable
  without changing either, that is not repair. Retry ~2x (counter in the ORCHESTRATOR).
  After repeated failure → **discard+restart a
<!-- SPLICE:ad-cmd-007 -->
  concrete blocker**. Forbidden under `replan_in_progress`.
- **`reason: acceptance_repair_fenced`** (a repair iteration changed `## Acceptance` — usually a fresh
  planner re-wording the same criteria, not tampering) → the refusal RETURNS the anchored surface in
  `anchored_acceptance_surface`, and still carries the outstanding grammar errors in
  `validator_verdict`. Re-dispatch with BOTH: restore those bytes VERBATIM under the `## Acceptance`
  heading, and fix the grammar errors on the restored surface — a digest cannot be inverted, so the
  returned bytes are the only copy the next iteration has. Changing what done means is a values
  decision, not repair: NO flag on the handoff authorizes it — a genuine restatement lands as a
  re-plan child epoch citing a consent entry bound to the new surface, or as a discard+restart. Never
  re-anchor on your own judgement, and never edit or delete the anchor by hand.

## Establish the task list, then hand off

After `ready_to_run` (and ONLY then), re-read `workflow-plan.md` and create the orchestrator's task
list with **TodoWrite** — one task per `## Nodes` row (`id · role`, in `depends_on` order). It is a
live mirror of the `## Node Ledger` (the durable source of truth); the executor flips each task
`in_progress` at dispatch and `completed` after close (`n/a` → skipped). Then hand off:

```text
/kaola-workflow-plan-run {project}
```

## Shaping guidance

Full shaping lives in `agents/workflow-planner.md`. Author a `knowledge-lookup` node when the task
depends on external library/API/framework behavior or open-web knowledge that the local codebase
cannot confirm. A composed unit is a paid dispatch boundary — fold mechanical follow-ons (a rerun,
a re-verify, an evidence write) into the unit that owns them.

### Question-shaped & bug-shaped issues

When the issue is a **question without a settled answer**, the `workflow-planner` authors an
**investigation**, not a build DAG around an unvalidated premise — mapped onto existing roles with
zero new grammar: **probe → assume → adversarially critique → converge** (read-only
`code-explorer`/`knowledge-lookup` fan-out → `planner` proposes falsifiable answers → a separate
`adversarial-verifier` refutes the leading answer → `planner`/`synthesizer` converges). Freeze-once:
Case A authors the whole DAG up front; Case B runs a short read-only shaping run then enters the
claim-preserving re-plan transaction (a freshly dispatched planner authors an attested child epoch
while the frozen parent stays authoritative — no fresh claim, restart, or in-place thaw). For a
**bug**, the falsification criterion is the reproduction (**root cause or symptom mask?**); cannot
reproduce after a bounded probe → the `consent`-halt valve, never a guess-fix.

## Bundle Lane — Multi-Issue Adaptive Claim

When the router delivers a same-scope bundle (see `workflow-next.md` Step 0), the `workflow-planner`
runs the bundle claim (the set was already selected by the orchestrator): pass `--target-issues
A,B,C` (sorted ascending, comma-separated) instead of `--target-issue N`.

```bash
node "$CLAIM_JS" startup --runtime claude --target-issues 42,47,53
```

`--target-issue` / `KAOLA_TARGET_ISSUE` keep one-issue behavior; `--target-issues` /
`KAOLA_TARGET_ISSUES` are the only multi-issue path — setting both answers `target_ambiguity` usage.
Shape: active folder + branch `bundle-42-47-53` (sorted, deduplicated); `workflow-state.md` records
`issue_number: 42` + `issue_numbers: 42,47,53`, `bundle_id`, `closure_policy: all_or_nothing`. The
bundle lane always runs `workflow_path: adaptive`, and bundle size is NOT capped — how many
issues one claim takes is the orchestrator's call. A set wider than the recommended 8 acquires
normally and the claim reports `bundle_size_note` as advice. The planner authors ONE implementation-lane DAG (not
one-node-per-issue); `## Meta` carries a conservative union of labels. A bundle run ends at ONE
finalization that closes every issue in `issue_numbers` (all-or-nothing), removes each
`.roadmap/issue-N.md`, regenerates `ROADMAP.md` once, archives one bundle folder, and writes one
closure receipt. On any typed bundle claim outcome that is not `acquired`/`owned` (the
`target_set_*` codes claim.js emits), surface the code and STOP; do not retry with a
different set.
<!-- /REGION -->
<!-- REGION:skill -->

Sanitize the stable task suffix to lowercase letters, digits, and underscores. With no target, use
the literal suffix `no_target`. This is an isolated, self-contained control-plane brief; omit transient `model` and `reasoning_effort`, and never use `fork_turns: "all"`. Always use `fork_turns: "none"` per the established identity/header convention. The observed full-history rejection is an **argument-shape refusal**: correct the shape and retry the same workflow-planner role, task identity, isolated brief, and bounded durable return exactly once.

**Read the durable state, not the planner's prose.** On success take `{project}` from the return,
re-read `kaola-workflow/{project}/workflow-state.md` (the `## Sink` block, `workflow_path: adaptive`)
and `kaola-workflow/{project}/workflow-plan.md` (internalize the `## Nodes` DAG you govern, dispatch,
and freeze). The claim (at repo-root — the adaptive claim provisions a worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root) was cut from a now-clean main (git-freshness ran before the claim, above).

<!-- SPLICE:ad-sk-009 -->

- **`handoff_status: ready_to_run`** (all checklist true) → hand off DIRECTLY to `kaola-workflow-plan-run {project}` (even when `decision:ask`, no approval gate). `kaola-workflow-plan-run` owns the complete node lifecycle — it opens and dispatches every node including the first, via `kaola-workflow-adaptive-node.js`.

<!-- SPLICE:ad-sk-010 -->
- **`reason: acceptance_repair_fenced`** (a repair iteration changed `## Acceptance` — usually a fresh planner re-wording the same criteria, not tampering) → the refusal RETURNS the anchored surface in `anchored_acceptance_surface`, and still carries the outstanding grammar errors in `validator_verdict`. Re-dispatch with BOTH: restore those bytes VERBATIM under the `## Acceptance` heading, and fix the grammar errors on the restored surface — a digest cannot be inverted, so the returned bytes are the only copy the next iteration has. Changing what done means is a values decision, not repair: NO flag on the handoff authorizes it — a genuine restatement lands as a re-plan child epoch citing a consent entry bound to the new surface, or as a discard+restart. Never re-anchor on your own judgement, and never edit or delete the anchor by hand.

After `handoff_status: ready_to_run`, re-read `kaola-workflow/{project}/workflow-plan.md` to internalize the frozen `## Nodes` table, then create the orchestrator's task list. The planner owns the design and the task list is a mechanical reflection of the frozen result, so building it before the freeze just means rebuilding it.

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
instead of `--target-issue N`:

```bash
node "$claim_script" startup \
  --runtime codex \
  --target-issues 42,47,53 \
  --attest-planner-spawn
```

Compatibility rule: `--target-issue` / `KAOLA_TARGET_ISSUE` keep current one-issue
behavior unchanged. `--target-issues` / `KAOLA_TARGET_ISSUES` are the ONLY
multi-issue startup path. If both are set, the script answers `target_ambiguity`
usage at exit 0 and writes nothing; pass exactly one.

### Bundle project and branch shape

- Active folder (project name): `bundle-42-47-53` (sorted ascending, deduplicated).
- Branch: `workflow/bundle-42-47-53`.
- `workflow-state.md` records the primary issue as `issue_number: 42` plus three
  additive bundle fields: `issue_numbers: 42,47,53`, `bundle_id: bundle-42-47-53`,
  `closure_policy: all_or_nothing`.

### Bundle is adaptive-only

Adaptive is the only workflow path, so the bundle lane always runs `workflow_path: adaptive` —
there is nothing else it could run and nothing to refuse on this axis.

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

### Claim outcomes (bundle-specific)

| code | trigger |
|------|---------|
| `target_ambiguity` | both `--target-issue` and `--target-issues` set (usage answer, exit 0) |
| `target_set_empty` | issue list empty or missing |
| `target_set_conflicts_active_work` | any member is already claimed |
| `target_set_has_closed_issue` | any member is already closed |
| `target_set_red` | classifier returns `red` for any member |
| `target_set_unavailable` | member state probe failed (online) |
| `target_set_unverified` | member unverifiable (offline, no local evidence) |
| `target_set_label_rollback_failed` | partial claim could not be fully rolled back |

On any bundle claim refusal, treat it the same as a single-issue claim refusal:
surface the typed code and STOP; do not retry with a different issue set.
<!-- /REGION -->
