---
name: kaola-workflow-review
description: Use when Phase 4 tasks are complete and Kaola-Workflow for Codex, also called kaola-workflow, needs quality review, optional security review, and review-fix routing.
---

# Kaola-Workflow Review

Phase 5 reviews completed work. Review findings come first; fixes are implemented only after classification.


## Goal Contract

Continue until quality review, conditional security review, review-fix routing,
and `phase5-review.md` are complete, then update `workflow-state.md` with
`next_skill: kaola-workflow-finalize {project}`. Stop only for true external
authorization, materially user-owned choices, or ambiguity that blocks
correctness.

## Inputs


Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase3-plan.md
kaola-workflow/{project}/phase4-progress.md
```

## Review Steps

1. Inspect changed files and task evidence.
2. Use the `code-reviewer` Codex agent role or `codex review` for a detached review pass. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable.
3. Check correctness, scope, naming, error handling, test coverage, debug statements, and validation evidence.
4. Run a security-sensitive file scan. If auth, payments, user data, filesystem access, external APIs, or secrets changed, use the `security-reviewer` Codex agent role. Record status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable.
5. Route CRITICAL/HIGH findings back to implementation before Phase 6. MEDIUM/LOW findings may become follow-ups.
6. Save raw review output to `.cache/code-reviewer.md` and `.cache/security-reviewer.md` when used.

## Mechanical Review Finalization (delegated to the contractor)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the current session's **judgment**: the session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and decides the verdict. It also keeps the quality-review and
security-review dispatches and the review-fix routing to `tdd-guide` (behavior
and test fixes) or `build-error-resolver` (build, type, lint, and tooling
fixes). The contractor never judges severity, never grades the review, never
gates Phase 6, and never dispatches a role.

Once the verdict is decided, the deterministic bookkeeping below — authoring
`phase5-review.md` from the template (the **Review Status** verdict, the
CRITICAL/HIGH/MEDIUM/LOW finding lists, the `## Required Agent Compliance` rows,
fixes-applied, and validation evidence) and advancing the `workflow-state.md`
pointer to `next_skill: kaola-workflow-finalize {project}` (preserving any
existing `## Sink` block byte-for-byte) — is delegated to the mechanical
`contractor` Codex agent role when that subagent is available; it writes the
durable bookkeeping files but copies the verdict and finding lists exactly as
the session hands them — it never restates, softens, upgrades, or re-grades the
verdict, never decides severity, never dispatches `code-reviewer`,
`security-reviewer`, `tdd-guide`, `build-error-resolver`, or any other role,
never routes or applies fixes, never acts as a review gate, and never asks the
user. It re-derives its own `$KAOLA_SCRIPTS` path if any script is needed,
captures real exit codes, and never gates on a piped `| tail`. The current
session keeps the review judgment and verdict.

## Phase File

```markdown
# Phase 5 - Review: {project}

## Code Review Findings
### CRITICAL
none
### HIGH
none
### MEDIUM/LOW
...

## Security Review
ran yes/no and reason

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| quality review | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/code-reviewer.md | |
| security review | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/security-reviewer.md or file-risk scan | reason if N/A |
| review-fix executors | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/review-fix-*.md | reason if N/A |

## Review Status
PASSED | PASSED WITH FOLLOW-UPS
```

Set `next_skill: kaola-workflow-finalize {project}`.
