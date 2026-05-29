# Phase 3 - Plan: issue-178

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-active-folders.js` | Add `REMOTE_TIMEOUT_MS` const; inject timeout into `ghExec` Object.assign; widen `probeIssueState` catch to `catch (err)` and detect timeout | Enable per-issue probe to detect hang; active-folders is also called by claim.js — adding timeout is an improvement |
| `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Byte-identical to above | Sync pair contract |
| `scripts/kaola-workflow-closure-audit.js` | Add `REMOTE_TIMEOUT_MS` const; inject timeout in `ghExec` Object.assign; import `probeIssueState`; rewrite `collectClosedSet`; `detectStaleLabels` catch → `'skipped_timeout'`; `detectUnarchivedPrFolders` → break on timeout; `buildAuditReport` → unpack `{closed,unresolved}`, add `unresolved_closed_state` omit-when-empty; `executeRepairs` → D11 break-on-first-timeout with `labels_skipped_reason:'timeout'` | Core timeout-guard implementation |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Byte-identical to above | Sync pair contract |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | Widen `probeIssueState` catch to detect timeout; default reason: `'glab issue fetch failed'` | GL edition parity |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | Inject `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS\|\|'30000',10)` into `Object.assign` on both mock and live paths | GL forge wrapper |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | Mirror GH closure-audit changes with GL naming (`detectUnarchivedMrFolders`, `glab` call sites) | GL edition parity |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` | Widen `probeIssueState` catch to detect timeout; default reason: `'tea issue fetch failed'` | GT edition parity |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | Inject timeout into `teaExec` Object.assign (both mock and live paths); add explicit timeout to `tea --version` probe at line 25 | GT forge wrapper + unguarded probe hardening |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Mirror GH closure-audit changes with GT naming (uses PR not MR) | GT edition parity |
| `scripts/simulate-workflow-walkthrough.js` | Add 3 hang tests: stale-labels timeout, unresolved-closed-state, PR-folder timeout; add omit-when-empty assertion in existing offline test; register in main() | GH hang test coverage |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add 3 hang tests (glab, MR naming); register | GL hang test coverage |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add 3 hang tests (tea); register | GT hang test coverage |

### Build Sequence
1. G1 (parallel): Tasks 1, 2, 3 — disjoint files, no inter-deps (active-folders + forge changes)
2. G2 (parallel, after G1): Tasks 4, 5, 6 — closure-audit rewrites depend on their edition's active-folders/forge changes
3. G3 (parallel, after G2): Tasks 7, 8, 9 — tests depend on their edition's closure-audit changes
4. G4 (after G3): Task 10 — full validation gate

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| G1 | 1, 2, 3 | Disjoint files: GH/Codex active-folders, GL active-folders + forge, GT active-folders + forge |
| G2 | 4, 5, 6 | Disjoint files: GH/Codex closure-audit, GL closure-audit, GT closure-audit |
| G3 | 7, 8, 9 | Disjoint files: GH walkthrough tests, GL tests, GT tests |
| G4 | 10 | Full `npm test` — serial gate |

### External Dependencies
None. All changes use existing `execFileSync`, `process.env`, and project-internal exports.

## Task List

### Task 1: GH/Codex active-folders timeout [PAIR]
- File: `scripts/kaola-workflow-active-folders.js` + `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (covered in Task 7)
- Write Set: both active-folders files (byte-identical)
- Depends On: none
- Parallel Group: G1
- Action: MODIFY
- Implement:
  1. Add `const REMOTE_TIMEOUT_MS = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);` near top of each file
  2. In `ghExec`: change `Object.assign({ encoding: 'utf8' }, options.execOptions || {})` to `Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, options.execOptions || {})`
  3. In `probeIssueState`: change `catch (_)` to `catch (err)` and add detection: `if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') return { state: 'unavailable', reason: 'timeout' };`
- Mirror: `skipped_offline` pattern in same file; `Object.assign` spread precedence from `claim.js:368`
- Validate: `node scripts/validate-script-sync.js` (both files must be byte-identical)

### Task 2: GL active-folders catch + GL forge timeout
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` + `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (covered in Task 8)
- Write Set: both GL files
- Depends On: none
- Parallel Group: G1
- Action: MODIFY
- Implement:
  1. In `kaola-gitlab-workflow-active-folders.js` `probeIssueState`: widen catch to `catch (err)`, add same timeout detection; default reason text: `'glab issue fetch failed'`
  2. In `kaola-gitlab-forge.js`: add `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10)` to the `Object.assign` in both mock path (~line 17) and live path (~line 18)
- Mirror: GL forge `Object.assign` pattern matches GH `ghExec` pattern; verified bare `execFileSync` re-throw in forge
- Validate: `node scripts/validate-workflow-contracts.js` or smoke `KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js --smoke`

