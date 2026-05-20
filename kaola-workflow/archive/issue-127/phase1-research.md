# Phase 1 - Research / Discovery: issue-127

## Deliverable
Add `workflow:in-progress` label removal on successful linked issue closure in all three forge sink-merge scripts (GitHub, GitLab, Gitea), with tests for each path, and one-time cleanup of 14 existing closed issues that still carry the stale label.

## Why
Closed workflow issues retain `workflow:in-progress`, confusing manual triage, search filters, and future audits. Issue #119 is a confirmed example.

## Affected Area
- `scripts/kaola-workflow-sink-merge.js` — Step 8 issue-close at lines 202-206
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` — `closeLinkedIssue` at line 116; Step 8 at lines 232-237
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` — `closeLinkedIssue` at line 116; Step 8 at lines 232-237
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — new test(s) using `withForge` stub pattern
- `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — new test(s) using `withForge` stub pattern

## Key Patterns Found

1. **`clearAdvisoryClaim` pattern** (`scripts/kaola-workflow-claim.js:270-276`): Each forge edition has its own `clearAdvisoryClaim(issueIid, reason, [projectInfo])` that silently removes `workflow:in-progress` via the forge adapter, with `OFFLINE` guard and per-call `try/catch (_) {}`. This is the exact pattern to replicate in sink-merge.

2. **Forge label APIs** (all exported from their respective forge adapters):
   - GitHub: `ghExec(['issue', 'edit', String(N), '--remove-label', 'workflow:in-progress'])` (local `ghExec` already available in sink-merge)
   - GitLab: `forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] })` — `forge.CLAIM_LABEL` exported at `kaola-gitlab-forge.js:214`
   - Gitea: `forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] })` — requires `projectInfo.full_name`; `forge.CLAIM_LABEL` exported at `kaola-gitea-forge.js:282`

3. **Two close paths in GitLab/Gitea**: `closeLinkedIssue(root, project, issueIid, opts)` at line 116 (used in tests via `skipGit: true`) and Step 8 direct path at lines 232-237 (production). Both must be updated. Tests validate only the `closeLinkedIssue` path, so the label call must be there for test coverage.

4. **Non-fatal error handling**: All best-effort ops wrapped individually in `try/catch (_) {}`. Label cleanup must follow this pattern.

5. **`withForge` test stub pattern** (`test-gitlab-sinks.js:15-26`, `test-gitea-sinks.js:14-25`): Monkey-patches `forge` in-process, restores in `finally`. New tests add `updateIssue`/`updateIssueLabels` to the stub and assert they are called with the correct label and issue identifier.

6. **No existing label tests**: Neither test file contains `workflow:in-progress` or `CLAIM_LABEL` today — new test cases required.

7. **14 stale closed issues**: #126, #125, #119, #117, #116, #115, #113, #103, #89, #88, #86, #85, #82, #81 — one-time cleanup via `gh issue edit --remove-label`.

## Test Patterns
- Framework: hand-rolled assert (no framework)
- GitHub location: `scripts/simulate-workflow-walkthrough.js` (subprocess integration; OFFLINE=1; adding label assert is not feasible here — test via subprocess diff inspection or skip for GitHub unit coverage)
- GitLab location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Gitea location: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Structure: `withForge(stubs, fn)` — stub `updateIssue`/`updateIssueLabels` alongside `closeIssue`, assert called

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — must gate label removal (GitHub path already does; GitLab/Gitea `clearAdvisoryClaim` do not have OFFLINE guard, but the forge CLI call will fail safely if offline)
- No new env vars, flags, or config files

## External Docs
None required.

## GitHub Issue
KaolaBrother/Kaola-Workflow#127

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal Node.js scripts; no external library behavior needed |

## Notes / Future Considerations
- One-time cleanup of 14 stale closed issues is implementation-scope, not a code change — can be a shell command run during Phase 4 or Phase 6.
- GitHub unit test for label removal is difficult (subprocess-only); the integration walkthrough test does not exercise Step 8 forge label calls. Phase 3 should decide whether to add a new unit-testable export to the GitHub sink-merge or accept subprocess-only coverage.
- GitLab/Gitea `clearAdvisoryClaim` lacks an OFFLINE guard (unlike GitHub); adding one for consistency is a scope question for Phase 2.
