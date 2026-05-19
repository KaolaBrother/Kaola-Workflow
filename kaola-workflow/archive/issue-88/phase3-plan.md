# Phase 3 - Plan: issue-88

## Blueprint

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Add `os` import, `OFFLINE` const, `field`, `readOrCreateConfig`, `issueHasWorkflowInProgressLabel`, `issueHasRemoteClaimNotes`; rewrite `cmdClassify`; update `checkDependsOn`; update `module.exports` | Gaps 1-3: parallel_mode bypass, OFFLINE fallback, remote claim detection |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` | Add `stateLooksValid`; rewrite `repair()` three-way branch; rewrite `stateContent()` with `## Ownership Rules` block + `last_result` rename; update `module.exports` | Gaps 4-5: stateLooksValid + three-way branch + ownership block |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add `classifierScript` constant; append Task A test block; append Task B + Gap 5 test blocks | Test coverage for all five gaps |

### Files to Create
None.

### Build Sequence
1. Task A Step A-1: Add `os` import + `OFFLINE` constant to classifier
2. Task A Step A-2: Add `field` + `readOrCreateConfig` helpers to classifier
3. Task A Step A-3: Add `issueHasWorkflowInProgressLabel` + `issueHasRemoteClaimNotes` to classifier
4. Task A Step A-4: Update `checkDependsOn` in classifier (OFFLINE short-circuit)
5. Task A Step A-5: Rewrite `cmdClassify` (parallel_mode bypass → OFFLINE → online path)
6. Task A Step A-6: Update classifier `module.exports`
7. Task A Step A-7: Add `classifierScript` constant + append Task A test block to test file
8. Task B Step B-1: Add `stateLooksValid` to repair-state
9. Task B Step B-2: Rewrite `repair()` with three-way branch in repair-state
10. Task B Step B-3: Rewrite `stateContent()` with `## Ownership Rules` + `last_result` rename (Gap 5 — from architect-revision-1.md)
11. Task B Step B-4: Update repair-state `module.exports` (add `stateLooksValid`)
12. Task B Step B-5: Append Task B test block + Gap 5 test blocks to test file

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | Task A, Task B | Both append to same test file; Task A completes first |

### External Dependencies
- `os` module (Node.js built-in) — for `readOrCreateConfig()`
- `forge.CLAIM_LABEL`, `forge.discoverProject()`, `forge.listIssueNotes()`, `forge.viewIssue()` — already in `kaola-gitlab-forge.js`
- `active.getRoot()`, `active.readActiveFolders()` — already in `kaola-gitlab-workflow-active-folders.js`

## Task List

### Task 1: Classifier Gaps 1, 2, 3
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (append only)
- Write Set: classifier.js, test-gitlab-workflow-scripts.js
- Depends On: none
- Parallel Group: serial (runs before Task 2)
- Action: MODIFY

**Implement (exact code in `.cache/architect.md` Steps A-1 through A-7)**:

**Gap 1 — parallel_mode bypass** (Steps A-1, A-2, A-5 partial):
- Add `const os = require('os')` after `const fs = require('fs')`
- Add `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` after all require statements
- Add `field(content, name)` helper (same as GitHub reference; already exists in repair-state, add to classifier)
- Add `readOrCreateConfig()`: compute `CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json')` INSIDE the function (not module level) for test overridability; reads JSON; on failure writes `{ parallel_mode: 'auto' }` default
- In `cmdClassify()`: call `readOrCreateConfig()` first; if `config.parallel_mode !== 'auto'`, output `{ verdict: 'green', reasoning: 'parallel_mode=X; bypassing classifier' }` and return

**Gap 2 — OFFLINE fallback** (Steps A-4, A-5 partial):
- Update `checkDependsOn(depIid)`: add OFFLINE short-circuit at top → `{ verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#N label present; conservative block' }`
- In `cmdClassify()` after owned-check: OFFLINE branch reads `.roadmap/issue-N.md` via `active.getRoot()`, parses `next_step` field for `/blocked by #\d+/i`, synthesizes `depends-on` label with single `.test()` match, calls `parseAreaLabelsFromText(content)` (already exists at line 88 — NOT in write set), calls `classify()`, returns
- OFFLINE tests: must use `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1'` env var (not `withForge` in-process — `OFFLINE` evaluated at module load)

**Gap 3 — Remote claim detection** (Steps A-3, A-5 partial):
- Add `issueHasWorkflowInProgressLabel(labels)`: `return (labels || []).some(l => labelName(l) === forge.CLAIM_LABEL)` — string array via `labelName()` (exists at line 11)
- Add `issueHasRemoteClaimNotes(issueIid)`: if OFFLINE return false; lazy `forge.discoverProject()` in try/catch; check `project_id` guard; call `forge.listIssueNotes(project, issueIid)`; match body against `/<!--\s*kw:claim\s+(project|sess)=/`; `!note.updated_at → true`; else check `Date.now() - new Date(note.updated_at) < 24h`
- In `cmdClassify()` online path: after closed-state check, if `issueHasWorkflowInProgressLabel(issue.labels) || issueHasRemoteClaimNotes(args.issue)` → `{ verdict: 'blocked', reasoning: 'issue #N has a remote workflow claim' }`

**Update module.exports** (Step A-6): add `extractCoarseAreas`, `extractFilePaths`, `issueHasRemoteClaimNotes`, `issueHasWorkflowInProgressLabel`, `parseDependsOn`, `readOrCreateConfig`

