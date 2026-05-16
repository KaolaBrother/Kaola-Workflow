# Phase 5 - Review: issue-34

## Code Review Findings

### CRITICAL
None.

### HIGH
- **HIGH-1**: `archiveProjectDir` silently omitted `step: complete` when `workflow-state.md` had no `step:` line — regex replace is no-op on missing field. **FIXED**: added append guards after each replace.
- **HIGH-2**: State write errors were swallowed and rename still proceeded — `catch (_) {}` gave no visibility. **FIXED**: added `process.stderr.write` in catch before proceeding.
- **HIGH-3**: Test 34-A lacked assertion that lock file survives finalize (required for idempotency sub-case). **FIXED**: assertion added.

### MEDIUM/LOW
- Code MEDIUM-1: Test 34-C anchor `'Step 8 - Commit Gate'` absent in SKILL.md — ordering check skipped vacuously. **FIXED** (Trivial Inline Edit): changed anchor to `'git -C "$ACTIVE_WORKTREE_PATH" add'`, added existence assert.
- Code MEDIUM-2: Test 34-B missing locked-proj fixture for lock-presence guard. Deferred to follow-up.
- Code MEDIUM-3: Sweep GC error swallowed silently. Deferred to follow-up.
- Code LOW-1: Archive collision suffix not collision-proof within same millisecond. Deferred.
- Code LOW-2: Plugin cmdFinalize omission of enforcePlatformSessionOrExit undocumented. Deferred.

## Security Review
Ran: yes — filesystem ops, session check, sweep GC.

### Findings
- **MEDIUM M1**: Sweep GC second pass checked only coordRoot lock, not legacy root lock — defense-in-depth gap. **FIXED** (Trivial Inline Edit): added `|| fs.existsSync(lockPath(root, entry.name))` to both claim.js files.
- LOW L1: State written before rename — contradictory state on rename failure. Deferred (data-integrity, not security).
- LOW L2: TOCTOU between existsSync and readFileSync in cmdFinalize — no ownership bypass possible. Deferred.
- LOW L3: Session ownership is string-comparison only (existing trust model). Acknowledged.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | filesystem + session ops touched |
| review-fix executors | invoked | .cache/review-fix-1.md | tdd-guide for HIGH-1/2/3; inline for MEDIUM-1 (both) |
| advisor critical gate | N/A | no CRITICAL findings | |

## Fixes Applied
1. HIGH-1: archiveProjectDir — append status/step when field absent (both claim.js)
2. HIGH-2: archiveProjectDir — stderr on state write error instead of silent catch (both claim.js)
3. HIGH-3: Test 34-A — assert lock survives finalize
4. Security MEDIUM-1: sweep GC — also check legacy root lockPath (both claim.js, Trivial Inline Edit)
5. Code MEDIUM-1: Test 34-C — use git-add anchor instead of Step 8 header (Trivial Inline Edit)

## Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed"
- `node --check scripts/kaola-workflow-claim.js` → exit 0
- `node --check plugins/kaola-workflow/scripts/kaola-workflow-claim.js` → exit 0

## Follow-Up Items (MEDIUM/LOW — non-blocking)
- Test 34-B: add locked-proj fixture to cover lock-presence guard in sweep GC
- Sweep GC: add stderr on archive error (consistency with other sweep error paths)
- Archive collision suffix: add randomness or counter for same-millisecond safety
- Plugin cmdFinalize: add comment noting intentional enforcePlatformSessionOrExit omission
- Security L1: consider post-rename state write ordering (future hardening)

## Review Status
PASSED WITH FOLLOW-UPS
