# Code Explorer — issue-164

## Receipt Gap Matrix

| Field | `cmdFinalize` | `watch-pr/mr` (merged) | `sink-merge postMergeCleanup` |
|---|---|---|---|
| `archive` | tracked (`'closed'`) | tracked (`'closed'`) | NOT SET |
| `roadmap_source_removed` | tracked | tracked (warnings) | NOT SET |
| `roadmap_regenerated` | tracked | tracked (warnings) | NOT SET |
| `remote_issue_closed` | NOT SET | NOT SET | done (ghExec) NOT RECORDED |
| `claim_label_removed` | tracked | tracked (cleanups[]) | done (ghExec) NOT RECORDED |
| `worktree_removed` | NOT SET (result discarded) | NOT SET (result discarded) | done NOT RECORDED |
| `branch_removed` | NOT SET | NOT SET | done NOT RECORDED |
| emits receipt? | partial (no emptyReceipt seed) | no receipt shape | no receipt at all |

## Key File:Line References

- GitHub `cmdFinalize`: `scripts/kaola-workflow-claim.js:581-619`
- GitHub `cmdWatchPr`: `scripts/kaola-workflow-claim.js:912-944`
- GitHub `checkClosureInvariants`: `scripts/kaola-workflow-claim.js:554`
- GitHub `removeWorktree`: `scripts/kaola-workflow-claim.js:197-209` (returns `{removed, path}` or `{removed, reason}`)
- GitHub `postMergeCleanup`: `scripts/kaola-workflow-sink-merge.js:191-239`
- GitHub sink-merge `ghExec`: `scripts/kaola-workflow-sink-merge.js:20-23` (no KAOLA_GH_MOCK_SCRIPT support)
- GitLab `cmdFinalize`: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:576-613`
- GitLab `watchMergeRequests`: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js:853-879`
- GitLab `postMergeCleanup`: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js:224-270`
- Gitea `cmdFinalize`: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:562-599`
- Gitea `cmdWatchPr`: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js:867-876`
- Gitea `postMergeCleanup`: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js:224-270`
- `emptyReceipt()`: `scripts/kaola-workflow-closure-contract.js` (pure data, byte-identical across 4 trees)

## KAOLA_GH_MOCK_SCRIPT Testability

- `scripts/kaola-workflow-claim.js` `ghExec` (L49-54): supports KAOLA_GH_MOCK_SCRIPT — mockable
- `scripts/kaola-workflow-sink-merge.js` `ghExec` (L20-23): does NOT check KAOLA_GH_MOCK_SCRIPT — NOT mockable
- GitLab/Gitea sink-merge: use `forge.*` calls — separately mockable via forge test helpers

## Architecture Insights

1. `emptyReceipt()` is never called by any closure path today — all paths build receipts ad hoc or not at all
2. `checkClosureInvariants` exists in all 4 claim.js files but only called from `cmdFinalize`; checks only 3 of 7 invariants
3. `removeWorktree` returns `{removed: true, path}` or `{removed: false, reason: 'missing'}` — callers currently discard it
4. Sink-merge's `ghExec` must get `KAOLA_GH_MOCK_SCRIPT` support for the receipt to be testable
5. `kaola-workflow-closure-contract.js` is pure data (byte-identical) — shared helper belongs in claim.js, not closure-contract.js

## Recommended Approach

Add `buildClosureReceipt(project, issueNumber, steps)` helper to each claim.js:
- Seeds with `emptyReceipt(project, issueNumber)`
- Accepts `steps` object with optional field values
- Returns fully-populated receipt

Each closure path seeds `emptyReceipt()`, populates fields it owns, calls `checkClosureInvariants` at end.
