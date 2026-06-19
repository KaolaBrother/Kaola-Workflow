---
description: Kaola-Workflow Phase 5. Review, security review, and delegated review-fix loop.
---

# Kaola-Workflow Phase 5 - Review

Phase 5 reviews completed Phase 4 work. Review agents review only; do not edit
files. Fixes are routed to implementation/fix agents and then re-reviewed.
The main session may run small targeted validation commands for classification,
but delegates expensive/noisy validation and does not own implementation edits.

## Prerequisite

`phase4-progress.md` must exist with all tasks complete. If missing or tasks are
pending, stop:

```text
Phase 4 is not complete. Run /kaola-workflow-phase4 first.
```

Read:

```text
kaola-workflow/{project}/workflow-state.md
kaola-workflow/{project}/phase3-plan.md
kaola-workflow/{project}/phase4-progress.md
```

## Resume Detection

- `.cache/code-reviewer.md` missing -> `code-review`
- security-sensitive files touched and `.cache/security-reviewer.md` missing ->
  `security-review`
- CRITICAL/HIGH review findings unresolved -> `route-review-fixes`
- fix cache exists but reviewer not re-run -> `re-review`
- `phase5-review.md` missing -> `write-phase-file`
- `phase5-review.md` complete -> route to `/kaola-workflow-finalize {project}`

If ambiguous, stop and ask.

## Hard Gates

- `code-reviewer` is always required.
- `security-reviewer` is required when touched files involve auth, payments,
  user data, filesystem access, external API calls, or secrets.
- `security-reviewer` must be instructed: review only; do not edit files.
- `code-reviewer` must be instructed: review only; do not edit files.
- Review fixes are subagent-executed. Do not apply review fixes inline unless
  the Trivial Inline Edit Exception applies or explicit emergency fallback
  authorization is recorded.
- CRITICAL and HIGH findings block Finalization.

## Agent Model Badge

opencode resolves each subagent effort centrally from `opencode.json` (the two Kaola
tiers as reasoning-EFFORT VARIANTS of the inherited model): reasoning-tier roles run the
model's TOP effort variant, standard-tier roles its SECOND (e.g. max / high on GLM-5.2).
Dispatch a role with the `task` tool using `subagent_type: "<role>"`; do NOT pass a
per-call `model=` argument — the role's configured variant already selects the effort.
`mapTier(tier, provider)` resolves the variant: opus → top, sonnet → second.

## Validation Delegation Policy

The main session may run small targeted commands by default when they help
classify or confirm a review finding:

- one focused test file or test case
- one lint/typecheck command scoped to changed files
- one quick command that confirms a reviewer finding is real

The main session must delegate expensive or noisy validation by default:

- broad test, lint, typecheck, build, or coverage commands
- repeated reproduction of an already-classified failure
- validation after non-trivial review fixes

Delegated validation should use a fresh validation subagent when available, or
the relevant fix agent (`tdd-guide` for behavior/test findings,
`build-error-resolver` for build/type/lint/tooling findings). Raw output goes
to:

Route behavior/test fixes to the Claude Code agent `tdd-guide`:

```text
Agent(
  subagent_type="tdd-guide",
  description="Routed fix: task {n}",
  prompt="..."
)
```

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

```text
Agent(
  subagent_type="build-error-resolver",
  description="Routed fix: task {n}",
  prompt="..."
)
```

```text
kaola-workflow/{project}/.cache/review-validation-{n}.md
```

The main session records the compact result in `phase5-review.md`: command,
pass/fail, short failure summary, classification, evidence path, and route.

## Validation De-Duplication

Avoid redundant validation runs.

- Phase 5 does not rerun the whole Phase 4 validation set only because review
  started.
- If review finds no blocking issue, cite Phase 4 validation evidence.
- After a review fix, rerun only the command that proves the fix and any command
  required by the finding.
- If the same command already passed against the same relevant file set and no
  relevant files changed afterward, cite the prior evidence path instead of
  rerunning it.
- Leave full fresh validation to Finalization.

## Trivial Inline Edit Exception

The main session may make a trivial inline edit without emergency fallback only
when all conditions are true:

- the edit is one line or mechanically obvious
- no behavior, API, security, architecture, test intent, or design judgment is
  required
- it fixes review-record friction, formatting, an unused import, a typo, import
  ordering, or an obvious generated path/name mistake
- it stays inside the approved Phase 4 write set
- it is recorded in `phase5-review.md` or `workflow-state.md`
- affected validation is rerun or prior valid evidence is cited under
  Validation De-Duplication

Anything else is routed to `tdd-guide` or `build-error-resolver`, then
re-reviewed.

