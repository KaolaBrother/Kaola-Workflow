evidence-binding: n3-fourchain bc7a59b3ef15
<!-- verdict: paste verdict here -->
verdict: pass
<!-- findings_blocking: paste findings_blocking here -->
findings_blocking: 0

main-session-direct gate (#307 four-chain cross-edition + #527 bug acceptance). All four chains run SEQUENTIALLY from the worktree with real ($?) exit codes:
- test:kaola-workflow:claude  EXIT 0 — "Workflow walkthrough simulation passed"
- test:kaola-workflow:codex   EXIT 0 — "Kaola-Workflow walkthrough simulation passed"
- test:kaola-workflow:gitlab  EXIT 0 — "GitLab Codex workflow walkthrough simulation passed" (edition-sync --check passed)
- test:kaola-workflow:gitea   EXIT 0 — "Gitea Codex workflow walkthrough simulation passed"
Bug acceptance: after the gitlab+gitea chains, `git status --porcelain | grep nonexistent-(gl|gt)-445-test` => empty (no scratch leak). The leak #527 reproduced (n1-fix RED) is gone.
