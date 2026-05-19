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

## Delegation Contract

Before proceeding with any phase work, the agent must establish a session delegation policy with the user. Subagent delegation is not assumed; it requires explicit authorization.

**Skip this step if `delegation_policy:` is already set in `workflow-state.md`.**

Ask the user once at startup:

> "This workflow uses Codex subagent roles (code-explorer, planner, code-architect, tdd-guide, code-reviewer, security-reviewer, doc-updater) for delegated work. How should delegation be handled?
>
> - **delegate** — invoke subagent roles when available (records `subagent-invoked` in each compliance ledger)
> - **local-authorized** — execute locally with your explicit authorization (records `local-fallback-explicit`)
> - **tool-unavailable** — subagent tooling is unavailable; execute locally (records `local-fallback-tool-unavailable`)
>
> Please confirm your delegation policy."

**Write order** — three steps, in sequence:

1. Ask the user and receive their confirmation (hold policy in-session).
2. Call the startup script (this creates `workflow-state.md`).
3. After startup succeeds and `workflow-state.md` exists, patch the delegation policy into the file:

```bash
printf '\ndelegation_policy: %s\n' "$KAOLA_DELEGATION_POLICY" >> "kaola-workflow/${PICK_NEXT_PROJECT}/workflow-state.md"
```

Where `KAOLA_DELEGATION_POLICY` is `delegate`, `local-authorized`, or `tool-unavailable` based on the user's response.

Do not re-ask during the session unless the user explicitly changes policy or `workflow-state.md` is absent.

## Agent Issue Selection (Required Before Startup)

Before calling the startup script, the agent must select a target issue. Scripts
do not auto-pick; the agent owns this decision.

1. Read `kaola-workflow/ROADMAP.md` for open unfinished issues.
2. Fetch Gitea issue list if available (`tea issues list --limit 100 --output json`).
3. Check active folders via `node "$claim_script" status 2>/dev/null`.
4. Apply sequencing judgment: prefer foundational or dependency-unblocked issues.
5. If exactly one active folder is already present, read its issue number from `node "$claim_script" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
   STATUS_OUT="$(node "$claim_script" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
6. State the selected issue number before calling startup.

Set `KAOLA_TARGET_ISSUE` to the chosen issue number before calling startup.

## Startup Step 0a — PR Intent Capture

Before the startup transaction, check the user's initial prompt for PR sink intent.

If the prompt contains any of the following (case-insensitive):
- "open a PR"
- "create a PR"
- "pull request"
- "sink=pr"
- "KAOLA_SINK=pr"
- "PR sink"

The PR phrases are accepted only as compatibility aliases. Then export
`KAOLA_SINK=pr` before the startup call. The existing
`${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates
this value without modification.

Do not set `KAOLA_SINK` if none of the keywords match. Keyword matching is
agent-level prose detection, not a bash conditional.

## Startup

Run the startup transaction with the agent-selected target. Startup validates
the explicit issue, refreshes PR-backed folders with `watch-pr`, and atomically
creates or reuses `kaola-workflow/{project}/workflow-state.md`.

```bash
claim_script="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-claim.js' -print -quit 2>/dev/null)"
fi

if [ -f "$claim_script" ]; then
  node "$claim_script" watch-pr >/dev/null 2>&1 || true
  KAOLA_SINK_FLAG=""
  [ -n "${KAOLA_SINK:-}" ] && KAOLA_SINK_FLAG="--sink $KAOLA_SINK"
  KAOLA_TARGET_FLAG=""
  [ -n "${KAOLA_TARGET_ISSUE:-}" ] && KAOLA_TARGET_FLAG="--target-issue $KAOLA_TARGET_ISSUE"
  STARTUP_OUT=$(node "$claim_script" startup \
    --runtime codex \
    $KAOLA_SINK_FLAG \
    $KAOLA_TARGET_FLAG 2>/dev/null) || true
  PICK_NEXT_PROJECT="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).project||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_CLAIM="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).claim||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  KAOLA_WORKTREE_PATH="$(node -e "try{process.stdout.write(JSON.parse(process.argv[1]).worktree_path||'')}catch(e){}" "$STARTUP_OUT" 2>/dev/null)" || true
  [ -n "$KAOLA_WORKTREE_PATH" ] && [ -d "$KAOLA_WORKTREE_PATH" ] && export KAOLA_WORKTREE_PATH
else
  echo "BLOCKED: kaola-workflow startup unavailable; cannot select issue-backed work." >&2
  exit 1
fi
```

If `STARTUP_OUT` has `verdict: "owned"`, route that project. If startup returns
`verdict: no_target`, the agent must select a target and re-run. If startup returns
a typed refusal (`target_occupied`, `user_target_blocked`, `user_target_red`,
`target_mismatch`, `target_unavailable`), read the `reasoning` field and stop or
select a different issue. If the startup script is unavailable, stop for repair.
If startup returns `claim: "none"`, stop normal routing. Do not inspect active
project folders unless the user explicitly names the project to resume.

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

### Git Freshness Block Recovery

If startup succeeds (folder claimed, worktree provisioned) but the Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), attempt fast-forward:

```bash
git fetch --prune
git pull --ff-only
git status --short --branch
```

If the block passes, continue to routing. If the block persists (merge/rebase required, dirty worktree), release the claimed folder before stopping:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$PICK_NEXT_PROJECT" ] && node "$claim_script" release --project "$PICK_NEXT_PROJECT" --reason git-freshness-block
```

Stop and ask the user to resolve the Git state manually before retrying `/workflow-next`. Do not proceed to routing or adopt any active folder after this release.

If Gitea is available, refresh open issues:

```bash
tea issues list --limit 100 --output json
```

Keep `kaola-workflow/ROADMAP.md` as a compact mirror of active unfinished work.

## Routing

Read `kaola-workflow/{project}/workflow-state.md` first. If missing or stale, run:

On resume, extract and reassign `delegation_policy:` alongside `phase` and `next_skill`;
if it is absent, return to the Delegation Contract before phase work continues.

```bash
repair_script="plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js"
if [ ! -f "$repair_script" ]; then
  repair_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitea/*/scripts/kaola-gitea-workflow-repair-state.js' -print -quit 2>/dev/null)"
fi
test -f "$repair_script"
node "$repair_script" {project-or-empty}
```

Use the repaired state only when it identifies exactly one safe `next_skill`.
Treat a `kaola-workflow/{project}/workflow-state.md` with `status: active` as
active work even before any `phase*.md` file exists. If there is one
unambiguous open Gitea issue and no active project, select it without asking
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

### Co-active Folders Advisory

If multiple active folders exist from prior sessions (e.g., `issue-63` and `issue-65` in different states), they operate independently. Each folder has its own `workflow-state.md`, branch, and worktree metadata. The pre-commit hook prevents commits that stage multiple workflow project folders together.

**Important**: Do NOT merge, interleave, or batch commits from different active folders. Each folder must complete its own Phase 4 → Phase 6 sequence independently. If the same file appears in multiple active write sets, stop and resolve the conflict before continuing — do not proceed with overlapping modifications.

## Required Output

Before continuing or stopping, print:

```text
Workflow project: {project}
Current phase: {phase or unknown}
Current step: {step}
Pending gates: {list or none}
Next skill: {next_skill}
```

## Completion Contract

Each kaola-workflow-next run implements exactly one issue. After kaola-workflow-finalize
closes issue #N and releases the lease, the single-issue completion contract is satisfied.
Stop and await explicit re-direction. Do not auto-route into the next issue in line.
