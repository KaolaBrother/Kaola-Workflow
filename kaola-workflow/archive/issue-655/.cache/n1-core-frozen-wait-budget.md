evidence-binding: n1-core-frozen-wait-budget e74630e15a42
RED: `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance` failed pre-implementation at `#655 blank/dash means no override: ""`; `node scripts/test-adaptive-node.js` failed `#655: validated planner override reaches the single dispatch builder` and `#655: planner override carries an explicit source`.
GREEN: The same focused walkthrough scenario passed; `node scripts/test-adaptive-node.js` passed 1657 assertions; full walkthrough and all four sequential edition chains exited 0.

assigned_task: n1-core-frozen-wait-budget — implement the optional frozen wait_budget_minutes grammar, typed validation, dispatch source, and durable running-set propagation test-first.

write_set:
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-node.js
- scripts/test-adaptive-node.js
- scripts/simulate-workflow-walkthrough.js

tests_changed:
- scripts/simulate-workflow-walkthrough.js: optional-column absence/dashes, floor/cap/180/hash cases, strict integer and nondelegable typed refusals, optimizer dual-budget conflict, real $TMPDIR fixture root.
- scripts/test-adaptive-node.js: single-builder planner override/source and legacy no-override compatibility controls.

implementation_changed:
- Canonical schema owns reasoning/standard/default floors and the 720 cap.
- Header-indexed parseNodes parses once, retaining raw input for precise validation and exposing validated numeric wait_budget_minutes.
- validatePlan emits wait_budget_noninteger, wait_budget_below_floor, wait_budget_above_cap, wait_budget_nondelegable, and wait_budget_conflict.
- Single buildDispatch emits planner_override; open-next/fused consume validator-shaped nodes, open-ready maps the validated field once, and durable running-set members preserve exact value/source through top-up/reconcile survivor rewrites.
- Generated Codex/GitLab/Gitea mirrors were produced only through npm run sync:editions.

validation_commands:
- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract` — PASS.
- `node scripts/test-adaptive-node.js` — PASS (1657 assertions).
- `npm run sync:editions -- --check` — PASS.
- `node scripts/simulate-workflow-walkthrough.js` — PASS (`Workflow walkthrough simulation passed`).
- `npm run test:kaola-workflow:claude` — PASS, exit 0.
- `npm run test:kaola-workflow:codex` — PASS, exit 0.
- `npm run test:kaola-workflow:gitlab` — PASS, exit 0.
- `npm run test:kaola-workflow:gitea` — PASS, exit 0.

failure_classification: Initial RED failures were expected behavior/test failures. No build/type/lint/tooling failure remained. The Claude chain printed expected negative-fixture EISDIR stacks and mocked network errors while its enclosing assertions and chain exited 0.

residual_risk: Lifecycle integration coverage for existing open-ready/top-up/reconcile machinery is broad in the 1657-assertion adaptive-node suite; the new assertions directly pin parser/builder/durable-member semantics, while downstream adversarial node n5 remains responsible for independent real-harness crash-boundary refutation.

## Reviewer Repair — R1/R2

RED: `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance` failed with `#655-R2: omitted-model reasoning role cannot shorten resolved 40m floor`, observing `result:"in-grammar"`; `node scripts/test-adaptive-node.js` failed authored-plan R1 assertions for `nextNode`, `readySet`, `readyPending`, serial `open-next`, durable running-set persistence, crash reconcile, and fused advance.
GREEN: The same validator scenario passed; `node scripts/test-adaptive-node.js` passed 1677 assertions, including authored serial/read/speculative/write-leg/top-up/fused/reconcile lifecycle coverage; full walkthrough passed.

repair_scope:
- R1: `scripts/kaola-workflow-next-action.js` now uses one conditional descriptor projection for readySet/nextNode, readyPending, active, and speculativePending; absent overrides add no key.
- R1: the existing single `buildDispatch` and running-set persistence now receive the projected validated field. Real authored-plan tests cover serial open-next, read fanout open-ready, active/speculative descriptors, real-git width-4 write legs, queued fifth-member top-up/drain, fused close-and-open-next, and crash reconciliation with exact `planner_override` value/source.
- R2: `validatePlan` resolves an omitted model with the same `resolveAgentModel` seam used by next-action dispatch; the injectable test seam proves omitted-model reasoning/standard roles, exact floors, below-floor refusal, and legacy opus/sonnet aliases.
- Generated next-action, validator, and existing n1 edition ports were regenerated only with `npm run sync:editions`; no generated port was hand-edited.

