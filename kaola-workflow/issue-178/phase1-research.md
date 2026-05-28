# Phase 1 - Research / Discovery: issue-178

## Deliverable
Add bounded timeout (30000ms default) and structured `skipped_timeout` failure reporting to all remote `gh`/`glab`/`tea` calls in `scripts/kaola-workflow-closure-audit.js` (and byte-identical Codex mirror + `kaola-workflow-active-folders.js` mirror), plus equivalent changes to GitLab and Gitea closure-audit scripts/forges, plus mocked CLI tests covering the timeout/unavailable path.

## Why
The audit hangs indefinitely when GitHub GraphQL calls hit TLS handshake timeouts, requiring manual `pkill`. Remote-dependent audit classes should time out gracefully and return a structured sentinel so the command exits predictably without blocking the terminal.

## Affected Area

### Primary files (must change in byte-identical lockstep pairs)
- `scripts/kaola-workflow-closure-audit.js` (lines 133, 180, 246 — remote call sites)
- `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` (byte-identical Codex mirror)
- `scripts/kaola-workflow-active-folders.js` (line 43 — `issueIsClosed` remote call)
- `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` (byte-identical Codex mirror)

### Forge/plugin files (independent, not in sync group)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` (already has `execOptions` passthrough at lines 14/16)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` (execOptions passthrough at lines 18/22; unguarded version probe at line 25)

### Test files
- `scripts/simulate-workflow-walkthrough.js` (closure-audit tests ~lines 3201–3500)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (from ~line 1926)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (from ~line 1854)

## Key Patterns Found

1. **`ghExec(args, opts)` already accepts opts spread** — `scripts/kaola-workflow-closure-audit.js:44–49`; pass `{ timeout: 30000 }` to each remote call site without changing function signatures
2. **`'skipped_offline'` sentinel pattern** — non-array string returned by `detectStaleLabels` / `detectUnarchivedPrFolders` when offline; `counts` block uses `Array.isArray(x) ? x.length : 0` so new `'skipped_timeout'` sentinel requires no counts change
3. **30000ms production timeout precedent** — `scripts/kaola-workflow-claim.js:368`; use same value for closure-audit remote calls
4. **GL/GT forge `execOptions` passthrough already exists** — `kaola-gitlab-forge.js:14/16`, `kaola-gitea-forge.js:18/22`; pass `{ execOptions: { timeout: 30000 } }` from closure-audit callers through forge layer
5. **Gitea unguarded version probe** — `kaola-gitea-forge.js:25` calls `execFileSync('tea', ['--version'])` with no timeout; add timeout guard there as part of this fix

## Test Patterns
- Framework: hand-rolled assert IIFEs (no external framework)
- Location: `scripts/simulate-workflow-walkthrough.js`, `plugins/*/scripts/test-*.js`
- Structure: Each test is an IIFE with `try/catch`; uses `assert.strictEqual`, `assert.ok`
- Mock CLI pattern: `writeShimFiles(shimPath, jsLines)` + `KAOLA_GH_MOCK_SCRIPT` / `KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT` env var → `ghExec` routes through `execFileSync(process.execPath, [mock, ...args])`
- Hang-simulating shim: write a shim that sleeps/blocks; assert `result.signal === 'SIGTERM'` or `result.status` indicates timeout; note test runner has its own 60000ms outer timeout

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — existing offline gate; timeout is a separate concern (online but hanging)
- `KAOLA_GH_MOCK_SCRIPT`, `KAOLA_GLAB_MOCK_SCRIPT`, `KAOLA_TEA_MOCK_SCRIPT` — CLI mock env vars for tests
- `scripts/validate-script-sync.js` — enforces byte-identical sync; runs in `npm test`; will fail if `scripts/` and `plugins/kaola-workflow/scripts/` copies drift

## External Docs
- Node.js `execFileSync` `timeout` option: built-in, no external docs needed. When `timeout` fires, the child process receives `killSignal` (default `'SIGTERM'`) and `execFileSync` throws with `.killed === true`. The existing try/catch blocks will catch it.
- docs-lookup: N/A — internal Node.js API, sufficient from code patterns

## GitHub Issue
KaolaBrother/Kaola-Workflow#178

## Completeness Score
10/10

- Goal clarity: 3/3 — add bounded timeout + structured failure JSON to closure-audit remote checks
- Expected outcome: 3/3 — `skipped_timeout` sentinel returned, command exits predictably, tests cover timeout path
- Scope boundaries: 2/2 — byte-identical sync pairs + GL/GT forge layer; test files explicit
- Constraints: 2/2 — 30000ms default, `opts` passthrough pattern, sync enforcement, no retry required

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | Node.js built-in `execFileSync timeout` — internal API, no external docs needed; mock patterns derivable from existing test files |

## Notes / Future Considerations
- The Gitea unguarded version probe (`kaola-gitea-forge.js:25`) is a secondary hang risk; fix as part of this issue since it's in the same forge layer
- No retry logic needed per AC — just bounded timeout + structured skip result
- `executeRepairs` (closure-audit.js:246) is a write operation (label removal); its timeout behavior should probably use the same 30000ms but emit a warning to stderr rather than silently continuing
