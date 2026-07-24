#!/usr/bin/env node
'use strict';

// #356: claim fail-open hardening — gh round-trips are timeout-bounded (claim's ghExec was the one
// uncapped copy), and branch args reject a leading-dash/NUL so a malformed ref can't reach git as a
// flag. REMOTE_TIMEOUT_MS resolves at module load, so the timeout env is set BEFORE require.

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = '500';   // tiny cap for the hang test (set before require)
delete process.env.KAOLA_WORKFLOW_OFFLINE;        // ensure ghExec actually shells the mock

// #531: hermetic HOME — the classifier (spawned by the #519 transient-fault tests) reads parallel_mode
// from ~/.config/kaola-workflow/config.json (os.homedir()) and bypasses to verdict:'green' whenever it
// is not 'auto', with NO env override — short-circuiting the indeterminate/escalate path under test.
// Pin a sandbox HOME seeded with parallel_mode:'auto' so a dev-local non-'auto' config can't turn these
// assertions into spurious "got green" failures (issue #531). Inherited by the classifier subprocess.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
fs.mkdirSync(path.join(kwSandboxHome, '.config', 'kaola-workflow'), { recursive: true });
fs.writeFileSync(
  path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json'),
  JSON.stringify({ parallel_mode: 'auto' }, null, 2) + '\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const { ghExec, isSafeBranchArg, removeBranch, postAdvisoryClaim, defaultBranch, resolveCodexDispatchModeFlag, buildClaimAnchors } = require('./kaola-workflow-claim.js');
const { writeFileAtomicReplace } = require('./kaola-workflow-adaptive-schema.js');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

// --- isSafeBranchArg ---------------------------------------------------------
assert(isSafeBranchArg('workflow/issue-1') === true, '#356: a normal branch is safe');
assert(isSafeBranchArg('-rf') === false, '#356: a leading-dash branch is rejected (would be a git flag)');
assert(isSafeBranchArg('--force') === false, '#356: a double-dash branch is rejected');
assert(isSafeBranchArg('') === false, '#356: an empty branch is rejected');
assert(isSafeBranchArg('a\0b') === false, '#356: a NUL-bearing branch is rejected');
assert(isSafeBranchArg(null) === false, '#356: a non-string branch is rejected');

// --- removeBranch guard (refuses without invoking git) -----------------------
assert(removeBranch(os.tmpdir(), '-D') === false, '#356: removeBranch refuses a leading-dash branch (guard returns false)');

// --- ghExec timeout (a hung remote must not wedge the claim) ------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-ghto-'));
  const mock = path.join(dir, 'gh.js');
  // Keep the process alive ~10s but responsive to SIGTERM (execFileSync's timeout kill).
  fs.writeFileSync(mock, 'setTimeout(() => process.exit(0), 10000);');
  process.env.KAOLA_GH_MOCK_SCRIPT = mock;
  const t0 = Date.now();
  let threw = false;
  try { ghExec(['issue', 'view', '1', '--json', 'state']); } catch (_) { threw = true; }
  const elapsed = Date.now() - t0;
  delete process.env.KAOLA_GH_MOCK_SCRIPT;
  fs.rmSync(dir, { recursive: true, force: true });
  assert(threw, '#356: a hung gh mock makes ghExec throw (killed by the timeout), not hang');
  assert(elapsed < 4000, '#356: ghExec returned within the 500ms cap window (~' + elapsed + 'ms), not the 30s default hang');
}

// --- postAdvisoryClaim truthful status (#356) -------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-pac-'));
  // Mock gh: succeed everything → label added → 'posted'.
  const okMock = path.join(dir, 'gh-ok.js');
  fs.writeFileSync(okMock, "process.stdout.write(''); process.exit(0);");
  // Mock gh: FAIL `issue edit` (the --add-label) → label NOT added → 'failed'.
  const failMock = path.join(dir, 'gh-fail.js');
  fs.writeFileSync(failMock, "const a=process.argv.slice(2); if(a[0]==='issue'&&a[1]==='edit'){process.exit(1);} process.exit(0);");

  process.env.KAOLA_GH_MOCK_SCRIPT = okMock;
  assert(postAdvisoryClaim(1, 'issue-1') === 'posted', '#356: a successful add-label → remote_claim:posted');
  process.env.KAOLA_GH_MOCK_SCRIPT = failMock;
  assert(postAdvisoryClaim(1, 'issue-1') === 'failed', '#356: a failed add-label → remote_claim:failed (zero-footprint claim is VISIBLE)');
  delete process.env.KAOLA_GH_MOCK_SCRIPT;
  fs.rmSync(dir, { recursive: true, force: true });
  // (offline → 'skipped_offline' is covered by the OFFLINE-const guard; not unit-testable here
  // because OFFLINE resolves at module load, before this test can set the env.)
}

// --- writeFileAtomicReplace (#353) ------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-atomic-'));
  const target = path.join(dir, 'sub', 'workflow-state.md'); // nested dir must be created
  const wrote1 = writeFileAtomicReplace(target, 'alpha');
  assert(wrote1 === true, '#353: first write returns true');
  assert(fs.readFileSync(target, 'utf8') === 'alpha', '#353: content written');
  const wrote2 = writeFileAtomicReplace(target, 'alpha');
  assert(wrote2 === false, '#353: unchanged content → no rewrite (returns false)');
  const wrote3 = writeFileAtomicReplace(target, 'beta');
  assert(wrote3 === true && fs.readFileSync(target, 'utf8') === 'beta', '#353: changed content rewritten atomically');
  // No leftover .tmp scratch in the directory (tmp + rename leaves no residue on success).
  const residue = fs.readdirSync(path.dirname(target)).filter(n => n.includes('.tmp'));
  assert(residue.length === 0, '#353: no leftover .tmp file after atomic replace, got ' + JSON.stringify(residue));
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- writeFileAtomicReplace parent-directory fsync ORDERING (#685 / R17) ----
// Node's require('fs') is a process-wide singleton, so patching fs.<method> here is observed by the
// production function's own `const fs = require('fs')` binding (same seam as test-adaptive-node.js's
// T-595-orphan against acquireProjectLock in this same schema module). Every patched method is restored
// in a `finally` so the spy never leaks into a later test in this process.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-atomic-dirfsync-'));
  const parentDir = path.join(dir, 'sub');
  const target = path.join(parentDir, 'workflow-state.md');
  const calls = [];
  const fdToPath = new Map();
  const origOpenSync = fs.openSync;
  const origFsyncSync = fs.fsyncSync;
  const origRenameSync = fs.renameSync;
  const origCloseSync = fs.closeSync;
  fs.openSync = function (p, ...rest) {
    const fd = origOpenSync.call(fs, p, ...rest);
    fdToPath.set(fd, p);
    calls.push({ fn: 'openSync', arg: p, fd });
    return fd;
  };
  fs.fsyncSync = function (fd) {
    calls.push({ fn: 'fsyncSync', arg: fdToPath.get(fd), fd });
    return origFsyncSync.call(fs, fd);
  };
  fs.renameSync = function (a, b) {
    calls.push({ fn: 'renameSync', arg: [a, b] });
    return origRenameSync.call(fs, a, b);
  };
  fs.closeSync = function (fd) {
    calls.push({ fn: 'closeSync', arg: fdToPath.get(fd), fd });
    return origCloseSync.call(fs, fd);
  };
  let wrote;
  try {
    wrote = writeFileAtomicReplace(target, 'gamma');
  } finally {
    fs.openSync = origOpenSync;
    fs.fsyncSync = origFsyncSync;
    fs.renameSync = origRenameSync;
    fs.closeSync = origCloseSync;
  }
  assert(wrote === true, '#685: write with the order-tracking spy in place still returns true');
  const renameIdx = calls.findIndex(c => c.fn === 'renameSync');
  assert(renameIdx !== -1, '#685: renameSync was called, got ' + JSON.stringify(calls));
  const tmpFsyncIdx = calls.findIndex((c, i) => i < renameIdx && c.fn === 'fsyncSync');
  assert(tmpFsyncIdx !== -1, '#685: the tmp-file fd is fsynced BEFORE renameSync (pre-existing #353 contract), got ' + JSON.stringify(calls));
  // The parent directory must be opened AFTER the rename (never before — that would race the rename itself).
  const dirOpenIdx = calls.findIndex((c, i) => i > renameIdx && c.fn === 'openSync' && c.arg === parentDir);
  assert(dirOpenIdx !== -1, '#685: parent directory opened AFTER renameSync, got ' + JSON.stringify(calls));
  const dirOpenFd = dirOpenIdx !== -1 ? calls[dirOpenIdx].fd : undefined;
  const dirFsyncIdx = calls.findIndex((c, i) => i > dirOpenIdx && c.fn === 'fsyncSync' && c.fd === dirOpenFd);
  assert(dirFsyncIdx !== -1,
    '#685: the parent-directory fd is fsynced after open+rename — full required order is ' +
    'fsyncSync(tmpFd) -> renameSync -> openSync(dir) -> fsyncSync(dirFd) -> closeSync(dirFd), got ' + JSON.stringify(calls));
  const dirCloseIdx = calls.findIndex((c, i) => i > dirFsyncIdx && c.fn === 'closeSync' && c.fd === dirOpenFd);
  assert(dirCloseIdx !== -1, '#685: the parent-directory fd is closed after its own fsync, got ' + JSON.stringify(calls));
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- writeFileAtomicReplace platform fail-soft on the parent-directory fsync (#685) --
// A directory open/fsync can be refused on some platforms/filesystems (Windows, EISDIR, EACCES, EINVAL).
// That failure must degrade SILENTLY — never propagate, never turn a previously-accepted write into a
// refusal. Fault-inject fs.openSync to throw ONLY when its path argument is the parent directory, leaving
// the tmp-file openSync untouched, so the durable write itself still has to succeed around the fault.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-atomic-failsoft-'));
  const parentDir = path.join(dir, 'sub');
  const target = path.join(parentDir, 'workflow-state.md');
  const origOpenSync = fs.openSync;

  function patchOpenSyncToFaultOnDir(code) {
    fs.openSync = function (p, ...rest) {
      if (p === parentDir) {
        const err = new Error('#685 fault injection: simulated ' + code + ' opening the parent directory');
        err.code = code;
        throw err;
      }
      return origOpenSync.call(fs, p, ...rest);
    };
  }

  let wrote1, threw1 = false;
  patchOpenSyncToFaultOnDir('EISDIR');
  try { wrote1 = writeFileAtomicReplace(target, 'delta'); } catch (_) { threw1 = true; } finally { fs.openSync = origOpenSync; }
  assert(threw1 === false, '#685: a directory-open failure during the fsync step must NOT propagate (fail-soft)');
  assert(wrote1 === true, '#685: the write still completes and returns its normal true contract despite the fsync failure');
  assert(fs.readFileSync(target, 'utf8') === 'delta', '#685: content is durably written even when parent-dir fsync is unsupported');

  // Fail-soft must degrade EVERY call, not just a one-shot exemption (no wedge / no refusal loop).
  let wrote2, threw2 = false;
  patchOpenSyncToFaultOnDir('EACCES');
  try { wrote2 = writeFileAtomicReplace(target, 'epsilon'); } catch (_) { threw2 = true; } finally { fs.openSync = origOpenSync; }
  assert(threw2 === false && wrote2 === true, '#685: fail-soft degrades every call, not just the first');
  assert(fs.readFileSync(target, 'utf8') === 'epsilon', '#685: content is durably written on the second fail-soft call too');
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- #398.1 assertSafeBranchArg (THROW at creation sites) / #398.2 / #403.8 --
{
  const { assertSafeBranchArg, assertNoNewline, classifyWorktreeError } = require('./kaola-workflow-claim.js');
  let threw = false;
  try { assertSafeBranchArg('-evil', 'test'); } catch (_) { threw = true; }
  assert(threw, '#398.1: assertSafeBranchArg throws on a leading-dash branch');
  threw = false;
  try { assertSafeBranchArg('main\nworktree_path: /tmp/EVIL', 'test'); } catch (_) { threw = true; }
  assert(threw, '#398.1: assertSafeBranchArg throws on a newline-bearing branch (field injection)');
  let ok = true;
  try { assertSafeBranchArg('workflow/issue-1', 'test'); } catch (_) { ok = false; }
  assert(ok, '#398.1: assertSafeBranchArg accepts a normal branch');

  threw = false;
  try { assertNoNewline('a\nb', 'worktree_path'); } catch (_) { threw = true; }
  assert(threw, '#398.2: assertNoNewline throws on a newline value');
  threw = false;
  try { assertNoNewline('safe-value', 'branch'); } catch (_) { threw = true; }
  assert(!threw, '#398.2: assertNoNewline accepts a single-line value');

  assert(classifyWorktreeError("fatal: 'wt' already exists") === 'already_exists', '#403.8: already_exists classified');
  assert(classifyWorktreeError('fatal: not a valid object name') === 'invalid_ref', '#403.8: invalid_ref classified');
  assert(classifyWorktreeError('') === '', '#403.8: empty error → empty class');
  assert(classifyWorktreeError('some weird error') === 'unclassified', '#403.8: unknown error → unclassified');
}

// --- #395.1 buildClosureReceipt undefined-skip (receipt-field-survival) ------
{
  const { buildClosureReceipt } = require('./kaola-workflow-claim.js');
  const r = buildClosureReceipt('proj', 7, { roadmap_source_removed: undefined, roadmap_regenerated: 'regenerated' });
  assert(r.roadmap_source_removed === 'failed', '#395.1: undefined step keeps the seeded failed default (field never vanishes)');
  assert(r.roadmap_regenerated === 'regenerated', '#395.1: a defined step still overwrites the default');
  assert(!('close_disposition' in r), '#395.1/#396.4: undefined close_disposition is not emitted');
  const r2 = buildClosureReceipt('proj', 7, { close_disposition: 'close_pending', keep_open_requested: true });
  assert(r2.close_disposition === 'close_pending', '#396.4: a set close_disposition survives into the receipt');
  assert(r2.keep_open_requested === true, '#396.3: keep_open_requested survives into the receipt');
}

// --- #416 probe-failure-classification (computeClosePendingFinalize + isProbeDegraded) ---------
// TDD: write the FAILING test first before the helpers are extracted + the bug is fixed.
{
  const { computeClosePendingFinalize, isProbeDegraded } = require('./kaola-workflow-claim.js');
  // When the online probe throws, remoteIssueClosed is set to 'skipped_offline' even though
  // OFFLINE is false. The old closePendingFinalize expression evaluated to TRUE in that case
  // (skipped_offline is not 'already_closed' or 'closed'), silently downgrading the
  // remote-members-closed invariant.  The fix must exclude 'skipped_offline' so a probe
  // failure is treated as "unknown" rather than "pending".

  // Scenario 1: probe threw while ONLINE → must NOT be close_pending
  assert(
    computeClosePendingFinalize(false, false, 'skipped_offline') === false,
    '#416: online probe failure (skipped_offline while !OFFLINE) must NOT classify as close_pending'
  );
  // Scenario 2: isProbeDegraded detects the ambiguous case (online but skipped_offline)
  assert(
    isProbeDegraded(false, 'skipped_offline') === true,
    '#416: isProbeDegraded is true when remoteIssueClosed=skipped_offline and OFFLINE=false'
  );
  // Scenario 3: genuinely OFFLINE → isProbeDegraded is false (this is the expected OFFLINE token)
  assert(
    isProbeDegraded(true, 'skipped_offline') === false,
    '#416: isProbeDegraded is false in the true OFFLINE path'
  );
  // Scenario 3b: genuinely OFFLINE → also not close_pending (offline never close-pends)
  assert(
    computeClosePendingFinalize(false, true, 'skipped_offline') === false,
    '#416: offline path never yields close_pending'
  );
  // Scenario 4: normal online close_pending case (probe returned close_pending) → IS close_pending
  assert(
    computeClosePendingFinalize(false, false, 'close_pending') === true,
    '#416: a real close_pending probe result (not skipped_offline) IS close_pending'
  );
  // Scenario 5: already_closed → not close_pending
  assert(
    computeClosePendingFinalize(false, false, 'already_closed') === false,
    '#416: already_closed is not close_pending'
  );
  // Scenario 6: keepIssueOpen → not close_pending
  assert(
    computeClosePendingFinalize(true, false, 'close_pending') === false,
    '#416: keep-open request is not close_pending'
  );
  // Scenario 7: isProbeDegraded is false for normal non-error states
  assert(
    isProbeDegraded(false, 'close_pending') === false,
    '#416: isProbeDegraded is false when probe succeeded (close_pending token)'
  );
  assert(
    isProbeDegraded(false, 'already_closed') === false,
    '#416: isProbeDegraded is false when probe succeeded (already_closed token)'
  );
}

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

// #476: --help is a SAFE no-op + unrecognized flags REFUSE with zero side effects, on the destructive
// lifecycle scripts. Drives the REAL subprocess CLI (not the module) per the issue's acceptance, and
// asserts no archive / no merge / no branch deletion occurred — the KaolaTerminal issue-85 orphan was
// `finalize --help` and `sink-merge ... --help` running to completion.
{
  const { execFileSync } = require('child_process');
  const CLAIM = path.join(__dirname, 'kaola-workflow-claim.js');
  const SINK = path.join(__dirname, 'kaola-workflow-sink-merge.js');
  const env476 = Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_GH_REMOTE_TIMEOUT_MS: '500' });
  const run = (script, argv, cwd) => {
    try { return { code: 0, out: execFileSync('node', [script, ...argv], { cwd, encoding: 'utf8', env: env476 }) }; }
    catch (e) { return { code: (e.status == null ? 1 : e.status), out: String(e.stdout || '') + String(e.stderr || '') }; }
  };
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-476-')));
  const proj = path.join(repo, 'kaola-workflow', 'issue-476t');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'workflow-state.md'), '# State\nstatus: complete\nissue_number: 476\n');
  const g = (a) => { try { execFileSync('git', ['-C', repo, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} };
  g(['init']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']); g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo, '.gitignore'), '.kw/\n'); g(['add', '-A']); g(['commit', '-m', 'init']);
  const archiveDir = path.join(repo, 'kaola-workflow', 'archive');

  // (a) claim finalize --help → usage + exit 0 + NO archive (the destructive path did not run).
  const a = run(CLAIM, ['finalize', '--project', 'issue-476t', '--help'], repo);
  assert(a.code === 0 && /^usage:/m.test(a.out), '#476: claim finalize --help prints usage + exit 0 (got code ' + a.code + ')');
  assert(!fs.existsSync(archiveDir), '#476: claim finalize --help did NOT archive (zero side effects)');

  // (b) claim finalize --typo --json → unknown_flag refuse + exit 1 + NO archive.
  const b = run(CLAIM, ['finalize', '--project', 'issue-476t', '--typo', '--json'], repo);
  let bj = {}; try { bj = JSON.parse(b.out.trim().split('\n').pop()); } catch (_) {}
  assert(b.code === 1 && bj.reason === 'unknown_flag' && (bj.unknownFlags || []).includes('--typo'),
    '#476: claim finalize --typo → unknown_flag refuse exit 1 (got ' + b.out.trim() + ')');
  assert(!fs.existsSync(archiveDir), '#476: claim finalize --typo did NOT archive (zero mutation)');

  // (c) a VALID flag still works (no false-reject regression): status --json.
  const c = run(CLAIM, ['status', '--project', 'issue-476t', '--json'], repo);
  assert(c.code === 0 && /"count"/.test(c.out), '#476: a valid flag (status --json) is NOT false-rejected (got ' + c.out.trim() + ')');

  // (d) sink-merge --help → usage + exit 0 + branch NOT merged/deleted.
  g(['checkout', '-b', 'workflow/issue-476t']);
  fs.writeFileSync(path.join(repo, 'x.txt'), 'x'); g(['add', '-A']); g(['commit', '-m', 'feat']);
  g(['checkout', 'main']);
  const headBefore = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const d = run(SINK, ['--branch', 'workflow/issue-476t', '--project', 'issue-476t', '--help'], repo);
  assert(d.code === 0 && /^usage:/m.test(d.out), '#476: sink-merge --help prints usage + exit 0 (got ' + d.out.trim() + ')');
  const branchStill = execFileSync('git', ['-C', repo, 'branch', '--list', 'workflow/issue-476t'], { encoding: 'utf8' }).trim();
  const headAfter = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert(branchStill !== '' && headAfter === headBefore, '#476: sink-merge --help did NOT merge or delete the branch (zero side effects)');

  // (e) sink-merge --bogus → unknown_flag refuse + exit 1.
  const e = run(SINK, ['--branch', 'workflow/issue-476t', '--project', 'issue-476t', '--bogus'], repo);
  let ej = {}; try { ej = JSON.parse(e.out.trim().split('\n').pop()); } catch (_) {}
  assert(e.code === 1 && ej.reason === 'unknown_flag', '#476: sink-merge --bogus → unknown_flag refuse exit 1 (got ' + e.out.trim() + ')');

  // (f) GREEDY-SWALLOW guard: a value flag must NOT swallow --help / an unknown flag positioned in its
  // value slot (else the help/unknown gate never fires and the destructive transaction runs). This is
  // the path the end-of-argv tests (a)/(d) do NOT exercise.
  const f1 = run(SINK, ['--branch', 'workflow/issue-476t', '--project', '--help'], repo); // --help in --project's value slot
  assert(f1.code === 0 && /^usage:/m.test(f1.out), '#476: sink-merge --project --help must STILL be caught as help (no swallow), got code ' + f1.code + ' ' + f1.out.trim());
  const branchAfterSwallow = execFileSync('git', ['-C', repo, 'branch', '--list', 'workflow/issue-476t'], { encoding: 'utf8' }).trim();
  assert(branchAfterSwallow !== '', '#476: the swallowed --help did NOT merge/delete the branch (zero side effects)');
  const f2 = run(SINK, ['--branch', '--bogus', '--project', 'issue-476t'], repo); // --bogus in --branch's value slot
  let f2j = {}; try { f2j = JSON.parse(f2.out.trim().split('\n').pop()); } catch (_) {}
  assert(f2.code === 1 && f2j.reason === 'unknown_flag', '#476: sink-merge --branch --bogus must refuse unknown_flag (no swallow), got ' + f2.out.trim());
  // claim.js is already swallow-safe (its value branch requires !val.startsWith("--")); confirm it.
  const f3 = run(CLAIM, ['finalize', '--project', '--help'], repo);
  assert(f3.code === 0 && /^usage:/m.test(f3.out), '#476: claim finalize --project --help must be caught as help (no swallow), got code ' + f3.code);

  // (g) SHORT-flag (-h) swallow: a value flag must not swallow `-h` either (it is NOT --prefixed). The
  // sink help gate scans the RAW argv before parseArgs, so `--issue-numbers -h` is still caught as help.
  const g1 = run(SINK, ['--branch', 'workflow/issue-476t', '--project', 'issue-476t', '--issue-numbers', '-h'], repo);
  assert(g1.code === 0 && /^usage:/m.test(g1.out), '#476: sink-merge --issue-numbers -h must STILL be caught as help (raw-argv scan, no -h swallow), got code ' + g1.code + ' ' + g1.out.trim());
  const branchAfterG = execFileSync('git', ['-C', repo, 'branch', '--list', 'workflow/issue-476t'], { encoding: 'utf8' }).trim();
  assert(branchAfterG !== '', '#476: the swallowed -h did NOT merge/delete the branch (zero side effects)');

  fs.rmSync(repo, { recursive: true, force: true });
}

// --- #495: classifier retry envelope (KAOLA_CLASSIFIER_MOCK_SCRIPT seam) --------
// Tests drive the REAL execFileSync subprocess path via a mock classifier script written
// to $TMPDIR. A counter file in $TMPDIR records invocation count so we can assert retry.
//
// Three scenarios are tested on BOTH the single-target and bundle paths:
//   (a) transient → success: mock fails transiently first 1-2 times, then returns green.
//       Assert: claim succeeds + counter > 1 (retry happened).
//   (b) persistent transient → escalate: mock always crashes transiently.
//       Assert: target_set_indeterminate + result:'escalate' (NOT target_unavailable/refuse).
//   (c) determinate non-zero: mock returns clean non-zero exit with a red verdict.
//       Assert: counter == 1 (NOT retried) + result:'refuse' (determinate hard-stop).
{
  const { execFileSync } = require('child_process');
  const CLAIM = path.join(__dirname, 'kaola-workflow-claim.js');

  // Helper: runs the claim.js startup CLI with extra env and returns parsed last JSON line.
  function runClaim(argv, extraEnv, cwd) {
    const e = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_TIMEOUT_MS: '500', // so kill/timeout tests don't hang 30s
      KAOLA_PATH: 'adaptive',             // #538: adaptive is always legal — no switch env needed
      KAOLA_CLASSIFIER_BACKOFF_MS: '0'
    }, extraEnv || {});
    try {
      const out = execFileSync('node', [CLAIM, ...argv], { cwd, encoding: 'utf8', env: e });
      const lines = out.trim().split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1];
      return { code: 0, json: last ? JSON.parse(last) : null };
    } catch (err) {
      const out = String(err.stdout || '') + String(err.stderr || '');
      const lines = out.trim().split('\n').filter(l => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try { return { code: err.status || 1, json: JSON.parse(lines[i]) }; } catch (_) {}
      }
      return { code: err.status || 1, json: null, raw: out };
    }
  }

  // Set up a minimal git repo so worktree provisioning doesn't error
  const repoDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-495-repo-')));
  const g495 = (a) => { try { execFileSync('git', ['-C', repoDir, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} };
  g495(['init']); g495(['config', 'user.email', 't@t']); g495(['config', 'user.name', 't']); g495(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoDir, '.gitignore'), '.kw/\n'); g495(['add', '-A']); g495(['commit', '-m', 'init']);
  // #538: no per-repo config needed — KAOLA_PATH:'adaptive' (the runClaim default) is always legal,
  // and the path-legality gate reads installed_paths from the hermetic HOME (the sandbox seeded above),
  // never the repo dir's .config.

  const tmpMockDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-495-mocks-')));

  // --- (a) transient → success (single-target): mock fails with kill on attempt 1, succeeds on attempt 2 ---
  {
    const counterFile = path.join(tmpMockDir, 'counter-a-single.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock: first call → SIGKILL self; subsequent calls → return green JSON
    const mockScript = path.join(tmpMockDir, 'mock-a-single.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const count = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(count));\n' +
      'if (count <= 1) { process.kill(process.pid, "SIGKILL"); }\n' +
      'process.stdout.write(JSON.stringify({ verdict: "green", reasoning: "ok" }) + "\\n");\n' +
      'process.exit(0);\n'
    );
    const r = runClaim(['startup', '--target-issue', '83'], { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockScript }, repoDir);
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r.json && r.json.status === 'acquired', '#495(a-single): transient→success claim acquired (got ' + JSON.stringify(r.json) + ')');
    assert(cnt > 1, '#495(a-single): retry fired — counter=' + cnt + ' (expected >1)');
    // Cleanup the acquired project so it doesn't block the next test
    const projDir83 = path.join(repoDir, 'kaola-workflow', 'issue-83');
    try { fs.rmSync(projDir83, { recursive: true, force: true }); } catch (_) {}
  }

  // --- (b) persistent transient → escalate (bundle path) ---
  {
    const counterFile = path.join(tmpMockDir, 'counter-b-bundle.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock: always SIGKILL → after 3 attempts → indeterminate verdict
    const mockScript = path.join(tmpMockDir, 'mock-b-bundle.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const count = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(count));\n' +
      'process.kill(process.pid, "SIGKILL");\n'
    );
    const r = runClaim(['startup', '--target-issues', '83,143'], { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockScript }, repoDir);
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r.json && r.json.status === 'target_set_indeterminate',
      '#495(b-bundle): persistent transient → target_set_indeterminate (got status=' + (r.json && r.json.status) + ')');
    assert(r.json && r.json.result === 'escalate',
      '#495(b-bundle): persistent transient → result:escalate (got result=' + (r.json && r.json.result) + ')');
    assert(cnt >= 3, '#495(b-bundle): retry fired to max attempts — counter=' + cnt + ' (expected >=3)');
  }

  // --- (c) determinate GENUINE-negative non-zero NOT retried (bundle path — result:refuse) ---
  // #519 RECONCILE: the axis is now stderr-error-CLASS, not exit code. This pin must use a
  // GENUINE-negative stderr (a real 404 "Could not resolve to an Issue") so it stays determinate-
  // refuse under the corrected taxonomy. A generic exit-1 with no signature ALSO refuses (unrecognized
  // → refuse), but a genuine 404 makes the intent explicit and proves the genuine arm stays refuse.
  {
    const counterFile = path.join(tmpMockDir, 'counter-c-bundle.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock: emits a real GitHub 404 on STDERR (the genuine-negative signature) and exits 1.
    const mockScript = path.join(tmpMockDir, 'mock-c-bundle.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const count = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(count));\n' +
      'process.stderr.write("GraphQL: Could not resolve to an Issue with the number of 999. (repository.issue)\\n");\n' +
      'process.exit(1);\n'  // clean non-zero with a GENUINE-negative stderr: determinate refuse
    );
    const r = runClaim(['startup', '--target-issues', '83,143'], { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockScript }, repoDir);
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r.json && (r.json.status === 'target_set_unavailable' || r.json.status === 'target_set_red'),
      '#495(c-bundle): genuine-negative non-zero → target_set_unavailable or target_set_red (got status=' + (r.json && r.json.status) + ')');
    assert(r.json && r.json.result === 'refuse',
      '#495(c-bundle): genuine-negative non-zero → result:refuse (got result=' + (r.json && r.json.result) + ')');
    assert(cnt === 1, '#495(c-bundle): determinate genuine NOT retried — counter=' + cnt + ' (expected 1)');
  }

  // --- #519(d-transient-stderr): a clean_nonzero exit carrying a TRANSIENT-INFRA stderr now ESCALATES ---
  // This is the AXIS REPLACEMENT: pre-#519 ANY clean_nonzero refused; post-#519 a TLS-timeout /
  // rate-limit / DNS signature in stderr flips it to transient → retried → target_set_indeterminate /
  // result:escalate (the kaolaGIT live repro: the classifier subprocess exits non-zero but the root
  // cause is an infra blip, NOT a genuine-gone target).
  {
    const counterFile = path.join(tmpMockDir, 'counter-d-transient.txt');
    fs.writeFileSync(counterFile, '0');
    const mockScript = path.join(tmpMockDir, 'mock-d-transient.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const count = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(count));\n' +
      'process.stderr.write("error connecting to api.github.com: net/http: TLS handshake timeout\\n");\n' +
      'process.exit(1);\n'  // clean non-zero, but stderr is a TRANSIENT-INFRA signature → escalate
    );
    const r = runClaim(['startup', '--target-issues', '83,143'], { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockScript }, repoDir);
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r.json && r.json.status === 'target_set_indeterminate',
      '#519(d-transient-stderr): clean_nonzero with TLS-timeout stderr → target_set_indeterminate (got status=' + (r.json && r.json.status) + ')');
    assert(r.json && r.json.result === 'escalate',
      '#519(d-transient-stderr): transient-infra stderr → result:escalate (got result=' + (r.json && r.json.result) + ')');
    assert(cnt >= 3, '#519(d-transient-stderr): transient-infra clean_nonzero RETRIED to max — counter=' + cnt + ' (expected >=3)');
  }

  fs.rmSync(tmpMockDir, { recursive: true, force: true });
  fs.rmSync(repoDir, { recursive: true, force: true });
}

