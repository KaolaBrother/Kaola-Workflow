# Phase 1 - Research / Discovery: issue-164

## Deliverable
Introduce a shared `buildClosureReceipt()` helper used by all closure paths (`cmdFinalize`, `cmdWatchPr`/`cmdWatchMr`, `sink-merge`) to produce one machine-readable closure receipt seeded from `emptyReceipt()`. Track all receipt fields including the currently missing `worktree_removed`, `branch_removed`, and `remote_issue_closed`. Add `KAOLA_GH_MOCK_SCRIPT` support to sink-merge's `ghExec` for testability. Extend `checkClosureInvariants` to verify all 7 invariants. Keep `sink: pr` deferred behavior explicit in receipts. Port to all 4 forge trees.

## Why
Closure logic is spread across 3 separate flows (finalize, watch-pr, sink-merge). No closure path seeds `emptyReceipt()`. Fields `worktree_removed`, `branch_removed`, `remote_issue_closed` are tracked by at most one path but never recorded. Sink-merge emits no receipt at all. This makes closure invariants hard to audit and allows silent failures.

## Affected Area

### Core changes
- `scripts/kaola-workflow-claim.js`: add `buildClosureReceipt()` helper; refactor `cmdFinalize` + `cmdWatchPr` to seed receipt + capture all fields; extend `checkClosureInvariants` for all 7 invariants
- `scripts/kaola-workflow-sink-merge.js`: add `KAOLA_GH_MOCK_SCRIPT` support to `ghExec` (L20-23); refactor `postMergeCleanup` to build + emit closure receipt
- `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`: byte-identical copy of GitHub claim
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`: equivalent changes
- `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`: equivalent changes (forge API)
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`: equivalent changes
- `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`: equivalent changes (forge API)

### Tests
- `scripts/simulate-workflow-walkthrough.js`: 5+ new tests for: merge sink receipt, watch-pr receipt, offline skipped fields, worktree_removed tracking, sink-merge mockability

### Docs
- `docs/api.md`: update cmdFinalize + sink-merge output shapes; note `buildClosureReceipt` helper; sink:pr pending state docs

## Key Patterns Found

1. **`buildClosureReceipt()` placement**: Must go in claim.js (not closure-contract.js which is pure data). Acts as thin mapping layer: seeds `emptyReceipt()`, accepts result values, maps to enum strings. (`scripts/kaola-workflow-closure-contract.js` — byte-identical enforced, pure data)

2. **`removeWorktree` returns meaningful value** — `{removed: true, path}` or `{removed: false, reason: 'missing'}`. All three closure paths currently discard it. Fix: capture and map to `worktree_removed` enum: `removed=true` → `'removed'`, `removed=false, reason='missing'` → `'missing'`, exception → `'failed'`. (`scripts/kaola-workflow-claim.js:197-209`)

3. **sink-merge `ghExec` not mockable** — L20-23 calls `execFileSync('gh', ...)` directly without checking `KAOLA_GH_MOCK_SCRIPT`. Fix: add the same env check as claim.js's `ghExec` at L49-54. This enables testing the receipt without a live `gh` CLI. (`scripts/kaola-workflow-sink-merge.js:20-23`)

4. **sink-merge emits nothing to stdout** — `postMergeCleanup` returns `undefined` or `{exitCode:3}`. `main()` does not emit JSON. Fix: emit receipt JSON at end of successful merge path. (`scripts/kaola-workflow-sink-merge.js:191-239, 241+`)

5. **`checkClosureInvariants` checks only 3 of 7 invariants** — Checks `roadmap-source-absent`, `roadmap-mirror-clean`, `in-progress-label-removed`. Missing 4: `active-folder-absent` (check no live folder exists), `archive-state-closed` (check archive state file shows closed/abandoned), `remote-closed-after-publish` (check remote issue is closed — requires gh call, must skip offline), `branch-worktree-resolved` (check worktree/branch removed). (`scripts/kaola-workflow-claim.js:554`)

6. **sink:pr pending receipt**: `cmdFinalize` is not called for `sink:pr` — `watch-pr` archives when PR merges. `cmdSinkPr` creates PR; receipt at that point shows `archive: 'skipped'` (pending watcher). The receipt must be explicit that final archive/remote cleanup is pending. (`scripts/kaola-workflow-claim.js:cmdSinkPr`)

7. **`emptyReceipt()` defaults all fields to `'failed'`** — ensures unpopulated fields are fail-loud. The `buildClosureReceipt()` helper should call `emptyReceipt()` first, then overwrite with actual results. (`scripts/kaola-workflow-closure-contract.js`)

## Test Patterns
- Framework: hand-rolled assertions; no external runner
- Location: `scripts/simulate-workflow-walkthrough.js`
- sink-merge mock: once `KAOLA_GH_MOCK_SCRIPT` is added to sink-merge `ghExec`, can use same `ghMockEnv(binDir)` + `writeShimFiles` pattern
- For 5 AC test scenarios:
  1. Merge sink receipt — run finalize (sink:merge path) with shim, assert full receipt including `worktree_removed`
  2. PR sink pending — run sink-pr (or plant sink:pr folder), assert `archive: 'skipped'` or explicit pending field
  3. watch-pr merged — run watch-pr with shim on sink:pr folder, assert full per-folder receipt
  4. Offline skipped — run finalize/watch-pr with OFFLINE=1, assert `remote_issue_closed: 'skipped_offline'`
  5. Failed roadmap/label — use existing patterns from #162/#163 tests

## Config & Env
- `KAOLA_GH_MOCK_SCRIPT` — must be extended to sink-merge `ghExec`
- `KAOLA_WORKFLOW_OFFLINE=1` — skips all gh calls; `remote_issue_closed`, `claim_label_removed` → `'skipped_offline'`

## External Docs
None needed — all patterns are internal

## GitHub Issue
KaolaBrother/Kaola-Workflow#164

## Completeness Score
8/10 (sink-merge path is harder to validate without running actual merge; `checkClosureInvariants` extension to 4 new invariants needs careful offline handling)

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | internal patterns sufficient; no external library behavior needed | |

## Notes / Future Considerations
- `active-folder-absent` invariant: checks `readActiveFolders(root)` finds no folder with matching project name — always true after `archiveProjectDir` runs, so it's a cheap invariant
- `archive-state-closed`: reads `workflow-state.md` in archive and checks `status: closed/abandoned` — can be done offline
- `remote-closed-after-publish`: requires `gh issue view N` — must skip if OFFLINE; skip if `remote_issue_closed` is `'skipped_offline'`
- `branch-worktree-resolved`: checks `worktree_removed !== 'failed'` and `branch_removed !== 'failed'` — local-only check
- The 4 new invariant checks can be added incrementally; only `remote-closed-after-publish` needs an API call
