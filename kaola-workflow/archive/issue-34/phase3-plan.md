# Phase 3 - Plan: issue-34

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| (none) | All changes go into existing files | — |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Add `archiveProjectDir` + `cmdFinalize` + dispatcher + exports + sweep second pass | Implements Bugs 1+2+3 fixes in dev copy |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Mirror same additions (no `enforcePlatformSessionOrExit`) | Plugin (marketplace) copy must also have the fixes |
| `commands/kaola-workflow-phase6.md` | Replace archive prose (lines 453-459) with note; insert Step 8b `cmdFinalize` invocation between Step 8a close and Step 8 header | Automates archive in Phase 6 flow |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Mirror Step 8b insertion | Plugin phase6 equivalent |
| `scripts/simulate-workflow-walkthrough.js` | Add Tests 34-A, 34-B, 34-C | Validates all three bug fixes |

### Build Sequence
1. `archiveProjectDir` in `scripts/kaola-workflow-claim.js` (no deps)
2. `cmdFinalize` + dispatcher + `module.exports` update in `scripts/kaola-workflow-claim.js` (deps: step 1)
3. Sweep second pass in `scripts/kaola-workflow-claim.js` (deps: step 1)
4. [Parallel group A]: Mirror all to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Edit `commands/kaola-workflow-phase6.md` | Edit `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
5. Add tests to `scripts/simulate-workflow-walkthrough.js` (deps: groups 1-3, and group A for Test 34-C structural check)

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| 1 | scripts/kaola-workflow-claim.js steps 1-3 | Sequential within one file |
| A | plugin claim.js + phase6.md + SKILL.md | Disjoint write sets |
| 2 | simulate-workflow-walkthrough.js | After group A (structural test reads docs) |

### External Dependencies
- None — all changes use existing Node.js built-ins (`fs`, `path`) and claim.js helpers

## Task List

### Task 1: `archiveProjectDir` helper in scripts/kaola-workflow-claim.js
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: serial (first)
- Action: MODIFY
- Insert before `cmdRelease`:
  ```
  function archiveProjectDir(root, project, statusValue) {
    1. assert isSafeName(project)
    2. srcDir = path.join(root, 'kaola-workflow', project)
    3. if (!fs.existsSync(srcDir)) return { skipped: 'source-missing' }
    4. stateFile = path.join(srcDir, 'workflow-state.md')
    5. Read stateFile; replace /^status:\s*\S+\s*$/m → 'status: ' + statusValue
       Replace /^step:\s*\S+\s*$/m → 'step: complete'
       Write back (BEFORE rename — stale closed dir < renamed dir with stale status)
    6. archiveBase = path.join(root, 'kaola-workflow', 'archive')
    7. fs.mkdirSync(archiveBase, { recursive: true })
    8. destDir = path.join(archiveBase, project)
    9. if (fs.existsSync(destDir)):
         suffix = '.archived-' + new Date().toISOString().replace(/[:.]/g, '-')
         destDir = destDir + suffix
    10. fs.renameSync(srcDir, destDir)
    11. return { archived: true, dest: destDir }
  }
  ```
- Mirror: `fs.renameSync` at claim.js:665-668; status regex at claim.js:1644
- Add to `module.exports`
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 2: `cmdFinalize` + dispatcher in scripts/kaola-workflow-claim.js
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 1
- Parallel Group: serial (second)
- Action: MODIFY
- Insert after `archiveProjectDir`, before `cmdRelease`:
  ```
  async function cmdFinalize() {
    1. parseArgs; assert --project and --session present
    2. assertSafeSession(args.session); assert isSafeName(args.project)
    3. root = getRoot()         // linked worktree root when called via cd "$ACTIVE_WORKTREE_PATH"
    4. coordRoot = getCoordRoot()
    5. [main copy only] enforcePlatformSessionOrExit(args.session, coordRoot, args)
    6. Verify ownership: lockFile = lockPath(coordRoot, args.project)
       if !fs.existsSync(lockFile) → throw error "no lock file for project"
       lock = JSON.parse(fs.readFileSync(lockFile))
       assert lock.session_id === args.session
    7. result = archiveProjectDir(root, args.project, 'closed')
       if result.skipped === 'source-missing': print JSON {already: true}; exit 0
    8. print JSON { archived: true, dest: result.dest, status: 'closed' } to stdout
  }
  ```
- Add dispatcher: `if (sub === 'finalize') return cmdFinalize();` before the throw in `main()`
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 3: Sweep second pass in scripts/kaola-workflow-claim.js
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 1
- Parallel Group: serial (third, after task 2)
- Action: MODIFY
- After `drainPendingRemovals(coordRoot)` in `cmdSweep`:
  ```
  const GC_CUTOFF_MS = 30 * 60 * 1000;   // 30 minutes (issue #34 Bug 3 spec)
  const cutoff = Date.now() - GC_CUTOFF_MS;
  const kwDir = path.join(root, 'kaola-workflow');
  let entries = [];
  try { entries = fs.readdirSync(kwDir, { withFileTypes: true }); } catch (_) {}
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'archive' || entry.name.startsWith('.')) continue;
    const dirPath = path.join(kwDir, entry.name);
    // Phase-artifacts-empty guard: skip if any phase*.md exists (real work in progress)
    const hasPhaseArtifacts = fs.readdirSync(dirPath).some(f => /^phase\d/.test(f));
    if (hasPhaseArtifacts) continue;
    const stateContent = (() => {
      try { return fs.readFileSync(path.join(dirPath, 'workflow-state.md'), 'utf8'); } catch (_) { return ''; }
    })();
    if (field(stateContent, 'status') !== 'active') continue;
    if (fs.existsSync(lockPath(coordRoot, entry.name))) continue;
    const expiresStr = field(stateContent, 'expires');
    if (!expiresStr) continue;
    const expiresMs = new Date(expiresStr).getTime();
    if (isNaN(expiresMs) || expiresMs >= cutoff) continue;
    archiveProjectDir(root, entry.name, 'abandoned');
  }
  ```
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 4: Mirror to plugins/kaola-workflow/scripts/kaola-workflow-claim.js
- File: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Write Set: `plugins/kaola-workflow/scripts/kaola-workflow-claim.js`
- Depends On: Tasks 1-3
- Parallel Group: A
- Action: MODIFY
- Add `archiveProjectDir` (identical to main copy)
- Add `cmdFinalize` WITHOUT `enforcePlatformSessionOrExit` call (plugin lacks this function)
- Add dispatcher entry for 'finalize'
- Add sweep second pass (identical to main copy)
- Add `archiveProjectDir` to `module.exports`
- Do NOT backfill `enforcePlatformSessionOrExit`, `isSyntheticTestSession`, or `KAOLA_COORD_ROOT` override
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task 5: Update commands/kaola-workflow-phase6.md
- File: `commands/kaola-workflow-phase6.md`
- Write Set: `commands/kaola-workflow-phase6.md`
- Depends On: Tasks 1-3
- Parallel Group: A
- Action: MODIFY
- Replace lines 453-459 (archive prose block) with:
  ```
  Archive is performed by `cmdFinalize` (Step 8b). Do not perform a manual copy or git mv here.
  ```
- Insert between the Step 8a closing fence (line ~553) and the `## Step 8` header (line ~555):
  ```markdown
  ## Step 8b - Finalize (Archive + Status Close)

  Run `cmdFinalize` from the linked worktree context after all Phase 6 artifacts are written
  and after Step 8a has mirrored them:

  ```bash
  (cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
    --project "$KAOLA_PROJECT" \
    --session "$KAOLA_SESSION_ID")
  ```

  This atomically writes `status: closed` + `step: complete` to `workflow-state.md` and
  renames `kaola-workflow/{project}/` → `kaola-workflow/archive/{project}/` in the linked
  worktree. The rename is included in the Step 8 commit.
  ```
