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

`phase4-progress.md` must exist and its strict `## Tasks` table must contain at
least one task row; every task status must be `complete`. A malformed, empty,
missing, or incomplete table refuses Phase 5. If refused, stop:

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

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.
You MUST pass `model="{...}"` in every role Agent call in this command exactly as shown — do not omit the `model=` line.

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
  model="{TDD_GUIDE_MODEL}",
  description="Routed fix: task {n}",
  prompt="..."
)
```

Route build/type/lint/tooling fixes to the Claude Code agent
`build-error-resolver`:

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
Compatibility context: for approval, the durable body MUST contain the approval
receipt with exactly one column-zero domain_outcome: approved, exactly one
column-zero verdict: pass, exactly one column-zero findings_blocking: 0, exactly
one column-zero review_summary: no_blocking_findings, exactly one column-zero
review_attestation: full_review_completed, and exactly one final column-zero
review_conclusion: <substantive prose>. Emit the attestation and conclusion only
after completing the full review; the conclusion text after the prefix must
contain at least 24 Unicode letter/number characters and four word tokens. The entire durable body must not contain control, format, Unicode line/paragraph separator, or default-ignorable code points, and every machine label and finding gate key must use exact ASCII spelling and delimiters. Every finding token must use a lowercase ASCII key and ASCII = delimiter with a non-whitespace value. Emit every finding as a
canonical column-zero finding: row; use the corresponding failing receipt values
plus review_summary: blocking_findings_present when changes are requested.
```

Write raw output to:

```text
kaola-workflow/{project}/.cache/code-reviewer.md
```

Before every reviewer or fix dispatch, create its canonical evidence file with
only line 1: `evidence-binding: <node-id> <fresh-nonce>`. Pass that exact
binding in the dispatch prompt. After the role returns, preserve line 1
byte-for-byte and append the role's FULL returned reviewer/fix result below it;
never replace the file with a compact summary or parent-authored synthesis.

## Step 2 - Security Review

Perform a file-risk scan from Phase 4 modified files.

If security-sensitive files were touched, invoke the
Claude Code agent `security-reviewer` with:

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
Compatibility context: for approval, the durable body MUST contain the approval
receipt with exactly one column-zero domain_outcome: approved, exactly one
column-zero verdict: pass, exactly one column-zero findings_blocking: 0, exactly
one column-zero review_summary: no_blocking_findings, exactly one column-zero
review_attestation: full_review_completed, and exactly one final column-zero
review_conclusion: <substantive prose>. Emit the attestation and conclusion only
after completing the full review; the conclusion text after the prefix must
contain at least 24 Unicode letter/number characters and four word tokens. The entire durable body must not contain control, format, Unicode line/paragraph separator, or default-ignorable code points, and every machine label and finding gate key must use exact ASCII spelling and delimiters. Every finding token must use a lowercase ASCII key and ASCII = delimiter with a non-whitespace value. Emit every finding as a
canonical column-zero finding: row; use the corresponding failing receipt values
plus review_summary: blocking_findings_present when changes are requested.
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

For every review-fix dispatch, include the explicit `model=` parameter in the
`Agent(...)` call exactly as documented above — never omit it.

Run, delegate, or cite the narrow validation needed for each fix under the
Validation Delegation Policy and Validation De-Duplication rules.

After three fix-and-re-review iterations without convergence, stop and ask.

## Mechanical Review Finalization (script-owned transaction)

