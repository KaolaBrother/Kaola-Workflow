# Finalization - Summary: bundle-593-594-595

## Delivered
Three running-set scheduler hardening changes, one bundle (all-or-nothing closure of #593, #594, #595):
- **#595 (Fixed)**: `acquireProjectLock` (adaptive-schema.js, byte-identical ×4 anchor) unlinks its OWN just-created lockfile when the payload write/fsync/close fails after the O_EXCL create, before rethrowing — no more orphaned empty lockfile / wrong-flavor `scheduler_locked` refusals. No-takeover invariant preserved (unlink reachable only for the file this call created).
- **#594 (Removed)**: dead `batch_active` mutual-exclusion guard (probe, refusal arm, hint, excl arms) plus the provably-dead `active_batch_exists` reopen/repair refusal arms + hint removed across all four adaptive-node editions. Orient's read-only manifest legality reconstruction KEPT (documented scope boundary — contract-bearing, byte-identical for all producible state).
- **#593 (Changed)**: write co-open eligibility relaxes the `coarse` class (exact-path-disjoint, same non-shared top-level area) BY DEFAULT under the retained net (NET-1 post-dominating code-reviewer gate; NET-2 no PROTECTED file), with a resolvability fallback (directory-shaped/glob entries keep the coarse refusal). `exact`/case-collision never relax; classifier verdict purity byte-unchanged; consent/policy vestigial-but-parsed. Cross-edition write antichains can now actually co-open.

## Files Changed
29 files in impl commit cf0d33db: adaptive-schema.js ×4, adaptive-node.js ×4, plan-validator.js ×4, test-adaptive-node.js, test-commit-node.js, six plan-run routing surfaces, docs/{conventions,api,architecture,workflow-state-contract}.md, docs/plan-run-cards/frontier-batch.md, CHANGELOG.md, docs/decisions/D-{593,594,595}-01.md (new).

## Test Coverage
No formal coverage pipeline. New coverage: T-595-orphan fault-injection (RED-proven), #593 AC1 real-git co-open lifecycle (provision → per-leg barriers → octopus merge → union barrier), AC2 net enforcement, AC3 exact/case-collision, AC4 resolvability, AC6 serial byte-identity, T463 floors re-pinned protectively. test-adaptive-node.js 1219→1248 assertions; test-commit-node.js 123.

## Final Validation Evidence
- Per-node scoped runs (n1, n2, re-run by n3/n5): test-adaptive-node.js 1248 green, test-commit-node.js 123 green, walkthrough green, route-reachability 185 green, all four contract validators green, edition-sync --check 10 ports in parity, validate-script-sync 24 in sync, cmp byte-anchors silent. Evidence: .cache/n1-schema-fix.md, n2-scheduler.md, n3-adversarial.md, n5-review.md.
- Full four-chain gate: `KAOLA_RUN_CHAINS_CONCURRENCY=serial node scripts/kaola-workflow-run-chains.js --project bundle-593-594-595` run by the orchestrator after impl commit cf0d33db; receipt at .cache/chain-receipt.json (HEAD-bound). Result recorded before the final Git gate.
- Adaptive script-enforced barrier: --resume-check 0, --gate-verify 0, --barrier-check 0, --verdict-check 0.
- Validation reuse boundary: scoped runs cover code/test impact through n5-review; later edits are workflow artifacts only (this summary, docking record) — outside the rerun trigger; the four-chain receipt is bound to the impl commit tree.

## Documentation Docking
DOCKED — .cache/doc-docking.md

## Final Validation Failure Ledger
| Failing Command | Classification | Routed To | Evidence | Status |
|-----------------|----------------|-----------|----------|--------|
| (pre-emptive, not a run failure) test-commit-node.js T463 floors pinned the OLD coarse-consent behavior | in-run blocker surfaced by n2 (out-of-set) | plan write-set widening (n2 + scripts/test-commit-node.js, re-freeze) → same n2 agent re-pinned the floors protectively | .cache/n2-scheduler.md (appended section); test-commit-node.js 123 green | resolved in-window; amended into impl commit |
| workflow-state-contract.md stale batch_active claim | docs gap surfaced by n4 (out-of-set) | plan write-set widening (n4 + docs/workflow-state-contract.md, re-freeze) → same n4 agent fixed it | .cache/n4-docs.md (appended section); validators + route-reachability green | resolved in-window; amended into impl commit |

## Follow-Up Items
- R1 (LOW, both gates concur non-blocking): orient retains a read-only active-batch.json legality read (adaptive-node.js:1338 + 3 ports) vs #594's broad AC wording — deliberate, documented scope boundary (D-594-01); removing it is a larger orient-contract change. Recorded here; no issue filed (documented-as-designed).

## Run gaps
(sweep empty — .cache/run-gaps.json sweptClasses: [])

## Closure Decision
None needed — no deferred items, no partial implementation. All three member issues' acceptance criteria verified MET by two independent opus gates (adversarial + code-reviewer, both verdict: pass / findings_blocking: 0). Close all three on sink (all_or_nothing).

## Commit And Push
Impl commit cf0d33db on workflow/bundle-593-594-595. Final git gate (archive commit + bundle sink) pending; final hash reported after push.

## GitHub Issue
#593, #594, #595 — to be closed by sink-merge --sink --issue 593 --issue-numbers 593,594,595 (probe-before-close, all-or-nothing).

## Roadmap
No .roadmap sources for 594/595 existed pre-claim (filed post-close of the prior session); claim staged issue sources are reconciled by cmdFinalize; ROADMAP.md regenerated at closure.

## Archive
Pending — kaola-workflow/archive/bundle-593-594-595/ via cmdFinalize (contractor Step 8b).

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| tdd-guide (n1, n2) | subagent-invoked | .cache/n1-schema-fix.md, .cache/n2-scheduler.md | |
| adversarial-verifier (n3) | subagent-invoked | .cache/n3-adversarial.md | |
| doc-updater (n4) | subagent-invoked | .cache/n4-docs.md | |
| code-reviewer (n5) | subagent-invoked | .cache/n5-review.md | |
| documentation docking | invoked | .cache/doc-docking.md | |
| final-validation fix executors | N/A | | no final-validation failure (both in-run blockers resolved pre-chains) |
| roadmap refresh | invoked | kaola-workflow/ROADMAP.md (regen at cmdFinalize) | |
| archive completed folder | pending | | |
| final commit and push | ready | git status clean of unrelated changes; push via sink-merge --sink | final gate runs after this file is committed |
| finalize (n6-finalize) | main-session-direct | .cache/n6-finalize.md | |

## Status
ARCHIVED AFTER FINAL GIT GATE
