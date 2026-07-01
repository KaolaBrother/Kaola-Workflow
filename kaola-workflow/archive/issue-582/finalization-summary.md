# Finalization - Summary: issue-582

## Delivered

- Reopened #582 after installed-runtime validation showed V2 `reasoning_effort:
  "high"` children recorded `turn_context.effort: "xhigh"`.
- Updated all six Codex plan-run command/skill surfaces so a non-null
  `dispatch.codex_reasoning_effort` requires fresh child-session JSONL proof for
  the exact requested effort before either V2 or V1 tiered dispatch.
- Added validator coverage that pins the proof requirement across root, Codex,
  GitLab, and Gitea surfaces.
- Added `docs/decisions/D-582-02.md` and updated `docs/api.md`.
- Corrected `CHANGELOG.md` so it states the fail-closed behavior instead of an
  unproved effective-effort claim.

## Final Validation Evidence

`verdict: pass` is recorded in `.cache/final-validation.md`. The full four-chain
receipt is `.cache/chain-receipt.json`; finalization metadata written after that
receipt is outside the chain reuse boundary and is validated by the finalization
gates.

## Documentation Docking

DOCKED in `.cache/doc-docking.md`.

## Run gaps

None. `.cache/run-gaps.json` contains an empty `sweptClasses` array.

## Closure Decision

Issue #582 is complete and should close on the merge sink. The local runtime
still does not prove `high`; the delivered repo behavior is the required
fail-closed contract until a future child-session proof records the requested
effort exactly.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | `.cache/final-validation.md`, `.cache/chain-receipt.json` | |
| doc-updater | local-fallback-tool-unavailable | `.cache/n2-doc-runtime-proof.md`, `.cache/doc-updater.md` | Active session policy disallowed workflow-role subagent delegation; docs were updated inline from verified source and live JSONL evidence. |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| run-gap sweep | invoked | `.cache/run-gaps.json`, `finalization-summary.md` | |
| mechanical finalization contractor | local-fallback-tool-unavailable | `finalization-summary.md` | Active session policy disallowed contractor-role delegation; mechanical finalization runs inline. |
| roadmap refresh | invoked | `kaola-workflow/ROADMAP.md` | Pre-sink: archive finalization refreshes the generated roadmap. |
| archive completed folder | invoked | `kaola-workflow/archive/issue-582` | Pre-sink: finalized by `kaola-workflow-claim.js finalize --keep-worktree`. |
| final commit and push | invoked | git status and sink receipt | Pre-sink: branch commit and sink merge run after finalization gates pass. |
