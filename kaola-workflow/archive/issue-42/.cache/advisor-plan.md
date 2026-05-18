# Advisor Gate: issue-42 Phase 3 Plan

## Verdict
Blueprint acceptable. Four blocking gaps must be fixed in phase3-plan.md before Phase 4 begins. Four clarification items incorporated for completeness.

## Blocking Gaps

### Gap 1: `parseStartupArgs` does not exist — use `parseArgs`
Task 3 sample code for `cmdSinkFallback` used `parseStartupArgs(process.argv.slice(3))`. Grep of claim.js confirms the function is `parseArgs` at L149. `parseStartupArgs` does not exist. Task 3 must say `parseArgs`.

**Resolution:** CONFIRMED — `function parseArgs(argv)` at L149 of kaola-workflow-claim.js. Task 3 updated to use `parseArgs`.

### Gap 2: Task 1 no-op breaks dependency arrows
The architect numbered tasks starting at 2, explicitly calling Task 1 a schema freeze-point. But Task descriptions said "Depends On: Task 1 (receipt schema)". This creates a circular dependency on a non-existent task and confuses the build sequence. Receipt schema is frozen in the blueprint, not a runtime dependency.

**Resolution:** Dependency phrasing changed to "Depends on: receipt schema — frozen in blueprint". No Task 1 entry in phase3-plan.md. Schema is documented once in the Blueprint section.

### Gap 3: `_MAIN_ROOT` undefined in Phase 6 pivot block
Task 5 pivot block uses `cd "$_MAIN_ROOT"` but never defines `_MAIN_ROOT`. The existing Phase 6 command uses `_COORD_ROOT_RAW` / `ACTIVE_WORKTREE_PATH` for doc-updater but not a `_MAIN_ROOT` variable. The pivot block runs inside a `case` statement that doesn't have access to the repo root unless it is defined explicitly.

**Resolution:** Verified kaola-workflow-phase6.md L616: `_MAIN_ROOT="$(dirname "$_COORD_ROOT_RAW_SINK")"` is already defined before the case block. Task 5 uses the existing `_MAIN_ROOT` — no new definition needed. The SKILL.md equivalent must define `_MAIN_ROOT` if it does not already; tdd-guide will verify during Task 5.

### Gap 4: `getCoordRoot` path consistency between sink-merge.js and claim.js
Architect states receipt is written to `{coordRoot}/kaola-workflow/{project}/.cache/sink-fallback.json`. If sink-merge.js and claim.js resolve `getCoordRoot()` differently, the reader in `cmdSinkFallback` won't find the file.

**Resolution:** CONFIRMED — line 5 of kaola-workflow-sink-merge.js: `const { getCoordRoot, removeWorktree } = require('./kaola-workflow-claim.js')`. Both scripts use the identical `getCoordRoot` function from claim.js. Same return value guaranteed. Receipt path is consistent.

Note: sink-merge.js `process.chdir(mainRootFromCoord(coordRoot))` before push means `getRoot()` in both scripts returns the main worktree. Receipt is written to `path.join(mainRootFromCoord(coordRoot), 'kaola-workflow', project, '.cache', 'sink-fallback.json')` from sink-merge.js, and read from the same path by `cmdSinkFallback` using the same derivation.

## Clarification Items

### Item 1: `classifyMergeError` scope
`classifyMergeError(stderr)` is called ONLY in the push exception catch block. It is NOT called on local `git merge --ff-only` failures. If the FF merge fails locally (conflict, dirty tree) before ever reaching the push step, that failure propagates as exit 1 (unchanged). The function name is intentionally broad for future use but its current call site is the push exception handler only.

### Item 2: `cmdSinkFallback` write order
`updateSinkLease(stateFile, lockData)` constructs the entire Sink and Lease block from `lockData` — it does NOT re-read the lock file. Therefore the correct invocation order in `cmdSinkFallback` is:
1. Read receipt from `{mainRoot}/kaola-workflow/{project}/.cache/sink-fallback.json`
2. Read existing lock data (via `readLockFiles` or direct `JSON.parse(fs.readFileSync(lockPath(...)))`)
3. Build `updated = Object.assign({}, existing, { sink: 'pr', sink_fallback_reason: receipt.reason })`
4. Write lock file: `fs.writeFileSync(lp, JSON.stringify(updated, null, 2) + '\n')`
5. Call `updateSinkLease(stateFile, updated)` — constructs workflow-state.md from `updated`

`buildSinkBlock` must also add `if (lockData.sink_fallback_reason != null) lines.push('sink_fallback_reason: ' + lockData.sink_fallback_reason);` so that `updateSinkLease` emits the new field.

### Item 3: Epic Case 18A subprocess requirement
Epic Case 18A tests `cmdSinkFallback` state mutations. The test must invoke it via subprocess (`execFileSync('node', [CLAIM_JS, 'sink-fallback', '--project', ...])`), NOT via `require()`. Reason: `cmdSinkFallback` writes to the lock file and workflow-state.md on disk; a subprocess invocation exercises the same code path that Phase 6 uses and isolates test state correctly.

### Item 4: `postMergeCleanup` return-value contract
`postMergeCleanup(args)` must return `{exitCode: 3}` (a plain object) when it writes the receipt and executes the reset. It must NOT call `process.exit(3)` or throw. The caller in `main()` checks the return value and sets `process.exitCode = 3; return;`. This keeps the exit-handler (`process.on('exit', ...)`) running for CWD cleanup. The existing exception path re-throws — no change needed there.

## Plan Approval

Blueprint is approved with these four gaps corrected. Task ordering (Group A: Tasks 2+3+5+6 parallel, Group B: Tasks 4+7 sequential after A, Group C: Task 8 after B, Group D: Task 9 after C, Group E: Task 10 after D) is dependency-safe.
