evidence-binding: n2-method 9eaa57246095

# n2-method — Measurement methodology + Node bounded-concurrent-dispatch pattern

Read-only knowledge-lookup. Findings recorded parent-side (role has no Write tool). Grounded in repo decision records + authoritative Node docs.

## 1. Decision-record grounding (the concrete numbers)

### D-512-01 — timeout guard
- `resolveTimeoutMs(env)` → `KAOLA_RUN_CHAINS_TIMEOUT_MS` if finite&>0 else **900000ms (15min)** (run-chains.js:324-327). Prior hardcoded ceiling 600000ms (10min); false-kill margin was only ~26s at a measured ~574s chain. No upper clamp. Root-cause of ~574s deferred.

### D-523-01 — jitter + irreducible work
- Total chain ~358s that session; "~574s reference is the same structure under heavier load" (:40-43).
- **Walkthrough alone swung 140s→180s, ~28%, between two consecutive same-machine runs** (:43).
- #16 test-adaptive-node.js ~122s (~34%); #37 simulate-workflow-walkthrough.js ~160s (~44%); together ~75% of chain.
- H1 (spawn overhead) REFUTED (~0.02-0.05s/spawn). H2 (redundancy) REFUTED. H3 (irreducible coverage) CONFIRMED.
- Amendment (:105-112) filed #526 as the design track carrying the five hard constraints.

### D-526-01 — serial confirmed; decision bar; reopen conditions
- **Exp1 serial baseline (5 reps): 50.54/39.94/44.71/41.95/43.22s → median 43.22s, swing 24.5%, stddev ≈ 3.9s** (:72-73).
- **Decisive bar: > 2× stddev ≈ > 7.8s** — "load-invariant structural fact, not an absolute second-count; corroborates D-523-01's ~28% jitter" (:74-75).
- Exp3b warm interleaved win: **4.45s = 14.4% — INSIDE the jitter band, FAILS the >7.8s bar** (:85-88).
- **Oversubscription inversion Exp2b (N=36, 18 cores): makespan ~85s ≈ 2× slower than serial 43s** (:81-83). A 4-core target reaches this regime at N≈12 (3× oversubscription).
- **All experiments on an 18-core host, node v24 — every win is an upper bound that does NOT transfer to ≤4-core** (:67-70).
- Exp4 attribution failure: first-failure reported the WRONG unit 4/5 reps under concurrency (:90-94).
- **C1 cross-chain disposition: "SAFE but FUTILE. Floor = max(t_chain) = unchanged ~574s claude chain; collapsing codex/gitlab/gitea into claude's shadow gains nothing on the bottleneck"** (:146-149).
- **Reopen condition (:164-177) — BOTH must hold:** (1) indivisible walkthrough units grow materially OR a hermetic per-worker isolation primitive lands; (2) a benchmark on a contended host (≤4 cores — real CI or laptop, NOT 18-core) shows a median makespan win decisively exceeding 2× the serial jitter band WHILE reproducing deterministic ordered first-failure attribution.

## 2. Makespan measurement methodology

- **Medians over ≥5 reps, not single runs/means** — robust to the high-jitter tail (a single 50.54s outlier in a 39-44s set). Min 5 reps (D-526-01 standard), 7-10 preferred.
- **Warmup:** discard rep 1 (cold FS cache / V8 JIT / cold disk). Run one untimed warm pass, then time. D-526-01's "fair interleaved warm (5 pairs)" is the right shape.
- **Contention knee — measure N=1, N=2, N=4.** Each chain is a SUBPROCESS TREE (node→npm→walkthrough→git/finalize/sink→adaptive-node→validator). On 4 cores, 4 concurrent trees saturate cores AND their inner children compete. Knee on 18-core was N≈12; on 4-core expected at N≈2 or even N=1 due to inner fan-out.
- **Decision bar for C1:** baseline becomes total serial four-chain duration (~1500-1680s). Same formula — median concurrent win must decisively exceed 2× the serial stddev of the TOTAL four-chain duration (measure empirically). The ~25-28min→~10min claim is a THEORETICAL UPPER BOUND only.
- **max-of-chains vs sum-of-chains:** serial ≈ Σ t_chain; concurrent ideal ≈ max(t_chain) ≈ t_claude ≈ 574s. The floor is the claude chain — C1 can only collapse the OTHER three into claude's shadow, and only if cores suffice to not slow claude.

