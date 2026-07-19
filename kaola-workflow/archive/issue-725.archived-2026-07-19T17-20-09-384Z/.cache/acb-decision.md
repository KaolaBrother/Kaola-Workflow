# AC-B ≥50% target — user decision record (2026-07-19)

decision_authority: user (interactive session, explicit choice via orchestrator question)
decision_ts: 2026-07-19T23:00+0800 (answered mid-run, between n1 completion and n2 dispatch)
decision: "Defer the 50% to Phase E" (selected over "Extend Phase B now" and "Let n3 fail honestly")

## Context (measured facts, from n1-receipt-diet evidence)

- B0 instrument-first measurement: claude chain 696.5s = ~80% of the all-four serial cost (870.3s);
  codex 17.2s, gitlab 79.8s, gitea 76.8s.
- Therefore B1 diff-scoping (dropping the three forge chains on a claude-only diff) can cut the
  common case by at most ~20% serial (~0% concurrent); B2's hoisted validators save ~0.6s.
- No implementation of B0–B3 as specified can reach the ≥50% common-case cut named in AC-B; the
  remaining cut must come from shrinking or parallelizing the claude chain itself.

## Disposition (binding for this run)

- B0–B3 are ACCEPTED as landed (mechanism complete and correct; measured ~20% common-case cut
  recorded in n1 evidence).
- The ≥50% common-case target is RE-ATTRIBUTED to the epic level (issue #725 top-level acceptance
  criterion 2, "vs the pre-epic baseline"): Phase E (mega-test overlap prune) is the designated
  vehicle, since it directly shrinks the claude chain that n1 proved is the bottleneck. If still
  short after Phase E, intra-claude-chain step concurrency is to be filed as its own follow-up
  issue (needs a step-independence proof so the finalize gate cannot flake).
- For the n3-code-review gate: the frozen gate_claim clause "the measured >=50% common-case
  wall-clock cut recorded" is unmet as measured; per this user decision the honest classification
  of that shortfall is a recorded finding with a deferred disposition (e.g. action=follow_up
  status=deferred), NOT an in-scope open fix — the reviewer's verdict on every other clause
  remains entirely its own.
- The finalize Run-gaps sweep MUST carry this as a recorded gap: AC-B ≥50% deferred to Phase E of
  #725 per user decision (this file is the citation).
