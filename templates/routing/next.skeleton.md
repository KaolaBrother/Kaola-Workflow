<!-- SLOT:nx-frontmatter -->

<!-- SLOT:nx-h1 -->

**First Principles.** When no shipped rule, gate, or refusal already settles a
situation, break the tie by the First Principles axioms (the `## First Principles`
block in your project's workflow-init CLAUDE.md), applied in priority order, and
record a one-line derivation in the node's `.cache` evidence — OPTIONAL, never
blocks a gate. An axiom may only make you stricter:
never cite one to skip a typed gate, refusal, or barrier.

<!-- REGION:command -->
`/workflow-next` is the thin router for the six phase commands. It owns
startup, Git/roadmap freshness, project selection, resume detection, and phase
routing. It does not perform phase work directly.

## Inputs

Use `$ARGUMENTS` as either:
- an existing workflow project name
<!-- SPLICE:nx-cmd-001 -->
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

Use `/goal` or equivalent prompt-based Stop-hook wording so the router and each
phase keep going until the active phase objective and completion audit pass.
Treat nonessential workflow bookkeeping as autonomous: generated project names,
collision suffixes like `-2`, cache paths, and harmless ordering choices.
Decide essential technical decisions with your own judgment, apply the chosen
answer, and record it under `.cache/` or the phase artifact.
Ask only for true external authorization or materially user-owned choices.

The `/goal` template must NOT use "next issue in line" or similar phrasing that
implies cross-issue continuation. Each run targets exactly one issue or one
explicitly selected same-scope bundle; auto-routing to an unselected issue after
closure is still forbidden.

**Finishing an issue INCLUDES capturing its run-discovered defects.** A run that
surfaces a defect — a reviewer finding deferred to follow-up, an in-run
repair/reopen, a deferred or waived chain, a flake — is not "done" until each
such gap is either FILED as a follow-up issue (recorded `filed: #N` in
`finalization-summary.md`'s `## Run gaps` section) or explicitly justified as
`noise: <reason>`. Filing the follow-up SATISFIES the goal; silently deferring a
known defect without filing or justifying it VIOLATES the goal, and the
`gaps_unswept` finalize gate will refuse. "Loop until criteria pass" includes
<!-- SPLICE:nx-cmd-002 -->

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
<!-- SPLICE:nx-cmd-003 -->
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
2. If `$ARGUMENTS` names a specific issue number or project, use that as the explicit target.
<!-- SPLICE:nx-cmd-004 -->
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

When the user names several issues together (e.g., "finish issues #N #N #N
together"), route through the bundle lane:

- Set `KAOLA_TARGET_ISSUES=42,47,53` (comma-separated, no spaces) before calling startup.
- The startup script validates the exact set — it does NOT substitute or reorder issues.
- Project name and active folder: `bundle-42-47-53` (sorted ascending, deduplicated).
- Branch: `workflow/bundle-42-47-53`.
- Bundle lane is **adaptive-path only** (`workflow_path: adaptive` is required). A
  bundle request with an explicit `KAOLA_PATH=fast`/`full` is refused with
  `bundle_requires_adaptive`; do not silently downgrade to a single issue.
- In the startup call, pass `--target-issues 42,47,53` (instead of `--target-issue N`)
  and `--workflow-path adaptive`.

Compatibility rule: `KAOLA_TARGET_ISSUE` / `--target-issue` keep current one-issue
behavior UNCHANGED. `KAOLA_TARGET_ISSUES` / `--target-issues` are the ONLY
multi-issue startup path. If BOTH are set, the script refuses with
`target_ambiguity`; never set both.

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

<!-- REGION:github -->
**Goal context (`KAOLA_GOAL`).** If `KAOLA_GOAL` is set, pass the value to the
issue-scout in the dispatch prompt. The scout treats it as a soft filter — it
prefers bundles whose scope, area labels, and expected write areas align with the
goal, but never excludes issues solely on goal mismatch (target-set integrity rules
apply independently). When a goal is provided the scout includes a `goal_alignment`
field in its output (`aligned: true|false` plus a one-line `reason`); when no goal
is provided the field is omitted and the output is backward-compatible.

`KAOLA_GOAL` also flows into `cmdFinalize`: it produces `goal_check: satisfied` in
the closure receipt (see `commands/kaola-workflow-finalize.md` § Goal Attestation).
Export it once before `/workflow-next` and it propagates to both touchpoints.

<!-- /REGION -->
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

Auto-bundle mode emits a bundle only when:
- all candidate issues are open and unclaimed;
- no dependency is unresolved outside the bundle;
- the issues share a coherent scope signal (same subsystem, same label, same
  failing area, or an explicit dependency relation);
- issue count is at or below `KAOLA_BUNDLE_MAX_ISSUES` (default 4).

**Fallback rule:** when no high-confidence same-scope bundle exists, the scout
returns a single `primary_issue` (or `confidence: low`) → fall back to single-issue
selection via `KAOLA_TARGET_ISSUE`. Do not manufacture a bundle.

### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
<!-- SPLICE:nx-cmd-005 -->
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

<!-- SPLICE:nx-cmd-006 -->

<!-- SPLICE:nx-cmd-007 -->
The `${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates it.
Keyword matching is agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Before Step 0b, pick the workflow path. The agent owns this judgment; scripts do
not auto-pick. Adaptive is the unconditional default — it just runs. `fast` and
`full` fire ONLY on an explicit path-name keyword or an explicit `KAOLA_PATH`;
nothing to resolve and nothing to deliberate.

1. **Explicit `KAOLA_PATH`.** If already exported, honor it verbatim: `adaptive`
   always; for `fast` | `full`, simply EXPORT the named value and hand it to the
   claim — do NOT re-derive a rubric and do NOT check whether the path is
   installed. The claim's `path_not_installed` typed refusal is the single
   authority: if the named path isn't installed the run surfaces that refusal (a
   hard stop), it does NOT silently fall to adaptive.
2. **Explicit path-name verbal escapes** (case-insensitive) — the ONLY keyword
   escapes:
   - "fast path" / "fast mode" → `export KAOLA_PATH=fast`
   - "full path" / "full mode" / "full review" / "all phases" → `export KAOLA_PATH=full`
   Just export the named path and hand it to the claim (same as point 1 — no
   install check here either; the claim's `path_not_installed` refusal is the
   authority). Task descriptors ("typo", "one-line", "trivial", "quick fix",
   "rename", "small change", "thorough", "carefully", "deep dive") are NOT
   path-name escapes; they hit the default → adaptive (the planner sizes the task).
3. **Default → adaptive.** No matching path-name keyword and no explicit
   `KAOLA_PATH` → `export KAOLA_PATH=adaptive` and proceed to Step 0a-2. The
   export is the action (it makes Step 0b skip and the adaptive front end fire).
   Adaptive just runs. There is NO automatic fallback to fast/full — when
   adaptive cannot proceed the only recourse is inside adaptive (bounded planner
   repair → discard+restart a fresh adaptive run → stop+ask), per
<!-- SPLICE:nx-cmd-008 -->

State the chosen path and one-line reason aloud before Step 0b:

```text
Path: adaptive (default)
Path: fast (explicit "fast path" escape)
Path: full (explicit "full review" escape)
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
<!-- SPLICE:nx-cmd-009 -->
   route to `/kaola-workflow-plan-run {project}` and stop — the same `workflow-plan.md exists ->
   /kaola-workflow-plan-run` rule as Resume Detection. The front end is for FRESH adaptive work only.
<!-- SPLICE:nx-cmd-010 -->
   `/kaola-workflow-adapt $KAOLA_TARGET_ISSUE`. The adapt command's `workflow-planner` runs
<!-- SPLICE:nx-cmd-011 -->
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

<!-- SPLICE:nx-cmd-012 -->
run the startup transaction with the agent-selected target. The startup script
<!-- SPLICE:nx-cmd-013 -->
atomically creates `kaola-workflow/{project}/workflow-state.md`.

```bash
<!-- SPLICE:nx-cmd-014 -->
if [ -f "$CLAIM_JS" ]; then
<!-- SPLICE:nx-cmd-015 -->
  KAOLA_SINK_FLAG=""
  [ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"
  KAOLA_TARGET_FLAG=""
  [ -n "${KAOLA_TARGET_ISSUE:-}" ] && KAOLA_TARGET_FLAG="--target-issue $KAOLA_TARGET_ISSUE"
  STARTUP_OUT=$(node "$CLAIM_JS" startup \
    --runtime claude \
    $KAOLA_SINK_FLAG \
    $KAOLA_TARGET_FLAG 2>/dev/null) || true
  KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  [ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
else
  echo "BLOCKED: kaola-workflow startup unavailable; cannot select issue-backed work." >&2
  exit 1
fi
```

If `STARTUP_OUT` is JSON, a verdict of `owned` routes the single active folder
and a verdict of `acquired` routes the newly created folder. If startup returns
`verdict: no_target`, the agent must select a target issue per Step 0 and re-run.
If startup returns `claim: "none"`, normal routing must stop; do not adopt
unrelated active folders unless the user explicitly names that project. Before
stopping, print the refusal diagnostics:

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
<!-- SPLICE:nx-cmd-016 -->
before selecting new work.
If `KAOLA_PATH=fast` is set, startup records `workflow_path: fast`.

## Startup Step 1 - Git Freshness

Before selecting work, classify local/remote state:

```bash
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git fetch --prune
git status --short --branch
git rev-list --left-right --count @{u}...HEAD
```

Continue when:
- local/upstream are synchronized
- local is ahead only
- no remote/upstream exists
- Git is unavailable and the user accepts local-only context

If local is behind only and the worktree is clean, run `git pull --ff-only`,
then re-check. Stop and ask before any merge, rebase, stash, reset, conflict
resolution, or dirty-worktree sync.

### Git Freshness Block Recovery

If startup succeeds (folder claimed, worktree provisioned) but the subsequent Git freshness check in Startup Step 1 blocks (local is behind remote, dirty worktree, or merge/rebase required), run:

```bash
git fetch --prune
git pull --ff-only
git status --short --branch
```

If the freshness check now passes, continue to Startup Step 2. If the block persists (merge/rebase required, dirty worktree), release the claimed folder before stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

Stop and ask the user to resolve the Git state manually before retrying `/workflow-next`. Do not proceed to Startup Step 2 or adopt any active folder after this release.

## Startup Step 2 - Roadmap

<!-- SPLICE:nx-cmd-017 -->

```bash
<!-- SPLICE:nx-cmd-018 -->
```

<!-- SPLICE:nx-cmd-019 -->
roadmap and say why sync was skipped.

Validate that `ROADMAP.md` is current with the per-issue source files:

```bash
<!-- SPLICE:nx-cmd-020 -->
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" validate
```

If `validate` exits non-zero, print a warning and continue:

```text
WARNING: kaola-workflow/ROADMAP.md is stale. Per-issue files have changed since the last generate.
<!-- SPLICE:nx-cmd-021 -->
Continuing with stale ROADMAP.md — roadmap state may not reflect current per-issue files.
```

Do NOT run `generate` automatically. Do NOT stage or commit `ROADMAP.md` in this step.
<!-- SPLICE:nx-cmd-022 -->

## Startup Step 3 - Select Project

If `$ARGUMENTS` names an existing `kaola-workflow/{project}/` directory, use
that project.

Otherwise list active workflow folders under `kaola-workflow/` that contain at
least one `phase*.md` file, a `fast-summary.md` file, or a `workflow-state.md` with `status: active`.
Skip `archive/`.

If no active project is selected and no target was named in Startup Step 0,
ask the user what to implement. New work starts with:

```text
/kaola-workflow-phase1 <task description or issue>
```

### Co-active Folders Advisory

<!-- SPLICE:nx-cmd-023 -->

**Important**: Do NOT merge, interleave, or batch commits from different active folders. Each folder must complete its own Phase 4 → Finalization sequence independently. If the same file appears in multiple active write sets, stop and resolve the conflict before continuing — do not proceed with overlapping modifications.

## Co-active Folders

Parallel work is represented by distinct active folders. `issue-63` and
`issue-65` can both be active when each has its own
`kaola-workflow/{project}/workflow-state.md` and branch/worktree metadata.
The pre-commit guard blocks only commits that stage multiple workflow project
folders together.

## Resume Detection

Read `kaola-workflow/{project}/workflow-state.md` first if it exists.

Validate the state file:
- `current_phase` agrees with the highest completed phase artifact
- `next_command` is one of the six phase commands
- pending gates match the latest `Required Agent Compliance` table
- referenced `phase_file` and `cache_file` paths exist when present

If valid, use it as authoritative.

Before manual reconstruction, run the state repair helper if available, then
read `workflow-state.md` again:

```bash
<!-- SPLICE:nx-cmd-024 -->
[ -f "$REPAIR_JS" ] && node "$REPAIR_JS" "$ARGUMENTS"
```

If the helper writes or validates `workflow-state.md`, route from that state.

If missing or invalid, reconstruct:

```text
finalization-summary.md exists -> workflow complete; show summary and stop
workflow-plan.md exists -> /kaola-workflow-plan-run {project}   (adaptive; ahead of the phaseN ladder, toggle-agnostic — a tampered/unparseable plan is a typed refusal, never a phaseN fallback)
phase5-review.md exists -> /kaola-workflow-finalize {project}
fast-summary.md status ESCALATED -> /kaola-workflow-phase1 {project}
fast-summary.md exists -> /kaola-workflow-fast {project}
phase4-progress.md exists:
  tasks pending/in_progress -> /kaola-workflow-phase4 {project}
  all tasks complete -> /kaola-workflow-phase5 {project}
phase3-plan.md exists -> /kaola-workflow-phase4 {project}
phase2-ideation.md exists -> /kaola-workflow-phase3 {project}
phase1-research.md exists -> /kaola-workflow-phase2 {project}
no phase file -> /kaola-workflow-phase1 <task>
```

## State Bootstrap And Repair

If `workflow-state.md` is valid, use it as authoritative.

If `workflow-state.md` is missing, stale, or invalid, and reconstruction from
phase artifacts or `fast-summary.md` identifies exactly one safe next command, write repaired `workflow-state.md`
before routing.

The repaired state must be conservative:
- `phase`, `phase_name`, and `next_command` match the reconstructed route
- `step: router-reconstructed`
- `task: N/A` unless the phase artifact proves a specific task
- pending gates mirror unresolved `Required Agent Compliance` rows
- `phase_file` points to the artifact used for reconstruction
- `last_result: state_repaired_from_artifacts`

Phase commands must refine `step`, `task`, pending gates, and evidence before
doing phase work.

Do not create `workflow-state.md` for brand-new work, no selected project, no
phase artifacts, multiple ambiguous active projects, contradictory phase files,
or unresolved compliance gates that make the next command unsafe.

Phase commands own exact intra-phase step detection. The router must not infer
more detail than the phase artifacts prove.

## Required Output Before Routing

Print this before continuing or stopping:

```text
Workflow project: {project}
Current phase: {phase or unknown}
Current step: {step from workflow-state.md or reconstructed}
Pending gates: {list or none}
Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}
Workflow path: {adaptive by default; fast|full only on an explicit path-name keyword or KAOLA_PATH — from KAOLA_PATH or Step 0a-1 judgment}
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
<!-- /REGION -->
<!-- REGION:skill -->
This is the thin router. It owns startup checks, roadmap freshness, active project selection, state repair, and phase routing. It does not perform phase work directly unless it routes into the next skill.

## Goal Contract

Continue until the selected workflow phase objective is satisfied, evidence is
recorded, and `workflow-state.md` points to the correct `next_skill`. Do not
stop after routine substeps. Stop only for true external authorization,
destructive or risky Git operations, materially user-owned choices, or ambiguity
that blocks correctness.

## Autonomy Policy

Treat nonessential workflow bookkeeping as autonomous: generated project names,
collision suffixes such as `-2`, cache/artifact paths, and harmless ordering
choices are selected automatically and recorded. For essential technical
decisions, consult the strongest available expert model/profile for the session,
apply the chosen answer directly, and record it under `.cache/` or the phase
artifact.

## Run-Gap Capture (Goal Completion Rule)

**Finishing an issue INCLUDES capturing its run-discovered defects.** A run that
surfaces a defect — a reviewer finding deferred to follow-up, an in-run
repair/reopen, a deferred or waived chain, a flake — is not "done" until each
such gap is either FILED as a follow-up issue (recorded `filed: #N` in
`finalization-summary.md`'s `## Run gaps` section) or explicitly justified as
`noise: <reason>`. Filing the follow-up SATISFIES the goal; silently deferring a
known defect without filing or justifying it VIOLATES the goal, and the
`gaps_unswept` finalize gate will refuse. "Loop until criteria pass" includes
<!-- SPLICE:nx-sk-001 -->

## Delegation Contract

Codex subagent delegation is the default. The session delegation policy defaults to `delegate` and is established without prompting the user; the workflow complies with its delegated-role contract automatically rather than asking the user to choose.

**Skip this step if `delegation_policy:` is already set in `workflow-state.md`.**

The default `delegation_policy` is `delegate`: invoke the Codex subagent roles (code-explorer, planner, code-architect, tdd-guide, code-reviewer, security-reviewer, doc-updater) for delegated work and record `subagent-invoked` in each compliance ledger. Do not ask the user to choose a delegation policy.

Tool availability is auto-detected, not a user choice. Before phase work, check whether the Codex role profiles are installed at EITHER the project-local `.codex/agents/kaola-workflow/` path OR the global `~/.codex/agents/kaola-workflow/` path (the `--global` install target) — a global install satisfies delegation exactly as a project-local one does; probe local first, then global. If NEITHER directory has `*.toml` role profiles the subagent tooling is unavailable: keep `delegation_policy: delegate` and, for each Codex role row, record `local-fallback-tool-unavailable` with a non-empty Evidence value naming the absent path(s) (for example `.codex/agents/kaola-workflow/ absent`, or `~/.codex/agents/kaola-workflow/ absent` when only the global path was probed). An empty Evidence cell fails the repair-state cross-check, so always write the evidence. Never present tool-unavailability as a question.

Set `delegation_policy: local-authorized` (recording `local-fallback-explicit` in each Codex role row) only when the user explicitly asks to disable delegation or authorizes an inline local fallback. Do not select `local-authorized` on your own initiative.

**Write order** — three steps, in sequence:

1. Set `KAOLA_DELEGATION_POLICY=delegate` without asking; use `local-authorized` only on the user's explicit request to disable delegation.
2. Call the startup script (this creates `workflow-state.md`).
3. After startup succeeds and `workflow-state.md` exists, patch the delegation policy into the file:

```bash
printf '\ndelegation_policy: %s\n' "$KAOLA_DELEGATION_POLICY" >> "kaola-workflow/${KAOLA_PROJECT}/workflow-state.md"
```

Where `KAOLA_DELEGATION_POLICY` is `delegate` by default and `local-authorized` only on the user's explicit request to disable delegation. `tool-unavailable` remains a valid `delegation_policy:` value for legacy state, but new runs detect tool absence as per-row `local-fallback-tool-unavailable` evidence under `delegate` rather than choosing it at startup.

Do not re-ask during the session. Re-establish the default only if `workflow-state.md` is absent.

## Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

**Branch first on whether the user named an issue:**

- **User named a specific issue** — `$ARGUMENTS` carries an issue number/project, or
  the prompt names one → use the single-issue selection (steps below), byte-unchanged.
- **User did NOT name an issue** — the common "work on the next issue" / no-argument
  case → this is the **auto-bundle entry**. Resolve the path intent first
  (Startup Step 0a-1), then dispatch the read-only **`issue-scout`** agent role
  (*Auto-bundle entry* below) and adopt its recommendation: set `KAOLA_TARGET_ISSUES`
  for a high-confidence same-scope bundle **when the resolved path is adaptive**,
  otherwise set `KAOLA_TARGET_ISSUE` to the scout's `primary_issue`. STATE the selected
  set aloud, then continue to validation and startup. (Dispatching the read-only scout
  here is permitted — it is a pre-claim survey, not a phase agent role.)

On the no-issue-named branch, **`issue-scout` is the SOLE backlog reader** — the
router does NOT re-scan the backlog. The scout already reads `ROADMAP.md`, the forge
issue list, active folders, and archived summaries (its *Backlog Inventory* / *What You
May Read*); the router only ADOPTS the scout's recommendation, then validates + claims
it. Do not duplicate the scan here.

1. If exactly one active folder is already present, read its issue number from `node "$claim_script" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
<!-- SPLICE:nx-sk-002 -->
   if [ ! -f "$claim_script" ]; then
<!-- SPLICE:nx-sk-003 -->
   fi
   STATUS_OUT="$(node "$claim_script" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
<!-- SPLICE:nx-sk-004 -->
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
3. State the selected issue number before calling startup.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Agent Issue Selection — Bundle Lane (Multi-Issue)

The bundle lane is additive: `KAOLA_TARGET_ISSUE` / `--target-issue N` single-issue
behavior is unchanged. Use the bundle lane only when the user explicitly names
several issues or when auto-bundle mode identifies a high-confidence same-scope set
(see below).

### Explicit-bundle entry

When the user names several issues together (e.g., "finish issues #N #N #N
together"), route through the bundle lane:

- Set `KAOLA_TARGET_ISSUES=42,47,53` (comma-separated, no spaces) before calling startup.
- The startup script validates the exact set — it does NOT substitute or reorder issues.
- Project name and active folder: `bundle-42-47-53` (sorted ascending, deduplicated).
- Branch: `workflow/bundle-42-47-53`.
- Bundle lane is **adaptive-path only** (`workflow_path: adaptive` is required). A
  bundle request with an explicit `KAOLA_PATH=fast`/`full` is refused with
  `bundle_requires_adaptive`; do not silently downgrade to a single issue.
- In the startup call, pass `--target-issues 42,47,53` (instead of `--target-issue N`)
  and `--workflow-path adaptive`.

Compatibility rule: `KAOLA_TARGET_ISSUE` / `--target-issue` keep current one-issue
behavior UNCHANGED. `KAOLA_TARGET_ISSUES` / `--target-issues` are the ONLY
multi-issue startup path. If BOTH are set, the script refuses with
`target_ambiguity`; never set both.

### Auto-bundle entry

This is the **no-issue-named branch of Agent Issue Selection**: whenever the user
does not name a specific issue — including the everyday "work on the next issue" entry —
dispatch the read-only **`issue-scout`** agent role to inspect the backlog before
claiming anything. The scout is the SOLE backlog reader; it surveys the sources listed in
its own *What You May Read* (roadmap sources, remote open issues + dependency labels,
active folders, archived summaries) — the router does not re-list or re-scan them here.

It returns one recommended same-scope bundle **plus a `primary_issue` and a `confidence`**
(or no bundle). **The main orchestrator STATES the selected issue set aloud before calling
startup.** Scripts validate but never select or substitute issues.

issue-scout is read-only: it cannot claim issues, write repository files, author
`workflow-plan.md`, close issues, or dispatch other agents.

On Codex v2, use the direct `agents.spawn_agent` tool for issue-scout; never use the server-reserved
`collaboration.spawn_agent` name and never dispatch through `functions.exec` or Code Mode. If preflight reports
`codex_v2_encrypted_transport_unsafe` or `codex_v2_role_transport_unsafe`, refuse before the scout
spawn. Do not retry an encrypted-output decode or reserved-schema failure and do not fall back to a
default role: the same transport/schema mismatch will fail deterministically again.

**Ordering — resolve the path BEFORE consuming a bundle:** the bundle lane is
adaptive-only, so resolve the path intent (Startup Step 0a-1) *before*
acting on the scout's recommendation. Pursue a bundle ONLY when the resolved path is
`adaptive`; with an explicit `KAOLA_PATH=fast`/`full` take only the scout's
`primary_issue` (a bundle there is refused at startup with `bundle_requires_adaptive`).

**Output → env wiring:** map the scout's recommendation into the startup env exactly:
- high-confidence same-scope bundle AND resolved path adaptive → set `KAOLA_TARGET_ISSUES`
  from `recommended_bundle.issues` (e.g. `KAOLA_TARGET_ISSUES=42,47,53`);
- otherwise (single-issue recommendation, `confidence: medium`/`low`, or non-adaptive path)
  → set `KAOLA_TARGET_ISSUE` to the scout's `primary_issue`. Never set both (`target_ambiguity`).

Auto-bundle mode emits a bundle only when:
- all candidate issues are open and unclaimed;
- no dependency is unresolved outside the bundle;
- the issues share a coherent scope signal (same subsystem, same label, same
  failing area, or an explicit dependency relation);
- issue count is at or below `KAOLA_BUNDLE_MAX_ISSUES` (default 4).

**Fallback rule:** when no high-confidence same-scope bundle exists, the scout
returns a single `primary_issue` (or `confidence: low`) → fall back to single-issue
selection via `KAOLA_TARGET_ISSUE`. Do not manufacture a bundle.

### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
<!-- SPLICE:nx-sk-005 -->
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

<!-- SPLICE:nx-sk-006 -->

<!-- SPLICE:nx-sk-007 -->

If the prompt contains any of the following (case-insensitive):
<!-- SPLICE:nx-sk-008 -->

<!-- SPLICE:nx-sk-009 -->
`${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates
this value without modification.

Do not set `KAOLA_SINK` if none of the keywords match. Keyword matching is
agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Before the Startup transaction, pick the workflow path. The agent owns this judgment;
scripts do not auto-pick. Adaptive is the unconditional default — it just runs. `fast`
and `full` fire ONLY on an explicit path-name keyword or an explicit `KAOLA_PATH`;
nothing to resolve and nothing to deliberate.

1. **Explicit `KAOLA_PATH`.** If already exported, honor it verbatim: `adaptive`
   always; for `fast` | `full`, simply EXPORT the named value and hand it to the claim —
   do NOT re-derive a rubric and do NOT check whether the path is installed. The claim's
   `path_not_installed` typed refusal is the single authority: if the named path isn't
   installed the run surfaces that refusal (a hard stop), it does NOT silently fall to
   adaptive.
2. **Explicit path-name verbal escapes** (case-insensitive) — the ONLY keyword escapes:
   - "fast path" / "fast mode" → `export KAOLA_PATH=fast`
   - "full path" / "full mode" / "full review" / "all phases" → `export KAOLA_PATH=full`
   Just export the named path and hand it to the claim (same as point 1 — no install
   check here either; the claim's `path_not_installed` refusal is the authority). Task
   descriptors ("typo", "one-line", "trivial", "quick fix", "rename", "small change",
   "thorough", "carefully", "deep dive") are NOT path-name escapes; they hit the default
   → adaptive (the planner sizes the task).
3. **Default → adaptive.** No matching path-name keyword and no explicit `KAOLA_PATH` →
   `export KAOLA_PATH=adaptive` and proceed to the Adaptive front-end entry section. The
   export is the action (it makes the Startup transaction skip and the adaptive front end
   fire). Adaptive just runs. There is NO automatic fallback to fast/full — when adaptive
   cannot proceed the only recourse is inside adaptive (bounded planner repair →
   discard+restart a fresh adaptive run → stop+ask), per the `kaola-workflow-adapt` skill.

State the chosen path and one-line reason aloud before the Startup transaction:

```text
Path: adaptive (default)
Path: fast (explicit "fast path" escape)
Path: full (explicit "full review" escape)
```

<!-- REGION:gitlab -->
Bias toward full when in doubt. Fast false positives escalate cleanly via the
Fast Eligibility and Mid-Flight Escalation sections of `plugins/kaola-workflow-gitlab/commands/kaola-workflow-fast.md`; false
negatives only cost ceremony.

<!-- /REGION -->
<!-- REGION:gitea -->
Bias toward full when in doubt. Fast false positives escalate cleanly via the
Fast Eligibility and Mid-Flight Escalation sections of `plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md`; false
negatives only cost ceremony.

<!-- /REGION -->
## Startup — Adaptive front-end entry (path = adaptive only)

If `KAOLA_PATH=adaptive`, the **starting contract moves into the adaptive front end**: do NOT run
the Startup transaction below for this path. The `workflow-planner` agent role — delegated by
`kaola-workflow-adapt`, never by this router — runs the claim itself, so the router only selects +
validates the issue, then hands off (keeping the router free of phase-agent and claim dispatch — the
only router-side dispatch is the pre-claim, read-only `issue-scout` survey in the no-issue-named
branch, which claims and writes nothing):

1. **Resume wins — never re-author a frozen plan.** If an active folder already exists for the
<!-- SPLICE:nx-sk-010 -->
   route to `kaola-workflow-plan-run {project}` and stop (the same `workflow-plan.md exists ->
   kaola-workflow-plan-run` rule as resume reconstruction). The front end is for FRESH adaptive
   work only.
<!-- SPLICE:nx-sk-011 -->
   adaptive --target-issue $KAOLA_TARGET_ISSUE` (the claim + worktree + `workflow-state.md`);
   git-freshness runs inside adapt against MAIN **before** the planner claims (so a dirty/behind main
   never orphans a worktree); the roadmap check runs in adapt too. Do NOT run
   the Startup transaction / git-freshness / roadmap steps in the router for this path.

   **Bundle:** when `KAOLA_TARGET_ISSUES` is set (multi-issue bundle), route to
   `kaola-workflow-adapt` with the full issue set — the planner uses
   `--target-issues $KAOLA_TARGET_ISSUES` instead of `--target-issue N`. See
<!-- SPLICE:nx-sk-012 -->

Non-adaptive paths (`fast` | `full`) fall through to the Startup transaction unchanged.

## Codex Dispatch Mode Detection

Before the Startup transaction, detect the Codex spawn-tooling shape so the claim can persist
it for later dispatch cards. Reuse the preflight doctor (the same script the Delegation
Contract's tool-availability check above already relies on) rather than re-deriving the config
parse:

```bash
<!-- SPLICE:nx-sk-013 -->
if [ ! -f "$preflight_script" ]; then
<!-- SPLICE:nx-sk-014 -->
fi
KAOLA_CODEX_DISPATCH_MODE=""
if [ -f "$preflight_script" ]; then
  DOCTOR_OUT="$(node "$preflight_script" --doctor --project-root "$PWD" --json 2>/dev/null)" || true
  KAOLA_CODEX_DISPATCH_MODE="$(node -e "try{const j=JSON.parse(process.argv[1]);const byScope=(j.scopes||[]).reduce((m,s)=>{m[s.scope]=s;return m;},{});const s=(byScope.project&&byScope.project.exists)?byScope.project:byScope.user;process.stdout.write(s&&s.dispatch_mode&&s.dispatch_mode!=='n/a'?s.dispatch_mode:'')}catch(e){}" "$DOCTOR_OUT" 2>/dev/null)" || true
fi
```

An absent or failed detection leaves `KAOLA_CODEX_DISPATCH_MODE` empty — the Startup call below
omits `--codex-dispatch-mode` and the claim keeps its fail-closed `v1-thread-id` default. Never
fabricate a mode; only pass a value the doctor actually reported.

## Startup

**Skip this transaction when `KAOLA_PATH=adaptive`** — the adaptive front end (above) claims via the
`workflow-planner`, not here. It runs for the `fast` and `full` paths only.

Run the startup transaction with the agent-selected target. Startup validates
<!-- SPLICE:nx-sk-015 -->
creates or reuses `kaola-workflow/{project}/workflow-state.md`.

```bash
<!-- SPLICE:nx-sk-016 -->
if [ ! -f "$claim_script" ]; then
<!-- SPLICE:nx-sk-017 -->
fi

if [ -f "$claim_script" ]; then
<!-- SPLICE:nx-sk-018 -->
  KAOLA_SINK_FLAG=""
  [ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"
  KAOLA_TARGET_FLAG=""
  [ -n "${KAOLA_TARGET_ISSUE:-}" ] && KAOLA_TARGET_FLAG="--target-issue $KAOLA_TARGET_ISSUE"
  KAOLA_DISPATCH_MODE_FLAG=""
  [ -n "${KAOLA_CODEX_DISPATCH_MODE:-}" ] && KAOLA_DISPATCH_MODE_FLAG="--codex-dispatch-mode $KAOLA_CODEX_DISPATCH_MODE"
  STARTUP_OUT=$(node "$claim_script" startup \
    --runtime codex \
    $KAOLA_SINK_FLAG \
    $KAOLA_TARGET_FLAG \
    $KAOLA_DISPATCH_MODE_FLAG 2>/dev/null) || true
  KAOLA_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_REASONING="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).reasoning||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  [ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
else
  echo "BLOCKED: kaola-workflow startup unavailable; cannot select issue-backed work." >&2
  exit 1
fi
```

If `STARTUP_OUT` has `verdict: "owned"`, route that project. If startup returns
`verdict: no_target`, the agent must select a target and re-run. <!-- PIN: claim-escalate -->
If startup returns a typed refusal, read the `reasoning` field and classify by `result`:
- `result: refuse` (`target_occupied`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`): **HARD STOP** — the determinate RED is final; do
  not blind-proceed to a different issue without explicit user direction.
- `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
<!-- SPLICE:nx-sk-019 -->

<!-- REGION:gitlab -->
Before stopping, print the refusal diagnostics:

<!-- /REGION -->
<!-- REGION:gitea -->
Before stopping, print the refusal diagnostics:

<!-- /REGION -->
```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

<!-- REGION:github -->
Do not inspect active project folders unless the user explicitly names the
project to resume.

### Git Freshness Block Recovery

If startup succeeds (folder claimed, worktree provisioned) but the subsequent Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), run:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

This releases the just-claimed folder and removes the worktree before stopping. Do not leave a claimed folder orphaned when the startup sequence cannot complete.

### Co-active Folders Advisory

If a second active folder already exists from a prior session, the two folders have disjoint write sets by design. Do not merge, interleave, or batch their commits. Each folder follows its own Phase 4 → Finalization sequence independently. If the same file appears in both write sets, stop and resolve the conflict before continuing.

<!-- /REGION -->
<!-- REGION:gitea -->
If the startup script is unavailable, stop for repair.
If startup returns `claim: "none"`, stop normal routing. Do not inspect active
project folders unless the user explicitly names the project to resume.

<!-- /REGION -->
Classify local and remote Git state:

```bash
git rev-parse --is-inside-work-tree
git status --short --branch
git remote -v
git rev-parse --abbrev-ref --symbolic-full-name @{u}
git fetch --prune
git status --short --branch
git rev-list --left-right --count @{u}...HEAD
```

Fast-forward only when clean and behind-only. Stop before merge, rebase, stash, reset, conflict resolution, or dirty-worktree sync.

<!-- SPLICE:nx-sk-020 -->

<!-- REGION:gitlab -->
If startup succeeds (folder claimed, worktree provisioned) but the Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), attempt fast-forward:

<!-- /REGION -->
<!-- REGION:gitea -->
If startup succeeds (folder claimed, worktree provisioned) but the Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), attempt fast-forward:

<!-- /REGION -->
```bash
<!-- SPLICE:nx-sk-021 -->
```

<!-- REGION:gitlab -->
If the block passes, continue to routing. If the block persists (merge/rebase required, dirty worktree), release the claimed folder before stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

Stop and ask the user to resolve the Git state manually before retrying `/workflow-next`. Do not proceed to routing or adopt any active folder after this release.

### Co-active Folders Advisory

If multiple active folders exist from prior sessions (e.g., `issue-63` and `issue-65` in different states), they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together.

**Important**: Do NOT merge, interleave, or batch commits from different active folders. Each folder must complete its own Phase 4 → Finalization sequence independently. If the same file appears in multiple active write sets, stop and resolve the conflict before continuing — do not proceed with overlapping modifications.

If GitLab is available, refresh open issues:

```bash
glab issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

<!-- /REGION -->
<!-- REGION:gitea -->
If the block passes, continue to routing. If the block persists (merge/rebase required, dirty worktree), release the claimed folder before stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

Stop and ask the user to resolve the Git state manually before retrying `/workflow-next`. Do not proceed to routing or adopt any active folder after this release.

### Co-active Folders Advisory

If multiple active folders exist from prior sessions (e.g., `issue-63` and `issue-65` in different states), they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together.

**Important**: Do NOT merge, interleave, or batch commits from different active folders. Each folder must complete its own Phase 4 → Finalization sequence independently. If the same file appears in multiple active write sets, stop and resolve the conflict before continuing — do not proceed with overlapping modifications.

If Gitea is available, refresh open issues:

```bash
tea issues list --limit 100 --output json
```

<!-- /REGION -->
Keep `kaola-workflow/ROADMAP.md` as a compact mirror of active unfinished work.

## Routing

Read `kaola-workflow/{project}/workflow-state.md` first. If missing or stale, run:

On resume, extract and reassign `delegation_policy:` alongside `phase` and `next_skill`;
if it is absent, default `delegation_policy` to `delegate` without prompting and continue.

```bash
<!-- SPLICE:nx-sk-022 -->
if [ ! -f "$repair_script" ]; then
<!-- SPLICE:nx-sk-023 -->
fi
test -f "$repair_script"
node "$repair_script" {project-or-empty}
```

Use the repaired state only when it identifies exactly one safe `next_skill`.
Treat a `kaola-workflow/{project}/workflow-state.md` with `status: active` as
active work even before any `phase*.md` file exists. If there is one
<!-- SPLICE:nx-sk-024 -->
the user to confirm the generated workflow folder name.

Manual reconstruction order:

```text
finalization-summary.md exists -> workflow complete
workflow-plan.md exists -> kaola-workflow-plan-run   (adaptive; ahead of the phaseN ladder, toggle-agnostic — a tampered/unparseable plan is a typed refusal, never a phaseN fallback)
phase5-review.md exists -> kaola-workflow-finalize
fast-summary.md status ESCALATED -> kaola-workflow-research
fast-summary.md exists -> kaola-workflow-fast
phase4-progress.md exists:
  open tasks -> kaola-workflow-execute
  all complete -> kaola-workflow-review
phase3-plan.md exists -> kaola-workflow-execute
phase2-ideation.md exists -> kaola-workflow-plan
phase1-research.md exists -> kaola-workflow-ideation
no phase file -> kaola-workflow-research
```

## Required Output

Before continuing or stopping, print:

```text
Workflow project: {project}
Current phase: {phase or unknown}
Current step: {step}
Pending gates: {list or none}
Branch: {branch from Sink block in workflow-state.md, or TBD if not yet claimed}
Workflow path: {adaptive by default; fast|full only on an explicit path-name keyword or KAOLA_PATH — from KAOLA_PATH or Step 0a-1 judgment}
Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}
Next skill: {next_skill}
```

## Completion Contract

Each kaola-workflow-next run implements exactly one issue **or one explicitly selected
same-scope bundle**. After kaola-workflow-finalize closes the issue (or every issue in
the bundle) and releases the lease, the completion contract is satisfied. Stop and await
explicit re-direction. Do not auto-route into the next issue in line.

A bundle closure is all-or-nothing: finalization closes EVERY issue in `issue_numbers`,
<!-- SPLICE:nx-sk-025 -->
<!-- /REGION -->
