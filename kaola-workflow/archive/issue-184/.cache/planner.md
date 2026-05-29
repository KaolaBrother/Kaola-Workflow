# Planner output — issue #184 (fast path)

Verdict: **PROCEED FAST**. No escalation trigger (no new dep, no public API/schema break — only additive enum value + broadened existing array, no security/auth concern, no cross-issue dependency). Large attribute is purely mechanical edition-mirroring of 4 small near-identical edits.

## Correction to issue text (verified by grep)
`validate-workflow-contracts.js` (root + Codex mirror) does **NOT** parse `KAOLA_GH_REMOTE_TIMEOUT_MS`. Excluded from fix #2 write set. Verified sites: `kaola-workflow-active-folders.js:9` (+Codex), `kaola-workflow-closure-audit.js:42` (+Codex), `kaola-gitlab-forge.js:16,17`, `kaola-gitea-forge.js:18,22,25,35`.

## Write set (9 source + 3 test = 12 files)
Byte-mirror pairs (root↔Codex, must stay identical — `validate-script-sync.js`): `kaola-workflow-closure-audit.js`, `kaola-workflow-active-folders.js`.

### Fix #1 — collectClosedSet keys on state not reason (P1)
closure-audit.js root:74 / Codex:74 / GitLab:68 / Gitea:67
```
- else if (probe.reason === 'timeout') unresolved.push(n);
+ else if (probe.state === 'unavailable') unresolved.push(n);
```
`unavailable` is superset of timeout + fetch-failed + empty; OFFLINE/null return state:'open' so still excluded. Keeps existing timeout/offline tests green.

### Fix #2 — validate KAOLA_GH_REMOTE_TIMEOUT_MS (P1)
closure-audit.js:42 & active-folders.js:9 (root+Codex) — module-top const:
```js
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? n : 30000;
})();
```
Forge files (per-call, preserve per-call read): add local helper near top, replace each inline parse with `remoteTimeoutMs()`:
```js
function remoteTimeoutMs() {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? n : 30000;
}
```
GitLab forge: 2 sites (16,17). Gitea forge: 4 sites (18,22,25,35). No shared module (rejected — cross-file coupling).

### Fix #3 — GitLab probeIssueState OFFLINE guard (P2) — GitLab only
`kaola-gitlab-workflow-active-folders.js`: add `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';` after the forge require (~line 7); change guard at line 50:
```
- if (issueIid == null) return { state: 'open', reason: 'offline-or-null' };
+ if (OFFLINE || issueIid == null) return { state: 'open', reason: 'offline-or-null' };
```
Leave `issueIsClosed` untouched (out of scope; forge returns '' offline anyway).

### Fix #4 — propagate detection-phase skipped_timeout into --execute (P2)
closure-audit.js executeRepairs root:261 / Codex:261 / GitLab:266 / Gitea:265. Key on EXACT sentinel (OFFLINE returns 'skipped_offline' — must not be mislabeled):
```
  const labels = report.drift.stale_in_progress_labels;
- if (Array.isArray(labels)) {
+ if (labels === 'skipped_timeout') {
+   labelsSkippedReason = 'detection_timeout';
+ } else if (Array.isArray(labels)) {
    for (const it of labels) {
```
Existing `if (labelsSkippedReason) repairedObj.labels_skipped_reason = labelsSkippedReason;` emits it. Distinct from existing repair-phase 'timeout'.

## Tests (3 files; follow existing closureAuditShim / runClosureAudit harness; do NOT add Codex test mirror — sync-excluded)
Root `scripts/simulate-workflow-walkthrough.js`, GitLab `test-gitlab-workflow-scripts.js`, Gitea `test-gitea-workflow-scripts.js`:
- `testClosureAuditProbeFailureUnresolved` — `issue view` exit(1), `issue list` `[]`; assert `unresolved_closed_state` includes the planted issue + count===1. (Gitea uses `issues view`/`issues list` plural.)
- `testClosureAuditTimeoutEnvInvalidFallsBack` — hang shim + `KAOLA_GH_REMOTE_TIMEOUT_MS:'not-a-number'`; assert audit exits 0 (no ERR_OUT_OF_RANGE) and routes planted issue to `unresolved`.
- `testGitlabProbeIssueStateOfflineGuard` (GitLab only) — fresh child `node -e` with `KAOLA_WORKFLOW_OFFLINE=1` requiring the module, assert `probeIssueState(42)` → `{state:'open', reason:'offline-or-null'}` (module-top OFFLINE const → must use subprocess).
- `testClosureAuditExecuteDetectionTimeoutPropagates` — hang shim + `--execute` + small timeout; assert `repaired.labels_skipped_reason === 'detection_timeout'` and `labels_removed` empty.
Register each in its suite's call list (+ root `main()`).

Regression watch: `testClosureAuditUnresolvedClosedState`, `testClosureAuditStaleLabelsTimeout`, `testClosureAuditOfflineRemoteClassesSkipped` must stay green.

## Acceptance check
```
cd /Users/ylpromax5/Workspace/Kaola-Workflow && \
node scripts/validate-script-sync.js && \
node scripts/validate-workflow-contracts.js && \
node scripts/validate-kaola-workflow-contracts.js && \
npm test
```

## Out of scope
validate-workflow-contracts.js (no timeout var); issueIsClosed(); existing repair-phase 'timeout' sentinel; docs/CHANGELOG/.env.example (no new var); version bumps/tags; shared-module refactor; Codex test mirrors.
