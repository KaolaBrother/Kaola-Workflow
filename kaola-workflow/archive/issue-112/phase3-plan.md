# Phase 3 - Plan: issue-112

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js` | Creates/finds Gitea PRs, updates workflow state | `main()`, `ensurePullRequest(root, project, forge, options)` → `{pr, project}`, `updateStateSinkBlock(stateFile, prUrl, prNumber, fullName, projectHtmlUrl)` |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Watches PR merge, closes issue, cleans up worktree | `main()`, `readProjectInfo(root, project)`, `closeLinkedIssue(root, project, issueIid, opts)`, `runDirectMerge({skipGit})` → `{merged, close}` |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Offline test suite for both sinks | `withForge(stubs, fn)`, `setupRealRepo(dir)`, `tempRoot()`, all tests |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | Add `checkRepoSquashEnabled(project, opts)`, wire into `mergePullRequest` when `options.squash`, export | Squash-merge gate before API call; `=== false` check (absent/null is permissive) |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` | Add `'api /api/v1/repos/group/project'` response stub; add 4 squash-gate unit tests | Covers `checkRepoSquashEnabled` happy path and error path |

### Build Sequence
1. MODIFY `kaola-gitea-forge.js` — add `checkRepoSquashEnabled`, wire into `mergePullRequest`, export (no other tasks depend on changes, but tests in task 2 test it)
2. MODIFY `test-gitea-forge-helpers.js` — add repo-info stub + squash-gate tests (validates task 1)
3. CREATE `kaola-gitea-workflow-sink-pr.js` — depends on forge API (`createPullRequest`, `listPullRequests`, `discoverProject`, `createIssueComment`, `mergePullRequest` with project)
4. CREATE `kaola-gitea-workflow-sink-merge.js` — depends on forge API + worktree helpers from base claim.js
5. CREATE `test-gitea-sinks.js` — validates tasks 3 and 4; copies `setupRealRepo`/`tempRoot` verbatim

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1, 2 | Both in forge.js + forge-helpers.js; 2 tests 1 |
| B | 3, 4 | Disjoint files; both depend on forge adapter (task 1) |
| C | 5 | Depends on 3 and 4 being complete |

### External Dependencies
- `../../../scripts/kaola-workflow-claim` (base GitHub claim.js) for `getCoordRoot`, `readActiveFolders`, `removeWorktree`
- Node.js built-in: `fs`, `path`, `child_process` (spawnSync, execFileSync)
- No new npm packages

## Task List

### Task 1: Add checkRepoSquashEnabled to kaola-gitea-forge.js
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js`
- Depends On: none
- Parallel Group: A (with task 2)
- Action: MODIFY
- Implement:
  ```js
  function checkRepoSquashEnabled(project, opts) {
    const raw = teaExec(['api', '/api/v1/repos/' + project.full_name], opts || {});
    const data = parseJson(raw, {});
    if (data.allow_squash_merge === false) {
      throw new Error('Gitea repo does not allow squash merges (allow_squash_merge=false)');
    }
  }
  ```
  Wire into `mergePullRequest`:
  ```js
  function mergePullRequest(project, prNumber, opts) {
    const options = opts || {};
    if (options.autoMerge) checkServerVersion(options);
    if (options.squash) checkRepoSquashEnabled(project, options);  // ADD THIS LINE
    // ... rest unchanged
  }
  ```
  Add `checkRepoSquashEnabled` to `module.exports`.
- Mirror: `checkServerVersion` in same file (same guard pattern before API call)
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`

