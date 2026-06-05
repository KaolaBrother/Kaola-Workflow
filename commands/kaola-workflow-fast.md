---
description: Kaola-Workflow Fast Path. Single-pass Plan+Execute+Review for small, well-scoped issues. Writes fast-summary.md and gates Phase 6.
argument-hint: <project name>
---

# Kaola-Workflow Fast Path

Fast path executes Plan, Implement, and Review in a single pass for issues
where the scope is small and the approach is unambiguous. Outputs `fast-summary.md`
which Phase 6 reads when `workflow_path: fast`.

Mid-flight escalation to full workflow is mandatory if scope grows unexpectedly.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Phase 6 accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

## Agent Model Badge

Every subagent dispatch below includes an explicit `model=` line. Always pass it
exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.

## Resume Detection

If `fast-summary.md` exists with status `PASSED`, fast path is complete. Route to:

```text
/kaola-workflow-phase6 {project}
```

Otherwise detect step:

- `fast-summary.md` absent → `plan`
- `fast-summary.md` has status `IN_PROGRESS` → `execute`
- `fast-summary.md` has status `REVIEW` → `review`
- `fast-summary.md` has status `ESCALATED` → escalation already committed; route to full workflow:

```text
/kaola-workflow-phase1 {project}
```

## Fast Eligibility

Fast path applies only when the approach is **unambiguous and mechanical** —
exactly one sensible way to do it. Mechanical examples: rename or move a symbol
across files; thread an existing field or param through a known call path; a
behavior-preserving refactor; repetitive parallel edits; a bug fix whose root
cause is already located. All of these must also hold: single area; no new
external deps; no public API/schema/migration change; no security/auth/encryption
concern; no `depends-on:#N`; no breaking-change or architecture concern; and the
write set is **≤ 5** files within that single area.

Anything with **≥ 2 materially-different viable approaches** stays on full,
regardless of size — that is a design choice, where full-workflow ideation earns
its keep. File count alone no longer disqualifies; ambiguity does.

## Mid-Flight Escalation

Escalate to the full workflow immediately when any of the following is detected
during Plan, Execute, or Review:

- the planner reports ≥ 2 materially-different viable approaches (`approach_ambiguity`) — exactly one sensible approach is required for fast path
- scope exceeds the planner's declared write set by more than 1 file (`file_overflow`), or exceeds the absolute backstop of 6 files (whichever comes first)
- more than 3 consecutive failing test cycles on the same test (`test_thrash` threshold)
- a security, architecture, or breaking-change concern surfaces
- a dependency on another in-flight issue is discovered
- the implementation requires new external packages

On escalation:

1. Rewrite `workflow-state.md` with `workflow_path: full`, `next_command: /kaola-workflow-phase1 {project}`, `next_skill: kaola-workflow-research {project}` so `/workflow-next` routes correctly on resume.
2. Write `escalated_to_full: <trigger> — <detail>` to `workflow-state.md`, where `<trigger>` is one of `approach_ambiguity`, `file_overflow`, `test_thrash`, `security`, `architecture`, `breaking_change`, `dependency`, `new_package`. Use the literal " — " (em-dash with spaces) before the detail so the fast-path audit parses the trigger cleanly.
3. Write a brief escalation note to `fast-summary.md` with status `ESCALATED`.
4. Stop and tell the user to re-run `/workflow-next {project}`.

Do not continue fast-path execution after writing the escalation field.

## Step 1 - Plan (planner)

### Mechanical Plan Setup (delegated to the contractor)

