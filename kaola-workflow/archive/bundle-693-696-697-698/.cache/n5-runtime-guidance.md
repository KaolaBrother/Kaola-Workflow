evidence-binding: n5-runtime-guidance 68ac15fe7117
upstream_read: n1-architecture ea05782ab1d5
upstream_read: n4-review-engine 01af83fb4cdf
RED: node scripts/test-generate-routing-surfaces.js -> exit 1; reviewer-contract-v2 was absent from the canonical plan-run renderer and all six generated outputs (120 failures, 52 passed).
RED: node scripts/test-route-reachability.js -> exit 1; authoring, execution, finalization, legacy-v1, convergence, and certifier/vector freshness guidance was absent across the exhaustive runtime surface families (389 failures, 989 passed).
GREEN: node scripts/generate-routing-surfaces.js --check && node scripts/test-generate-routing-surfaces.js && node scripts/test-route-reachability.js -> exit 0; all 12 generated routing surfaces byte-matched, all 172 generation assertions passed, and all 1400 route/contract assertions passed.
delegation_outcome: completed

role: tdd-guide
assigned_task: Expose the frozen reviewer-contract-v2 machine contract through planner/adapt authoring, generated plan-run execution, and finalization guidance while preserving explicit verified legacy-v1 behavior and the exact compact-plan/write-set rules.
validation_verdict: focused-red-to-green

implemented_contract:
- New plan authoring is explicitly schema 2 and records the complete validation policy, planner certifiers, inherited frontier metadata, and the exact expanded Nodes table with gate claim/surface/aggregation/certifies fields.
- The authoring guidance defines singleton, replicated-majority, and partitioned-all aggregation; canonical change-gate certification; investigation emptiness; validator-derived code/security certification; and a real common certifier wall.
- Verified already-frozen field-absent/schema-1 plans remain a byte-preserving `contract_version: 1` branch. No authoring, execution, or finalization surface upgrades them in place.
- The canonical plan-run skeleton passes the complete schema-2 context/profile/version and graph-derived gate envelope unchanged, reads canonical review context, executes inherited validation obligations through the validation runner, and accepts only current-candidate canonical pass vectors.
- Plan-run distinguishes `review_failed` from durable `replan_required` outcomes (`review_scope_expanded` and `review_nonconvergent`) and explicitly leaves writer selection and replacement-DAG topology outside the harness.
- Finalization requires schema-2 certifier receipts to match resolved profile, review context, and recomputed candidate identities, and requires every inherited validation vector to be present, passing, and fresh. Schema-1 evidence retains existing verdict semantics.
- All new bounded agent-facing blocks are free of issue/decision provenance; plugin blocks are forge-neutral.

tests_changed:
- scripts/test-generate-routing-surfaces.js
- scripts/test-route-reachability.js

canonical_generation_files_changed:
- templates/routing/plan-run.skeleton.md
- templates/routing/slots.js
- templates/routing/required-blocks.js

generated_plan_run_surfaces_changed:
- commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-plan-run/SKILL.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-plan-run.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-plan-run/SKILL.md

adapt_surfaces_changed:
- commands/kaola-workflow-adapt.md
- plugins/kaola-workflow/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-adapt/SKILL.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-adapt.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-adapt/SKILL.md

finalize_surfaces_changed:
- commands/kaola-workflow-finalize.md
- plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitlab/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitlab/skills/kaola-workflow-finalize/SKILL.md
- plugins/kaola-workflow-gitea/commands/kaola-workflow-finalize.md
- plugins/kaola-workflow-gitea/skills/kaola-workflow-finalize/SKILL.md

planner_profiles_changed:
- agents/workflow-planner.md
- plugins/kaola-workflow/agents/workflow-planner.toml
- plugins/kaola-workflow-gitlab/agents/workflow-planner.toml
- plugins/kaola-workflow-gitea/agents/workflow-planner.toml

commands_results:
- node scripts/generate-routing-surfaces.js --write -> exit 0; mechanically rendered 12 registered surfaces; only the six plan-run outputs changed because the six next outputs were already current.
- node scripts/generate-routing-surfaces.js --check -> exit 0; all 12 surfaces byte-match their skeleton.
- node scripts/test-generate-routing-surfaces.js -> exit 0; 172 assertions passed, including exact canonical-render identity for all six plan-run outputs and complete envelope propagation.
- node scripts/test-route-reachability.js -> exit 0; 1400 assertions passed, including exhaustive 6 plan-run + 6 adapt + 6 finalize + 4 planner coverage, bounded-block mutation checks, manifest reverse-orphan enforcement, plugin neutrality, and legacy-v1 presence.
- git diff --check over all 27 owned source/test/runtime files -> exit 0.

distribution_proof:
- Reviewer-v2 marker counts are exactly 6 plan-run execution, 6 adapt authoring, 4 planner authoring, and 6 finalization surfaces.
- The six adapt authoring blocks are byte-identical; the six finalization blocks are byte-identical.
- The three plugin workflow-planner TOMLs are byte-identical at SHA-256 `fafd5fb34fcf085c01b3ee25207a99b13a2e0ca380fef5b551906ce4982af7cb`.
- The required-block manifest obligates the reviewer-v2 execution and finalization markers across their derived six-surface universes; an intermediate run correctly failed with seven manifest/orphan assertions until the finalization block was registered.
- The protected main checkout remained clean for the checked n5 canonical/test/authoring paths; all n5 edits are confined to the assigned bundle worktree.

preserved_invariants:
- Compact-plan posture and exact-file declared-write-set guidance remain present on every workflow-planner profile.
- Harness-owned `execution_status` and `gate_effect` are not delegated to role prose.
- Runtime guidance consumes the opener's canonical card/context and does not reconstruct machine identity from narrative text.
- Missing, failed, inconclusive, timed-out, signaled, drifted, or stale validation evidence fails closed.
- Generated plan-run outputs were never hand-edited; canonical skeleton/slot changes plus the generator produced them.

residual_risks:
- This node intentionally ran only its assigned focused generation and route-reachability chain, not the full package/four-edition release suite; downstream validation/finalization owns the integrated gate.
- The guidance relies on the n4 schema-2 receipt/context/vector implementation and n3 validation runner already present in the shared worktree; their behavior is proven in their upstream evidence, not reimplemented here.
