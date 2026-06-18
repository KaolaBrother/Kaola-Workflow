evidence-binding: n3-falsify 9f41ccb1dfc5
<!-- verdict: investigation adversarial-verifier on the deliverable-soundness axis (#509). The INVESTIGATION is sound and survives → pass. What is REFUTED is the C3 parallelism hypothesis (the finding), not the deliverable. No blocking finding routes to repair. -->
verdict: pass
findings_blocking: 0

# n3-falsify — falsification of the leading parallelism candidate (real experiments)

**Falsification result: C3 (build an N-worker parallel walkthrough runner) is REFUTED as worthwhile.**
**Recommended converged answer: C4 — serial is the right permanent posture.**

## Host caveat (measurement integrity)
18 cores, no hyperfine, node v24, `date +%s.%N` timers, medians over multiple reps. 18 cores is FAR more headroom than a 4-core CI/laptop → every makespan win below is an UPPER BOUND that does NOT transfer to a contended host.

## Subset (faithful C3 proxy = process-per-scenario via `--only <name>`)
12 heavy self-contained scenarios doing real git/worktree/merge/sink/finalize/adaptive work: testE2EGitHubMergeFullChain, testE2EGitHubPrFullChain, testFastE2EMergeFullChain, testKeepOpenMergeFullChain, testSinkTransactionCleanEndToEnd, testSinkMergeReRebasesOnFfRace, testSinkMergeFromLinkedWorktree, testFinalizeReleaseCleansWorktree, testFinalizeFromLinkedWorktreeCleansMainCopy, testAdaptiveWorktreeProvisionedE2E, testAdaptivePerInstanceBarrier(+Hardening), testWorktreeNativeDiscardRestoresBase. Each allocates its own mkdtempSync root (main() :13047).

## Experimental log
- **Exp1 — Serial baseline + jitter (5 reps):** 50.54 / 39.94 / 44.71 / 41.95 / 43.22s → median **43.22s, 24.5% swing, stddev ≈3.9s**. Confirms D-523's ~28% jitter locally. Win bar = > 2× stddev ≈ **7.8s**.
- **Exp2 — RACE TEST, N=12 concurrent (18 reps):** **18/18 failures=0**, 216/216 invocations hit the pass sentinel, **0 non-empty stderr, 0 race signatures** (no `cannot lock ref` / `*.lock` / `fatal:` / `EEXIST` / `index.lock` / `packed-refs`).
- **Exp2b — OVERSUBSCRIBED, N=36 on 18 cores (8 reps):** 8/8 failures=0, 288/288 sentinel, 0 stderr, 0 race signatures — BUT makespan ~85s ≈ **2× SLOWER** than serial 43s. Contention inverts the win once concurrency exceeds natural parallelism.
- **Exp3b — FAIR INTERLEAVED warm (5 alternating pairs):** serial median **30.87s** vs concurrent median **26.42s** → win **4.45s = 14.4%, INSIDE the jitter band** (fails the >7.8s bar). Concurrent floor is Amdahl-bounded by the slowest single unit (testAdaptivePerInstanceBarrier ~10.3s) + contention, NOT serial_sum/N.
- **Exp4 — ATTRIBUTION (declared order [HEAVY-PASS, BADTOK-A@pos1 fails, BADTOK-B@pos2 fails], 5 reps):** serial fail-fast reports pos1; naive concurrent "first-to-COMPLETE failure" reported the WRONG unit (BADTOK-B) in **4/5 reps**, right one 1/5 → **non-deterministic mis-attribution**. Restoring deterministic ordered first-failure needs buffered per-unit output + earliest-declared-failure selection + cancel-in-flight = real design cost.

## Constraint findings
- **#2 shared-tmp serial:** confirmed structurally — runSharedTmpGroup (simulate-workflow-walkthrough.js:12712-12728) runs all 15 members in fixed order vs one tmp; guard-throw fn :12758. One indivisible serial lane = a hard ~18s makespan floor no parallelism can shrink.
- **#5 propagation:** C3 touches the 6-copy walkthrough family (claude root + claude plugin + gitlab + gitlab-codex + gitea + gitea-codex) and must keep all 4 npm chains green — largest blast radius. C1 touches only the 4-copy run-chains.js.

## Proxy honesty / limits
The proxy surfaced NO race across 18(N=12)+8(N=36) reps — but it confirms only that process-per-scenario FS isolation holds (already structurally evident). It does NOT exercise the in-process hazards n2 flagged (module-top KAOLA_ENABLE_ADAPTIVE, testHarnessSelfCheck env mutate/restore) nor a true shared-dispatcher → NOT positive proof of a real dispatcher's safety.

## C3 verdict reasoning
C3 must PROVE BOTH (a) race-safety AND (b) a decisive makespan win surviving a contended host. (a) is only weakly supported by the proxy; (b) is REFUTED — best-case win is sub-jitter, inverts under oversubscription, a 4-core target (N=12 = 3× oversubscription) collapses it. Plus attribution loss against the largest propagation surface. → REFUTED.

## C1 consolation
C1 (4 chains concurrent) is cheap/safe but its makespan floor = max(t_chain) = the UNCHANGED claude chain (~574s, 37 commands); it collapses codex(3)/gitlab(5)/gitea(5) into claude's shadow and does NOT shrink the dominant claude chain. A narrow `npm test`-aggregate win only — not the bottleneck. Not worth the run-chains.js complexity + 4-copy propagation for a non-bottleneck win.

## Converge guidance for n4
Under precedence #1 and the inverted burden: cannot prove BOTH race-safety AND a decisive contended-host win for any bottleneck-touching candidate → converge on **C4 (serial is the right permanent posture)**, documented in D-526-01 continuing the D-523 series. Operational guard stays KAOLA_RUN_CHAINS_TIMEOUT_MS (D-512-01, 900s).
