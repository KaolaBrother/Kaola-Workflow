# Finalization - Summary: issue-584

## Delivered

- Hardened Codex preflight detection for `features.multi_agent_v2` so it accepts
  boolean, inline-object, and table-form enabled config only in the supported
  TOML locations.
- Preserved fail-closed behavior for missing, false, malformed, duplicate, and
  top-level settings, and kept warning suppression independent from V2 dispatch
  detection.
- Added regression coverage across the root Codex preflight test and the
  GitHub, GitLab, and Gitea installed-script fixtures.
- Updated Codex install/init guidance to use a read-only agent-guided config
  audit by default and require explicit user authorization before changing
  global `~/.codex/config.toml`.
- Added the design record and changelog entry for the install/config boundary.

## Final Validation Evidence

`verdict: pass` is recorded in `.cache/final-validation.md`. The full four-chain
receipt is `.cache/chain-receipt.json`; finalization metadata written after that
receipt is outside the chain reuse boundary and is validated by the finalization
gates.

## Documentation Docking

DOCKED in `.cache/doc-docking.md`.

## Run gaps

- in_run_repair (n1-preflight-detector): noise: reopened n1 only removed trailing whitespace in owned test files; `git diff --check` and the focused install-model test passed afterward.
- in_run_repair (n2-review): noise: second review verified the n1 repair and recorded `verdict: pass` with `findings_blocking: 0`; no residual product defect remains.

## Closure Decision

Issue #584 is complete and should close on the merge sink. No residual follow-up
issue is required for this slice.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | `.cache/final-validation.md`, `.cache/chain-receipt.json` | |
| doc-updater | local-fallback-tool-unavailable | `.cache/n3-install-guidance.md`, `.cache/doc-updater.md` | Project-local `.codex/agents/kaola-workflow/` profiles were absent; documentation edits were made inline from verified source. |
| documentation docking | invoked | `.cache/doc-docking.md` | |
| run-gap sweep | invoked | `.cache/run-gaps.json`, `finalization-summary.md` | |
| mechanical finalization contractor | local-fallback-tool-unavailable | `finalization-summary.md` | Project-local contractor profile was absent and this session cannot spawn subagents under the active policy. |
| roadmap refresh | invoked | `kaola-workflow/ROADMAP.md` | Pre-sink: archive finalization refreshes the generated roadmap. |
| archive completed folder | invoked | `kaola-workflow/archive/issue-584` | Pre-sink: finalized by `kaola-workflow-claim.js finalize --keep-worktree`. |
| final commit and push | invoked | git status and sink receipt | Pre-sink: branch commit and sink merge run after finalization gates pass. |
