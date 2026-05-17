# Security Review: issue-41

Generated: 2026-05-17

Source: security-reviewer agent

## Verdict: PASSED WITH FOLLOW-UPS (1 HIGH fixed, 1 MEDIUM fixed)

## Findings and Resolutions

### [HIGH] ReDoS via nested quantifier in `fileMatches` regex — FIXED

- **File**: `scripts/kaola-workflow-claim.js`, `analyzeIssue()`
- **Finding**: The backtick-delimited alternative `` `[^`]+\.[a-z]{2,4}` `` is bounded, but the second alternative `[\w][\w-]*(?:\/[\w.-]+)+\.\w{2,4}` applies `(?:\/[\w.-]+)+` (a repeated group with internal quantifiers) to up to the full `issue.body` string. On an adversarial body (e.g. many `/` characters followed by a non-matching suffix), backtracking is polynomial.
- **Fix**: Capped `issue.body` at 8192 bytes before applying any regex: `const body = (issue.body || '').slice(0, 8192)`. This bounds worst-case backtracking to O(8192²) ≈ 67M steps — acceptable and not reachable from normal issues.
- **Test added**: Epic 14c determinism test exercises `analyzeIssue` with a 50KB body that would previously spin; now completes instantly.

### [MEDIUM] `isSafeName` not applied in `activeStateProjects` branch of `ownedActiveProject` — FIXED

- **File**: `scripts/kaola-workflow-claim.js`, `ownedActiveProject()` (lines 413-414)
- **Finding**: The `activeStateProjects` branch reads `workflow-state.md` across all `kaola-workflow/` subdirectories and uses `state.project` to build a lock-file path. If `state.project` contained `../../` or similar, the path could traverse outside the repo. The `lockFilePath` branch already calls `isSafeName`, but the `activeStateProjects` branch did not.
- **Fix**: Added `isSafeName(state.project) &&` guard before including a state-file project in the active set. Malformed project names are silently skipped (same as malformed lock-file names).

### [LOW] `ownedWorkflowPath` reads `workflow-state.md` with `fs.readFileSync` — ACCEPTED

- **Finding**: No timeout or size limit on the state file read. A multi-MB `workflow-state.md` would block the event loop.
- **Decision**: Accepted. `workflow-state.md` is a project-owned file always written by this codebase and bounded by convention to < 5 KB. External-attacker write access would require compromising the local filesystem. No fix needed for v1.

### [LOW] `ADVISOR_PATTERN` in phantom-advisor hook not anchored — ACCEPTED

- **Finding**: The ERE pattern is intentionally a substring search (no `^`/`$`). Anchoring would defeat its purpose.
- **Decision**: Accepted by design. The hook is meant to catch advisor citations anywhere in file content.

## Post-Fix Validation

- `node scripts/simulate-workflow-walkthrough.js` → Workflow walkthrough simulation passed
- `node scripts/validate-workflow-contracts.js` → Workflow contract validation passed
- `node scripts/validate-kaola-workflow-contracts.js` → Kaola-Workflow contract validation passed
