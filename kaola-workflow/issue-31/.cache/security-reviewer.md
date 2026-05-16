# Security Review: Issue-31 Session Identity Binding
**Reviewer:** security-reviewer agent
**Date:** 2026-05-16
**Phase gate:** Phase 5 pre-merge review
**Files reviewed:**
- `scripts/kaola-workflow-claim.js` (2007 lines)
- `scripts/kaola-workflow-session-env.js` (77 lines)
- `hooks/kaola-workflow-pre-commit.sh` (101 lines)

---

## CRITICAL

None.

---

## HIGH

### H1 — Test-only env vars are unconditionally honoured in production; guard inconsistency makes `KAOLA_KERNEL_SESSION_SKIP=0` bypass enforcement in two commands

**File:** `scripts/kaola-workflow-claim.js`
**Locations:**
- `derivePlatformSessionId`, line 210: `if (process.env.KAOLA_KERNEL_SESSION_SKIP === '1')`
- `cmdSession`, line 546: `if (derived.sid === null && !process.env.KAOLA_KERNEL_SESSION_SKIP)`
- `cmdBootstrap`, line 1117: `if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(...)`
- `cmdStartup`, line 1171: `if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(...)`

**Description:**
Two distinct patterns are used to check the `KAOLA_KERNEL_SESSION_SKIP` variable:

1. `derivePlatformSessionId` checks strict equality `=== '1'`. Setting the variable to any other non-empty value (`0`, `false`, `no`) does **not** trigger the skip, which is the safe outcome.
2. `cmdSession`, `cmdBootstrap`, and `cmdStartup` check truthiness (`!process.env.KAOLA_KERNEL_SESSION_SKIP`). Any non-empty value, including `KAOLA_KERNEL_SESSION_SKIP=0`, causes enforcement to be skipped in these three commands — even though `derivePlatformSessionId` itself would still enforce.

The concrete attack / misconfiguration path: a developer or CI system sets `KAOLA_KERNEL_SESSION_SKIP=0` believing they are disabling the skip. `cmdStartup` and `cmdBootstrap` skip their enforcement guard (truthy check), but `derivePlatformSessionId` still enforces. The divergent behaviour leads to a confused code path where the bootstrapping and startup entry points bypass enforcement while the lower-level function does not.

`KAOLA_KERNEL_SESSION_FAKE_PID` introduces a separate bypass: set it to any positive integer X, pre-plant a valid `.runtime/X.identity` file with the desired session ID, and `derivePlatformSessionId` will return an attacker-controlled SID without process-tree walking. Because `.runtime/` files are owned by the same Unix user running Claude, same-user code running alongside the workflow can trivially pre-plant such a file. Under `KAOLA_ENFORCE_PLATFORM_SESSION=1`, this collapses enforcement back to the self-asserted model the feature was designed to replace.

No production guard (`NODE_ENV`, configuration flag, or documentation warning) prevents these env vars from being set in a deployed environment.

**Recommendation:**
1. Standardise all guards to `=== '1'` (strict equality), not truthiness.
2. Gate both test-only variables behind an additional compile-time or config check, such as only honouring them when `NODE_ENV === 'test'` or a secondary `KAOLA_UNSAFE_TEST_MODE=1` is set alongside them.
3. Add a startup warning to stderr when either variable is set outside of a test environment.

---

### H2 — `derived.sid` from identity file is used in path operations without `isSafeName` validation at the derivation site

**File:** `scripts/kaola-workflow-claim.js`
**Locations:**
- `derivePlatformSessionId`, line 232: `return { sid: data.sid, source: 'file' };`
- `cmdSession`, line 550: `sessionId = derived.sid || envSessionId();` — then at line 288 used in `path.join(sessionsDir(coordRoot), sessionId + '.json')` after `assertSafeSession` at line 554
- `cmdClaim`, line 1251: `const ownerSid = derivePlatformSessionId(coordRoot).sid || 'unverified';` — stored into `lockData.owner_session_id` at line 885, then written to `workflow-state.md` via `updateSinkLease` line 770 without sanitisation
- `cmdDeriveSession`, line 277: `process.stdout.write(result.sid + '\n');` — raw write to stdout consumed by pre-commit hook

