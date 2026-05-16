# Phase 1 - Research / Discovery: issue-34

## Deliverable
Three bug fixes in the Phase 6 finalize + startup GC subsystem:
1. Make the Phase 6 archive step atomic using `git mv` (not copy-only)
2. Write `status: closed` to `workflow-state.md` after Phase 6 finalize succeeds
3. Add GC in `cmdSweep()` for crashed/abandoned projects with expired leases and no phase artifacts

## Why
After ~10 workflow cycles, `kaola-workflow/` accumulates 5+ orphan issue folders that the router
never reclaims. The `/workflow-next` router cannot distinguish "finished and forgotten" from
"in-flight, lease will resume", causing issue numbers to be permanently blocked from re-claim,
and orphaned directories to pile up indefinitely.

## Affected Area
- `scripts/kaola-workflow-claim.js` — `cmdSweep()` (line 1799), `activeStateIssueNumbers()` (line 425), `releaseSession()` (line 1644), `initialStateContent()` (line 738)
- `commands/kaola-workflow-phase6.md` — Step 7 archive prose (line 412-471)
- `plugins/kaola-workflow/skills/kaola-workflow-finalize/SKILL.md` — line 90 (archive prose mirror)
- `scripts/kaola-workflow-sink-merge.js` — `postMergeCleanup()` (lines 131-147)
- `scripts/kaola-workflow-sink-pr.js` — `updateStateSinkBlock()` (lines 87-118)
- `scripts/simulate-workflow-walkthrough.js` — test suite for validation

## Key Patterns Found
1. **Atomic-move pattern**: `fs.renameSync(wtPath, abandonedPath)` at claim.js:665-668, with timestamp suffix `.abandoned-{ISO}` for collision avoidance — mirror this for archive
2. **Status-write pattern**: `content.replace(/^status:\s*active\s*$/m, 'status: released')` at claim.js:1644 — mirror for writing `status: closed` and `status: abandoned`
3. **Dir-scan exclusion guard**: `dir === 'archive' || dir.startsWith('.')` at claim.js:376-399 (`activeStateProjects()`) and claim.js:425-439 (`activeStateIssueNumbers()`) — reuse for GC pass
4. **GC eligibility predicate**: `shouldSweep()` at claim.js:574-578 (24h cutoff on `expires` and `last_heartbeat`) — reuse for project-dir GC
5. **Lock file helpers**: `locksDir(coordRoot)` and `lockPath(coordRoot, project)` at claim.js:290-294 — reuse to check for corresponding lock file existence

## Test Patterns
- Framework: hand-rolled `assert(condition, message)` at simulate-workflow-walkthrough.js:27
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: sequential test cases with `assert()` calls; Epic Case 9 (simulate-workflow-walkthrough.js:2354-2429) as model for GC test

## Config & Env
- `KAOLA_COORD_ROOT` — override for coordination root path (default: repo root)
- `KAOLA_SESSION_ID` — active session identifier
- No existing env var for GC threshold; if added, follow `KAOLA_WORKFLOW_` prefix convention

## External Docs
None — all fixes use standard Node.js and git primitives already present in the codebase.

## GitHub Issue
KaolaBrother/Kaola-Workflow#34

## Completeness Score
10/10

- Goal clarity: 3/3 — three specific bugs with clear root-cause descriptions
- Expected outcome: 3/3 — each bug has a specific, verifiable expected behavior after fix
- Scope boundaries: 2/2 — bounded to Phase 6 instructions and `cmdSweep()` in claim.js
- Constraints: 2/2 — must follow atomic-move and status-write patterns from existing codebase

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | Internal patterns only; no external library/API docs needed |

## Notes / Future Considerations
- Bug 2 fix must happen BEFORE Bug 1 archive move in Phase 6 finalize transaction, so the archived copy reflects `status: closed`
- Bug 3 GC should distinguish "crashed before real work" (only workflow-state.md, auto-GC) from "abandoned mid-phase" (phase artifacts present, require manual/`--force-gc`)
- `finalized_at` ISO8601 timestamp in `workflow-state.md` (suggested in issue) is a nice-to-have but not required for the three core fixes
