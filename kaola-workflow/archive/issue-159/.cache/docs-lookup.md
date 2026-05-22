# Docs Lookup — issue-159

docs-lookup: N/A — internal patterns sufficient.

All relevant behavior is git CLI (git diff HEAD, git ls-files, git stash push -u) with standard flags. No external library documentation needed. Fix uses only Node.js built-in `fs` (copyFileSync, mkdirSync) and git commands already used in the codebase.
