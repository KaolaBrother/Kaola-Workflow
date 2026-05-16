# Code Review — issue-33
Generated: 2026-05-16

## Files Reviewed
- scripts/kaola-workflow-sink-merge.js (T1/T2/T3 changes)
- commands/kaola-workflow-phase6.md (T4 change)
- scripts/simulate-workflow-walkthrough.js (T5 change)

## CRITICAL
None.

## HIGH
None.

## MEDIUM

**M1 — Production code carries test instrumentation with a partially-guarded arbitrary write path**
File: `scripts/kaola-workflow-sink-merge.js` lines 166-171

The `KAOLA_WORKFLOW_DEBUG_CWD` probe writes `process.cwd()` to whatever path is named in the environment variable. The only guard is `fs.existsSync(path.dirname(_p))`. Any caller that can supply environment variables can point it at an arbitrary existing-directory path and overwrite the file. Content is benign (CWD string, no secrets), but the probe is purely test instrumentation.

Recommended: rename to `KAOLA_WORKFLOW_TEST_CWD_PROBE`, add one-line source comment, note in README.

**M2 — Pre-chdir failure silently swallowed, defeating the fix**
File: `scripts/kaola-workflow-sink-merge.js` line 176

```javascript
try { process.chdir(mainRootFromCoord(coordRoot)); } catch (_) {}
```

This is the load-bearing chdir. If it fails, CWD remains inside the worktree, `removeWorktree` at claim.js:638 re-triggers the deferred guard, and the worktree is left attached. Caller gets no indication. This is the exact bug being fixed.

Recommended: log to stderr instead of silently swallowing.

## LOW

**L1 — JS and shell CWD derivation logically inconsistent**
`mainRootFromCoord` (JS): conditional — `basename === '.git' ? dirname : as-is`.
`_MAIN_ROOT` derivation (shell): unconditional `dirname`. In standard cases both produce the same result; edge cases diverge silently.

**L2 — Shell-level CWD restoration not covered by automated tests**
Test 16G-CWD validates JS-side fix only. The `cd "$_MAIN_ROOT"` in phase6.md has no automated coverage.

**L3 — `main()` exceeds 50-line function guideline (~67 lines after additions)**
Recommended: extract Step 0 into `pruneWorktreeAndAnchorCwd(args, coordRoot)`.

## Positive Findings
- `mainRootFromCoord` correctly camelCased and descriptive
- `coordRoot` is `const`; no mutation introduced
- File sizes under 800 lines
- `process.on('exit')` safe: `coordRoot` closed over from function-scoped `const`; handler fires on all normal exit paths
- Shell quoting in phase6.md correct; no injection vector
- No `console.log` statements introduced
- Test 16G-CWD validates exit code, worktree removal, and CWD probe correctly

## Verdict
APPROVE with recommendations. No blockers. M2 is worth fixing before merge.
