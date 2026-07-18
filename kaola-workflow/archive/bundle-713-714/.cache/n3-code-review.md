evidence-binding: n3-code-review aa00ad32a72e
contract_version: 2
review_context_hash: 3d59b67c160b4cbb6dc4541666232f6566a4f86c1c0e39821691bd78992ee424
behavior_contract_hash: 42b6332c311ce07c511d67d3c7fb02cf874ab94872aaee87fadae2d0577fa789
resolved_profile_hash: 4f9e7c9aad33216895b1e618d06ad1bfb3beeea55af7094643af59ec927c8b6a
candidate_digest: 4e9024c3b25112141780f7eb5b11f5487004eea99a470a729a2603194d9868a8
gate_mode: change_gate
upstream_read: n2-documentation a6649907cf19

## Verification record (discovery phase, change_gate)

Candidate = worktree diff vs HEAD fe994d69885f (== claim_root_base.commit): 11 modified files + run metadata. Write-set matches the frozen plan exactly: n1's 9 files (simulate-workflow-walkthrough.js declared but deliberately unmodified per n1's recorded justification) + n2's 2 files. No out-of-set writes. validation_obligations: [] — none inherited, no receipt owed; fixtures under $TMPDIR only.

#713 acceptance criteria — verified against the diff and by execution:
- AC1: new E2E pin drives the issue's exact six steps over the real CLI in a real git repo (gateA PASS sealed, gateB FAIL, repair folds A+B and purges A.md, writer repairs, A reopens, both gates re-certify, finalize closes). Asserts 4 settled attempts, journal validate ok, --resume-check ok, no replan-source.json, all-complete ledger, claim intact.
- AC2 (option b): deriveRepairDelta (adaptive-schema.js:1982+) accepts a folded settled PASS carrying the 4-key fold marker, cross-checked fail-closed via effectiveCandidate; marker recorded in runRepairNodeCore step 4a (adaptive-node.js:7635) on the completedJournalGates set, journal-resident, idempotent on resume; assessReviewProgress fold_boundary-gated convergence; strict shrink rule byte-identical without the flag; validateReviewJournalV2 fold wall fail-closed only.
- AC3: marker-less sealed pass still refuses review_repair_delta_unavailable with detail naming release-and-adopt or replan prepare — string verified byte-identical between code output and the plan-run card quote; both recovery primitives verified to exist.
- Unchanged semantics: stale-pass purge (:7701), anti-laundering baselineReused, orphan guard (3b), adversarial fan-out purge (4c) all outside the diff hunks; walkthrough unmodified and passing.

#714 acceptance criteria — verified:
- Pre-seeded advance rewrites canonical row in place; append path always emits canonical role (node-id); spliceComplianceSection normalizes to trimEnd + row + exactly one blank before next heading; idempotent re-close no-ops.
- Validator NOT relaxed (plan-validator.js:915 untouched by the diff).
- Legacy bare-cell READ compatibility preserved (complianceRowExists untouched; legacy bare-row regression-control pin passes pre- and post-fix).
- Issue's round-trip test exists (3-node cycle feeding untouched plan into validateRequiredAgentCompliance; three drift defects pinned).

Edition-port integrity: four adaptive-schema copies byte-identical (sha256 8b321df8…03b273); @generated headers intact; gitea port mirrors canonical hunks; edition-sync --check and validate-script-sync green in own run.

RED-first independently reproduced: pre-fix canonical scripts restored in $TMPDIR -> exactly the candidate's new #713/#714 assertion groups failed (19 messages matching n1's RED list incl. the wedge refusal, missing fold marker, bare-cell emissions, splice drift); control pins passed both ways; candidate passes 2479/2479. Two initial extra failures were fixture artifacts (missing agents/ + plugins/ dirs), not candidate-related.

Own gate runs in worktree (all green): test-adaptive-node.js 2479; simulate-workflow-walkthrough.js; test-replan.js 832; test-adaptive-handoff.js 179; test-claim-hardening.js 450; test-kimi-edition.js 577; test-opencode-edition.js 547; edition-sync --check; validate-script-sync.

Documentation delta verified: CHANGELOG bullet matches shipped behavior; card section 7 documents marker shape, delta synthesis, tamper fail-closedness, verbatim refusal + two recoveries; decision tree gained the review_repair_delta_unavailable branch.

No candidate-caused defects found; zero findings admitted.

domain_outcome: approved
gate_claim: both producer fixes implement the diagnosed root causes exactly — the folded-pass repair wedge is unreachable end-to-end and every compliance emission path produces a validateRequiredAgentCompliance-conforming table — carry RED-first regression proof in every touched edition copy, and leave every unchanged lifecycle behavior (repair-journal strictness, anti-laundering baseline reuse, legacy bare-cell matching, idempotent re-close) intact
gate_surface: complete candidate: the adaptive-node and adaptive-schema four-edition families, their claude-chain test surfaces, and the documentation delta
gate_aggregation: sequence
findings_none: true
verdict: pass
findings_blocking: 0
