# Code Architect Output — Issue #31: Session Identity Binding

## Design Decisions

- `lsof` is the authoritative truth source for session identity. The identity file under `<coordRoot>/.runtime/<claude_pid>.identity` is a 60-second TTL cache only — not the primary record.
- Enforcement is off by default behind `KAOLA_ENFORCE_PLATFORM_SESSION=1`, preserving full backward compatibility with 3.2.x clients and all existing Epic Cases 1–8M without any env changes.
- Exit codes are strictly non-overlapping: 3 (SID mismatch under enforcement), 4 (no Claude ancestor) are new and must never be conflated with the existing 2 (occupied/unauthorized).
- `cmdSweep` is exempt from enforcement when invoked by a parent pid whose PID file exists in `.tickers/`; callers outside ticker lineage must pass `--platform-override`.
- The `derive-session` subcommand is the single entrypoint for both the pre-commit hook and any external observer — no separate helper binary.

---

## Phase 0 — Empirical Gate (no code; BLOCKER)

Phase 0 must be completed before any Phase 1 code is written. If Phase 0.2 fails, the lsof-as-truth-source design is invalidated. Stop and escalate; do not begin Phase 1.

**0.1 — PID coherence verification**

From a running Claude session, confirm that walking `process.ppid` (node → bash) then one more `ps -o ppid= -p <bash_pid>` hop arrives at the same Claude PID that the session-env hook previously wrote to the identity file.

```bash
# From inside node (hook or claim script):
const bashPid = process.ppid;
const claudePidRaw = execFileSync('ps', ['-o', 'ppid=', '-p', String(bashPid)], {encoding:'utf8'}).trim();
const claudePid = parseInt(claudePidRaw, 10);
```

Verify this PID matches the file `<coordRoot>/.runtime/<claudePid>.identity`.

**0.2 — JSONL handle persistence (critical gate)**

Run this command every 30 seconds for 10 minutes while Claude is active:

```bash
lsof -p <claude_pid> -F pfn | grep '\.jsonl$'
```

Confirm the session JSONL under `~/.claude/projects/<encoded>/` appears in every sample. If it drops from the fd table at any point, the lsof-based derivation is unreliable and the entire Phase 1 design must be reconsidered before any code is written.

**0.3 — lsof same-uid permission on macOS**

Verify that `lsof -p <claude_pid>` succeeds without `sudo` when the node process and the Claude process share the same Unix uid. Confirm on macOS 14+.

---

## Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `scripts/kaola-workflow-derive-session.js` | Standalone helper — thin wrapper around `derivePlatformSessionId()`; invoked by pre-commit hook via `node scripts/kaola-workflow-derive-session.js --json` | Phase 1 (optional if derive-session subcommand in claim.js is sufficient) |

That is the only new file. All other new code lands in existing files.

---

## Files to Modify

| File | Changes | Priority | Phase |
|------|---------|----------|-------|
| `scripts/kaola-workflow-session-env.js` | Write O_EXCL identity file on SessionStart | P1 | 1 |
| `scripts/kaola-workflow-claim.js` | Add `derivePlatformSessionId()`, `derive-session` subcommand, `enforcePlatformSessionOrExit()`, wire 10 mutating commands, refactor `cmdSession()` and `cmdVerifyStartup()`, `--platform-override` flag, sweep ticker-exemption, ticker Claude-PID guard, sweep stale identity pruning | P1 | 1–5 |
| `hooks/kaola-workflow-pre-commit.sh` | Replace `$KAOLA_SESSION_ID` comparison with derived-id Node call | P1 | 4 |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 8N after line 1914 | P1 | 6 |

---

## Exit Code Table (complete mapping)

| Code | Meaning | Existing? | Commands |
|------|---------|-----------|----------|
| 0 | Success | yes | all |
| 1 | No lock found / no owner / no work | yes | release, heartbeat, startup, bootstrap, cmdSession (no owner) |
| 2 | Lock occupied / unauthorized / mismatched owner / startup-receipt blocked | yes | claim, can-handoff, handoff, verify-startup, cmdSession (owner mismatch) |
| 3 | Platform SID mismatch under enforcement | **new** | `enforcePlatformSessionOrExit` called from all 10 mutating commands |
| 4 | No Claude ancestor in process tree | **new** | `cmdSession` when derivation fails and `KAOLA_KERNEL_SESSION_SKIP` is absent |

---

## Data Flow

