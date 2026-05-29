# Phase 5 - Review: issue-178

## Code Review Findings

### CRITICAL
- **RESOLVED**: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:35` — live `teaExec` path
  was missing `timeout` in its `Object.assign`. The mock path (line 22), injected runner (line 18),
  and `tea --version` probe (line 25) all had the timeout, but the live production path at line 35
  did not. Routed to `build-error-resolver`; fix applied; GT tests (22/22) and full `npm test` pass.

### HIGH
None after fix.

### MEDIUM/LOW
- MEDIUM: `parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10)` lacks clamping —
  `0`, negative, or `NaN` silently disables the timeout protection. Deferred as follow-up
  (operator-controlled env var, not attacker-controlled).
- LOW: `Object.assign({ encoding: 'utf8', timeout: N }, opts || {})` spread order lets callers
  override with `timeout: 0`. Consistent across all paths; acceptable for trusted internal code.
  Deferred as follow-up.
- LOW (security re-check): `parseInt` expression duplicated 4× — maintainability, not security.
- LOW (security re-check): `tea --version` bypass if regex misses — pre-existing, not introduced.

## Security Review
Ran: yes — security-sensitive files touched (external CLI exec, timeout enforcement)

### Findings
- CRITICAL: same as above — RESOLVED after fix
- MEDIUM: parseInt clamping gap (deferred)
- LOW: Object.assign spread order (deferred)
- LOW: DRY on parseInt expression (deferred)
- LOW: version-check bypass pre-existing (deferred)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md and .cache/security-reviewer-recheck.md | |
| review-fix executors | invoked | build-error-resolver fixed kaola-gitea-forge.js:35 | |
| advisor critical gate | N/A | CRITICAL finding was unambiguous one-line mechanical fix; no advisor escalation needed | |

## Fixes Applied
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js:35`: added
  `timeout: parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10)` to `Object.assign`
  on the live `teaExec` return statement.

## Validation Evidence
- `node plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — 22/22 PASSED (after fix)
- `npm test` — full suite PASSED (exit 0): validate-script-sync, GH walkthrough, Codex contracts,
  GL walkthrough, GL Codex walkthrough, GT walkthrough, GT Codex walkthrough

## Follow-Up Items
- MEDIUM: Add `Number.isFinite(n) && n > 0 ? Math.min(n, 600000) : 30000` clamping to
  `KAOLA_GH_REMOTE_TIMEOUT_MS` parse in all six files that use it
- LOW: Invert `Object.assign` spread order to `Object.assign({...defaults}, opts||{}, {timeout:N})`
  so the safeguard cannot be caller-overridden
- LOW: Extract `getRemoteTimeoutMs()` helper to de-duplicate the `parseInt` expression

## Review Status
PASSED WITH FOLLOW-UPS
