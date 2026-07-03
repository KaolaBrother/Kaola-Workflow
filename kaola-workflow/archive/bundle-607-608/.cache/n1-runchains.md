evidence-binding: n1-runchains 83ff26ccecaa
<!-- RED: paste RED here -->
RED: `node scripts/test-run-chains.js` (pre-impl) — 8 failures: `T12: unset env returns default 1800000` (AssertionError, got 900000), `T12: "abc"/"0"/"-5" falls back to 1800000` (×3, got 900000), `T24: receipt records timed_out: true` (AssertionError, field absent from the persisted receipt entry: `{"name":"claude","exitCode":1,...,"retried_transient":false}` — no `timed_out` key), `T24: failure summary labels a TIMEOUT` + `T24: failure summary names KAOLA_RUN_CHAINS_TIMEOUT_MS` (stderr was plain `run-chains: 1 chain(s) failed: claude`, no TIMEOUT/env-var text), `T25: green chain records timed_out: false` (field absent). Overall: `run-chains tests FAILED (8 failures, 117 passed)`.
<!-- GREEN: paste GREEN here -->
GREEN: `node scripts/test-run-chains.js` → `run-chains tests passed (125 assertions)` (117 pre-existing + 8 new/updated, all green). `node scripts/simulate-workflow-walkthrough.js` → exit 0, `Workflow walkthrough simulation passed` (ran twice, both clean). `node scripts/validate-script-sync.js` → `OK: 24 common scripts, 25 byte-identical groups, 8 rename-normalized families, ...` exit 0. `node scripts/edition-sync.js --check` → `edition-sync: 10 forge aggregator ports in rename-normalized parity with canonical.` exit 0.

## Summary

Issue #608 (run-chains timeout observability + default recalibration), implemented TDD RED-first across the declared write set.

**scripts/kaola-workflow-run-chains.js** (canonical):
- `resolveTimeoutMs` default raised `900000 → 1800000` (30 min); doc comments (Env section + receipt-schema block + function header) updated to match, explaining the recalibration rationale (a live run hit exactly the old 900s bound).
- The internal `_timedOut` marker (already computed by both `runChainSync`/`runChainAsync`) is now PROMOTED into the persisted receipt per-chain entry as `timed_out: true|false` (previously stripped along with `_output`). Absent on a legacy receipt ⇒ readers treat it as false (no reader change required — additive field).
- The non-JSON failure summary line (`run-chains: N chain(s) failed: ...`) now labels a timed-out chain inline, e.g. `run-chains: 1 chain(s) failed: claude (TIMEOUT at 900s — raise KAOLA_RUN_CHAINS_TIMEOUT_MS or investigate a hang)` — an operator scanning stderr (not the JSON receipt) can tell a timeout from a genuine red at a glance. Non-timed-out failures are unlabeled (unchanged format).

**scripts/kaola-workflow-plan-validator.js** (canonical): the `chains_red` operator-hint function now accepts `ctx.timedOutChains` and, when non-empty, names the timeout-vs-red distinction + the `KAOLA_RUN_CHAINS_TIMEOUT_MS` remedy (falls back to the original generic hint text when no red chain timed out). The `--finalize-check` call site computes `timedOutChains` from the receipt's red chains and additively records `timed_out` in the JSON `redChains` list. Hint text only — the refuse/pass decision (`redChains.length` check) is byte-for-byte unchanged, so no barrier-logic change and no existing test (`simulate-workflow-walkthrough.js` `#432 (8)` / `#475 (e)`, which only assert `reason === 'chains_red'`) was affected.

**scripts/test-run-chains.js**: RED-first — updated T12 (5 assertions: default + 3 fallback paths + doc comment) from 900000 → 1800000; added T24 (a hung mock chain under a tiny `KAOLA_RUN_CHAINS_TIMEOUT_MS` override — asserts `timed_out: true` + `exitCode: 1` in the receipt AND stderr carries both `TIMEOUT` and `KAOLA_RUN_CHAINS_TIMEOUT_MS`); added T25 (a green chain asserts `timed_out: false` in the receipt).

**Edition propagation** (all four copies of each file):
- `plugins/kaola-workflow/scripts/kaola-workflow-{run-chains,plan-validator}.js` — byte-identical copies (COMMON_SCRIPTS), regenerated via `node scripts/edition-sync.js --write` (codex-sync step).
- `plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-plan-validator.js` — GENERATED_AGGREGATOR ports, regenerated via the same `edition-sync.js --write` (which recomputes them from canonical via the declared rename map).
- `plugins/kaola-workflow-{gitlab,gitea}/scripts/kaola-{gitlab,gitea}-workflow-run-chains.js` — RENAME_NORMALIZED_FAMILY ports (not covered by `edition-sync.js --write`, only its `--check`), so I applied the identical transform the validator checks against directly: `renameNormalize(canonicalContent, forge)` exported from `scripts/validate-script-sync.js`, then wrote the two files. This guarantees byte-for-byte agreement with the check, confirmed by the green `validate-script-sync.js` run above.

## Deviations from spec
None. All 8 declared-write-set code files + the test file were touched; `scripts/kaola-workflow-adaptive-node.js` (sibling leg's file) was not touched. `git status --short` in the leg confirms exactly these 9 files are modified, nothing else.
