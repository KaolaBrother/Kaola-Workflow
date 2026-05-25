# Phase 1 - Research / Discovery: issue-161

## Deliverable
A closure-system v2 for Kaola-Workflow consisting of:
1. A closure contract document (added to `docs/api.md`) that defines 7 closure invariants and a closure receipt schema
2. A mapping of current code paths (`finalize`, `sink-merge`, `watch-pr`/`watch-mr`, `sink-pr`) to the new contract
3. The design scaffold enabling follow-up issues (#162–#165) to implement hardened roadmap cleanup, label cleanup, shared receipt, and audit command

## Why
Completed work can silently remain active in local roadmap state (stale `.roadmap/issue-N.md`) or carry remote advisory labels (`workflow:in-progress`) after issue closure. The current closure lifecycle is split across four surfaces — `finalize`, `sink-merge`, `sink-pr`, and `watch-pr`/`watch-mr` — with remote calls and worktree removal entirely best-effort (silent `catch (_) {}`), leaving no audit trail when they fail. Observed on 2026-05-25: closed issues #127, #147, #157, #160 still have `workflow:in-progress`.

## Affected Area

Primary files:
- `scripts/kaola-workflow-claim.js` — `archiveProjectDir` (496–537), `clearAdvisoryClaim` (346–352), `cmdFinalize` (539–564), `cmdRelease` (572–582), `cmdWatchPr` (833–858), `cmdStatus` (584–597)
- `scripts/kaola-workflow-sink-merge.js` — `postMergeCleanup` (191–239), `classifyMergeError` (40–50)
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` — mirror of GitHub functions
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` — mirror of GitHub functions
- `docs/api.md` — closure contract section to be added
- `docs/workflow-state-contract.md` — closure receipt reference

## Key Patterns Found

1. **`output(obj, code)` pattern** — `scripts/kaola-workflow-claim.js:440`: all subcommands return JSON on stdout; use this for closure receipt output in new subcommands
2. **`sink-fallback.json` receipt** — `scripts/kaola-workflow-sink-merge.js:~220`: `{project, branch, issue_number, reason, timestamp}` — natural template for the generalized `closure-receipt.json` schema
3. **`cmdStatus` drift partition** — `scripts/kaola-workflow-claim.js:584–597`: already partitions active folders into `{active, drift}` where `drift` = folder with issue already closed on remote — kernel of the audit command in #165
4. **`archiveProjectDir` return value** — returns `{archived: true, dest}` or `{skipped: 'source-missing'}` — extend with per-step result fields for the receipt
5. **Hard-fail pattern** — `assertNoLiveWorkflowFolder`, `assertBranchPushedToUpstream`, `assertCleanWorktree` in `sink-merge.js` show the established pattern for pre-condition enforcement that throws on failure
6. **`removeLegacyStateBlocks` missing from GitLab/Gitea** — `kaola-workflow-claim.js:505` calls it before archiving; both plugin mirrors at line 504 do not — pre-existing cross-forge drift

## Test Patterns
- Framework: hand-rolled assert (no external test framework)
- Location: `scripts/simulate-workflow-walkthrough.js` (primary), `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`, `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`
- Structure: each test function takes a `tmp` object (temp dir), runs subcommands via `spawnSync`, asserts on stdout/stderr/filesystem state
- Run: `node scripts/simulate-workflow-walkthrough.js` — must exit 0
- Gap: no test verifies `clearAdvisoryClaim` is called or label was removed; all tests run `KAOLA_WORKFLOW_OFFLINE=1`, so remote paths are structurally unreachable

## Config & Env
| Variable | Role |
|---|---|
| `KAOLA_WORKFLOW_OFFLINE=1` | Skip all network calls; audit must detect and mark remote checks as `skipped_offline` |
| `KAOLA_GH_MOCK_SCRIPT` | Substitute mock `gh` binary in tests — required for testing label-removal paths |
| `KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=token` | Force exit-3 classification — used in closure fallback tests |
| `CLAIM_LABEL` | `'workflow:in-progress'` — the advisory label to remove at closure |
| `KAOLA_SINK` | Override default `sink: merge` at claim time |

## External Docs
N/A — no external library, framework, or API behavior is needed. All patterns are internal Node.js and `gh` CLI calls already established in the codebase.

## GitHub Issue
KaolaBrother/Kaola-Workflow#161

## Completeness Score
10/10

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | | Internal patterns only; no external library/framework behavior needed |

## Notes / Future Considerations

### Dependency order for follow-up issues
1. **#161** (this issue): Define closure contract in `docs/api.md`; map existing flows; no code changes
2. **#164**: Implement shared closure receipt (all three forge editions must emit/use it)
3. **#162**: Harden roadmap cleanup (make `archiveProjectDir` roadmap-cleanup non-fatal → fatal where safe)
4. **#163**: Guarantee label cleanup (derive issue_number from `workflow-state.md` as fallback; make result visible in receipt)
5. **#165**: Implement `closure-audit` subcommand (reuse `cmdStatus` drift partition + `validate-remote` roadmap logic)
6. Close #161 after all follow-ups ship (AC5 satisfied when audit command exists)

### Closure invariants to document in `docs/api.md`
For a completed linked issue N:
1. `kaola-workflow/.roadmap/issue-N.md` is absent
2. Generated `kaola-workflow/ROADMAP.md` does not list `#N` as active work
3. `kaola-workflow/{project}/` is absent from active folders
4. `kaola-workflow/archive/{project}/workflow-state.md` exists with `status: closed` and `step: complete` when local archive is available
5. The remote issue is closed only after acceptance criteria pass and implementation is published
6. The remote issue does not have `workflow:in-progress` after closure
7. Any branch/worktree cleanup is either complete or explicitly reported by stale-worktree tooling

### Closure receipt schema (for `docs/api.md`)
```json
{
  "project": "issue-N",
  "issue_number": N,
  "archive": "closed|abandoned|skipped|failed",
  "roadmap_source_removed": "removed|absent|failed",
  "roadmap_regenerated": "regenerated|skipped|failed",
  "remote_issue_closed": "closed|already_closed|skipped_offline|failed",
  "claim_label_removed": "removed|already_absent|skipped_offline|failed",
  "worktree_removed": "removed|missing|kept|failed",
  "branch_removed": "removed|kept|failed",
  "warnings": []
}
```

### Cross-forge parity gaps to fix in follow-ups
- `removeLegacyStateBlocks` missing from GitLab and Gitea `archiveProjectDir` (fix in #164 or #162)
- `cmdSinkFallback` live-folder guard inconsistency: GitHub misses archive check that GitLab/Gitea have (fix in #164)
- Gitea `clearAdvisoryClaim` silent-skip on absent `projectInfo.full_name` (fix in #163)
