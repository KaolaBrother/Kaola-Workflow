evidence-binding: n2-lineage-transaction da5ca839dc51
upstream_read: n1-epoch-architecture 2e20f56e4b04
upstream_read: n4-runtime-integration eca8b605b1db

assigned_task: governed n2 handback A/B after n4 runtime integration
role: tdd-guide
write_scope: n2 replan/adaptive-schema families, scripts/test-replan.js, and this seeded evidence only

RED: `node scripts/test-replan.js` exited 1 before implementation at `AssertionError: partitioned-all 2-pass/1-dissent persists fail` (`scripts/test-replan.js:403`); the legacy strict-majority reducer incorrectly accepted the schema-2 partitioned-all result.

GREEN: the final deterministic n2 proof bundle exited 0; `node scripts/test-replan.js` passed 494 assertions, including every handback A/B case and the crash-idempotent child-freeze replay.

implementation:
- Handback A imports n4's exported `runReplanHandoff` into the canonical replan transaction.
- The transaction durably records a matching `pre_freeze` CAS under the existing scheduler lock before invoking the handoff. A prior durable receipt is rechecked against both the prepare tuple and the live observation; missing/mismatched authority fails closed.
- The handoff receives the authority-bound absolute `workflow-plan.next.md` path, transaction/planner attestation, lineage/root/frontier bindings, and an exact-path atomic writer.
- `transaction.child.digest` and `transaction.child.plan_hash` now come from the handoff's returned frozen digest/hash and are rechecked against the exact file bytes before the phase advances.
- `after_child_handoff_freeze` pins the crash gap before `child_frozen` journaling. Replay preserves the same child digest/hash and converges to one committed child without a second byte mutation.
- The exported test seam is pure (`validateChildHandoffAuthority`); the mutating handoff remains internal to lock-owning `resumeReplan`.
- Handback B changes the pure API to `validateReviewJournal(journal, expectedPlanHash, options)`.
- `options.schema2_review_gates` is validated as a canonical key-sorted array of exact `{ logical_gate_key, role, aggregation, members }` rows. Duplicate keys, noncanonical keys/members, unsupported role/aggregation, and overlapping member ownership are typed `review_journal_schema2_contract_invalid` refusals.
- Any attempt whose logical key or member set intersects a supplied contract must match exactly one contract by canonical key and exact sorted members; partial/ambiguous intersection is `review_journal_schema2_gate_mismatch`.
- Exact schema-2 code/security fanouts re-evaluate receipt bodies. Numeric blockers and unresolved in-scope fixes are global vetoes; `replicated_majority` requires a strict approval majority, while `partitioned_all` requires every member. Settled results are exactly `pass/null` or `fail/fanout_refuted`; provisional `null/null` remains legal.
- Fanouts disjoint from supplied schema-2 contracts retain legacy strict-majority reduction.
- The replan source reader now obtains canonical contracts from `planValidator.schema2ReviewGateContracts(planContent)` and passes the options object to the journal validator.

required_handback_tests:
1. partitioned-all 2 pass plus 1 dissent persists fail, rereads valid, and a pass rewrite is rejected as repair laundering.
2. replicated-majority 2 pass plus 1 numeric blocker persists fail and rereads valid.
3. `findings_blocking: 0` plus unresolved `scope=in_scope action=fix` vetoes.
4. replicated-majority 2 pass plus 1 non-blocking dissent persists pass.
5. options-absent legacy fanout keeps strict-majority behavior.
6. an intersecting member with an unmatched key/member set is rejected.
7. duplicate and overlapping contracts are rejected before attempt reduction.
additional_pins: partial schema-2 provisional `null/null`; noncanonical members; role mismatch; aggregation mismatch; absolute child-path zero-write refusal; missing/mismatched pre-freeze CAS; crash after handoff freeze before child journal; stable child identity across commit and replay.

tests_changed:
- scripts/test-replan.js

implementation_files_changed:
- scripts/kaola-workflow-replan.js
- plugins/kaola-workflow/scripts/kaola-workflow-replan.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js

generated_parity:
- `npm run sync:editions` passed after implementation. The final refactor run regenerated only the three replan ports; adaptive-schema mirrors were already byte-identical from the preceding canonical sync.
- No n4 adaptive-handoff/adaptive-node/plan-validator file and neither `N4-ACTIVATION-*` residual was edited by this handback.

validation:
- `node scripts/test-claim-hardening.js` -> passed 262 assertions (exit 0).
- `node scripts/test-bundle-state.js` -> all 37 tests passed.
- `node scripts/test-replan.js` -> PASSED (494 assertions).
- `node scripts/test-bundle-finalize.js` -> all 138 tests passed.
- `node scripts/test-edition-sync.js` -> passed 46 assertions.
- `node scripts/test-validate-script-sync.js` -> passed 43 assertions; 2 canonicalOnly exclusions guarded.
- `node scripts/test-install-manifest-single-source.js` -> PASSED.
- `node scripts/edition-sync.js --check` -> 12 forge aggregator ports, 25 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- `node scripts/validate-script-sync.js` -> OK: 25 common scripts, 27 byte-identical groups, 8 rename-normalized families, both hooks families, and 7 forge export-superset families in sync.
- `node --check` passed for the canonical/Codex/GitLab/Gitea replan family and canonical adaptive-schema.
- `git diff --check` passed.
- Full `npm test` was intentionally not run per the bounded handback instruction.

refactor: kept schema-2 contract parsing inside the pure adaptive schema, retained plan Markdown parsing in plan-validator, kept freeze/authority orchestration in the n2 transaction, and exposed no unlocked mutating handoff API.
failure_routing: none; final focused validation passed.
