---
description: Kaola-Workflow Fast Path. Single-pass Plan+Execute+Review for small, well-scoped issues. Writes fast-summary.md and gates Finalization.
argument-hint: <project name>
---

# Kaola-Workflow Fast Path

Fast path executes Plan, Implement, and Review in a single pass for issues
where the scope is small and the approach is unambiguous. Outputs `fast-summary.md`
which Finalization reads when `workflow_path: fast`.

Mid-flight escalation to full workflow is mandatory if scope grows unexpectedly.

<!-- PIN: adaptive-default-contract -->
**Adaptive-default contract.** Adaptive is the unconditional default and path selection is a non-decision — do NOT orient, read sibling path skills, deliberate, advisor-consult, or self-route here on issue size. `fast` is an explicit user escape only (a "fast path"/"fast mode" verbal, or `KAOLA_PATH=fast`/`--workflow-path fast`), and reaching it requires the fast path to be installed (`--with-fast`). When `fast` is named but not installed, the claim front door surfaces the typed `path_not_installed` refusal — it does NOT silently run adaptive. There is no automatic fallback into or out of this path.

## Goal Contract

Complete a single-pass Plan+Execute+Review cycle for the named project and
write a `PASSED` `fast-summary.md` that Finalization accepts as a full-workflow
substitute. Stop if scope exceeds fast-path bounds.

## Boundary: main session decides, the script mutates

This command follows the same boundary as the adaptive path: the main
session (orchestrator) owns ALL judgment — fast eligibility, approach ambiguity,
PROCEED vs ESCALATE, acceptance sufficiency, and the review verdict — and the
deterministic mechanical transitions (cache/state/`fast-summary.md` writes) are
owned by the fast transaction script `kaola-gitea-workflow-fast-advance.js`. The script
emits typed JSON only; it never dispatches a role, asks the user, judges severity,
chooses escalation, or invents write sets. Phase 6 finalization is the only
transition still owned by `contractor` (handled by `/kaola-workflow-finalize`).

## Agent Model Badge

Every role subagent dispatch below includes an explicit `model=` line. Always pass
it exactly as written — it is what makes Claude Code show the model badge on the
subagent card. The installer fills each `model="{...}"` placeholder with the
agent's frontmatter model (for example `model="sonnet"`); never omit the `model=` line.
You MUST pass `model="{PLANNER_MODEL}"` / `model="{TDD_GUIDE_MODEL}"` /
`model="{CODE_REVIEWER_MODEL}"` in the respective role Agent calls exactly as shown.

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

If `fast-summary.md` exists with status `PASSED`, fast path is complete. Route to:

```text
/kaola-workflow-finalize {project}
```

Otherwise detect step (this is what `orient` reports):

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

On escalation, the orchestrator hands the decided trigger + detail to the
transaction script, which writes the durable consequence (it does NOT decide to
escalate):

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

After escalation, stop and tell the user to re-run `/workflow-next {project}`. Do
not continue fast-path execution.

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
checkpoint into `kaola-workflow/{project}/workflow-state.md` (phase: fast /
phase_name: Fast / step: plan / workflow_path: fast / next_command:
/kaola-workflow-fast {project} / main_session_role: orchestrator /
implementation_owner: planner / inline_emergency_fallback_authorized: no),
preserving any existing `## Sink` block byte-for-byte. It is idempotent on resume.

Invoke the Claude Code agent `planner` with the linked
Gitea issue body and `phase1-research.md` / `phase2-ideation.md` excerpts if
they exist (otherwise issue body alone):

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

### Mechanical Plan Capture (script-owned)

The `planner` agent does not write files itself (Read/Grep/Glob tools only), so
the orchestrator (main session) captures the planner's raw output to
`.cache/planner.md` and reads its declared write set. Once the orchestrator has
judged the plan eligible, it hands the declared write set and acceptance command
to the transaction script, which writes the `fast-summary.md` `IN_PROGRESS` stub
and advances the state pointer to execute:

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

This writes the `step: execute` checkpoint into `workflow-state.md` (phase: fast /
phase_name: Fast / step: execute / workflow_path: fast / next_command:
/kaola-workflow-fast {project} / main_session_role: orchestrator /
implementation_owner: tdd-guide / inline_emergency_fallback_authorized: no),
preserving any existing `## Sink` block byte-for-byte, and returns a `dispatch`
descriptor for the implementation role. It is idempotent on resume.

Invoke the Claude Code agent `tdd-guide` with the
planner-produced plan and explicit constraints:

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
acceptance-check RUN and the consequence WRITE straddle the orchestrator's
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

Delegated `code-reviewer` is mandatory whenever the change touches **> 1 file**
or any production-path file (anything outside `docs/`, `*.md`, `tests/`).
Self-review is allowed ONLY for the trivial band — a single docs, comment, or
markdown edit. The Trivial Inline Edit exemption below (applying a one-line
reviewer fix) is unchanged.

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

Invoke the Claude Code agent `code-reviewer` on the
modified files from Step 2:

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
table, sets `## Escalation` to N/A on the PASSED path, writes the `## Status`
line EXACTLY as the orchestrator hands it in (it does not restate, soften, or
upgrade it), and routes to `/kaola-workflow-finalize {project}`. Pass
`--verdict ESCALATED` (with a `{"trigger":...,"detail":...}` packet) for a
terminal escalation at Review.

<!-- PIN: fast-compliance-backstop -->
**Fast-lane compliance backstop:** `summary-write --verdict PASSED` runs
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

## Write fast-summary.md

The script renders this format; it is reproduced here as the durable contract:

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
| tdd-guide | subagent-invoked | .cache/tdd-guide.md | |
| code-reviewer | subagent-invoked | .cache/code-reviewer.md | |

## Escalation
[escalated_to_full: <trigger> or N/A]
```

## Continue to Finalization

After `fast-summary.md` is `PASSED`, continue:

```text
/kaola-workflow-finalize {project}
```
