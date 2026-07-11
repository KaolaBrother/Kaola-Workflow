evidence-binding: n2-review 0ca198bd6efb
verdict: pass
findings_blocking: 0

# Code Review — n2-review

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

None.

### LOW

None.

No blocking findings were found. Prose verdict: APPROVE.

## Reviewed invariants

- Same-open preservation is byte-identical: `scripts/kaola-workflow-adaptive-node.js:655-668` reads the existing bytes and returns without writing unless rotation is authorized; `scripts/test-adaptive-node.js:12125-12129` compares the entire preserved file byte-for-byte.
- Automatic rotation is narrowly gated by an exact line-1 binding parse, the same node id, and a different non-empty bound nonce at `scripts/kaola-workflow-adaptive-node.js:656-660`. The fresh seed replaces the entire prior body at `scripts/kaola-workflow-adaptive-node.js:636-665`, and `scripts/test-adaptive-node.js:12131-12140` proves the old verdict, findings count, and upstream value are absent afterward.
- Explicit `forceRotate` remains authoritative through the left side of the `forceRotate || nonceChangedForSameNode` condition at `scripts/kaola-workflow-adaptive-node.js:660`; the built-in self-test exercises forced whole-file reseeding at `scripts/kaola-workflow-adaptive-node.js:6277-6287`.
- Malformed and cross-node bindings are not eligible for normal automatic rotation because the anchored parser/node check fails at `scripts/kaola-workflow-adaptive-node.js:658-660`; byte preservation is asserted at `scripts/test-adaptive-node.js:12142-12148`, leaving close-time `evidence_unbound`/shape checks able to fail closed.
- The repair transaction removes downstream barrier baselines only at `scripts/kaola-workflow-adaptive-node.js:3748-3758`; it does not unlink the downstream evidence report. The unit guard is at `scripts/test-adaptive-node.js:7747-7793`, and the real CLI lifecycle reads and asserts the retained blocking report at `scripts/simulate-workflow-walkthrough.js:14802-14810`.
- All opener paths remain converged on `seedEvidenceFile`: serial open at `scripts/kaola-workflow-adaptive-node.js:2322`, fused advance at `scripts/kaola-workflow-adaptive-node.js:2932`, explicit reopen at `scripts/kaola-workflow-adaptive-node.js:3478`, tracked lane seeding at `scripts/kaola-workflow-adaptive-node.js:5072`, and running-set open at `scripts/kaola-workflow-adaptive-node.js:5196`.
- Returned dispatch nonces and seeded bindings share the same baseline-derived nonce. The fused path passes `fusedNonce` to both the helper and dispatch at `scripts/kaola-workflow-adaptive-node.js:2927-2939` and returns it at `scripts/kaola-workflow-adaptive-node.js:2956-2978`; the integration lifecycle directly compares the reopened dispatch nonce with line 1 at `scripts/simulate-workflow-walkthrough.js:14818-14823`.
- The lifecycle acceptance test does not manually rewrite cache bindings or reviewer cache files. It authors writer/reviewer bodies only through `record-evidence` at `scripts/simulate-workflow-walkthrough.js:14794-14806`, `scripts/simulate-workflow-walkthrough.js:14813-14817`, and `scripts/simulate-workflow-walkthrough.js:14824-14828`; the open/repair commands own cache lifecycle changes.
- All four adaptive-node editions are synchronized. The root and Codex copies are byte-identical, while `node scripts/edition-sync.js --check` reports all 10 forge ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity. The corresponding helper change is present at `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js:633-672`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js:634-673`, and `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js:634-673`.

## Validation evidence

- `node scripts/test-adaptive-node.js` — PASS, exit 0: `adaptive-node tests passed (1654 assertions)`.
- `node scripts/simulate-workflow-walkthrough.js --only testGateEvidenceNonceRotation654` — PASS, exit 0: scenario passed and the one-scenario subset completed.
- `node scripts/edition-sync.js --check` — PASS, exit 0: 10 forge aggregator ports, 24 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- `git diff --check` — PASS, exit 0.
- `cmp -s scripts/kaola-workflow-adaptive-node.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js` — PASS, exit 0.
- Upstream receipt `kaola-workflow/issue-654/.cache/n1-fix-gate-evidence-rotation.md` records focused RED/GREEN evidence, the full walkthrough PASS, and the Meta command run sequentially with exit 0: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea`.

## Scope and maintainability

The diff is limited to the canonical helper, its three generated editions, and the two intended regression surfaces. Consolidating fresh seed rendering into one local function keeps create, automatic rotation, and forced rotation byte-consistent without changing public interfaces or adding unrelated behavior.
