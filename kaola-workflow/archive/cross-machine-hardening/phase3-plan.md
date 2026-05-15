# Phase 3 - Plan: cross-machine-hardening

## Blueprint

### Files to Create

| File | Purpose | Key Interfaces |
|------|---------|----------------|
| (none) | All logic added to existing scripts — YAGNI, `claim.js` stays under 800-line ceiling | — |

### Files to Modify

| File | Changes | Why |
|------|---------|-----|
| `scripts/kaola-workflow-claim.js` | Regex bugfix; 3 new helpers (`getRepoOwnerName`, `runTiebreakerCheck`, `postReleaseComment`); `isRemoteStale` helper; `cmdTicker` subcommand; `cmdClaim` tiebreaker insert; `releaseSession` + `cmdSweep` assignee fix; `main()` dispatcher | Core protocol hardening |
| `scripts/simulate-workflow-walkthrough.js` | Epic 9 test block (9A1–9D, ~350 LOC) before line 1263 | Verify all deliverables |
| `commands/kaola-workflow-phase1.md` | Replace one-shot heartbeat (lines 26-31) with ticker invocation | Phase 1 heartbeat |
| `commands/kaola-workflow-phase2.md` | Same replacement (lines ~30-35) | Phase 2 heartbeat |
| `commands/kaola-workflow-phase3.md` | Same replacement (lines ~28-33) | Phase 3 heartbeat |
| `commands/kaola-workflow-phase4.md` | Same replacement (lines ~18-23) | Phase 4 heartbeat |
| `commands/kaola-workflow-phase5.md` | Same replacement (lines ~32-37) | Phase 5 heartbeat |
| `commands/kaola-workflow-phase6.md` | Same replacement (lines ~33-38) | Phase 6 heartbeat |
| `.gitignore` | Append `kaola-workflow/.tickers/` | Exclude ephemeral PID files |

### Build Sequence

1. P0-A: Regex bugfix at `claim.js:179` — prerequisite for all downstream tasks
2. P0-B: `getRepoOwnerName()` helper — insert after `ghExec` function
3. P0-C: `runTiebreakerCheck()` helper — insert after `getRepoOwnerName`
4. P1: `postReleaseComment()` helper; `postGitHubClaim` sentinel; `cmdClaim` tiebreaker insert + adoption stub
5. P2: `cmdTicker` subcommand (with `--interval` + `KAOLA_WORKFLOW_OFFLINE` guard)
6. P3-A: `releaseSession` `--remove-assignee` fix
7. P3-B: `isRemoteStale()` helper; `cmdSweep` remote-check + assignee + release comment
8. P3-C: `main()` dispatcher — add `ticker` case + update usage string
9. P5 (all parallel): 6× phase markdown heartbeat replacement + `.gitignore` append
10. P4: Epic 9 tests — write + validate with `node scripts/simulate-workflow-walkthrough.js`

### Parallelization Plan

| Group | Tasks | Why Safe In Parallel |
|-------|-------|----------------------|
| P0 | P0-A → P0-B → P0-C | Sequential (same file, strict order) |
| P1 | P1 | Sequential after P0 (same file) |
| P2 | P2 | Sequential after P1 (same file) |
| P3 | P3-A → P3-B → P3-C | Sequential after P2 (same file) |
| P5 | 6× phase .md + .gitignore | All 7 files disjoint — full parallelism |
| P4 | Epic 9 tests in walkthrough.js | `walkthrough.js` is independent; validates after P0–P3 done |

### External Dependencies

Zero new npm packages. Built-ins: `fs`, `child_process` (`execFileSync`, `spawnSync`), `os`, `path`, `process.kill(pid, 0)`. All already imported in `claim.js`.

---

## Task List

