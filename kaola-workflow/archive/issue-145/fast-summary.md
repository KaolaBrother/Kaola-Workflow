# Fast Summary: issue-145

## Status
PASSED

## Scope
Files: `README.md`, `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (required sync copy)
AC: README GitHub/GitLab/Gitea Claude-edition lines read `3.12.0`; validate-workflow-contracts.js enforces README-vs-package version sync; all tests pass.

## Plan
Update the three stale `3.10.0` version strings in README.md to `3.12.0` (matching package.json). Add a drift-guard assertion to `scripts/validate-workflow-contracts.js` that derives the expected version from `packageJson.version`. Sync copy to `plugins/kaola-workflow/scripts/` as required by validate-script-sync.js.

## Implementation Evidence
- `node scripts/validate-workflow-contracts.js`: PASS ("Workflow contract validation passed")
- `node scripts/simulate-workflow-walkthrough.js`: PASSED
- `npm test` (all 4 suites — claude, codex, gitlab, gitea): ALL PASSED
- README.md:378-380 now show `3.12.0`; Codex manifest lines (381-383) untouched at `1.5.0`

## Review
PASS — No CRITICAL/HIGH/MEDIUM/LOW findings. Drift guard uses `packageJson.version` dynamically. Plugin sync copy byte-identical. Complete and clean.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A
