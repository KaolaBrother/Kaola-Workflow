evidence-binding: n2_impl_sink 3c9cd2db0d1b

## RED

Three failing tests written before any implementation existed. Confirmed failing with `node scripts/simulate-workflow-walkthrough.js`:

RED: testSinkTransactionBlockedByForeignDirt — AssertionError: Expected exit code 1 for sink_blocked, got 0 (pre-impl: --sink flag unrecognized, fell through to runDirectMerge which exits 0)
RED: testSinkTransactionCrashResume — AssertionError: Expected receipt.steps.push_upstream === 'done' after resume, got undefined (pre-impl: no receipt written)
RED: testSinkTransactionCleanEndToEnd — AssertionError: Expected result.status === 'sinked', got undefined (pre-impl: --sink not routed)

## GREEN

After implementing `runSinkTransaction`, `sinkPreflight`, `writeSinkReceipt`, `loadOrInitReceipt`, `resolveSinkReceiptPath`, `sinkCopyDir`, `SINK_STEPS`, `SINK_ABORT_AFTER` in `scripts/kaola-workflow-sink-merge.js` and syncing all editions:

GREEN: testSinkTransactionBlockedByForeignDirt passes; 3/3 sink assertions green
GREEN: testSinkTransactionCrashResume passes; 4/4 sink assertions green
GREEN: testSinkTransactionCleanEndToEnd passes; 5/5 sink assertions green

Full walkthrough: "Workflow walkthrough simulation passed" — 19/19 tests green (including 3 new sink tests).

## Four-chain results

- claude: PASSED (`npm run test:kaola-workflow:claude` — "Workflow walkthrough simulation passed")
- codex: PASSED (`npm run test:kaola-workflow:codex` — "Kaola-Workflow walkthrough simulation passed")
- gitlab: PASSED (`npm run test:kaola-workflow:gitlab` — "GitLab Codex workflow walkthrough simulation passed")
- gitea: PASSED (`npm run test:kaola-workflow:gitea` — "Gitea Codex workflow walkthrough simulation passed")

## Implementation summary

### `scripts/kaola-workflow-sink-merge.js` (canonical)

Added before `main()`:
- `SINK_ABORT_AFTER` and `SINK_STEPS` constants
- `writeSinkReceipt(receiptPath, receipt)` — atomic temp+rename write
- `resolveSinkReceiptPath(mainRoot, project)` — live-then-archive resolution
- `loadOrInitReceipt(...)` — loads existing or initialises fresh receipt
- `sinkCopyDir(src, dest)` — recursive copy for `worktree_sync` step
- `sinkPreflight(mainRoot, project, branch, issueNumbers)` — 3-bucket classification:
  - Bucket 1: claim-time roadmap sources → auto-stash
  - Bucket 2: project-state duplicates → byte-verify + remove
  - Bucket 3 + registered worktrees excluded: any other path → `sink_blocked` refuse
- `runSinkTransaction(args, mainRoot, defBranch)` — 9-step SINK_STEPS loop with idempotent skip for `done` steps

Modified `main()` to detect `rawArgv.includes('--sink')` before `parseArgs()` and route to `runSinkTransaction`.

### `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`

Byte-identical copy of canonical (required by `validate-script-sync.js`).

### `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

Hand-ported forge edition. `closure` step uses `forge.closeIssue` / `forge.updateIssue` (MR/glab nouns). `finalize` step requires `./kaola-gitlab-workflow-claim`. No `gh` word boundary references.

### `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`

Hand-ported forge edition. `closure` step uses `forge.closeIssue` / `forge.updateIssueLabels` (tea/PR nouns). `finalize` step requires `./kaola-gitea-workflow-claim`. No `gh` references.

### `scripts/simulate-workflow-walkthrough.js`

Added three new test functions before the SCENARIO REGISTRY block:
- `testSinkTransactionBlockedByForeignDirt`
- `testSinkTransactionCrashResume`
- `testSinkTransactionCleanEndToEnd`

All three registered in `buildRegistry()`.
