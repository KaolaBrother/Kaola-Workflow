---
description: Workflow Next. Thin router for Kaola-Workflow. Detects active work, reconstructs resume state, and routes to the correct command.
argument-hint: (optional project name or task description)
---


# Workflow Next - thin router

**First Principles.** When no shipped rule, gate, or refusal already settles a
situation, break the tie by the First Principles axioms (the `## First Principles`
block in your project's workflow-init CLAUDE.md), applied in priority order, and
record a one-line derivation in the node's `.cache` evidence — OPTIONAL, never
blocks a gate. An axiom may only make you stricter:
never cite one to skip a typed gate, refusal, or barrier.

## In-progress re-plan control plane

<!-- PIN: replan-next -->

This fence outranks every normal startup, mirror, scheduler, handoff, validation, and
finalization route. Before any such action, read the project state and transaction status. When
either reports `replan_in_progress`, do not mutate or replace the frozen parent
`workflow-plan.md`. Read-only orientation must report the exact `replan_phase`,
`transaction_id`, `parent_plan_hash`, `child_plan_hash` (or `none`), and
`last_cas_result`; never reconstruct them from memory.

The single legal mutation while the fence is active is the edition-local re-plan resume command:

```bash
REPLAN_SCRIPT=""
for _p in "./plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/kaola-gitea-workflow-replan.js}" "$HOME/.claude/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js"; do
  [ -f "$_p" ] && { REPLAN_SCRIPT="$_p"; break; }
done
[ -n "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-gitea-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

The installed aggregator is `kaola-gitea-workflow-replan.js`. Do not run mirror/open/record/close/run-chains,
ordinary adaptive handoff, claim archive, task-mirror refresh, or finalize while an intermediate
phase remains. `decision:ask` remains advisory and never adds a pause or gate.

If resume returns `replan_planner_dispatch_required`, dispatch the genuine
`workflow-planner` profile in its Re-plan dispatch mode with an isolated brief containing only
the repository root, project, `transaction_id`, `dispatch_nonce`, profile identity, the exact
`.cache/replan-planner-packet.json` path, and the packet's reason/source evidence. No role
sequence, node ids, dependencies, write sets, cardinality, shape, model, or exact DAG fragment may
be supplied by the orchestrator; an attempt earns `planner_control_boundary_violation`. The
planner alone writes the seeded `workflow-plan.next.md` and
`.cache/replan-planner-attestation.json`, then returns through this same resume command. Missing,
stale, replayed, or mismatched dispatch proof/attestation is
`replan_planner_attestation_invalid`; main must never synthesize either artifact.

An invalid unfrozen child uses the bounded unfrozen child-repair loop: re-dispatch the same planner
with the verbatim validator errors and its own child draft, then resume. The main session never
repairs the child DAG. At the retry bound, stop with the typed evidence; do not create a competing
plan, restart the claim, or route to another path. A verified legacy-v1 parent follows this same
transaction into a schema-2 child; legacy normal startup behavior otherwise stays unchanged.

`/workflow-next` is the thin router for the workflow commands. It owns
startup, Git/roadmap freshness, project selection, resume detection, and
routing. It does not perform workflow work directly.

## Inputs

Use `$ARGUMENTS` as either:
- an existing workflow project name
- a Gitea issue number or free-form task description for new work
- empty, meaning detect or ask

## Router Rules

- Do not implement, review, fix, or finalize work in this router.
- Do not invoke phase agents from this router — including on the no-issue-named branch: that
  branch dispatches nothing itself. THIS router (the orchestrator) owns the pre-claim backlog
  reading and the selection; it then routes with no target to the adaptive front end, whose
  `workflow-planner` (dispatched by that command, never by this router) runs the claim and
  authors the DAG in ONE dispatch.
- Do not advance the run while any `Required Agent Compliance` row is
  `pending`, missing, or lacks evidence/skip reason.
- Prefer `workflow-state.md` for exact resume position.
- If `workflow-state.md` is missing or stale, reconstruct conservatively from
  node evidence and cache files.
- If exact intra-phase position is ambiguous, stop and ask the user instead of
  guessing.
- When the next command is identified, either continue by following the matching
  command content if available in this session, or print the exact command
  the user must run.

## Goal-Driven Autonomy

Keep going (via `/goal` or equivalent Stop-hook wording) until the phase objective and completion
audit pass. Decide nonessential bookkeeping autonomously; ask only for true external authorization or
materially user-owned choices. The `/goal` template must NOT imply cross-issue continuation — each run
targets exactly one issue or one selected same-scope bundle.

**Finishing an issue INCLUDES capturing its run-discovered defects** — each gap is FILED (`filed: #N`
in `finalization-summary.md`'s `## Run gaps`) or justified `noise: <reason>`, else the `gaps_unswept`
finalize gate refuses.

## Startup Step 0 - Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

**Branch first on whether the user named an issue:**

- **User named a specific issue** — `$ARGUMENTS` carries an issue number/project, or
  the prompt names one (e.g. "work on #N") → use the single-issue selection
  (steps 1–4 below). That issue IS the target: never substitute another, and never
  adopt an active folder's issue in its place.
- **User described a task but named no issue** — a free-form description of the work
  (e.g. "fix the login timeout") → leave `KAOLA_TARGET_ISSUE` / `KAOLA_TARGET_ISSUES`
  UNSET and route to `/kaola-workflow-adapt <the task description, verbatim>`
  (Step 0a-2). The described task IS the target: adapt resolves it to exactly one issue
  before claiming, and the backlog survey NEVER runs on this branch, so roadmap priority
  cannot outrank the work the user asked for. Skip steps 1–4 below.
- **User named neither an issue nor a task** — the common "work on the next issue" /
  no-argument case → this is the **auto-bundle entry**. Resolve the path intent first
  (Step 0a-1), then leave `KAOLA_TARGET_ISSUE` / `KAOLA_TARGET_ISSUES` UNSET and route
  straight to the adaptive front-end entry (Step 0a-2; Step 0c's *Auto-bundle entry* below
  documents the selection contract): YOU rank the backlog and select — one issue by default, or
  a high-confidence same-scope bundle when every bundle rule is met — record the selection in a
  typed selection record, and route to `/kaola-workflow-adapt` carrying the resolved target,
  the record path, and the reconnaissance evidence paths. The `workflow-planner` then claims +
  authors + freezes in ONE dispatch. Skip steps 1–4 below on this branch — there is no
  router-VALIDATED target to state; you state the SELECTED one instead.

On the no-target branch (the user named neither an issue nor a task), **the ORCHESTRATOR is the
backlog reader** — selection is orchestrator-owned and is never delegated to the planner. Read
`ROADMAP.md` (its `## Active Work` table's `Next Step` column and any `### Project rules` block),
each `kaola-workflow/.roadmap/issue-*.md`, the forge issue list, active folders and each non-owned
lane's `lane_bucket`, and archived summaries. Rank them by the precedence in Step 0c below, claim
through Gate 1, then dispatch the `workflow-planner` with the resolved target, the selection record,
and the reconnaissance evidence PATHS. The planner shapes what you selected — its own *Origin inputs*
section states what it consumes and what it refuses — and never ranks the backlog itself.

1. If the user named a specific issue number or project — in `$ARGUMENTS` or in the prompt — set `KAOLA_TARGET_ISSUE` to THAT issue and go to step 3. A named target is never substituted: do not read, adopt, or fall back to an active folder's issue in its place.
2. ONLY when the user named no issue and no project: if exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call. If a target WAS named and it differs from the active folder's issue, keep the named target — co-active folders are supported, and the named issue gets its own lane.

   ```bash
   kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
   CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
3. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.
   - Online: `tea issues view "$KAOLA_TARGET_ISSUE" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue.
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
4. State the selected issue number aloud before calling startup.

If no actionable issue is found (all blocked, red, or occupied), stop and explain.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Startup Step 0c — Bundle Lane (Multi-Issue)

The bundle lane is additive: `--target-issue N` / `KAOLA_TARGET_ISSUE` single-issue
behavior is unchanged. Use the bundle lane only when the user explicitly names
several issues or when auto-bundle mode identifies a high-confidence same-scope
set (see below).

### Explicit-bundle entry

When the user names several issues, set `KAOLA_TARGET_ISSUES=42,47,53` (comma-separated, no spaces)
and pass `--target-issues 42,47,53` (project/branch `bundle-42-47-53`, sorted
+ deduplicated; the script validates the exact set, never reorders). The bundle lane runs on `workflow_path: adaptive`.
`--target-issue` keeps single-issue behavior; never set both (`target_ambiguity`).

### Auto-bundle entry

**Single-issue is the default here.** On this branch the ORCHESTRATOR selects ONE issue unless
EVERY bundle rule below is met; it never manufactures a bundle. The heading names the entry
point, not the expected outcome.

This is the **no-target branch of Step 0** — the user named neither an issue nor a task. The
router dispatches no phase agent, but it DOES own the selection: read the backlog sources
(roadmap sources, remote open issues + dependency labels, active folders, archived summaries),
rank by the precedence below, and settle a single `primary_issue` — or a high-confidence
same-scope bundle when every rule below holds. Then claim through Gate 1 and route to the
adaptive front end (Step 0a-2), where the `workflow-planner` authors + freezes in ONE dispatch.

A bundle requires ALL of: every candidate open + unclaimed, no dependency unresolved outside
the set, a shared coherent scope signal, and a count at or below `KAOLA_BUNDLE_MAX_ISSUES`
(default 8). If any rule fails, or confidence is not high, select a single `primary_issue` →
single-issue selection.

**The main orchestrator STATES the selected issue set aloud BEFORE it claims.**
Scripts validate but never select or substitute issues.

### Ranking candidates

Rank by the roadmap priority frontier (`### Project rules` and the `Next Step` drive-order), then
group by scope. Say in the selection record what you skipped and why. Exclude what is not yours to
take: issues closed or already claimed, or classified red against active work.

### Co-Tenant Mode: Disjoint Issue Selection

When reading active folders, each non-owned lane carries a `lane_bucket` classification in the
claim-status report. Use it to shape the candidate pool before any other selection step:

- **`mine`** — this session owns the lane; operate normally.
- **`live`** — another live session is working in this lane. Leave it entirely untouched and exclude
  all of its issues from the candidate pool.
- **`stale`** — a resumable leftover from a prior, inactive session. Treat its issues as ordinary
  unclaimed candidates for overlap purposes.
- **`ambiguous`** — liveness cannot be determined. Do not include this lane's issues in any
  recommendation; record the ambiguity and ask.

**Per-lane precedence ladder (first match wins, applied independently per lane):**
1. An explicit per-issue resume instruction (e.g. "resume issue N") makes the lane `stale` (resumable)
   regardless of marker age — this beats all other signals.
2. A blanket co-tenant signal in the user prompt (e.g. "another session is working") makes all
   non-owned, non-explicitly-resumed lanes `live`.
3. The liveness heuristic from `lane_bucket`: a fresh marker → `ambiguous`; an old or absent marker →
   `stale`.
4. No signal → ask.

Combine the `live`-lane issue exclusion with the write-set overlap verdict when building the candidate
pool: a bundle is eligible only when its issues are not occupied by any `live` lane AND its write areas
do not conflict with active work. When all candidates are occupied by `live` or `ambiguous` lanes, emit
the `backlog_empty` verdict rather than recommending occupied work.

### Bundle Selection Rules

**Default: single issue.** Bundle only when the issues are open, unclaimed, share a scope signal, and
their write areas fit one adaptive DAG. The ceiling is `KAOLA_BUNDLE_MAX_ISSUES` (default 8) and the
claim enforces it.

If you pass over the frontier issue, say which one and why in `selection_priority_basis`, and list it
in `selection_rejected`. An unexplained substitution is the failure mode; an explained one is a
judgement call you are entitled to make.

### Empty backlog / indeterminate selection — the pre-claim verdicts

Selection runs BEFORE any claim, so an empty or ambiguous backlog must fail closed WITHOUT claiming or
writing any state. State the typed verdict and STOP:

- **`backlog_empty`** — after the full survey there is no claimable, unblocked, same-scope bundle:
  every open issue is already claimed, classified red, has an unresolved external dependency, is
  occupied by a `live`/`ambiguous` lane, or the backlog has no open issues at all. Do NOT emit this
  merely because confidence is low or the bundles are suboptimal — only when no issue passes all bundle
  rules.
- **`selection_indeterminate`** — selection cannot be resolved determinately (e.g. an `ambiguous`
  co-tenant lane blocks the frontier, or the priority signal is genuinely contradictory).

Both join the `target_indeterminate` verdict family (`result: 'escalate'`, `claim: 'none'`). A CLEAN
selection — frontier honored, no ambiguity — claims autonomously; only ambiguity or a policy conflict
asks the user first.

### Gate 1 — the typed selection record at claim
**Selection record.** The selection is the orchestrator's, so the orchestrator persists it. Author a
JSON record with exactly six non-empty fields — `selection_mode`, `selection_bundle`,
`selection_priority_basis`, `selection_rejected`, `selection_disjointness`, and `clarifications` (the
questions asked and the answers received, or `none`) — and pass it to the claim as
`--target-source orchestrator_selected --selection-record <path>`. Startup refuses
`selection_record_missing` when the flag or the file is absent, and `selection_record_invalid` when
the record is unparseable or any of the six fields is empty; both refuse with zero side effects, so a
missing record never half-claims. On an acquiring claim startup copies the record verbatim to
`kaola-workflow/{project}/.cache/origin/selection-record.json`, stamps its sha256 into
`workflow-state.md` as `selection_record_digest:`, and folds any pre-claim reconnaissance staged under
`kaola-workflow/.origin/<target-key>/` into that same `.cache/origin/` directory (`<target-key>` is the
project name the claim resolves to). A user-named claim passes neither flag and startup writes the
degenerate record (`selection_mode: explicit-target`) itself, so the durable field is never optional.

Everything BEFORE that claim is free: dispatch read-only agents, read what you need, and ask the user
when the pick is genuinely ambiguous — just land the findings in files under
`kaola-workflow/.origin/<target-key>/`, never only in run context. Nothing else is regulated until
the commitment point, and the commitment point is a script refusal rather than a convention. The
router may also dock a human-readable `kaola-workflow/{project}/.cache/selection-evidence.md` with a
leading `selection_mode: auto-bundle|single-issue` line; the orchestrator is that sidecar's only
writer, so it exists only on this no-target branch — a user-named claim legitimately has none.


### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
(all-or-nothing). There is one merge/PR sink per bundle. The finalization step
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

## Startup Step 0a — PR Intent Capture

Before the startup transaction, check the user's initial prompt for PR sink intent.
If it contains "open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr",
"PR sink" (case-insensitive),
export `KAOLA_SINK=pr` before the startup call.
The `${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates it.
Keyword matching is agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Adaptive is the only workflow path — there is nothing to select. Proceed directly to Step 0a-2.
State the path:

```text
Path: adaptive
```

## Startup Step 0a-2 — Adaptive front-end entry

The starting contract always moves into the adaptive front end: do NOT run
the Step 0b inline startup. The `workflow-planner` subagent — dispatched by
`/kaola-workflow-adapt`, never by this router — runs the claim itself, so the router only selects +
validates the issue when the user named one (Step 0), or passes NO target on the auto-bundle
entry, then hands off either way. This keeps the router free of *phase-agent* and *claim*
dispatch (Router Rules) — there is no router-side dispatch at all, on either branch — while the
reasoning-tier front end owns the claim and the DAG authoring (the backlog reading and the
selection stayed here, with the orchestrator):

1. **Resume wins — never re-author a frozen plan.** If an active folder already exists for the
   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then
   route to `/kaola-workflow-plan-run {project}` and stop — the same `workflow-plan.md exists ->
   /kaola-workflow-plan-run` rule as Resume Detection. The front end is for FRESH adaptive work only.
2. **Fresh adaptive.** Run `watch-pr` once for global PR-folder reconciliation, then route to
   `/kaola-workflow-adapt $KAOLA_TARGET_ISSUE`. The adapt command's `workflow-planner` runs
   `kaola-gitea-workflow-claim.js startup --target-issue $KAOLA_TARGET_ISSUE`
   (the claim + worktree + `workflow-state.md`); git-freshness (Startup Step 1) runs INSIDE adapt against MAIN **before** the planner claims
   (so a dirty/behind main never orphans a worktree); the roadmap check (Startup Step 2) runs in adapt too.
   Do NOT run Startup Step 0b / 1 / 2 in the router for this path.

   **Task description (no issue number):** when the user described the work but named no
   issue (Step 0's described-task branch), route to `/kaola-workflow-adapt <the task
   description, verbatim>`. Adapt resolves the description to exactly one issue before the
   claim and dispatches the planner in explicit-target mode with that issue plus the
   description verbatim. The no-target backlog survey does NOT run on this route, so roadmap
   priority cannot outrank the described task.

   **No target (auto-bundle entry):** when neither `KAOLA_TARGET_ISSUE` nor
   `KAOLA_TARGET_ISSUES` was set and the user described no task (Step 0's no-issue-named
   branch), route to `/kaola-workflow-adapt` carrying the target YOU selected, the
   `--selection-record` path, and the reconnaissance evidence paths. The orchestrator owns the
   selection; the planner runs the claim and authors — see
   "Startup Step 0c — Bundle Lane" above, *Auto-bundle entry*.

   **Bundle:** when `KAOLA_TARGET_ISSUES` is set (multi-issue bundle), route to
   `/kaola-workflow-adapt` with the full issue set — the planner uses
   `--target-issues $KAOLA_TARGET_ISSUES` instead of `--target-issue N`. See
   "Startup Step 0c — Bundle Lane" above for selection, and the Bundle Lane section
   of `kaola-workflow-adapt.md` for the planner's claim contract.

## Startup Step 0b - Startup Transaction

**Skip this entire step** — the adaptive front end (Step 0a-2) always claims via the
`workflow-planner`, not here. This step never runs; it is retained only for the shared
typed-refusal classification below.

Run `node "$CLAIM_JS" startup --runtime claude` with the agent-selected
`--target-issue` (and `--sink` when set); it atomically creates
`kaola-workflow/{project}/workflow-state.md`. Verdict `owned`/`acquired` routes the folder,
`no_target` re-selects per Step 0, `claim: "none"` stops normal routing (do not adopt an unrelated
folder). Print the refusal diagnostics:

```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

<!-- PIN: claim-escalate -->
If startup returns a typed refusal, read the `reasoning` field and classify by `result`:
- `result: refuse` (`target_occupied`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`): **HARD STOP** — the determinate RED is final; do
  not blind-proceed to a different issue without explicit user direction.
- `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
  no plan/ledger exists yet at claim time.
If startup is unavailable or malformed, stop for repair.
On startup, also run `watch-pr` to archive PR folders for merged or closed PRs
before selecting new work.

## Startup Step 1 - Git Freshness

Classify local/remote state (`git status --short --branch`, `git fetch --prune`,
`git rev-list --left-right --count @{u}...HEAD`). Continue when synchronized, ahead-only, or with no
remote; fast-forward (`git pull --ff-only`) when clean and behind-only. Stop before any merge, rebase,
stash, reset, or dirty-worktree sync. If a claimed folder cannot fast-forward, release it before
stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

## Startup Step 2 - Roadmap

If a Gitea remote and authenticated `tea` are available, fetch open issues:

```bash
tea issues list --limit 100 --output json
```

Ensure `kaola-workflow/ROADMAP.md` exists. If Gitea is unavailable, continue from the local
roadmap and say why sync was skipped.

Validate that `ROADMAP.md` is current with the per-issue source files:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
ROADMAP_JS="$(kaola_script kaola-gitea-workflow-roadmap.js)"
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" validate
```

If `validate` exits non-zero, print a warning and continue:

```text
WARNING: kaola-workflow/ROADMAP.md is stale. Per-issue files have changed since the last generate.
To refresh: node .../kaola-gitea-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m "chore: refresh ROADMAP.md"
Continuing with stale ROADMAP.md — roadmap state may not reflect current per-issue files.
```

Do NOT run `generate` automatically. Do NOT stage or commit `ROADMAP.md` in this step.
Commits stay phase-owned (Finalization Step 7). If `kaola-gitea-workflow-roadmap.js` is unavailable, skip validation.

## Startup Step 3 - Select Project

If `$ARGUMENTS` names an existing `kaola-workflow/{project}/` directory, use
that project.

Otherwise list active workflow folders under `kaola-workflow/` that contain a
frozen `workflow-plan.md` or a `workflow-state.md` with `status: active`.
Skip `archive/`.

If no active project is selected and no target was named in Startup Step 0,
ask the user what to implement. New work starts with:

```text
/kaola-workflow-adapt <task description or issue>
```

## Co-active Folders

Distinct active folders run independently, each with its own `workflow-state.md` and branch/worktree
metadata. Do NOT merge, interleave, or batch commits across folders; the pre-commit guard blocks
staging multiple project folders together. If the same file appears in multiple active write sets,
stop and resolve the conflict.

## Resume Detection

Read `workflow-state.md` first; if valid (its `next_command` is `/kaola-workflow-plan-run`, pending
gates match the `Required Agent Compliance` table), use it as authoritative. Otherwise run the repair
helper (`node "$REPAIR_JS" "$ARGUMENTS"` when available), then reconstruct:

```text
finalization-summary.md exists -> workflow complete; show summary and stop
workflow-plan.md exists -> /kaola-workflow-plan-run {project}   (adaptive; a tampered/unparseable plan is a typed refusal, never a silent fallback)
no workflow-plan.md and no finalization-summary.md -> /kaola-workflow-adapt <task description or issue>
```

## State Bootstrap And Repair

When `workflow-state.md` is missing/stale/invalid but node evidence identifies exactly one safe next
command, write a conservative repaired state (`step: router-reconstructed`, `task: N/A` unless proven,
pending gates mirroring unresolved `Required Agent Compliance` rows,
`last_result: state_repaired_from_artifacts`) before routing. Do NOT fabricate state for brand-new
work, ambiguous/contradictory projects, or unresolved compliance gates. Phase commands own exact
intra-phase step detection.

## Required Output Before Routing

Print this before continuing or stopping:

```text
Workflow project: {project}
Current phase: {phase or unknown}
Current step: {step from workflow-state.md or reconstructed}
Pending gates: {list or none}
Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}
Workflow path: {adaptive}
Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}
Next command: {next_command}
```

When `claim: "none"` or a typed refusal occurred during startup, also print the
refusal diagnostics on the next line:

```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

If nested slash-command execution is supported in the current Claude Code
environment, continue by applying the matching command. Otherwise stop after
printing the next command.

## Completion Contract

Each `/workflow-next` run implements exactly one issue **or one explicitly selected
same-scope bundle**. After Finalization closes the issue (or every issue in the bundle)
and archives the active folder, the agent must stop and await explicit re-direction from
the user. Do not auto-route into the next issue in line.

A bundle closure is all-or-nothing: Finalization closes EVERY issue in `issue_numbers`,
removes every matching `.roadmap/issue-N.md` source, regenerates `ROADMAP.md` once,
archives one bundle folder, and then stops. To start additional work, the user must
invoke `/workflow-next` again.
