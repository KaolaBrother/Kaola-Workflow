# Planner Output: issue-178

## Summary
Add bounded 30s timeout at the lowest-level exec wrappers in all closure-audit editions (GitHub + byte-identical Codex mirror, GitLab, Gitea). Detect timeout-signalled errors in catch blocks and return `'skipped_timeout'` sentinel parallel to `'skipped_offline'`. Surface partial `unresolved_closed_state` array for per-issue probes that time out. Add `KAOLA_CLOSURE_AUDIT_TIMEOUT_MS` env var override for test speed. Add hang-shim tests in all three test suites.

## Selected Approach: Default timeout at lowest-level exec wrapper + skipped_timeout sentinel

Add `timeout: 30000` (or `KAOLA_CLOSURE_AUDIT_TIMEOUT_MS`) to the `Object.assign` inside each edition's lowest-level exec wrapper (`ghExec` in closure-audit.js and active-folders.js for GitHub; `glabExec`/`teaExec` in forges for GL/GT). Catch blocks distinguish timeout (`err.killed === true || err.signal === 'SIGTERM'`) from other failures and return `'skipped_timeout'` for the affected remote class.

## Implementation Phases

### Phase 1: GitHub edition wrappers (byte-identical sync pairs)
1. Add `timeout: KAOLA_CLOSURE_AUDIT_TIMEOUT_MS || 30000` to `ghExec` Object.assign in `scripts/kaola-workflow-closure-audit.js:44`
2. Same for `scripts/kaola-workflow-active-folders.js:33`
3. Byte-identical mirror: `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` + `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js`

### Phase 2: GitHub edition catches and sentinel
4. `detectStaleLabels` catch: if `err.killed || err.signal === 'SIGTERM'` → return `'skipped_timeout'`
5. `detectUnarchivedPrFolders` catch: timeout-flag pattern → return `'skipped_timeout'` for the class
6. `collectClosedSet`/`probeIssueState`: propagate timeout reason; `unresolved_closed_state` array on report
7. `executeRepairs` label-removal loop: break on timeout, add `labels_skipped_reason: 'timeout'`
8. Byte-identical mirror (Steps 4–7)

### Phase 3: GitLab edition
9. Add default timeout to `glabExec` in `kaola-gitlab-forge.js`
10. Timeout-aware catches + `unresolved_closed_state` in `kaola-gitlab-workflow-closure-audit.js`

### Phase 4: Gitea edition
11. Add default timeout to `teaExec` in `kaola-gitea-forge.js`; harden `tea --version` probe at line 25
12. Timeout-aware catches in `kaola-gitea-workflow-closure-audit.js`

### Phase 5: Test coverage
13. 3 hang-shim tests in `scripts/simulate-workflow-walkthrough.js` (~line 3450)
14. Same 3 tests in `test-gitlab-workflow-scripts.js` (~line 1926)
15. Same 3 tests + version-probe test in `test-gitea-workflow-scripts.js` (~line 1854)

## Key Design Decisions
- **Timeout location**: lowest-level exec wrapper (not call sites) — prevents future call sites forgetting
- **Sentinel**: `'skipped_timeout'` (not reusing `'skipped_offline'`) — counts block handles via `Array.isArray()` check
- **Timeout detection**: `err.killed === true || err.signal === 'SIGTERM'`
- **Partial closed-set**: `unresolved_closed_state: [N, ...]` (omit-when-empty)
- **No retries**
- **Test override env var**: `KAOLA_CLOSURE_AUDIT_TIMEOUT_MS` (default 30000)

## Out of Scope
- git porcelain calls (isDirty, getRoot)
- refactoring ghExec into shared module
- changing OFFLINE semantics
- other claim.js remote call sites
- Codex/skill markdown changes

## Risks
- 30s fires on slow link → mitigated by KAOLA_CLOSURE_AUDIT_TIMEOUT_MS override
- err.killed vs err.signal variance → check both
- forge wrapping suppresses err.signal → verify re-throw paths before GL/GT catches
- unresolved_closed_state breaks consumers → omit-when-empty (purely additive)
- Byte-identical sync drift → run validate-script-sync after each lockstep pair

## Success Criteria
- `npm test` exits 0
- New hang-shim tests pass and run <2s each
- validate-script-sync.js reports no drift
- `KAOLA_CLOSURE_AUDIT_TIMEOUT_MS=100` smoke test returns `skipped_timeout` sentinel and exits 0

## Files to Touch
- `scripts/kaola-workflow-closure-audit.js`
- `scripts/kaola-workflow-active-folders.js`
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` (byte-identical mirror)
- `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` (byte-identical mirror)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- `scripts/simulate-workflow-walkthrough.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
