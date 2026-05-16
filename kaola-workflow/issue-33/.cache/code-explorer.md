# Code Explorer Cache — issue-33
Generated: 2026-05-16

## Exploration: Phase 6 Sink CWD Restoration (Issue #33)

### 1. `removeWorktree()` — Full Implementation

File: `scripts/kaola-workflow-claim.js`, lines 622–678.

Signature: `function removeWorktree(coordRoot, project, lock)`

Flow:
- If `lock.worktree_path` is absent, returns `{ skipped: true }` immediately.
- Resolves `wtReal = fs.realpathSync(wtPath)` and `cwdReal = fs.realpathSync(process.cwd())`.
- **CWD-protection check** (lines 637–643): If `cwdReal === wtReal || cwdReal.startsWith(wtReal + path.sep)`, writes a deferred entry to `{coordRoot}/kaola-workflow/.pending-removal/{project}.json` containing `{ project, worktree_path: wtPath }` and returns `{ deferred: true }`. No removal occurs.
- If CWD is not inside the worktree: checks dirty tree via `git -C {wtPath} status --porcelain`.
- Clean worktree path: runs `git worktree remove --force -- {wtPath}`, returns `{ removed: true }`.
- Dirty worktree path: renames to `{wtPath}.abandoned-{iso-timestamp}`, runs `git worktree prune`, returns `{ abandoned: true }`.

The function never calls `process.chdir()`. No `restoreCwd` helper exists anywhere.

**Return values**: `{ skipped: true }`, `{ deferred: true }`, `{ removed: true }`, or `{ abandoned: true }`.

**Exports** (line 2018): `module.exports = { buildSinkBranchName, getCoordRoot, removeWorktree }`.

---

### 2. `drainPendingRemovals()` — Deferred Removal Path

File: `scripts/kaola-workflow-claim.js`, lines 680–696.

Reads all `.json` files from `{coordRoot}/kaola-workflow/.pending-removal/`. For each entry, calls `removeWorktree(coordRoot, entry.project, { worktree_path: entry.worktree_path })`. If result is `removed`, `abandoned`, or `skipped`, deletes the pending file. If `deferred` again, leaves for next sweep.

`drainPendingRemovals` is called ONLY from `cmdSweep()` (line 1845). NOT called from `sink-merge.js` or `sink-pr.js`. The deferred path performs no CWD restoration.

---

### 3. Step 0 in `sink-merge.js` — Where `removeWorktree()` Is Called

File: `scripts/kaola-workflow-sink-merge.js`, lines 158–165.

```javascript
// Step 0 — Remove worktree (if any) so the branch can be checked out below
{
  const coordRoot = getCoordRoot();
  const lockFilePath = path.join(coordRoot, 'kaola-workflow', '.locks', args.project + '.lock');
  let lock = null;
  try { lock = JSON.parse(fs.readFileSync(lockFilePath, 'utf8')); } catch (_) {}
  if (lock) { try { removeWorktree(coordRoot, args.project, lock); } catch (_) {} }
}
```

`coordRoot` is block-scoped inside the `{ ... }` braces (line 160). Not accessible after line 165. A new `getCoordRoot()` call would be needed outside this block. `getCoordRoot` is imported at module scope.

No CWD restoration follows `removeWorktree`. Next statement is unconditional `git fetch` (line 169), then `assertCleanWorktree()` and `git checkout {branch}`.

**Error handling**: Both JSON.parse and removeWorktree calls are in separate `try/catch (_) {}` that silently swallow all errors.

---

### 4. `sink-pr.js` — Worktree Removal

File: `scripts/kaola-workflow-sink-pr.js`

`sink-pr.js` does **NOT import or call `removeWorktree`** at all. No worktree removal logic exists in this script.

Has its own local `getCoordRoot()` (lines 34–45) and `getRoot()` (lines 23–32).

`coordRoot` declared at function scope (line 139), available throughout `main()`:
```javascript
const root = getRoot();           // line 138
const coordRoot = getCoordRoot(); // line 139
```

The CWD issue for `sink-pr.js` would arise from Phase 6 shell instructions running from inside the worktree when `sink-pr.js` executes, not from the script itself.

---

### 5. `cd "$(git -C "$coordRoot" rev-parse --show-toplevel)"` Pattern

This exact pattern does **NOT appear anywhere** in the codebase. No existing precedent.

Existing `getRoot()` functions in `sink-merge.js` (line 23) and `claim.js` (line 82) call `git rev-parse --show-toplevel` without `-C`, operating from `process.cwd()`.

