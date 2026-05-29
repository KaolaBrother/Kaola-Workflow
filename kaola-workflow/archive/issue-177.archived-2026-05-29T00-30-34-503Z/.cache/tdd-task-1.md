# TDD Task 1 Evidence: issue-177

## Files Modified
1. `scripts/validate-workflow-contracts.js` — inserted tag-existence assertion block (lines 325-341)
2. `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` — byte-identical mirror (diff confirmed)
3. `scripts/simulate-workflow-walkthrough.js` — added `testContractValidatorOfflineSkip` and `testContractValidatorMissingTag` at lines 3571-3611; registered in main() at lines 3699-3700
4. `CHANGELOG.md` — added `### Changed` entry under `## [Unreleased]`
5. `docs/conventions.md` — added `## Release` section with tag contract note

## RED Evidence
```
testContractValidatorOfflineSkip: PASSED
Error: contracts script must exit non-zero when git tag is absent, got: 0
    at testContractValidatorMissingTag (simulate-workflow-walkthrough.js:3602:5)
```
(Before implementation: testContractValidatorMissingTag failed because the check did not yet exist)

## GREEN Evidence
All npm test suites passed:
- Workflow contract validation passed
- Workflow walkthrough simulation passed (includes testContractValidatorOfflineSkip + testContractValidatorMissingTag)
- Kaola-Workflow Codex contract validation passed
- Kaola-Workflow walkthrough simulation passed
- GitLab workflow walkthrough simulation passed
- GitLab Codex workflow walkthrough simulation passed
- Gitea workflow walkthrough simulation passed
- Gitea Codex workflow walkthrough simulation passed
EXIT CODE: 0

## Deviation
Mock git binary in testContractValidatorMissingTag was implemented as a real executable shell script
(`#!/bin/sh\nexit 1\n` with chmod 0755) rather than a `.js` shim. Reason: `execFileSync('git', ...)` 
searches PATH for a real binary named `git`, not `git.js`. The shell script approach is correct for 
macOS/Darwin. This is consistent with how the actual git binary is invoked.

## Byte-Identical Sync
`diff scripts/validate-workflow-contracts.js plugins/kaola-workflow/scripts/validate-workflow-contracts.js` 
returned empty (byte-identical).
