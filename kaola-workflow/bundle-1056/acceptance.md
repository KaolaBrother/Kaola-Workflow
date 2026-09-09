# Acceptance — Issue #1056: `defaultBranch` env contract regressions

Test-author custody. Baseline `e72407b8`. Worktree
`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1056`, branch
`workflow/bundle-1056`. No production code touched; nothing committed.

## The file

`scripts/test-issue-1056-default-branch-env-contract.js` — self-contained, `node
scripts/test-issue-1056-default-branch-env-contract.js`. Every scenario drives a throwaway `node -e
<script>` **child process** (via `spawnSync`, annotated `// spawn-class: environment` at its one
call site in `runChild`) that mocks `child_process.execFileSync` in-process before requiring
anything under test, then prints one JSON line the parent asserts on. No scenario ever touches a
real git remote or the network — the mock always answers synchronously and is exhaustively driven
by a `plan` object per stage (`stage1` = `symbolic-ref`, `stage2` = `remote show origin`, `stage3`
= `ls-remote --symref origin HEAD`).

## Scenario → assertion map

| # | Scenario | Order driven in the child | Assertions | Baseline result |
|---|---|---|---|---|
| 1 | Load-order offline (kernel) | require `scripts/kaola-workflow-adaptive-schema.js` → set `KAOLA_WORKFLOW_OFFLINE=1` → require `scripts/kaola-workflow-claim.js` → call `claim.defaultBranch(root)`, stage1 throws | result `'main'`; argv has ONLY the stage-1 call (zero network); `claim.defaultBranch === schema.defaultBranch` | **RED** ×2, GREEN ×1 (identity) |
| 2 | Load-order timeout (kernel) | require schema → set `KAOLA_GH_REMOTE_TIMEOUT_MS=1234` → require claim → call `defaultBranch`, stage1 throws, stage2 → `develop` | stage-2 `timeout` option === 1234; result `'develop'` | **RED** (timeout), GREEN (result) |
| 3 | Env before any require (shipped CLI order) | set env → require claim → call | offline: `'main'`, zero network; timeout: honoured (4242) | GREEN pin (both) |
| 4 | Probe order + fallback (env fully unset, online) | require claim → call, 4 stage-plan variants | 4a stage1 resolves `origin/master`→`'master'`, zero network; 4b stage1 throws + stage2 unusable + stage3 resolves → `'trunk'`, argv order exactly `[symbolic-ref, remote show, ls-remote]`; 4c all three throw → `'main'`; 4d stage2 throws ETIMEDOUT/SIGTERM-shaped → falls to stage3 `'trunk'`, no exception escapes | GREEN pin (all four) |
| 5 | Timeout clamp (kernel) | 5a/5b: env set BEFORE claim loads; 5c: env set AFTER claim loads, before the call | 5a `9999999`→600000; 5b `'abc'`→30000; 5c `9999999` (after load)→600000 | 5a/5b GREEN pin, 5c **RED** |
| 6 | gitlab/gitea claim ports | see note below — TWO sub-orders per edition | offline, zero network, `'main'`, `typeof defaultBranch === 'function'` | schema-then-env-then-port: GREEN pin. **port-before-env: RED** |

23 assertions pass, 8 fail, on baseline `e72407b8`.

### Scenario 6 — a correction to the assigned reproduction order

The task description said "require its adaptive-schema copy first, set env, then require the
port" would reproduce RED for the gitlab/gitea ports, by analogy with kernel scenario 1. **Measured,
this is false.** Each port's `defaultBranch` (`kaola-gitlab-workflow-claim.js:349`,
`kaola-gitea-workflow-claim.js:350`) is a **separate function defined directly in the port's own
claim.js**, not re-exported from that port's local `kaola-workflow-adaptive-schema.js` copy (whose
own identical `defaultBranch` at line ~845 sits unused). The port's `OFFLINE` const
(`kaola-*-workflow-claim.js:32`) is therefore captured when **the port itself loads**, independent
of when its adaptive-schema copy loaded. Under the literal assigned order (schema, then env, then
the port), the port loads *after* the env is set and is already offline-safe today — verified with
zero-network output for both gitlab and gitea (`{"result":"main","calls":[...only symbolic-ref...]}`)
before this file was written. That sub-case is kept in the suite as a GREEN pin (same-shape as
kernel scenario 1), not a regression.

