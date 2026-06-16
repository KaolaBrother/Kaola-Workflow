---
name: kaola-workflow-fast
description: Use when executing a single-pass Plan+Execute+Review fast path for a small, well-scoped kaola-workflow issue. Writes fast-summary.md and gates Finalization.
---

# Skill: kaola-workflow-fast

Single-pass Plan+Execute+Review for small, well-scoped issues. Writes
`fast-summary.md` and gates Finalization. Mirror of `commands/kaola-workflow-fast.md`
for Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`
throughout.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Finalization accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

Fast applies only to mechanical, single-area changes of ≤ 5 files with exactly one sensible approach; ≥ 2 materially-different viable approaches is a design choice that stays on full. Escalate (`escalated_to_full: <trigger> — <detail>`) on `approach_ambiguity`, scope past the declared write set by >1 file or the absolute backstop of 6, `test_thrash` (≥3), security/architecture/breaking-change, discovered dependency, or new external package.

## Boundary: main session decides, the script mutates

This skill follows the same boundary as the adaptive path (ADR 0004): the current
session (orchestrator) owns ALL judgment — fast eligibility, approach ambiguity,
PROCEED vs ESCALATE, acceptance sufficiency, and the review verdict — and the
deterministic mechanical transitions (cache/state/`fast-summary.md` writes) are
owned by the fast transaction script `kaola-gitlab-workflow-fast-advance.js`. The
script emits typed JSON only; it never dispatches a role, asks the user, judges
severity, chooses escalation, or invents write sets. Phase 6 finalization is the
only transition still owned by `contractor` (handled by the
`kaola-workflow-finalize` skill).

## Setup

Resolve `$KAOLA_SCRIPTS` before the first transaction call:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow-gitlab/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow-gitlab/*/scripts/kaola-gitlab-workflow-fast-advance.js' -print -quit 2>/dev/null)")"
fi
```

Every transaction call also accepts `orient` to (re)derive the current fast step
without mutating anything:

```bash
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" orient --project {project} --json
```

`orient` is read-only: it reports `fast_step` (plan | execute | review | finalize |
escalated) derived from `fast-summary.md`, the actual `state_step`, and a
`state_pointer_stale` flag. A corrupt `## Status` returns a typed refusal instead
of guessing.

## Resume Detection

If `fast-summary.md` exists with status `PASSED`, fast path is complete. Route to `kaola-workflow-finalize {project}`.

Otherwise detect step (this is what `orient` reports):

- `fast-summary.md` absent → `plan`
- `fast-summary.md` has status `IN_PROGRESS` → `execute`
- `fast-summary.md` has status `REVIEW` → `review`
- `fast-summary.md` has status `ESCALATED` → escalation already committed; route to full workflow: `kaola-workflow-research {project}`

## Mid-Flight Escalation

The escalation **decision** — which `<trigger>` fired (`approach_ambiguity`,
`file_overflow`, `test_thrash`, security/architecture/breaking-change, discovered
dependency, or new external package) and the `<detail>` — is the current session's
**judgment**, made at Plan, Execute, or Review. The session decides whether to
escalate, chooses the trigger, and never delegates that call. Once the session has
decided, the durable consequence is handed to the transaction script (it does NOT
decide to escalate):

```bash
echo '{"trigger":"<trigger>","detail":"<short detail>"}' | \
  node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" acceptance-consequence \
  --project {project} --decision escalate --stdin --json
```

where `<trigger>` is one of `approach_ambiguity`, `file_overflow`, `test_thrash`,
`security`, `architecture`, `breaking_change`, `dependency`, `new_package`. The
script:

1. Rewrites `workflow-state.md` with `workflow_path: full`, `next_command: /kaola-workflow-phase1 {project}`, `next_skill: kaola-workflow-research {project}` so `/workflow-next` routes correctly on resume (preserving any existing `## Sink` block byte-for-byte).
2. Writes the `escalated_to_full: <trigger> — <detail>` field (literal " — " em-dash spacing so the fast-path audit parses the trigger cleanly) to `workflow-state.md`.
3. Sets `fast-summary.md` `## Status` to the bare verdict the session decided, preserving any existing `## Sink` block byte-for-byte.

