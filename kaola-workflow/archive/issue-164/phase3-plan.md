# Phase 3 - Plan: issue-164

## Blueprint

### Files to Create
None (all changes are modifications to existing files).

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Add `buildClosureReceipt(project, issueNumber, steps)` helper; extend `checkClosureInvariants(root, receipt, archiveDest)` with 3 new local invariants; refactor `cmdFinalize` to seed receipt + capture all fields; refactor `cmdWatchPr` to build per-folder receipts; export `buildClosureReceipt` | Core unification; gates all other files |
| `scripts/kaola-workflow-sink-merge.js` | Add `KAOLA_GH_MOCK_SCRIPT` support to `ghExec` (L20-23); add `buildClosureReceipt` to destructure at L6; emit closure receipt on success path in `postMergeCleanup`; run `checkClosureInvariants` | sink-merge was the only closure path emitting no receipt at all |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of GitHub claim.js (COMMON_SCRIPTS) | Validate-script-sync.js L39 enforces this |
| `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` | Byte-identical copy of GitHub sink-merge.js (COMMON_SCRIPTS) | Validate-script-sync.js L46 enforces this |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Structural port: same `buildClosureReceipt`, 3 invariants, refactor `cmdFinalize` (L576) + `watchMergeRequests` (L853); export helper | 4-forge parity |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Structural port: same helper, 3 invariants, refactor `cmdFinalize` (L562) + `cmdWatchPr` (L867); export helper | 4-forge parity |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | Structural port: capture forge step results; emit receipt on success path; run invariants | 4-forge parity |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` | Structural port: capture forge step results; emit receipt on success path; run invariants | 4-forge parity |
| `scripts/simulate-workflow-walkthrough.js` | Add 4 tests; register in `main()` at L2717 | Acceptance coverage |
| `docs/api.md` | Document `buildClosureReceipt`; update invariants count (3 → 6); document sink:pr deferral as pending-watcher; update flow-mapping table | AC #4 docs-only requirement |

### Build Sequence
1. `scripts/kaola-workflow-claim.js` — helper + invariants + cmdFinalize/cmdWatchPr + export (gates everything else)
2. `scripts/kaola-workflow-sink-merge.js` — mock support + receipt emission + invariants (imports buildClosureReceipt from step 1)
3. Parallel group A (disjoint write sets, all stable after steps 1+2):
   - `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (byte-copy of step 1)
   - `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` (byte-copy of step 2)
   - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (structural from step 1)
   - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (structural from step 1)
   - `docs/api.md` (independent)
4. Sequential after their claim peer (parallel with each other):
   - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` (after GitLab claim)
   - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js` (after Gitea claim)
5. `scripts/simulate-workflow-walkthrough.js` — 4 tests (can start once step 2 is stable; disjoint from steps 3-4)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | T1 alone | T2 depends on T1 |
| B | T2 alone | Depends on T1 |
| C | T3a, T3b, T3c, T3d, T6 | Disjoint write sets; all depend on T1+T2 stable |
| D | T4a, T4b | Disjoint; each depends on its claim peer in Group C |
| E | T5 | Depends on T2; disjoint from C/D |

### External Dependencies
None new. `buildClosureReceipt` uses `closureContract.emptyReceipt` (already imported via `closureContract` at claim.js L17). `field`, `readActiveFolders` already in claim.js scope.

## Key Interfaces

```js
// buildClosureReceipt — new export in claim.js
function buildClosureReceipt(project, issueNumber, steps) {
  // 1. seed: const receipt = closureContract.emptyReceipt(project, issueNumber)
  // 2. for each key in steps that exists in CLOSURE_RECEIPT_FIELDS, overwrite
  // 3. if steps.warnings is array, push each item onto receipt.warnings
  // 4. return receipt
}

// checkClosureInvariants — signature extended (third arg added)
function checkClosureInvariants(root, receipt, archiveDest) {
  // existing: roadmap-source-absent, roadmap-mirror-clean, in-progress-label-removed (3 checks)
  // NEW: active-folder-absent
  //   readActiveFolders(root).some(f => f.project === receipt.project) → violation
  // NEW: archive-state-closed
  //   when archiveDest is set: read archiveDest/workflow-state.md
  //   field(content, 'status') must be 'closed' or 'abandoned' → else violation
  //   skip (no violation) when archiveDest absent
  // NEW: branch-worktree-resolved
  //   receipt.worktree_removed === 'failed' || receipt.branch_removed === 'failed' → violation
}
```

