---
name: kaola-workflow-fast
description: Use when executing a single-pass Plan+Execute+Review fast path for a small, well-scoped kaola-workflow issue. Writes fast-summary.md and gates Phase 6.
---

# Skill: kaola-workflow-fast

Single-pass Plan+Execute+Review for small, well-scoped issues. Writes
`fast-summary.md` and gates Phase 6. Mirror of `commands/kaola-workflow-fast.md`
for Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`
throughout.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Phase 6 accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

Fast applies only to mechanical, single-area changes of ≤ 5 files with exactly one sensible approach; ≥ 2 materially-different viable approaches is a design choice that stays on full. Escalate (`escalated_to_full: <trigger> — <detail>`) on `approach_ambiguity`, scope past the declared write set by >1 file or the absolute backstop of 6, `test_thrash` (≥3), security/architecture/breaking-change, discovered dependency, or new external package.

## Resume Detection

If `fast-summary.md` exists with status `PASSED`, fast path is complete. Route to `kaola-workflow-finalize {project}`.

Otherwise detect step:

- `fast-summary.md` absent → `plan`
- `fast-summary.md` has status `IN_PROGRESS` → `execute`
- `fast-summary.md` has status `REVIEW` → `review`
- `fast-summary.md` has status `ESCALATED` → escalation already committed; route to full workflow: `kaola-workflow-research {project}`

## Mid-Flight Escalation

The escalation **decision** — which `<trigger>` fired (`approach_ambiguity`,
`file_overflow`, `test_thrash`, security/architecture/breaking-change,
discovered dependency, or new external package) and the `<detail>` — is the
current session's **judgment**, made at Plan, Execute, or Review. Once the
session decides to escalate, the mechanical escalation writes below are
delegated to the mechanical `contractor` Codex agent role when that subagent is
available; it writes the durable bookkeeping files but copies the decided
trigger and detail exactly as the session hands them — it never decides whether
to escalate, never chooses the trigger, never dispatches a role, and never asks
the user. It re-derives its own `$KAOLA_SCRIPTS` path if any script is needed,
captures real exit codes, and never gates on a piped `| tail`.

On escalation the contractor:

1. Rewrites `workflow-state.md` with `workflow_path: full`, `next_command: /kaola-workflow-phase1 {project}`, `next_skill: kaola-workflow-research {project}` so `/workflow-next` routes correctly on resume (preserving any existing `## Sink` block byte-for-byte).
2. Writes `escalated_to_full: <trigger> — <detail>` to `workflow-state.md`.
3. Writes a brief escalation note to `fast-summary.md`, setting its `## Status` to the bare verdict `status ESCALATED` exactly as the session decided it.
4. Stops; the session then tells the user to re-run `kaola-workflow-next {project}`.

Do not continue fast-path execution after the escalation field is written. If
the subagent tooling is unavailable, the current session runs these same writes
inline.

## Step 1 - Plan (planner)

The deterministic bookkeeping in this step — making the cache dir
(`mkdir -p kaola-workflow/{project}/.cache`) and stamping the `step: plan`
checkpoint into `workflow-state.md` (`main_session_role: orchestrator`,
`implementation_owner: planner`, `inline_emergency_fallback_authorized: no`,
preserving any existing `## Sink` block byte-for-byte) — is delegated to the
mechanical `contractor` Codex agent role when that subagent is available; it
re-derives its own `$KAOLA_SCRIPTS` path if any script is needed, captures real
exit codes, never gates on a piped `| tail`, and never dispatches `planner`,
judges the plan, escalates, or asks the user. If the subagent tooling is
unavailable, the current session runs these writes inline.

Invoke the `planner` Codex agent role with the linked GitHub issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate — that eligibility judgment is the current session's, not the contractor's. Once the session has judged the plan eligible, it hands the planner's declared write set to the contractor, which captures the returned plan into `fast-summary.md` with status `IN_PROGRESS`, recording that declared write set as the `## Scope` `- Write Set:` line with the real repository paths exactly as the session hands them (so the parallel-overlap classifier can see this fast project's in-flight files; planner has Read-only tools) plus the acceptance check command on the `- Acceptance:` line. The contractor copies the write set verbatim and never judges eligibility or the plan.

## Step 2 - Execute (tdd-guide)

