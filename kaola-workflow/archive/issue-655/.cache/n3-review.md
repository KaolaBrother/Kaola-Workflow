evidence-binding: n3-review d8ad5ba25480
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=validated_wait_budget_descriptor_now_survives_projection_openers_running_set_and_reconcile_with_exact_planner_override_source
finding: id=R2 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=omitted_model_validation_now_resolves_the_canonical_role_tier_before_enforcing_the_20_or_40_minute_floor
finding: id=R4 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=old_frozen_invalid_values_1_and_721_are_refused_at_next_action_and_direct_builder_activation_walls_while_valid_180_remains_compatible
finding: id=R5 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=mixed_stable_plus_opening_rolling_topup_reconcile_retains_both_members_and_exact_override_metadata_without_orphan_wedge
finding: id=R6 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=direct_builder_omitted_model_uses_canonical_role_resolution_so_code_reviewer_rejects_20_and_39_and_accepts_40
finding: id=R3 scope=pre_existing action=none status=resolved severity=high fix_role=none rationale=previous_transient_gitlab_fixture_failure_did_not_recur_in_the_exact_sequential_four_edition_meta_gate

# Code review — issue #655 final candidate

## Verdict

APPROVE. I found no open blocking correctness, compatibility, generated-parity, or test-coverage issue in the final candidate. The five in-scope defects previously routed from review/adversarial passes are closed, including the final direct-builder omitted-model counterexample. The frozen adaptive plan resumes with validator plan hash `7ea7dad9bb394a916b78d483c51c77e4cecb0c3aed14d77729831ca282895a65`.

## Findings

No open findings.

Historical resolved findings, ordered by severity:

1. **R1 — resolved (critical): end-to-end descriptor propagation.** `scripts/kaola-workflow-next-action.js:91-115` validates the authored cell and projects the optional integer. The opener and durable-state paths preserve it in `scripts/kaola-workflow-adaptive-node.js:5025-5027` and `scripts/kaola-workflow-adaptive-node.js:5245-5274`. Regression coverage exercises next-node, ready-set, speculative, serial, fan-out, fused, running-set, write-leg, and reconcile paths at `scripts/test-adaptive-node.js:4851-4952` and `scripts/test-adaptive-node.js:7290-7367`.

2. **R2 — resolved (critical): effective omitted-model role floor.** The shared validator resolves the effective model before selecting the floor at `scripts/kaola-workflow-plan-validator.js:643-667`, and next-action passes the canonical resolver at `scripts/kaola-workflow-next-action.js:91`. Governance coverage proves omitted-model reasoning roles refuse below 40 while standard roles accept 20 at `scripts/simulate-workflow-walkthrough.js:2279-2287`.

3. **R4 — resolved (critical): old-frozen point-of-use compatibility wall.** Fresh validation remains hash-aware, while previously frozen values that predate the field are checked before activation. `scripts/test-adaptive-node.js:4854-4868` proves 1 and 721 retain structural/hash resume compatibility but refuse with typed below-floor/above-cap reasons; valid 180 activates; hash tampering, nondelegable use, and optimizer conflicts refuse. The direct builder independently enforces the same wall at `scripts/kaola-workflow-adaptive-node.js:1317-1333`.

4. **R5 — resolved (critical): mixed rolling-top-up crash reconciliation.** Reconcile counts only stable members at `scripts/kaola-workflow-adaptive-node.js:6084-6092`, resets capped-out ledger rows at `scripts/kaola-workflow-adaptive-node.js:6096-6103`, and retains eligible opening survivors at `scripts/kaola-workflow-adaptive-node.js:6166-6168`. Both the focused mixed-state regression at `scripts/test-adaptive-node.js:5714-5743` and real-git crash regression at `scripts/test-adaptive-node.js:7214-7237` retain stable/opening members, exact 240/300 `planner_override` metadata, idempotent second reconcile, and a healthy orient result.

5. **R6 — resolved (critical): direct builder omitted-model role resolution.** The builder now calls the shared validator without replacing its canonical role resolver at `scripts/kaola-workflow-adaptive-node.js:1317-1333`. The shipped matrix at `scripts/test-adaptive-node.js:5002-5015` covers omitted and explicit reasoning/standard/legacy-alias controls. My independent direct probe confirmed: omitted-model `code-reviewer` rejects 20 and 39 with `wait_budget_below_floor` and accepts 40; omitted-model `implementer` rejects 19 and accepts 20; explicit `reasoning` and `standard` controls have identical boundaries. Accepted values carry `wait_budget_source: planner_override`.

6. **R3 — resolved, pre-existing/transient (high).** The previously observed GitLab fixture failure did not recur. The exact sequential four-edition Meta command completed GitLab native/Codex walkthroughs and the full chain with exit 0, so no candidate defect remains attached to that observation.

## Compatibility and invariants

- Strict base-10 parsing, optional blank/dash legacy cells, 20/40 role-tier floors, cap 720, nondelegable refusal, optimizer conflict refusal, and typed reasons are centralized in `scripts/kaola-workflow-plan-validator.js:625-667`.
- Legacy/no-override dispatch behavior remains covered alongside planner overrides at `scripts/test-adaptive-node.js:4991-5000`; optimizer controls continue to use `optimize_budget` at `scripts/test-adaptive-node.js:5035-5049`.
- Planner wait budgets extend the join floor only; the generated routing surfaces retain bounded escalation and governed-completion requirements. `generate-routing-surfaces --check`, edition sync, script sync, common-validator parity, planner-profile parity, and all edition contract validators passed.
- Scope is coherent across canonical, Codex, GitLab, and Gitea mirrors. `git diff --check` passed. I made no product, plan, roadmap, state, generated-surface, or test edit; the only repository write was this seeded evidence receipt.

## Fresh validation receipt

- Direct R6 builder matrix — PASS (9 boundary/control cases; exact omitted-model 20/39/40 reasoning-role behavior confirmed).
- `node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract` — PASS (2 scenarios).
- `node scripts/test-next-action.js` — PASS (116 assertions).
- `node scripts/test-adaptive-node.js` — PASS (1709 assertions; printed `EISDIR` stacks are expected fail-closed negative fixtures).
- `TMPDIR="${TMPDIR:-/tmp}" node scripts/test-agent-profile-parity.js` — PASS (73 assertions).
- `TMPDIR="${TMPDIR:-/tmp}" node scripts/test-route-reachability.js` — PASS (459 assertions).
- Routing generation check, `npm run sync:editions -- --check`, `node scripts/validate-script-sync.js`, common-validator/next-action/planner TOML byte comparisons, four contract validators, two forge `--forbidden-only` checks, and `git diff --check` — PASS.
- Exact sequential Meta: `npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea` — PASS, exit 0.
- `node scripts/kaola-workflow-plan-validator.js kaola-workflow/issue-655/workflow-plan.md --resume-check --json` — PASS; `result:"pass"`, plan hash `7ea7dad9bb394a916b78d483c51c77e4cecb0c3aed14d77729831ca282895a65`.

## Residual risk

Low. The change spans parser, scheduling, durable reconciliation, generated routing prose, and four editions, but every boundary implicated by prior review now has focused regression coverage plus the full exact edition gate. The remaining prose-level join behavior is machine-pinned by profile, route-reachability, generated-surface, and contract checks.
