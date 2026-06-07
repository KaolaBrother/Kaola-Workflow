# docs node evidence — issue #277

**Node:** docs
**Date:** 2026-06-07
**Declared write set:** README.md, docs/architecture.md, docs/workflow-state-contract.md, docs/conventions.md, docs/api.md

## What was documented

### M3 — Procedure relocation (PREVENTION)

- `docs/conventions.md`: Added "Subagent Seam Rule" section describing that procedure lives in agent profiles, main runs dispatch handles + per-node loop + sink, and script-side enforcement via validate-workflow-contracts.js.
- `docs/architecture.md`: Added "Strict lean-orchestrator boundary (#277 — script-enforced seams)" subsection with M3/M4/M1/M2 details, including the main-direct carve-outs for the per-node loop and sink.

### M4 — Run posture

- `docs/workflow-state-contract.md`: Updated `## Sink` field description to include `run_posture: worktree|in-place`, derived from `deriveRunPosture(worktreePath)` in `kaola-workflow-claim.js`.
- `README.md`: Added note in the `/kaola-workflow-adapt` description that startup records `run_posture: worktree` derived from the actual worktree resolution.

### M1 — SubagentStart dispatch-log hook

- `README.md`: Added `kaola-workflow:subagent-dispatch-log` row to the Installed hooks table; updated "three hooks" references to "four hooks".
- `docs/architecture.md`: Documented M1 in the strict-lean-orchestrator-boundary subsection.
- `docs/workflow-state-contract.md`: Added `.cache/dispatch-log.jsonl` as a durable artifact with field inventory.

### M2 — Closure attestation invariants, WARN-FIRST

- `docs/api.md`: Added two WARN-FIRST detection invariants (8. `claim-planner-attested`, 9. `finalize-contractor-attested`) after the existing 7 gating invariants, with explicit WARN-FIRST semantics, log-gated description, and honest-limit note.
- `docs/api.md`: Added `claim_planner_attested` and `finalize_contractor_attested` fields to the closure receipt schema JSON block with enum `attested|missing|failed`.
- `docs/api.md`: Added paragraph explaining WARN-FIRST behavior of `checkDispatchAttestations` (called at closure time in kaola-workflow-claim.js line 926; never modifies `closure_invariants.violations`).
- `docs/workflow-state-contract.md`: Updated closure invariant cross-reference count from seven to nine (seven hard-gating + two WARN-FIRST).

## Verification

- `node scripts/validate-workflow-contracts.js` → EXIT 0 ("Workflow contract validation passed")
- `node scripts/validate-kaola-workflow-contracts.js` → EXIT 0 ("Kaola-Workflow Codex contract validation passed")
- `git diff --stat` — 5 declared files modified; no files outside the write set were touched by this node.

## Anti-fabrication attestation

All field names, enum values, function signatures, and invariant ids were read directly from source before writing:
- `CLOSURE_RECEIPT_FIELDS` / `CLOSURE_INVARIANTS` / `emptyReceipt` from `scripts/kaola-workflow-closure-contract.js`
- `deriveRunPosture` / `checkDispatchAttestations` call site (line 926) from `scripts/kaola-workflow-claim.js`
- Hook id `kaola-workflow:subagent-dispatch-log`, event `SubagentStart`, script path from `hooks/hooks.json`
- JSON line format `{ts, agent_type, agent_id, cwd}` from `hooks/kaola-workflow-subagent-dispatch-log.sh`
