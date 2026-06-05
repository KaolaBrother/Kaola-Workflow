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

Ensure `kaola-workflow/{project}/.cache/` exists before invoking agents.

Update `workflow-state.md` with `step: plan`, `main_session_role: orchestrator`, `implementation_owner: planner`, `inline_emergency_fallback_authorized: no`.

Invoke the `planner` Codex agent role with the linked Gitea issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate. The orchestrator captures the returned plan into `fast-summary.md` with status `IN_PROGRESS`, recording the declared write set as the `## Scope` `- Write Set:` line with real repository paths so the parallel-overlap classifier can see this fast project's in-flight files (planner has Read-only tools).

## Step 2 - Execute (tdd-guide)

Update `workflow-state.md` with `step: execute`, `main_session_role: orchestrator`, `implementation_owner: tdd-guide`, `inline_emergency_fallback_authorized: no`.

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

Orchestrator runs acceptance check after agent returns. Escalate on `test_thrash` threshold.

Update `fast-summary.md` status to `REVIEW`.

## Step 3 - Review (code-reviewer)

Update `workflow-state.md` with `step: review`, `main_session_role: orchestrator`, `implementation_owner: code-reviewer`, `inline_emergency_fallback_authorized: no`.

Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).

Invoke the `code-reviewer` Codex agent role on modified files. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

On BLOCK or CRITICAL/HIGH finding, escalate unless Trivial Inline Edit. In that exempted case, orchestrator applies the fix and records `implementation_owner: orchestrator-trivial-fix`.

Update `fast-summary.md` status to `PASSED`.

## Mechanical Bookkeeping (delegated to the contractor)

Every **judgment** stays with the current session: it dispatches the `planner` /
`tdd-guide` / `code-reviewer` role agents (a subagent cannot dispatch a subagent),
judges fast eligibility (≤ 5 files, exactly one sensible approach vs. a design
choice), judges the acceptance result and the `test_thrash` count, decides PROCEED
vs. escalate, judges the review verdict, and DECIDES the `fast-summary.md`
`## Status` verdict (`PASSED` on a clean review, `ESCALATED` otherwise). The
deterministic bookkeeping around those decisions is delegated to the mechanical
`contractor` Codex agent role when that subagent is available; it runs the scripts
and authors the durable bookkeeping but never dispatches a role, never judges
eligibility / acceptance / the review, never decides PROCEED vs. escalate or the
status verdict, never escalates on its own, never closes the issue, and never asks
the user — it transcribes the verdicts the session hands it verbatim. Re-derive any
needed forge script as `$KAOLA_SCRIPTS/kaola-gitea-workflow-*.js`, capture real exit
codes, and never gate on a piped `| tail`.

The mechanical bracket the contractor owns:

- **Plan setup:** `mkdir -p kaola-workflow/{project}/.cache` and stamp the
  `step: plan` checkpoint into `workflow-state.md` (`main_session_role:
  orchestrator`, `implementation_owner: planner`,
  `inline_emergency_fallback_authorized: no`), preserving any `## Sink` block
  byte-for-byte.
- **Plan capture:** once the orchestrator has judged the plan eligible, write the
  `IN_PROGRESS` `fast-summary.md` stub, recording the orchestrator-handed declared
  write set as the `## Scope` `- Write Set:` line with real repository paths (so the
  parallel-overlap classifier can see this fast project's in-flight files) plus the
  acceptance command on `- Acceptance:`.
- **Execute setup:** stamp the `step: execute` checkpoint
  (`implementation_owner: tdd-guide`), preserving `## Sink`.
- **Acceptance run, then STOP:** run the acceptance command (from `- Acceptance:` or
  as handed in), capture its real exit code plus a short output tail, and report the
  pass/fail and the `test_thrash` count read from `.cache/tdd-guide.md` — write **no**
  consequence. The orchestrator JUDGES that report and decides PROCEED vs. escalate.
- **Acceptance consequence (a separate, second contractor summons):** write the one
  durable consequence the orchestrator decided. On PROCEED: stamp the `step: review`
  checkpoint (`implementation_owner: code-reviewer`) and set `fast-summary.md` to
  `REVIEW`. On ESCALATE: write the `escalated_to_full: <trigger> — <detail>` field
  (literal ` — ` em-dash spacing) plus the `workflow_path: full` /
  `next_command: /kaola-workflow-phase1 {project}` /
  `next_skill: kaola-workflow-research {project}` routing and set `fast-summary.md`
  to status `ESCALATED`. The run and the consequence-write straddle the
  orchestrator's judgment — they are two separate contractor summons, never one. This
  same consequence summons is reused whenever the orchestrator decides an escalation
  at Plan (`approach_ambiguity` / `file_overflow`) or Review.
- **Summary write:** author the final `fast-summary.md` from the orchestrator-judged
  verdict and the `.cache` evidence — write the `## Status` line EXACTLY as the
  orchestrator hands it in (do not restate, soften, or upgrade it); keep the
  `## Scope` lines; transcribe Implementation Evidence from `.cache/tdd-guide.md`,
  Review from `.cache/code-reviewer.md`, and the `## Required Agent Compliance` rows.

Because a subagent runs in its own shell, capture anything the contractor needs
(the orchestrator-decided write set, acceptance command, PROCEED/ESCALATE decision,
trigger + detail, and the `## Status` verdict) in THIS session before delegating —
shell state and judgments do not cross the delegation boundary.

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
