---
name: kaola-workflow-fast
description: Use when executing a single-pass Plan+Execute+Review fast path for a small, well-scoped kaola-workflow issue. Writes fast-summary.md and gates Finalization.
---

# Skill: kaola-workflow-fast

Single-pass Plan+Execute+Review for small, well-scoped issues. Writes
`fast-summary.md` and gates Finalization. Mirror of `commands/kaola-workflow-fast.md`
for Codex runtime. Reads and updates `kaola-workflow/{project}/workflow-state.md`
throughout.

<!-- PIN: adaptive-default-contract -->
**Switch-ON contract (#515).** When the adaptive switch is ON, **adaptive is the default and path selection is a non-decision** — do NOT orient, read sibling path skills, deliberate, advisor-consult, or self-route here on issue size. `fast`/`full` are explicit user escapes only (a "fast path"/"full path" verbal, or `KAOLA_PATH`/`--workflow-path`). Reaching this path under an ON switch without an explicit escape is refused at the claim front door (`path_requires_explicit_opt_in`). Under an OFF switch this path is the normal route.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Finalization accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

Fast applies only to mechanical, single-area changes of ≤ 5 files with exactly one sensible approach; ≥ 2 materially-different viable approaches is a design choice that stays on full. Escalate (`escalated_to_full: <trigger> — <detail>`) on `approach_ambiguity`, scope past the declared write set by >1 file or the absolute backstop of 6, `test_thrash` (≥3), security/architecture/breaking-change, discovered dependency, or new external package.

## Boundary: the session decides, the script mutates

This skill follows the same boundary as the adaptive path (ADR 0004): the current
session owns ALL judgment — fast eligibility, approach ambiguity, PROCEED vs
ESCALATE, acceptance sufficiency, and the review verdict — and the deterministic
mechanical transitions (cache/state/`fast-summary.md` writes) are owned by the
fast transaction script `kaola-workflow-fast-advance.js`. The script emits typed
JSON only; it never dispatches a role, asks the user, judges severity, chooses
escalation, or invents write sets. Phase 6 finalization is the only transition
still owned by the `contractor` (handled by the `kaola-workflow-finalize` skill).

## Setup

Resolve `$KAOLA_SCRIPTS` once before the first transaction call:

```bash
KAOLA_SCRIPTS="plugins/kaola-workflow/scripts"
if [ ! -f "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" ]; then
  KAOLA_SCRIPTS="$(dirname "$(find "$HOME/.codex/plugins/cache" -path '*/kaola-workflow/*/scripts/kaola-workflow-fast-advance.js' -print -quit 2>/dev/null)")"
fi
```

Every transaction call also accepts `orient` to (re)derive the current fast step
without mutating anything:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" orient --project {project} --json
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
`file_overflow`, `test_thrash`, security/architecture/breaking-change,
discovered dependency, or new external package) and the `<detail>` — is the
current session's **judgment**, made at Plan, Execute, or Review. Once the
session decides to escalate, it hands the decided trigger + detail to the
transaction script, which writes the durable consequence (it does NOT decide to
escalate, choose the trigger, dispatch a role, or ask the user):

```bash
echo '{"trigger":"<trigger>","detail":"<short detail>"}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" acceptance-consequence \
  --project {project} --decision escalate --stdin --json
```

where `<trigger>` is one of `approach_ambiguity`, `file_overflow`, `test_thrash`,
`security`, `architecture`, `breaking_change`, `dependency`, `new_package`. The
script:

1. Rewrites `workflow-state.md` with `workflow_path: full`, `next_command: /kaola-workflow-phase1 {project}`, `next_skill: kaola-workflow-research {project}` so `/workflow-next` routes correctly on resume (preserving any existing `## Sink` block byte-for-byte).
2. Writes `escalated_to_full: <trigger> — <detail>` to `workflow-state.md` (literal " — " em-dash spacing so the fast-path audit parses the trigger cleanly).
3. Sets `fast-summary.md` `## Status` to the bare verdict `ESCALATED` exactly as the session decided it.
4. Stops; the session then tells the user to re-run `kaola-workflow-next {project}`.