**Tests** (Step A-7): add `classifierScript` constant at line 18; append these spawnSync test cases:
1. `readOrCreateConfig` creates default config on first run
2. `parallel_mode: 'off'` bypasses classifier → `{ verdict: 'green' }`
3. `withForge` stubs: `issueHasWorkflowInProgressLabel([forge.CLAIM_LABEL])` → true; `issueHasRemoteClaimNotes` with recent note → true; missing `updated_at` → true; stale note >24h → false
4. OFFLINE classify with roadmap file containing `blocked by #3` → `{ verdict: 'blocked' }`
5. OFFLINE classify with no roadmap file → `{ verdict: 'green' }`

- Mirror: `scripts/kaola-workflow-classifier.js` (GitHub reference) for all patterns
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`

---

### Task 2: Repair-State Gaps 4, 5
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (append only, after Task A block)
- Write Set: repair-state.js, test-gitlab-workflow-scripts.js
- Depends On: Task 1
- Parallel Group: serial (runs after Task 1)
- Action: MODIFY

**Implement (exact code in `.cache/architect.md` Steps B-1 through B-4 and `.cache/architect-revision-1.md`)**:

**Gap 4 — stateLooksValid + three-way branch** (Steps B-1, B-2):
- Add `stateLooksValid(root, project, content)`: parse `phase` (must be in `PHASES`), check `commandOk` (pattern `^/kaola-workflow-phaseN\s+project$`) OR `skillOk` (pattern `^SKILLS[N]\s+project$`); if `phaseFile` field present and not `N/A`, verify file exists; return `true` only if `status: active`
- Rewrite `repair()` with four return shapes:
  - State absent OR `stateLooksValid()` false → fall-through to reconstruct → write → `{ repaired: true, project, phase, next_skill }` (preserves existing test at lines 405-415)
  - `reconstruct()` returns `complete: true` → `{ repaired: false, complete: true }`
  - `reconstruct().nextCommand !== field(existing, 'next_command')` → write staleContent → `{ repaired: true, stale: true, project, phase, next_skill }`
  - Otherwise (current) → no-write → `{ repaired: false, valid: true, project, phase, next_skill }`
- Existing test regression: verified PASSES — test state has phase 1 with phase3-plan.md present; `stateLooksValid()` returns true (commandOk matches phase 1 pattern); `reconstruct()` returns phase 4; stale branch fires → `{ repaired: true, stale: true }` → `repaired === true` assertion passes

**Gap 5 — Ownership block in stateContent() + last_result rename** (from `.cache/architect-revision-1.md`):
- Rewrite `stateContent()`: insert `## Ownership Rules` block between `## Pending Gates` and `## Last Evidence`:
  - `main_session_role: orchestrator` (always)
  - `implementation_owner: tdd-guide` if `routeResult.phase === 4`, else `N/A`
  - `fix_owner: tdd-guide or build-error-resolver` if `routeResult.phase >= 4`, else `N/A`
  - `inline_emergency_fallback_authorized: no` (always)
  - Blank line before `## Last Evidence` preserved
- Change `last_result: reconstructed` → `last_result: state_repaired_from_artifacts` (rename verified safe: no test asserts on this string)

**Update module.exports** (Step B-4): add `stateLooksValid` to existing exports

**Tests** (Step B-5): append to test file after Task A block:
- `stateLooksValid` returns true for valid state (Step B valid state from `writeState`)
- `stateLooksValid` returns false for invalid phase 9 state
- Three-way branch: valid+current → `{ repaired: false, valid: true }` + no file rewrite (mtime check)
- Three-way branch: valid+complete → `{ repaired: false, complete: true }`
- Three-way branch: valid+stale → `{ repaired: true, stale: true }` + GitLab/Sink section preserved
- **Gap 5 tests** (three test blocks from architect-revision-1.md):
  1. Phase 4 route: `stateContent()` output includes `## Ownership Rules`, `implementation_owner: tdd-guide`, `fix_owner: tdd-guide or build-error-resolver`, `last_result: state_repaired_from_artifacts`
  2. Phase 2 route: output includes `implementation_owner: N/A`, `fix_owner: N/A`
  3. Position: `## Ownership Rules` appears after `## Pending Gates` and before `## Last Evidence`

- Mirror: `scripts/kaola-workflow-repair-state.js:380-396` for `stateLooksValid`; `scripts/kaola-workflow-repair-state.js:398-420` for `repair()` three-way branch
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js && node scripts/simulate-workflow-walkthrough.js`

## Advisor Notes

From `.cache/advisor-plan.md`:
1. **Gap 5 not in original architect**: Covered by `architect-revision-1.md`. `stateContent()` gets `## Ownership Rules` block with phase-conditional values and `last_result` rename.
2. **Existing repair test regression**: Verified passes. State phase 1 + phase3-plan.md → stale branch → `{ repaired: true, stale: true }` → `repaired === true` assertion passes. No test update needed.
3. **`last_result` rename safety**: Grep confirms no test asserts on `reconstructed` or `last_result` in GitLab test file. Rename is safe.
4. **OFFLINE tests**: All OFFLINE test cases must use `spawnSync` with `KAOLA_WORKFLOW_OFFLINE: '1'` env. In-process `withForge` stubs cannot change the `OFFLINE` constant (evaluated at module load).
5. **CONFIG_PATH**: Computed inside `readOrCreateConfig()` for testability via `HOME`/`USERPROFILE` override.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | Gap 5 missing from original blueprint |
