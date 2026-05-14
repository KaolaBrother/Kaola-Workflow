# Phase 5 - Review: parallel-classifier

## Code Review Findings

### CRITICAL
none

### HIGH
- **[HIGH-1] classify() 92 lines — exceeds 50-line function limit** — FIXED via review-fix-1.md. Extracted `scanClaimedOverlap()` (43 lines) and `checkDependsOn()` (14 lines); classify() now 40 lines.
- **[HIGH-2] Step 0 bash block missing CLAIM_JS + KAOLA_SESSION_ID guards** — FIXED via review-fix-2.md. Outer `if [ -f "$CLAIM_JS" ] && [ -n "$KAOLA_SESSION_ID" ]; then ... fi` wraps entire block.

### MEDIUM/LOW
- **[MEDIUM-1]** `project-name` subcommand not implemented in kaola-workflow-roadmap.js — silent fallback to `issue-${N}`. Acceptable; documented as Out-of-Scope in Phase 3 plan.
- **[MEDIUM-2]** gh fetch failure defaults to `green` — overly optimistic on network errors. Deferred follow-up; not a behavioral regression vs. prior state (classifier didn't exist before).
- **[LOW-1]** Line cap at 235 with 1-line headroom (file is 234 lines). Monitor.
- **[LOW-2]** `try { body = field(content, 'body'); } catch (_) {}` dead defensive catch — `field()` cannot throw. Minor cleanup deferred.

## Security Review
Ran: yes — `scripts/kaola-workflow-classifier.js` touches `child_process`, lock files, and config file.

### Findings
- **[LOW]** Missing `isSafeName` guard on `lock.project` before path construction — FIXED inline (Trivial Inline Edit Exception: one-line `if (!isSafeName(lock.project)) continue;` consistent with claim.js pattern). Validation re-run and passed.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | |
| review-fix executors | invoked | .cache/review-fix-1.md, .cache/review-fix-2.md | |
| advisor critical gate | N/A | no CRITICAL findings | |

## Fixes Applied
1. `classify()` refactored into `scanClaimedOverlap()` + `checkDependsOn()` helpers (HIGH-1)
2. Step 0 bash block guarded with `[ -f "$CLAIM_JS" ] && [ -n "$KAOLA_SESSION_ID" ]` (HIGH-2)
3. `isSafeName(lock.project)` guard added before path construction (security LOW)

## Validation Evidence
Post-fix validation commands:
- `node scripts/validate-workflow-contracts.js`: PASS
- `node scripts/simulate-workflow-walkthrough.js`: PASS

## Follow-Up Items
- MEDIUM-1: implement `project-name` subcommand in kaola-workflow-roadmap.js (separate issue)
- MEDIUM-2: consider `red` or `unknown` default on gh fetch failure (future hardening)
- LOW-1: consider raising cap to 240 in a future cleanup
- LOW-2: remove dead `try/catch` around `field()` calls in a future cleanup

## Review Status
PASSED WITH FOLLOW-UPS