- Validate: grep for "finalize --project" in file

### Task 6: Update plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md
- File: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Write Set: `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
- Depends On: Tasks 1-3
- Parallel Group: A
- Action: MODIFY
- Mirror Step 8b insertion from Task 5 at equivalent position (after mirror block, before git add)
- Replace archive prose at line ~90 with the same cmdFinalize invocation note
- Validate: grep for "finalize --project" in file

### Task 7: Add tests to scripts/simulate-workflow-walkthrough.js
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: Tasks 1-6
- Parallel Group: serial (last)
- Action: MODIFY
- Insert before final `console.log('Workflow walkthrough simulation passed')`:

  **Test Issue-34-A**: `cmdFinalize` archives dir atomically and writes status: closed
  - Create tmp git repo + `kaola-workflow/test-proj/workflow-state.md` (status:active, step:plan) + lock file (correct session)
  - Run `node claim.js finalize --project test-proj --session {session}`
  - Assert: `archive/test-proj/workflow-state.md` exists, contains `status: closed`, `step: complete`
  - Assert: `kaola-workflow/test-proj/` does NOT exist
  - Sub-case collision: pre-create `archive/test-proj/`, run again — assert `.archived-` suffix dir created
  - Sub-case wrong session: run with wrong --session → exit non-zero
  - Sub-case already-done: source missing → JSON `{already:true}`, exit 0

  **Test Issue-34-B**: sweep second pass GC archives expired orphan dirs
  - Create tmp git repo
  - `orphan-proj`: status:active, expires 31min ago, no lock, only workflow-state.md
  - `live-proj`: status:active, expires 30min future, no lock
  - `in-flight-proj`: status:active, expires 31min ago, no lock, has phase1-research.md
  - Run `node claim.js sweep`
  - Assert: `archive/orphan-proj/workflow-state.md` exists, contains `status: abandoned`
  - Assert: `kaola-workflow/orphan-proj/` does NOT exist
  - Assert: `kaola-workflow/live-proj/` STILL exists
  - Assert: `kaola-workflow/in-flight-proj/` STILL exists (phase-artifacts guard)

  **Test Issue-34-C**: Structural — finalize invocation in docs
  - Read `commands/kaola-workflow-phase6.md`
  - Assert: contains "finalize --project"
  - Assert: "Step 8b" appears before "Step 8 - Commit Gate"
  - Read `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md`
  - Assert: contains "finalize --project"

- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0

## Advisor Notes

From `.cache/advisor-plan.md`:
- Design A (linked-worktree finalize between Step 8a and Step 8) confirmed viable. sink-merge.js rebases feature branch onto origin/main before ff-only merge — rename in Step 8 commit applies cleanly after rebase.
- GC threshold changed 24h → 30 minutes (per issue #34 body explicit suggestion; prior 24h was too conservative)
- Phase-artifacts-empty guard added: sweep second pass skips dirs with any `phase*.md` file — prevents GC of interrupted mid-flight work
- coordRoot vs root: no changes needed — plugin's getCoordRoot() uses git rev-parse --git-common-dir, correct for all worktrees
- Idempotent re-entry: `{skipped: 'source-missing'}` → exit 0 (confirm in implementation)
- Note: `e37ace0` was a manual cleanup before cmdFinalize existed, not a design template

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | invoked | .cache/architect-revision-1.md | GC threshold + phase-artifacts guard |
