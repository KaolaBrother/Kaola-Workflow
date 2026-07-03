---
name: kaola-workflow-adapt
description: Use when authoring an adaptive workflow-plan.md — freely compose a task-shaped DAG of role nodes, then the validator proves it in-grammar and freezes it. Mirror of commands/kaola-workflow-adapt.md for Codex runtime.
---

# Skill: kaola-workflow-adapt

Phase-0 of the adaptive path: the agent **freely authors** a task-shaped DAG for *this*
issue — which roles, how many, in what shape — into a `workflow-plan.md`. There is no
template library and no knob-binding ceremony. Mirror of `commands/kaola-workflow-adapt.md`
for the Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`.

Adaptive is the unconditional default; `fast`/`full` are explicit path-naming
escapes, never an automatic fallback (see `kaola-workflow-next`
Startup Step 0a-1).

## The grammar (the closed envelope)

Each node is one row of the `## Nodes` table:
`| id | role | depends_on | declared_write_set | cardinality | shape | model |`.
- **role** must be in the installed library (the nine canonical roles + any
  maintainer-installed role such as `adversarial-verifier`). The validator hard-rejects
  an unknown role.
- **model** (optional) — the planner-assigned tier token from the closed set `{reasoning|standard}` — the
  two portable rank tokens translated to a per-spawn reasoning effort at dispatch (on Codex the
  reasoning tier -> `xhigh`, the standard tier -> `high` on the configured model); the legacy `opus`/`sonnet`
  aliases remain accepted (mapping to `reasoning`/`standard` respectively) — new plans should author the
  neutral tokens. Assign the reasoning tier
  to reasoning-bound nodes (architecture/design that constrains downstream work, adversarial gates on
  high-risk changes, security review, root-cause of non-obvious bugs); the standard tier to carry-out nodes
  (implementation against a spec, mechanical ports, docs, sweeps, evidence). When unsure, prefer
  the standard tier and strengthen the gate to the reasoning tier. The plan tier beats the install profile. An out-of-vocab
  cell is a freeze refusal (`model_invalid`); a `main-session-gate` must not carry a model; absent/`—`
  falls back to the role-static effort (on Codex, the parent session's reasoning effort — base profiles omit a pinned `model_reasoning_effort` and inherit the session).
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

When the issue is a **question without a settled answer** ("which approach?", "is X viable?", "why does Y happen?"), the `workflow-planner` authors an **investigation**, not a build DAG around an unvalidated premise (which would launder the guess past the artifact-vs-plan verdict). The arc maps onto existing roles with **zero new grammar**: **probe → assume → adversarially critique → converge** — read-only `code-explorer`/`knowledge-lookup` probes (authored as a read-only fan-out, dispatched concurrently) → `planner` proposes 2–3 candidate answers, each with an explicit falsification test → `adversarial-verifier` (a separate subagent; read-only but has Bash, so for a bug it **runs the existing reproduction**) tries to refute the leading answer → `planner`/`synthesizer` converges. **Freeze-once split:** Case A (shape knowable, answer not) authors the whole DAG up front (or `select(<group>)` for the enumerable version); Case B (shape depends on findings — e.g. a flaky-bug diagnosis) runs a short read-only shaping run, then RE-PLANS as a fresh run (new `plan_hash`, no in-place thaw). For a **bug**, the falsification criterion IS the reproduction ("root cause or symptom mask?"); cannot-reproduce-after-a-bounded-probe → the `consent`-halt valve (`write-halt --reason consent`), never a guess-fix. Escalate values, not facts; `decision:ask` stays advisory (no new gate). Full pattern: the `workflow-planner` profile.

## Front end: claim + author (the `workflow-planner` agent role)

The adaptive path opens by delegating to ONE subagent. **You MUST delegate the starting contract
and the DAG authoring to the `workflow-planner` agent role** — do NOT run the claim or author
the `## Nodes` table inline in this session. In Codex, delegate to the `workflow-planner` agent role when its
profile is present at EITHER the project-local `.codex/agents/kaola-workflow/` path OR the global
`~/.codex/agents/kaola-workflow/` path (the `--global` install target) — a global install satisfies
delegation exactly as a project-local one does. Only if the agent tool is genuinely
unavailable at BOTH paths (`local-fallback-tool-unavailable`) may this session run the claim + author inline, and that fallback MUST be recorded as `local-fallback-tool-unavailable` in the compliance ledger. The
planner never freezes, judges risk, asks the user, or dispatches further — it returns control here.

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
--target-issue <issue>` (`--workflow-path adaptive` is REQUIRED — a subagent shell does not inherit
KAOLA_PATH; add `--sink pr` only for a requested PR sink; on Codex, first run the same preflight
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

**Read the durable state, not the planner's prose.** On success take `{project}` from the return,
re-read `kaola-workflow/{project}/workflow-state.md` (the `## Sink` block, `workflow_path: adaptive`)
and `kaola-workflow/{project}/workflow-plan.md` (internalize the `## Nodes` DAG you govern, dispatch,
and freeze). The claim (at repo-root — the adaptive claim provisions a worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root) was cut from a now-clean main (git-freshness ran before the claim, above).

**Read the handoff packet.** The planner RAN `kaola-gitea-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan already frozen, Planning Evidence written; the handoff does NOT open node1 or record the node1 baseline — `kaola-workflow-plan-run` owns the full node lifecycle including the first node). The handoff is mechanical; `decision:ask` is audit metadata only — it freezes-and-proceeds, NEVER pauses for approval.

- **`handoff_status: ready_to_run`** (all checklist true) → hand off DIRECTLY to `kaola-workflow-plan-run {project}` (even when `decision:ask`, no approval gate). `kaola-workflow-plan-run` owns the complete node lifecycle — it opens and dispatches every node including the first, via `kaola-gitea-workflow-adaptive-node.js`.

- **`handoff_status: plan_invalid`** (validator refused; plan never froze, NOTHING written) → bounded **repair loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` so it overwrites the UNFROZEN plan with a corrected DAG and re-runs the handoff. Retry ~2x (counter in the orchestrator, never in the script). After repeated failure (~2x) → real decision: **discard+restart a fresh adaptive run** (`kaola-gitea-workflow-claim.js discard --project {project}` then a fresh adaptive start) / **STOP + surface a concrete blocker** with validator evidence. NEVER downgrade to fast/full — there is no automatic fallback between paths; the only fallbacks are inside adaptive (bounded repair, in-place posture). Never silently loop.

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
