# Phase 3 - Plan: issue-185

## Blueprint

### Files to Create
None — all changes are modifications to existing files.

### Files to Modify

| File | Changes | Why |
|---|---|---|
| `scripts/kaola-workflow-active-folders.js` | Line 11: `? n :` → `? Math.min(n, 600000) :` | Cap upper bound; Site 1 of sync pair |
| `scripts/kaola-workflow-closure-audit.js` | Line 44: same | Cap upper bound; Site 2 of sync pair |
| `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Line 11: same | Codex mirror — byte-identical to Site 1 |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Line 44: same | Codex mirror — byte-identical to Site 2 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | Line 12: same | GitLab `remoteTimeoutMs()` — independent |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | Line 14: same | Gitea `remoteTimeoutMs()` — independent |
| `scripts/simulate-workflow-walkthrough.js` | Add over-cap test fn after line 3599; register after line 3773 | Over-cap test for GitHub suite |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add over-cap test fn after line 2317; register after line 2394 | Over-cap test for GitLab suite |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add over-cap test fn after line 2244; register after line 2353 | Over-cap test for Gitea suite |
| `docs/api.md` | Update line 94: add over-cap clamping behavior | AC: doc update required for new behavior |

### Build Sequence
1. Pre-flight grep — confirm exactly 6 production sites (constraint from advisor/Phase 2)
2. Write 3 test functions (Group A) — fix NOT yet applied (RED-first order)
3. Run each suite → confirm all 3 tests are RED (non-zero exit or `closed_remote` misroute)
4. Apply 6-site fix (Group B) — only after Group A is confirmed RED
5. Update `docs/api.md` (Group C)
6. Run `npm test` → must exit 0 (includes contract validators + sync check + all walkthrough suites)
7. Run `node scripts/validate-script-sync.js` explicitly — `npm test` includes it, but run standalone to pinpoint sync failures

### Parallelization Plan
| Group | Tasks | Why safe in parallel |
|---|---|---|
| A | T1, T2, T3 | Three disjoint test files; no deps |
| B | F1+F3, F2+F4, F5, F6 | Six disjoint production files; F1+F3 and F2+F4 use identical edit text |
| C | D1 | `docs/api.md` — independent of test and fix files |
| Gate | B + C only after A is RED | RED-first constraint |

### External Dependencies
None — pure JavaScript, no new imports.

## Task List

### T1: Over-cap test — GitHub walkthrough
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: insert fn after line 3599; register call after line 3773
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: add `testClosureAuditTimeoutEnvOverCapFallsBack()` modeled on `testClosureAuditTimeoutEnvInvalidFallsBack` (lines 3573-3599). Env: `{ KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' }`. Immediate-success shim (verbs `issue view` / `issue list`, singular — GitHub form). Plant closed roadmap issue (e.g. issue 941). Assert `closed_remote` in `result.drift.stale_roadmap_sources`.
- Mirror: `testClosureAuditTimeoutEnvInvalidFallsBack` at line 3573
- Validate: `node scripts/simulate-workflow-walkthrough.js` → must fail (RED) before fix

### T2: Over-cap test — GitLab
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: insert fn after line 2317; register call after line 2394
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: add `testClosureAuditTimeoutEnvOverCapFallsBack()` modeled on gitlab `testClosureAuditTimeoutEnvInvalidFallsBack` (lines 2293-2317). Env: `{ KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' }`. Immediate-success shim (verbs `issue view` / `issue list`, **singular — GitLab form**, lines 2303-2304). Assert `closed_remote`.
- Mirror: `testClosureAuditTimeoutEnvInvalidFallsBack` at line 2293
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → RED before fix

### T3: Over-cap test — Gitea
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: insert fn after line 2244; register call after line 2353
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: add `testClosureAuditTimeoutEnvOverCapFallsBack()` modeled on gitea `testClosureAuditTimeoutEnvInvalidFallsBack` (lines 2220-2244). Env: `{ KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' }`. Immediate-success shim (verbs `issues view` / `issues list`, **plural — Gitea form**, lines 2230-2231 — differs from GitLab). Assert `closed_remote`.
- Mirror: `testClosureAuditTimeoutEnvInvalidFallsBack` at line 2220
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → RED before fix

### F1+F3: Fix — GitHub active-folders sync pair
- Files: `scripts/kaola-workflow-active-folders.js:11` + `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js:11`
- Write Set: both files, line 11
- Depends On: Group A confirmed RED
- Parallel Group: B
- Action: MODIFY (identical edit to both)
- Implement: change `? n : 30000` → `? Math.min(n, 600000) : 30000` on the IIFE return line. Edit must produce byte-identical output in both files.
- Mirror: `scripts/kaola-workflow-active-folders.js` current lines 9-12 as the before-state
- Validate: `node scripts/validate-script-sync.js` (byte-equality check)

### F2+F4: Fix — GitHub closure-audit sync pair
- Files: `scripts/kaola-workflow-closure-audit.js:44` + `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js:44`
- Write Set: both files, line 44
- Depends On: Group A confirmed RED
- Parallel Group: B
- Action: MODIFY (identical edit to both)
- Implement: same as F1+F3
- Validate: `node scripts/validate-script-sync.js`

### F5: Fix — GitLab forge
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:12`
- Write Set: `kaola-gitlab-forge.js` line 12
- Depends On: Group A confirmed RED
- Parallel Group: B
- Action: MODIFY
- Implement: change `? n : 30000` → `? Math.min(n, 600000) : 30000` in `remoteTimeoutMs()` return line
- Mirror: `kaola-gitlab-forge.js` lines 10-13 as before-state
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` → GREEN

### F6: Fix — Gitea forge
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:14`
- Write Set: `kaola-gitea-forge.js` line 14
- Depends On: Group A confirmed RED
- Parallel Group: B
- Action: MODIFY
- Implement: same as F5
- Mirror: `kaola-gitea-forge.js` lines 12-15 as before-state
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` → GREEN

### D1: Update docs/api.md
- File: `docs/api.md`
- Write Set: `docs/api.md` line ~94
- Depends On: Group A confirmed RED (so doc can reference actual cap value)
- Parallel Group: C (parallel with B)
- Action: MODIFY
- Implement: Extend the `KAOLA_GH_REMOTE_TIMEOUT_MS` description at line ~94 to document: values above 600000ms are clamped to 600000ms (10 min cap). Currently reads "Non-numeric, zero, or negative values fall back to the 30000ms default" — add the over-cap behavior.
- Validate: `npm test` (docs are not syntax-checked, but the gate ensures nothing broke)

## Coverage Boundary (residual risk — documented, not patched)
Sites 1+3 (active-folders) have no RED/GREEN test for the over-cap case. Covered by: identical edit to closure-audit + `validate-script-sync.js` enforcing Sites 1↔3 and 2↔4 byte-identity. Acceptable per task scope.

## Advisor Notes
- Validation gate updated to `npm test` (which includes contract validators + sync check + all 4 suites). The walkthrough scripts include `test-gitlab-workflow-scripts.js` and `test-gitea-workflow-scripts.js` via `run()` at line 87, so those test files ARE covered by `npm test`.
- `docs/api.md` doc update added as Task D1 — must not fall through the Phase 5/6 crack.
- All other plan elements confirmed correct by advisor.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|---|---|---|---|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor gaps resolved by main session from verified facts (package.json check, run() grep); no blueprint contradiction requiring architect revision |
