# Code Explorer — Issue #108

## 1. `kaola-gitlab-workflow-sink-merge.js` — where `sink-fallback.json` is written

**File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js`

**Receipt write — lines 192–201 (inside `postMergeCleanup`):**
```
const receiptPath = path.join(mainRoot, 'kaola-workflow', args.project, '.cache', 'sink-fallback.json');
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify({...}) + '\n');
return { exitCode: 3 };
```

- `mainRoot` = resolved from `getCoordRoot(root)` via `mainRootFromCoord()` (lines 105–107, 237)
- `args.project` = `--project` CLI flag, validated via `isSafeName()` at line 224
- Full path: `{mainRoot}/kaola-workflow/{args.project}/.cache/sink-fallback.json`

**Critical problem:** The write happens at `postMergeCleanup()` (lines 177–214), called at line 280 after `ffMergeLoop`. By this point `cmdFinalize` has already archived `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/`. The `fs.mkdirSync({ recursive: true })` silently re-creates the live path.

## 2. `kaola-gitlab-workflow-claim.js` — `cmdSinkFallback()`

**File:** `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js`

**`cmdSinkFallback` — lines 571–585:**
```javascript
function cmdSinkFallback() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(isSafeName(args.project), 'unsafe project name');
  if (!fs.existsSync(projectDir(root, args.project))) {
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  const reason = args.reason || 'merge fallback';
  updateState(root, args.project, content => content
    .replace(/^sink:.*$/m, 'sink: mr')
    .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
  output({ updated: true, project: args.project, sink: 'mr', reason });
}
```

**Archive detection:** Checks `!fs.existsSync(projectDir(root, args.project))` — only tests the LIVE path, NOT `kaola-workflow/archive/{project}/`.

**Bug sequence:**
1. Phase 6 Step 8b `cmdFinalize` → `archiveProjectDir` renames `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/`. Live path is gone.
2. `sink-merge.js` exits 3, writes `.cache/sink-fallback.json` — `fs.mkdirSync({ recursive:true })` recreates `kaola-workflow/{project}/.cache/`.
3. `cmdSinkFallback --project {project}` — guard finds live path EXISTS (re-created in step 2), passes through.
4. `updateState` writes empty `workflow-state.md` (content was '' since no state file existed).

**`updateState` — lines 203–208:** reads file, applies fn, writes — when file missing, uses empty string; both `.replace()` calls are no-ops → empty `workflow-state.md` written.

## 3. Archive path structure

- Archive path: `kaola-workflow/archive/{project}/`
- `cmdFinalize` → `archiveProjectDir` (claim.js lines 392–420): writes `status: closed`, then `fs.renameSync(src, dest)` where src=live path, dest=archive path
- No dedicated `isArchived()` predicate exists
- `sink-merge.js` has `resolveProjectFile` (lines 49–55) that falls back to archive path for READS only

## 4. GitHub (non-GitLab) path

**`scripts/kaola-workflow-claim.js` `cmdSinkFallback` — lines 561–575:**
- Same bug: `!fs.existsSync(projectDir(root, args.project))` check only, no archive check
- Sets `sink: pr` (vs `sink: mr` in GitLab version)
- No companion direct-merge script that writes receipts → receipt recreation is GitLab-specific

## 5. Test patterns

**Test runner command:** `npm run test:kaola-workflow:gitlab` runs:
1. `validate-kaola-workflow-gitlab-contracts.js`
2. `simulate-gitlab-workflow-walkthrough.js` → includes `test-gitlab-forge-helpers.js`, `test-gitlab-workflow-scripts.js`, `test-gitlab-sinks.js`
3. `simulate-gitlab-codex-workflow-walkthrough.js`

**Test framework:** Hand-rolled `assert` (Node built-in). Sequential scripts, each test uses `fs.mkdtempSync` for isolation, `finally` for cleanup.

**Existing coverage:**
- `test-gitlab-sinks.js` "Bug 2" lines 272–330: three tests for `cmdSinkFallback` (archived/live/unsafe-name)
- `simulate-gitlab-workflow-walkthrough.js` `testFallbackGuardsAfterArchive` lines 24–73: e2e — archives project, verifies sink-fallback returns `{updated:false}`, verifies live dir NOT created
- `test-gitlab-sinks.js` lines 392–410 ("Block 3"): tests sink-merge exit-3 receipt write — does NOT test the archive-before-sink case

**New regression test placement:** `test-gitlab-sinks.js` (following Block 3), + guard in `simulate-gitlab-workflow-walkthrough.js` alongside `testFallbackGuardsAfterArchive`.

**Pattern for new test:**
```javascript
const result = spawnSync(process.execPath, [sinkScript, '--branch', branch, '--project', project], {
  cwd: root,
  env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' },
  encoding: 'utf8'
});
assert.strictEqual(result.status, 3);
assert(!fs.existsSync(path.join(root, 'kaola-workflow', project)), 'must not recreate archived live path');
```

## 6. File organization

**Plugin layout:**
```
plugins/kaola-workflow-gitlab/scripts/
  kaola-gitlab-workflow-claim.js        — claim/release/finalize/sink-fallback/worktree cmds
  kaola-gitlab-workflow-sink-merge.js   — direct ff-merge pipeline, exits 0/1/2/3
  test-gitlab-sinks.js                  — sink unit/subprocess tests
  simulate-gitlab-workflow-walkthrough.js — integration entry point
```

**Fallback receipt fields:** `{ project, branch, issue_number, reason, timestamp }`

## Key Files

| File | Lines | Role |
|------|-------|------|
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 192–201 | Bug source: writes receipt to live path after archive |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 571–585 | Bug amplifier: cmdSinkFallback no archive check |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 392–420 | archiveProjectDir |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` | 131–133 | projectDir helper |
| `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js` | 49–55 | resolveProjectFile (archive-aware read, pattern to mirror) |
| `plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js` | 272–330, 392–410 | Existing sink tests |
| `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | 24–73 | testFallbackGuardsAfterArchive |

## Fix Approach

**Fix 1 — `sink-merge.js` `postMergeCleanup`:** Before writing receipt, check if archive path exists (`kaola-workflow/archive/{project}`). If archived, write receipt to archive path OR skip (since cmdSinkFallback already guards archived projects).

**Fix 2 — `cmdSinkFallback` in claim.js:** Add archive check alongside existing live-path check:
```javascript
const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
if (!fs.existsSync(projectDir(root, args.project)) || fs.existsSync(archivePath)) {
  output({ updated: false, project: args.project, reason: 'project archived' });
  return;
}
```
