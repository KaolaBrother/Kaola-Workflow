---
description: Workflow Next. Thin router for Kaola-Workflow. Detects active work, reconstructs resume state, and routes to the correct phase command.
argument-hint: (optional project name or task description)
---

# Workflow Next - thin router

`/workflow-next` is the thin router for the six phase commands. It owns
startup, Git/roadmap freshness, project selection, resume detection, and phase
routing. It does not perform phase work directly.

## Inputs

Use `$ARGUMENTS` as either:
- an existing workflow project name
- a GitLab issue number or free-form task description for new work
- empty, meaning detect or ask

## Router Rules

- Do not implement, review, fix, or finalize work in this router.
- Do not invoke phase agents from this router. (Exception — `issue-scout`: a pre-claim,
  read-only backlog survey dispatched in Step 0 when the user did not name an issue. It
  is not a phase agent — it claims nothing, writes nothing, and only recommends the next
  target/bundle — so dispatching it does not break the router's dispatch-free contract, #380.)
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
this capture step. Use the forge's issue tracker to file follow-ups.

## Startup Step 0 - Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

**Branch first on whether the user named an issue (#380):**

- **User named a specific issue** — `$ARGUMENTS` carries an issue number/project, or
  the prompt names one (e.g. "work on #42") → use the single-issue selection
  (steps 1–8 below), byte-unchanged.
- **User did NOT name an issue** — the common "work on the next issue" / no-argument
  case → this is the **auto-bundle entry**. Resolve the path intent first (Step 0a-1),
  then dispatch the read-only **`issue-scout`** agent (Step 0c, *Auto-bundle entry*)
  and adopt its recommendation: set `KAOLA_TARGET_ISSUES` for a high-confidence
  same-scope bundle **when the resolved path is adaptive**, otherwise set
  `KAOLA_TARGET_ISSUE` to the scout's `primary_issue` (single-issue, or any
  medium/low-confidence outcome). STATE the selected set aloud, then continue to
  validation (step 7) and startup. (Dispatching the scout here is explicitly
  permitted — see Router Rules; it is a pre-claim read-only survey, not a phase agent.)

1. Read `kaola-workflow/ROADMAP.md` for open unfinished issues.
2. Fetch GitLab issue list if available (`glab issue list --limit 100 --json number,title,state,labels`).
3. Check active folders: `node "$CLAIM_JS" status 2>/dev/null` to find already-active issues.
4. Apply sequencing judgment: prefer foundational or dependency-unblocked issues; avoid issues blocked by open dependencies or already active in another session.
5. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
6. If `$ARGUMENTS` names a specific issue number or project, use that as the explicit target.
7. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.
   - Online: `glab issue view "$KAOLA_TARGET_ISSUE" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue.
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
8. State the selected issue number aloud before calling startup.

If no actionable issue is found (all blocked, red, or occupied), stop and explain.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Startup Step 0c — Bundle Lane (Multi-Issue)

The bundle lane is additive: `--target-issue N` / `KAOLA_TARGET_ISSUE` single-issue
behavior is unchanged. Use the bundle lane only when the user explicitly names
several issues or when auto-bundle mode identifies a high-confidence same-scope
set (see below).

### Explicit-bundle entry

When the user names several issues together (e.g., "finish issues #42 #47 #53
together"), route through the bundle lane:

- Set `KAOLA_TARGET_ISSUES=42,47,53` (comma-separated, no spaces) before calling startup.
- The startup script validates the exact set — it does NOT substitute or reorder issues (#44).
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

### Auto-bundle entry (AC#5/AC#6)

This is the **no-issue-named branch of Step 0** (#380): whenever the user does not name
a specific issue — including the everyday "work on the next issue" entry — dispatch the
read-only **`issue-scout`** agent to inspect the backlog before claiming anything. The
issue-scout surveys:

- local roadmap sources (`kaola-workflow/.roadmap/issue-*.md`);
- remote open issues, labels, and dependency labels (`depends-on:#N`);
- active folders and recently archived summaries.

It returns one recommended same-scope bundle **plus a `primary_issue` and a `confidence`**
(or no bundle). **The main orchestrator STATES the selected issue set aloud before calling
startup.** Scripts validate but never select or substitute issues (#44).

issue-scout is read-only: it cannot claim issues, write repository files, author
`workflow-plan.md`, close issues, or dispatch other agents.

**Ordering — resolve the path BEFORE consuming a bundle (#380):** the bundle lane is
adaptive-only, so resolve the path intent (Step 0a-1) *before* acting on
the scout's recommendation. A bundle is pursued ONLY when the resolved path is `adaptive`;
with an explicit `KAOLA_PATH=fast`/`full` the router takes only the scout's
`primary_issue` (a bundle there would be refused at startup with `bundle_requires_adaptive`).

**Output → env wiring (#380):** map the scout's recommendation into the startup env exactly:
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

**Fallback rule (AC#6):** when no high-confidence same-scope bundle exists, the scout
returns a single `primary_issue` (or `confidence: low`) → fall back to single-issue
selection via `KAOLA_TARGET_ISSUE`. Do not manufacture a bundle.

### Bundle closure

A bundle run ends at ONE finalization that closes EVERY issue in the set
(all-or-nothing). There is one merge/MR sink per bundle. The finalization step
removes each corresponding `.roadmap/issue-N.md` source and regenerates
`kaola-workflow/ROADMAP.md` once.

## Startup Step 0a — MR Intent Capture

Before the startup transaction, check the user's initial prompt for MR sink intent.
If it contains "open an MR", "create an MR", "merge request", "sink=mr", "KAOLA_SINK=mr",
"MR sink", or the compatibility aliases "open a PR" / "create a PR" (case-insensitive),
export `KAOLA_SINK=mr` before the startup call.
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
   `plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md`.

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
   target issue and contains `kaola-workflow/{project}/workflow-plan.md`, run `watch-mr` once, then
   route to `/kaola-workflow-plan-run {project}` and stop — the same `workflow-plan.md exists ->
   /kaola-workflow-plan-run` rule as Resume Detection. The front end is for FRESH adaptive work only.
2. **Fresh adaptive.** Run `watch-mr` once for global MR-folder reconciliation, then route to
   `/kaola-workflow-adapt $KAOLA_TARGET_ISSUE`. The adapt command's `workflow-planner` runs
   `kaola-gitlab-workflow-claim.js startup --workflow-path adaptive --target-issue $KAOLA_TARGET_ISSUE`
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

If `kaola-gitlab-workflow-claim.js` and `kaola-gitlab-workflow-classifier.js` are available,
run the startup transaction with the agent-selected target. The startup script
validates the explicit target, refreshes MR-backed folders with `watch-mr`, and
atomically creates `kaola-workflow/{project}/workflow-state.md`.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitlab-workflow-claim.js)"
if [ -f "$CLAIM_JS" ]; then
  node "$CLAIM_JS" watch-mr >/dev/null 2>&1 || true
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
If startup returns a typed refusal, read the `reasoning` field and classify by `result` (#495):
- `result: refuse` (`target_occupied`, `user_target_blocked`, `user_target_red`,
  `target_unavailable`, `target_unverified`): **HARD STOP** — the determinate RED is final; do
  not blind-proceed to a different issue without explicit user direction.
- `result: escalate` (`target_indeterminate` / `target_set_indeterminate`): the classifier
  subprocess faulted and bounded retry is exhausted. **PAUSE and ASK THE USER** — offer to retry,
  pick a different target, go offline, or abort. This is NOT an `adaptive-node write-halt`;
  no plan/ledger exists yet at claim time.
If startup is unavailable or malformed, stop for repair.
On startup, also run `watch-mr` to archive MR folders for merged or closed MRs
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

If a GitLab remote and authenticated `glab` are available, fetch open issues:

```bash
glab issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

Ensure `kaola-workflow/ROADMAP.md` exists. If GitLab is unavailable, continue from the local
roadmap and say why sync was skipped.

Validate that `ROADMAP.md` is current with the per-issue source files:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
ROADMAP_JS="$(kaola_script kaola-gitlab-workflow-roadmap.js)"
[ -f "$ROADMAP_JS" ] && node "$ROADMAP_JS" validate
```

If `validate` exits non-zero, print a warning and continue:

```text
WARNING: kaola-workflow/ROADMAP.md is stale. Per-issue files have changed since the last generate.
To refresh: node .../kaola-gitlab-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m "chore: refresh ROADMAP.md"
Continuing with stale ROADMAP.md — roadmap state may not reflect current per-issue files.
```

Do NOT run `generate` automatically. Do NOT stage or commit `ROADMAP.md` in this step.
Commits stay phase-owned (Finalization Step 7). If `kaola-gitlab-workflow-roadmap.js` is unavailable, skip validation.

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

If multiple active folders exist from prior sessions, they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together.

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
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
REPAIR_JS="$(kaola_script kaola-gitlab-workflow-repair-state.js)"
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
