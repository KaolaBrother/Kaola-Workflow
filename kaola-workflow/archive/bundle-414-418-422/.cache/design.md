d5ce7535d0b9
evidence-binding: design d5ce7535d0b9

# Design — bundle #414 / #418 / #422

READ-ONLY design session. Downstream implementer / tdd-guide nodes execute this mechanically.
All line numbers are HEAD-relative as inspected on 2026-06-12 in the worktree
`/Users/ylpromax5/Workspace/Kaola-Workflow/.kw/worktrees/bundle-414-418-422`.

KEY HARNESS FACT (do not "mock git"): the Claude walkthrough and the forge walkthroughs use REAL
`git init` repos via `spawnSync` against the real scripts. There is NO injectable git-mock surface.
The #414 sink scenario is a REAL bare-remote git fixture; the #414.2 `defaultBranch` unit drives the
exported `defaultBranch()` against a REAL repo with controlled `origin/HEAD` refs.

------------------------------------------------------------------------------------------------
## CORRECTIONS TO THE ISSUE PREMISES (verified against HEAD — implementers must honor these)

1. **#418.1 — there is NO `root/config/hooks.json`.** `config/hooks.json` exists ONLY in the three
   PLUGIN trees: `plugins/kaola-workflow/config/hooks.json` (codex), `…-gitlab/config/hooks.json`,
   `…-gitea/config/hooks.json`. Root has `hooks/hooks.json` (a different file, forge-renamed too).

2. **#418.1 — the three `config/hooks.json` are NOT byte-identical.** They differ on exactly ONE
   line — the SessionStart compact-resume command path is forge-renamed:
   - codex:  `node "__KW_PLUGIN_ROOT__/scripts/kaola-workflow-codex-compact-resume.js"`
   - gitlab: `node "__KW_PLUGIN_ROOT__/scripts/kaola-gitlab-workflow-codex-compact-resume.js"`
   - gitea:  `node "__KW_PLUGIN_ROOT__/scripts/kaola-gitea-workflow-codex-compact-resume.js"`
   Therefore the correct family is **RENAME_NORMALIZED_FAMILIES**, NOT BYTE_IDENTICAL_GROUPS.
   But the naive `renameNormalize()` OVER-renames: the JSON also references `.sh` hooks
   (`kaola-workflow-pre-commit.sh`, `kaola-workflow-write-lane.sh`,
   `kaola-workflow-subagent-dispatch-log.sh`) which STAY `kaola-workflow-` in all three forges.
   The existing `renameNormalize` regex `kaola-workflow-([a-z0-9-]+)(?![a-zA-Z0-9-])` would rewrite
   those `.sh` tokens too → it would FALSELY report drift. See #418.1 solution below for the fix
   (a `config/hooks.json`-specific reference where codex is the reference and we only normalize the
   `codex-compact-resume` token — implemented as a dedicated family, NOT the generic regex).