// --- #519: classifier gh-fetch stderr-error-class axis (the kaolaGIT live repro) ----------------
// Drives the REAL classifier subprocess via KAOLA_GH_MOCK_SCRIPT. The mock partitions by the gh
// subcommand so a transient can hit `gh repo view` (site 1), `gh issue view` (site 2), or both.
// PRE-#519 the bare `gh repo view` in getRepoOwnerName crashed to exit 1 (clean_nonzero) — the
// literal FIRST failure in the live repro. POST-#519 a transient on EITHER call routes to the
// indeterminate emitter (verdict:indeterminate, reasoning_class:classifier_error).
{
  const { execFileSync } = require('child_process');
  const CLASSIFIER = path.join(__dirname, 'kaola-workflow-classifier.js');

  function runClassifier(extraEnv) {
    const e = Object.assign({}, process.env, {
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_BACKOFF_MS: '0',
    }, extraEnv || {});
    delete e.KAOLA_WORKFLOW_OFFLINE;
    const tmpCwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-519cwd-')));
    try {
      const out = execFileSync('node', [CLASSIFIER, 'classify', '--issue', '77'], { cwd: tmpCwd, encoding: 'utf8', env: e });
      const lines = out.trim().split('\n').filter(l => l.trim());
      return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    } catch (err) {
      const out = String(err.stdout || '');
      const lines = out.trim().split('\n').filter(l => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch (_) {} }
      return null;
    } finally {
      try { fs.rmSync(tmpCwd, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const dir519 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-519-')));

  // (s1) TLS timeout on `gh repo view` (site 1, getRepoOwnerName) — pre-#519 the bare exec crashed
  // to clean_nonzero (main() exit 1, no JSON); post-#519 → indeterminate. `gh issue view` returns a
  // valid OPEN issue so the ONLY fault is the repo-view (claim-detection) call.
  {
    const mock = path.join(dir519, 'mock-s1.js');
    fs.writeFileSync(mock,
      'const a = process.argv.slice(2).join(" ");\n' +
      'if (a.indexOf("repo view") !== -1) { process.stderr.write("error connecting to api.github.com: net/http: TLS handshake timeout\\n"); process.exit(1); }\n' +
      'if (a.indexOf("issue view") !== -1) { process.stdout.write(JSON.stringify({ number: 77, title: "t", body: "", state: "OPEN", labels: [] }) + "\\n"); process.exit(0); }\n' +
      'process.stdout.write("[]\\n"); process.exit(0);\n'
    );
    const r = runClassifier({ KAOLA_GH_MOCK_SCRIPT: mock });
    assert(r && r.verdict === 'indeterminate',
      '#519(s1): TLS timeout on gh repo view (site 1) → verdict:indeterminate (got ' + JSON.stringify(r) + ')');
    assert(r && r.reasoning_class === 'classifier_error',
      '#519(s1): site-1 transient must carry reasoning_class:classifier_error (got ' + JSON.stringify(r) + ')');
  }

  // (s2) TLS timeout on `gh issue view` (site 2) — clean_nonzero exit, transient stderr → retried →
  // indeterminate (NOT target_unavailable, which the old exit-code-only axis would have returned).
  {
    const mock = path.join(dir519, 'mock-s2.js');
    fs.writeFileSync(mock,
      'const a = process.argv.slice(2).join(" ");\n' +
      'if (a.indexOf("issue view") !== -1) { process.stderr.write("error connecting to api.github.com: net/http: TLS handshake timeout\\n"); process.exit(1); }\n' +
      'if (a.indexOf("repo view") !== -1) { process.stdout.write(JSON.stringify({ owner: { login: "o" }, name: "r" }) + "\\n"); process.exit(0); }\n' +
      'process.stdout.write("[]\\n"); process.exit(0);\n'
    );
    const r = runClassifier({ KAOLA_GH_MOCK_SCRIPT: mock });
    assert(r && r.verdict === 'indeterminate',
      '#519(s2): TLS timeout on gh issue view (site 2 clean_nonzero) → verdict:indeterminate (got ' + JSON.stringify(r) + ')');
  }

  // (s2-genuine) a GENUINE-negative 404 on `gh issue view` stays determinate-refuse → target_unavailable.
  // Proves the genuine arm is UNCHANGED (the #511 character at the classifier level).
  {
    const mock = path.join(dir519, 'mock-s2g.js');
    fs.writeFileSync(mock,
      'const a = process.argv.slice(2).join(" ");\n' +
      'if (a.indexOf("issue view") !== -1) { process.stderr.write("GraphQL: Could not resolve to an Issue with the number of 77. (repository.issue)\\n"); process.exit(1); }\n' +
      'if (a.indexOf("repo view") !== -1) { process.stdout.write(JSON.stringify({ owner: { login: "o" }, name: "r" }) + "\\n"); process.exit(0); }\n' +
      'process.stdout.write("[]\\n"); process.exit(0);\n'
    );
    const r = runClassifier({ KAOLA_GH_MOCK_SCRIPT: mock });
    assert(r && r.verdict === 'target_unavailable',
      '#519(s2-genuine): 404 on gh issue view → verdict:target_unavailable (determinate, got ' + JSON.stringify(r) + ')');
  }

  fs.rmSync(dir519, { recursive: true, force: true });
}

// --- #519: probeIssueState transient discriminant (non-breaking) -------------------------------
// A TRANSIENT-infra probe fault sets { state:'unavailable', transient:true } (claim gates escalate);
// a GENUINE/unknown fault keeps the plain { state:'unavailable' } (closure-audit/probe-memo read .state).
{
  const af = require('./kaola-workflow-active-folders');
  const dirP = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-519-probe-')));
  const prevMock = process.env.KAOLA_GH_MOCK_SCRIPT;
  delete process.env.KAOLA_WORKFLOW_OFFLINE;
  // transient: gh issue view exits 1 with a rate-limit stderr → transient:true
  {
    af.__resetIssueStateMemo();
    const mock = path.join(dirP, 'mock-transient.js');
    fs.writeFileSync(mock, 'process.stderr.write("API rate limit exceeded for user\\n"); process.exit(1);');
    process.env.KAOLA_GH_MOCK_SCRIPT = mock;
    const r = af.probeIssueState(701);
    assert(r.state === 'unavailable', '#519(probe-transient): transient keeps state:unavailable (got ' + JSON.stringify(r) + ')');
    assert(r.transient === true, '#519(probe-transient): rate-limit stderr sets transient:true (got ' + JSON.stringify(r) + ')');
  }
  // genuine: gh issue view exits 1 with a 404 stderr → NO transient discriminant
  {
    af.__resetIssueStateMemo();
    const mock = path.join(dirP, 'mock-genuine.js');
    fs.writeFileSync(mock, 'process.stderr.write("Could not resolve to an Issue with the number of 702.\\n"); process.exit(1);');
    process.env.KAOLA_GH_MOCK_SCRIPT = mock;
    const r = af.probeIssueState(702);
    assert(r.state === 'unavailable', '#519(probe-genuine): genuine keeps state:unavailable (got ' + JSON.stringify(r) + ')');
    assert(r.transient !== true, '#519(probe-genuine): 404 stderr must NOT set transient (got ' + JSON.stringify(r) + ')');
  }
  if (prevMock === undefined) delete process.env.KAOLA_GH_MOCK_SCRIPT; else process.env.KAOLA_GH_MOCK_SCRIPT = prevMock;
  fs.rmSync(dirP, { recursive: true, force: true });
}

// --- #507: boundary-2 classifier CLI-fetch transient retry (KAOLA_GH_MOCK_SCRIPT seam) --------
// boundary-2 = the classifier's own internal gh-fetch catch. Before this fix the catch discards
// the error and always emits determinate target_unavailable, even for transient spawn faults.
//
// Tests drive the REAL classifier subprocess via KAOLA_GH_MOCK_SCRIPT to inject:
//   (b2-a) transient spawn_fault (SIGKILL) → retried → indeterminate after MAX_ATTEMPTS
//   (b2-b) clean_nonzero (determinate) → NOT retried (counter===1) → target_unavailable
//   (b2-c) transient → success (retry succeeds on attempt 2) → verdict: green/yellow/etc.
{
  const { execFileSync } = require('child_process');
  const CLASSIFIER = path.join(__dirname, 'kaola-workflow-classifier.js');

  // Helper: run the classifier subprocess and return parsed stdout.
  function runClassifier(extraEnv) {
    const e = Object.assign({}, process.env, {
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_BACKOFF_MS: '0',
    }, extraEnv || {});
    // use a temp dir as cwd so active-folders scanning doesn't see real state
    const tmpCwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-b2cwd-')));
    try {
      const out = execFileSync('node', [CLASSIFIER, 'classify', '--issue', '99'], {
        cwd: tmpCwd, encoding: 'utf8', env: e
      });
      const lines = out.trim().split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1];
      return last ? JSON.parse(last) : null;
    } catch (err) {
      // non-zero exit: classifier emitted error JSON on stdout
      const out = String(err.stdout || '');
      const lines = out.trim().split('\n').filter(l => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try { return JSON.parse(lines[i]); } catch (_) {}
      }
      return null;
    } finally {
      try { fs.rmSync(tmpCwd, { recursive: true, force: true }); } catch (_) {}
    }
  }

  const tmpB2Dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-507-b2-')));

  // --- (b2-a) persistent transient gh-fetch fault → indeterminate (NOT target_unavailable) ---
  // Pre-fix: the catch discards e, emits target_unavailable on first failure, counter stays 1.
  // Post-fix: mock is called 3 times (MAX_ATTEMPTS), then emits indeterminate.
  {
    const counterFile = path.join(tmpB2Dir, 'counter-b2a.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock gh: always SIGKILL → transient fault at the gh layer
    const mockScript = path.join(tmpB2Dir, 'mock-b2a.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const c = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(c));\n' +
      'process.kill(process.pid, "SIGKILL");\n'
    );
    const r = runClassifier({ KAOLA_GH_MOCK_SCRIPT: mockScript });
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r && r.verdict === 'indeterminate',
      '#507(b2-a): persistent transient gh-fetch → verdict:indeterminate (got ' + JSON.stringify(r) + ')');
    assert(r && r.reasoning_class === 'classifier_error',
      '#507(b2-a): indeterminate must carry reasoning_class:classifier_error (got ' + JSON.stringify(r) + ')');
    assert(cnt >= 3,
      '#507(b2-a): transient retried to MAX_ATTEMPTS — counter=' + cnt + ' (expected >=3)');
  }

  // --- (b2-b) clean_nonzero (determinate) → target_unavailable, NOT retried ---
  // Pre-fix: also emits target_unavailable with counter 1 (swallowed in catch).
  // Post-fix: still emits target_unavailable (clean_nonzero is determinate) but classifier
  //           explicitly does NOT retry it — counter must stay 1.
  {
    const counterFile = path.join(tmpB2Dir, 'counter-b2b.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock gh: exits with code 1 (clean non-zero, genuine "issue gone" scenario)
    const mockScript = path.join(tmpB2Dir, 'mock-b2b.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const c = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(c));\n' +
      'process.stdout.write("error: issue not found\\n");\n' +
      'process.exit(1);\n'  // clean non-zero: determinate
    );
    const r = runClassifier({ KAOLA_GH_MOCK_SCRIPT: mockScript });
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r && r.verdict === 'target_unavailable',
      '#507(b2-b): clean_nonzero gh-fetch → verdict:target_unavailable (got ' + JSON.stringify(r) + ')');
    assert(cnt === 1,
      '#507(b2-b): determinate clean_nonzero must NOT be retried — counter=' + cnt + ' (expected 1)');
  }

  // --- (b2-c) transient → success on attempt 2 → yields real classify result (not indeterminate) ---
  {
    const counterFile = path.join(tmpB2Dir, 'counter-b2c.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock gh: SIGKILL on first call, returns valid issue JSON on second
    const mockScript = path.join(tmpB2Dir, 'mock-b2c.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const c = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(c));\n' +
      'if (c <= 1) { process.kill(process.pid, "SIGKILL"); }\n' +
      // Return a valid issue JSON (open, no blocking labels)
      'process.stdout.write(JSON.stringify({ number: 99, title: "test", body: "", state: "OPEN", labels: [] }) + "\\n");\n' +
      'process.exit(0);\n'
    );
    const r = runClassifier({ KAOLA_GH_MOCK_SCRIPT: mockScript });
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    assert(r && r.verdict !== 'indeterminate' && r.verdict !== 'target_unavailable',
      '#507(b2-c): transient then success → real classify result, not indeterminate/unavailable (got ' + JSON.stringify(r) + ')');
    assert(cnt >= 2,
      '#507(b2-c): retry fired (count>1) — counter=' + cnt + ' (expected >=2)');
  }

  fs.rmSync(tmpB2Dir, { recursive: true, force: true });
}

// --- #503: resume_ambiguous refusal when multiple active folders, no --project --------
// TDD RED: before fix, resume with no --project + two active folders silently returns folder[0].
// TDD GREEN: after fix, emits { resumed: false, reason: 'resume_ambiguous', candidates: [...] } + exit 1.
{
  const { execFileSync } = require('child_process');
  const CLAIM = path.join(__dirname, 'kaola-workflow-claim.js');

  // Helper: run claim.js resume subcommand in a given repo dir, return { code, json }.
  function runResume(argv, repoDir) {
    const e = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500'
    });
    try {
      const out = execFileSync('node', [CLAIM, 'resume', ...argv], { cwd: repoDir, encoding: 'utf8', env: e });
      const lines = out.trim().split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1];
      return { code: 0, json: last ? JSON.parse(last) : null };
    } catch (err) {
      const out = String(err.stdout || '') + String(err.stderr || '');
      const lines = out.trim().split('\n').filter(l => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        try { return { code: err.status || 1, json: JSON.parse(lines[i]) }; } catch (_) {}
      }
      return { code: err.status || 1, json: null, raw: out };
    }
  }

  // Set up a minimal git repo with two active folders.
  const repo503 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-503-')));
  const g503 = (a) => { try { execFileSync('git', ['-C', repo503, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} };
  g503(['init']); g503(['config', 'user.email', 't@t']); g503(['config', 'user.name', 't']); g503(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo503, '.gitignore'), '.kw/\n'); g503(['add', '-A']); g503(['commit', '-m', 'init']);

  // Two active folders — status: in_progress survives readActiveFolders (not released/closed/abandoned).
  const proj63 = path.join(repo503, 'kaola-workflow', 'issue-63');
  const proj65 = path.join(repo503, 'kaola-workflow', 'issue-65');
  fs.mkdirSync(proj63, { recursive: true });
  fs.mkdirSync(proj65, { recursive: true });
  fs.writeFileSync(path.join(proj63, 'workflow-state.md'),
    'name: issue-63\nissue_number: 63\nstatus: in_progress\nphase: 2\nnext_command: /kaola-workflow-plan-run issue-63\n');
  fs.writeFileSync(path.join(proj65, 'workflow-state.md'),
    'name: issue-65\nissue_number: 65\nstatus: in_progress\nphase: 3\nnext_command: /kaola-workflow-plan-run issue-65\n');

  // Scenario A (ambiguous): two active folders + no --project → must refuse with reason: resume_ambiguous.
  const rAmb = runResume([], repo503);
  assert(rAmb.code === 1,
    '#503(A): ambiguous resume must exit 1 (got code=' + rAmb.code + ', json=' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && rAmb.json.reason === 'resume_ambiguous',
    '#503(A): ambiguous resume must emit reason:resume_ambiguous (got ' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && Array.isArray(rAmb.json.candidates) && rAmb.json.candidates.length === 2,
    '#503(A): ambiguous resume must list both candidates (got ' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && rAmb.json.candidates && rAmb.json.candidates.includes('issue-63'),
    '#503(A): candidates must include issue-63 (got ' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && rAmb.json.candidates && rAmb.json.candidates.includes('issue-65'),
    '#503(A): candidates must include issue-65 (got ' + JSON.stringify(rAmb.json) + ')');

  // Scenario B (single folder back-compat): remove issue-65, resume with no --project → resumes issue-63.
  fs.rmSync(proj65, { recursive: true, force: true });
  const rSingle = runResume([], repo503);
  assert(rSingle.code === 0,
    '#503(B): single-folder resume must exit 0 (got code=' + rSingle.code + ', json=' + JSON.stringify(rSingle.json) + ')');
  assert(rSingle.json && rSingle.json.resumed === true,
    '#503(B): single-folder resume must emit resumed:true (got ' + JSON.stringify(rSingle.json) + ')');
  assert(rSingle.json && rSingle.json.project === 'issue-63',
    '#503(B): single-folder resume must resolve to issue-63 (got ' + JSON.stringify(rSingle.json) + ')');

  // Scenario C (explicit --project): two folders restored, explicit --project must still work.
  fs.mkdirSync(proj65, { recursive: true });
  fs.writeFileSync(path.join(proj65, 'workflow-state.md'),
    'name: issue-65\nissue_number: 65\nstatus: in_progress\nphase: 3\nnext_command: /kaola-workflow-plan-run issue-65\n');
  const rExplicit = runResume(['--project', 'issue-65'], repo503);
  assert(rExplicit.code === 0,
    '#503(C): explicit --project must exit 0 (got code=' + rExplicit.code + ', json=' + JSON.stringify(rExplicit.json) + ')');
  assert(rExplicit.json && rExplicit.json.project === 'issue-65',
    '#503(C): explicit --project issue-65 must resume issue-65 (got ' + JSON.stringify(rExplicit.json) + ')');

  fs.rmSync(repo503, { recursive: true, force: true });
}

// --- #770: the path SELECTOR is retired (adaptive is the only path, no legality gate) ----------
// #538 established the path-legality gate (adaptive unconditional default + a typed
// `path_not_installed` refusal for any other requested path); #770 retires the gate ITSELF —
// KAOLA_PATH / --workflow-path no longer select or refuse anything. A stale/bogus request is
// silently ignored and the claim ACQUIRES via adaptive regardless; the persisted `workflow_path`
// state field still echoes whatever raw value was requested (a diagnostic record only — never a
// selection), while `next_command`/`next_skill`/`phase` route unconditionally to adaptive. The
// `--workflow-path` flag stays a KNOWN, accepted flag (a warn-and-ignore shim, one stderr notice),
// never an `unknown_flag` refusal. The retired `--with-fast`/`--with-full` INSTALL flags are a
// separate, still-live unknown-flag surface (unaffected by #770 — they were never a runtime path
// selector).
//
// The hermetic HOME (seeded parallel_mode:'auto' at the top of this file) only feeds the
// classifier. KAOLA_ENABLE_ADAPTIVE is retired — no env lever survives. Distinct target-issue
// numbers avoid the `owned` early-return false-green.
{
  const { spawnSync: spawnS538 } = require('child_process');
  const CLAIM538 = path.join(__dirname, 'kaola-workflow-claim.js');

  function runClaim538(argv, extraEnv, cwd) {
    const e = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_BACKOFF_MS: '0'
    }, extraEnv || {});
    // KAOLA_PATH defaults to undefined so the claim's `|| 'adaptive'` default fires unless overridden.
    if (!('KAOLA_PATH' in (extraEnv || {}))) delete e.KAOLA_PATH;
    // spawnSync (not execFileSync) so stderr is captured uniformly on BOTH success and failure —
    // needed to assert the --workflow-path warn-and-ignore notice even on an acquiring (exit 0) run.
    const res = spawnS538('node', [CLAIM538, ...argv], { cwd, encoding: 'utf8', env: e });
    const stdout = String(res.stdout || '');
    const stderr = String(res.stderr || '');
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    let json = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try { json = JSON.parse(lines[i]); break; } catch (_) {}
    }
    return { code: res.status == null ? 1 : res.status, json, stderr, raw: stdout + stderr };
  }

  // Minimal git repo so worktree provisioning doesn't error on the legal-path (acquired) cases.
  const repo538 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-538-repo-')));
  const g538 = (a) => { try { spawnS538('git', ['-C', repo538, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} };
  g538(['init']); g538(['config', 'user.email', 't@t']); g538(['config', 'user.name', 't']); g538(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo538, '.gitignore'), '.kw/\n'); g538(['add', '-A']); g538(['commit', '-m', 'init']);

  // Green mock classifier so the flow reaches claimProject (past classifyIssue).
  const tmpDir538 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-538-mocks-')));
  const mockGreen538 = path.join(tmpDir538, 'mock-green.js');
  fs.writeFileSync(mockGreen538,
    'process.stdout.write(JSON.stringify({ verdict: "green", reasoning: "ok" }) + "\\n");\n' +
    'process.exit(0);\n'
  );

  function rmProj538(issueN) {
    try { fs.rmSync(path.join(repo538, 'kaola-workflow', 'issue-' + issueN), { recursive: true, force: true }); } catch (_) {}
  }
  function stateOf538(issueN) {
    const p = path.join(repo538, 'kaola-workflow', 'issue-' + issueN, 'workflow-state.md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }

  // (a) DEFAULT (no --workflow-path, no KAOLA_PATH) → ACQUIRED (adaptive default).
  {
    const r = runClaim538(
      ['startup', '--target-issue', '5380'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    const state5380 = stateOf538('5380');
    rmProj538('5380');
    assert(r.json && r.json.status === 'acquired',
      '#538(a): default (no path) must be acquired via adaptive (got ' + JSON.stringify(r.json) + ')');
    assert(/^workflow_path: adaptive$/m.test(state5380),
      '#538(a): the default (no requested path) must persist workflow_path: adaptive, got:\n' + state5380);
  }

  // (b) #770: KAOLA_PATH=fast (a retired path name) is silently IGNORED for selection — the claim
  // ACQUIRES via adaptive regardless. The persisted workflow_path field still echoes the raw
  // requested value ('fast') as a diagnostic record only; next_command routes unconditionally
  // to the adaptive executor.
  {
    const r = runClaim538(
      ['startup', '--target-issue', '5381'],
      { KAOLA_PATH: 'fast', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    const state5381 = stateOf538('5381');
    rmProj538('5381');
    assert(r.json && r.json.status === 'acquired',
      '#770(b): a stale KAOLA_PATH=fast request must silently acquire via adaptive, no refusal (got ' + JSON.stringify(r.json) + ')');
    assert(/^workflow_path: fast$/m.test(state5381),
      '#770(b): the persisted workflow_path field must echo the raw stale request as a diagnostic record (never a selection), got:\n' + state5381);
    assert(/^next_command: \/kaola-workflow-plan-run issue-5381$/m.test(state5381),
      '#770(b): routing must be unconditionally adaptive despite the stale KAOLA_PATH value, got:\n' + state5381);
  }

  // (d) #770: --workflow-path full (a retired path name) is silently ignored — ACQUIRES via
  // adaptive, and the warn-and-ignore shim prints its one-line stderr notice (never an
  // unknown_flag refusal — the flag stays KNOWN).
  {
    const r = runClaim538(
      ['startup', '--target-issue', '5383', '--workflow-path', 'full'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    const state5383 = stateOf538('5383');
    rmProj538('5383');
    assert(r.json && r.json.status === 'acquired',
      '#770(d): a stale --workflow-path full request must silently acquire via adaptive, no refusal (got ' + JSON.stringify(r.json) + ')');
    assert(r.stderr.includes('--workflow-path is retired; running adaptive'),
      '#770(d): the retired flag must print its one-line warn-and-ignore stderr notice, got stderr:\n' + r.stderr);
    assert(/^workflow_path: full$/m.test(state5383),
      '#770(d): the persisted workflow_path field must echo the raw stale request as a diagnostic record, got:\n' + state5383);
  }

  // (f) explicit KAOLA_PATH=adaptive → ACQUIRED (adaptive is the only legal path).
  {
    const r = runClaim538(
      ['startup', '--target-issue', '5385'],
      { KAOLA_PATH: 'adaptive', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5385');
    assert(r.json && r.json.status === 'acquired',
      '#538(f): explicit adaptive must be acquired (got ' + JSON.stringify(r.json) + ')');
  }

  // (g) authoring-allowed is UNCONDITIONAL (no switch) — always allowed.
  {
    const r = runClaim538(
      ['authoring-allowed', '--project', 'issue-5386'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    assert(r.json && r.json.status === 'authoring_allowed' && r.json.allowed === true,
      '#538(g): authoring-allowed must be unconditionally allowed (got ' + JSON.stringify(r.json) + ')');
  }

  // (retirement) the retired install opt-in flags are UNKNOWN flags at the claim surface — a claim
  // that receives `--with-fast`/`--with-full` refuses with a typed unknown_flag (never silently
  // accepted as a path opt-in), proving the flags no longer confer any fast/full behavior. Distinct
  // from `--workflow-path` (#770), which stays a KNOWN warn-and-ignore flag, never unknown_flag.
  for (const retiredFlag of ['--with-fast', '--with-full']) {
    const r = runClaim538(
      ['startup', '--target-issue', '5388', retiredFlag, '--json'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5388');
    assert(r.code === 1 && r.json && r.json.reason === 'unknown_flag' && (r.json.unknownFlags || []).includes(retiredFlag),
      '#725: retired ' + retiredFlag + ' must refuse unknown_flag at the claim surface (got ' + JSON.stringify(r.json) + ')');
  }

  // (h) #770 ONLINE-PROBE REGRESSION GUARD — a stale/retired KAOLA_PATH must NOT skip the normal
  // ONLINE probeIssueState call. Before #770 this guard proved the OPPOSITE (the path-legality gate
  // short-circuited BEFORE reaching gh at all); now there is no such gate, so the correct invariant
  // is that a stale KAOLA_PATH changes NOTHING about the online flow — the real gh probe still
  // fires, and with a genuinely open issue the claim still acquires via adaptive. Runs the (b)
  // scenario WITHOUT KAOLA_WORKFLOW_OFFLINE (so ghExec actually shells the mock) and points
  // KAOLA_GH_MOCK_SCRIPT at a mock that reports the issue OPEN (never a boom/refusing mock) and
  // drops a sentinel file so invocation is provable. A regression that reintroduces an early-return
  // keyed on a non-adaptive KAOLA_PATH — one that ALSO happens to skip the online probe — fails here
  // (sentinel absent).
  {
    const sentinel538 = path.join(tmpDir538, 'gh-invoked.sentinel');
    try { fs.rmSync(sentinel538, { force: true }); } catch (_) {}
    const ghOpenMock538 = path.join(tmpDir538, 'gh-open.js');
    fs.writeFileSync(ghOpenMock538,
      'require(\'fs\').writeFileSync(' + JSON.stringify(sentinel538) + ', \'gh was invoked\');\n' +
      'process.stdout.write(JSON.stringify({ state: "OPEN" }) + "\\n");\n' +
      'process.exit(0);\n'
    );
    const r = runClaim538(
      ['startup', '--target-issue', '5387'],
      // NOTE: KAOLA_WORKFLOW_OFFLINE explicitly EMPTIED so ghExec actually shells the mock.
      { KAOLA_WORKFLOW_OFFLINE: '', KAOLA_PATH: 'fast', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538, KAOLA_GH_MOCK_SCRIPT: ghOpenMock538 },
      repo538
    );
    rmProj538('5387');
    assert(fs.existsSync(sentinel538),
      '#770(h): the online gh probe must actually fire — a stale KAOLA_PATH must not secretly skip it (no sentinel found; raw=' + r.raw.trim() + ')');
    assert(r.json && r.json.status === 'acquired',
      '#770(h): with a genuinely open issue online, a stale KAOLA_PATH must still acquire via adaptive (got ' + JSON.stringify(r.json) + ')');
    try { fs.rmSync(sentinel538, { force: true }); } catch (_) {}
  }

  fs.rmSync(repo538, { recursive: true, force: true });
  fs.rmSync(tmpDir538, { recursive: true, force: true });
}

// --- #522: cmdFinalize gate — adaptive plans must be verified before the archive commit -------
// TDD RED: before fix, cmdFinalize --keep-worktree commits the archive UNCONDITIONALLY even when
// no chain-receipt.json exists. It must REFUSE (exit non-zero, typed finalize_gate_unverified)
// and leave NO `chore: archive` commit on a self-host repo missing its chain receipt.
//
// Scenario A (RED): self-host repo, adaptive plan, --keep-worktree, NO chain-receipt → must refuse.
// Scenario B (GREEN-gate): self-host repo, valid chain-receipt seeded → must pass (exit 0).
// Scenario C (retirement): a plan-absent finalize now REFUSES adaptive_plan_missing (fast/full retired).
{
  const { execFileSync: execFS522, spawnSync: spawnS522 } = require('child_process');
  const CLAIM522 = path.join(__dirname, 'kaola-workflow-claim.js');
  const PLAN_VALIDATOR522 = path.join(__dirname, 'kaola-workflow-plan-validator.js');

  // Helper: init a minimal linked-worktree repo structure.
  // Returns { mainRoot, wtRoot, project, planPath, cacheDir }.
  function mkSelfHostRepo522(scenario) {
    const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-522-main-')));
    const wtRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-522-wt-')));
    const project = 'issue-522test';
    const GIT_ENV = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    };
    const g = (cwd, args) => {
      try { execFS522('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV }); }
      catch (_) {}
    };

    // (1) Bootstrap main repo with a self-host package.json (so the finalize discriminator
    //     selects chain-receipt mode). Commit on main BEFORE branching so the self-host marker
    //     is NOT in `git diff main...HEAD`.
    g(mainRoot, ['init', '-b', 'main']);
    g(mainRoot, ['config', 'user.email', 't@t.com']);
    g(mainRoot, ['config', 'user.name', 'Test']);
    g(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'package.json'), JSON.stringify({
      scripts: {
        'test:kaola-workflow:claude': 'true',
        'test:kaola-workflow:codex': 'true',
        'test:kaola-workflow:gitlab': 'true',
        'test:kaola-workflow:gitea': 'true'
      }
    }) + '\n');
    g(mainRoot, ['add', 'package.json']);
    g(mainRoot, ['commit', '-m', 'chore: self-host package.json']);

    // (2) Create the feature branch and set up the worktree to simulate it.
    g(mainRoot, ['checkout', '-b', 'workflow/' + project]);
    // Establish the synthetic linked-worktree identity at CLAIM time so the
    // schema-2 claim identity binds the same absolute worktree path persisted
    // below. The feature commit updates only this synthetic HEAD later.
    const mainGitDir = path.join(mainRoot, '.git');
    const wtGitLinkDir = path.join(mainGitDir, 'worktrees', 'kw-522-wt');
    fs.mkdirSync(wtGitLinkDir, { recursive: true });
    fs.writeFileSync(path.join(wtGitLinkDir, 'commondir'), '../..\n');
    fs.writeFileSync(path.join(wtGitLinkDir, 'gitdir'), path.join(wtRoot, '.git') + '\n');
    const claimHead522 = spawnS522('git', ['-C', mainRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    fs.writeFileSync(path.join(wtGitLinkDir, 'HEAD'), claimHead522 + '\n');
    fs.writeFileSync(path.join(wtRoot, '.git'), 'gitdir: ' + wtGitLinkDir + '\n');
    // Write project folder in the worktree (simulating worktree-finalize having already run).
    const projDir = path.join(wtRoot, 'kaola-workflow', project);
    fs.mkdirSync(projDir, { recursive: true });
    const cacheDir = path.join(projDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // (3) Write a proper adaptive workflow-state.md in main (needed for activeByProject).
    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    fs.mkdirSync(mainProjDir, { recursive: true });
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      '',
      '## Project',
      'name: ' + project,
      'status: active',
      '',
      '## Current Position',
      'phase: adaptive',
      'phase_name: Adaptive',
      'workflow_path: adaptive',
      'step: start',
      'next_command: /kaola-workflow-plan-run ' + project,
      'next_skill: kaola-workflow-plan-run ' + project,
      '',
      '## Pending Gates',
      '- workflow-plan',
      '',
      '## Last Evidence',
      'last_command: startup',
      'last_result: folder_claimed',
      '',
      '## Last Updated',
      new Date().toISOString(),
      '',
      '## Sink',
      'branch: workflow/' + project,
      'issue_number: 522',
      'sink: merge',
      'run_posture: worktree',
      'worktree_path: ' + wtRoot,
      'main_root: ' + mainRoot,
      'session_marker: fixture-522',
      'claim_ts: 2026-01-01T00:00:00Z'
    ].join('\n') + '\n');

    // (4) Write a minimal valid workflow-plan.md with a complete node covering impl.txt.
    //     This plan is committed on main at branch-creation (not on the feature branch) to keep
    //     `git diff main...HEAD` clean of the plan file itself. The plan's write-set covers
    //     impl.txt which IS committed on the feature branch below.
    const planContent = [
      '# Workflow Plan — ' + project,
      '',
      '## Meta',
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
      'labels: enhancement',
      '',
      '## Nodes',
      '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| impl | implementer | — | impl.txt | 1 | sequence |',
      '| rv | code-reviewer | impl | — | 1 | sequence |',
      '| done | finalize | rv | — | 1 | sequence |',
      '',
      '## Node Ledger',
      '',
      '| id | status |',
      '|---|---|',
      '| impl | complete |',
      '| rv | complete |',
      '| done | complete |',
      '',
      '## Required Agent Compliance',
      '',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|---|---|---|---|',
      '| implementer (impl) | invoked | fixture | |',
      '| code-reviewer (rv) | invoked | fixture | |',
      '| finalize (done) | invoked | fixture | |',
      ''
    ].join('\n');

    // Freeze the plan to stamp a plan_hash (use validator --freeze).
    // Write plan to main first, then freeze. Schema 2 deliberately refuses a newly
    // authored field-absent draft, so materialize the verified frozen legacy identity
    // first (same pattern as the walkthrough's stampVerifiedLegacyPlan fixtures).
    const planPath = path.join(mainProjDir, 'workflow-plan.md');
    const preHash522 = require(PLAN_VALIDATOR522).computePlanHash(planContent);
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + preHash522 + ' -->\n\n' + planContent);

    // Freeze via plan-validator so plan_hash is stamped (needed for --finalize-check).
    try {
      execFS522('node', [PLAN_VALIDATOR522, planPath, '--freeze', '--json'],
        { cwd: mainRoot, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (_) { /* freeze may fail in this minimal repo; gate still needs the plan */ }

    const frozenPlan522 = fs.readFileSync(planPath, 'utf8');
    const planHash522 = (frozenPlan522.match(/<!-- plan_hash: ([0-9a-f]{64}) -->/) || [])[1];
    assert(!!planHash522, '#522 fixture: adaptive plan freezes with a plan hash');
    const anchors522 = buildClaimAnchors(wtRoot, {
      issue_number: 522,
      branch: 'workflow/' + project,
      worktree_path: wtRoot,
      claim_ts: '2026-01-01T00:00:00Z',
      session_marker: 'fixture-522',
    });
    let authorityState522 = fs.readFileSync(path.join(mainProjDir, 'workflow-state.md'), 'utf8');
    authorityState522 = authorityState522.replace('\n## Sink', [
      '', '## Planning Evidence', 'plan_hash: ' + planHash522, 'decision: auto-run',
      'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
      'first_node_id: impl', 'first_node_role: implementer', '',
      '## Epoch Lineage', 'epoch_schema_version: ' + anchors522.epoch_schema_version,
      'claim_repository_id: ' + anchors522.claim_repository_id,
      'claim_identity_digest: ' + anchors522.claim_identity_digest,
      'claim_root_object_format: ' + anchors522.claim_root_object_format,
      'claim_root_base_commit: ' + anchors522.claim_root_base_commit,
      'claim_root_base_tree: ' + anchors522.claim_root_base_tree,
      'claim_root_base_digest: ' + anchors522.claim_root_base_digest,
      'epoch_lineage_id: ' + anchors522.epoch_lineage_id, 'plan_epoch: 1',
      'active_plan_hash: ' + planHash522, 'inherited_frontier_digest: none',
      'inherited_frontier_classes: none', 'automatic_review_replans: 0',
      'authorized_epoch_ceiling: 2', 'case_b_exemption_consumed: false',
      'replan_status: none', 'replan_transaction_id: none', 'replan_phase: none',
      'active_snapshot_manifest_digest: none', '', '## Sink',
    ].join('\n'));
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), authorityState522);
    fs.writeFileSync(path.join(mainProjDir, 'workflow-tasks.json'), JSON.stringify({
      source_plan_hash: planHash522,
      tasks: [
        { id: 'impl', role: 'implementer', ledger_status: 'complete', status: 'completed' },
        { id: 'rv', role: 'code-reviewer', ledger_status: 'complete', status: 'completed' },
        { id: 'done', role: 'finalize', ledger_status: 'complete', status: 'completed' },
      ],
    }) + '\n');

    // (5) Write the plan into the worktree project dir too.
    const wtPlanPath = path.join(projDir, 'workflow-plan.md');
    fs.writeFileSync(wtPlanPath, fs.readFileSync(planPath, 'utf8'));

    // (6) Write workflow-state.md into the worktree project dir.
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'),
      fs.readFileSync(path.join(mainProjDir, 'workflow-state.md'), 'utf8'));
    fs.writeFileSync(path.join(projDir, 'workflow-tasks.json'),
      fs.readFileSync(path.join(mainProjDir, 'workflow-tasks.json'), 'utf8'));

    // (7) Commit the plan + state + impl.txt onto the feature branch in main.
    //     impl.txt is an attributed change (declared in `impl` node's write_set).
    fs.writeFileSync(path.join(mainRoot, 'impl.txt'), 'implementation\n');
    g(mainRoot, ['add', '-A']);
    g(mainRoot, ['commit', '-m', 'feat: impl + plan for issue-522test']);

    // (8) Point the worktree gitdir at main (simulate git worktree linkage).
    //     For the gate we just need `git rev-parse HEAD` to resolve from the worktree.
    //     We use --git-dir pointing to main's .git to simulate a linked worktree.
    // Advance only the synthetic worktree HEAD to the feature commit. Its
    // persisted claim-root tuple remains the real claim-time commit/tree.
    const headSha = spawnS522('git', ['-C', mainRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    fs.writeFileSync(path.join(wtGitLinkDir, 'HEAD'), headSha + '\n');

    // In a real git linked worktree the working tree is a full checkout of the branch, so
    // package.json (committed on main before branching) is present. Mirror that here so the
    // finalize-check discriminator classifies this as a self-host (chain-receipt) repo.
    fs.writeFileSync(path.join(wtRoot, 'package.json'), fs.readFileSync(path.join(mainRoot, 'package.json'), 'utf8'));
    // Also write impl.txt to the worktree (the "checked-out" feature file).
    fs.writeFileSync(path.join(wtRoot, 'impl.txt'), 'implementation\n');

    return { mainRoot, wtRoot, project, planPath: wtPlanPath, cacheDir, headSha, wtGitLinkDir };
  }

  // Helper: run claim finalize from wtRoot.
  function runFinalize522(wtRoot, project, extraArgs, extraEnv) {
    const e = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_WORKTREE_NATIVE: '0',
    }, extraEnv || {});
    const result = spawnS522(
      process.execPath, [CLAIM522, 'finalize', '--project', project, '--keep-worktree', ...(extraArgs || [])],
      { cwd: wtRoot, encoding: 'utf8', timeout: 30000, env: e }
    );
    let json = null;
    try {
      const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
  }

  // --- #522 Scenario A: adaptive plan + NO chain-receipt → finalize_gate_unverified (RED) ---
  {
    let fx;
    try {
      fx = mkSelfHostRepo522('no-receipt');
      const headSha = fx.headSha;

      const r = runFinalize522(fx.wtRoot, fx.project);

      // Pre-fix: cmdFinalize returns exit 0 + no refusal. Post-fix: must refuse.
      assert(r.status !== 0,
        '#522(A): finalize without chain-receipt must exit non-zero (pre-fix: exit ' + r.status + ', no gate)');
      assert(r.json && r.json.reason === 'finalize_gate_unverified',
        '#522(A): finalize_gate_unverified reason required (got ' + JSON.stringify(r.json) + ')');

      // No `chore: archive` commit must land (HEAD must still be the impl commit).
      const headAfter = spawnS522('git', ['-C', fx.wtRoot, 'rev-parse', 'HEAD'],
        { encoding: 'utf8' }).stdout.trim();
      assert(headAfter === headSha,
        '#522(A): NO archive commit must land when gate refuses (HEAD changed: ' + headSha + ' → ' + headAfter + ')');

    } finally {
      if (fx) {
        try { fs.rmSync(fx.mainRoot, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(fx.wtRoot, { recursive: true, force: true }); } catch (_) {}
      }
    }
  }

  // --- #522 Scenario B: valid chain-receipt seeded → gate passes, finalize succeeds ---
  {
    let fx;
    try {
      fx = mkSelfHostRepo522('with-receipt');
      const headSha = fx.headSha;

      // Seed a valid chain-receipt.json covering the current HEAD.
      fs.writeFileSync(path.join(fx.cacheDir, 'chain-receipt.json'), JSON.stringify({
        headSha,
        chains: [
          { name: 'claude', exitCode: 0, accepted_red: false },
          { name: 'codex', exitCode: 0, accepted_red: false },
          { name: 'gitlab', exitCode: 0, accepted_red: false },
          { name: 'gitea', exitCode: 0, accepted_red: false }
        ]
      }));

      const r = runFinalize522(fx.wtRoot, fx.project);

      assert(r.status === 0,
        '#522(B): finalize WITH valid chain-receipt must exit 0 (gate passes) (got ' + r.status + ', stderr: ' + (r.stderr || '').slice(0, 200) + ')');

    } finally {
      if (fx) {
        try { fs.rmSync(fx.mainRoot, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(fx.wtRoot, { recursive: true, force: true }); } catch (_) {}
      }
    }
  }

  // --- #522 Scenario C: a plan-absent finalize now REFUSES adaptive_plan_missing (fast/full retired) ---
  {
    const tmpC = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-522c-')));
    const project = 'issue-522c';
    const GIT_ENV = {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    };
    try {
      execFS522('git', ['-C', tmpC, 'init', '-b', 'main'],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV });
      execFS522('git', ['-C', tmpC, 'config', 'user.email', 't@t.com'],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV });
      execFS522('git', ['-C', tmpC, 'config', 'user.name', 'Test'],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV });
      execFS522('git', ['-C', tmpC, 'config', 'commit.gpgsign', 'false'],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV });
      fs.writeFileSync(path.join(tmpC, 'README.md'), 'x\n');
      execFS522('git', ['-C', tmpC, 'add', '-A'],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV });
      execFS522('git', ['-C', tmpC, 'commit', '-m', 'init'],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV });

      // Project folder with NO workflow-plan.md and a stale legacy `workflow_path: fast` field.
      // Under retirement a plan-absent finalize collapses to a typed adaptive_plan_missing refusal
      // regardless of the stale field — never the retired fast N/A pass, never a retired-verifier shell.
      const projDir = path.join(tmpC, 'kaola-workflow', project);
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
        '# Kaola-Workflow State',
        '## Project', 'name: ' + project, 'status: active',
        '## Current Position', 'phase: 2', 'phase_name: Implementation',
        'workflow_path: fast',
        '## Sink', 'branch: workflow/' + project, 'issue_number: 522', 'sink: merge', 'run_posture: in-place'
      ].join('\n') + '\n');

      const r = spawnS522(process.execPath,
        [CLAIM522, 'finalize', '--project', project],
        {
          cwd: tmpC, encoding: 'utf8', timeout: 30000,
          env: Object.assign({}, process.env, {
            KAOLA_WORKFLOW_OFFLINE: '1',
            KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
            KAOLA_WORKTREE_NATIVE: '0',
          })
        });

      let jsonC = null;
      try { jsonC = JSON.parse(String(r.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
      assert(r.status !== 0 && jsonC && jsonC.reason === 'finalize_gate_unverified'
          && jsonC.inner_reason === 'adaptive_plan_missing',
        '#522(C): a plan-absent finalize (stale fast field) must refuse adaptive_plan_missing, got status='
          + r.status + ' output=' + JSON.stringify(jsonC));
      assert(fs.existsSync(projDir),
        '#522(C): the refused plan-absent finalize must leave the live project folder in place');

    } finally {
      try { fs.rmSync(tmpC, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

// --- #536: classifier decoupled from global parallel_mode (KAOLA_FORCE_CLASSIFY override) --------
// The classifier BYPASSES to verdict:'green' whenever ~/.config/kaola-workflow/config.json sets
// parallel_mode !== 'auto' — a contributor's GLOBAL setting the test cannot own. #531's hermetic
// HOME sandbox masks this for the parent process and HOME-inheriting children, but the coupling
// itself is fragile: the spawned classifier's verdict still depends on a config file the test does
// not control, surviving only as long as HOME-inheritance holds. #536 adds an explicit TEST-OWNED
// env override (KAOLA_FORCE_CLASSIFY=1) the classifier honors, so the suite can FORCE classification
// regardless of any contributor config. Production semantics are preserved — real users never set
// this env, so the bypass still fires for them exactly as before.
{
  const { execFileSync } = require('child_process');
  const CLASSIFIER = path.join(__dirname, 'kaola-workflow-classifier.js');

  // A HOSTILE config home (parallel_mode:'on') — deliberately NOT the #531 sandbox, so the override
  // (not HOME-inheritance) is provably the thing doing the decoupling work.
  const hostileHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-536-hostile-'));
  fs.mkdirSync(path.join(hostileHome, '.config', 'kaola-workflow'), { recursive: true });
  fs.writeFileSync(
    path.join(hostileHome, '.config', 'kaola-workflow', 'config.json'),
    JSON.stringify({ parallel_mode: 'on', enable_adaptive: false }, null, 2) + '\n'
  );

  function runUnderHostile(extraEnv) {
    const e = Object.assign({}, process.env, {
      HOME: hostileHome,                       // hostile global config — NOT the #531 sandbox
      USERPROFILE: hostileHome,
      KAOLA_WORKFLOW_OFFLINE: '1',             // reach the determinate target_unverified arm w/o network
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_BACKOFF_MS: '0',
    }, extraEnv || {});
    const tmpCwd = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-536-cwd-')));
    try {
      const out = execFileSync('node', [CLASSIFIER, 'classify', '--issue', '536999'], {
        cwd: tmpCwd, encoding: 'utf8', env: e
      });
      const lines = out.trim().split('\n').filter(l => l.trim());
      return lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    } catch (err) {
      const out = String(err.stdout || '');
      const lines = out.trim().split('\n').filter(l => l.trim());
      for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch (_) {} }
      return null;
    } finally {
      try { fs.rmSync(tmpCwd, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // (a) WITHOUT the override the bypass fires — documents the exact coupling #536 targets.
  {
    const r = runUnderHostile({});
    assert(r && r.verdict === 'green' && /parallel_mode=on; bypassing classifier/.test(r.reasoning || ''),
      '#536(a): hostile parallel_mode:on + NO override → bypass green (documents the coupling), got ' + JSON.stringify(r));
  }

  // (b) WITH KAOLA_FORCE_CLASSIFY=1 the classifier classifies normally DESPITE the hostile config.
  // OFFLINE + empty temp cwd (no roadmap/active folder) → verdict:target_unverified, proving the
  // classification body ran instead of short-circuiting to the bypass green.
  {
    const r = runUnderHostile({ KAOLA_FORCE_CLASSIFY: '1' });
    assert(r && r.verdict !== 'green',
      '#536(b): hostile parallel_mode:on + KAOLA_FORCE_CLASSIFY=1 → classifier runs (NOT bypass green); OFFLINE no-roadmap → target_unverified, got ' + JSON.stringify(r));
    assert(r && /parallel_mode=on; bypassing/.test(r.reasoning || '') === false,
      '#536(b): force-classify must NOT carry the bypass reasoning, got ' + JSON.stringify(r));
  }

  fs.rmSync(hostileHome, { recursive: true, force: true });
}

// --- #579: classifyLane four-bucket + precedence ladder (classifier.js) --------
{
  const { classifyLane, resolveSessionMarker } = require('./kaola-workflow-classifier');
  const now = Date.now();
  const staleMs = 86400000;
  const ownSession = 'my-session-id';

  // resolveSessionMarker exports and behavior
  assert(typeof resolveSessionMarker === 'function',
    '#579: resolveSessionMarker must be exported from classifier');
  if (typeof resolveSessionMarker === 'function') {
    assert(resolveSessionMarker({ KAOLA_SESSION_MARKER: 'fixed-marker' }) === 'fixed-marker',
      '#579: resolveSessionMarker: env override honored');
    const minted = resolveSessionMarker({});
    assert(typeof minted === 'string' && minted.startsWith('s-'),
      '#579: resolveSessionMarker: minted marker starts with s-, got: ' + minted);
  }

  // classifyLane must be exported
  assert(typeof classifyLane === 'function',
    '#579: classifyLane must be exported from classifier');

  if (typeof classifyLane === 'function') {
    // Bucket 1: session_marker matches own session → 'mine'
    const r_mine = classifyLane(
      { session_marker: ownSession, issue_number: 1, issue_numbers: [] },
      { ownSession, explicitResumeIssues: new Set(), coTenantSignal: false, now, staleMs }
    );
    assert(r_mine && r_mine.bucket === 'mine',
      '#579 classifyLane: session_marker match → mine, got ' + JSON.stringify(r_mine));

    // Bucket 2: explicit resume → 'stale' (beats coTenantSignal AND beats liveness)
    const r_stale_explicit = classifyLane(
      { session_marker: 'other', issue_number: 790, issue_numbers: [], claim_ts: new Date().toISOString() },
      { ownSession, explicitResumeIssues: new Set([790]), coTenantSignal: true, now, staleMs }
    );
    assert(r_stale_explicit && r_stale_explicit.bucket === 'stale',
      '#579 classifyLane: explicit resume beats coTenantSignal → stale, got ' + JSON.stringify(r_stale_explicit));

    // Bucket 3: coTenantSignal → 'live'
    const r_live = classifyLane(
      { session_marker: 'other', issue_number: 1, issue_numbers: [] },
      { ownSession, explicitResumeIssues: new Set(), coTenantSignal: true, now, staleMs }
    );
    assert(r_live && r_live.bucket === 'live',
      '#579 classifyLane: coTenantSignal → live, got ' + JSON.stringify(r_live));

    // Bucket 4a: fresh marker, no co-tenant, no explicit → 'ambiguous'
    const r_ambig = classifyLane(
      { session_marker: 'other', claim_ts: new Date().toISOString(), issue_number: 1, issue_numbers: [] },
      { ownSession, explicitResumeIssues: new Set(), coTenantSignal: false, now, staleMs }
    );
    assert(r_ambig && r_ambig.bucket === 'ambiguous',
      '#579 classifyLane: fresh marker → ambiguous, got ' + JSON.stringify(r_ambig));

    // Bucket 4b: no claim_ts → 'stale' (backward compat for pre-#579 markerless folders)
    const r_stale_nomark = classifyLane(
      { issue_number: 1, issue_numbers: [] },
      { ownSession, explicitResumeIssues: new Set(), coTenantSignal: false, now, staleMs }
    );
    assert(r_stale_nomark && r_stale_nomark.bucket === 'stale',
      '#579 classifyLane: absent claim_ts → stale, got ' + JSON.stringify(r_stale_nomark));

    // Bucket 4b: old claim_ts → 'stale'
    const oldTs = new Date(now - staleMs - 1000).toISOString();
    const r_stale_old = classifyLane(
      { session_marker: 'other', claim_ts: oldTs, issue_number: 1, issue_numbers: [] },
      { ownSession, explicitResumeIssues: new Set(), coTenantSignal: false, now, staleMs }
    );
    assert(r_stale_old && r_stale_old.bucket === 'stale',
      '#579 classifyLane: old claim_ts → stale, got ' + JSON.stringify(r_stale_old));

    // Precedence: explicit-resume beats liveness (fresh marker + explicit issue match → stale)
    const r_prec = classifyLane(
      { session_marker: 'other', claim_ts: new Date().toISOString(), issue_number: 999, issue_numbers: [] },
      { ownSession, explicitResumeIssues: new Set([999]), coTenantSignal: false, now, staleMs }
    );
    assert(r_prec && r_prec.bucket === 'stale',
      '#579 classifyLane precedence: explicit beats liveness → stale, got ' + JSON.stringify(r_prec));

    // Precedence: issue_numbers membership also triggers explicit resume
    const r_issno = classifyLane(
      { session_marker: 'other', issue_number: 100, issue_numbers: [101, 102], claim_ts: new Date().toISOString() },
      { ownSession, explicitResumeIssues: new Set([102]), coTenantSignal: false, now, staleMs }
    );
    assert(r_issno && r_issno.bucket === 'stale',
      '#579 classifyLane: issue_numbers membership triggers explicit resume → stale, got ' + JSON.stringify(r_issno));

    // All classifyLane results carry a reasoning field
    assert(r_mine.reasoning && typeof r_mine.reasoning === 'string',
      '#579 classifyLane: result must carry a reasoning field');
  }
}

// --- #579: clean-check selectivity (adaptive-schema.js) ---------
{
  const adaptiveSchema579 = require('./kaola-workflow-adaptive-schema.js');
  const { parsePorcelainPaths, isParkedLanePath, PARKED_LANE_PREFIXES, LANE_STALENESS_MS } = adaptiveSchema579;

  // LANE_STALENESS_MS constant (24h)
  assert(LANE_STALENESS_MS === 86400000,
    '#579: LANE_STALENESS_MS must be 86400000 (24h), got ' + LANE_STALENESS_MS);

  // PARKED_LANE_PREFIXES is an array
  assert(Array.isArray(PARKED_LANE_PREFIXES) && PARKED_LANE_PREFIXES.length >= 3,
    '#579: PARKED_LANE_PREFIXES must be an array of at least 3 entries, got ' + JSON.stringify(PARKED_LANE_PREFIXES));

  // parsePorcelainPaths
  assert(typeof parsePorcelainPaths === 'function',
    '#579: parsePorcelainPaths must be exported from adaptive-schema');
  if (typeof parsePorcelainPaths === 'function') {
    const raw = ' M scripts/foo.js\n M kaola-workflow/issue-99/workflow-state.md\n?? untracked.txt\n';
    const paths = parsePorcelainPaths(raw);
    assert(paths.includes('scripts/foo.js'),
      '#579 parsePorcelainPaths: staged file parsed, got ' + JSON.stringify(paths));
    assert(paths.includes('kaola-workflow/issue-99/workflow-state.md'),
      '#579 parsePorcelainPaths: kaola-workflow path parsed, got ' + JSON.stringify(paths));
    assert(paths.includes('untracked.txt'),
      '#579 parsePorcelainPaths: untracked file parsed, got ' + JSON.stringify(paths));
    // rename: take destination
    const renamed = parsePorcelainPaths('R  old-name.txt -> new-name.txt\n');
    assert(renamed.includes('new-name.txt'),
      '#579 parsePorcelainPaths: rename → dest, got ' + JSON.stringify(renamed));
    // empty input
    assert(parsePorcelainPaths('').length === 0,
      '#579 parsePorcelainPaths: empty input → empty array');
  }

  // isParkedLanePath
  assert(typeof isParkedLanePath === 'function',
    '#579: isParkedLanePath must be exported from adaptive-schema');
  if (typeof isParkedLanePath === 'function') {
    // non-owned kaola-workflow/* is ignored
    assert(isParkedLanePath('kaola-workflow/issue-99/workflow-state.md', ['issue-42']) === true,
      '#579: non-owned kaola-workflow/issue-99/* → true (ignore)');
    assert(isParkedLanePath('kaola-workflow/issue-99/', ['issue-42']) === true,
      '#579: non-owned kaola-workflow/issue-99/ → true (ignore)');
    // non-owned .kw/worktrees/* is ignored
    assert(isParkedLanePath('.kw/worktrees/issue-99/somefile', ['issue-42']) === true,
      '#579: non-owned .kw/worktrees/issue-99/* → true (ignore)');
    // non-owned .kw/legs/* is ignored
    assert(isParkedLanePath('.kw/legs/issue-55/somefile', ['issue-42']) === true,
      '#579: non-owned .kw/legs/issue-55/* → true (ignore)');
    // own project NOT exempted
    assert(isParkedLanePath('kaola-workflow/issue-42/workflow-state.md', ['issue-42']) === false,
      '#579: own kaola-workflow/issue-42/* → false (NOT exempt)');
    // shared durable state stays strict (dot-leading segments)
    assert(isParkedLanePath('kaola-workflow/.roadmap/issue-123.md', ['issue-42']) === false,
      '#579: .roadmap → false (strict)');
    // shared ROADMAP.md stays strict
    assert(isParkedLanePath('kaola-workflow/ROADMAP.md', ['issue-42']) === false,
      '#579: ROADMAP.md → false (strict)');
    // config.json stays strict
    assert(isParkedLanePath('kaola-workflow/config.json', ['issue-42']) === false,
      '#579: config.json → false (strict)');
    // real code NOT exempt
    assert(isParkedLanePath('scripts/kaola-workflow-claim.js', ['issue-42']) === false,
      '#579: scripts/* → false (not exempt)');
    // archive stays strict
    assert(isParkedLanePath('kaola-workflow/archive/issue-99/workflow-state.md', ['issue-42']) === false,
      '#579: kaola-workflow/archive/* → false (strict — archive is shared)');
  }
}

// --- #579: main_root/session_marker/claim_ts exposed via readActiveFolders ----------
{
  const { readActiveFolders } = require('./kaola-workflow-active-folders.js');
  const tmpDir579 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-579-fields-'));
  try {
    const kwDir = path.join(tmpDir579, 'kaola-workflow', 'issue-579test');
    fs.mkdirSync(kwDir, { recursive: true });
    const testMainRoot = fs.realpathSync(tmpDir579);
    const testTs = new Date().toISOString();
    fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '',
      '## Project', 'name: issue-579test', 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive',
      'workflow_path: adaptive', 'runtime: claude', 'step: start',
      'next_command: /kaola-workflow-plan-run issue-579test',
      'next_skill: kaola-workflow-plan-run issue-579test',
      'main_session_role: orchestrator', 'implementation_owner: N/A',
      'fix_owner: N/A', 'inline_emergency_fallback_authorized: no', '',
      '## Pending Gates', '- workflow-plan', '',
      '## Last Evidence', 'phase_file: N/A', 'cache_file: N/A',
      'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', testTs, '',
      '## Sink', 'branch: workflow/issue-579test', 'issue_number: 579',
      'sink: merge', 'run_posture: in-place',
      'main_root: ' + testMainRoot,
      'session_marker: s-test-abc123',
      'claim_ts: ' + testTs,
    ].join('\n') + '\n');

    const folders = readActiveFolders(tmpDir579, { excludeClosedIssues: false });
    assert(folders.length === 1,
      '#579: readActiveFolders must see the test project, got ' + folders.length);
    if (folders.length > 0) {
      const f = folders[0];
      assert(f.main_root === testMainRoot,
        '#579: readActiveFolders must expose main_root, got ' + f.main_root);
      assert(f.session_marker === 's-test-abc123',
        '#579: readActiveFolders must expose session_marker, got ' + f.session_marker);
      assert(f.claim_ts === testTs,
        '#579: readActiveFolders must expose claim_ts, got ' + f.claim_ts);
    }
  } finally {
    fs.rmSync(tmpDir579, { recursive: true, force: true });
  }
}

// --- #579 R1: cmdResume + cmdStatus ctx-shape integration (claim.js call sites) ---
// These tests drive the ACTUAL subcommand I/O path (subprocess spawn). The defect is that both
// call sites in claim.js build ctx = { env: process.env } (wrong shape) instead of the shape
// classifyLane actually reads: { ownSession, explicitResumeIssues, coTenantSignal, now, staleMs }.
// With the wrong shape: ownSession is undefined, so the 'mine' bucket never fires (resume_ambiguous
// false-positive) and classified.reason is undefined (the field is .reasoning, not .reason).
{
  const { execFileSync: ef579 } = require('child_process');
  const CLAIM579 = path.join(__dirname, 'kaola-workflow-claim.js');

  // Scratch git repo with two active lanes.
  const repo579 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-579-ctx-')));
  const g579 = (a) => {
    try { ef579('git', ['-C', repo579, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
  };
  g579(['init']);
  g579(['config', 'user.email', 't@t']);
  g579(['config', 'user.name', 't']);
  g579(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo579, '.gitignore'), '.kw/\n');
  g579(['add', '-A']);
  g579(['commit', '-m', 'init']);

  const now579 = new Date().toISOString();

  // Lane A: own session (issue-100, session_marker: s-MINE-session, fresh claim_ts).
  const proj100 = path.join(repo579, 'kaola-workflow', 'issue-100');
  fs.mkdirSync(proj100, { recursive: true });
  fs.writeFileSync(path.join(proj100, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project', 'name: issue-100', 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive',
    'workflow_path: adaptive', 'runtime: claude', 'step: start',
    'next_command: /kaola-workflow-plan-run issue-100',
    'next_skill: kaola-workflow-plan-run issue-100',
    'main_session_role: orchestrator', 'implementation_owner: N/A',
    'fix_owner: N/A', 'inline_emergency_fallback_authorized: no', '',
    '## Pending Gates', '- workflow-plan', '',
    '## Last Evidence', 'phase_file: N/A', 'cache_file: N/A',
    'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', now579, '',
    '## Sink', 'branch: workflow/issue-100', 'issue_number: 100',
    'sink: merge', 'run_posture: in-place',
    'main_root: ' + repo579,
    'session_marker: s-MINE-session',
    'claim_ts: ' + now579,
  ].join('\n') + '\n');

  // Lane B: co-tenant session (issue-200, different session_marker, fresh claim_ts).
  const proj200 = path.join(repo579, 'kaola-workflow', 'issue-200');
  fs.mkdirSync(proj200, { recursive: true });
  fs.writeFileSync(path.join(proj200, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project', 'name: issue-200', 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive',
    'workflow_path: adaptive', 'runtime: claude', 'step: start',
    'next_command: /kaola-workflow-plan-run issue-200',
    'next_skill: kaola-workflow-plan-run issue-200',
    'main_session_role: orchestrator', 'implementation_owner: N/A',
    'fix_owner: N/A', 'inline_emergency_fallback_authorized: no', '',
    '## Pending Gates', '- workflow-plan', '',
    '## Last Evidence', 'phase_file: N/A', 'cache_file: N/A',
    'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', now579, '',
    '## Sink', 'branch: workflow/issue-200', 'issue_number: 200',
    'sink: merge', 'run_posture: in-place',
    'main_root: ' + repo579,
    'session_marker: s-OTHER-session',
    'claim_ts: ' + now579,
  ].join('\n') + '\n');

  const run579 = (argv, extraEnv) => {
    const env579 = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    }, extraEnv || {});
    try {
      const out = ef579('node', [CLAIM579, ...argv], { cwd: repo579, encoding: 'utf8', env: env579 });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status == null ? 1 : err.status, out: String(err.stdout || '') + String(err.stderr || '') };
    }
  };

  // Repro A: cmdResume with two lanes + matching KAOLA_SESSION_MARKER must auto-select issue-100
  // (not return resume_ambiguous). Bug: wrong ctx shape → ownSession undefined → mine bucket never fires.
  const rA = run579(['resume', '--json'], { KAOLA_SESSION_MARKER: 's-MINE-session' });
  let rAj = {}; try { rAj = JSON.parse(rA.out.trim().split('\n').pop()); } catch (_) {}
  assert(rAj.resumed === true && rAj.project === 'issue-100',
    '#579 R1 Repro A: cmdResume with matching KAOLA_SESSION_MARKER must auto-select issue-100 (not resume_ambiguous), code=' + rA.code + ' out=' + rA.out.trim());

  // Repro B: cmdStatus must annotate issue-100 as lane_bucket:mine with a defined lane_bucket_reason.
  // Bug: wrong ctx shape → ownSession undefined → mine bucket never fires; .reason field (vs .reasoning) → undefined reason.
  const rB = run579(['status', '--json'], { KAOLA_SESSION_MARKER: 's-MINE-session' });
  let rBj = {}; try { rBj = JSON.parse(rB.out.trim().split('\n').pop()); } catch (_) {}
  const entry100 = rBj.active && rBj.active.find(f => f.project === 'issue-100');
  assert(entry100 && entry100.lane_bucket === 'mine',
    '#579 R1 Repro B: cmdStatus issue-100 must be lane_bucket:mine, got: ' + JSON.stringify(entry100));
  assert(entry100 && typeof entry100.lane_bucket_reason === 'string' && entry100.lane_bucket_reason.length > 0,
    '#579 R1 Repro B: cmdStatus issue-100 must have a defined lane_bucket_reason string, got: ' + JSON.stringify(entry100 && entry100.lane_bucket_reason));

  // Repro C (co-tenant): KAOLA_COTENANT=1 → issue-200 (foreign session) must be lane_bucket:live.
  const rC = run579(['status', '--json'], { KAOLA_SESSION_MARKER: 's-MINE-session', KAOLA_COTENANT: '1' });
  let rCj = {}; try { rCj = JSON.parse(rC.out.trim().split('\n').pop()); } catch (_) {}
  const entry200 = rCj.active && rCj.active.find(f => f.project === 'issue-200');
  assert(entry200 && entry200.lane_bucket === 'live',
    '#579 R1 Repro C: cmdStatus with KAOLA_COTENANT=1 must annotate issue-200 as lane_bucket:live, got: ' + JSON.stringify(entry200));

  try { fs.rmSync(repo579, { recursive: true, force: true }); } catch (_) {}
}

// --- #603: --codex-dispatch-mode value validation (literal + newline-injection guard) --------------
// Absent flag → { present:false } (byte-identical claim behavior); the two literals pass; anything else
// — including a case-variant or a newline-carrying value (durable-state field injection) — is invalid,
// so cmdStartup refuses the claim with zero mutation.
assert(resolveCodexDispatchModeFlag({}).present === false,
  '#603: an absent --codex-dispatch-mode flag resolves present:false (no field written)');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v2-task-name' }).mode === 'v2-task-name',
  '#603: the v2-task-name literal resolves to its mode');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v1-thread-id' }).mode === 'v1-thread-id',
  '#603: the v1-thread-id literal resolves to its mode');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v3-bogus' }).invalid === true,
  '#603: a non-literal value is rejected (invalid:true)');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'V2-TASK-NAME' }).invalid === true,
  '#603: mode validation is case-sensitive (upper-case variant is rejected)');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v2-task-name\nforged: x' }).invalid === true,
  '#603: a newline-carrying value is rejected (durable-state field-injection guard, the assertNoNewline class)');

// --- #619: claim.js close-helper — post-probe the SUCCESS path too (exit-0-but-still-open) -----
// closeIssueIdempotent trusted a `gh issue close` exit 0 unconditionally on the success path; only
// the catch branch re-probed. A flaky --comment post or a webhook race can exit 0 while the issue
// stays OPEN on the forge — that must bucket 'failed', not 'closed'. The post-close probe MUST be a
// FRESH, un-memoized gh round-trip: probeIssueState (used for the pre-close check) is memoized
// per-process, so reusing it for a post-close re-check would always replay the pre-close 'open'
// verdict — breaking every GENUINE success too, not just adding coverage.
{
  const { closeIssueIdempotent } = require('./kaola-workflow-claim.js');
  const dir619 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-619-close-'));
  const prevMock619 = process.env.KAOLA_GH_MOCK_SCRIPT;

  function mock619(behaviors) {
    // behaviors: { closeExit: 0|1, postProbeState: 'open'|'closed' }
    const p = path.join(dir619, 'gh-' + Math.random().toString(36).slice(2) + '.js');
    fs.writeFileSync(p, [
      "const a = process.argv.slice(2);",
      "if (a[0] === 'issue' && a[1] === 'close') { process.exit(" + behaviors.closeExit + "); }",
      "if (a[0] === 'issue' && a[1] === 'view' && a.includes('--jq')) { process.stdout.write(" + JSON.stringify(behaviors.postProbeState) + " + '\\n'); process.exit(0); }",
      "if (a[0] === 'issue' && a[1] === 'view') { process.stdout.write(JSON.stringify({state:'open'}) + '\\n'); process.exit(0); }",
      "if (a[0] === 'issue' && a[1] === 'edit') { process.exit(0); }",
      "process.exit(0);"
    ].join('\n'));
    return p;
  }

  process.env.KAOLA_GH_MOCK_SCRIPT = mock619({ closeExit: 0, postProbeState: 'open' });
  const token619A = closeIssueIdempotent(619101, {});
  assert(token619A === 'failed',
    '#619: gh issue close exit-0 but a LIVE post-close probe shows the issue still OPEN must bucket failed, got ' + token619A);

  process.env.KAOLA_GH_MOCK_SCRIPT = mock619({ closeExit: 0, postProbeState: 'closed' });
  const token619B = closeIssueIdempotent(619102, {});
  assert(token619B === 'closed',
    '#619: a genuinely successful close (post-probe confirms closed) must still return closed (no regression), got ' + token619B);

  process.env.KAOLA_GH_MOCK_SCRIPT = mock619({ closeExit: 1, postProbeState: 'closed' });
  const token619C = closeIssueIdempotent(619103, {});
  assert(token619C === 'already_closed',
    '#619: a close attempt that THROWS but a live post-probe confirms the issue is actually closed must return already_closed, got ' + token619C);

  process.env.KAOLA_GH_MOCK_SCRIPT = mock619({ closeExit: 1, postProbeState: 'open' });
  const token619D = closeIssueIdempotent(619104, {});
  assert(token619D === 'failed',
    '#619: a close attempt that throws and stays open must return failed (baseline, unchanged), got ' + token619D);

  if (prevMock619 === undefined) delete process.env.KAOLA_GH_MOCK_SCRIPT; else process.env.KAOLA_GH_MOCK_SCRIPT = prevMock619;
  fs.rmSync(dir619, { recursive: true, force: true });
}

// --- #620: stale-worktree-cleanup must NEVER destroy unmerged committed work -------------------
// cmdStaleWorktreeCleanup's branch-deletion loop ran `git branch -D` UNCONDITIONALLY once a branch's
// issue closed on the forge; worktreeDirtyState only checks *uncommitted* changes (`git status
// --porcelain`), so a branch carrying a COMMITTED-but-unmerged change reads 'clean' and got force-
// deleted — permanently orphaning the only copy of that work (the #617 data-loss end-state this
// tool exists to remedy, not reproduce). This RED test forces exactly that shape: a real commit on
// the feature branch that never merges into main, plus a closed-issue gh mock. --execute must
// SURVIVE it (branch + commit intact) and report skipped_unmerged, never deleted_branch.
{
  const { execFileSync: execFS620, spawnSync: spawnS620 } = require('child_process');
  const CLAIM620 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_620 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g620 = (cwd, args) => execFS620('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_620 });

  const tmp620 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-620-repo-')));
  const kwRoot620 = tmp620 + '.kw';
  const binDir620 = path.join(tmp620, 'bin');
  try {
    g620(tmp620, ['init', '-b', 'main']);
    g620(tmp620, ['config', 'user.email', 't@t.com']);
    g620(tmp620, ['config', 'user.name', 'Test']);
    g620(tmp620, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp620, 'README.md'), 'fixture\n');
    g620(tmp620, ['add', 'README.md']);
    g620(tmp620, ['commit', '-m', 'init']);

    // Linked worktree for issue 96201, branching off main HEAD.
    const wtPath = path.join(kwRoot620, 'issue-96201');
    fs.mkdirSync(kwRoot620, { recursive: true });
    g620(tmp620, ['worktree', 'add', '-b', 'workflow/issue-96201', '--', wtPath, 'HEAD']);
    // Commit NEW work on the branch, INSIDE the worktree — never merged into main.
    fs.writeFileSync(path.join(wtPath, 'unmerged-feature.txt'), 'the only copy of this work\n');
    g620(wtPath, ['add', 'unmerged-feature.txt']);
    g620(wtPath, ['commit', '-m', 'feat: unmerged work']);
    const unmergedTip = execFS620('git', ['-C', wtPath, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_620 }).trim();

    // gh mock: issue 96201 reports CLOSED (the collectStale trigger).
    fs.mkdirSync(binDir620, { recursive: true });
    fs.writeFileSync(path.join(binDir620, 'gh.js'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view 96201')) { process.stdout.write('{\"state\":\"closed\"}\\n'); process.exit(0); }",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); process.exit(0); }",
      "process.stdout.write('[\\n'); process.exit(0);"
    ].join('\n'));

    const result = spawnS620(process.execPath, [CLAIM620, 'stale-worktree-cleanup', '--execute'], {
      cwd: tmp620,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir620, 'gh.js')
      })
    });
    let out620 = {};
    try { out620 = JSON.parse(result.stdout); } catch (_) {}

    assert(out620.dry_run === false, '#620: dry_run must be false, got ' + JSON.stringify(out620) + '\nstderr: ' + result.stderr);

    // The critical assertion: the committed unmerged work must SURVIVE — the branch still resolves
    // AND its tip commit is still reachable (not merely a dangling ref about to be gc'd).
    let branchSurvived = false, tipReachable = false;
    try {
      execFS620('git', ['-C', tmp620, 'rev-parse', '--verify', '--quiet', 'refs/heads/workflow/issue-96201'], { stdio: ['ignore', 'pipe', 'ignore'], env: GIT_ENV_620 });
      branchSurvived = true;
    } catch (_) {}
    try {
      execFS620('git', ['-C', tmp620, 'cat-file', '-e', unmergedTip], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_620 });
      tipReachable = true;
    } catch (_) {}
    assert(branchSurvived,
      '#620: the unmerged branch workflow/issue-96201 must SURVIVE cleanup --execute (never -D unproven work), got cleanup output: ' + JSON.stringify(out620));
    assert(tipReachable,
      '#620: the unmerged commit ' + unmergedTip + ' must still be reachable after cleanup --execute, got cleanup output: ' + JSON.stringify(out620));
    assert(!(Array.isArray(out620.deleted_branch) && out620.deleted_branch.includes('workflow/issue-96201')),
      '#620: deleted_branch must NOT include the unmerged branch, got ' + JSON.stringify(out620.deleted_branch));
    assert(Array.isArray(out620.skipped_unmerged) && out620.skipped_unmerged.some(e => e && e.branch === 'workflow/issue-96201'),
      '#620: skipped_unmerged must record the unmerged branch (fail LOUD, not silent), got ' + JSON.stringify(out620.skipped_unmerged));
  } finally {
    fs.rmSync(tmp620, { recursive: true, force: true });
    try { fs.rmSync(kwRoot620, { recursive: true, force: true }); } catch (_) {}
  }
}

// --- #672: worktreeDirtyState's catch conflated "probe FAILED" with "path is MISSING" (both
// returned 'missing'), and cmdLegacyWorktreeCleanup's destructive removal loop treats any
// non-'dirty' state as removable — so a probe failure on a REAL legacy worktree (a broken git
// invocation, corrupted worktree state, ...) could feed a destructive sweep of content that was
// never actually proven clean or gone. This RED test forces exactly that shape: a real legacy
// worktree whose git-link is corrupted (the path EXISTS, `git status --porcelain` throws) — never
// a genuinely-missing worktree. --execute must SURVIVE it (dir + content intact) and report
// skipped_unprobeable, never removed.
{
  const { execFileSync: execFS672, spawnSync: spawnS672 } = require('child_process');
  const CLAIM672 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_672 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g672 = (cwd, args) => execFS672('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_672 });

  const tmp672 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-672-repo-')));
  const legacyContainer672 = path.dirname(tmp672) + '/' + path.basename(tmp672) + '.kw';
  const wtPath672 = path.join(legacyContainer672, 'issue-96722');
  try {
    g672(tmp672, ['init', '-b', 'main']);
    g672(tmp672, ['config', 'user.email', 't@t.com']);
    g672(tmp672, ['config', 'user.name', 'Test']);
    g672(tmp672, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp672, 'README.md'), 'fixture\n');
    g672(tmp672, ['add', 'README.md']);
    g672(tmp672, ['commit', '-m', 'init']);

    fs.mkdirSync(legacyContainer672, { recursive: true });
    g672(tmp672, ['worktree', 'add', '-b', 'workflow/issue-96722', '--', wtPath672, 'HEAD']);
    fs.writeFileSync(path.join(wtPath672, 'real-work.txt'), 'content that must never be swept on a probe failure\n');
    // Corrupt the worktree's git-link so ANY `git -C wtPath672 ...` invocation throws — the
    // probe-error path (distinct from a genuinely-missing worktree, whose directory would not
    // exist at all).
    fs.writeFileSync(path.join(wtPath672, '.git'), 'gitdir: /nonexistent/broken/gitdir/path\n');

    const result = spawnS672(process.execPath, [CLAIM672, 'legacy-worktree-cleanup', '--execute'], {
      cwd: tmp672,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out672 = {};
    try { out672 = JSON.parse(result.stdout); } catch (_) {}

    assert(out672.dry_run === false, '#672: dry_run must be false, got ' + JSON.stringify(out672) + '\nstderr: ' + result.stderr);

    // The critical assertion: an unprobeable worktree must SURVIVE — a probe failure must never
    // feed a destructive removal.
    assert(fs.existsSync(wtPath672) && fs.existsSync(path.join(wtPath672, 'real-work.txt')),
      '#672: an unprobeable legacy worktree must SURVIVE cleanup --execute (probe failure != removable), got cleanup output: ' + JSON.stringify(out672));
    assert(!(Array.isArray(out672.removed) && out672.removed.includes(wtPath672)),
      '#672: removed must NOT include the unprobeable worktree, got ' + JSON.stringify(out672.removed));
    assert(Array.isArray(out672.skipped_unprobeable) && out672.skipped_unprobeable.includes(wtPath672),
      '#672: skipped_unprobeable must record the unprobeable worktree (fail LOUD, not silent), got ' + JSON.stringify(out672));
  } finally {
    fs.rmSync(tmp672, { recursive: true, force: true });
    try { fs.rmSync(legacyContainer672, { recursive: true, force: true }); } catch (_) {}
  }
}

// --- #677 (A1): cmdStaleWorktreeCleanup unprobeable-keep — mirrors the #672 regression, which
// drove only cmdLegacyWorktreeCleanup. cmdStaleWorktreeCleanup keeps the SAME 'unprobeable' state
// unconditionally, but had NO shipped unit test of its own. Same fault shape as #672 (a real
// registered worktree whose git-link is corrupted, so the path EXISTS but `git status --porcelain`
// throws), driven through stale-worktree-cleanup with a gh mock reporting the issue CLOSED (the
// collectStale trigger). --execute must SURVIVE it (worktree + branch intact) and report
// skipped_unprobeable, never removed / deleted_branch.
{
  const { execFileSync: execFS677a, spawnSync: spawnS677a } = require('child_process');
  const CLAIM677a = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_677a = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g677a = (cwd, args) => execFS677a('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_677a });

  const tmp677a = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-677a-repo-')));
  const kwRoot677a = tmp677a + '.kw';
  const binDir677a = path.join(tmp677a, 'bin');
  const issueNum677a = 96773;
  try {
    g677a(tmp677a, ['init', '-b', 'main']);
    g677a(tmp677a, ['config', 'user.email', 't@t.com']);
    g677a(tmp677a, ['config', 'user.name', 'Test']);
    g677a(tmp677a, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp677a, 'README.md'), 'fixture\n');
    g677a(tmp677a, ['add', 'README.md']);
    g677a(tmp677a, ['commit', '-m', 'init']);

    const wtPath677a = path.join(kwRoot677a, 'issue-' + issueNum677a);
    fs.mkdirSync(kwRoot677a, { recursive: true });
    g677a(tmp677a, ['worktree', 'add', '-b', 'workflow/issue-' + issueNum677a, '--', wtPath677a, 'HEAD']);
    fs.writeFileSync(path.join(wtPath677a, 'real-work.txt'), 'content that must never be swept on a probe failure\n');
    // Corrupt the worktree's git-link so ANY `git -C wtPath677a ...` invocation throws — the
    // probe-error path (distinct from a genuinely-missing worktree).
    fs.writeFileSync(path.join(wtPath677a, '.git'), 'gitdir: /nonexistent/broken/gitdir/path\n');

    // gh mock: the issue reports CLOSED (the collectStale trigger for stale-worktree-cleanup).
    fs.mkdirSync(binDir677a, { recursive: true });
    fs.writeFileSync(path.join(binDir677a, 'gh.js'), [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('issue view " + issueNum677a + "')) { process.stdout.write('{\"state\":\"closed\"}\\n'); process.exit(0); }",
      "if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); process.exit(0); }",
      "process.stdout.write('[\\n'); process.exit(0);"
    ].join('\n'));

    const result = spawnS677a(process.execPath, [CLAIM677a, 'stale-worktree-cleanup', '--execute'], {
      cwd: tmp677a,
      encoding: 'utf8',
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir677a, 'gh.js')
      })
    });
    let out677a = {};
    try { out677a = JSON.parse(result.stdout); } catch (_) {}

    assert(out677a.dry_run === false, '#677a: dry_run must be false, got ' + JSON.stringify(out677a) + '\nstderr: ' + result.stderr);

    // The critical assertion: an unprobeable worktree must SURVIVE — a probe failure must never
    // feed a destructive removal, mirrored for the stale-worktree-cleanup consumer.
    assert(fs.existsSync(wtPath677a) && fs.existsSync(path.join(wtPath677a, 'real-work.txt')),
      '#677a: an unprobeable stale worktree must SURVIVE cleanup --execute (probe failure != removable), got cleanup output: ' + JSON.stringify(out677a));
    assert(!(Array.isArray(out677a.removed) && out677a.removed.includes(wtPath677a)),
      '#677a: removed must NOT include the unprobeable worktree, got ' + JSON.stringify(out677a.removed));
    assert(Array.isArray(out677a.skipped_unprobeable) && out677a.skipped_unprobeable.includes(wtPath677a),
      '#677a: skipped_unprobeable must record the unprobeable worktree (fail LOUD, not silent), got ' + JSON.stringify(out677a));
    assert(!(Array.isArray(out677a.deleted_branch) && out677a.deleted_branch.includes('workflow/issue-' + issueNum677a)),
      '#677a: deleted_branch must NOT include the branch of an unprobeable worktree, got ' + JSON.stringify(out677a.deleted_branch));
    let branchSurvived677a = false;
    try {
      execFS677a('git', ['-C', tmp677a, 'rev-parse', '--verify', '--quiet', 'refs/heads/workflow/issue-' + issueNum677a], { stdio: ['ignore', 'pipe', 'ignore'], env: GIT_ENV_677a });
      branchSurvived677a = true;
    } catch (_) {}
    assert(branchSurvived677a,
      '#677a: the branch of an unprobeable worktree must SURVIVE cleanup --execute, got cleanup output: ' + JSON.stringify(out677a));
  } finally {
    fs.rmSync(tmp677a, { recursive: true, force: true });
    try { fs.rmSync(kwRoot677a, { recursive: true, force: true }); } catch (_) {}
  }
}

// --- #677 (A2): worktreeDirtyState's `!fs.existsSync(wtPath)` gate fails OPEN when the path's
// PARENT directory is unreadable (chmod 000) — fs.existsSync returns false for a path that
// genuinely EXISTS whenever traversal into an ancestor directory is blocked, so a real, present
// legacy worktree gets misclassified 'missing' and fed straight to the destructive
// prune-and-report-removed branch instead of the 'unprobeable' keep state a probe fault deserves.
// Root ignores the permission bit entirely, so this regression is inert (and MUST be skipped) when
// run as root. The chmod is always restored in a finally, even on assertion failure.
{
  const isRoot677b = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot677b) {
    console.error('SKIP #677b: running as root — chmod 000 is not enforced, skipping the parent-unreadable regression');
  } else {
    const { execFileSync: execFS677b, spawnSync: spawnS677b } = require('child_process');
    const CLAIM677b = path.join(__dirname, 'kaola-workflow-claim.js');
    const GIT_ENV_677b = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
    });
    const g677b = (cwd, args) => execFS677b('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_677b });

    const tmp677b = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-677b-repo-')));
    const legacyContainer677b = path.dirname(tmp677b) + '/' + path.basename(tmp677b) + '.kw';
    const wtPath677b = path.join(legacyContainer677b, 'issue-96774');
    let chmodApplied677b = false;
    try {
      g677b(tmp677b, ['init', '-b', 'main']);
      g677b(tmp677b, ['config', 'user.email', 't@t.com']);
      g677b(tmp677b, ['config', 'user.name', 'Test']);
      g677b(tmp677b, ['config', 'commit.gpgsign', 'false']);
      fs.writeFileSync(path.join(tmp677b, 'README.md'), 'fixture\n');
      g677b(tmp677b, ['add', 'README.md']);
      g677b(tmp677b, ['commit', '-m', 'init']);

      fs.mkdirSync(legacyContainer677b, { recursive: true });
      g677b(tmp677b, ['worktree', 'add', '-b', 'workflow/issue-96774', '--', wtPath677b, 'HEAD']);
      fs.writeFileSync(path.join(wtPath677b, 'real-work.txt'), 'content that must never be swept on a parent-unreadable probe fault\n');

      // Block traversal into the legacy container so `fs.existsSync(wtPath677b)` reads false even
      // though the worktree genuinely exists on disk — the exact A2 shape (never a genuinely-
      // missing path).
      fs.chmodSync(legacyContainer677b, 0o000);
      chmodApplied677b = true;
      assert(fs.existsSync(wtPath677b) === false,
        '#677b fixture: existsSync must read false under a chmod-000 parent (test setup precondition), got true');

      const result = spawnS677b(process.execPath, [CLAIM677b, 'legacy-worktree-cleanup', '--execute'], {
        cwd: tmp677b,
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
      });
      let out677b = {};
      try { out677b = JSON.parse(result.stdout); } catch (_) {}

      assert(out677b.dry_run === false, '#677b: dry_run must be false, got ' + JSON.stringify(out677b) + '\nstderr: ' + result.stderr);

      // The critical assertion: a worktree whose PARENT was merely unreadable must be classified
      // 'unprobeable' (KEPT), never 'missing' (pruned-and-removed).
      assert(!(Array.isArray(out677b.removed) && out677b.removed.includes(wtPath677b)),
        '#677b: removed must NOT include a worktree whose parent dir was merely unreadable (existsSync false != missing), got ' + JSON.stringify(out677b.removed));
      assert(Array.isArray(out677b.skipped_unprobeable) && out677b.skipped_unprobeable.includes(wtPath677b),
        '#677b: skipped_unprobeable must record the parent-unreadable worktree (fail LOUD, not silent), got ' + JSON.stringify(out677b));

      // Restore access and confirm git's own registration + content survived (never pruned).
      fs.chmodSync(legacyContainer677b, 0o755);
      chmodApplied677b = false;
      let stillRegistered677b = false;
      try {
        const list = execFS677b('git', ['worktree', 'list', '--porcelain'], { cwd: tmp677b, encoding: 'utf8' });
        stillRegistered677b = list.includes(wtPath677b);
      } catch (_) {}
      assert(stillRegistered677b,
        '#677b: the worktree registration must SURVIVE cleanup --execute (kept, not pruned) once access is restored');
      assert(fs.existsSync(path.join(wtPath677b, 'real-work.txt')),
        '#677b: the worktree content must SURVIVE cleanup --execute once access is restored');
    } finally {
      if (chmodApplied677b) { try { fs.chmodSync(legacyContainer677b, 0o755); } catch (_) {} }
      fs.rmSync(tmp677b, { recursive: true, force: true });
      try { fs.rmSync(legacyContainer677b, { recursive: true, force: true }); } catch (_) {}
    }
  }
}

// --- #631: cmdVerifySink must PREFER published_head over rebase-stale branch_head --------------
// cmdVerifySink resolved implRef from `receipt.branch_head` only — stamped once at receipt init,
// BEFORE a mid-flight rebase rewrites the branch. A clean sink whose branch was rebased false-
// alarms `impl_commit_not_ancestor` even though the (rebased) content genuinely landed. The fix
// prefers the additive `receipt.published_head` (n1-sink's fresh, post-rebase stamp) when present.
{
  const { execFileSync: execFS631, spawnSync: spawnS631 } = require('child_process');
  const CLAIM631 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_631 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g631 = (cwd, args) => execFS631('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_631 });

  const tmp631 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-631-repo-')));
  const project631 = 'issue-96311';
  try {
    g631(tmp631, ['init', '-b', 'main']);
    g631(tmp631, ['config', 'user.email', 't@t.com']);
    g631(tmp631, ['config', 'user.name', 'Test']);
    g631(tmp631, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp631, 'README.md'), 'fixture\n');
    g631(tmp631, ['add', 'README.md']);
    g631(tmp631, ['commit', '-m', 'init']);

    // A divergent branch that never merges into main — its tip is the STALE pre-rebase branch_head
    // (kept on a real ref so the commit stays reachable, mirroring an orphaned pre-rebase SHA).
    g631(tmp631, ['checkout', '-b', 'workflow/' + project631]);
    fs.writeFileSync(path.join(tmp631, 'feat.txt'), 'impl\n');
    g631(tmp631, ['add', 'feat.txt']);
    g631(tmp631, ['commit', '-m', 'feat: impl']);
    const staleBranchHead = execFS631('git', ['-C', tmp631, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_631 }).trim();
    g631(tmp631, ['checkout', 'main']);

    // Advance main with the content that ACTUALLY landed (simulating the rebased/published tip).
    fs.writeFileSync(path.join(tmp631, 'published.txt'), 'landed\n');
    g631(tmp631, ['add', 'published.txt']);
    g631(tmp631, ['commit', '-m', 'feat: published']);
    const publishedHead = execFS631('git', ['-C', tmp631, 'rev-parse', 'main'], { encoding: 'utf8', env: GIT_ENV_631 }).trim();
    assert(staleBranchHead !== publishedHead, '#631 fixture: branch_head and published_head must differ, got equal ' + staleBranchHead);

    const archiveCacheDir = path.join(tmp631, 'kaola-workflow', 'archive', project631, '.cache');
    fs.mkdirSync(archiveCacheDir, { recursive: true });
    fs.writeFileSync(path.join(archiveCacheDir, 'sink-receipt.json'), JSON.stringify({
      branch_head: staleBranchHead,
      published_head: publishedHead
    }) + '\n');

    const result = spawnS631(process.execPath, [CLAIM631, 'verify-sink', '--project', project631], {
      cwd: tmp631,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out631 = {};
    try { out631 = JSON.parse(result.stdout); } catch (_) {}

    assert(out631.checks && out631.checks.impl_commit === publishedHead,
      '#631: cmdVerifySink must resolve impl_commit from published_head (' + publishedHead + '), got ' + JSON.stringify(out631.checks));
    assert(out631.checks && out631.checks.merged_into_sink_target === 'verified',
      '#631: a rebased-but-genuinely-published sink must verify (not false-alarm), got ' + JSON.stringify(out631.checks));
    assert(!(Array.isArray(out631.reasons) && out631.reasons.includes('impl_commit_not_ancestor')),
      '#631: reasons must NOT include impl_commit_not_ancestor for a genuinely published (rebased) sink, got ' + JSON.stringify(out631.reasons));
    assert(result.status === 0, '#631: verify-sink must exit 0 for a genuinely published rebased sink, got ' + result.status + ' full: ' + JSON.stringify(out631));
  } finally {
    fs.rmSync(tmp631, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #686: archive-time reap of dangling refs/kaola-workflow/barrier/<tag>/* refs (Behavior A).
// archiveProjectDir is the convergence point for finalize-closed / discard-abandoned / the
// active-folders backstop, so ONE insertion there must delete every barrier ref belonging to the
// archived project. RED (pre-impl): the ref survives archiving. GREEN (post-impl): the ref is gone
// AND the archive itself still succeeds; a reap failure must never throw or block the archive.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686 } = require('child_process');
  const claim686 = require('./kaola-workflow-claim.js');
  const GIT_ENV_686 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686 = (cwd, args) => execFS686('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686 });

  // --- (a) archive-time reap deletes the project's barrier ref; archive itself still succeeds ---
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686-reap-')));
    const project = 'issue-686reap';
    try {
      g686(tmp, ['init', '-b', 'main']);
      g686(tmp, ['config', 'user.email', 't@t.com']);
      g686(tmp, ['config', 'user.name', 'Test']);
      g686(tmp, ['config', 'commit.gpgsign', 'false']);
      fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
      g686(tmp, ['add', 'README.md']);
      g686(tmp, ['commit', '-m', 'init']);
      const headSha = execFS686('git', ['-C', tmp, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686 }).trim();

      const projDir = path.join(tmp, 'kaola-workflow', project);
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'), 'status: in_progress\nissue_number: 68601\n');

      const refName = 'refs/kaola-workflow/barrier/' + project + '/n1-test';
      g686(tmp, ['update-ref', refName, headSha]);
      const beforeReap = execFS686('git', ['-C', tmp, 'for-each-ref', '--format=%(refname)', 'refs/kaola-workflow/barrier/' + project + '/'], { encoding: 'utf8', env: GIT_ENV_686 }).trim();
      assert(beforeReap === refName, '#686 fixture: the barrier ref exists before archiving, got ' + JSON.stringify(beforeReap));

      const result = claim686.archiveProjectDir(tmp, project, 'closed', undefined, {});
      assert(result && result.archived === true, '#686: archiveProjectDir must still succeed with a barrier ref present, got ' + JSON.stringify(result));

      const afterReap = execFS686('git', ['-C', tmp, 'for-each-ref', '--format=%(refname)', 'refs/kaola-workflow/barrier/' + project + '/'], { encoding: 'utf8', env: GIT_ENV_686 }).trim();
      assert(afterReap === '', '#686: archive-time reap must delete every refs/kaola-workflow/barrier/<project>/* ref, got ' + JSON.stringify(afterReap));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // --- (b) FAIL-SOFT: a reap failure (no git repo at all) must not throw and must not block the archive ---
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686-failsoft-')));
    const project = 'issue-686failsoft';
    try {
      // Deliberately NOT a git repo — `git for-each-ref` inside the reap will fail (fatal: not a git
      // repository). archiveProjectDir must still complete via the plain fs.renameSync in-place path
      // (which needs no git at all).
      const projDir = path.join(tmp, 'kaola-workflow', project);
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'), 'status: in_progress\nissue_number: 68602\n');

      let threw = false, result;
      try { result = claim686.archiveProjectDir(tmp, project, 'closed', undefined, {}); }
      catch (_) { threw = true; }
      assert(threw === false, '#686: a ref-reap failure (no git repo) must NOT throw out of archiveProjectDir');
      assert(result && result.archived === true, '#686: the archive itself must still succeed despite the reap failure, got ' + JSON.stringify(result));
      assert(result && fs.existsSync(result.dest), '#686: the archived folder must exist despite the reap failure, dest=' + (result && result.dest));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// #686: legacy `barrier-ref-sweep` subcommand (Behavior B) — reclaims refs/kaola-workflow/barrier/
// <tag>/* refs left behind by projects archived BEFORE Behavior A shipped (or any path that bypassed
// archiveProjectDir). KEEP = every ACTIVE kaola-workflow/<project>/ folder OR any project with a live
// .cache/running-set.json; every other tag's refs are deleted. Mirrors the #680 orphan-baseline sweep
// discipline: sanitizer collisions only ever ADD to KEEP (fail-safe under-reap), and the sweep is
// scoped STRICTLY to refs/kaola-workflow/barrier/ — never leg-base/. RED (pre-impl): the subcommand
// does not exist. GREEN (post-impl): active/running-set/collision tags survive; the orphaned
// archived-project tag is swept; leg-base/ is untouched.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686b, spawnSync: spawnS686b } = require('child_process');
  const CLAIM686 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686b = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686b = (cwd, args) => execFS686b('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686b });

  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686-sweep-')));
  try {
    g686b(tmp, ['init', '-b', 'main']);
    g686b(tmp, ['config', 'user.email', 't@t.com']);
    g686b(tmp, ['config', 'user.name', 'Test']);
    g686b(tmp, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
    g686b(tmp, ['add', 'README.md']);
    g686b(tmp, ['commit', '-m', 'init']);
    const headSha = execFS686b('git', ['-C', tmp, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686b }).trim();

    // ACTIVE project — folder present, non-terminal status → KEEP.
    const activeProj = 'issue-686active';
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', activeProj), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', activeProj, 'workflow-state.md'), 'status: in_progress\nissue_number: 68611\n');
    g686b(tmp, ['update-ref', 'refs/kaola-workflow/barrier/' + activeProj + '/n1', headSha]);

    // ARCHIVED project — NO live folder at all (already archived pre-#686, ref left dangling) → DELETE.
    const archivedProj = 'issue-686archived';
    g686b(tmp, ['update-ref', 'refs/kaola-workflow/barrier/' + archivedProj + '/n1', headSha]);

    // Sanitizer-COLLISION — "proj.a686" (active, sanitizes to "proj_a686") shares its sanitized tag
    // with a (nonexistent-folder) "proj_a686". The collision must KEEP (fail-safe under-reap).
    const collisionActive = 'proj.a686';
    const collisionTag = 'proj_a686';
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', collisionActive), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', collisionActive, 'workflow-state.md'), 'status: in_progress\nissue_number: 68612\n');
    g686b(tmp, ['update-ref', 'refs/kaola-workflow/barrier/' + collisionTag + '/n1', headSha]);

    // RUNNING-SET project — folder present with a TERMINAL local status (would NOT be "active") but a
    // live .cache/running-set.json → must still KEEP via the running-set signal alone.
    const runningProj = 'issue-686running';
    fs.mkdirSync(path.join(tmp, 'kaola-workflow', runningProj, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', runningProj, 'workflow-state.md'), 'status: closed\nissue_number: 68613\n');
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', runningProj, '.cache', 'running-set.json'), JSON.stringify({ state: 'open', nodes: [] }));
    g686b(tmp, ['update-ref', 'refs/kaola-workflow/barrier/' + runningProj + '/n1', headSha]);

    // Scope guard — a leg-base ref (a SEPARATE namespace) must survive untouched (never barrier/).
    g686b(tmp, ['update-ref', 'refs/kaola-workflow/leg-base/' + archivedProj + '/n1', headSha]);

    const run = spawnS686b(process.execPath, [CLAIM686, 'barrier-ref-sweep', '--json'], {
      cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out = {};
    try { out = JSON.parse(String(run.stdout || '').trim().split('\n').pop()); } catch (_) {}

    const listRefs = (prefix) => execFS686b('git', ['-C', tmp, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686b }).trim();

    assert(run.status === 0, '#686 sweep: barrier-ref-sweep must exit 0, got status=' + run.status + ' stdout=' + run.stdout + ' stderr=' + run.stderr);
    assert(out && Array.isArray(out.refsDeleted) && Array.isArray(out.tagsKept), '#686 sweep: --json summary must carry refsDeleted[]/tagsKept[], got ' + JSON.stringify(out));

    assert(listRefs('refs/kaola-workflow/barrier/' + activeProj + '/') === 'refs/kaola-workflow/barrier/' + activeProj + '/n1',
      "#686 sweep: an ACTIVE project's barrier ref must be KEPT");
    assert(listRefs('refs/kaola-workflow/barrier/' + archivedProj + '/') === '',
      "#686 sweep: an ARCHIVED (no-folder) project's barrier ref must be DELETED");
    assert(listRefs('refs/kaola-workflow/barrier/' + collisionTag + '/') === 'refs/kaola-workflow/barrier/' + collisionTag + '/n1',
      '#686 sweep: a sanitizer-collision tag shared with an active folder must be KEPT (under-reap-safe)');
    assert(listRefs('refs/kaola-workflow/barrier/' + runningProj + '/') === 'refs/kaola-workflow/barrier/' + runningProj + '/n1',
      '#686 sweep: a project with a live .cache/running-set.json must be KEPT even with a terminal local status');
    assert(listRefs('refs/kaola-workflow/leg-base/' + archivedProj + '/') === 'refs/kaola-workflow/leg-base/' + archivedProj + '/n1',
      '#686 sweep: leg-base/ refs are a SEPARATE namespace and must never be touched by barrier-ref-sweep');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R1, code-reviewer gate n2-review): over-reap of a LIVE project when barrier-ref-sweep
// is invoked from a LINKED-WORKTREE cwd — the NORMAL orchestrator cwd for a run. The KEEP set was
// built from `root` (getRoot() of the invoking cwd) alone, but refs/kaola-workflow/barrier/* refs
// live in the shared git COMMON dir (enumerated/deleted with cwd: mainRoot) — while a LIVE claim's
// kaola-workflow/<project>/ folder lives in the MAIN root, invisible from a sibling worktree's own
// kaola-workflow/ dir. A sweep run from a linked worktree therefore reaped a live sibling project's
// barrier ref — the gc-anchor whose baseline commit git gc can then prune, making the
// barrier_base_mismatch ref-restore repair impossible. RED (pre-fix): a live sibling project (folder
// + workflow-state.md + running .cache/running-set.json under the MAIN root only) is reaped when the
// sweep runs with cwd = a linked worktree. GREEN (post-fix): the KEEP set is the UNION of the
// `root`-universe and the `mainRoot`-universe, so the live sibling survives.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686c, spawnSync: spawnS686c } = require('child_process');
  const CLAIM686c = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686c = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686c = (cwd, args) => execFS686c('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686c });

  const mainRoot686c = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686c-main-')));
  const kwRoot686c = mainRoot686c + '.kw';
  try {
    g686c(mainRoot686c, ['init', '-b', 'main']);
    g686c(mainRoot686c, ['config', 'user.email', 't@t.com']);
    g686c(mainRoot686c, ['config', 'user.name', 'Test']);
    g686c(mainRoot686c, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot686c, 'README.md'), 'fixture\n');
    g686c(mainRoot686c, ['add', 'README.md']);
    g686c(mainRoot686c, ['commit', '-m', 'init']);
    const headSha686c = execFS686c('git', ['-C', mainRoot686c, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686c }).trim();

    // Linked worktree — the invoking cwd for the sweep. Its OWN kaola-workflow/ dir never exists.
    const wtPath686c = path.join(kwRoot686c, 'issue-686wtcwd');
    fs.mkdirSync(kwRoot686c, { recursive: true });
    g686c(mainRoot686c, ['worktree', 'add', '-b', 'workflow/issue-68621', '--', wtPath686c, 'HEAD']);

    // LIVE sibling project — folder + workflow-state.md + a live running-set.json, but ONLY under the
    // MAIN root (as a real claim's folder always is), never under the worktree's own kaola-workflow/.
    const siblingProj = 'issue-686sibling';
    fs.mkdirSync(path.join(mainRoot686c, 'kaola-workflow', siblingProj, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(mainRoot686c, 'kaola-workflow', siblingProj, 'workflow-state.md'), 'status: in_progress\nissue_number: 68621\n');
    fs.writeFileSync(path.join(mainRoot686c, 'kaola-workflow', siblingProj, '.cache', 'running-set.json'), JSON.stringify({ state: 'open', nodes: [] }));
    g686c(mainRoot686c, ['update-ref', 'refs/kaola-workflow/barrier/' + siblingProj + '/n1', headSha686c]);

    const listRefs686c = (prefix) => execFS686c('git', ['-C', mainRoot686c, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686c }).trim();
    const beforeSweep686c = listRefs686c('refs/kaola-workflow/barrier/' + siblingProj + '/');
    assert(beforeSweep686c === 'refs/kaola-workflow/barrier/' + siblingProj + '/n1',
      '#686 R1 fixture: the live sibling barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep686c));

    // Invoke the sweep with cwd = the LINKED WORKTREE — the normal orchestrator cwd for a run.
    const run686c = spawnS686c(process.execPath, [CLAIM686c, 'barrier-ref-sweep', '--json'], {
      cwd: wtPath686c, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out686c = {};
    try { out686c = JSON.parse(String(run686c.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686c.status === 0, '#686 R1: barrier-ref-sweep must exit 0, got status=' + run686c.status + ' stdout=' + run686c.stdout + ' stderr=' + run686c.stderr);

    const afterSweep686c = listRefs686c('refs/kaola-workflow/barrier/' + siblingProj + '/');
    assert(afterSweep686c === 'refs/kaola-workflow/barrier/' + siblingProj + '/n1',
      '#686 R1: a LIVE sibling project (folder in the MAIN root, invisible from the invoking worktree cwd) must be KEPT, not over-reaped, when the sweep runs from a linked-worktree cwd. tagsKept=' +
      JSON.stringify(out686c.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686c.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out686c.refsDeleted));
    assert(Array.isArray(out686c.tagsKept) && out686c.tagsKept.includes(siblingProj),
      '#686 R1: tagsKept must include the live sibling project tag, got ' + JSON.stringify(out686c.tagsKept));
  } finally {
    fs.rmSync(mainRoot686c, { recursive: true, force: true });
    try { fs.rmSync(kwRoot686c, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R4, n3-adversary attempt 1): the reachable claim-root universe is EVERY linked
// worktree, not just {invoking root, mainRoot} (R1's fix closed only half the class). A claim from a
// THIRD worktree w2 — neither the sweep's invoking cwd w1 nor mainRoot — writes its live folder +
// running-set.json ONLY under w2, invisible to a sweep run from w1. RED (pre-fix): the w2-only live
// project's barrier ref is DELETED when the sweep runs from w1. GREEN (post-fix): the keep-set scan
// spans EVERY `git worktree list --porcelain` root (mainRoot + every linked worktree — legs included
// for free), so the w2-only project survives. A genuinely dead (no-folder-anywhere) tag is still
// reaped, proving the fix does not degrade into a blanket keep-everything.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686d, spawnSync: spawnS686d } = require('child_process');
  const CLAIM686d = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686d = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686d = (cwd, args) => execFS686d('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686d });

  const mainRoot686d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686d-main-')));
  const kwRoot686d = mainRoot686d + '.kw';
  try {
    g686d(mainRoot686d, ['init', '-b', 'main']);
    g686d(mainRoot686d, ['config', 'user.email', 't@t.com']);
    g686d(mainRoot686d, ['config', 'user.name', 'Test']);
    g686d(mainRoot686d, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot686d, 'README.md'), 'fixture\n');
    g686d(mainRoot686d, ['add', 'README.md']);
    g686d(mainRoot686d, ['commit', '-m', 'init']);
    const headSha686d = execFS686d('git', ['-C', mainRoot686d, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686d }).trim();

    fs.mkdirSync(kwRoot686d, { recursive: true });
    // w1 — the invoking cwd for the sweep. Its own kaola-workflow/ never exists.
    const w1Path686d = path.join(kwRoot686d, 'issue-686w1');
    g686d(mainRoot686d, ['worktree', 'add', '-b', 'workflow/issue-68631', '--', w1Path686d, 'HEAD']);
    // w2 — a THIRD worktree (neither w1 nor mainRoot) holding the ONLY copy of the live project.
    const w2Path686d = path.join(kwRoot686d, 'issue-686w2');
    g686d(mainRoot686d, ['worktree', 'add', '-b', 'workflow/issue-68632', '--', w2Path686d, 'HEAD']);

    const w2LiveProj = 'issue-686w2live';
    fs.mkdirSync(path.join(w2Path686d, 'kaola-workflow', w2LiveProj, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(w2Path686d, 'kaola-workflow', w2LiveProj, 'workflow-state.md'), 'status: in_progress\nissue_number: 68632\n');
    fs.writeFileSync(path.join(w2Path686d, 'kaola-workflow', w2LiveProj, '.cache', 'running-set.json'), JSON.stringify({ state: 'open', nodes: [] }));
    g686d(mainRoot686d, ['update-ref', 'refs/kaola-workflow/barrier/' + w2LiveProj + '/n1', headSha686d]);

    // A genuinely DEAD project (no folder anywhere) — must still be reaped post-fix.
    const deadProj686d = 'issue-686w2dead';
    g686d(mainRoot686d, ['update-ref', 'refs/kaola-workflow/barrier/' + deadProj686d + '/n1', headSha686d]);

    const listRefs686d = (prefix) => execFS686d('git', ['-C', mainRoot686d, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686d }).trim();
    const beforeSweep686d = listRefs686d('refs/kaola-workflow/barrier/' + w2LiveProj + '/');
    assert(beforeSweep686d === 'refs/kaola-workflow/barrier/' + w2LiveProj + '/n1',
      '#686 R4 fixture: the w2-only live barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep686d));

    // Invoke the sweep with cwd = w1 — NEITHER the live project's own root NOR mainRoot.
    const run686d = spawnS686d(process.execPath, [CLAIM686d, 'barrier-ref-sweep', '--json'], {
      cwd: w1Path686d, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out686d = {};
    try { out686d = JSON.parse(String(run686d.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686d.status === 0, '#686 R4: barrier-ref-sweep must exit 0, got status=' + run686d.status + ' stdout=' + run686d.stdout + ' stderr=' + run686d.stderr);

    const afterSweep686d = listRefs686d('refs/kaola-workflow/barrier/' + w2LiveProj + '/');
    assert(afterSweep686d === 'refs/kaola-workflow/barrier/' + w2LiveProj + '/n1',
      '#686 R4: a LIVE project claimed in a THIRD worktree (neither the invoking root nor mainRoot) must be KEPT, not over-reaped. tagsKept=' +
      JSON.stringify(out686d.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686d.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out686d.refsDeleted));
    assert(Array.isArray(out686d.tagsKept) && out686d.tagsKept.includes(w2LiveProj),
      '#686 R4: tagsKept must include the w2-only live project tag, got ' + JSON.stringify(out686d.tagsKept));
    assert(listRefs686d('refs/kaola-workflow/barrier/' + deadProj686d + '/') === '',
      '#686 R4: a genuinely dead (no-folder-anywhere) tag must still be reaped — the fix must not degrade into keep-everything');
  } finally {
    fs.rmSync(mainRoot686d, { recursive: true, force: true });
    try { fs.rmSync(kwRoot686d, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R4 fail-closed): `git worktree list` itself failing (an unscannable worktree set)
// must ABORT the sweep — delete NOTHING — rather than proceed on a partial keep universe. An
// unknown worktree set means the sweep cannot prove any tag is dead. RED (pre-fix): the injection
// hook does not exist yet, so forcing it is a no-op — the sweep proceeds normally and reaps the
// dead tag anyway. GREEN (post-fix): the forced enumeration failure aborts before any
// `update-ref -d` runs, so the dead tag's ref survives too (a safe over-keep, never an over-reap).
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686f, spawnSync: spawnS686f } = require('child_process');
  const CLAIM686f = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686f = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686f = (cwd, args) => execFS686f('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686f });

  const tmp686f = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686f-')));
  try {
    g686f(tmp686f, ['init', '-b', 'main']);
    g686f(tmp686f, ['config', 'user.email', 't@t.com']);
    g686f(tmp686f, ['config', 'user.name', 'Test']);
    g686f(tmp686f, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp686f, 'README.md'), 'fixture\n');
    g686f(tmp686f, ['add', 'README.md']);
    g686f(tmp686f, ['commit', '-m', 'init']);
    const headSha686f = execFS686f('git', ['-C', tmp686f, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686f }).trim();

    // A genuinely dead (no-folder-anywhere) tag — deleted in normal operation, but must SURVIVE
    // when the worktree-list enumeration itself is forced to fail.
    const deadProj686f = 'issue-686fdead';
    g686f(tmp686f, ['update-ref', 'refs/kaola-workflow/barrier/' + deadProj686f + '/n1', headSha686f]);

    const run686f = spawnS686f(process.execPath, [CLAIM686f, 'barrier-ref-sweep', '--json'], {
      cwd: tmp686f, encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKFLOW_FORCE_BARRIER_WT_LIST_FAIL: '1' })
    });
    let out686f = {};
    try { out686f = JSON.parse(String(run686f.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686f.status === 0, '#686 R4 fail-closed: barrier-ref-sweep must still exit 0 on a safe abort, got status=' + run686f.status + ' stdout=' + run686f.stdout + ' stderr=' + run686f.stderr);
    assert(out686f && out686f.aborted === true,
      '#686 R4 fail-closed: a forced `git worktree list` enumeration failure must set aborted:true, got ' + JSON.stringify(out686f));
    assert(Array.isArray(out686f.refsDeleted) && out686f.refsDeleted.length === 0,
      '#686 R4 fail-closed: an enumeration failure must delete NOTHING, got refsDeleted=' + JSON.stringify(out686f.refsDeleted));

    const afterSweep686f = execFS686f('git', ['-C', tmp686f, 'for-each-ref', '--format=%(refname)', 'refs/kaola-workflow/barrier/' + deadProj686f + '/'], { encoding: 'utf8', env: GIT_ENV_686f }).trim();
    assert(afterSweep686f === 'refs/kaola-workflow/barrier/' + deadProj686f + '/n1',
      '#686 R4 fail-closed: even a genuinely dead tag must SURVIVE an enumeration-failure abort (delete nothing beats delete-the-wrong-thing), got ' + JSON.stringify(afterSweep686f));
  } finally {
    fs.rmSync(tmp686f, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R5, n3-adversary attempt 1): case-insensitive-FS tag/dirent mismatch. A wrong-case
// --record-base anchors barrier ref tag `Issue-9` while the live folder dirent is `issue-9` — on a
// case-insensitive filesystem the two paths are the SAME inode, but the ref tag is recorded EXACTLY
// as given (plan-validator.js projTag = basename AS GIVEN), so `keep` (built as `issue-9` from
// readActiveFolders) does not exact-match the enumerated ref tag `Issue-9` → over-reap. FIX: the
// sweep's keep membership check is CASE-FOLDED (fail-safe — only ever ADDS keeps, never removes
// one). This test constructs the tag/folder case divergence directly so it is deterministic
// regardless of the host FS's own case-sensitivity.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686e, spawnSync: spawnS686e } = require('child_process');
  const CLAIM686e = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686e = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686e = (cwd, args) => execFS686e('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686e });

  const tmp686e = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686e-')));
  try {
    g686e(tmp686e, ['init', '-b', 'main']);
    g686e(tmp686e, ['config', 'user.email', 't@t.com']);
    g686e(tmp686e, ['config', 'user.name', 'Test']);
    g686e(tmp686e, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(tmp686e, 'README.md'), 'fixture\n');
    g686e(tmp686e, ['add', 'README.md']);
    g686e(tmp686e, ['commit', '-m', 'init']);
    const headSha686e = execFS686e('git', ['-C', tmp686e, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686e }).trim();

    // Live folder dirent: lowercase `issue-9`.
    const liveProj686e = 'issue-9';
    fs.mkdirSync(path.join(tmp686e, 'kaola-workflow', liveProj686e), { recursive: true });
    fs.writeFileSync(path.join(tmp686e, 'kaola-workflow', liveProj686e, 'workflow-state.md'), 'status: in_progress\nissue_number: 6869\n');
    // Ref tag anchored with the WRONG case, as a real --record-base from a wrong-case path would.
    const wrongCaseTag686e = 'Issue-9';
    g686e(tmp686e, ['update-ref', 'refs/kaola-workflow/barrier/' + wrongCaseTag686e + '/n1', headSha686e]);

    const run686e = spawnS686e(process.execPath, [CLAIM686e, 'barrier-ref-sweep', '--json'], {
      cwd: tmp686e, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out686e = {};
    try { out686e = JSON.parse(String(run686e.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686e.status === 0, '#686 R5: barrier-ref-sweep must exit 0, got status=' + run686e.status + ' stdout=' + run686e.stdout + ' stderr=' + run686e.stderr);

    const afterSweep686e = execFS686e('git', ['-C', tmp686e, 'for-each-ref', '--format=%(refname)', 'refs/kaola-workflow/barrier/' + wrongCaseTag686e + '/'], { encoding: 'utf8', env: GIT_ENV_686e }).trim();
    assert(afterSweep686e === 'refs/kaola-workflow/barrier/' + wrongCaseTag686e + '/n1',
      '#686 R5: a wrong-case ref tag (`Issue-9`) whose live folder dirent differs only in case (`issue-9`) must be KEPT under case-folded comparison, got ' + JSON.stringify(afterSweep686e) +
      ' tagsKept=' + JSON.stringify(out686e.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686e.tagsDeleted));
    assert(Array.isArray(out686e.tagsKept) && out686e.tagsKept.includes(wrongCaseTag686e),
      '#686 R5: tagsKept must include the wrong-case tag, got ' + JSON.stringify(out686e.tagsKept));
  } finally {
    fs.rmSync(tmp686e, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R6, n3-adversary attempt 2): a worktree path containing a literal EMBEDDED NEWLINE.
// `git worktree add` accepts such a path (APFS allows it); plain `--porcelain` (no -z) uses a bare
// LF as the field/record terminator, so the path is emitted RAW across two physical lines — the
// old `split('\n')` + `indexOf('worktree ')` parse captures only the first physical line (a
// nonexistent prefix), silently dropping the rest of the path. That makes the newline-worktree root
// unscannable, so a LIVE claim rooted there is invisible to the keep-set scan and its barrier ref is
// over-reaped. FIX: `--porcelain -z` (NUL-separated) emits the path byte-exact between NULs,
// unambiguous regardless of embedded LFs.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686g, spawnSync: spawnS686g } = require('child_process');
  const CLAIM686g = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686g = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686g = (cwd, args) => execFS686g('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686g });

  const mainRoot686g = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686g-main-')));
  // #690 (n2 finding, test hygiene): declared ABOVE the try (not `const` inside it) so the finally
  // below can always reach it and clean it up, even if an assertion throws before or after this
  // SIBLING scratch worktree dir (outside mainRoot686g) is created.
  let nlPath686g;
  try {
    g686g(mainRoot686g, ['init', '-b', 'main']);
    g686g(mainRoot686g, ['config', 'user.email', 't@t.com']);
    g686g(mainRoot686g, ['config', 'user.name', 'Test']);
    g686g(mainRoot686g, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot686g, 'README.md'), 'fixture\n');
    g686g(mainRoot686g, ['add', 'README.md']);
    g686g(mainRoot686g, ['commit', '-m', 'init']);
    const headSha686g = execFS686g('git', ['-C', mainRoot686g, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686g }).trim();

    // A worktree path whose final path SEGMENT contains a literal embedded newline.
    nlPath686g = mainRoot686g + '-wt-a' + '\n' + 'wt-b';
    g686g(mainRoot686g, ['worktree', 'add', '-b', 'workflow/issue-686nl', '--', nlPath686g, 'HEAD']);
    assert(fs.existsSync(nlPath686g), '#686 R6 fixture: the embedded-newline worktree path must exist on disk, got path=' + JSON.stringify(nlPath686g));

    // A LIVE project rooted ONLY inside the newline-path worktree.
    const nlLiveProj = 'issue-686nllive';
    fs.mkdirSync(path.join(nlPath686g, 'kaola-workflow', nlLiveProj, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(nlPath686g, 'kaola-workflow', nlLiveProj, 'workflow-state.md'), 'status: in_progress\nissue_number: 68641\n');
    fs.writeFileSync(path.join(nlPath686g, 'kaola-workflow', nlLiveProj, '.cache', 'running-set.json'), JSON.stringify({ state: 'open', nodes: [] }));
    g686g(mainRoot686g, ['update-ref', 'refs/kaola-workflow/barrier/' + nlLiveProj + '/n1', headSha686g]);

    const listRefs686g = (prefix) => execFS686g('git', ['-C', mainRoot686g, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686g }).trim();
    const beforeSweep686g = listRefs686g('refs/kaola-workflow/barrier/' + nlLiveProj + '/');
    assert(beforeSweep686g === 'refs/kaola-workflow/barrier/' + nlLiveProj + '/n1',
      '#686 R6 fixture: the embedded-newline-worktree live barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep686g));

    const run686g = spawnS686g(process.execPath, [CLAIM686g, 'barrier-ref-sweep', '--json'], {
      cwd: mainRoot686g, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out686g = {};
    try { out686g = JSON.parse(String(run686g.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686g.status === 0, '#686 R6: barrier-ref-sweep must exit 0, got status=' + run686g.status + ' stdout=' + run686g.stdout + ' stderr=' + run686g.stderr);

    const afterSweep686g = listRefs686g('refs/kaola-workflow/barrier/' + nlLiveProj + '/');
    assert(afterSweep686g === 'refs/kaola-workflow/barrier/' + nlLiveProj + '/n1',
      '#686 R6: a LIVE project rooted in a worktree whose path contains an embedded newline must be KEPT, not over-reaped by an LF-split porcelain misparse. tagsKept=' +
      JSON.stringify(out686g.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686g.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out686g.refsDeleted));
    assert(Array.isArray(out686g.tagsKept) && out686g.tagsKept.includes(nlLiveProj),
      '#686 R6: tagsKept must include the embedded-newline-worktree live project tag, got ' + JSON.stringify(out686g.tagsKept));
  } finally {
    // #690 fix: nlPath686g is a SIBLING worktree dir living OUTSIDE mainRoot686g, so deleting
    // mainRoot686g alone leaked it (n2 finding, filed as #690) — remove it independently first.
    if (nlPath686g) { try { fs.rmSync(nlPath686g, { recursive: true, force: true }); } catch (_) {} }
    fs.rmSync(mainRoot686g, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R7, n3-adversary attempt 2): a worktree path with a meaningful TRAILING SPACE.
// `git worktree add` accepts such a path; plain `--porcelain` emits it verbatim (the trailing space
// is part of the path, not terminator padding) — but the old parse's `.trim()` on the extracted
// field strips it, resolving to a DIFFERENT, nonexistent root. That makes the trailing-space
// worktree unscannable, so a LIVE claim rooted there is invisible and its barrier ref is over-reaped.
// Distinct flaw from R6 (the `.trim()`, not the LF split) but the SAME fix locus and fix.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686h, spawnSync: spawnS686h } = require('child_process');
  const CLAIM686h = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686h = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686h = (cwd, args) => execFS686h('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686h });

  const mainRoot686h = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686h-main-')));
  try {
    g686h(mainRoot686h, ['init', '-b', 'main']);
    g686h(mainRoot686h, ['config', 'user.email', 't@t.com']);
    g686h(mainRoot686h, ['config', 'user.name', 'Test']);
    g686h(mainRoot686h, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot686h, 'README.md'), 'fixture\n');
    g686h(mainRoot686h, ['add', 'README.md']);
    g686h(mainRoot686h, ['commit', '-m', 'init']);
    const headSha686h = execFS686h('git', ['-C', mainRoot686h, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686h }).trim();

    // A worktree path with a meaningful trailing space.
    const trailPath686h = path.join(mainRoot686h + '.kw', 'issue-686trail ');
    fs.mkdirSync(mainRoot686h + '.kw', { recursive: true });
    g686h(mainRoot686h, ['worktree', 'add', '-b', 'workflow/issue-686trail', '--', trailPath686h, 'HEAD']);
    assert(fs.existsSync(trailPath686h), '#686 R7 fixture: the trailing-space worktree path must exist on disk, got path=' + JSON.stringify(trailPath686h));

    // A LIVE project rooted ONLY inside the trailing-space worktree.
    const trailLiveProj = 'issue-686traillive';
    fs.mkdirSync(path.join(trailPath686h, 'kaola-workflow', trailLiveProj, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(trailPath686h, 'kaola-workflow', trailLiveProj, 'workflow-state.md'), 'status: in_progress\nissue_number: 68642\n');
    fs.writeFileSync(path.join(trailPath686h, 'kaola-workflow', trailLiveProj, '.cache', 'running-set.json'), JSON.stringify({ state: 'open', nodes: [] }));
    g686h(mainRoot686h, ['update-ref', 'refs/kaola-workflow/barrier/' + trailLiveProj + '/n1', headSha686h]);

    const listRefs686h = (prefix) => execFS686h('git', ['-C', mainRoot686h, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686h }).trim();
    const beforeSweep686h = listRefs686h('refs/kaola-workflow/barrier/' + trailLiveProj + '/');
    assert(beforeSweep686h === 'refs/kaola-workflow/barrier/' + trailLiveProj + '/n1',
      '#686 R7 fixture: the trailing-space-worktree live barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep686h));

    const run686h = spawnS686h(process.execPath, [CLAIM686h, 'barrier-ref-sweep', '--json'], {
      cwd: mainRoot686h, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out686h = {};
    try { out686h = JSON.parse(String(run686h.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686h.status === 0, '#686 R7: barrier-ref-sweep must exit 0, got status=' + run686h.status + ' stdout=' + run686h.stdout + ' stderr=' + run686h.stderr);

    const afterSweep686h = listRefs686h('refs/kaola-workflow/barrier/' + trailLiveProj + '/');
    assert(afterSweep686h === 'refs/kaola-workflow/barrier/' + trailLiveProj + '/n1',
      '#686 R7: a LIVE project rooted in a worktree whose path has a trailing space must be KEPT, not over-reaped by a `.trim()`-corrupted porcelain misparse. tagsKept=' +
      JSON.stringify(out686h.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686h.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out686h.refsDeleted));
    assert(Array.isArray(out686h.tagsKept) && out686h.tagsKept.includes(trailLiveProj),
      '#686 R7: tagsKept must include the trailing-space-worktree live project tag, got ' + JSON.stringify(out686h.tagsKept));
  } finally {
    fs.rmSync(mainRoot686h + '.kw', { recursive: true, force: true });
    fs.rmSync(mainRoot686h, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R8a, n3-adversary attempt 3): a present-but-UNREADABLE workflow-state.md (EACCES via
// chmod 000) silently drops its folder's ONLY keep signal. readActiveFolders (shared,
// active-folders.js) swallows the per-folder fs.readFileSync throw with a bare `continue`
// (active-folders.js:246), so a live SEQUENCE-run project — no .cache/running-set.json, the common
// case, and this fixture's shape — has no OTHER keep signal and its barrier gc-anchor gets reaped
// even though the state file's mere presence is liveness evidence the sweep cannot disprove. A
// genuinely dead (no-folder-anywhere) tag must still be reaped alongside it — the fix must not
// degrade into keep-everything.
// ---------------------------------------------------------------------------
{
  const isRoot686i = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot686i) {
    console.error('SKIP #686 R8a: running as root — chmod 000 is not enforced, skipping the unreadable-state-file regression');
  } else {
    const { execFileSync: execFS686i, spawnSync: spawnS686i } = require('child_process');
    const CLAIM686i = path.join(__dirname, 'kaola-workflow-claim.js');
    const GIT_ENV_686i = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
    });
    const g686i = (cwd, args) => execFS686i('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686i });

    const mainRoot686i = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686i-main-')));
    // Declared ABOVE the try (test hygiene, per #690) so the finally can always restore perms and
    // clean up even if an assertion throws mid-test.
    let stateFile686i;
    try {
      g686i(mainRoot686i, ['init', '-b', 'main']);
      g686i(mainRoot686i, ['config', 'user.email', 't@t.com']);
      g686i(mainRoot686i, ['config', 'user.name', 'Test']);
      g686i(mainRoot686i, ['config', 'commit.gpgsign', 'false']);
      fs.writeFileSync(path.join(mainRoot686i, 'README.md'), 'fixture\n');
      g686i(mainRoot686i, ['add', 'README.md']);
      g686i(mainRoot686i, ['commit', '-m', 'init']);
      const headSha686i = execFS686i('git', ['-C', mainRoot686i, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686i }).trim();

      // A LIVE SEQUENCE-run project: workflow-state.md present but UNREADABLE (chmod 000), and
      // deliberately NO .cache/running-set.json — the state file is its SOLE keep signal.
      const liveProj686i = 'issue-686chmodlive';
      fs.mkdirSync(path.join(mainRoot686i, 'kaola-workflow', liveProj686i), { recursive: true });
      stateFile686i = path.join(mainRoot686i, 'kaola-workflow', liveProj686i, 'workflow-state.md');
      fs.writeFileSync(stateFile686i, 'status: in_progress\nissue_number: 68643\n');
      fs.chmodSync(stateFile686i, 0o000);
      g686i(mainRoot686i, ['update-ref', 'refs/kaola-workflow/barrier/' + liveProj686i + '/n1', headSha686i]);

      // A genuinely DEAD project (no folder at all) — must still be reaped, not swept into a
      // blanket keep-everything by this fix.
      const deadProj686i = 'issue-686chmoddead';
      g686i(mainRoot686i, ['update-ref', 'refs/kaola-workflow/barrier/' + deadProj686i + '/n1', headSha686i]);

      const listRefs686i = (prefix) => execFS686i('git', ['-C', mainRoot686i, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686i }).trim();
      const beforeSweep686i = listRefs686i('refs/kaola-workflow/barrier/' + liveProj686i + '/');
      assert(beforeSweep686i === 'refs/kaola-workflow/barrier/' + liveProj686i + '/n1',
        '#686 R8a fixture: the chmod-000-state-file live barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep686i));

      const run686i = spawnS686i(process.execPath, [CLAIM686i, 'barrier-ref-sweep', '--json'], {
        cwd: mainRoot686i, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
      });
      let out686i = {};
      try { out686i = JSON.parse(String(run686i.stdout || '').trim().split('\n').pop()); } catch (_) {}
      assert(run686i.status === 0, '#686 R8a: barrier-ref-sweep must exit 0, got status=' + run686i.status + ' stdout=' + run686i.stdout + ' stderr=' + run686i.stderr);

      const afterSweep686i = listRefs686i('refs/kaola-workflow/barrier/' + liveProj686i + '/');
      assert(afterSweep686i === 'refs/kaola-workflow/barrier/' + liveProj686i + '/n1',
        '#686 R8a: a LIVE project whose workflow-state.md exists but is UNREADABLE (chmod 000 / EACCES) must be KEPT — present-but-unreadable is unprovable-dead liveness evidence, not a reason to reap. tagsKept=' +
        JSON.stringify(out686i.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686i.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out686i.refsDeleted));
      assert(Array.isArray(out686i.tagsKept) && out686i.tagsKept.includes(liveProj686i),
        '#686 R8a: tagsKept must include the chmod-000-state-file live project tag, got ' + JSON.stringify(out686i.tagsKept));
      assert(listRefs686i('refs/kaola-workflow/barrier/' + deadProj686i + '/') === '',
        '#686 R8a: a genuinely dead (no-folder-anywhere) tag must still be reaped even with the unreadable-state-file keep pass added — must not degrade into keep-everything');
    } finally {
      if (stateFile686i) { try { fs.chmodSync(stateFile686i, 0o644); } catch (_) {} }
      fs.rmSync(mainRoot686i, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// #686 REPAIR (R8b, n3-adversary attempt 3): workflow-state.md is itself a DIRECTORY (EISDIR) — a
// distinct fault shape from R8a's EACCES, but the SAME swallow-and-drop mechanism in
// readActiveFolders (a bare `continue` on ANY fs.readFileSync throw) and the SAME sweep-local fix.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS686j, spawnSync: spawnS686j } = require('child_process');
  const CLAIM686j = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV_686j = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
  });
  const g686j = (cwd, args) => execFS686j('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_686j });

  const mainRoot686j = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-686j-main-')));
  try {
    g686j(mainRoot686j, ['init', '-b', 'main']);
    g686j(mainRoot686j, ['config', 'user.email', 't@t.com']);
    g686j(mainRoot686j, ['config', 'user.name', 'Test']);
    g686j(mainRoot686j, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot686j, 'README.md'), 'fixture\n');
    g686j(mainRoot686j, ['add', 'README.md']);
    g686j(mainRoot686j, ['commit', '-m', 'init']);
    const headSha686j = execFS686j('git', ['-C', mainRoot686j, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_686j }).trim();

    // A LIVE SEQUENCE-run project: workflow-state.md is a DIRECTORY (EISDIR), and deliberately no
    // .cache/running-set.json — the state file is its SOLE keep signal.
    const liveProj686j = 'issue-686eisdirlive';
    fs.mkdirSync(path.join(mainRoot686j, 'kaola-workflow', liveProj686j, 'workflow-state.md'), { recursive: true });
    g686j(mainRoot686j, ['update-ref', 'refs/kaola-workflow/barrier/' + liveProj686j + '/n1', headSha686j]);

    // A genuinely DEAD project (no folder at all) — must still be reaped.
    const deadProj686j = 'issue-686eisdirdead';
    g686j(mainRoot686j, ['update-ref', 'refs/kaola-workflow/barrier/' + deadProj686j + '/n1', headSha686j]);

    const listRefs686j = (prefix) => execFS686j('git', ['-C', mainRoot686j, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_686j }).trim();
    const beforeSweep686j = listRefs686j('refs/kaola-workflow/barrier/' + liveProj686j + '/');
    assert(beforeSweep686j === 'refs/kaola-workflow/barrier/' + liveProj686j + '/n1',
      '#686 R8b fixture: the EISDIR-state-file live barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep686j));

    const run686j = spawnS686j(process.execPath, [CLAIM686j, 'barrier-ref-sweep', '--json'], {
      cwd: mainRoot686j, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    let out686j = {};
    try { out686j = JSON.parse(String(run686j.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert(run686j.status === 0, '#686 R8b: barrier-ref-sweep must exit 0, got status=' + run686j.status + ' stdout=' + run686j.stdout + ' stderr=' + run686j.stderr);

    const afterSweep686j = listRefs686j('refs/kaola-workflow/barrier/' + liveProj686j + '/');
    assert(afterSweep686j === 'refs/kaola-workflow/barrier/' + liveProj686j + '/n1',
      '#686 R8b: a LIVE project whose workflow-state.md is itself a DIRECTORY (EISDIR) must be KEPT, not over-reaped. tagsKept=' +
      JSON.stringify(out686j.tagsKept) + ' tagsDeleted=' + JSON.stringify(out686j.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out686j.refsDeleted));
    assert(Array.isArray(out686j.tagsKept) && out686j.tagsKept.includes(liveProj686j),
      '#686 R8b: tagsKept must include the EISDIR-state-file live project tag, got ' + JSON.stringify(out686j.tagsKept));
    assert(listRefs686j('refs/kaola-workflow/barrier/' + deadProj686j + '/') === '',
      '#686 R8b: a genuinely dead (no-folder-anywhere) tag must still be reaped even with the unreadable-state-file keep pass added — must not degrade into keep-everything');
  } finally {
    fs.rmSync(mainRoot686j, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #691 (R10, an R8 sibling): keep-pass (c) used `fs.existsSync(stateFile)` to distinguish
// present-vs-absent, but `existsSync` returns FALSE when the state file cannot be reached because its
// PARENT project directory is itself chmod 000 (EACCES-through-parent) — indistinguishable from a
// genuinely-absent file, so a LIVE project whose *directory* is chmod-000 (state file live inside,
// just unreachable) was dropped from the keep set and its live barrier gc-anchor reaped. Fix: a single
// fs.statSync (then readFileSync) try/catch that KEEPS on any non-ENOENT fault (EACCES/EISDIR/EPERM/…)
// and stays reapable on a clean ENOENT. Guarded with a process.getuid() root-skip (chmod 000 is not
// enforced running as root); perms restored + directory removed in a `finally` (vars hoisted above the
// try, per #690 test hygiene).
// ---------------------------------------------------------------------------
{
  const isRoot691 = typeof process.getuid === 'function' && process.getuid() === 0;
  if (isRoot691) {
    console.error('SKIP #691: running as root — chmod 000 is not enforced, skipping the chmod-000-project-directory regression');
  } else {
    const { execFileSync: execFS691, spawnSync: spawnS691 } = require('child_process');
    const CLAIM691 = path.join(__dirname, 'kaola-workflow-claim.js');
    const GIT_ENV_691 = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1'
    });
    const g691 = (cwd, args) => execFS691('git', ['-C', cwd].concat(args), { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_691 });

    const mainRoot691 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-691-main-')));
    // Declared ABOVE the try (test hygiene, per #690) so the finally can always restore perms and
    // clean up even if an assertion throws mid-test.
    let projDirChmod691;
    try {
      g691(mainRoot691, ['init', '-b', 'main']);
      g691(mainRoot691, ['config', 'user.email', 't@t.com']);
      g691(mainRoot691, ['config', 'user.name', 'Test']);
      g691(mainRoot691, ['config', 'commit.gpgsign', 'false']);
      fs.writeFileSync(path.join(mainRoot691, 'README.md'), 'fixture\n');
      g691(mainRoot691, ['add', 'README.md']);
      g691(mainRoot691, ['commit', '-m', 'init']);
      const headSha691 = execFS691('git', ['-C', mainRoot691, 'rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_691 }).trim();

      // A LIVE SEQUENCE-run project whose PROJECT DIRECTORY (not just the state file) is chmod 000:
      // workflow-state.md is live INSIDE it, but traversing into the directory itself is denied
      // (EACCES-through-parent), so pre-fix `fs.existsSync(stateFile)` reads false — indistinguishable
      // from a genuinely-absent file. Deliberately no .cache/running-set.json — the state file is its
      // SOLE keep signal.
      const liveProj691 = 'issue-691chmoddirlive';
      projDirChmod691 = path.join(mainRoot691, 'kaola-workflow', liveProj691);
      fs.mkdirSync(projDirChmod691, { recursive: true });
      fs.writeFileSync(path.join(projDirChmod691, 'workflow-state.md'), 'status: in_progress\nissue_number: 69143\n');
      fs.chmodSync(projDirChmod691, 0o000);
      g691(mainRoot691, ['update-ref', 'refs/kaola-workflow/barrier/' + liveProj691 + '/n1', headSha691]);

      // A genuinely DEAD project (no folder at all) — must still be reaped, not swept into a blanket
      // keep-everything by this fix.
      const deadProj691 = 'issue-691dead';
      g691(mainRoot691, ['update-ref', 'refs/kaola-workflow/barrier/' + deadProj691 + '/n1', headSha691]);

      // A genuinely-ABSENT state file control: the project folder EXISTS and is fully readable, but
      // carries NO workflow-state.md at all (clean ENOENT). This must stay reapable — the fix must
      // distinguish "cannot probe" (EACCES/EISDIR/...) from "probed clean and it is absent" (ENOENT).
      const enoentProj691 = 'issue-691cleanenoent';
      fs.mkdirSync(path.join(mainRoot691, 'kaola-workflow', enoentProj691), { recursive: true });
      g691(mainRoot691, ['update-ref', 'refs/kaola-workflow/barrier/' + enoentProj691 + '/n1', headSha691]);

      const listRefs691 = (prefix) => execFS691('git', ['-C', mainRoot691, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8', env: GIT_ENV_691 }).trim();
      const beforeSweep691 = listRefs691('refs/kaola-workflow/barrier/' + liveProj691 + '/');
      assert(beforeSweep691 === 'refs/kaola-workflow/barrier/' + liveProj691 + '/n1',
        '#691 fixture: the chmod-000-project-directory live barrier ref exists before the sweep, got ' + JSON.stringify(beforeSweep691));

      const run691 = spawnS691(process.execPath, [CLAIM691, 'barrier-ref-sweep', '--json'], {
        cwd: mainRoot691, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
      });
      let out691 = {};
      try { out691 = JSON.parse(String(run691.stdout || '').trim().split('\n').pop()); } catch (_) {}
      assert(run691.status === 0, '#691: barrier-ref-sweep must exit 0, got status=' + run691.status + ' stdout=' + run691.stdout + ' stderr=' + run691.stderr);

      const afterSweep691 = listRefs691('refs/kaola-workflow/barrier/' + liveProj691 + '/');
      assert(afterSweep691 === 'refs/kaola-workflow/barrier/' + liveProj691 + '/n1',
        '#691: a LIVE project whose project DIRECTORY is chmod 000 (workflow-state.md live but unreachable, '
        + 'EACCES-through-parent) must be KEPT — existsSync-through-a-denied-parent is indistinguishable from '
        + 'genuinely-absent and must not be treated as reapable. tagsKept=' + JSON.stringify(out691.tagsKept)
        + ' tagsDeleted=' + JSON.stringify(out691.tagsDeleted) + ' refsDeleted=' + JSON.stringify(out691.refsDeleted));
      assert(Array.isArray(out691.tagsKept) && out691.tagsKept.includes(liveProj691),
        '#691: tagsKept must include the chmod-000-project-directory live project tag, got ' + JSON.stringify(out691.tagsKept));
      assert(listRefs691('refs/kaola-workflow/barrier/' + deadProj691 + '/') === '',
        '#691: a genuinely dead (no-folder-anywhere) tag must still be reaped — the fix must not degrade into keep-everything');
      assert(listRefs691('refs/kaola-workflow/barrier/' + enoentProj691 + '/') === '',
        '#691: a genuinely-absent state file (clean ENOENT, project folder present and readable) must stay '
        + 'reapable — the statSync/readFileSync fault must be distinguished from a clean ENOENT, not treated as keep-everything');
    } finally {
      if (projDirChmod691) { try { fs.chmodSync(projDirChmod691, 0o755); } catch (_) {} }
      fs.rmSync(mainRoot691, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------------------
// #699: a fresh claim persists one immutable claim/root/epoch identity. The
// helper reads Git objects once and never derives lineage from a plan hash.
// ---------------------------------------------------------------------------
{
  const { execFileSync } = require('child_process');
  const root699 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-699-claim-')));
  const noHistoryRoot699 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-699-no-history-')));
  const noGitRoot699 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-699-no-git-')));
  const classifier699 = path.join(root699, 'classifier-green.js');
  const env699 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
    KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_PATH: 'adaptive',
    KAOLA_CLASSIFIER_BACKOFF_MS: '0'
  });
  const g699 = args => execFileSync('git', ['-C', root699].concat(args), { encoding: 'utf8', env: env699, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const runFreshClaim699 = cwd => {
    try {
      const stdout = execFileSync(process.execPath, [path.join(__dirname, 'kaola-workflow-claim.js'),
        'startup', '--target-issue', '699'], { cwd, encoding: 'utf8', env: Object.assign({}, env699, {
          KAOLA_CLASSIFIER_MOCK_SCRIPT: classifier699
        }), stdio: ['ignore', 'pipe', 'pipe'] });
      return { code: 0, stdout };
    } catch (error) {
      return { code: error.status == null ? 1 : error.status, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') };
    }
  };
  try {
    g699(['init', '-b', 'main']);
    g699(['config', 'user.name', 'Test']);
    g699(['config', 'user.email', 't@example.com']);
    fs.writeFileSync(path.join(root699, 'README.md'), 'fixture\n');
    fs.writeFileSync(classifier699, 'process.stdout.write(JSON.stringify({ verdict: "green", reasoning: "fixture" }) + "\\n");\n');
    g699(['add', 'README.md']);
    g699(['commit', '-m', 'root']);
    g699(['checkout', '-b', 'workflow/issue-699']);
    const anchors = buildClaimAnchors(root699, {
      project: 'issue-699', issue_number: 699, issue_numbers: [699], branch: 'workflow/issue-699',
      worktree_path: root699, closure_policy: 'all_or_nothing', claim_ts: '2026-07-16T00:00:00.000Z',
      session_marker: 'claim-test'
    });
    assert(anchors.epoch_schema_version === 2, '#699: fresh claim anchors use epoch schema 2');
    assert(/^[0-9a-f]{64}$/.test(anchors.claim_identity_digest), '#699: claim_identity_digest is canonical SHA-256');
    assert(/^[0-9a-f]{40}$/.test(anchors.claim_root_base_commit) && /^[0-9a-f]{40}$/.test(anchors.claim_root_base_tree), '#699: claim root captures full immutable commit/tree object ids');
    assert(/^[0-9a-f]{64}$/.test(anchors.claim_root_base_digest) && /^[0-9a-f]{64}$/.test(anchors.epoch_lineage_id), '#699: root and epoch lineage digests are canonical SHA-256');
    const planNoise = Object.assign({}, anchors, { active_plan_hash: 'f'.repeat(64) });
    assert(planNoise.epoch_lineage_id === anchors.epoch_lineage_id, '#699: active plan hash is metadata and cannot change epoch lineage');

    g699(['checkout', 'main']);
    let branchChangedAnchors699 = null;
    try {
      branchChangedAnchors699 = buildClaimAnchors(root699, {
        project: 'issue-699', issue_number: 699, issue_numbers: [699], branch: 'workflow/issue-699',
        worktree_path: root699, closure_policy: 'all_or_nothing', claim_ts: '2026-07-16T00:00:00.000Z',
        session_marker: 'claim-test'
      });
    } catch (_) {}
    assert(branchChangedAnchors699 && branchChangedAnchors699.claim_root_base_commit === anchors.claim_root_base_commit
      && branchChangedAnchors699.claim_root_base_tree === anchors.claim_root_base_tree,
    '#699: immutable claim-root authority survives a current-branch change; target branch identity is bound separately');
    const acquired = runFreshClaim699(root699);
    const persistedPath = path.join(root699, 'kaola-workflow', 'issue-699', 'workflow-state.md');
    const persisted = fs.existsSync(persistedPath) ? fs.readFileSync(persistedPath, 'utf8') : '';
    assert(acquired.code === 0, '#699: a fresh claim with provable Git anchors succeeds, got code=' + acquired.code + ' stderr=' + String(acquired.stderr || '').trim());
    assert(/^## Epoch Lineage$/m.test(persisted) && /^epoch_schema_version: 2$/m.test(persisted), '#699: a successful fresh claim persists the schema-2 Epoch Lineage block');
    assert(/^claim_identity_digest: [0-9a-f]{64}$/m.test(persisted) && /^claim_root_base_digest: [0-9a-f]{64}$/m.test(persisted) && /^epoch_lineage_id: [0-9a-f]{64}$/m.test(persisted), '#699: a successful fresh claim persists claim/root/lineage digests');
    assert(/^active_plan_hash: none$/m.test(persisted) && /^## Planning Evidence$/m.test(persisted)
      && /^plan_hash: none$/m.test(persisted) && /^first_node_id: none$/m.test(persisted)
      && /^first_node_role: none$/m.test(persisted),
    '#699: a fresh epoch-1 claim persists the complete legal planless authority tuple');

    execFileSync('git', ['-C', noHistoryRoot699, 'init', '-b', 'main'], { env: env699, stdio: ['ignore', 'ignore', 'pipe'] });
    fs.writeFileSync(path.join(noHistoryRoot699, 'untracked.txt'), 'candidate\n');
    const noHistory = buildClaimAnchors(noHistoryRoot699, {
      project: 'issue-700', issue_number: 700, issue_numbers: [700], branch: 'workflow/issue-700',
      worktree_path: noHistoryRoot699, closure_policy: 'all_or_nothing', claim_ts: '2026-07-16T00:00:00.000Z',
      session_marker: 'claim-test-no-history'
    });
    const emptyTree = execFileSync('git', ['-C', noHistoryRoot699, 'hash-object', '-t', 'tree', '--stdin'], {
      input: '', encoding: 'utf8', env: env699, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    assert(/^0{40}$/.test(noHistory.claim_root_base_commit)
      && noHistory.claim_root_base_tree === emptyTree
      && /^[0-9a-f]{64}$/.test(noHistory.claim_root_base_digest),
    '#699: an initialized no-history repository gets the exact zero-commit/canonical-empty-tree claim root');

    const refused = runFreshClaim699(noGitRoot699);
    const legacyPath = path.join(noGitRoot699, 'kaola-workflow', 'issue-699', 'workflow-state.md');
    assert(refused.code !== 0, '#699: a fresh claim whose immutable Git anchors cannot be built fails closed');
    assert(!fs.existsSync(legacyPath), '#699: anchor failure must not downgrade a fresh claim into a legacy workflow-state.md');
  } finally {
    fs.rmSync(root699, { recursive: true, force: true });
    fs.rmSync(noHistoryRoot699, { recursive: true, force: true });
    fs.rmSync(noGitRoot699, { recursive: true, force: true });
  }
}

// Adaptive is the only workflow path: a finalize with NO frozen workflow-plan.md present is an
// unconditional typed adaptive_plan_missing refusal (the fast/full paths and their Phase 5 verifier
// were retired). Invoke cmdFinalize directly (the bypass seam) across all four editions with varied
// stale workflow_path fields and prove the refusal never mutates the live folder or its roadmap
// closure source. state_missing / state_invalid_type refuse earlier (before the plan/path branch).
{
  const { spawnSync } = require('child_process');
  const claimScripts = [
    { edition: 'claude', file: path.join(__dirname, 'kaola-workflow-claim.js') },
    { edition: 'codex', file: path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js') },
    { edition: 'gitlab', file: path.join(__dirname, '..', 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js') },
    { edition: 'gitea', file: path.join(__dirname, '..', 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js') },
  ];
  const binding = 'evidence-binding: phase5-code-review-1 nonce-code-review-1';
  const progress = [
    '# Phase 4 - Progress: issue-1',
    '',
    '## Tasks',
    '| # | Task | Status | Files | Notes |',
    '|---|------|--------|-------|-------|',
    '| 1 | implement the change | complete | a.js | done |',
    '',
  ].join('\n');

  function runPlanAbsentFinalize(edition, claimScript, caseName, reviewContent, evidenceContent, options) {
    const opts = options || {};
    const workflowPath = opts.workflowPath || 'adaptive';
    const stateMode = opts.stateMode || 'file';
    // Every plan-absent path case collapses to adaptive_plan_missing; the state-mode cases refuse
    // earlier (state_missing / state_invalid_type) and pass their own expectedInnerReason.
    const expectedInnerReason = opts.expectedInnerReason || 'adaptive_plan_missing';
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-plan-absent-finalize-')));
    const project = 'issue-720-' + caseName;
    const projectPath = path.join(root, 'kaola-workflow', project);
    const roadmapSource = path.join(root, 'kaola-workflow', '.roadmap', 'issue-720.md');
    const evidencePath = path.join(projectPath, '.cache', 'code-reviewer.md');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.mkdirSync(path.dirname(roadmapSource), { recursive: true });
    const statePath = path.join(projectPath, 'workflow-state.md');
    const stateContent = [
      '# Kaola-Workflow State',
      '## Project',
      'name: ' + project,
      'status: active',
      '## Current Position',
      'phase: 5',
      'phase_name: Review',
      'step: complete',
      ...(opts.omitWorkflowPath ? [] : ['workflow_path: ' + workflowPath]),
      'next_command: /kaola-workflow-finalize ' + project,
      '## Sink',
      'branch: workflow/' + project,
      'issue_number: 720',
      'sink: merge',
      'run_posture: in-place',
      '',
    ].join('\n');
    if (stateMode === 'file') fs.writeFileSync(statePath, stateContent);
    else if (stateMode === 'directory') fs.mkdirSync(statePath);
    // The review/progress fixtures are written but never consulted — under retirement a plan-absent
    // finalize refuses BEFORE any Phase 5 evidence is read (the fast/full verifier was retired).
    fs.writeFileSync(path.join(projectPath, 'phase4-progress.md'), progress.replace(/issue-1/g, project));
    fs.writeFileSync(path.join(projectPath, 'phase5-review.md'), reviewContent);
    fs.writeFileSync(evidencePath, evidenceContent);
    fs.writeFileSync(roadmapSource, '# Issue 720\n');

    const result = spawnSync(process.execPath,
      [claimScript, 'finalize', '--project', project], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKTREE_NATIVE: '0',
        }),
      });
    let json = null;
    try { json = JSON.parse(String(result.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
    const activeSurvived = fs.existsSync(projectPath);
    const archiveExists = fs.existsSync(path.join(root, 'kaola-workflow', 'archive'));
    assert(result.status !== 0 && json && json.reason === 'finalize_gate_unverified'
        && json.inner_reason === expectedInnerReason,
      edition + ' plan-absent finalize (' + caseName + ') must refuse finalize_gate_unverified/'
        + expectedInnerReason + '; got status=' + result.status + ' output=' + JSON.stringify(json));
    assert(activeSurvived,
      edition + ' plan-absent finalize (' + caseName + ') must leave the active project folder in place');
    assert(!archiveExists,
      edition + ' plan-absent finalize (' + caseName + ') must create no archive');
    assert(fs.existsSync(roadmapSource),
      edition + ' plan-absent finalize (' + caseName + ') must retain the roadmap closure source');
    if (stateMode === 'file') {
      const stateAfter = activeSurvived ? fs.readFileSync(statePath, 'utf8') : '';
      assert(activeSurvived && /^status: active$/m.test(stateAfter) && !/^status: closed$/m.test(stateAfter),
        edition + ' plan-absent finalize (' + caseName + ') must leave closure state active');
    } else if (stateMode === 'missing') {
      assert(activeSurvived && !fs.existsSync(statePath),
        edition + ' plan-absent finalize (' + caseName + ') must not fabricate missing workflow state');
    } else {
      let stateIsDirectory = false;
      try { stateIsDirectory = fs.lstatSync(statePath).isDirectory(); } catch (_) {}
      assert(activeSurvived && stateIsDirectory,
        edition + ' plan-absent finalize (' + caseName + ') must preserve wrong-type workflow state');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }

  // Plain reviewer fixture — under retirement it is never consulted (the plan-absent finalize
  // refuses before any Phase 5 evidence is read), so it carries no reviewComplianceTable dependency.
  const canonicalReview = [
    '# Phase 5 - Review: issue-720-stale',
    '',
    '## Review Status',
    'PASSED',
    '',
  ].join('\n');
  const staleEvidence = [
    binding,
    'domain_outcome: approved',
    'verdict: pass',
    'findings_blocking: 0',
    'review_summary: no_blocking_findings',
    'review_attestation: full_review_completed',
    'No admitted findings.',
    'review_conclusion: Reviewed all changed files and found no unresolved blocking issues.',
    '',
  ].join('\n');

  const malformedReview = [
    '# Phase 5 - Review: issue-720-malformed',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    '| code-reviewer | subagent-invoked | .cache/code-reviewer.md | |',
    '## Review Status',
    'PASSED',
    '',
  ].join('\n');
  for (const editionClaim of claimScripts) {
    // A stale non-adaptive workflow_path field (full / fast / a typo) and an absent field all
    // collapse to adaptive_plan_missing — proving the TRAP-4 collapse across all four editions.
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'stale', canonicalReview, staleEvidence);
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'malformed', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n');
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'absent-field', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n', { omitWorkflowPath: true });
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'stale-adaptive', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n',
      { workflowPath: 'adaptive' });
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'stale-full', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n',
      { workflowPath: 'full' });
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'stale-fast', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n',
      { workflowPath: 'fast' });
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'stale-typo', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n',
      { workflowPath: 'typo' });
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'state-missing', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n',
      { stateMode: 'missing', expectedInnerReason: 'state_missing' });
    runPlanAbsentFinalize(editionClaim.edition, editionClaim.file, 'state-wrong-type', malformedReview,
      binding + '\ndomain_outcome: approved\nverdict: pass\n',
      { stateMode: 'directory', expectedInnerReason: 'state_invalid_type' });
  }

  // A manual move is not a crash receipt. Source-missing Finalization may trust an
  // archive only after archiveProjectDir has already terminal-stamped it closed;
  // an active/nonterminal archive must refuse before closure or roadmap mutation.
  for (const editionClaim of claimScripts) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-full-finalize-manual-archive-')));
    const project = 'issue-720-manual-' + editionClaim.edition;
    const archivePath = path.join(root, 'kaola-workflow', 'archive', project);
    const roadmapSource = path.join(root, 'kaola-workflow', '.roadmap', 'issue-720.md');
    fs.mkdirSync(archivePath, { recursive: true });
    fs.mkdirSync(path.dirname(roadmapSource), { recursive: true });
    const activeState = [
      '# Kaola-Workflow State',
      '## Project',
      'name: ' + project,
      'status: active',
      '## Current Position',
      'phase: 5',
      'workflow_path: full',
      'next_command: /kaola-workflow-finalize ' + project,
      '## Sink',
      'issue_number: 720',
      'sink: merge',
      '',
    ].join('\n');
    const archivedStatePath = path.join(archivePath, 'workflow-state.md');
    fs.writeFileSync(archivedStatePath, activeState);
    fs.writeFileSync(roadmapSource, '# Issue 720\n');
    const result = spawnSync(process.execPath,
      [editionClaim.file, 'finalize', '--project', project], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKTREE_NATIVE: '0',
        }),
      });
    let json = null;
    try { json = JSON.parse(String(result.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
    assert(result.status !== 0 && json && json.reason === 'finalize_gate_unverified'
        && json.inner_reason === 'archive_state_not_closed',
      editionClaim.edition + ' manually moved active archive must refuse before Finalization side effects; got status='
        + result.status + ' output=' + JSON.stringify(json));
    assert(fs.readFileSync(archivedStatePath, 'utf8') === activeState,
      editionClaim.edition + ' manual-archive refusal must not terminal-stamp or append closure evidence');
    assert(fs.existsSync(roadmapSource),
      editionClaim.edition + ' manual-archive refusal must retain the roadmap closure source');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // A dangling live symlink is still a live filesystem entry. It must never be
  // reclassified as source-missing merely because existsSync follows the link
  // and returns false, even when one terminal archive would otherwise satisfy
  // the narrow crash-resume exemption.
  for (const editionClaim of claimScripts) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-dangling-live-')));
    const project = 'issue-720-dangling-' + editionClaim.edition;
    const workflowRoot = path.join(root, 'kaola-workflow');
    const livePath = path.join(workflowRoot, project);
    const archivePath = path.join(workflowRoot, 'archive', project);
    const roadmapSource = path.join(workflowRoot, '.roadmap', 'issue-720.md');
    fs.mkdirSync(archivePath, { recursive: true });
    fs.mkdirSync(path.dirname(roadmapSource), { recursive: true });
    const terminalState = [
      '# Kaola-Workflow State',
      '## Project',
      'name: ' + project,
      'status: closed',
      '## Current Position',
      'phase: 6',
      'workflow_path: fast',
      'step: complete',
      'next_command: none (archived)',
      '## Sink',
      'issue_number: 720',
      'sink: merge',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(archivePath, 'workflow-state.md'), terminalState);
    fs.writeFileSync(roadmapSource, '# Issue 720\n');
    fs.symlinkSync(path.join(root, 'missing-live-target'), livePath);
    const result = spawnSync(process.execPath,
      [editionClaim.file, 'finalize', '--project', project], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKTREE_NATIVE: '0',
        }),
      });
    let json = null;
    try { json = JSON.parse(String(result.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
    assert(result.status !== 0 && json && json.reason === 'finalize_gate_unverified'
        && json.inner_reason === 'archive_authority_invalid_type',
    editionClaim.edition + ' dangling live source must refuse as invalid live authority; got status='
        + result.status + ' output=' + JSON.stringify(json));
    assert(fs.lstatSync(livePath).isSymbolicLink(),
      editionClaim.edition + ' dangling live-source refusal must preserve the malformed entry');
    assert(fs.readFileSync(path.join(archivePath, 'workflow-state.md'), 'utf8') === terminalState,
      editionClaim.edition + ' dangling live-source refusal must not mutate archive authority');
    assert(fs.existsSync(roadmapSource),
      editionClaim.edition + ' dangling live-source refusal must retain roadmap closure source');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // Reusing a project name can leave a committed exact archive while the current finalize
  // transaction renames to <project>.archived-<timestamp>. After that rename, source is absent;
  // selecting the stale exact archive would bind closure to the wrong run. Refuse ambiguity.
  for (const editionClaim of claimScripts) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-finalize-archive-ambiguity-')));
    const project = 'issue-720-reused-' + editionClaim.edition;
    const archiveBase = path.join(root, 'kaola-workflow', 'archive');
    const oldExact = path.join(archiveBase, project);
    const currentSuffixed = path.join(archiveBase, project + '.archived-2026-07-17T00-00-00-000Z');
    fs.mkdirSync(oldExact, { recursive: true });
    fs.mkdirSync(currentSuffixed, { recursive: true });
    const terminalState = (name, workflowPath) => [
      '# Kaola-Workflow State',
      '## Project',
      'name: ' + name,
      'status: closed',
      '## Current Position',
      'phase: 6',
      'workflow_path: ' + workflowPath,
      'step: complete',
      'next_command: none (archived)',
      '## Sink',
      'issue_number: 720',
      'sink: merge',
      '',
    ].join('\n');
    const oldState = terminalState(project, 'fast');
    const currentState = terminalState(project, 'full');
    fs.writeFileSync(path.join(oldExact, 'workflow-state.md'), oldState);
    fs.writeFileSync(path.join(currentSuffixed, 'workflow-state.md'), currentState);
    const result = spawnSync(process.execPath,
      [editionClaim.file, 'finalize', '--project', project], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKTREE_NATIVE: '0',
        }),
      });
    let json = null;
    try { json = JSON.parse(String(result.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
    assert(result.status !== 0 && json && json.reason === 'finalize_gate_unverified'
        && json.inner_reason === 'archive_authority_ambiguous',
      editionClaim.edition + ' source-missing finalize with exact+suffixed archives must refuse ambiguity; got status='
        + result.status + ' output=' + JSON.stringify(json));
    assert(fs.readFileSync(path.join(oldExact, 'workflow-state.md'), 'utf8') === oldState
        && fs.readFileSync(path.join(currentSuffixed, 'workflow-state.md'), 'utf8') === currentState,
      editionClaim.edition + ' ambiguous archive refusal must mutate neither stale nor current authority');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // A legacy (fast/full) archive crash-resume has no frozen workflow-plan.md, so under retirement it
  // can no longer resume-finalize through the removed Phase 5 verifier — a plan-absent archive is an
  // adaptive_plan_missing refusal that leaves the terminal archive untouched. (A genuine ADAPTIVE
  // crash-resume archive carries a workflow-plan.md and takes the --finalize-check path instead.)
  {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-plan-absent-finalize-resume-')));
    const project = 'issue-720-resume';
    const archivePath = path.join(root, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archivePath, { recursive: true });
    const archivedState = [
      '# Kaola-Workflow State',
      '## Project',
      'name: ' + project,
      'status: closed',
      '## Current Position',
      'phase: 6',
      'workflow_path: full',
      'step: complete',
      'next_command: none (archived)',
      '## Sink',
      'issue_number: 720',
      'sink: merge',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(archivePath, 'workflow-state.md'), archivedState);
    const result = spawnSync(process.execPath,
      [claimScripts[0].file, 'finalize', '--project', project], {
        cwd: root,
        encoding: 'utf8',
        timeout: 30000,
        env: Object.assign({}, process.env, {
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKTREE_NATIVE: '0',
        }),
      });
    let json = null;
    try { json = JSON.parse(String(result.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
    assert(result.status !== 0 && json && json.reason === 'finalize_gate_unverified'
        && json.inner_reason === 'adaptive_plan_missing',
      'a plan-absent legacy archive crash-resume must refuse adaptive_plan_missing; got status=' + result.status
        + ' output=' + JSON.stringify(json));
    assert(fs.readFileSync(path.join(archivePath, 'workflow-state.md'), 'utf8') === archivedState,
      'a plan-absent legacy archive crash-resume refusal must preserve the terminal archive state');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// --- #715 F1: restore-gate dest exemption is scoped to the EXACT dest ---------
// The release's own fresh archive dest is exempt from the treeDirty restore gate (so the
// in-place base restore can proceed), but every OTHER dirty path must keep blocking — including
// a prefix look-alike. isParkedLanePath semantics are unchanged (archive/* stays never-parked,
// pinned at the #579 block above): the exemption lives in treeDirty's optional exempt-list only.
{
  const { treeDirty } = require('./kaola-workflow-claim.js');
  const { execFileSync } = require('child_process');
  assert(typeof treeDirty === 'function',
    '#715 F1: treeDirty must be exported from claim.js for the restore-gate pin');
  if (typeof treeDirty !== 'function') { failed++; console.error('FAIL: #715 F1 restore-gate pin body skipped (treeDirty not exported)'); }
  else {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-715-treedirty-')));
  try {
    const gitEnv = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t'
    });
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });

    const destRel = 'kaola-workflow/archive/issue-801.discarded-2026-01-01';
    fs.mkdirSync(path.join(tmpDir, destRel), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, destRel, 'workflow-state.md'), 'state\n');

    // Baseline (pre-existing semantic): with no exemption the fresh archive dest still counts as
    // dirty — archive/* remains never-parked.
    assert(treeDirty(tmpDir, ['issue-801']) === true,
      '#715 F1: without an exemption the fresh archive dest still dirties the tree (archive/* stays never-parked)');
    // The exact dest (real untracked dir — porcelain reports it with a trailing slash) is exempt.
    assert(treeDirty(tmpDir, ['issue-801'], [destRel]) === false,
      '#715 F1: the restore gate exempts the exact dest the release just created');
    // A sibling dirty path OUTSIDE the dest keeps blocking the restore.
    fs.writeFileSync(path.join(tmpDir, 'sibling.txt'), 'dirty\n');
    assert(treeDirty(tmpDir, ['issue-801'], [destRel]) === true,
      '#715 F1: a sibling dirty path outside the dest still blocks the restore (exemption scoped to the exact dest)');
    fs.rmSync(path.join(tmpDir, 'sibling.txt'));
    // A prefix look-alike is NOT exempt (segment-boundary match, never startsWith on the raw string).
    const lookAlike = 'kaola-workflow/archive/issue-801.discarded-2026-01-01-evil';
    fs.mkdirSync(path.join(tmpDir, lookAlike), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, lookAlike, 'x.txt'), 'x\n');
    assert(treeDirty(tmpDir, ['issue-801'], [destRel]) === true,
      '#715 F1: a dest-prefix look-alike path is NOT exempt (segment-boundary match)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  }
}

// --- #715 F1: commitDiscardArchive refuses to bind to a non-base branch -------
// The base-branch guard lives INSIDE the helper so both call sites (release, watch-pr sweep)
// inherit it: off-base → skip + disclose the current branch + leave recoverable residue; on-base
// → commit + disclose the receiving branch.
{
  const { commitDiscardArchive } = require('./kaola-workflow-claim.js');
  const { execFileSync } = require('child_process');
  assert(typeof commitDiscardArchive === 'function',
    '#715 F1: commitDiscardArchive must be exported from claim.js for the base-guard pin');
  if (typeof commitDiscardArchive !== 'function') { failed++; console.error('FAIL: #715 F1 helper pin body skipped (commitDiscardArchive not exported)'); }
  else {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-715-helper-')));
  try {
    const gitEnv = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t'
    });
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });

    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'issue-909.discarded-x');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'state\n');

    // Off-base checkout → the helper refuses BEFORE staging: tip unchanged, residue on disk.
    execFileSync('git', ['checkout', '-b', 'workflow/other-lane'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    const tipBefore = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();
    const off = commitDiscardArchive({ archived: true, dest: dest }, 'issue-909', 'main');
    assert(off && off.committed === false,
      '#715 F1: the helper refuses to commit the discard archive on a non-base branch, got ' + JSON.stringify(off));
    assert(off && off.branch === 'workflow/other-lane',
      '#715 F1: the refusal discloses the current (non-receiving) branch, got ' + JSON.stringify(off));
    assert(off && typeof off.detail === 'string' && off.detail.includes('main') && off.detail.includes('workflow/other-lane'),
      '#715 F1: the refusal detail names both the current and the surviving base branch, got ' + JSON.stringify(off));
    assert(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim() === tipBefore,
      '#715 F1: a refused commit leaves the non-base branch tip unchanged');
    assert(fs.existsSync(dest),
      '#715 F1: a refused commit leaves the archive on disk as recoverable residue');

    // On-base checkout → the helper commits and discloses the receiving branch.
    execFileSync('git', ['checkout', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    const on = commitDiscardArchive({ archived: true, dest: dest }, 'issue-909', 'main');
    assert(on && on.committed === true,
      '#715 F1: the helper commits the discard archive on the base branch, got ' + JSON.stringify(on));
    assert(on && on.branch === 'main',
      '#715 F1: the success path discloses the receiving branch, got ' + JSON.stringify(on));
    const atHead = execFileSync('git', ['cat-file', '-t', 'HEAD:kaola-workflow/archive/issue-909.discarded-x'],
      { cwd: tmpDir, encoding: 'utf8' }).trim();
    assert(atHead === 'tree',
      '#715 F1: the committed archive is a tree at the base HEAD, got ' + JSON.stringify(atHead));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  }
}

// --- #715 N5-A: the guard rejects falsified non-surviving bases BEFORE staging ---
// The string-equality guard is not enough: base comes from operator-controlled durable state.
// The helper must additionally (a) reject the detached-HEAD sentinel 'HEAD' as a base outright,
// (b) verify base names a REAL local branch ref (argument-array rev-parse --verify), (c) refuse
// a base naming the branch the call site is discarding (release: featureBranch; sweep: the
// folder's lane), and (d) at the sweep posture refuse a base naming the current arbitrary lane
// (the sweep has no restore step, so the only base it can establish as surviving is the repo's
// default branch). Every refusal happens BEFORE staging: tip unchanged, residue on disk.
{
  const { commitDiscardArchive } = require('./kaola-workflow-claim.js');
  const { execFileSync } = require('child_process');
  assert(typeof commitDiscardArchive === 'function',
    '#715 N5-A: commitDiscardArchive must be exported from claim.js for the guard-hardening pins');
  if (typeof commitDiscardArchive !== 'function') { failed++; console.error('FAIL: #715 N5-A guard pin body skipped (commitDiscardArchive not exported)'); }
  else {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-715-guard-')));
  try {
    const gitEnv = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t'
    });
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });

    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'issue-910.discarded-x');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'state\n');

    // Honest path FIRST (lock pin — green before AND after the fix): on the base, the commit
    // lands and the post-commit re-resolution + reachability check passes (N5-B green side).
    const on = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'main',
      { discardedBranch: 'workflow/issue-910', defaultBase: 'main' });
    assert(on && on.committed === true && on.branch === 'main',
      '#715 N5-A/N5-B: the honest on-base path still commits and discloses the receiving branch, got ' + JSON.stringify(on));
    assert(execFileSync('git', ['cat-file', '-t', 'main:kaola-workflow/archive/issue-910.discarded-x'],
      { cwd: tmpDir, encoding: 'utf8' }).trim() === 'tree',
      '#715 N5-B: the honest commit is a tree at the base ref');
    const anc = require('child_process').spawnSync('git', ['-C', tmpDir, 'merge-base', '--is-ancestor', 'HEAD', 'main']);
    assert(anc.status === 0,
      '#715 N5-B: the honest archive commit is reachable from the base ref (merge-base --is-ancestor HEAD main)');

    // (a) Detached checkout + base='HEAD' (the sentinel): refused outright, nothing committed.
    execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    const detachedTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();
    const sentinel = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'HEAD');
    assert(sentinel && sentinel.committed === false,
      '#715 N5-A: the guard must reject the detached-HEAD sentinel as a base outright, got ' + JSON.stringify(sentinel));
    assert(sentinel && sentinel.branch === 'HEAD',
      '#715 N5-A: the sentinel refusal discloses the (non-receiving) detached HEAD, got ' + JSON.stringify(sentinel));
    assert(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim() === detachedTip,
      '#715 N5-A: a sentinel-refused commit leaves the detached HEAD tip unchanged');
    assert(fs.existsSync(dest),
      '#715 N5-A: a sentinel-refused commit leaves the archive on disk as recoverable residue');

    // (c-release) Base naming the branch the release discards (call-site-supplied discardedBranch).
    execFileSync('git', ['checkout', '-b', 'workflow/issue-910'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    const featTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim();
    const discarded = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'workflow/issue-910',
      { discardedBranch: 'workflow/issue-910' });
    assert(discarded && discarded.committed === false,
      '#715 N5-A: the guard must refuse a base naming the branch being discarded (release posture), got ' + JSON.stringify(discarded));
    assert(discarded && discarded.branch === 'workflow/issue-910' &&
      typeof discarded.detail === 'string' && discarded.detail.includes('workflow/issue-910'),
      '#715 N5-A: the discarded-branch refusal discloses the current branch and names the base, got ' + JSON.stringify(discarded));
    assert(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim() === featTip,
      '#715 N5-A: a discarded-branch refusal happens BEFORE staging (tip unchanged)');

    // (b) Base naming no real local branch (falsified durable state): refused via rev-parse --verify.
    const ghost = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'workflow/no-such-base');
    assert(ghost && ghost.committed === false,
      '#715 N5-A: the guard must refuse a base that names no real local branch, got ' + JSON.stringify(ghost));
    assert(ghost && ghost.branch === 'workflow/issue-910',
      '#715 N5-A: the non-existent-base refusal discloses the current branch, got ' + JSON.stringify(ghost));

    // (d-sweep) Base naming the current arbitrary lane with only the default branch provably
    // surviving (sweep posture): refused even though it is a real branch and equals the checkout.
    const lane = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'workflow/issue-910',
      { discardedBranch: 'workflow/issue-909', defaultBase: 'main' });
    assert(lane && lane.committed === false,
      '#715 N5-A: the guard must refuse a base naming the current non-default lane at the sweep posture, got ' + JSON.stringify(lane));
    assert(lane && lane.branch === 'workflow/issue-910',
      '#715 N5-A: the arbitrary-lane refusal discloses the current (non-receiving) lane, got ' + JSON.stringify(lane));
    assert(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' }).trim() === featTip,
      '#715 N5-A: an arbitrary-lane refusal happens BEFORE staging (tip unchanged)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  }
}

// --- #715 N5-B: post-commit re-resolution downgrades a HEAD re-point race ---------
// TOCTOU between the guard and the commit: a concurrent process re-points HEAD after staging.
// The helper must RE-RESOLVE the checkout after the commit and downgrade to committed:false with
// the ACTUAL receiving branch disclosed — never the stale pre-race base. Deterministic git shim
// on PATH interposing at the helper's `add -A -- <rel>` call (no probabilistic racing).
{
  const { commitDiscardArchive } = require('./kaola-workflow-claim.js');
  const { execFileSync } = require('child_process');
  assert(typeof commitDiscardArchive === 'function',
    '#715 N5-B: commitDiscardArchive must be exported from claim.js for the race-downgrade pin');
  if (typeof commitDiscardArchive !== 'function') { failed++; console.error('FAIL: #715 N5-B race pin body skipped (commitDiscardArchive not exported)'); }
  else {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-715-race-')));
  try {
    const gitEnv = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t'
    });
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    execFileSync('git', ['add', 'README.md'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    // Pre-create the race branch at main's tip so the interleave has somewhere to land.
    execFileSync('git', ['branch', 'race', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    const mainTip = execFileSync('git', ['rev-parse', 'main'], { cwd: tmpDir, encoding: 'utf8' }).trim();

    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'issue-910.discarded-x');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'state\n');

    const shimDir = path.join(tmpDir, 'shim-bin');
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(path.join(shimDir, 'git'), [
      '#!/bin/bash',
      'if [ "$3" = "add" ] && [ "$4" = "-A" ]; then',
      '  /usr/bin/git "$@"',
      '  rc=$?',
      '  /usr/bin/git -C "$2" symbolic-ref HEAD refs/heads/race',
      '  /usr/bin/git -C "$2" checkout race 2>/dev/null || true',
      '  exit $rc',
      'fi',
      'exec /usr/bin/git "$@"',
      ''
    ].join('\n'));
    fs.chmodSync(path.join(shimDir, 'git'), 0o755);

    const oldPath = process.env.PATH;
    let raced;
    try {
      process.env.PATH = shimDir + ':' + oldPath;
      raced = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'main');
    } finally {
      process.env.PATH = oldPath;
    }
    assert(raced && raced.committed === false,
      '#715 N5-B: a HEAD re-point during the commit must downgrade to committed:false, got ' + JSON.stringify(raced));
    assert(raced && raced.branch === 'race',
      '#715 N5-B: the downgrade discloses the ACTUAL receiving branch (race), never the stale pre-race base, got ' + JSON.stringify(raced));
    assert(execFileSync('git', ['rev-parse', 'main'], { cwd: tmpDir, encoding: 'utf8' }).trim() === mainTip,
      '#715 N5-B: the base ref tip is unchanged by the raced commit');
    const onRace = execFileSync('git', ['cat-file', '-t', 'race:kaola-workflow/archive/issue-910.discarded-x'],
      { cwd: tmpDir, encoding: 'utf8' }).trim();
    assert(onRace === 'tree',
      '#715 N5-B: the off-base commit stays recoverable on the actual receiving branch, got ' + JSON.stringify(onRace));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  }
}

// --- #749 R2: the discard-archive commit must record the SOURCE removal too ------
// The archive move is rename (or copy+delete) on the filesystem — git sees an ADD at the archive
// destination and a DELETE at the live `kaola-workflow/<project>` source. Both of the helper's
// pathspecs named only the destination, so when the consumer repo TRACKS the active folder the
// deletions stayed unstaged while the helper still reported committed:true, and the source was
// still readable at HEAD. `committed:true` must imply the COMPLETE move landed at HEAD: additions
// present, source gone. Unrelated staged/unstaged dirt must stay untouched (pathspec-scoped), and
// the far more common untracked-source case must still report committed:true (an unconditional
// source pathspec would be a fatal `git add -A -- <no-match>`).
{
  const { commitDiscardArchive } = require('./kaola-workflow-claim.js');
  const { execFileSync } = require('child_process');
  assert(typeof commitDiscardArchive === 'function',
    '#749 R2: commitDiscardArchive must be exported from claim.js for the source-removal pin');
  if (typeof commitDiscardArchive !== 'function') { failed++; console.error('FAIL: #749 R2 source-removal pin body skipped (commitDiscardArchive not exported)'); }
  else {
  const tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-749-src-')));
  try {
    const gitEnv = Object.assign({}, process.env, {
      GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@t'
    });
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: tmpDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');

    // The consumer repo TRACKS the active folder (the live-run precondition).
    const src = path.join(tmpDir, 'kaola-workflow', 'proj-x');
    fs.mkdirSync(path.join(src, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(src, 'workflow-state.md'), 'state\n');
    fs.writeFileSync(path.join(src, 'workflow-plan.md'), 'plan\n');
    fs.writeFileSync(path.join(src, '.cache', 'n1.md'), 'evidence\n');
    execFileSync('git', ['add', '-A'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });

    // Unrelated dirt that must survive the pathspec-scoped commit byte-untouched.
    fs.writeFileSync(path.join(tmpDir, 'staged-dirt.txt'), 'staged\n');
    execFileSync('git', ['add', 'staged-dirt.txt'], { cwd: tmpDir, env: gitEnv, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture modified\n');

    // The archive move itself (archiveProjectDir's in-place branch): pure filesystem rename.
    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'proj-x.discarded-x');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);

    const moved = commitDiscardArchive({ archived: true, dest: dest }, 'proj-x', 'main');
    assert(moved && moved.committed === true,
      '#749 R2: the helper commits the complete archive move when the source folder is tracked, got ' + JSON.stringify(moved));
    assert(execFileSync('git', ['cat-file', '-t', 'HEAD:kaola-workflow/archive/proj-x.discarded-x'],
      { cwd: tmpDir, encoding: 'utf8' }).trim() === 'tree',
      '#749 R2: the archive destination is a tree at HEAD after the commit');
    const srcAtHead = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'kaola-workflow/proj-x'],
      { cwd: tmpDir, encoding: 'utf8' }).trim();
    assert(srcAtHead === '',
      '#749 R2: committed:true must imply the tracked SOURCE folder is gone at HEAD, still present: ' + JSON.stringify(srcAtHead));
    const scoped = execFileSync('git', ['status', '--porcelain', '--', 'kaola-workflow'],
      { cwd: tmpDir, encoding: 'utf8' }).trim();
    assert(scoped === '',
      '#749 R2: no kaola-workflow-scoped residue survives the discard-archive commit, got ' + JSON.stringify(scoped));
    // Unrelated dirt untouched: staged-dirt.txt still STAGED (never committed), README still unstaged.
    assert(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: tmpDir, encoding: 'utf8' }).trim() === 'staged-dirt.txt',
      '#749 R2: the pathspec-scoped commit leaves unrelated STAGED dirt staged and uncommitted');
    assert(execFileSync('git', ['diff', '--name-only'], { cwd: tmpDir, encoding: 'utf8' }).trim() === 'README.md',
      '#749 R2: the pathspec-scoped commit leaves unrelated UNSTAGED dirt unstaged');
    const headFiles = execFileSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: tmpDir, encoding: 'utf8' });
    assert(!headFiles.includes('staged-dirt.txt'),
      '#749 R2: unrelated staged dirt is NOT swept into the discard-archive commit, got ' + JSON.stringify(headFiles));

    // The common case: the source folder was never tracked → still committed:true (an
    // unconditional source pathspec would be a fatal `git add -A -- <no-match>`).
    const destU = path.join(tmpDir, 'kaola-workflow', 'archive', 'proj-untracked.discarded-x');
    fs.mkdirSync(destU, { recursive: true });
    fs.writeFileSync(path.join(destU, 'workflow-state.md'), 'state\n');
    const untracked = commitDiscardArchive({ archived: true, dest: destU }, 'proj-untracked', 'main');
    assert(untracked && untracked.committed === true,
      '#749 R2: an untracked source folder still commits the archive (no fatal empty-pathspec), got ' + JSON.stringify(untracked));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  }
}

// ---------------------------------------------------------------------------
// #735: a user-consented ABANDON must not demand run-state artifacts the project
// never produced. archiveProjectDir gates EVERY archive on the composed epoch
// authority (verifyCurrentEpochAuthority + verifyAllEpochSnapshots). For a
// `closed` archive that gate is load-bearing (the closure receipt's
// epoch_lineage_preserved token is derived from re-verifying the archived dest).
// For an `abandoned` archive nothing downstream consumes the run-state progress
// artifacts, yet a project frozen by a pre-seed runtime (no `## Required Agent
// Compliance` section at all, or a legacy row-per-closed-node partial set) or one
// whose best-effort freeze-time `workflow-tasks.json` never landed refused with
// `state_compliance_authority_invalid` / `state_task_mirror_mismatch` — and the
// refusal is total: "worktree, branch, and claim-label cleanup was not attempted".
// ---------------------------------------------------------------------------
{
  const { execFileSync, spawnSync } = require('child_process');
  const schema735 = require('./kaola-workflow-adaptive-schema.js');
  const validator735 = require('./kaola-workflow-plan-validator.js');
  const { generateMirror: generateMirror735 } = require('./kaola-workflow-task-mirror.js');

  const gitEnv735 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  });
  const git735 = (root, args) => execFileSync('git', ['-C', root, ...args],
    { encoding: 'utf8', env: gitEnv735, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  // Build a frozen schema-2 adaptive plan. `complianceFor` selects which nodes get a
  // compliance row: undefined = every node (the current pre-seeding freeze), an array =
  // a legacy row-per-closed-node partial set, null = no section at all (a pre-seed freeze).
  function plan735(project, nodes, ledger, opts) {
    const options = opts || {};
    const rows = nodes.map(n => `| ${n.id} | ${n.role} | ${n.depends_on || '—'} | ${n.write_set || '—'} | 1 | ${n.shape || 'sequence'} | ${n.model || 'standard'} | — | — | — | — |`).join('\n');
    const ledgerRows = nodes.map(n => `| ${n.id} | ${ledger[n.id] || 'pending'} |`).join('\n');
    const which = options.complianceFor === undefined ? nodes.map(n => n.id) : options.complianceFor;
    let text = [
      `# Workflow Plan — ${project}`, '', '## Meta', `project: ${project}`,
      'labels: enhancement', 'speculative_open_policy: auto',
      'validation_command: node scripts/simulate-workflow-walkthrough.js',
      'validation_timeout_minutes: 30', 'plan_schema_version: 2', 'contract_version: 2',
      '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', rows,
      '', '## Node Ledger', '', '| id | status |', '| --- | --- |', ledgerRows, '',
    ].join('\n');
    if (which !== null) {
      const complianceRows = nodes.filter(n => which.includes(n.id)).map(n =>
        (ledger[n.id] || 'pending') === 'complete'
          ? `| ${n.role} (${n.id}) | subagent-invoked | .cache/${n.id}.md | |`
          : `| ${n.role} (${n.id}) | pending | | |`).join('\n');
      text += ['## Required Agent Compliance', '',
        '| Requirement | Status | Evidence | Skip Reason |',
        '| --- | --- | --- | --- |', complianceRows, ''].join('\n');
    }
    const hash = validator735.computePlanHash(text);
    return { text: text.replace(/^# Workflow Plan[^\n]*\n/, m => m + `\n<!-- plan_hash: ${hash} -->\n`), hash };
  }

  // A frozen, claimed, schema-2 adaptive project with a real linked worktree and a real
  // feature branch, so the post-archive cleanup (worktree removal, branch delete, claim
  // label clear) is observable rather than asserted in the abstract.
  function fixture735(ledger, opts) {
    const options = opts || {};
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw735-')));
    git735(root, ['init', '-b', 'main']);
    git735(root, ['config', 'user.name', 'Test']);
    git735(root, ['config', 'user.email', 't@example.com']);
    git735(root, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
    git735(root, ['add', 'product.js']);
    git735(root, ['commit', '-m', 'root']);
    const commit = git735(root, ['rev-parse', 'HEAD']);
    const tree = git735(root, ['rev-parse', 'HEAD^{tree}']);
    const project = 'issue-735';
    const branch = 'workflow/issue-735';
    const worktreePath = path.join(root, '.kw', 'worktrees', project);
    git735(root, ['worktree', 'add', '-b', branch, worktreePath]);
    const projectDir = path.join(root, 'kaola-workflow', project);
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const nodes = [
      { id: 'impl', role: 'tdd-guide', write_set: 'product.js' },
      { id: 'review', role: 'code-reviewer', depends_on: 'impl', model: 'reasoning' },
      { id: 'finalize', role: 'finalize', depends_on: 'review', model: '—' },
    ];
    const plan = plan735(project, nodes, ledger, options);
    const identity = schema735.buildClaimIdentity({
      schema_version: 2, repository_id: 'local:' + root, issue_numbers: [735], primary_issue: 735,
      bundle_id: null, closure_policy: 'all_or_nothing', branch, worktree_path: worktreePath,
      claim_ts: '2026-07-16T00:00:00.000Z', session_marker: 'test-session',
    });
    const rootBase = schema735.buildClaimRootBase({
      schema_version: 2, object_format: commit.length === 64 ? 'sha256' : 'sha1',
      commit, tree, branch,
    });
    const lineage = schema735.buildEpochLineage(identity, rootBase);
    const stateText = [
      '# Kaola-Workflow State', '', '## Project', `name: ${project}`, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
      'step: start', `next_command: /kaola-workflow-plan-run ${project}`,
      `next_skill: kaola-workflow-plan-run ${project}`,
      '', '## Planning Evidence', `plan_hash: ${plan.hash}`, 'decision: auto-run',
      'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
      'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink',
      `branch: ${branch}`, 'issue_number: 735', 'sink: merge', `main_root: ${root}`,
      'session_marker: test-session', 'claim_ts: 2026-07-16T00:00:00.000Z',
      `worktree_path: ${worktreePath}`,
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'),
      schema735.writeEpochStateBlock(stateText, {
        epoch_schema_version: 2,
        claim_repository_id: identity.repository_id,
        claim_identity_digest: lineage.claim_identity_digest,
        claim_root_object_format: rootBase.object_format,
        claim_root_base_commit: rootBase.commit,
        claim_root_base_tree: rootBase.tree,
        claim_root_base_digest: lineage.claim_root_base_digest,
        epoch_lineage_id: lineage.epoch_lineage_id,
        plan_epoch: 1, active_plan_hash: plan.hash,
        inherited_frontier_digest: 'none', inherited_frontier_classes: 'none',
        automatic_review_replans: 0, authorized_epoch_ceiling: 2,
        case_b_exemption_consumed: false, replan_status: 'none',
        replan_transaction_id: 'none', replan_phase: 'none',
        active_snapshot_manifest_digest: 'none',
      }));
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'),
      options.tamperPlan ? plan.text.replace('labels: enhancement', 'labels: tampered') : plan.text);
    if (!options.dropMirror) {
      fs.writeFileSync(path.join(projectDir, 'workflow-tasks.json'), JSON.stringify(
        generateMirror735({ planContent: plan.text, now: '2026-07-16T00:00:00.000Z' }), null, 2) + '\n');
    }
    for (const [id, status] of Object.entries(ledger)) {
      if (status === 'complete') fs.writeFileSync(path.join(cacheDir, id + '.md'), 'evidence-binding: ' + id + ' abc\n');
    }
    return { root, project, projectDir, branch, worktreePath };
  }

  function runRelease735(fx) {
    const r = spawnSync('node', [path.join(__dirname, 'kaola-workflow-claim.js'), 'release',
      '--project', fx.project, '--json'], {
      cwd: fx.root, encoding: 'utf8',
      env: Object.assign({}, gitEnv735, { KAOLA_WORKFLOW_OFFLINE: '1' }),
    });
    let json = null;
    try { json = JSON.parse((r.stdout || '').trim()); } catch (_) {}
    return { status: r.status, json, raw: (r.stdout || '') + (r.stderr || '') };
  }

  const abandonWindows = [
    ['frozen-never-run, plan frozen with NO ## Required Agent Compliance section',
      { impl: 'pending', review: 'pending', finalize: 'pending' }, { complianceFor: null },
      'state_compliance_authority_invalid'],
    ['mid-run, compliance rows only for the CLOSED node (legacy row-by-row append)',
      { impl: 'complete', review: 'pending', finalize: 'pending' }, { complianceFor: ['impl'] },
      'state_compliance_authority_invalid'],
    // #733 retired the task-mirror comparison from the authority ladder entirely (the mirror
    // is a pure projection of the ledger, so comparing it could only ever report staleness).
    // A missing mirror therefore no longer refuses AT ALL, and this window needs NO downgrade
    // to abandon cleanly — strictly better than downgrading it. The case is kept rather than
    // deleted because it still pins the user-facing property: a frozen-never-run project with
    // no task mirror abandons and fully cleans up. `null` here means "no downgrade expected".
    ['frozen-never-run, best-effort freeze-time workflow-tasks.json never landed',
      { impl: 'pending', review: 'pending', finalize: 'pending' }, { dropMirror: true },
      null],
  ];
  for (const [label, ledger, opts, downgraded] of abandonWindows) {
    const fx = fixture735(ledger, opts);
    try {
      const r = runRelease735(fx);
      assert(r.status === 0 && r.json && r.json.released === true,
        '#735: discard succeeds for a user-consented abandon (' + label + '), got ' + r.raw.trim());
      if (downgraded === null) {
        assert(r.json && !r.json.authority_downgraded,
          '#735: this window needs NO authority downgrade (' + label + '), got '
            + JSON.stringify(r.json && r.json.authority_downgraded));
      } else {
        assert(r.json && r.json.authority_downgraded === downgraded,
          '#735: the abandon records the downgraded run-state authority reason (' + label + '), got '
            + JSON.stringify(r.json && r.json.authority_downgraded));
      }
      assert(!fs.existsSync(fx.projectDir) && r.json && r.json.dest && fs.existsSync(r.json.dest),
        '#735: the live folder is archived, not left in place (' + label + ')');
      assert(!fs.existsSync(fx.worktreePath),
        '#735: worktree cleanup actually ran (' + label + ')');
      assert(git735(fx.root, ['branch', '--list', fx.branch]) === '',
        '#735: feature-branch cleanup actually ran (' + label + ')');
      assert(r.json && r.json.claim_label_removed === 'skipped_offline',
        '#735: claim-label cleanup was attempted (' + label + '), got '
          + JSON.stringify(r.json && r.json.claim_label_removed));
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // CONTROL 1 — the relaxation is ABANDON-only. The same never-produced compliance
  // artifact must still fail the `closed` archive closed: a closed archive is the
  // input to archiveEpochLineagePreserved, whose `preserved` token asserts the
  // lineage really was intact. Nothing about a user-consented abandon claims that.
  {
    const fx = fixture735({ impl: 'pending', review: 'pending', finalize: 'pending' },
      { complianceFor: null });
    try {
      const claim735 = require('./kaola-workflow-claim.js');
      const closed = claim735.archiveProjectDir(fx.root, fx.project, 'closed', undefined, {});
      assert(closed && closed.archived === false
        && closed.snapshot_error === 'state_compliance_authority_invalid',
        '#735 control: a CLOSED archive still fails closed on the same missing compliance section, got '
          + JSON.stringify(closed));
      assert(fs.existsSync(fx.projectDir),
        '#735 control: the refused CLOSED archive left the live folder untouched');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // CONTROL 2 — the relaxation covers ABSENT/INCOMPLETE run-state product only, never
  // a TAMPER signal on the frozen artifacts themselves. A plan edited after freeze
  // (plan_hash no longer matches its bytes) still refuses the abandon: that is not an
  // artifact the project "never produced", it is one that no longer verifies, and a
  // discard would erase the only live copy of the evidence.
  {
    const fx = fixture735({ impl: 'pending', review: 'pending', finalize: 'pending' },
      { tamperPlan: true });
    try {
      const r = runRelease735(fx);
      assert(r.status === 1 && r.json && r.json.released === false
        && r.json.reason === 'state_active_plan_invalid',
        '#735 control: a post-freeze plan TAMPER still refuses the abandon fail-closed, got ' + r.raw.trim());
      assert(fs.existsSync(fx.projectDir) && fs.existsSync(fx.worktreePath),
        '#735 control: the refused abandon left the live folder and worktree untouched');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

// ---------------------------------------------------------------------------
// #755: the abandon authority downgrade must never MASK a non-downgradable fault.
// The five downgradable reasons are all run-state-progress tiers, and every one of
// them is evaluated BEFORE the epoch-position, replan-transaction, committed-history,
// and snapshot tiers. With a first-failure-wins ladder, an abandon whose FIRST failure
// was downgradable proceeded with every later tier UNEVALUATED — the composed archive
// authority even skipped the entire snapshot ladder (`current.ok ? verifyAll... : null`).
// The stated contract is "only these five absence-of-run-product reasons are
// downgraded"; the actual behavior downgraded whatever hid behind them.
//
// The control at the end is as load-bearing as the refusals: a project whose ONLY
// faults are downgradable must still abandon cleanly AND fully clean up.
// ---------------------------------------------------------------------------
{
  const { execFileSync, spawnSync } = require('child_process');
  const schema755 = require('./kaola-workflow-adaptive-schema.js');
  const validator755 = require('./kaola-workflow-plan-validator.js');
  const { generateMirror: generateMirror755 } = require('./kaola-workflow-task-mirror.js');

  const gitEnv755 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  });
  const git755 = (root, args) => execFileSync('git', ['-C', root, ...args],
    { encoding: 'utf8', env: gitEnv755, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  function plan755(project, nodes, ledger, opts) {
    const options = opts || {};
    const rows = nodes.map(n => `| ${n.id} | ${n.role} | ${n.depends_on || '—'} | ${n.write_set || '—'} | 1 | ${n.shape || 'sequence'} | ${n.model || 'standard'} | — | — | — | — |`).join('\n');
    const ledgerRows = nodes.map(n => `| ${n.id} | ${ledger[n.id] || 'pending'} |`).join('\n');
    const which = options.complianceFor === undefined ? nodes.map(n => n.id) : options.complianceFor;
    let text = [
      `# Workflow Plan — ${project}`, '', '## Meta', `project: ${project}`,
      'labels: enhancement', 'speculative_open_policy: auto',
      'validation_command: node scripts/simulate-workflow-walkthrough.js',
      'validation_timeout_minutes: 30', 'plan_schema_version: 2', 'contract_version: 2',
      '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |', rows,
      '', '## Node Ledger', '', '| id | status |', '| --- | --- |', ledgerRows, '',
    ].join('\n');
    if (which !== null) {
      const complianceRows = nodes.filter(n => which.includes(n.id)).map(n =>
        (ledger[n.id] || 'pending') === 'complete'
          ? `| ${n.role} (${n.id}) | subagent-invoked | .cache/${n.id}.md | |`
          : `| ${n.role} (${n.id}) | pending | | |`).join('\n');
      text += ['## Required Agent Compliance', '',
        '| Requirement | Status | Evidence | Skip Reason |',
        '| --- | --- | --- | --- |', complianceRows, ''].join('\n');
    }
    const hash = validator755.computePlanHash(text);
    return { text: text.replace(/^# Workflow Plan[^\n]*\n/, m => m + `\n<!-- plan_hash: ${hash} -->\n`), hash };
  }

  // A frozen, claimed, schema-2 adaptive project with a real linked worktree and feature
  // branch. `opts.sinkPr` makes it a PR-sink folder so the watch-pr CLOSED sweep — the
  // SECOND production caller of the relaxed archive path, and an AUTOMATIC one — picks it up.
  function fixture755(project, ledger, opts) {
    const options = opts || {};
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw755-')));
    git755(root, ['init', '-b', 'main']);
    git755(root, ['config', 'user.name', 'Test']);
    git755(root, ['config', 'user.email', 't@example.com']);
    git755(root, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
    git755(root, ['add', 'product.js']);
    git755(root, ['commit', '-m', 'root']);
    const commit = git755(root, ['rev-parse', 'HEAD']);
    const tree = git755(root, ['rev-parse', 'HEAD^{tree}']);
    const branch = 'workflow/' + project;
    const worktreePath = path.join(root, '.kw', 'worktrees', project);
    git755(root, ['worktree', 'add', '-b', branch, worktreePath]);
    const projectDir = path.join(root, 'kaola-workflow', project);
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const nodes = [
      { id: 'impl', role: 'tdd-guide', write_set: 'product.js' },
      { id: 'review', role: 'code-reviewer', depends_on: 'impl', model: 'reasoning' },
      { id: 'finalize', role: 'finalize', depends_on: 'review', model: '—' },
    ];
    const plan = plan755(project, nodes, ledger, options);
    const identity = schema755.buildClaimIdentity({
      schema_version: 2, repository_id: 'local:' + root, issue_numbers: [755], primary_issue: 755,
      bundle_id: null, closure_policy: 'all_or_nothing', branch, worktree_path: worktreePath,
      claim_ts: '2026-07-16T00:00:00.000Z', session_marker: 'test-session',
    });
    const rootBase = schema755.buildClaimRootBase({
      schema_version: 2, object_format: commit.length === 64 ? 'sha256' : 'sha1',
      commit, tree, branch,
    });
    const lineage = schema755.buildEpochLineage(identity, rootBase);
    const stateText = [
      '# Kaola-Workflow State', '', '## Project', `name: ${project}`, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
      'step: start', `next_command: /kaola-workflow-plan-run ${project}`,
      `next_skill: kaola-workflow-plan-run ${project}`,
      '', '## Planning Evidence', `plan_hash: ${plan.hash}`, 'decision: auto-run',
      'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
      'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink',
      `branch: ${branch}`, 'issue_number: 755',
      options.sinkPr ? 'sink: pr' : 'sink: merge',
      ...(options.sinkPr ? ['pr_url: https://github.com/test/repo/pull/9'] : []),
      `main_root: ${root}`,
      'session_marker: test-session', 'claim_ts: 2026-07-16T00:00:00.000Z',
      `worktree_path: ${worktreePath}`,
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'),
      schema755.writeEpochStateBlock(stateText, {
        epoch_schema_version: 2,
        claim_repository_id: identity.repository_id,
        claim_identity_digest: lineage.claim_identity_digest,
        claim_root_object_format: rootBase.object_format,
        claim_root_base_commit: rootBase.commit,
        claim_root_base_tree: rootBase.tree,
        claim_root_base_digest: lineage.claim_root_base_digest,
        epoch_lineage_id: lineage.epoch_lineage_id,
        plan_epoch: 1, active_plan_hash: plan.hash,
        inherited_frontier_digest: 'none', inherited_frontier_classes: 'none',
        automatic_review_replans: 0, authorized_epoch_ceiling: 2,
        case_b_exemption_consumed: false, replan_status: 'none',
        replan_transaction_id: 'none', replan_phase: 'none',
        active_snapshot_manifest_digest: 'none',
      }));
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), plan.text);
    fs.writeFileSync(path.join(projectDir, 'workflow-tasks.json'), JSON.stringify(
      generateMirror755({ planContent: plan.text, now: '2026-07-16T00:00:00.000Z' }), null, 2) + '\n');
    for (const [id, status] of Object.entries(ledger)) {
      if (status === 'complete') fs.writeFileSync(path.join(cacheDir, id + '.md'), 'evidence-binding: ' + id + ' abc\n');
    }
    return { root, project, projectDir, branch, worktreePath };
  }

  function runRelease755(fx) {
    const r = spawnSync('node', [path.join(__dirname, 'kaola-workflow-claim.js'), 'release',
      '--project', fx.project, '--json'], {
      cwd: fx.root, encoding: 'utf8',
      env: Object.assign({}, gitEnv755, { KAOLA_WORKFLOW_OFFLINE: '1' }),
    });
    let json = null;
    try { json = JSON.parse((r.stdout || '').trim()); } catch (_) {}
    return { status: r.status, json, raw: (r.stdout || '') + (r.stderr || '') };
  }

  // watch-pr is online by construction (OFFLINE early-returns), so drive it through the
  // supported gh mock seam with a PR that reports CLOSED.
  function runWatchPrClosed755(fx) {
    const binDir = path.join(fx.root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const shim = path.join(binDir, 'gh.js');
    fs.writeFileSync(shim, [
      "const a = process.argv.slice(2).join(' ');",
      "if (a.includes('pr view')) { process.stdout.write('{\"state\":\"CLOSED\",\"number\":9}\\n'); }",
      "else if (a.includes('issue view')) { process.stdout.write('{\"state\":\"CLOSED\",\"number\":755,\"labels\":[]}\\n'); }",
      "else if (a.includes('repo view')) { process.stdout.write('{\"owner\":{\"login\":\"test\"},\"name\":\"repo\"}\\n'); }",
      "else { process.stdout.write('[]\\n'); }",
    ].join('\n'));
    const r = spawnSync('node', [path.join(__dirname, 'kaola-workflow-claim.js'), 'watch-pr', '--json'], {
      cwd: fx.root, encoding: 'utf8',
      env: Object.assign({}, gitEnv755, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GH_MOCK_SCRIPT: shim }),
    });
    let json = null;
    try { json = JSON.parse((r.stdout || '').trim()); } catch (_) {}
    return { status: r.status, json, raw: (r.stdout || '') + (r.stderr || '') };
  }

  const PENDING755 = { impl: 'pending', review: 'pending', finalize: 'pending' };
  // A ledger status outside the allowed set makes the ## Node Ledger tier unreadable
  // (`state_ledger_authority_invalid`) — downgradable, and evaluated even earlier than
  // the compliance tiers.
  const BOGUS_LEDGER755 = { impl: 'bogus', review: 'pending', finalize: 'pending' };
  // A `.staging-` epoch entry is snapshot-tier residue (`snapshot_staging_incomplete`);
  // an unparseable replan transaction is `replan_transaction_invalid`, evaluated in the
  // current-epoch ladder AFTER every downgradable tier; an `.cache/epochs` symlinked out
  // of the project is `snapshot_epochs_unreadable`. None is in the downgradable set.
  const stagingResidue755 = fx =>
    fs.mkdirSync(path.join(fx.projectDir, '.cache', 'epochs', '.staging-abc'), { recursive: true });
  const corruptTransaction755 = fx =>
    fs.writeFileSync(path.join(fx.projectDir, '.cache', schema755.REPLAN_TRANSACTION_NAME), '{not json');
  const symlinkEpochs755 = (fx) => {
    const outside = path.join(fx.root, 'outside-epochs');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(fx.projectDir, '.cache', 'epochs'));
  };

  // S1/S3 (alone) already refused; S2/S4/S5 are the same faults with a DOWNGRADABLE
  // failure in front of them, and must refuse identically.
  const maskingProbes = [
    ['S1 snapshot staging residue, alone', {}, stagingResidue755, 'snapshot_staging_incomplete'],
    ['S2 snapshot staging residue MASKED by a missing compliance section',
      { complianceFor: null }, stagingResidue755, 'snapshot_staging_incomplete'],
    ['S3 corrupt replan transaction, alone', {}, corruptTransaction755, 'replan_transaction_invalid'],
    ['S4 corrupt replan transaction MASKED by a missing compliance section',
      { complianceFor: null }, corruptTransaction755, 'replan_transaction_invalid'],
    ['S5 .cache/epochs symlinked out of the project MASKED by a missing compliance section',
      { complianceFor: null }, symlinkEpochs755, 'snapshot_epochs_unreadable'],
    // The compliance tier is not the only deferrable one: an unreadable ## Node Ledger is
    // downgradable too, and it is checked EARLIER still, so it masks even more of the ladder.
    ['S6 snapshot staging residue MASKED by an unreadable ## Node Ledger',
      { ledger: BOGUS_LEDGER755 }, stagingResidue755, 'snapshot_staging_incomplete'],
  ];
  for (const [label, opts, mutate, expected] of maskingProbes) {
    const fx = fixture755('issue-755', opts.ledger || PENDING755, opts);
    try {
      mutate(fx);
      const r = runRelease755(fx);
      assert(r.status === 1 && r.json && r.json.released === false && r.json.reason === expected,
        '#755: a non-downgradable fault must refuse the abandon even behind a downgradable one ('
          + label + '), expected ' + expected + ', got ' + r.raw.trim());
      assert(fs.existsSync(fx.projectDir) && fs.existsSync(fx.worktreePath)
        && git755(fx.root, ['branch', '--list', fx.branch]) !== '',
        '#755: the refused abandon must leave the live folder, worktree, and branch untouched ('
          + label + ')');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // OVER-REFUSAL CONTROL — the whole point of the #735 carve-out. A project whose ONLY
  // faults are downgradable still abandons cleanly and fully cleans up (folder archived,
  // worktree removed, branch deleted, claim label attempted). Tightening the ladder must
  // not re-break this. The emitted `warnings[]` entry is asserted directly: reading
  // `authority_downgraded` off the result spread alone left the non-silence property
  // unpinned (the warning push could be deleted with every assertion still green).
  {
    const fx = fixture755('issue-755', PENDING755, { complianceFor: null });
    try {
      const r = runRelease755(fx);
      assert(r.status === 0 && r.json && r.json.released === true
        && r.json.authority_downgraded === 'state_compliance_authority_invalid',
        '#755 control: an ONLY-downgradable abandon must still succeed with the reason recorded, got '
          + r.raw.trim());
      assert(Array.isArray(r.json.warnings) && r.json.warnings.some(w =>
        String(w).startsWith('run-state authority downgraded: state_compliance_authority_invalid')),
        '#755 control: the downgrade must be surfaced in the EMITTED warnings[], got '
          + JSON.stringify(r.json.warnings));
      assert(!fs.existsSync(fx.projectDir) && r.json.dest && fs.existsSync(r.json.dest),
        '#755 control: the only-downgradable abandon archives the live folder');
      assert(!fs.existsSync(fx.worktreePath) && git755(fx.root, ['branch', '--list', fx.branch]) === '',
        '#755 control: the only-downgradable abandon still removes the worktree and branch');
      assert(r.json.claim_label_removed === 'skipped_offline',
        '#755 control: claim-label cleanup was attempted, got ' + JSON.stringify(r.json.claim_label_removed));
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // OVER-REFUSAL CONTROL, ledger tier. Deferring the ledger tier leaves no usable status
  // map, so the ledger-progress and compliance-progress checks that PROJECT that map must
  // be skipped rather than run against it — and the abandon must still complete.
  {
    const fx = fixture755('issue-755', BOGUS_LEDGER755, {});
    try {
      const r = runRelease755(fx);
      assert(r.status === 0 && r.json && r.json.released === true
        && r.json.authority_downgraded === 'state_ledger_authority_invalid',
        '#755 control: an ONLY-downgradable LEDGER fault must still abandon with the reason recorded, got '
          + r.raw.trim());
      assert(!fs.existsSync(fx.projectDir) && !fs.existsSync(fx.worktreePath)
        && git755(fx.root, ['branch', '--list', fx.branch]) === '',
        '#755 control: the ledger-tier abandon archives the folder and cleans up worktree + branch');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // SWEEP PATH — cmdWatchPr's PR-CLOSED branch is the second production caller of the
  // relaxed archive, and unlike release it is AUTOMATIC (driven by remote PR state, not an
  // operator's discard). It had no coverage at all with a downgradable window open.
  {
    const fx = fixture755('issue-755', PENDING755, { complianceFor: null, sinkPr: true });
    try {
      stagingResidue755(fx);
      const r = runWatchPrClosed755(fx);
      const refusals = (r.json && r.json.archive_refusals) || [];
      assert(refusals.length === 1 && refusals[0].reason === 'snapshot_staging_incomplete',
        '#755 sweep: the automatic PR-CLOSED sweep must refuse a masked non-downgradable fault, got '
          + r.raw.trim());
      assert(fs.existsSync(fx.projectDir),
        '#755 sweep: the refused sweep must leave the live folder in place');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
  {
    const fx = fixture755('issue-755', PENDING755, { complianceFor: null, sinkPr: true });
    try {
      const r = runWatchPrClosed755(fx);
      const entry = ((r.json && r.json.cleanups) || [])[0] || {};
      assert(!fs.existsSync(fx.projectDir) && entry.folder === fx.project,
        '#755 sweep control: an ONLY-downgradable sweep still archives the folder, got ' + r.raw.trim());
      assert(entry.authority_downgraded === 'state_compliance_authority_invalid',
        '#755 sweep: the automatic cleanup must not be silent about the downgrade, got '
          + JSON.stringify(entry));
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

if (failed > 0) {
  console.error('claim-hardening tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('claim-hardening tests passed (' + passed + ' assertions)');
}
