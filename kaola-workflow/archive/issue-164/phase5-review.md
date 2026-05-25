# Phase 5 - Review: issue-164

## Code Review Findings
### CRITICAL
none

### HIGH
none

### MEDIUM/LOW
- **[MEDIUM — RESOLVED]** `archive` receipt field hardcoded to `'closed'`/`'abandoned'` — `archive: result.archive || 'closed'` in `cmdFinalize`/`cmdWatchPr` always resolved to `'closed'` because `archiveProjectDir` never returns an `archive` key (returns `{skipped:'source-missing'}` or `{archived:true,...}`). On the source-missing skip path (double-finalize, partial re-run) the receipt falsely claimed success — a silent-success bug contradicting the issue's fail-loud contract. Fixed at all 3 sites × 3 forge claim files to derive from the actual return shape. Re-reviewed by opus code-reviewer: APPROVE, zero findings.

## Security Review
ran: yes (reason: changes touch filesystem path construction, external forge API calls, and a new env-var-driven script execution `KAOLA_GH_MOCK_SCRIPT`)

### Findings
none. Security review verdict: no new security risk introduced.
- `KAOLA_GH_MOCK_SCRIPT` in sink-merge `ghExec` is byte-identical to the pre-existing pattern at `kaola-workflow-claim.js:49-54` (test affordance, no new attack surface; `execFileSync` array args, no shell).
- Path construction (`archiveDest`, `roadmapSourceFile`) gated by `isSafeName(args.project)` + `Number.isFinite(args.issue) && > 0` before use — no traversal.
- All forge/git subprocess calls use `execFileSync` array args; git branch ops use `--` separator.
- No secrets logged or written to the receipt JSON.

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-reviewer | invoked | code-reviewer agent (opus) — APPROVE with 1 MEDIUM | |
| security-reviewer | invoked | security-reviewer agent (opus) — no new risk | |
| review-fix executors | invoked (emergency fallback) | phase4-progress.md "Main-Session Edits Under Executor-Unavailable Condition" | sonnet rate-limited; mechanically-specified fix on Opus + opus re-review |
| advisor critical gate | N/A | no CRITICAL findings | |

## Fixes Applied
- MEDIUM archive-honesty fix at 9 sites (3 forges × 3 closure paths); Codex byte-copy re-synced. Re-review: APPROVE.

## Validation Evidence
- `node scripts/simulate-workflow-walkthrough.js` → exit 0, "Workflow walkthrough simulation passed" (25 tests incl. 4 new #164 tests)
- `node scripts/validate-script-sync.js` → "OK: 9 common scripts and 2 byte-identical file group in sync."
- `npm test` → exit 0 (GitHub/GitLab/Gitea + Codex variants all pass)

## Follow-Up Items
- **MEDIUM (deferred to #165 prep)**: Add a regression test for the source-missing skip branch asserting `receipt.archive === 'skipped'` on double-finalize. Deferred because test-intent design wants the `tdd-guide` (sonnet) executor, which was rate-limited. Opus diff re-review was the gate for the fix itself.
- **CHANGELOG.md (Phase 6)**: add an [Unreleased] entry for #164 — Task 6 was scoped to docs/api.md only.

## Review Status
PASSED WITH FOLLOW-UPS
