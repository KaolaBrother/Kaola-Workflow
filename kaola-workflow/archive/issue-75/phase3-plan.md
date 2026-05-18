# Phase 3 - Plan: issue-75

## Blueprint

### Files to Create
None.

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Gaps 1, 2, 3 (4 sites), 4 | Fix lifecycle cleanup gaps |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Identical mirror of above | Plugin must remain byte-for-byte identical |
| `commands/kaola-workflow-phase6.md` | Step 8b conditional on sink:merge + Gap 5 release-fallback note | PR-sink path must not archive active folder; SINK_KIND from main-repo path |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Mirror of phase6.md changes | Plugin SKILL mirrors doc |
| `commands/workflow-next.md` | Git freshness block recovery note (Gap 5) + Co-active Folders advisory (Gap 6) | Lifecycle guidance for practitioners |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Mirror of workflow-next.md changes | Plugin SKILL mirrors doc |
| `scripts/simulate-workflow-walkthrough.js` | 4 new regression tests | Prevent regressions for all 4 gaps |

### Build Sequence
1. Task 1 — Gap 1: cmdWatchPr `excludeClosedIssues: false` (1-line, prerequisite for Gap 2 doc correctness)
2. Task 2 — Gap 3: cmdFinalize `removeWorktree` after archive
3. Task 3 — Gap 3: cmdRelease `removeWorktree` after archive
4. Task 4 — Gap 3: cmdWatchPr both MERGED/CLOSED branches `removeWorktree`
5. Task 5 — Gap 2 code: cmdSinkFallback archived-folder guard
6. Task 6 — Gap 4: cmdStatus partition to `{ active, drift, count }`
7. Task 7 — Mirror: copy claim.js edits to plugin; validate `diff` exit 0
8. Task 8 — Gap 2 doc: phase6.md Step 8b conditional (SINK_KIND from main-repo path)
9. Task 9 — Gap 2 doc mirror: kaola-workflow-finalize SKILL.md
10. Task 10 — Gaps 5+6 doc: workflow-next.md
11. Task 11 — Gaps 5+6 doc mirror: kaola-workflow-next SKILL.md
12. Task 12 — Regression tests (4 test functions)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | 1–6 (sequential) | Same file — must be sequential |
| B | 7 | After A; single file diff |
| C | 8+10 in parallel, then 9+11 in parallel | Disjoint files; 9 and 11 mirror 8 and 10 respectively |
| D | 12 | After A; disjoint test file |
| E | Validate: `node scripts/simulate-workflow-walkthrough.js` | After B+D |

### External Dependencies
None. All imports (`fs`, `path`, `issueIsClosed`, `readActiveFolders`, `projectDir`, `removeWorktree`, `archiveProjectDir`, `activeByProject`, `clearAdvisoryClaim`, `updateState`, `output`, `parseArgs`, `getRoot`, `assert`) already present in `scripts/kaola-workflow-claim.js`.

## Task List

### Task 1: Gap 1 — cmdWatchPr excludeClosedIssues
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: A (sequential)
- Action: MODIFY
- Implement: Line ~543: change `readActiveFolders(root)` → `readActiveFolders(root, { excludeClosedIssues: false })`
- Mirror: `sink-merge.js:225` uses same pattern
- Validate: `grep "excludeClosedIssues: false" scripts/kaola-workflow-claim.js | wc -l` ≥ 2

### Task 2: Gap 3 — cmdFinalize removeWorktree
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 1
- Parallel Group: A (sequential)
- Action: MODIFY
- Implement:
  ```js
  function cmdFinalize() {
    const root = getRoot();
    const args = parseArgs(process.argv.slice(3));
    assert(args.project, '--project required');
    const folder = activeByProject(root, args.project);
    const result = archiveProjectDir(root, args.project, 'closed');
    try { removeWorktree(root, args.project, folder); } catch (_) {}
    clearAdvisoryClaim(folder && folder.issue_number, 'finalized');
    output(Object.assign({ status: 'closed' }, result));
  }
  ```
- Mirror: `sink-merge.js:227` pattern `try { removeWorktree(...) } catch (_) {}`
- Validate: `grep "removeWorktree" scripts/kaola-workflow-claim.js | wc -l` ≥ 1

### Task 3: Gap 3 — cmdRelease removeWorktree
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 2
- Parallel Group: A (sequential)
- Action: MODIFY
- Implement: After `archiveProjectDir` call in cmdRelease, add:
  `try { removeWorktree(root, folder.project, folder); } catch (_) {}`