Do not continue fast-path execution after the escalation field is written.

## Step 1 - Plan (planner)

The session dispatches the `planner` (below) and judges its plan; the mechanical
bracket — making the cache dir and stamping the `step: plan` checkpoint — is owned
by the transaction script:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" plan-setup \
  --project {project} --json
```

This creates `kaola-workflow/{project}/.cache/` and stamps the `step: plan`
checkpoint into `workflow-state.md` (`main_session_role: orchestrator`,
`implementation_owner: planner`, `inline_emergency_fallback_authorized: no`,
preserving any existing `## Sink` block byte-for-byte). It is idempotent on resume.

Invoke the `planner` Codex agent role with the linked GitHub issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports the change exceeds ≤ 5 files or reports ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate per Mid-Flight Escalation above — that eligibility judgment is the current session's. Once the session has judged the plan eligible, it hands the planner's declared write set and acceptance command to the transaction script, which writes the `fast-summary.md` `IN_PROGRESS` stub and advances the state pointer to execute:

```bash
echo '{"write_set":["path/to/file","path/to/test-file"],"acceptance_command":"<acceptance check command>","plan":"<brief plan>"}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" plan-capture \
  --project {project} --stdin --json
```

The packet records the session-approved declared write set as the `## Scope`
`- Write Set:` line using the real repository paths exactly as given (so the
parallel-overlap classifier can see this fast project's in-flight files; planner
has Read-only tools), plus the acceptance check command on the `- Acceptance:`
line. The script refuses a missing write set or acceptance command (typed refusal,
zero mutation). It does not parse freeform planner prose or judge eligibility.

## Step 2 - Execute (tdd-guide)

The mechanical bracket — stamping the `step: execute` checkpoint
(`main_session_role: orchestrator`, `implementation_owner: tdd-guide`,
`inline_emergency_fallback_authorized: no`, preserving any existing `## Sink`
block byte-for-byte) and returning a dispatch descriptor for the implementation
role — is owned by the transaction script:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" execute-setup \
  --project {project} --json
```

It is idempotent on resume.

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

The acceptance-check RUN and the consequence WRITE straddle the session's
judgment; they are two separate transaction calls, never one. After `tdd-guide`
returns, the session captures its raw output to `.cache/tdd-guide.md`, then runs
the acceptance check via the script:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" acceptance-run \
  --project {project} --json
```

The script reads the acceptance-check command from the `- Acceptance:` line of
`fast-summary.md`, runs it, captures its real exit code and an output tail to
`.cache/acceptance-run.log`, and returns the run facts only: `exit_code`,
`passed`, `evidence_path`, and a `repeat_count` (a resume-safe count of acceptance
runs — a thrash proxy). It writes NO consequence and does not choose PROCEED vs
ESCALATE.

The session JUDGES the returned facts. If the acceptance check passed and the
`test_thrash` count (consecutive same-test RED→RED cycles, read from
`.cache/tdd-guide.md`) is below threshold, the decision is PROCEED. If the
`test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on the same test),
the session DECIDES to escalate.

On PROCEED, the session hands the decision to the transaction script, which stamps
the `step: review` checkpoint and sets `fast-summary.md` status `REVIEW`:

```bash
node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" acceptance-consequence \
  --project {project} --decision proceed --json
```

On an escalate decision (from this acceptance check, or decided at Plan via
`approach_ambiguity` / `file_overflow`, or at Review via a security / architecture /
breaking-change concern that is not a Trivial Inline Edit), use the escalate form
shown in Mid-Flight Escalation above. The session makes the call; the script writes
the escalation field + `workflow_path: full` routing + `fast-summary.md` status
`ESCALATED` verbatim, preserving any existing `## Sink` block byte-for-byte. It
never judges the acceptance result, decides PROCEED vs escalate, or chooses the
verdict.

