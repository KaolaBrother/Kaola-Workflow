---
name: kaola-workflow-auto
description: Use when driving an autopilot loop that sequences issue-scout → claim → plan → run → finalize over a backlog goal. The script sequences stages and records receipts; the current session performs all dispatch, claim, plan-run, and sink. Mirror of commands/kaola-workflow-auto.md for Codex runtime.
---

# Skill: kaola-workflow-auto

Entry point for the autopilot driver loop. The script (`kaola-workflow-autopilot.js`)
sequences the workflow stages and records receipts; the current session performs all
dispatch, claim, plan-run, and sink. The script never dispatches agents and never
invokes the sink itself — that boundary is the **lean-orchestrator contract** (#44).
Mirror of `commands/kaola-workflow-auto.md` for the Codex runtime. Reads and writes
`kaola-workflow/{project}/.cache/autopilot-digest.jsonl`.

## Goal Contract

Drive a backlog goal to completion by iterating the stage machine:

```
issue-scout → claim → plan → run → finalize
```

Repeat until one of the six typed stop reasons fires. Record each transition to the
append-only digest so a crash resume replays from the last committed line.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `KAOLA_GOAL` | Operator-side goal statement | required |
| `KAOLA_AUTOPILOT_REPAIR` | Repair consent mode: `ask` halts on any barrier failure; `auto` applies mechanical repairs (`add_to_write_set`, `write_set_swap`) bounded once per node, then halts | `ask` |

## The operator loop

1. Dispatch `issue-scout` (the **current session** dispatches; autopilot never does) and
   capture its JSON output to a file.

2. Resolve and run the `next` query:

   ```bash
   kaola_script(){ _n="$1"; _self=""; [ -f "./package.json" ] && _self="$(node -e "try{process.stdout.write(require(process.cwd()+'/package.json').name||'')}catch(e){}" 2>/dev/null)"; if [ "$_self" = "kaola-workflow" ]; then for _p in "./scripts/$_n" "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; else for _p in "${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/scripts/$_n}" "$HOME/.claude/kaola-workflow/scripts/$_n" "./scripts/$_n"; do [ -f "$_p" ] && { printf '%s\n' "$_p"; return; }; done; fi; return 1; }
   node "$(kaola_script kaola-workflow-autopilot.js)" next \
     --goal "$KAOLA_GOAL" \
     --project <project> \
     --scout-result <path-to-scout-json> \
     --json
   ```

3. Read the returned stage descriptor — `{stage, action, project, goal, inputs, receipt_path}` —
   and perform the named action using the **existing** skills and scripts:

   | `stage` | `action` | What to do |
   |---|---|---|
   | `scout` | `dispatch_issue_scout` | Dispatch the `issue-scout` agent role; save JSON result to a file |
   | `claim` | `claim_bundle` | Run `kaola-workflow-claim.js startup …` with `inputs.issues` |
   | `plan` | `dispatch_planner` | Run `kaola-workflow-adapt <issue>` |
   | `run` | `run_plan` | Run `kaola-workflow-plan-run <project>` |
   | `finalize` | `sink` | Run `kaola-workflow-finalize <project>` then the forge sink |

4. Record the outcome:

   ```bash
   node "$(kaola_script kaola-workflow-autopilot.js)" digest \
     --project <project> \
     --stage <stage> \
     --result advanced \
     --receipt-path <path> \
     --json
   ```

5. Re-invoke `next`. Repeat until a stop descriptor arrives (exit 0; a stop is a clean
   result, not an error).

## Stop reasons

The autopilot emits a typed stop payload `{stop, stage, project, details, receipt_path}`
when it cannot advance further:

| `stop` | Ground truth |
|---|---|
| `goal_satisfied` | `cmdFinalize` stdout `closure_receipt.goal_check === 'satisfied'` |
| `backlog_empty` | Scout JSON `backlog_empty === true && recommended_bundle === null` |
| `consent_halt` | Workflow state `escalated_to_full: consent` or ledger `consent_halt: pending` |
| `security_halt` | Workflow state `escalated_to_full: security` (security-only; no consent marker) |
| `typed_refusal` | A `barrier_failed` envelope carrying triage, or a claim/handoff/validator `{result:'refuse', reason}` (determinate RED — fail closed) |
| `repair_limit` | `repair=auto` exhausted the bounded retry (1 mechanical repair/node; 2nd same-node barrier failure after auto-applied repair) |

<!-- PIN: claim-escalate -->
**Claim escalation** (#495): a claim/startup result: escalate (`target_indeterminate` /
`target_set_indeterminate`) is NOT a `typed_refusal` — the classifier subprocess faulted and
bounded retry is exhausted. **PAUSE and ASK THE OPERATOR** before advancing: offer to retry, pick a
different target, go offline, or abort. This is NOT an `adaptive-node write-halt`; no plan/ledger
exists yet at claim time. Only after the operator resolves the indeterminate state should the
autopilot re-attempt the claim stage.

## Repair consent (KAOLA_AUTOPILOT_REPAIR)

- **`ask`** (default): any `barrier_failed` → `stop:'typed_refusal'` carrying the triage.
  The current session inspects the triage and decides.
- **`auto`**: mechanical-class repairs (`add_to_write_set`, `write_set_swap`) → emit a
  descriptor with `repair:{kind, node, paths}` for the session to apply, log
  `repair_applied` to the digest, re-emit `run`. Bounded: 1 auto-repair/node; a 2nd
  same-node failure → `stop:'repair_limit'`. Non-mechanical triage (`revert_overflow`,
  `unclassified`, absent `proposed_repair`) always halts even under `auto`.

The autopilot **never edits the plan** — it surfaces the repair descriptor; the session
applies the write.

## Lean-orchestrator boundary (#44)

The script sequences stages and records receipts only. It does NOT:
- dispatch agents or invoke agent roles
- invoke the sink, claim, or run-chains directly
- name any forge CLI binary

The current session performs every dispatch, claim, plan-run, and sink action, and keeps
selection-aloud: stating the selected issue before claiming, reading the returned receipt,
judging transitions.

## Script resolver

The `kaola_script()` resolver function shown in the loop above locates the autopilot
script correctly whether running inside the canonical `kaola-workflow` repository or as a
consumer plugin install. Resolve the script once; reuse the path across `next` and
`digest` calls in the same session.

## CLI surface

```
node kaola-workflow-autopilot.js next
  --goal <text>          required
  --project <name>       required once active
  --scout-result <path>  required to advance out of scout stage
  --json

node kaola-workflow-autopilot.js digest
  --project <name>
  --stage   <stage>
  --result  <result>
  --receipt-path <path>  optional
  --repair  <json>       optional
  --json
```

Exit 0 on a clean stage descriptor or stop payload; exit 1 on internal or argument error.

## Digest

The digest (`kaola-workflow/<project>/.cache/autopilot-digest.jsonl`) is append-only, one
JSONL line per transition:

```json
{"ts":"<ISO>","stage":"<scout|claim|plan|run|finalize>","result":"<advanced|stop:<reason>|repair_applied|goal_progress>","receipt_path":"<path|null>"}
```

Crash-resume: the last non-empty line plus the on-disk stage receipt determine the next
descriptor. Absent or corrupt → cold start from `scout`.

## One bundle per invocation

A successful finalize with `goal_check` not yet `satisfied` returns
`result:'goal_progress'` and a scout recommendation for the next bundle. Re-invoke from
`scout` with the new recommendation. The autopilot does not chain bundles in-process.
