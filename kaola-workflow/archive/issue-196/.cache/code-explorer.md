# Code Explorer — Issue #196

## Entry Points

- `npm test` runs four sub-suites sequentially (package.json line 35–39).
- GitLab sub-suite: `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
- Gitea sub-suite: `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`

## 1. OFFLINE Short-Circuit Code

**GitLab** — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`

```js
// line 21 — module-level constant
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

// line 1052–1057 — cmdAuditLabels()
function cmdAuditLabels() {
  if (OFFLINE) { output({ stale: [], offline: true }); return; }   // line 1053
  ...
}

// line 1059–1072 — cmdRepairLabels()
function cmdRepairLabels() {
  if (OFFLINE) { output({ dry_run: false, offline: true, removed: [], failed: [] }); return; }  // line 1061
  ...
}
```

`kaola-gitlab-forge.js` line 20: `if (OFFLINE) return options.offlineStdout || '';` — second gate before mock is reached.

**Gitea** — `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`

```js
// line 21
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

// line 1038–1043 — cmdAuditLabels()
function cmdAuditLabels() {
  if (OFFLINE) { output({ stale: [], offline: true }); return; }   // line 1039
  ...
}

// line 1045–1059 — cmdRepairLabels()
function cmdRepairLabels() {
  if (OFFLINE) { output({ dry_run: false, offline: true, removed: [], failed: [] }); return; }  // line 1047
  ...
}
```

`kaola-gitea-forge.js` line 25: `if (OFFLINE) return options.offlineStdout || '';` — second gate.

## 2. testAuditAndRepairLabels Functions

**GitLab** — `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`, lines 84–151.

Three sub-cases. Each calls `spawnSync` directly with:
```js
env: Object.assign({}, process.env, { KAOLA_GLAB_MOCK_SCRIPT: mockScript })
```
**No `KAOLA_WORKFLOW_OFFLINE: '0'` override.** When parent OFFLINE=1, subprocess inherits it and short-circuits before reaching mock. Assert at line 115 (`result.stale.length === 1`) fails.

**Gitea** — `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`, lines 122–240.

Three sub-cases via helper `_runClaimOnline(args, tmp, binDir)` (lines 107–120):
```js
function _runClaimOnline(args, cwd, binDir) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    env: {
      ...process.env,
      KAOLA_WORKFLOW_OFFLINE: '0',      // line 112 — explicit override
      ..._teaMockEnv(binDir),
      PATH: binDir + path.delimiter + ...
    }
  });
}
```
**Already has `KAOLA_WORKFLOW_OFFLINE: '0'`.** Gitea should pass under OFFLINE=1; verify empirically.

## 3. Mock-Online Mode Activation

**GitLab:** `kaola-gitlab-forge.js` — `glabExec()`:
```js
if (OFFLINE) return options.offlineStdout || '';   // line 20 — blocks mock if OFFLINE=true
const mock = process.env.KAOLA_GLAB_MOCK_SCRIPT;  // line 21
if (mock) return execFileSync(process.execPath, [mock, ...args], ...); // line 22
```
No `_runClaimOnline` helper in GitLab walkthrough; 3 inline `spawnSync` calls.

**Gitea:** `kaola-gitea-forge.js` — `teaExec()`:
```js
if (OFFLINE) return options.offlineStdout || '';   // line 25
const mock = process.env.KAOLA_TEA_MOCK_SCRIPT;   // line 27
if (mock) return execFileSync(process.execPath, [mock, ...args], ...); // line 28
```
`_teaMockEnv(binDir)` (lines 103–105) returns `{ KAOLA_TEA_MOCK_SCRIPT: jsPath }`.

## 4. GitHub Edition — Passes Under OFFLINE=1

`scripts/simulate-workflow-walkthrough.js`, `runClaimOnline()` lines 537–554:
```js
env: {
  ...process.env,
  KAOLA_WORKTREE_NATIVE: '1',
  KAOLA_WORKFLOW_OFFLINE: '0',     // line 546
  ...ghMockEnv(binDir),
  PATH: ...
}
```
Explicit `KAOLA_WORKFLOW_OFFLINE: '0'` overrides inherited parent OFFLINE.

## 5. npm test Command

`package.json` lines 35–39:
```
"test": "npm run test:kaola-workflow:claude && npm run test:kaola-workflow:codex && npm run test:kaola-workflow:gitlab && npm run test:kaola-workflow:gitea"
```
- `test:kaola-workflow:gitlab`: validate-contracts → simulate-gitlab-workflow-walkthrough → simulate-gitlab-codex-workflow-walkthrough
- `test:kaola-workflow:gitea`: validate-contracts → simulate-gitea-workflow-walkthrough → simulate-gitea-codex-workflow-walkthrough

## 6. OFFLINE Env Var Handling

Read as module-level constant (`const OFFLINE = ...`) in claim scripts and forge files. Not passed forward; subprocess `spawnSync` inherits via `process.env` spread unless explicitly overridden with `KAOLA_WORKFLOW_OFFLINE: '0'`.

## 7. Existing Pattern for OFFLINE Override

| Location | Override |
|----------|----------|
| `scripts/simulate-workflow-walkthrough.js:546` | `KAOLA_WORKFLOW_OFFLINE: '0'` |
| `plugins/kaola-workflow-gitea/…/simulate-gitea-workflow-walkthrough.js:112` | `KAOLA_WORKFLOW_OFFLINE: '0'` |
| `plugins/kaola-workflow-gitlab/…/simulate-gitlab-workflow-walkthrough.js` | **MISSING** — bug |

## 8. File/Naming Conventions

| Pattern | Example |
|---------|---------|
| Plugin walkthroughs | `simulate-{gitlab,gitea}-workflow-walkthrough.js` |
| Plugin claim scripts | `kaola-{gitlab,gitea}-workflow-claim.js` |
| Forge helpers | `kaola-{gitlab,gitea}-forge.js` |
| Mock env var | `KAOLA_{GLAB,TEA}_MOCK_SCRIPT` |
| Mock helper fn | `ghMockEnv(binDir)` (GH), `_teaMockEnv(binDir)` (Gitea), no equivalent for GitLab |

GitLab walkthrough inlines `spawnSync` (3 calls) vs Gitea's `_runClaimOnline` helper — that difference is why the override was never added.

## 9. OFFLINE Documentation

- `.env.example` line 9: `# KAOLA_WORKFLOW_OFFLINE=0` — "Offline mode: set to 1 to run without GitHub API access"
- `README.md` line 544: "Skip GitHub/GitLab/Gitea calls for local tests or air-gapped usage"
- `docs/api.md` lines 76, 108, 328, 439, 490, 533, 714, 724 — all three editions documented

## Root Cause Summary

**Confirmed bug: GitLab walkthrough only.**
Three `spawnSync` calls in `testAuditAndRepairLabels` (lines 84–151) are missing `KAOLA_WORKFLOW_OFFLINE: '0'`. When the parent process has `OFFLINE=1`, the subprocess inherits it and short-circuits before reaching the mock. Assert `stale.length === 1` fails.

**Gitea: code shows it is already fixed** (line 112 of `_runClaimOnline` has the override). Needs empirical verification.

**Fix:** Add `KAOLA_WORKFLOW_OFFLINE: '0'` to each of the three `spawnSync` env objects in GitLab walkthrough `testAuditAndRepairLabels`, matching the Gitea `_runClaimOnline` pattern.
