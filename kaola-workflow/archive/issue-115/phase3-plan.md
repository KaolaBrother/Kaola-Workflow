# Phase 3 - Plan: issue-115

## Blueprint

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json` | version 3.8.1 → 3.10.0 | Match main package.json version |
| `install.sh` | Add gitea) case, update usage/error/skip-guards | Wire Gitea into install path |

### Build Sequence
1. Update .claude-plugin/plugin.json version (trivial, no dependencies)
2. Add gitea) case to install.sh case block
3. Update usage(), --forge error, curl hint, and skip-guards in install.sh

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1, T2 | disjoint files |

### External Dependencies
None.

## Task List

### Task 1: Update .claude-plugin/plugin.json version
- File: `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json`
- Test File: N/A (JSON file, no test)
- Write Set: `plugins/kaola-workflow-gitea/.claude-plugin/plugin.json`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement: Change `"version": "3.8.1"` to `"version": "3.10.0"`
- Validate: `cat plugins/kaola-workflow-gitea/.claude-plugin/plugin.json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.version);"` (must print 3.10.0)

### Task 2: Add gitea) case to install.sh
- File: `install.sh`
- Test File: N/A (shell script)
- Write Set: `install.sh`
- Depends On: none
- Parallel Group: A
- Action: MODIFY
- Implement:
  1. Line 8: add `--forge=gitea` hint
  2. Line 11: update `github|gitlab` → `github|gitlab|gitea`
  3. Line 44 usage(): `github|gitlab` → `github|gitlab|gitea`
  4. Line 59: `github or gitlab` → `github, gitlab, or gitea`
  5. Lines 103-129: add `gitea)` case before `*)`
  6. Line 144: `(-gitlab)?` → `(-gitlab|-gitea)?`
  7. Lines 300-306: add `|| "$FORGE" = "gitea"` to empty-commands skip-guard
  8. Lines 464-469: add `|| "$FORGE" = "gitea"` to script skip-guard
  9. Lines 471-475: add `|| "$FORGE" = "gitea"` to hook skip-guard
  10. Line 483: add `|| "$FORGE" = "gitea"` to final message skip-guard
- Mirror: gitlab) case (lines 103-123)
- Validate: `bash -n install.sh && node scripts/simulate-workflow-walkthrough.js`

## Advisor Notes
Blueprint is dependency-safe. Two tasks are independent and trivially ordered.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | blueprint complete on first pass | no gaps found |
