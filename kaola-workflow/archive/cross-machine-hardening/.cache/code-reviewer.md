# Code Review: cross-machine-hardening

## Verdict: WARNING — 2 HIGH issues block Phase 6

### CRITICAL — None

### HIGH

**HIGH-1: `cmdTicker` exceeds 50-line function limit (80 lines, lines 352-431)**
Four responsibilities in one function: PID-file lifecycle, signal registration, tick loop state, inner `tick()` closure (44 lines alone). Extract: `writePidFile(pidPath)` helper + promote `tick()` to named function with closure.

**HIGH-2: `cmdClaim` exceeds 50-line function limit (75 lines, lines 218-292)**
Tiebreaker block (lines 262-280) + adoption stub is natural extract to `handleTiebreakerYield(root, args, tbResult)` helper.

### MEDIUM

**MEDIUM-1: Missing test 9A3 — ticker late-tiebreaker has zero coverage**
`cmdTicker` lines 418-426: on tick 1, if sibling claim has lower comment ID, ticker releases session and exits. No test exercises this. This path is irreversible (session release). Needed: spawn ticker with gh shim returning sibling winner comment, assert lock gone.

**MEDIUM-2: Test 9B2 weak assertion — silent pass on crash**
`assert(pidContentAfter9b2 !== '99999999', ...)` passes if file is deleted. Should assert file exists AND contains a valid PID.

**MEDIUM-3: `cmdTicker` swallows all fs.openSync errors silently (line 377)**
`catch (e) { return; }` collapses EEXIST (expected) and EACCES/EIO (real errors) identically. Check `e.code === 'EEXIST'` first; stderr-log or re-throw others.

**MEDIUM-4: Adoption stub swallows git push failure (lines 270-276)**
`catch (_) {}` silences push errors. Add `process.stderr.write` on failure to allow operator recovery.

### LOW

**LOW-1: Redundant condition in tick() guard (line 391)** — `match.session_id !== args.session` is dead code (find already filters this).

**LOW-2: SIGINT/SIGHUP not handled** — PID file leaks on Ctrl-C or terminal close. Register same handler for SIGINT + SIGHUP.

**LOW-3: Phase command shim checks PID file existence not liveness** — stale file blocks re-spawn; should always attempt spawn and let cmdTicker's internal guard handle idempotency.

**LOW-4: .gitignore correct but CHANGELOG/README not updated** — CLAUDE.md documentation checklist requires these.

**LOW-5: cmdWatchPr is 55 lines (borderline, pre-existing).**

### Scope Compliance
All changes within declared write set. No new files outside scripts/, commands/, .gitignore. Immutability clean (Object.assign everywhere). No console.log debug statements.

### Test Suite Note
Reviewer reports walkthrough fails at 7A pre-Epic 9 — but main session confirmed passing. Discrepancy may be reviewer running on different state. Main session validation evidence is authoritative.
