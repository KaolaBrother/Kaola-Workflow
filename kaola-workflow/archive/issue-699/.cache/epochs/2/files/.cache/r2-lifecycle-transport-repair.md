evidence-binding: r2-lifecycle-transport-repair b6675aaedc02
<!-- RED: paste RED here -->
RED: reopened packaged RED reproduced exactly: GitLab `testWatchMrAbandonedClosureInvariantsClean` exited 1 at line 494 and Gitea `testWatchPrAbandonedClosureInvariantsClean` exited 1 at line 485; each receipt had only `epoch-lineage-preserved` in `closure_invariants.violations`. Historical r2 RED remains the original immutable/no-history root, planless tuple, archive predicate, handoff active hash, repair-outcome failpoint, and OFFLINE+NATIVE failures recorded under the prior binding.
<!-- GREEN: paste GREEN here -->
GREEN: the reopened defect is GREEN in both packaged editions (`testWatchMrAbandonedClosureInvariantsClean: PASSED`, `testWatchPrAbandonedClosureInvariantsClean: PASSED`), and their next same-owner stateless-orphan claim tests also pass. Original r2 focused regressions pass at claim-hardening 264, bundle-finalize 148, adaptive-handoff 165, adaptive-node 2209, and replan 888 assertions; overall replay status is PARTIAL because both packaged suites later reach the same r3-owned `buildPlannerPacket` snapshot fixture failure and the walkthrough's nested replan subprocess exceeds its stale 120-second timeout.
<!-- OPEN r1-repair-blueprint's evidence file and append its line-1 binding nonce as the value below -->
upstream_read: r1-repair-blueprint e5345fa3e0ad

# Reopened r2 lifecycle transport repair

status: PARTIAL
delegation_outcome: completed

## Assigned task and boundary

Replay only `r2-lifecycle-transport-repair` under binding `b6675aaedc02`. Repair the r4-recorded claim/closure integration defect without weakening `epoch-lineage-preserved`, fabricating success before archive proof, editing r3/r4 implementation, or changing packaged forge tests. Re-run the original r2 proof and both packaged GitLab/Gitea suites; stop on a new cross-owner class.

Authority read before editing:

- `CLAUDE.md` in full.
- Frozen r2 brief in `workflow-plan.md`.
- `r4-forge-contract-repair 9667df96675c` blocker evidence.
- `r1-repair-blueprint e5345fa3e0ad` binding and repair contract.

## Files changed in this replay

- `scripts/kaola-workflow-claim.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (generated Codex mirror)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- `kaola-workflow/issue-699/.cache/r2-lifecycle-transport-repair.md`

No test, validator, replan, schema, plan, state, transaction, or snapshot file was edited in this replay. The dirty validator and packaged-test paths belong to other already-running nodes and were preserved.

## Implementation

- Added one claim-side `archiveEpochLineagePreserved` derivation per semantic edition. It accepts only the shared explicit archive-success predicate, recursively re-verifies `result.dest` with that edition's replan verifier, and returns `preserved`, `absent`, or `failed`.
- Finalize and merged/abandoned watch receipts now use the same post-proof derivation. Both watch branches populate `epoch_lineage_preserved` only after `archiveProjectDirSafely` returned explicit success; archive refusals still stop before receipt/cleanup handling.
- When a direct crash-reclaim caller names only canonical `issue-N`, `writeState` infers the numeric issue solely for the durable schema-2 identity. This preserves the pre-existing no-probe call path while making the new claim identity reconstructible; it fixed the next r2-owned packaged claim test exposed after the watch RED turned GREEN.
- `node scripts/edition-sync.js --write` refreshed only the Codex claim mirror.
- Mechanical replan-source transport, OFFLINE precedence, archive-result refusal, handoff activation, r3 lineage logic, and r4 validator logic were not changed.

## RED evidence

Command:

`node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

Pre-fix result: exit 1 at `test-gitlab-workflow-scripts.js:494`; `closure_invariants.ok` was false with sole violation `epoch-lineage-preserved`.

Command:

`node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

Pre-fix result: exit 1 at `test-gitea-workflow-scripts.js:485`; `closure_invariants.ok` was false with sole violation `epoch-lineage-preserved`.

These were behavior/test failures owned by r2's claim/closure family.

## GREEN and validation evidence

- Four claim ports: `node --check` -> PASS.
- GitLab packaged suite after fix: target `testWatchMrAbandonedClosureInvariantsClean` PASS; next r2-owned `testGitlabClaimReclaimsStatelessOrphanDir` PASS; suite later PARTIAL on the cross-owner blocker below.
- Gitea packaged suite after fix: target `testWatchPrAbandonedClosureInvariantsClean` PASS; next r2-owned `testGiteaClaimReclaimsStatelessOrphanDir` PASS; suite later PARTIAL on the cross-owner blocker below.
- `node scripts/test-claim-hardening.js` -> PASS, 264 assertions. Expected mocked forge-network diagnostics were non-blocking.
- `node scripts/test-bundle-finalize.js` -> PASS, 148 tests.
- `node scripts/test-adaptive-handoff.js` -> PASS, 165 assertions.
- `node scripts/test-adaptive-node.js` -> PASS, 2209 assertions.
- `node scripts/test-replan.js` -> PASS, 888 assertions, including real repair outcome persistence and planner-pending transport.
- Focused walkthrough command with the five original r2 scenarios -> PARTIAL, exit 1: planless/planned authority PASS, archive-callers fail-closed PASS, offline/no-history root PASS, and the silent `testWorktreeNativeOfflineWins` predecessor completed; `testReviewOutcomeTransport699` fails because its nested `test-replan.js` has `timeout: 120000` while the expanded standalone suite now runs longer and passes at 888 assertions.
- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-699/workflow-plan.md --resume-check --json` -> PASS, frozen hash `356e9948105a500db2dc3061b9fe3dc7c8dcdcf9e117df5c2c7eb23906d1f938`.
- `node scripts/edition-sync.js --check` -> PASS: 12 forge ports, 25 common mirrors, 27 byte-identical groups.
- `node scripts/validate-script-sync.js` -> PASS: common, byte, normalized, hooks, and export-superset families in sync.
- `node scripts/test-edition-sync.js` -> PASS, 46 assertions.
- `git diff --check -- <four claim ports>` -> PASS.
- `node scripts/kaola-workflow-adaptive-node.js record-evidence --project issue-699 --node-id r2-lifecycle-transport-repair --verify --json` -> PASS, `result:ok`, role `tdd-guide`, evidence source `parent`.
- Coverage: `package.json` exposes no coverage command.

## Cross-owner blocker and stop disposition

blocker_type: upstream_write_set_required
blocked_disposition: stop; no further implementation handback authorized

After both targeted watch tests and stateless-orphan claim tests passed, both packaged suites reached an identical r3-owned failure:

- GitLab: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-replan.js:1385`, called by `testGitlabReplanEditionContract699` at packaged test line 4965.
- Gitea: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-replan.js:1385`, called by `testGiteaReplanEditionContract699` at packaged test line 4783.
- Signature: `TypeError: Cannot read properties of undefined (reading 'authority_projection')` at `transaction.snapshot.authority_projection` in `buildPlannerPacket`.

This is outside r2's claim/closure implementation and belongs to the r3 replan contract or its later-owned packaged fixture. Per the explicit no-loop boundary, no replan, validator, packaged-test, or walkthrough-timeout edit was made after this class appeared. The r2 target fix is implemented and directly GREEN, but the node remains PARTIAL because the mandated packaged suites and the original five-scenario wrapper are not end-to-end green.
