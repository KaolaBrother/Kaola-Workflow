# Phase 3 - Plan: issue-31

## Blueprint

### Files to Create
| File | Purpose | Key Interfaces |
|------|---------|----------------|
| *(none)* | `derive-session` subcommand lives in `kaola-workflow-claim.js`; no standalone helper file | — |

### Files to Modify
| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-session-env.js` | Add `require('child_process')`, `require('path')`; write O_EXCL identity file in `main()` after line 36 | Warm-cache writer for identity file at SessionStart |
| `scripts/kaola-workflow-claim.js` | Add `walkToClaudePid()`, `readClaudeStartTimeMs()`, `lsofDeriveSessionId()`, `writeIdentityFile()`, `derivePlatformSessionId()`, `enforcePlatformSessionOrExit()`, `writeAuditLog()`, `cmdDeriveSession()`; refactor `cmdSession()`, `cmdVerifyStartup()`; wire enforcement into 10 commands; update `parseArgs()`, `runTick()`, `cmdSweep()` | Core identity derivation and enforcement |
| `hooks/kaola-workflow-pre-commit.sh` | Replace `$KAOLA_SESSION_ID` env comparison with `node scripts/kaola-workflow-claim.js derive-session` call | Derive SID from kernel, not self-asserted env |
| `scripts/simulate-workflow-walkthrough.js` | Add Epic Case 8N block (AC1–AC15) after line 1914 | Test coverage for all ACs |

### Build Sequence
1. **Phase 0 (BLOCKER — empirical only, no code)**: Verify hook PID coherence, JSONL handle persistence, lsof same-uid. Document `comm` string from `ps` for `walkToClaudePid`. **Phase 0.2 must pass before any code begins.**
2. **Phase 1A** (session-env.js): Identity file write at SessionStart
3. **Phase 1B** (claim.js): Add `walkToClaudePid`, `readClaudeStartTimeMs`, `writeIdentityFile`, `derivePlatformSessionId`, `cmdDeriveSession` (no `lsofDeriveSessionId` — dropped per Phase 0.2 empirical finding)
4. **Phase 2** (claim.js): Refactor `cmdSession`, `cmdVerifyStartup`
5. **Phase 3** (claim.js): Add `enforcePlatformSessionOrExit`, `writeAuditLog`; extend `parseArgs`; wire 10 commands
6. **Phase 4A** (pre-commit hook): Replace env comparison with derive-session call
7. **Phase 4B** (claim.js): Add `owner_session_id` to `updateSinkLease`
8. **Phase 5** (claim.js): Ticker parent-alive guard in `runTick`; sweep stale identity pruning
9. **Phase 6** (simulate-workflow-walkthrough.js): Epic Case 8N (AC1–AC15)

Steps 3 and 4A can run in parallel (different files). All other claim.js phases are serial.

### Parallelization Plan
| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| A | Phase 1A (session-env.js), Phase 4A (pre-commit hook) | Disjoint files |
| serial | All claim.js phases (1B→2→3→4B→5) | Same file, sequential dependency |

### External Dependencies
None. All APIs are Node.js built-ins (`fs`, `path`, `os`, `child_process`, `crypto`) already imported in `kaola-workflow-claim.js`. `kaola-workflow-session-env.js` needs `require('child_process')` and `require('path')` added.

---

## Task List

### Task 0: Phase 0 Empirical Verification (BLOCKER)
- File: no code changes
- Write Set: documentation only
- Depends On: nothing
- Parallel Group: serial (prerequisite)
- Action: VERIFY
- Implement:
  - **0.1 PID coherence**: From bash under Claude, run `node -e "const {execFileSync}=require('child_process'); const b=process.ppid; const c=parseInt(execFileSync('ps',['-o','ppid=','-p',String(b)],{encoding:'utf8'}).trim(),10); console.log({bashPid:b,claudePid:c})"` — verify the claudePid matches what the hook would write.
    - **0.2 JSONL handle**: ❌ CRITICAL FAILURE — 60-second multi-sample (6 × 10s) showed zero `.jsonl` handles in `lsof -p <claude_pid> -F pfn` at all sample points. Claude writes transiently; does not hold JSONL open. **Design pivoted to identity-file-only** (no lsof). See `.cache/phase0-empirical.md`.
  - **0.3 lsof same-uid**: N/A (moot after Phase 0.2 failure).
  - **comm string**: Confirmed `comm` contains `claude` substring — `walkToClaudePid` heuristic is valid.
- Validate: Phase 0.2 failed; pivot documented. Implementation may proceed against identity-file-only design.

### Task 1.1: session-env.js Identity File Write
- File: `scripts/kaola-workflow-session-env.js`
- Write Set: `scripts/kaola-workflow-session-env.js`
- Depends On: Task 0
- Parallel Group: A (parallel with Task 4.1)
- Action: MODIFY
- Implement:
  - Add `const { execFileSync } = require('child_process');` and `const path = require('path');` at top.
  - In `main()`, after the existing `fs.appendFileSync` call (line 36):
    ```js
    try {
      const bashPid = process.ppid;
      const claudePid = parseInt(execFileSync('ps', ['-o', 'ppid=', '-p', String(bashPid)], {encoding:'utf8'}).trim(), 10);
      const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {cwd: process.env.GIT_ROOT || process.cwd(), encoding:'utf8'}).trim();
      const coordRoot = path.resolve(process.env.GIT_ROOT || process.cwd(), gitCommonDir);
      const runtimeDir = path.join(coordRoot, 'kaola-workflow', '.runtime');
      fs.mkdirSync(runtimeDir, { recursive: true });
      const identityPath = path.join(runtimeDir, claudePid + '.identity');
      const startTimeStr = execFileSync('ps', ['-o', 'lstart=', '-p', String(claudePid)], {encoding:'utf8'}).trim();
      const startTimeMs = Date.parse(startTimeStr);
      const identityData = JSON.stringify({ sid: process.env.KAOLA_SESSION_ID || '', claude_pid: claudePid, claude_start_time_ms: startTimeMs, runtime: 'claude', written_at: Date.now() }) + '\n';
      const fd = fs.openSync(identityPath, 'wx', 0o600);
      fs.writeSync(fd, identityData);
      fs.closeSync(fd);
    } catch (_) { /* silently skip if coordRoot missing or O_EXCL fails */ }
    ```
- Validate: `KAOLA_SESSION_ID=test-sid node scripts/kaola-workflow-session-env.js` → identity file created at `$(git rev-parse --git-common-dir)/kaola-workflow/.runtime/<claude_pid>.identity`

### Task 1.2: claim.js — Core Derivation Functions
- File: `scripts/kaola-workflow-claim.js`
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: Task 0
- Parallel Group: serial
- Action: MODIFY
- Implement (insert after `currentSessionId()` at line 172):

  **`walkToClaudePid()`** — Two-hop ps walk, 5-hop limit:
  ```js
  function walkToClaudePid() {
    let pid = process.ppid;
    for (let i = 0; i < 5; i++) {
      try {
        const out = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], {encoding:'utf8'}).trim();
        const [ppidStr, ...commParts] = out.split(/\s+/);
        const comm = commParts.join(' ');
        if (/claude/i.test(comm)) return pid;
        pid = parseInt(ppidStr, 10);
        if (!pid || pid === 1) return null;
      } catch (_) { return null; }
    }
    return null;
  }
  ```

  **`readClaudeStartTimeMs(pid)`**:
  ```js
  function readClaudeStartTimeMs(pid) {
    try {
      const s = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {encoding:'utf8'}).trim();
      return Date.parse(s);
    } catch (_) { return NaN; }
  }
  ```

  **`writeIdentityFile(identityPath, data)`** (mirrors `writeLockFile` at line 661; `lsofDeriveSessionId` dropped — Phase 0.2 proved lsof cannot see JSONL):
  ```js
  function writeIdentityFile(identityPath, data) {
    try {
      fs.mkdirSync(path.dirname(identityPath), { recursive: true });
      const content = JSON.stringify(data) + '\n';
      const fd = fs.openSync(identityPath, 'wx', 0o600);
      fs.writeSync(fd, content);
      fs.closeSync(fd);
    } catch (_) { /* silently skip race conditions */ }
  }
  ```

  **`derivePlatformSessionId(coordRoot, options = {})`** — identity-file-only, must never throw:
  ```js
  function derivePlatformSessionId(coordRoot, options = {}) {
    if (process.env.KAOLA_KERNEL_SESSION_SKIP === '1') {
      return { sid: envSessionId() || null, source: 'skip' };
    }
    // FAKE_PID: test-only override of walkToClaudePid return value (not lsof bypass)
    const fakePid = process.env.KAOLA_KERNEL_SESSION_FAKE_PID ? parseInt(process.env.KAOLA_KERNEL_SESSION_FAKE_PID, 10) : null;
    const claudePid = fakePid || walkToClaudePid();
    if (!claudePid) return { sid: null, source: null };
    const identityPath = path.join(coordRoot, 'kaola-workflow', '.runtime', claudePid + '.identity');
    try {
      const raw = fs.readFileSync(identityPath, 'utf8');
      const data = JSON.parse(raw);
      if (!isPidAlive(claudePid)) {
        try { fs.unlinkSync(identityPath); } catch (_) {}
        return { sid: null, source: null };
      }
      const currentStart = execFileSync('ps', ['-o', 'lstart=', '-p', String(claudePid)], {encoding:'utf8'}).trim();
      if (data.claude_start_time_ms !== Date.parse(currentStart)) {
        try { fs.unlinkSync(identityPath); } catch (_) {}
        return { sid: null, source: null };
      }
      return { sid: data.sid, source: 'file' };
    } catch (e) {
      if (e.code !== 'ENOENT') { /* parse/ps error — treat as missing */ }
      return { sid: null, source: null };
    }
  }
  ```

  Note: `KAOLA_KERNEL_SESSION_FAKE_PID` is a test-only hook that overrides `walkToClaudePid()` return value. This enables AC10 (dead PID liveness) and AC11 (start_time mismatch) to exercise the identity file path in tests without a real Claude ancestor. No lsof anywhere.

### Task 1.3: claim.js — derive-session Subcommand
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 1.2
- Parallel Group: serial
- Action: MODIFY
- Implement: Add `cmdDeriveSession()` function and wire in `main()`:
  ```js
  function cmdDeriveSession() {
    const coordRoot = getCoordRoot();
    const result = derivePlatformSessionId(coordRoot);
    if (result.sid === null) {
      if (args.json) process.stdout.write(JSON.stringify({ sid: null, source: result.source }) + '\n');
      process.exit(4);
    }
    if (args.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else {
      process.stdout.write(result.sid + '\n');
    }
  }
  ```
  Wire in `main()` after line 1830: `if (sub === 'derive-session') return cmdDeriveSession();`
  Update usage string on line 1816 to include `derive-session`.
- Validate: `KAOLA_KERNEL_SESSION_SKIP=1 KAOLA_SESSION_ID=test node scripts/kaola-workflow-claim.js derive-session --json` → `{"sid":"test","source":"skip","cached":false}` exit 0

### Task 2.1: claim.js — Refactor cmdSession()
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 1.2
- Parallel Group: serial
- Action: MODIFY
- Implement at line 412: Replace `currentSessionId(args)` call with:
  ```js
  const coordRoot = getCoordRoot();
  const derived = derivePlatformSessionId(coordRoot);
  if (derived.sid === null) {
    if (!process.env.KAOLA_KERNEL_SESSION_SKIP) process.exit(4);
    // skip path: derived.sid was already set to envSessionId() in derivePlatformSessionId
  }
  const sid = derived.sid;
  // (existing project-match logic unchanged, using sid)
  ```
  Remove `crypto.randomUUID()` fallback from `cmdSession` path entirely. UUID fallback in `currentSessionId()` at line 167 remains for other callers (`cmdBootstrap`, `cmdStartup`).
- Validate: Running `node scripts/kaola-workflow-claim.js session` outside a Claude ancestor (no SKIP) exits 4.

### Task 2.2: claim.js — Refactor cmdVerifyStartup()
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 1.2
- Parallel Group: serial
- Action: MODIFY
- Implement at line 380: Add identity check before existing receipt logic:
  ```js
  const coordRoot = getCoordRoot();
  const derived = derivePlatformSessionId(coordRoot);
  // SKIP is handled inside derivePlatformSessionId via envSessionId()
  if (derived.sid === null) {
    process.stdout.write(JSON.stringify({ authorized: false, reason: 'no Claude ancestor' }) + '\n');
    process.exit(4);
  }
  if (derived.sid !== args.session) {
    process.stdout.write(JSON.stringify({ authorized: false, session: args.session, caller_sid: derived.sid, reason: 'caller platform session does not match claimed session' }) + '\n');
    process.exit(2);
  }
  // existing receipt-authorization logic proceeds here
  ```
  Note: No special "if SKIP: use args.session" branch — `derivePlatformSessionId` handles SKIP uniformly via `envSessionId()`.
- Validate: `KAOLA_KERNEL_SESSION_SKIP=1 KAOLA_SESSION_ID=impostor node scripts/kaola-workflow-claim.js verify-startup --session true-owner --project p` → exits 2.

### Task 3.1: claim.js — parseArgs Extension
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 2.2
- Parallel Group: serial
- Action: MODIFY
- Implement: In `parseArgs()` at line 145, add:
  ```js
  if (argv[i] === '--platform-override') { args.platformOverride = true; continue; }
  if (argv[i] === '--json') { args.json = true; continue; }
  ```

### Task 3.2: claim.js — enforcePlatformSessionOrExit and writeAuditLog
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 3.1
- Parallel Group: serial
- Action: MODIFY
- Implement (insert after `writeIdentityFile`):
  ```js
  function writeAuditLog(coordRoot, sessionId, cmdName) {
    const auditDir = path.join(coordRoot, 'kaola-workflow', '.audit');
    const auditPath = path.join(auditDir, 'identity-override.log');
    try {
      fs.mkdirSync(auditDir, { recursive: true });
      const entry = JSON.stringify({ ts: new Date().toISOString(), invoker_sid: sessionId, cmd: cmdName, platform_override: true }) + '\n';
      fs.appendFileSync(auditPath, entry, { mode: 0o600 });
    } catch (_) {}
  }

  function enforcePlatformSessionOrExit(sessionId, coordRoot, args) {
    if (process.env.KAOLA_ENFORCE_PLATFORM_SESSION !== '1') return;
    if (args.platformOverride) {
      writeAuditLog(coordRoot, sessionId, process.argv[2]);
      return;
    }
    const derived = derivePlatformSessionId(coordRoot);
    if (derived.sid === null) {
      process.stderr.write('identity: no Claude ancestor; use --platform-override for non-Claude callers\n');
      process.exit(3);
    }
    if (derived.sid !== sessionId) {
      process.stderr.write('identity: SID mismatch: lock.session_id=' + sessionId + ' derived=' + derived.sid + '\n');
      process.exit(3);
    }
  }
  ```

### Task 3.3: claim.js — Wire Enforcement into 10 Mutating Commands
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 3.2
- Parallel Group: serial
- Action: MODIFY
- Implement: Add `enforcePlatformSessionOrExit(args.session, coordRoot, args)` call at each site:

  | Function | Line | Wire-in location |
  |----------|------|-----------------|
  | `cmdClaim` | 1103 | after `validateClaimArgs(args)`, before `migrateLegacyCoordState` |
  | `cmdHeartbeat` | 1503 | after session arg assert, before `readLockFiles` |
  | `cmdHandoff` | 1369 | after arg asserts, before `fs.mkdirSync(locksDir)` |
  | `cmdRelease` | 1495 | after session arg assert, before `releaseSession()` |
  | `cmdPatchBranch` | 1714 | after all asserts, before `lockPath` read |
  | `cmdTicker` | 1598 | after acquirePidFile, before first `runTick` |
  | `cmdBootstrap` | 971 | exempt when `KAOLA_KERNEL_SESSION_SKIP=1` (Codex context) |
  | `cmdStartup` | 1021 | exempt when `KAOLA_KERNEL_SESSION_SKIP=1` (Codex context) |
  | `cmdSweep` | 1634 | requires `--platform-override` for non-Claude callers (no ticker-exemption logic) |
  | `cmdWatchPr` | 1755 | requires `--platform-override` for non-Claude callers |

  Bootstrap/startup exemption: wrap enforcement call with `if (!process.env.KAOLA_KERNEL_SESSION_SKIP) enforcePlatformSessionOrExit(args.session, coordRoot, args)`. This exempts Codex-runtime bootstrap from enforcement. Document that `KAOLA_ENFORCE_PLATFORM_SESSION=1` is incompatible with Codex-runtime bootstrap.

### Task 4.1: Pre-Commit Hook — Replace Env Comparison
- File: `hooks/kaola-workflow-pre-commit.sh`
- Write Set: `hooks/kaola-workflow-pre-commit.sh`
- Depends On: Task 1.3
- Parallel Group: A (parallel with Task 1.1 on session-env.js)
- Action: MODIFY
- Implement: Replace the `$KAOLA_SESSION_ID` comparison block (around line 85):
  ```bash
  DERIVED_SID="$(node "$GIT_ROOT/scripts/kaola-workflow-claim.js" derive-session 2>/dev/null)" || DERIVED_SID=""
  if [ -z "$DERIVED_SID" ]; then
    DERIVED_SID="${KAOLA_SESSION_ID:-}"
  fi
  if [ -n "$DERIVED_SID" ] && [ "$OWNER" != "$DERIVED_SID" ]; then
    printf 'BLOCKED: cross-session commit on project "%s". Lock held by %s; current session is %s (derived).\n' \
      "$PROJECT" "$OWNER" "$DERIVED_SID" >&2
    exit 2
  fi
  ```
  Hook exits 0 if `DERIVED_SID` is empty (non-Claude tool without KAOLA_SESSION_ID set).
- Validate: Pre-commit hook with `KAOLA_SESSION_ID=impostor KAOLA_KERNEL_SESSION_SKIP=1` against a lock owned by `true-owner` → exits 2.

### Task 4.2: claim.js — owner_session_id in Lease Block
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 3.3
- Parallel Group: serial
- Action: MODIFY
- Implement: In `updateSinkLease()` at line 618, add `owner_session_id` to the lease block:
  ```js
  // After writing session_id line, add:
  'owner_session_id: ' + (lockData.owner_session_id || 'unverified'),
  ```
  In `buildLockData()` at line 731, add `owner_session_id` field: derive from `derivePlatformSessionId` result in `cmdClaim`, or `'unverified'` for non-Claude callers. Existing leases without `owner_session_id` are treated as "legacy lease" — pre-commit hook must not block on missing field.
- Validate: After `cmdClaim`, `## Lease` block in `workflow-state.md` contains `owner_session_id:` line.

### Task 5.1: claim.js — Ticker Parent-Alive Guard
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 4.2
- Parallel Group: serial
- Action: MODIFY
- Implement: In `cmdTicker()`, after acquirePidFile and before first `runTick`:
  ```js
  tickCtx.claudePid = walkToClaudePid();  // null if not under Claude
  ```
  At the start of `runTick` (line 1553):
  ```js
  if (tickCtx.claudePid && !isPidAlive(tickCtx.claudePid)) {
    process.stderr.write('ticker: Claude ancestor PID ' + tickCtx.claudePid + ' gone; exiting gracefully\n');
    try { fs.unlinkSync(tickCtx.pidPath); } catch (_) {}
    process.exit(0);
  }
  ```
- Validate: Structural check — `claimContent.includes('isPidAlive')` and `claimContent.includes('claudePid')`.

### Task 5.2: claim.js — Sweep Stale Identity Pruning
- File: `scripts/kaola-workflow-claim.js`
- Depends On: Task 5.1
- Parallel Group: serial
- Action: MODIFY
- Implement: In `cmdSweep()` at line 1634, after existing lock-file loop and before `git worktree prune`:
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
- Validate: Create identity file for dead PID 99999999; run sweep; file is deleted.

### Task 6: simulate-workflow-walkthrough.js — Epic Case 8N
- File: `scripts/simulate-workflow-walkthrough.js`
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: All Tasks 0–5
- Parallel Group: serial (append-only)
- Action: MODIFY
- Mirror: Epic Cases 8K (line 1720) and 8M (line 1881) for structure; insert after line 1914
- Test environment: all sub-blocks use `KAOLA_WORKFLOW_OFFLINE: '1'`, fresh `mkdtempSync` temp dirs

**AC1 — derive-session skip path**
```js
const r = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sid-ac1'}
});
assert(r.status === 0, 'AC1: exit 0');
const out = JSON.parse(r.stdout.trim());
assert(out.sid === 'sid-ac1', 'AC1: SID matches env');
assert(out.source === 'skip', 'AC1: source is skip');
```

**AC2 — cmdSession exits 4 without Claude ancestor**
```js
const r = spawnSync(process.execPath, [claimScript, 'session'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1'}  // no SKIP, no real ancestor
});
assert(r.status === 4, 'AC2: exit 4 without Claude ancestor');
```

**AC3 — enforcement exits 3 on SID mismatch**
```js
// SKIP=1, KAOLA_SESSION_ID=sid-derived, --session sess-claimed (mismatch)
const r = spawnSync(process.execPath, [claimScript, 'claim', '--session','sess-claimed','--project','proj-ac3'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_ENFORCE_PLATFORM_SESSION:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sid-derived'}
});
assert(r.status === 3, 'AC3: exit 3 on SID mismatch under enforcement');
```

**AC4 — verify-startup blocks cross-session caller**
```js
// Write receipt for 'sess-true-owner'; call with KAOLA_SESSION_ID=sess-impostor → derived != --session
const r = spawnSync(process.execPath, [claimScript, 'verify-startup', '--session','sess-true-owner','--project','proj-ac4'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sess-impostor'}
});
assert(r.status === 2, 'AC4: exit 2 on cross-session verify-startup');
```

**AC5 — cmdSession returns derived SID**
```js
const r = spawnSync(process.execPath, [claimScript, 'session'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sid-ac5'}
});
assert(r.status === 0, 'AC5: exit 0');
assert(r.stdout.trim() === 'sid-ac5', 'AC5: returns derived SID');
```

**AC6 — all mutating commands exit 3 on mismatch (spot-check 3)**
```js
for (const [sub, extra] of [['heartbeat',['--session','sess-other']], ['release',['--session','sess-other']], ['claim',['--session','sess-other','--project','proj-ac6']]]) {
  const r = spawnSync(process.execPath, [claimScript, sub, ...extra], {
    encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_ENFORCE_PLATFORM_SESSION:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sid-derived'}
  });
  assert(r.status === 3, 'AC6: ' + sub + ' exits 3 on SID mismatch');
}
```

**AC7 — enforcement off: commands succeed (backward compat)**
```js
const r = spawnSync(process.execPath, [claimScript, 'claim', '--session','sess-ac7','--project','proj-ac7'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1'}  // no enforcement
});
assert(r.status === 0, 'AC7: claim succeeds with enforcement off');
```

**AC8 — --platform-override bypasses enforcement, writes audit log**
```js
const r = spawnSync(process.execPath, [claimScript, 'claim', '--session','sess-ac8','--project','proj-ac8','--platform-override'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_ENFORCE_PLATFORM_SESSION:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sid-different'}
});
assert(r.status === 0, 'AC8: --platform-override bypasses enforcement');
const auditPath = path.join(tmp, 'kaola-workflow', '.audit', 'identity-override.log');
assert(fs.existsSync(auditPath), 'AC8: audit log created');
const entry = JSON.parse(fs.readFileSync(auditPath,'utf8').trim().split('\n')[0]);
assert(entry.platform_override === true, 'AC8: audit marks platform_override=true');
assert(entry.cmd === 'claim', 'AC8: audit records cmd');
```

**AC9 — no Claude ancestor under enforcement exits 3**
```js
// No FAKE_PID, no SKIP → walkToClaudePid returns null in test env → derivePlatformSessionId returns null
// Under enforcement, null SID → exit 3
const r = spawnSync(process.execPath, [claimScript, 'claim', '--session','sess-ac9','--project','proj-ac9'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_ENFORCE_PLATFORM_SESSION:'1'}
  // No FAKE_PID, no SKIP
});
assert(r.status === 3, 'AC9: no Claude ancestor under enforcement exits 3');
```

**AC10 — dead PID identity file is deleted, returns null SID (via FAKE_PID)**
```js
// Plant identity file for dead PID 99999999; FAKE_PID makes walkToClaudePid return it
// isPidAlive(99999999) → false → file deleted, null SID returned
const deadPid = 99999999;
const runtimeDir = path.join(tmp, 'kaola-workflow', '.runtime');
fs.mkdirSync(runtimeDir, {recursive:true});
const deadIdentityPath = path.join(runtimeDir, deadPid + '.identity');
fs.writeFileSync(deadIdentityPath, JSON.stringify({sid:'sid-dead', claude_pid:deadPid, claude_start_time_ms:Date.now(), written_at:Date.now()}) + '\n', {mode:0o600});
const r10 = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_KERNEL_SESSION_FAKE_PID:String(deadPid)}
});
assert(!fs.existsSync(deadIdentityPath), 'AC10: dead-PID identity file deleted');
assert(r10.status === 4 || JSON.parse(r10.stdout.trim() || '{"sid":null}').sid === null, 'AC10: dead-PID returns null SID');
```

**AC11 — PID recycling detected via start_time mismatch (via FAKE_PID)**
```js
// Plant identity with start_time=1000 (epoch 1970, guaranteed mismatch with real ps lstart= for any live process)
const fakePid = process.pid;  // alive PID whose real start_time != 1000
const runtimeDir = path.join(tmp, 'kaola-workflow', '.runtime');
fs.mkdirSync(runtimeDir, {recursive:true});
const recycledPath = path.join(runtimeDir, fakePid + '.identity');
fs.writeFileSync(recycledPath, JSON.stringify({sid:'sid-recycled', claude_pid:fakePid, claude_start_time_ms:1000, runtime:'claude', written_at:Date.now()}) + '\n', {mode:0o600});
const r11 = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_KERNEL_SESSION_FAKE_PID:String(fakePid)}
});
assert(!fs.existsSync(recycledPath), 'AC11: start_time mismatch deletes recycled identity file');
```

**AC12 — KAOLA_KERNEL_SESSION_SKIP=1 produces source=skip**
```js
const r = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1', KAOLA_KERNEL_SESSION_SKIP:'1', KAOLA_SESSION_ID:'sid-skip'}
});
assert(r.status === 0, 'AC12: exit 0');
const out = JSON.parse(r.stdout.trim());
assert(out.source === 'skip', 'AC12: source is skip under SKIP=1');
```

**AC13 — Ticker contains isPidAlive guard (structural)**
```js
const claimContent = fs.readFileSync(path.join(root, 'scripts', 'kaola-workflow-claim.js'), 'utf8');
assert(claimContent.includes('isPidAlive') && claimContent.includes('claudePid'),
  'AC13: runTick must contain isPidAlive(tickCtx.claudePid) guard');
```

**AC14 — Sweep prunes dead-PID identity files**
```js
const runtimeDir = path.join(tmp, 'kaola-workflow', '.runtime');
fs.mkdirSync(runtimeDir, {recursive:true});
const deadFile = path.join(runtimeDir, '99999999.identity');
fs.writeFileSync(deadFile, JSON.stringify({sid:'sid-dead', claude_pid:99999999, claude_start_time_ms:Date.now(), written_at:Date.now()}) + '\n');
spawnSync(process.execPath, [claimScript, 'sweep'], {
  encoding:'utf8', env: {...process.env, HOME:tmp, KAOLA_WORKFLOW_OFFLINE:'1'}
});
assert(!fs.existsSync(deadFile), 'AC14: sweep removes dead-PID identity file');
```

**AC15 — Pre-commit hook blocks wrong-session commit**
```js
// git init; write lock for 'sess-real-owner'; stage file under kaola-workflow/proj/
// Run hook with KAOLA_SESSION_ID=sess-impostor, KAOLA_KERNEL_SESSION_SKIP=1 → exits 2
// (see architect.md for full setup)
assert(hookResult.status === 2, 'AC15: pre-commit hook blocks cross-session commit');
```

- Validate: `node scripts/simulate-workflow-walkthrough.js` exits 0 with "Workflow walkthrough simulation passed"

---

## Advisor Notes

### Phase 0.2 Empirical Pivot (Post-Plan Correction)

Phase 0.2 proved Claude does NOT keep JSONL open as persistent FD (60s multi-sample, all empty). The entire lsof-as-truth-source design was invalidated. The plan was updated in-place:
- `lsofDeriveSessionId()` dropped; all lsof calls removed
- 60s TTL removed; replaced by PID liveness (`isPidAlive`) + start_time match
- `derivePlatformSessionId` simplified to identity-file-only path
- AC9 repurposed: tests enforcement under no-ancestor condition
- AC10 repurposed: tests dead-PID liveness rejection (FAKE_PID points to PID 99999999)
- AC11 unchanged: start_time mismatch still detected (FAKE_PID points to live process, file has wrong start_time=1000)
- `KAOLA_KERNEL_SESSION_FAKE_PID` retained: controls `walkToClaudePid()` return value for test purposes; purpose is now "PID injection for file-path tests", not "lsof bypass"
- Evidence: `.cache/phase0-empirical.md`

Threat model gap documented: identity file is forgeable by a model with shell access. Addressed in future issue.

### Phase 3 Advisor Corrections (Original)

The advisor made the following corrections applied directly in this plan:

1. **Runtime path locked**: `<coordRoot>/kaola-workflow/.runtime/` and `<coordRoot>/kaola-workflow/.audit/` — consistent with `.tickers/` in existing infrastructure.

2. **AC9 and AC11 rewritten with `KAOLA_KERNEL_SESSION_FAKE_PID`**: Added test-only hook so cache-hit and recycle-detection code is actually exercised. Tests will fail if the cache or mismatch logic is missing.

3. **cmdVerifyStartup SKIP semantics corrected**: Removed contradictory "use args.session under SKIP" step. `derivePlatformSessionId` handles SKIP uniformly via `envSessionId()`. No special branch in cmdVerifyStartup.

4. **Standalone `kaola-workflow-derive-session.js` dropped**: Pre-commit hook calls `node scripts/kaola-workflow-claim.js derive-session` directly.

5. **Ticker-exemption for sweep dropped**: Sweep callers outside Claude use `--platform-override`.

6. **Bootstrap/startup exemption documented**: Enforcement skipped when `KAOLA_KERNEL_SESSION_SKIP=1` (Codex context). `KAOLA_ENFORCE_PLATFORM_SESSION=1` incompatible with Codex-runtime bootstrap.

7. **owner_session_id migration**: Absent field treated as "legacy lease"; pre-commit hook does not block on missing field.

8. **`walkToClaudePid` comm validation**: Phase 0.1 must document exact `comm` string and confirm substring match. Fallback if truncated: scan ancestors for the one holding an open JSONL.

---

## Required Agent Compliance
| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor corrections applied inline per advisor instruction; no structural revision loop needed |
