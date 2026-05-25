# Phase 3 - Plan: issue-163

## Blueprint

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | `clearAdvisoryClaim` returns status enum; `cmdFinalize` captures result + null-folder fallback; `checkClosureInvariants` adds in-progress-label invariant; `cmdWatchPr` emits `cleanups[]`; add `cmdAuditLabels`/`cmdRepairLabels`; dispatch/usage/exports | GitHub primary implementation |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Byte-identical copy of above | COMMON_SCRIPTS enforcement |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | Receipt wiring only (clearAdvisoryClaim enum, cmdFinalize fallback, checkClosureInvariants, watchMergeRequests cleanups) | GitLab forge sync; no audit/repair subcommands per D1 |
| `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` | Receipt wiring only (same as GitLab; Gitea API) | Gitea forge sync; no audit/repair subcommands per D1 |
| `scripts/simulate-workflow-walkthrough.js` | 5 new test functions + registration | Test coverage |
| `docs/api.md` | Document `claim_label_removed` wiring; add `audit-labels`/`repair-labels` (GitHub-only) | Public API doc |
| `CHANGELOG.md` | `[Unreleased]` entry | User-visible change log |

### Files NOT to Modify
- `scripts/kaola-workflow-closure-contract.js` — schema and invariant already complete; byte-identical across trees
- `scripts/kaola-workflow-sink-merge.js` — bare ghExec, not mockable; label receipt deferred to #164
- GitLab/Gitea sink-merge scripts — same reason

### Build Sequence
1. `clearAdvisoryClaim()` return-status refactor — everything downstream depends on this
2. `checkClosureInvariants()` in-progress-label invariant — independent; needed before finalize emit
3. `cmdFinalize` capture + null-folder fallback + emit — depends on 1 and 2
4. `cmdWatchPr` capture + `cleanups[]` emit — depends on 1
5. `cmdAuditLabels` + `cmdRepairLabels` + dispatch + usage + exports — independent of 1-4
6. Byte-identical copy to Codex plugin (`cp`) — depends on all primary changes
7. GitLab receipt wiring (steps 1-4 equivalents) — depends on understanding of primary
8. Gitea receipt wiring (steps 1-4 equivalents) — depends on 7 pattern
9. Tests (5 functions) + registration — depends on all script changes
10. Docs + CHANGELOG — last

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Tasks 5 (audit commands) | No deps on other in-flight changes |
| Serial | Tasks 1→2→3→4→6 | Sequential dependency chain |
| B | Tasks 7, 8 | Disjoint forge files; can run after 6 |
| Serial | 9→10 | Tests need all code complete |

### External Dependencies
None — `fs`, `path`, `child_process` (Node built-ins); `gh` CLI already used

## Task List

### Task 1: `clearAdvisoryClaim()` returns status enum (GitHub primary)
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js` (L347–353 only)
- Depends On: none
- Parallel Group: serial
- Action: MODIFY
- Implement:
  ```js
  function clearAdvisoryClaim(issueNumber, reason) {
    if (OFFLINE || issueNumber == null) return 'skipped_offline';
    let status = 'failed';
    try {
      ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]);
      status = 'removed';
    } catch (_) {}
    if (reason) {
      try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: ' + reason]); } catch (_) {}
    }
    return status;
  }
  ```
- Mirror: `postAdvisoryClaim` (L324) for the OFFLINE/null gate; existing `ghExec` wrapping
- Validate: `node -e "require('./scripts/kaola-workflow-claim.js')" && echo ok` (load check)

### Task 2: `checkClosureInvariants()` adds in-progress-label invariant (primary)
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js` (inside `checkClosureInvariants` function, before `return`)
- Depends On: Task 1 (conceptually; structurally independent)
- Parallel Group: serial
- Action: MODIFY
- Implement: Add after the `roadmap-mirror-clean` block, **outside** the `issueNumber > 0` guard:
  ```js
  // outside issueNumber guard: offline-skip (skipped_offline) must not violate even when issueNumber is null
  const labelStatus = receipt.claim_label_removed;
  if (labelStatus !== 'skipped_offline' && labelStatus !== 'removed' && labelStatus !== 'already_absent') {
    const invLabel = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'in-progress-label-removed');
    violations.push({ id: 'in-progress-label-removed', description: invLabel ? invLabel.description : 'workflow:in-progress label was not removed after closure' });
  }
  ```
- Mirror: `roadmap-mirror-clean` violation push pattern (inv lookup via `closureContract.CLOSURE_INVARIANTS.find(i => i.id === ...)`)
- Validate: load check + test suite after Task 9

