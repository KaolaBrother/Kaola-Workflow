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

## Mechanical Review Finalization (script-owned transaction)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the current session's **judgment**: this session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and DECIDES the verdict. This script never judges severity, never
grades the review, and never gates Finalization — it only transcribes the verdict
the session hands it, verbatim. It refuses a `review_status` that is not `PASSED`
or `PASSED WITH FOLLOW-UPS` (typed refusal, zero mutation).

Once the verdict is decided, the deterministic bookkeeping — authoring
`phase5-review.md` from the session's verbatim content (the decided verdict, the
resolved CRITICAL/HIGH/MEDIUM/LOW finding lists, and the
`## Required Agent Compliance` rows), then advancing the `workflow-state.md`
pointer to `next_skill: kaola-workflow-finalize {project}` (preserving the
`## Sink` block) — is owned by the full-path transaction script
`kaola-gitea-workflow-full-advance.js` (ADR 0004), not a subagent. The script
authors the durable bookkeeping and transcribes the verdict verbatim but never
judges severity, never grades the review, never gates Finalization, never
dispatches code-reviewer/security-reviewer/tdd-guide/build-error-resolver or any
role, and never asks the user. The current session keeps the review dispatches,
the CRITICAL/HIGH triage, and the Review Status decision; it hands the decided
verdict and finding lists to the script as a JSON packet on stdin, and the script
writes them exactly as given.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction. Capture the real exit
code from the typed JSON, and never gate on a piped `| tail`:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitea-workflow-full-advance.js)")"

node "$KAOLA_SCRIPTS/kaola-gitea-workflow-full-advance.js" phase5-finalize \
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

The script renders `kaola-workflow/{project}/phase5-review.md` from the packet in
this shape (kept here as the rendered-shape reference):

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

The script renders the `## Required Agent Compliance` table RESOLVED from the
packet's `compliance` rows, then advances the `workflow-state.md` pointer
(`phase: 5` / `step: complete` / `next_command: /kaola-workflow-finalize {project}` /
`next_skill: kaola-workflow-finalize {project}`) in crash-safe order, idempotent on
resume, PRESERVING any existing `## Sink` block byte-for-byte.
