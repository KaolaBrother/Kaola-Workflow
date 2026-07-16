evidence-binding: e3-lifecycle-publication-repair 0e932924a6e7
RED: reproduced lifecycle/publication failures and upstream authority acceptance gap
- `node scripts/test-adaptive-handoff.js` exited 1 before the consumer repair: `FAIL: #699 child handoff: publication reports the actual first node... got {}` and `adaptive-handoff tests FAILED (1 failures, 165 passed)`.
- `node scripts/simulate-workflow-walkthrough.js --only testReviewOutcomeTransport699` exited 1 before the focused publisher repair. The bounded child exited 1 with stderr `Error: #699 focused source publisher is callable`; the parent surfaced command, status, error, stdout, and stderr.
- `node scripts/simulate-workflow-walkthrough.js --only testManualArchiveBackstop` exited 1 before the source-missing archive recovery repair: `expected exit 0, got 1`.
- Current upstream-owned RED was reproduced after the E3 implementation by creating one canonical fresh planless claim, mutating only one E2 authority field at a time, and calling both shared verifiers:

```text
command: node <<'NODE'  # inline hermetic temp-repo probe; claim startup, then the four mutations below
missing_schema: remove /^epoch_schema_version:.*\n/m
unknown_schema: replace with epoch_schema_version: 99
missing_lineage: remove /^epoch_lineage_id:.*\n/m
tampered_lineage: replace with epoch_lineage_id: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
for each mutation: verifyCurrentEpochAuthority(projectDir); verifyAllEpochSnapshots(projectDir)
NODE

{"mutation":"missing_schema","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
{"mutation":"unknown_schema","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
{"mutation":"missing_lineage","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
{"mutation":"tampered_lineage","current_ok":true,"snapshots_ok":true,"destructive_gate_accepts":true}
```

GREEN: E3-owned focused suites pass; upstream authority gap remains routed to E2
- `node scripts/test-adaptive-handoff.js` exited 0: `adaptive-handoff tests passed (170 assertions)`.
- `node scripts/test-adaptive-node.js` exited 0: `adaptive-node tests passed (2227 assertions)`.
- `node scripts/test-claim-hardening.js` exited 0: `claim-hardening tests passed (266 assertions)`.
- `node scripts/test-bundle-finalize.js` exited 0: all 149 tests passed.
- `node scripts/simulate-workflow-walkthrough.js --only testReviewOutcomeTransport699 --only testManualArchiveBackstop --only testPlanlessAndPlannedInitialAuthority699 --only testArchiveCallersFailClosed699` exited 0: all four scenarios passed.
- `node scripts/simulate-workflow-walkthrough.js --only testFinalizeArchiveVerifiesBeforeDelete --only testArchiveCompleteSourceRelative676` exited 0: both scenarios passed after preserving the established optional machinery-sidecar contract under recursive byte verification.
- `node scripts/test-edition-sync.js` exited 0: 46 assertions passed.
- `node scripts/edition-sync.js --check` exited 0 and `node scripts/validate-script-sync.js` exited 0 before the final hand-ported optional-sidecar hunk; source work then froze on scheduler instruction, so that last read-only parity rerun remains pending for the fresh E3 reopen.

## Assigned task

Complete the lifecycle, archive-caller, source-publication, and promoted-child consumer side of R6-699-02 and R6-699-04 without editing E2 authority semantics. Preserve valid schema-2 planless epoch-one archive/finalize/release/watch behavior, stop destructive callers on shared-verifier refusal, rotate a settled source only from digest-proven E2 history, publish the child plan's actual first node, and replace the nested 120-second full-suite wrapper with a bounded focused transport proof that reports command/status/error/signal/stdout/stderr.

## Implemented state at handback

- Archive/finalize/release/watch/bundle cleanup now compose `verifyCurrentEpochAuthority` and `verifyAllEpochSnapshots`; cleanup occurs only after explicit archive success, and a source-missing finalize resolves and verifies the archived authority.
- Canonical schema-2 planless epoch one archives successfully and records `epoch_lineage_preserved: preserved`.
- Repair source publication validates the committed E2 transaction and parent snapshot, archives exact predecessor bytes create-exclusively, fsyncs file/directories, tolerates legal crash/retry states, refuses collisions/tamper, and publishes the successor with `rotated_from`.
- Handoff and adaptive-node consumers validate committed authority and report the promoted child plan's actual first node/role without rewriting transaction authority.
- The walkthrough transport proof is an independent 15-second focused child and failure diagnostics carry command, status, error, signal, stdout, and stderr.
- Runtime-neutral semantic ports were made across canonical, Codex, GitLab, and Gitea production families. The final optional-sidecar hunk was manually mirrored to both forge claim ports and generated to Codex immediately before the scheduler freeze.

## Files changed by E3

- Claim family: `scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`.
- Closure-contract family: `scripts/kaola-workflow-closure-contract.js`, `plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js`, `plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js`.
- Adaptive-handoff family: `scripts/kaola-workflow-adaptive-handoff.js`, `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js`, `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js`.
- Adaptive-node family: `scripts/kaola-workflow-adaptive-node.js`, `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js`, `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js`, `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-node.js`.
- Tests: `scripts/test-adaptive-handoff.js`, `scripts/test-adaptive-node.js`, `scripts/test-claim-hardening.js`, `scripts/test-bundle-finalize.js`, `scripts/simulate-workflow-walkthrough.js`.
- Evidence: `kaola-workflow/issue-699/.cache/e3-lifecycle-publication-repair.md`.

## Failure classification and scheduler state

classification: product defect, upstream-owned by `e2-versioned-epoch-repair`

The shared E2 planless verifier accepts missing/unknown `epoch_schema_version` and missing/tampered `epoch_lineage_id`. E3 callers intentionally consume that shared authority result and must not duplicate or reinterpret it. Consequently the required malformed-authority destructive-caller refusal cannot be completed inside the E3 write set. The finding was sent to the root scheduler for one E3-to-E2 handback.

node_status: in_progress; source edits frozen; node not closed; full walkthrough and final parity/contract validation intentionally deferred until E2 repair and fresh E3 reopen.

upstream-bindings: e1-epoch3-authority-blueprint a224da30381a; e2-versioned-epoch-repair 57da78d0e83e
plan-hash: f696f5a02b2d9a2b1f8822b75b26fa479d650e18346a779f75a571425420d9d0
