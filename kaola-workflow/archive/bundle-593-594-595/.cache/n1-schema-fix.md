evidence-binding: n1-schema-fix a9861fafa36f
<!-- RED: paste RED here -->
RED: test T-595-orphan (scripts/test-adaptive-node.js, new fault-injection unit test) — monkey-patched
`fs.writeFileSync` to throw once (custom code `EFAULTINJECT`) immediately after `acquireProjectLock`'s
real `openSync(lockPath, 'wx')` succeeded, then ran `node scripts/test-adaptive-node.js` against the
UNFIXED `acquireProjectLock`. Failure output:
```
FAIL: T-595-orphan: the just-created lockfile is NOT orphaned after a payload-write failure
FAIL: T-595-orphan: a follow-up acquireProjectLock succeeds (no orphaned-lockfile refusal)
TypeError: follow.release is not a function
    at Object.<anonymous> (scripts/test-adaptive-node.js:8479:10)
```
This reproduces the bug exactly: the empty lockfile was orphaned (assertion 1 failed), so the
follow-up `acquireProjectLock` in the same process hit `EEXIST` on the empty/corrupt payload and
was refused with `ok:false, stale:false` (fresh-mtime classification) instead of `ok:true` — the
crash on `follow.release()` (undefined, since `follow.ok` was false) is direct proof of the
"wrong-flavor `scheduler_locked` refusal" the issue describes.

<!-- GREEN: paste GREEN here -->
GREEN: after the fix (payload-write try/catch: on any failure after `openSync('wx')` — write,
fsync, or close — best-effort `unlinkSync(lockPath)` before rethrowing), re-ran
`node scripts/test-adaptive-node.js`: 0 `FAIL:` lines, tail output
`adaptive-node tests passed (1223 assertions)` (was 1219 pre-change; the new T-595-orphan test adds
exactly 4 assertions: injected-error propagates, lockfile absent post-failure, follow-up acquire
`ok:true`, follow-up release cleans up). All pre-existing T-585 lock tests (unit acquire/release,
unit stale-refuse, real-subprocess live-refuse, real-subprocess stale-race, T-585-stale isStaleLock
unit) remained green in the same run — no regression. `node scripts/simulate-workflow-walkthrough.js`
also green, ending `Workflow walkthrough simulation passed` (exit 0), including the pre-existing
`testTwoLanesInOneCheckout579` scenario that exercises the scheduler lock end-to-end.

No-takeover invariant: the new `unlinkSync(lockPath)` runs ONLY inside the `catch` branch gated on
`fd !== undefined` — `fd` is set exclusively by THIS call's own `fs.openSync(lockPath, 'wx')` a few
lines above and is reset to `undefined` only after the full write+fsync+close sequence succeeds. So
the unlink is reachable ONLY on a failure between this call's own successful O_EXCL create and its
own close — i.e. only in the same call that just created the file, when we provably own it. It is
architecturally unreachable from the EEXIST branch (a foreign holder's lock): that branch is guarded
by `if (!(err && err.code === 'EEXIST')) throw err;` and never touches `fd`/unlink at all — a foreign
holder's lockfile is never opened via 'wx' by us (openSync itself would fail EEXIST first), so `fd`
can never be set to a foreign file. Confirmed structurally by inspection and empirically by the
unchanged-green T-585-stale-refuse / T-585-stale-race tests (planted dead-pid holder's lockfile
stays byte-untouched).

Byte-identity ×3 (after copying the fixed canonical to all three edition trees):
```
cmp scripts/kaola-workflow-adaptive-schema.js plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js        (silent)
cmp scripts/kaola-workflow-adaptive-schema.js plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js (silent)
cmp scripts/kaola-workflow-adaptive-schema.js plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js  (silent)
```
All three `cmp` invocations were silent (byte-identical) — confirmed.

Per-file change summary:
- `scripts/kaola-workflow-adaptive-schema.js` — `acquireProjectLock`'s outer `catch (err)` block: when
  `fd !== undefined` (we own the just-'wx'-created file), best-effort `fs.closeSync(fd)` then
  best-effort `fs.unlinkSync(lockPath)` before rethrowing `err`, instead of just closing the fd and
  leaking the file. Purely additive inside the existing catch; the `EEXIST` branch, the release
  `finally`, the exit hook, and the stale-PID probe are all untouched.
- `plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js`,
  `plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js`,
  `plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js` — byte-for-byte copies of
  the fixed canonical (cross-edition drift anchor kept in sync).
- `scripts/test-adaptive-node.js` — added the `T-595-orphan` fault-injection unit test (RED-first,
  placed immediately after the existing `T-585-acquire`/`T-585-release`/`T-585-stale-refuse` unit
  block, before the real-subprocess `#585` tests) that monkey-patches `fs.writeFileSync` to fail once
  right after a real `openSync('wx')`, then asserts the lockfile is gone and a follow-up acquire in
  the same process succeeds. 4 new assertions.

Deviations from the task spec: none. `gh issue view 595` failed in this environment
(`your authentication token is missing required scopes [read:project]`) so the issue body itself
could not be fetched directly; proceeded entirely from the bug description, line-range pointer, and
AC given in the dispatched task (which matched the live code at lines 764-812, confirmed by reading
the file before editing).
