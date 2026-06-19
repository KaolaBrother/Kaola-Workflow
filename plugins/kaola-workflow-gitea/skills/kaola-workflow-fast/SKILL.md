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
**Adaptive-default contract (#515, #538).** Adaptive is the unconditional default and path selection is a non-decision — do NOT orient, read sibling path skills, deliberate, advisor-consult, or self-route here on issue size. `fast` is an explicit user escape only (a "fast path"/"fast mode" verbal, or `KAOLA_PATH=fast`/`--workflow-path fast`), and reaching it requires the fast path to be installed (`--with-fast`). When `fast` is named but not installed, the claim front door surfaces the typed `path_not_installed` refusal — it does NOT silently run adaptive. There is no automatic fallback into or out of this path (#538).

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Finalization accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

Fast applies only to mechanical, single-area changes of ≤ 5 files with exactly one sensible approach; ≥ 2 materially-different viable approaches is a design choice that stays on full. Escalate (`escalated_to_full: <trigger> — <detail>`) on `approach_ambiguity`, scope past the declared write set by >1 file or the absolute backstop of 6, `test_thrash` (≥3), security/architecture/breaking-change, discovered dependency, or new external package.

## Boundary: main session decides, the script mutates

This skill follows the same boundary as the adaptive path (ADR 0004): the main
session (orchestrator) owns ALL judgment — fast eligibility, approach ambiguity,
PROCEED vs ESCALATE, acceptance sufficiency, and the review verdict — and the
deterministic mechanical transitions (cache/state/`fast-summary.md` writes) are
owned by the fast transaction script `kaola-gitea-workflow-fast-advance.js`. The
script emits typed JSON only; it never dispatches a role, asks the user, judges
severity, chooses escalation, or invents write sets. Phase 6 finalization is the
only transition still owned by `contractor` (handled by the finalize skill).

## Setup

Resolve `$KAOLA_SCRIPTS` once before the first transaction call:

```bash
kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./plugins/kaola-workflow-gitea/scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow-gitea/scripts/$_n" "./plugins/kaola-workflow-gitea/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
KAOLA_SCRIPTS="$(dirname "$(kaola_script kaola-gitea-workflow-fast-advance.js)")"
```

Every transaction call also accepts `orient` to (re)derive the current fast step
without mutating anything:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" orient --project {project} --json
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

Escalate to the full workflow immediately when any of the following is detected
during Plan, Execute, or Review: the planner reports ≥ 2 materially-different
viable approaches (`approach_ambiguity`); scope exceeds the declared write set by
more than 1 file (`file_overflow`) or the absolute backstop of 6 files (whichever
comes first); more than 3 consecutive failing test cycles on the same test
(`test_thrash` threshold); a security, architecture, or breaking-change concern
surfaces; a dependency on another in-flight issue is discovered; or the
implementation requires new external packages.

The orchestrator makes the escalation call; it hands the decided trigger + detail
to the transaction script, which writes the durable consequence (it does NOT
decide to escalate):

```bash
echo '{"trigger":"<trigger>","detail":"<short detail>"}' | \
  node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" acceptance-consequence \
  --project {project} --decision escalate --stdin --json
```

where `<trigger>` is one of `approach_ambiguity`, `file_overflow`, `test_thrash`,
`security`, `architecture`, `breaking_change`, `dependency`, `new_package`. The
script rewrites `workflow-state.md` with `workflow_path: full`,
`next_command: /kaola-workflow-phase1 {project}`,
`next_skill: kaola-workflow-research {project}`, and the
`escalated_to_full: <trigger> — <detail>` field (literal " — " em-dash spacing so
the fast-path audit parses the trigger cleanly), and sets `fast-summary.md` status
`ESCALATED`, preserving any existing `## Sink` block byte-for-byte.

After escalation, stop and tell the user to re-run `kaola-workflow-next {project}`.
Do not continue fast-path execution after the escalation field is written.

## Step 1 - Plan (planner)

### Mechanical Plan Setup (script-owned)

The orchestrator dispatches the `planner` (below) and judges its plan; the
mechanical bracket — making the cache dir and stamping the `step: plan`
checkpoint — is owned by the transaction script:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" plan-setup \
  --project {project} --json
```

This creates `kaola-workflow/{project}/.cache/` and writes the `step: plan`
checkpoint into `workflow-state.md` (`main_session_role: orchestrator`,
`implementation_owner: planner`, `inline_emergency_fallback_authorized: no`),
preserving any existing `## Sink` block byte-for-byte. It is idempotent on resume.

Invoke the `planner` Codex agent role with the linked Gitea issue body and phase1/phase2 excerpts if they exist. Ask for: files to touch (the declared write set — ≤ 5 files in a single area), whether the approach is mechanical with exactly one sensible way or has ≥ 2 materially-different viable approaches, exact change per file, acceptance check command, out-of-scope items.

Write raw output to `kaola-workflow/{project}/.cache/planner.md`.

If planner reports > 5 files or ≥ 2 materially-different viable approaches (`approach_ambiguity`), escalate per Mid-Flight Escalation above. That eligibility judgment is the orchestrator's.

### Mechanical Plan Capture (script-owned)

The `planner` agent does not write files itself (Read-only tools), so the
orchestrator captures the planner's raw output to `.cache/planner.md` and reads
its declared write set. Once the orchestrator has judged the plan eligible, it
hands the declared write set and acceptance command to the transaction script,
which writes the `fast-summary.md` `IN_PROGRESS` stub and advances the state
pointer to execute:

```bash
echo '{"write_set":["path/to/file","path/to/test-file"],"acceptance_command":"<acceptance check command>","plan":"<brief plan>"}' | \
  node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" plan-capture \
  --project {project} --stdin --json
```

The packet records the orchestrator-approved declared write set as the `## Scope`
`- Write Set:` line using the real repository paths exactly as given (so the
parallel-overlap classifier can see this fast project's in-flight files), plus the
acceptance check command on the `- Acceptance:` line. The script refuses a missing
write set or acceptance command (typed refusal, zero mutation). It does not parse
freeform planner prose or judge eligibility.

## Step 2 - Execute (tdd-guide)

### Mechanical Execute Setup (script-owned)

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" execute-setup \
  --project {project} --json
```

This writes the `step: execute` checkpoint into `workflow-state.md`
(`main_session_role: orchestrator`, `implementation_owner: tdd-guide`,
`inline_emergency_fallback_authorized: no`), preserving any existing `## Sink`
block byte-for-byte, and returns a `dispatch` descriptor for the implementation
role. It is idempotent on resume.

Invoke the `tdd-guide` Codex agent role with the planner plan and constraints:

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to `kaola-workflow/{project}/.cache/tdd-guide.md`.

The acceptance-check RUN and the consequence WRITE straddle the orchestrator's
judgment; they are two separate transaction calls, never one.

### Mechanical Acceptance Run (script-owned)

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" acceptance-run \
  --project {project} --json
```

The script reads the acceptance-check command from the `- Acceptance:` line of
`fast-summary.md`, runs it, captures its real exit code and an output tail to
`.cache/acceptance-run.log`, and returns the run facts only: `exit_code`,
`passed`, `evidence_path`, and a `repeat_count` (a resume-safe count of acceptance
runs — a thrash proxy). It writes NO consequence to `workflow-state.md` or
`fast-summary.md` and does not choose PROCEED vs ESCALATE.

The orchestrator JUDGES the returned facts. If the acceptance check passed and the
`test_thrash` count (consecutive same-test RED→RED cycles, read from
`.cache/tdd-guide.md`) is below threshold, the decision is PROCEED. If the
`test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on the same test),
the orchestrator DECIDES to escalate.

### Mechanical Acceptance Consequence (script-owned)

On PROCEED, the orchestrator hands the decision to the transaction script, which
stamps the `step: review` checkpoint and sets `fast-summary.md` status `REVIEW`:

```bash
node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" acceptance-consequence \
  --project {project} --decision proceed --json
```

On ESCALATE (from this acceptance check, or decided at Plan via
`approach_ambiguity` / `file_overflow`, or at Review via a security / architecture /
breaking-change concern that is not a Trivial Inline Edit), use the escalate form
shown in Mid-Flight Escalation above. The orchestrator makes the call; the script
writes the escalation field + `workflow_path: full` routing + `fast-summary.md`
status `ESCALATED` verbatim, preserving any existing `## Sink` block byte-for-byte.

## Step 3 - Review (code-reviewer)

Delegated `code-reviewer` is mandatory for any change touching > 1 file or any production-path file (outside `docs/`, `*.md`, `tests/`); self-review only for the trivial band (single docs/comment/markdown edit).

The `step: review` checkpoint in `workflow-state.md` was already stamped by the
PROCEED path of the Step 2 acceptance consequence (`main_session_role:
orchestrator`, `implementation_owner: code-reviewer`,
`inline_emergency_fallback_authorized: no`).

Invoke the `code-reviewer` Codex agent role on modified files. Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to `kaola-workflow/{project}/.cache/code-reviewer.md`.

The orchestrator JUDGES the review verdict. On BLOCK or CRITICAL/HIGH finding, escalate per Mid-Flight Escalation above unless Trivial Inline Edit. In that exempted case, orchestrator (not code-reviewer, which has Read-only tools) applies the fix, re-runs the acceptance check, and records `implementation_owner: orchestrator-trivial-fix`.

### Mechanical Summary Write (script-owned)

The fast-summary `## Status` verdict (`PASSED` on a clean review, `ESCALATED`
otherwise) is the orchestrator's JUDGMENT. Once the orchestrator has decided the
verdict, it hands it + the `.cache` evidence to the transaction script, which
writes the final `fast-summary.md` exactly once:

```bash
echo '{"implementation_evidence":"<commands run, test output summary>","review":"<review result>","plan":"<brief plan>","compliance":[{"requirement":"planner","status":"invoked","evidence":".cache/planner.md","skip_reason":""},{"requirement":"tdd-guide","status":"subagent-invoked","evidence":".cache/tdd-guide.md","skip_reason":""},{"requirement":"code-reviewer","status":"subagent-invoked","evidence":".cache/code-reviewer.md","skip_reason":""}]}' | \
  node "$KAOLA_SCRIPTS/kaola-gitea-workflow-fast-advance.js" summary-write \
  --project {project} --verdict PASSED --stdin --json
```

The script keeps the `## Scope` `- Write Set:` / `- Acceptance:` lines from the
stub, transcribes Implementation Evidence and Review from the packet, transcribes
the caller-supplied `compliance` array into the `## Required Agent Compliance`
rows, writes the `## Status` line EXACTLY as the orchestrator hands it in (it
does not restate, soften, or upgrade it), and routes to
`/kaola-workflow-finalize {project}`. Pass `--verdict ESCALATED` (with a
`{"trigger":...,"detail":...}` packet) for a terminal escalation at Review.

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

## Mechanical Bookkeeping (script-owned)

Every **judgment** stays with the main session: it dispatches the `planner` /
`tdd-guide` / `code-reviewer` role agents (a subagent cannot dispatch a subagent),
judges fast eligibility (≤ 5 files, exactly one sensible approach vs. a design
choice), judges the acceptance result and the `test_thrash` count, decides PROCEED
vs. escalate, judges the review verdict, and DECIDES the `fast-summary.md`
`## Status` verdict (`PASSED` on a clean review, `ESCALATED` otherwise). The
deterministic bookkeeping around those decisions — cache/state checkpoints and the
`fast-summary.md` writes — is owned by the fast transaction script
`kaola-gitea-workflow-fast-advance.js` (ADR 0004), which emits typed JSON only: it
runs the scripted transition but never dispatches a role, never judges eligibility /
acceptance / the review, never decides PROCEED vs. escalate or the status verdict,
never escalates on its own, never closes the issue, and never asks the user — it
writes only the consequence the session hands it. Re-derive the script path once
via `$KAOLA_SCRIPTS` (Setup above), capture real exit codes from each call's typed
JSON, and never gate on a piped `| tail`.

The mechanical bracket the script owns:

- **`plan-setup`:** make `kaola-workflow/{project}/.cache/` and stamp the
  `step: plan` checkpoint into `workflow-state.md` (`main_session_role:
  orchestrator`, `implementation_owner: planner`,
  `inline_emergency_fallback_authorized: no`), preserving any `## Sink` block
  byte-for-byte. Idempotent.
- **`plan-capture --stdin`:** once the orchestrator has judged the plan eligible,
  write the `IN_PROGRESS` `fast-summary.md` stub from the packet, recording the
  orchestrator-handed declared write set as the `## Scope` `- Write Set:` line with
  real repository paths (so the parallel-overlap classifier can see this fast
  project's in-flight files) plus the acceptance command on `- Acceptance:`, and
  advance the state pointer to execute.
- **`execute-setup`:** stamp the `step: execute` checkpoint
  (`implementation_owner: tdd-guide`), preserving `## Sink`. Idempotent.
- **`acceptance-run`, then STOP:** run the acceptance command (from `- Acceptance:`),
  capture its real exit code plus a short output tail, and return the run facts
  (`exit_code` / `passed` / `evidence_path` / `repeat_count`) — write **no**
  consequence. The orchestrator JUDGES those facts and decides PROCEED vs. escalate.
- **`acceptance-consequence --decision proceed|escalate` (a separate, second call):**
  write the one durable consequence the orchestrator decided. On PROCEED: stamp the
  `step: review` checkpoint (`implementation_owner: code-reviewer`) and set
  `fast-summary.md` to `REVIEW`. On ESCALATE (`--stdin` packet `{trigger,detail}`):
  write the `escalated_to_full: <trigger> — <detail>` field (literal ` — ` em-dash
  spacing) plus the `workflow_path: full` /
  `next_command: /kaola-workflow-phase1 {project}` /
  `next_skill: kaola-workflow-research {project}` routing and set `fast-summary.md`
  to status `ESCALATED`. The run and the consequence-write straddle the
  orchestrator's judgment — they are two separate calls, never one. This same
  consequence call is reused whenever the orchestrator decides an escalation at Plan
  (`approach_ambiguity` / `file_overflow`) or Review.
- **`summary-write --verdict PASSED|ESCALATED --stdin`:** author the terminal
  `fast-summary.md` once from the orchestrator-judged verdict and the `.cache`
  evidence — write the `## Status` line EXACTLY as the orchestrator hands it in (do
  not restate, soften, or upgrade it); keep the `## Scope` lines; transcribe
  Implementation Evidence and Review from the packet and write the
  `## Required Agent Compliance` rows. The PASSED path routes to
  `/kaola-workflow-finalize {project}`.

Because the script runs in its own process, capture anything it needs (the
orchestrator-decided write set, acceptance command, PROCEED/ESCALATE decision,
trigger + detail, and the `## Status` verdict) in THIS session before each call —
judgments cross the boundary only as explicit packet fields, never implicitly.

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
