# Phase 5 - Review: issue-31

## Code Review Findings

### CRITICAL
none

### HIGH (original, before fixes)
1. `session-env.js:40-44` — 2-hop PID assumption undocumented; no stderr warning on miss  
2. `pre-commit.sh:85-88` — silent fallback to self-asserted `KAOLA_SESSION_ID` when `derive-session` empty under enforcement

Both HIGH findings resolved by review-fix-1. Re-review confirmed RESOLVED.

### MEDIUM/LOW
- `derivePlatformSessionId` `invalid_sid` branch missing `fs.unlinkSync(identityPath)` — sibling branches (stale PID, timestamp mismatch) call unlinkSync; new branch doesn't. Malformed identity file persists until PID dies. Not a security issue; low exploitability. **Follow-up item.**
- `derivePlatformSessionId` non-ENOENT errors silently return `{ sid: null }` — parse/ps errors indistinguishable from ENOENT. **Follow-up.**
- `/claude/i` regex is a loose substring match on `ps comm` — user-spoofable on macOS; trust boundary not documented inline. **Follow-up.**
- `writeIdentityFile` catch swallows EACCES and structural errors (not just EEXIST). **Follow-up.**
- `writeAuditLog` empty catch swallows audit failures — bypass proceeds without record. **Follow-up.**
- Test-only env vars (`KAOLA_KERNEL_SESSION_SKIP`, `KAOLA_KERNEL_SESSION_FAKE_PID`) lack `// TEST-ONLY:` inline comments. **Follow-up.**

## Security Review

Security review: YES — files involve filesystem O_EXCL writes, process identity, and pre-commit enforcement.

### HIGH (original, before fixes)
1. `KAOLA_KERNEL_SESSION_SKIP` guard inconsistency (truthy form in 3 commands, strict `=== '1'` in derivePlatformSessionId)
2. `derivePlatformSessionId` returned `data.sid` without `isSafeName` validation — newline injection into workflow-state.md

Both resolved by review-fix-2. `isSafeName` extended to reject `\n`, `\r`, `\t`. Re-review confirmed RESOLVED.

### MEDIUM/LOW security follow-ups
- `.audit/` directory created without restrictive mode (`0o755` umask default) — world-traversable. **Follow-up.**
- `.runtime/` directory created without restrictive mode in both claim.js and session-env.js. **Follow-up.**
- TOCTOU window between `isPidAlive` and `lstart` comparison — practical exploitability very low. **Follow-up.**
- `/claude/i` trust boundary not documented in `walkToClaudePid`. **Follow-up.**

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | |
| review-fix executors (code HIGH) | invoked | .cache/review-fix-1.md | |
| review-fix executors (security HIGH) | invoked | .cache/review-fix-2.md | |
| code-reviewer re-review | invoked | .cache/code-reviewer-2.md | |
| security-reviewer re-review | invoked | .cache/security-reviewer-2.md | |
| advisor critical gate | N/A | no CRITICAL findings | no CRITICAL findings in either review |

## Fixes Applied

1. `session-env.js`: Added 2-hop assumption comment; added stderr warning when `claudePid <= 1`
2. `pre-commit.sh`: Block with exit 2 when `KAOLA_ENFORCE_PLATFORM_SESSION=1` and `derive-session` returns empty
3. `claim.js`: Standardized all `KAOLA_KERNEL_SESSION_SKIP` guards to strict `=== '1'`; added `isSafeName` check in `derivePlatformSessionId`; extended `isSafeName` to reject `\n`/`\r`/`\t`
4. `simulate-workflow-walkthrough.js`: Added 5 new test blocks: review-fix-1, review-fix-2, review-fix-3, security-fix-1, security-fix-2

## Validation Evidence

- `node scripts/simulate-workflow-walkthrough.js` — exit 0, "Workflow walkthrough simulation passed" (after review-fix-1)
- `node scripts/simulate-workflow-walkthrough.js` — exit 0, "Workflow walkthrough simulation passed" (after review-fix-2)
- Phase 4 validation evidence cited: .cache/tdd-task-6.md (GREEN, exit 0, two independent runs)

## Follow-Up Items

(MEDIUM/LOW — do not block merge)

1. `derivePlatformSessionId` `invalid_sid` branch: add `fs.unlinkSync(identityPath)` to match sibling branch pattern
2. `derivePlatformSessionId` non-ENOENT errors: differentiate `source` field for error categories to aid diagnostics
3. `walkToClaudePid`: add comment documenting the `/claude/i` trust boundary limitation
4. `writeIdentityFile`: narrow catch to EEXIST only; log other errors to stderr
5. `writeAuditLog`: emit stderr warning on audit write failure so operator knows bypass was unlogged
6. `.audit/` and `.runtime/` dirs: create with mode `0o700` for restrictive permissions

## Review Status

PASSED WITH FOLLOW-UPS

All CRITICAL and HIGH findings resolved. MEDIUM/LOW items documented above as follow-ups for a subsequent cleanup pass.
