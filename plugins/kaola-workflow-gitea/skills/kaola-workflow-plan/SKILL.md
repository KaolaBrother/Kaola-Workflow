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

### Mechanical Bookkeeping (script-owned transaction)

The deterministic bookkeeping below — transcribing the `code-architect` blueprint and task list into `phase3-plan.md` (using the Blueprint Requirements and Task Template above) and the `workflow-state.md` checkpoint write (`next_skill: kaola-workflow-execute {project}`, preserving the `## Sink` block) — is owned by the full-path transaction script `kaola-gitea-workflow-full-advance.js`, not a subagent; this script runs the scripted transition and authors the durable bookkeeping but never designs or re-plans, never dispatches `code-architect`, never judges, and never changes the selected approach. The main session keeps approach selection, the `code-architect` dispatch and the blueprint-complete judgment, and the revision decisions; it hands the judged-complete blueprint into the script, which transcribes the architect's evidence verbatim. The script only transcribes — capture real exit codes from its typed JSON and never gate on a piped `| tail`.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitea-workflow-full-advance.js)")"

node "$KAOLA_SCRIPTS/kaola-gitea-workflow-full-advance.js" phase3-finalize \
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

The `task_list` MUST keep one `- Write Set:` line per task — the parallel-overlap classifier reads those declared paths. The script renders `phase3-plan.md` in the shape of the Task Template and `## Required Agent Compliance` table above (with a RESOLVED compliance table), then advances the state pointer in crash-safe order, idempotent on resume: it writes the `next_skill: kaola-workflow-execute {project}` checkpoint (`phase: 3`, `step: complete`) and PRESERVES any existing `## Sink` block byte-for-byte. Do not ask the user to approve routine internal workflow execution.