## Step 1 - Quality Review

Update `workflow-state.md`:

```text
phase: 5
phase_name: Review
step: code-review
next_command: /kaola-workflow-phase5 {project}
main_session_role: orchestrator
implementation_owner: tdd-guide for behavior fixes
fix_owner: tdd-guide or build-error-resolver
inline_emergency_fallback_authorized: no
```

Invoke the Claude Code agent `code-reviewer`:

```text
Agent(
  subagent_type="code-reviewer",
  description="Review {project}",
  prompt="..."
)
```

Provide modified files from `phase4-progress.md` and instruct:

```text
Review only; do not edit files.
Check naming, error handling, immutability, function size under 50 lines, file
size under 800 lines, test coverage, no debug statements, and scope compliance.
```

Write raw output to:

```text
kaola-workflow/{project}/.cache/code-reviewer.md
```

## Step 2 - Security Review

Perform a file-risk scan from Phase 4 modified files.

If security-sensitive files were touched, invoke the
Claude Code agent `security-reviewer` with:

```text
Agent(
  subagent_type="security-reviewer",
  description="Security review {project}",
  prompt="..."
)
```

```text
Review only; do not edit files.
Check hardcoded secrets, injection, unvalidated input, unsafe operations, OWASP
Top 10, auth, payments, user data, filesystem access, and external API calls.
```

Write raw output to:

```text
kaola-workflow/{project}/.cache/security-reviewer.md
```

If security review is not needed, record `N/A` with the file-risk scan evidence.

## Step 3 - Review Fix Loop

Route findings:

- CRITICAL -> delegate fix immediately, re-run relevant reviewer
- HIGH -> delegate fix before Finalization
- MEDIUM/LOW -> log as follow-up; does not block

Fix routing:

- behavior, test coverage, implementation correction -> `tdd-guide`
- build/type/lint/dependency/tooling correction -> `build-error-resolver`
- security-sensitive correction -> route fix to the appropriate fix agent, then
  re-run `security-reviewer`

Write each fix-agent output to:

```text
kaola-workflow/{project}/.cache/review-fix-{n}.md
```

Dispatch each such role via `subagent_type`; its effort variant resolves centrally from `opencode.json` (opus-tier roles use the model's TOP effort, sonnet-tier its SECOND). Never pass a per-call `model=`.

Run, delegate, or cite the narrow validation needed for each fix under the
Validation Delegation Policy and Validation De-Duplication rules.

After three fix-and-re-review iterations without convergence, stop and ask.

## Mechanical Review Finalization (script-owned transaction)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the main session's **judgment**: the main session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and DECIDES the verdict. This script never judges severity, never
grades the review, and never gates Finalization — it only transcribes the verdict
the main session hands it, verbatim. It refuses a `review_status` that is not
`PASSED` or `PASSED WITH FOLLOW-UPS` (typed refusal, zero mutation).

The mechanical bookkeeping — authoring `phase5-review.md` from the orchestrator's
verbatim content and advancing the `workflow-state.md` pointer — is owned by the
full-path transaction script `kaola-workflow-full-advance.js` (ADR 0004), not a
subagent. The main session runs it directly, handing the decided Review Status and
the resolved CRITICAL/HIGH/MEDIUM/LOW finding lists as a JSON packet on stdin; the
script renders the phase file (with a RESOLVED `## Required Agent Compliance` table)
and advances the pointer in crash-safe order, idempotent on resume.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-workflow-full-advance.js)")"

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

## Step 4 - Write Phase File

The script writes `kaola-workflow/{project}/phase5-review.md` in this shape
(rendered from the packet):

```markdown
# Phase 5 - Review: {project}

## Code Review Findings
### CRITICAL
[list or none]
### HIGH
[list or none]
### MEDIUM/LOW
[list]

## Security Review
[ran: yes/no and reason]
### Findings
[list or none]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked/N/A | .cache/security-reviewer.md or file-risk scan | [reason if N/A] |
| review-fix executors | invoked/N/A | .cache/review-fix-*.md | [reason if N/A] |

## Fixes Applied
[list]

## Validation Evidence
[commands run/delegated/cited, result, evidence path]

## Follow-Up Items
[MEDIUM/LOW deferred]

## Review Status
PASSED | PASSED WITH FOLLOW-UPS
```

It then updates `workflow-state.md` (phase: 5 / step: complete / next_command:
/kaola-workflow-finalize {project} / next_skill: kaola-workflow-finalize
{project}), PRESERVING any existing `## Sink` block byte-for-byte:

```text
phase: 5
step: complete
next_command: /kaola-workflow-finalize {project}
```
