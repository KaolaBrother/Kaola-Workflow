# Code Explorer — Issue #88: GitLab Classifier and Repair-State Parity Gaps

## Gap 1 — Classifier: parallel_mode bypass

**GitHub reference** (`scripts/kaola-workflow-classifier.js`):
- `const os = require('os')` at line 4
- `CONFIG_PATH = path.join(os.homedir(), '.config', 'kaola-workflow', 'config.json')` at line 58
- `readOrCreateConfig()` at lines 60-69: reads JSON, creates `{ parallel_mode: 'auto' }` on failure
- In `cmdClassify()` (lines 315-319): if `config.parallel_mode !== 'auto'`, immediately outputs `{ verdict: 'green', reasoning: 'parallel_mode=X; bypassing classifier' }` and returns

**GitLab current state** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js`):
- Imports: `fs` (line 4), `path` (line 5), `forge` (line 6), `active` (line 7) — no `os`
- `cmdClassify()` (lines 188-192): calls `parseArgs`, then immediately `classifyIssue()` with no config check
- Missing: `os` require, `CONFIG_PATH`, `readOrCreateConfig()`, bypass guard in `cmdClassify()`

## Gap 2 — Classifier: Offline/local roadmap fallback

**GitHub reference**:
- `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'` at line 9
- In `cmdClassify()` (lines 331-349): if OFFLINE, reads `.roadmap/issue-N.md`, parses `next_step` for "blocked by #N" pattern → labels, calls `parseAreaLabelsFromText(content)` for area labels, calls `classify()` with offline-derived labels/body, outputs result and returns
- In `checkDependsOn()` (line 253): when OFFLINE, returns `{ verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#N label present; conservative block' }`

**GitLab current state**:
- No `OFFLINE` constant; no OFFLINE branch in `classifyIssue()` or `cmdClassify()`
- On OFFLINE, `forge.viewIssue()` returns empty/unknown data (glab returns empty), may return green incorrectly
- `checkDependsOn()` (lines 92-99): calls `forge.viewIssue(depIid)` unconditionally; no explicit OFFLINE reasoning

**.roadmap/issue-N.md fields read**: `next_step` (for blocked-by pattern), full content for area labels and body

## Gap 3 — Classifier: Remote active claim detection

**GitHub reference**:
- `issueHasWorkflowInProgressLabel(labels)` at lines 153-157: checks `labels.some(l => l.name === 'workflow:in-progress')`
- `issueHasRemoteClaimComment(issueNum)` at lines 159-174: returns false if OFFLINE; calls `gh api repos/OWNER/NAME/issues/N/comments`; returns true if any comment body matches `/<!--\s*kw:claim\s+(project|sess)=/` and `updated_at` within 24h
- In `cmdClassify()` (line 366): checks both; if true, returns `{ verdict: 'blocked', reasoning: 'issue #N has a remote workflow claim' }`

**GitLab current state**:
- No `issueHasWorkflowInProgressLabel()` equivalent
- No `issueHasRemoteClaimComment()` equivalent
- `classifyIssue()` (lines 181-185): calls `classify()` directly after closed-state check, no label or notes check for remote claim

**GitLab-specific differences**:
- Labels in GitLab (after normalization) are plain string array → use `.includes()` not `.some(l => l.name === ...)`
- `forge.CLAIM_LABEL = 'workflow:in-progress'` (line 7 of `kaola-gitlab-forge.js`)
- `forge.listIssueNotes(project, issueIid)` (lines 161-167 of `kaola-gitlab-forge.js`) → GitLab equivalent of GitHub comments API; notes have `body` and `updated_at` fields
- `project` ref needed for `listIssueNotes`; not currently available in `classifyIssue()` — derive from `forge.discoverProject()` or active folder metadata

## Gap 4 — Repair-State: stateLooksValid() + stale-state detection

