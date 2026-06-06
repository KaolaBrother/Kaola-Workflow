# review gate verdict — issue #256

## VERDICT: APPROVE

The deferred-from-#246 regression test is correct, genuinely guards the
`worktree_error` surfacing contract, and leaks no scope. Suite is GREEN.

---

## Criteria checked

### Correctness — PASS
- New `testWorktreeNativeSurfacesProvisionFailure()` plants a regular FILE at
  `fs.realpathSync(tmp) + '.kw'` (= `path.dirname(wtPath)`, the `.kw` worktree-parent),
  NOT at `wtPath`. This is the right target: in `provisionWorktree`
  (claim.js:252-269) `fs.mkdirSync(path.dirname(wtPath), {recursive:true})` (line 255)
  runs BEFORE the `existsSync(wtPath)` early-return (line 257), so it is the mkdir
  that throws EEXIST.
- Empirically verified the macOS symlink subtlety: the test plants at the realpath
  (`/private/var/...`) while claim.js's `getCoordRoot` does `path.resolve` (no realpath)
  and mkdir's at the raw `/var/...` path. Despite the textual path mismatch, `mkdirSync`
  resolves the `/var → /private/var` symlink during traversal and still throws
  `EEXIST` against the same on-disk file. Probe confirmed: mkdir THREW EEXIST.
  (This also justifies the non-exact `/EEXIST/` match — the error message embeds the
  raw `/var` absolute path; an exact-string match would be fragile.)
- Uses `runClaimOnlineLastJson` (defaults KAOLA_WORKTREE_NATIVE=1, OFFLINE=0 → hits the
  native-provision branch at claim.js:462), `initGitRepo`, `writeGhShimForStartup`.
- Fresh issue number 507 — verified unique (only 2 occurrences in the suite, both inside
  the new test; sits in the established 50x test sequence with 505/506).
- Cleanup in `finally`: `fs.rmSync(tmp, {recursive,force})` plus a guarded
  `fs.rmSync(kwRoot, {force:true})` in a try/catch. Correct — the planted file lives at
  kwRoot, outside tmp, so it needs its own removal.

### Genuinely guards the contract — PASS
- The `/EEXIST/.test(result.worktree_error)` assert depends on the #246 un-silencing:
  `worktree_error` is only populated by the `catch (e) { worktreeError = e.message }` at
  claim.js:463 and conditionally included in the return at claim.js:477
  (`worktreeError ? { worktree_error } : {}`).
- impl evidence at `kaola-workflow/issue-256/.cache/impl.md` is present and credible:
  records RED (exit 1, "worktree_error must match /EEXIST/ ... got: undefined" at the new
  test, walkthrough.js:2759) when claim.js's catch is re-silenced to `catch (_) {}`, then
  GREEN (exit 0, "Workflow walkthrough simulation passed") after restoring claim.js
  byte-for-byte. RED-then-GREEN proof is genuine.

### Both regression asserts — PASS
- `testWorktreeNativeDefaultOff`: `assert(result.worktree_error === undefined, ...)` —
  uses the already-parsed `result` (from runClaimOnlineLastJson). Correct: with
  KAOLA_WORKTREE_NATIVE=0 the gate at claim.js:462 is skipped, worktreeError stays '',
  so line 477 omits the field → undefined. PASS.
- `testWorktreeNativeOfflineWins`: `assert(parsed.worktree_error === undefined, ...)` —
  uses the already-parsed `parsed` (from JSON.parse(spawnResult.stdout)). Correct: OFFLINE
  short-circuits the gate, field omitted → undefined. PASS.
  Both use the correct per-test parsed variable.

### Scope hygiene — PASS
- `git diff scripts/kaola-workflow-claim.js` is clean — the proof-of-RED revert was
  restored. No production code change.
- Only modified tracked file is `scripts/simulate-workflow-walkthrough.js` (matches the
  impl node's declared_write_set).
- `git status` also shows `A kaola-workflow/.roadmap/issue-256.md` (staged) and untracked
  `kaola-workflow/issue-256/` — these are the issue's own roadmap source + workflow state
  scaffolding created by the claim/roadmap machinery before the impl node ran, NOT an impl
  code change. Outside the impl write-set but expected workflow durable state; not a leak.

### Suite passes — PASS
- Ran `node scripts/simulate-workflow-walkthrough.js`; captured `$?` directly = 0.
- Success sentinel present: "Workflow walkthrough simulation passed".
- New test registered (grep count 2: definition + runner registration after
  testWorktreeNativeOfflineWins).

---

## Findings
- Blocking: none.
- Non-blocking: none material. (Path-mismatch between planted realpath and claim.js's
  raw path is harmless — mkdirSync resolves the symlink and throws anyway; documented above
  so future maintainers don't "fix" it into a wtPath-target that would miss the throw.)

## Suite exit code: 0
