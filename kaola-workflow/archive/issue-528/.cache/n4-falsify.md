evidence-binding: n4-falsify 66cacf514ac5

verdict: fail
findings_blocking: 1

# n4-falsify — Adversarial verdict on Disposition A (issue #528)

INVESTIGATION adversarial-verifier (read-only repo; ran real Bash measurements under $TMPDIR; post-dominates NO code node → `--verdict-check` EXEMPT). Burden INVERTED: refute-if-uncertain. `verdict: fail` here = "Disposition A's affirmative ship-it claim is REFUTED" — analytical output routing #528 to fork B, NOT a finalize block.

**verdict: REFUTED. FORK SUPPORTED: B (docs-only D-528-01).** A's "ship concurrent run-chains.js" win-claim is NOT FINALIZABLE on the available 18-core evidence; under the inverted burden an un-settleable affirmative claim is refuted.

Host: 18-core (hw.ncpu=18, hw.physicalcpu=18), node v24.14.0, 128 GB, arm64. AC#3 / D-526-01 reopen cond #2 require a contended ≤4-core host for a VALID make-or-break number.

## Claim under test
n3 Disposition A: "on a contended ≤4-core host, bounded concurrent dispatch yields a median four-chain makespan win decisively exceeding 2× the serial stddev of the TOTAL four-chain duration, AND preserves (i) deterministic first-failure attribution + (ii) canonical receipt ordering." Surface = run-chains.js C1 cross-chain (four-chain `npm test` frame), four-edition #307.

## A-KILL-1 / A-KILL-2 (make-or-break makespan + contention knee) — the DECISIVE refutation
Synthetic chain-tree proxy ($TMPDIR/kw528-proxy/: each "chain" = a node process serially spawning INNER child trees of CPU-hash + git-like fs churn). 7 interleaved warm reps, rep1 discarded:
- **18-core, no contention:** serial median **1335ms** (stddev 14.4ms), N=2 **734ms**, N=4 **429ms**. N=4 win 906ms ≫ proxy 2σ bar 28.8ms → "clears" — BUT proxy stddev ~1% vs the REAL walkthrough's ~26% (D-523-01/D-526-01) → this is the FORBIDDEN non-transferable 18-core upper bound.
- **16 background spinners (attempted ≤4-core emulation):** N=4 still 510ms vs serial 1820ms → STILL wins. Empirically confirms n2: macOS background load does NOT reproduce a hard core cap (no taskset/cgroups/cpuset).
- **CPU-heavy oversub sweep (M concurrent / 18 cores):** at M/cores=4.0 (M=72), concurrent = 0.10× serial — NEVER inverts. The proxy's tree-serialized inner work degrades gracefully and CANNOT reproduce D-526-01 Exp2b inversion (N=36/18c → 2× slower). The ≤4-core inversion regime is UN-REPRODUCIBLE on this host with any synthetic proxy.
- **Realistic four-chain bar (26% per-chain jitter, independent-sum):** IDEAL win (∞ cores) clears the 2σ bar (light 460s vs 232s; heavy 860s vs 395s) — BUT only under "IF cores suffice." On ≤4 cores, four chains each already saturating the box cannot reach the max-of-chains floor; achievable win is bounded by ~Σ_work/4 and MAY NOT clear the 232–395s bar. That premise is EXACTLY what cannot be measured here.

→ The affirmative win cannot be established; the only directionally-valid result (18-core best case "wins") is the non-transferable upper bound the rule forbids as a finalizer.

## A-KILL-3 (attribution / canonical ordering) — REFUTED AS A BLOCKER (settles on any host)
5000 trials across all 24 completion orderings through the proposed `KNOWN_CHAINS.indexOf` re-sort: **0 mismatches** — deterministic canonical receipt order, deterministic firstFail (`gitlab`), deterministic failed-list and exit. Additionally all three real receipt consumers are SET-WISE (plan-validator.js:2552-2557 `filter`, release.js:258-262 `for-of`, gap-sweep.js:100-106 `filter`); none reads `chains[0]`, so the GATE is order-independent even WITHOUT the re-sort. Whole-chain granularity genuinely AVOIDS C3's Exp4 misattribution (4/5 reps). **This is NOT a reason to reject A** — C1 differs structurally from the refuted C3 here.

## A-KILL-4 (cross-chain race) — NO hazard OBSERVED
claude vs codex mkdtemp prefix sets (199 vs 44) are exact-string disjoint; gitlab/gitea are `kw-gl-`/`kw-gt-` namespaced; mkdtempSync adds an OS-random suffix. run-chains.js writes exactly ONE shared file (`outputPath` receipt) ONCE post-loop (:301) — not per-chain — so concurrency cannot clobber it; ZERO `~/.config` writes on the chain path. 5× runtime concurrent fs-race runs: 0 failures, 0 leaked tmp dirs. **Caveat (D-526-01:96-101): a clean proxy is NOT positive proof** of race-freedom in the real walkthroughs — it only fails to falsify n1 §6.

## A-KILL-5 (#307 propagation)
Not exercised (no build on fork B). Four-copy run-chains.js dispatch-loop-only change is the cheapest surface but unverified.

## Decision-bar arithmetic (honest)
Proxy serial stddev ~14.4ms (~1%) → 2σ bar ~28.8ms; proxy N=4 win ~906ms clears it BY 30× — but the ~1% stddev is an artifact of the deterministic proxy, NOT the real ~26% walkthrough jitter, so the margin does NOT transfer. Realistic four-chain 2σ bar ≈ 232s (light) / 395s (heavy); ideal-core win clears it, ≤4-core achievable win (~Σ_work/4) is UNMEASURABLE here. Every favorable number carries the 18-core upper-bound caveat.

## Verdict
**REFUTED (confidence: high).** A-KILL-3 and A-KILL-4 individually fail to break A (attribution clean, no race observed), but **A-KILL-1/A-KILL-2 — the make-or-break — cannot be settled affirmatively on this 18-core host**, and under the inverted burden an un-settleable affirmative win-claim is refuted, not "probably fine." The C1 four-chain frame is NOT futile the way single-chain C1 was (ideal win is a real ~460–860s and attribution is clean), but the win's EXISTENCE is gated on un-measurable ≤4-core contention behavior.

**FORK: B (docs-only D-528-01).** Default under inverted burden + host-validity gate.

**PRECISE FLIP-PREMISE (the ONLY thing that flips B→A) — record for n5:** a benchmark on a contended ≤4-core host (real CI runner / constrained cloud VM / physical box with cores disabled — NOT this 18-core machine) showing a median four-chain makespan win decisively exceeding 2× the serial-Σ jitter band (~232s light / ~395s heavy) WHILE reproducing deterministic ordered chain-level first-failure attribution (already structurally confirmed by A-KILL-3). Until that number exists, the null (serial) stands.

Scratch artifacts: throwaway under $TMPDIR/kw528-proxy/ (child.js, chain.js, driver.js, bench.sh, oversub.js, *_cpu.js, attribution.js, race_probe.js, spin.js); zero repo files touched.
