---
name: kaola-workflow-plan
description: Use when Kaola-Workflow for Codex, also called kaola-workflow, has selected an approach and needs an executable implementation blueprint.
---

# Kaola-Workflow Plan

Phase 3 turns the selected strategy into a dependency-safe plan. Do not edit product code in this phase.


## Goal Contract

Continue until Phase 3 has a dependency-safe blueprint, expert review evidence,
any required revisions, `phase3-plan.md`, and `workflow-state.md` pointing to
`next_skill: kaola-workflow-execute {project}`. Stop only for true external
authorization, materially user-owned choices, or ambiguity that blocks
correctness.

## Prerequisite


Read `workflow-state.md`, `phase1-research.md`, and `phase2-ideation.md`.

## Blueprint Requirements

Write `kaola-workflow/{project}/phase3-plan.md` with:

- files to create or modify
- purpose and key interfaces
- ordered build sequence with dependency reasons
- per-task write set
- test file locations
- exact validation commands
- safe parallel groups only when write sets are disjoint
- explicit out-of-scope items

Use the `code-architect` Codex agent role for the blueprint step. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable. Then review the blueprint yourself for completeness; if you find gaps, revise the blueprint before execution.

## Task Template

```markdown
### Task 1: Name
- File: path/to/file
- Test File: path/to/test
- Write Set: path/to/file, path/to/test
- Depends On: none
- Parallel Group: serial
- Action: CREATE | MODIFY
- Implement: exact behavior
- Mirror: pattern from phase1-research.md
- Validate: exact command
```

## Required Agent Compliance

Plain `invoked` is intentional for non-Codex-role workflow gates; delegation
vocabulary applies only to Codex role rows like `code-architect`.

```markdown
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/code-architect.md | |
| blueprint revisions | invoked/N/A | .cache/architect-revision-*.md | reason if N/A |
```

## Write Phase File (script-owned transaction)

The deterministic bookkeeping below — authoring `phase3-plan.md` by transcribing the
blueprint and task write sets (using the Task Template above) plus the
`## Required Agent Compliance` table, and the `workflow-state.md` checkpoint write
(`next_skill: kaola-workflow-execute {project}`, preserving any existing `## Sink`
block byte-for-byte) — is owned by the full-path transaction script
`kaola-workflow-full-advance.js` (ADR 0004), not a subagent. The script runs the
durable bookkeeping but never invokes `code-architect`, never designs or re-plans,
and never judges, asks the user, or changes the selected Phase 2 approach. The
current session keeps the `code-architect` dispatch, the revision decision, and the
blueprint-completeness judgment, then hands the judged-complete evidence (the
blueprint and task list transcribed verbatim from `.cache/code-architect.md` plus
any `.cache/architect-revision-*.md`) to the script for verbatim transcription.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-full-advance.js' -print -quit 2>/dev/null)")"
fi

node "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" phase3-finalize \
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

The `task_list` MUST keep one `- Write Set:` line per task (using the Task Template
above) — the parallel-overlap classifier reads those declared paths. The script
renders `kaola-workflow/{project}/phase3-plan.md` from the packet (with a RESOLVED
`## Required Agent Compliance` table) and advances the state pointer in crash-safe
order, idempotent on resume. It PRESERVES any existing `## Sink` block in
`workflow-state.md` byte-for-byte and stamps the completion checkpoint:

```text
phase: 3
step: complete
next_command: /kaola-workflow-phase4 {project}
next_skill: kaola-workflow-execute {project}
```

Override a compliance row (for example to record the real Codex delegation status —
`subagent-invoked`, `local-fallback-explicit`, or `local-fallback-tool-unavailable`
for the `code-architect` row) by setting that object's `status` in the packet's
`compliance` array.

Once the script reports `result: ok` and the phase file plus compliance rows are
complete, the session continues to Phase 4. Do not ask the user to approve routine
internal workflow execution.
