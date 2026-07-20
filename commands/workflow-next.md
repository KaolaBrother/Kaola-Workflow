---
description: Workflow Next. Thin router for Kaola-Workflow. Detects active work, reconstructs resume state, and routes to the correct phase command.
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
for _p in "./scripts/kaola-workflow-replan.js" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/kaola-workflow-replan.js}" "$HOME/.claude/kaola-workflow/scripts/kaola-workflow-replan.js"; do
  [ -f "$_p" ] && { REPLAN_SCRIPT="$_p"; break; }
done
[ -n "$REPLAN_SCRIPT" ] || { echo "BLOCKED: kaola-workflow-replan.js unavailable" >&2; exit 1; }
node "$REPLAN_SCRIPT" resume --project {project} --json
```

The installed aggregator is `kaola-workflow-replan.js`. Do not run mirror/open/record/close/run-chains,
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

`/workflow-next` is the thin router for the six phase commands. It owns
startup, Git/roadmap freshness, project selection, resume detection, and phase
routing. It does not perform phase work directly.

## Inputs

Use `$ARGUMENTS` as either:
- an existing workflow project name
- a GitHub issue number or free-form task description for new work
- empty, meaning detect or ask

## Router Rules

- Do not implement, review, fix, or finalize work in this router.
- Do not invoke phase agents from this router. (Exception — `issue-scout`: a pre-claim,
  read-only backlog survey dispatched in Step 0 when the user did not name an issue. It
  is not a phase agent — it claims nothing, writes nothing, and only recommends the next
  target/bundle — so dispatching it does not break the router's dispatch-free contract.)
- Do not cross a phase boundary while any `Required Agent Compliance` row is
  `pending`, missing, or lacks evidence/skip reason.
- Prefer `workflow-state.md` for exact resume position.
- If `workflow-state.md` is missing or stale, reconstruct conservatively from
  phase artifacts, `fast-summary.md`, and cache files.
- If exact intra-phase position is ambiguous, stop and ask the user instead of
  guessing.
- When a next phase is identified, either continue by following the matching
  phase command content if available in this session, or print the exact command
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
  (steps 1–4 below), byte-unchanged.
- **User did NOT name an issue** — the common "work on the next issue" / no-argument
  case → this is the **auto-bundle entry**. Resolve the path intent first (Step 0a-1),
  then dispatch the read-only **`issue-scout`** agent (Step 0c, *Auto-bundle entry*)
  and adopt its recommendation: set `KAOLA_TARGET_ISSUES` for a high-confidence
  same-scope bundle **when the resolved path is adaptive**, otherwise set
  `KAOLA_TARGET_ISSUE` to the scout's `primary_issue` (single-issue, or any
  medium/low-confidence outcome). STATE the selected set aloud, then continue to
  validation (step 3) and startup. (Dispatching the scout here is explicitly
  permitted — see Router Rules; it is a pre-claim read-only survey, not a phase agent.)

On the no-issue-named branch, **`issue-scout` is the SOLE backlog reader** — the
router does NOT re-scan the backlog. The scout already reads `ROADMAP.md`, the forge
issue list, active folders, and archived summaries (its *Backlog Inventory* / *What You
May Read*); the router only ADOPTS the scout's recommendation, then validates + claims
it. Do not duplicate the scan here.

1. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
   kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
   CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
2. If `$ARGUMENTS` names a specific issue number or project, use that as the explicit target.
3. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.
   - Online: `gh issue view "$KAOLA_TARGET_ISSUE" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.
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
and pass `--target-issues 42,47,53 --workflow-path adaptive` (project/branch `bundle-42-47-53`, sorted
+ deduplicated; the script validates the exact set, never reorders). The bundle lane is adaptive-only
(`workflow_path: adaptive`; a `fast`/`full` request is refused with `bundle_requires_adaptive`).
`--target-issue` keeps single-issue behavior; never set both (`target_ambiguity`).

### Auto-bundle entry

This is the **no-issue-named branch of Step 0**: whenever the user does not name
a specific issue — including the everyday "work on the next issue" entry — dispatch the
read-only **`issue-scout`** agent to inspect the backlog before claiming anything. The
scout is the SOLE backlog reader; it surveys the sources listed in its own *What You May
Read* (roadmap sources, remote open issues + dependency labels, active folders, archived
summaries) — the router does not re-list or re-scan them here.

