evidence-binding: n3-adversarial 0bbae22da610
## n3-adversarial — change-gate adversarial verification (opus, read-only)

Claim: the #598 fix (dispatch-posture install contract + global-aware delegation probe + loud gate-role degradation) is correct, complete, regression-free. Attack mindset: the issue IS a silent fail-open — find the residual hole.

All seven attacks executed; ALL WITHSTOOD:
(a) Posture derivation truth table: 54 systematic + 15 adversarial cells via BOTH installer and preflight ($TMPDIR fixtures). ZERO false-proactive cells; installer/preflight agree everywhere; every raw-TOML mismatch (trailing-comment effort, single-quote 'ultra') lands in the SAFE over-warning direction, never fail-open.
(b) Non-fatality: real installer --global + preflight --doctor/plain against MISSING/EMPTY/MALFORMED/UNREADABLE/VALID configs; A/B vs HEAD~1 — exit codes identical in every cell, zero stderr, no crash; the WARN genuinely surfaces (JSON + human output) in every degraded scope; the pure derivation never throws.
(c) Output-contract stability: installer stdout still ends with status: ok (posture lines print before); preflight JSON delta is exactly the four additive keys; dispatch_mode + multi_agent_v2_enabled byte-identical; all exit codes unchanged.
(d) AC3 probe prose: six next/adapt SKILLs carry BOTH needles with unambiguous probe-local-then-global wording; all three validators pin both; partial-revert demo reds the validator (reflow-tolerant norm() matcher, validate-*-contracts.js:60-64).
(e) AC4 protocol: notice + consent-halt routing + explicit no-self-issued-verdict in all SIX plan-run surfaces in lockstep; write-halt --reason consent is a genuine subcommand (validReasons, adaptive-node.js:2469) with a working clear-halt inverse; no surface leaves a silent self-verdict path for adversarial-verifier/code-reviewer.
(f) Six-surface + pins: route-reachability 185; four contract validators exit 0; PROVENANCE_BAN clean x12; the two forge packs (historic dead zone) genuinely carry the new prose AND pin it.
(g) Byte-groups: validate-script-sync exit 0 (25 groups); installer x3 md5-identical (7712dd82...), preflight x4 md5-identical (8b79c8f1...).

Suites all rc=0: test-install-model-rendering, codex walkthrough, gitlab-scripts, gitea-scripts, canonical walkthrough. Tests non-vacuous (strictEqual on dispatch_posture, warning-iff-not-proactive, status 0; TOML-scoping edge covered; n1 RED confirms feature-discrimination).

No fail-open, no crash/non-zero regression, no swallowed warning, no missing surface, no vacuous assertion. Residual imperfections are all fail-closed/over-warning inside the version-guarded heuristic.

NOT-REFUTED (confidence: high).

verdict: pass
findings_blocking: 0
