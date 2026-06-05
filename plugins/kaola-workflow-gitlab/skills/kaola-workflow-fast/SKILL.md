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

On escalation:

1. Rewrite `workflow-state.md` with `workflow_path: full`, `next_command: /kaola-workflow-phase1 {project}`, `next_skill: kaola-workflow-research {project}` so `/workflow-next` routes correctly on resume.
2. Write `escalated_to_full: <trigger> — <detail>` to `workflow-state.md`.
3. Write a brief escalation note to `fast-summary.md` with status `ESCALATED`.
4. Stop and tell the user to re-run `kaola-workflow-next {project}`.

Do not continue fast-path execution after writing the escalation field.

## Step 1 - Plan (planner)

The deterministic bookkeeping in this step — making the cache dir (`mkdir -p kaola-workflow/{project}/.cache`), stamping the `step: plan` checkpoint into `workflow-state.md` (`step: plan`, `main_session_role: orchestrator`, `implementation_owner: planner`, `inline_emergency_fallback_authorized: no`, preserving any existing `## Sink` block byte-for-byte), and, once the orchestrator has judged the plan eligible, capturing the orchestrator-judged plan into the `fast-summary.md` `IN_PROGRESS` stub (the declared write set as the `## Scope` `- Write Set:` line with the real repository paths the orchestrator hands in, plus the acceptance check command on the `- Acceptance:` line) — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any needed script (re-deriving its own `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-claim.js"` path, capturing real exit codes and never gating on a piped `| tail`) and authors the durable bookkeeping but never dispatches the `planner` or any role, never judges the plan, never decides fast eligibility, never escalates, never closes the issue, and never asks the user. The current session keeps the `planner` dispatch and the fast-eligibility judgment.

Invoke the `planner` Codex agent role with the linked GitLab issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate. The `planner` has Read-only tools, so the orchestrator captures its returned plan to `.cache/planner.md` and judges eligibility; once judged eligible, it hands the declared write set into the contractor, which writes the `fast-summary.md` stub with status `IN_PROGRESS`, recording the declared write set as the `## Scope` `- Write Set:` line with real repository paths so the parallel-overlap classifier can see this fast project's in-flight files.

## Step 2 - Execute (tdd-guide)

The deterministic bookkeeping in this step — stamping the `step: execute` checkpoint into `workflow-state.md` (`step: execute`, `main_session_role: orchestrator`, `implementation_owner: tdd-guide`, `inline_emergency_fallback_authorized: no`, preserving any existing `## Sink` block byte-for-byte) — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any needed script (re-deriving its own `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-claim.js"` path, capturing real exit codes and never gating on a piped `| tail`) and authors the durable bookkeeping but never dispatches the `tdd-guide` or any role, never judges, never escalates, never closes the issue, and never asks the user. The current session keeps the `tdd-guide` dispatch.

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

The acceptance-check RUN and the consequence WRITE are two separate contractor summons that straddle the orchestrator's judgment — never collapse them into one. First, the contractor runs the project's acceptance-check command (read from the `- Acceptance:` line of `fast-summary.md`, or as the orchestrator hands it in), captures its real exit code and a short output tail, reports whether it passed plus the `test_thrash` count (consecutive same-test RED→RED cycles read from `.cache/tdd-guide.md`), and then STOPS — it writes no consequence, judges nothing, and decides nothing. The orchestrator JUDGES that report: it judges the acceptance result and the `test_thrash` count and DECIDES PROCEED versus escalate (escalate on the `test_thrash` threshold of ≥ 3 consecutive RED→RED cycles on the same test). Then the orchestrator hands the single decided consequence into a second contractor summons, which transcribes only that one verbatim: on PROCEED, the `step: review` checkpoint (`step: review`, `main_session_role: orchestrator`, `implementation_owner: code-reviewer`, `inline_emergency_fallback_authorized: no`) into `workflow-state.md` and `fast-summary.md` status `REVIEW`; on ESCALATE, the `escalated_to_full: <trigger> — <detail>` field plus the `workflow_path: full` / `next_command: /kaola-workflow-phase1 {project}` / `next_skill: kaola-workflow-research {project}` routing into `workflow-state.md` and `fast-summary.md` status `ESCALATED`, exactly as Mid-Flight Escalation specifies (preserving any existing `## Sink` block byte-for-byte). This same consequence summons is the one the orchestrator uses whenever it DECIDES an escalation at Plan (`approach_ambiguity` / `file_overflow`) or Review; the orchestrator makes the call and the contractor writes the escalation field plus status `ESCALATED` verbatim. The contractor never judges the acceptance result, never decides PROCEED versus escalate, and never decides the status verdict.

## Step 3 - Review (code-reviewer)

The `step: review` checkpoint in `workflow-state.md` (`step: review`, `main_session_role: orchestrator`, `implementation_owner: code-reviewer`, `inline_emergency_fallback_authorized: no`) was already stamped by the contractor on the PROCEED path of the Step 2 acceptance consequence.

Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).

Invoke the `code-reviewer` Codex agent role on modified files. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

The `code-reviewer` has Read-only tools, so the orchestrator captures its raw output to `.cache/code-reviewer.md` and JUDGES the review verdict. On BLOCK or CRITICAL/HIGH finding, escalate unless Trivial Inline Edit. In that exempted case, the orchestrator (not `code-reviewer`) applies the one-line fix, re-runs the acceptance check, and records `implementation_owner: orchestrator-trivial-fix`.

The final `fast-summary.md` authoring — keeping the `## Scope` `- Write Set:` / `- Acceptance:` lines from the stub, transcribing Implementation Evidence from `.cache/tdd-guide.md`, Review from `.cache/code-reviewer.md`, and the `## Required Agent Compliance` rows, and setting `## Escalation` to N/A on the PASSED path — is delegated to the mechanical `contractor` Codex agent role when that subagent is available; it runs any needed script (re-deriving its own `node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-claim.js"` path, capturing real exit codes and never gating on a piped `| tail`) and authors the durable bookkeeping but never dispatches the `code-reviewer` or any role, never judges the review, never decides the status verdict, never escalates, never closes the issue, and never asks the user. The `## Status` verdict (`PASSED` on a clean review, `ESCALATED` otherwise) is the current session's judgment: decide it first, then hand it into the contractor so it transcribes the `## Status` line verbatim into `fast-summary.md` — the contractor copies the verdict as given and does not restate, soften, upgrade, or re-grade it.

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