The orchestrator dispatches the `planner` (below) and judges its plan; the
mechanical bracket — making the cache dir and stamping the `step: plan`
checkpoint — is deterministic bookkeeping the contractor owns.

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical fast plan-setup {project}",
  prompt="Run the Step 1 mechanical setup for the fast path of {project}: create the cache dir (`mkdir -p kaola-workflow/{project}/.cache`) and write the `step: plan` checkpoint into `kaola-workflow/{project}/workflow-state.md` exactly as the block below in this command file specifies (phase: fast / phase_name: Fast / step: plan / workflow_path: fast / next_command: /kaola-workflow-fast {project} / main_session_role: orchestrator / implementation_owner: planner / inline_emergency_fallback_authorized: no), PRESERVING any existing `## Sink` block byte-for-byte. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Return a compact bookkeeping summary; do NOT dispatch the planner or any role, do NOT judge the plan, do NOT escalate, do NOT close the issue, do NOT ask the user."
)
```

This makes the cache dir (`mkdir -p kaola-workflow/{project}/.cache`) and writes
`workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: plan
workflow_path: fast
next_command: /kaola-workflow-fast {project}
main_session_role: orchestrator
implementation_owner: planner
inline_emergency_fallback_authorized: no
```

Invoke the Claude Code agent `planner` with the linked
GitHub issue body and `phase1-research.md` / `phase2-ideation.md` excerpts if
they exist (otherwise issue body alone):

You MUST pass `model="{PLANNER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="planner",
  model="{PLANNER_MODEL}",
  description="Fast plan {project}",
  prompt="..."
)
```

Ask for:

- files to touch (the declared write set — must be ≤ 5 files in a single area for fast path to apply)
- explicitly: is there exactly one sensible approach, or ≥ 2 materially-different ones?
- exact change per file
- acceptance check command
- explicit out-of-scope items

Write raw output to:

```text
kaola-workflow/{project}/.cache/planner.md
```

If the planner reports the change exceeds ≤ 5 files, or reports ≥ 2
materially-different viable approaches, escalate per Mid-Flight Escalation above.
That eligibility judgment is the orchestrator's.

The `planner` agent does not write files itself (Read/Grep/Glob tools only), so
the orchestrator (main session) captures the planner's raw output to
`.cache/planner.md` and reads its declared write set. Once the orchestrator has
judged the plan eligible, it hands the declared write set into the contractor,
which writes the `fast-summary.md` stub.

### Mechanical Plan Capture (delegated to the contractor)

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical fast plan-capture {project}",
  prompt="Capture the orchestrator-judged plan for the fast path of {project} into the durable `fast-summary.md` stub. Read `.cache/planner.md` for the plan detail. Write `kaola-workflow/{project}/fast-summary.md` with `## Status` line `IN_PROGRESS`, and in `## Scope` record the declared write set the orchestrator hands you as the `- Write Set:` line using the real repository paths exactly as given (so the parallel-overlap classifier can see this fast project's in-flight files), plus the acceptance check command on the `- Acceptance:` line. Fill the remaining sections per the `## Write fast-summary.md` template below in this command file (Plan from `.cache/planner.md`; Implementation Evidence / Review left as pending placeholders at this stage). Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Return a compact bookkeeping summary; do NOT dispatch a role, do NOT judge eligibility or the plan, do NOT decide the status verdict, do NOT escalate, do NOT close the issue, do NOT ask the user."
)
```

## Step 2 - Execute (tdd-guide)

### Mechanical Execute Setup (delegated to the contractor)

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical fast execute-setup {project}",
  prompt="Write the `step: execute` checkpoint into `kaola-workflow/{project}/workflow-state.md` exactly as the block below in this command file specifies (phase: fast / phase_name: Fast / step: execute / workflow_path: fast / next_command: /kaola-workflow-fast {project} / main_session_role: orchestrator / implementation_owner: tdd-guide / inline_emergency_fallback_authorized: no), PRESERVING any existing `## Sink` block byte-for-byte. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Return a compact bookkeeping summary; do NOT dispatch the tdd-guide or any role, do NOT run the acceptance check, do NOT judge, do NOT escalate, do NOT close the issue, do NOT ask the user."
)
```

This writes `workflow-state.md`:

```text
phase: fast
phase_name: Fast
step: execute
workflow_path: fast
next_command: /kaola-workflow-fast {project}
main_session_role: orchestrator
implementation_owner: tdd-guide
inline_emergency_fallback_authorized: no
```

Invoke the Claude Code agent `tdd-guide` with the
planner-produced plan and explicit constraints:

You MUST pass `model="{TDD_GUIDE_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="tdd-guide",
  model="{TDD_GUIDE_MODEL}",
  description="Fast execute {project}",
  prompt="..."
)
```

- no new external package dependencies
- no changes to public APIs, schemas, or shared infrastructure
- write tests first (RED → GREEN → refactor while green)
- keep edits inside the planner's write set

Write raw output to:

```text
kaola-workflow/{project}/.cache/tdd-guide.md
```

The `tdd-guide` agent does not write workflow bookkeeping itself, so after it
returns the orchestrator captures its raw output to `.cache/tdd-guide.md`. The
acceptance-check RUN is mechanical and is delegated to the contractor, which
runs it and reports — then STOPS. The orchestrator JUDGES the acceptance result
and the `test_thrash` count, DECIDES whether to PROCEED or escalate, and only
then summons the contractor again to write the decided consequence verbatim.
The run and the consequence-write straddle the orchestrator's judgment; they are
two separate contractor summons, never one.

### Mechanical Acceptance Run (delegated to the contractor)

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical fast acceptance {project}",
  prompt="Run the acceptance-check command for the fast path of {project} (read it from the `- Acceptance:` line of `kaola-workflow/{project}/fast-summary.md`, or as the orchestrator hands it in) and STOP — write no consequence. Capture its real exit code and a short output tail; never gate on a piped | tail. Report whether the acceptance check passed (its real exit code) and the `test_thrash` count (consecutive same-test RED→RED cycles) you read from `.cache/tdd-guide.md`. Re-derive your own kaola_script. Return a compact report of the exit code + thrash count and nothing more; do NOT dispatch a role, do NOT judge the acceptance result, do NOT decide PROCEED vs escalate, do NOT write any `workflow-state.md` or `fast-summary.md` consequence, do NOT close the issue, do NOT ask the user."
)
```

