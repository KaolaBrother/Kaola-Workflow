evidence-binding: n4-converge 9e4603f3857f

# n4-converge — Converged answer for issue #526 + D-526-01 content blueprint

## 1. Converged verdict
**Serial is the right permanent posture (C4).** On an 18-core host (more headroom than any 4-core CI/laptop → every measured win is an UPPER BOUND), no parallelism candidate that touches the bottleneck proved BOTH (a) race-safety AND (b) a decisive contended-host makespan win. Leading candidate C3 (walkthrough-internal N-worker dispatcher) gave a best-case warm win of only **4.45s = 14.4%**, INSIDE the ~24.5% serial jitter band and below the **>7.8s (>2× stddev) bar**; it **inverted to ~2× slower** at N=36/18 cores (a 4-core target enters this 3× oversubscription regime at N=12); naive concurrency **lost deterministic first-failure attribution** (mis-attributed 4/5 reps); largest **6-copy** propagation surface. Under precedence #1 (a flaky gate is the most expensive outcome) and the inverted burden, the null hypothesis stands. The ~574s claude chain is the price of the non-negotiable internal correctness gates. **Answer is C4 (not "build it") → NO follow-on build run, NO Case-B re-plan; the run terminates with D-526-01.**

## 2. Per-candidate disposition
- **C1 cross-chain:** SAFE but FUTILE — floor = max(t_chain) = unchanged ~574s claude chain; only collapses codex(3)/gitlab(5)/gitea(5) into claude's shadow. Non-bottleneck win not worth run-chains.js complexity + 4-copy propagation. NOT pursued.
- **C2 intra-claude:** REFUTED by inheritance — floor still governed by the indivisible walkthrough; C3 (stronger sub-case that actually attacks the walkthrough) refuted → C2 fails a fortiori.
- **C2′ constrained:** REFUTED as immaterial — validator tail hides under test-adaptive-node ~122s; floor ≈282s, ~75% still serial; saving inside jitter band → corroborates C4.
- **C3 walkthrough-internal [LEADING]:** REFUTED as worthwhile — warm win 4.45s=14.4% sub-jitter (Exp3b); ~2× slower at N=36 (Exp2b); attribution mis-attributed 4/5 (Exp4); race proxy clean (18×N=12+8×N=36, 0 signatures) but only proves FS isolation, NOT a real dispatcher's in-process safety. Cannot prove (a)∧(b) → REFUTED.
- **C4 serial [CHOSEN]:** CONFIRMED — the default none overturned. Zero code/race/complexity/propagation. Guard stays KAOLA_RUN_CHAINS_TIMEOUT_MS (D-512-01, 900s).

## 3. Five-constraint accounting (C3)
1. **Race-safety:** weakly supported only — proxy clean (216/216 + 288/288 sentinel, 0 race signatures) but proves only process-per-scenario FS isolation (already structurally evident); does NOT exercise in-process hazards (module-top KAOLA_ENABLE_ADAPTIVE=0; testHarnessSelfCheck env mutate/restore) nor a real shared dispatcher → NOT positive proof.
2. **Shared-tmp serial:** CONFIRMED hard floor — runSharedTmpGroup (:12712-12728) 15 members fixed-order vs one tmp; guard-throw :12758. ~18s indivisible lane.
3. **First-failure attribution:** FAILED — fail-fast serial reports pos1; naive concurrent "first-to-COMPLETE" reported WRONG unit 4/5. Deterministic ordering needs buffered per-unit output + earliest-declared-failure + cancel-in-flight = unbuilt design cost.
4. **Measurement integrity:** held as method, and is what sank the win — serial median 43.22s, 24.5% swing, stddev ≈3.9s → bar >7.8s; warm win 4.45s < bar, inside noise; 18-core caveat = upper bound.
5. **#307 propagation:** WORST — 6-copy walkthrough family (claude root + claude plugin + gitlab + gitlab-codex + gitea + gitea-codex), all 4 chains must stay green. C1 touches only 4-copy run-chains.js.
Net: only #2 (and #4 as method) cleanly held; #1 unproven, #3 failed, #5 maximally costly.

