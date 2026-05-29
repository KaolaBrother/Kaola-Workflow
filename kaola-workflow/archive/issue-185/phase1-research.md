# Phase 1 - Research / Discovery: issue-185

## Deliverable
Add an upper-bound cap (600000ms / 10 min) to `KAOLA_GH_REMOTE_TIMEOUT_MS` validation at all 6 sites. A value above the cap should silently clamp to the cap (via `Math.min`) rather than yielding an effectively-infinite timeout. Add an over-cap test case to all three test suites.

## Why
Issue #184 fixed NaN/zero/negative inputs but intentionally left the upper bound out of scope. A huge all-digit string (`999999999999999999999`) parses to `1e+21`, passes `Number.isInteger(n) && n > 0`, and silently disables the hang protection that issue #178 introduced. A misconfigured or malicious value defeats the whole purpose of the timeout guard.

## Affected Area
6 production sites across 4 files (2 pairs — one byte-identical pair plus 2 forge-specific):

| # | File | Lines | Pattern | Sync constraint |
|---|---|---|---|---|
| 1 | `scripts/kaola-workflow-active-folders.js` | 9-12 | IIFE | Must match Site 3 |
| 2 | `scripts/kaola-workflow-closure-audit.js` | 42-45 | IIFE | Must match Site 4 |
| 3 | `plugins/kaola-workflow/scripts/kaola-workflow-active-folders.js` | 9-12 | IIFE | Must match Site 1 |
| 4 | `plugins/kaola-workflow/scripts/kaola-workflow-closure-audit.js` | 42-45 | IIFE | Must match Site 2 |
| 5 | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | 10-13 | function | Independent |
| 6 | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | 12-15 | function | Independent |

Test files (one over-cap test case to add to each):
- `scripts/simulate-workflow-walkthrough.js` (near line 3573, after existing `testClosureAuditTimeoutEnvInvalidFallsBack`)
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (near line 2293)
- `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` (near line 2220)

## Key Patterns Found
1. **IIFE guard pattern (Sites 1-4)**: `scripts/kaola-workflow-active-folders.js:9-12` — `const n = parseInt(..., 10); return Number.isInteger(n) && n > 0 ? n : 30000;`
2. **Function guard pattern (Sites 5-6)**: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js:10-13` — same expression inside `remoteTimeoutMs()` function
3. **Archived fix expression**: `kaola-workflow/archive/issue-178/phase6-summary.md:54` — `Math.min(n, 600000)` inline, no named constant; `600000` is the prior-art cap

## Test Patterns
- Framework: hand-rolled (Node `assert`, standalone scripts), no mocha/jest
- Location: `scripts/simulate-workflow-walkthrough.js`, per-forge `test-*.js` files
- Structure: function named `testClosureAuditTimeoutEnv*`, spawns closure-audit with `extraEnv: { KAOLA_GH_REMOTE_TIMEOUT_MS: '<value>' }`, asserts `closed_remote` routing
- Existing coverage: NaN (`'not-a-number'`) only; no zero/negative/over-cap cases

## Config & Env
- `KAOLA_GH_REMOTE_TIMEOUT_MS` — integer ms; default 30000; no upper bound today
- `KAOLA_WORKFLOW_OFFLINE` — if set, remote probes are skipped (tests set it to `'0'` to allow probes)
- `validate-script-sync.js` — enforces byte-equality between Sites 1+2 (`scripts/`) and Sites 3+4 (`plugins/kaola-workflow/scripts/`); does NOT cover Sites 5+6

## External Docs
None — pure internal JavaScript validation, no external library or API behavior involved.

## GitHub Issue
KaolaBrother/Kaola-Workflow#185

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient; no external library or API involved |

## Notes / Future Considerations
- The fix expression `Math.min(n, 600000)` is consistent with archived issue-178 planning notes; use it rather than `n <= 600000 ? n : 30000` (the latter falls back to 30000 for values like 500001ms which are valid; Math.min gracefully caps)
- `parseInt('999999999999999999999', 10)` → `1e+21`; `Number.isInteger(1e21)` → `true` — the huge-value bug is real and confirmed
- Sites 1+2 must be edited identically to Sites 3+4 or `node scripts/validate-script-sync.js` fails
- Silent fallback is the established pattern; do not add `console.warn`