It returns one recommended same-scope bundle **plus a `primary_issue` and a `confidence`**
(or no bundle). **The main orchestrator STATES the selected issue set aloud before calling
startup.** Scripts validate but never select or substitute issues.

issue-scout is read-only: it cannot claim issues, write repository files, author
`workflow-plan.md`, close issues, or dispatch other agents.

Dispatch it with `model="{ISSUE_SCOUT_MODEL}"` — the governed issue-scout tier.
The model above is resolved at install time; the router does not substitute it.

**Isolated control-plane dispatch.** Give issue-scout an isolated, self-contained control-plane brief;
never inherit the full main-session conversation. The native `Agent(...)` prompt must state the
repository root, the selected issue/issue-set request (including goal context when present), the
issue-scout profile/read-only contract, and the bounded durable return (the complete recommendation
JSON). Keep the established issue-scout identity/header convention and isolated prompt. Treat a
spawn argument-shape refusal as correctable arguments: retry the same issue-scout role and bounded
brief exactly once; never perform issue selection inline. Tool-unavailable fallback remains reserved
for genuinely unavailable agent tooling.

**Goal context (`KAOLA_GOAL`).** When set, pass it to the scout as a soft filter (it adds a
`goal_alignment` field, never excludes on mismatch); it also flows into `cmdFinalize` as
`goal_check: satisfied`. Export once before `/workflow-next`.

**Ordering — resolve the path BEFORE consuming a bundle:** the bundle lane is
adaptive-only, so resolve the path intent (Step 0a-1) *before* acting on
the scout's recommendation. A bundle is pursued ONLY when the resolved path is `adaptive`;
with an explicit `KAOLA_PATH=fast`/`full` the router takes only the scout's
`primary_issue` (a bundle there would be refused at startup with `bundle_requires_adaptive`).

**Output → env wiring:** map the scout's recommendation into the startup env exactly:
- high-confidence same-scope bundle AND resolved path is adaptive → set
  `KAOLA_TARGET_ISSUES` from `recommended_bundle.issues` (e.g. `KAOLA_TARGET_ISSUES=42,47,53`);
- otherwise (single-issue recommendation, `confidence: medium`/`low`, or non-adaptive path)
  → set `KAOLA_TARGET_ISSUE` to the scout's `primary_issue`.
- Never set both (`target_ambiguity`).

