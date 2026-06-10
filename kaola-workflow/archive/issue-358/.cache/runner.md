# runner — tdd-guide evidence (issue #358)

## RED
`node scripts/test-parallel.js --self-test` BEFORE creation → Error: Cannot find module '.../scripts/test-parallel.js' (MODULE_NOT_FOUND), exit 1. RED confirmed.

## GREEN
Same command after implementation → 13/13 assertions pass, "test-parallel self-test passed", exit 0. GREEN confirmed.

## Self-test assertions (all PASS)
(a1) all four chain names present in results, input order; (a2) c1 passing stdout fully buffered despite c2 early exit-1; (a3) c3 stdout fully buffered; (b1-b4) per-chain summary lines PASS/FAIL correct via injected log; (c1) exitCode 1 when any chain failed; (c2) exitCode 0 when all pass; (d1-d3) per-chain buffer isolation exact; (e) TEST_PARALLEL='1' visible in child env (shim echoes env, buffered stdout === '1').

## Implementation contract met
scripts/test-parallel.js: spawn shell:false + npmCmd() platform switch; DEFAULT_CHAINS claude,codex,gitlab,gitea; runChain never rejects (error event → code 1); Promise.allSettled (no short-circuit); per-chain Buffer[] accumulation; TEST_PARALLEL='1' spread into every child env; deterministic summary + roll-up; TAIL_LINES=50 failing-tail blocks; main() sets process.exitCode, never throws; exports {runParallel, runChain, DEFAULT_CHAINS, TAIL_LINES, tail}; embedded --self-test mode (orchestrator ruling: no separate test file — barrier-lane constraint).

## package.json diff (single key)
+    "test:parallel": "node scripts/test-parallel.js"
"test" entry and all four chain entries byte-unchanged (verified via git diff).

## Sanity
node -e require('./scripts/test-parallel.js').DEFAULT_CHAINS names → claude,codex,gitlab,gitea. Real 4-chain run deliberately NOT executed at this node (review node records the four-chain gate per #307).
