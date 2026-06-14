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
5. Route CRITICAL/HIGH findings back to implementation before Finalization. MEDIUM/LOW findings may become follow-ups.
6. Save raw review output to `.cache/code-reviewer.md` and `.cache/security-reviewer.md` when used.

## Mechanical Review Finalization (script-owned transaction)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the current session's **judgment**: the session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and decides the verdict. It also keeps the quality-review and
security-review dispatches and the review-fix routing to `tdd-guide` (behavior
and test fixes) or `build-error-resolver` (build, type, lint, and tooling
fixes). This script never judges severity, never grades the review, never
gates Finalization, and never dispatches a role. It refuses a `review_status`
that is not `PASSED` or `PASSED WITH FOLLOW-UPS` (typed refusal, zero mutation).

Once the verdict is decided, the deterministic bookkeeping below — authoring
`phase5-review.md` from the template (the **Review Status** verdict, the
CRITICAL/HIGH/MEDIUM/LOW finding lists, the `## Required Agent Compliance` rows,
fixes-applied, and validation evidence) and advancing the `workflow-state.md`
pointer to `next_skill: kaola-workflow-finalize {project}` (preserving any
existing `## Sink` block byte-for-byte) — is owned by the full-path transaction
script `kaola-workflow-full-advance.js` (ADR 0004), not a subagent. The session
runs it directly, handing the decided Review Status and the resolved
CRITICAL/HIGH/MEDIUM/LOW finding lists as a JSON packet on stdin; the script
writes the durable bookkeeping files but copies the verdict and finding lists
exactly as the session hands them — it never restates, softens, upgrades, or
re-grades the verdict, never decides severity, never dispatches `code-reviewer`,
`security-reviewer`, `tdd-guide`, `build-error-resolver`, or any other role,
never routes or applies fixes, never acts as a review gate, and never asks the
user. It renders the phase file (with a RESOLVED `## Required Agent Compliance`
table) and advances the pointer in crash-safe order, idempotent on resume. The
current session keeps the review judgment and verdict.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-full-advance.js' -print -quit 2>/dev/null)")"
fi

node "$KAOLA_SCRIPTS/kaola-workflow-full-advance.js" phase5-finalize \
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

## Phase File

The script writes `kaola-workflow/{project}/phase5-review.md` in this shape
(rendered from the packet); it is reproduced here as the durable contract:

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

The compliance rows are Codex role rows: each role is still delegated to its
Codex subagent (only the mechanical bookkeeping moved to the transaction
script). The script renders each row as `invoked` by default; to record the real
delegation status — `subagent-invoked` when the role was delegated to the Codex
subagent, `local-fallback-explicit` when you executed locally with explicit user
authorization, or `local-fallback-tool-unavailable` when subagent tooling was
unavailable — override that row by passing a `compliance` array in the packet
(one `{requirement,status,evidence,skip_reason}` object per row).

The script then advances `workflow-state.md` to `phase: 5` / `step: complete` /
`next_skill: kaola-workflow-finalize {project}`, PRESERVING any existing
`## Sink` block byte-for-byte.
