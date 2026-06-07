# Node review (code-reviewer) — evidence (issue #267)

Gate role: code-reviewer. Post-dominates the sole code-producing node impl-tests.
Scope: single file scripts/simulate-workflow-walkthrough.js, +279 lines, additive test coverage only. No production code touched (validator/next-action/schema unchanged) — lane discipline satisfied. Suite exits 0 with all four new PASSED lines.

AC coverage — all satisfied, all anti-vacuous (reviewer independently probed each fixture's load-bearingness):
- G1a/G1b/G1c: select+fanout / select+adversarial-verify / select+loop assert in-grammar against the real validator; broken-classifier probe yields a real G-SEL-1 refusal.
- G1d: VALID in-grammar; NEGATIVE refuses with the specific "does not post-dominate ... arm-b" error (not a bare refuse).
- G2: two distinct-name select groups in-grammar; classifier-collision mutation refuses with G-SEL-1.
- G3: real next-action; n/a arm absent + pending arm present; control flip proves n/a is the cause.
- G4: --resume-check ok=true after ledger-only mutation; control proves a ## Nodes mutation fails with plan_hash mismatch (assertion is meaningful). Comment's hash-region claim matches computePlanHash:488-493.
- G5: in-grammar; the fanout(sweep) token on classifier is load-bearing (heterogeneity probe confirms).

Conventions: hand-rolled assert style, finally cleanup, offline runNode. Strict equality / regex against concrete parsed fields → fails closed, never vacuous.

Findings: none blocking, none advisory.

verdict: pass
findings_blocking: 0
findings_advisory: 0
