evidence-binding: n4-adversary 7706bac8525d
verdict: pass
findings_blocking: 0
finding: id=A1 scope=pre_existing action=none status=deferred severity=low fix_role=none rationale=chains-array-containing-null-row-throws-TypeError-in-red-loop-crash-not-false-green-same-pre-fix-behavior-fail-closed-in-effect

## Claim Under Test

"#635's test-run-chains.js flake is GENUINELY fixed (load-insensitive/deterministic, not merely less flaky) AND #632's chainReceiptGreenness genuinely refuses empty/missing chains." bundle-632-635, base 3a4b4734, HEAD cfd7b0de. Surfaces: scripts/test-run-chains.js (T26/T27/T28 signal-death determinism + T26b real-subprocess sanity) and chainReceiptGreenness (release.js:249-276 + 3 edition ports).

## Attack 1 — #635 load-insensitivity (critical): FAILED TO BREAK IT

Load rig calibration: staged the PRE-FIX harness (git show 3a4b4734:scripts/test-run-chains.js, seam-free) into a scratch scripts/ copy. Under 80 CPU busy-loop workers (10-core host, 8x oversub), 6 concurrent pre-fix runs → 4/6 FAILED, all on T28 with the exact #635 signature {"timed_out":true,"signal":"SIGTERM"} where timed_out:false+signal:SIGKILL was pinned. ~67% per-run pre-fix failure rate — load calibrated, not nominal.

Post-fix hammer, SAME + heavier load — 22 runs, zero failures, identical count:
- baseline 1 unloaded → 146 assertions.
- Round A: 8 concurrent @ 80 workers → 8/8 exit 0.
- Round B: 6 concurrent @ 100 workers → 6/6 exit 0.
- Round C: 5 sequential @ 100 workers → 5/5 exit 0.
- Round D: 2 unloaded → 2/2 exit 0.
- Aggregate: `21 run-chains tests passed (146 assertions)` byte-identical across every logged run; zero ^FAIL lines. 19 of 22 under load that flakes pre-fix 4/6. 19 consecutive clean loaded runs by chance ≈ 6e-10. Zero SIGTERM-instead-of-SIGKILL, zero timed_out:true on seam-pinned rows. All stress workers killed per-round + EXIT trap; final pgrep 0.

Root cause: flake structurally gone. T26/T27/T28 no longer create a subprocess — the sentinel-intercepting spawnSync wrapper (test-run-chains.js:126-134) answers synchronously with canned {status:null, signal}; the spawn wrapper (:135-146) emits close(null,sig) on process.nextTick strictly before any setTimeout(timeoutMs) can be due — no OS race left under any load. Retained real-subprocess T26b (:874-891) asserts only exitCode CLASS (===1), guaranteed by the untouched #618 mapping for whichever signal wins — load-insensitive by construction (held in all 19 loaded runs). Scope guard held: git diff 3a4b4734 HEAD -- scripts/kaola-workflow-run-chains.js → 0 lines.

## Attack 2 — #632 greenness fail-closed: FAILED TO BREAK IT

Direct-function probe (19 adversarial shapes, real temp git repo): every zero-verified-chains shape refuses — {chains:[]}, missing key, chains:"green" (string), chains:{} (object), chains:null, chains:4 → all {green:false, reason:'chains_empty'}; HEAD-bound fresh receipt with chains:[] also refuses chains_empty (freshness can't launder emptiness). Precedence intact: no/corrupt → chains_unverified; stale+empty AND stale+missing → chains_stale (guard after HEAD-bound check, release.js:254-267); red → chains_red. No false-positive: all-green 1-chain + 4-chain → {green:true}; waived red stays green; legacy exit:0 field green. Junk rows closed: row with no exitCode → chains_red; exitCode:"0" string → chains_red (strict !==). Could not construct any input where zero verified chains reports green. Only oddity: chains:[null] throws TypeError in the red loop — a crash (non-zero exit), NOT a false green, identical pre-fix behavior (finding A1, non-blocking).

End-to-end --verify --json (real CLI): chains:[] → chain_greenness:{green:false,reason:'chains_empty'} + chain_warning:'chains_empty'; missing key + string chains → chains_empty; stale+empty → chains_stale; genuine green → green:true, result:'ok', NO chain_warning; red → chains_red warning. Pre-fix fail-open reproduced: 3a4b4734 chainReceiptGreenness over {chains:[]} and missing-key both returned {"green":true}. Guard present at :265-266 in all four editions.

## Could NOT find
No run (0/19 loaded, 0/22 total) where T26/T27/T28 saw SIGTERM-instead-of-SIGKILL or wrong timed_out. No assertion-count variance (21/21 byte-identical at 146). No receipt shape reading green with zero verified chains at function or CLI level. Repo untouched (only orchestrator's own .cache barrier/dispatch files untracked).

## Verdict
NOT-REFUTED (confidence: high) — #635 deterministically fixed (structural race removal, load-insensitive at a load level proven to flush the pre-fix flake); #632 genuinely fail-closed on every empty/missing shape with precedence preserved. verdict: pass
