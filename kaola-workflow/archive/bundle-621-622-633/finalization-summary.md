# Finalization Summary — bundle-621-622-633

Closes: #621, #622, #633 (all-or-nothing bundle closure)

## Path

`workflow_path: adaptive`. 5-node DAG: n1-scheduler-fixes (tdd-guide, atomic one-file cross-edition
change — grammar-forced single implement node for a GENERATED_AGGREGATOR) → n2-review (code-reviewer,
reasoning, G1) → {n3-adversary (adversarial-verifier, reasoning), n4-docs (doc-updater)} → n5-finalize.

## In-run repair (R4) — the run's own adversarial gate caught a real regression

The FIRST n1 pass fixed #621/#622/#633 and passed code-review, but the `adversarial-verifier` (n3)
ran live reproductions and REFUTED it (`verdict: fail`, R4): the #622 read/live-write co-open
relaxation exposed a hole where a #596 speculative write could form its own `lane_group` descriptor
while another group was live, silently replacing it in running-set.json and orphaning the displaced
member's committed leg work (silent data loss — strictly worse than the loud #633 dead-end this bundle
fixes). n1 was reopened via `reopen-node`; a targeted `lane_group_live` exclusion landed; then n2-review
(2nd pass) and n3-adversary (2nd pass) BOTH re-ran against the fixed code and passed. n3's 2nd pass built
84 fresh assertions probing for sibling interleavings (non-speculative co-open, 3-member groups, two
concurrent groups, starvation, bypass) and found none — R4 confirmed completely closed at the sole
descriptor-formation choke point. This is the adaptive path's correctness net working as designed.

Note: `reopen-node`'s post-dominance algorithm did not auto-fold the AND-join gate n3-adversary
(diamond DAG: n5 depends on both n3 and n4, so an alternate n2→n4→n5 path made the traversal treat n3
as non-dominating); the orchestrator manually reset n3 to pending (drop-base + evidence purge + ledger
flip) to force its re-verification. Recorded below as a manual gap.

## Script-enforced gates (re-verified against the final committed tree, headSha 01082b6d)

- `--resume-check`: pass (`plan_hash` 0501e199…intact)
- `--gate-verify`: pass
- `--barrier-check`: pass (0 errors/sensitive/out-of-allow/unattributed)
- `--verdict-check`: pass (n2-review + n3-adversary both `verdict: pass`, findings_blocking 0)
- `--finalize-check` (chain-receipt): pass — codex chain green; claude/gitlab/gitea waived
  `--accept-known-red …:635` for the pre-existing `test-run-chains.js` load-flake (see Run gaps).

## Cross-edition (#307) evidence

Diff touches the edition trees (the codex twin + both forge ports of the generated aggregator).
`edition-sync.js --check` green (rename-normalized parity). The substantive four-chain content is
green: `test-adaptive-node.js` 1478 assertions (run directly by implementer + both reviewer passes +
adversary), `simulate-workflow-walkthrough.js` green, codex chain fully green end-to-end, gitlab/gitea
walkthroughs + contract validators green. The ONLY red is the orthogonal `test-run-chains.js` signal-
death sub-test (#635), which reproduces identically on unmodified source and has zero references to the
scheduler surface — so #307 CORRECTNESS holds; the waiver covers only the flaky sub-test.

## Run gaps

- in_run_repair (n1-scheduler-fixes): noise: the R4 regression was found by THIS run's own adversarial-verifier gate and fixed IN-RUN (the `lane_group_live` exclusion shipped in this bundle, re-reviewed + re-verified by 2nd passes of n2/n3); the reopen/re-run IS the resolution — no residual follow-up to file. Fully documented in CHANGELOG + docs/decisions/D-622-01.md.
- in_run_repair (n2-review): noise: re-run of the review gate against the R4-fixed code (2nd pass, verdict pass); part of the completed in-run repair loop above, not a deferred defect.
- in_run_repair (n3-adversary): noise: re-run of the adversarial gate against the R4-fixed code (2nd pass, verdict pass, 84 fresh assertions confirming R4 closed); part of the completed in-run repair loop, not a deferred defect.
- deferred_red_chain (claude:635): filed: #635
- deferred_red_chain (gitlab:635): filed: #635
- deferred_red_chain (gitea:635): filed: #635

Additional run-discovered items (not machine-swept classes, recorded for completeness):
- **R5 / #635** (FILED) — the `test-run-chains.js` signal-death load-flake; filed as #635 with roadmap stub.
- **reopen-node AND-join gate gap** — `reopen-node`'s single-path post-dominance check misses a gate on
  a diamond DAG (worked around manually this run, see In-run repair above). noise: pre-existing scheduler
  gap, low-severity, worked around with zero correctness loss (the manual reset exactly mirrors what
  reopen-node would have done for a correctly-detected gate); worth a follow-up but not blocking — captured
  in durable memory for a future hardening pass rather than filed as a standalone issue this run.
- **R6** (from n3-adversary 2nd pass) — noise: pre-existing, misuse-only hardening note (fused-advance has
  no live-running-set fence for NON-member closes; reachable only via orchestrator contract violation,
  self-protecting in the R4 shape, predates both #622 and this repair). Not a defect through normal
  operation; over-filing a misuse-only pre-existing note would be noise.

## Closure decision

No unresolved conflicts. The R4 regression is fixed + shipped, both gates re-passed, the flake is filed
(#635) and waived. Proceeding to close #621, #622, #633.

## Implementation commits

- `7674ebf6` — `fix(adaptive/scheduler): baseline-first openers, read/write co-open + merge fence,
  tracked lane-group evidence` (the 5 code/test files, authored by the main session — n1 ran as a serial
  write node, which never auto-commits; mirrors the issue-624 precedent).
- `01082b6d` — `docs: D-622-01 ADR + architecture/frontier-card/state-contract + CHANGELOG`.

## Goal attestation

`KAOLA_GOAL` reflects the standing session goal (finish all Kaola-Workflow issues via the adaptive
workflow, reviewer subagents on the fable model) — `goal_check: satisfied` expected on the closure receipt.