### Task 2: Add squash-gate tests to test-gitea-forge-helpers.js
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Test File: same
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`
- Depends On: Task 1
- Parallel Group: A (validates task 1)
- Action: MODIFY
- Implement:
  - Add stub for `'api /api/v1/repos/group/project'` response key returning `{ allow_squash_merge: true }` (for normal cases) and a variant with `allow_squash_merge: false` (for error case)
  - Test: `mergePullRequest` with `{squash: true}` and `allow_squash_merge: true` → succeeds
  - Test: `mergePullRequest` with `{squash: true}` and `allow_squash_merge: false` → throws error
  - Test: `mergePullRequest` with `{squash: true}` and `allow_squash_merge` absent → succeeds (permissive)
  - Test: `checkRepoSquashEnabled` directly with `false` → throws; `true` → no throw
- Mirror: existing squash/autoMerge tests in test-gitea-forge-helpers.js
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js`

### Task 3: Create kaola-gitea-workflow-sink-pr.js
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js`
- Depends On: Task 1
- Parallel Group: B (with task 4)
- Action: CREATE
- Implement: Port `kaola-gitlab-workflow-sink-mr.js` with these adaptations:
  - `require('./kaola-gitea-forge')` (not gitlab)
  - `require('../../../scripts/kaola-workflow-claim')` for `getCoordRoot`, `readActiveFolders`
  - State field names: `pr_number`, `pr_url`, `sink: pr`; sink-block fields: `full_name`, `project_html_url`
  - `ensurePullRequest(root, project, forge, options)` returns `{ pr, project }` (not just `pr`) — `project` comes from `forge.discoverProject(options)` call
  - `updateStateSinkBlock(stateFile, prUrl, prNumber, fullName, projectHtmlUrl)` — 5-arg function; writes `sink: pr`, `pr_url`, `pr_number`, `full_name`, `project_html_url` to the `## Sink` block
  - `forge.createPullRequest(opts)` (not `createMergeRequest`)
  - `forge.listPullRequests({state:'opened'})` (not `listMergeRequests`)
  - `forge.createIssueComment(project, issueNum, body, options)` (not `createIssueNote`)
  - Summary lines: `PR URL:` / `PR Number:` (not `MR URL:` / `MR IID:`)
  - `skipMetadataCommit` defaults to `true` when `options.gitExec` is passed:
    ```js
    const skipMetadataCommit = options.skipMetadataCommit !== undefined
      ? options.skipMetadataCommit
      : !!(options.gitExec || options.skipPush);
    ```
    This is intentional coupling for test isolation — do NOT "fix" it.
  - No `--root` CLI flag (none in GitLab version either; cwd-based)
- Mirror: `kaola-gitlab-workflow-sink-mr.js` — 1:1 structure, only API/field names differ
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

### Task 4: Create kaola-gitea-workflow-sink-merge.js
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Test File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Depends On: Task 1
- Parallel Group: B (with task 3)
- Action: CREATE
- Implement: Port `kaola-gitlab-workflow-sink-merge.js` with these adaptations:
  - `require('./kaola-gitea-forge')` (not gitlab)
  - `require('../../../scripts/kaola-workflow-claim')` for `getCoordRoot`, `readActiveFolders`, `removeWorktree`
  - `readProjectInfo(root, project)`:
    ```js
    function readProjectInfo(root, project) {
      const stateFile = resolveProjectFile(root, project, 'workflow-state.md');
      let content = '';
      try { content = fs.readFileSync(stateFile, 'utf8'); } catch (_) {}
      const full_name = field(content, 'full_name');
      const html_url = field(content, 'project_html_url');
      if (full_name) return { full_name, html_url };
      try { return forge.discoverProject(); } catch (_) { return { full_name: '', html_url: '' }; }
    }
    ```
    The fallback MUST be wrapped in try/catch — network errors can throw.
  - `forge.createIssueComment(projectInfo, issueNum, body, options)` (not `createIssueNote`)
  - `forge.mergePullRequest(project, prNumber, options)` — project as FIRST arg
  - State field reads: `pr_number`, `pr_url` (not `mr_iid`, `mr_url`)
  - `closeLinkedIssue(root, project, issueIid, opts)` — pass `projectInfo` (object with `full_name`) to `createIssueComment`
  - `runDirectMerge({skipGit: true})` return shape must be:
    ```js
    return { merged: true, close: <closeLinkedIssue result> };
    ```
    Matches GitLab sink-merge.js exactly.
  - Exit codes: 0=success, 2=FF exhausted, 3=merge-impossible (+ `sink-fallback.json`)
  - Archive guard (exit if already archived), exit-guard (exit if already exited) — port unchanged from GitLab
