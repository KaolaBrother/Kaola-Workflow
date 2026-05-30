# tdd-guide output — issue-197 (Fast-path calibration audit script)

TDD order: wrote `scripts/test-fast-audit.js` first (RED), then implemented `scripts/kaola-workflow-fast-audit.js` (GREEN), then registered the test in `package.json`.

## RED evidence
Before implementing the audit module:
```
Error: Cannot find module '.../scripts/kaola-workflow-fast-audit.js'
exit=1
```

## GREEN evidence
After implementing the module:
```
Fast-audit regression passed (38 assertions)
exit=0
```

## Live audit table (run against real repo, 19 archived/active fast-summaries)
```
Fast-path runs: 19

Status counts
PASSED                  17
IN_PROGRESS              1
REVIEW                   0
ESCALATED                1
UNKNOWN                  0

Escalation reasons
scope exceeds fast-path                      1

File-count distribution
1                        4
2                        8
unknown                  7

Review mode
delegated               12
self-review              6
escalated                1
```
Both `--json` and table mode exit 0.

## Walkthrough
`node scripts/simulate-workflow-walkthrough.js` → "Workflow walkthrough simulation passed", exit 0 (52 tests).

## Files written (3-file write set)
- `scripts/kaola-workflow-fast-audit.js` — read-only audit, 10 exported functions + thin CLI wrapper.
- `scripts/test-fast-audit.js` — standalone regression test, 38 assertions, synthetic fixtures in os.tmpdir (never the real archive).
- `package.json` — inserted `node scripts/test-fast-audit.js &&` immediately before `node scripts/simulate-workflow-walkthrough.js` in `test:kaola-workflow:claude`.

## Note on review-mode self-review bucket
F4 (IN_PROGRESS), F5 (REVIEW), and F9 (UNKNOWN/garbage) land in `self-review` (no Required Agent Compliance table and not ESCALATED), so the test asserts self-review:6 (not 3). The em-dash in `parseEscalationReason` uses literal U+2014 to match the real issue-75 archive format.
