evidence-binding: n3-review ef9bf5590f2c
verdict: pass
findings_blocking: 0
finding: id=R1 scope=in_scope action=follow_up status=deferred severity=low fix_role=none rationale=latent-silent-pass-shape-if-in-process-main-ever-hangs-no-trigger-today

# n3-review — G1 code-reviewer gate over n1-release-greenness + n2-runchains-flake

Reviewed the full accumulated bundle diff. NOTE on the diff base: the brief's base
`f55b1801` predates main's bundle-619-620-631 commits (f661ca5f..3a4b4734, already merged
work — claim.js/sink-merge.js/walkthrough changes), so `git diff f55b1801 HEAD` includes
prior-bundle noise. The correct base for THIS bundle is `3a4b4734` (last main commit before
the kw-stub `4614fbf2`); all scope/content review below is against that base.

## 1. #632 fail-closed greenness — VERIFIED

- Guard present in `chainReceiptGreenness` (`scripts/kaola-workflow-release.js:265`):
  `if (!Array.isArray(receipt.chains) || receipt.chains.length === 0) return { green: false, reason: 'chains_empty' }`
  — covers BOTH the empty `chains: []` array and the missing/non-array `chains` key.
- Precedence slot correct: chains_unverified (no receipt, :251) > chains_stale (HEAD-bound,
  :255) > chains_empty (new, :265) > chains_red (loop). Matches the #618 reference
  implementation read at `kaola-workflow-plan-validator.js:~2817` (validator coerces a
  missing chains key to `[]` then refuses `chains_empty` after its stale gate — same order).
  The old `if (Array.isArray(receipt.chains))` wrapper around the red loop was correctly
  removed (the guard now guarantees a non-empty array).
- RED claim EMPIRICALLY REPRODUCED (plant-revert): checked out the pre-fix release.js
  (`git checkout 3a4b4734 -- scripts/kaola-workflow-release.js`), ran
  `node scripts/test-release.js` -> exactly 4 failures / 107 passed, all four T14a/T14b
  assertions failing with the fail-open `{"green":true}` — byte-matching the n1 evidence.
  Restored from HEAD; tree clean. Post-fix: `test-release: all 111 assertions passed`.
- Test quality: T14a/T14b use `headSha:'unknown'` to legitimately bypass the stale check
  (pre-existing `!== 'unknown'` escape) so they exercise the empty-guard slot precisely;
  T14c pins the stale>empty precedence; T14d guards the legitimate all-green path incl.
  no `chain_warning`. Well-shaped.

## 2. #632 stale-comment fix + value-call — VERIFIED

- The `runVerify` comment (~:370) now states reality: greenness is an informational
  `chain_warning` at `--verify`; `--cut` does not gate on it (offline pre-cut check runs
  before the online npm test that produces the receipt); cites D-632-01.
- Comment-only confirmed: grep of the `runCut` body (function at :390) for `green` -> ZERO
  hits (grep exit 1). The diff hunk at ~:370 changes only comment lines. No gating behavior
  added anywhere; matches the plan's resolved value-call (informational-only --cut).

## 3. #632 cross-edition parity (#307) — VERIFIED

- claude<->codex twin byte-identical (`diff -q` clean) and
  `node scripts/validate-script-sync.js` -> OK (release.js IS covered: COMMON byte group +
  RENAME_NORMALIZED 'release forge ports' family with the canonical root as reference —
  the pass is machine-guarding, not vacuous; checked validate-script-sync.js:81-83,267-274).
- gitlab/gitea ports carry the IDENTICAL guard: every +/- line in the two forge diffs
  appears exactly twice (once per port); forge-tree diff touches ONLY the two release.js
  ports.
- Four chains run sequentially, ONCE each, all exit 0:
  claude PASS (incl. `run-chains tests passed (146 assertions)` — unwaived), codex PASS,
  gitlab PASS, gitea PASS. The claude chain going green THROUGH test-run-chains.js with no
  `--accept-known-red ...:635` waiver is the self-validating signal that #635 landed.

## 4. #635 deterministic seam — VERIFIED (the critical scope guard holds)

- `kaola-workflow-run-chains.js` UNTOUCHED: `git diff 3a4b4734 HEAD` over both the root and
  codex copies -> 0 lines. The #618 signal->exitCode mapping (sync :202, async :296) is
  intact and still the unit under test.
- Seam soundness, verified against run-chains.js source (not just the diff):
  - run-chains.js destructures `const { spawnSync, spawn } = require('child_process')` ONCE
    at :112; the test patches the cached module's exports at module top (before any
    in-process require of run-chains.js), so the premise holds.
  - Wrappers intercept ONLY the reserved sentinel (`__kaola_test_signal_death__:<sig>`);
    all other commands pass through to the saved real spawnSync/spawn. T1-T25 + T29 invoke
    run-chains.js as a SEPARATE subprocess via `run()` (whose spawnSync was destructured at
    :13, pre-patch) — a fresh process has an unpatched child_process; no masking risk.
  - Sentinel delivery is exact: a mocked chain gets `cmdParts = [ctx.mocks[name]]`
    (run-chains.js:169, single argv element, `shell:false`), so the sentinel arrives at the
    wrapper as `cmd` intact.
  - Async path is race-free BY CONSTRUCTION: `runChainAsync` attaches stdout/stderr/error/
    close listeners synchronously inside the Promise executor before the `process.nextTick`
    emission can fire, and `done()` clears the per-chain timer (no stray handle). Sync path:
    the canned `{status:null, signal}` maps to exitCode 1 via the #618 rule with
    `timedOut=false` (signal!=='SIGTERM', no error) — exactly what T26 pins.
  - `main()` is exported (:702) and returns a code; `process.exit` lives only in the CLI
    wrapper (:697-698) — safe to await in-process. `runInProcess` restores cwd + env in a
    finally.
  - T26b retained as the REAL end-to-end subprocess case with a CLASS-only assertion
    (`exitCode === 1`, no signal-name/timed_out pin) — load-insensitive by construction,
    guards against the seam symptom-masking a broken real path.
- Determinism spot-check: 4x `node scripts/test-run-chains.js` -> 4/4 exit 0, identical
  `146 assertions` each run (adversary hammers under load next; nothing obviously flaky).

## 5. Scope + merge integrity — VERIFIED

- `git diff 3a4b4734 HEAD --name-only` = exactly the 6 declared code files (4x release.js
  editions, test-release.js, test-run-chains.js) + the 2 seeded evidence files. Nothing
  else; no leg clobbered the other — both legs' content present and coherent post-synth
  (release.js guard AND the seam both live at HEAD; all suites green over the merge).
- Walkthrough green (inside the claude chain).

## Findings

R1 (LOW, advisory, non-blocking): the T26-onward in-process design has a latent
silent-pass shape — if `main()` ever failed to resolve (e.g. a FUTURE run-chains.js
refactor moving 'close' listener attachment after an await, losing the nextTick emission),
the IIFE would hang, the event loop would drain, and the process would exit 0 WITHOUT
printing the summary or running T26-T29's assertions. No trigger exists today (listener
attachment is synchronous — verified), so this is a hardening follow-up only: a
`process.on('exit')` completion sentinel (assert the summary printed / a minimum assertion
count) would make the harness fail closed against that shape. Not a defect in this change.

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 0     | pass   |
| MEDIUM   | 0     | pass   |
| LOW      | 1     | note   |

Verdict: APPROVE — both fixes are correct, precedent-faithful, edition-complete, and
empirically verified (RED reproduced, four chains green unwaived, determinism spot-checked).