- Mirror: `kaola-gitlab-workflow-sink-merge.js` — 1:1 structure, adapt API/field names only
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

### Task 5: Create test-gitea-sinks.js
- File: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Test File: same
- Write Set: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`
- Depends On: Tasks 3 and 4
- Parallel Group: C (serial after B)
- Action: CREATE
- Implement: Port `test-gitlab-sinks.js` with these adaptations:
  - `require('./kaola-gitea-workflow-sink-pr')` and `require('./kaola-gitea-workflow-sink-merge')`
  - `require('./kaola-gitea-forge')` for `withForge` monkey-patching
  - `withForge(stubs, fn)` — shim must monkey-patch the LIVE `kaola-gitea-forge` module in `require.cache` and restore in `finally`. Same pattern as test-gitlab-sinks.js
  - `setupRealRepo(dir)` and `tempRoot()` must be COPIED VERBATIM from `test-gitlab-sinks.js`. They are NOT imports — they must exist as local helpers.
  - `writeWorkflow` helper must include `full_name` and `project_html_url` in `## Sink` block:
    ```js
    '## Sink',
    'branch: workflow/gitea-issue-' + issuePrNum,
    'issue_number: ' + issuePrNum,
    'full_name: group/project',
    'project_html_url: https://gitea.example/group/project',
    'sink: merge',
    ```
  - All forge stubs that call `createIssueComment`, `mergePullRequest` must assert `project.full_name` is present
  - `forge.mergePullRequest` stubs receive `(project, prNumber, opts)` — verify `project` arg
  - Coverage:
    - PR creation happy path (sink-pr)
    - Find existing PR (not duplicate) (sink-pr)
    - Auto-merge gating (sink-pr) — `mergePullRequest` called with correct opts
    - Missing `full_name` in state → discoverProject fallback (sink-merge)
    - `readProjectInfo` with `full_name` present → no discoverProject call
    - Merge + issue close (sink-merge)
    - Archive guard: exit 0 if already archived (sink-merge)
    - FF retry exit code 2 via `KAOLA_WORKFLOW_FORCE_FF_FAIL` (sink-merge)
    - Merge-impossible exit code 3 via `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE` (sink-merge)
    - `sink-fallback.json` written on exit 3 (sink-merge)
  - Sink-fallback CLI subprocess tests NOT ported — depend on `kaola-gitea-workflow-claim.js` which doesn't exist yet (issue #113)
  - `KAOLA_WORKFLOW_OFFLINE=1` for all non-subprocess tests
- Mirror: `test-gitlab-sinks.js` — same test structure, same assertion patterns, same env var hooks
- Validate: `node plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js`

## Advisor Notes

Four gaps closed from `.cache/advisor-plan.md`:
1. `setupRealRepo` and `tempRoot` copied verbatim into `test-gitea-sinks.js` (not imported) — explicit in task 5 write set and implement section
2. `readProjectInfo` fallback wraps `forge.discoverProject()` in try/catch returning `{ full_name: '', html_url: '' }` — explicit in task 4 code snippet
3. `skipMetadataCommit` defaults `true` when `options.gitExec` is passed — documented as intentional coupling in task 3; "do NOT fix" note included
4. `runDirectMerge({skipGit: true})` returns `{ merged: true, close: <closeLinkedIssue result> }` — explicit in task 4 code snippet

Build sequence, `checkRepoSquashEnabled === false`, sink-fallback out-of-scope, no `--root` flag all confirmed correct by advisor.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | advisor gaps closed directly in phase file | gaps were precision additions, not structural changes requiring re-invocation |