### HOST-VALIDITY rule (the make-or-break)
AC#3 / D-526-01 reopen cond #2 require a contended ≤4-core host. 18-core = upper bound, does not transfer. **macOS proxy options are ALL weaker than a real ≤4-core box:**
- macOS has **NO `taskset` (no CPU affinity), NO cgroups, NO cpuset sysfs.**
- `taskpolicy -c background` = QoS hint (pushes to E-cores on Apple Silicon), NOT a hard core cap; OS may still use P-cores under load.
- `cpulimit -l` = SIGSTOP/SIGCONT at ~10Hz; coarse, adds latency artifacts, doesn't reproduce cache/mem-bandwidth pressure, may not cap spawned children.
- Artificial background load (`yes`×N) = uncontrolled, unsynchronized with measurement windows.
- `ulimit -t` = only the measuring shell, not child subprocesses.
- Docker on macOS = runs in a Linux VM; macOS-native perf characteristics don't apply.
- **Honest conclusion:** the only VALID make-or-break number comes from a real ≤4-core host (CI runner, constrained cloud VM, or physical machine with cores disabled). This authoring/measuring host is 18-core.

## 3. Node.js bounded-concurrent-dispatch pattern (for a possible build)

- Replace the `spawnSync` `for...of` serial loop with `spawn` (async) + a bounded N≤4 worker pool draining a queue (`Promise.race(active)` refill idiom).
- **CRITICAL `spawn` timeout:** `spawn()` gained a `timeout` option only in Node v15.1.0 (PR #37256). Even on v24 it's advisable to use a MANUAL `setTimeout`→`child.kill('SIGTERM')` + a `timedOut` flag because (a) Issue #51561: the timeout-kill `close` event `(code:null, signal:'SIGTERM')` is indistinguishable from an external SIGTERM — no `timedOut` property exists; (b) Issue #43704: a spawn timeout-hang class bug. Manual flag gives a deterministic `timed_out` receipt field and version-independence. Reuse `resolveTimeoutMs` (900s) unchanged.
- **Per-child buffering, no interleave:** each child its own `stdoutBufs`/`stderrBufs` arrays via `child.stdout.on('data',...)`; `Buffer.concat(...)` after `close`. NEVER `child.stdout.pipe(process.stdout)` under concurrency. Requires `stdio:'pipe'` (not 'inherit').
- **Per-child env copy:** `env: { ...process.env }` (shallow copy at spawn-time); keep PATH for npm lookup.
- **Canonical re-sort:** results fill a `Map<name,res>` in completion order; `chains.map(name => results.get(name))` re-sorts to KNOWN_CHAINS order before writing the receipt. exitCode from `close` event `code` (null→killed); timed-out → exitCode 1 + `timed_out:true`. Aggregate exit 0 iff all non-waived pass — collect ALL results before computing (no `&&` short-circuit; receipt model already decouples this).

## 4. Summary table for n3-assume

| Parameter | Value | Source |
|---|---|---|
| Serial stddev (walkthrough, warm) | ~3.9s | D-526-01:73 |
| Serial swing | 24.5% | D-526-01:73 |
| **Decision bar** | **> 7.8s (> 2× stddev)** | D-526-01:74 |
| Jitter corroboration | ~28% | D-523-01:43 |
| Timeout default | 900000ms | D-512-01 / run-chains.js:326 |
| Host in experiments | 18-core, node v24 | D-526-01:68 |
| Oversub inversion | N=36/18c → ~85s ≈ 2× slower than serial 43s | D-526-01:81-83 |
| C1 verdict | "SAFE but FUTILE" (floor = claude chain) | D-526-01:146-149 |
| spawn() timeout | added v15.1.0; manual flag still advised (#51561, #43704) | nodejs/node |
| Reopen cond | both: unit-growth/hermetic-isolation AND ≤4-core median win >2× stddev + attribution preserved | D-526-01:164-177 |

## Sources
- Node.js child_process docs (v26.x); nodejs/node PR #37256 (spawn timeout, v15.1.0), Issue #43704 (timeout-hang), Issue #51561 (SIGTERM ambiguity); ss64 taskpolicy ref; alexdelorenzo "no taskset on macOS".