The orchestrator JUDGES the contractor's report. If the acceptance check passed
and `test_thrash` is below threshold, the decision is PROCEED. If the
`test_thrash` threshold is hit (≥ 3 consecutive RED→RED cycles on the same test),
the orchestrator DECIDES to escalate. Either way the orchestrator then hands the
decided consequence into the contractor below, which writes it verbatim.

### Mechanical Acceptance Consequence (delegated to the contractor)

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical fast acceptance-consequence {project}",
  prompt="Write the single durable consequence the orchestrator has decided for the fast path of {project}, and ONLY that one — the orchestrator made the judgment; you transcribe it. If the orchestrator hands you PROCEED: write the `step: review` checkpoint into `kaola-workflow/{project}/workflow-state.md` (phase: fast / phase_name: Fast / step: review / workflow_path: fast / next_command: /kaola-workflow-fast {project} / main_session_role: orchestrator / implementation_owner: code-reviewer / inline_emergency_fallback_authorized: no) and set `fast-summary.md` `## Status` to `REVIEW`. If the orchestrator hands you ESCALATE: write the `escalated_to_full: <trigger> — <detail>` field (with the literal ` — ` em-dash spacing) plus the `workflow_path: full` / `next_command: /kaola-workflow-phase1 {project}` / `next_skill: kaola-workflow-research {project}` routing into `workflow-state.md` and set `fast-summary.md` `## Status` to `ESCALATED`, exactly as the Mid-Flight Escalation section above specifies. PRESERVE any existing `## Sink` block byte-for-byte. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Return a compact bookkeeping summary; do NOT dispatch a role, do NOT judge the acceptance result, do NOT decide the status verdict or whether to escalate, do NOT close the issue, do NOT ask the user."
)
```

This same consequence bracket is the one the orchestrator summons whenever it
DECIDES an escalation at Plan (`approach_ambiguity` / `file_overflow`) or Review
(a security/architecture/breaking-change concern, or a BLOCK that is not a
Trivial Inline Edit): the orchestrator makes the call and hands in the ESCALATE
consequence; the contractor writes the escalation field + `fast-summary.md`
status `ESCALATED` verbatim.

## Step 3 - Review (code-reviewer)

Delegated `code-reviewer` is mandatory whenever the change touches **> 1 file**
or any production-path file (anything outside `docs/`, `*.md`, `tests/`).
Self-review is allowed ONLY for the trivial band — a single docs, comment, or
markdown edit. The Trivial Inline Edit exemption below (applying a one-line
reviewer fix) is unchanged.

The `step: review` checkpoint in `workflow-state.md` was already stamped by the
contractor on the PROCEED path of the Step 2 acceptance run (the canonical block
it writes):

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

Invoke the Claude Code agent `code-reviewer` on the
modified files from Step 2:

You MUST pass `model="{CODE_REVIEWER_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="code-reviewer",
  model="{CODE_REVIEWER_MODEL}",
  description="Fast review {project}",
  prompt="..."
)
```

Ask it to check:

- all acceptance check commands pass
- no new CRITICAL or HIGH security concerns
- no debug statements or hardcoded credentials
- implementation matches the plan from Step 1

Write raw output to:

```text
kaola-workflow/{project}/.cache/code-reviewer.md
```

The `code-reviewer` agent does not write workflow bookkeeping itself, so the
orchestrator captures its raw output to `.cache/code-reviewer.md` and JUDGES the
review verdict. If the reviewer returns BLOCK or any CRITICAL/HIGH finding,
escalate per Mid-Flight Escalation above unless it qualifies as a Trivial Inline
Edit (one-line mechanical fix). In that exempted case, the orchestrator (not
code-reviewer, which has Read-only tools) applies the fix, re-runs the
acceptance check, and records `implementation_owner: orchestrator-trivial-fix`
in workflow-state.md for that touch.

The fast-summary `## Status` verdict (`PASSED` on a clean review, `ESCALATED`
otherwise) is the orchestrator's JUDGMENT. Once the orchestrator has decided the
verdict, it hands it into the contractor, which writes the final `fast-summary.md`
verbatim.