```
Claude process (holds ~/.claude/projects/enc/sid.jsonl)
  └── bash subprocess
        └── node kaola-workflow-claim.js <subcmd>
              ├── process.ppid → bash PID
              ├── ps -o ppid= -p <bash> → claude PID
              ├── read .runtime/<claude_pid>.identity (cache hit → return cached SID)
              │     if miss or TTL expired:
              │       lsof -p <claude_pid> -F pfn
              │       grep n.*/.claude/projects/.*\.jsonl
              │       extract SID from filename
              │       write .runtime/<claude_pid>.identity (O_EXCL, mode 0o600)
              └── compare derived SID vs lock.session_id → enforce or log
```

---

## Detailed Build Sequence

### Phase 1 — Identity Infrastructure

**Write set: `kaola-workflow-session-env.js`, `kaola-workflow-claim.js` (new functions only, no wiring)**

**Task 1.1 — `kaola-workflow-session-env.js`: identity file at SessionStart**

Add to `main()` after the existing `fs.appendFileSync` call (after line 36):

```js
// Resolve coordRoot: walk git rev-parse --git-common-dir from $GIT_ROOT or cwd
// Write <coordRoot>/.runtime/<claude_pid>.identity via O_EXCL, mode 0o600
// Structure: { sid, claude_pid, claude_start_time_ms, runtime: 'claude', written_at }
// Obtain claude_start_time_ms via: ps -o lstart= -p <claude_pid> → parse to ms epoch
// Silently skip if coordRoot cannot be determined or O_EXCL fails (file already exists)
```

Key APIs: `fs.openSync(p, 'wx', 0o600)`, `execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {encoding:'utf8'})`, `execFileSync('git', ['rev-parse', '--git-common-dir'], ...)`.

The `claude_pid` is the parent of the bash parent of this node process: walk `process.ppid` → bash PID → `ps -o ppid= -p <bash>` → claude PID (same two-hop walk used in `derivePlatformSessionId`).

**Task 1.2 — `kaola-workflow-claim.js`: add `derivePlatformSessionId(coordRoot, options)`**

Insert after `currentSessionId()` (after line 172). This function must never throw — it returns `{ sid: string|null, source: 'cache'|'lsof'|'skip', cached: bool }`.

```
derivePlatformSessionId(coordRoot, options = {})
  if KAOLA_KERNEL_SESSION_SKIP=1 → return { sid: envSessionId() || null, source: 'skip', cached: false }
  claudePid = walkToClaudePid()   // two-hop ps walk; returns null if ancestor not found
  if !claudePid → return { sid: null, source: 'lsof', cached: false }
  identityFile = path.join(coordRoot, 'kaola-workflow', '.runtime', claudePid + '.identity')
  if file exists:
    data = JSON.parse(readFileSync)
    currentStartMs = readClaudeStartTimeMs(claudePid)
    if data.claude_start_time_ms === currentStartMs && Date.now() - data.written_at < 60_000:
      return { sid: data.sid, source: 'cache', cached: true }
    else:
      fs.unlinkSync(identityFile)  // stale or PID recycled
  sid = lsofDeriveSessionId(claudePid)
  if !sid → return { sid: null, source: 'lsof', cached: false }
  writeIdentityFile(identityFile, { sid, claude_pid: claudePid, claude_start_time_ms, runtime: 'claude', written_at: Date.now() })
  return { sid, source: 'lsof', cached: false }
```

Sub-functions:
- `walkToClaudePid()`: walk `process.ppid` (bash) → `ps -o ppid=,comm= -p <bash>` → check `comm` contains `claude` (case-insensitive); bound to 5 hops; return `null` if no match.
- `readClaudeStartTimeMs(pid)`: `ps -o lstart= -p <pid>` → `Date.parse()` → number.
- `lsofDeriveSessionId(claudePid)`: `execFileSync('lsof', ['-p', String(claudePid), '-F', 'pfn'], {encoding:'utf8'})` → split on `\n` → filter `n`-prefixed lines matching `/\.claude\/projects\/[^/]+\/([^/]+)\.jsonl$/` → extract SID from capture group 1; return first match or null.
- `writeIdentityFile(p, data)`: `fs.openSync(p, 'wx', 0o600)` pattern (exact copy of `writeLockFile` at line 661, minus fsync requirement).

**Task 1.3 — add `derive-session` subcommand**

Add `cmdDeriveSession()` and wire in `main()` after line 1830:
```js
if (sub === 'derive-session') return cmdDeriveSession();
```
Update usage string on line 1816 to include `derive-session`.

---

### Phase 2 — Read-Only Callers

**Write set: `kaola-workflow-claim.js` (`cmdSession`, `cmdVerifyStartup` only)**

**Task 2.1 — refactor `cmdSession()` (line 412)**

