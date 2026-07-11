evidence-binding: n4-adversarial-freeze-compat 108a01ffe01a
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=old_frozen_1_and_721_fail_closed_at_current_consumption_while_valid_180_remains_compatible
finding: id=R6 scope=in_scope action=fix status=resolved severity=critical fix_role=tdd-guide rationale=direct_builder_omitted_model_now_uses_canonical_role_resolution_and_exact_40_or_20_floor
finding: id=R2 scope=pre_existing action=follow_up status=open severity=high fix_role=tdd-guide rationale=fenced_upstream_nodes_heading_discrepancy_remains_separate_from_issue_655

# Final adversarial compatibility rerun — issue #655

## Claim under test

The final candidate claims that the optional hash-covered `wait_budget_minutes` field is strict at current freeze and every consumption point, including upgrade from a pre-feature frozen plan; that effective omitted-model role floors apply in both next-action and the defensive `buildDispatch`; and that absent/blank/dash legacy plans, valid 180-minute overrides, model tiers, and hashes remain compatible.

## Strongest disproof attempts

### Prior R1: old-frozen unknown cells — resolved

I exported the pre-change validator from baseline commit `10f8cb50d2185274f6e380c46a1cf5407386bad8` with `git archive HEAD scripts agents`, then froze otherwise-valid plans whose then-unknown wait cells were `1`, `721`, and `180`.

| Old-frozen cell | Baseline hash | Current resume | Current next-action | Direct builder |
| --- | --- | --- | --- | --- |
| 1 | `75c54afee6d747576fa3bf5f1468409157d2d7f6f989f3794cae1810168bbe2e` | `ok:true` structural/hash compatibility | Stable `wait_budget_below_floor` | Throws `wait_budget_below_floor` |
| 721 | `d5f6235a8331b73f9207dad74dae72eabba5ea195e434e2874d2c4164f1628a7` | `ok:true` structural/hash compatibility | Stable `wait_budget_above_cap` | Throws `wait_budget_above_cap` |
| 180 | `49b969ea70eefc6f3e7be7cc393f954366476a288ec307825c52c410e6b79d60` | `ok:true` | Projects exactly 180 | Emits 180 / `planner_override` |

Each invalid next-action and builder probe was repeated and produced the same typed reason/message. Neither formerly unknown invalid value activates, while the semantically valid legacy 180 value remains usable. R1 is resolved.

### Prior R6: omitted-model direct builder floor — resolved

The direct builder matrix was run twice per input:

| Role / model | Value | Result |
| --- | --- | --- |
| `code-reviewer` / omitted | 20, 39 | Stable `wait_budget_below_floor`, resolved floor 40 |
| `code-reviewer` / omitted | 40 | Accepted; 40 / `planner_override` |
| `implementer` / omitted | 19 | Stable `wait_budget_below_floor`, resolved floor 20 |
| `implementer` / omitted | 20 | Accepted; 20 / `planner_override` |
| `code-reviewer` / `opus` | 39 / 40 | 39 refused, 40 accepted |
| `code-reviewer` / `reasoning` | 39 / 40 | 39 refused, 40 accepted |
| `implementer` / `sonnet` | 19 / 20 | 19 refused, 20 accepted |
| `implementer` / `standard` | 19 / 20 | 19 refused, 20 accepted |

No omitted-model or explicit-model disagreement remains. R6 is resolved.

## Complete parser/freeze matrix

The hermetic inline harness executed 57 checks with 0 failures.

- Optional header absent: accepted, parsed override `null`.
- Optional header reordered to the first column: accepted; parsed wait 180 and model `standard`.
- Blank, `-`, and `—`: accepted as no override.
- `+20`, `-20`, `20.0`, `2e1`, internal whitespace `2 0`, `020`, and `00`: stable `wait_budget_noninteger`.
- Numeric `0`, standard 19, reasoning 39, legacy `opus` 39, omitted implementer 19, and omitted reviewer 20/39: stable `wait_budget_below_floor`.
- Standard/legacy `sonnet`/omitted implementer 20 accepted; reasoning/legacy `opus`/omitted reviewer 40 accepted.
- 720 accepted; 721 stably refused as `wait_budget_above_cap`.
- `finalize` and `main-session-gate` stably refused as `wait_budget_nondelegable`.
- Metric optimizer wait 60 without a wall-clock field accepted; adding wall-clock 60 stably refused as `wait_budget_conflict`.
- Duplicate optional header remained deterministic first-index behavior; an out-of-section 721 decoy did not affect the real 180 cell.

Actual local role defaults were `implementer -> sonnet` and `code-reviewer -> opus`, matching the enforced 20/40 floors.

## Legacy/no-override exact compatibility

The baseline and current validators produced byte-identical full validation JSON and frozen content, with equal hashes, for:

- Header absent: `b9262ffd633fa90a4013f89bc3085c386fb7118e943dcb1b336366ebf41107b3`.
- Optional blank cell: `9ea2e0dbbcb073807a3c14b887cf5e42783dd7c6d2401feaee1706106cb16ef0`.
- Optional em-dash cell: `8cd62dac31206809f1f91a8307249a07ebd70b788ac2ef4776feb23bc6c45608`.

No true no-override compatibility change was found.

## Current freeze, hash, and tamper

A current valid 180-minute standard implementer plan was run through real CLI `--freeze-checked`, then `--freeze --governance-ack`, then `--resume-check`.

- Freeze returned `frozen:true`, `resumeOk:true`.
- Stored and computed hash matched `49b969ea70eefc6f3e7be7cc393f954366476a288ec307825c52c410e6b79d60`.
- Model remained `standard`; wait remained 180.
- Resume returned `ok:true`.
- Changing the frozen cell from 180 to 181 caused typed `reasonCode:"plan_hash_mismatch"`.

## Pre-existing fenced-heading discrepancy

The known unrelated behavior remains: a fenced upstream `## Nodes` decoy can be selected before the real table; the probe parsed ids `fake`, `id`, `work`, `review`, `done` and refused the fake 721 value. This is the pre-existing classifier heading-locator discrepancy, not introduced or altered by issue #655, and is recorded separately as a non-blocking follow-up.

## Commands and fresh results

Hermetic matrix command:

`git archive HEAD scripts agents | tar -x -C <baseline>; BASELINE=<baseline> node - <<'NODE' ... 57 parser/freeze/old-validator/builder checks ... NODE`

Result: `count:57`, `failed:0`.

Focused shipped tests:

`node scripts/simulate-workflow-walkthrough.js --only testAdaptiveValidatorGovernance --only testMetricOptimizerContract && node scripts/test-next-action.js`

Result: exit 0; 2 walkthrough scenarios passed; next-action passed 116 assertions.

Adaptive runtime tests:

`node scripts/test-adaptive-node.js`

Result: exit 0; 1,709 assertions passed. The emitted EISDIR stacks were the suite's expected fail-closed negative fixtures; the final process receipt was green.

## Verdict

NOT-REFUTED with high confidence. Both prior in-scope counterexamples are closed, all 57 independent compatibility probes passed, and the focused shipped suites are green. No new in-scope parser, freeze, upgrade, floor, cap, conflict, nondelegable, hash, resume, or no-override discrepancy was found. Product files remained read-only; only this exact seeded evidence receipt was written.
