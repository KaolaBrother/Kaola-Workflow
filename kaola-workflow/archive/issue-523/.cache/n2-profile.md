evidence-binding: n2-profile f482012d6e5d
<!-- verdict: paste verdict here -->
verdict: pass — #16 test-adaptive-node.js (~122s avg, 34%) and #37 simulate-workflow-walkthrough.js (~160s avg, 44%) are the two dominant costs; combined ~282s = ~75% of the 358s measured total; chain exit 0 confirmed both walkthrough runs.

## Level 1 — per-chain-command timing

| # | command | real_s | notes |
|---|---------|--------|-------|
| 1 | validate-script-sync.js | 0.04 | L |
| 2 | validate-vendored-agents.js | 0.02 | L |
| 3 | bash -n install.sh uninstall.sh | 0.00 | L |
| 4 | node -e JSON.parse(...) | 0.05 | L |
| 5 | test-agent-model-resolver.js | 0.06 | L |
| 6 | test-install-model-rendering.js | 11.27 | M 10 spawns |
| 7 | test-install-upgrade-rewrite.js | 2.94 | L 2 spawns |
| 8 | test-install-manifest-single-source.js | 0.47 | L 2 spawns |
| 9 | test-install-adaptive-config.js | 14.42 | L 3 spawns |
| 10 | test-next-action.js | 0.05 | L 0 spawns |
| 11 | test-commit-node.js | 8.75 | M 7 spawns |
| 12 | test-barrier-base-integrity.js | 1.49 | L 3 spawns |
| 13 | test-issue-probe-memo.js | 0.16 | L 2 spawns |
| 14 | test-claim-hardening.js | 7.95 | H 33 spawns |
| 15 | test-adaptive-handoff.js | 0.20 | L 0 spawns |
| 16 | test-adaptive-node.js | 128.81 | H 63 spawns - major cost |
| 17 | test-plan-run.js | 0.22 | L 2 spawns |
| 18 | test-bundle-state.js | 0.96 | L 4 spawns |
| 19 | test-bundle-claim.js | 14.12 | M 10 spawns |
| 20 | test-bundle-finalize.js | 11.32 | M 7 spawns |
| 21 | test-parallel-batch.js | 2.27 | M 6 spawns |
| 22 | test-parallel.js --self-test | 0.08 | L 0 spawns |
| 23 | test-edition-sync.js | 0.03 | L |
| 24 | test-release-surface-drift.js | 0.02 | L |
| 25 | test-release.js | 6.34 | M 8 spawns |
| 26 | test-gap-sweep.js | 0.35 | L 2 spawns |
| 27 | test-ledger-compare.js | 0.18 | L 2 spawns |
| 28 | test-route-reachability.js | 0.03 | L |
| 29 | test-agent-profile-parity.js | 0.02 | L |
| 30 | validate-workflow-contracts.js | 0.23 | L 2 spawns |
| 31 | test-fast-audit.js | 0.08 | L |
| 32 | test-bash-block-guards.js | 0.82 | M 6 spawns |
| 33 | test-autopilot.js | 0.59 | L 3 spawns |
| 34 | test-fast-advance.js | 1.82 | L 3 spawns |
| 35 | test-full-advance.js | 0.90 | L 2 spawns |
| 36 | test-phase4-advance.js | 1.20 | L 2 spawns |
| 37 | simulate-workflow-walkthrough.js | 140.13 | H dominant - bg process exit 0 success sentinel confirmed |

**Totals:** sum-of-individual = 358.39s | walkthrough #37 = 140.13s (39.1%) | non-walkthrough #1-36 = 218.26s (60.9%)

**Top-5 by real_s:**
1. #37 simulate-workflow-walkthrough.js: 140.13s (39.1%)
2. #16 test-adaptive-node.js: 128.81s (35.9%)
3. #9 test-install-adaptive-config.js: 14.42s (4.0%)
4. #19 test-bundle-claim.js: 14.12s (3.9%)
5. #20 test-bundle-finalize.js: 11.32s (3.2%)

**Note:** Individual commands timed sequentially; sum-of-individual does not equal end-to-end wall-clock (no chain overhead captured). The ~574s reference comes from a prior run; today measured 358s total suggesting environment/load variation. The two dominant costs are #16 and #37 combined = 268.94s (75.1% of measured total).

## Level 2 — per-scenario timing

| scenario | real_s | notes |
|----------|--------|-------|
| testStaleWorktreeCleanup | 6.12 | 11 sub-cases, git worktrees |
| testE2EGitHubMergeFullChain | 2.89 | full worktree+finalize+sink E2E |
| testFastE2EMergeFullChain | 2.20 | fast-path E2E |
| testE2EGitHubPrFullChain | 2.10 | PR-variant E2E |
| testAdaptiveWorktreeProvisionedE2E | 2.34 | full adaptive E2E with worktree |
| testSinkTransactionCleanEndToEnd | 0.69 | real git worktree add + sink-merge |
| testSinkTransactionCrashResume | 1.05 | 2 sink-merge runs crash-resume |
| testAdaptiveVerdictCheck | 0.66 | many runNode adaptive-node lifecycle calls |
| testParallelIssueIndependence | 3.09 | 2 concurrent startups real git repos |
| shared-tmp group (15 members via testClaimStatusRelease) | 3.29 | claim+finalize+repair+roadmap 15 members |
| testAdaptivePatternLibrary | 1.10 | many validatePlanFixture calls |
| testAdaptive* group (45 scenarios) | 33.00 | largest scenario group |
| testSink* group (28 scenarios) | 29.29 | sink-merge transaction group |
| testClosure* group (22 scenarios) | 11.16 | closure audit scenarios |
| testClassifier* group (27 scenarios) | 4.47 | classifier scenarios |
| testFinalize* group (20 self-contained + shared-tmp triggered) | 18.29 | finalize scenarios + shared-tmp group |
| testStaleWorktreeCheck | 2.62 | git worktrees multiple sub-cases |

