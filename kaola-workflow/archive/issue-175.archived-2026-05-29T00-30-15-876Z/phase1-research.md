# Phase 1 - Research / Discovery: issue-175

## Deliverable
Port `target_unverified` offline no-evidence behavior to GitLab and Gitea editions:
1. Add OFFLINE no-evidence guard to both classifiers (returns `target_unverified` when no `.roadmap/issue-N.md` and no active folder)
2. Add `target_unverified` handler to both `claimExplicitTarget()` functions (exits 1, claim: none)
3. Update existing wrong test + add regression tests for both forges

## Why
Cross-forge parity gap: GitHub correctly refuses offline explicit-target startup with no local evidence; GitLab and Gitea still acquire in the same scenario, silently creating active folders for unverifiable issues.

## Affected Area
6 files total across 4 scripts + 2 test files:

1. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` — add OFFLINE guard in classifyIssue() (~line 248) and cmdClassify() (~line 288)
2. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — add target_unverified handler in claimExplicitTarget() (~line 400)
3. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js` — same as GitLab (~lines 241, 293)
4. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — same as GitLab (~line 403)
5. `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` — update existing green→target_unverified, add regression tests (~line 819)
6. `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js` — same (~line 820)

## Key Patterns Found
1. GitHub OFFLINE guard (model to mirror): `plugins/kaola-workflow/scripts/kaola-workflow-classifier.js:334-358` — checks `!fs.existsSync(roadmapFile) && !activeFolders.some(f => f.issue_number === args.issue)`, emits `{ verdict: 'target_unverified', reasoning: '...' }`
2. GitHub claimExplicitTarget handler: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js:443-451` — if `classified.verdict === 'target_unverified'` return `{ status: 'target_unverified', claim: 'none', issue, project, reasoning }`
3. GitLab/Gitea OFFLINE path (broken): `kaola-gitlab-workflow-classifier.js:248-254` / `kaola-gitea-workflow-classifier.js:253-255` — calls `classify(localRoadmapIssue(issueIid, repoRoot), activeFolders)` without existence check; `localRoadmapIssue()` returns empty stub if no file → falls through to `green`
4. Architecture difference: GitLab/Gitea use module-import model (not subprocess); `classifyIssue()` is called directly — guard must live inside that function, NOT in a separate subprocess

## Test Patterns
- Framework: hand-rolled assert (`function assert(condition, message)`)
- GitLab test location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (invoked by `simulate-gitlab-codex-workflow-walkthrough.js`)
- Gitea test location: `plugins/kaola-workflow-gitea/scripts/test-gitea-workflow-scripts.js`
- Pattern: each test case in its own function `function testXxx() { const tmp = fs.mkdtempSync(...); try { ... } finally { fs.rmSync(tmp,...) }; console.log('testXxx: PASSED'); }`
- Reference patterns: `scripts/simulate-workflow-walkthrough.js:2341-2483` (testClassifierOfflineUnverifiedNoLocalEvidence, testClassifierOfflineVerifiedRoadmapAcquires, testClassifierOfflineVerifiedOwnedFolderRoutes, testClassifierOfflineUnverifiedWithUnrelatedActiveFolder)

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1`: enables offline mode; classifier skips gh API calls
- `issue_iid` (not `issue_number`): field name for issue ID in GitLab/Gitea active folders

## External Docs
None — internal patterns sufficient.

## GitHub Issue
KaolaBrother/Kaola-Workflow#175

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient |

## Notes / Future Considerations
- GitLab/Gitea are NOT in the common-script sync group (validate-script-sync.js) — changes must be made manually to each forge
- `cmdClassify()` in GitLab/Gitea classifiers should also be updated (it mirrors `classifyIssue()`) to keep the two consistent
- Existing test at GitLab line ~819 and Gitea line ~820 asserts `verdict: 'green'` — this is the wrong behavior and must be updated
