# Review Fix 1 — Issue-34 Phase 5

## Fixes Applied

### HIGH-1: archiveProjectDir must append missing status/step fields
Both claim.js files — added `if (!/^status:/m.test(content)) content += '\nstatus: ' + statusValue` and `if (!/^step:/m.test(content)) content += '\nstep: complete'` after each replace call. Prevents silent no-op when workflow-state.md has no step: line (common in crash-abandoned dirs).

### HIGH-2: State write errors must emit to stderr
Both claim.js files — changed `catch (_) {}` to `catch (e) { process.stderr.write('archiveProjectDir: state update failed for ' + project + ': ' + e.message + '\n'); }`. Makes filesystem errors visible instead of silently treating them as success.

### HIGH-3: Test 34-A must assert lock file survives finalize
simulate-workflow-walkthrough.js — added `assert(fs.existsSync(path.join(locksDir34a, 'test-proj.lock')), '34-A: lock file must survive finalize (required for idempotency check)')` after first finalize call.

### Security MEDIUM-1: Legacy root lock check in sweep GC (Trivial Inline Edit)
Both claim.js files — changed `if (fs.existsSync(lockPath(coordRoot, entry.name))) continue` to `if (fs.existsSync(lockPath(coordRoot, entry.name)) || fs.existsSync(lockPath(root, entry.name))) continue`. Defense-in-depth guard for legacy lock file paths.

### Code MEDIUM-1: Test 34-C anchor for SKILL.md ordering (Trivial Inline Edit)
simulate-workflow-walkthrough.js — changed commit-gate anchor from `'Step 8 - Commit Gate'` (absent in SKILL.md) to `'git -C "$ACTIVE_WORKTREE_PATH" add'` (present in both files). Added `assert(commitIdx !== -1, ...)` so a missing anchor fails loudly.

## Validation
`node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed"
`node --check scripts/kaola-workflow-claim.js` → exit 0
`node --check plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → exit 0
