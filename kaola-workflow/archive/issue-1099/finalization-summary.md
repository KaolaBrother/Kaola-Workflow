# Finalization Summary — issue-1099

## Delivered

The GitHub request sink now honors a base branch that **requires a merge queue**. When
`pr_auto_merge` is true, `scripts/kaola-workflow-sink-pr.js` Step 9 probes
`PullRequest.isMergeQueueEnabled` **once** per run via `gh api graphql`, then merges:

- probe **true** → `gh pr merge <url> --auto` (the queue decides the merge method; no
  `-d/--delete-branch`, which gh ≥2.64.0 rejects on a queue branch because deleting the branch would
  close the queued PR);
- probe **false**, or a probe that fails or cannot be parsed → the **original argv, verbatim**
  (`--auto --squash --delete-branch`), so a forge that cannot be probed behaves exactly as before;
- a failed merge call keeps today's warning-only, exit-0 behavior.

One machine-readable line `pr_auto_merge: merge_queue | direct | failed` is written **before** the
final `sink_pr:` line, which stays last and unchanged; when auto-merge is not requested, no such line
is written at all. `failed` is reported only when the merge call itself throws — a *probe* failure
falls back to the direct lane, so it reports `direct`.

**No new config key** (queueing is a property of the branch rule, not a separate opt-in).
**GitLab and Gitea are unchanged** — zero production changes there, proven by their suites passing
green. No forge settings were touched.

### D-mq1 correction (recorded on the issue)

The pre-#1099 call `gh pr merge --auto --squash --delete-branch` **always failed** on a
queue-required branch: gh ≥2.64.0 refuses `-d/--delete-branch` there outright. Because the sink only
warned and exited 0, the PR silently stayed open and never entered the queue. The earlier D-mq1
finding held that `--auto` "does not fail" on a queue branch; the failure came from the merge-method
and delete-branch flags that rode along with it.

## Files Changed

| Path | Nature |
|---|---|
| `scripts/kaola-workflow-sink-pr.js` | Production: Step 9 probe + queue lane, file-header contract |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-pr.js` | Production: byte-identical Codex mirror |
| `scripts/simulate-workflow-walkthrough.js` | Tests: G1–G4 + G3b (stub `gh` gains `api graphql` and a configurable merge exit) |
| `README.md` | Docs: request-sink lifecycle paragraph |
| `docs/api.md` | Docs: `pr_auto_merge` config behavior + sink output contract |
| `CHANGELOG.md` | Docs: `[Unreleased]` `### Added` entry |

## Test Coverage

Written test-first; G1/G3/G3b were proven RED on the pre-change code before implementation.

| Case | Scenario | Pre-change | Post-change |
|---|---|---|---|
| G1 | `testSinkPrMergeQueueEnabledUsesQueueArgv` | RED (exit 1) | PASS |
| G2 | `testSinkPrMergeQueueDisabledKeepsOriginalArgv` | RED (exit 1) | PASS |
| G3 | `testSinkPrMergeQueueProbeFailureFallsBack` | RED (exit 1) | PASS |
| G3b | `testSinkPrMergeQueueMergeFailureReportsFailed` | RED (exit 1) | PASS |
| G4 | `testSinkPrMergeQueueInactiveSkipsProbeAndMerge` | PASS (guardrail) | PASS |

No network: the tests use the injected argv-logging `gh` stub and an isolated per-test HOME, so the
real `~/.config/kaola-workflow/config.json` is never read or written. No existing assertion was
deleted or weakened.

## Validation

(populated by the finalize transaction)

## Changed Paths

(populated by the finalize transaction)

## Documentation Docking

DOCKED — see `.cache/doc-docking.md`. README, `docs/api.md`, and the CHANGELOG `[Unreleased]`
section were updated; `docs/installation.md` needed no change because no config key was added, and no
ADR was warranted because this is one branch added to an existing option.

## Follow-Up Items

- The research for this issue observed a pre-existing Gitea gap: `autoMerge` never sends
  `merge_when_checks_succeed`, so Gitea's `pr_auto_merge` is effectively "merge now" rather than
  "merge when checks succeed", which does not match `docs/api.md`. **Out of #1099's scope and not
  filed** — the Host owns that decision.

## Readiness

FROZEN candidate `fd9d673adf1786368a5fcb1289a6301ad57c4e3e` (rebased onto `77a384ad`), full
four-chain receipt green and unwaived at that commit. Ready to sink-merge to main and close #1099.

## Sink Findings

post_rebase_tests: skipped

archived_paths:
- kaola-workflow/archive/issue-1099/.cache/chain-receipt.json
- kaola-workflow/archive/issue-1099/.cache/doc-docking.md
- kaola-workflow/archive/issue-1099/.cache/final-validation.md
- kaola-workflow/archive/issue-1099/.cache/origin/selection-record.json
- kaola-workflow/archive/issue-1099/finalization-summary.md
- kaola-workflow/archive/issue-1099/mission-ledger.jsonl
- kaola-workflow/archive/issue-1099/workflow-state.md
