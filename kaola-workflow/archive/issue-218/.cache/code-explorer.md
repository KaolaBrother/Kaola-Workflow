# code-explorer — issue-218 (probeIssueState degraded-response, GitLab/Gitea ports)

## 1. Reference Implementation to Mirror

**Root `probeIssueState`** — `scripts/kaola-workflow-active-folders.js` lines 56–70:

```javascript
function probeIssueState(issueNumber) {
  if (OFFLINE || issueNumber == null) return { state: 'open', reason: 'offline-or-null' };
  try {
    const raw = ghExec(['issue', 'view', String(issueNumber), '--json', 'state']);
    if (!raw) return { state: 'unavailable', reason: 'empty gh response' };
    const data = JSON.parse(raw);
    const state = String(data.state || '').toLowerCase() === 'closed' ? 'closed' : 'open';
    return { state, reason: 'ok' };
  } catch (err) {
    if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return { state: 'unavailable', reason: 'timeout' };
    }
    return { state: 'unavailable', reason: 'gh issue fetch failed' };
  }
}
```

Three-way logic: empty raw → `unavailable` (`empty gh response`); `JSON.parse` throw (incl. non-JSON) → catch → `unavailable` (`gh issue fetch failed`); parsed → derive closed/open. Root has NO dedicated non-JSON branch — non-JSON falls into the generic catch. Root calls `ghExec` directly (no forge layer) so it can inspect raw before `JSON.parse`.

**`claimProject` guard** — `scripts/kaola-workflow-claim.js` lines 392–399:

```javascript
if (issueNumber != null) {
    const probe = probeIssueState(issueNumber);
    if (probe.state === 'closed') {
      return { status: 'user_target_closed', ... };
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return { status: 'target_unavailable', claim: 'none', ... 'refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
    }
  }
```

Guard fires on `probe.state === 'unavailable'`. Identical guard verbatim in GitLab port (`kaola-gitlab-workflow-claim.js` 360–367) and Gitea port (`kaola-gitea-workflow-claim.js` 364–371). Guards are already correct — problem is upstream in `probeIssueState`.

## 2. Ports' current probeIssueState + the swallow path

**GitLab** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` 51–62:

```javascript
function probeIssueState(issueIid) {
  if (OFFLINE || issueIid == null) return { state: 'open', reason: 'offline-or-null' };
  try {
    const issue = forge.viewIssue(issueIid);
    return { state: issue.state === 'closed' ? 'closed' : 'open', reason: 'ok' };
  } catch (err) {
    if (err.killed === true || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT') {
      return { state: 'unavailable', reason: 'timeout' };
    }
    return { state: 'unavailable', reason: 'glab issue fetch failed' };
  }
}
```

**Gitea** `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` 51–65: structurally identical, reason `'tea issue fetch failed'`.

Both call `forge.viewIssue(...)` and inspect `issue.state`. Parsing is internal:

**GitLab `viewIssue`** `kaola-gitlab-forge.js` 138–141:
```javascript
function viewIssue(issueIid, opts) {
  const raw = glabExec(['issue', 'view', String(issueIid), '--output', 'json'], opts || {});
  return normalizeIssue(parseJson(raw, {}));
}
```
**Gitea `viewIssue`** `kaola-gitea-forge.js` 168–171: `tea issues view {num} --output json` → `normalizeIssue(parseJson(raw, {}))`.

**Both `parseJson`** (GitLab 26–29, Gitea 44–47) byte-identical:
```javascript
function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (_) { return fallback; }
}
```
The swallow: empty → `{}`; non-JSON → catch → `{}`. Both reach `normalizeIssue({})`.

**`normalizeState`** (GitLab 62–68, Gitea 80–86):
```javascript
function normalizeState(raw) {
  const state = String(raw || '').toLowerCase();
  if (state === 'opened' || state === 'open') return 'open';
  if (state === 'closed') return 'closed';
  if (state === 'merged') return 'merged';
  return state || 'unknown';
}
```
`normalizeIssue({}).state === 'unknown'`. Port `probeIssueState`: `'unknown' !== 'closed'` → ternary returns `'open'` → `{state:'open', reason:'ok'}`. Guard never fires.

**No `viewIssueRaw`-style raw accessor exists** in either forge. Root sidesteps by calling `ghExec` directly.

## 3. Naming / file organization (parity matrix)

| Edition | active-folders | forge | claim | test |
|---|---|---|---|---|
| Root (GitHub) | `scripts/kaola-workflow-active-folders.js` | n/a (inline `ghExec`) | `scripts/kaola-workflow-claim.js` | `scripts/simulate-workflow-walkthrough.js` |
| Codex | `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` (byte-identical to root) | n/a | `.../kaola-workflow-claim.js` | `.../simulate-kaola-workflow-walkthrough.js` |
| GitLab | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | `kaola-gitlab-forge.js` | `kaola-gitlab-workflow-claim.js` | `test-gitlab-workflow-scripts.js` |
| Gitea | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-active-folders.js` | `kaola-gitea-forge.js` | `kaola-gitea-workflow-claim.js` | `test-gitea-workflow-scripts.js` |

Root ↔ Codex byte-identical (enforced by `validate-script-sync.js`). GitLab/Gitea are INDEPENDENT trees — not synced to root.

