# #1056 validation

## Run 1 — candidate `f210ef76` (production fix + records; before the review follow-ups)

Run from the worktree 2026-09-09T17:47:29Z–18:00:53Z (UTC).

| check | result |
|---|---|
| `node scripts/kaola-workflow-run-chains.js --project bundle-1056 --json` | exit 0; receipt at the main root `kaola-workflow/bundle-1056/.cache/chain-receipt.json` bound to `f210ef76` |
| `node scripts/test-issue-1055-render-subtraction-oracle.js` | 300/300 against `5cb85515` |
| `node scripts/test-issue-1056-default-branch-env-contract.js` | 31/31 (8 RED on `e72407b8`) |
| five edition suites | grok 709, kimi 828, cursor 842, opencode 879, zcode 858; 3 trees each |
| `bash install-all.sh --check` | exit 0, dry-run PLAN ×7 |

## Run 2 — final candidate (review follow-ups: suite extended to 40 assertions with a count floor, docs/CHANGELOG precision)

(recorded below when complete)
