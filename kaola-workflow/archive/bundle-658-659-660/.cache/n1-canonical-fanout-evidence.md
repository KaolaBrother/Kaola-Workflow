evidence-binding: n1-canonical-fanout-evidence 79e83c23ba85
RED: node scripts/test-adaptive-node.js => 7 new #658 failures; signature: exact group expected [skeptic-a,skeptic-b] but legacy global role-prefix bridge produced "fanout majority-refute: 1/1 skeptics refuted"; missing/foreign/duplicate/stale/tie/singleton controls all failed under the same global-glob reader.
GREEN: node scripts/test-adaptive-node.js => exit 0, "adaptive-node tests passed (1719 assertions)" after canonical node-id membership and scoped cleanup implementation.

assigned_task: Repair adversarial-verifier fan-out evidence identity test-first so explicit cardinality-1 groups use exact frozen node membership, while archived cardinality>1 plans retain read-only role-prefix compatibility.

write_set:
- scripts/test-adaptive-node.js
- scripts/kaola-workflow-plan-validator.js
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/{kaola-workflow-plan-validator.js,kaola-workflow-adaptive-node.js}
- plugins/kaola-workflow-gitlab/scripts/{kaola-gitlab-workflow-plan-validator.js,kaola-gitlab-workflow-adaptive-node.js}
- plugins/kaola-workflow-gitea/scripts/{kaola-gitea-workflow-plan-validator.js,kaola-gitea-workflow-adaptive-node.js}
- kaola-workflow/bundle-658-659-660/.cache/n1-canonical-fanout-evidence.md

tests_changed:
- Added explicit two-member cardinality-1 fan-out controls for exact `(fanout label, dependency origin)` membership.
- Added independent same-label/different-origin isolation and legacy bridge exclusion.
- Added missing receipt, foreign binding, duplicate-member binding, stale nonce, and one-pass/one-fail tie refusals.
- Added cardinality-1 singleton identity and archived cardinality>1 role-prefix compatibility controls.
- Added reopen/repair cleanup coverage proving both exact group members reset and only their node-id receipts are removed.

implementation_changed:
- Added `resolveAdversarialFanoutGroup(nodes, node)` as the canonical frozen-node resolver.
- Explicit cardinality-1 groups derive authoritative receipts as `.cache/<member-node-id>.md`; no bridge or global adversarial receipt glob participates.
- Canonical receipts require exact member binding and the current barrier-base nonce before tallying; absent, foreign/duplicate, and stale-bound votes refuse structurally.
- Majority semantics remain strict-majority-to-pass, so a 1/1 split refutes; unresolved-fix handling remains unchanged.
- Reopen recognizes an AND-joined explicit skeptic group as a collective downstream gate and removes only canonical member evidence. Archived role-prefix siblings are removed only when the plan proves there is one legacy fan-out.
- `npm run sync:editions` regenerated the complete validator and adaptive-node families for Codex, GitLab, and Gitea.

membership_cleanup_evidence_for_n3:
- `skeptic-a` resolves members `[skeptic-a, skeptic-b]`; `other-skeptic` shares the label but has origin `impl`, so it is excluded.
- A failing `adversarial-verifier-bridge.md` is ignored by the canonical group.
- Reopening `review` resets `av-a` and `av-b`; cleanup removes `av-a.md` and `av-b.md` while preserving `foreign-av.md` from the independent origin.

validation_commands:
- `node scripts/test-adaptive-node.js` => PASS, 1719 assertions.
- `npm run sync:editions` => PASS, 6 generated files updated.
- `node scripts/edition-sync.js --check` => PASS, 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups.
- `node scripts/test-edition-sync.js` => PASS, 41 assertions.
- `git diff --check` => PASS.

failure_classification: The intentional RED failures were behavior/test failures caused by global role-prefix evidence identity. During GREEN validation, two EISDIR stack traces were emitted by existing negative task-mirror fixtures; the focused command completed exit 0 with 1719 assertions and they were not build/type/lint/tooling failures.