### Task P0-A: Regex Bugfix
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (Epic 9D covers `claim_comment_id` being populated)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: none
- Parallel Group: P0
- Action: MODIFY
- Implement: At line 179 inside `postGitHubClaim`, change `out.match(/comments\/(\d+)/)` to `out.match(/issuecomment-(\d+)/)`. `gh issue comment` stdout is `https://github.com/...#issuecomment-NNN`, not a REST API URL.
- Mirror: existing regex at line 179
- Validate: `node scripts/simulate-workflow-walkthrough.js` (existing tests must still pass)

### Task P0-B: `getRepoOwnerName` Helper
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (used indirectly by 9A1, 9C2)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P0-A
- Parallel Group: P0
- Action: MODIFY (insert after `ghExec` function, around line 30)
- Implement:
  ```js
  function getRepoOwnerName() {
    const raw = ghExec(['repo', 'view', '--json', 'owner,name']);
    if (!raw) return null;
    try { const d = JSON.parse(raw); return { owner: d.owner.login, name: d.name }; }
    catch (_) { return null; }
  }
  ```
  Returns `null` when `KAOLA_WORKFLOW_OFFLINE=1` (ghExec returns `''`). All callers treat `null` as "skip remote operations."
- Mirror: `ghExec` wrapper pattern at lines 26-29
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P0-C: `runTiebreakerCheck` Helper
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (tests 9A1, 9A2, 9A3)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P0-B
- Parallel Group: P0
- Action: MODIFY (insert after `getRepoOwnerName`)
- Implement:
  ```js
  function runTiebreakerCheck(issueNum, sessionId, commentId, root) {
    const repo = getRepoOwnerName();
    if (!repo) return 'stay';
    const sentinel = '<!-- kw:claim sess=' + sessionId + ' -->';
    const delays = [0, 250, 750];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) sleepMs(delays[i]);
      const raw = ghExec(['api', 'repos/' + repo.owner + '/' + repo.name + '/issues/' + issueNum + '/comments']);
      if (!raw) continue;
      let comments;
      try { comments = JSON.parse(raw); } catch (_) { continue; }
      const candidates = comments.filter(c => c.body && c.body.includes(sentinel));
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => a.id - b.id);
      const winner = candidates[0];
      if (String(winner.id) === String(commentId)) return 'stay';
      return { yield: true, winnerId: winner.id, winnerBody: winner.body };
    }
    return 'stay';
  }
  ```
  Note: `sleepMs` must exist or be inlined as `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)` if synchronous sleep is needed. Check existing claim.js for `sleepMs` definition; if missing, add `function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }` as Task P0-B.5.
- Mirror: bounded-retry pattern at `cmdClaim` lines 215-218
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P1: Tiebreaker Integration in `cmdClaim`
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (tests 9A1, 9A2)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P0-C
- Parallel Group: P1
- Action: MODIFY (three edits)
- Implement Part A — `postReleaseComment` helper (insert after `runTiebreakerCheck`):
  ```js
  function postReleaseComment(issueNum, sessionId, reason) {
    if (!issueNum || OFFLINE) return;
    try { ghExec(['issue', 'comment', String(issueNum), '--body', reason + ' (session: ' + sessionId + ')']); }
    catch (_) {}
  }
  ```
- Implement Part B — sentinel in `postGitHubClaim` body (modify line ~178):
  Change comment body from `'🔒 Session claimed by ' + sessionId` to:
  `'🔒 Session claimed by ' + sessionId + '\n<!-- kw:claim sess=' + sessionId + ' -->'`
