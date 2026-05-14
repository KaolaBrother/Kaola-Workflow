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
- a GitHub issue number or free-form task description for new work
- empty, meaning detect or ask

## Router Rules

- Do not implement, review, fix, or finalize work in this router.
- Do not invoke phase ECC agents from this router.
- Do not cross a phase boundary while any `Required Agent Compliance` row is
  `pending`, missing, or lacks evidence/skip reason.
- Prefer `workflow-state.md` for exact resume position.
- If `workflow-state.md` is missing or stale, reconstruct conservatively from
  phase artifacts and cache files.
- If exact intra-phase position is ambiguous, stop and ask the user instead of
  guessing.
- When a next phase is identified, either continue by following the matching
  phase command content if available in this session, or print the exact command
  the user must run.

## Goal-Driven Autonomy

Use `/goal` or equivalent prompt-based Stop-hook wording so the router and each
phase keep going until the active phase objective and completion audit pass.
Treat nonessential workflow bookkeeping as autonomous: issue selection when
there is one unambiguous open issue, generated project names, collision suffixes
like `-2`, cache paths, and harmless ordering choices. Consult the configured
advisor internally for essential technical decisions, apply the chosen answer,
and record it under `.cache/` or the phase artifact. Ask only for true external
authorization or materially user-owned choices.

## Startup Step 0 - Sweep And Claim

If `kaola-workflow-claim.js` is available and `KAOLA_SESSION_ID` is set, run sweep then claim before routing:

```bash
node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" sweep
node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" claim \
  --session "$KAOLA_SESSION_ID" --project "{project}" --issue {N}
```

If `KAOLA_SESSION_ID` is unset or the script is unavailable, skip this step.

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

## Startup Step 2 - Roadmap

If a GitHub remote and authenticated `gh` are available, fetch open issues:

```bash
gh issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

Ensure `kaola-workflow/ROADMAP.md` exists. If GitHub is unavailable, continue from the local
roadmap and say why sync was skipped.

Validate that `ROADMAP.md` is current with the per-issue source files:

```bash
node "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/kaola-workflow}/scripts/kaola-workflow-roadmap.js" validate
```

If `validate` exits non-zero, print a warning and continue:

```text
WARNING: kaola-workflow/ROADMAP.md is stale. Per-issue files have changed since the last generate.
To refresh: node .../kaola-workflow-roadmap.js generate && git add kaola-workflow/ROADMAP.md && git commit -m "chore: refresh ROADMAP.md"
Continuing with stale ROADMAP.md — roadmap state may not reflect current per-issue files.
```

Do NOT run `generate` automatically. Do NOT stage or commit `ROADMAP.md` in this step.
Commits stay phase-owned (Phase 6 Step 7). If `kaola-workflow-roadmap.js` is unavailable, skip validation.

## Startup Step 3 - Select Project

If `$ARGUMENTS` names an existing `kaola-workflow/{project}/` directory, use
that project.

Otherwise list active workflow folders under `kaola-workflow/` that contain at
least one `phase*.md` file. Skip `archive/`.

If no active project is selected, choose one unambiguous open GitHub issue or
provided task automatically. If there are multiple plausible issues/tasks or no
task is available, ask the user what to implement. New work starts with:

```text
/kaola-workflow-phase1 <task description or issue>
```

## Co-active Leases

Multiple sessions may hold leases simultaneously when each targets a distinct project. Session A on `issue-3` and Session B on `issue-4` are coexistent. The pre-commit guard blocks only commits that stage files from a project owned by a different session.

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
for helper in \
  "${CLAUDE_PLUGIN_ROOT:-}/scripts/kaola-workflow-repair-state.js" \
  "$HOME/.claude/kaola-workflow/scripts/kaola-workflow-repair-state.js" \
  "./scripts/kaola-workflow-repair-state.js"; do
  [ -f "$helper" ] && { node "$helper" "$ARGUMENTS"; break; }
done
```

If the helper writes or validates `workflow-state.md`, route from that state.

If missing or invalid, reconstruct:

```text
phase6-summary.md exists -> workflow complete; show summary and stop
phase5-review.md exists -> /kaola-workflow-phase6 {project}
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
phase artifacts identifies exactly one safe next command, write repaired `workflow-state.md`
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
Next command: {next_command}
```

If nested slash-command execution is supported in the current Claude Code
environment, continue by applying the matching command. Otherwise stop after
printing the next command.