The order that **does** reproduce a load-order regression for the ports, empirically verified, is
requiring **the port itself before the env is set** (env still arrives before the call): the port's
own `OFFLINE` const is captured as `false` at that point, and no amount of setting the env
afterward changes it. This is a real, distinct instance of the same defect class the kernel has —
just anchored at a different module boundary (the port's own claim.js, not its adaptive-schema
copy) — because the port does not yet delegate to a call-time-aware function. Both sub-orders are
asserted for each of gitlab and gitea.

## RED lines on baseline (verbatim, `node scripts/test-issue-1056-default-branch-env-contract.js`)

```
FAIL: #1056 scenario 1: offline set AFTER adaptive-schema loads (but before claim loads and before the call) must still resolve "main"; got "should-not-be-called"
FAIL: #1056 scenario 1: offline must make ZERO network probes (only the local symbolic-ref stage may run); got argv sequence ["-C /tmp/kw-1056-s1 symbolic-ref --short refs/remotes/origin/HEAD","-C /tmp/kw-1056-s1 remote show origin"]
FAIL: #1056 scenario 2: KAOLA_GH_REMOTE_TIMEOUT_MS=1234 set AFTER adaptive-schema loads (but before claim loads and before the call) must reach the stage-2 execFileSync timeout option; got 30000
FAIL: #1056 scenario 5c (AFTER load, before call): KAOLA_GH_REMOTE_TIMEOUT_MS=9999999 set after claim.js loads (but before defaultBranch is called) must still clamp to 600000; got 30000
FAIL: #1056 scenario 6 (gitlab, port-before-env): expected "main"; got "should-not-be-called"
FAIL: #1056 scenario 6 (gitlab, port-before-env): offline set AFTER the port itself loads (but before the call) must still make zero network probes; got ["-C /tmp/kw-1056-s6 symbolic-ref --short refs/remotes/origin/HEAD","-C /tmp/kw-1056-s6 remote show origin"]
FAIL: #1056 scenario 6 (gitea, port-before-env): expected "main"; got "should-not-be-called"
FAIL: #1056 scenario 6 (gitea, port-before-env): offline set AFTER the port itself loads (but before the call) must still make zero network probes; got ["-C /tmp/kw-1056-s6 symbolic-ref --short refs/remotes/origin/HEAD","-C /tmp/kw-1056-s6 remote show origin"]

23 passed, 8 failed (test-issue-1056-default-branch-env-contract.js)
```
Exit code: 1.

This matches the required RED set exactly: scenario 1 (×2), scenario 2 (timeout), scenario 5-after-load
(5c), and scenario 6 (×2 assertions × 2 editions = 4). Scenarios 3, 4 (all four sub-cases), 5a, 5b,
and scenario 6's schema-then-env-then-port sub-case are GREEN pins on baseline, as required.

## Mutant proofs (GREEN pins armed)

Per the task's scope, mutants were applied only to `scripts/kaola-workflow-adaptive-schema.js` (the
one production file the task authorized touching for proof purposes); the gitlab/gitea port GREEN
pin (schema-then-env-then-port) was not mutant-proven because mutating `plugins/*` production files
is out of the test-author's scope — it was instead confirmed by two independent direct measurements
(identical output both times) before and after the suite was finalized.

Each mutant was applied, the suite run, the new failures recorded, then reverted with `git checkout
-- scripts/kaola-workflow-adaptive-schema.js` and `git diff --stat` confirmed empty before the next
mutant.