**Selection Evidence Docking.** On this no-issue-named branch, once the target project's active
folder exists — after claim completes (the Startup Transaction for `fast`/`full`, or the adaptive
front end's claim inside `/kaola-workflow-adapt`), before dispatching the executor — persist the
issue-scout's ENTIRE JSON reply verbatim, fenced, to
`kaola-workflow/{project}/.cache/selection-evidence.md`, prefixed with a one-line header
`selection_mode: auto-bundle` (bundle recommendation adopted) or `selection_mode: single-issue`
(the scout fell back to a single `primary_issue`). This durable selection evidence archives
automatically with the project when the run finalizes. Skip this step entirely on the
user-named-issue branch — a user-named claim legitimately has no selection evidence.

Auto-bundle emits a bundle only when all candidates are open + unclaimed, no dependency is unresolved
outside the set, they share a coherent scope signal, and the count is ≤ `KAOLA_BUNDLE_MAX_ISSUES`
(default 4). Otherwise the scout returns a single `primary_issue` → single-issue selection via
`KAOLA_TARGET_ISSUE`; do not manufacture a bundle.

### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
(all-or-nothing). There is one merge/PR sink per bundle. The finalization step
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

## Startup Step 0a — PR Intent Capture

Before the startup transaction, check the user's initial prompt for PR sink intent.
If it contains "open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr",
or "PR sink" (case-insensitive), export `KAOLA_SINK=pr` before the startup call.
The `${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates it.
Keyword matching is agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Adaptive is the unconditional default and only installable path: `export KAOLA_PATH=adaptive` and
proceed to Step 0a-2 (this makes Step 0b skip and the adaptive front end fire). Honor an already-set
non-adaptive `KAOLA_PATH` verbatim and hand it to the claim — its `path_not_installed` typed refusal
is the single authority (no silent fall to adaptive, no automatic fallback). State the chosen path:

```text
Path: adaptive (default)
```

## Startup Step 0a-2 — Adaptive front-end entry (path = adaptive only)

If `KAOLA_PATH=adaptive`, the **starting contract moves into the adaptive front end**: do NOT run
the Step 0b inline startup for this path. The `workflow-planner` subagent — dispatched by
`/kaola-workflow-adapt`, never by this router — runs the claim itself, so the router only selects +
validates the issue (Step 0), then hands off. This keeps the router free of *phase-agent* and
*claim* dispatch (Router Rules) — the only router-side dispatch is the pre-claim, read-only
`issue-scout` survey in Step 0 (no-issue-named branch), which claims and writes nothing — while the
Opus front end owns the claim + the DAG authoring:

1. **Resume wins — never re-author a frozen plan.** If an active folder already exists for the
   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-pr` once, then
   route to `/kaola-workflow-plan-run {project}` and stop — the same `workflow-plan.md exists ->
   /kaola-workflow-plan-run` rule as Resume Detection. The front end is for FRESH adaptive work only.
2. **Fresh adaptive.** Run `watch-pr` once for global PR-folder reconciliation, then route to
   `/kaola-workflow-adapt $KAOLA_TARGET_ISSUE`. The adapt command's `workflow-planner` runs
   `kaola-workflow-claim.js startup --workflow-path adaptive --target-issue $KAOLA_TARGET_ISSUE`
   (the claim + worktree + `workflow-state.md`); git-freshness (Startup Step 1) runs INSIDE adapt against MAIN **before** the planner claims
   (so a dirty/behind main never orphans a worktree); the roadmap check (Startup Step 2) runs in adapt too.
   Do NOT run Startup Step 0b / 1 / 2 in the router for this path.

   **Bundle:** when `KAOLA_TARGET_ISSUES` is set (multi-issue bundle), route to
   `/kaola-workflow-adapt` with the full issue set — the planner uses
   `--target-issues $KAOLA_TARGET_ISSUES` instead of `--target-issue N`. See
   "Startup Step 0c — Bundle Lane" above for selection, and the Bundle Lane section
   of `kaola-workflow-adapt.md` for the planner's claim contract.

Non-adaptive paths (`fast` | `full`) fall through to Step 0b unchanged.

## Startup Step 0b - Startup Transaction

**Skip this entire step when `KAOLA_PATH=adaptive`** — the adaptive front end (Step 0a-2) claims via
the `workflow-planner`, not here. Step 0b runs for the `fast` and `full` paths only.

For `fast`/`full` only, run `node "$CLAIM_JS" startup --runtime claude` with the agent-selected
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
A non-adaptive `KAOLA_PATH` (e.g. `fast`) is never silently recorded — startup refuses it
with the typed `path_not_installed` refusal.

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

If a GitHub remote and authenticated `gh` are available, fetch open issues:

```bash
gh issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

Ensure `kaola-workflow/ROADMAP.md` exists. If GitHub is unavailable, continue from the local
roadmap and say why sync was skipped.

Validate that `ROADMAP.md` is current with the per-issue source files:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
ROADMAP_JS="$(kaola_script kaola-workflow-roadmap.js)"
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" validate
```

If `validate` exits non-zero, print a warning and continue:

```text
WARNING: kaola-workflow/ROADMAP.md is stale. Per-issue files have changed since the last generate.
To refresh: node .../kaola-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m "chore: refresh ROADMAP.md"
Continuing with stale ROADMAP.md — roadmap state may not reflect current per-issue files.
```

Do NOT run `generate` automatically. Do NOT stage or commit `ROADMAP.md` in this step.
Commits stay phase-owned (Finalization Step 7). If `kaola-workflow-roadmap.js` is unavailable, skip validation.

## Startup Step 3 - Select Project

If `$ARGUMENTS` names an existing `kaola-workflow/{project}/` directory, use
that project.

Otherwise list active workflow folders under `kaola-workflow/` that contain at
least one `phase*.md` file, a `fast-summary.md` file, or a `workflow-state.md` with `status: active`.
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
workflow-plan.md exists -> /kaola-workflow-plan-run {project}   (adaptive; toggle-agnostic — a tampered/unparseable plan is a typed refusal, never a silent fallback)
no workflow-plan.md and no finalization-summary.md -> /kaola-workflow-adapt <task description or issue>
```

## State Bootstrap And Repair

When `workflow-state.md` is missing/stale/invalid but phase artifacts identify exactly one safe next
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
Workflow path: {adaptive — the only workflow path; a non-adaptive KAOLA_PATH is refused by the claim's path_not_installed}
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
