# Architect Blueprint — issue-164

## Design Decisions

1. **Helper location**: `buildClosureReceipt(project, issueNumber, steps)` in `kaola-workflow-claim.js`, added to `module.exports`. sink-merge reaches it via existing `require('./kaola-workflow-claim.js')` at L6 — no new module, no circular dependency.

2. **archive-state-closed via signature extension**: `checkClosureInvariants(root, receipt, archiveDest)` — third positional arg. Do NOT carry `archive_dest` on the receipt object. `archiveDest` is `result.dest` from `archiveProjectDir`. When absent, the check is skipped (mirrors offline-skip pattern).

3. **sink-merge receipt scope = post-conditions probed**: sink-merge does not call `archiveProjectDir`. Fields `archive`/`roadmap_source_removed`/`roadmap_regenerated` derived by probing post-conditions at sink-merge time. `roadmap_regenerated` → `'skipped'` (sink-merge does not regenerate).

4. **cmdFinalize `remote_issue_closed` = local-probe only**: finalize does NOT call `gh issue close`. Set via probe: OFFLINE → `'skipped_offline'`; `issueIsClosed(n)` true → `'already_closed'`; else `'skipped_offline'`. Only sink-merge sets `'closed'`.

5. **`branch_removed = 'kept'`** for finalize and watch-pr; only sink-merge sets `'removed'`/`'failed'`.

6. **removeWorktree → `worktree_removed` mapping**:
   - `{removed: true}` → `'removed'`
   - `{removed: false, reason: 'missing'}` → `'missing'`
   - `{removed: false}` without reason → `'failed'`
   - thrown exception → `'failed'`
   - `--keep-worktree` → `'kept'`

7. **Exit code preservation in sink-merge**: receipt emitted only on success path. Exit-3 returns before receipt.

8. **cmdWatchPr shape preservation**: `cleanups[]` and `warnings[]` arrays stay. Receipt attaches as field on each `cleanups[]` entry.

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-claim.js` | Add `buildClosureReceipt`; extend `checkClosureInvariants` signature + 3 invariants; refactor `cmdFinalize` + `cmdWatchPr`; export | P0 |
| `scripts/kaola-workflow-sink-merge.js` | Add `KAOLA_GH_MOCK_SCRIPT` to `ghExec`; import `buildClosureReceipt`; emit receipt on success path | P0 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of GitHub claim.js | P1 |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Byte-identical copy of GitHub sink-merge.js | P1 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Structural port: same helper, 3 invariants, refactor cmdFinalize + watchMergeRequests; export | P1 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Structural port: same helper, 3 invariants, refactor cmdFinalize + watchMergeRequests; export | P1 |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Structural port: emit receipt from postMergeCleanup; forge layer has mock support already | P2 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Structural port: emit receipt from postMergeCleanup | P2 |
| `scripts/simulate-workflow-walkthrough.js` | Add 4 tests in main() at L2717 | P2 |
| `docs/api.md` | Document buildClosureReceipt; update invariants count; sink:pr deferral docs | P3 |

## Key Interface

```js
buildClosureReceipt(project, issueNumber, steps) // → receipt
  // 1. const receipt = emptyReceipt(project, issueNumber)
  // 2. for each key in steps that is a CLOSURE_RECEIPT_FIELDS status field, overwrite
  // 3. append steps.warnings to receipt.warnings
  // 4. return receipt (only schema fields; archiveDest is NOT a field)

checkClosureInvariants(root, receipt, archiveDest) // → { ok, violations }
  // existing 3 checks
  // + active-folder-absent: readActiveFolders(root).some(f => f.project === receipt.project) → violation
  // + archive-state-closed: read archiveDest/workflow-state.md when set; status must be 'closed'/'abandoned'
  // + branch-worktree-resolved: worktree_removed==='failed' || branch_removed==='failed' → violation
