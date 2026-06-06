# 4. Script-owned mechanical transitions; contractor retained only for finalization

Date: 2026-06-06
Status: Accepted
Issue: #255
Supersedes: the "contractor at every seam" portions of
`docs/decisions/0002-lean-orchestrator-intent-realignment.md` and refines the
planner-to-executor handoff in
`docs/decisions/0003-adaptive-front-end-planner.md`.

## Context

ADR 0002 moved deterministic workflow bookkeeping out of the main orchestrator
and into a Sonnet `contractor` subagent at every seam. That kept the main Opus
context lean, but live adaptive runs showed the cost clearly: after the
`workflow-planner` finished, the orchestrator still had to summon multiple
contractor calls before the first real role node could start. The same pattern
exists throughout fast, full, and adaptive execution: the contractor is asked to
run scripts, copy verdicts, update state files, and report compact summaries.

The contractor's own contract says it must never dispatch, judge, assess risk,
or ask the user. That means most contractor work is not agent work. It is
deterministic transaction work and should be implemented as typed scripts.

The repo already points in this direction: adaptive `next-action` and
`commit-node` are script cores, and the router/startup bootstrap is already kept
in the main orchestrator because it is deterministic setup rather than a role
dispatch. The remaining problem is that many mechanical state transitions still
pay a subagent round trip.

## Decision

Use deterministic scripts as the default owner for mechanical workflow
transitions.

- **Main orchestrator owns judgment and dispatch.** It selects issues and paths,
  dispatches role agents, reads typed JSON reports, decides risk, decides
  PROCEED versus ESCALATE, asks the user when needed, and owns sink/close
  governance.
- **Scripts own mechanical state transitions.** Any procedure that can be
  expressed as "read durable files, run deterministic checks, update workflow
  artifacts, return typed JSON" belongs in a script, not a contractor prompt.
- **`workflow-planner` owns only the adaptive front-end design contract.** It
  claims the adaptive project, authors the plan, self-checks grammar, and
  returns a structured handoff packet. It does not dispatch nodes or own
  post-plan governance.
- **The adaptive planner-to-first-node handoff becomes checklist-backed.** After
  `workflow-planner` returns, the main orchestrator reads a typed handoff packet
  and checks a finite checklist. If satisfied, it starts the first real node
  immediately. No contractor classify/freeze/orient/advance chain should sit
  between planner completion and first node dispatch.
- **The adaptive between-node loop uses scripts.** Opening a node, recording a
  baseline, committing a node, running the per-node barrier, writing the ledger
  row, updating `workflow-state.md`, writing consent-halt markers, and opening
  the next node are script transactions. The orchestrator still judges failed
  barriers and consent.
- **Fast and full path startup stay in the main orchestrator.** Their starting
  contract is already inline deterministic startup and does not need contractor
  replacement.
- **Fast and full post-dispatch bookkeeping should migrate to scripts.** Fast
  plan setup/capture, execute setup, acceptance run/consequence, summary write,
  and full Phase 1-5 checkpoint/phase-file/progress writes are candidates for
  transaction scripts once their inputs are structured.
- **Phase 6 finalization keeps the contractor for now.** Finalization is the
  densest current surface: artifact mirroring, archive/finalize, roadmap
  regeneration, staging/commit gate, sink metadata preservation, and follow-up
  handoff. Keep the contractor there until a dedicated finalization transaction
  script exists and is tested.

## Script Contract

Replacement scripts must expose typed JSON and be idempotent.

Required properties:

- Accept explicit project, node, decision, and evidence paths as arguments.
- Preserve existing `## Sink` blocks byte-for-byte unless the command explicitly
  updates sink metadata.
- Write artifacts in crash-safe order: cache/evidence first, ledger or phase
  artifact next, `workflow-state.md` pointer last.
- Return typed statuses such as `ready_to_dispatch`, `all_done`,
  `barrier_refused`, `consent_halt_written`, `escalated`, or `blocked`.
- Never ask the user, dispatch a role, or infer governance.
- Be idempotent across resume: no double-opened nodes, no duplicated compliance
  rows, no re-recorded baselines after a node has already started, no duplicate
  roadmap rows.

## Migration Order

1. **Issue #255: adaptive planner-to-first-node handoff.** Add the handoff
   checklist and scripts needed to move directly from `workflow-planner`
   completion to first node dispatch.
2. **Adaptive between-node executor.** Replace orient/open/commit+advance/halt
   contractor brackets with script transactions.
3. **Fast path.** Replace high-frequency contractor calls with fast transaction
   scripts.
4. **Full path Phase 1-5 bookkeeping.** Replace phase checkpoint and phase-file
   transcription only after orchestrator verdicts are passed as structured
   inputs.
5. **Phase 6 finalization.** Design and test a dedicated finalization
   transaction script before removing the last contractor surface.

## Non-goals

- Do not move judgment into scripts.
- Do not move role dispatch into scripts.
- Do not make the main orchestrator hand-edit durable workflow artifacts.
- Do not remove the contractor agent profile until Phase 6 finalization is
  script-owned or formally retired.

## Consequences

Positive:

- Removes redundant subagent latency from the planner-to-first-node path and
  other high-frequency workflow transitions.
- Converts prose-transcribed bookkeeping into typed, testable contracts.
- Keeps the clean judgment boundary from ADR 0002: main decides; mechanics are
  deterministic.

Negative:

- Requires new transaction scripts and mirror updates across Claude, Codex,
  GitLab, and Gitea surfaces.
- Some phase-file authoring currently depends on prose evidence; those surfaces
  need structured inputs before contractor removal is safe.
- Phase 6 remains a temporary exception, so the contractor profile still ships.

## Lock

Going forward, a contractor dispatch is justified only when all of these are
true:

1. The work is not yet safely expressible as a deterministic script.
2. The contractor receives an explicit orchestrator verdict or evidence list.
3. The contractor does not decide, dispatch, ask, or gate.
4. The exception is documented with a migration path to script ownership.

If a workflow procedure is deterministic enough to specify in a contractor
prompt, it is deterministic enough to become a script.