The **Review Status** verdict (`PASSED` / `PASSED WITH FOLLOW-UPS`) and the
CRITICAL/HIGH triage are the main session's **judgment**: the main session reads
`.cache/code-reviewer.md`, `.cache/security-reviewer.md`, and every
`.cache/review-fix-*.md`, decides whether any CRITICAL or HIGH finding remains
unresolved, and DECIDES the verdict. This script never judges severity or grades
the review. It mechanically gates Finalization on the strict Phase 4 task
prerequisite and an explicit `compliance` array containing exactly one
`code-reviewer` row with canonical `.cache/code-reviewer.md` evidence, exactly
one `security-reviewer` row with canonical invoked evidence or a documented N/A
file-risk decision, and exactly one `review-fix executors` row with canonical
numeric evidence or N/A. When fixes ran, that single row must comma-enumerate
every `.cache/review-fix-1.md`, `.cache/review-fix-2.md`, and so on in strictly
ascending numeric order, with every corresponding exact binding comma-separated
in the same order. Any coexisting noncanonical `review-fix-*` name, including a
leading-zero, empty, or nonnumeric suffix, refuses. When no fix ran, the N/A reason must
be exactly `no blocking findings`, `no CRITICAL/HIGH findings`, or
`no CRITICAL/HIGH blocking findings`. Invoked reviewer evidence must be
nonempty, regular, non-symlink, and have an mtime strictly greater than both
`phase4-progress.md` and every `.cache/review-fix-*.md`; equal time is stale
and forces a fresh reviewer pass after every fix. Terminal reviewer evidence
must contain exactly one column-zero `domain_outcome: approved`, exactly one
`verdict: pass`, exactly one `findings_blocking: 0`, and exactly one
`review_summary: no_blocking_findings`, and exactly one
`review_attestation: full_review_completed`, plus exactly one column-zero
`review_conclusion: <substantive prose>` as the final nonempty line. The attestation
and conclusion may be emitted only after the full review; conclusion text after the
prefix must contain at least 24 Unicode letter/number characters and four word tokens. The entire reviewer body must not contain control, format, Unicode line/paragraph separator, or default-ignorable code points. Reserved machine labels and finding gate keys reject unsafe/invisible, recognized compatibility/confusable, and single-Damerau-edit near-spoof variants; ordinary Unicode prose remains non-authoritative. Every canonical finding token must use a lowercase ASCII key and ASCII = delimiter with a non-whitespace value, and any noncanonical line carrying all three assignment-shaped gate keys, or a finding-like label followed by all three alternating key/value pairs, refuses. Reserved receipt
rows are the only mechanical outcome authority, and canonical `finding:` rows are
the only mechanical finding authority; malformed, indented, case-shifted, Unicode-obfuscated, duplicate,
or unknown-vocabulary rows refuse, and any canonical in-scope open fix finding
cannot Finalize. Conclusion presence, position, and minimum shape are mechanical,
but its prose content is retained only as orchestrator context and is not
mechanically classified. Named reviewer invocation remains required when local fix
fallback is authorized or agent tooling is unavailable. The
matching invoked compliance row must pass the exact seeded line as `binding`;
an N/A security or fix row must pass `binding: n/a`. The script rejects a
missing/changed binding, seed-only body, or compact-summary-only body. The
script also refuses a `review_status` that is not `PASSED` or
`PASSED WITH FOLLOW-UPS` (typed refusal, zero mutation), then transcribes the
main session's accepted verdict verbatim.

The mechanical bookkeeping — authoring `phase5-review.md` from the orchestrator's
verbatim content and advancing the `workflow-state.md` pointer — is owned by the
full-path transaction script `kaola-gitlab-workflow-full-advance.js`, not a
subagent. The main session runs it directly, handing the decided Review Status and
the resolved CRITICAL/HIGH/MEDIUM/LOW finding lists as a JSON packet on stdin; the
script renders the phase file (with a RESOLVED `## Required Agent Compliance` table)
and advances the pointer in crash-safe order, idempotent on resume.

Resolve `$KAOLA_SCRIPTS` once, then run the transaction:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitlab/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitlab/scripts/$_n" "./plugins/kaola-workflow-gitlab/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitlab-workflow-full-advance.js)")"

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
    { "requirement": "code-reviewer", "status": "invoked", "evidence": ".cache/code-reviewer.md", "binding": "evidence-binding: phase5-code-review-1 <fresh-nonce>" },
    { "requirement": "security-reviewer", "status": "n/a", "binding": "n/a", "skip_reason": "no security-sensitive files in write set" },
    { "requirement": "review-fix executors", "status": "n/a", "binding": "n/a", "skip_reason": "no CRITICAL/HIGH findings" }
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
| Requirement | Status | Evidence | Binding | Skip Reason |
|-------------|--------|----------|---------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | evidence-binding: phase5-code-review-1 nonce | |
| security-reviewer | invoked/N/A | .cache/security-reviewer.md or file-risk scan | exact seeded binding or n/a | [reason if N/A] |
| review-fix executors | invoked/N/A | .cache/review-fix-1.md, .cache/review-fix-2.md, ... | exact binding 1, exact binding 2, ... or n/a | exact allowed reason if N/A |

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