widened_write_set_additions:
- scripts/kaola-workflow-next-action.js
- plugins/kaola-workflow/scripts/kaola-workflow-next-action.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-next-action.js

repair_validation:
- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance` — PASS.
- `node scripts/test-adaptive-node.js` — PASS, 1677 assertions.
- `node scripts/test-next-action.js` — PASS, 116 assertions.
- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract` — PASS, 2 scenarios.
- `node scripts/simulate-workflow-walkthrough.js` — PASS, `Workflow walkthrough simulation passed`.
- `npm run sync:editions -- --check` — PASS, 0 generated updates.
- `node scripts/validate-script-sync.js` — PASS: common, byte-identical, and rename-normalized groups synchronized.
- Root/Codex/GitLab/Gitea contract validators — PASS.
- `npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitea` — PASS, both exit 0.
- `git diff --check` and canonical/Codex next-action `cmp` — PASS.

meta_receipt: NOT CLAIMED. The retained n3 review records the pre-existing non-hermetic GitLab remote-claim failure and incomplete sequential four-edition command. This repair did not edit that out-of-scope test or assert full Meta success.

failure_classification_repair: R1 and R2 were behavior/test failures routed to tdd-guide and are repaired. The retained GitLab failure remains pre-existing/out-of-scope tooling-fixture behavior.

residual_risk_repair: No known in-scope R1/R2 defect remains. Full Meta remains blocked by the retained out-of-scope GitLab hermeticity issue; downstream review must independently verify the repaired trace.

## Consolidated Adversarial Repair — n4/n5

RED: `node scripts/test-next-action.js; node scripts/test-adaptive-node.js` produced five compatibility-wall failures: pre-change frozen `1` and `721` were emitted as active overrides, omitted-model reasoning/nondelegable/optimizer-conflict cases did not refuse at point of use. The exact real-git mixed crash failed `#655-MIXED-CRASH: stable+opening survivors both retained at cap2`, leaving only the stable member and dropping the newly opening member.
GREEN: After consolidating the shipped compatibility assertions into the in-scope adaptive test file, `node scripts/test-adaptive-node.js && node scripts/test-next-action.js && npm run sync:editions -- --check && git diff --check` exited 0: adaptive-node passed 1696 assertions, next-action passed its unchanged 116 assertions, edition sync reported 0 updates, and formatting passed.

adversarial_repair_A:
- Added exported `validateWaitBudgetNode`, the single semantic resolver over validator-shaped nodes. Full freeze validation and current point-of-use reuse it; no Markdown parser was duplicated.
- Next-action revalidates every parsed nonblank override using the effective role/model, strict integer grammar, tier floor, 720 cap, nondelegable restriction, and optimizer conflict before any ready/active/speculative projection.
- Adaptive `buildDispatch` defensively invokes the same helper and throws a typed fail-closed error for an invalid direct descriptor.
- Hermetic pre-feature freeze fixtures hash unknown-column values `1`, `721`, and `180`; current resume remains structure/hash compatible, current point-of-use refuses 1/721, accepts valid 180, and refuses hash tamper, omitted-model sub-floor, nondelegable, and optimizer dual-budget cases.
- Absent/blank/dash plans retain no override key and legacy no-override dispatch shape/source remains conditional and unchanged.

adversarial_repair_B:
- Reconcile now treats only `opening:true` members as rolling-top-up admission candidates; stable members consume capacity once and survive independently.
- Survivor selection retains stable plus admitted opening members. Genuine capped-out in-progress members are explicitly ledger-reset to pending, included in `cappedOut`, and never silently orphaned.
- Real-git regressions cover both the exact read image (`r2` stable 240/planner_override plus `r3` opening 300/planner_override at cap 2) and a leg-contained write equivalent. Both retain exact values/source; repeated reconcile is `not_opening` idempotent and orient returns healthy.