### Task 3: GT active-folders catch + GT forge timeout
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` + `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (covered in Task 9)
- Write Set: both GT files
- Depends On: none
- Parallel Group: G1
- Action: MODIFY
- Implement:
  1. In `kaola-gitea-workflow-active-folders.js` `probeIssueState`: widen catch to `catch (err)`, add same timeout detection; default reason text: `'tea issue fetch failed'`
  2. In `kaola-gitea-forge.js`:
     - Add `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10)` to `Object.assign` in mock path (~line 22) and live `teaExec` path (~line 35)
     - Harden `tea --version` probe at line 25: change `execFileSync('tea', ['--version'], { encoding: 'utf8' })` to `execFileSync('tea', ['--version'], { encoding: 'utf8', timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10) })`
  3. Mock path at line 22 confirmed to run BEFORE version probe at line 25 — no test-suite risk
- Mirror: GT forge `teaExec` pattern; `KAOLA_TEA_MOCK_SCRIPT` bypass ordering verified
- Validate: `node scripts/validate-workflow-contracts.js` or GT smoke test

### Task 4: GH/Codex closure-audit rewrite [PAIR]
- File: `scripts/kaola-workflow-closure-audit.js` + `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (covered in Task 7)
- Write Set: both closure-audit files (byte-identical)
- Depends On: Task 1
- Parallel Group: G2
- Action: MODIFY
- Implement:
  1. Add `const REMOTE_TIMEOUT_MS = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);` near top
  2. In `ghExec` Object.assign: inject `timeout: REMOTE_TIMEOUT_MS` (same as Task 1)
  3. Import `probeIssueState` from active-folders (or `require` it at top of file)
  4. Rewrite `collectClosedSet`:
     - Call `probeIssueState(issue)` instead of `issueIsClosed(issue)` for each issue number
     - Accumulate `closed: new Set()` and `unresolved: []`
     - If `probeIssueState` returns `{state:'unavailable', reason:'timeout'}`, push issue number to `unresolved`
     - If returns `{state:'closed'}`, add to `closed`
     - Return `{closed, unresolved}`
  5. `detectStaleLabels` catch: detect `err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT'` → `return 'skipped_timeout'`
  6. `detectUnarchivedPrFolders`: wrap each remote call; on first timeout → `return 'skipped_timeout'` (break loop)
  7. `buildAuditReport`: unpack `{closed, unresolved}` from `collectClosedSet`; conditionally add `drift.unresolved_closed_state = unresolved` and `counts.unresolved_closed_state = unresolved.length` only when `unresolved.length > 0` (omit-when-empty)
  8. `executeRepairs` (D11): in per-label `gh issue edit` loop, catch timeout; on timeout → push timed-out label to `labels_failed`, set `repaired.labels_skipped_reason = 'timeout'`, break loop
- Mirror: `skipped_offline` parallel; `counts` block `Array.isArray(x) ? x.length : 0` pattern
- Validate: `node scripts/validate-script-sync.js` (byte-identical pair check)

### Task 5: GL closure-audit rewrite
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- Test File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (covered in Task 8)
- Write Set: GL closure-audit file
- Depends On: Task 2
- Parallel Group: G2
- Action: MODIFY
- Implement: Mirror Task 4 steps (1)–(8) with GL naming:
  - `glabExec` timeout injection (already in forge; verify Object.assign in closure-audit if `glabExec` is re-declared there or imported)
  - `probeIssueState` import from GL active-folders
  - `detectUnarchivedMrFolders` (not PrFolders) → `'skipped_timeout'`
  - `unresolved_closed_state` plumbing same as GH
  - `executeRepairs` D11 break-on-first-timeout same as GH
- Mirror: GL closure-audit pattern mirrors GH except `MR` naming
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` exits 0

### Task 6: GT closure-audit rewrite
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (covered in Task 9)
- Write Set: GT closure-audit file
- Depends On: Task 3
- Parallel Group: G2
- Action: MODIFY
- Implement: Mirror Task 4 steps (1)–(8) with GT naming:
  - `teaExec` timeout injection (already in forge; verify import in closure-audit)
  - `probeIssueState` import from GT active-folders
  - `detectUnarchivedPrFolders` (PR not MR for Gitea) → `'skipped_timeout'`
  - `unresolved_closed_state` plumbing same as GH
  - `executeRepairs` D11 break-on-first-timeout same as GH
- Mirror: GT closure-audit pattern mirrors GH except `tea` naming and PR (not MR)
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` exits 0

