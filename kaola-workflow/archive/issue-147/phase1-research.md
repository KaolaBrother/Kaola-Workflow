# Phase 1 - Research / Discovery: issue-147

## Deliverable
Fix GitLab and Gitea `archiveProjectDir` to delete `.roadmap/issue-N.md` and regenerate `ROADMAP.md` when archiving closed work, matching GitHub behavior. Also add corresponding test assertions.

## Why
Merged/closed GitLab and Gitea MRs/PRs leave stale entries in `.roadmap/issue-N.md` and `ROADMAP.md`, causing completed work to appear as active in generated workflow memory.

## Affected Area

| File | Role |
|------|------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js` | Add + export `regenerateRoadmap(root)` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-roadmap.js` | Add + export `regenerateRoadmap(root)` |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Add require; extract `archiveIssueNumber`; insert cleanup block |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Add require; extract `archiveIssueNumber`; insert cleanup block |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Plant `.roadmap/issue-44.md`; assert deletion after watcher merge |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` | Plant `.roadmap/issue-44.md`; assert deletion after watcher merge |

## Key Patterns Found

1. **GitHub reference block** (`scripts/kaola-workflow-claim.js:459-468`): `if (statusValue === 'closed')` guard wraps non-fatal try block that deletes `.roadmap/issue-N.md` (ENOENT ignored) then calls `roadmapModule.regenerateRoadmap(root)`.
2. **Issue number extraction** (`scripts/kaola-workflow-claim.js:437`): `archiveIssueNumber = parseInt(field(content, 'issue_number'), 10)` inside the state-read try block, before the folder rename. `field` is already imported in GitLab/Gitea claim scripts from their active-folders module.
3. **Roadmap regeneration** (`scripts/kaola-workflow-roadmap.js:188-197`): `regenerateRoadmap(root)` calls `readRoadmapIssues` + `buildRoadmapContent` + `writeFileAtomicReplace`. GitLab and Gitea roadmap modules have these same three functions but do not yet export or define `regenerateRoadmap` — must be added.

## Test Patterns
- Framework: hand-rolled assert (no test framework), `assert.strictEqual`, `assert(bool, msg)`
- GitLab location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Gitea location: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Structure: `withForge({...mock...}, () => { ... })` blocks; `tempRoot()` creates isolated temp dirs; `writeState()` plants workflow state
- GitHub walkthrough reference: `scripts/simulate-workflow-walkthrough.js:1605-1677` (`testFinalizeCleansRoadmapEntry`) — plants `.roadmap/issue-N.md`, generates ROADMAP, finalizes, asserts both are cleaned up

## Config & Env
- No env vars or feature flags needed
- `statusValue === 'closed'` is the exact discriminator (vs `'abandoned'` which must NOT trigger cleanup)

## External Docs
None — all internal patterns.

## GitHub Issue
KaolaBrother/Kaola-Workflow#147

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | all patterns internal |

## Notes / Future Considerations
- `regenerateRoadmap` must be added and exported from both roadmap modules (not just called inline) so the claim script stays thin
- Non-fatal cleanup is required — archive already succeeded before roadmap cleanup runs
- The `abandoned` path (closed MR without merge) must NOT trigger cleanup (guard already handles this with `statusValue === 'closed'`)
