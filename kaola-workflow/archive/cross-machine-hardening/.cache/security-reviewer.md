# Security Review: cross-machine-hardening

## Verdict: PASS — No CRITICAL or HIGH findings. Phase 6 not blocked by security.

### CRITICAL — None

### HIGH — None

### MEDIUM

**M1: `cmdTicker` missing `isSafeName` on `--session` before PID path construction (lines 354-365)**
All other subcommands assert `isSafeName(args.session)` before using it in a filesystem path. `cmdTicker` checks only that `args.session` is non-empty. An invocation with `--session ../../tmp/x` writes PID file outside `.tickers/`. Practical impact: local execution only, not remote.

**M2: PID file lacks explicit `0o600` mode; world-readable under default umask (line 377)**
`fs.openSync(pidPath, 'wx')` — no mode. Lock files and session files were hardened to `0o600` in prior security pass. Inconsistency: PID value allows any local user to SIGTERM the ticker process.

### LOW

**L1: `updateLeaseInPlace` uses string-form replace() with interpolated ISO timestamps (lines 182-183)** — Inert (ISO chars cannot be backreferences). Pattern inconsistency vs. function-form replacements elsewhere.

**L2: `git push origin <branch>` in adoption stub missing `--` separator (line 274)** — Inert (branch always has `workflow/` prefix). Defensive consistency concern.

### INFO (confirmed clean)

**I1:** `match.issue_number` not re-asserted `Number.isFinite` in ticker (lock file authored by validating process).
**I2:** JSON.parse: prototype pollution not reachable (named property reads only).
**I3:** ghExec arg injection: not reachable (array API, no shell).
**I4:** `claim_comment_id` in REST API URLs: gated by `/^\d+$/` at every call site.
