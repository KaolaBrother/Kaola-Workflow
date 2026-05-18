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
2. Use the `code-reviewer` Codex agent role or `codex review` when useful for a detached review pass; otherwise perform a review stance locally.
3. Check correctness, scope, naming, error handling, test coverage, debug statements, and validation evidence.
4. Run a security-sensitive file scan. If auth, payments, user data, filesystem access, external APIs, or secrets changed, use the `security-reviewer` Codex agent role or perform the same security review locally.
5. Route CRITICAL/HIGH findings back to implementation before Phase 6. MEDIUM/LOW findings may become follow-ups.
6. Save raw review output to `.cache/code-reviewer.md` and `.cache/security-reviewer.md` when used.

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
| quality review | invoked | .cache/code-reviewer.md | |
| security review | invoked/N/A | .cache/security-reviewer.md or file-risk scan | reason if N/A |
| review-fix executors | invoked/N/A | .cache/review-fix-*.md | reason if N/A |

## Review Status
PASSED | PASSED WITH FOLLOW-UPS
```

Set `next_skill: kaola-workflow-finalize {project}`.
