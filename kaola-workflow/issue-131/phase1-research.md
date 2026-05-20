# Phase 1 - Research / Discovery: issue-131

## Deliverable
Add `watch-mr` to the GitLab claim script usage assertion string and add a contract validator assertion to prevent future drift.

## Why
The GitLab claim script dispatches `watch-mr` (line 595) but the usage assertion string (line 590) omits it. Users get incomplete CLI help. Gitea correctly lists `watch-pr` in its usage string (line 577). Adding a validator assertion ensures parity cannot silently drift again.

## Affected Area
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — line 590 usage string
- `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js` — add assertIncludes for watch-mr

## Key Patterns Found
1. GitLab usage string (line 590): `assert(sub, 'usage: kaola-gitlab-workflow-claim.js <claim|release|status|patch-branch|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback>')`
2. Gitea usage string (model, line 577): includes `|watch-pr` at the end before `>`
3. Validator pattern (line 61-63): `assertIncludes(file, needle)` used throughout for contract checks

## Test Patterns
- Framework: hand-rolled assert (no external framework)
- Location: `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- Validation: `npm run test:kaola-workflow:gitlab && npm test`

## Config & Env
None.

## External Docs
None.

## GitHub Issue
KaolaBrother/Kaola-Workflow#131

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns only |

## Notes / Future Considerations
None.
