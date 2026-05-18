# Advisor Ideation Output — issue-75

## Response Summary

The planner's plan is sound. Six notes:

### 1. Gap 2 — sink-fallback can recreate archived folders (CRITICAL)
`cmdSinkFallback` calls `updateState(root, project, ...)`. `updateState` silently swallows a read error (content = ''), then calls `writeFile(file, content)` which calls `fs.mkdirSync({ recursive: true })` + `fs.writeFileSync`. When the active folder was already archived by Step 8b, `cmdSinkFallback` **recreates** `kaola-workflow/{project}/` with an empty state file. This violates the AC bullet: "sink-fallback and sink-pr do not recreate active workflow folders after cmdFinalize has archived them."

Fix: add a guard in `cmdSinkFallback`: if `path.join(root, 'kaola-workflow', project)` doesn't exist as a directory, skip the `updateState` call and return `{ updated: false, project, reason: 'project archived' }`.

`sink-pr.js updateStateSinkBlock` already has `if (!fs.existsSync(stateFile)) return;` so no recreation there. Only `cmdSinkFallback` needs the guard.

The full Gap 2 plan thus requires BOTH:
- Doc change (Step 8b conditional on sink:merge for pure PR-sink path)
- Code change in `cmdSinkFallback` (guard against post-archive recreation for merge→PR pivot path)

### 2. Implementation order
Gap 2 Approach A correctness depends on Gap 1 fix (watch-pr must see closed-issue PR-backed folders). Gap 5's "run cmdRelease to clean up" recommendation only cleans worktrees once Gap 3 is in. Implement in this order: 1 → 3 → 2 → 4 → 5+6.

### 3. Existing test contract for cmdStatus
Verify `testClaimStatusRelease` assertions against new `{ active, drift, count }` schema. `count` preserved as `active.length`, additive schema change should be safe.

### 4. Gap 1 test must use online path
`cmdWatchPr` short-circuits at OFFLINE=1. Test needs `runClaimOnline` + gh shim returning `{state:"closed"}` for issue and `{state:"MERGED","number":1}` for PR.

### 5. Gap 4 OFFLINE behavior — fail-open is correct
When OFFLINE=1, `issueIsClosed` returns false → all folders appear in `active[]`, `drift[]` always empty. Document this explicitly.

### 6. Omit drift_count field
Skip `drift_count` — callers can do `status.drift.length`. Don't replicate the historical `count` redundancy.
