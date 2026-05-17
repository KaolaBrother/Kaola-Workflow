---
name: kaola-workflow-fast
description: Use when executing a single-pass Plan+Execute+Review fast path for a small, well-scoped kaola-workflow issue. Writes fast-summary.md and gates Phase 6.
---

# Skill: kaola-workflow-fast

Single-pass Plan+Execute+Review for small, well-scoped issues. Writes
`fast-summary.md` and gates Phase 6. Mirror of `commands/kaola-workflow-fast.md`
for Codex runtime. Reads and updates `workflow-state.md` throughout.

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

Verify that `kaola-workflow/.sessions/${KAOLA_SESSION_ID}.startup.json` exists
and authorizes this exact project with `claim: "owned"` or `claim: "acquired"`.

```bash
node "$_CLAIM_JS" verify-startup --session "$KAOLA_SESSION_ID" --project "{project}" >/dev/null || {
  echo "Kaola-Workflow: startup receipt does not authorize {project}; run startup or explicit recovery instead."
  exit 1
}
```

Confirm startup receipt contains `workflow_path: fast`. If absent or
`workflow_path: full`, stop and instruct the agent to re-run with `KAOLA_PATH=fast`.

## Mid-Flight Escalation

Escalate immediately when:

- scope exceeds one file or two closely related files
- `test_thrash`: ≥ 3 consecutive RED→RED cycles on the same test
- security, architecture, or breaking-change concern surfaces
- dependency on another in-flight issue is discovered
- implementation requires new external packages

On escalation:

1. Write `escalated_to_full: <trigger>` to `workflow-state.md`.
2. Write escalation note to `fast-summary.md` with status `ESCALATED`.
3. Stop. Do not continue fast-path after writing the escalation field.

## Step 1 - Plan

Read `phase1-research.md` and `phase2-ideation.md` if present; derive from
issue body if both absent.

Files to touch must be ≤ 2 closely related files. If exceeded, escalate.

Update `workflow-state.md`:

```text
phase: fast
workflow_path: fast
step: execute
next_command: /kaola-workflow-fast {project}
```

Write `fast-summary.md` stub with status `IN_PROGRESS`.

## Step 2 - Execute

Apply changes inline (no ECC implementation agent). Constraints:

- no new external package dependencies
- no public API, schema, or shared infrastructure changes
- tests updated or added alongside implementation

Run acceptance check after implementation. Escalate on `test_thrash` threshold.

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review

Self-review checklist:

- acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan

On failure (unless Trivial Inline Edit), escalate.

Update `fast-summary.md` status to `PASSED`.

## fast-summary.md Format

```markdown
# Fast Summary: {project}

## Status
PASSED | IN_PROGRESS | REVIEW | ESCALATED

## Scope
[files changed, acceptance criteria]

## Plan
[brief description]

## Implementation Evidence
[commands run, test output summary]

## Review
[self-review result]

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue

After `PASSED`, route to `/kaola-workflow-phase6 {project}`.
