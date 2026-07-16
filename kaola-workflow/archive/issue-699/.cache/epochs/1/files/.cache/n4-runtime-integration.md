evidence-binding: n4-runtime-integration 17dd85618d84
upstream_read: n2-lineage-transaction da5ca839dc51
upstream_read: n3-planner-control-plane 642a6c3f9b21

assigned_task: bounded A4 runtime/integration handback replay
role: tdd-guide
write_scope: n4 canonical/shared runtime integration surfaces and generated handoff ports only

RED: three pre-implementation focused probes exited 1: the root shared walkthrough failed before startup with `fatal: not a git repository` during branch resolution, while both GitLab and Gitea `--forbidden-only` probes rejected their generated adaptive-handoff ports for the literal `/\$HOME\/\.claude\/kaola-workflow\/scripts/` found in comments.

GREEN: the one post-implementation validation attempt proved the n4 changes themselves green: test-replan passed 496 assertions, adaptive-handoff passed 161, adaptive-node passed 2209, plan-run passed 35, the shared walkthrough passed the former Git-anchor/branch-resolution failure and reached its later release-cleanup assertion, edition/script/routing parity passed, both forge forbidden-only probes passed, five syntax checks passed, and `git diff --check` passed.

implementation:
- `scripts/simulate-workflow-walkthrough.js` now calls the existing `initGitRepo(tmp)` helper once for the canonical shared temporary root before any shared claim/startup scenario resolves a branch. This creates a committed `main` anchor without changing any packaged walkthrough or forge-owned test file.
- The two adaptive-handoff installation-path comments now describe an edition-neutral runtime script directory rather than embedding the Claude-home literal. Executable `getRoot()` behavior and its `process.cwd()` fallback are unchanged for canonical and Codex.
- `npm run sync:editions` propagated the canonical handoff bytes to the Codex mirror and regenerated the GitLab/Gitea ports; exactly three generated/mirrored files were updated.

files_changed_by_a4:
- scripts/kaola-workflow-adaptive-handoff.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-handoff.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-handoff.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-handoff.js
- scripts/simulate-workflow-walkthrough.js
- kaola-workflow/issue-699/.cache/n4-runtime-integration.md

validation_results:
- `node scripts/test-replan.js` -> PASSED (496 assertions).
- `node scripts/test-adaptive-handoff.js` -> PASSED (161 assertions).
- `node scripts/test-adaptive-node.js` -> PASSED (2209 assertions); the corrupt-index and broken-gitdir fixtures emitted their intentional git fatal diagnostics.
- `node scripts/test-plan-run.js` -> PASSED (35 assertions).
- `node scripts/simulate-workflow-walkthrough.js --only testClaimStatusRelease --only testReplanRuntimeFence699` -> exit 1 at `released folder should leave active set` after the repaired Git-anchor/branch-resolution path succeeded. Per instruction, this new cross-owner claim-release class was not patched or rerun.
- `node scripts/edition-sync.js --check` -> PASSED; 12 forge aggregator ports, 25 COMMON_SCRIPTS mirrors, and 27 byte-identical groups in parity.
- `node scripts/validate-script-sync.js` -> PASSED; 25 common scripts, 27 byte-identical groups, 8 rename-normalized families, 2 hooks families, and 7 forge export-superset families in sync.
- `node scripts/generate-routing-surfaces.js --check` -> PASSED; all 12 surfaces byte-match the skeleton.
- GitLab adaptive-handoff `--forbidden-only` -> PASSED (1 file).
- Gitea adaptive-handoff `--forbidden-only` -> PASSED (1 file).
- `node --check` -> PASSED for canonical/Codex/GitLab/Gitea adaptive-handoff and the root walkthrough.
- `git diff --check` -> PASSED.

cross_owner_blocker: the newly reachable `testClaimStatusRelease` cleanup assertion reports that `issue-63` remains in the active set after a successful release response. This belongs to claim/release runtime or its test contract, not n4 runtime integration; exact root cause was intentionally not investigated or changed. Route once to A5/review.

integrated_conclusion: PARTIAL — both assigned n4 defects are repaired and independently validated, but the required root focused walkthrough does not complete because of the new cross-owner release-cleanup failure.
close_node: not run