## 4. Error-handling / degraded patterns
- Root distinguishes empty (`if (!raw)`) from non-JSON (catch). Ports absorb both inside `parseJson(raw,{})` before `probeIssueState` sees anything.
- `unavailable` is already emitted by port `probeIssueState` catch (timeout/generic). `collectClosedSet` in both port closure-audit files already routes `unavailable` → unresolved. The fix adds the degraded-but-no-throw path.
- Exec mocking: `KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT` route subprocess via `process.execPath [mockScript, ...args]`; `options.execFileSync` injection also supported. Gitea mock bypasses the `tea >=0.9.2 --version` gate.

## 5. Tests
**Root** `scripts/simulate-workflow-walkthrough.js`:
- `testProbeIssueStateOffline` (801), `testProbeIssueStateNullIssue` (807), `testProbeIssueStateEmptyGhResponse` (813 — shim outputs `""` exit 0 via `KAOLA_GH_MOCK_SCRIPT`, asserts `unavailable`/`empty gh response`), `testProbeIssueStateGhThrows` (831 — exit 1).
- Root has NO exit-0 non-JSON test (non-JSON == exception path, same reason as throw).
- Hand-rolled `assert`; `writeShimFiles(shimPath, jsLines)` (852, .js only no shebang); `ghMockEnv(binDir)` (885); `callProbeIssueState(argExpr, env, binDir)` (785) spawns subprocess. Called at 4225–4228.

**GitLab** `test-gitlab-workflow-scripts.js` (Node `assert`):
- In-process `withForge` (410–439): stubs `forge.viewIssue` — null (412), throw (420), closed (430). No empty/non-JSON stub.
- Subprocess shim `testGitlabProbeIssueStateOfflineGuard` (2659–2674) via `spawnSync` w/ OFFLINE. Helpers `writeShimFiles` (122), `glabMockEnv(binDir)` (126).
- Run via `simulate-gitlab-workflow-walkthrough.js` → `run('test-gitlab-workflow-scripts.js')` (line 157), `npm run test:kaola-workflow:gitlab`.

**Gitea** `test-gitea-workflow-scripts.js`:
- In-process `withForge` (420–443): null (421), throw (428), closed (437).
- Helpers `writeShimFiles` (120), `teaMockEnv(binDir)` (124). No offline-guard subprocess test.
- Run via `simulate-gitea-workflow-walkthrough.js` → `run('test-gitea-workflow-scripts.js')` (line 245).

New port tests go into `test-gitlab-workflow-scripts.js` / `test-gitea-workflow-scripts.js`. Two test injection levels possible: (a) `withForge` stub of `viewIssue` returning `{state:'unknown'}` (tests probeIssueState mapping) — but bypasses real swallow; (b) subprocess shim feeding empty/non-JSON exit-0 (tests full glabExec→parseJson→normalizeIssue→probeIssueState path, direct mirror of root). Choice depends on where the fix lands.

## 6. Parity / drift / contract checks
- `validate-script-sync.js`: byte-identity root ↔ `plugins/kaola-workflow/scripts` for COMMON_SCRIPTS (incl. `kaola-workflow-active-folders.js`). GitLab/Gitea NOT in scope.
- `validate-workflow-contracts.js` / `validate-kaola-workflow-contracts.js`: assert root/Codex content; NO `probeIssueState` assertion. Codex active-folders must byte-match root.
- `validate-kaola-workflow-gitlab-contracts.js` (387–393): scans every port JS → asserts `!/\bgh\b/` (no `gh` token) and no cross-tree requires.
- `validate-kaola-workflow-gitea-contracts.js` (394–400): asserts `!/\bglab\b/` AND `!/\bgh\b/`, no cross-tree requires.
- **ACTIVE CONSTRAINT on new reason strings**: GitLab files may not contain word `gh` (use `glab`); Gitea files may not contain `glab` or `gh` (use `tea`). e.g. `empty glab response` / `empty tea response`.
- Neither validator constrains probeIssueState three-way logic — editing the ports needs NO root/Codex change.

## 7. Config / env
- `KAOLA_WORKFLOW_OFFLINE` → probe returns `{open, offline-or-null}` (all editions).
- `KAOLA_GH_REMOTE_TIMEOUT_MS` (same name across editions) for exec timeout.
- `KAOLA_GH_MOCK_SCRIPT` / `KAOLA_GLAB_MOCK_SCRIPT` / `KAOLA_TEA_MOCK_SCRIPT` for test CLI override.
- CLI: root `gh issue view {n} --json state`; GitLab `glab issue view {iid} --output json`; Gitea `tea issues view {num} --output json`. Ports fetch full JSON via `--output json`.

## Crux (causal chain for degraded exit-0)
viewIssue → glabExec/teaExec returns empty or non-JSON (exit 0) → `parseJson(raw,{})` → `{}` → `normalizeIssue({})` → `normalizeState(undefined)` → `'unknown'` → port probeIssueState ternary `'unknown'!=='closed'` → `'open'` → guard `=== 'unavailable'` false → claim proceeds. Root avoids it via `if(!raw)` before `JSON.parse`; ports never see raw.

(Full agent transcript preserved above; agentId aebaddd5db155ab96.)
