# Focused verification — Issue #1052 frozen candidate

candidate: SHA `2cae8caa13ef00bd5aef6d5b5f534b3a3ab8352b` on `workflow/issue-1052`
worktree: `/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/issue-1052`
ran: 2026-09-07 (orchestrator, after independent re-review PASS)

## Commands (all exit 0)

| command | result |
|---|---|
| `node scripts/test-issue-1052-cursor-cli-startup-prep.js` | 141 assertions; spawn-census 380 |
| `node scripts/test-cursor-edition.js --cli-materialization-oracle` | GREEN: Next identity, named claim.js flags, locator, Finalize pre-dispatch ensure (github/gitlab/gitea) |
| `node scripts/validate-script-sync.js` | OK: 14 common scripts, 25 byte-identical groups; kernel parity |
| `node scripts/test-suite-registration.js` | 57 test-*.js files, 54 registered, 3 exempt; 655 assertions |
| `node scripts/edition-sync.js --check` | 6 forge aggregator ports in parity; committed kernel parity at HEAD |

Worktree clean at this SHA after the freeze commit.

## Not run (sequencing)

- `npm test`
- `npm run test:kaola-workflow:claude:full`
- `node scripts/simulate-workflow-walkthrough.js`
- full `node scripts/test-cursor-edition.js` (G2/G7/G8 live `--write` into TREE_ROOT)
- Isolated disposable-consumer live Cursor CLI named dispatch

#1051 remains open and is not treated as merged. Do not reuse any #1051 PASS over later bytes. After that merge handoff: sync latest main, keep both intents, re-verify affected results, then required chains and walkthrough.
