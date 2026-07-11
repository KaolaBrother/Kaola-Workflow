evidence-binding: n1-fix-gate-evidence-rotation 5710e0d58838
RED: `node scripts/test-adaptive-node.js` failed before implementation at `#654 same node+different non-empty nonce reports nonce_rotated:true`; the stale same-node evidence file was preserved instead of reseeded.
GREEN: `node scripts/test-adaptive-node.js` passes after the nonce-aware helper change; `node scripts/simulate-workflow-walkthrough.js --only testGateEvidenceNonceRotation654` passes with `testGateEvidenceNonceRotation654: PASSED` and `Walkthrough --only subset passed (1 scenarios)`.

assigned_task: Implement issue-654 gate evidence nonce rotation and repair lifecycle.
write_set:
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
- scripts/test-adaptive-node.js
- scripts/simulate-workflow-walkthrough.js

tests_changed:
- scripts/test-adaptive-node.js: real `$TMPDIR` fixtures for same nonce preservation, stale nonce reseed, malformed/cross-node preservation, fresh role stubs, stale value removal, and reviewer repair-brief retention.
- scripts/simulate-workflow-walkthrough.js: actual CLI lifecycle writer -> blocking reviewer -> repair-node -> repaired writer close -> reviewer nonce rotation -> successful reviewer close, without manual cache mutation.

implementation_files_changed:
- scripts/kaola-workflow-adaptive-node.js: `seedEvidenceFile` now preserves only exact same-node/same-nonce evidence, rotates same-node/different-nonempty-nonce evidence, leaves malformed/cross-node bindings untouched, and keeps forceRotate authoritative.
- Generated forge ports listed in write_set, produced only by `npm run sync:editions`.

commands_and_results:
- `node scripts/test-adaptive-node.js` (pre-implementation): FAIL, expected #654 nonce_rotated assertion.
- `node scripts/simulate-workflow-walkthrough.js --only testGateEvidenceNonceRotation654`: PASS.
- `npm run sync:editions`: PASS; three generated files updated.
- `node scripts/edition-sync.js --check`: PASS; 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, 27 byte-identical groups in parity.
- `git diff --check`: PASS.
- `node scripts/test-adaptive-node.js`: PASS (exit 0).
- `node scripts/simulate-workflow-walkthrough.js`: PASS (exit 0).
- `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`: PASS; durable sequential-chain exit status `0`.

refactor: Consolidated fresh seed construction in one local helper so create, automatic nonce rotation, and forced rotation emit identical content.
residual_risk: None known.
