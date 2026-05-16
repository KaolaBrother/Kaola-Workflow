# Architect Blueprint Revision 1 — Issue #34

## Changes from Original architect.md

Two targeted corrections per advisor-plan.md:
1. GC threshold: 24h → 30 minutes
2. Add phase-artifacts-empty safety guard to sweep second pass predicate

All other design decisions from architect.md are unchanged.

## Revised `cmdSweep` Second Pass

Replace the original second pass spec with:

```
cutoff = Date.now() - 30 * 60 * 1000    // 30 minutes (was 24h)
for each dir in kaola-workflow/ (excl. 'archive', '.'-prefixed):
  read workflow-state.md; skip if status != active
  skip if any phase*.md file exists in the dir   // NEW: safety guard
  skip if lockPath(coordRoot, entry.name) exists
  expiresStr = field(content, 'expires')
  skip if !expiresStr || new Date(expiresStr).getTime() >= cutoff
  archiveProjectDir(root, entry.name, 'abandoned')
```

**Rationale for phase-artifacts-empty guard:**
- Issue #34 Bug 3's concrete example (issue #2) has only workflow-state.md, no phase artifacts
- A project with phase artifacts but an expired lease is likely an interrupted mid-flight session — GC would destroy real work
- The guard limits GC to "claimed and immediately died" cases: no phase artifacts, no lock, expired
- Added before the lock check (cheaper filesystem stat before lock read)

**Rationale for 30-minute threshold:**
- Issue body explicitly proposes "default 30?" 
- A 10h+ expired lease (the concrete example) is unambiguously dead; 30 min provides adequate grace period
- 24h matches shouldSweep cycle but is excessive for lease cleanup (heartbeat misses by ~24h before GC)

## Updated Test Issue-34-B Spec

**Test Issue-34-B**: sweep second pass GC archives expired orphan dirs
- Create tmp git repo
- `orphan-proj`: status:active, expires 31 min ago, no lock, **only workflow-state.md** (no phase files)
- `live-proj`: status:active, expires 30min future, no lock
- `in-flight-proj`: status:active, expires 31 min ago, no lock, **has phase1-research.md** (phase artifact exists)
- Run `node claim.js sweep`
- Assert: archive/orphan-proj/workflow-state.md exists, contains status: abandoned
- Assert: orphan-proj/ does NOT exist
- Assert: live-proj/ STILL exists
- Assert: in-flight-proj/ STILL exists (phase-artifacts-empty guard protected it)

## All Other Specs Unchanged

See architect.md for:
- `archiveProjectDir(root, project, statusValue)` full spec
- `cmdFinalize()` full spec (invocation site: Step 8b, linked worktree — CONFIRMED correct)
- Dispatcher registration
- `commands/kaola-workflow-phase6.md` changes
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` changes
- Test Issue-34-A spec
- Test Issue-34-C spec
- Build sequence and parallelization plan
- Out of scope items