### Task 3: `cmdFinalize` capture + null-folder fallback + emit (primary)
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js` (L593 area in `cmdFinalize`)
- Depends On: Task 1, Task 2
- Parallel Group: serial
- Action: MODIFY
- Implement:
  1. Resolve issue number before `clearAdvisoryClaim`:
     ```js
     let issueNumber = folder && folder.issue_number;
     // null-folder fallback: archiveProjectDir ran first so dest is the archive path
     if (issueNumber == null && result.dest) {
       try {
         const statePath = path.join(result.dest, 'workflow-state.md');
         if (fs.existsSync(statePath)) {
           const n = parseInt(field(fs.readFileSync(statePath, 'utf8'), 'issue_number'), 10);
           issueNumber = Number.isFinite(n) ? n : null;
         }
       } catch (_) {}
     }
     ```
  2. Capture return value: `const claimLabelRemoved = clearAdvisoryClaim(issueNumber, 'finalized');`
  3. Build receipt and run invariants:
     ```js
     const closureReceipt = Object.assign({ issue_number: issueNumber }, result, { claim_label_removed: claimLabelRemoved });
     const invariantResult = checkClosureInvariants(root, closureReceipt);
     ```
  4. Update emit: `output(Object.assign({ status: 'closed' }, result, { claim_label_removed: claimLabelRemoved, closure_invariants: invariantResult }));`
- Mirror: `archiveProjectDir` return shape `{dest}` vs `{skipped:'source-missing'}` — guard `result.dest`; `field()` from `kaola-workflow-active-folders.js` (already imported)
- Validate: test suite (tests 1, 2, 3)

### Task 4: `cmdWatchPr` capture + `cleanups[]` emit (primary)
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js` (inside `cmdWatchPr` function, L866–895 area)
- Depends On: Task 1
- Parallel Group: serial
- Action: MODIFY
- Implement:
  1. Add `const cleanups = [];` near `const warnings = []` declaration
  2. In MERGED branch: `const claimLabelRemoved = clearAdvisoryClaim(folder.issue_number, 'pr merged'); cleanups.push({ folder: folder.project, claim_label_removed: claimLabelRemoved });`
  3. In CLOSED branch: same with `'pr closed'`
  4. Update emit: `const emit = { watched }; if (warnings.length > 0) emit.warnings = warnings; if (cleanups.length > 0) emit.cleanups = cleanups; output(emit);`
- Mirror: existing per-folder `warnings.push` pattern; `testWatchPrRoadmapCleanupWarning` emit shape
- Validate: test 4 + existing watch-pr tests must still pass

### Task 5: `cmdAuditLabels` + `cmdRepairLabels` + dispatch + usage + exports (primary)
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/kaola-workflow-claim.js` (add functions near L728; edit main() L897–914; edit module.exports)
- Depends On: none
- Parallel Group: A (can run concurrently with Tasks 1-4 in theory, but simpler to keep serial)
- Action: MODIFY
- Implement:
  ```js
  function cmdAuditLabels() {
    if (OFFLINE) { output({ stale: [], offline: true }); return; }
    const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
    const stale = raw ? JSON.parse(raw) : [];
    output({ stale, count: stale.length });
  }

  function cmdRepairLabels() {
    if (OFFLINE) { output({ dry_run: false, offline: true, removed: [], failed: [] }); return; }
    const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
    const stale = raw ? JSON.parse(raw) : [];
    const dryRun = !args.execute;
    if (dryRun) { output({ dry_run: true, would_remove: stale }); return; }
    const removed = [], failed = [];
    for (const it of stale) {
      try { ghExec(['issue', 'edit', String(it.number), '--remove-label', CLAIM_LABEL]); removed.push(it.number); } catch (_) { failed.push(it.number); }
    }
    output({ dry_run: false, removed, failed });
  }
  ```
  - Dispatch: add `if (sub === 'audit-labels') return cmdAuditLabels();` and `if (sub === 'repair-labels') return cmdRepairLabels();`
  - Usage string: append `|audit-labels|repair-labels`
  - `module.exports`: add `cmdAuditLabels, cmdRepairLabels`
- Mirror: `cmdStaleWorktreeCheck` (L724) for scan pattern; `cmdStaleWorktreeCleanup` `const dryRun = !args.execute` (L743); `ghExec` JSON parse at L878
- Validate: test 5

### Task 6: Byte-identical copy to Codex plugin
- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Test File: none (validate-script-sync.js)
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Tasks 1-5 all complete
- Parallel Group: serial (after primary)
- Action: MODIFY
- Implement: `cp scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Mirror: COMMON_SCRIPTS convention; `validate-script-sync.js` L40
- Validate: `node scripts/validate-script-sync.js` exits 0

### Task 7: GitLab receipt wiring
- File: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Test File: none (load-check only)
- Write Set: `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`
- Depends On: Task 6 (pattern understanding)
- Parallel Group: B
- Action: MODIFY
- Implement: Receipt wiring only — no audit/repair subcommands (D1 locked):
  - `clearAdvisoryClaim(issueIid, reason, ...)`: add `if (OFFLINE || issueIid == null) return 'skipped_offline';` at top; set `status = 'failed'`; on `forge.updateIssue(issueIid, { unlabels: [CLAIM_LABEL] })` success set `status = 'removed'`; keep note best-effort; `return status;`
  - `cmdFinalize`: capture status + null-folder fallback (uses `issue_iid` key from state file); add `claim_label_removed` to emit
  - `watchMergeRequests`/`cmdWatchMr`: capture into per-folder `cleanups[]`; emit `cleanups`
  - `checkClosureInvariants`: add same invariant logic as Task 2
