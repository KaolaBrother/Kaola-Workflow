# Finalization Summary — issue-1106

## Delivered

Gitea `pr_auto_merge` now schedules the merge for when checks succeed instead of merging at once.
`plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` `mergePullRequest` adds
`merge_when_checks_succeed: true` to the merge request body only when `options.autoMerge` is set (the
Gitea ≥ 1.17 feature the existing `checkServerVersion` gate already guarded). The sink's
`maybeAutoMergeFromConfig` therefore posts
`{"Do":"squash","delete_branch_after_merge":true,"merge_when_checks_succeed":true}`. An explicit
`--merge` without `--auto-merge` still merges immediately. GitHub and GitLab code is untouched.

## Files Changed

| Path | Nature |
|---|---|
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js` | Production: one conditional body field |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js` | Tests: exact autoMerge body and call order; non-autoMerge absence |
| `plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js` | Tests: `maybeAutoMergeFromConfig` end to end through the real forge and a mock `tea` |
| `docs/api.md` | Docs: Global config `pr_auto_merge` |
| `CHANGELOG.md` | Docs: `[Unreleased]` `### Fixed` entry |

## Test Coverage

Test-first: `6dd31d1b` (now `bf7f5248` after the rebase) was RED on the pre-fix forge. The forge-helpers
body assertion got `{"Do":"squash","delete_branch_after_merge":true}` and the sinks end-to-end assertion
got the same body, both exit 1. After the fix both suites exit 0. The finalize-round commit `54d6ab20`
folded the forge-helpers autoMerge case onto the existing in-process fake (a new `runner()` call counted
as a ninth unclassified spawn site against a ceiling of 8 and reddened the claude chain's
spawn-classification guard). Assertions unchanged; re-proven RED (exit 1, same actual/expected) with the
pre-fix `kaola-gitea-forge.js` swapped in, GREEN with the fix.

## Validation

classification: chains_green
green: true
mode: chain-receipt

4 chain(s) green over this tree

## Changed Paths

Files this branch changed outside the kaola-workflow/ run-state band:

- CHANGELOG.md
- docs/api.md
- plugins/kaola-workflow-gitea/scripts/kaola-gitea-forge.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-forge-helpers.js
- plugins/kaola-workflow-gitea/scripts/test-gitea-sinks.js

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. `docs/api.md` and the CHANGELOG `[Unreleased]` `### Fixed` entry.

## Follow-Up Items

- Untested (no Gitea instance): whether `delete_branch_after_merge` also applies when the merge is
  scheduled rather than immediate. Recorded in the issue's closing comment; no follow-up filed.

## Readiness

READY — four chains green and unwaived at `54d6ab20` (release-check pass); walkthrough 199/199.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1106/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1106/.cache/doc-docking.md
- kaola-workflow/archive/issue-1106/.cache/final-validation.md
- kaola-workflow/archive/issue-1106/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1106/finalization-summary.md
- kaola-workflow/archive/issue-1106/mission-ledger.jsonl
- kaola-workflow/archive/issue-1106/workflow-state.md
