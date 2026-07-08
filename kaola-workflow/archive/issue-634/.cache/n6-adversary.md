evidence-binding: n6-adversary 35d030697c12

verdict: pass
findings_blocking: 0

## Claim Under Test
"R4 is repaired: checkEvidenceShape (adaptive-node.js) now refuses a hollow metric-optimizer evidence stub, enforced on all close paths + all 4 editions, no new regression" — re-run of the change-gate after n2-engine repair.

## PRIMARY (R4 fix) — all disproof attempts FAILED
1. Direct unit repro: hollow stub (4 keys, empty values) → {"ok":false,"kind":"shape","missingTokenClass":"metric_baseline"}; full stub → {"ok":true}.
2. Exact seeded-stub bytes: seedEvidenceFile(...,'metric-optimizer') on-disk bytes → REFUSED on metric_baseline; comment lines don't satisfy column-0 anchor.
3. ORIGINAL E2E COUNTEREXAMPLE REPRODUCED: scratch git repo → in-grammar optimize plan → plan-validator --freeze → open-next (seeded hollow, nonce f4b5d817ae3c) → close-and-open-next --node-id opt → {"result":"refuse","reason":"evidence_shape_failed","missingTokenClass":"metric_baseline"} exit 1. The exact close that wrongly succeeded on the first run. Ledger untouched.
4. Differential (no false-refusal): filled 4 tokens with real values → close-and-open-next → ok, closed:opt, ledger complete, review opened. Precisely targeted.
5. Bypass battery — 11 probes all correct: crlf-hollow REFUSE / crlf-full PASS / whitespace-only REFUSE / comment-only REFUSE / indented-key REFUSE / prefix-token-key REFUSE / token-in-another-value REFUSE / three-of-four REFUSE(regression-green) / missing-key REFUSE(iterations_used) / null REFUSE / empty REFUSE.
6. All close paths enforce it: runVerifyEvidence (:1410), runCloseAndOpenNext (:2280), runCloseNode (:4994, section (a) BEFORE lane-group branch → lane-group closes covered). No bypass.
7. All 4 editions: branch in canonical + 3 ports; live-probed each (hollow REFUSE / full PASS). edition-sync --check green (10 ports parity), validate-script-sync green.
8. Regression-pinned: T7m-a..d (test-adaptive-node.js:412-462) pin hollow-refuse/partial-refuse/filled-pass/absent-refuse.

## SECONDARY (delta blast radius + prior holds)
- test-adaptive-node.js → 1491 assertions exit 0; walkthrough passed exit 0; edition-sync --check + validate-script-sync green.
- Collateral check: extracted checkEvidenceShape main @3b052233 vs worktree — delta is a PURE INSERTION of the metric-optimizer branch; every other role branch byte-unchanged.
- Prior holds spot-checked (independent plans): OPT-2 refuse, OPT-5 refuse, valid optimize plan in-grammar; non-optimize dispatch cards pinned byte-identical (test-adaptive-node.js:4761); live code-reviewer card carried zero optimize keys.
- #635-class run-chains flake not re-raised per instructions (not in this delta's blast radius).

## Verdict
NOT-REFUTED (high confidence) — R4 genuinely fixed at unit, seeded-stub, and full-lifecycle levels, enforced on every close path in all 4 editions, regression-pinned, pure-insertion delta, all suites green. The change survives refutation.