1. **Stage order swapped** (ls-remote before remote-show in `defaultBranch`). Result: 16 passed, 15
   failed — newly RED: scenario 1's zero-network assertion (now sees `ls-remote` instead of `remote
   show`), scenario 2/3's timeout assertions (stage 2 never called under this stage order for a
   `develop`-only mock), and critically **scenario 4b's argv-order pin**
   (`["...symbolic-ref","...ls-remote"]` instead of the required
   `[symbolic-ref, remote show, ls-remote]`). Proves the probe-order pin is armed.
2. **Clamp dropped** (`Math.min(n, 600000)` → `n`). Result: 22 passed, 9 failed — newly RED:
   **scenario 5a** (`9999999` → got `9999999` unclamped, expected `600000`). Proves the clamp pin
   is armed.
3. **Fallback string changed** (`'master'` instead of `'main'` on stage-3 exhaustion). Result: 22
   passed, 9 failed — newly RED: **scenario 4c** (`"master"` instead of `"main"`). Proves the
   fallback pin is armed.
4. **Offline short-circuit disabled** (`if (false && OFFLINE) return 'main';`). Result: 21 passed,
   10 failed — newly RED: **scenario 3's offline sub-case** (network calls made despite
   `KAOLA_WORKFLOW_OFFLINE=1` set before any require). Proves the env-before-any-require offline pin
   is armed.
5. **Stage-2 catch narrowed to rethrow ETIMEDOUT-shaped errors** (instead of swallowing). Result:
   the child driver for **scenario 4d** crashed with an uncaught exception (`ETIMEDOUT`), which the
   parent's `runChild` turned into a thrown `Error`, terminating the whole suite process at exit
   code 1 before printing a summary line — the strongest possible proof that "no exception escapes
   `defaultBranch`" is load-bearing.

After each mutant: `git checkout -- scripts/kaola-workflow-adaptive-schema.js` then `git diff
--stat scripts/kaola-workflow-adaptive-schema.js` printed nothing (clean). Final re-run after the
last restore reproduced the exact original 23-passed/8-failed baseline byte-for-byte (see the RED
block above), confirming the file is back to `e72407b8`'s content.

## Spawn-classification guard

`node scripts/test-spawn-classification.js` → `spawn-classification passed (10 mutation assertions;
725 spawn sites across 85 files, 321 classified, 404 grandfathered; 154 slot(s) of slack)`. The
suite's one real synchronous spawn site (`runChild`'s `spawnSync`) carries `// spawn-class:
environment`.

## Registration diff (`package.json`)

`node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))"` confirms valid JSON
after the edit. One line changed per chain (5 chains total), each inserting
`node scripts/test-issue-1056-default-branch-env-contract.js` immediately after an existing anchor
entry, matching the file's existing placement convention:

- `test:kaola-workflow:claude` and `test:kaola-workflow:claude:full`: inserted right after
  `node scripts/test-issue-1055-render-subtraction-oracle.js` (as directed).
- `test:kaola-workflow:codex`, `test:kaola-workflow:gitlab`, `test:kaola-workflow:gitea`: inserted
  right after `node scripts/test-forge-claim-rollback-scoping.js`, the existing suite that also
  touches the gitlab/gitea plugin claim ports and is registered in all four non-`:full` chains
  (`grep -c` confirms `test-forge-claim-rollback-scoping.js` appears in `claude`, `codex`, `gitlab`,
  `gitea`). The suite's inputs (`plugins/kaola-workflow-gitlab/scripts/*`,
  `plugins/kaola-workflow-gitea/scripts/*`) are ordinary committed repo files, not
  `edition-sync`-materialized/gitignored trees, so they are present in every checkout — safe to run
  unconditionally in all five chains.

`git diff --stat package.json`: 1 file changed, 5 insertions(+), 5 deletions(-) (one line per
chain, replaced in place; no unrelated reformatting — an earlier scripted edit accidentally
re-escaped the file's `description` field's em dash to `—`; caught and reverted to the literal
UTF-8 character before this was written).

## Exact command

```
node scripts/test-issue-1056-default-branch-env-contract.js
```
Run from the worktree root
(`/Volumes/WorkspaceA/ylminiserver/workspace/kaola-workflow/.kw/worktrees/bundle-1056`). Exit 1 on
`e72407b8` (8 assertions RED as enumerated above); the implementer's fix should bring it to exit 0
with 31 passed, 0 failed, and no scenario's expected values need to change (they encode the intended
post-fix contract, not the baseline's broken behaviour). `npm test` was not run per instructions;
`node scripts/test-spawn-classification.js` was run and passes.

## Scope confirmation

`git status --short` at the end of this session shows only:
- `M package.json` (registration)
- `?? scripts/test-issue-1056-default-branch-env-contract.js` (new suite)
- `?? kaola-workflow/bundle-1056/acceptance.md` (this file)
- pre-existing dirt from concurrent agents, untouched: `M CHANGELOG.md`, `M docs/api.md`,
  `M kaola-workflow/archive/bundle-1055/acceptance.md`, `M kaola-workflow/archive/bundle-1055/adversarial.md`,
  `?? kaola-workflow/archive/bundle-1055/corrections.md`

No file under `scripts/kaola-workflow-adaptive-schema.js`, any other `scripts/*.js` production
file, or `plugins/` was left modified — every mutant was applied and reverted within this session,
each confirmed byte-identical via `git diff --stat` before moving to the next. Nothing was
committed.
