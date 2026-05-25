# Phase 1 - Research / Discovery: issue-166

## Deliverable
Port the `closure-audit` command to the GitLab edition as a dedicated standalone
script `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`,
matching the GitHub implementation's contract (dry-run JSON default, `--execute`
safe local repairs, five drift output keys, report-only folder classes, offline
skip behavior), plus GitLab walkthrough tests, install wiring, and docs/api.md
coverage.

## Why
Edition parity. #165 shipped closure-audit GitHub-only; the GitLab edition has no
closure-drift audit/repair, mirroring the prior GitHub-only `audit-labels`/
`repair-labels` gap. This follow-up (issue #166) closes that gap for GitLab.

## Affected Area
- NEW: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-closure-audit.js`
- `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` (tests)
- `install.sh` — GitLab `SUPPORT_SCRIPT_NAMES` (lines 134-145)
- `docs/api.md` — Closure audit section (627-711), Flow map row 727, follow-up bullet 737
- Possibly `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-roadmap.js`
  (export `roadmapDir`, or inline the path in the new script)

## Key Patterns Found
1. Source template `scripts/kaola-workflow-closure-audit.js:1-297` — dedicated
   standalone script (mirrors `sink-merge`), inlines `assert`/`ghExec`/`parseArgs`,
   imports only domain helpers from active-folders + roadmap.
2. Five output keys (`buildAuditReport` 207-213): `stale_roadmap_sources`,
   `mirror_lists_closed_issues`, `stale_in_progress_labels`,
   `active_folder_for_closed_issue`, `unarchived_pr_folders` (→ `unarchived_mr_folders`).
3. `--execute` (`executeRepairs` 226-263): unlink stale `.roadmap/issue-N.md`,
   `regenerateRoadmap(root)`, remove `workflow:in-progress` label on closed issues
   when online; NEVER deletes folders/worktrees; classes (e)/(f) carried into
   `reported_not_repaired`.
4. GitLab forge object `kaola-gitlab-forge.js` — `listIssues({state,perPage})`,
   `viewIssue(iid)`, `viewMergeRequest(mrIid)`, `updateIssue(iid,{unlabels})`;
   `CLAIM_LABEL='workflow:in-progress'`; state values lowercased via `normalizeState`.
5. `cmdWatchMr`/`watchMergeRequests` (claim.js 924-996) — reference for MR-state
   checks (lowercase `'merged'`/`'closed'`) and `clearAdvisoryClaim` (295-305)
   label removal returning `'removed'/'skipped_offline'/'failed'`.
6. `kaola-gitlab-workflow-active-folders.js` exports `field`, `getRoot`,
   `issueIsClosed`, `readActiveFolders`, `parseStateFile`; folders carry
   `issue_iid`+`issue_number`, `sink`, `mr_url`, `mr_iid`; `parseStateFile:61`
   reads `issue_iid` with `issue_number` fallback.

## Port deltas / gaps the plan MUST resolve
- **Label-filter gap**: `forge.listIssues` has NO `--label` filter. Need stale-label
  detection via one of: extend forge, direct `forge.glabExec([... --label ...])`, or
  client-side filter on normalized `issue.labels`.
- **MR vs PR rename**: output keys + folder fields (`sink==='mr'`, `f.mr_url`);
  **state casing flip** — GitLab returns lowercase `'merged'/'closed'` (GitHub upper).
- **`roadmapDir` not exported** by GitLab roadmap module — add export or inline path.
- **Archive issue field**: GitLab archives write `issue_iid`; archive scan must read
  `issue_iid` with `issue_number` fallback or it misses GitLab-archived issues.
- **Closure-contract**: optional — GitHub closure-audit does NOT use it; planner
  decides minimal-mirror vs receipt adoption.

## Test Patterns
- Framework: hand-rolled `require('assert')` (Node built-in), no test runner.
- Location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
  (has glab-mock infra: `writeShimFiles`, `glabMockEnv`/`KAOLA_GLAB_MOCK_SCRIPT`,
  `withForge`); bare top-level test calls at tail (1772-1784).
- Structure to mirror: 11 GitHub closure-audit tests at
  `scripts/simulate-workflow-walkthrough.js:3006-3379` (offline-skip, closed_remote,
  archive_closed, dedup, mirror-closed, stale-labels, active-folder-dirty,
  unarchived-MR-merged, execute-repairs, execute-never-touches-folders,
  dry-run-never-removes-label).
- Entry point: `npm run test:kaola-workflow:gitlab` (package.json:38).

## Config & Env
- `KAOLA_WORKFLOW_OFFLINE=1` — gates remote classes (`stale_in_progress_labels`,
  `unarchived_mr_folders`) to string `"skipped_offline"`.
- `KAOLA_GLAB_MOCK_SCRIPT` — test injection of the `glab` binary (forge:15).
- Install: GitLab `SUPPORT_SCRIPT_NAMES` (install.sh 134-145); no
  `validate-script-sync.js` obligation (GitLab scripts are tree-specific).

## External Docs
None. docs-lookup: N/A — internal patterns sufficient; the `glab` CLI is wrapped by
the existing `kaola-gitlab-forge.js` whose source is available.

## GitHub Issue
KaolaBrother/kaola-workflow#166

## Completeness Score
10/10 (goal 3, outcome 3, scope 2, constraints 2)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md (model=opus override; Sonnet rate-limited) | |
| docs-lookup | N/A | docs impact check: pure internal patterns, glab wrapped by forge | no external/library behavior needed |

## Notes / Future Considerations
- #167 (Gitea port) is the sibling follow-up; this port establishes the pattern
  the Gitea port will mirror.
- Match GitHub closure-audit pretty-print (`JSON.stringify(...,null,2)`) for
  docs-example parity, not the compact GitLab claim `output()` style.
