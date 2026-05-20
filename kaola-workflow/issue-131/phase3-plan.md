# Phase 3 - Plan: issue-131

## Blueprint

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add `watch-mr` to usage string | Match Gitea/GitHub parity; fix incomplete CLI help |
| `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` | Add assertIncludes for watch-mr | Prevent future drift |

### Build Sequence
1. Task 1: Fix usage string in claim script
2. Task 2: Add validator assertion

### External Dependencies
None.

## Task List

### Task 1: Fix usage string
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Write Set: same file
- Depends On: none
- Action: MODIFY
- Implement: Change line 590 from:
  ```
  assert(sub, 'usage: kaola-gitlab-workflow-claim.js <claim|release|status|patch-branch|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback>');
  ```
  to:
  ```
  assert(sub, 'usage: kaola-gitlab-workflow-claim.js <claim|release|status|patch-branch|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-mr>');
  ```
- Validate: `npm run test:kaola-workflow:gitlab`

### Task 2: Add validator assertion
- File: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Write Set: same file
- Depends On: Task 1
- Action: MODIFY
- Implement: After the existing `assert(!String(pkg.scripts['test:kaola-workflow:gitlab']).includes('pending #58')...)` line, add:
  ```js
  assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'watch-mr');
  ```
- Validate: `npm run test:kaola-workflow:gitlab && npm test`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | N/A | | trivial 2-line fix; no architecture |
| advisor plan gate | N/A | | no blueprint gaps possible in a 2-line edit |
| architect revisions | N/A | | |
