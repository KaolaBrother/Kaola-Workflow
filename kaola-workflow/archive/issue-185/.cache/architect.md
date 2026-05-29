# Code Architect — issue-185: Cap KAOLA_GH_REMOTE_TIMEOUT_MS upper bound

## Design Decisions
- **Inline `Math.min(n, 600000)` in the success branch, no constant/helper.** Smallest change that satisfies the requirement and preserves the existing sync invariant.
- **Silent cap, no warn/throw.** Matches existing silent-fallback behavior.
- **Identical edit text at Sites 1-4; equivalent inner-line edit at Sites 5-6.** Sites 5-6 are independent (not sync-validated against 1-4).
- **RED-first, inverting generic build order.** Tests are written and proven RED before the fix is applied (constraint 1).

## RED-mechanism (verified empirically)
- `parseInt('999999999999999999999', 10)` = `1e21`, passes `Number.isInteger(n) && n > 0` (bypasses fallback)
- Pre-fix: `execFileSync(..., { timeout: 1e21 })` throws `ERR_OUT_OF_RANGE`
- Post-fix: `Math.min(1e21, 600000)` = `600000`, a valid timeout
- RED manifest: `ERR_OUT_OF_RANGE` throw inside exec wrapper → misroute or non-zero exit. Both are valid RED.

## Files to Modify

### Production — 6 sites

| # | File | Line | Change |
|---|---|---|---|
| 1 | `scripts/kaola-workflow-active-folders.js` | 11 | `? n :` → `? Math.min(n, 600000) :` |
| 2 | `scripts/kaola-workflow-closure-audit.js` | 44 | same |
| 3 | `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | 11 | same (byte-identical to Site 1) |
| 4 | `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | 44 | same (byte-identical to Site 2) |
| 5 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | 12 | same (independent) |
| 6 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | 14 | same (independent) |

Exact edit at every site:
```
// Before:
return Number.isInteger(n) && n > 0 ? n : 30000;
// After:
return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
```

### Test suites — 3 files

| File | Insert fn after | Register after |
|---|---|---|
| `scripts/simulate-workflow-walkthrough.js` | line 3599 (end of model fn) | line 3773 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | line 2317 | line 2394 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | line 2244 | line 2353 |

## Coverage boundary (residual risk — documented, not patched)
Sites 1+3 (active-folders) have no RED/GREEN test. Covered by: identical edit to closure-audit + `validate-script-sync.js` enforcing 1↔3 byte-identity. Acceptable per task scope.

## Build Sequence (RED-first)
1. Pre-flight grep: `grep -rn KAOLA_GH_REMOTE_TIMEOUT_MS --include='*.js' .` → confirm 6 sites
2. Write 3 new tests (Group A — fix NOT yet applied)
3. Run each suite → confirm RED (all 3 must be RED)
4. Apply 6-site fix (Group B)
5. Run all 3 suites → confirm GREEN
6. Run `node scripts/validate-script-sync.js` explicitly

## Task List

### Group A (parallel, disjoint write sets — do first, run RED before fix)

**T1 — github walkthrough test**
- File: `scripts/simulate-workflow-walkthrough.js`
- Write set: insert after line 3599; register after line 3773
- Parallel group: A (no deps)
- Action: add `testClosureAuditTimeoutEnvOverCapFallsBack` modeled on `testClosureAuditTimeoutEnvInvalidFallsBack` (lines 3573-3599)
- Logic: env `{ KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' }`; immediate-success shim; verbs `issue view`/`issue list` (singular); `plantRoadmapIssue(tmp, 941, '')`; assert `closed_remote` for issue 941
- Register: add `testClosureAuditTimeoutEnvOverCapFallsBack();` after existing registration at line 3773
- Validation: `node scripts/simulate-workflow-walkthrough.js`

**T2 — gitlab test**
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write set: insert after line 2317; register after line 2394
- Parallel group: A (no deps)
- Action: add fn modeled on gitlab `testClosureAuditTimeoutEnvInvalidFallsBack` (lines 2293-2317)
- Logic: env giant-int; immediate-success shim; verbs `issue view`/`issue list` (singular — gitlab form); assert `closed_remote`
- Validation: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

**T3 — gitea test**
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write set: insert after line 2244; register after line 2353
- Parallel group: A (no deps)
- Action: add fn modeled on gitea `testClosureAuditTimeoutEnvInvalidFallsBack` (lines 2220-2244)
- Logic: env giant-int; immediate-success shim; verbs `issues view`/`issues list` (**plural — gitea form**, lines 2230-2231); assert `closed_remote`
- Validation: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`

### Group B (apply only after Group A is RED)

**F1+F3 — github active-folders sync pair**
- Files: `scripts/kaola-workflow-active-folders.js:11` + `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js:11`
- Depends-on: Group A RED | Parallel group: B

**F2+F4 — github closure-audit sync pair**
- Files: `scripts/kaola-workflow-closure-audit.js:44` + `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js:44`
- Depends-on: Group A RED | Parallel group: B

**F5 — gitlab forge**
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:12`
- Depends-on: Group A RED | Parallel group: B

**F6 — gitea forge**
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:14`
- Depends-on: Group A RED | Parallel group: B

## Parallelization Plan
| Group | Tasks | Why safe |
|---|---|---|
| A | T1, T2, T3 | three disjoint test files |
| B | F1+F3, F2+F4, F5, F6 | six disjoint production files |
| Gate | A RED before B | constraint 1 |

## Validation Commands
```bash
# Pre-flight
grep -rn KAOLA_GH_REMOTE_TIMEOUT_MS --include='*.js' . | grep -v node_modules

# After Group A (before fix) — confirm RED:
node scripts/simulate-workflow-walkthrough.js
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js

# After Group B (fix applied) — confirm GREEN + sync:
node scripts/simulate-workflow-walkthrough.js
node scripts/validate-script-sync.js
node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js
node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js
```

## Explicit Out-of-Scope
- No `console.warn`, no throw, no log on the cap
- No named constant for `600000`
- No IIFE → shared-helper refactor
- No changes to NaN/zero/negative handling
- No `Number.isInteger` → `Number.isFinite` swap
- No 4th test for active-folders (Sites 1/3)
- No changes outside 6 production sites + 3 test files