- Mirror: same pattern as Task 2
- Validate: verify `removeWorktree` appears in cmdRelease body

### Task 4: Gap 3 — cmdWatchPr both branches removeWorktree
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 3
- Parallel Group: A (sequential)
- Action: MODIFY
- Implement:
  ```js
  if (state === 'MERGED') {
    archiveProjectDir(root, folder.project, 'closed');
    try { removeWorktree(root, folder.project, folder); } catch (_) {}
    clearAdvisoryClaim(folder.issue_number, 'pr merged');
  } else if (state === 'CLOSED') {
    archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + Date.now());
    try { removeWorktree(root, folder.project, folder); } catch (_) {}
    clearAdvisoryClaim(folder.issue_number, 'pr closed');
  }
  ```
- Mirror: same silent-catch pattern
- Validate: two `removeWorktree` calls inside cmdWatchPr

### Task 5: Gap 2 code — cmdSinkFallback archived-folder guard
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 4
- Parallel Group: A (sequential)
- Action: MODIFY
- Implement:
  ```js
  function cmdSinkFallback() {
    const root = getRoot();
    const args = parseArgs(process.argv.slice(3));
    assert(args.project, '--project required');
    if (!fs.existsSync(projectDir(root, args.project))) {
      output({ updated: false, project: args.project, reason: 'project archived' });
      return;
    }
    const reason = args.reason || 'merge fallback';
    updateState(root, args.project, content => content
      .replace(/^sink:.*$/m, 'sink: pr')
      .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
    output({ updated: true, project: args.project, sink: 'pr', reason });
  }
  ```
- Mirror: `sink-pr.js updateStateSinkBlock` has `if (!fs.existsSync(stateFile)) return;`
- Validate: `grep "project archived" scripts/kaola-workflow-claim.js`

### Task 6: Gap 4 — cmdStatus drift partition
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 5
- Parallel Group: A (sequential)
- Action: MODIFY
- Implement:
  ```js
  function cmdStatus() {
    const root = getRoot();
    const all = readActiveFolders(root, { excludeClosedIssues: false });
    const active = [];
    const drift = [];
    for (const folder of all) {
      if (folder.issue_number != null && issueIsClosed(folder.issue_number)) {
        drift.push(folder);
      } else {
        active.push(folder);
      }
    }
    output({ active, drift, count: active.length });
  }
  ```
- Note: `issueIsClosed` already imported at line 11 — no import change needed
- OFFLINE fail-open: `issueIsClosed` returns false when offline → all in `active[]`, `drift: []`
- Validate: `grep "drift" scripts/kaola-workflow-claim.js`

### Task 7: Mirror — copy claim.js edits to plugin
- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Tasks 1–6
- Parallel Group: B
- Action: MODIFY (apply identical edits)
- Implement: Apply all 6 Task 1–6 edits to the plugin mirror
- Validate:
  ```bash
  diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js
  ```
  Exit code must be 0. Non-zero output means divergence — fix before continuing.

### Task 8: Gap 2 doc — phase6.md Step 8b conditional
- File: `commands/kaola-workflow-phase6.md`
- Write Set: `commands/kaola-workflow-phase6.md`
- Depends On: Tasks 1–6 (doc references working code)
- Parallel Group: C (parallel with Task 10)
- Action: MODIFY
- Implement:
  1. Before the cmdFinalize/Step 8b block, OUTSIDE any `cd` subshell, add SINK_KIND capture from main-repo path:
     ```bash
     SINK_KIND=$(awk '/^## Sink/,0' "kaola-workflow/$KAOLA_PROJECT/workflow-state.md" | grep '^sink:' | awk '{print $2}')
     SINK_KIND=${SINK_KIND:-merge}
     ```
  2. Wrap the finalize block with `if [ "$SINK_KIND" = "merge" ]; then ... fi`
  3. Add note: if `sink: pr`, skip Step 8b — folder stays active for watch-pr
- Critical constraint: SINK_KIND capture must read from `kaola-workflow/$KAOLA_PROJECT/workflow-state.md` (main repo), NOT from inside `$ACTIVE_WORKTREE_PATH`. This file does not exist in the worktree.
- Add Gap 5 release-fallback note under Startup Step 0b

### Task 9: Gap 2 doc mirror — kaola-workflow-finalize SKILL.md
- File: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Depends On: Task 8
- Parallel Group: C (after Task 8)
- Action: MODIFY
- Implement: Apply identical structural change as Task 8

