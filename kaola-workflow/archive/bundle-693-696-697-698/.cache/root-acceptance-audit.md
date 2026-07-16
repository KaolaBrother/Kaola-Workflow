# Root acceptance audit — bundle #693/#696/#697/#698

audit_scope: issue-body acceptance criteria vs candidate and node evidence
audit_posture: read-only; candidate unchanged

## Confirmed implemented surfaces

- #693 central `deriveGateMode` and investigation/change-gate outcome split.
- #696 generated normalized reviewer cores, three Codex editions, identity/version binding, and disposable installation proof.
- #697 deterministic validation runner, four byte-identical editions, receipts, environment/tool identity, repetition, mutation, and timeout handling.
- #698 runtime-neutral context, profile/candidate binding, anchors/UIDs, reducers, progress counters, repair cap, and stateful schema-2 lifecycle core.

## Claims requiring the n8 gate to prove or reject

finding-candidate: issue=693 claim=stateful investigation close/downstream-open evidence may be absent
finding-candidate: issue=693 claim=malformed/stale investigation retry and same-AV-topology change-gate E2E may be absent
finding-candidate: issue=693 claim=seam-by-seam mutation killers for role-only fallback may be absent
finding-candidate: issue=697 claim=negative schema-2 validation-policy fixtures for cwd/range/pass-rule/allowlist/duplicate fields may be absent
finding-candidate: issue=697 claim=live Claude/Codex qualification remains pending
finding-candidate: issue=698 claim=move and multi-anchor-order fixtures may be absent
finding-candidate: issue=698 claim=lineage lookup may still bind current plan hash/logical gate instead of scope_lineage_id; distinguish #699 epoch dependency
finding-candidate: issue=698 claim=G4 tests may assert only a coverage token rather than real refusal reasons
finding-candidate: issue=698 claim=late-unbound stateful E2E may be absent

## Pending mandatory proof

- n8 code review verdict.
- n9 security review verdict.
- n10/n11/n12 independent adversarial verdicts.
- Final frozen command: `npm test && node scripts/test-opencode-edition.js`.
- Real Codex installation/cache refresh and doctor proof after merge.

## Separate proven defect

The scheduler-entrypoint regression is owned by reopened #439 with #597/#383 cross-references. It is not silently folded into this frozen bundle.
