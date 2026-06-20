---
description: Kaola-Workflow Adaptive Authoring. The agent freely composes a task-shaped DAG of role nodes into workflow-plan.md, then the validator proves it in-grammar and freezes it.
---

# Kaola-Workflow Adaptive Authoring (adapt)

Phase-0 of the adaptive path: a dedicated **`workflow-planner`** subagent (Opus) settles the
starting contract (claim + `workflow-state.md`, at repo-root — the adaptive claim provisions a
repo-local hidden worktree at `<repo-root>/.kw/worktrees/<project>/`, the same as full/fast paths;
the `workflow-planner` authors and freezes the plan at repo-root and does NOT itself cd into the
worktree) and **freely authors** a task-shaped DAG for *this* issue —
which roles, how many, in what shape — into a `workflow-plan.md`. There is no template library and
no knob-binding ceremony: the workflow-planner writes the `## Nodes` table directly, and the
validator proves the result is in-grammar. The main session governs the risk decision and the
freeze; the contractor stamps the durable bookkeeping.

Adaptive is the unconditional default — `fast`/`full` are explicit path-naming
escapes, never an automatic fallback. The authoring entry is **script-enforced**
by `kaola-workflow-claim.js authoring-allowed` (#235), not prose alone (adaptive
authoring is always allowed). The middle of the run
is free; the lifecycle frame around it (claim → branch/worktree → [this plan] →
Finalization sink) is fixed.

The full claim + author + handoff procedure (grammar, caps, example plan, shaping
guidance, and `kaola-workflow-claim.js startup …` / `Write` / `kaola-workflow-adaptive-handoff.js`
literals) lives exclusively in `agents/workflow-planner.md` — the workflow-planner
reads it there. This command holds only the dispatch handle, the entry guard, and
the handoff-packet routing.

## Goal Contract

Author a `workflow-plan.md` whose `## Nodes` table passes
`kaola-workflow-plan-validator.js`, freeze it (the script stamps `plan_hash`),
record the governance decision (`auto-run` vs `ask` is audit metadata, NOT an
approval gate — freeze and hand off either way), and hand off to
`/kaola-workflow-plan-run`. If the plan is out of grammar, the validator returns
a **typed refusal** — fix the plan, never clamp around the gate.

## Effort Variant Resolution

opencode resolves each subagent effort centrally from `opencode.json` (the two Kaola
tiers as reasoning-EFFORT VARIANTS of the inherited model): reasoning-tier roles run the
model's TOP effort variant, standard-tier roles its SECOND (e.g. max / high on GLM-5.2).
Dispatch a role with the `task` tool using `subagent_type: "<role>"`; do NOT pass a
per-call `model=` argument — the role's configured variant already selects the effort.
`mapTier(tier, provider)` resolves the variant: the reasoning tier → the TOP effort variant, the standard tier → its SECOND.

## Front end: claim + author (the `workflow-planner` subagent)

The adaptive path opens with ONE enforced subagent dispatch. The **`workflow-planner`** (Opus)
settles the **starting contract** and **authors** the task-shaped DAG into `workflow-plan.md`. The
main session never runs the claim or the authoring write itself — that is the whole point of this
path. The main session keeps every **judgment**: git-freshness, the risk decision, the freeze, and
the dispatch loop (a subagent can never dispatch a subagent — the `workflow-planner` returns control
to you).

The router enters this command with the agent-selected target issue for fresh adaptive work; use
`{issue}` for the front-end dispatch and the planner RETURNS the `{project}` you use after. **Re-entry
(resume of an unfrozen plan):** a *frozen* plan never reaches adapt (it resumes via
`/kaola-workflow-plan-run`), but an **authored-but-NOT-frozen** plan does — if `{project}`'s
`workflow-plan.md` already exists with **no `plan_hash`** (a prior governance refusal / declined
risk-ask / abort left it unfrozen), re-run the planner+handoff on it (the planner MAY overwrite an unfrozen invalid plan; never a frozen one), passing prior validator errors. Do NOT route to a separate freeze step — the handoff freezes mechanically. A pre-freeze
exit therefore leaves a **resumable** project, not an orphan; `kaola-workflow-claim.js discard
--project {project}` abandons it.

