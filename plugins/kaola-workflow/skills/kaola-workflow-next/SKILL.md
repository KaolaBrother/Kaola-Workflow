---
name: kaola-workflow-next
description: Use when resuming, routing, or starting a Kaola-Workflow for Codex project, also called kaola-workflow, from kaola-workflow state and phase artifacts.
---

# Kaola-Workflow Next

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

## Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

1. Read `kaola-workflow/ROADMAP.md` for open unfinished issues.
2. Fetch GitHub issue list if available (`gh issue list --limit 100 --json number,title,state,labels`).
3. Check active locks via `node "$claim_script" status 2>/dev/null`.
4. Apply sequencing judgment: prefer foundational or dependency-unblocked issues.
5. If the session already owns a project (startup returns `verdict: owned`), skip steps 1-4.
6. State the selected issue number before calling startup.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Startup

Run the startup transaction for this session with the agent-selected target.
Use `KAOLA_SESSION_ID` if it is already set; otherwise prefer `CODEX_THREAD_ID`,
then generate a fallback.

```bash
claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
fi

if [ -f "$claim_script" ]; then
  KAOLA_STARTUP_SESSION="$(node "$claim_script" session 2>/dev/null || true)"
  [ -n "$KAOLA_STARTUP_SESSION" ] && export KAOLA_SESSION_ID="$KAOLA_STARTUP_SESSION"
  if [ "${KAOLA_WORKTREE_NATIVE:-0}" = "1" ]; then
    PICK_NEXT_OUT="$(node "$claim_script" pick-next --session "$KAOLA_STARTUP_SESSION" --runtime codex ${KAOLA_SINK:+--sink $KAOLA_SINK} ${KAOLA_TARGET_ISSUE:+--target-issue $KAOLA_TARGET_ISSUE} 2>/dev/null)" || true
    PICK_NEXT_VERDICT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).verdict||'')}catch(e){}" "$PICK_NEXT_OUT" 2>/dev/null)" || true
    PICK_NEXT_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$PICK_NEXT_OUT" 2>/dev/null)" || true
    KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$PICK_NEXT_OUT" 2>/dev/null)" || true
    [ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
    if [ "$PICK_NEXT_VERDICT" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ]; then
      STARTUP_OUT="$PICK_NEXT_OUT"
    elif [ "$PICK_NEXT_VERDICT" = "owned" ] && [ -n "$PICK_NEXT_PROJECT" ]; then
      STARTUP_OUT="$PICK_NEXT_OUT"
    else
      echo "pick-next: no actionable issue (verdict: ${PICK_NEXT_VERDICT:-none})" >&2
      exit 0
    fi
  fi
  if [ -z "${STARTUP_OUT:-}" ]; then
    KAOLA_SINK_FLAG=""
    [ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"
    KAOLA_TARGET_FLAG=""
    [ -n "${KAOLA_TARGET_ISSUE:-}" ] && KAOLA_TARGET_FLAG="--target-issue $KAOLA_TARGET_ISSUE"
    STARTUP_OUT=$(node "$claim_script" startup \
      --session "$KAOLA_STARTUP_SESSION" \
      --runtime codex \
      $KAOLA_SINK_FLAG \
      $KAOLA_TARGET_FLAG 2>/dev/null) || true
    PICK_NEXT_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
    KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
    [ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
  fi
else
  echo "BLOCKED: kaola-workflow startup unavailable; cannot select issue-backed work without a startup receipt." >&2
  exit 1
fi
```

If `STARTUP_OUT` has `verdict: "owned"`, route that project. If startup returns
`verdict: no_target`, the agent must select a target and re-run. If startup returns
a typed refusal (`target_occupied`, `user_target_blocked`, `user_target_red`,
`target_mismatch`, `target_unavailable`), read the `reasoning` field and stop or
select a different issue. If the startup script is unavailable, stop for repair.
Do not proceed to project selection when the startup receipt is missing or
malformed.
If startup returns `claim: "none"`, stop normal routing. Do not inspect active
project folders and recover/handoff them from a skipped `already claimed`
entry.
Use `can-handoff --project <project> --session "$KAOLA_SESSION_ID"` followed by
`handoff --project <project> --session "$KAOLA_SESSION_ID"` only for explicit
recovery when the user intentionally transfers unfinished work. Live local owner
evidence and startup receipts for a different project block normal handoff. Use
`--force-live-takeover` only when the user explicitly requests dangerous manual
recovery of live work.

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

If GitHub is available, refresh open issues:

```bash
gh issue list --limit 100 --json number,title,state,labels,assignees,updatedAt,url
```

Keep `kaola-workflow/ROADMAP.md` as a compact mirror of active unfinished work.

## Routing

Read `kaola-workflow/{project}/workflow-state.md` first. If missing or stale, run:

```bash
repair_script="plugins/kaola-workflow/scripts/kaola-workflow-repair-state.js"
if [ ! -f "$repair_script" ]; then
  repair_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-repair-state.js' -print -quit 2>/dev/null)"
fi
test -f "$repair_script"
node "$repair_script" {project-or-empty}
```

Use the repaired state only when it identifies exactly one safe `next_skill`.
Treat a `kaola-workflow/{project}/workflow-state.md` with `status: active` as
active work even before any `phase*.md` file exists. If there is one
unambiguous open GitHub issue and no active project, select it without asking
the user to confirm the generated workflow folder name.

Manual reconstruction order:

```text
phase6-summary.md exists -> workflow complete
phase5-review.md exists -> kaola-workflow-finalize
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
Next skill: {next_skill}
```
