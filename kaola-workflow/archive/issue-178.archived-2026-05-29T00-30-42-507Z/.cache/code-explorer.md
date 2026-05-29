# Code Explorer: issue-178

## Summary

### closure-audit.js Structure and Remote Call Sites

Primary file: `scripts/kaola-workflow-closure-audit.js`
Byte-identical Codex mirror: `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`

Remote call sites (all via `ghExec(args, opts)` which calls `execFileSync('gh', ...)` with NO timeout):
- Line 133: `gh issue list --state closed --label workflow:in-progress` in `detectStaleLabels()`
- Line 180: `gh pr view <url> --json state` in `detectUnarchivedPrFolders()` (inside a loop over active folders)
- Line 246: `gh issue edit N --remove-label workflow:in-progress` in `executeRepairs()` (inside a loop)

Additional remote call via imported module `kaola-workflow-active-folders.js`:
- `scripts/kaola-workflow-active-folders.js:43`: `gh issue view N --json state` in `issueIsClosed()` — called O(distinct candidate issue numbers) times; also has its own separate `ghExec` at line 33–38 with no timeout

Both `ghExec` functions accept an `opts` arg and spread it into `execFileSync` options — timeout can be injected by passing `{ timeout: N }` without changing function signatures.

### OFFLINE Path
- `ghExec` returns `''` when `KAOLA_WORKFLOW_OFFLINE === '1'` — skips all remote calls
- `detectStaleLabels` returns sentinel string `'skipped_offline'` (not an array) when offline
- `detectUnarchivedPrFolders` returns `'skipped_offline'` when offline
- `issueIsClosed` (active-folders.js:40) returns `false` when offline
- `counts.stale_in_progress_labels` uses `Array.isArray(x) ? x.length : 0` — already handles sentinel strings

### GL/GT/Codex Equivalents

All four editions have closure-audit scripts:
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` — byte-identical Codex mirror (sync enforced by `scripts/validate-script-sync.js`)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` — separate GitLab port; routes via `kaola-gitlab-forge.js:glabExec()` (line 10–18); forge already has `options.execOptions` passthrough at lines 14/16
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` — separate Gitea port; routes via `kaola-gitea-forge.js:teaExec()` (line 12–36); forge has `execOptions` passthrough at lines 18/22; extra risk: unguarded version probe at `kaola-gitea-forge.js:25` (`execFileSync('tea', ['--version'])`) with no timeout

Byte-identical sync group (both must change in lockstep):
- `scripts/kaola-workflow-closure-audit.js` ↔ `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js`
- `scripts/kaola-workflow-active-folders.js` ↔ `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js`

GL/GT are separate (not in sync group) — must be updated independently.

### Existing Timeout Patterns

| File | Line | Value | Context |
|------|------|-------|---------|
| `scripts/kaola-workflow-claim.js` | 368 | `timeout: 30000` | `classifyIssue()` subprocess — only production timeout precedent |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | 368 | `timeout: 30000` | byte-identical mirror |
| test harness files | various | `timeout: 60000` | test-only, not production |

**No timeout exists on any production gh/glab/tea remote call in any closure-audit script or in `issueIsClosed`.** 30000ms is the established production precedent.

No retry logic in closure-audit code paths.

### Test Mock Patterns

All three test suites use the same shim pattern:
1. `writeShimFiles(shimPath, jsLines)` writes a `.js` shim file (NOT shebang — Darwin shebang-exec hangs)
2. `ghMockEnv(binDir)` sets `KAOLA_GH_MOCK_SCRIPT` to `binDir/gh.js` if it exists
3. `ghExec` in scripts checks this env var and routes through `execFileSync(process.execPath, [mock, ...args])`
4. Shims match `process.argv.slice(2).join(' ')` against subcommand patterns

To test timeout: shim can sleep/block indefinitely; test runner asserts `result.signal === 'SIGTERM'` and elapsed time is under 2× the configured timeout.

### Key Naming Conventions
- Remote-skipped sentinel: `'skipped_offline'` → new timeout sentinel should be `'skipped_timeout'`
- Non-fatal warnings via `process.stderr.write('closure-audit: ...')` — not exceptions
- Catch blocks already present on all remote calls; `execFileSync` timeout throws caught by same handlers (`.killed === true` / `.signal === 'SIGTERM'`)
- `counts` field already uses `Array.isArray(x) ? x.length : 0` — handles new sentinel with no changes to counts block

### Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-closure-audit.js` | Primary GitHub edition — lines 133, 180, 246 are remote call sites |
| `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | Byte-identical Codex mirror |
| `scripts/kaola-workflow-active-folders.js` | `issueIsClosed` + separate `ghExec` at line 43; in sync group |
| `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | Byte-identical mirror |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js` | GitLab port |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js` | Gitea port |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | glabExec; already has execOptions passthrough |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | teaExec; execOptions passthrough; unguarded version probe at line 25 |
| `scripts/kaola-workflow-claim.js:368` | Only production timeout precedent (30000ms) |
| `scripts/validate-script-sync.js` | Byte-identical sync enforcer; runs in npm test |
| `scripts/simulate-workflow-walkthrough.js` | Primary test suite; closure-audit tests ~lines 3201–3500 |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | GitLab test suite; closure-audit tests from ~line 1926 |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Gitea test suite; closure-audit tests from ~line 1854 |
