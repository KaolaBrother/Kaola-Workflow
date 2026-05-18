# Code Architect Output — issue-75

## Key Design Decisions

- No new abstractions or helpers. All fixes inline into existing functions.
- `issueIsClosed` already imported at line 11 — no import change needed for Gap 4.
- `projectDir(root, project)` already exists at line 180 — used for Gap 2 sink-fallback guard.
- Plugin mirror (`plugins/kaola-workflow/scripts/kaola-workflow-claim.js`) confirmed byte-for-byte identical; copy after all code edits are applied.
- Gap 2 doc edit requires hoisting `SINK_KIND` capture before the conditional Step 8b block.

## Files to Modify (none created)

| File | Change Set |
|------|------------|
| `scripts/kaola-workflow-claim.js` | Gaps 1, 2 (sink-fallback guard), 3 (4 sites), 4 |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Identical mirror |
| `commands/kaola-workflow-phase6.md` | Gap 2 Step 8b conditional + Gap 5 note |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Gap 2 mirror |
| `commands/workflow-next.md` | Gap 5 note + Gap 6 Co-active Folders section |
| `plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md` | Gaps 5+6 mirror |
| `scripts/simulate-workflow-walkthrough.js` | 4 regression tests |

## Task List

### Task 1 — Gap 1: cmdWatchPr reads closed-issue folders
Line 543: `readActiveFolders(root)` → `readActiveFolders(root, { excludeClosedIssues: false })`

### Task 2 — Gap 3: cmdFinalize calls removeWorktree after archive
Add `try { removeWorktree(root, args.project, folder); } catch (_) {}` after `archiveProjectDir` call in cmdFinalize (line ~440). `folder` is already fetched before archive.

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

### Task 3 — Gap 3: cmdRelease calls removeWorktree after archive
Add `try { removeWorktree(root, folder.project, folder); } catch (_) {}` after `archiveProjectDir` in cmdRelease (line ~457).

```js
  const result = archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + ...);
  try { removeWorktree(root, folder.project, folder); } catch (_) {}
  clearAdvisoryClaim(folder.issue_number, args.reason || 'discarded');
```

### Task 4 — Gap 3: cmdWatchPr calls removeWorktree after each archive
Two insertions inside the MERGED and CLOSED branches (lines ~553-557):

```js
    if (state === 'MERGED') {
      archiveProjectDir(root, folder.project, 'closed');
      try { removeWorktree(root, folder.project, folder); } catch (_) {}
      clearAdvisoryClaim(folder.issue_number, 'pr merged');
    } else if (state === 'CLOSED') {
      archiveProjectDir(root, folder.project, 'abandoned', '.discarded-...');
      try { removeWorktree(root, folder.project, folder); } catch (_) {}
      clearAdvisoryClaim(folder.issue_number, 'pr closed');
    }
```

### Task 5 — Gap 2 code: cmdSinkFallback guard against archived folder
Guard before `updateState`: if `projectDir(root, args.project)` doesn't exist as directory, return early `{ updated: false, project, reason: 'project archived' }`.

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

### Task 6 — Gap 4: cmdStatus adds drift partition
Replace current 2-call cmdStatus with one-call + partition:

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

OFFLINE behavior: `issueIsClosed` returns false → all folders in `active[]`, `drift: []`. Correct fail-open.

### Task 7 — Mirror: Copy code changes to plugin
After Tasks 1-6: apply identical edits to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`. Validate: `diff scripts/kaola-workflow-claim.js plugins/kaola-workflow/scripts/kaola-workflow-claim.js` must return no output.

### Task 8 — Gap 2 doc: phase6.md Step 8b conditional
In `commands/kaola-workflow-phase6.md`:
1. Before the cmdFinalize block, add SINK_KIND capture:
   ```bash
   SINK_KIND=$(awk '/^## Sink/,0' "kaola-workflow/$KAOLA_PROJECT/workflow-state.md" | grep '^sink:' | awk '{print $2}')
   SINK_KIND=${SINK_KIND:-merge}
   ```
2. Wrap the `finalize` block with `if [ "$SINK_KIND" = "merge" ]; then … fi`
3. Add note: if `sink: pr`, skip Step 8b — folder stays active for watch-pr

### Task 9 — Gap 2 doc mirror: kaola-workflow-finalize SKILL.md
Apply identical structural change as Task 8 to `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`.

### Task 10 — Gaps 5+6 doc: workflow-next.md
1. After Step 0b output paragraph, add "Git Freshness Block Recovery" subsection: if startup succeeds but Step 1 blocks, run `cmdRelease --project ... --reason git-freshness-block`.
2. After Step 0b / before Step 1, add "Co-active Folders" advisory paragraph.

### Task 11 — Gaps 5+6 doc mirror: kaola-workflow-next SKILL.md
Apply same two additions as Task 10.

### Task 12 — Regression tests
Four new test functions in `scripts/simulate-workflow-walkthrough.js`:

**A. testWatchPrArchivesClosedIssuePrFolder**
- `initGitRepo` + gh shim (pr view → MERGED)
- `plantActiveFolder` with `sink: pr`, `pr_url` set, issue 200
- `runClaimOnline(['watch-pr'], ...)` → assert `watched: 1`, folder archived

**B. testSinkFallbackSkipsArchivedProject**
- Empty `tmp` dir (no kaola-workflow/ folder)
- `spawnSync(node, [claimScript, 'sink-fallback', '--project', 'already-archived'], offline)`
- Assert exit 0, `updated: false`, `reason: 'project archived'`
- Assert `!fs.existsSync(path.join(tmp, 'kaola-workflow', 'already-archived'))`

**C. testFinalizeReleaseCleansWorktree**
- `initGitRepo` + `writeGhShimForStartup`
- Startup issue 601, assert worktree exists
- Finalize → assert worktree gone
- Startup issue 602, assert worktree exists
- Release → assert worktree gone

**D. testStatusShowsClosedIssueDrift**
- Two `plantActiveFolder` calls (issue 100 open, issue 200 closed)
- Gh shim: issue 100 → `{"state":"open"}`, issue 200 → `{"state":"closed"}`
- `runClaimOnline(['status'], ...)` → assert `active.length===1`, `drift.length===1`, `count===1`
- `runNode(['status'], ...)` (offline) → assert `active.length===2`, `drift.length===0`, `count===2`

## Build Sequence & Parallelization

| Group | Tasks | Order |
|-------|-------|-------|
| A | 1–6 (code in claim.js) | Sequential, same file |
| B | 7 (mirror) | After A |
| C | 8+10 in parallel, then 9+11 | After A |
| D | 12 (tests) | After A |
| E | Validate: `node scripts/simulate-workflow-walkthrough.js` | After B+D |