## 4. D-526-01 content blueprint (for n5 doc-updater → docs/decisions/D-526-01.md)
Continue the D-523 series; match D-523-01 structure/headings/voice; docs-only (no code-blast-radius / #307 obligation).

- **Title:** `# D-526-01. Race-safe test-suite parallelism is not worth it — serial is the right permanent posture`
- **Date:** 2026-06-18
- **Status:** Accepted
- **Issue:** #526
- **Related:** #523/D-523-01 (track this resolves + the 5 hard constraints), #512/D-512-01 (900s KAOLA_RUN_CHAINS_TIMEOUT_MS guard — remains correct), #307 (4-chain parity = the propagation surface), #463 (closed; per-leg write isolation in the adaptive RUN path — NOT test-suite validation parallelism), #501 (self-sufficient/internal-gate context), #486 (Case-B read-only shaping pattern this run instantiates).
- **Context:** D-523-01 closed #523 ("genuine suite growth — no safe behavior-preserving reduction") and deferred the one remaining lever (race-safe parallelism) to a dedicated track, filed post-closure as #526 carrying the five hard constraints as its acceptance gate. This record resolves it. Run as a #486 Case-B read-only shaping investigation: probe→assume→adversarially falsify→converge. Unlike #523 (analysis-only refutations), this run executed REAL timed experiments. Chain shape: claude = 37 `&&`-chained cmds ending in simulate-workflow-walkthrough.js; 2 dominant units (test-adaptive-node ~122s, walkthrough ~160s) ≈ 75% of wall-clock.
- **Question:** is there a race-safe/coverage-preserving/attribution-preserving way to cut makespan via parallelism, worth the risk — or is serial the right permanent posture? Per precedence #1 the burden is on parallelism: win only if all five constraints hold AND median win > 2× serial stddev; else C4.
- **Decision:** Serial is the right permanent posture (C4). No code change ships. Per-candidate dispositions as §2. A false ~4.45s "speedup" inside ~24.5% jitter is a flaky gate, not a win.
- **Evidence/Measurements (MUST include; lead with host caveat):**
  - Host caveat: 18 cores, node v24, `date +%s.%N`, medians, no hyperfine → every win is an upper bound that does NOT transfer to a 4-core host.
  - Serial baseline (Exp1, 5 reps): 50.54/39.94/44.71/41.95/43.22s → median **43.22s, 24.5% swing, stddev ≈3.9s**; bar >2× stddev ≈ **7.8s** (confirms D-523 ~28% jitter).
  - Race N=12 (Exp2, 18 reps): 18/18 failures=0, 216/216 sentinel, 0 stderr, 0 race signatures.
  - Oversubscribed N=36/18 cores (Exp2b, 8 reps): 8/8 clean, 288/288 sentinel — but makespan ~85s ≈ **2× slower** than serial 43s (4-core target hits this at N=12 = 3× oversubscription).
  - Fair interleaved warm (Exp3b, 5 pairs): serial median 30.87s vs concurrent 26.42s → win **4.45s = 14.4% INSIDE jitter band**, fails >7.8s bar; concurrent floor Amdahl-bounded by slowest single unit (~10.3s)+contention, not serial_sum/N.
  - Attribution (Exp4, order [PASS, fail@pos1, fail@pos2], 5 reps): serial reports pos1; concurrent "first-to-complete" reported WRONG unit **4/5**.
  - Proxy honesty: clean proxy proves only process-per-scenario FS isolation; not positive proof of a real dispatcher's in-process safety.
- **Constraint analysis:** reproduce §3 numbered five-constraint accounting, D-523-01:86-92 numbered style.
- **Consequences:** no code change ships (docs-only, zero code blast radius, no #307 obligation); KAOLA_RUN_CHAINS_TIMEOUT_MS (D-512-01, 900s) remains the correct operational guard, NOT replaced by parallelism; the D-523-01→#526 track is now closed (spawn-reduction, fixture-sharing, AND race-safe parallelism all settled — future "speed up the suite" readers start at D-523-01, end here); no follow-on build run / Case-B re-plan.
- **Alternatives considered:** the C1/C2/C2′/C3/C4 list from §2, one line each with decisive datum.
- **Reopen condition (explicit, falsifiable):** revisit ONLY if BOTH — (1) the walkthrough's indivisible units grow materially (shared-tmp lane or longest scenario expands enough that the serial floor dominates) OR a hermetic per-worker isolation primitive lands that PROVABLY eliminates the in-process hazards the proxy could not exercise; AND (2) a benchmark ON A CONTENDED HOST (≤4 cores, real CI/laptop — not an 18-core dev box) shows a median makespan win DECISIVELY exceeding 2× the serial jitter band WHILE reproducing deterministic ordered first-failure attribution. Absent both, serial stands.

## 5. Reopen condition (summary)
Revisit only when a contended-host (≤4-core) benchmark shows a decisive win beyond 2× the jitter band AND attribution is provably deterministic, AND either the indivisible serial units have grown materially or a hermetic per-worker isolation primitive provably eliminates the in-process hazards. Until then serial is correct; KAOLA_RUN_CHAINS_TIMEOUT_MS (D-512-01, 900s) is the guard.

**Converged answer: C4 — serial is the right permanent posture. No build run follows; the run terminates with D-526-01.**
