# Code Explorer Output — Issue #31: Session Identity Binding

## Entry Points

- `kaola-workflow-session-env.js` — SessionStart hook: writes `KAOLA_SESSION_ID` to `$CLAUDE_ENV_FILE` from the Claude hook event `session_id` field. This is where the self-assertion is introduced.
- `scripts/kaola-workflow-claim.js:envSessionId()` (line 160) — reads `KAOLA_SESSION_ID`, `CODEX_THREAD_ID`, or `CLAUDE_SESSION_ID` from the environment.
- `scripts/kaola-workflow-claim.js:currentSessionId()` (line 167) — resolves session from argv `--session`, then `envSessionId()`, then `crypto.randomUUID()` as last resort.
- `hooks/kaola-workflow-pre-commit.sh` (line 85) — compares `$KAOLA_SESSION_ID` to the lock file's `session_id`; blocks the commit if they differ.

## Session Identity Creation & Verification Flow

**Startup path:**
1. Claude runtime emits SessionStart hook event JSON with `session_id` field.
2. `kaola-workflow-session-env.js:36` reads stdin, extracts `session_id`, appends `export KAOLA_SESSION_ID='...'` to `$CLAUDE_ENV_FILE`. No verification.
3. Any subsequent `node scripts/kaola-workflow-claim.js <subcommand>` call: `currentSessionId()` reads this env var.
4. `cmdStartup()` (line 1021) calls `currentSessionId()`, writes `.sessions/{sessionId}.json` (via `writeSessionFile()`, line 671) and `.sessions/{sessionId}.startup.json` (via `writeStartupReceipt()`, line 401).
5. `cmdClaim()` (line 1103) calls `currentSessionId()`, attempts O_EXCL atomic write via `writeLockFile()` (line 661, `'wx'` flag) into `.locks/{project}.lock` with `session_id` field set.

**Verification path:**
1. Phase commands invoke `verify-startup` subcommand.
2. `cmdVerifyStartup()` (line 380) takes `--session` (argv) and `--project`, reads startup receipt at `.sessions/{sessionId}.startup.json`.
3. Checks `receipt.session === args.session` — tautological: receipt was written using the same self-asserted ID being verified against itself.
4. Returns `{ authorized: true/false, session, project, reason }`.
5. **Vulnerability**: Any caller can provide `--session sess-A` and get `authorized: true` because the receipt was written by that ID.

**Pre-commit enforcement:**
1. `hooks/kaola-workflow-pre-commit.sh` fires on `git commit`.
2. Reads `KAOLA_SESSION_ID` from environment.
3. Reads lock file owner via JSON parse of `.locks/{project}.lock`.
4. Compares: `if [ "$OWNER" != "$KAOLA_SESSION_ID" ]` → exits 2 (BLOCKED) on mismatch.
5. Falls back to reading `session_id:` from `workflow-state.md` if no lock file found.

## Research Question Answers

**Q1 — Session ID derivation chain:**
`kaola-workflow-session-env.js:36` appends `export KAOLA_SESSION_ID='...'` from `input.session_id`. `envSessionId()` at line 160 reads that env var (fallback chain: `KAOLA_SESSION_ID` → `CODEX_THREAD_ID` → `CLAUDE_SESSION_ID`). `currentSessionId()` at line 167: `args.session` → `envSessionId()` → `crypto.randomUUID()`. No kernel verification at any step.

**Q2 — Mutating vs read-only commands:**
Mutating: `startup` (1021), `bootstrap` (971), `claim` (1103), `release` (1495), `heartbeat` (1503), `ticker` (1598), `handoff` (1369), `patch-branch` (1714), `sweep` (1634), `watch-pr` (1755).
Read-only: `status` (1670), `can-handoff` (1349), `session` (412), `verify-startup` (380).

**Q3 — Lock file JSON schema:**
`buildLockData()` at line 731: `{ project, session_id, machine_id, claimed_at, expires, last_heartbeat, issue_number, claim_comment_id, sink, pr_url, pr_number, runtime, worktree_path, branch }`.

**Q4 — coordRoot and directory structure:**
`getCoordRoot()` at line 91: `path.resolve(root, git rev-parse --git-common-dir)`. Subdirectories:
- `.locks/{project}.lock` — lock files
- `.sessions/{sessionId}.json` — session identity files
- `.sessions/{sessionId}.startup.json` — startup receipts
- `.tickers/{sessionId}.pid` — ticker heartbeat PID files
All paths constructed by helpers at lines 178–182.

**Q5 — Ticker lifecycle:**
`cmdTicker()` at line 1598: acquires O_EXCL PID file at `.tickers/{sessionId}.pid`, runs `runTick()` via `setTimeout` every 15 min. Each tick: updates `last_heartbeat` + `expires` (+2hr), pushes GitHub comment every 4 ticks. Exits on SIGTERM/SIGINT or missing lock.

