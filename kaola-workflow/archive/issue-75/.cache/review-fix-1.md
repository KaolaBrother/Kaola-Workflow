# Review Fix 1 — Security Findings (MEDIUM + LOW)

## Fixes Applied

### MEDIUM: isSafeName guard in cmdSinkFallback
Added `assert(isSafeName(args.project), 'unsafe project name')` after the existing `assert(args.project, ...)` line.

### LOW: `--` separator in removeWorktree
Changed `execFileSync('git', ['worktree', 'remove', '--force', wtPath], ...)` to `execFileSync('git', ['worktree', 'remove', '--force', '--', wtPath], ...)`.

### Test added
Added third sub-case to `testSinkFallbackSkipsArchivedProject`: supplies `../escape` as project name, asserts exit 1 and stderr contains 'unsafe project name'.

## RED Evidence
Test failed with: `sink-fallback should reject unsafe project name, got exit 0`

## GREEN Evidence
`Workflow walkthrough simulation passed` (exit 0)

## Mirror
Plugin mirror updated and verified byte-for-byte identical.