changed_files:
- scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js
- scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow/scripts/kaola-workflow-plan-validator.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js
- scripts/kaola-workflow-next-action.js
- plugins/kaola-workflow/scripts/kaola-workflow-next-action.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-next-action.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-next-action.js
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-node.js
- scripts/simulate-workflow-walkthrough.js
- scripts/test-adaptive-node.js

validation_receipt_consolidated:
- `node scripts/test-adaptive-node.js` — PASS, 1696 assertions; expected EISDIR negative-fixture stderr, exit 0.
- `node scripts/test-next-action.js` — PASS, unchanged 116 assertions.
- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract` — PASS, 2 scenarios.
- `node scripts/simulate-workflow-walkthrough.js` — PASS, `Workflow walkthrough simulation passed`.
- `npm run sync:editions -- --check` — PASS, 0 generated updates.
- `node scripts/validate-script-sync.js` — PASS; common, byte-identical, and rename-normalized parity green.
- Root/Codex/GitLab/Gitea standalone contract validators — PASS.
- `npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitea` — PASS, exit 0.
- Full sequential Meta — NOT CLAIMED; retained evidence records the out-of-scope non-hermetic GitLab chain failure.

failure_classification_adversarial: Both counterexamples were behavior/test defects and are repaired. No in-scope build/type/lint/tooling failure remains.

residual_risk_adversarial: No known in-scope n4/n5 counterexample remains. The pre-existing fenced-heading discrepancy and GitLab hermeticity failure remain outside n1; n2 prose/profile files were not restored or edited.

## Narrow Final Repair — n4 R6

RED: Direct probe `buildDispatch({id:'review', role:'code-reviewer', model:null, wait_budget_minutes:20, ...})` exited 1 after printing `RED activated 20 planner_override`; the defensive builder wall incorrectly forced `resolveModel: () => nodeInfo.model || ''`, selecting the generic 20-minute floor.
GREEN: The direct-builder matrix passed after removing that override and allowing shared `validateWaitBudgetNode` to invoke the canonical role resolver. `node scripts/test-adaptive-node.js` passed 1709 assertions; omitted-model reasoning 20/39 refuse and 40 accepts, omitted-model standard 19 refuses and 20 accepts, and legacy/neutral explicit model controls match their 40/20 floors.

r6_implementation:
- `scripts/kaola-workflow-adaptive-node.js`: defensive builder validation now passes only `optimizeContracts`; the shared semantic validator owns effective role/model resolution exactly as freeze validation and next-action do.
- Generated Codex/GitLab/Gitea adaptive-node ports were regenerated via `npm run sync:editions`; no port was hand-edited.
- `scripts/test-adaptive-node.js`: added direct-builder controls for omitted-model reasoning/standard roles, legacy `opus`/`sonnet` aliases, neutral `reasoning`/`standard` models, exact floors, and one-minute-below-floor refusals.

r6_validation:
- Direct R6 RED probe — FAIL as expected before implementation: `RED activated 20 planner_override`.
- Direct post-fix matrix — PASS: omitted/default/alias cases all matched expected floor behavior.
- `node scripts/test-adaptive-node.js` — PASS, 1709 assertions; expected negative-fixture EISDIR stderr, exit 0. This includes old-frozen point-of-use and exact mixed-top-up reconcile regressions.
- `node scripts/test-next-action.js` — PASS, unchanged 116 assertions.
- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract` — PASS, 2 scenarios.
- `node scripts/simulate-workflow-walkthrough.js` — PASS, `Workflow walkthrough simulation passed`.
- `npm run sync:editions -- --check` — PASS, 0 generated updates.
- `node scripts/validate-script-sync.js` — PASS, all edition sync groups green.
- `git diff --check` — PASS.

r6_changed_files:
- scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow/scripts/kaola-workflow-adaptive-node.js
- plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js
- scripts/test-adaptive-node.js

failure_classification_r6: Behavior/test defect repaired by tdd-guide; no build/type/lint/tooling failure remains.

residual_risk_r6: No known R6 defect remains. Normal next-action paths and direct defensive builder calls now share effective role/model resolution. Pre-existing fenced-heading and GitLab hermeticity findings remain outside n1.