### Mechanical Summary Write (delegated to the contractor)

You MUST pass `model="{CONTRACTOR_MODEL}"` in this Agent call exactly as shown —
do not omit the `model=` line.

```text
Agent(
  subagent_type="contractor",
  model="{CONTRACTOR_MODEL}",
  description="Mechanical fast summary {project}",
  prompt="Author the final `kaola-workflow/{project}/fast-summary.md` for the fast path of {project} from the orchestrator-judged review verdict and the `.cache` evidence. Write the `## Status` line EXACTLY as the orchestrator hands it in (`PASSED` on a clean review) — do not restate, soften, or upgrade it. Fill the file per the `## Write fast-summary.md` template below in this command file: keep the `## Scope` `- Write Set:` / `- Acceptance:` lines from the stub; transcribe Implementation Evidence from `.cache/tdd-guide.md` (commands run, test-output summary), Review from `.cache/code-reviewer.md`, and the `## Required Agent Compliance` rows (planner / tdd-guide / code-reviewer, each `invoked` with its `.cache/<role>.md` evidence path); set `## Escalation` to N/A on the PASSED path. Re-derive your own kaola_script. Capture real exit codes; never gate on a piped | tail. Return a compact bookkeeping summary; do NOT dispatch a role, do NOT judge the review or decide the status verdict, do NOT escalate, do NOT close the issue, do NOT ask the user."
)
```

This writes `fast-summary.md` with the orchestrator-decided `## Status` (e.g.
`PASSED`) verbatim.

## Write fast-summary.md

```markdown
# Fast Summary: {project}

## Status
PASSED | IN_PROGRESS | REVIEW | ESCALATED

## Scope
- Write Set: path/to/file, path/to/test-file
- Acceptance: <acceptance check command>

## Plan
[brief description of what was done]

## Implementation Evidence
[commands run, test output summary]

## Review
[review result]

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue to Phase 6

After `fast-summary.md` is `PASSED`, continue:

```text
/kaola-workflow-phase6 {project}
```