**GitHub reference** (`scripts/kaola-workflow-repair-state.js`):
- `stateLooksValid(root, project, content)` at lines 380-396: checks phase is known, `next_command` matches phase N and project, `next_skill` matches, `phase_file` exists if non-N/A, status is active → returns bool
- In `main()` (lines 495-522): if state file exists AND `stateLooksValid()`, calls `reconstruct()`:
  - If `routeResult.complete`: skip, print "complete"
  - If `routeResult.nextCommand !== field(content, 'next_command')`: state is stale → rewrite + "repaired stale"
  - Else: state is valid and current → "existing state valid" without writing

**GitLab current state** (`plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js`):
- No `stateLooksValid()` function
- `repair()` (lines 341-353): calls `selectProject` and `reconstruct` directly; always writes if `result.project` truthy; no three-way branch

## Gap 5 — Repair-State: Ownership block reconstruction

**GitHub reference**:
- In `stateContent()` (lines 416-463): writes `## Ownership Rules` section with:
  - `main_session_role: orchestrator`
  - `implementation_owner: tdd-guide` (phase 4) or `N/A`
  - `fix_owner: tdd-guide or build-error-resolver` (phase 4/5/6) or `N/A`
  - `inline_emergency_fallback_authorized: no`
- `last_result: 'state_repaired_from_artifacts'`
- Preserves only `## Sink` from existing content

**GitLab current state**:
- `stateContent()` (lines 300-339): no `## Ownership Rules` section; no `main_session_role`, `implementation_owner`, `fix_owner`, `inline_emergency_fallback_authorized`
- Preserves `## GitLab` and `## Sink` from existing content (GitHub preserves only `## Sink`)
- `last_result: 'reconstructed'` (GitHub uses `'state_repaired_from_artifacts'`)

## Test Patterns

- Framework: Node.js `assert`, no external framework
- File: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Classifier tests (lines 258-290): `withForge({viewIssue stubs})` + `classifier.classifyIssue(iid, root)` in-process
- Repair-state tests (lines 405-415): bare block + `repair.repair('project', root)` in-process; reads written state file; asserts `next_skill`, preserved `## GitLab`, `## Sink`
- No existing tests for: parallel_mode bypass, OFFLINE path, remote claim check, stateLooksValid three-way branch, ownership block fields
- `runNode` (lines 69-74): spawnSync for subprocess tests; `runNodeRaw` (lines 76-79): non-asserting variant
- `withForge({viewIssue, listIssueNotes, discoverProject stubs}, cb)`: for in-process forge-dependent tests

## Key Files

| File | Role |
|------|------|
| `scripts/kaola-workflow-classifier.js` | GitHub reference (all 3 classifier gaps) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Target (classifier) |
| `scripts/kaola-workflow-repair-state.js` | GitHub reference (repair-state) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` | Target (repair-state) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Test suite |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | forge API: CLAIM_LABEL, listIssueNotes, discoverProject, OFFLINE |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-active-folders.js` | getRoot, readActiveFolders |

## Precise Gap Summary

| Gap | GitHub source | GitLab target |
|-----|--------------|----------------|
| `os` require | classifier:4 | Add after line 5 |
| CONFIG_PATH + readOrCreateConfig | classifier:58-69 | New block before cmdClassify |
| parallel_mode bypass in cmdClassify | classifier:315-319 | Inside cmdClassify before line 190 |
| OFFLINE constant | classifier:9 | Top of file |
| OFFLINE branch in classifyIssue/cmdClassify | classifier:331-349 | Inside classifyIssue |
| OFFLINE reasoning in checkDependsOn | classifier:253-255 | checkDependsOn at line 92 |
| issueHasWorkflowInProgressLabel | classifier:153-157 | New function |
| issueHasRemoteClaimComment (GitLab version) | classifier:159-174 | New function using forge.listIssueNotes |
| Remote claim check in classifyIssue | classifier:366 | After closed-state check before classify() call |
| stateLooksValid | repair-state:380-396 | New function |
| Three-way stale branch in repair() | repair-state:495-522 | Before unconditional reconstruct at line 346 |
| Ownership Rules block in stateContent | repair-state:443-448 | Inside stateContent between Pending Gates and Last Evidence |
| fixOwner computation | repair-state:419-421 | Inside stateContent |
