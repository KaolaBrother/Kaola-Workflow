# Phase 1 - Research / Discovery: issue-31

## Deliverable
Add `derivePlatformSessionId(coordRoot)` to `kaola-workflow-claim.js` that derives the Claude session ID from the kernel (via `lsof` on the ancestor Claude PID's open `.jsonl` file) instead of trusting `KAOLA_SESSION_ID` env. Enforce this derived identity on all 10 mutating commands. Extend `kaola-workflow-session-env.js` to write an O_EXCL identity cache file. Update the pre-commit hook to use the derived ID. Add ticker parent-alive enforcement. Add `owner_session_id` to `workflow-state.md`. Add CLI `--platform-override` escape hatch. Add Epic Case in `simulate-workflow-walkthrough.js` covering AC1–AC15.

## Why
A Claude model running in session B can export `KAOLA_SESSION_ID=<session-A-SID>` and execute any mutating coordination command (claim, heartbeat, handoff, etc.) as session A — silently corrupting the lock substrate while all safety checks report "authorized: true". After issue #30 (separate worktrees), working-tree collisions are gone but the identity-layer impersonation persists in separate filesystems.

## Affected Area
- `scripts/kaola-workflow-claim.js` — primary: add `derivePlatformSessionId()`, update all 10 mutating commands, update `cmdSession()`, update `cmdVerifyStartup()`
- `scripts/kaola-workflow-session-env.js` — add O_EXCL identity file write at `<coordRoot>/kaola-workflow/.runtime/<claude-pid>.identity`
- `hooks/kaola-workflow-pre-commit.sh` — replace `KAOLA_SESSION_ID` env comparison with derived ID check via thin Node helper
- `scripts/simulate-workflow-walkthrough.js` — add Epic Case with AC1–AC15 test assertions
- `kaola-workflow/{project}/workflow-state.md` — gains `owner_session_id` field

## Key Patterns Found
1. O_EXCL lock file write: `fs.openSync(lp, 'wx', 0o600)` — `writeLockFile()` at `scripts/kaola-workflow-claim.js:661`
2. JSONL path computation: `claudeProjectDirForRoot()` (line 1281) + `claudeSessionPathForRoot()` (line 1289) — already computes `~/.claude/projects/{encoded}/{sid}.jsonl`; `derivePlatformSessionId()` inverts this: scan open FDs of Claude ancestor, find `.jsonl`, extract SID from basename
3. Session ID env chain: `envSessionId()` line 160 → `currentSessionId()` line 167 → `crypto.randomUUID()` fallback (to be removed)
4. Evidence hierarchy in `localOwnerLiveness()` line 1292: `claude-session-jsonl` mtime → ticker PID → lock expiry → recent heartbeat
5. `lsof -p <pid> -F n` output format: `p<pid>`, then `f<type>`, `n<path>` pairs — confirmed working on this macOS host
6. Process tree: `claude → bash → node`; `process.ppid` = bash PID; must walk one more level via `ps -o ppid= -p {bash_pid}` to reach Claude PID

## Test Patterns
- Framework: Hand-rolled `assert(condition, message)` — no external framework
- Location: `scripts/simulate-workflow-walkthrough.js`
- Structure: `mkdtempSync` temp dir, `HOME` override, `KAOLA_WORKFLOW_OFFLINE=1`, `gh` shim bash scripts, `execFileSync`/`spawnSync` to invoke `kaola-workflow-claim.js` subcommands
- Template: Epic Case 8K (line 1720) and 8M (line 1881) — create synthetic `.jsonl` under encoded Claude projects dir, probe session via liveness checks
- New Epic Case must: create synthetic `.jsonl`, mock process tree (or test with real PIDs where feasible), assert all 10 mutating commands exit 3 on SID mismatch, assert `cmdSession()` exits 4 outside Claude, verify `cmdVerifyStartup()` blocks cross-session caller

## Config & Env
- `KAOLA_SESSION_ID` — existing, remains for backward compat (read-only use) and 3.3.x deprecation window
- `KAOLA_WORKFLOW_OFFLINE=1` — existing gate for all GitHub API calls; tests must set this
- `CODEX_THREAD_ID`, `CLAUDE_SESSION_ID` — existing fallbacks in `envSessionId()`; Codex parity: O_EXCL identity file written before first model turn using `CODEX_THREAD_ID`
- `KAOLA_KERNEL_SESSION_SKIP=1` — new flag to skip kernel derivation in test environments without a Claude ancestor (test suite runs outside Claude)
- `KAOLA_KERNEL_SESSION_FAKE_PID` — test-only: overrides `walkToClaudePid()` return value to a specific PID; enables AC10/AC11 without a real Claude ancestor
- `<coordRoot>/kaola-workflow/.runtime/<claude-pid>.identity` — new per-PID identity file; valid while PID alive + start_time matches (no TTL)
- `<coordRoot>/kaola-workflow/.audit/identity-override.log` — new append-only audit log for `--platform-override` invocations

**Phase 0.2 empirical finding (2026-05-16)**: Claude does NOT keep JSONL open as persistent FD. lsof-based derivation is not viable. Design pivoted to identity-file-only in Phase 3. See `.cache/phase0-empirical.md`.

## External Docs
None required. All behavior verified via direct command execution on macOS:
- `lsof -p <pid> -F n` — field-format output confirmed working
- `ps -o ppid= -p <pid>` — parent PID lookup confirmed working
- Node.js `fs.openSync` `'wx'` mode — established in codebase

## GitHub Issue
KaolaBrother/Kaola-Workflow#31

## Completeness Score
10/10

- Goal clarity: 3/3 — precise function signature, behavior spec, and enforcement boundary defined
- Expected outcome: 3/3 — 15 numbered ACs, each testable
- Scope boundaries: 2/2 — explicit non-goals list, explicit decisions-locked section, migration path defined
- Constraints: 2/2 — no new user-facing steps, no behavior change for legitimate flows, lsof as load-bearing truth source, crypto.randomUUID fallback removed entirely

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-explorer | invoked | .cache/code-explorer.md | |
| docs-lookup | N/A | .cache/docs-lookup.md | All behavior verified from direct macOS command execution; no external library docs needed |

## Notes / Future Considerations
- **3.3.x backward compat window**: keep `KAOLA_SESSION_ID` env as fallback when `derivePlatformSessionId()` returns empty AND no Claude ancestor found AND deprecation warning emitted; 3.4.x removes it
- **Codex parity**: identity file written O_EXCL by Codex bootstrap before first model turn; value from `CODEX_THREAD_ID`; no lsof equivalent on Codex
- **macOS-only lsof**: on Linux, could use `/proc/{pid}/fd/` symlinks instead of `lsof`; Phase 3 plan should decide whether to support both or document macOS-only constraint
- **Ticker parent-alive enforcement** (AC13): requires `claude_start_time_ms` from PID ctime; `ps -o lstart= -p <pid>` on macOS gives start time; cross-check needed
- **PID recycling defense**: cache in `.runtime/<pid>.identity` must include `claude_start_time_ms` so a recycled PID with different start time invalidates the cache on next read