## removeWorktree Mapping

`removeWorktree` returns `{removed, path}` or `{removed, reason}` or throws:
- `{removed: true}` → `'removed'`
- `{removed: false, reason: 'missing'}` → `'missing'`
- `{removed: false}` without reason → `'failed'`
- exception → `'failed'`
- `--keep-worktree` flag (finalize) → `'kept'` (not called)

## sink-merge archiveDest

```js
const archiveDest = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
// finalize already ran (assertNoLiveWorkflowFolder enforces this)
```

## GitLab/Gitea Forge → Receipt Field Mapping

**GitLab (`kaola-gitlab-workflow-sink-merge.js` L259-266):**
| Forge call | Receipt field | Success | Failure |
|-----------|--------------|---------|---------|
| `forge.closeIssue(args.issue)` | `remote_issue_closed` | `'closed'` | `'failed'` |
| `forge.updateIssue(args.issue, {unlabels: [forge.CLAIM_LABEL]})` | `claim_label_removed` | `'removed'` | `'failed'` |
| `git branch -d args.branch` | `branch_removed` | `'removed'` | `'failed'` |
| OFFLINE path | `remote_issue_closed`, `claim_label_removed` | `'skipped_offline'` | — |

**Gitea (`kaola-gitea-workflow-sink-merge.js` L259-266):**
| Forge call | Receipt field | Success | Failure |
|-----------|--------------|---------|---------|
| `forge.closeIssue(args.issue)` | `remote_issue_closed` | `'closed'` | `'failed'` |
| `forge.updateIssueLabels(projectInfo, args.issue, {remove: [CLAIM_LABEL]})` | `claim_label_removed` | `'removed'` | `'failed'` |
| `git branch -d args.branch` | `branch_removed` | `'removed'` | `'failed'` |
| OFFLINE path | `remote_issue_closed`, `claim_label_removed` | `'skipped_offline'` | — |

## cmdFinalize Data Flow

```
archiveProjectDir → result (has dest, roadmap_source_removed, roadmap_regenerated, archive)
removeWorktree → mapped to worktree_removed enum
clearAdvisoryClaim → claim_label_removed
probe remote_issue_closed: OFFLINE → 'skipped_offline'; issueIsClosed(n) → 'already_closed'; else 'skipped_offline'
branch_removed: 'kept' (finalize does not delete branch)
buildClosureReceipt(project, issueNumber, {archive, roadmap_source_removed, roadmap_regenerated,
  remote_issue_closed, claim_label_removed, worktree_removed, branch_removed})
checkClosureInvariants(root, receipt, result.dest)
output({status:'closed', ...result, claim_label_removed, closure_receipt: receipt, closure_invariants})
```

## cmdWatchPr Data Flow (per folder)

```
archiveProjectDir(root, folder) → result (result.dest = archiveDest for this folder)
removeWorktree → mapped to worktree_removed
clearAdvisoryClaim → cleanups entry capture
branch_removed: 'kept'
remote_issue_closed: 'skipped_offline' or probe (watch-pr path depends on PR close, not issue close)
buildClosureReceipt(folder.project, folder.issue_number, {...all fields...})
checkClosureInvariants(root, receipt, result.dest)
cleanups.push({folder, claim_label_removed, receipt, closure_invariants})
```

## sink-merge Success Path Data Flow

