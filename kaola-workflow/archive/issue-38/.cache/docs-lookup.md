docs-lookup: N/A - internal patterns sufficient

All changes are to internal scripts and command files. No external library, API, or framework behavior needs verification. The `git worktree list --porcelain` format is a stable Git built-in documented behavior — no external docs needed beyond what is already proven by the existing cmdResume/cmdWorktreeFinalize implementations in scripts/kaola-workflow-claim.js.