```

## Data Flow

- **cmdFinalize**: archiveProjectDir → result → removeWorktree (mapped) → clearAdvisoryClaim → probe remote_issue_closed → buildClosureReceipt → checkClosureInvariants(root, receipt, result.dest) → output({status:'closed', ...result, claim_label_removed, closure_receipt: receipt, closure_invariants})
- **cmdWatchPr**: per merged/closed folder, build per-folder receipt, push onto cleanups[] entry, run invariants per folder
- **sink-merge**: capture issueClosed, labelRemoved, branchRemoved, probe archive/roadmap → buildClosureReceipt → emit JSON to stdout

## Build Sequence (ordered by dependency)

1. `scripts/kaola-workflow-claim.js` (helper + invariants + cmdFinalize/cmdWatchPr + export) — gates everything
2. `scripts/kaola-workflow-sink-merge.js` (mock support + receipt emission) — imports buildClosureReceipt from step 1
3. Parallel group A (disjoint write sets, all depend on 1+2 stable):
   - 3a. `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-copy)
   - 3b. `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (byte-copy)
   - 3c. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (structural)
   - 3d. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (structural)
4. After their claim peer:
   - 4a. `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (after 3c)
   - 4b. `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` (after 3d)
5. `scripts/simulate-workflow-walkthrough.js` — 4 tests (once step 2 stable; disjoint from 3/4)
6. `docs/api.md` — independent

## Task Write Sets

| Task | Write set | Depends on |
|------|-----------|-----------|
| T1 | `scripts/kaola-workflow-claim.js` | — |
| T2 | `scripts/kaola-workflow-sink-merge.js` | T1 |
| T3a | `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | T1 |
| T3b | `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | T2 |
| T3c | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | T1 |
| T3d | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | T1 |
| T4a | `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | T3c |
| T4b | `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | T3d |
| T5 | `scripts/simulate-workflow-walkthrough.js` | T2 |
| T6 | `docs/api.md` | design lock |

Parallelization: Group A = {T3a, T3b, T3c, T3d, T6} after T1+T2. Group B = {T4a, T4b} after Group A. T5 alongside Group A once T2 lands.

## Required Imports / Dependencies

- **claim.js**: `emptyReceipt` via existing `closureContract` (L17). `field`, `readActiveFolders` already imported. No new `require`.
- **sink-merge.js**: add `buildClosureReceipt` to destructure at L6. No `closure-contract` require needed.
- **GitLab/Gitea sink-merge**: add `buildClosureReceipt` to respective claim destructure at L9. Forge layer already has mock support.

## Test Patterns

All 4 in `scripts/simulate-workflow-walkthrough.js`, registered in `main()` at L2717:

1. `testSinkMergeEmitsClosureReceipt` — spawnSync sink-merge with OFFLINE='1'; assert status===0 AND stdout JSON receipt with expected enums
2. `testWatchPrMergedClosureReceipt` — runClaimOnline(['watch-pr'],...); assert cleanups[0].receipt has populated fields
3. `testFinalizeOfflineClosureReceiptSkipped` — spawnSync CLAIM_JS with KAOLA_WORKFLOW_OFFLINE:'1' (NOT runClaimOnline); assert receipt remote_issue_closed==='skipped_offline', claim_label_removed==='skipped_offline', invariants.ok===true
4. `testSinkMergeMockabilityAndReceipt` — writeShimFiles+ghMockEnv, run sink-merge ONLINE; assert mock routed and receipt reflects gh results

## Explicit Out-of-Scope

- No edits to `kaola-workflow-closure-contract.js` (frozen schema)
- Do NOT add invariant 5 (`remote-closed-after-publish`)
- No new sink-pr runtime behavior
- No changes to `COMMON_SCRIPTS` or `BYTE_IDENTICAL_GROUPS` (already listed)
- Do NOT touch `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`
- cmdFinalize does not close remote issues (stays local-only)
- Exit-3 path untouched
- 4 tests, not 5

## Verification Notes

- GitLab/Gitea `forge.closeIssue`/`forge.updateIssue`/`forge.updateIssueLabels` throw on failure (execFileSync) and return normalized object on success. Use same try/catch-sets-`'failed'` pattern as GitHub's ghExec.
- GitLab/Gitea sink-merge discarded try/catch blocks at L262-263 must be converted to capture success/failure.
- Verify with: `node scripts/simulate-workflow-walkthrough.js` (exit 0) and `node scripts/validate-script-sync.js` (in-sync).
