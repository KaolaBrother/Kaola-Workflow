# Security Review — issue-216: sink-merge archive-safety guard

## Verdict: CLEAN

No CRITICAL, HIGH, or MEDIUM findings.

## Findings

### Path traversal — NOT A FINDING

`args.project` validated unconditionally by `isSafeName()` (line 287) before `postMergeCleanup` is called (line 361). `isSafeName` rejects `/`, `\`, `\0`, `.`, `..`. Single validated segment cannot escape `kaola-workflow/`. `postMergeCleanup` is not exported; only `classifyMergeError` is in `module.exports` (line 369).

### Command injection — NOT A FINDING

`execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], ...)` uses array form (no shell). `mainRoot` is trusted (from `git rev-parse`). No user-controlled input in this invocation.

### TOCTOU — NOT A FINDING

Gates benign local control flow in single-operator CLI. No privilege escalation. Race outcome is wrong-but-harmless branch decision.

### Filesystem access — Acceptable trust model

`fs.existsSync` on paths from trusted `mainRoot` + validated single segment. No symlink-following concern.

### Information disclosure — NOT A FINDING

stderr discloses only the project name, which the operator themselves supplied via `--project`.

## [LOW] Log-forging hardening note (does not block)

`isSafeName` does not strip newlines or ANSI escape sequences. The stderr concatenation at line 216 could allow log-forging / terminal-escape injection for a TTY. Severity LOW: operator-supplied value, only fires when archive directory of that name already exists. Same pattern exists elsewhere in the file; if hardened, do consistently.
