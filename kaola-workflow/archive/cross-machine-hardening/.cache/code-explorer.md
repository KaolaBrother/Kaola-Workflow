# Code Explorer: cross-machine-hardening

## Entry Points

- `cmdClaim` at `scripts/kaola-workflow-claim.js:183` — triggered via `node kaola-workflow-claim.js claim`
- `cmdSweep` at `claim.js:297` — triggered at `/workflow-next` startup (Step 0)
- `cmdHeartbeat` at `claim.js:268` — triggered one-shot at top of every phase command
- `cmdRelease` at `claim.js:262` — triggered from `workflow-next.md` on yield, from `watch-pr` on MERGED/CLOSED

## Claim Flow (full path, file:line)

1. `claim.js:184-192` — parse/validate args
2. `claim.js:194` — `getRoot()` via git
3. `claim.js:195` — `getMachineId()` reads/creates `~/.config/kaola-workflow/machine-id` (UUID, persisted)
4. `claim.js:198` — `fs.mkdirSync(locksDir(root), { recursive: true })`
5. `claim.js:200-213` — build `lockData` object: `{ project, session_id, machine_id, claimed_at, expires=+30min, last_heartbeat, issue_number, claim_comment_id: null, sink, pr_url: null, pr_number: null }`
6. `claim.js:215-218` — **local lock write**: `writeLockFile(lp, lockData)` with O_EXCL. 3×50ms retries; `exitCode=2` on EEXIST. **No cross-machine awareness.**
7. `claim.js:220` — `writeSessionFile()` writes `kaola-workflow/.sessions/{session_id}.json`
8. `claim.js:222-224` — skip gh if OFFLINE or no issue; else call `postGitHubClaim()`
9. `postGitHubClaim` at `claim.js:175-181`: `gh issue edit N --add-label --add-assignee`, `gh issue comment N --body '🔒 Session claimed by {sessionId}'`. Comment ID from `out.match(/comments\/(\d+)/)`. **Current claim body: `'🔒 Session claimed by ' + sessionId`**
10. **No re-read-after-write. Tiebreaker insert point: between steps 9 and 10.**
11. `claim.js:227-233` — re-write lock with `claim_comment_id` populated
12. `claim.js:235-236` — `updateSinkLease(stateFile, finalLock)`

## releaseSession primitive (reuse for yielder)

`claim.js:239-260` — canonical release:
1. Find lock by session_id via `readLockFiles()`
2. `gh issue edit N --remove-label workflow:in-progress` (note: NO `--remove-assignee` anywhere)
3. `fs.unlinkSync(lockPath)`, `fs.unlinkSync(sessionPath)`

## cmdHeartbeat

`claim.js:268-295` — finds lock, `Object.assign({}, match, { last_heartbeat: now, expires: +30min })`, writes lock, `updateLeaseInPlace()`.

One-shot pattern in all 6 phase commands (not a background timer):
```bash
[ -n "${KAOLA_SESSION_ID:-}" ] && \
  node "${CLAUDE_PLUGIN_ROOT:-./}/scripts/kaola-workflow-claim.js" heartbeat --session "$KAOLA_SESSION_ID"
```
- phase1: `commands/kaola-workflow-phase1.md:26-30`
- phase2: `commands/kaola-workflow-phase2.md:30-34`
- phase3: `commands/kaola-workflow-phase3.md:28-32`
- phase4: `commands/kaola-workflow-phase4.md:18-23`
- phase5: `commands/kaola-workflow-phase5.md:32-36`
- phase6: `commands/kaola-workflow-phase6.md:33-37`

## cmdSweep (local only — no remote extension yet)

`claim.js:297-319` — reads all `.lock` files, applies `shouldSweep()`:
```js
// claim.js:91-95
function shouldSweep(lock) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return new Date(lock.expires).getTime() < cutoff &&
    new Date(lock.last_heartbeat).getTime() < cutoff;
}
```
On match: `gh issue edit N --remove-label workflow:in-progress`, then `fs.unlinkSync(fp)`.
**Missing**: no `:released-stale` comment, no `--remove-assignee`, no GitHub comment-age check.

## Architecture

