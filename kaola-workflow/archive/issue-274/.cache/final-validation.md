# Final Validation — issue-274

Command: `npm test` (worktree, final 8-file candidate state)
Result: PASS (exit 0) — all 4 editions.

- test:kaola-workflow:claude → validate-script-sync OK (15 common / 5 groups); validate-workflow-contracts passed; simulate-workflow-walkthrough passed (testAdaptiveSyncGroupGap: PASSED).
- test:kaola-workflow:codex → validate-script-sync OK; codex contract validation passed; codex walkthrough passed.
- test:kaola-workflow:gitlab → vendored agents (13) ok; gitlab contract validation passed; gitlab + gitlab-codex walkthroughs passed (testGitlabAdaptive PASSED).
- test:kaola-workflow:gitea → vendored agents ok; gitea contract validation passed; gitea + gitea-codex walkthroughs passed (testGiteaAdaptive PASSED).

Adaptive Phase-6 barrier (worktree): --resume-check=0, --gate-verify=0, --barrier-check=0 (result:pass, sensitiveHits:[], outOfAllow:[]), --verdict-check=0.

Byte-identity diffs: claude≡codex (no diff); gitlab/gitea = single L38 classifier-require hunk each. grep "plugins/kaola-workflow/scripts" in plugin plan-validators = 0 (join() split avoids the forge contract-validator literal scan).