### Task 10: Gaps 5+6 doc — workflow-next.md
- File: `commands/workflow-next.md`
- Write Set: `commands/workflow-next.md`
- Depends On: Tasks 1–6
- Parallel Group: C (parallel with Task 8)
- Action: MODIFY
- Implement:
  1. Under Step 0b, add "Git Freshness Block Recovery" subsection:
     > If startup succeeds but Step 1 Git freshness check blocks, run
     > `node "$CLAIM_JS" release --project "$KAOLA_PROJECT" --reason git-freshness-block`
     > to release the just-claimed folder and worktree before stopping.
  2. After Step 0b / before Step 1, add "Co-active Folders" advisory paragraph

### Task 11: Gaps 5+6 doc mirror — kaola-workflow-next SKILL.md
- File: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md`
- Depends On: Task 10
- Parallel Group: C (after Task 10)
- Action: MODIFY
- Implement: Apply same two additions as Task 10

### Task 12: Regression tests
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Tasks 1–6
- Parallel Group: D
- Action: MODIFY
- Implement 4 test functions:

  **A. testWatchPrArchivesClosedIssuePrFolder**
  - `initGitRepo` + gh shim returning `{ state: 'MERGED', number: 1 }` for PR view, `{ state: 'closed' }` for issue
  - `plantActiveFolder` with `sink: pr`, `pr_url` set, issue 200
  - `runClaimOnline(['watch-pr'], tmp)` → assert `watched: 1`, folder archived to archive/

  **B. testSinkFallbackSkipsArchivedProject**
  - Two sub-cases:
    1. Guard path: no `kaola-workflow/` folder (archived). Call `sink-fallback --project already-archived` → assert exit 0, `updated: false`, `reason: 'project archived'`, directory not created
    2. Positive path: seed active folder. Call `sink-fallback --project active-project` → assert exit 0, `updated: true`

  **C. testFinalizeReleaseCleansWorktree**
  - `initGitRepo` + `writeGhShimForStartup`
  - Startup issue 601 → assert worktree exists
  - Finalize → assert worktree path gone
  - Startup issue 602 → assert worktree exists
  - Release → assert worktree path gone

  **D. testStatusShowsClosedIssueDrift**
  - Two `plantActiveFolder` calls (issue 100 open, issue 200 closed)
  - Gh shim: issue 100 → `{"state":"open"}`, issue 200 → `{"state":"closed"}`
  - `runClaimOnline(['status'], tmp)` → assert `active.length === 1`, `drift.length === 1`, `count === 1`
  - `runNode(['status'], tmp)` (offline) → assert `active.length === 2`, `drift.length === 0`, `count === 2`

- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

## Advisor Notes
(from `.cache/advisor-plan.md`)

1. **SINK_KIND path (CRITICAL)**: Must be read from main-repo `kaola-workflow/$KAOLA_PROJECT/workflow-state.md`, NOT from inside `$ACTIVE_WORKTREE_PATH`. Place capture before any `cd` subshell.
2. **cmdStatus consumers**: Verified grep — only doc references, no programmatic parsers. Safe to add `drift` field.
3. **Test B positive case**: Must add positive case (active folder exists, update succeeds) alongside the guard path case.
4. **Merge→PR pivot trade-off**: After fix, sink-fallback guard fires for merge→PR pivot path, leaving orphaned GitHub PR with no local tracking. Acceptable per AC (no folder recreation). Document below.
5. **Mirror diff validation**: Task 7 must run `diff` and assert exit 0.

## Known Trade-offs

### Merge→PR pivot path (post-fix behavior)
When a workflow was started as sink:merge and `sink-fallback` is called after `cmdFinalize` has archived the folder (the merge→PR pivot case, sink-merge exit code 3), the new guard in `cmdSinkFallback` returns `updated: false, reason: 'project archived'` instead of switching the folder's sink to `pr`. This means:
- The PR on GitHub remains open
- No local active folder tracks the PR
- `watch-pr` will not archive anything

This is acceptable: the AC requires only that archived folders are not recreated. The merge→PR pivot scenario implies the issue was already finalized, so tracking the PR separately is out of scope. A future issue can add explicit merge→PR pivot handling if needed.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no blueprint gaps requiring re-architecture; corrections were additive (SINK_KIND path, Test B positive case, trade-off doc) and incorporated directly into this phase file |