**Description:**
`derivePlatformSessionId` returns `data.sid` directly from the parsed JSON of a `.runtime/<pid>.identity` file without calling `isSafeName`. The identity file is written with mode `0o600` (owner-only), which prevents other Unix users from modifying it, but the same user running Claude can write it. The concern is:

- In `cmdSession`, `assertSafeSession` is called after the SID is assigned (line 554), so path traversal characters in `data.sid` would be caught before path use. This path is safe.
- In `cmdClaim` (line 1251), `ownerSid` is stored into `lockData.owner_session_id` and written verbatim into `workflow-state.md` via string interpolation at line 770: `'owner_session_id: ' + (lockData.owner_session_id || 'unverified')`. A malicious SID containing newlines could inject arbitrary fields into the Markdown state file. No validation is applied before this write.
- In `cmdDeriveSession` (line 277), `result.sid` is written raw to stdout. The pre-commit hook captures this as `DERIVED_SID` and uses it in a `printf` format string and in a string comparison inside `[ "$OWNER" != "$DERIVED_SID" ]`. A SID containing shell metacharacters would not cause command injection here because the comparison is quoted, but a SID containing newlines would corrupt the pre-commit diagnostic output.

**Recommendation:**
Add an `isSafeName` call inside `derivePlatformSessionId` before returning `data.sid`, returning `{ sid: null, source: null }` if validation fails. Separately, apply the same validation to `ownerSid` in `cmdClaim` before it is written into state files.

---

## MEDIUM

### M1 — Audit log directory is created without a restrictive mode; the override bypass proceeds silently on log write failure

**File:** `scripts/kaola-workflow-claim.js`
**Locations:**
- `writeAuditLog`, lines 240–246

**Description:**
`fs.mkdirSync(auditDir, { recursive: true })` is called without a `mode` option. Node's `mkdirSync` defers to the process umask, which defaults to `0o022` on most systems, making the directory world-readable (`drwxr-xr-x`). Since audit entries record that `--platform-override` was used to bypass session enforcement, world-readability means any local user can enumerate override events.

The outer `try/catch` on line 242 silently absorbs all failures. If the audit write fails (disk full, permission denied on directory creation), `writeAuditLog` returns without error and execution continues normally, so `--platform-override` proceeds unaudited. If audit is intended as an evidence trail for overrides, a silent failure defeats its purpose.

**Recommendation:**
1. Create the audit directory with mode `0o700`: `fs.mkdirSync(auditDir, { recursive: true, mode: 0o700 })`.
2. On `appendFileSync` failure, write a warning to stderr (do not throw — the override itself should still proceed, but the failure should be visible).

---

### M2 — `.runtime/` directory is created without a restrictive mode

**Files:** `scripts/kaola-workflow-claim.js` line 201, `scripts/kaola-workflow-session-env.js` line 52

**Description:**
Both `writeIdentityFile` (claim.js line 201) and the identity-write block in session-env.js (line 52) call `fs.mkdirSync(runtimeDir, { recursive: true })` without a `mode` argument. The resulting `.runtime/` directory inherits the process umask, typically making it world-traversable (`0o755`). Although individual identity files are created `0o600`, a world-traversable parent directory allows any local user to enumerate which PIDs have identity files, infer running sessions, and attempt to pre-plant identity files for recycled PIDs (though the O_EXCL write on the file itself blocks overwriting legitimately written files).

**Recommendation:**
Use `fs.mkdirSync(runtimeDir, { recursive: true, mode: 0o700 })` in both files.

---

### M3 — TOCTOU window between identity file read, `isPidAlive`, and `lstart` comparison