After escalation, stop and tell the user to re-run `kaola-workflow-next {project}`.
Do not continue fast-path execution after the escalation field is written.

## Step 1 - Plan (planner)

The mechanical bracket of this step — making the cache dir and stamping the
`step: plan` checkpoint into `workflow-state.md` (`main_session_role: orchestrator`,
`implementation_owner: planner`, `inline_emergency_fallback_authorized: no`,
preserving any existing `## Sink` block byte-for-byte) — is owned by the transaction
script and is idempotent on resume:

```bash
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" plan-setup \
  --project {project} --json
```

Invoke the `planner` Codex agent role with the linked GitLab issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate — that eligibility judgment is the current session's. The `planner` has Read-only tools, so the orchestrator captures its returned plan to `.cache/planner.md` and judges eligibility. Once the session has judged the plan eligible, it hands the declared write set and acceptance command to the transaction script, which writes the `fast-summary.md` `IN_PROGRESS` stub and advances the state pointer to execute:

```bash
echo '{"write_set":["path/to/file","path/to/test-file"],"acceptance_command":"<acceptance check command>","plan":"<brief plan>"}' | \
  node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" plan-capture \
  --project {project} --stdin --json
```

The packet records the orchestrator-approved declared write set as the `## Scope`
`- Write Set:` line using the real repository paths exactly as given (so the
parallel-overlap classifier can see this fast project's in-flight files), plus the
acceptance check command on the `- Acceptance:` line. The script refuses a missing
write set or acceptance command (typed refusal, zero mutation); it does not parse
freeform planner prose or judge eligibility.

## Step 2 - Execute (tdd-guide)

The mechanical `step: execute` checkpoint write into `workflow-state.md`
(`main_session_role: orchestrator`, `implementation_owner: tdd-guide`,
`inline_emergency_fallback_authorized: no`, preserving any existing `## Sink` block
byte-for-byte) is owned by the transaction script and is idempotent on resume; it
also returns a `dispatch` descriptor for the implementation role:

```bash
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" execute-setup \
  --project {project} --json
```

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

The acceptance-check RUN and the consequence WRITE straddle the orchestrator's
judgment; they are two separate transaction calls, never one. First the script runs
the acceptance check (read from the `- Acceptance:` line of `fast-summary.md`),
captures its real exit code and an output tail to `.cache/acceptance-run.log`, and
returns the run facts only — `exit_code`, `passed`, `evidence_path`, and a
resume-safe `repeat_count` (a thrash proxy):

```bash
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" acceptance-run \
  --project {project} --json
```

It writes NO consequence to `workflow-state.md` or `fast-summary.md` and does not
choose PROCEED vs ESCALATE. The current session **judges** that report: if the
acceptance check passed and the `test_thrash` count (consecutive same-test RED→RED
cycles, read from `.cache/tdd-guide.md`) is below threshold, the decision is
PROCEED; if the `test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on
the same test), the session DECIDES to escalate.

On PROCEED, the orchestrator hands the decision to the transaction script, which
stamps the `step: review` checkpoint (`implementation_owner: code-reviewer`,
preserving the `## Sink` block) and sets `fast-summary.md` status `REVIEW`:

```bash
node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" acceptance-consequence \
  --project {project} --decision proceed --json
```

On an escalate decision (from this acceptance check, or decided at Plan via
`approach_ambiguity` / `file_overflow`, or at Review via a security / architecture /
breaking-change concern that is not a Trivial Inline Edit), use the escalate form
shown in Mid-Flight Escalation above. The orchestrator makes the call; the script
writes the escalation field + `workflow_path: full` routing + `fast-summary.md`
status `ESCALATED` verbatim. The script never judges the acceptance result, decides
PROCEED vs escalate, or chooses the verdict.

## Step 3 - Review (code-reviewer)

The `step: review` checkpoint in `workflow-state.md` (`main_session_role:
orchestrator`, `implementation_owner: code-reviewer`,
`inline_emergency_fallback_authorized: no`) was already stamped by the script on the
PROCEED path of the Step 2 acceptance consequence.

Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).

