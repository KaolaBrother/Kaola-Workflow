evidence-binding: n3-review 5b70f14f60ed
verdict: pass
findings_blocking: 0

Change-gate review of the #586 parallel-batch retirement (post-dominates n1-remove + n2-docs).
1. Completeness PASS: 5 files deleted (7,183 lines); no require()/registry/executable reference remains; every residual grep hit classified acceptable (comment-only lineage in live scheduler, deliberate "retired" notes, live batch_active guard doc, untouched historical investigations).
2. No live-path collateral PASS: adaptive-node/next-action/commit-node/adaptive-schema/plan-validator/adaptive-handoff all unchanged; vestigial batch_active guard intact.
3. Card anti-fabrication PASS: every subcommand/flag/reason-code in the rewritten frontier-batch.md verified against real arg parsing (open-ready/close-node/reconcile-running-set; --max/--speculative-consent/--write-overlap-consent; FANOUT_CAP=4/READONLY=8; reason codes verbatim). No invented flags.
4. Six-surface propagation PASS: CARD block consistent across 3 commands + 3 SKILLs; no provenance tokens; route-reachability 185 assertions green.
5. Suites ALL GREEN (exit 0): validate-script-sync (24 scripts), validate-workflow-contracts, validate-kaola-workflow-contracts, gitlab+gitea contract validators, test-route-reachability, edition-sync --check (10 ports), test-adaptive-node (1078), walkthrough.
6. ADR D-586-01 truthful: defect 4 verified via git show (real CLI only --project/--node-id/--max/--json/--abort; card's --batch-id/--nodes/--evidence-file/--ledger never existed); defect 2 corroborated (0 complianceRowExists guards vs 7 in live).
7. package.json chain well-formed; distinct test-parallel.js --self-test correctly retained.
Non-blocking observation: frontier-batch.md rewritten (not deleted) — deliberate, ADR-recorded, superior to deletion (machine-pinned frontier-unit markers on six surfaces stay satisfied). No action required.
