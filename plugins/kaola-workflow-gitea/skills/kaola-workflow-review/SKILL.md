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
5. Route CRITICAL/HIGH findings back to implementation before Finalization. MEDIUM/LOW findings may become follow-ups. Route behavior/test/coverage corrections to the `tdd-guide` Codex agent role and build/type/lint/tooling corrections to the `build-error-resolver` Codex agent role; for a security-sensitive correction, re-run the `security-reviewer` Codex agent role after the fix. Record each fix-routing status as `subagent-invoked` in the compliance ledger if delegation occurred, `local-fallback-explicit` if the user explicitly authorized local execution, or `local-fallback-tool-unavailable` if the subagent tooling was unavailable. Save each fix-agent output to `.cache/review-fix-{n}.md`.
6. Save raw review output to `.cache/code-reviewer.md` and `.cache/security-reviewer.md` when used.

## Mechanical Review Finalization (delegated to the contractor)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the current session's **judgment**: this session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and DECIDES the verdict. Once the verdict is decided, the
deterministic bookkeeping below — authoring `phase5-review.md` from the template
with the decided verdict, the resolved CRITICAL/HIGH/MEDIUM/LOW finding lists,
and the `## Required Agent Compliance` rows, then advancing the
`workflow-state.md` pointer to `next_skill: kaola-workflow-finalize {project}`
(preserving the `## Sink` block) — is delegated to the mechanical `contractor`
Codex agent role when that subagent is available; it authors the durable
bookkeeping and transcribes the verdict verbatim but never judges severity,
never grades the review, never gates Finalization, never dispatches
code-reviewer/security-reviewer/tdd-guide/build-error-resolver or any role, and
never asks the user. The current session keeps the review dispatches, the
CRITICAL/HIGH triage, and the Review Status decision; it hands the decided
verdict and finding lists into the delegation, and the contractor writes them
exactly as given. Re-derive any needed forge script as
`$KAOLA_SCRIPTS/kaola-gitea-workflow-*.js`, capture real exit codes, and never
gate on a piped `| tail`.

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
