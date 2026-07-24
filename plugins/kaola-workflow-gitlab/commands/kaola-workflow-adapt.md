---
description: Kaola-Workflow Adaptive Authoring. The agent freely composes a task-shaped DAG of role nodes into workflow-plan.md, then the validator proves it in-grammar and freezes it.
argument-hint: <issue number>
---

# Kaola-Workflow Adaptive Authoring (adapt)

Phase-0 of the adaptive path: a dedicated **`workflow-planner`** subagent (Opus) settles the starting
contract (claim + `workflow-state.md` at repo-root — the adaptive claim provisions a hidden worktree
at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root, not in the
worktree) and **freely authors** a task-shaped DAG into `workflow-plan.md`, which the validator proves
in-grammar. The lifecycle frame (claim → branch/worktree → this plan → Finalization sink)
is fixed; the middle is free. The full claim + author + handoff procedure (grammar, caps, example
plan, shaping, and the `kaola-gitlab-workflow-claim.js startup` / `Write` /
`kaola-gitlab-workflow-adaptive-handoff.js` literals) lives exclusively in `agents/workflow-planner.md`; this
command holds the dispatch handle, entry guard, and handoff routing.

## In-progress re-plan control plane

<!-- PIN: replan-adapt -->

This fence outranks normal adaptive startup and authoring. Before any claim, handoff, or planner
startup action, read the project state and transaction status. When either reports
`replan_in_progress`, keep the frozen parent `workflow-plan.md` authoritative; read-only orientation
reports `replan_phase`, `transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and
`last_cas_result`. The single legal mutation while the fence is active:

```bash
REPLAN_SCRIPT="./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js"
[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/kaola-gitlab-workflow-replan.js}"
[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="$HOME/.claude/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js"
[ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-gitlab-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

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

Author a `workflow-plan.md` whose `## Nodes` table passes `kaola-gitlab-workflow-plan-validator.js`, freeze
it (the script stamps `plan_hash`), record the governance decision (`auto-run` vs `ask` is audit
metadata, NOT an approval gate — freeze and hand off either way), and hand off to
`/kaola-workflow-plan-run`. An out-of-grammar plan earns a **typed refusal** — fix the plan, never
clamp around the gate.

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

## Agent Model Badge

Every subagent dispatch below carries an explicit `model=` line — the installer fills each
`model="{...}"` placeholder from the agent's frontmatter and it is what shows the model badge. You
MUST pass `model="{WORKFLOW_PLANNER_MODEL}"` in the Agent call below exactly as shown; never omit it.

## Front end: claim + author (the `workflow-planner` subagent)

ONE enforced dispatch: the main session never runs the claim or authoring write but keeps every
judgment. The router enters with `{issue}`; the planner RETURNS `{project}`. **Re-entry:** a *frozen*
plan never reaches adapt (it resumes via `/kaola-workflow-plan-run`), but an authored-but-NOT-frozen
plan (no `plan_hash`) does — re-run the planner+handoff (it MAY overwrite an unfrozen invalid plan,
never a frozen one) with prior validator errors; a pre-freeze exit is resumable
(`kaola-gitlab-workflow-claim.js discard --project {project}` abandons it).

**Before the claim (main session):** run the authoring guard
(`node "$(kaola_script kaola-gitlab-workflow-claim.js)" authoring-allowed`; always `authoring_allowed: true`,
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
  prompt="Repository root: {repo-root}. Selected issue/set/project: {issue-or-project}. Settle the starting contract and design the adaptive workflow per the kaola-workflow-adapt skill and workflow-planner contract. Follow the Method in your agent profile (agents/workflow-planner.md) — the full procedure lives there as the sole home. Return only the bounded durable handoff packet."
)
```

This is an **isolated, self-contained control-plane brief**: never inherit the full conversation. A
spawn **argument-shape refusal** requires correcting arguments and retrying the same planner
role/identity/brief exactly once; never author inline.

## Read the durable state, not the planner's prose

<!-- PIN: claim-escalate -->
- **Refusal — any `claim_verdict` NOT `acquired` or `owned`**: NO `workflow-state.md` was written.
  Surface `claim_reasoning` and classify by `result`: `result: refuse` (e.g.
  `target_occupied`, `target_unverified`, `claim: none`) → **HARD STOP**, fail closed (do not retry a
  different issue, do not blind-read a missing state file); `result: escalate`
  (`target_indeterminate` / `target_set_indeterminate`) → **PAUSE and ASK THE USER** (retry, pick
  another target, go offline, or abort — this is not an adaptive-node write-halt; no plan/ledger exists
  yet).
- **Plan already existed** (`plan_path: null` on an `owned` claim) → route to
  `/kaola-workflow-plan-run {project}`; never re-author over a frozen plan.
- **Success** (`acquired` | `owned`, plan authored) → take `{project}`, re-read `workflow-state.md`
  (`## Sink`, `workflow_path: adaptive`) and `workflow-plan.md` (internalize the `## Nodes` DAG).

The planner RAN `kaola-gitlab-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan
frozen, Planning Evidence written; the handoff does NOT open node1 — plan-run owns the full node
lifecycle including the first). `decision:ask` is audit metadata only — it freezes-and-proceeds.

- **`handoff_status: ready_to_run`** → hand off DIRECTLY to `/kaola-workflow-plan-run {project}` (even
  when `decision:ask`, no approval gate).
- **`handoff_status: plan_invalid`** (validator refused; NOTHING written) → bounded **repair loop**:
  re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` to overwrite the
  UNFROZEN plan. Retry ~2x (counter in the ORCHESTRATOR). After repeated failure → **discard+restart a
  fresh adaptive run** (`kaola-gitlab-workflow-claim.js discard --project {project}`) or **STOP + surface a
  concrete blocker**. Forbidden under `replan_in_progress`.

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
cannot confirm.

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
`KAOLA_TARGET_ISSUES` are the only multi-issue path — setting both refuses with `target_ambiguity`.
Shape: active folder + branch `bundle-42-47-53` (sorted, deduplicated); `workflow-state.md` records
`issue_number: 42` + `issue_numbers: 42,47,53`, `bundle_id`, `closure_policy: all_or_nothing`. The
bundle lane always runs `workflow_path: adaptive` (the set may exceed
`KAOLA_BUNDLE_MAX_ISSUES`, default 4). The planner authors ONE implementation-lane DAG (not
one-node-per-issue); `## Meta` carries a conservative union of labels. A bundle run ends at ONE
finalization that closes every issue in `issue_numbers` (all-or-nothing), removes each
`.roadmap/issue-N.md`, regenerates `ROADMAP.md` once, archives one bundle folder, and writes one
closure receipt. On any typed bundle claim refusal (the `target_set_*` / `target_ambiguity`
codes claim.js emits), surface the code and STOP; do not retry with a
different set.
