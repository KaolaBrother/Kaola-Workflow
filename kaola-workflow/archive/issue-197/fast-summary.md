# Fast Summary: issue-197

## Status
PASSED

## Scope
- `scripts/kaola-workflow-fast-audit.js` (new, read-only) — scans archived (`kaola-workflow/archive/*/fast-summary.md`) and active (`kaola-workflow/*/fast-summary.md`) fast runs; reports status counts, escalation-reason histogram, file-count distribution, and review mode. Human table by default, `--json` for machines. Always exits 0.
- `scripts/test-fast-audit.js` (new) — standalone hand-rolled-assert regression test; 38 assertions over synthetic fixtures in a temp dir (never the real archive).
- `package.json` — registered `node scripts/test-fast-audit.js` in the `test:kaola-workflow:claude` chain (before the walkthrough).

Acceptance criteria — all met:
- `node scripts/kaola-workflow-fast-audit.js` prints the four-metric table and exits 0.
- `--json` emits machine-readable output and exits 0.
- Empty corpus → zeroed report, exit 0 (asserted in the test).
- Test coverage added; `node scripts/simulate-workflow-walkthrough.js` still exits 0.

## Plan
See `.cache/planner.md`. Pure exported functions (`splitSections`, `parseStatus`, `parseEscalationReason`, `parseFileCount`, `parseReviewMode`, `parseFastSummary`, `collectFastSummaryFiles`, `audit`, `formatTable`, `formatJson`) + thin `require.main === module` CLI wrapper. Root-parameterized `audit(root)` enables fixture testing. Escalation histogram keys off `status === 'ESCALATED'` (so issue-184's `N/A —` prose does not leak); file-count uses a path-discriminator (`/` + no internal whitespace + extension); review-mode is status-aware and scoped to the `## Required Agent Compliance` section (delegated / self-review / escalated). Node built-ins only — no new deps.

## Implementation Evidence
- TDD RED: `node scripts/test-fast-audit.js` before the module existed → `Cannot find module .../kaola-workflow-fast-audit.js`, exit 1.
- TDD GREEN: after implementation → `Fast-audit regression passed (38 assertions)`, exit 0.
- `node scripts/kaola-workflow-fast-audit.js` → table renders (live: 19 runs — 17 PASSED, 1 IN_PROGRESS [this active run], 1 ESCALATED; delegated 12 / self-review 6 / escalated 1), exit 0.
- `node scripts/kaola-workflow-fast-audit.js --json` → valid machine-readable JSON, exit 0.
- `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` → valid JSON.
- `node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", exit 0 (52 tests).

## Review
Delegated `code-reviewer` (opus) — see `.cache/code-reviewer.md`. **PASS / APPROVE**, zero CRITICAL/HIGH/MEDIUM. All five design constraints traced against the real archive (root-parameterized; escalation keyed off status; path-discriminator → issue-189 = 2; review-mode section-scoped, no prose false-positive; total parsers). Read-only, no new deps, always exits 0 confirmed. No test assertion depends on live archive counts (synthetic temp corpus only). Two LOW interpretive notes (prose-Scope `unknown` coverage ~37%; in-flight runs transiently counted self-review) — both per-spec / out-of-AC, non-blocking.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
