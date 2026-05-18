# Phase 5 - Review: issue-75

## Code Review Findings

### CRITICAL
none

### HIGH
none

### MEDIUM/LOW

**[MEDIUM — RESOLVED]** `cmdRelease` cannot operate on drift folders surfaced by `cmdStatus`.
`activeByProject` uses `excludeClosedIssues: true` (default), so drift folders are invisible to `release --project`. Disposition: **OUT OF SCOPE** per phase2-ideation explicit exclusion "Do NOT add a drift cleanup command." Logged as follow-up issue.

**[LOW — ACKNOWLEDGED]** Outer `try/catch` around `removeWorktree` is dead code (removeWorktree never throws). Intentional pattern match to `sink-merge.js:227` per phase3-plan.md. Not blocking.

**[LOW — ACKNOWLEDGED]** `count` field now equals `active.length` only (excludes drift). Additive schema change, backward compatible. Noted for PR description/changelog.

**[LOW — ACKNOWLEDGED]** `testWatchPrArchivesClosedIssuePrFolder` does not verify worktree removal with a real worktree (no real worktree was provisioned). `testFinalizeReleaseCleansWorktree` covers real-worktree teardown. Acceptable coverage gap documented.

## Security Review

Ran: Yes — touched filesystem operations (`fs.existsSync`, `execFileSync` with `git worktree remove`).

### Findings

**[MEDIUM — FIXED]** Missing `isSafeName` guard in `cmdSinkFallback`. `args.project` from `process.argv` was passed to `projectDir` without validation. All sibling functions validate via `assert(isSafeName(project), ...)`. Added the guard. Test added: `../escape` input → exit 1.

**[LOW — FIXED]** Missing `--` separator before path in `removeWorktree`. Changed `execFileSync('git', ['worktree', 'remove', '--force', wtPath], ...)` to include `'--'` before `wtPath`. Defense-in-depth.

**[LOW — ACKNOWLEDGED]** `pr_url` from state file passed to `gh pr view` without domain validation. Array args prevent injection. Acceptable per threat model. Deferred.

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | Filesystem access in modified files |
| review-fix executors | invoked | .cache/review-fix-1.md | MEDIUM security fix + LOW defense-in-depth |
| advisor critical gate | N/A | no CRITICAL findings | No CRITICAL issues found |

## Fixes Applied

1. `assert(isSafeName(args.project), 'unsafe project name')` added to `cmdSinkFallback`
2. `'--'` separator added before `wtPath` in `removeWorktree` `git worktree remove` call
3. Plugin mirror updated (byte-for-byte identical, diff exits 0)
4. Test: third sub-case in `testSinkFallbackSkipsArchivedProject` for unsafe project name

## Validation Evidence

| Command | Result | Evidence |
|---------|--------|----------|
| `node scripts/simulate-workflow-walkthrough.js` (after all fixes) | PASS (exit 0, 14 tests) | .cache/review-fix-1.md |
| `diff scripts/kaola-workflow-claim.js plugins/.../kaola-workflow-claim.js` | PASS (exit 0) | verified inline |

## Follow-Up Items

- **MEDIUM (out of scope)**: `cmdRelease` cannot operate on drift folders. Track as follow-up GitHub issue.
- **LOW (deferred)**: `pr_url` domain validation in `cmdWatchPr`. Low priority given threat model.
- **LOW (pre-existing)**: `cmdPatchBranch` missing `isSafeName` guard — pre-existing gap, out of scope for issue #75.

## Review Status
PASSED WITH FOLLOW-UPS
