# Security Review: issue-150 — Priority-label sorting for GitLab and Gitea listOpenIssues

## Verdict: No CRITICAL, No HIGH, No MEDIUM. One LOW (informational).

## Files Reviewed

- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (lines 265-293)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (lines 268-296)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Reference: `scripts/kaola-workflow-claim.js` (lines 65-102)
- Forge normalization: `kaola-gitlab-forge.js:31-39`, `kaola-gitea-forge.js:48-56`

## Findings by Category

**Path traversal in `readPriorityConfig`**: None. Read target is fixed: `path.join(root, 'kaola-workflow', 'config.json')`. No user/external input in path construction; `root` is the repo root.

**Injection in label processing**: None. Labels pass through forge `labelsOf()` before reaching `priorityTier`. Operations are `includes`, `some/find`, `/^P\d+$/i`, `parseInt` — all scalar string ops. No `eval`, no shell, no dynamic property access from label content.

**Unsafe filesystem operations**: None. `readPriorityConfig` reads a fixed path inside `try/catch`, falls back to `['P0','P1']`. Test writes use `mkdtempSync(os.tmpdir())` outputs with `rmSync` cleanup in `finally`.

**OWASP Top 10**: No applicable concerns. No new network calls, auth, untrusted deserialization, access-control changes, or output rendering.

**Secrets/credentials/tokens**: None introduced.

**Security regression vs. GitHub reference**: None. Omitting `labelName()` is correct (labels already strings in GitLab/Gitea); functionally equivalent.

## Pre-empting Questions (not findings)

- **JSON prototype pollution**: `JSON.parse` + `Array.isArray` gate — a `__proto__` key becomes own property on parsed object, not on `Object.prototype`. Not exploitable.
- **Symlinked config.json**: Requires repo-write access (inside threat boundary); only label string-array extracted for sort order; no exfiltration sink. Not a finding.

## LOW (informational, optional)

`priorityTier` depends on forge contract that `listIssues` returns labels as pre-normalized strings (via `labelsOf()`). If a future forge change returned raw objects, `topTierLabels.includes(label)` would silently mismatch. This is a robustness/maintainability coupling, not a current security defect — the contract holds today. No action required for this issue.

## Test Verification

4 new issue-150 tests pass in both suites. Pre-existing `testStaleWorktreeCheck` failure is from issue #148 and is not security-relevant.

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 0 |
| LOW | 1 (informational) |

Status: APPROVED
