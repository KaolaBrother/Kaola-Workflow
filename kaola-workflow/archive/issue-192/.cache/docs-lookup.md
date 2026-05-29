docs-lookup: N/A - internal patterns sufficient

The fix replaces serial `gh issue view` calls with `gh issue list --state closed --json number --limit 1000`, 
a pattern already in production in `detectStaleLabels()`. No external library/framework docs needed.
All execution uses Node.js built-in `child_process.execFileSync` — no new deps.
