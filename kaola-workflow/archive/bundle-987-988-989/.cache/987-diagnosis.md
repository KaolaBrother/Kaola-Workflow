# #987 — `OverCapFallsBack`: which of the three is it?

**Verdict: merely mutation-insensitive.** Not unreachable, not tautological. The failure the test
describes cannot be produced on this runtime, so nothing it asserts can discriminate.

## The measurement that settles it

Node v24.18.0, `execFileSync` `timeout` option, measured directly:

| value | survives `Number.isInteger(n) && n > 0` | result |
|---|---|---|
| `2**31`, `2**32`, `2**53`, `MAX_SAFE_INTEGER`, `1e15`, `1e21`, `1e300`, `Number.MAX_VALUE` | yes | **no throw** |
| `Infinity` | **no** | throws `ERR_OUT_OF_RANGE` |
| `NaN` | **no** | throws `ERR_OUT_OF_RANGE` |

`parseInt('999999999999999999999', 10)` → `1e21`, and `Number.isInteger(1e21)` → `true`. So the test's
stated premise — *"causes execFileSync to throw ERR_OUT_OF_RANGE"* — is false here. Every value that
throws is one the guard already rejects, and `parseInt` of a digit string cannot yield `Infinity`.
**There is no input that reaches the clamp and crashes.**

## The wrong-module trap, recorded because it cost a full cycle

There are TWO identically-named `REMOTE_TIMEOUT_MS` constants with identical bodies:

- `kaola-workflow-active-folders.js:9` — read by `ghExec` → `probeIssueState` → `collectClosedSet`.
  **This is the one both timeout tests discriminate on** (`unresolved_closed_state` vs
  `active_folder_for_closed_issue`).
- `kaola-workflow-closure-audit.js:44` — read by that file's own `ghExec`, which feeds
  `detectStaleLabels`. Mutating it moves **neither** test.

The first two mutants were applied to closure-audit.js and produced two green runs that looked like
evidence of insensitivity and were evidence of nothing. Both were re-run against active-folders.js.

## Mutations, one site at a time, on `active-folders.js`

Selector: `node scripts/simulate-workflow-walkthrough.js --only testClosureAuditTimeoutEnv`
(prefix match; `--only a,b` and `--only a b` do NOT select two — the first silently selects one).

| mutant | change | Invalid | OverCap | exit |
|---|---|---|---|---|
| baseline | — | PASSED | PASSED | 0 |
| **E** | remove `Math.min(n, 600000)` — *the exact mechanism OverCap is named after* | PASSED | **PASSED** | 0 |
| **F** | remove the `Number.isInteger(n) && n > 0` guard | **RED** — `unresolved_closed_state: [941]` | PASSED | 1 |

Mutant E is the finding: deleting the guarded behaviour leaves its own pin green. Mutant F is the
control that keeps E honest — the axis is armed, the fixture does reach the probe, and the sibling's
discriminator works exactly as documented. Only the over-cap half is dead.

## Why deleted rather than given teeth

The clamp's surviving effect is bounding the wait at 600000 ms. `REMOTE_TIMEOUT_MS` is module-private
in both files, and the cap can only be lowered by the code, never by the env (`Math.min`), so
witnessing it requires a ten-minute hang. #987 forbids relaxing the mutation or moving a threshold to
make the question go away, so the honest options were teeth or deletion, and teeth are not available
at a testable cost.

**The clamp itself was NOT touched.** Deleting a mechanism because its only test was fake is the
inverse of the mistake, and #989's body names it: conflating a fixture gap with a dead production path
is how live code gets deleted. Markers were left at both clamp sites saying the absence of a pin is
deliberate and measured, so the next reader does not "clean up" a live bound.
