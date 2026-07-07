evidence-binding: n2-runchains-flake 574630135295

## Task

Fix #635 — `scripts/test-run-chains.js`'s T26/T27/T28 signal-death assertions were load-sensitive
flakes: they wrote a self-SIGKILL mock (`makeSelfKillScript`) and raced a real
`process.kill(pid, 'SIGKILL')` against the runner's own per-chain timer (a real `setTimeout` /
`spawnSync` `timeout`). Under system load, the mock's own scheduling is nondeterministic, so it can
lose that race to the runner's own SIGTERM/timeout, flipping which subset of the
`signal==='SIGKILL'` / `timed_out===false` assertions fails on each run. The runner's own
signal->exitCode mapping (`kaola-workflow-run-chains.js`, the #618 fix) is correct and was NOT
touched — only the TEST HARNESS's ability to reliably deliver its own signal deterministically.

non_tdd_reason: test-harness reliability fix — the deliverable IS the test file (scripts/test-run-chains.js); there is no separate behavioral unit-under-test to write a RED test against. Correctness is proven by repeated load-insensitive passes of the test file itself, not by a new failing unit test.
verification_tier: smoke-integration

## Fix (direction 1 — deterministic seam, preferred per the plan)

Added a deterministic in-process "signal-death seam" entirely inside `scripts/test-run-chains.js`
(the ONE declared write set file; `kaola-workflow-run-chains.js` is untouched):

- `run-chains.js` destructures `spawnSync`/`spawn` ONCE, at require time, from the single
  process-wide cached `child_process` module. `test-run-chains.js` now replaces `child_process`'s
  own exported `spawnSync`/`spawn` with wrappers BEFORE the first `require('./kaola-workflow-run-chains.js')`
  in the file, so run-chains.js's internal bindings resolve to those wrappers for the rest of this
  process's lifetime.
- The wrappers intercept ONLY a single reserved SENTINEL command
  (`__kaola_test_signal_death__:<signal>`) and answer it with a canned signal-death result —
  synchronously for `spawnSync` (`status: null, signal: <name>`, no subprocess spawned at all), and
  on the very next `process.nextTick` for `spawn` (emits `close(null, <signal>)` strictly before the
  runner's own `setTimeout(timeoutMs)` can possibly be "due", since that requires `timeoutMs` of
  real wall-clock time to elapse first). Every OTHER command (git, the real exit/sleep/hang mocks
  used elsewhere in the file, etc.) passes straight through to the REAL `spawnSync`/`spawn`,
  unaffected.
- T1-T25/T29 are entirely unaffected: they invoke run-chains.js as a SEPARATE OS subprocess via the
  file's pre-existing `run()` helper (which closed over the ORIGINAL `spawnSync` before this patch
  installs) — a fresh Node process has its own unpatched `child_process` module.
- T26/T27/T28 now call run-chains.js's exported, Promise-returning `main()` directly IN-PROCESS via
  a new `runInProcess()` helper (saves/restores `process.cwd()`/`process.env` around the call) so
  the patched `spawnSync`/`spawn` are actually exercised, and assert the EXACT signal name /
  `timed_out` value deterministically (no real OS race left to lose).
- Kept ONE real end-to-end self-kill subprocess case (new `T26b`, reusing the pre-existing
  `makeSelfKillScript`) as a lightweight integration sanity check that the seam isn't
  symptom-masking a broken real-world path. Its assertion is CLASS-only (`exitCode === 1`, not the
  exact signal name) — the #618 fix guarantees ANY signal death (whichever signal wins the race)
  maps to `exitCode 1`, so this check is load-insensitive by construction.
- Because `main()` is async, T26 onward now run inside a single async IIFE at the bottom of the
  file (T1-T25 stay synchronous, unchanged); the "Final result" summary block moved inside the IIFE
  so it only prints after all async work (including the moved T29) completes.

Write set: exactly `scripts/test-run-chains.js` (no other file touched — verified via `git status`
below). `kaola-workflow-run-chains.js`'s own signal->exitCode mapping (`:208`/`:296`) was NOT
edited (verified: `git diff` touches only `test-run-chains.js`).

## BEFORE: flake reproduction (pre-fix, on `git show HEAD:scripts/test-run-chains.js`)

Copied the pre-fix file to a scratch copy in the SAME `scripts/` directory (so its relative
`require`s resolve), spawned 80 CPU-bound busy-loop processes to induce system load, then ran 6
copies of the pre-fix test file CONCURRENTLY under that load (mirroring what an
adversarial-verifier "hammer under load" run does):

