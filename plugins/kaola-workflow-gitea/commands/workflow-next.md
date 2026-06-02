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
- a Gitea issue number or free-form task description for new work
- empty, meaning detect or ask

## Router Rules

- Do not implement, review, fix, or finalize work in this router.
- Do not invoke phase agents from this router.
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
Consult the configured advisor internally for essential technical decisions,
apply the chosen answer, and record it under `.cache/` or the phase artifact.
Ask only for true external authorization or materially user-owned choices.

The `/goal` template must NOT use "next issue in line" or similar phrasing that
implies cross-issue continuation. Each run targets exactly one issue.

## Startup Step 0 - Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

1. Read `kaola-workflow/ROADMAP.md` for open unfinished issues.
2. Fetch Gitea issue list if available (`tea issues list --limit 100 --output json`).
3. Check active folders: `node "$CLAIM_JS" status 2>/dev/null` to find already-active issues.
4. Apply sequencing judgment: prefer foundational or dependency-unblocked issues; avoid issues blocked by open dependencies or already active in another session.
5. If exactly one active folder is already present, read its issue number from `node "$CLAIM_JS" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
   STATUS_OUT="$(node "$CLAIM_JS" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
6. If `$ARGUMENTS` names a specific issue number or project, use that as the explicit target.
7. Validate the target exists before calling startup. Validate against the active consumer repository, not against the Kaola-Workflow package repository unless that is the active project.
   - Online: `tea issues view "$KAOLA_TARGET_ISSUE" --output json` against the active project. If the fetch fails, stop and ask — do not fall back to a different issue.
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
8. State the selected issue number aloud before calling startup.

If no actionable issue is found (all blocked, red, or occupied), stop and explain.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Startup Step 0a — PR Intent Capture

Before the startup transaction, check the user's initial prompt for PR sink intent.
If it contains "open a PR", "create a PR", "pull request", "sink=pr", "KAOLA_SINK=pr",
"PR sink" (case-insensitive),
export `KAOLA_SINK=pr` before the startup call.
The `${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates it.
Keyword matching is agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Before Step 0b, pick fast or full and export `KAOLA_PATH` if fast.
The agent owns this judgment; scripts do not auto-pick. Precedence top-down — first match wins.

1. If `KAOLA_PATH` is already exported, honor it.
   (Rationale: KAOLA_PATH is an explicit shell override; inferred intent
   from prompt prose should not silently overrule it.)
2. Else sniff the user's initial prompt (case-insensitive):
   - fast triggers: "quick fix", "trivial", "one-line", "one line",
     "rename", "typo", "small change", "fast path", "fast mode"
   - full triggers: "thorough", "full review", "full path",
     "carefully", "all phases", "deep dive"
   Tie or both match → prefer full.
3. Else fetch the selected issue once:
   ```bash
   tea issues view "$KAOLA_TARGET_ISSUE" --output json
   ```
   Judge against the fast-path eligibility contract in the Mid-Flight
   Escalation section of `plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md`. Export
   `KAOLA_PATH=fast` ONLY if all hold: the approach is unambiguous and mechanical (exactly one sensible way — not ≥ 2 materially-different viable approaches), ≤ 5 files in a single area, no new external deps, no public API/schema/migration change, no security/auth/encryption concern, no `depends-on:#N` label. ≥ 2 viable approaches is a design choice → stay on full.
4. If the issue fetch fails for any reason (KAOLA_WORKFLOW_OFFLINE=1,
   missing CLI, auth failure, network error), default to full.
5. Default `full`. When in doubt, full.

State the chosen path and one-line reason aloud before Step 0b:

```text
Path: fast (mechanical, single-area, 4 files)
Path: full (≥2 viable approaches — design choice)
Path: full (default — rubric ambiguous; prefer safety)
```

Bias toward full when in doubt. Fast false positives escalate cleanly via the
Fast Eligibility and Mid-Flight Escalation sections of `plugins/kaola-workflow-gitea/commands/kaola-workflow-fast.md`; false
negatives only cost ceremony.

## Startup Step 0b - Startup Transaction

If `kaola-gitea-workflow-claim.js` and `kaola-gitea-workflow-classifier.js` are available,
run the startup transaction with the agent-selected target. The startup script
validates the explicit target, refreshes PR-backed folders with `watch-pr`, and
atomically creates `kaola-workflow/{project}/workflow-state.md`.

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
CLAIM_JS="$(kaola_script kaola-gitea-workflow-claim.js)"
if [ -f "$CLAIM_JS" ]; then
  node "$CLAIM_JS" watch-pr >/dev/null 2>&1 || true
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

If startup returns a typed refusal (`target_occupied`, `user_target_blocked`,
`user_target_red`, `target_mismatch`, `target_unavailable`, `target_unverified`),
read the `reasoning` field and either stop, select a different issue, or
escalate to the user. If startup is unavailable or malformed, stop for repair.
On startup, also run `watch-pr` to archive PR folders for merged or closed PRs
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
Commits stay phase-owned (Phase 6 Step 7). If `kaola-gitea-workflow-roadmap.js` is unavailable, skip validation.

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

**Important**: Do NOT merge, interleave, or batch commits from different active folders. Each folder must complete its own Phase 4 → Phase 6 sequence independently. If the same file appears in multiple active write sets, stop and resolve the conflict before continuing — do not proceed with overlapping modifications.

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
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
REPAIR_JS="$(kaola_script kaola-gitea-workflow-repair-state.js)"
[ -f "$REPAIR_JS" ] && node "$REPAIR_JS" "$ARGUMENTS"
```

If the helper writes or validates `workflow-state.md`, route from that state.

If missing or invalid, reconstruct:

```text
phase6-summary.md exists -> workflow complete; show summary and stop
phase5-review.md exists -> /kaola-workflow-phase6 {project}
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
Workflow path: {fast|full — from KAOLA_PATH or Step 0a-1 judgment}
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

Each `/workflow-next` run implements exactly one issue. After Phase 6 closes issue #N
and archives the active folder, the agent must stop and await explicit re-direction from the user.
Do not auto-route into the next issue in line. The single-issue completion contract means
finishing issue #N is the terminal event of the run. To start issue #N+1, the user must
invoke `/workflow-next` again.
