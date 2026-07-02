# Finalization - Summary: issue-596

## Delivered
Issue #596: the deferred speculative-WRITE half graduated onto the leg machinery, behind the existing consent ceremony (`speculative_open_policy: consent` + `open-ready --speculative-consent`; default `off` unchanged and byte-inert). A write node whose only unsatisfied dependency is an in-progress gate opens speculatively in a provisioned isolated leg: static eligibility in next-action (exactly-resolvable set, no PROTECTED file, not the sink), runtime re-verification of exact-path disjointness vs live writers via the validator --parallel-safe predicate, write-cap accounting, unchanged close fence, gate-pass promotion through the existing per-leg barrier → octopus merge (zero new merge code), gate-fail unconditional leg teardown (write members discard-only; parent worktree never written), and an idempotent crashed-speculative-write reconcile arm (roll forward only on recorded gate pass).

## Files Changed
19 files in impl commit 1b8f0392: next-action.js ×4, adaptive-node.js ×4, plan-validator.js ×4 (hasUnresolvableEntry export only), test-next-action.js, test-adaptive-node.js, docs/architecture.md, docs/api.md, docs/plan-run-cards/speculative-open.md, CHANGELOG.md, docs/decisions/D-596-01.md (new).

## Test Coverage
AC1-8 as real-git tests (T596-1..11) + static units (SPEC-3 series): happy path, close fence, pass-promote, fail-discard parent purity, refusals (overlap/PROTECTED/resolvability/sink/no-leg-capability), write-cap accounting, idempotent crash repair both directions, off-inertness byte-identity. test-next-action 97→103; test-adaptive-node 1248→1310; test-commit-node unchanged at 123 (validator hedge proven no-behavior-change).

## Final Validation Evidence
- Per-node scoped runs (n1, independently re-run by n2 and n3): test-next-action 103, test-adaptive-node 1310, test-commit-node 123, walkthrough green, edition-sync --check 10 ports in parity, validate-script-sync 24/25 groups, cross-edition token spot-checks identical. Evidence: .cache/n1-impl.md, .cache/n2-adversarial.md, .cache/n3-review.md.
- Full four-chain gate: `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project issue-596` run by the orchestrator after impl commit 1b8f0392; receipt at .cache/chain-receipt.json (HEAD-bound). Result recorded before the final Git gate.
- Adaptive script-enforced barrier: --resume-check 0, --gate-verify 0, --barrier-check 0, --verdict-check 0.
- Validation reuse boundary: scoped runs cover code/test impact through n4-docs; later edits are workflow artifacts only — outside the rerun trigger; the four-chain receipt is bound to the impl commit tree.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (none) | | | | |

## Follow-Up Items
- R1 (LOW, from n3-review, non-blocking): `selectSpeculativeWriteGroup` is fail-open on a validator subprocess error (excludes nothing when `overlapping` is absent), asymmetric with `tryFormLaneGroup`'s fail-closed posture; bounded by three redundant nets (freeze grammar disjointness, per-leg isolation, merge-conflict fail-closed). To be FILED as a follow-up GitHub issue post-sink by the orchestrator.
- The `agents/workflow-planner.md` write-speculation rubric intentionally retains its conservative read-only framing — deferred by plan design to the companion default-flip issue (#597), which owns the rubric/prose productionization.

## Run gaps
(sweep empty — .cache/run-gaps.json sweptClasses: [])

## Closure Decision
None needed — no deferred items blocking closure, no partial implementation. All ACs verified MET by two independent opus gates (adversarial + code-reviewer, both verdict: pass / findings_blocking: 0). The two follow-up items above are documented (one to be filed as a new issue; one owned by the already-open #597). Close on sink.

## Commit And Push
Impl commit 1b8f0392 on workflow/issue-596. Final git gate (archive commit + sink) pending; final hash reported after push.

## GitHub Issue
#596 — to be closed by sink-merge --sink --issue 596 (probe-before-close).

## Roadmap
Claim staged issue source reconciled by cmdFinalize; ROADMAP.md regenerated at closure.

## Archive
Pending — kaola-workflow/archive/issue-596/ via cmdFinalize (contractor Step 8b).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1-impl) | subagent-invoked | .cache/n1-impl.md | |
| adversarial-verifier (n2) | subagent-invoked | .cache/n2-adversarial.md | |
| code-reviewer (n3) | subagent-invoked | .cache/n3-review.md | |
| doc-updater (n4) | subagent-invoked | .cache/n4-docs.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean of unrelated changes; push via sink-merge --sink | final gate runs after this file is committed |
| finalize (n5-finalize) | main-session-direct | .cache/n5-finalize.md | |

## Status
ARCHIVED AFTER FINAL GIT GATE
