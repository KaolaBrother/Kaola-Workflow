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

## Mechanical Review Finalization (script-owned transaction)

The deterministic bookkeeping below — authoring `phase5-review.md` from the template and advancing the `workflow-state.md` pointer (`next_skill: kaola-workflow-finalize {project}`, preserving the `## Sink` block byte-for-byte) — is owned by the full-path transaction script `kaola-gitlab-workflow-full-advance.js` (ADR 0004), not a subagent. The script authors the durable bookkeeping but never dispatches code-reviewer/security-reviewer/tdd-guide/build-error-resolver or any role, never judges severity, never triages or routes findings, never acts as a review gate, and never asks the user. The current session keeps the review dispatches, the CRITICAL/HIGH triage, the review-fix routing, and the **Review Status** verdict decision. Because the verdict is the current session's judgment, decide the `PASSED` / `PASSED WITH FOLLOW-UPS` status and the resolved CRITICAL/HIGH/MEDIUM/LOW finding lists first, then hand them to the script so it transcribes them verbatim into the **Review Status** line and the `## Required Agent Compliance` rows — the script copies the verdict as given and does not restate, soften, upgrade, or re-grade it. It refuses a `review_status` that is not `PASSED` or `PASSED WITH FOLLOW-UPS` (typed refusal, zero mutation).

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow-gitlab/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-gitlab-workflow-full-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-full-advance.js' -print -quit 2>/dev/null)")"
fi

node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-full-advance.js" phase5-finalize \
  --project {project} --stdin --json <<'PACKET'
{
  "review_status": "PASSED",
  "code_review_findings": "### CRITICAL\nnone\n### HIGH\nnone\n### MEDIUM/LOW\n<list>",
  "security_review": "ran: yes/no and reason\n### Findings\n<list or none>",
  "fixes_applied": "<list or none>",
  "validation_evidence": "<commands run/delegated/cited, result, evidence path>",
  "followups": "<MEDIUM/LOW deferred or none>",
  "compliance": [
    { "requirement": "code-reviewer", "status": "invoked", "evidence": ".cache/code-reviewer.md" },
    { "requirement": "security-reviewer", "status": "n/a", "skip_reason": "no security-sensitive files in write set" },
    { "requirement": "review-fix executors", "status": "n/a", "skip_reason": "no CRITICAL/HIGH findings" }
  ]
}
PACKET
```

The script renders `kaola-workflow/{project}/phase5-review.md` (with a RESOLVED `## Required Agent Compliance` table) from the packet, then advances the `workflow-state.md` pointer (phase: 5 / step: complete / next_command: /kaola-workflow-finalize {project} / next_skill: kaola-workflow-finalize {project}), PRESERVING any existing `## Sink` block byte-for-byte. The transcription order is crash-safe and idempotent on resume.

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

## Fixes Applied
[list]

## Validation Evidence
[commands run/delegated/cited, result, evidence path]

## Follow-Up Items
[MEDIUM/LOW deferred]

## Review Status
PASSED | PASSED WITH FOLLOW-UPS
```

Set `next_skill: kaola-workflow-finalize {project}`.
