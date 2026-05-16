# TDD Task 1.2 Evidence — claim.js Core Derivation Functions

## Result: COMPLETE (RED for 8N-task1.2 tests — expected, Task 1.3 bridges to GREEN)

## Files Modified
- `scripts/kaola-workflow-claim.js` (+64 lines — 4 functions inserted at line 174)
- `scripts/simulate-workflow-walkthrough.js` (+51 lines — 8N-task1.2 tests A-D)

## Functions Added (claim.js)
- `walkToClaudePid()` — line 174: 5-hop ps tree walk, matches `comm` containing "claude"
- `readClaudeStartTimeMs(pid)` — line 191: `ps -o lstart=` → `Date.parse()`
- `writeIdentityFile(identityPath, data)` — line 198: O_EXCL, mode 0o600, silent on race
- `derivePlatformSessionId(coordRoot, options={})` — line 208: identity-file-only; honors SKIP and FAKE_PID; deletes stale files on dead PID or start_time mismatch; never throws

## RED Evidence
```
Error: 8N-task1.2-A: SKIP path exits 0, got 1
```
Root cause: `derive-session` subcommand not wired in main(). Expected RED — Task 1.3's scope.

## GREEN Evidence (partial)
Task 1.1 green run shows walkthrough passes. Task 1.2 functions present and structurally correct. Full GREEN requires Task 1.3 (cmdDeriveSession + wiring + KAOLA_COORD_ROOT fix).

## Coordination Issue for Task 1.3
Tests B/C/D write identity files to `tmp/kaola-workflow/.runtime/` (where `tmp` = test's mkdtemp dir). `cmdDeriveSession` will call `getCoordRoot()` which resolves to actual git common dir, NOT `tmp`. Fix: add `KAOLA_COORD_ROOT` env var support to `getCoordRoot()`. Tests must pass `KAOLA_COORD_ROOT: tmp` in env.

## Deviations
None (intentionally did not add cmdDeriveSession — Task 1.3 scope).
