---
name: kaola-workflow-fast
description: Use when executing a single-pass Plan+Execute+Review fast path for a small, well-scoped kaola-workflow issue. Writes fast-summary.md and gates Phase 6.
---

# Skill: kaola-workflow-fast

Single-pass Plan+Execute+Review for small, well-scoped issues. Writes
`fast-summary.md` and gates Phase 6. Mirror of `commands/kaola-workflow-fast.md`
for Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`
throughout.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Phase 6 accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

Fast applies only to mechanical, single-area changes of ≤ 5 files with exactly one sensible approach; ≥ 2 materially-different viable approaches is a design choice that stays on full. Escalate (`escalated_to_full: <trigger> — <detail>`) on `approach_ambiguity`, scope past the declared write set by >1 file or the absolute backstop of 6, `test_thrash` (≥3), security/architecture/breaking-change, discovered dependency, or new external package.

## Step 1 - Plan (planner)

Ensure `kaola-workflow/{project}/.cache/` exists before invoking agents.

Update `workflow-state.md` with `step: plan`, `main_session_role: orchestrator`, `implementation_owner: planner`, `inline_emergency_fallback_authorized: no`.

Invoke the `planner` Codex agent role with the linked Gitea issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate. The orchestrator captures the returned plan into `fast-summary.md` with status `IN_PROGRESS` (planner has Read-only tools).

## Step 2 - Execute (tdd-guide)

Update `workflow-state.md` with `step: execute`, `main_session_role: orchestrator`, `implementation_owner: tdd-guide`, `inline_emergency_fallback_authorized: no`.

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

Orchestrator runs acceptance check after agent returns. Escalate on `test_thrash` threshold.

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review (code-reviewer)

Update `workflow-state.md` with `step: review`, `main_session_role: orchestrator`, `implementation_owner: code-reviewer`, `inline_emergency_fallback_authorized: no`.

Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).

Invoke the `code-reviewer` Codex agent role on modified files. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

On BLOCK or CRITICAL/HIGH finding, escalate unless Trivial Inline Edit. In that exempted case, orchestrator applies the fix and records `implementation_owner: orchestrator-trivial-fix`.

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
[review result]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/planner.md | |
| tdd-guide | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/tdd-guide.md | |
| code-reviewer | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/code-reviewer.md | N/A only for trivial band (single docs/comment/markdown edit) self-review |

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Delegation Vocabulary

The `planner`, `tdd-guide`, and `code-reviewer` rows are Codex role rows: record their Status with the delegation vocabulary — `subagent-invoked` when the role was delegated to the Codex subagent, `local-fallback-explicit` when you executed locally with explicit user authorization, or `local-fallback-tool-unavailable` when subagent tooling was unavailable. `code-reviewer` may be `N/A` (with a skip reason) only in the trivial band (a single docs/comment/markdown edit) where self-review applies; any change touching more than one file or a production-path file (outside `docs/`, `*.md`, `tests/`) requires a delegated review status.

## Continue

After `PASSED`, route to `kaola-workflow-finalize {project}`.