Replace `currentSessionId(args)` with `derivePlatformSessionId(coordRoot)`. Remove `crypto.randomUUID()` fallback entirely from `cmdSession`. If `derived.sid === null` and `KAOLA_KERNEL_SESSION_SKIP` not set: exit 4.

**Task 2.2 — refactor `cmdVerifyStartup()` (line 380)**

1. Derive caller's platform SID.
2. If `KAOLA_KERNEL_SESSION_SKIP=1`: use `args.session` (test path).
3. If derived SID is null: exit 4.
4. If derived SID !== `args.session`: exit 2 with `authorized: false`.
5. Existing receipt-authorization logic proceeds only after identity check passes.

---

### Phase 3 — Mutating Enforcement Chokepoint

**Write set: `kaola-workflow-claim.js` (`enforcePlatformSessionOrExit` + `parseArgs` + 10 command sites)**

**Task 3.1 — extend `parseArgs()` (line 145)**
```js
if (argv[i] === '--platform-override') { args.platformOverride = true; continue; }
```

**Task 3.2 — add `enforcePlatformSessionOrExit(sessionId, coordRoot, args)`**

```
if KAOLA_ENFORCE_PLATFORM_SESSION !== '1': return  // no-op
if args.platformOverride:
  writeAuditLog(coordRoot, sessionId, args)
  return
derived = derivePlatformSessionId(coordRoot)
if derived.sid === null: exit 3 with message
if derived.sid !== sessionId: exit 3 with message
```

`writeAuditLog`: append JSON line to `<coordRoot>/kaola-workflow/.audit/identity-override.log` (`mkdirSync({recursive:true})`).

**Task 3.3 — wire into 10 mutating commands**

| Function | Line | Wire-in location | Session arg |
|----------|------|-----------------|-------------|
| `cmdClaim` | 1103 | after `validateClaimArgs(args)`, before `migrateLegacyCoordState` | `args.session` |
| `cmdHeartbeat` | 1503 | after session arg assert, before `readLockFiles` | `args.session` |
| `cmdHandoff` | 1369 | after arg asserts, before `fs.mkdirSync(locksDir)` | `args.session` |
| `cmdRelease` | 1495 | after session arg assert, before `releaseSession()` | `args.session` |
| `cmdPatchBranch` | 1714 | after all asserts, before `lockPath` read | `args.session` |
| `cmdWatchPr` | 1755 | exempt (batch command without single session context) | `--platform-override` required |
| `cmdSweep` | 1634 | ticker-ancestor exemption logic | exempt if called from ticker parent |
| `cmdTicker` | 1598 | after acquirePidFile, before first `runTick` | `args.session` |
| `cmdBootstrap` | 971 | after `assertSafeSession`, before `runBootstrapSweep` | `args.session` |
| `cmdStartup` | 1021 | after `assertSafeSession`, before `runBootstrapSweep` | `args.session` |

Sweep exemption: check if `.tickers/<derived_sid>.pid` content equals `process.ppid`. If yes → ticker context → exempt.

---

### Phase 4 — Pre-Commit Hook and `owner_session_id`

**Write set: `hooks/kaola-workflow-pre-commit.sh`, `kaola-workflow-claim.js` (`updateSinkLease`/`buildLockData`)**

**Task 4.1 — pre-commit hook (line 85)**

```bash
DERIVED_SID="$(node "$GIT_ROOT/scripts/kaola-workflow-claim.js" derive-session 2>/dev/null)" || DERIVED_SID=""
if [ -z "$DERIVED_SID" ]; then
  DERIVED_SID="${KAOLA_SESSION_ID:-}"
fi
if [ "$OWNER" != "$DERIVED_SID" ]; then
  printf 'BLOCKED: cross-session commit on project "%s". Lock held by %s; current session is %s (derived).\n' \
    "$PROJECT" "$OWNER" "$DERIVED_SID" >&2
  exit 2
fi
```

Hook exits 0 if `DERIVED_SID` is empty (non-Claude tool without `KAOLA_SESSION_ID`).

**Task 4.2 — write `owner_session_id` to `## Lease` block**

In `updateSinkLease()` (line 618), add `owner_session_id: <sid>` line to `leaseBlock` array alongside `session_id`. For non-Claude runtimes: omit or set to `'unverified'`.

---

### Phase 5 — Ticker Parent-Alive Guard and Sweep Cache Hygiene

**Write set: `kaola-workflow-claim.js` (`runTick`, `cmdSweep`)**

**Task 5.1 — ticker parent-alive check in `runTick` (line 1553)**

