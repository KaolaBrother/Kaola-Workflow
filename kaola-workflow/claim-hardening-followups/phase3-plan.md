# Phase 3 - Plan: claim-hardening-followups

## Blueprint

### Files to Create

None.

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Item 1: convert both `.replace()` second args in `updateSinkLease` (lines 133–137) to function-form | Eliminates `$&`/`$1` expansion risk; parity with `cmdPatchBranch` line 387 |
| `scripts/simulate-workflow-walkthrough.js` | Item 2: split combined 8D assert (lines 1112–1115) into two sequential asserts; Item 3: update 8E comment (line 1180); Item 4: convert `runClaim` body (lines 1062–1077) from `execFileSync` to `spawnSync` | Test hygiene and diagnostic surfacing |

### Build Sequence

1. Baseline validation run — `node scripts/simulate-workflow-walkthrough.js` → exit 0 (confirm starting GREEN before any edits)
2. Item 3 (comment) + Item 1 (production fix) — parallel group A, disjoint write sets
3. Guard 1 validation run — `node scripts/simulate-workflow-walkthrough.js` → exit 0 (post group A, gate for Item 2)
4. Item 2 (assertion tightening) — serial group B, depends on Guard 1 GREEN
5. Item 4 (spawnSync conversion) — serial group C, depends on group B passing
6. Final validation run — `node scripts/simulate-workflow-walkthrough.js` → exit 0; Test 8E passes

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Item 3, Item 1 | disjoint files: `simulate-workflow-walkthrough.js` (line 1180) vs `kaola-workflow-claim.js` (lines 133–137) |
| B | Item 2 | serial after Guard 1 run; write set `simulate-workflow-walkthrough.js` lines 1112–1115 |
| C | Item 4 | serial last; write set `simulate-workflow-walkthrough.js` lines 1062–1077 |

### External Dependencies

No new imports. `spawnSync` is already destructured from `child_process` at line 5 of
`simulate-workflow-walkthrough.js` (verify with grep before Item 4 edit; if absent for any
reason, add to existing destructure — do not add a second require).

## Task List

### Task 0: Baseline Validation

- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: none (read-only validation)
- Depends On: none
- Parallel Group: pre-A
- Action: VALIDATE
- Command: `node scripts/simulate-workflow-walkthrough.js`
- Expected: exit 0
- On failure: STOP — do not proceed with any edits until suite is GREEN

### Task 1: Item 3 — Update 8E Comment

- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: line 1180 (comment text only)
- Depends On: Task 0 (baseline GREEN)
- Parallel Group: A
- Action: MODIFY
- Implement: Replace `// 8E: re-claim must refresh issue_number and claimed_at (M1 probe)` with `// 8E: claim-after-release — second claim must refresh issue_number and claimed_at (M1 probe)`
- Mirror: n/a (comment-only change, zero behavioral risk)
- Validate: `node scripts/simulate-workflow-walkthrough.js` → exit 0 (as part of Guard 1 run after group A)

### Task 2: Item 1 — Convert updateSinkLease to Function-Form Replace

- File: `scripts/kaola-workflow-claim.js`
- Write Set: lines 133–137 (`updateSinkLease` body, two `.replace()` second arguments)
- Depends On: Task 0 (baseline GREEN)
- Parallel Group: A
- Action: MODIFY
- Implement:
  - Line 133–136: change second arg from `sinkBlock` to `() => sinkBlock`
  - Line 137: change second arg from `'\n' + leaseBlock.slice(1)` to `() => '\n' + leaseBlock.slice(1)`
- Mirror: `scripts/kaola-workflow-claim.js` line 387: `content.replace(/^branch:.*$/m, () => 'branch: ' + args.branch)`
- Validate: `node scripts/simulate-workflow-walkthrough.js` → exit 0 (Guard 1 run); Test 8E must pass
- DO NOT touch: line 19 `$&` regex escape (intentional); lines 147–148 `updateLeaseInPlace` (out of scope)

### Task 3: Guard 1 Validation Run

- File: none (validation only)
- Write Set: none
- Depends On: Tasks 1 + 2 (group A complete)
- Parallel Group: post-A (serial gate)
- Action: VALIDATE
- Command: `node scripts/simulate-workflow-walkthrough.js`
- Expected: exit 0; Test 8E passes
- On failure: STOP and route (build-error-resolver for tooling; tdd-guide for behavior)

### Task 4: Item 2 — Tighten 8D Assertion

- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: lines 1112–1115
- Depends On: Task 3 (Guard 1 GREEN)
- Parallel Group: B (serial after Guard 1)
- Action: MODIFY
- Implement: Replace single `assert(entry8d == null || (entry8d.drift && entry8d.drift.includes('session_id unsafe')), '...')` with two sequential asserts:
  1. `assert(entry8d != null, '8D: status must include entry for epic8d lock')`
  2. `assert(entry8d.drift && entry8d.drift.includes('session_id unsafe'), '8D: unsafe session_id entry must have drift ["session_id unsafe"]')`
- Mirror: existing two-step assert pairs elsewhere in suite
- Validate: `node scripts/simulate-workflow-walkthrough.js` → exit 0
- On assert-1 failure after change: route to tdd-guide (cmdStatus may be dropping the entry); do NOT revert or weaken the assertion; do NOT repair inline

### Task 5: Item 4 — Convert runClaim to spawnSync

- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: lines 1062–1077 (`runClaim` function body only)
- Depends On: Task 4 (group B passing)
- Parallel Group: C (serial, last)
- Action: MODIFY
- Pre-edit check: `grep -n "spawnSync" scripts/simulate-workflow-walkthrough.js | head -5` — confirm `spawnSync` is already destructured at line 5; if missing, add to existing destructure, do NOT add a new require
- Implement: Replace `execFileSync(...)` call with:
  ```js
  const r = spawnSync(node, [claimScript, ...args], { env, cwd });
  if (r.status !== 0) throw new Error('runClaim failed (status ' + r.status + ')\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
  ```
  Leave `return { lockPath, statePath }` block unchanged.
- Mirror: `spawnSync` pattern at lines 1105, 1145, 1218, 1244 of same file
- DO NOT touch: line 5 import (90+ `execFileSync` call sites proven by grep)
- Validate: `node scripts/simulate-workflow-walkthrough.js` → exit 0; Test 8E passes

### Task 6: Final Validation

- File: none (validation only)
- Write Set: none
- Depends On: Task 5 (all items applied)
- Parallel Group: post-C
- Action: VALIDATE
- Command: `node scripts/simulate-workflow-walkthrough.js`
- Expected: exit 0; Test 8E passes
- On failure: route (do not repair inline)

## Advisor Notes

Build sequence dependency-safe. No missing files or integration points. Plan is implementable
without further consultation.

Key pre-flight checks:
- `spawnSync` already destructured at line 5 (verify with grep before Task 5)
- If Task 4 `entry8d != null` assert fails: route to tdd-guide, never revert or weaken
- Guard 1 baseline BEFORE edits (Task 0) confirms starting GREEN; Guard 1 after group A (Task 3) gates Task 4

Commit strategy: ONE commit at Phase 6 — `fix: claim-hardening follow-ups (updateSinkLease + test hygiene)` (closes #11).

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | | plan approved without gaps; no revision needed |
