# Fast Summary: issue-184

## Status
PASSED

## Scope
Harden closure-audit remote-probe handling (#178 follow-up). 9 source files + 3 test files across 4 editions (root GitHub, byte-identical Codex mirror, GitLab, Gitea). No new deps, no public API/schema break (only additive `labels_skipped_reason: 'detection_timeout'` value + broadened existing `unresolved_closed_state` population).

## Plan
See `.cache/planner.md`. Four fixes:
1. (P1) `collectClosedSet` keys on `probe.state === 'unavailable'` (not `reason === 'timeout'`) so non-timeout remote failures (auth/rate-limit/network/empty) surface in `unresolved_closed_state` instead of being silently dropped.
2. (P1) Validate `KAOLA_GH_REMOTE_TIMEOUT_MS` → fall back to 30000 unless positive integer (NaN/negative/0 no longer crash or disable the timeout).
3. (P2) GitLab `probeIssueState` adds the OFFLINE short-circuit GitHub/Gitea already had.
4. (P2) `--execute` propagates a detection-phase timeout as `labels_skipped_reason: 'detection_timeout'` instead of an empty clean sweep.

## Implementation Evidence
- TDD RED→GREEN per fix; raw notes in `.cache/tdd-guide.md`.
- 10 new tests across 3 edition suites (root simulate-workflow-walkthrough.js ×3, GitLab ×4, Gitea ×3).
- Acceptance (orchestrator-confirmed, exit 0):
  - `node scripts/validate-script-sync.js` → `OK: 10 common scripts and 2 byte-identical file group in sync.`
  - `node scripts/validate-workflow-contracts.js` → passed
  - `node scripts/validate-kaola-workflow-contracts.js` → passed
  - `npm test` → all four edition suites passed (claude / codex / gitlab / gitea).
- Byte-mirror root↔Codex (closure-audit, active-folders): IDENTICAL.

## Review
PASS — 0 CRITICAL / 0 HIGH / 0 MEDIUM. See `.cache/code-reviewer.md`.
Deferred LOW: no upper bound on `KAOLA_GH_REMOTE_TIMEOUT_MS` (huge all-digit value → effectively no timeout). Outside #184 acceptance criteria; tracked as a follow-up candidate.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| planner | invoked | .cache/planner.md | |
| tdd-guide | invoked | .cache/tdd-guide.md | |
| code-reviewer | invoked | .cache/code-reviewer.md | |

## Escalation
N/A — stayed within fast-path bounds (mechanical edition-mirroring of small edits; no architecture/security/dep/breaking trigger).
