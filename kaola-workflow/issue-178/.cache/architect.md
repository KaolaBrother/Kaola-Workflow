# Architect Output: issue-178

## Key Findings from File Reads

### Forge re-throw fidelity: VERIFIED SAFE
- GL `glabExec` and GT `teaExec` both use bare `execFileSync(...).trim()` — they do NOT wrap errors in `new Error(...)`. `.killed`/`.signal` survive through `forge.viewIssue` → `probeIssueState`'s catch. No forge-level fix needed for re-throw.

### `probeIssueState` export status: CONFIRMED EXPORTED
- GH `scripts/kaola-workflow-active-folders.js:52-63`: exported, returns `{state, reason}`. Catch uses `catch (_)` — must widen to `catch (err)` for timeout detection.
- GL `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js:49-57`: exported. Catch needs same update. Reason text default: `'glab issue fetch failed'`.
- GT `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js:51-62`: exported. Reason text default: `'tea issue fetch failed'`.

### `tea --version` probe: UNGUARDED (line 25 of kaola-gitea-forge.js)
Bypasses all other timeouts; must be hardened explicitly.

### KAOLA_GH_REMOTE_TIMEOUT_MS: Single env var, all four wrappers

---

## Files to Modify

| # | File | Changes |
|---|------|---------|
| F1a | `scripts/kaola-workflow-active-folders.js` | Add `REMOTE_TIMEOUT_MS` const; inject timeout into `ghExec` Object.assign (line ~36); widen `probeIssueState` catch to detect `err.killed||err.signal==='SIGTERM'||err.code==='ETIMEDOUT'` → `{state:'unavailable',reason:'timeout'}` |
| F1b | `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Byte-identical to F1a |
| F2a | `scripts/kaola-workflow-closure-audit.js` | (1) Add `REMOTE_TIMEOUT_MS` const; (2) inject timeout in `ghExec` Object.assign; (3) import `probeIssueState` instead of `issueIsClosed`; (4) rewrite `collectClosedSet` → returns `{closed:Set,unresolved:number[]}`; (5) `detectStaleLabels` catch → `'skipped_timeout'`; (6) `detectUnarchivedPrFolders` → break loop on timeout, return `'skipped_timeout'`; (7) `buildAuditReport` → unpack `{closed,unresolved}`, conditionally add `drift.unresolved_closed_state` and `counts.unresolved_closed_state` (omit-when-empty); (8) `executeRepairs` → add `labels_skipped_reason:'timeout'` when labels==='skipped_timeout' |
| F2b | `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Byte-identical to F2a |
| F3 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | Widen `probeIssueState` catch (line ~54) to detect timeout. Default reason: `'glab issue fetch failed'` |
| F4 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | Inject `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS||'30000',10)` into `Object.assign` in mock path (line ~17) and live path (line ~18) |
| F5 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | Mirror F2a steps (2)–(8) with GL naming: `probeIssueState` import from GL active-folders; `detectUnarchivedMrFolders`; `unresolved_closed_state` plumbing |
| F6 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` | Same as F3. Default reason: `'tea issue fetch failed'` |
| F7 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | (1) Inject timeout into `teaExec` Object.assign (mock path ~line 22 and live path ~line 35); (2) Wrap `tea --version` probe (line ~25) in `{encoding:'utf8',timeout:parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS||'30000',10)}`; on timeout let error propagate |
| F8 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Mirror F2a steps (2)–(8) with GT naming (uses PR not MR) |
| T1 | `scripts/simulate-workflow-walkthrough.js` | Add 3 hang tests (stale-labels timeout, unresolved-closed-state, PR-folder timeout) + omit-when-empty assertion in existing offline test; register in main() |
| T2 | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Add 3 hang tests (glab, MR naming); register |
| T3 | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Add 3 hang tests (tea); register |

## Files to Create
None.

## Build Sequence (dependency-ordered)
1. **G1 (parallel)**: F1a+F1b [PAIR], F3, F4, F6, F7 — disjoint files, no inter-deps
2. **G2 (parallel, after G1)**: F2a+F2b [PAIR], F5, F8 — closure-audit rewrites depend on their active-folders/forge changes
3. **G3 (parallel, after G2)**: T1, T2, T3 — tests depend on their edition's closure-audit changes
4. **G4 (after G3)**: `npm test` — full validation gate

## Task List

| Task | Name | Files | Depends On | Validation Command | Parallel Group |
|------|------|-------|------------|-------------------|---------------|
| 1 | GH/Codex active-folders timeout | F1a, F1b | — | `node scripts/validate-script-sync.js` | G1 |
| 2 | GL active-folders catch + GL forge timeout | F3, F4 | — | `node scripts/validate-workflow-contracts.js` (or npm test --grep) | G1 |
| 3 | GT active-folders catch + GT forge timeout | F6, F7 | — | `node scripts/validate-workflow-contracts.js` | G1 |
| 4 | GH/Codex closure-audit rewrite | F2a, F2b | Task 1 | `node scripts/validate-script-sync.js` | G2 |
| 5 | GL closure-audit rewrite | F5 | Task 2 | `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (smoke) | G2 |
| 6 | GT closure-audit rewrite | F8 | Task 3 | `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (smoke) | G2 |
| 7 | GH hang tests | T1 | Task 4 | `node scripts/simulate-workflow-walkthrough.js` exits 0 | G3 |
| 8 | GL hang tests | T2 | Task 5 | `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` exits 0 | G3 |
| 9 | GT hang tests | T3 | Task 6 | `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` exits 0 | G3 |
| 10 | Full validation | — | Tasks 7–9 | `npm test` exits 0 | G4 |

## Design Decisions (canonical)
- **D1**: `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10)` in every exec wrapper; read per-call (not module top) to allow per-subprocess override
- **D2**: `collectClosedSet` uses `probeIssueState` (not `issueIsClosed`); returns `{closed:Set,unresolved:number[]}`
- **D3**: `probeIssueState` catch detects `err.killed||err.signal==='SIGTERM'||err.code==='ETIMEDOUT'` → reason:'timeout'
- **D4**: `detectStaleLabels` timeout → return `'skipped_timeout'`
- **D5**: `detectUnarchivedPrFolders`/`detectUnarchivedMrFolders` — first timeout short-circuits whole loop → `'skipped_timeout'`
- **D6**: `unresolved_closed_state` omit-when-empty
- **D7**: `labels_skipped_reason:'timeout'` top-level on `repaired` object, only when labels==='skipped_timeout'
- **D8**: Gitea `tea --version` probe at forge.js line 25 gets explicit timeout
- **D9**: Byte-identical sync pair must be edited in same commit
- **D10**: Hang test shim: `setInterval(() => {}, 1 << 30)` — no shebang, routed via KAOLA_*_MOCK_SCRIPT; tests set `KAOLA_GH_REMOTE_TIMEOUT_MS=300`

## Edge Cases
- GL `probeIssueState` OFFLINE path: gate is inside `glabExec` (returns '' offline); `probeIssueState` doesn't gate OFFLINE itself but returns `{state:'open',reason:'ok'}` on the '' path — preserves current offline behavior since `collectClosedSet` running offline produces empty closed set (existing behavior unchanged)
- `tea --version` probe bypass: `KAOLA_TEA_MOCK_SCRIPT` check occurs BEFORE the version probe — confirmed mock path bypasses probe
- `omit-when-empty` implementation: conditional assignment into local `drift` object BEFORE the `return`; assertion in existing offline test
