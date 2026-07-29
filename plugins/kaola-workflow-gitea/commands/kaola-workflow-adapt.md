---
description: Kaola-Workflow Adaptive Authoring. The agent freely composes a task-shaped DAG of role nodes into workflow-plan.md, then the validator proves it in-grammar and freezes it.
argument-hint: [issue number | issue set | task description]
---

# Kaola-Workflow Adaptive Authoring (adapt)

Phase-0 of the adaptive path: a dedicated **`workflow-planner`** subagent (reasoning tier) settles the starting
contract (claim + `workflow-state.md` at repo-root — the adaptive claim provisions a hidden worktree
at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root, not in the
worktree) and **freely authors** a task-shaped DAG into `workflow-plan.md`, which the validator proves
in-grammar. The lifecycle frame (claim → branch/worktree → this plan → Finalization sink)
is fixed; the middle is free. The full claim + author + handoff procedure (grammar, caps, example
plan, shaping, and the `kaola-gitea-workflow-claim.js startup` / `Write` /
`kaola-gitea-workflow-adaptive-handoff.js` literals) lives exclusively in `agents/workflow-planner.md`; this
command holds the dispatch handle, entry guard, and handoff routing.

## In-progress re-plan control plane

<!-- PIN: replan-adapt -->

This fence outranks normal adaptive startup and authoring. Before any claim, handoff, or planner
startup action, read the project state and transaction status. When either reports
`replan_in_progress`, keep the frozen parent `workflow-plan.md` authoritative; read-only orientation
reports `replan_phase`, `transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and
`last_cas_result`. The single legal mutation while the fence is active:

```bash
REPLAN_SCRIPT="./plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js"
[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/kaola-gitea-workflow-replan.js}"
[ -f "$REPLAN_SCRIPT" ] || REPLAN_SCRIPT="$HOME/.claude/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js"
[ -f "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-gitea-workflow-replan.js unavailable" >&2; exit 1; }
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

Author a `workflow-plan.md` whose `## Nodes` table passes `kaola-gitea-workflow-plan-validator.js`, freeze
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

## Front end: claim + author (the `workflow-planner` role)

The claim and the authoring write are the front end's product, and the main session keeps every
judgment either way. The router enters with `{issue-or-project}` — an issue number, an issue set, or the
issue a task description resolved to under the Entry contract above — always a RESOLVED target,
because the orchestrator settled the selection before entering. The planner
RETURNS `{project}`. **Re-entry:** a *frozen*
plan never reaches adapt (it resumes via `/kaola-workflow-plan-run`), but an authored-but-NOT-frozen
plan (no `plan_hash`) does — re-run the planner+handoff (it MAY overwrite an unfrozen invalid plan,
never a frozen one) with prior validator errors; a pre-freeze exit is resumable
(`kaola-gitea-workflow-claim.js discard --project {project}` abandons it).

Resolve the entry shape first (Entry contract above) — a task description must already be a
resolved issue number by the time this guard runs.

**Before the claim (main session):** run the authoring guard
(`node "$(kaola_script kaola-gitea-workflow-claim.js)" authoring-allowed`; always `authoring_allowed: true`,
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

Render both target slots from the entry shape; never leave a placeholder literal:

| Entry shape | `Selected issue/set/project:` renders | `Binding scope:` renders |
| --- | --- | --- |
| Issue number / project | that issue number or project name | `none` |
| Issue set | the comma-separated set | `none` |
| Task description | the issue it resolved to under the Entry contract | the user's description, verbatim, on one line |
| No target | the issue the orchestrator-owned no-target survey selected, plus `Selection record: <path>` | `none` |

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

The planner RAN `kaola-gitea-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan
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
  fresh adaptive run** (`kaola-gitea-workflow-claim.js discard --project {project}`) or **STOP + surface a
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
