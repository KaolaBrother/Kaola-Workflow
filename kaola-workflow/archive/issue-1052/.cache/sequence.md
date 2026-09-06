# Issue #1052 sequencing vs #1051

Recorded 2026-09-07 from the controller coordination message. Not a Mission List result.

- #1051 completes its full validation and merge first.
- #1052 then syncs latest main, preserves both intents, and re-verifies affected results.
- #1051 current candidate `4cd8904cb1a129565b0c656bd30a1b9820da5d7d` is not final (`docs/api.md` still pending). Do not adopt PASS evidence bound to that SHA for later bytes.
- Continue #1052 independent RED, implementation, docs, focused suites, freeze, and independent review.
- Do not start competing full integration/release suites or `simulate-workflow-walkthrough.js` until the controller relays the #1051 complete-validation handoff.
- Do not operate the #1051 session, folder, worktree, or process.
- After both issues merge, Codex controller cuts the release and reinstalls all local coding-agent runtimes. This run completes the #1052 lifecycle only: no separate publish, no `install-all.sh` global reinstall.