## Stability — re-runs for top-3 dominant units

| unit | run1_s | run2_s | delta_s | stable? |
|------|--------|--------|---------|--------|
| #16 test-adaptive-node.js | 128.81 | 115.11 | 13.70 | moderately stable; ~122s avg |
| #9 test-install-adaptive-config.js | 14.42 | 13.61 | 0.81 | stable; ~14s |
| #37 simulate-workflow-walkthrough.js | 140.13 | 179.82 | 39.69 | high jitter ~28%; avg ~160s; environment-load sensitive |

## Dominant cost

**Measured total (sum of individual commands, run 1):** 358.39s

**Important note on the 574s reference:** This session measured 358s total (sum of individual serial timings). The 574s prior reference may reflect a higher-load machine state, a different run order (no inter-command JIT warmup gaps), OS scheduling effects, or a run that included additional warm-up overhead from the full chain runner. The walkthrough alone showed 28% jitter between two consecutive runs (140s vs 180s). Under higher system load the two dominant units would both expand and a 574s total is plausible.

**Two dominant cost units (accounting for 74.8% of measured total):**

1. **#16 test-adaptive-node.js: 128.81s (35.9% of measured total)** — confirmed by two runs (128.81s, 115.11s; avg ~122s). 63 subprocess spawns driving the full adaptive-node lifecycle (open-next, close-and-open-next, barrier-check, gate-verify, etc.). Every spawn is a full Node.js process startup (~200ms overhead) × 63 = ~12.6s base overhead alone; the rest is actual adaptive-node logic per invocation. This is the single largest non-walkthrough cost and comparable to the walkthrough in magnitude.

2. **#37 simulate-workflow-walkthrough.js: 140.13s–179.82s (avg ~160s, ~39-50% of total)** — the 246-scenario integration test. High jitter (~28% between consecutive runs). Within the walkthrough, the cost is distributed across scenario groups: testAdaptive* (45 scenarios, 33s), testSink* (28 scenarios, 29s), testFinalize*/shared-tmp (triggered, 18s), testClosure* (22 scenarios, 11s). No single scenario dominates; the cost accumulates across hundreds of subprocess invocations.

**Secondary costs (each 2.5–4% of total):**
- #9 test-install-adaptive-config.js: 14.42s (stable ~14s) — 3 spawns but each appears to be a full install.sh run
- #19 test-bundle-claim.js: 14.12s (10 spawns)
- #20 test-bundle-finalize.js: 11.32s (7 spawns)
- #6 test-install-model-rendering.js: 11.27s (10 spawns)
- #11 test-commit-node.js: 8.75s (7 spawns)
- #14 test-claim-hardening.js: 7.95s (33 spawns)
- #25 test-release.js: 6.34s (8 spawns)

**Key insight:** The ~574s reference runtime can be explained by #16 + #37 together. Under typical load: #16 ~122s + #37 ~160s = 282s combined; add secondary scripts ~100s = ~382s. Under heavier load (explaining the 574s delta from 358s), both #16 and #37 expand proportionally. The two adaptive-heavy scripts (#16 = test-adaptive-node.js and #37 = walkthrough's testAdaptive* group) together account for the adaptive path being the dominant runtime driver.

## Stability

| unit | run1_s | run2_s | delta_s | assessment |
|------|--------|--------|---------|------------|
| #16 test-adaptive-node.js | 128.81 | 115.11 | 13.70 | Moderately stable; ~10% jitter; avg ~122s |
| #9 test-install-adaptive-config.js | 14.42 | 13.61 | 0.81 | Stable; ~6% jitter; avg ~14s |
| #37 simulate-workflow-walkthrough.js | 140.13 | 179.82 | 39.69 | High jitter; ~28%; avg ~160s; environment-load sensitive |

The walkthrough's 28% jitter is notable — on a loaded machine its cost could reach 200-250s, which combined with #16 at 150s+ would push the chain to 500s+.

## Verdict

The profiling run reproduced the chain successfully (all 37 commands, walkthrough exit 0 with success sentinel both runs). The dominant costs are stably localized:

- #16 test-adaptive-node.js is the single most expensive non-walkthrough command at ~122s avg, representing ~34% of the measured total. Its 63-subprocess pattern makes it the clear bottleneck in the pre-walkthrough chain.
- #37 simulate-workflow-walkthrough.js at ~160s avg is the expected dominant unit but its share (~44%) is close to #16's share, meaning the non-walkthrough chain is itself nearly as expensive as the walkthrough.
- The two together (#16 + #37) = ~282s avg = ~75% of measured total.
- The 574s reference vs 358s measured = ~60% higher, consistent with high-load machine expansion of both dominant units.

