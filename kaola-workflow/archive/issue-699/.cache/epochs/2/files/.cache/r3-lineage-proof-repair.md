evidence-binding: r3-lineage-proof-repair ef637b74db4b
upstream_read: r2-lifecycle-transport-repair 2bc084fad42a

# r3 lineage/proof repair

Assigned task: implement the epoch-2 re-plan lineage, snapshot/child cross-binding, typed Case-B, complete durable-prefix, four-seam CAS, and Planning Evidence consistency contracts from the frozen r1 blueprint, while preserving the r2 lifecycle/source-transport implementation.

Upstream read: r1-repair-blueprint and r2-lifecycle-transport-repair evidence were read in full before implementation. The r2 production changes were retained and regenerated into every owned edition together with this node's accumulated canonical diff.

Write set:
- scripts/kaola-workflow-replan.js
- plugins/kaola-workflow/scripts/kaola-workflow-replan.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- scripts/test-replan.js
- kaola-workflow/issue-699/.cache/r3-lineage-proof-repair.md

Tests changed:
- scripts/test-replan.js
  - strict schema-2 repair-outcome envelope and source-tamper matrix
  - schema-2 projection-bound snapshot/child/attestation recursion and generic externally sealed schema-1 compatibility negatives
  - live-child substitution and manifest/transaction/attestation/descendant-state seal counterexamples
  - genuine no-review typed diagnosis-to-build Case B, one-shot zero-cost budget, exact child citations, and laundering/refusal variants
  - exact 41-entry static durable-write inventory, deterministic dynamic labels, every discovered main-path crash prefix, and byte/cardinality convergence
  - four CAS seams by candidate/root/frontier axis with exact scalar mismatch receipts and zero epoch/count/dispatch/snapshot effect
  - full child Planning Evidence replacement and stale-first-node diagnosis

Implementation files changed:
- scripts/kaola-workflow-replan.js and all three owned edition ports
  - strict review-outcome authority and genuine diagnosis authority
  - non-circular snapshot authority projection, exact child/attestation binding, schema-2 recursive verification, and externally sealed legacy verification
  - deterministic CAS observations and mismatch receipts
  - crash-resumable snapshot, activation, cleanup, consent, failure, and candidate-reauthor prefixes
  - complete promoted Planning Evidence tuple and active-state consistency verifier
- scripts/kaola-workflow-adaptive-schema.js and all three byte-identical edition mirrors
  - strict source/snapshot transaction shapes and the central durable label/dynamic-label contracts

RED: node scripts/test-replan.js -> AssertionError [ERR_ASSERTION]: epoch-2 lineage authority surface is present before behavioral execution; actual [ 'snapshot-authority-projection', 'planning-evidence-consistency', 'durable-write-inventory', 'dynamic-write-label-contract' ], expected []
GREEN: node scripts/test-replan.js -> test-replan: PASSED (888 assertions)

Validation commands:
- node --check scripts/kaola-workflow-replan.js -> pass
- node --check scripts/kaola-workflow-adaptive-schema.js -> pass
- node --check scripts/test-replan.js -> pass
- node scripts/test-replan.js -> test-replan: PASSED (888 assertions)
- node scripts/test-adaptive-handoff.js -> adaptive-handoff tests passed (165 assertions)
- node scripts/test-adaptive-node.js -> adaptive-node tests passed (2209 assertions)
- node scripts/test-plan-run.js -> all 35 assertions passed
- node scripts/edition-sync.js --check -> 12 forge aggregator ports, 25 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity
- git diff --check -> pass

Coverage: package.json exposes no coverage command, so the frozen task's focused validation commands were used. The repository-wide npm test was intentionally not run for this node.

Failure classification during GREEN work: behavior/test defects only; no unresolved build, type, lint, or tooling failure remains.

Outcome: complete. The canonical re-plan/schema families and every declared edition port now implement the r1 authority model while preserving r2 transport behavior, and all scoped validations are green.
