# Code Explorer — issue-185: Cap KAOLA_GH_REMOTE_TIMEOUT_MS upper bound

## All sites reading/validating KAOLA_GH_REMOTE_TIMEOUT_MS

**6 production sites, all with identical `Number.isInteger(n) && n > 0` guard, no upper-bound cap.**

### Sites 1-4 (IIFE pattern — byte-identical pairs, enforced by validate-script-sync.js)

**Site 1 — `scripts/kaola-workflow-active-folders.js` lines 9-12**
```js
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? n : 30000;
})();
```

**Site 2 — `scripts/kaola-workflow-closure-audit.js` lines 42-45**
```js
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? n : 30000;
})();
```

**Site 3 — `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` lines 9-12**
Byte-identical to Site 1 (enforced by validate-script-sync.js).

**Site 4 — `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` lines 42-45**
Byte-identical to Site 2 (enforced by validate-script-sync.js).

### Sites 5-6 (function pattern — forge-specific, NOT tracked by validate-script-sync.js)

**Site 5 — `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` lines 10-13**
```js
function remoteTimeoutMs() {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? n : 30000;
}
```
Called inside `glabExec` at lines 21 and 22.

**Site 6 — `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` lines 12-15**
```js
function remoteTimeoutMs() {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? n : 30000;
}
```
Called inside `teaExec` at lines 23, 27, 30, and 40.

## Codex mirrors

"Codex mirror" = `plugins/kaola-workflow/scripts/`. Sites 3 and 4 are the Codex mirrors.
No `*-codex*` named files exist. GitLab/Gitea plugins are forge-specific variants, not mirrors.

## validate-script-sync.js behavior

1. **COMMON_SCRIPTS byte-equality**: Compares `scripts/` vs `plugins/kaola-workflow/scripts/` for 10 scripts including both affected files. Sites 1+2 must be byte-identical to Sites 3+4.
2. **BYTE_IDENTICAL_GROUPS**: Checks pre-commit hook and closure-contract across all 4 forges. Does NOT compare forge files (Sites 5-6) against anything.

**Implication**: Edit Sites 1+2 → must apply identical edit to Sites 3+4. Sites 5+6 edited independently.

## Existing test coverage

Framework: hand-rolled (`assert`, standalone Node scripts). No mocha/jest.

| Test function | File | Line |
|---|---|---|
| `testClosureAuditTimeoutEnvInvalidFallsBack` | `scripts/simulate-workflow-walkthrough.js` | 3573 |
| `testClosureAuditTimeoutEnvInvalidFallsBack` | `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | 2293 |
| `testClosureAuditTimeoutEnvInvalidFallsBack` | `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | 2220 |

All three use `{ KAOLA_GH_REMOTE_TIMEOUT_MS: 'not-a-number' }` only — NaN fallback tested, no zero/negative/over-cap coverage.

New over-cap test structure: pass `{ KAOLA_GH_REMOTE_TIMEOUT_MS: '999999999999999999999' }`, assert issue routes to `closed_remote` (clamped timeout still bounded, no hang or ERR_OUT_OF_RANGE).

## Naming conventions for the cap constant

No existing named constant (`MAX_TIMEOUT_MS` etc.) in codebase. Pattern is **inline integer literal**.

Prior art from archived issue-178 planning notes:
- `kaola-workflow/archive/issue-178/phase6-summary.md:54`: `Number.isFinite(n) && n > 0 ? Math.min(n, 600000) : 30000`
- `kaola-workflow/archive/issue-178/phase5-review.md:53`: same expression, 600000ms (10 min) cap

## Error handling pattern

**Silent fallback, no warning, no throw, no log.** All 6 sites return `30000` when validation fails. `docs/api.md:94` documents fallback but nothing else.

## Key interaction note

`parseInt('999999999999999999999', 10)` → `1e+21`. `Number.isInteger(1e21)` returns `true` in JS (integer check passes). So this huge value currently passes the guard and yields a ~31-year timeout.