```js
if (tickCtx.claudePid && !isPidAlive(tickCtx.claudePid)) {
  process.stderr.write('ticker: Claude ancestor PID ' + tickCtx.claudePid + ' gone; exiting gracefully\n');
  try { fs.unlinkSync(tickCtx.pidPath); } catch (_) {}
  process.exit(0);
}
```

Set `tickCtx.claudePid` during `cmdTicker` initialization via `walkToClaudePid()`.

**Task 5.2 — sweep prunes stale identity files in `cmdSweep` (line 1634)**

```js
const runtimeDir = path.join(coordRoot, 'kaola-workflow', '.runtime');
try {
  for (const f of fs.readdirSync(runtimeDir).filter(x => x.endsWith('.identity'))) {
    const pid = parseInt(f, 10);
    if (!isPidAlive(pid)) {
      try { fs.unlinkSync(path.join(runtimeDir, f)); } catch (_) {}
    }
  }
} catch (e) { if (e.code !== 'ENOENT') process.stderr.write('sweep: runtime dir error: ' + e.message + '\n'); }
```

---

### Phase 6 — Epic Case 8N (AC1–AC15)

**Write set: `scripts/simulate-workflow-walkthrough.js` (append after line 1914)**

15 sub-blocks, each with its own `mkdtempSync` temp dir. All use `KAOLA_WORKFLOW_OFFLINE: '1'`.

| AC | What is tested | Key assertion |
|----|---------------|---------------|
| AC1 | `derive-session` skip path returns correct SID | `out.sid === 'sid-ac1'`, `out.source === 'skip'` |
| AC2 | `cmdSession` exits 4 without Claude ancestor | `status === 4` |
| AC3 | enforcement exits 3 on SID mismatch | `claim` exits 3 with enforcement on |
| AC4 | `verify-startup` exits 2 on cross-session | `status === 2` |
| AC5 | `cmdSession` returns derived SID | `stdout.trim() === 'sid-ac5'` |
| AC6 | All 10 mutating commands exit 3 on mismatch | spot-check 3 commands |
| AC7 | Commands succeed with enforcement off | `claim` exits 0 without enforcement env |
| AC8 | `--platform-override` bypasses + writes audit log | exits 0; audit log contains `platform_override: true` |
| AC9 | Cache hit avoids lsof within TTL | `source === 'skip'` with pre-planted file |
| AC10 | TTL expiry deletes stale file, re-derives | stale file deleted; new SID returned |
| AC11 | PID recycling detected via start_time mismatch | stale file deleted; old SID rejected |
| AC12 | `KAOLA_KERNEL_SESSION_SKIP=1` forces skip path | `source === 'skip'` |
| AC13 | Ticker contains isPidAlive guard (structural) | `claimContent.includes('isPidAlive')` |
| AC14 | Sweep prunes dead-PID identity files | dead-PID file removed |
| AC15 | Pre-commit hook rejects wrong-session commit | hook exits 2 |

---

## Required Node.js APIs and Imports

No new `require()` in `kaola-workflow-claim.js` — `fs`, `path`, `os`, `crypto`, `child_process` already imported.

In `kaola-workflow-session-env.js`: add `require('child_process')` and `require('path')` (not currently imported).

---

## Parallelization Groups (Disjoint Write Sets)

| Group | Tasks | Notes |
|-------|-------|-------|
| A | 0.1, 0.2, 0.3 | Parallel — observation only |
| B | 1.1 (session-env.js) | Sequential after Phase 0 |
| C | 1.2, 1.3 (claim.js: derive fn + subcommand) | Sequential; same file |
| D | 2.1, 2.2 (claim.js: cmdSession, cmdVerifyStartup) | Sequential after C |
| E | 3.1, 3.2, 3.3 (claim.js: parseArgs, enforce, wire) | Sequential after D |
| F | 4.1 (pre-commit hook) | Parallel with E — different file |
| G | 4.2 (updateSinkLease owner_session_id) | Sequential after E |
| H | 5.1, 5.2 (ticker + sweep) | Sequential after G |
| I | 6 (Epic Case 8N) | After H; append-only to test file |

Groups B and F can run in parallel (different files). All claim.js groups serial.

---

## Out-of-Scope Items (Explicit)

- Linux `/proc/<pid>/fd/` parity — macOS-only for 3.3.x
- Full removal of `KAOLA_SESSION_ID` env var — deferred to 3.4.x
- Cross-machine session identity
- Cryptographic signing of identity files
- `KAOLA_KERNEL_SESSION_SKIP` for Windows
- Enforcement for `cmdWatchPr` per-lock-iteration — exempt in 3.3.x
- `cmdBootstrap` and `cmdStartup` randomUUID fallback removal — preserved (legitimately generate new session IDs for Codex)
