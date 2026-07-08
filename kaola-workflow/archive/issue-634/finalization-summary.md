# Finalization Summary — issue-634 (metric-optimizer role)

## Outcome
Shipped the closed-library `metric-optimizer` role for optimize-shaped (direction-not-destination)
work. 8-node adaptive DAG; all nodes complete/n/a. Feature commit `3e510cf4`.

## Validation
- Four script-enforced adaptive barrier gates PASS: `--resume-check`, `--gate-verify`,
  `--barrier-check` (result:pass, no unattributed/out-of-allow/sensitive), `--verdict-check`.
- **Clean UNWAIVED four-chain receipt** (`#307`): claude/codex/gitlab/gitea all `exitCode:0`,
  `accepted_red:false`, `timed_out:false`, headSha `3e510cf4`. `--finalize-check` pass.
  (Serial mode avoided the concurrent-under-load test-run-chains timeout the intermediate nodes
  saw — #635's determinism fix holds; no #635 regression.)

## Goal
`goal: ship metric-optimizer role for optimize-shaped work` → goal_check satisfied.

## Run gaps
- **R4 — in_run_repair, RESOLVED same-run.** The change-gate adversary (n6) caught a real AC6
  defect: `checkEvidenceShape` had no `metric-optimizer` branch, so a metric-optimizer node could
  close COMPLETE on a hollow evidence stub. Repaired via `reopen-node n2-engine` (added the
  evidence-shape branch enforcing metric_baseline/metric_final/iterations_used/regression-green
  non-empty + RED test + regen editions); re-reviewed (n5) and independently re-verified (n6 re-run
  reproduced the original counterexample → now refused). Fixed and re-verified before ship — not
  deferred. noise: n/a (real defect, resolved in-run).
- **OPT freeze-rule hardening — filed: #639.** Reviewer/adversary advisory follow-ups (all
  non-shipping-blocking; the change-gate reproduction + evidence-shape backstop bound the impact to
  one wasted dispatch on a mis-authored plan): R1 metric_command-absence not refused at freeze;
  R2/R5 directory- and `../`-alias `metric_paths` defeat exact-string eval-isolation; R3/R7
  duplicate / fenced-decoy `optimize(<id>)` blocks silently last-win. R6 (numeric-form looseness)
  is documentation-only (cap binds on the converted value — no unbounded escape). All folded into
  **#639** (design-faithful: OPT-1..6 shipped exactly as enumerated in D3; these are additive rules).

## Closure decision
No unresolved conflicts or user-owned decisions deferred. The metric-optimizer extension is fully
authorized by the issue's D1–D7 design; the R4 fix and #639 follow-ups stayed within that design.
Ready to close #634.
