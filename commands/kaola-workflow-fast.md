---
description: Kaola-Workflow Fast Path. Single-pass Plan+Execute+Review for small, well-scoped issues. Writes fast-summary.md and gates Phase 6.
argument-hint: <project name>
---

# Kaola-Workflow Fast Path

Fast path executes Plan, Implement, and Review in a single pass for issues
where the scope is small and the approach is unambiguous. Outputs `fast-summary.md`
which Phase 6 reads when `workflow_path: fast`.

Mid-flight escalation to full workflow is mandatory if scope grows unexpectedly.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Phase 6 accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

## Session Heartbeat

If a claim session is active or recoverable, ensure the background heartbeat ticker is running:

```bash
kaola_script(){ _n="$1"; for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; return 1; }
_CLAIM_JS="$(kaola_script kaola-workflow-claim.js)"
if [ -f "$_CLAIM_JS" ] && [ -z "${KAOLA_SESSION_ID:-}" ]; then
  KAOLA_SESSION_ID="$(node "$_CLAIM_JS" session 2>/dev/null || true)"
  [ -n "$KAOLA_SESSION_ID" ] && export KAOLA_SESSION_ID
fi
if [ -f "$_CLAIM_JS" ] && [ -n "${KAOLA_SESSION_ID:-}" ]; then
  node "$_CLAIM_JS" session --project "{project}" --session "$KAOLA_SESSION_ID" >/dev/null || {
    echo "Kaola-Workflow: {project} is owned by another session; use explicit recovery/handoff to continue it."
    exit 1
  }
fi
if [ -n "${KAOLA_SESSION_ID:-}" ] && [ -f "$_CLAIM_JS" ]; then
  _TICKER_PID_FILE="$(git rev-parse --show-toplevel)/kaola-workflow/.tickers/${KAOLA_SESSION_ID}.pid"
  if [ ! -f "$_TICKER_PID_FILE" ] || ! kill -0 "$(cat "$_TICKER_PID_FILE" 2>/dev/null)" 2>/dev/null; then
    nohup node "$_CLAIM_JS" ticker \
      --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
    disown
  fi
fi
```

## Startup Receipt Guard

For issue-backed work, verify that `kaola-workflow/.sessions/${KAOLA_SESSION_ID}.startup.json`
exists and authorizes this exact project with `claim: "owned"` or
`claim: "acquired"` before doing phase work. Run the script-level verifier and
stop on failure:

```bash
node "$_CLAIM_JS" verify-startup --session "$KAOLA_SESSION_ID" --project "{project}" >/dev/null || {
  echo "Kaola-Workflow: startup receipt does not authorize {project}; run startup or explicit recovery instead."
  exit 1
}
```

Confirm that the startup receipt contains `workflow_path: fast`. If absent or
`workflow_path: full`, stop:

```text
Fast path requires KAOLA_PATH=fast at startup. Re-run /workflow-next with
KAOLA_PATH=fast set, or use the full workflow.
```

## Resume Detection

If `fast-summary.md` exists with status `PASSED`, fast path is complete. Route to:

```text
/kaola-workflow-phase6 {project}
```

Otherwise detect step:

- `fast-summary.md` absent → `plan`
- `fast-summary.md` has status `IN_PROGRESS` → `execute`
- `fast-summary.md` has status `REVIEW` → `review`
- `fast-summary.md` has `escalated_to_full` → escalation already triggered; do not resume fast path

## Mid-Flight Escalation

Escalate to the full workflow immediately when any of the following is detected
during Plan, Execute, or Review:

- scope is larger than a single file change or two closely related files
- more than 3 consecutive failing test cycles on the same test (`test_thrash` threshold)
- a security, architecture, or breaking-change concern surfaces
- a dependency on another in-flight issue is discovered
- the implementation requires new external packages

On escalation:

1. Write `escalated_to_full: <trigger>` to `workflow-state.md`.
2. Write a brief escalation note to `fast-summary.md` with status `ESCALATED`.
3. Stop and tell the user to re-run `/workflow-next {project}` without `KAOLA_PATH=fast`.

Do not continue fast-path execution after writing the escalation field.

## Step 1 - Plan (Single-Pass)

Read `phase1-research.md` and `phase2-ideation.md` if they exist. If both are
absent, derive scope directly from the GitHub issue body.

Produce a focused implementation plan:

- files to touch (must be ≤ 2 closely related files for fast path to apply)
- exact change per file
- acceptance check command

If files to touch exceed the fast-path bound, escalate per Mid-Flight Escalation above.

Update `workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: execute
workflow_path: fast
next_command: /kaola-workflow-fast {project}
```

Write a `fast-summary.md` stub with status `IN_PROGRESS`.

## Step 2 - Execute

Apply the plan changes directly. No ECC implementation agent is spawned for
fast-path; the main session implements inline.

Inline implementation constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- tests must be updated or added alongside the implementation change

After implementation, run the acceptance check command from Step 1.

If `test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on the same
test), escalate per Mid-Flight Escalation above.

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review

Run a lightweight self-review:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

If any concern fails the review, escalate per Mid-Flight Escalation above
unless it qualifies as a Trivial Inline Edit (one-line mechanical fix).

Update `fast-summary.md` status to `PASSED`.

## Write fast-summary.md

```markdown
# Fast Summary: {project}

## Status
PASSED | IN_PROGRESS | REVIEW | ESCALATED

## Scope
[files changed, acceptance criteria]

## Plan
[brief description of what was done]

## Implementation Evidence
[commands run, test output summary]

## Review
[self-review result]

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue to Phase 6

After `fast-summary.md` is `PASSED`, continue:

```text
/kaola-workflow-phase6 {project}
```
