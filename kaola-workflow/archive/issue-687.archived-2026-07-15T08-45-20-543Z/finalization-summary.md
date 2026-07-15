# Finalization - Summary: issue-687

## Delivered

- All 48 generated Codex role profiles now omit model and reasoning-effort keys so named role
  children inherit the effective parent-session pair.
- Installer and preflight paths migrate exact historical Sol/medium and Sol/xhigh managed pairs,
  reject partial or foreign pins, preserve unrelated user configuration, and remain idempotent.
- Standard/reasoning tiers and legacy aliases remain declarative metadata, retain 20/40-minute wait
  budgets, and leave Claude and opencode mappings unchanged.
- Dispatch cards and routing now prove fresh thread-bound parent state, named-profile binding, and
  exact persisted child equality; reasoning-floor roles fail closed on missing, stale, below-floor,
  or unclassified proof.
- A live Codex 0.144.3 child selected the candidate `code-explorer` profile with no transient pair
  override and persisted the same `gpt-5.6-sol`/`xhigh` pair as its parent.

## Final Validation Evidence

- `node scripts/kaola-workflow-run-chains.js --project issue-687`: PASS.
- Receipt: `.cache/chain-receipt.json`, code tree
  `8b087b9341dfe431856dadc7b0ecc0bf3cc1fec50af24f3fecaccce1877a9596`.
- Claude, Codex, GitLab, and Gitea chains all exited 0 with no waiver, retry, timeout, or signal.
- Adaptive resume, gate-verify, whole-plan barrier, and verdict gates all exited 0.
- Evidence: `.cache/final-validation.md`, n5 review, n6 live proof, and n7 falsification.

## Acceptance Audit

- Every frozen DAG node is complete and all gate evidence records `verdict: pass` with zero blocking
  findings.
- Profile parity reports zero runtime pins across 48 role TOMLs; same-role triples and generated
  script groups are synchronized.
- Migration/floor perturbation matrices cover model-only, effort-only, both legacy pairs, fresh
  floor, below-floor, missing proof, stale binding, and unknown model.
- The sixth review repair used the operator-authorized breaker extension in memory only; the shipped
  five-repair constant and durable review journal were not weakened or rewritten.
- No scratch home, probe fixture, accidental project `.codex` directory, debug artifact, partial
  implementation, or unresolved user decision remains. The post-sink collision-path residual is
  filed as #700 and does not affect #687's delivered runtime contract.

## Documentation Docking

DOCKED — `.cache/doc-docking.md`. README, API, architecture, D-687-01, and CHANGELOG describe the
verified inheritance, migration, runtime proof, and reasoning-floor contract without claiming a
Claude or opencode behavior change.

## Run gaps

- in_run_repair (n5-code-review): noise: all six review findings were repaired in scope and the final code-review, live-proof, and adversarial gates passed; no residual product defect remains
- manual:tool-refusal (n5 review attempt 3 parent return was policy-flagged after its read-only checker completed; re-dispatched with narrower repository-quality phrasing): noise: response-transport policy noise after a completed read-only check; the narrower re-dispatch completed and found no residual defect
- manual:sink-archive-collision (collision-suffixed archive left uncommitted and missing closure/attestation blocks after status:sinked): filed: #700

## Closure Decision

Normal close. All issue #687 acceptance criteria are met, no follow-up issue or owner decision is
required, and the merge sink may close the last open issue after publishing the final candidate.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| final validation | invoked | .cache/final-validation.md | |
| code review | local-fallback-explicit | .cache/n5-code-review.md | user directed no further subagents |
| live child proof | main-session-direct | .cache/n6-live-child-inheritance-proof.md | non-delegable gate |
| adversarial verification | local-fallback-explicit | .cache/n7-inheritance-falsifier.md | user directed no further subagents |
| doc-updater | local-fallback-explicit | .cache/doc-updater.md | user directed no further subagents |
| documentation docking | invoked | .cache/doc-docking.md | |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |
| archive completed folder | invoked | kaola-workflow/archive/issue-687.archived-2026-07-15T08-45-20-543Z | |
| mechanical finalization | local-fallback-explicit | this summary | user directed no further subagents |
| final commit and push | invoked | sink receipt and final git status | |

## Commit And Push

Implementation commit `2e543db9` is published on `main`. The script-owned sink closed #687 and
deleted its workflow branch, but its collision path left this timestamped archive and roadmap
cleanup outside the reported archive commit; the explicit archive commit containing this summary
completes that bookkeeping. Follow-up #700 owns the sink defect.

## GitHub Issue

#687 — CLOSED after the merge sink verified the published implementation.

## Roadmap

The completed #687 source is removed. Follow-up #700 is added as the remaining sink-collision
hardening item, and `ROADMAP.md` is regenerated from source.

## Attestation
claim_planner_attested: attested
finalize_contractor_attested: missing
ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam was run inline by main session under the user's explicit no-subagent direction