Invoke the `code-reviewer` Codex agent role on modified files. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

The `code-reviewer` has Read-only tools, so the orchestrator captures its raw output to `.cache/code-reviewer.md` and JUDGES the review verdict. On BLOCK or CRITICAL/HIGH finding, escalate unless Trivial Inline Edit — that triage is the current session's judgment. In that exempted case, the orchestrator (not `code-reviewer`) applies the one-line fix, re-runs the acceptance check, and records `implementation_owner: orchestrator-trivial-fix`.

The `## Status` verdict (`PASSED` on a clean review, `ESCALATED` otherwise) is the
current session's judgment. Once the session decides the verdict, it hands it + the
`.cache` evidence to the transaction script, which writes the terminal
`fast-summary.md` exactly once:

```bash
echo '{"implementation_evidence":"<commands run, test output summary>","review":"<review result>","plan":"<brief plan>","compliance":[{"requirement":"planner","status":"subagent-invoked","evidence":".cache/planner.md"},{"requirement":"tdd-guide","status":"subagent-invoked","evidence":".cache/tdd-guide.md"},{"requirement":"code-reviewer","status":"subagent-invoked","evidence":".cache/code-reviewer.md"}]}' | \
  node "$KAOLA_SCRIPTS/kaola-gitlab-workflow-fast-advance.js" summary-write \
  --project {project} --verdict PASSED --stdin --json
```

The script keeps the `## Scope` `- Write Set:` / `- Acceptance:` lines from the
stub, transcribes Implementation Evidence and Review from the packet, writes the
`## Required Agent Compliance` rows from the packet's `compliance` array (so the
Codex delegation vocabulary below flows through — `subagent-invoked` /
`local-fallback-explicit` / `local-fallback-tool-unavailable`, and `N/A` for a
trivial-band code-reviewer skip), sets `## Escalation` to N/A on the PASSED path,
writes the `## Status` line EXACTLY as the orchestrator hands it in (it does not
restate, soften, upgrade, or re-grade it), and routes to `/kaola-workflow-finalize {project}`.
Pass `--verdict ESCALATED` (with a `{"trigger":...,"detail":...}` packet) for a
terminal escalation at Review.

<!-- PIN: fast-compliance-backstop -->
**Fast-lane compliance backstop (#504):** `summary-write --verdict PASSED` runs
`unresolvedCompliance` on the would-be summary before writing anything. If any
`## Required Agent Compliance` row is unresolved (status `pending`/`invoked`
without evidence, or `N/A` without evidence or skip\_reason), the script refuses
fail-closed with `fast_compliance_unresolved` and makes NO mutation. The
mandatory-delegated code-reviewer rule applies: whenever the write set contains
**> 1 file** or any production-path file, the `code-reviewer` row must carry a
real delegation status (`subagent-invoked`, `local-fallback-explicit`, or
`local-fallback-tool-unavailable`) with a real evidence path or skip\_reason.
Self-review (`N/A` with a documented skip\_reason) is only valid for the trivial
band (a single docs, comment, or markdown edit). Supply the resolved compliance
array in the `compliance` key of the `--stdin` packet.

## fast-summary.md Format

The script renders this format; it is reproduced here as the durable contract:

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

The `planner`, `tdd-guide`, and `code-reviewer` rows are Codex role rows: record their Status with the delegation vocabulary — `subagent-invoked` when the role was delegated to the Codex subagent, `local-fallback-explicit` when you executed locally with explicit user authorization, or `local-fallback-tool-unavailable` when subagent tooling was unavailable. Pass these statuses in the `summary-write` packet's `compliance` array so the script transcribes them into the `## Required Agent Compliance` table verbatim. `code-reviewer` may be `N/A` (with a skip reason) only in the trivial band (a single docs/comment/markdown edit) where self-review applies; any change touching more than one file or a production-path file (outside `docs/`, `*.md`, `tests/`) requires a delegated review status.

## Continue

After `PASSED`, route to `kaola-workflow-finalize {project}`.