- Implement Part C — tiebreaker insert in `cmdClaim` between `commentId` assignment and final lock rewrite (between lines 229-231):
  ```js
  if (!OFFLINE && args.issue != null && commentId) {
    const tbResult = runTiebreakerCheck(args.issue, args.session, commentId, root);
    if (tbResult !== 'stay' && tbResult.yield) {
      releaseSession(root, args.session, 'tiebreaker-yield');
      const winnerSid = (tbResult.winnerBody.match(/kw:claim sess=([^\s>]+)/) || [])[1] || 'unknown';
      postReleaseComment(args.issue, args.session, ':yielded → ' + winnerSid);
      // Adoption stub: push branch if one already exists at yield time
      const branchPrefix = 'workflow/issue-' + args.issue + '-';
      try {
        const branches = execFileSync('git', ['branch', '--list', branchPrefix + '*'], { encoding: 'utf8' }).trim();
        if (branches) {
          const branch = branches.split('\n')[0].trim().replace(/^\*\s*/, '');
          execFileSync('git', ['push', 'origin', branch], { encoding: 'utf8' });
        }
      } catch (_) {}
      process.exitCode = 1;
      return;
    }
  }
  ```
- Mirror: `postGitHubClaim` at lines 175-181; `releaseSession` at lines 239-260
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P2: `cmdTicker` Subcommand
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (tests 9A3, 9B1, 9B2)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P1 (requires `runTiebreakerCheck`, `releaseSession`)
- Parallel Group: P2
- Action: MODIFY (insert ~80 LOC after `cmdHeartbeat`, around line 296)
- Implement:
  ```js
  function cmdTicker() {
    if (OFFLINE) return; // no-op in offline mode
    const session = getArg('--session');
    if (!session) { console.error('ticker: --session required'); process.exit(1); }
    const intervalMs = parseInt(getArg('--interval') || '', 10) || (15 * 60 * 1000);
    const root = getRoot();
    const tickersDir = path.join(root, 'kaola-workflow', '.tickers');
    fs.mkdirSync(tickersDir, { recursive: true });
    const pidPath = path.join(tickersDir, session + '.pid');
    // Idempotency check
    if (fs.existsSync(pidPath)) {
      const existingPid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      try { process.kill(existingPid, 0); return; } // alive — exit silently
      catch (e) { if (e.code === 'ESRCH') fs.unlinkSync(pidPath); } // stale — reap
    }
    // Write own PID (O_EXCL via 'wx' flag)
    try {
      const fd = fs.openSync(pidPath, 'wx');
      fs.writeSync(fd, String(process.pid) + '\n');
      fs.closeSync(fd);
    } catch (e) { return; } // another ticker won the race
    process.on('SIGTERM', () => { try { fs.unlinkSync(pidPath); } catch (_) {} process.exit(0); });
    let tickCount = 0;
    function tick() {
      tickCount++;
      const matches = readLockFiles(root);
      const match = matches.find(l => l.session_id === session);
      if (!match) { try { fs.unlinkSync(pidPath); } catch (_) {} process.exit(0); return; }
      if (match.session_id !== session) { try { fs.unlinkSync(pidPath); } catch (_) {} process.exit(0); return; }
      const now = new Date();
      const updated = Object.assign({}, match, {
        last_heartbeat: now.toISOString(),
        expires: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
      });
      const lp = lockPath(root, match.project);
      fs.writeFileSync(lp, JSON.stringify(updated, null, 2) + '\n');
      const stateFile = path.join(root, 'kaola-workflow', match.project, 'workflow-state.md');
      if (fs.existsSync(stateFile)) updateLeaseInPlace(stateFile, updated);
      // Hourly comment edit (every 4th tick) to keep updated_at fresh for sweeper
      if (tickCount % 4 === 0 && match.claim_comment_id) {
        const repo = getRepoOwnerName();
        if (repo) {
          ghExec(['api', '--method', 'PATCH',
            'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + match.claim_comment_id,
            '-f', 'body=<!-- kw:hb ts=' + now.toISOString() + ' -->']);
        }
      }
      // Late-yield mitigation: re-check tiebreaker on tick 1
      if (tickCount === 1 && match.claim_comment_id && match.issue_number) {
        const tbResult = runTiebreakerCheck(match.issue_number, session, match.claim_comment_id, root);
        if (tbResult !== 'stay' && tbResult.yield) {
          releaseSession(root, session, 'ticker-late-yield');
          try { fs.unlinkSync(pidPath); } catch (_) {}
          process.exit(0);
          return;
        }
      }
      setTimeout(tick, intervalMs);
    }
    tick();
  }
  ```
  Note: `lockPath(root, project)` and `readLockFiles(root)` are existing helpers. Confirm their signatures before implementing.
