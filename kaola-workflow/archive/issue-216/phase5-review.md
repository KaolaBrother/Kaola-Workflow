# Phase 5 - Review: issue-216

## Code Review Findings

### CRITICAL
none

### HIGH
- **[RESOLVED]** Archived exit-3 path originally skipped `git reset --hard origin/main`, leaving local `main` 1 commit ahead of `origin/main` with no recovery in the PR-sink fallback chain. Fix: capture `wasArchived` BEFORE the reset, let the reset always run, skip only the receipt write (`fs.mkdirSync` + `fs.writeFileSync`) when `wasArchived`. Routed to `tdd-guide`, fixed, re-validated GREEN.

### MEDIUM/LOW
- **[LOW — no action]** `git checkout main` inside original guard was a no-op (ffMergeLoop already leaves HEAD on main). Removed by the HIGH fix.
- **[LOW — no action required for this commit]** Pre-existing stale file `kaola-workflow/archive/issue-219/phase6-summary.md` must not be in the #216 commit. Phase 6 commit will stage #216 files only.
- **[LOW — follow-up]** `args.project` not sanitized of newlines/ANSI in stderr (log-forging concern). Operator-supplied, LOW severity; same pattern exists throughout the file. Address in a separate hygiene pass.

## Security Review
Ran: **yes** — sink-merge touches filesystem paths derived from user-supplied `args.project` and calls `execFileSync` git commands.

### Findings
CLEAN — no CRITICAL/HIGH/MEDIUM findings.
- Path traversal: defended by upstream `isSafeName()` assertion at line 287 before `postMergeCleanup` is reachable.
- Command injection: `execFileSync` array form used; no user input in `checkout main` call.
- TOCTOU: not security-relevant in local single-operator CLI.
- LOW log-forging note: newlines/ANSI not stripped from `args.project` in stderr. Non-blocking.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | .cache/code-reviewer.md | |
| security-reviewer | invoked | .cache/security-reviewer.md | |
| review-fix executors | invoked | .cache/review-fix-1.md | HIGH finding routed to tdd-guide |
| advisor critical gate | N/A | | No CRITICAL findings; HIGH routed without advisor escalation per policy |

## Fixes Applied
1. **HIGH fix** — `scripts/kaola-workflow-sink-merge.js`: restructured guard to capture `wasArchived` before reset, keep reset unconditional, skip only receipt block when archived. `git checkout main` no-op removed.
2. **Test fix** — `scripts/simulate-workflow-walkthrough.js`: replaced `fs.existsSync(archiveDir)` assertion (wrong expectation — archive-on-disk was a symptom of skipping the reset) with clean-main assertion (`git rev-list --count origin/main..main === 0`).
3. **Codex byte-sync** — `plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js`: identical diff applied, SHA `ac5b694b3cbda9ed159e00191b24e3e82d10f296` matches root.

## Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` → `Workflow walkthrough simulation passed` (exit 0)
- `testSinkMergeSkipsArchivedProjectPhantom: PASSED`
- `diff scripts/kaola-workflow-sink-merge.js plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js` → no output
- `shasum` both files → `ac5b694b3cbda9ed159e00191b24e3e82d10f296`

## Follow-Up Items
- LOW: Sanitize `args.project` of newlines/ANSI in stderr output (whole-file hygiene pass, not #216-specific)
- Note: `postMergeCleanup` pre-existing overrun (81 lines > 50-line guideline) — pre-existing, out of scope

## Review Status
PASSED WITH FOLLOW-UPS
