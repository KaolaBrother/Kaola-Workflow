# suites-green — issue #1014

Worktree: `/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/issue-1014`

tdd-guide confirm: `kaola-workflow/issue-1014/tdd-green.md` (cursor 584, three contract validators).

| command | exit | note |
|---|---|---|
| `node scripts/generate-routing-surfaces.js --check` | 0 | all 18 surfaces byte-match |
| `node scripts/validate-workflow-contracts.js` | 0 | |
| `node scripts/test-route-reachability.js` | 0 | 504 assertions |
| `node scripts/test-cursor-edition.js` | 0 | 584 assertions |
| `node scripts/test-grok-edition.js` | 0 | 543 assertions |
| `node scripts/test-opencode-edition.js` | 0 | 680 assertions |
| `node scripts/test-kimi-edition.js` | 0 | 645 assertions |
| GitLab / Gitea contract validators | 0 | |
| `node scripts/simulate-workflow-walkthrough.js` | 0 | 186/186 scenarios |

Routing skeletons moved, so the walkthrough ran at full scope (not the 1/12 fast-gate shard).