- Mirror: `cmdHeartbeat` at lines 268-295 for lock re-read + `updateLeaseInPlace`
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P3-A: `releaseSession` Assignee Fix
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (test 9D)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P0-A
- Parallel Group: P3
- Action: MODIFY (lines 251-255)
- Implement: Replace `ghExec(['issue', 'edit', String(match.issue_number), '--remove-label', 'workflow:in-progress'])` with `ghExec(['issue', 'edit', String(match.issue_number), '--remove-label', 'workflow:in-progress', '--remove-assignee', '@me'])`
- Mirror: existing `cmdSweep` pattern
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P3-B: `isRemoteStale` Helper + `cmdSweep` Extension
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (tests 9C1, 9C2, 9D)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P3-A
- Parallel Group: P3
- Action: MODIFY (insert helper before `cmdSweep`; modify `cmdSweep` body)
- Implement `isRemoteStale(lock)`:
  ```js
  function isRemoteStale(lock) {
    if (OFFLINE || !lock.claim_comment_id || !/^\d+$/.test(String(lock.claim_comment_id))) return false;
    const repo = getRepoOwnerName();
    if (!repo) return false;
    const raw = ghExec(['api', 'repos/' + repo.owner + '/' + repo.name + '/issues/comments/' + lock.claim_comment_id]);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      return Date.now() - new Date(data.updated_at).getTime() >= 24 * 60 * 60 * 1000;
    } catch (_) { return false; }
  }
  ```
- Modify `cmdSweep`: after `if (!shouldSweep(lock)) continue;` add `if (!isRemoteStale(lock)) continue;`. After existing remove-label call, add `ghExec(['issue', 'edit', String(lock.issue_number), '--remove-assignee', '@me'])` and `postReleaseComment(lock.issue_number, lock.session_id, ':released-stale')`.
- Mirror: `shouldSweep` at lines 91-95; `cmdSweep` loop at lines 297-319
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P3-C: `main()` Dispatcher Update
- File: `scripts/kaola-workflow-claim.js`
- Test File: `scripts/simulate-workflow-walkthrough.js` (9A3, 9B1, 9B2 exercise `ticker` subcommand)
- Write Set: `scripts/kaola-workflow-claim.js`
- Depends On: P2
- Parallel Group: P3
- Action: MODIFY (lines 456-466)
- Implement: Add `if (sub === 'ticker') return cmdTicker();` between the `heartbeat` and `sweep` dispatch cases. Update usage string to include `ticker`.
- Mirror: existing `if (sub === 'heartbeat') return cmdHeartbeat();` pattern
- Validate: `node scripts/kaola-workflow-claim.js ticker --help` (should print usage, not error)

