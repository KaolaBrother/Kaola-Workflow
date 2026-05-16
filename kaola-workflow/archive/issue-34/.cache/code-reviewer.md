# Code Review — Issue-34 Phase 5

## CRITICAL
None.

## HIGH

### HIGH-1: `archiveProjectDir` silently omits `step: complete` when workflow-state.md has no `step:` line
Files: `scripts/kaola-workflow-claim.js:1662`, `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:1503`

`String.prototype.replace` with a non-matching regex returns the original string unchanged. If workflow-state.md contains no `step:` line (normal for crash-abandoned dirs), the replacement silently no-ops. Test 34-B's `orphan-proj` fixture writes only `status: active` and `expires:` — no `step:` line — so the archived copy lands without `step: complete`, but the test only asserts `status: abandoned` and never checks `step: complete`. Bug passes CI today.

Fix: after each replace, check if the field was present; if not, append it.

### HIGH-2: State write errors are swallowed and the rename still proceeds
Files: `scripts/kaola-workflow-claim.js:1659-1671`, plugin mirror

The `try { ... } catch (_) {}` around the stateFile read/write swallows all errors (permission denied, disk full, concurrent lock). The rename still completes and returns `{ archived: true }`. The function's atomicity guarantee is only half-fulfilled — the caller cannot distinguish "archived with correct status" from "archived with stale or missing status".

Fix: add `process.stderr.write(...)` in the catch body before proceeding.

### HIGH-3: Test 34-A does not assert lock-file survival after finalize
File: `scripts/simulate-workflow-walkthrough.js:4475-4485`

The `already-done` sub-case depends on the lock file surviving the first finalize call (it reads the lock for session ownership check). This invariant has no affirmative assertion — it's only detected as a side effect. If a future refactor deletes the lock, the already-done path silently breaks.

Fix: add `assert(fs.existsSync(path.join(locksDir34a, 'test-proj.lock')), '34-A: lock file must survive finalize')` immediately after the first finalize call.

## MEDIUM

### MEDIUM-1: Test 34-C ordering assertion is vacuous for SKILL.md
SKILL.md does not contain "Step 8 - Commit Gate" so the ordering check is skipped (commitGateIdx === -1). Use `'git -C "$ACTIVE_WORKTREE_PATH" add'` as the anchor instead.

### MEDIUM-2: Test 34-B doesn't cover the lock-presence guard in sweep GC
No fixture for a dir with a live lock file. The lock-presence guard could be removed and tests still pass.

### MEDIUM-3: Sweep GC silently discards archive errors
`try { archiveProjectDir(...); } catch (_) {}` gives no stderr output. Inconsistent with other sweep error paths.

## LOW

### LOW-1: Archive collision suffix not collision-proof within same millisecond
`new Date().toISOString()` has ms precision; two calls in same ms produce identical suffixes. Add `Math.random()` suffix or counter.

### LOW-2: Plugin `cmdFinalize` omission of `enforcePlatformSessionOrExit` undocumented
Add a comment noting the intentional divergence.