- Mirror: Tasks 1-4 equivalents; GitLab `forge.updateIssue(..., { unlabels })` at L297
- Validate: `node -e "require('./plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js')" && echo ok`

### Task 8: Gitea receipt wiring
- File: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Test File: none (load-check only)
- Write Set: `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js`
- Depends On: Task 7 (pattern understanding)
- Parallel Group: B
- Action: MODIFY
- Implement: Same shape as Task 7 but:
  - `clearAdvisoryClaim(projectInfo, issueIid, ...)`: `if (OFFLINE || issueIid == null) return 'skipped_offline';` then if `projectInfo && projectInfo.full_name` use `forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] })` and set `'removed'` on success; else leave `'failed'`; `return status;`
  - `cmdFinalize`, `watchPullRequests`/`cmdWatchPr`, `checkClosureInvariants`: same receipt wiring as Task 7
- Mirror: Task 7; Gitea `forge.updateIssueLabels` at L298
- Validate: `node -e "require('./plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js')" && echo ok`

### Task 9: Tests (5 functions) + registration
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Tasks 1-8 all complete
- Parallel Group: serial
- Action: MODIFY
- Implement: Add 5 test functions + register each in `main()` after `testWatchPrRoadmapCleanupWarning()`:

  **`testFinalizeRemovesClaimLabel()`**
  - Plant active folder for issue N (sink: merge), shim for `issue view N` → `{"state":"open",...}`; shim records `--remove-label` call to a marker file
  - Run `runClaimOnline(['finalize','--project','...'])`, parse result
  - Assert `result.claim_label_removed === 'removed'` and `result.closure_invariants.ok === true`

  **`testFinalizeNullFolderFallbackReadsArchive()`**
  - Plant active folder for issue N; shim `issue view N` → `{"state":"closed"}` (so `activeByProject` returns null)
  - Shim success for `remove-label`
  - Run `runClaimOnline(['finalize','--project','...'])`
  - Assert `result.claim_label_removed === 'removed'` (not `'skipped_offline'`; fallback recovered issue number from archive)
  - Assert archive folder exists

  **`testFinalizeOfflineSkipsLabelInvariant()`**
  - Plant active folder for issue N
  - Run direct `spawnSync(process.execPath, [claimScript, 'finalize', '--project', '...'], { env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }, encoding: 'utf8', cwd: tmp })`
  - Parse JSON from stdout
  - Assert `result.claim_label_removed === 'skipped_offline'`
  - Assert `result.closure_invariants.ok === true` (invariant skipped, not violated)

  **`testWatchPrEmitsClaimLabelReceipt()`**
  - Plant sink:pr folder with `pr_url`; shim `pr view` → `{"state":"MERGED",...}`; shim success for `remove-label`
  - Run `runClaimOnline(['watch-pr'])`, parse result
  - Assert `result.cleanups` is non-empty array and `result.cleanups[0].claim_label_removed === 'removed'`
  - Assert folder archived

  **`testAuditAndRepairLabels()`**
  - Shim: `issue list --state closed --label workflow:in-progress` → `[{"number":N,"title":"t","url":"u"}]`; shim records `--remove-label` calls to marker file
  - (a) `runClaimOnline(['audit-labels'])`: assert `result.stale.length === 1`; assert no remove-label marker
  - (b) `runClaimOnline(['repair-labels'])`: assert `result.dry_run === true` and `result.would_remove` lists N; no remove-label marker
  - (c) `runClaimOnline(['repair-labels','--execute'])`: assert `result.removed` includes N; assert shim marker shows remove-label was called

- Mirror: `testWatchPrRoadmapCleanupWarning` (L2202) for shim+receipt pattern; `testFinalizeRoadmapCleanupFailureReceipt` (L2144) for failure-receipt pattern; L577-584 pattern for direct spawnSync offline test
- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed"

### Task 10: Docs + CHANGELOG
- File: `docs/api.md`, `CHANGELOG.md`
- Write Set: `docs/api.md` (§ Closure Contract), `CHANGELOG.md` (`[Unreleased]`)
- Depends On: Tasks 1-9 complete
- Action: MODIFY
- Implement: Document `claim_label_removed` is now populated by finalize/watch-pr; add `audit-labels` (dry-run, GitHub-only) and `repair-labels` (GitHub-only, `--execute` flag); `[Unreleased]` CHANGELOG entry
- Validate: review pass

## Advisor Notes

From `.cache/advisor-plan.md`:
- Test 3 (offline finalize) must use direct `spawnSync` with `{ KAOLA_WORKFLOW_OFFLINE: '1' }` — `runClaimOnline` hardcodes OFFLINE=0 at L491 and CANNOT be overridden via extraEnv
- `in-progress-label-removed` invariant check must be placed OUTSIDE the `issueNumber > 0` guard, with one-line comment explaining why (offline-skip must not violate even when issueNumber is null)
- Existing watch-pr tests only check `watched`/`warnings` — adding `cleanups[]` is additive-safe
- Two-command split (`audit-labels` + `repair-labels`) confirmed by AC wording

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | verifications in-session sufficient; no blueprint gaps requiring architect revision | |
