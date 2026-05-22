---
description: Kaola-Workflow Phase 5. Review, security review, and delegated review-fix loop.
argument-hint: <project name>
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
- `phase5-review.md` complete -> route to `/kaola-workflow-phase6 {project}`

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
- CRITICAL and HIGH findings block Phase 6.

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.

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

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

You MUST pass `model="{BUILD_ERROR_RESOLVER_MODEL}"` in this Agent call exactly
as shown — do not omit the `model=` line.

```text
Agent(
  subagent_type="build-error-resolver",
  model="{BUILD_ERROR_RESOLVER_MODEL}",
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
- Leave full fresh validation to Phase 6.

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

You MUST pass `model="{CODE_REVIEWER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="code-reviewer",
  model="{CODE_REVIEWER_MODEL}",
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

You MUST pass `model="{SECURITY_REVIEWER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="security-reviewer",
  model="{SECURITY_REVIEWER_MODEL}",
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
- HIGH -> delegate fix before Phase 6
- MEDIUM/LOW -> log as follow-up; does not block

If CRITICAL findings exist, consult the configured Claude Code advisor and save:

```text
kaola-workflow/{project}/.cache/advisor-critical-review.md
```

Fix routing:

- behavior, test coverage, implementation correction -> `tdd-guide`
- build/type/lint/dependency/tooling correction -> `build-error-resolver`
- security-sensitive correction -> route fix to the appropriate fix agent, then
  re-run `security-reviewer`

Write each fix-agent output to:

```text
kaola-workflow/{project}/.cache/review-fix-{n}.md
```

For every review-fix dispatch, include the explicit `model=` parameter in the
`Agent(...)` call exactly as documented above — never omit it.

Run, delegate, or cite the narrow validation needed for each fix under the
Validation Delegation Policy and Validation De-Duplication rules.

After three fix-and-re-review iterations without convergence, stop and ask.

## Step 4 - Write Phase File

Create `kaola-workflow/{project}/phase5-review.md`:

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
| advisor critical gate | invoked/N/A | .cache/advisor-critical-review.md or findings | [reason if N/A] |

## Fixes Applied
[list]

## Validation Evidence
[commands run/delegated/cited, result, evidence path]

## Follow-Up Items
[MEDIUM/LOW deferred]

## Review Status
PASSED | PASSED WITH FOLLOW-UPS
```

Update `workflow-state.md`:

```text
phase: 5
step: complete
next_command: /kaola-workflow-phase6 {project}
```