```
After Step 9 (branch operations):
  issueClosed: OFFLINE→'skipped_offline'; try gh issue close→'closed'/catch→'failed'
  labelRemoved: OFFLINE→'skipped_offline'; try gh --remove-label→'removed'/catch→'failed'
  branchRemoved: try git branch -d→'removed'/catch→'failed'
  worktreeRemoved: try removeWorktree→mapped enum/catch→'failed'
  archiveDest = path.join(mainRoot, 'kaola-workflow', 'archive', args.project)
  archive: fs.existsSync(archiveDest)→'closed' else 'failed'
  roadmapSource: fs.existsSync(path.join(mainRoot,'kaola-workflow','.roadmap','issue-'+N+'.md'))→'absent' else 'failed'
  roadmapRegenerated: 'skipped' (sink-merge does not regenerate)
  receipt = buildClosureReceipt(project, issueNumber, {archive, roadmap_source_removed,
    roadmap_regenerated, remote_issue_closed, claim_label_removed, worktree_removed, branch_removed})
  invariants = checkClosureInvariants(mainRoot, receipt, archiveDest)
  process.stdout.write(JSON.stringify({status:'merged', closure_receipt:receipt, closure_invariants:invariants}) + '\n')
```

Exit-3 path returns `{exitCode: 3}` BEFORE this block — untouched.

## Task List

### Task 1: GitHub claim.js — helper + invariants + cmdFinalize + cmdWatchPr
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (existing tests must stay green; new tests in T5)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: serial (T1 first)
- Action: MODIFY
- Implement:
  1. Add `buildClosureReceipt(project, issueNumber, steps)` function before the exports block; export it
  2. Change `checkClosureInvariants(root, receipt)` signature to `(root, receipt, archiveDest)` and add 3 new invariant checks after existing 3
  3. Refactor `cmdFinalize` (L581-619): capture `removeWorktree` result, probe `remote_issue_closed`, set `branch_removed: 'kept'`, call `buildClosureReceipt`, call `checkClosureInvariants(root, receipt, result.dest)`, emit `closure_receipt` + `closure_invariants` in output
  4. Refactor `cmdWatchPr` (L912-944): per-folder: capture `removeWorktree` result, build per-folder receipt, run invariants, push full receipt onto cleanups entry; preserve `cleanups[]` and `warnings[]` keys
- Mirror: clearAdvisoryClaim pattern (L347-358); existing receipt fields in cmdFinalize (L604-618); cleanups pattern from #163
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0)

### Task 2: GitHub sink-merge.js — ghExec mock + receipt emission + invariants
- File: `scripts/kaola-workflow-sink-merge.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 1 (buildClosureReceipt export)
- Parallel Group: serial (T2 after T1)
- Action: MODIFY
- Implement:
  1. Add `KAOLA_GH_MOCK_SCRIPT` check to `ghExec` at L20-23 (copy claim.js L49-54 pattern)
  2. Add `buildClosureReceipt` to destructure at L6
  3. Add `checkClosureInvariants` to destructure at L6
  4. On success path after Step 9: capture per-step results (see data flow above), call buildClosureReceipt + checkClosureInvariants, emit JSON to stdout
  5. Preserve exit-3 path untouched
- Mirror: `ghExec` with KAOLA_GH_MOCK_SCRIPT at claim.js L49-54; output() emit pattern from claim.js
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0)

### Task 3a: Codex plugin claim.js — byte-identical copy
- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Task 1 (byte source)
- Parallel Group: C
- Action: MODIFY (byte-copy from T1 result)
- Implement: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Validate: `node scripts/validate-script-sync.js` (in-sync)

### Task 3b: Codex plugin sink-merge.js — byte-identical copy
- File: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Depends On: Task 2 (byte source)
- Parallel Group: C
- Action: MODIFY (byte-copy from T2 result)
- Implement: `cp scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`
- Validate: `node scripts/validate-script-sync.js` (in-sync)

### Task 3c: GitLab claim.js — structural port
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: Task 1 (pattern)
- Parallel Group: C
- Action: MODIFY
- Implement:
  1. Add `buildClosureReceipt` (same signature and body, using GitLab `closureContract.emptyReceipt`)
  2. Extend `checkClosureInvariants` with 3 new invariants (same logic)
  3. Refactor `cmdFinalize` (L576-613): same data flow, forge-specific fields
  4. Refactor `watchMergeRequests` (L853-879): per-folder receipts
  5. Export `buildClosureReceipt`
- Mirror: T1 pattern; GitLab field names (`issue_iid`)
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0); `node scripts/validate-script-sync.js`

### Task 3d: Gitea claim.js — structural port
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: Task 1 (pattern)
- Parallel Group: C
- Action: MODIFY
- Implement: same structural port as 3c but for Gitea forge layer and `cmdWatchPr` at L867
- Mirror: T1 pattern
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0); `node scripts/validate-script-sync.js`

### Task 4a: GitLab sink-merge.js — structural port
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`
- Depends On: Task 3c (GitLab buildClosureReceipt export)
- Parallel Group: D
- Action: MODIFY
- Implement:
  1. Add `buildClosureReceipt`, `checkClosureInvariants` to destructure from GitLab claim
  2. Convert discarded try/catch blocks at L259-266 to capture step results using forge→field mapping table above
  3. Emit receipt on success path; compute archiveDest; run invariants