3. **#422 — all 14 base agent `.toml` triples ARE byte-identical at HEAD** (verified by md5). There
   are ALSO 6 `-max.toml` triples (adversarial-verifier-max, code-architect-max, code-reviewer-max,
   planner-max, security-reviewer-max, tdd-guide-max) which are ALSO byte-identical triples — these
   have NO `.md` source (they are model-variant TOMLs). Decision: the byte-group family covers ALL
   20 toml basenames (14 base + 6 -max) as triples. The md↔toml token test (#422.2) covers only the
   14 base agents that HAVE a `.md`.

4. **#422.2 RED/GREEN reality at HEAD:** `write_set_granularity` appears 1× in
   `agents/workflow-planner.md` AND 1× in EACH of the three `workflow-planner.toml` twins (#413
   landed them). So the parity test is **GREEN at HEAD** for that token. The test is a REGRESSION
   guard (goes RED if a future feature paragraph is added to a `.md` without mirroring the token).

5. **#422.3 — `test-route-reachability.js` is NOT currently pinned-by-name inside any validator.**
   The route-reachability CONTRACT lives as a parallel reachability check (claude validator
   lines 840-872). So pinning `test-agent-profile-parity.js` in the test chain is a genuinely NEW
   assertion class. Design: each validator reads `package.json` and asserts its OWN npm chain string
   contains `test-agent-profile-parity.js`.

------------------------------------------------------------------------------------------------
## #414 — sink-side behavior test coverage
------------------------------------------------------------------------------------------------

### Source-of-truth being asserted (sink-merge branch-delete ordering)
`scripts/kaola-workflow-sink-merge.js` lines 500-522 (#397.1 block). ORDER on the ONLINE path:
  1. `git push origin --delete -- <branch>`   (line 509, ONLY when `!OFFLINE`)
  2. `git merge-base --is-ancestor <branch> <defBranch>`  (line 514, verification)
  3. `git branch -D -- <branch>`               (line 518, force-delete only when mergedIntoDefault)
The "spurious branch-worktree-resolved" alarm is the `branch_removed:'failed'` →
`branch-worktree-resolved` violation that the #397.1 fix eliminated.

### `defaultBranch()` probe chain being asserted
`scripts/kaola-workflow-claim.js` lines 398-424, EXPORTED at line 2735. Chain:
  1. `git symbolic-ref --short refs/remotes/origin/HEAD`  (local, no network) → strip `origin/`
  2. if `OFFLINE` → return `'main'` (never probes network)
  3. `git remote show origin` → parse `HEAD branch: <name>`
  4. `git ls-remote --symref origin HEAD` → parse `ref: refs/heads/<name>\tHEAD`
  5. fallback hardcoded `'main'`
NOTE: `OFFLINE` is captured at module load from `KAOLA_WORKFLOW_OFFLINE === '1'`. In
`test-claim-hardening.js` the module is required at the top WITHOUT `KAOLA_WORKFLOW_OFFLINE=1`
(line 13 `delete`s it), so `OFFLINE===false` for the whole file → the network probes (steps 3/4)
ARE reachable. Good — that lets us test the symbolic-ref hit and the hardcoded-main fallback against
a real local repo with NO remote (the network probes throw on a no-remote repo and fall through to
`'main'`).

### #414.1 — bare-remote sink scenario in `scripts/simulate-workflow-walkthrough.js`

INSERT POINT: a new function placed immediately AFTER `testSinkMergeReRebasesOnFfRace()` which ENDS
at **line 5590** (`}` on 5590). Insert the new function starting at **line 5591** (before the blank
line / `testFastE2EMergeFullChain` at 5592). REGISTER the call alongside the other sink tests — the
call site list runs near the bottom of the file; add `testSinkMergeBareRemoteDeleteOrder();` in the
same block where `testSinkMergeReRebasesOnFfRace();` / `testSinkMergeNonDefaultBranchMaster();` are
invoked (grep for `testSinkMergeReRebasesOnFfRace();` to find the live call site and add the new call
directly after it).

PATTERN TO MIMIC: `testSinkMergeReRebasesOnFfRace` (lines 5556-5590) — it is the ONLINE bare-remote
sink test (uses `initGitRepoWithBareRemote`, `KAOLA_WORKFLOW_OFFLINE: '0'`,
`KAOLA_WORKFLOW_SKIP_TESTGATE: '1'`). Helpers used: `initGitRepoWithBareRemote(tmp)` (line 3701),
`GIT_ISOLATION_ENV` (line 3686), `sinkMergeScript` (line 13), `assert` (top-of-file).

EXACT NEW SCENARIO (assert the delete-order + no spurious branch-worktree-resolved):

```js
// #414: ONLINE bare-remote sink — the #397.1 branch-delete choreography must fire in order
// (push --delete BEFORE merge-base --is-ancestor BEFORE branch -D) and leave NO local branch and
// NO spurious branch-worktree-resolved closure violation. We trace git's own order with a wrapper
// `git` shim that logs each invocation, then assert the recorded order.
function testSinkMergeBareRemoteDeleteOrder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink-bare-order-')));
  const remotePath = initGitRepoWithBareRemote(tmp);
  const traceLog = path.join(tmp + '-trace.log');
  const binDir = path.join(tmp + '-bin');
  fs.mkdirSync(binDir, { recursive: true });
  // A `git` wrapper that appends its argv to traceLog then execs the real git. Placed first on PATH.
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim() || '/usr/bin/git';
  const shim = path.join(binDir, 'git');
  fs.writeFileSync(shim,
    '#!/bin/sh\n' +
    'printf "%s\\n" "$*" >> "' + traceLog + '"\n' +
    'exec "' + realGit + '" "$@"\n');
  fs.chmodSync(shim, 0o755);
  const env = { ...process.env, ...GIT_ISOLATION_ENV, PATH: binDir + ':' + process.env.PATH,
    GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  try {
    spawnSync('git', ['-C', tmp, 'checkout', '-b', 'workflow/issue-4140'], { env });
    fs.writeFileSync(path.join(tmp, 'feat.txt'), 'impl');
    spawnSync('git', ['-C', tmp, 'add', 'feat.txt'], { env });
    spawnSync('git', ['-C', tmp, 'commit', '-m', 'feat: impl 4140'], { env });
    spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'workflow/issue-4140'], { env });
    fs.writeFileSync(traceLog, ''); // reset the trace right before the sink call
    const result = spawnSync(process.execPath, [sinkMergeScript, '--project', 'issue-4140', '--branch', 'workflow/issue-4140'], {
      cwd: tmp, encoding: 'utf8',
      env: { ...env, KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_WORKFLOW_SKIP_TESTGATE: '1' }
    });
    assert(result.status === 0, '#414: bare-remote sink must exit 0, got ' + result.status + '\nstderr: ' + result.stderr);
    const trace = fs.readFileSync(traceLog, 'utf8');
    const iDelete = trace.indexOf('push origin --delete');
    const iAncestor = trace.indexOf('merge-base --is-ancestor');
    const iBranchD = trace.search(/branch -D /);
    assert(iDelete >= 0, '#414: sink must run `push origin --delete` on the online path, trace:\n' + trace);
    assert(iAncestor >= 0, '#414: sink must run `merge-base --is-ancestor` verification, trace:\n' + trace);
    assert(iBranchD >= 0, '#414: sink must force-delete the local branch with `branch -D`, trace:\n' + trace);
    assert(iDelete < iAncestor, '#414: `push --delete` must fire BEFORE `merge-base --is-ancestor`');
    assert(iAncestor < iBranchD, '#414: `merge-base --is-ancestor` must fire BEFORE `branch -D`');
    // No spurious branch-worktree-resolved: the local feature branch is gone and the receipt's
    // branch_removed is 'removed' (the #397.1 fix), so no closure violation is recorded.
    const branchList = spawnSync('git', ['-C', tmp, 'branch', '--list', 'workflow/issue-4140'], { encoding: 'utf8', env }).stdout.trim();
    assert(branchList === '', '#414: local feature branch must be deleted (no leftover → no branch-worktree-resolved alarm), got: ' + branchList);
    assert(!/branch-worktree-resolved/.test(result.stdout + result.stderr),
      '#414: no spurious branch-worktree-resolved violation, got:\n' + result.stdout + result.stderr);
    console.log('testSinkMergeBareRemoteDeleteOrder: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(remotePath, { recursive: true, force: true });
    try { fs.rmSync(binDir, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(traceLog, { force: true }); } catch (_) {}
  }
}
```

IMPLEMENTER NOTE: the sink-merge already runs `git push -u origin <branch>` self-heal etc., so the
trace will contain many `git` lines; the `indexOf`/order asserts only key on the three target tokens.
If `which git` is unavailable in CI, the fallback `/usr/bin/git` is used; verify on the dev box that
`/usr/bin/git` resolves (it does on this darwin host). If the wrapper-shim approach proves brittle in
the chain, the FALLBACK design is a pure-receipt assertion (drop the shim, assert
`result.status===0` + `branchList===''` + no `branch-worktree-resolved` token) which still covers the
"no spurious alarm" half of the AC; but prefer the order-trace form (it is the load-bearing AC half).

### #414.2 — `defaultBranch` probe-chain unit in `scripts/test-claim-hardening.js`

INSERT POINT: append a new `{ … }` block at the END of the file, AFTER the `#416` block which ends at
**line 178** (`}` on 178) and BEFORE the final `if (failed > 0)` summary at **line 180**. Insert the
new block at line 179.

`defaultBranch` is already exported (claim.js line 2735); require it from the existing destructure or
add it. The top-of-file destructure is line 15:
`const { ghExec, isSafeBranchArg, removeBranch, postAdvisoryClaim } = require('./kaola-workflow-claim.js');`
ADD `defaultBranch` to that destructure (it's the simplest; or require inside the block like the
`#398` block does at line 88). Recommended: add to line-15 destructure.

EXACT NEW BLOCK (drives the REAL exported fn against REAL repos; `OFFLINE` is false for this file):

```js
// --- #414.2 defaultBranch probe-chain (symbolic-ref → remote show → ls-remote --symref → main) ---
{
  const cp = require('child_process');
  const GIT_ISO = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  const genv = { ...process.env, ...GIT_ISO, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t' };
  // (1) symbolic-ref hit: origin/HEAD set to 'trunk' → defaultBranch resolves 'trunk' (local, no net).
  {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-defbr-symref-')));
    try {
      cp.spawnSync('git', ['init', '-b', 'trunk', dir], { env: genv });
      fs.writeFileSync(path.join(dir, 'r.md'), 'x');
      cp.spawnSync('git', ['-C', dir, 'add', '-A'], { env: genv });
      cp.spawnSync('git', ['-C', dir, 'commit', '-m', 's'], { env: genv });
      const bare = dir + '-bare';
      cp.spawnSync('git', ['init', '--bare', '-b', 'trunk', bare], { env: genv });
      cp.spawnSync('git', ['-C', dir, 'remote', 'add', 'origin', bare], { env: genv });
      cp.spawnSync('git', ['-C', dir, 'push', '-u', 'origin', 'trunk'], { env: genv });
      cp.spawnSync('git', ['-C', dir, 'remote', 'set-head', 'origin', 'trunk'], { env: genv }); // sets refs/remotes/origin/HEAD
      const saved = process.env.GIT_CONFIG_GLOBAL, saved2 = process.env.GIT_CONFIG_NOSYSTEM;
      process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1';
      assert(defaultBranch(dir) === 'trunk',
        '#414.2: symbolic-ref probe resolves the local origin/HEAD branch (trunk), got: ' + defaultBranch(dir));
      if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved;
      if (saved2 === undefined) delete process.env.GIT_CONFIG_NOSYSTEM; else process.env.GIT_CONFIG_NOSYSTEM = saved2;
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(bare, { recursive: true, force: true });
    } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  }
  // (2) hardcoded-main fallback: a repo with NO origin/HEAD and NO remote → all probes miss → 'main'.
  {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-defbr-fallback-')));
    try {
      cp.spawnSync('git', ['init', '-b', 'whatever', dir], { env: genv });
      fs.writeFileSync(path.join(dir, 'r.md'), 'x');
      cp.spawnSync('git', ['-C', dir, 'add', '-A'], { env: genv });
      cp.spawnSync('git', ['-C', dir, 'commit', '-m', 's'], { env: genv });
      // no remote, no origin/HEAD: symbolic-ref misses, remote show / ls-remote throw → fallback 'main'
      const saved = process.env.GIT_CONFIG_GLOBAL, saved2 = process.env.GIT_CONFIG_NOSYSTEM;
      process.env.GIT_CONFIG_GLOBAL = '/dev/null'; process.env.GIT_CONFIG_NOSYSTEM = '1';
      assert(defaultBranch(dir) === 'main',
        '#414.2: with no origin/HEAD and no remote, the chain falls back to hardcoded main, got: ' + defaultBranch(dir));
      if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved;
      if (saved2 === undefined) delete process.env.GIT_CONFIG_NOSYSTEM; else process.env.GIT_CONFIG_NOSYSTEM = saved2;
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  }
}
```

IMPLEMENTER NOTE on the probe chain: `defaultBranch()` shells `git` WITHOUT `-C`-isolating the global
config? — NO, it passes `['-C', root, …]`. But it does NOT pass `GIT_CONFIG_GLOBAL`/`NOSYSTEM` itself,
so the test sets them in `process.env` around the call (the script inherits the parent env). The
`saved`/restore dance keeps the rest of the file unaffected. The two asserts above cover BOTH ENDS of
the chain (probe-1 hit + final fallback), which is the AC's "fallback chain" intent. The two network
middle steps (remote show / ls-remote) are exercised-as-throwing in the fallback case (no remote);
asserting their happy path requires a live network and is out of scope (and `OFFLINE` short-circuits
them anyway in real use). Two assertions satisfy the AC ("a defaultBranch probe-chain unit").

------------------------------------------------------------------------------------------------
## #418 — contract-wiring hardening
------------------------------------------------------------------------------------------------

### #418.1 — config/hooks.json family in `scripts/validate-script-sync.js`

The three files differ ONLY on the compact-resume token (see CORRECTION 2). The generic
`renameNormalize` regex over-renames the `.sh` hook tokens, so DO NOT use the existing
RENAME_NORMALIZED_FAMILIES + generic regex. Instead add a DEDICATED byte-group-style family with a
purpose-built normalizer, OR (simpler, recommended) add a dedicated check block.

RECOMMENDED IMPLEMENTATION — a new top-level const + a dedicated check loop:

INSERT the new family const AFTER `RENAME_NORMALIZED_FAMILIES` (ends at line 226) and BEFORE
`renameNormalize` (line 232). New const:

```js
// #418.1: the per-forge config/hooks.json (codex/gitlab/gitea plugin trees). These are
// rename-normalized: identical EXCEPT the SessionStart compact-resume command path, which carries the
// forge-renamed script base name (kaola-{forge}-workflow-codex-compact-resume.js). Every OTHER
// kaola-workflow-* token in the JSON is a .sh hook that STAYS base-named across all forges, so the
// generic renameNormalize() (which rewrites every kaola-workflow-<name>) cannot be used — we
// normalize ONLY the codex-compact-resume token. Reference = codex tree (the base-named source).
const CONFIG_HOOKS_FAMILY = {
  label: 'config/hooks.json forge ports',
  reference: 'plugins/kaola-workflow/config/hooks.json',
  ports: [
    { forge: 'gitlab', file: 'plugins/kaola-workflow-gitlab/config/hooks.json' },
    { forge: 'gitea', file: 'plugins/kaola-workflow-gitea/config/hooks.json' },
  ],
};
// Normalize ONLY the compact-resume script token (the sole forge-renamed string in config/hooks.json).
function normalizeConfigHooks(referenceText, forge) {
  return referenceText.replace(
    /kaola-workflow-codex-compact-resume/g,
    `kaola-${forge}-workflow-codex-compact-resume`);
}
```

INSERT the check loop in `if (require.main === module)`, AFTER the RENAME_NORMALIZED_FAMILIES loop
(ends at line 291) and BEFORE the `if (missing.length === 0 …)` summary at line 293:

```js
  // #418.1: config/hooks.json forge ports (compact-resume token normalized; .sh tokens stay base).
  {
    const refText = readOrNull(path.join(repoRoot, CONFIG_HOOKS_FAMILY.reference));
    if (refText === null) {
      missing.push(CONFIG_HOOKS_FAMILY.reference);
    } else {
      const refStr = refText.toString('utf8');
      for (const port of CONFIG_HOOKS_FAMILY.ports) {
        const portText = readOrNull(path.join(repoRoot, port.file));
        if (portText === null) {
          missing.push(port.file);
          continue;
        }
        const expected = normalizeConfigHooks(refStr, port.forge);
        if (portText.toString('utf8') !== expected) {
          drift.push(`${CONFIG_HOOKS_FAMILY.label}: ${port.file} differs from ${CONFIG_HOOKS_FAMILY.reference} (compact-resume-normalized for ${port.forge})`);
        }
      }
    }
  }
```

ALSO update the success log (line 294) to mention the new family (cosmetic but keeps the count honest):
change to e.g. `… ${RENAME_NORMALIZED_FAMILIES.length} rename-normalized families, and 1 config/hooks.json family in sync.`
And export it (line 314): add `CONFIG_HOOKS_FAMILY, normalizeConfigHooks` to `module.exports`.

VERIFICATION: `normalizeConfigHooks(codex, 'gitlab') === gitlab` and `… 'gitea') === gitea` was
confirmed conceptually — the only diff line is the compact-resume token; design-node verified the diff
is EXACTLY one line. tdd-guide should add a node-level assert proving this normalizer matches HEAD
(it must be GREEN at HEAD).

### #418.2 — append `test-parallel.js --self-test` to the claude chain in `package.json`

INSERT POINT: `package.json` line 37, the `"test:kaola-workflow:claude"` value. Append the new step
into the `&&` chain. Recommended placement: right after `test-parallel-batch.js` (keeps the two
parallel tests adjacent). The current substring is:
`… && node scripts/test-parallel-batch.js && node scripts/test-edition-sync.js …`
Change to:
`… && node scripts/test-parallel-batch.js && node scripts/test-parallel.js --self-test && node scripts/test-edition-sync.js …`
VERIFIED: `node scripts/test-parallel.js --self-test` exits 0 ("test-parallel self-test passed",
13 assertions). NOTE: this couples #418.2 with #422.3 — both edit `package.json`'s claude chain; the
implementer of #422.3 reads the chain string to pin `test-agent-profile-parity.js`, so SEQUENCE
#418.2 + #422.3 carefully (do #418.2 first, then #422.3 reads the post-#418.2 chain). They are in the
same node's write set if package.json is owned by one node; otherwise order the ledger so package.json
edits are not split across two concurrent nodes (disjointness: package.json is a single file → ONE
node must own it).

### #418.4 — gitea claim.js twin parity comment (#369 clarifier)

The gitlab twin `plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js` lines 1778-1779:
```
    // #369: truthful ONLINE token — all closed -> already_closed; any member open/failed -> partial
    // (never `skipped_offline`, the OFFLINE-only token).
```
The gitea twin `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js` line 1758 currently:
```
    // #369: truthful ONLINE token — all closed -> already_closed; any member open/failed -> partial.
```
It is MISSING the second clarifying line. EDIT: at gitea line 1758, change the trailing `partial.` to
`partial` and add the second comment line, so lines 1758-1759 become:
```
    // #369: truthful ONLINE token — all closed -> already_closed; any member open/failed -> partial
    // (never `skipped_offline`, the OFFLINE-only token).
```
(i.e. drop the period after `partial`, insert a new line `    // (never \`skipped_offline\`, the OFFLINE-only token).`
ABOVE the existing line 1759 `remoteIssueClosed = (closedIssues.length === issueNumbers.length) ? …`).
This is a COMMENT-ONLY edit (no behavior change). It is the bundle-member-probe site (lines 1745-1759),
matching gitlab's bundle site (lines 1765-1780) — NOT the single-issue site at 1760.

### #418.5 — adaptive-behavior smoke scenario in BOTH forge walkthroughs

Exercise the `--freeze-checked` → `governance_ack_stale` contract (the #408 fused-handoff SPAWN-1/2
chain) under the forge mock. This is a NEW adaptive behavior present in the forge plan-validator ports.

GITLAB: file `plugins/kaola-workflow-gitlab/scripts/simulate-gitlab-workflow-walkthrough.js`.
INSERT a new function AFTER `testGitlabAdaptive()` (ends at line 677, `console.log('testGitlabAdaptive: PASSED');`)
and BEFORE `function glInitGitRepo` (line 690). REGISTER the call by adding
`testGitlabAdaptiveFreezeChecked();` directly after `testGitlabAdaptive();` (currently line 1293).

GITEA: file `plugins/kaola-workflow-gitea/scripts/simulate-gitea-workflow-walkthrough.js`.
INSERT a new function AFTER `testGiteaAdaptive()` (ends at line 939) and before the next function.
REGISTER `testGiteaAdaptiveFreezeChecked();` directly after `testGiteaAdaptive();` (currently line 1358).

EXACT NEW SCENARIO (gitlab form; gitea form is the same with gitea/gitlab + valScript path swapped):

```js
// #418.5: adaptive new-behavior smoke — the #408 fused freeze chain on the FORK validator.
// --freeze-checked returns the planHash WITHOUT writing; a subsequent --freeze --governance-ack with
// a STALE hash (plan mutated between the two spawns) must refuse governance_ack_stale and NOT write.
function testGitlabAdaptiveFreezeChecked() {
  const valScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
  const PLAN = [
    '# Workflow Plan', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| e | code-explorer | — | — | 1 | sequence |',
    '| i | tdd-guide | e | lib/x.js | 1 | sequence |',
    '| r | code-reviewer | i | — | 1 | sequence |',
    '| d | finalize | r | — | 1 | sequence |', ''
  ].join('\n');
  function spawnNode(script, args, cwd, env) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }, env || {})
    });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-freeze-checked-'));
  try {
    const planPath = path.join(tmp, 'workflow-plan.md');
    fs.writeFileSync(planPath, PLAN);
    // SPAWN 1: --freeze-checked validates + returns planHash, does NOT write plan_hash into the file.
    const checked = JSON.parse(spawnNode(valScript, [planPath, '--freeze-checked', '--json'], tmp).stdout);
    assert.strictEqual(checked.result, 'in-grammar', 'gitlab #418.5: --freeze-checked is in-grammar');
    assert.strictEqual(checked.frozen, false, 'gitlab #418.5: --freeze-checked does NOT freeze');
    assert.ok(typeof checked.planHash === 'string' && checked.planHash.length > 0,
      'gitlab #418.5: --freeze-checked returns a planHash');
    assert.ok(!fs.readFileSync(planPath, 'utf8').includes('plan_hash:'),
      'gitlab #418.5: --freeze-checked leaves the file unfrozen (no plan_hash stamped)');
    // Mutate the plan AFTER governance (dodging the ack the operator approved).
    fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('lib/x.js', 'lib/z.js'));
    // SPAWN 2: --freeze --governance-ack <stale hash> must refuse governance_ack_stale, no write.
    const stale = JSON.parse(spawnNode(valScript, [planPath, '--freeze', '--governance-ack', checked.planHash, '--json'], tmp).stdout);
    assert.strictEqual(stale.result, 'refuse', 'gitlab #418.5: stale governance-ack must refuse');
    assert.strictEqual(stale.reason, 'governance_ack_stale', 'gitlab #418.5: refuse reason is governance_ack_stale');
    assert.strictEqual(stale.frozen, false, 'gitlab #418.5: governance_ack_stale must NOT write/freeze');
    assert.ok(!fs.readFileSync(planPath, 'utf8').includes('plan_hash:'),
      'gitlab #418.5: governance_ack_stale leaves the plan unfrozen');
    console.log('testGitlabAdaptiveFreezeChecked: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
```

GITEA form: identical body; rename function `testGiteaAdaptiveFreezeChecked`, swap
`valScript` to `plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js`, tmp
prefix `kw-gt-freeze-checked-`, and the assert messages `gitea #418.5: …`. Register the call after
`testGiteaAdaptive();` (line 1358).

IMPLEMENTER NOTE: BOTH forge walkthroughs already `require('os')`, `fs`, `path`, `assert`,
`spawnSync`, and define `root` (gitea header lines 1-12; gitlab equivalent). The plan grammar above
is COPIED verbatim from the existing `testGitlabAdaptive`/`testGiteaAdaptive` PLAN (lines 237-245 /
506-514) so it is guaranteed in-grammar. This is OFFLINE (`KAOLA_WORKFLOW_OFFLINE: '1'`) so no forge
mock (glab/tea) is needed — the plan-validator is forge-neutral. The "under the forge mock" phrasing
in the AC is satisfied by running the FORK validator (`kaola-{forge}-workflow-plan-validator.js`)
which require()s the forge classifier; that IS the forge surface for the adaptive grammar.

------------------------------------------------------------------------------------------------
## #422 — agent-profile parity contract
------------------------------------------------------------------------------------------------

### CONFIRMED .toml twin inventory (md5-verified byte-identical triples at HEAD)
14 BASE agents — each has `agents/<name>.md` AND a byte-identical `.toml` triple in
plugins/kaola-workflow{,-gitlab,-gitea}/agents/:
  adversarial-verifier, build-error-resolver, code-architect, code-explorer, code-reviewer,
  contractor, doc-updater, implementer, issue-scout, knowledge-lookup, planner, security-reviewer,
  tdd-guide, workflow-planner   → ALL IDENTICAL.
6 -max VARIANTS — `.toml` triple only, NO `.md` source (byte-identical triples too):
  adversarial-verifier-max, code-architect-max, code-reviewer-max, planner-max,
  security-reviewer-max, tdd-guide-max.

### #422.1 — byte-group family in `scripts/validate-script-sync.js`

Add a NEW entry to `BYTE_IDENTICAL_GROUPS` (array ends at line 191) — ONE group per toml basename, OR
a single programmatic block. RECOMMENDED: a programmatic addition (20 toml basenames as triples)
appended to BYTE_IDENTICAL_GROUPS at module-init. INSERT just before the closing `];` at line 191:

```js
  // #422.1: agent-profile .toml triples — each agent's three plugin-tree .toml files
  // (codex/gitlab/gitea) must be byte-identical. Built programmatically from the codex tree's
  // agents/ directory so a new profile is auto-covered. Includes the 6 -max model variants.
  ...require('fs').readdirSync(path.join(repoRoot, 'plugins/kaola-workflow/agents'))
    .filter(f => f.endsWith('.toml'))
    .map(f => ({
      label: 'agent-profile toml triple (' + f + ')',
      files: [
        'plugins/kaola-workflow/agents/' + f,
        'plugins/kaola-workflow-gitlab/agents/' + f,
        'plugins/kaola-workflow-gitea/agents/' + f,
      ],
    })),
```

NOTE: `path` and `repoRoot` are already in scope at module top (lines 7, 9). `require('fs')` is
already required at line 6 — use the existing `fs` binding (`fs.readdirSync(...)`) rather than
re-requiring; the snippet above shows the safe form but the implementer should use the module's `fs`.
The existing check loop (line 255) already iterates `BYTE_IDENTICAL_GROUPS` generically — no loop edit
needed. The success-count log (line 294) auto-reflects the new `.length`.

### #422.2 — new file `scripts/test-agent-profile-parity.js`

PURPOSE: a regression guard that goes RED when a feature token is added to an `agents/<name>.md`
without mirroring it into all three `<name>.toml` twins. GREEN at HEAD (verified:
`write_set_granularity` is in workflow-planner.md AND all three twins).

FEATURE TOKEN LIST (the curated key-phrases the test checks; the test only flags a token if it
ACTUALLY appears in the .md — so unused tokens never cause false RED):
  - write_set_granularity
  - governance_ack_stale
  - sync-order
  - ledger-compare
  - running-set
  - freeze-checked
  - planner_control_boundary_violation
  - main-session-gate
HEAD STATE for these in workflow-planner.md: only `write_set_granularity` is present (=1) and is
present in all three twins → GREEN. `main-session-gate` is asserted-present in workflow-planner.md by
the claude validator (line 838) — confirm it is ALSO in the toml twins before adding it to the list
(if it is .md-only, it would create a RED at HEAD; the design-node could not confirm its toml presence
— IMPLEMENTER MUST grep all three twins for each candidate token and only KEEP tokens that are GREEN
at HEAD, dropping any that would go RED, since the AC requires GREEN-at-HEAD). The MINIMAL guaranteed-
GREEN list is `['write_set_granularity']`; the test is structured so adding more tokens later is a
one-line edit.

COMPLETE SKELETON:

```js
#!/usr/bin/env node
'use strict';

// #422.2: agent-profile md↔toml token-pin parity. For each agents/<name>.md that has a .toml twin
// triple (codex/gitlab/gitea), any "feature token" present in the .md MUST also appear in ALL THREE
// .toml twins. Goes RED when a feature paragraph is added to a .md without mirroring the token into
// the toml profiles (the #404 planner-gap class). GREEN at HEAD (#413 landed write_set_granularity
// into the three workflow-planner.toml twins). This is a forge-neutral regression guard run in the
// claude chain (and pinned by all four validate-*-contracts.js, #422.3).

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Curated feature tokens. A token is only enforced for a profile when it APPEARS in that .md, so an
// unused token never causes a false RED. Keep only tokens that are GREEN at HEAD (present in the .md
// AND in all three twins) — add a new token here when a feature paragraph is mirrored into the tomls.
const FEATURE_TOKENS = [
  'write_set_granularity',
];

// codex tree is the canonical agents/ source for the toml triple.
const TOML_TREES = [
  'plugins/kaola-workflow/agents',
  'plugins/kaola-workflow-gitlab/agents',
  'plugins/kaola-workflow-gitea/agents',
];

function read(p) {
  try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; }
}

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

const mdDir = path.join(root, 'agents');
const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));

for (const md of mdFiles) {
  const base = md.slice(0, -'.md'.length);
  // Only enforce profiles that have a .toml twin in ALL THREE trees.
  const tomlPaths = TOML_TREES.map(t => t + '/' + base + '.toml');
  const tomlContents = tomlPaths.map(read);
  if (tomlContents.some(c => c === null)) continue; // no full twin set → not a parity target
  const mdText = read('agents/' + md);
  if (mdText === null) continue;
  for (const token of FEATURE_TOKENS) {
    if (!mdText.includes(token)) continue; // token not used by this profile → nothing to mirror
    tomlPaths.forEach((tp, idx) => {
      assert(tomlContents[idx].includes(token),
        '#422.2: token "' + token + '" is in agents/' + md + ' but MISSING from ' + tp +
        ' (md↔toml feature drift — mirror the feature paragraph token into the .toml twin)');
    });
  }
}

if (failed > 0) {
  console.error('agent-profile parity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('agent-profile parity tests passed (' + passed + ' assertions)');
}
```

REGISTER in `package.json` claude chain (line 37): add `&& node scripts/test-agent-profile-parity.js`
into the `&&` chain. RECOMMENDED placement: right before `node scripts/validate-workflow-contracts.js`
(so the parity test runs ahead of the validator that pins it), i.e. change
`… && node scripts/test-route-reachability.js && node scripts/validate-workflow-contracts.js …`
to
`… && node scripts/test-route-reachability.js && node scripts/test-agent-profile-parity.js && node scripts/validate-workflow-contracts.js …`

RED-FIXTURE DEMONSTRATION (for tdd-guide, NOT committed): the test goes RED if you transiently add a
token to a .md that is absent from a twin. To PROVE the guard bites, the tdd-guide can temporarily add
`'governance_ack_stale'` to FEATURE_TOKENS and a `governance_ack_stale` mention to workflow-planner.md
(twins lack it → RED), confirm RED, then revert. Do NOT ship that mutation.

### #422.3 — pin `test-agent-profile-parity.js` in all 4 validators

Each validator reads `package.json` and asserts ITS OWN npm chain contains the test. NOTE the four
validators run in four DIFFERENT chains, but #422.2's test is only IN the claude chain. Decision:
ALL FOUR validators assert the CLAUDE chain string (`scripts.test:kaola-workflow:claude`) contains
`test-agent-profile-parity.js` — the parity test is forge-neutral and lives in the claude chain only;
each validator simply pins that the chain wires it (mirrors how the route-reachability contract is a
single forge-neutral surface checked from each edition's validator). This is the simplest correct
pin and matches the AC ("registered in the test chain").

Each validator already has `read()` returning repo-root-relative file text and `assert(cond, msg)`.
The claude validator already does `const packageJson = JSON.parse(read('package.json'));` at line 458;
reuse it. The codex/gitlab/gitea validators read package.json via `read('package.json')` / `require`.

CLAUDE — `scripts/validate-workflow-contracts.js`: INSERT before the final
`console.log('Workflow contract validation passed');` (line 874). Reuses existing `packageJson`:
```js
// #422.3: the md↔toml agent-profile token-pin contract (test-agent-profile-parity.js) must be wired
// into the claude test chain (mirrors how test-route-reachability.js guards the route surface).
{
  const claudeChain = (packageJson.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}
```

CODEX — `scripts/validate-kaola-workflow-contracts.js`: INSERT before the final
`console.log('Kaola-Workflow Codex contract validation passed');`. (No existing packageJson binding —
parse it.)
```js
// #422.3: the agent-profile md↔toml token-pin test must be wired into the claude chain.
{
  const pkg = JSON.parse(read('package.json'));
  const claudeChain = (pkg.scripts || {})['test:kaola-workflow:claude'] || '';
  assert(claudeChain.includes('test-agent-profile-parity.js'),
    '#422.3: scripts."test:kaola-workflow:claude" must run node scripts/test-agent-profile-parity.js');
}
```

GITLAB — `plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js`: INSERT
before the final `console.log('Kaola-Workflow GitLab contract validation passed');`. Same block as
codex (its `read('package.json')` resolves to repo root because `root = path.resolve(__dirname,'..','..','..')`).

GITEA — `plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js`: INSERT
before the final `console.log('Kaola-Workflow Gitea contract validation passed');`. Same block as codex.

IMPLEMENTER NOTE: all four validators have an `assert(condition, message)` helper and a
`read(relativePath)` helper that joins repo root. Confirm `read('package.json')` resolves at repo root
in each (it does: claude/codex `root = resolve(__dirname,'..')`; gitlab/gitea
`root = resolve(__dirname,'..','..','..')`). The codex/gitlab/gitea validators wrap groups of asserts
in `{ … }` blocks already; place the new block at file end inside its own `{ … }`.

------------------------------------------------------------------------------------------------
## CROSS-EDITION & SEQUENCING (critical — this is a cross-edition diff)
------------------------------------------------------------------------------------------------

This bundle touches edition trees (gitlab/gitea walkthroughs + claim.js twin + all 4 validators +
config/hooks.json + edition agent tomls). Per Validation Policy, FINALIZATION REQUIRES ALL FOUR
chains green, run SEQUENTIALLY:
  npm run test:kaola-workflow:claude && :codex && :gitlab && :gitea
A green claude chain alone is INSUFFICIENT (npm test short-circuits on first failure).

FILE-OWNERSHIP / DISJOINTNESS (the validator enforces declared_write_set disjointness across a
parallel frontier — do NOT split a single file across two concurrent nodes):
  - `package.json` — touched by #418.2 AND #422.3 → ONE node must own package.json; sequence
    #418.2's append before #422.3's append (or do both in the same node's write set).
  - `scripts/validate-script-sync.js` — touched by #418.1 AND #422.1 → ONE node owns it.
  - The 4 `validate-*-contracts.js` — only #422.3 touches them.
  - `scripts/test-agent-profile-parity.js` — NEW file, #422.2 only.
  - `scripts/test-claim-hardening.js` — #414.2 only.
  - `scripts/simulate-workflow-walkthrough.js` — #414.1 only.
  - gitlab/gitea walkthroughs — #418.5 only.
  - gitea claim.js — #418.4 only (comment-only).

NEW FILE INSTALL/SYNC FOOTPRINT for `scripts/test-agent-profile-parity.js`: it is a CLAUDE-chain test
(like `test-route-reachability.js`), forge-neutral, run only from repo root. It is NOT a COMMON_SCRIPT
(no codex twin needed — `test-route-reachability.js` is also claude-root-only and is NOT in
COMMON_SCRIPTS). It is NOT installed (test scripts are not in the install manifest). Confirm
`validate-script-sync.js` does NOT require a codex twin for it (it won't — it's not added to
COMMON_SCRIPTS). It is `isTestPath`-classified PRODUCTION? — test scripts in `scripts/test-*.js` are
PRODUCTION for the barrier (see memory "#254"), so it MUST be in the authoring node's write set.

CHANGELOG: add ONE [Unreleased] entry covering #414/#418/#422 (this is UNRELEASED work — no version
bump, no tag; mirrors the recent sweep pattern). The CHANGELOG is NOT in any node's hot write set
above — assign it to the doc-updater / contractor finalize node.

design: complete
