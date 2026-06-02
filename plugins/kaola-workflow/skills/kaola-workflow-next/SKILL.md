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

Codex subagent delegation is the default. The session delegation policy defaults to `delegate` and is established without prompting the user; the workflow complies with its delegated-role contract automatically rather than asking the user to choose.

**Skip this step if `delegation_policy:` is already set in `workflow-state.md`.**

The default `delegation_policy` is `delegate`: invoke the Codex subagent roles (code-explorer, planner, code-architect, tdd-guide, code-reviewer, security-reviewer, doc-updater) for delegated work and record `subagent-invoked` in each compliance ledger. Do not ask the user to choose a delegation policy.

Tool availability is auto-detected, not a user choice. Before phase work, check whether the Codex role profiles are installed at `.codex/agents/kaola-workflow/`. If that directory has no `*.toml` role profiles the subagent tooling is unavailable: keep `delegation_policy: delegate` and, for each Codex role row, record `local-fallback-tool-unavailable` with a non-empty Evidence value naming the absent path (for example `.codex/agents/kaola-workflow/ absent`). An empty Evidence cell fails the repair-state cross-check, so always write the evidence. Never present tool-unavailability as a question.

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

1. Read `kaola-workflow/ROADMAP.md` for open unfinished issues.
2. Fetch GitHub issue list if available (`gh issue list --limit 100 --json number,title,state,labels`).
3. Check active folders via `node "$claim_script" status 2>/dev/null`.
4. Apply sequencing judgment: prefer foundational or dependency-unblocked issues.
5. If exactly one active folder is already present, read its issue number from `node "$claim_script" status` (`active[0].issue_number`) and set `KAOLA_TARGET_ISSUE` to that value before calling startup. The script will return `verdict: owned`; proceed to routing. Do not skip the startup call.

   ```bash
   STATUS_OUT="$(node "$claim_script" status 2>/dev/null)"
   KAOLA_TARGET_ISSUE="$(node -e "try{const j=JSON.parse(process.argv[1]);process.stdout.write(j.count===1?String(j.active[0].issue_number):'')}catch(e){}" "$STATUS_OUT")"
   ```
6. Validate the target exists in the active consumer repository before calling startup. The validation context is the cwd's git repo (the project consuming Kaola-Workflow), not `KaolaBrother/Kaola-Workflow` unless that is the active project.
   - Online: `gh issue view "$KAOLA_TARGET_ISSUE" --json number,state` against cwd's `gh` context. If the fetch fails, stop and ask — do not fall back to a different issue.
   - Offline (`KAOLA_WORKFLOW_OFFLINE=1`): require `kaola-workflow/.roadmap/issue-$KAOLA_TARGET_ISSUE.md` to exist in the cwd's repo, OR an active folder whose `issue_number` matches the target. If neither is present, stop and ask the user to confirm the issue or run online.
7. State the selected issue number before calling startup.

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

Then export `KAOLA_SINK=pr` before the startup call. The existing
`${KAOLA_SINK:+--sink $KAOLA_SINK}` pass-through in Startup Step 0 propagates
this value without modification.

Do not set `KAOLA_SINK` if none of the keywords match. Keyword matching is
agent-level prose detection, not a bash conditional.

## Startup Step 0a-1 — Path Intent

Before the Startup transaction, pick fast or full and export `KAOLA_PATH` if fast.
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
   gh issue view "$KAOLA_TARGET_ISSUE" --json number,title,body,labels
   ```
   Judge against the fast-path eligibility contract in the Mid-Flight
   Escalation section of `commands/kaola-workflow-fast.md`. Export
   `KAOLA_PATH=fast` ONLY if all hold: the approach is unambiguous and mechanical (exactly one sensible way — not ≥ 2 materially-different viable approaches), ≤ 5 files in a single area, no new external deps, no public API/schema/migration change, no security/auth/encryption concern, no `depends-on:#N` label. ≥ 2 viable approaches is a design choice → stay on full.
4. If the issue fetch fails for any reason (KAOLA_WORKFLOW_OFFLINE=1,
   missing CLI, auth failure, network error), default to full.
5. Default `full`. When in doubt, full.

State the chosen path and one-line reason aloud before the Startup transaction:

```text
Path: fast (mechanical, single-area, 4 files)
Path: full (≥2 viable approaches — design choice)
Path: full (default — rubric ambiguous; prefer safety)
```

Bias toward full when in doubt. Fast false positives escalate cleanly via the
Fast Eligibility and Mid-Flight Escalation sections of `commands/kaola-workflow-fast.md`; false
negatives only cost ceremony.

## Startup

Run the startup transaction with the agent-selected target. Startup validates
the explicit issue, refreshes PR-backed folders with `watch-pr`, and atomically
creates or reuses `kaola-workflow/{project}/workflow-state.md`.

```bash
claim_script="plugins/kaola-workflow/scripts/kaola-workflow-claim.js"
if [ ! -f "$claim_script" ]; then
  claim_script="$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-claim.js' -print -quit 2>/dev/null)"
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
`verdict: no_target`, the agent must select a target and re-run. If startup returns
a typed refusal (`target_occupied`, `user_target_blocked`, `user_target_red`,
`target_mismatch`, `target_unavailable`, `target_unverified`), read the `reasoning`
field and stop or select a different issue. If the startup script is unavailable,
stop for repair. If startup returns `claim: "none"`, stop normal routing. Before
stopping, print the refusal diagnostics:

```text
Startup refusal: verdict=$KAOLA_VERDICT reasoning=$KAOLA_REASONING
```

Do not inspect active project folders unless the user explicitly names the
project to resume.

### Git Freshness Block Recovery

If startup succeeds (folder claimed, worktree provisioned) but the subsequent Git freshness check blocks (local is behind remote, dirty worktree, or merge/rebase required), run:

```bash
[ "$KAOLA_CLAIM" = "acquired" ] && [ -n "$KAOLA_PROJECT" ] && node "$claim_script" release --project "$KAOLA_PROJECT" --reason git-freshness-block
```

This releases the just-claimed folder and removes the worktree before stopping. Do not leave a claimed folder orphaned when the startup sequence cannot complete.

### Co-active Folders Advisory

If a second active folder already exists from a prior session, the two folders have disjoint write sets by design. Do not merge, interleave, or batch their commits. Each folder follows its own Phase 4 → Phase 6 sequence independently. If the same file appears in both write sets, stop and resolve the conflict before continuing.

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

On resume, extract and reassign `delegation_policy:` alongside `phase` and `next_skill`;
if it is absent, default `delegation_policy` to `delegate` without prompting and continue.

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
Workflow path: {fast|full — from KAOLA_PATH or Step 0a-1 judgment}
Parallel decision: {green|yellow|red|blocked|target_unavailable|target_unverified|skipped — classifier verdict or "skipped" if offline/unavailable}
Next skill: {next_skill}
```

## Completion Contract

Each kaola-workflow-next run implements exactly one issue. After kaola-workflow-finalize
closes issue #N and releases the lease, the single-issue completion contract is satisfied.
Stop and await explicit re-direction. Do not auto-route into the next issue in line.
