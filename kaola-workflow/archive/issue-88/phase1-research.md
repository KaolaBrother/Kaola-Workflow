# Phase 1 - Research / Discovery: issue-88

## Deliverable

Port five parity gaps from the GitHub classifier and repair-state scripts to their GitLab counterparts:
1. `parallel_mode` config bypass in `cmdClassify()`
2. OFFLINE/local roadmap fallback in `classifyIssue()` and `checkDependsOn()`
3. Remote active claim detection via `forge.listIssueNotes` in `classifyIssue()`
4. `stateLooksValid()` + three-way stale branch in `repair()`
5. `## Ownership Rules` block in `stateContent()`

## Why

GitLab classifier and repair-state scripts lag the GitHub reference implementations. These gaps cause incorrect `green` verdicts when `parallel_mode` is set, during OFFLINE operation, and when a remote claim is active. The repair-state gaps produce incomplete state files missing ownership metadata and stale-state detection.

## Affected Area

| File | Role |
|------|------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js` | Target: classifier (gaps 1-3) |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js` | Target: repair-state (gaps 4-5) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js` | Test suite |
| `scripts/kaola-workflow-classifier.js` | GitHub reference: classifier |
| `scripts/kaola-workflow-repair-state.js` | GitHub reference: repair-state |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-forge.js` | Forge API: CLAIM_LABEL, listIssueNotes, discoverProject |

## Key Patterns Found

1. **parallel_mode bypass** — `scripts/kaola-workflow-classifier.js:58-69` reads `~/.config/kaola-workflow/config.json` via `readOrCreateConfig()`; `cmdClassify():315-319` short-circuits with `{ verdict: 'green', reasoning: 'parallel_mode=X; bypassing classifier' }` if `config.parallel_mode !== 'auto'`
2. **OFFLINE constant + branch** — `classifier:9` `const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1'`; `cmdClassify():331-349` reads `.roadmap/issue-N.md`, parses `next_step` for `blocked by #N`, calls `parseAreaLabelsFromText()`, calls `classify()` with offline-derived labels/body; `checkDependsOn():253` returns `{ verdict: 'blocked', reasoning: 'OFFLINE and depends-on:#N label present; conservative block' }` when OFFLINE
3. **Remote claim detection** — `classifier:153-157` `issueHasWorkflowInProgressLabel(labels)` checks `labels.some(l => l.name === 'workflow:in-progress')`; `classifier:159-174` `issueHasRemoteClaimComment(issueNum)` calls `gh api repos/OWNER/NAME/issues/N/comments`, matches `/<!--\s*kw:claim\s+(project|sess)=/`, checks `updated_at` within 24h; `cmdClassify():366` checks both and returns `{ verdict: 'blocked', reasoning: 'issue #N has a remote workflow claim' }`
4. **stateLooksValid** — `scripts/kaola-workflow-repair-state.js:380-396`: checks phase is known, `next_command` matches phase N and project, `next_skill` matches, `phase_file` exists if non-N/A, status is active → returns bool; `main():495-522`: three-way branch — complete / stale (rewrite + "repaired stale") / valid-and-current (no write)
5. **Ownership block** — `repair-state:443-448`: `## Ownership Rules` with `main_session_role: orchestrator`, `implementation_owner: tdd-guide` (phase 4) or `N/A`, `fix_owner: tdd-guide or build-error-resolver` (phase 4/5/6) or `N/A`, `inline_emergency_fallback_authorized: no`; `last_result: 'state_repaired_from_artifacts'`

## Test Patterns

- Framework: Node.js `assert`, no external framework
- Location: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-workflow-scripts.js`
- Classifier tests (lines 258-290): `withForge({viewIssue stubs})` + `classifier.classifyIssue(iid, root)` in-process
- Repair-state tests (lines 405-415): bare block + `repair.repair('project', root)` in-process; reads written state file; asserts fields and preserved sections
- `withForge({viewIssue, listIssueNotes, discoverProject stubs}, cb)` pattern for forge-dependent in-process tests
- `runNode` (lines 69-74): spawnSync for subprocess tests; `runNodeRaw` (lines 76-79): non-asserting variant

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — triggers offline mode in classifier
- `~/.config/kaola-workflow/config.json` — contains `{ parallel_mode: 'auto' }`; read by `readOrCreateConfig()`
- `forge.CLAIM_LABEL = 'workflow:in-progress'` — in `kaola-gitlab-forge.js:7`
- `forge.listIssueNotes(project, issueIid)` — GitLab notes API at `kaola-gitlab-forge.js:161-167`
- GitLab labels are plain string arrays: use `.includes()` not `.some(l => l.name === ...)`

## External Docs

None — internal patterns sufficient.

## GitHub Issue

KaolaBrother/Kaola-Workflow#88

## Completeness Score

10/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns only | No external library API behavior needed |

## Notes / Future Considerations

- `project` ref needed for `listIssueNotes` — derive from `forge.discoverProject()` or pass from call site
- GitLab's `last_result: 'reconstructed'` changes to `'state_repaired_from_artifacts'` (parity with GitHub)
- GitLab stateContent preserves `## GitLab` and `## Sink`; GitHub preserves only `## Sink` — maintain GitLab behavior for `## GitLab`