### Task 7: GH hang tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same
- Write Set: `scripts/simulate-workflow-walkthrough.js`, `scripts/test-shims/hang-forever.js` (new shim file)
- Depends On: Task 4
- Parallel Group: G3
- Action: MODIFY
- Implement:
  1. Create shim `scripts/test-shims/hang-forever.js`:
     ```js
     setInterval(() => {}, 1 << 30);
     ```
     (No shebang — macOS shebang-exec hang workaround per D10)
  2. Add 3 tests to `simulate-workflow-walkthrough.js`, each setting `KAOLA_GH_REMOTE_TIMEOUT_MS=300` and routing the relevant mock script env var to the shim:
     - **Hang test A** (`stale-labels timeout`): set `KAOLA_GH_MOCK_SCRIPT` to shim; call `detectStaleLabels`; assert result === `'skipped_timeout'`
     - **Hang test B** (`unresolved-closed-state`): set `KAOLA_GH_MOCK_SCRIPT` to shim; call `collectClosedSet([N])`; assert `unresolved` includes N
     - **Hang test C** (`PR-folder timeout`): set `KAOLA_GH_MOCK_SCRIPT` to shim; call `detectUnarchivedPrFolders`; assert result === `'skipped_timeout'`
  3. Add assertion to existing offline test: `buildAuditReport` with empty `unresolved` does NOT include `unresolved_closed_state` in output
  4. Register all 3 new tests in `main()`
- Mirror: Existing hang test structure in walkthrough (if any); `KAOLA_WORKFLOW_OFFLINE` test pattern
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0; each hang test completes < 2s

### Task 8: GL hang tests
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Write Set: test file + `plugins/kaola-workflow-gitlab/scripts/test-shims/hang-forever.js`
- Depends On: Task 5
- Parallel Group: G3
- Action: MODIFY
- Implement: Mirror Task 7 with GL naming:
  - Shim: `plugins/kaola-workflow-gitlab/scripts/test-shims/hang-forever.js`
  - `KAOLA_GLAB_MOCK_SCRIPT` env var (or equivalent GL mock env var)
  - 3 hang tests: stale-labels timeout, unresolved-closed-state, MR-folder timeout
  - Register in GL test suite main()
- Validate: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` exits 0

### Task 9: GT hang tests
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Write Set: test file + `plugins/kaola-workflow-gitea/scripts/test-shims/hang-forever.js`
- Depends On: Task 6
- Parallel Group: G3
- Action: MODIFY
- Implement: Mirror Task 7 with GT naming:
  - Shim: `plugins/kaola-workflow-gitea/scripts/test-shims/hang-forever.js`
  - `KAOLA_TEA_MOCK_SCRIPT` env var (confirmed mock bypass runs before `tea --version` probe)
  - 3 hang tests: stale-labels timeout, unresolved-closed-state, PR-folder timeout
  - Register in GT test suite main()
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` exits 0

### Task 10: Full validation
- File: none (validation only)
- Write Set: none
- Depends On: Tasks 7, 8, 9
- Parallel Group: G4
- Action: VALIDATE
- Validate: `npm test` exits 0; `node scripts/validate-script-sync.js` exits 0

## Advisor Notes
From `.cache/advisor-plan.md`:
- **D11 locked**: `executeRepairs` per-label `gh issue edit` timeout → break on first timeout, push to `labels_failed`, set `labels_skipped_reason: 'timeout'` top-level, break loop
- `tea --version` bypass ordering verified: mock path at line 22 precedes probe at line 25 — no test scaffolding gap
- All 10 tasks fully specified; G1→G2→G3→G4 dependency chain is safe

## Design Decisions (canonical)
- **D1**: `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10)` in every exec wrapper; read per-call (not module top) to allow per-subprocess override
- **D2**: `collectClosedSet` uses `probeIssueState` (not `issueIsClosed`); returns `{closed:Set,unresolved:number[]}`
- **D3**: `probeIssueState` catch detects `err.killed||err.signal==='SIGTERM'||err.code==='ETIMEDOUT'` → `{state:'unavailable',reason:'timeout'}`
- **D4**: `detectStaleLabels` timeout → return `'skipped_timeout'`
- **D5**: `detectUnarchivedPrFolders`/`detectUnarchivedMrFolders` — first timeout short-circuits whole loop → `'skipped_timeout'`
- **D6**: `unresolved_closed_state` omit-when-empty
- **D7**: `labels_skipped_reason:'timeout'` top-level on `repaired` object, only when labels==='skipped_timeout'
- **D8**: Gitea `tea --version` probe at forge.js line 25 gets explicit timeout; mock bypass ordering confirmed safe
- **D9**: Byte-identical sync pairs must be edited in same task and validated with `validate-script-sync.js`
- **D10**: Hang test shim: `setInterval(() => {}, 1 << 30)` — no shebang; routed via KAOLA_*_MOCK_SCRIPT; tests set `KAOLA_GH_REMOTE_TIMEOUT_MS=300`
- **D11**: `executeRepairs` per-label `gh issue edit` timeout → break on first, push to `labels_failed`, set `repaired.labels_skipped_reason = 'timeout'`, break loop

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | D11 and D8 decisions folded into plan directly after advisor gap identification | No separate architect revision needed; gaps were decision items, not blueprint errors |
