# TDD-Guide Output — issue-145

## Changes Made

### README.md (lines 378-380)
Updated three stale version strings from `3.10.0` to `3.12.0`:
```
- Claude Code command install, GitHub edition: `3.12.0`
- Claude Code command install, GitLab edition: `3.12.0`
- Claude Code command install, Gitea edition: `3.12.0`
```
Codex manifest lines (`1.5.0`) untouched.

### scripts/validate-workflow-contracts.js
Inserted drift-guard block after packageJson.files assertions:
- Asserts all three README edition lines match `packageJson.version`
- Asserts both `.claude-plugin/plugin.json` forge manifests match `packageJson.version`

### plugins/kaola-workflow/scripts/validate-workflow-contracts.js
Synced from canonical `scripts/validate-workflow-contracts.js` (required by validate-script-sync.js).

## Acceptance Check Results
- `node scripts/validate-workflow-contracts.js`: PASS ("Workflow contract validation passed")
- `node scripts/simulate-workflow-walkthrough.js`: PASSED
- `npm test` (all 4 suites): ALL PASSED
  - kaola-workflow:claude — PASSED (includes new contract validation)
  - kaola-workflow:codex — PASSED
  - kaola-workflow:gitlab — PASSED
  - kaola-workflow:gitea — PASSED
