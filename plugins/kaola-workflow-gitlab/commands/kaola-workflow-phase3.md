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
```

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.
You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown — do not omit the `model=` line.

## Resume Detection

If `phase3-plan.md` exists with no pending compliance rows, route to:

```text
/kaola-workflow-phase4 {project}
```

Otherwise detect:

- `.cache/architect.md` missing -> `architect`
- blueprint has gaps and `.cache/architect-revision-N.md` missing -> `architect-revision`
- phase file missing -> `write-phase-file`
- blueprint complete -> `phase4-ready`

## Hard Gates

- Do not implement code in Phase 3.
- Do not silently change the selected Phase 2 approach.
- If you (the orchestrator) judge the blueprint has gaps, route the revision back
  to `code-architect`; the main session may synthesize but must not become the
  architect.
- Save every architect revision output under `.cache/`.
- Continue to Phase 4 after the blueprint is complete. Ask the user only for true
  external authorization or materially user-owned choices.

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

Invoke the Claude Code agent `code-architect` with
relevant excerpts from Phase 1 and Phase 2:

```text
Agent(
  subagent_type="code-architect",
  model="{CODE_ARCHITECT_MODEL}",
  description="Plan {project}",
  prompt="..."
)
```

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

## Step 2 - Architect Revision Loop

Evaluate the `code-architect` blueprint for completeness yourself (the orchestrator
makes the gap judgment — is the build sequence dependency-safe? are files or
integration points missing? could a developer implement this from the plan alone?
are edge cases or error paths missing?). If you judge the blueprint has gaps,
invoke `code-architect` again with the same `CODE_ARCHITECT_MODEL` explicit model
dispatch and:

- original `.cache/architect.md`
- the exact requested corrections

Write each revision to:

```text
kaola-workflow/{project}/.cache/architect-revision-{n}.md
```

After three architect-revision attempts without a complete blueprint, stop and
ask the user.

## Step 3 - Write Phase File (script-owned transaction)

The blueprint and task list are a mechanical transcription of the `code-architect`
output. The main session has already judged the blueprint complete; this script
only transcribes the architect's evidence into the durable phase file and records
the completion checkpoint. It does not design, judge, or alter the selected approach.

The mechanical bookkeeping — authoring `phase3-plan.md` from the orchestrator's
verbatim content and advancing the `workflow-state.md` pointer — is owned by the
full-path transaction script `kaola-gitlab-workflow-full-advance.js` (ADR 0004), not a
subagent. The main session runs it directly, handing the blueprint and task list
(transcribed verbatim from `.cache/architect.md` plus any
`.cache/architect-revision-*.md`) as a JSON packet on stdin; the script renders the
phase file (with a RESOLVED `## Required Agent Compliance` table) and advances the
pointer in crash-safe order, idempotent on resume.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitlab-workflow-full-advance.js)")"

node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-full-advance.js" phase3-finalize \
  --project {project} --stdin --json <<'PACKET'
{
  "blueprint": "<Blueprint body: Files to Create/Modify, Build Sequence, Parallelization Plan, External Dependencies>",
  "task_list": "<Task List body: one ### Task N block per task, each with a `- Write Set:` line>",
  "compliance": [
    { "requirement": "code-architect", "status": "invoked", "evidence": ".cache/architect.md" },
    { "requirement": "architect revisions", "status": "n/a", "skip_reason": "no revision needed" }
  ]
}
PACKET
```

The `task_list` MUST keep one `- Write Set:` line per task — the parallel-overlap
classifier reads those declared paths. The script writes
`kaola-workflow/{project}/phase3-plan.md` in this shape (rendered from the packet):

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

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| architect revisions | invoked/N/A | .cache/architect-revision-*.md | [reason if N/A] |
```

## Step 4 - Continue To Phase 4

The script performs this completion checkpoint as part of the `phase3-finalize`
transaction, updating `workflow-state.md` and PRESERVING any existing `## Sink`
block byte-for-byte:

```text
phase: 3
step: complete
next_command: /kaola-workflow-phase4 {project}
next_skill: kaola-workflow-execute {project}
```

Once the script reports `result: ok` and the phase file plus compliance rows are
complete, the main session continues to Phase 4. Do not ask the user to confirm
internal workflow execution.
