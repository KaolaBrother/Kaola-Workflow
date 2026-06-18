evidence-binding: n3-assume bbecf0e1db29

# n3-assume — Candidate dispositions with falsification criteria (hypothesis framing)

Read-only planner. Inputs: n1-survey (surface), n2-method (methodology/numbers), D-526-01 (the C1 axis this run revisits). Job = FRAME falsifiable hypotheses; n4 attempts refutation. NOT a pre-decided verdict.

## 0. Why #528 is not already decided by D-526-01
D-526-01 refuted **C3** (walkthrough-INTERNAL) and labelled **C1** (cross-CHAIN) "SAFE but FUTILE" *for the single claude chain* (:146-149). #528 reopens C1 on a frame D-526-01 did NOT measure: the **four-chain `npm test` gate** (claude && codex && gitlab && gitea), serial cost Σ t_chain ≈ 25-28min, concurrent ideal ≈ max(t_chain) ≈ t_claude ≈ ~10min. Theoretical win ≈ 3× t_claude — huge — IFF the four chains don't contend on a constrained host. The C3-killers don't auto-carry:

| Axis | C3 (refuted) | C1 (#528) | Carries? |
|---|---|---|---|
| Granularity | intra-chain; first-failure misattributed 4/5 reps (Exp4) | whole-chain (4 coarse legs, own exit code) | must re-test — coarser may avoid Exp4 |
| Makespan model | single-chain Amdahl floor | Σ→max (3-chain shadow collapse) | must re-measure |
| Propagation #307 | six-copy walkthrough family | four-copy run-chains.js only | strictly cheaper |
| Oversubscription | N=36/18c → 2× slower | N≤4 chains but each a subprocess TREE | THE open question — 4 trees on ≤4 cores may already invert |

## Disposition A — SHIP concurrent run-chains.js (fork A / build)
Hypothesis n4 will try to refute: on a contended ≤4-core host, bounded concurrent dispatch yields a median four-chain makespan win decisively exceeding 2× the serial stddev of the TOTAL four-chain duration, AND preserves (i) deterministic first-failure attribution + (ii) canonical receipt ordering; whole-chain unit avoids Exp4.

### A.1 Build SHAPE (fresh frozen BUILD run, freeze-once):
1. `spawn` async + bounded N≤4 pool (Promise.race refill) replacing serial spawnSync loop (run-chains.js:252-287).
2. Per-child env copy `{...process.env}` (PATH preserved).
3. Per-child stdout/stderr buffers via `.on('data')` + Buffer.concat; stdio:'pipe', NEVER pipe→process.stdout (also enables AC#2 stderr preservation, discarded today).
4. Per-child manual setTimeout→kill('SIGTERM') + `timed_out` flag (spawn lacks timeout option), reuse resolveTimeoutMs (900s).
5. Canonical KNOWN_CHAINS re-sort of out-of-order results before receipt write (today's ordering is IMPLICIT in serial iteration → must become explicit); 6 per-chain fields survive; startedAt/completedAt become per-chain.
6. Serial preserved as safe default/fallback (flag/env-gated) — precedence #1.
7. Aggregate exit unchanged (collect all, exit 0 iff all non-waived pass — already parallel-safe).
8. Four-edition #307 propagation (root + codex byte-identical + gitlab/gitea rename-normalised); dispatch loop is the ONLY diff; validate-script-sync enforces parity.
9. test-run-chains.js coverage: out-of-order completion, canonical ordering, waiver-under-concurrency, per-chain timeout flag, per-child stderr no-interleave.
10. All four npm chains green (#307), sequential.

### A.2 Falsification — A is refuted (→B) if ANY ONE holds (precedence-ordered):
- **A-KILL-1 (decision bar):** on ≤4-core host, median four-chain concurrent win does NOT decisively exceed 2× stddev(Σ four-chain) — bar is STRUCTURAL not the literal 7.8s (that's the single-walkthrough analogue; the four-chain analogue is measured empirically). A win inside the ~24.5%/~28% jitter band = false speedup = flaky gate (the C3 Exp3b 4.45s=14.4% shape).
- **A-KILL-2 (oversubscription inversion):** on ≤4 cores the four subprocess TREES oversubscribe → concurrent makespan ≥ serial (Exp2b shape). n2 warns the 4-core knee is expected at N≈2 or even N=1 → 4 chain-trees may already be past the knee.
- **A-KILL-3 (attribution):** the C3-vs-C1 CRUX n4 must test. Prediction: whole-chain granularity AVOIDS Exp4 (each chain emits own exit code; receipt re-sorts to KNOWN_CHAINS). BUT if intended UX is "first failing chain in COMPLETION order," naive concurrency is non-deterministic. A refuted if the receipt can't present a deterministic canonical-ordered failure list OR any fail-fast surface is completion-order-dependent. (Aggregate exit is order-independent/safe; risk is purely presentation/ordering.)
- **A-KILL-4 (in-process race):** a real cross-chain shared-writable collision (shared $TMPDIR subdir name, shared receipt/lock, ~/.config write). n1 §6 CONFIRMED (a)(b)(c) safe by static analysis; C3's killers live INSIDE one walkthrough process and can't cross the OS-process boundary. But "clean proxy ≠ positive proof" (D-526-01:96-101) — falsifiable, not proven.
- **A-KILL-5 (propagation):** any of the four chains goes red and can't be made green (#307). Cheapest cost (four-copy), not expected to kill A, but disqualifying under precedence #1.

A survives ONLY if A-KILL-1..5 all refuted ON A VALID HOST.

## Disposition B — DOCUMENT not-worth-it (fork B / docs-only D-528-01) — the DEFAULT
Holds unless A clears its bar. Correct when: (1) win doesn't survive contention on ≤4-core (A-KILL-1/2 on a valid host); (2) a valid ≤4-core number CAN'T be produced here (only an 18-core upper bound + structural analysis exist → un-provable win → null stands under inverted burden); (3) attribution/ordering can't be preserved (A-KILL-3). Selective execution (`--chains`/`--only`, run-chains.js:208) stays the zero-risk lever. Inherits D-526-01's C1 "SAFE but FUTILE" on the broader four-chain frame; zero code blast radius, no #307 obligation on fork B.

### B.2 Flips back to A iff BOTH (D-526-01 reopen conds):
- **B-FLIP-1:** a benchmark on a contended ≤4-core host (real CI / constrained VM / cores-disabled — NOT 18-core) shows median four-chain win decisively > 2× the serial-Σ jitter band WHILE reproducing deterministic ordered first-failure attribution.
- **B-FLIP-2:** no real cross-chain race (A-KILL-4 cleared) AND four-edition change keeps all four chains green (A-KILL-5 cleared).
Until both hold, B is default — burden is on parallelism (precedence #1).

## C. HOST-VALIDITY criterion (decisive for THIS run)
Rule (AC#3 + D-526-01 reopen #2): a make-or-break number is ONLY valid on a contended ≤4-core host; an 18-core number is an upper bound that does NOT transfer. **This host is 18-core (hw.ncpu=18).** macOS has NO hard core-cap (no taskset/cgroups/cpuset; taskpolicy=QoS hint; cpulimit coarse + may not cap spawned trees; background load uncontrolled; ulimit only the shell; Docker=Linux VM).

- **n4 CAN establish:** (1) an upper-bound proxy — best-case N=2/N=4 vs serial; **if even this best case fails the bar → A refuted one-directionally (best-case fails ⇒ real-case fails), the valid direction**; (2) attribution/canonical-ordering STRUCTURAL test — settles A-KILL-3 either way on ANY host (where C1 can positively differ from C3's Exp4); (3) contention-direction knee probe (N=1/2/4 on 18 cores) as corroboration.
- **n4 CANNOT establish:** a transferable affirmative ≤4-core make-or-break number (the upper-bound trap).
- **Push toward B?** Largely yes by burden of proof: A's affirmative bar needs a valid ≤4-core number, unreachable here → default B. BUT n4's best-case proxy can refute A *harder* (best-case fails ⇒ B affirmatively), and the structural attribution test settles A-KILL-3. Honest converge statement (for n5): fork **B**, because (i) the affirmative ≤4-core win can't be validly produced here AND EITHER (ii-a) the 18-core upper-bound also fails 2×stddev(Σ)/inverts (strongest B) OR (ii-b) it appears to win but that's the non-transferable upper bound the rule forbids. **Flip-premise (n5 must record):** a real contended ≤4-core benchmark showing median four-chain win decisively > 2× serial-Σ jitter band while reproducing deterministic ordered chain-level attribution — out of reach on this host → a recordable follow-up condition, not an affirmative verdict this run can render.

## D. What n4 should MEASURE/ATTEMPT
1. **Best-case upper-bound makespan proxy** (A-KILL-1/2): bounded-concurrent N=2 & N=4 vs serial, medians ≥5 warm reps (discard rep1). Preferred = real four-chain spawn driver if budget permits (bound it, report partial if truncated); fallback = synthetic chain-tree proxy sized to inner fan-out to find the knee. Apply `> 2× stddev(Σ measured)`, not the assumed 7.8s.
2. **Attribution/canonical-ordering structural test** (A-KILL-3): inject reverse completion order, confirm KNOWN_CHAINS re-sort yields deterministic canonical receipt + deterministic first-failing-chain report independent of completion order. Establishable on ANY host — converts feared C3-inheritance into a settled fact.
3. **Cross-chain race-safety adversarial probe** (A-KILL-4): run four chains/proxies concurrently, attempt to FALSIFY n1 §6 (a) shared $TMPDIR subdir collision (b) shared writable file (c) ~/.config write. Report "no hazard OBSERVED" with the "clean proxy ≠ proof" caveat.
4. **Honest decision-bar arithmetic:** compute measured stddev(Σ) on this host, the `>2× stddev` bar for the actual total, win = serial_median − concurrent_median, with the 18-core upper-bound caveat stamped on every number.

## Summary
| Item | Claim | Refutation | Host-valid here? |
|---|---|---|---|
| A-KILL-1 | win > 2× stddev(Σ) | win inside jitter / below bar | affirmative needs ≤4c; refutation valid on 18c |
| A-KILL-2 | concurrent < serial on ≤4c | inversion at N≤4 | direction valid; absolute not transferable |
| A-KILL-3 | whole-chain attribution deterministic | completion-order-dependent report | YES — structural, any host |
| A-KILL-4 | no cross-chain race | real shared-writable collision | observable not provable |
| A-KILL-5 | four-edition #307 stays green | a chain red & unfixable | yes (build-time) |
| HOST-VALIDITY | a valid make-or-break number exists | 18-core only ⇒ no transferable ≤4c number | NO — this host is 18-core |

**Framing verdict (not the decision):** Fork A's affirmative win-claim is NOT finalizable on this 18-core host. n4 can refute A (best-case proxy fails the bar), settle A-KILL-3 structurally, observe-but-not-prove A-KILL-4. Default under inverted burden = fork B (docs-only D-528-01) unless n4's best-case clears the bar so decisively a ≤4-core follow-up confirmation is warranted — in which case n5 records the explicit flip-premise rather than shipping.
