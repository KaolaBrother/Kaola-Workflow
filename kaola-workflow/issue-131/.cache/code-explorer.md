# Code Explorer Output — Issue #131

## Summary
The GitLab claim script dispatches `watch-mr` but omits it from the usage assertion string. Gitea lists `watch-pr` in its usage string; GitHub lists `watch-pr` in its usage string. The fix is two surgical changes: add `watch-mr` to the GitLab usage assertion + add a validator assertion to prevent future drift.

## Affected Files

### `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Line 590 (usage assert): `assert(sub, 'usage: kaola-gitlab-workflow-claim.js <claim|release|status|patch-branch|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback>')`
- Line 595: `if (sub === 'watch-mr') return cmdWatchMr();` — implemented but not listed in usage
- Fix: add `|watch-mr` to the usage string at line 590

### `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`
- No current assertion for `watch-mr` in usage string
- Add: `assertIncludes(pluginRoot + '/scripts/kaola-gitlab-workflow-claim.js', 'watch-mr')`

## Reference — Gitea usage string (model)
Line 577: `'usage: kaola-gitea-workflow-claim.js <claim|release|status|patch-branch|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-pr>'`

## Reference — GitHub usage string (model)
Line 606: `'usage: kaola-workflow-claim.js <claim|release|status|patch-branch|watch-pr|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback>'`

## Test Command
`npm run test:kaola-workflow:gitlab && npm test`
