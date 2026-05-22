# Phase 5 - Review: issue-159

## Code Review Findings

### CRITICAL
none

### HIGH
none

### MEDIUM/LOW

**[MEDIUM] JSON output schema change to `exported` field** (code-reviewer)
`buckets.exported` previously held `.patch` file paths only; now holds `.patch` files and `-untracked/` directory paths mixed. `docs/api.md` documents this. CHANGELOG entry recommended for consumers. Deferred to Phase 6 (CHANGELOG is Phase 6 responsibility per project convention).

**[LOW] Two files outside stated 8-file scope** (code-reviewer)
`kaola-workflow/archive/issue-158/phase6-summary.md` (pre-existing modification) and `kaola-workflow/.roadmap/issue-159.md` (roadmap init) are workflow bookkeeping. Both appear benign; noted for PR description.

**[LOW] Partial-copy orphan sidecar on mid-loop throw** (code-reviewer)
If `copyFileSync` throws mid-loop, outer catch returns null (worktree safely preserved) but a partially-populated `-untracked/` dir remains. Not a correctness bug. Noted as future cleanup opportunity.

## Security Review

Ran: yes — filesystem access (`fs.copyFileSync`, `execFileSync`) warranted security review.

### Findings

**[MEDIUM] fs.copyFileSync dereferences untracked symlinks** (security-reviewer) — FIXED
`git ls-files --others` lists untracked symlinks as single entries; `copyFileSync` followed them and wrote the *target's contents* into the tracked `kaola-workflow/archive/exports/` directory. A symlink like `creds -> ~/.env` would exfiltrate credentials into version control. Maps to OWASP A01/A04.

**Fix applied** (all 4 claim files): added `lstatSync` guard before `copyFileSync`:
```js
if (fs.lstatSync(src).isSymbolicLink()) continue;
```
All 3 walkthroughs re-passed after fix.

### Verified-safe
- Path traversal via file entries: safe (`git ls-files` emits repo-relative paths, no `..`)
- Command injection: safe (all git calls use `execFileSync` array form, no shell)
- issueNumber injection: safe (numeric-only, derived from branch name regex)
- `.git/` metadata exposure: safe (`--exclude-standard` excludes .git)

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | filesystem access + external commands warranted review |
| review-fix executors | invoked | .cache/review-fix-symlink.md | MEDIUM security fix applied: lstatSync guard in all 4 claim files |
| advisor critical gate | N/A | — | No CRITICAL findings |

## Fixes Applied

1. **Symlink guard** (all 4 claim files): `if (fs.lstatSync(src).isSymbolicLink()) continue;` before `fs.copyFileSync` in the untracked-files loop in `exportWorktreeDiff()`. Applied to:
   - `scripts/kaola-workflow-claim.js` (line 162)
   - `plugins/kaola-workflow/scripts/kaola-workflow-claim.js` (line 162)
   - `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` (line 171)
   - `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` (line 166)

## Validation Evidence

| Command | Result | Notes |
|---------|--------|-------|
| `node scripts/simulate-workflow-walkthrough.js` | PASS | sc9, sc10, sc5 all pass post-fix |
| `node plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js` | PASS | testStaleWorktreeCleanup PASSED |
| `node plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js` | PASS | testStaleWorktreeCleanup PASSED |

## Follow-Up Items

- CHANGELOG entry for `exported` field schema change (patch + sidecar paths now mixed) — Phase 6 responsibility
- Optional: cleanup partial sidecar dir on mid-copy failure (LOW, future enhancement)
- Symlink skip currently silent — future enhancement: log a warning to stderr so users know a symlink was skipped

## Review Status

PASSED WITH FOLLOW-UPS (CHANGELOG deferred to Phase 6, no blocking issues)
