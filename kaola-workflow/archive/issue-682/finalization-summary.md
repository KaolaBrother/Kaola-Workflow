# Finalization - Summary: issue-682

## Delivered

- Added a plan-bound authoritative review-attempt journal with fail-closed sequence/fan-out
  settlement, immutable receipts, candidate/barrier bindings, and crash-safe reconciliation.
- Kept repair strategy and writer selection agent-owned. The harness proves canonical ownership,
  records history, and enforces five consumed repairs per logical gate; it does not rewrite the DAG
  or introduce a second workflow state machine.
- Made generated plan-run routing authoritative from `templates/routing/plan-run.skeleton.md` across
  GitHub, GitLab, and Gitea command/skill surfaces.
- Repaired provisional fan-out close bookkeeping so each completed member records exactly one
  compliance row, close timing, and generation-bound provenance entry across retries/crash recovery.

## Final Validation Evidence

- `node plugins/kaola-workflow/scripts/kaola-workflow-run-chains.js --project issue-682`: PASS.
- Receipt: `.cache/chain-receipt.json`, code tree
  `860248537d746d031350da9930c95b5bb2ace238c23c67ffb3d807013290601d`.
- Claude, Codex, GitLab, and Gitea chains all exited 0 with no accepted-red waiver.
- Adaptive finalization gates: resume, gate-verify, barrier-check, and verdict-check all exited 0.
- Evidence: `.cache/final-validation.md`, n2 full review, and n3 adversarial falsification.

## Acceptance Audit

- The initial generator drift was reproduced before repair and all 12 generated surfaces now
  byte-match their skeletons.
- Review finding R1 was recorded as attempt `n2-full-integration-review:1`, routed by an
  agent-selected unique writer, consumed once, repaired under TDD, and followed by a settled pass.
- Adversarial scratch mutations proved output drift and skeleton token omission both fail loudly;
  regeneration restored exact plan-run hashes without changing any `next` surface.
- No unresolved review attempt, blocking finding, debug artifact, duplicate documentation, automatic
  repair-owner choice, second state machine, or R17 claim remains.

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. Existing issue-682 README/API/architecture/state-contract/ADR/
repair-card/CHANGELOG text remains byte-identical to the approved candidate and was not duplicated.

## Run gaps

- manual:routing-surface-generator-drift (plan-run repair protocol outputs drifted because templates/routing/plan-run.skeleton.md omitted the canonical repair section): filed: #682
- in_run_repair (n2-full-integration-review): filed: #682

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | .cache/final-validation.md | |
| code review | local-fallback-explicit | .cache/n2-full-integration-review.md | user directed no further subagents |
| adversarial verification | local-fallback-explicit | .cache/n3-full-candidate-falsifier.md | user directed no further subagents |
| doc-updater | local-fallback-explicit | .cache/doc-updater.md | user directed no further subagents |
| documentation docking | invoked | .cache/doc-docking.md | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | invoked | kaola-workflow/archive/issue-682 | |
| mechanical finalization | local-fallback-explicit | this summary | user directed no further subagents |
| final commit and push | invoked | sink receipt and final git status | |

R17 parent-directory fsync remains out of scope.

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: missing
ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session