- **gh calls**: `ghExec(args)` at `claim.js:26-29` — `execFileSync('gh', args, { encoding: 'utf8' }).trim()`. Returns `''` when `OFFLINE`.
- **Immutable updates**: `Object.assign({}, original, changes)` pattern everywhere (`claim.js:228, 285, 381, 445`)
- **Lock data shape**: `{ project, session_id, machine_id, claimed_at, expires, last_heartbeat, issue_number, claim_comment_id, sink, pr_url, pr_number }`
- **`claim_comment_id`**: starts null, set to digit string from URL regex, validated `/^\d+$/` at `claim.js:118, 391`
- **Sentinel markers**: `:released-stale`, `:yielded`, `:begin` do **not exist yet** in codebase
- **Current claim body**: `'🔒 Session claimed by ' + sessionId` only

## File Paths

```js
// claim.js:61-64
locksDir(root)    → {root}/kaola-workflow/.locks
sessionsDir(root) → {root}/kaola-workflow/.sessions
lockPath(root, p) → {root}/kaola-workflow/.locks/{p}.lock
sessionPath(root, s) → {root}/kaola-workflow/.sessions/{s}.json
```

## Error Handling

- `cmdClaim` EEXIST: 3×50ms → `process.exitCode = 2; return` (no throw)
- `cmdSweep` gh failure: `try/catch` → silently skips issue (`claim.js:312-315`)
- `cmdHeartbeat` missing session: `exitCode = 1; return` (`claim.js:276-279`)
- `ghExec` errors bubble as thrown exceptions; most callers silent-catch

## Test Patterns

**File**: `scripts/simulate-workflow-walkthrough.js`
**Framework**: hand-rolled `assert(cond, msg)` at `walkthrough.js:10-14`
**Run**: `node scripts/simulate-workflow-walkthrough.js`

**Existing Epic Cases**:
- Epic 1 (`walkthrough.js:329-408`): claim/heartbeat/status/sweep/release — `OFFLINE=1`
- Epics 2–4 (`walkthrough.js:410-559`): sink-merge paths
- Epic 5 (`walkthrough.js:561-675`): roadmap
- Epic 6 (`walkthrough.js:677-803`): parallel-classifier — PATH shim for gh
- Epic 7 (`walkthrough.js:805-1053`): pr-sink — PATH shim + `HOME: isolatedTmp`
- Epic 8 (`walkthrough.js:1055-1261`): claim hardening (8A-8F)

**No existing cross-machine / tiebreaker test.**

**Two gh-mocking patterns**:
1. `KAOLA_WORKFLOW_OFFLINE=1` — suppresses all gh calls (returns ''). Cannot test comment JSON parsing or tiebreaker.
2. **PATH shim** (Epic 6E at `walkthrough.js:748-771`, Epic 7 at `walkthrough.js:835-861`): shell script `gh` in temp `bin/` prepended to PATH; returns arbitrary JSON per command. Requires `HOME: isolatedTmp` for machine-id isolation. **Correct pattern for tiebreaker/sweeper tests.**

**spawnSync for exit-code capture** (Epic 8, `walkthrough.js:1062-1077`): use to check `.status` without throwing.

**New test cases**: insert before `walkthrough.js:1263` (the pass log line).

## Key Files

| File | Changes Needed |
|------|----------------|
| `scripts/kaola-workflow-claim.js` | Tiebreaker (between postGitHubClaim and lock re-write); cmdSweep remote extension; --remove-assignee in cmdRelease+cmdSweep |
| `scripts/simulate-workflow-walkthrough.js` | New Epic 9: tiebreaker tests using PATH shim |
| `commands/kaola-workflow-phase*.md` (×6) | One-shot heartbeat → background ticker pattern |
| `commands/workflow-next.md` | Adoption protocol entry |

## Notable Gaps / Constraints

- `--remove-assignee` missing from ALL release paths — add to cmdRelease + cmdSweep
- No `gh api` calls anywhere today — remote sweeper needs `gh api repos/{owner}/{repo}/issues/{N}/comments/{id}` to check `updated_at`
- `claim_comment_id` is string, use `parseInt(id, 10)` for tiebreaker ID comparisons
- Issue says "adoption protocol is optional polish" — can defer if needed