**File:** `scripts/kaola-workflow-claim.js`
**Location:** `derivePlatformSessionId`, lines 221–231

**Description:**
The sequence is: (1) read identity file, (2) call `isPidAlive` via `process.kill(pid, 0)`, (3) call `readClaudeStartTimeStr` which invokes `ps -o lstart=`. Between steps 2 and 3, the original Claude process can die and a new process can be assigned the same PID. If both death and recycling occur within the sub-second window between the two syscalls, `isPidAlive` would return `true` for the new process (which has the same PID but different `lstart`), but the `lstart` comparison at step 3 would then fail because the new process has a different start time. This makes the window result in a correct rejection (false negative), not a bypass.

However, if the checks are interleaved differently across threads or if `lstart` resolution is coarser than the recycling interval, a stale identity file could be validated against a newly-recycled PID with the same second-granularity start time. On macOS `ps -o lstart=` outputs a full date string (day month dd hh:mm:ss yyyy) with second precision. Same-second PID recycling is theoretically possible on a heavily loaded system.

**Recommendation:**
Document the residual TOCTOU risk explicitly in the function's comments, noting that it cannot be fully eliminated without kernel support. The current defense (lstart check) is the correct mitigation and provides adequate practical protection for the stated threat model.

---

### M4 — `/claude/i` regex on `ps comm` field is user-spoofable; forms the entire trust anchor for kernel-derived identity

**File:** `scripts/kaola-workflow-claim.js`
**Location:** `walkToClaudePid`, line 184: `if (/claude/i.test(comm)) return pid;`
**File:** `scripts/kaola-workflow-session-env.js`
**Location:** lines 43–46

**Description:**
The feature's trust boundary rests on locating a parent process whose `comm` field matches `/claude/i`. On macOS, `comm` reflects the process name, which is user-settable by calling `process.setTitle()` or by naming the binary accordingly. A process named `claude-fake` or any binary with "claude" in its name would pass the regex and be accepted as the Claude ancestor.

This is not a vulnerability against external attackers; it is a single-user trust model. A user who can plant a process named with "claude" can also modify the identity files directly. The finding is worth documenting so future reviewers understand the security model's scope: it defends against accidental env-var collisions between concurrent sessions, not against a malicious same-user actor.

**Recommendation:**
Add a comment to `walkToClaudePid` explicitly stating the trust boundary: "This regex is sufficient to distinguish the Claude process from shell/node ancestors on a standard Claude Code install. It does not protect against same-user process spoofing." If a stricter binding is required in future, consider matching the full executable path rather than the comm field.

---

## LOW

### L1 — `INVOKED_CMD` case pattern `*"git commit"*` can be bypassed by a commit command string that contains "git commit" embedded in a longer argument

**File:** `hooks/kaola-workflow-pre-commit.sh`
**Location:** line 24: `case "$INVOKED_CMD" in *"git commit"*)`

**Description:**
The case pattern is a glob that matches any string containing the literal `git commit`. A tool invocation like `git commit-graph write` would not match (correct), but a crafted `command` value of `echo "git commit"` would match, causing the hook to run when it should not. This is a minor logic error, not a security vulnerability, since the hook's action (blocking cross-session commits) erring on the side of running is the safer outcome. Word splitting in `case` is not an issue here because the variable is double-quoted.

**Recommendation:**
Consider narrowing the pattern to `git commit *` or using a more specific match, but note that the current false-positive direction (running when not needed) is safer than a false-negative.

---

### L2 — `LOCK_FILE` path construction uses `${PROJECT}` without double-quotes in `[ -f ... ]` test

**File:** `hooks/kaola-workflow-pre-commit.sh`
**Location:** line 60: `LOCK_FILE="$COORD_ROOT/kaola-workflow/.locks/${PROJECT}.lock"`
**Location:** line 62: `if [ ! -f "$LOCK_FILE" ]; then`