**Entry guard (main session, before the dispatch).** Run the **authoring guard** (#235). It needs
no project, so it runs before the claim. Adaptive authoring is always allowed,
so this returns `authoring_allowed: true`; the call preserves the mechanical gate shape
and the planner's `startup` still routes the claim via `claimProject`.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; _oc="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "$_oc/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "$_oc/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
node "$(kaola_script kaola-workflow-claim.js)" authoring-allowed
```

The JSON `status` is `authoring_allowed` (adaptive is always allowed); proceed. The gate is kept
for mechanical shape — never clamp around it.

**Git freshness (main session, BEFORE the claim).** If `authoring_allowed`, gate on a clean main
*before* summoning the planner: you are at the repo root and nothing is claimed yet — run the Startup
Step 1 git-freshness checks (`workflow-next.md`) against the MAIN repo. If local is behind,
`git pull --ff-only`; if it cannot resolve cleanly (dirty worktree, or a merge / rebase / stash /
reset is required), STOP and ask — do **not** summon the planner, so **no folder /
`workflow:in-progress` label is created until git is clean**. The adaptive path gates freshness here,
*before* the claim, because the front end claims at repo-root — the router's post-claim
freshness-block release no longer guards this path, and gating up front leaves nothing to orphan.

Once main is clean, **summon the `workflow-planner`** — it claims, authors `workflow-plan.md`, runs
the validator `--json` as a self-check, and RETURNS a structured summary; it never JUDGES risk or asks the user (decision:ask is recorded metadata); it RUNS the handoff, which freezes mechanically, and returns the packet; it never dispatches.

**Planner-first control boundary (issue #287).** The main session performs ONLY the allowed non-design preflight above (read repo/session rules, confirm target issue, authoring-allowed check, git freshness, non-design target availability), then dispatches `workflow-planner` immediately as the first issue-specific action. The main session MUST NOT pre-author the `## Nodes` DAG, choose role sequence/deps/shapes/write-sets, or pass a mandatory full DAG / `AUTHOR EXACTLY` / `do not redesign` prompt to the planner — the adaptive front-end design is the planner's to own, not the main session's. Doing so earns a typed refusal: `planner_control_boundary_violation`. The ONLY exception is in the bounded unfrozen-plan validator-repair loop (after `handoff_status: plan_invalid` on an UNFROZEN plan): the orchestrator MAY re-dispatch the planner with the verbatim validator errors + the prior plan as repair context, because the planner already owns that unfrozen draft.

Dispatch the role via `subagent_type`; its effort variant resolves centrally from `opencode.json` (reasoning-tier → the model's TOP effort, standard-tier → its SECOND). Never pass a per-call `model=`.

```text
task(
  subagent_type="workflow-planner",
  description="Adaptive front end {issue}",
  prompt="Settle the starting contract and design the adaptive workflow for issue {issue}, per your workflow-planner contract. Follow the Method in your agent profile (agents/workflow-planner.md). The full procedure — startup, Write of ## Nodes, adaptive-handoff.js — lives there as the sole home."
)
```

**Read the durable state, not the planner's prose.** The structured return is a thin pointer; the
files are authoritative.

<!-- PIN: claim-escalate -->
- **Refusal — any `claim_verdict` that is NOT `acquired` or `owned`**: NO `workflow-state.md` was
  written. Surface `claim_reasoning` and classify by `result` (#495):
  - `result: refuse` (e.g. `workflow_path_refused`, `target_occupied`, `user_target_blocked`,
    `user_target_red`, `user_target_closed`, `target_unavailable`, `target_unverified`, or
    `claim: none`): **HARD STOP** (**fail closed** — do not retry a different issue, do not
    blind-read a missing state file). The determinate RED is final.
  - `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
    subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
    pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
    no plan/ledger exists yet at claim time.
- **Plan already existed** (`plan_path: null` on an `owned` claim): route to
  `/kaola-workflow-plan-run {project}` — never re-author over a frozen plan.
- **Success** (`acquired` | `owned`, plan authored): take `{project}` from the return, then re-read
  `kaola-workflow/{project}/workflow-state.md` (the `## Sink` block, `workflow_path: adaptive`) and
  `kaola-workflow/{project}/workflow-plan.md` (internalize the `## Nodes` DAG you will govern,
  dispatch, and freeze).

The claim (at repo-root — the adaptive claim provisions a worktree at `<repo-root>/.kw/worktrees/<project>/`; the planner authors + freezes at repo-root) was cut from a now-clean main (git-freshness ran *before* the claim, above), so proceed
straight to reading the handoff packet.

## Read the handoff packet

The planner RAN `kaola-workflow-adaptive-handoff.js` and returned a checklist-backed packet (plan already frozen, Planning Evidence written; the handoff does NOT open node1 or record the node1 baseline — plan-run owns the full node lifecycle including the first node). The handoff is mechanical; `decision:ask` is **audit metadata only** — it freezes-and-proceeds, NEVER pauses for approval.

- **`handoff_status: ready_to_run`** (all checklist true) → hand off DIRECTLY to `/kaola-workflow-plan-run {project}` (even when `decision:ask`, no approval gate). `/kaola-workflow-plan-run` owns the complete node lifecycle — it opens and dispatches every node including the first, via `kaola-workflow-adaptive-node.js`.

- **`handoff_status: plan_invalid`** (validator refused; plan never froze, NOTHING written) → bounded **repair loop**: re-dispatch the `workflow-planner` with the verbatim `errors`/`validator_verdict` so it overwrites the UNFROZEN plan with a corrected DAG and re-runs the handoff. Retry ~2x (the retry counter lives in the ORCHESTRATOR, never in the script). After repeated failure (~2x) → a REAL decision: **discard+restart a fresh adaptive run** (`kaola-workflow-claim.js discard --project {project}` then a fresh adaptive start) / **STOP + surface a concrete blocker** with validator evidence. NEVER downgrade to fast/full — there is no automatic fallback between paths (#538); the only fallbacks are inside adaptive (bounded repair, in-place posture). Never silently loop.

## Establish the task list, then hand off

After `handoff_status: ready_to_run` (and ONLY then), re-read `kaola-workflow/{project}/workflow-plan.md` to internalize the frozen `## Nodes` table, then create the orchestrator's task list. **The task list MUST NOT be created before `handoff_status: ready_to_run` is confirmed and the frozen plan has been read** — the planner owns the design; the task list is a mechanical reflection of the frozen result, not a pre-planned outline.

**Establish the orchestrator's task list = the workflow nodes** (use **TodoWrite**) — one task per row of the frozen `## Nodes` table, labeled `id · role`, in `depends_on`
(topological) order. This task list is a **live mirror** of the `## Node Ledger`, which stays the
durable source of truth; the executor (`/kaola-workflow-plan-run`) flips each task `in_progress`
when it dispatches that node's role (after `open-next`) and `completed` after the
commit step closes it (`n/a` nodes → skipped). Then hand off to the executor:

```text
/kaola-workflow-plan-run {project}
```

## Shaping guidance

The full shaping guidance lives in `agents/workflow-planner.md`. One heuristic is mirrored here for quick reference:

- Author a `knowledge-lookup` node when the task depends on external library or API behavior, framework conventions, or open-web/expertise knowledge that cannot be confirmed from the local codebase alone. This mirrors the Phase 1 `knowledge-lookup` trigger.

### Question-shaped & bug-shaped issues (#486)

When the issue is a **question without a settled answer** ("which approach?", "is X viable?", "why does Y happen?"), the `workflow-planner` authors an **investigation**, not a build DAG around an unvalidated premise (which would launder the guess past the artifact-vs-plan verdict). The arc maps onto existing roles with **zero new grammar**: **probe → assume → adversarially critique → converge** — read-only `code-explorer`/`knowledge-lookup` probes (authored as a read-only fan-out, inheriting #472 concurrency) → `planner` proposes 2–3 candidate answers, each with an explicit falsification test → `adversarial-verifier` (a separate subagent; read-only but has Bash, so for a bug it **runs the existing reproduction**) tries to refute the leading answer → `planner`/`synthesizer` converges. **Freeze-once split:** Case A (shape knowable, answer not) authors the whole DAG up front (or `select(<group>)` for the enumerable version); Case B (shape depends on findings — e.g. a flaky-bug diagnosis) runs a short read-only shaping run, then RE-PLANS as a fresh run (new `plan_hash`, no in-place thaw). For a **bug**, the falsification criterion IS the reproduction ("root cause or symptom mask?"); cannot-reproduce-after-a-bounded-probe → the `consent`-halt valve (`write-halt --reason consent`), never a guess-fix. Escalate values, not facts; `decision:ask` stays advisory (no new gate). Full pattern: the `workflow-planner` profile.

## Bundle Lane — Multi-Issue Adaptive Claim

When the router delivers a same-scope bundle (explicit-bundle or auto-bundle mode —
see `workflow-next.md` Step 0 Bundle Lane), the `workflow-planner` runs the bundle
claim instead of the single-issue claim. The issue set was already selected and
stated by the main orchestrator; the planner validates and claims it.

### Bundle startup call

The planner passes `--target-issues A,B,C` (sorted ascending, comma-separated)
instead of `--target-issue N`:

```bash
node "$CLAIM_JS" startup \
  --runtime opencode \
  --workflow-path adaptive \
  --target-issues 42,47,53
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
