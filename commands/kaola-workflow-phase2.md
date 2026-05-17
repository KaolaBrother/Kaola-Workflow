---
description: Kaola-Workflow Phase 2. Ideation and strategy selection grounded in Phase 1 facts.
argument-hint: <project name>
---

# Kaola-Workflow Phase 2 - Ideation

Phase 2 compares approaches and records the selected strategy. It does not write
implementation code or reopen broad research unless Phase 1 facts are missing.

## Prerequisite

`kaola-workflow/{project}/phase1-research.md` must exist. If missing, stop:

```text
Phase 1 is not complete. Run /kaola-workflow-phase1 first.
```

Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/.cache/code-explorer.md
kaola-workflow/{project}/.cache/docs-lookup.md
```

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

## Resume Detection

If `phase2-ideation.md` exists and all `Required Agent Compliance` rows are
complete, route to:

```text
/kaola-workflow-phase3 {project}
```

Otherwise detect the step:

- `.cache/planner.md` missing -> `planner`
- `.cache/advisor-ideation.md` missing -> `advisor-gate`
- selected approach missing -> `internal-selection`
- phase file missing -> `write-phase-file`

Update `workflow-state.md` before continuing.

## Hard Gates

- Do not invent facts missing from Phase 1.
- If a required fact is missing, stop and return to Phase 1 with a focused
  `code-explorer` or `docs-lookup` request.
- Use `planner` for deep approach analysis.
- Save advisor output to `.cache/advisor-ideation.md`; do not keep it only in
  conversation memory.
- Do not stop for routine strategy selection. After planner/advisor review,
  choose the recommended approach internally, apply it, and record the rationale.
- Ask the user only when the choice is materially user-owned or the advisor
  identifies ambiguity that blocks a correct technical decision.

## Step 1 - Planner

Update state:

```text
phase: 2
phase_name: Ideation
step: planner
next_command: /kaola-workflow-phase2 {project}
main_session_role: orchestrator
implementation_owner: N/A
fix_owner: planner for missing strategy analysis
inline_emergency_fallback_authorized: no
```

Invoke ECC `planner` with relevant Phase 1 excerpts only. Ask for:

- 2-3 implementation approaches
- pros, cons, risks, complexity
- architectural fit
- recommended option with rationale
- explicit items not to build
- missing facts if any

Write raw output to:

```text
kaola-workflow/{project}/.cache/planner.md
```

## Step 2 - Advisor Gate

Consult the configured Claude Code advisor. If unavailable, stop and tell the
user to enable an Opus advisor before continuing.

Ask the advisor:

- Any missed approaches?
- Are risks accurate?
- Is the recommendation sound?
- Any gotchas that should change the decision?

Write the advisor response to:

```text
kaola-workflow/{project}/.cache/advisor-ideation.md
```

## Step 3 - Internal Selection

Choose the advisor-reviewed recommended option. Record the selected approach,
rationale, and any rejected alternatives in `phase2-ideation.md`. Do not ask the
user to approve the strategy unless the decision is materially user-owned.

## Step 4 - Write Phase File

Create `kaola-workflow/{project}/phase2-ideation.md`:

```markdown
# Phase 2 - Ideation: {project}

## Approaches Evaluated

### Option A: [Name]
- Summary: ...
- Pros: ...
- Cons: ...
- Risk: High/Medium/Low
- Complexity: Small/Medium/Large/XL

### Option B: [Name]
...

## Advisor Findings
[summary of .cache/advisor-ideation.md]

## Selected Approach
[name + reason]

## Out of Scope (explicit)
[what will not be built]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| advisor ideation gate | invoked | .cache/advisor-ideation.md | |
```

Update `workflow-state.md`:

```text
phase: 2
step: complete
next_command: /kaola-workflow-phase3 {project}
```
