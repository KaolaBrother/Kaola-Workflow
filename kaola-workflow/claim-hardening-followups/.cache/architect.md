# Code Architect: claim-hardening-followups

## Design Decisions

- Item 3 is comment-only with no functional risk; goes first or in parallel with Item 1.
- Item 1 converts two string-form `.replace()` second arguments in `updateSinkLease` to function-form. Mirrors line 387 `cmdPatchBranch` pattern. Only production-file change.
- Item 2 tightens downstream Test 8D assertion observing state file written by Item 1's code path. Tightened form (`entry8d != null`) is unconditional. Comes after Item 1 + baseline-green verification. If failure after change, route to tdd-guide.
- Item 4 converts `runClaim` from `execFileSync` to `spawnSync`. Comes last to avoid conflating new failure surfacing with Items 1–2 regressions.
- `execFileSync` import at line 5 must be retained. Grep verified 90+ remaining call sites.

## Grep Evidence (Empirical Guard 2 resolved)

`grep -n "execFileSync" scripts/simulate-workflow-walkthrough.js` returns matches at:
5 (import), 96, 106, 342, 355, 363, 375, 385, 392, 399, 415, 416, 417, 418, 419, 421, 422, 423, 425, 428, 436, 441, 455, 456, 457, 458, 459, 461, 462, 463, 465, 466, 467, 469, 470, 471, 473, 475, 477, 478, 482, 490, 495, 509, 510, 511, 512, 513, 515, 516, 517, 519, 520, 521, 523, 524, 525, 526, 528, 530, 531, 535, 551, 579, 589, 598, 607, 634, 643, 653, 667, 692, 713, 725, 740, 769, 779, 795, 817, 818, 819, 820, 821, 823, 824, 825, 887, 907, 908, 912, 923, 939, 940, 941, 947, 966, 967, 973, 978, 997, 998, 1004, 1008, 1010, 1022, 1041, 1062.

Conclusion: `runClaim` at line 1062 is one of many call sites; the destructured `execFileSync` import at line 5 must remain.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/simulate-workflow-walkthrough.js` | Item 3: comment at line 1180. Item 2: split combined assert at lines 1112–1115 into two sequential asserts. Item 4: replace `execFileSync` with `spawnSync` in `runClaim` body at lines 1062–1077. Leave line 5 import unchanged. | High |
| `scripts/kaola-workflow-claim.js` | Item 1: convert both string-form `.replace()` second args in `updateSinkLease` to function-form at lines 133–137. | High |

## Files to Create

None.

## Out of Scope

- `kaola-workflow-claim.js` lines 147–148 (`updateLeaseInPlace` ISO date replaces)
- `kaola-workflow-claim.js` line 19 (intentional `$&` escape regex)
- `execFileSync` import at line 5 of `simulate-workflow-walkthrough.js` (90+ remaining call sites confirmed by grep)
- New test files
- New source files
- Shared `runNode` helper refactor
- Commit count: one commit total at Phase 6

## Empirical Guards

1. **Guard 1 (before Item 2)**: Run `node scripts/simulate-workflow-walkthrough.js` against the code BEFORE any changes are made (pre-change baseline). Suite must exit 0. If suite is already failing, stop and route before making any edits. Apply Items 3 and 1, then run again to confirm still GREEN before applying Item 2.
2. **Guard 2 (pre-resolved)**: `execFileSync` import at line 5 is preserved — 90+ remaining call sites proven by grep above.
3. **Guard 3 (after all four items)**: Run `node scripts/simulate-workflow-walkthrough.js`. Test 8E must pass (regression guard for updateSinkLease change in Item 1).

## Build Sequence

1. **Baseline run** — `node scripts/simulate-workflow-walkthrough.js` → exit 0 (pre-change confirmation).
2. Item 3 — Update comment line 1180 (zero risk, can be parallel with Item 1 in same tdd-guide invocation).
3. Item 1 — Convert both `.replace()` second args in `updateSinkLease` lines 133–137 to function-form.
4. **Guard 1 run** — `node scripts/simulate-workflow-walkthrough.js` → exit 0 (post Items 3+1, pre Item 2).
5. Item 2 — Replace combined assert at lines 1112–1115 with two sequential asserts.
6. Item 4 — Replace `execFileSync(...)` with `spawnSync(...)` + status check in `runClaim` body lines 1062–1077.
7. **Final validation** — `node scripts/simulate-workflow-walkthrough.js` → exit 0; Test 8E passes.
8. Commit — single commit at Phase 6.

## Task List

| # | File | Line Range | Write Set | Depends-On | Parallel Group | Action | Implement | Mirror | Validate |
|---|------|-----------|-----------|-----------|---------------|--------|-----------|--------|----------|
| 3 | `scripts/simulate-workflow-walkthrough.js` | 1180 | comment text | none | A | Update comment | Replace `// 8E: re-claim must refresh issue_number and claimed_at (M1 probe)` with `// 8E: claim-after-release — second claim must refresh issue_number and claimed_at (M1 probe)` | n/a | `node scripts/simulate-workflow-walkthrough.js` → exit 0 |
| 1 | `scripts/kaola-workflow-claim.js` | 133–137 | two `.replace()` second arguments | none | A | Convert string-form to function-form | Line 133–136: second arg `sinkBlock` → `() => sinkBlock`. Line 137: second arg `'\n' + leaseBlock.slice(1)` → `() => '\n' + leaseBlock.slice(1)`. | Line 387: `content.replace(/^branch:.*$/m, () => 'branch: ' + args.branch)` | `node scripts/simulate-workflow-walkthrough.js` → exit 0 (fulfils Guard 1 run) |
| 2 | `scripts/simulate-workflow-walkthrough.js` | 1112–1115 | two `assert` calls replacing one | Items 3+1 + Guard 1 run green | B (serial after A) | Split combined assert | Remove single `assert(entry8d == null || …)` call. Insert: (1) `assert(entry8d != null, '8D: status must include entry for epic8d lock')` then (2) `assert(entry8d.drift && entry8d.drift.includes('session_id unsafe'), '8D: unsafe session_id entry must have drift ["session_id unsafe"]')`. If first assert fails after change, route to tdd-guide; do not repair inline. | Existing two-step assert pairs elsewhere in suite | `node scripts/simulate-workflow-walkthrough.js` → exit 0 |
| 4 | `scripts/simulate-workflow-walkthrough.js` | 1062–1077 | `runClaim` function body | Items 1–3 applied and suite green | C (serial, last) | Swap `execFileSync` → `spawnSync` with status check | Replace `execFileSync(...)` call with `spawnSync(...)` assigned to `const r`. Add `if (r.status !== 0) throw new Error('runClaim failed (status ' + r.status + ')\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr)`. Leave `return { lockPath, statePath }` block unchanged. **Do not touch line-5 import** (90+ remaining call sites). | `spawnSync` pattern at lines 1105, 1145, 1218, 1244 | `node scripts/simulate-workflow-walkthrough.js` → exit 0; Test 8E passes |