**Description:**
`LOCK_FILE` itself is assigned inside double-quotes (safe), and the subsequent `[ -f "$LOCK_FILE" ]` test also quotes it (safe). `PROJECT` is populated from `awk`/`head -1` output filtered through `isSafeName`-equivalent checks in the Node layer before it reaches the shell. There is no injection risk in practice, but `PROJECT` is never independently validated in the shell script before being interpolated into `LOCK_FILE`. If the lock directory path contains spaces (e.g., user home directory path), the `node -e "..." "$LOCK_FILE"` invocation at line 73 passes `$LOCK_FILE` as a positional argument `process.argv[1]`, which is safe.

**Recommendation:**
No change required. Document the implicit trust on `PROJECT` values originating from the Node layer's `isSafeName` validation.

---

### L3 — `writeSessionFile` does not use O_EXCL; concurrent sessions can overwrite each other's session files

**File:** `scripts/kaola-workflow-claim.js`
**Location:** `writeSessionFile`, line 818: `fs.writeFileSync(sessionPath(coordRoot, sessionId), ...)`

**Description:**
Unlike lock files and identity files (which use `wx`/O_EXCL for atomic exclusive creation), session files are written with plain `writeFileSync` without atomicity. Two simultaneous claims by the same session ID (possible in a retry scenario) could produce a torn session file. This is a data-integrity concern rather than a security vulnerability since session files are read-only for diagnostics in `cmdStatus`.

**Recommendation:**
Write session files atomically using a temp file + rename, or document that overwrites are benign.

---

## Summary Table

| ID | Severity | File | Description |
|----|----------|------|-------------|
| H1 | HIGH | kaola-workflow-claim.js | Test-only env vars unconditionally honoured; SKIP guard inconsistency |
| H2 | HIGH | kaola-workflow-claim.js | `derived.sid` unvalidated before path join and state file write |
| M1 | MEDIUM | kaola-workflow-claim.js | Audit dir world-readable; audit failures swallowed silently |
| M2 | MEDIUM | kaola-workflow-claim.js, kaola-workflow-session-env.js | `.runtime/` dir created without restrictive mode |
| M3 | MEDIUM | kaola-workflow-claim.js | TOCTOU window in PID liveness + lstart check |
| M4 | MEDIUM | kaola-workflow-claim.js, kaola-workflow-session-env.js | `/claude/i` comm-field match is user-spoofable; trust boundary not documented |
| L1 | LOW | kaola-workflow-pre-commit.sh | `case` pattern for `git commit` is overly broad |
| L2 | LOW | kaola-workflow-pre-commit.sh | `PROJECT` not independently validated in shell before path interpolation |
| L3 | LOW | kaola-workflow-claim.js | Session file write is not atomic (no O_EXCL) |

---

## Items Verified as Not Vulnerable (False Positive Candidates)

- **Command injection in `ps`/`git`/`node` calls**: All invocations use `execFileSync` with array arguments. No shell string form is used anywhere in the reviewed code. Confirmed not vulnerable.
- **Path traversal via PID in identity file path**: PID is parsed with `parseInt` and validated `> 1` before use in `path.join`. No traversal possible.
- **Shell variable injection in pre-commit hook**: All variable expansions in the shell script use double-quotes. The `case` construct quotes `"$INVOKED_CMD"`. The `node -e "..."` inline script reads `HOOK_INPUT` via `process.env`, not via shell argument expansion. Confirmed safe.
- **Hardcoded secrets or API keys**: None found in any reviewed file. All external credentials are expected from environment or `gh` CLI auth.
- **Plaintext passwords**: Not applicable — this system uses UUID session IDs, not passwords.
- **SQL injection**: Not applicable — no database queries.
- **O_EXCL identity file write preventing legitimate overwrites**: The empty catch on `writeIdentityFile` is intentional and correct for the race condition where two startup hooks write simultaneously; the loser silently skips.
