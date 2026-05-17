---
description: Kaola-Workflow Phase 3. Build the executable implementation plan and task write sets.
argument-hint: <project name>
---

# Kaola-Workflow Phase 3 - Plan

Phase 3 creates the executable blueprint. It turns the selected Phase 2 approach
into files, task order, write sets, dependencies, and validation commands.

## Prerequisite

`phase1-research.md` and `phase2-ideation.md` must exist. If not, stop and route
to the missing phase command.

Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase1-research.md
kaola-workflow/{project}/phase2-ideation.md
kaola-workflow/{project}/.cache/planner.md
kaola-workflow/{project}/.cache/advisor-ideation.md
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

If `phase3-plan.md` exists with no pending compliance rows, route to:

```text
/kaola-workflow-phase4 {project}
```

Otherwise detect:

- `.cache/architect.md` missing -> `architect`
- `.cache/advisor-plan.md` missing -> `advisor-gate`
- advisor found gaps and `.cache/architect-revision-N.md` missing -> `architect-revision`
- phase file missing -> `write-phase-file`
- advisor-reviewed plan complete -> `phase4-ready`

## Hard Gates

- Do not implement code in Phase 3.
- Do not silently change the selected Phase 2 approach.
- If the advisor finds blueprint gaps, route the revision back to
  `code-architect`; the main session may synthesize but must not become the
  architect.
- Save every advisor and architect revision output under `.cache/`.
- Continue to Phase 4 after the advisor-reviewed blueprint is complete. Ask the
  user only for true external authorization or materially user-owned choices.

## Step 1 - Code Architect

Update `workflow-state.md`:

```text
phase: 3
phase_name: Plan
step: architect
next_command: /kaola-workflow-phase3 {project}
main_session_role: orchestrator
implementation_owner: N/A
fix_owner: code-architect for blueprint revisions
inline_emergency_fallback_authorized: no
```

Invoke ECC `code-architect` with relevant excerpts from Phase 1 and Phase 2.
Ask for:

- files to create: path, purpose, key interfaces
- files to modify: path, specific changes, why
- build sequence ordered by dependency
- task ownership and write set for each task
- parallelization groups with disjoint write sets
- required imports and external dependencies
- test file locations following Phase 1 patterns
- explicit out-of-scope items

Write raw output to:

```text
kaola-workflow/{project}/.cache/architect.md
```

## Step 2 - Advisor Gate

Consult the configured Claude Code advisor. Ask:

- Is the build sequence dependency-safe?
- Are files or integration points missing?
- Could a developer implement this from the plan alone?
- Are edge cases or error paths missing?

Write output to:

```text
kaola-workflow/{project}/.cache/advisor-plan.md
```

## Step 3 - Architect Revision Loop

If the advisor finds gaps, invoke `code-architect` again with:

- original `.cache/architect.md`
- `.cache/advisor-plan.md`
- the exact requested corrections

Write each revision to:

```text
kaola-workflow/{project}/.cache/architect-revision-{n}.md
```

After three architect-revision attempts without a complete blueprint, stop and
ask the user.

## Step 4 - Write Phase File

Create `kaola-workflow/{project}/phase3-plan.md`:

```markdown
# Phase 3 - Plan: {project}

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| path/to/file | ... | ... |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| path/to/file | ... | ... |

### Build Sequence
1. [step - dependency reason]
2. ...

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2 | disjoint files |

### External Dependencies
[packages/imports needed]

## Task List

### Task 1: [Name]
- File: path/to/file
- Test File: path/to/test-file
- Write Set: path/to/file, path/to/test-file
- Depends On: none | Task N
- Parallel Group: A | B | serial
- Action: CREATE | MODIFY
- Implement: [specific logic]
- Mirror: [pattern from phase1-research.md]
- Validate: [exact command]

## Advisor Notes
[summary from .cache/advisor-plan.md]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked/N/A | .cache/architect-revision-*.md | [reason if N/A] |
```

## Step 5 - Continue To Phase 4

Record the task list and validation commands, then continue to Phase 4. Do not
ask the user to confirm internal workflow execution.

Update `workflow-state.md`:

```text
phase: 3
step: complete
next_command: /kaola-workflow-phase4 {project}
```
