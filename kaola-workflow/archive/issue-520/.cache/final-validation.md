# Final Validation — issue-520

Cross-edition diff (sink-merge ×4 + 3 chain-test homes) → all four chains required green (#307).
Each chain run with its real exit code captured directly (not via a piped tail).

| Chain | Command | Exit | Key evidence |
|-------|---------|------|--------------|
| codex | npm run test:kaola-workflow:codex | 0 | "Kaola-Workflow walkthrough simulation passed" |
| gitlab | npm run test:kaola-workflow:gitlab | 0 | "GitLab Codex workflow walkthrough simulation passed"; "GitLab #520 journal-exclusion from archive_commit: PASSED" |
| gitea | npm run test:kaola-workflow:gitea | 0 | "Gitea Codex workflow walkthrough simulation passed"; "Gitea #520 journal-exclusion from archive_commit: PASSED" |
| claude | npm run test:kaola-workflow:claude | 0 | "Workflow walkthrough simulation passed"; testSinkTransactionCleanEndToEnd PASSED; testSinkTransactionCrashResume PASSED (crash-resume still reads on-disk journal) |

verdict: pass

Reuse boundary: validation reuse covers code/test impact through node n1-fix (the 7-file write set).
The finalize-node CHANGELOG.md edit is docs-only and outside the rerun trigger (no behavior/API/build-config change).
The contractor regenerates a fresh chain-receipt against the impl commit HEAD before the chain-receipt gate.
