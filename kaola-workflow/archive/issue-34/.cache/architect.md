# Architect Blueprint — Issue #34

## Design Decisions

- `archiveProjectDir(root, project, statusValue)` is a shared pure helper; takes explicit `root` (not `getRoot()` internally) because cmdFinalize runs with CWD=linked worktree while sweep runs from main repo
- `cmdFinalize` called via `(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize ...)` — getRoot() resolves to linked worktree path correctly; avoids adding `--root` flag
- Status-write-before-rename ordering in `archiveProjectDir`: safe because a stale `status: closed` dir is less harmful than a renamed dir with stale status
- Idempotent: if source dir missing → `{skipped: 'source-missing'}`; if dest exists → timestamp suffix `.archived-{ISO-munged}`
- Sweep second pass after `drainPendingRemovals`, NOT concurrent with first pass
- GC predicate: `status: active` + no lock file + `expires:` > 24h ago (ALL three required)
- Plugin claim.js is a diverged copy — add ONLY `archiveProjectDir`, `cmdFinalize`, sweep second pass; do NOT backfill other main-only features
- `archiveProjectDir` added to `module.exports` for testability

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/kaola-workflow-claim.js` | Add `archiveProjectDir` helper + `cmdFinalize` + dispatcher + exports + sweep second pass |
| `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Mirror same additions (no `enforcePlatformSessionOrExit` in plugin) |
| `commands/kaola-workflow-phase6.md` | Replace prose archive block (lines 453-459) with note; insert Step 8b `cmdFinalize` between Step 8a and Step 8 |
| `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` | Mirror Step 7 replacement + Step 8b insertion |
| `scripts/simulate-workflow-walkthrough.js` | Add tests Issue-34-A (finalize), Issue-34-B (sweep GC), Issue-34-C (structural docs check) before final console.log |

## Detailed Specs

### `archiveProjectDir(root, project, statusValue)`
Insert before `cmdRelease` in both claim.js files.
```
1. Validate isSafeName(project)
2. srcDir = path.join(root, 'kaola-workflow', project)
3. if (!fs.existsSync(srcDir)) return { skipped: 'source-missing' }
4. stateFile = path.join(srcDir, 'workflow-state.md')
5. Read stateFile; replace /^status:\s*\S+\s*$/m → 'status: ' + statusValue
   Replace /^step:\s*\S+\s*$/m → 'step: complete'
   Write back to stateFile (within srcDir, BEFORE rename)
6. archiveBase = path.join(root, 'kaola-workflow', 'archive')
7. fs.mkdirSync(archiveBase, { recursive: true })
8. destDir = path.join(archiveBase, project)
9. if (fs.existsSync(destDir)):
     suffix = '.archived-' + new Date().toISOString().replace(/[:.]/g, '-')
     destDir = destDir + suffix
10. fs.renameSync(srcDir, destDir)
11. return { archived: true, dest: destDir }
```

### `cmdFinalize()`
Insert after `archiveProjectDir`, before `cmdRelease`.
```
1. parseArgs; assert --project and --session
2. assertSafeSession(args.session); assert isSafeName(args.project)
3. root = getRoot()  [returns CWD's git root = linked worktree path when called via cd "$ACTIVE_WORKTREE_PATH"]
4. coordRoot = getCoordRoot()
5. [main only] enforcePlatformSessionOrExit(args.session, coordRoot, args)
6. Verify ownership: read lockPath(coordRoot, args.project); assert lock.session_id === args.session
7. result = archiveProjectDir(root, args.project, 'closed')
8. Write result JSON to stdout
```

### `cmdSweep` second pass
After `drainPendingRemovals(coordRoot)` in `cmdSweep`:
```
cutoff = Date.now() - 24 * 60 * 60 * 1000
for each dir in kaola-workflow/ (excl. 'archive', '.'-prefixed):
  read workflow-state.md; skip if status != active
  skip if lockPath(coordRoot, entry.name) exists
  expiresStr = field(content, 'expires')
  skip if !expiresStr || new Date(expiresStr).getTime() >= cutoff
  archiveProjectDir(root, entry.name, 'abandoned')
```

### Dispatcher registration
Add `if (sub === 'finalize') return cmdFinalize();` before the `throw` in `main()`.

### `commands/kaola-workflow-phase6.md` changes
1. Replace lines 453-459 prose: archive is performed by cmdFinalize (no manual shell copy)
2. Insert between Step 8a closing fence (line 553) and `## Step 8` header (line 555):
```
## Step 8b - Finalize (Archive + Status Close)

```bash
(cd "$ACTIVE_WORKTREE_PATH" && node "$CLAIM_JS" finalize \
  --project "$KAOLA_PROJECT" \
  --session "$KAOLA_SESSION_ID")
```
```

### Test additions to `scripts/simulate-workflow-walkthrough.js`

**Test Issue-34-A**: `cmdFinalize` archives dir atomically and writes status: closed
- Create tmp git repo + workflow-state.md (status:active) + lock file
- Run `node claim.js finalize --project X --session Y`
- Assert: archive/{project}/workflow-state.md exists, contains status: closed + step: complete
- Assert: original kaola-workflow/{project}/ does NOT exist
- Sub-case: collision → .archived-{suffix} dir created

**Test Issue-34-B**: sweep second pass GC archives expired orphan dirs
- Create tmp git repo + orphan-proj (status:active, expires 25h ago, no lock) + live-proj (expires 30min future, no lock)
- Run `node claim.js sweep`
- Assert: archive/orphan-proj/workflow-state.md exists, contains status: abandoned
- Assert: orphan-proj/ does NOT exist
- Assert: live-proj/ STILL exists

**Test Issue-34-C**: Structural — finalize invocation position in docs
- Read commands/kaola-workflow-phase6.md and plugins/.../SKILL.md
- Assert both contain "finalize --project"
- Assert finalize position: after mirror block, before git add (index ordering)

## Build Sequence

1. `archiveProjectDir` in `scripts/kaola-workflow-claim.js` (no deps)
2. `cmdFinalize` + dispatcher + exports in `scripts/kaola-workflow-claim.js` (deps: step 1)
3. Sweep second pass in `scripts/kaola-workflow-claim.js` (deps: step 1)
4. [Parallel group]: Mirror all to `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` | Edit `commands/kaola-workflow-phase6.md` | Edit SKILL.md
5. Add tests to `simulate-workflow-walkthrough.js` (deps: all above)

## Parallelization Plan

| Group | Tasks | Why Safe |
|-------|-------|----------|
| 1 | scripts/kaola-workflow-claim.js all changes | Sequential, one file |
| 2 | plugins claim.js + phase6.md + SKILL.md | Disjoint write sets |
| 3 | simulate-workflow-walkthrough.js | After group 2 (structural tests need doc edits) |

## Out of Scope

- No changes to releaseSession, cmdRelease, cmdWatchPr, cmdHeartbeat, cmdTicker, cmdStartup
- No changes to sink-merge.js or sink-pr.js
- No remote GitHub operations in cmdFinalize (Step 7 owns that)
- No backfill of main-only features to plugin claim.js
- No CHANGELOG.md/README.md updates

## Validation

```
node scripts/simulate-workflow-walkthrough.js
```
Must exit 0 with "Workflow walkthrough simulation passed".
