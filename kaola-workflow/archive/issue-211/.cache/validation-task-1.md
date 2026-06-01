# Validation — Task 1 (issue-211)

## tdd-guide (executor) evidence — .cache/tdd-task-1 summary
- Modified files: `scripts/validate-workflow-contracts.js`, `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` (write-set only).
- RED A (gitlab DC body, trailing space on the `Codex subagent delegation is the default...` line): exit 1, message `plugins/kaola-workflow-gitlab/skills/kaola-workflow-next/SKILL.md "## Delegation Contract" section must byte-match the github baseline ... (issue #211 cross-forge parity)`.
- RED B (gitea resume 2nd line, `absent`→`absebt`): exit 1, message `plugins/kaola-workflow-gitea/skills/kaola-workflow-next/SKILL.md resume clause ("On resume, extract and reassign" line + next line) must byte-match the github baseline ... (issue #211 cross-forge parity)`.
- Messages not crossed. GREEN before and after reverts. Byte-sync guard: `OK: 11 common scripts and 2 byte-identical file group in sync.`

## Orchestrator verification (Step 2)
- `git diff scripts/validate-workflow-contracts.js`: Block 1 (helpers) inserted after `assertEveryDispatchHasModel`/before `const retired`; Block 2 (compare loop) inserted after the codex-manifest `for` loop/before the CHANGELOG `assert`. Matches blueprint exactly.
- `diff` root vs `plugins/kaola-workflow/scripts/validate-workflow-contracts.js` → MIRROR IDENTICAL.

## Orchestrator validation (Step 3)
| Command | Result | Notes |
|---------|--------|-------|
| `node scripts/validate-workflow-contracts.js` | PASS (exit 0) | "Workflow contract validation passed" — clean-tree pass = AC#3 no-false-flag evidence |
| `node scripts/simulate-workflow-walkthrough.js` | PASS (exit 0) | "Workflow walkthrough simulation passed"; `testContractValidatorOfflineSkip` + `testContractValidatorMissingTag` (behavioral tests of the changed validator) both PASSED |
| `node scripts/validate-script-sync.js` (via tdd-guide) | PASS | root + mirror byte-identical |

Classification: GREEN. No failures, no routing needed. Full 4-forge `npm test` reserved for Phase 6.
