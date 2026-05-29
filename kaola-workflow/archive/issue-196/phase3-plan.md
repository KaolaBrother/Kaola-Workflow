# Phase 3 - Plan: issue-196

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | Lines 111, 123, 137: add `KAOLA_WORKFLOW_OFFLINE: '0', ` before `KAOLA_GLAB_MOCK_SCRIPT: mockScript` in 3 env objects | Subprocess inherits parent OFFLINE=1 and short-circuits before reaching mock; explicit `'0'` forces online path |

### Build Sequence
1. Patch all 3 env objects in `testAuditAndRepairLabels` (single logical edit; all 3 must be applied before validation passes)
2. Run discriminating validation: `KAOLA_WORKFLOW_OFFLINE=1 node ...simulate-gitlab-workflow-walkthrough.js`
3. Run full suite gate: `KAOLA_WORKFLOW_OFFLINE=1 npm test`

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| serial | Task 1 | only one task |

### External Dependencies
None.

## Task List

### Task 1: Patch 3 env objects in testAuditAndRepairLabels
- File: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`
- Test File: same file (it is the test)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` (lines 111, 123, 137)
- Depends On: none
- Parallel Group: serial
- Action: MODIFY
- Implement:
  Use `Edit` with `replace_all: true` on the byte-identical string:
  ```
  old: env: Object.assign({}, process.env, { KAOLA_GLAB_MOCK_SCRIPT: mockScript })
  new: env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
  ```
  Confirm post-edit that exactly 3 occurrences were replaced (3 sub-cases A/B/C).
- Mirror: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js:536` (GitLab-local precedent); `scripts/simulate-workflow-walkthrough.js:546` (GitHub pattern)
- Validate:
  ```bash
  # discriminating (FAILS pre-fix, PASSES post-fix)
  KAOLA_WORKFLOW_OFFLINE=1 node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js
  # full suite gate (required — the reported issue)
  KAOLA_WORKFLOW_OFFLINE=1 npm test
  ```
  Both must exit 0. `testAuditAndRepairLabels: PASSED` must appear in GitLab output.

## Advisor Notes

Plan approved with two amendments incorporated:

1. **`KAOLA_WORKFLOW_OFFLINE=1 npm test` is the required final gate** (not optional). The issue title is exactly that command. Running the sub-script proves the file is fixed; running npm test proves the reported AC is met. Full command is runnable locally because git-tag check is skipped under OFFLINE=1.

2. **Use `replace_all: true`** — the 3 target lines are byte-identical; `replace_all: false` would error on non-uniqueness. The grep sweep confirms exactly 3 occurrences in the target file. Safe to use.

No architect revision needed — blueprint is complete and a developer can implement it from this plan alone.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | advisor found no gaps; plan complete in first pass |
