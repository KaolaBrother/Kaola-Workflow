# Phase 5 - Review: cross-machine-hardening

## Code Review Findings

### CRITICAL
None.

### HIGH
**HIGH-1 (RESOLVED): `cmdTicker` exceeded 50-line function limit (80 lines)**
Fixed: extracted into `acquirePidFile` (19L), `runTick` (44L), `cmdTicker` (23L).

**HIGH-2 (RESOLVED): `cmdClaim` exceeded 50-line function limit (75 lines)**
Fixed: extracted `validateClaimArgs` (10L), `buildLockData` (15L), `handleTiebreakerYield` (15L). `cmdClaim` now 45 lines.

### MEDIUM/LOW (deferred follow-ups)
- **MEDIUM-1 (RESOLVED)**: Missing test 9A3 ticker late-tiebreak — test added, GREEN.
- **MEDIUM-2**: Test 9B2 assertion weak (passes on crash via file deletion). Deferred.
- **MEDIUM-4**: Adoption stub swallows `git push` failure silently. Deferred.
- **LOW-1**: Redundant `match.session_id !== args.session` condition in `runTick` (dead code). Deferred.
- **LOW-2**: SIGINT/SIGHUP not handled — PID file leaks on Ctrl-C. Deferred.
- **LOW-3**: Phase command shim checks file existence not process liveness. Deferred.
- **LOW-4**: CHANGELOG/README documentation not updated. Deferred.
- **LOW (re-review)**: `acquirePidFile` returns fd instead of boolean (misleading API, pre-existing). Deferred.

## Security Review

**Ran: Yes** — `kaola-workflow-claim.js` touches filesystem paths, external `gh` API calls, and process IDs.

### Findings

**M1 (RESOLVED): `cmdTicker` missing `isSafeName` on `--session` before PID path construction**
Fixed: `assert(isSafeName(args.session), ...)` added in `cmdTicker`.

**M2 (RESOLVED): PID file lacked explicit `0o600` mode**
Fixed: `fs.openSync(pidPath, 'wx', 0o600)` in `acquirePidFile`.

**Deferred (LOW/INFO):**
- L1: `updateLeaseInPlace` string-form `replace()` (inert — ISO chars only)
- L2: `git push origin <branch>` missing `--` separator (inert — `workflow/` prefix)
- I1: `match.issue_number` not re-asserted `Number.isFinite` in ticker (lock authored by validated process)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | claim.js: filesystem + external API calls |
| review-fix executors | invoked | .cache/review-fix-1.md | tdd-guide, two passes |
| advisor critical gate | N/A | — | No CRITICAL findings |

## Fixes Applied
1. Extracted `acquirePidFile`, `runTick` from `cmdTicker` (HIGH-1)
2. Extracted `validateClaimArgs`, `buildLockData`, `handleTiebreakerYield` from `cmdClaim` (HIGH-2)
3. Added `isSafeName(args.session)` guard to `cmdTicker` (Security M1)
4. Added `0o600` mode to PID file open in `acquirePidFile` (Security M2)
5. Added MEDIUM-3 fix (non-EEXIST errors logged to stderr in `acquirePidFile`)
6. Added test 9A3: ticker late-tiebreak (MEDIUM-1)

## Validation Evidence
- Phase 4 baseline: `node scripts/simulate-workflow-walkthrough.js` → PASS (cited)
- Post-fix validation: `node scripts/simulate-workflow-walkthrough.js` → PASS (exit 0)
- Re-review confirms: cmdClaim 45L, cmdTicker 23L, all security fixes in place, no new HIGH/CRITICAL

## Follow-Up Items
MEDIUM-2, MEDIUM-4, LOW-1, LOW-2, LOW-3, LOW-4, LOW (fd API), Security L1, L2, I1 — log as tech debt, do not block Phase 6.

## Review Status
PASSED WITH FOLLOW-UPS
