# Docs Lookup — Issue #31

docs-lookup: N/A - internal patterns sufficient

## Evidence

All needed behavior is verified from direct command execution on this macOS host:

- `lsof -p <pid> -F n` produces field-format output (`p<pid>\nfcwd\nn<path>...`). Verified working for bash PID $$. Filter for paths ending in `.jsonl` under `~/.claude/projects/`.
- `ps -o ppid= -p <pid>` returns the parent PID with leading whitespace. Verified working. `trim()` needed on result.
- Node.js `fs.openSync(path, 'wx', 0o600)` for O_EXCL semantics — already established in codebase (`writeLockFile()` line 661), no external docs needed.
- Node.js `child_process.execFileSync` for synchronous subprocess calls — standard Node built-in, well-known API, no docs fetch needed.

No external library or framework docs are required for this implementation.