```
for i in $(seq 1 80); do node -e "let x=0; while(true){ x+=Math.sqrt(x+1); }" & done
sleep 1
for run in 1 2 3 4 5 6; do
  node scripts/test-run-chains-ORIGINAL-copy.js > orig-par-$run.log 2>&1 &
done
# wait on each, collect exit codes
```

Result: **4 of 6 concurrent runs FAILED** (exit code 1), all on the SAME T28 assertion (the runner's
own 600ms per-chain timer won the race against the mock's self-SIGKILL under load):

```
FAIL: T28: the EXTERNALLY signal-killed chain records timed_out: false + signal: SIGKILL — distinct
from a timeout; got {"name":"codex","exitCode":1,"command":"npm run test:kaola-workflow:codex",
"duration_ms":702,"accepted_red":false,"accepted_red_issue":null,"attempts":1,
"retried_transient":false,"timed_out":true,"signal":"SIGTERM"}
run-chains tests FAILED (1 failures, 142 passed)
```//and 2 more logs identical in shape (duration_ms 655, 611, 699 — all timed_out:true/SIGTERM
instead of the intended timed_out:false/SIGKILL), 2 of 6 runs passed cleanly (143 assertions).
This confirms the exact root cause: under contention, the self-kill mock's own node-process startup
was slow enough that the runner's own 600ms timer fired first and delivered SIGTERM before the
mock's self-issued SIGKILL took effect — a genuine, reproducible, load-triggered flake on the
pre-fix file.

The scratch pre-fix copy (`scripts/test-run-chains-ORIGINAL-copy.js`) was deleted immediately after
this reproduction; `git status --short scripts/` shows only `scripts/test-run-chains.js` modified.

## AFTER: load-insensitive repeated-pass proof (post-fix)

Ran the FIXED file repeatedly, including under the SAME (and heavier) induced-load conditions that
reproduced the flake above:

1. Single run, no induced load: `node scripts/test-run-chains.js` → exit 0, `run-chains tests
   passed (146 assertions)`.
2. **8 concurrent runs under 80 induced CPU-bound stress workers** (identical load recipe to the
   BEFORE reproduction, widened from 6 to 8 concurrent copies): **8/8 exit 0**, all logs report
   `run-chains tests passed (146 assertions)` — zero failures, where the pre-fix file failed 4/6
   under the lighter (6-copy) version of this same load.
3. **10 sequential runs, no induced load** (baseline repeatability): **10/10 exit 0**, all report
   `146 assertions`.
4. **6 concurrent runs under 100 induced CPU-bound stress workers** (heaviest round): **6/6 exit
   0**, all report `146 assertions`.

Total: **25 runs verified GREEN with ZERO failures**, every single one reporting the IDENTICAL
`146 assertions` count (not merely "passing" but passing with the same assertion count every time —
no assertion silently skipped or varied), spanning both no-load serial runs and heavily
loaded/concurrent runs that reliably flaked the pre-fix file. Commands used (repeatable by a
downstream adversarial-verifier):

```bash
# induce load
for i in $(seq 1 100); do node -e "let x=0; while(true){ x+=Math.sqrt(x+1); }" & done
sleep 1
# hammer concurrently
for run in $(seq 1 8); do node scripts/test-run-chains.js > run-$run.log 2>&1 & done
wait
grep -L "run-chains tests passed" run-*.log || echo "ALL PASSED"
# clean up stress workers
kill -9 <stress pids>
```

Residual stress processes confirmed cleaned up after each round (`ps aux | grep Math.sqrt` → 0).

## Verification commands + exit codes

- `node -c scripts/test-run-chains.js` → exit 0 (syntax check)
- `node scripts/test-run-chains.js` (single run) → exit 0, `run-chains tests passed (146 assertions)`
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, `Workflow walkthrough simulation passed`
  (sanity check that the rest of the claude-chain harness is unaffected; #635's fix is
  CLAUDE-chain-only per the plan — `scripts/test-run-chains.js` is invoked only from
  `test:kaola-workflow:claude` in package.json, not the walkthrough or the other three chains, and
  the forge test files `test-gitlab-run-chains.js`/`test-gitea-run-chains.js` carry no
  self-kill/signal assertions, confirmed by inspection — so no #307 four-chain obligation applies to
  this node)
- 25× `node scripts/test-run-chains.js` (mix of serial + concurrent-under-induced-load, detailed
  above) → 25/25 exit 0, 146/146 assertions

## Files changed

- `scripts/test-run-chains.js` (the ONLY file in the declared write set; `git status --short`
  confirms no other file touched)