Phase command files use `git rev-parse --show-toplevel` only for constructing ticker PID file paths in shell context.

---

### 6. `coordRoot` Accessibility at `removeWorktree` Return Points

**In `sink-merge.js`**: `coordRoot` is block-scoped (line 160), out of scope after line 165. Would need a new `getCoordRoot()` call, or block scope removal to hoist to `main()` function scope.

**In `sink-pr.js`**: `coordRoot` declared at function scope (line 139), accessible throughout `main()`. But `sink-pr.js` doesn't call `removeWorktree`.

---

### 7. Ticker and Heartbeat — CWD Usage

`cmdTicker` (lines 1761–1784) captures `root` and `coordRoot` at startup into `tickCtx`. All subsequent file operations use `tickCtx.root` and `tickCtx.coordRoot`. Does NOT call `process.cwd()` during tick execution. Runs as separate `nohup` background process — CWD independent of main session.

---

### 8. Test Coverage for Sink Scripts

**sink-merge tests** in `simulate-workflow-walkthrough.js`:

| Test | Lines | What It Asserts |
|------|-------|-----------------|
| Epic Case 2 | 462–500 | OFFLINE fast-path exits 0; worktree on `main`; feature branch deleted |
| Epic Case 3 | 502–555 | Rebase path exits 0; worktree on `main`; feature branch deleted |
| Epic Case 3B | 557–597 | Branch checked out before merge-base; worktree on `main` |
| Epic Case 3C | 599–628 | Phase 6 commit gate simulation; final change on `main` |
| Epic Case 4 | 630–687 | FF race retry exhaustion exits 2; feature branch not deleted |
| 16G (AC13) | 3750–3763 | sink-merge removes worktree; worktree gone after sink-merge |

None assert CWD restoration. Tests run `sink-merge` as child process — host test suite CWD unaffected.

**sink-pr tests** in Epic Case 7 (lines 1141–1396):

| Sub-test | Lines | What It Asserts |
|----------|-------|-----------------|
| 7G | 1218–1234 | `--sink pr` → lock.sink === 'pr' |
| 7A | 1236–1267 | gh pr create called; PR URL in summary, Sink block, lock |
| 7B | 1269–1291 | pr_auto_merge: true → gh pr merge called |
| 7C | 1293–1323 | watch-pr MERGED → lock and branch deleted |
| 7D | 1324–1353 | watch-pr CLOSED → lock deleted; branch retained |
| 7E | 1355–1371 | watch-pr OPEN → expires + last_heartbeat refreshed |
| 7F | 1373–1395 | OFFLINE → OFFLINE_PLACEHOLDER |

No CWD restoration assertions. No worktree-removal scenario in sink-pr tests.

---

### 9. Naming Conventions — No Existing `restoreCwd` Helper

No `restoreCwd`, `resetCwd`, `cdToRoot`, or similar helper anywhere. `process.chdir()` not called anywhere in any script. The concept does not exist yet.

Only CWD-related symbol: comment `// CWD-protection: defer if cwd is inside the worktree` at line 637 of `claim.js` and local variable `cwdReal` at line 634.

---

### Key Files Summary

| File | Role | Lines |
|------|------|-------|
| `scripts/kaola-workflow-claim.js` | `removeWorktree()`, `drainPendingRemovals()`, `getCoordRoot()` | 622–696, 680–696, 93–109 |
| `scripts/kaola-workflow-sink-merge.js` | Step 0 — fix location; `coordRoot` block-scoped | 158–165 |
| `scripts/kaola-workflow-sink-pr.js` | No `removeWorktree` call; `coordRoot` at function scope (line 139) | 138–180 |
| `scripts/simulate-workflow-walkthrough.js` | 16G tests sink-merge worktree removal; no CWD assertion | 3750–3763 |

---

### Confirmed Gaps

1. `sink-merge.js` Step 0 line 164: `removeWorktree()` return value discarded; no `process.chdir()` follows.
2. `coordRoot` in Step 0 is block-scoped; unavailable after line 165 without new `getCoordRoot()` call.
3. `sink-pr.js` does not call `removeWorktree()` at all. CWD issue for sink-pr is in Phase 6 shell instructions.
4. Deferred path (`{ deferred: true }`) drained only by `cmdSweep()`, not by sink scripts. After `sink-merge` gets deferred, worktree never removed and CWD stays invalid.
5. No `process.chdir()` / `restoreCwd` helper exists anywhere.
6. Test 16G runs from `epic16Tmp` (main repo root), not from inside worktree — deferred path and CWD restoration are both untested.