**Q6 — `cmdVerifyStartup()` behavior:**
Line 380: reads receipt at `.sessions/{sessionId}.startup.json`, checks `receipt.session === args.session`. Tautological — receipt was written when self-asserted ID was current. No independent evidence that caller IS that session.

**Q7 — Test infrastructure:**
Hand-rolled `assert(condition, message)` in `simulate-workflow-walkthrough.js`. No framework. Tests use `mkdtempSync`, `HOME` override, `KAOLA_WORKFLOW_OFFLINE=1`, gh shim bash scripts, `execFileSync`/`spawnSync`. Epic Case 8K (line 1720) and 8M (line 1881) are the direct template for Issue #31 tests — create synthetic `.jsonl` file under encoded Claude project dir.

**Q8 — `.sessions/` directory contents:**
`{sessionId}.json` (line 671): `{ session_id, machine_id, hostname, pid, started }`.
`{sessionId}.startup.json` (line 401): `{ startup_completed, session, written_at, runtime, claim, verdict, issue_sync, roadmap_sync, issue_source, project, issue, selected_issue, selected_project, skipped, blocked }`.

**Q9 — Existing lsof/process-tree inspection:**
No existing `lsof` or `ps` usage in any script. `isPidAlive()` at line 1262 uses `process.kill(n, 0)`. `localOwnerLiveness()` at line 1292 checks JSONL mtime via precomputed path. Issue #31 must invert this: scan open JSONL handles of the ancestor Claude PID via `lsof`.

**Q10 — O_EXCL usage:**
`writeLockFile()` at line 661: `fs.openSync(lp, 'wx', 0o600)` — O_EXCL|O_WRONLY|O_CREAT, single attempt, exits 2 on `EEXIST`/`EACCES`. Ticker PID file also uses `'wx'` flag. Session files: plain `writeFileSync`, no O_EXCL.

## Key Existing Infrastructure to Reuse

- `claudeProjectDirForRoot()` (line 1281) — computes `~/.claude/projects/{encoded}/` path; used by #31 to locate JSONL
- `claudeSessionPathForRoot()` (line 1289) — constructs `{dir}/{sessionId}.jsonl` path
- `localOwnerLiveness()` (line 1292) — evidence hierarchy: `claude-session-jsonl` mtime, ticker PID, lock expiry, recent heartbeat
- `isPidAlive()` (line 1262) — uses `process.kill(n, 0)` for PID liveness
- `isSafeSessionId()` in `kaola-workflow-session-env.js` (line 22) — validate extracted session ID from lsof filename
- `getCoordRoot()` (line 91) — do not reimplement

## Process Tree Architecture for `derivePlatformSessionId()`

Claude invokes scripts as: `claude → bash → node`
- `process.ppid` = bash PID (not Claude PID)
- Must walk: node's PID → bash PID (`process.ppid`) → bash's parent (Claude PID) via `ps -o ppid= -p {pid}`
- Then: `lsof -p {claude_pid} -F n` → filter for `.jsonl` paths under `~/.claude/projects/{encoded}/`
- Extract session ID from basename of matching path

**Important macOS constraint:** `lsof` on macOS requires the process be owned by the same user or root. The Claude process should be same-user, so this should work without sudo.

## Naming Conventions

- Functions: camelCase verb-noun: `writeLockFile`, `readLockFile`, `buildLockData`, `envSessionId`, `currentSessionId`
- New function: `derivePlatformSessionId(coordRoot)` per issue spec
- Path helpers: `{noun}Path(coordRoot, ...)` or `{noun}Dir(coordRoot)`
- Subcommand entry: `cmdKernelSession()` or integrate into `cmdSession()` (line 412)
- Error handling: `process.stderr.write(...)` then `process.exitCode = N`, not throw
- Feature flag for tests: `KAOLA_KERNEL_SESSION_SKIP=1` or similar to skip lsof when running test suite outside Claude

## Similar Implementations to Mirror

1. `writeLockFile()` (line 661) — O_EXCL identity file write pattern
2. `localOwnerLiveness()` (line 1292) — JSONL path computation and evidence hierarchy
3. `cmdVerifyStartup()` (line 380) — structure of a caller-side identity check
4. Epic Case 8K (line 1720) and 8M (line 1881) — test skeleton for JSONL-based session probing

## External Docs Needed

- `lsof -F n` output format (field-format output, `n` = name field)
- macOS `ps -o ppid= -p <pid>` portability vs Linux `/proc/{pid}/status`
- Node.js `child_process.execFileSync` for synchronous process-tree walking
- `fs.openSync` with `'wx'` flag for O_EXCL semantics (already established in codebase)