The `step: execute` checkpoint write (`main_session_role: orchestrator`,
`implementation_owner: tdd-guide`, `inline_emergency_fallback_authorized: no`,
preserving any existing `## Sink` block byte-for-byte) is delegated to the
mechanical `contractor` Codex agent role when that subagent is available; it
re-derives its own `$KAOLA_SCRIPTS` path, captures real exit codes, never gates
on a piped `| tail`, and never dispatches `tdd-guide`, judges, or asks the user.
If the subagent tooling is unavailable, the current session runs the write
inline.

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

The acceptance-check **run** is mechanical and is delegated to the contractor:
after `tdd-guide` returns, the contractor runs the acceptance-check command,
captures its real exit code and a short output tail (never gating on a piped
`| tail`), reports that exit code plus the `test_thrash` count (consecutive
same-test RED→RED cycles read from `.cache/tdd-guide.md`), and **stops** — it
writes no consequence. The current session **judges** that report: a passing
check below threshold is PROCEED; hitting the `test_thrash` threshold (≥ 3
consecutive RED→RED cycles on the same test) is a decision to escalate. The run
and the consequence-write straddle the session's judgment as two separate
contractor summons, never one.

Once the session decides PROCEED, the contractor writes the single decided
consequence verbatim: the `step: review` checkpoint (`implementation_owner:
code-reviewer`, preserving the `## Sink` block) and `fast-summary.md` status
`REVIEW`. On an escalate decision it instead writes the Mid-Flight Escalation
fields above from the session-decided trigger. The contractor never judges the
acceptance result, decides PROCEED vs escalate, or chooses the verdict.

## Step 3 - Review (code-reviewer)

The `step: review` checkpoint (`main_session_role: orchestrator`,
`implementation_owner: code-reviewer`, `inline_emergency_fallback_authorized: no`)
was already stamped by the contractor on the PROCEED path of Step 2; if it is
not yet stamped, that mechanical write — preserving any existing `## Sink` block
byte-for-byte — is delegated to the contractor.

Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).

Invoke the `code-reviewer` Codex agent role on modified files. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

On BLOCK or CRITICAL/HIGH finding, escalate unless Trivial Inline Edit — that triage is the current session's **judgment**. In that exempted case, the orchestrator (not `code-reviewer`, which is Read-only) applies the one-line fix and records `implementation_owner: orchestrator-trivial-fix`.

The `## Status` verdict (`PASSED` on a clean review, `ESCALATED` otherwise) is
the current session's judgment. Once the session decides the verdict, the
deterministic bookkeeping — authoring the final `fast-summary.md` from the
template (the `## Status` line, the `## Scope` `- Write Set:` / `- Acceptance:`
lines carried from the stub, Implementation Evidence from `.cache/tdd-guide.md`,
Review from `.cache/code-reviewer.md`, and the `## Required Agent Compliance`
rows) — is delegated to the mechanical `contractor` Codex agent role when that
subagent is available; it writes the `## Status` line exactly as the session
hands it (`PASSED` on a clean review) and never restates, softens, upgrades, or
re-grades the verdict, never dispatches a role, never escalates on its own, and
never asks the user. It re-derives its own `$KAOLA_SCRIPTS` path if any script
is needed, captures real exit codes, and never gates on a piped `| tail`. If the
subagent tooling is unavailable, the current session authors the file inline.

## fast-summary.md Format

```markdown
# Fast Summary: {project}

## Status
PASSED | IN_PROGRESS | REVIEW | ESCALATED

## Scope
- Write Set: path/to/file, path/to/test-file
- Acceptance: <acceptance check command>

## Plan
[brief description]

## Implementation Evidence
[commands run, test output summary]

## Review
[review result]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/planner.md | |
| tdd-guide | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable | .cache/tdd-guide.md | |
| code-reviewer | subagent-invoked/local-fallback-explicit/local-fallback-tool-unavailable/N/A | .cache/code-reviewer.md | N/A only for trivial band (single docs/comment/markdown edit) self-review |

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Delegation Vocabulary

The `planner`, `tdd-guide`, and `code-reviewer` rows are Codex role rows: record their Status with the delegation vocabulary — `subagent-invoked` when the role was delegated to the Codex subagent, `local-fallback-explicit` when you executed locally with explicit user authorization, or `local-fallback-tool-unavailable` when subagent tooling was unavailable. `code-reviewer` may be `N/A` (with a skip reason) only in the trivial band (a single docs/comment/markdown edit) where self-review applies; any change touching more than one file or a production-path file (outside `docs/`, `*.md`, `tests/`) requires a delegated review status.

## Continue

After `PASSED`, route to `kaola-workflow-finalize {project}`.
