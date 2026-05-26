# Phase 1 - Research / Discovery: issue-168

## Deliverable
Fix sink-merge post-merge issue-close so it runs from a stable git CWD (`mainRoot`), not from `os.tmpdir()`, across all three forge editions (GitHub, GitLab, Gitea). Add a regression test that verifies `remote_issue_closed: 'closed'` in the receipt.

## Why
After a successful merge sink, linked GitHub/GitLab/Gitea issues remain OPEN. The `gh`/`glab`/`tea` CLI inherits `os.tmpdir()` as CWD (set before worktree removal) and cannot auto-detect the repo, so the issue close silently fails. The process still exits 0, leaving the issue open and requiring manual intervention on every merge.

## Affected Area

| File | Role |
|------|------|
| `scripts/kaola-workflow-sink-merge.js` | GitHub canonical — `postMergeCleanup` Step 8, `ghExec` calls at ~lines 237-239 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Plugin copy, byte-identical — same fix |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | GitLab — `forge.closeIssue` at ~line 268 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Gitea — `forge.closeIssue` at ~line 268 |
| `scripts/simulate-workflow-walkthrough.js` | Main test — `testSinkMergeMockabilityAndReceipt` at line 2927 needs CWD regression case |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | GitLab in-process tests |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Gitea in-process tests |

## Key Patterns Found

1. **CWD set to tmpdir before forge calls**: `process.chdir(os.tmpdir())` at Step 0 (~line 299 GitHub, ~line 339 GitLab/Gitea) — `scripts/kaola-workflow-sink-merge.js:299`
2. **Git calls are CWD-safe**: all `git` subprocess calls after Step 0 pass `-C mainRoot` arg or `{ cwd: mainRoot }` exec option — `scripts/kaola-workflow-claim.js:197`
3. **Forge calls are NOT CWD-safe**: `ghExec` at lines 237-239 passes no `cwd`; GitLab/Gitea `forge.closeIssue` passes no `execOptions.cwd` — `scripts/kaola-workflow-sink-merge.js:237`
4. **Forge layers support cwd passthrough**: `glabExec` in `kaola-gitlab-forge.js:14` and `teaExec` in `kaola-gitea-forge.js:18` accept `options.execOptions` forwarded to `execFileSync`
5. **ghExec signature**: defined inline in sink-merge (lines 20-25) and in claim.js (lines 49-54); accepts opts object passed to `execFileSync`
6. **Error swallowed**: Step 8 uses `catch (_) {}` — "best-effort cleanup" pattern; errors are not logged

## Test Patterns

- Framework: hand-rolled assert, no runner
- GitHub: `scripts/simulate-workflow-walkthrough.js` — `testSinkMergeMockabilityAndReceipt` (line 2927) uses `KAOLA_GH_MOCK_SCRIPT` + `initGitRepoWithBareRemote`; this is the right test to extend
- GitLab: `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` — `withForge(stubs, fn)` in-process stubbing, calls `runDirectMerge(args, opts)` with `options.root`
- Gitea: `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` — same pattern as GitLab
- Mock env vars: `KAOLA_GH_MOCK_SCRIPT`, `KAOLA_GLAB_MOCK_SCRIPT`, `KAOLA_TEA_MOCK_SCRIPT`

## Config & Env

- `KAOLA_WORKFLOW_OFFLINE=1` — skips forge calls entirely; all affected tests use this except `testSinkMergeMockabilityAndReceipt`
- `KAOLA_GH_MOCK_SCRIPT` — path to mock script; `ghExec` routes through it when set
- `KAOLA_GLAB_MOCK_SCRIPT` — GitLab forge mock
- `KAOLA_TEA_MOCK_SCRIPT` — Gitea forge mock

## External Docs

None — internal patterns sufficient.

## GitHub Issue

KaolaBrother/Kaola-Workflow#168

## Completeness Score

10/10

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient; no external API behavior needed |

## Notes / Future Considerations

- The plugin copy (`plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`) is byte-identical to the canonical; fix must be applied to both.
- `checkClosureInvariants` does NOT verify `remote_issue_closed === 'closed'` — this is an existing gap but out of scope for this fix (the AC only requires non-silent failure, not invariant enforcement).
- `claim_label_removed: 'failed'` is a documented false alarm (cmdFinalize removes the label earlier); the real defect is `remote_issue_closed: 'failed'`.
- For the regression test: the existing `testSinkMergeMockabilityAndReceipt` already mocks `gh` via `KAOLA_GH_MOCK_SCRIPT` — extend it to assert `receipt.remote_issue_closed === 'closed'` and verify the mock was called from a valid git repo CWD.