### Task P4: Epic 9 Tests in Walkthrough
- File: `scripts/simulate-workflow-walkthrough.js`
- Test File: same (self-testing)
- Write Set: `scripts/simulate-workflow-walkthrough.js`
- Depends On: P0-A, P0-B, P0-C, P1, P2, P3-A, P3-B, P3-C (all claim.js tasks)
- Parallel Group: P4
- Action: MODIFY (insert before `console.log('Workflow walkthrough simulation passed')` at line 1263)
- Implement shared setup:
  ```js
  // Epic 9: Cross-machine hardening tests
  {
    const epic9Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic9-'));
    const ghShimDir9 = path.join(epic9Tmp, 'bin');
    const epic9Work = path.join(epic9Tmp, 'work');
    const baseEnv9 = { ...process.env, HOME: epic9Tmp, PATH: ghShimDir9 + path.delimiter + process.env.PATH };
    // NOTE: no KAOLA_WORKFLOW_OFFLINE — tests must reach gh shim
    try {
      fs.mkdirSync(ghShimDir9, { recursive: true });
      // ... scaffold work dir as git repo with kaola-workflow structure ...
      // Each sub-test writes its own gh shim to ghShimDir9 + '/gh' and sets chmod +x
      // ... 8 sub-tests (9A1, 9A2, 9A3, 9B1, 9B2, 9C1, 9C2, 9D) ...
    } finally {
      fs.rmSync(epic9Tmp, { recursive: true, force: true });
    }
  }
  ```
  Each sub-test uses `spawnSync('node', ['scripts/kaola-workflow-claim.js', ...], { env: baseEnv9, cwd: root })` and checks `.status` and `.stdout`/`.stderr`.
  Test 9A3 spawns ticker with `--interval 1` and waits 2s for it to self-terminate.
  Test setup for each sub-test that uses `getMachineId()`: `HOME: epic9Tmp` isolates machine-id to temp dir.
- Mirror: Epic 8 (`walkthrough.js:1055-1261`) for spawnSync; Epic 7 (`walkthrough.js:806-1053`) for git scaffold + gh shim log file
- Validate: `node scripts/simulate-workflow-walkthrough.js` — exits 0, prints `Workflow walkthrough simulation passed`

### Task P5a–f: Phase Markdown Heartbeat Replacement (parallel)
- Files: all 6 `commands/kaola-workflow-phase{1-6}.md`
- Write Set: each file independently disjoint
- Depends On: P2 (ticker subcommand must exist)
- Parallel Group: P5
- Action: MODIFY each
- Find the existing heartbeat block (one-shot `heartbeat --session` call) and replace with:
  ```bash
  [ -n "${KAOLA_SESSION_ID:-}" ] && {
    _TICKER_PID_FILE="$(git rev-parse --show-toplevel)/kaola-workflow/.tickers/${KAOLA_SESSION_ID}.pid"
    if [ ! -f "$_TICKER_PID_FILE" ]; then
      nohup node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" ticker \
        --session "$KAOLA_SESSION_ID" >/dev/null 2>&1 &
      disown
    fi
  }
  ```
- Mirror: existing heartbeat block in each file
- Validate: `node scripts/simulate-workflow-walkthrough.js`

### Task P5g: `.gitignore` Update
- File: `.gitignore`
- Write Set: `.gitignore`
- Depends On: none
- Parallel Group: P5
- Action: MODIFY (append)
- Implement: Add `kaola-workflow/.tickers/` to `.gitignore`
- Validate: `git check-ignore -v kaola-workflow/.tickers/some.pid` → should report gitignore match

---

## Advisor Notes

From `.cache/advisor-plan.md`:

**Build sequence**: Confirmed dependency-safe. P0→P1→P2→P3 sequential lane correct.

**Two clarifications folded into plan**:
1. `cmdTicker` must accept `--interval` parameter (override in ms for tests). Test 9A3 requires `--interval 1`.
2. `cmdTicker` must check `KAOLA_WORKFLOW_OFFLINE` and return early (no-op). Without this, `OFFLINE=1` tests would unexpectedly start a ticker.

**`sleepMs` dependency**: Verify `sleepMs` exists in `claim.js`. If not, add `function sleepMs(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }` as part of P0-C.

**Ticker test setup**: Test 9A3 requires valid lock file + `HOME: epic9Tmp` for `getMachineId()`. Include in P4 sub-test setup.

**No architect revision required.** Plan is implementation-ready.

---

## Required Agent Compliance

| Requirement | Status | Evidence | Skip Reason |
|-------------|--------|----------|-------------|
| code-architect | invoked | .cache/architect.md | |
| advisor plan gate | invoked | .cache/advisor-plan.md | |
| architect revisions | N/A | — | Advisor found no blueprint gaps requiring revision |
