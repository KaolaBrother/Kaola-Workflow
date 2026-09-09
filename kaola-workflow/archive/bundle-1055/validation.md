# #1055 validation on the frozen candidate `c0abadc9`

Run from the worktree `.kw/worktrees/bundle-1055` at 2026-09-09T16:56:33Z–17:07:55Z (UTC).

| check | command | result |
|---|---|---|
| candidate-bound four-chain run | `node scripts/kaola-workflow-run-chains.js --project bundle-1055 --json` | exit 0, `result: pass`, `failed: []`; receipt `kaola-workflow/bundle-1055/.cache/chain-receipt.json` (main root) with `headSha c0abadc9…`, `workTreeHash clean`, scope `all-four` (`edition_coupling`, base `5cb85515`), chains claude/codex/gitlab/gitea each exit 0, 16:56:34–17:05:59 |
| integration walkthrough | inside the four chains (`simulate-workflow-walkthrough.js`, full scope on `:claude:full`, sharded on `:claude`) | covered by the receipt above |
| grok edition suite | `node scripts/test-grok-edition.js` | exit 0, 709 assertions, 3 trees in parity |
| kimi edition suite | `node scripts/test-kimi-edition.js` | exit 0, 828 assertions, 3 trees in parity |
| cursor edition suite | `node scripts/test-cursor-edition.js` | exit 0, 842 assertions, 3 trees in parity |
| opencode edition suite | `node scripts/test-opencode-edition.js` | exit 0, 879 assertions, 3 trees in parity |
| zcode edition suite | `node scripts/test-zcode-edition.js` | exit 0, 858 assertions, 3 trees in parity |
| installer check | `bash install-all.sh --check` | exit 0, dry-run PLAN for all seven runtimes (codex plugin 11.0.0), no changes made |
| render subtraction oracle | `node scripts/test-issue-1055-render-subtraction-oracle.js` | 300/300 comparisons against the `5cb85515` baseline (re-run after every production edit) |
| clean-room `--write` diff (adversarial) | two standalone clones at `5cb85515` and `8791ab55`, 5 runtimes × 3 forges | 308 files per side, zero byte and zero mode differences |
| real sink envelopes (adversarial) | 103 `--sink` runs on both commits | identical step order and result vocabulary |

Not executed / unknown: a real network remote for `defaultBranch`'s stages 2–3 (offline-safe paths measured only); a live install (`install-all.sh --yes`) against the seven runtime homes — the `--check` dry run passed, the homes still carry 11.0.0 bytes until the next install; the gitlab/gitea forge trees on a real GitLab/Gitea remote (this machine is GitHub-forge-only; their chains ran in-repo).
