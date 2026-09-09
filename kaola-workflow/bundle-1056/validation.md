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

Run from the worktree 2026-09-09T18:02:20Z–18:14:07Z (UTC). Candidate `ac307a25`.

| check | result |
|---|---|
| `node scripts/kaola-workflow-run-chains.js --project bundle-1056 --json` | exit 0; receipt at the main root `kaola-workflow/bundle-1056/.cache/chain-receipt.json`: `headSha ac307a25…`, `workTreeHash clean`, `codeTreeHash c4b15ece…`, scope all-four (`edition_coupling`, base `e72407b8`), chains claude/codex/gitlab/gitea, 18:02:20–18:11:50; receipt sha256 `28116594bde82d96327a9a9bf167027f88064cdee34f44b178d7e13c4f5849d3` |
| `node scripts/test-issue-1055-render-subtraction-oracle.js` | 300/300 against `5cb85515` |
| `node scripts/test-issue-1056-default-branch-env-contract.js` | 40/40 (10 RED on `e72407b8`: 8 original + the two port-timeout pins) |
| five edition suites | grok 709, kimi 828, cursor 842, opencode 879, zcode 858; 3 trees each |
| `bash install-all.sh --check` | exit 0, dry-run PLAN ×7 (homes still carry the 11.0.0 bytes; no install performed) |

Not executed / unknown: a real network remote for `defaultBranch` stages 2–3 (all probes mocked or against unreachable local paths); a live `install-all.sh --yes`; real GitLab/Gitea remotes (their chains ran in-repo against fixtures).
