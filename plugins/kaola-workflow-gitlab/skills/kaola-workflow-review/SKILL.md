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
5. Route CRITICAL/HIGH findings back to implementation before Finalization. MEDIUM/LOW findings may become follow-ups. Behavior/test fixes route to the `tdd-guide` Codex agent role; build/type/lint/tooling fixes route to the `build-error-resolver` Codex agent role; save each fix-agent output to `.cache/review-fix-*.md`.
6. Save raw review output to `.cache/code-reviewer.md` and `.cache/security-reviewer.md` when used.

## Mechanical Review Finalization

The deterministic bookkeeping below — authoring `phase5-review.md` from the template and advancing the `workflow-state.md` pointer (`next_skill: kaola-workflow-finalize {project}`, preserving the `## Sink` block byte-for-byte) — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any needed script (re-deriving its own `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-claim.js"` path, capturing real exit codes and never gating on a piped `| tail`) and authors the durable bookkeeping but never dispatches code-reviewer/security-reviewer/tdd-guide/build-error-resolver or any role, never judges severity, never triages or routes findings, never acts as a review gate, and never asks the user. The current session keeps the review dispatches, the CRITICAL/HIGH triage, the review-fix routing, and the **Review Status** verdict decision. Because the verdict is the current session's judgment, decide the `PASSED` / `PASSED WITH FOLLOW-UPS` status and the resolved CRITICAL/HIGH/MEDIUM/LOW finding lists first, then hand them into the contractor so it transcribes them verbatim into the **Review Status** line and the `## Required Agent Compliance` rows — the contractor copies the verdict as given and does not restate, soften, upgrade, or re-grade it.

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