- Mirror: GitHub sink-merge T2 pattern; GitLab forge→field mapping table
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0)

### Task 4b: Gitea sink-merge.js — structural port
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js`
- Depends On: Task 3d (Gitea buildClosureReceipt export)
- Parallel Group: D
- Action: MODIFY
- Implement: same as 4a but Gitea forge calls per mapping table
- Mirror: GitHub sink-merge T2 pattern; Gitea forge→field mapping table
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0)

### Task 5: Tests — 4 new test functions
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Task 2
- Parallel Group: E (alongside C/D once T2 stable)
- Action: MODIFY
- Implement (4 test functions, registered in main() at L2717):
  1. `testSinkMergeEmitsClosureReceipt`: spawnSync sink-merge OFFLINE=1; assert status===0, stdout last JSON line parses to receipt with expected enums, `closure_invariants.ok === true`
  2. `testWatchPrMergedClosureReceipt`: runClaimOnline watch-pr on a merged PR folder; assert `cleanups[0].receipt` has fields including `worktree_removed`, `branch_removed`
  3. `testFinalizeOfflineClosureReceiptSkipped`: direct spawnSync CLAIM_JS with KAOLA_WORKFLOW_OFFLINE:'1'; assert `closure_receipt.remote_issue_closed === 'skipped_offline'`, `closure_receipt.claim_label_removed === 'skipped_offline'`, `closure_invariants.ok === true`
  4. `testSinkMergeMockabilityAndReceipt`: writeShimFiles + ghMockEnv, run sink-merge ONLINE (KAOLA_GH_MOCK_SCRIPT set); assert mock routed through, receipt `remote_issue_closed === 'closed'`, `claim_label_removed === 'removed'`
- Mirror: `testFinalizeRemovesClaimLabel`, `testFinalizeOfflineSkipsLabelInvariant` (direct spawnSync pattern), `testWatchPrEmitsClaimLabelReceipt`
- Validate: `node scripts/simulate-workflow-walkthrough.js` (exit 0)

### Task 6: docs/api.md — documentation update
- File: `docs/api.md`
- Write Set: `docs/api.md`
- Depends On: design lock (T1+T2 stable)
- Parallel Group: C (independent)
- Action: MODIFY
- Implement:
  1. Document `buildClosureReceipt(project, issueNumber, steps)` helper in claim.js API section
  2. Update invariants count: "checks three invariants" → "checks six invariants" with descriptions
  3. Document `closure_receipt` and `closure_invariants` fields on cmdFinalize and cmdWatchPr output
  4. Document sink-merge now emits closure receipt JSON on success
  5. Add sink:pr deferral note: receipt for sink:pr is emitted by cmdWatchPr at merge (pending-watcher behavior)
  6. Update flow-mapping table to mark #164 shipped
- Mirror: existing API docs format in docs/api.md
- Validate: doc-updater review in Phase 6

## Advisor Notes

- sink-merge must run `checkClosureInvariants` (invariant 7 fires precisely here)
- `warnings` IS in the schema (`string[]`, initialized to `[]`) — helper correctly appends
- Tests 1 and 3 assert `closure_invariants.ok === true` (no 5th test needed)
- GitLab/Gitea forge calls throw on failure — same try/catch-sets-`'failed'` pattern as GitHub ghExec
- archiveDest for cmdWatchPr comes from each folder's own `archiveProjectDir` result `.dest`

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | advisor found gaps resolved inline in phase3-plan.md with targeted verification | 5 advisor items addressed without re-dispatch: warnings confirmed in schema, sink-merge invariants locked, archiveDest threading explicit, forge field tables complete |