## Step 3 - Review (code-reviewer)

Delegated `code-reviewer` is mandatory whenever the change touches > 1 file or any production-path file (anything outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (a single docs/comment/markdown edit). The Trivial Inline Edit exemption below is unchanged.

The `step: review` checkpoint in `workflow-state.md` was already stamped by the
PROCEED path of the Step 2 acceptance consequence (the canonical block the script
writes):

```text
phase: fast
phase_name: Fast
step: review
workflow_path: fast
next_command: /kaola-workflow-fast {project}
main_session_role: orchestrator
implementation_owner: code-reviewer
inline_emergency_fallback_authorized: no
```

Invoke the `code-reviewer` Codex agent role on the modified files from Step 2. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

On BLOCK or any CRITICAL/HIGH finding, escalate per Mid-Flight Escalation above unless it qualifies as a Trivial Inline Edit (one-line mechanical fix) — that triage is the current session's **judgment**. In that exempted case, the orchestrator (not `code-reviewer`, which is Read-only) applies the one-line fix, re-runs the acceptance check, and records `implementation_owner: orchestrator-trivial-fix` in `workflow-state.md` for that touch.

The `## Status` verdict (`PASSED` on a clean review, `ESCALATED` otherwise) is the
current session's judgment. Once the session decides the verdict, it hands it + the
`.cache` evidence to the transaction script, which writes the final
`fast-summary.md` exactly once:

```bash
echo '{"implementation_evidence":"<commands run, test output summary>","review":"<review result>","plan":"<brief plan>","compliance":[{"requirement":"planner","status":"invoked","evidence":".cache/planner.md","skip_reason":""},{"requirement":"tdd-guide","status":"subagent-invoked","evidence":".cache/tdd-guide.md","skip_reason":""},{"requirement":"code-reviewer","status":"subagent-invoked","evidence":".cache/code-reviewer.md","skip_reason":""}]}' | \
  node "$KAOLA_SCRIPTS/kaola-workflow-fast-advance.js" summary-write \
  --project {project} --verdict PASSED --stdin --json
```

The script keeps the `## Scope` `- Write Set:` / `- Acceptance:` lines from the
stub, transcribes Implementation Evidence and Review from the packet, transcribes
the caller-supplied `compliance` array into the `## Required Agent Compliance`
table, sets `## Escalation` to N/A on the PASSED path, writes the `## Status`
line EXACTLY as the session hands it in (it does not restate, soften, upgrade, or
re-grade it), and routes to `kaola-workflow-finalize {project}`. Pass
`--verdict ESCALATED` (with a `{"trigger":...,"detail":...}` packet) for a
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
| planner | invoked | .cache/planner.md | |
| tdd-guide | subagent-invoked | .cache/tdd-guide.md | |
| code-reviewer | subagent-invoked | .cache/code-reviewer.md | |

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Delegation Vocabulary

The `planner`, `tdd-guide`, and `code-reviewer` rows are Codex role rows: each role
is still delegated to its Codex subagent (only the mechanical bookkeeping moved to
the transaction script). Record each row's Status with the delegation vocabulary —
`subagent-invoked` when the role was delegated to the Codex subagent,
`local-fallback-explicit` when you executed locally with explicit user
authorization, or `local-fallback-tool-unavailable` when subagent tooling was
unavailable. You MUST supply a `compliance` array in the `summary-write` packet
(one `{requirement,status,evidence,skip_reason}` object per row, the Status field
set to the vocabulary value above) — the script's default row for `code-reviewer`
is `pending` (not a green status), so omitting the array will cause
`fast_compliance_unresolved` refusal. `code-reviewer` may be `N/A` (with a
documented skip\_reason) only in the trivial band (a single docs/comment/markdown
edit) where self-review applies; any change touching more than one file or a
production-path file (outside `docs/`, `*.md`, `tests/`) requires a delegated
review status.

## Continue

After `PASSED`, route to `kaola-workflow-finalize {project}`.
