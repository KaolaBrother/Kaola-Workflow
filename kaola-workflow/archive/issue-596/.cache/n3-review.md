evidence-binding: n3-review 2d4237aad2af
## n3-review — G1 code-reviewer gate (opus, read-only)

Scoped verification (all green): test-next-action 103; test-adaptive-node 1310; test-commit-node 123; walkthrough passed; edition-sync --check 10 ports in parity; validate-script-sync 24 scripts / 25 byte-identical groups; cross-edition token spot-checks identical.

1. Code quality: the three new seams (selectSpeculativeWriteGroup, write-only discard branch, reconcile arm) mirror the surrounding idioms (tryFormLaneGroup validator-shell, closeGroupMember teardown, keptAll/dropped classification); fail-soft teardownLeg/unlink seams consistent; no copy-paste divergence beyond sanctioned forge renames.
2. Invariants traced against code (all hold): (a) speculativeCloseGuard untouched, role-agnostic; (b) failing gate discards the whole speculative write frontier; (c) G1 grammar untouched; (d) per-leg barrier ground truth, zero new merge code; (e) four ledger states unchanged (spliceLedgerNode allowFrom in_progress); (f) opening crash choreography untouched, n.opening scoping load-bearing; (g) off-inert (policy-keyed emission, consent-gated branch, kind-gated arms, conditional spreads).
3. Design-spec fidelity: issue elements 1-7 implemented as specified; the one documented deviation (AC5 exact-overlap exercised via direct unit test T596-5) is sound — the freeze grammar makes the full-lifecycle state unreachable.
4. Read path untouched: parent git-checkout revert now if(!isWriteMember)-gated; read members byte-identical prior path; write skip correct and necessary (leg-resident writes never touch the parent; new files do not exist at baseSha).
5. Error handling: leg-provision failures use existing Phase-1 rollback; unlink/teardownLeg fail-soft; one LOW asymmetry (below).
6. Emission hygiene: new fields conditionally spread, present only when meaningful; no envelope drift.
7. Tests pin the contract (ledger, running-set, git tree, porcelain), survive refactor.

Noise: EISDIR stderr in test-adaptive-node is the pre-existing intentional #588-TASKMIRROR-FAILOPEN fixture. Close-after-gate-fail edge concurred with n2 (ledger-complete dependency semantics; finalize verdict-check + downstream G1 gate it).

finding: id=R1 scope=in_scope action=follow_up status=open severity=low fix_role=none rationale=selectSpeculativeWriteGroup fail-open on validator subprocess error vs tryFormLaneGroup fail-closed; bounded by grammar+leg-isolation+merge-fail-closed

verdict: pass
findings_blocking: 0
