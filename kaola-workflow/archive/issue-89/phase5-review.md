# Phase 5 - Review: issue-89

## Code Review Findings

### CRITICAL
none

### HIGH
none (one HIGH security finding resolved — see Security Review)

### MEDIUM/LOW
- MEDIUM: `runDirectMerge` is 66 lines (50-line limit); Step 0 block extractable as helper — deferred
- MEDIUM: `ffMergeLoop` redundant checkout in ONLINE path (checkout branch then immediately checkout main) — matches GitHub reference exactly, harmless
- LOW: No temp-dir cleanup in 4 new subprocess test blocks — deferred
- LOW: `require('../scripts/...')` in classifyMergeError block resolves correctly (up+back into same dir) — no bug, cosmetic only
- LOW: `doRebase` accepts `args` parameter it never uses — deferred
- LOW: `postMergeCleanup` creates `.cache` dir even if project archived — edge case, deferred

## Security Review
Ran: yes — files touch filesystem (writeFileSync receipt), execFileSync (git), forge API calls.

### Findings
**FIXED — HIGH: Argument injection via unvalidated branch name**
- `args.branch` was not validated with leading-hyphen guard; a value starting with `-` would reach `git checkout` as an option flag
- Fix: extended `assert` in `runDirectMerge` to block leading hyphens, null bytes, `.`, `..` — matches GitHub reference `main()` validation
- New test: `--orphan` branch name now correctly rejected with "invalid or TBD" error
- Validation: `node test-gitlab-sinks.js` exits 0 post-fix

**LOW: KAOLA_WORKFLOW_DEBUG_CWD writes to env-var-controlled path** — test-only hook, content is benign cwd string, low risk in local toolchain

**LOW: closeLinkedIssue forge calls not wrapped in try/catch** — only reachable via skipGit legacy path (tests only), low severity

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | files touch filesystem + forge API |
| review-fix executors | invoked | .cache/review-fix-1.md | HIGH security finding fixed |
| advisor critical gate | N/A | — | No CRITICAL findings |

## Fixes Applied
1. Branch name validation: extended `assert` in `runDirectMerge` to include `!args.branch.startsWith('-') && !args.branch.includes('\0') && args.branch !== '.' && args.branch !== '..'`
2. New security test added for `--orphan` branch name rejection

## Validation Evidence
- Command: `node plugins/kaola-workflow-gitlab/scripts/test-gitlab-sinks.js`
- Result: EXIT 0 — 6 blocks pass including new security test
- Evidence: Phase 4 cache `.cache/tdd-task-3.md` + review-fix-1 GREEN evidence

## Follow-Up Items
- MEDIUM: Extract Step 0 from `runDirectMerge` into private helper to meet 50-line function limit
- MEDIUM: Remove redundant `git checkout {branch}` in ONLINE path of `ffMergeLoop` (matches GitHub reference — low priority)
- LOW: Add try/finally cleanup in 4 subprocess test blocks
- LOW: Simplify `require('../scripts/...')` to `require('./'...)`
- LOW: Remove unused `args` param from `doRebase`

## Review Status
PASSED WITH FOLLOW-UPS
