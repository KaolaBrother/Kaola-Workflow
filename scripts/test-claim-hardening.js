#!/usr/bin/env node
'use strict';

// #356: claim fail-open hardening — gh round-trips are timeout-bounded (claim's ghExec was the one
// uncapped copy), and branch args reject a leading-dash/NUL so a malformed ref can't reach git as a
// flag. REMOTE_TIMEOUT_MS resolves at module load, so the timeout env is set BEFORE require.

// Advisory spawn census. Installed before ANY child_process binding is taken (here or in a
// required module) so the counted wrappers are what gets bound. Pass-through and fail-open:
// it can change no assertion and fail no run.
const spawnCensus = require('./test-spawn-census');
spawnCensus.install('test-claim-hardening');

const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.KAOLA_GH_REMOTE_TIMEOUT_MS = '500';   // tiny cap for the hang test (set before require)
delete process.env.KAOLA_WORKFLOW_OFFLINE;        // ensure ghExec actually shells the mock

// Hermetic HOME — the shared ~/.config/kaola-workflow/config.json (os.homedir()) is user-owned; point
// HOME/USERPROFILE at a throwaway sandbox so no spawned subprocess reads or writes the developer's
// real one. Nothing is seeded: an absent config is the shape a fresh machine has.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sandbox-home-'));
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const { ghExec, isSafeBranchArg, removeBranch, postAdvisoryClaim, defaultBranch, resolveCodexDispatchModeFlag } = require('./kaola-workflow-claim.js');
const { writeFileAtomicReplace, NEXT_COMMAND } = require('./kaola-workflow-adaptive-schema.js');
// Git FIXTURE arrangement routes through the shared library — one process-boundary
// decision for the repo instead of one per line. See scripts/test-git-fixture.js.
const G = require('./test-git-fixture');

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
// The roadmap_source_removed/roadmap_regenerated witness pair is retired under ADR 0018 §5 along
// with reconcileRoadmapForClosure — neither field has a schema entry to seed a default into any
// more. Deleted with the mechanism; the undefined-skip behavior itself is unchanged and still
// covered below via close_disposition.
{
  const { buildClosureReceipt } = require('./kaola-workflow-claim.js');
  const r = buildClosureReceipt('proj', 7, {});
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
    // Drives the REAL subprocess CLI rather than the module, exactly as the acceptance requires: what
    // is proven is that --help prints usage and exits 0, and that an unrecognized flag maps to an
    // unknown_flag refusal and exit 1. Usage text, argv and exit codes exist only at this boundary.
    // spawn-class: cli-contract
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
  const headBefore = G.exec(repo, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const d = run(SINK, ['--branch', 'workflow/issue-476t', '--project', 'issue-476t', '--help'], repo);
  assert(d.code === 0 && /^usage:/m.test(d.out), '#476: sink-merge --help prints usage + exit 0 (got ' + d.out.trim() + ')');
  const branchStill = G.exec(repo, ['branch', '--list', 'workflow/issue-476t'], { encoding: 'utf8' }).trim();
  const headAfter = G.exec(repo, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
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
  const branchAfterSwallow = G.exec(repo, ['branch', '--list', 'workflow/issue-476t'], { encoding: 'utf8' }).trim();
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
  const branchAfterG = G.exec(repo, ['branch', '--list', 'workflow/issue-476t'], { encoding: 'utf8' }).trim();
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
      // The shared envelope vehicle for the claim CLI in this scenario: everything this site itself
      // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
      // domain checks live in the callers.
      // spawn-class: cli-contract
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

  // --- (c) determinate GENUINE-negative non-zero NOT retried (bundle path — result:answer) ---
  // #519 RECONCILE: the axis is stderr-error-CLASS, not exit code. This pin uses a GENUINE-negative
  // stderr (a real 404 "Could not resolve to an Issue") so it stays DETERMINATE under the corrected
  // taxonomy — that half is unchanged and is what the retry counter below still proves.
  //
  // WHAT CHANGED, deliberately: the determinate arm now ANSWERS at exit 0 instead of refusing.
  // `target_set_unavailable` twins the scalar `target_unavailable`, which has always answered, and
  // a `target_set_X` classifies and exits exactly like its twin. The earlier call — determinate →
  // refuse → fail closed — is OVERRIDDEN, not disputed: it was correct while a stop was the only
  // way to make a caller notice, and nothing was ever written on this path, so the fact is one the
  // caller acts on rather than one it must halt for. The DETERMINACY distinction that gives this
  // block its name is untouched: a transient stderr still escalates and still retries (the (b) and
  // (d) blocks either side of this one), and only the verdict attached to the determinate answer
  // moved. Confusing "no retry" with "hard stop" is exactly what the twin rule separates.
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
    assert(r.json && r.json.result === 'answer',
      '#495(c-bundle): genuine-negative non-zero → result:answer, like the scalar twin (got result=' + (r.json && r.json.result) + ')');
    assert(r.code === 0,
      '#495(c-bundle): and it ANSWERS at exit 0 — the exit code follows `result`, so a demoted result '
      + 'that still exited 1 would be the asymmetry the twin rule removes (got code=' + r.code + ')');
    assert(r.json && r.json.claim === 'none',
      '#495(c-bundle): `claim: none` is what says the claim did not happen (got claim=' + (r.json && r.json.claim) + ')');
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
      // The shared envelope vehicle for the classifier CLI in this scenario: everything this site itself
      // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
      // domain checks live in the callers.
      // spawn-class: cli-contract
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
      // The shared envelope vehicle for the classifier CLI in this scenario: everything this site itself
      // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
      // domain checks live in the callers.
      // spawn-class: cli-contract
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

// --- #503: resume_ambiguous when multiple active folders and no --project -------------
// The original defect stands and is still pinned: resume with no --project and two active folders
// must NOT silently return folder[0]. What changed is the verb, deliberately.
//
// It is now an ANSWER at exit 0 (`result: 'answer'`, `mutation_performed: false`). A question
// answered with a stop is a stop that answered nothing: the caller is not blocked on a value call
// or on a destroyed record, it simply has to say which project it meant — and the envelope now
// carries everything it needs to say so. `resumed: false` and `mutation_performed: false` are what
// report that nothing happened; the exit code no longer carries that meaning here.
//
// SO THE LOAD-BEARING PIN IS NO LONGER THE EXIT CODE — it is that the payload is USABLE. Below,
// one of the emitted `resume_with` commands is executed verbatim and must resume that project.
// The exact key set of `candidate_detail` is deliberately NOT pinned: it is diagnostic breadth
// that will churn, and pinning it would make every future field addition a red.
//
// MUTATION LOG (both this pin and #495(c-bundle) above). Each was un-wired in
// `kaola-workflow-claim.js` against a scratch mirror of the repository — `git checkout --` is
// unusable while several agents hold uncommitted work here — and observed RED, with a clean
// mirror control (811 assertions, 0 failures) before and after. Verbatim casualties:
//
//   resume_ambiguous back to result:'refuse'
//     "#503(A): ambiguous resume must carry result:answer (got "refuse")"
//   resume_ambiguous back to exit 1
//     "#503(A): ambiguous resume ANSWERS at exit 0 (got code=1, ...)"
//   every candidate handed the SAME resume_with (folder[0])
//     "#503(A-choose): each entry carries its OWN resume command ... (got "resume --project
//     issue-63 --json")" AND "running the offered command resumes THAT project (got
//     {"resumed":true,"project":"issue-63",...})"
//   resume_with drops its --project flag while still naming its own project
//     "#503(A-choose): running the offered command resumes THAT project ... (got
//     {"resumed":false,...,"reason":"resume_ambiguous",...})"
//     — the STRING checks survive this one and only the EXECUTION arm dies, which is the
//     evidence that running the offered command is doing work the shape checks cannot.
//   target_set_unavailable loses its twin and refuses
//     "#495(c-bundle): genuine-negative non-zero → result:answer, like the scalar twin (got
//     result=refuse)" AND "and it ANSWERS at exit 0 ... (got code=1)"
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
      // The shared envelope vehicle for the claim resume CLI in this scenario: everything this site itself
      // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
      // domain checks live in the callers.
      // spawn-class: cli-contract
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

  // Scenario A (ambiguous): two active folders + no --project → answers with reason: resume_ambiguous.
  const rAmb = runResume([], repo503);
  assert(rAmb.code === 0,
    '#503(A): ambiguous resume ANSWERS at exit 0 (got code=' + rAmb.code + ', json=' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && rAmb.json.result === 'answer',
    '#503(A): ambiguous resume must carry result:answer (got ' + JSON.stringify(rAmb.json && rAmb.json.result) + ')');
  assert(rAmb.json && rAmb.json.reason === 'resume_ambiguous',
    '#503(A): ambiguous resume must emit reason:resume_ambiguous (got ' + JSON.stringify(rAmb.json) + ')');

  // THE ORIGINAL DEFECT, still pinned. The exit code moved; the thing #503 was about did not.
  // `resumed:false` + `mutation_performed:false` are now what report that nothing was picked, and
  // they carry that meaning at exit 0 — so an implementation that quietly resumed folder[0] and
  // exited 0 is still red here.
  assert(rAmb.json && rAmb.json.resumed === false,
    '#503(A): the ambiguous answer must NOT silently resume one of them (got resumed='
      + JSON.stringify(rAmb.json && rAmb.json.resumed) + ')');
  assert(rAmb.json && rAmb.json.mutation_performed === false,
    '#503(A): and it must say so structurally — mutation_performed:false is the bit the exit code '
      + 'stopped carrying (got ' + JSON.stringify(rAmb.json && rAmb.json.mutation_performed) + ')');
  assert(rAmb.json && rAmb.json.project == null,
    '#503(A): an ambiguous answer resolves to NO project (got ' + JSON.stringify(rAmb.json && rAmb.json.project) + ')');

  assert(rAmb.json && Array.isArray(rAmb.json.candidates) && rAmb.json.candidates.length === 2,
    '#503(A): ambiguous resume must list both candidates (got ' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && rAmb.json.candidates && rAmb.json.candidates.includes('issue-63'),
    '#503(A): candidates must include issue-63 (got ' + JSON.stringify(rAmb.json) + ')');
  assert(rAmb.json && rAmb.json.candidates && rAmb.json.candidates.includes('issue-65'),
    '#503(A): candidates must include issue-65 (got ' + JSON.stringify(rAmb.json) + ')');

  // --- #503(A-choose): the payload is USABLE, which is what an answer owes that a stop did not.
  //
  // A report replaces a refusal only if the caller can act on it. So this drives the act: take the
  // command the envelope printed for ONE named candidate and run it verbatim. Nothing here pins
  // the key set of `candidate_detail` — only that each entry identifies its own project and hands
  // back a command that resolves to THAT project.
  const detail = rAmb.json && rAmb.json.candidate_detail;
  assert(Array.isArray(detail) && detail.length === rAmb.json.candidates.length,
    '#503(A-choose): candidate_detail must cover every candidate (got '
      + JSON.stringify(detail && detail.length) + ' for ' + rAmb.json.candidates.length + ' candidates)');
  if (Array.isArray(detail)) {
    for (const d of detail) {
      assert(d && typeof d.project === 'string' && rAmb.json.candidates.includes(d.project),
        '#503(A-choose): each entry names one of the candidates (got ' + JSON.stringify(d && d.project) + ')');
      assert(d && typeof d.resume_with === 'string' && d.resume_with.includes(d.project),
        '#503(A-choose): each entry carries its OWN resume command — a single shared hint would make '
          + 'the caller re-derive the choice (got ' + JSON.stringify(d && d.resume_with) + ')');
    }
    // Execute one of them. `issue-65` is deliberately NOT folder[0], so a resume that ignored the
    // argument and fell back to the first folder resolves to issue-63 and is red.
    const chosen = detail.find(d => d.project === 'issue-65');
    assert(chosen != null, '#503(A-choose): the envelope offers issue-65 as a choice');
    if (chosen) {
      const argv = chosen.resume_with.trim().split(/\s+/);
      assert(argv[0] === 'resume',
        '#503(A-choose): resume_with names the subcommand it belongs to (got ' + JSON.stringify(chosen.resume_with) + ')');
      const rChosen = runResume(argv.slice(1), repo503);
      assert(rChosen.code === 0,
        '#503(A-choose): the offered command must WORK (got code=' + rChosen.code + ', json=' + JSON.stringify(rChosen.json) + ')');
      assert(rChosen.json && rChosen.json.resumed === true && rChosen.json.project === 'issue-65',
        '#503(A-choose): running the offered command resumes THAT project — this is the whole '
          + 'justification for answering instead of stopping (got ' + JSON.stringify(rChosen.json) + ')');
    }
  }

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
// KAOLA_ENABLE_ADAPTIVE is retired — no env lever survives. Distinct target-issue numbers avoid
// the  early-return false-green.
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
    // The shared envelope vehicle for the claim CLI in this scenario: everything this site itself
    // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
    // domain checks live in the callers.
    // spawn-class: cli-contract
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
  // requested value NEVER reaches durable state: the persisted workflow_path is the constant
  // 'adaptive', and next_command routes unconditionally to the adaptive executor.
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
    assert(/^workflow_path: adaptive$/m.test(state5381),
      '#770(b): a stale KAOLA_PATH must leave NO trace — the persisted workflow_path is the constant adaptive, never an echo of the request, got:\n' + state5381);
    assert(!/^workflow_path: fast$/m.test(state5381),
      '#770(b): the retired path name must not appear anywhere in durable state, got:\n' + state5381);
    // The property is "routing is unconditionally adaptive", not "the adaptive command is spelled
    // <x>". Read the spelling from the schema constant the writer itself uses: this pin survived a
    // literal `/kaola-workflow-plan-run` long enough for the command to be DELETED out from under
    // it, and a pin that names a command which no longer exists tests nothing.
    assert(new RegExp('^next_command: ' + NEXT_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' issue-5381$', 'm').test(state5381),
      '#770(b): routing must be unconditionally adaptive despite the stale KAOLA_PATH value — expected next_command: '
        + NEXT_COMMAND + ' issue-5381, got:\n' + state5381);
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
    assert(/^workflow_path: adaptive$/m.test(state5383),
      '#770(d): a stale --workflow-path must leave NO trace — the persisted workflow_path is the constant adaptive, got:\n' + state5383);
    assert(!/^workflow_path: full$/m.test(state5383),
      '#770(d): the retired path name must not appear anywhere in durable state, got:\n' + state5383);
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

// DELETED with their mechanisms:
//   #522 — the finalize chain-receipt gate. Only its GREEN case survived the conversion (the
//     refusing scenarios went with the verdict), and that case is pinned in separate custody by
//     scripts/test-finalize-door.js T2, over a PLAN-LESS fixture and a receipt from the real
//     producer. This copy proved the same thing through a frozen plan, a plan_hash, an epoch
//     envelope and a node ledger — every one of them gone.
//   #686 — the archive-time reap of dangling refs/kaola-workflow/barrier/<tag>/* refs and the
//     legacy barrier-ref-sweep subcommand, with all eight of their adversarial repair cases.
//     Barrier refs were per-NODE gc anchors; there are no nodes and nothing mints one.
//   #699 — a fresh claim persists an immutable claim_root / epoch_lineage_id / plan_hash identity.
//     Epochs and the re-plan CAS machinery are retired, and a plan_hash needs a plan grammar to
//     hash. The surviving half of "a claim writes durable identity" is the selection record and
//     its digest, pinned at the bottom of this file.

// --- #816: cmdFinalize owns the whole mechanical finalization as ONE resumable transaction ------
// The contractor role is retired: the artifact mirror (with its ledger-regression guard), the
// archive + status close, the roadmap staging, and the `chore: finalize` commit gate all live in
// cmdFinalize. Two guardrails carry over as TYPED refusals inside the transaction: the machinery
// never authors the implementation commit, and the single-project staging rule.
//
// Fixture uses a REAL `git worktree add` linked worktree (the lane the transaction serves), so the
// mirror direction (main -> linked worktree) and the commit gate are exercised for real.
{
  const { execFileSync: execFS816, spawnSync: spawnS816 } = require('child_process');
  const CLAIM816 = path.join(__dirname, 'kaola-workflow-claim.js');

  const GIT_ENV816 = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  };
  const g816 = (cwd, args) => {
    try {
      execFS816('git', ['-C', cwd, ...args],
        { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV816 });
      return true;
    } catch (_) { return false; }
  };
  const gOut816 = (cwd, args) => {
    const r = spawnS816('git', ['-C', cwd, ...args], { encoding: 'utf8', env: GIT_ENV816 });
    return String(r.stdout || '').trim();
  };

  // Build a self-host repo whose feature branch lives in a REAL linked worktree.
  // Returns { base, mainRoot, wtRoot, project, headSha, wtCacheDir, mainProjDir, wtProjDir }.
  function mk816(project) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-816-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });

    g816(mainRoot, ['init', '-b', 'main']);
    g816(mainRoot, ['config', 'user.email', 't@t.com']);
    g816(mainRoot, ['config', 'user.name', 'Test']);
    g816(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'package.json'), JSON.stringify({
      scripts: {
        'test:kaola-workflow:claude': 'true',
        'test:kaola-workflow:codex': 'true',
        'test:kaola-workflow:gitlab': 'true',
        'test:kaola-workflow:gitea': 'true'
      }
    }) + '\n');
    g816(mainRoot, ['add', 'package.json']);
    g816(mainRoot, ['commit', '-m', 'chore: self-host package.json']);

    // REAL linked worktree carrying the feature branch.
    g816(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);

    // A run folder with NO plan. The transaction mirrors, archives, stages the roadmap and gates
    // the `chore: finalize` commit; none of that reads a plan grammar, a plan_hash, a node ledger
    // or an epoch envelope, so the fixture carries none. What it DOES need is the state file's
    // `## Sink` block (branch, posture, roots) — that is what the transaction actually reads.
    const wtProjDir = path.join(wtRoot, 'kaola-workflow', project);
    const wtCacheDir = path.join(wtProjDir, '.cache');
    fs.mkdirSync(wtCacheDir, { recursive: true });
    const stateText = [
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
      'base_branch: main',
      'issue_number: 816',
      'sink: merge',
      'run_posture: worktree',
      'worktree_path: ' + wtRoot,
      'main_root: ' + mainRoot,
      'session_marker: fixture-816',
      'claim_ts: 2026-01-01T00:00:00Z',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(wtProjDir, 'workflow-state.md'), stateText);

    // Implementation commit on the branch, authored INSIDE the worktree (never by the machinery).
    fs.writeFileSync(path.join(wtRoot, 'impl.txt'), 'implementation\n');
    g816(wtRoot, ['add', '-A']);
    g816(wtRoot, ['commit', '-m', 'feat: impl for ' + project]);
    const headSha = gOut816(wtRoot, ['rev-parse', 'HEAD']);

    // The orchestrator's copy of the project folder lives in MAIN (its cwd during Finalization).
    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(mainProjDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), stateText);

    // Chain receipt bound to the worktree HEAD (self-host gate).
    fs.writeFileSync(path.join(wtCacheDir, 'chain-receipt.json'), JSON.stringify({
      headSha,
      chains: [
        { name: 'claude', exitCode: 0, accepted_red: false },
        { name: 'codex', exitCode: 0, accepted_red: false },
        { name: 'gitlab', exitCode: 0, accepted_red: false },
        { name: 'gitea', exitCode: 0, accepted_red: false }
      ]
    }) + '\n');

    return { base, mainRoot, wtRoot, project, headSha, wtCacheDir, mainProjDir, wtProjDir };
  }

  // Run the ONE-CALL transaction the orchestrator issues, from the linked worktree.
  function runFinalize816(fx, extraArgs) {
    const e = Object.assign({}, process.env, GIT_ENV816, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    });
    // A fresh finalize process re-derives its whole verdict from durable state alone — the state
    // file, the receipts on disk and the git tree. That reconstruction from bytes is the property;
    // in one heap an already-parsed in-memory answer would stand in for the files.
    // spawn-class: durable-handoff
    const r = spawnS816(process.execPath,
      [CLAIM816, 'finalize', '--project', fx.project, '--keep-worktree', ...(extraArgs || [])],
      { cwd: fx.wtRoot, encoding: 'utf8', timeout: 60000, env: e });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  }
  const cleanup816 = fx => { try { fs.rmSync(fx.base, { recursive: true, force: true }); } catch (_) {} };

  // --- T1: the artifact mirror is INSIDE the transaction (no contractor bash block) -------------
  {
    const fx = mk816('issue-816a');
    try {
      // A Finalization artifact the orchestrator authored in MAIN only.
      fs.writeFileSync(path.join(fx.mainProjDir, 'finalization-summary.md'), '# Finalization\n');
      fs.writeFileSync(path.join(fx.mainProjDir, '.cache', 'final-validation.md'), 'verdict: pass\n');
      const r = runFinalize816(fx);
      assert(r.status === 0,
        '#816(T1): the one-call finalize transaction must succeed (got ' + r.status +
        ', json=' + JSON.stringify(r.json) + ', stderr=' + String(r.stderr || '').slice(0, 400) + ')');
      // #832: the archive resolves against MAIN's project root regardless of invocation cwd.
      const archived = path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project);
      assert(fs.existsSync(path.join(archived, 'finalization-summary.md')),
        '#816(T1): cmdFinalize must mirror main-authored Finalization artifacts into the worktree before archiving');
      assert(fs.existsSync(path.join(archived, '.cache', 'final-validation.md')),
        '#816(T1): the mirror must carry .cache evidence authored in the main checkout');
      assert(r.json && r.json.finalize_transaction && r.json.finalize_transaction.mirror === 'mirrored',
        '#816(T1): the receipt must record the mirror step, got ' +
        JSON.stringify(r.json && r.json.finalize_transaction));
    } finally { cleanup816(fx); }
  }

  // --- T2 (restored, #877): the worktree→main anti-clobber fence, end-to-end over the MISSION
  // LIST. The #399 property outlived the node executor whose `## Node Ledger` it used to count:
  // the mirror must never let a staler main copy overwrite a worktree record that knows about
  // more finished work. compareLedgers now counts `status: done` items of
  // kaola-workflow/<project>/mission-list.md (the one durable coordination record —
  // scripts/test-ledger-compare.js pins the counting itself). Three arms:
  //   (a) main staler + writable   -> `--check` classifies `sync_required` as STATE (never a
  //       reason) and mutates neither record; the transaction then repairs worktree→main
  //       (worktree wins, `ledger_compare: synced_from_worktree`) and the record that survives
  //       is the more-complete one.
  //   (b) main staler + UNwritable -> `--check` classifies `sync_failed`; the transaction
  //       refuses fail-closed (`finalize_mirror_refused` / `mirror_sync_failed`) and the
  //       worktree record is byte-untouched.
  //   (c) no worktree record       -> the legitimate first sync passes (fail-open).
  {
    // An independent tiny oracle: counting via the mechanism under test would be circular.
    const countDone816 = text => (String(text).match(/^[ \t]*status:[ \t]*done[ \t]*$/gim) || []).length;
    const missionList816 = statuses => {
      const lines = ['# close issue #816 — fence fixture', ''];
      statuses.forEach((s, i) => {
        lines.push('- item: mission ' + (i + 1));
        lines.push('  status: ' + s);
        if (s !== 'todo') lines.push('  dispatched: agent-' + (i + 1) + ', output to out/' + (i + 1) + '.md');
        if (s === 'done') lines.push('  result: out/' + (i + 1) + '.md');
        lines.push('');
      });
      return lines.join('\n');
    };

    // (a) staler main + writable: --check is read-only; the transaction repairs, worktree wins.
    {
      const fx = mk816('issue-816b');
      try {
        const wtRecord = missionList816(['done', 'done', 'done']);
        const mainRecord = missionList816(['done', 'in-flight', 'todo']);
        fs.writeFileSync(path.join(fx.wtProjDir, 'mission-list.md'), wtRecord);
        fs.writeFileSync(path.join(fx.mainProjDir, 'mission-list.md'), mainRecord);
        // A main-only Finalization artifact — the worktree-wins repair must not drop it.
        fs.writeFileSync(path.join(fx.mainProjDir, 'finalization-summary.md'), '# Finalization\n');

        const chk = runFinalize816(fx, ['--check', '--json']);
        assert(chk.status === 0 && chk.json && chk.json.ok === true,
          '#816(T2a): a machinery-repairable pending sync must NOT unmeet the preconditions, got '
          + 'status=' + chk.status + ' json=' + JSON.stringify(chk.json));
        assert(chk.json && chk.json.checks && chk.json.checks.mirror === 'sync_required',
          '#816(T2a): --check must classify the pending worktree→main sync as sync_required, got '
          + JSON.stringify(chk.json && chk.json.checks));
        assert(fs.readFileSync(path.join(fx.wtProjDir, 'mission-list.md'), 'utf8') === wtRecord
          && fs.readFileSync(path.join(fx.mainProjDir, 'mission-list.md'), 'utf8') === mainRecord,
          '#816(T2a): --check must leave BOTH mission-list records byte-unchanged');

        const r = runFinalize816(fx);
        assert(r.status === 0,
          '#816(T2a): the transaction must repair the staler main copy and proceed, got status='
          + r.status + ' json=' + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 400));
        const tx = r.json && r.json.finalize_transaction;
        assert(tx && tx.ledger_compare === 'synced_from_worktree',
          '#816(T2a): the receipt must record the worktree→main repair, got ' + JSON.stringify(tx));
        const archivedDir = path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project);
        const archivedRecord = path.join(archivedDir, 'mission-list.md');
        assert(fs.existsSync(archivedRecord)
          && countDone816(fs.readFileSync(archivedRecord, 'utf8')) === 3,
          '#816(T2a): the surviving (archived) record must keep the worktree\'s 3 done items — '
          + 'never regressed to main\'s 1');
        assert(fs.existsSync(path.join(archivedDir, 'finalization-summary.md')),
          '#816(T2a): the main-only Finalization artifact must survive the worktree-wins repair');
      } finally { cleanup816(fx); }
    }

    // (b) staler main + UNwritable: fail-closed refusal, zero-write on the worktree side.
    {
      const fx = mk816('issue-816d');
      const mainRecordPath = path.join(fx.mainProjDir, 'mission-list.md');
      const mainCacheDir = path.join(fx.mainProjDir, '.cache');
      try {
        const wtRecord = missionList816(['done', 'done', 'done']);
        const mainRecord = missionList816(['done', 'todo', 'todo']);
        fs.writeFileSync(path.join(fx.wtProjDir, 'mission-list.md'), wtRecord);
        fs.writeFileSync(mainRecordPath, mainRecord);
        fs.chmodSync(mainRecordPath, 0o444);
        fs.chmodSync(mainCacheDir, 0o555);
        fs.chmodSync(fx.mainProjDir, 0o555);

        const chk = runFinalize816(fx, ['--check', '--json']);
        assert(chk.status !== 0 && chk.json && chk.json.ok === false,
          '#816(T2b): an unperformable sync IS an unmet precondition, got status=' + chk.status
          + ' json=' + JSON.stringify(chk.json));
        assert(chk.json && chk.json.checks && chk.json.checks.mirror === 'sync_failed',
          '#816(T2b): --check must classify the unwritable main copy as sync_failed, got '
          + JSON.stringify(chk.json && chk.json.checks));
        assert(chk.json && Array.isArray(chk.json.reasons) && chk.json.reasons.includes('mirror_sync_failed'),
          '#816(T2b): the reason must carry the typed mirror_sync_failed token, got '
          + JSON.stringify(chk.json && chk.json.reasons));

        const r = runFinalize816(fx);
        assert(r.status !== 0 && r.json && r.json.reason === 'finalize_mirror_refused',
          '#816(T2b): the transaction must refuse under the pinned top-level reason, got status='
          + r.status + ' json=' + JSON.stringify(r.json));
        assert(r.json && r.json.inner_reason === 'mirror_sync_failed',
          '#816(T2b): the refusal must be re-typed mirror_sync_failed, got ' + JSON.stringify(r.json));
        assert(fs.readFileSync(path.join(fx.wtProjDir, 'mission-list.md'), 'utf8') === wtRecord,
          '#816(T2b): the refusal must be zero-write on the worktree side — the complete record survives');
        assert(fs.readFileSync(mainRecordPath, 'utf8') === mainRecord,
          '#816(T2b): the staler main record must not be half-advanced by a failed sync');
        assert(!fs.existsSync(path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project))
          && !fs.existsSync(path.join(fx.wtRoot, 'kaola-workflow', 'archive', fx.project)),
          '#816(T2b): the refusing transaction must archive nothing');
        assert(!/^chore: (finalize|archive) /m.test(gOut816(fx.wtRoot, ['log', '--format=%s', '-5'])),
          '#816(T2b): the refusing transaction must author no bookkeeping commit');
      } finally {
        try { fs.chmodSync(fx.mainProjDir, 0o755); } catch (_) {}
        try { fs.chmodSync(mainCacheDir, 0o755); } catch (_) {}
        try { fs.chmodSync(mainRecordPath, 0o644); } catch (_) {}
        cleanup816(fx);
      }
    }

    // (c) no worktree record: the legitimate first sync fails open and carries the record in.
    {
      const fx = mk816('issue-816e');
      try {
        fs.writeFileSync(path.join(fx.mainProjDir, 'mission-list.md'), missionList816(['done', 'done']));
        const r = runFinalize816(fx);
        assert(r.status === 0,
          '#816(T2c): the first sync (no worktree record) must pass, got status=' + r.status
          + ' json=' + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 400));
        const tx = r.json && r.json.finalize_transaction;
        assert(tx && tx.mirror === 'mirrored' && tx.ledger_compare === 'pass',
          '#816(T2c): the fail-open first sync must be recorded as a plain pass, got ' + JSON.stringify(tx));
        const archivedRecord = path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project, 'mission-list.md');
        assert(fs.existsSync(archivedRecord)
          && countDone816(fs.readFileSync(archivedRecord, 'utf8')) === 2,
          '#816(T2c): the first sync must carry the main record into the archived run folder');
      } finally { cleanup816(fx); }
    }
  }

  // --- T3: Step 7 roadmap staging + the `chore: finalize` commit gate are inside the transaction -
  {
    const fx = mk816('issue-816c');
    try {
      // Finalization docs authored in MAIN (the orchestrator's cwd) — the residue Step 8 commits.
      fs.writeFileSync(path.join(fx.mainRoot, 'CHANGELOG.md'), '# Changelog\n\n- finalize residue\n');
      fs.mkdirSync(path.join(fx.mainRoot, 'kaola-workflow', '.roadmap'), { recursive: true });
      fs.writeFileSync(path.join(fx.mainRoot, 'kaola-workflow', '.roadmap', 'issue-816.md'), '# 816\n');
      const r = runFinalize816(fx);
      assert(r.status === 0,
        '#816(T3): the transaction must succeed (got ' + r.status + ', json=' + JSON.stringify(r.json) + ')');
      const log = gOut816(fx.wtRoot, ['log', '--format=%s', '-5']);
      assert(log.split('\n').includes('chore: finalize ' + fx.project),
        '#816(T3): the transaction must author the `chore: finalize <project>` commit, got log:\n' + log);
      assert(r.json && r.json.finalize_transaction
        && r.json.finalize_transaction.finalize_commit === 'committed',
        '#816(T3): the receipt must record the finalize commit, got ' +
        JSON.stringify(r.json && r.json.finalize_transaction));
      const dirty = gOut816(fx.wtRoot, ['status', '--porcelain'])
        .split('\n').filter(l => l.trim() && !/^..\s+kaola-workflow\//.test(l));
      assert(dirty.length === 0,
        '#816(T3): the sink must receive only committed work — no residue left, got: ' + JSON.stringify(dirty));
    } finally { cleanup816(fx); }
  }

  // --- T4: the machinery NEVER authors the implementation commit (surfaced, not repaired) -------
  {
    const fx = mk816('issue-816d');
    try {
      // Rewind the branch so no implementation commit exists, leaving impl.txt uncommitted.
      g816(fx.wtRoot, ['reset', '--soft', 'main']);
      g816(fx.wtRoot, ['reset']);
      const r = runFinalize816(fx);
      assert(r.status !== 0 && r.json && r.json.reason === 'implementation_commit_missing',
        '#816(T4): an uncommitted implementation must be SURFACED as implementation_commit_missing, got status='
        + r.status + ' json=' + JSON.stringify(r.json));
      assert(fs.existsSync(path.join(fx.wtProjDir, 'workflow-state.md')),
        '#816(T4): the surfaced refusal must make no archive side effect');
      const log4 = gOut816(fx.wtRoot, ['log', '--format=%s', '-5']);
      assert(!log4.split('\n').includes('chore: finalize ' + fx.project),
        '#816(T4): the machinery must never author the implementation commit, got log:\n' + log4);
    } finally { cleanup816(fx); }
  }

  // --- T4b: a branch whose implementation was committed and then REVERTED is NOT "missing" ------
  // Two independent false-refusal sources meet on this shape, and BOTH must be closed:
  //   (1) the Step 8a mirror copies main's dirty CHANGELOG.md into the worktree, and the probe then
  //       read that machinery-authored dirt back as uncommitted implementation — the transaction
  //       manufacturing the very evidence it refuses on;
  //   (2) `git diff base...HEAD` is a NET diff, so `feat: impl` + `revert: drop impl` nets to an
  //       empty non-`kaola-workflow/` diff even though the branch plainly carries implementation
  //       commits.
  // Together they told the operator "Author the implementation commit yourself" when there was
  // nothing to author — and CHANGELOG.md is exactly what the commit gate exists to commit.
  {
    const fx = mk816('issue-816p');
    try {
      // Revert the implementation: two REAL commits, net-empty non-kaola diff.
      fs.unlinkSync(path.join(fx.wtRoot, 'impl.txt'));
      g816(fx.wtRoot, ['add', '-A']);
      g816(fx.wtRoot, ['commit', '-m', 'revert: drop impl.txt']);
      const head = gOut816(fx.wtRoot, ['rev-parse', 'HEAD']);
      fs.writeFileSync(path.join(fx.wtCacheDir, 'chain-receipt.json'), JSON.stringify({
        headSha: head,
        chains: [
          { name: 'claude', exitCode: 0, accepted_red: false },
          { name: 'codex', exitCode: 0, accepted_red: false },
          { name: 'gitlab', exitCode: 0, accepted_red: false },
          { name: 'gitea', exitCode: 0, accepted_red: false }
        ]
      }) + '\n');
      // The net diff carries NO non-kaola path — the precondition that made the probe refuse.
      const netDiff = gOut816(fx.wtRoot, ['diff', '--name-only', 'main...HEAD'])
        .split('\n').map(s => s.trim()).filter(Boolean);
      assert(netDiff.length > 0 && netDiff.every(p => p.startsWith('kaola-workflow/')),
        '#816(T4b) precondition: the reverted branch must have a net-empty NON-kaola diff, got ' + JSON.stringify(netDiff));
      // Finalization residue authored in MAIN — the mirror pulls it into the worktree.
      fs.writeFileSync(path.join(fx.mainRoot, 'CHANGELOG.md'), '# Changelog\n\n- finalize residue\n');
      // ...and the worktree itself carries NO implementation-shaped dirt beforehand.
      const preDirty = gOut816(fx.wtRoot, ['status', '--porcelain'])
        .split('\n').map(s => s.trim()).filter(Boolean)
        .filter(l => !/\skaola-workflow\//.test(l));
      assert(preDirty.length === 0,
        '#816(T4b) precondition: the worktree must carry no non-kaola dirt before finalize, got ' + JSON.stringify(preDirty));

      const r = runFinalize816(fx);
      assert(r.status === 0,
        '#816(T4b): a revert-to-empty branch must NOT refuse implementation_commit_missing (the mirror '
        + 'manufactures the dirt and the net diff hides the commits), got status=' + r.status
        + ' json=' + JSON.stringify(r.json));
      const tx = r.json && r.json.finalize_transaction;
      assert(tx && tx.impl_commit === 'not_applicable',
        '#816(T4b): mirror-authored residue must not read as operator dirt, got ' + JSON.stringify(tx));
      assert(tx && tx.residue_mirrored >= 1,
        '#816(T4b): the receipt must record the mirrored residue, got ' + JSON.stringify(tx));
      assert(tx && tx.finalize_commit === 'committed',
        '#816(T4b): the residue the probe mistook for a missing implementation must land in `chore: finalize`, got '
        + JSON.stringify(tx));
      const changelogCommit = gOut816(fx.wtRoot, ['log', '--format=%s', '-1', '--', 'CHANGELOG.md']);
      assert(changelogCommit === 'chore: finalize ' + fx.project,
        '#816(T4b): CHANGELOG.md must be carried by the finalize commit, got ' + JSON.stringify(changelogCommit));
    } finally { cleanup816(fx); }
  }

  // --- T5: the single-project staging rule is a TYPED refusal inside the transaction -----------
  {
    const fx = mk816('issue-816e');
    try {
      // A FOREIGN project's live folder is pre-staged in the worktree index ALONGSIDE this one.
      const foreign = path.join(fx.wtRoot, 'kaola-workflow', 'issue-999999');
      fs.mkdirSync(foreign, { recursive: true });
      fs.writeFileSync(path.join(foreign, 'workflow-state.md'), 'name: issue-999999\n');
      fs.writeFileSync(path.join(fx.wtProjDir, '.cache', 'own.md'), 'own evidence\n');
      g816(fx.wtRoot, ['add', '--', 'kaola-workflow/issue-999999',
        'kaola-workflow/' + fx.project + '/.cache/own.md']);
      const r = runFinalize816(fx);
      assert(r.status !== 0 && r.json && r.json.reason === 'staging_guard_multi_project',
        '#816(T5): more than one kaola-workflow project staged must refuse staging_guard_multi_project, got status='
        + r.status + ' json=' + JSON.stringify(r.json));
      const log5 = gOut816(fx.wtRoot, ['log', '--format=%s', '-5']);
      assert(!/^chore: (finalize|archive) /m.test(log5),
        '#816(T5): the staging guard must refuse BEFORE any commit, got log:\n' + log5);
    } finally { cleanup816(fx); }
  }

  // --- T6: crash-resume covers all THREE re-entry points ---------------------------------------
  // (a) pre-archive  (b) post-archive / pre-commit  (c) post-commit
  {
    // (a) pre-archive: nothing has happened yet — the whole transaction runs.
    const fxa = mk816('issue-816f');
    try {
      const r = runFinalize816(fxa);
      // #832: main-anchored destination.
      assert(r.status === 0 && fs.existsSync(path.join(fxa.mainRoot, 'kaola-workflow', 'archive', fxa.project)),
        '#816(T6a): pre-archive re-entry runs the whole transaction, got ' + JSON.stringify(r.json));
    } finally { cleanup816(fxa); }

    // (b) post-archive / pre-commit: the archive exists but nothing was committed.
    const fxb = mk816('issue-816g');
    try {
      // Simulate the crash: archive the folder by hand, terminal-stamped, uncommitted.
      const src = fxb.wtProjDir;
      const dest = path.join(fxb.wtRoot, 'kaola-workflow', 'archive', fxb.project);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(src, dest);
      const st = path.join(dest, 'workflow-state.md');
      fs.writeFileSync(st, fs.readFileSync(st, 'utf8').replace('status: active', 'status: closed'));
      const resume = spawnS816(process.execPath,
        [CLAIM816, 'resume', '--project', fxb.project, '--json'],
        { cwd: fxb.wtRoot, encoding: 'utf8', env: Object.assign({}, process.env, GIT_ENV816, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      let rj = null;
      try { rj = JSON.parse(String(resume.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
      assert(rj && rj.reason === 'finalize_incomplete',
        '#816(T6b): a crashed post-archive finalize must resume as finalize_incomplete, got ' + JSON.stringify(rj));
      const r = runFinalize816(fxb);
      assert(r.status === 0,
        '#816(T6b): re-running the one-call transaction must complete the commit step, got ' + r.status
        + ' json=' + JSON.stringify(r.json));
      const logb = gOut816(fxb.wtRoot, ['log', '--format=%s', '-5']);
      assert(/chore: (finalize|archive) /.test(logb),
        '#816(T6b): the resumed transaction must land the commit, got log:\n' + logb);
    } finally { cleanup816(fxb); }

    // (c) post-commit: a second run is a clean no-op (no new commit).
    const fxc = mk816('issue-816h');
    try {
      const first = runFinalize816(fxc);
      assert(first.status === 0, '#816(T6c): first run succeeds, got ' + JSON.stringify(first.json));
      const headAfterFirst = gOut816(fxc.wtRoot, ['rev-parse', 'HEAD']);
      // The typed post-commit re-entry emit: there is nothing left to resume.
      const resumeC = spawnS816(process.execPath,
        [CLAIM816, 'resume', '--project', fxc.project, '--json'],
        { cwd: fxc.wtRoot, encoding: 'utf8', env: Object.assign({}, process.env, GIT_ENV816, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      let rjc = null;
      try { rjc = JSON.parse(String(resumeC.stdout || '').trim().split('\n').filter(Boolean).pop()); } catch (_) {}
      assert(rjc && rjc.reason === 'already_finalized',
        '#816(T6c): post-commit re-entry must report already_finalized, got ' + JSON.stringify(rjc));
      // Re-running the transaction itself is idempotent — and must be so UNASSISTED. The receipt is
      // left EXACTLY as the run left it: still pinned to the pre-archive commit, because the only
      // thing that advanced HEAD past it is the transaction's OWN `chore: archive` / `chore:
      // finalize` bookkeeping. Hand-regenerating the receipt here (as this test used to) would have
      // proved only that a repaired receipt unblocks the gate, never that the re-entry is
      // recoverable without one — which is the property the transaction actually claims.
      // #832: main-anchored destination.
      const archCache = path.join(fxc.mainRoot, 'kaola-workflow', 'archive', fxc.project, '.cache');
      const carried = JSON.parse(fs.readFileSync(path.join(archCache, 'chain-receipt.json'), 'utf8'));
      assert(String(carried.headSha || '').trim() === fxc.headSha
        && String(carried.headSha || '').trim() !== headAfterFirst,
        '#816(T6c) precondition: the carried receipt must still be pinned to the PRE-archive commit '
        + '(no hand-repair) — got ' + JSON.stringify(carried.headSha) + ', head after first run ' + headAfterFirst);
      const second = runFinalize816(fxc);
      assert(second.status === 0,
        '#816(T6c): a settled post-commit re-entry must be a clean no-op with the receipt UNTOUCHED '
        + '— the workflow\'s own bookkeeping commits must never dead-end the resume behind '
        + 'chains_stale, got ' + second.status + ' json=' + JSON.stringify(second.json));
      assert(second.json && second.json.finalize_transaction
        && second.json.finalize_transaction.mirror === 'skipped_post_archive',
        '#816(T6c): the mirror must not resurrect an archived live folder, got ' +
        JSON.stringify(second.json && second.json.finalize_transaction));
      assert(second.json && second.json.finalize_transaction
        && second.json.finalize_transaction.finalize_commit === 'nothing_to_commit',
        '#816(T6c): the receipt must say so explicitly, got ' +
        JSON.stringify(second.json && second.json.finalize_transaction));
    } finally { cleanup816(fxc); }

    // (d) crash AFTER the `chore: archive` commit, BEFORE `chore: finalize` — the re-entry that had
    // no unassisted route. `chore: archive` is the transaction's OWN bookkeeping commit: it advances
    // HEAD past the chain receipt while touching nothing a chain verdict depends on, so refusing the
    // resume as `chains_stale` made the workflow cite a blocker it created itself. Two properties:
    //   1. the resume completes with the receipt UNTOUCHED (no hand-authored receipt);
    //   2. the main-authored Finalization residue still reaches the branch — the post-archive mirror
    //      must skip only the archived PROJECT folder, never the residue the commit gate owes the sink.
    const fxd = mk816('issue-816q');
    try {
      fs.writeFileSync(path.join(fxd.mainRoot, 'CHANGELOG.md'), '# Changelog\n\n- finalize residue\n');
      // Simulate the crash: archive the folder terminal-stamped, and COMMIT it exactly as the
      // transaction's archive step does — then stop, as a crash would.
      const dest = path.join(fxd.wtRoot, 'kaola-workflow', 'archive', fxd.project);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.renameSync(fxd.wtProjDir, dest);
      const stD = path.join(dest, 'workflow-state.md');
      fs.writeFileSync(stD, fs.readFileSync(stD, 'utf8').replace('status: active', 'status: closed'));
      g816(fxd.wtRoot, ['add', '-A']);
      g816(fxd.wtRoot, ['commit', '-m', 'chore: archive ' + fxd.project]);
      const headAfterArchive = gOut816(fxd.wtRoot, ['rev-parse', 'HEAD']);
      assert(headAfterArchive !== fxd.headSha,
        '#816(T6d) precondition: the archive commit must advance HEAD past the receipt');

      const r = runFinalize816(fxd);
      assert(r.status === 0,
        '#816(T6d): a crash-resumed run must complete with the receipt UNTOUCHED — the workflow\'s own '
        + '`chore: archive` commit is a repair obligation it already discharged, never evidence of drift; '
        + 'got status=' + r.status + ' json=' + JSON.stringify(r.json));
      const tx = r.json && r.json.finalize_transaction;
      assert(tx && tx.mirror === 'skipped_post_archive',
        '#816(T6d): the archived project folder must NOT be resurrected, got ' + JSON.stringify(tx));
      assert(tx && tx.residue_mirrored >= 1,
        '#816(T6d): the residue mirror must still run past the archive — skipping it silently dropped '
        + 'the orchestrator\'s CHANGELOG/doc edits from every resumed run; got ' + JSON.stringify(tx));
      assert(tx && tx.finalize_commit === 'committed',
        '#816(T6d): the resumed run must land the `chore: finalize` commit, got ' + JSON.stringify(tx));
      const changelogCommit = gOut816(fxd.wtRoot, ['log', '--format=%s', '-1', '--', 'CHANGELOG.md']);
      assert(changelogCommit === 'chore: finalize ' + fxd.project,
        '#816(T6d): the residue must land in `chore: finalize`, not a second `chore: archive`, got '
        + JSON.stringify(changelogCommit));
      const leftover = gOut816(fxd.wtRoot, ['status', '--porcelain'])
        .split('\n').map(s => s.trim()).filter(Boolean);
      assert(leftover.length === 0,
        '#816(T6d): the sink must receive only committed work after the resume, got ' + JSON.stringify(leftover));
    } finally { cleanup816(fxd); }
  }

  // DELETED: #816 T6e — "a receipt left behind by a REAL code commit must still refuse
  // chains_stale, before any commit". The bookkeeping-advance DISCRIMINATION it protected is intact
  // and still classifies that case `chains_stale`; what is gone is the refusal that followed the
  // classification. Finalize now completes and hands the finding to the orchestrator.

  // --- T7: attestation retirement — the fields/warning are gone, legacy is tolerated ------------
  //
  // DELETED here: `assert(receipt && 'claim_planner_attested' in receipt, 'the planner seam
  // attestation is deliberately KEPT')`. That label was true when the contractor attestation was
  // retired and the PLANNER one survived it; it is not true any more. The mandatory planner agent
  // is gone and inline authoring is the design, so claim.js retired the whole producer chain —
  // checkDispatchAttestations, persistAttestationToSummary, and the receipt field itself. A pin is
  // deleted with its mechanism, not reshaped around its absence.
  //
  // UNCOVERED as a result: that a closure receipt records whether the claim/author seam was
  // DISPATCHED rather than run inline by the main session. Nothing measures that any more, on any
  // surface. It is a retired mechanism, not a hole in this suite.
  //
  // What survives and is still asserted below: the contractor field never reappears, no contractor
  // warning is emitted, and the archived summary never carries the retired field — the negative
  // half, which is what stops a retirement from silently un-retiring.
  {
    const fx = mk816('issue-816i');
    try {
      const r = runFinalize816(fx);
      assert(r.status === 0, '#816(T7): finalize succeeds, got ' + JSON.stringify(r.json));
      const receipt = r.json && r.json.closure_receipt;
      assert(receipt && !('finalize_contractor_attested' in receipt),
        '#816(T7): the closure receipt must no longer carry finalize_contractor_attested, got '
        + JSON.stringify(receipt && Object.keys(receipt)));
      assert(receipt && !('claim_planner_attested' in receipt),
        '#816(T7): the retired planner attestation field must not reappear on the closure receipt, got '
        + JSON.stringify(receipt && Object.keys(receipt)));
      const warnings = (receipt && receipt.warnings) || [];
      assert(!warnings.some(w => /contractor/i.test(String(w))),
        '#816(T7): no contractor ATTESTATION WARNING may be emitted, got ' + JSON.stringify(warnings));
      // #832: main-anchored destination.
      const archivedSummary = fs.readFileSync(
        path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project, 'finalization-summary.md'), 'utf8');
      assert(!/finalize_contractor_attested/.test(archivedSummary),
        '#816(T7): the archived ## Attestation block must not write the retired field, got:\n' + archivedSummary);
    } finally { cleanup816(fx); }
  }

  // --- T7b: a LEGACY archive carrying the retired field is tolerated VERBATIM on read ----------
  {
    const fx = mk816('issue-816j');
    try {
      const legacy = [
        '# Finalization - Summary: ' + fx.project,
        '',
        '## Attestation',
        'claim_planner_attested: attested',
        'finalize_contractor_attested: attested',
        'ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session',
        ''
      ].join('\n');
      fs.writeFileSync(path.join(fx.wtProjDir, 'finalization-summary.md'), legacy);
      const r = runFinalize816(fx);
      assert(r.status === 0, '#816(T7b): a legacy attestation section must never block finalize, got ' + JSON.stringify(r.json));
      // #832: main-anchored destination.
      const after = fs.readFileSync(
        path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project, 'finalization-summary.md'), 'utf8');
      assert(after.indexOf(legacy.trimEnd()) === 0,
        '#816(T7b): a legacy ## Attestation section is tolerated VERBATIM, never rewritten. Got:\n' + after);
    } finally { cleanup816(fx); }
  }

  // --- T8: --attest-contractor-spawn is a retired warn-and-ignore shim (never a refusal) -------
  {
    const fx = mk816('issue-816k');
    try {
      const r = runFinalize816(fx, ['--attest-contractor-spawn']);
      assert(r.status === 0,
        '#816(T8): the retired flag must warn-and-ignore, never refuse, got ' + r.status
        + ' json=' + JSON.stringify(r.json));
      const receipt = r.json && r.json.closure_receipt;
      assert(receipt && !('finalize_contractor_attested' in receipt),
        '#816(T8): the retired flag must back-fill nothing');
      // #832: main-anchored destination.
      const archivedLog = path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project, '.cache', 'dispatch-log.jsonl');
      assert(!fs.existsSync(archivedLog) || !/"agent_type":"contractor"/.test(fs.readFileSync(archivedLog, 'utf8')),
        '#816(T8): no contractor dispatch marker may be back-filled');
    } finally { cleanup816(fx); }
  }

  // --- T9: a REJECTED bookkeeping commit is a typed refusal, never a raw stack trace ------------
  // `git commit` is not a safe assumption: a commit hook can reject the tree and signing can fail.
  // Unwrapped, that throw escaped cmdFinalize as a stack trace with NO finalize_transaction object
  // — falsifying the whole claim that a crash-resumed run is readable from the emit alone, at
  // exactly the moment the operator most needs to know which steps already committed.
  // The hook is NOT bypassed (never --no-verify): a hook is content inspection and must run, so a
  // rejection is a REAL failure that has to surface typed.
  {
    const fx = mk816('issue-816n');
    try {
      fs.writeFileSync(path.join(fx.mainRoot, 'CHANGELOG.md'), '# Changelog\n\n- finalize residue\n');
      // Linked worktrees share the main repo's hooks dir, so this hook governs the worktree's commits.
      const hooksDir = path.join(fx.mainRoot, '.git', 'hooks');
      fs.mkdirSync(hooksDir, { recursive: true });
      const hook = path.join(hooksDir, 'pre-commit');
      fs.writeFileSync(hook, '#!/bin/sh\necho "hook: rejected" >&2\nexit 1\n');
      fs.chmodSync(hook, 0o755);

      const r = runFinalize816(fx);
      assert(r.status !== 0,
        '#816(T9): a rejected bookkeeping commit must exit non-zero, got ' + r.status);
      assert(r.json && r.json.reason === 'finalize_commit_failed',
        '#816(T9): a rejected commit must be a TYPED refusal, not a raw throw, got '
        + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 300));
      assert(r.json && r.json.finalize_transaction
        && typeof r.json.finalize_transaction === 'object',
        '#816(T9): the typed refusal must CARRY the transaction ledger so the re-entry point is '
        + 'readable from the emit alone, got ' + JSON.stringify(r.json));
      assert(r.json && typeof r.json.step === 'string' && r.json.step.length > 0,
        '#816(T9): the refusal must name which commit step was rejected, got ' + JSON.stringify(r.json));
      assert(!/at .*kaola-workflow-claim\.js:\d+/.test(String(r.stderr || '')),
        '#816(T9): no raw stack trace may escape, got stderr=' + String(r.stderr || '').slice(0, 400));
    } finally { cleanup816(fx); }
  }
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
      // The shared envelope vehicle for the claim CLI in this scenario: everything this site itself
      // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
      // domain checks live in the callers.
      // spawn-class: cli-contract
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

// --- #775 (Codex 0.145 re-baseline): --codex-dispatch-mode is a WARN-AND-IGNORE shim -----------------
// v2-task-name is the only dispatch mode (V1/v1-thread-id is retired with no fallback), so the flag
// no longer selects or validates a literal — it resolves to { present: boolean } only. Absent → false
// (byte-identical claim behavior); ANY value (including a stale v1-thread-id, a case-variant, or a
// newline-carrying value) resolves present:true and the caller warns-and-ignores it, never refuses.
assert(resolveCodexDispatchModeFlag({}).present === false,
  '#775: an absent --codex-dispatch-mode flag resolves present:false (no field written)');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v2-task-name' }).present === true,
  '#775: any --codex-dispatch-mode value resolves present:true');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v1-thread-id' }).present === true,
  '#775: a stale v1-thread-id value still resolves present:true (warned-and-ignored, never refused)');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v3-bogus' }).present === true,
  '#775: a non-literal value is no longer rejected — the flag has no vocabulary to validate against');
assert(resolveCodexDispatchModeFlag({ codexDispatchMode: 'v2-task-name\nforged: x' }).present === true,
  '#775: a newline-carrying value is no longer rejected — the flag is never persisted or validated');
assert(resolveCodexDispatchModeFlag({}).invalid === undefined
  && resolveCodexDispatchModeFlag({ codexDispatchMode: 'v3-bogus' }).invalid === undefined,
  '#775: the retired invalid:true shape never appears — there is no unknown-literal refusal anymore');

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
    const unmergedTip = G.exec(wtPath, ['rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_620 }).trim();

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
      G.exec(tmp620, ['rev-parse', '--verify', '--quiet', 'refs/heads/workflow/issue-96201'], { stdio: ['ignore', 'pipe', 'ignore'], env: GIT_ENV_620 });
      branchSurvived = true;
    } catch (_) {}
    try {
      G.exec(tmp620, ['cat-file', '-e', unmergedTip], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV_620 });
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
      G.exec(tmp677a, ['rev-parse', '--verify', '--quiet', 'refs/heads/workflow/issue-' + issueNum677a], { stdio: ['ignore', 'pipe', 'ignore'], env: GIT_ENV_677a });
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
        const list = G.exec(tmp677b, ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
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
    const staleBranchHead = G.exec(tmp631, ['rev-parse', 'HEAD'], { encoding: 'utf8', env: GIT_ENV_631 }).trim();
    g631(tmp631, ['checkout', 'main']);

    // Advance main with the content that ACTUALLY landed (simulating the rebased/published tip).
    fs.writeFileSync(path.join(tmp631, 'published.txt'), 'landed\n');
    g631(tmp631, ['add', 'published.txt']);
    g631(tmp631, ['commit', '-m', 'feat: published']);
    const publishedHead = G.exec(tmp631, ['rev-parse', 'main'], { encoding: 'utf8', env: GIT_ENV_631 }).trim();
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
    G.exec(tmpDir, ['init', '-b', 'main'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.email', 't@t'], { stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.name', 'T'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    G.exec(tmpDir, ['add', 'README.md'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['commit', '-m', 'init'], { env: gitEnv, stdio: 'ignore' });

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
    G.exec(tmpDir, ['init', '-b', 'main'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.email', 't@t'], { stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.name', 'T'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    G.exec(tmpDir, ['add', 'README.md'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['commit', '-m', 'init'], { env: gitEnv, stdio: 'ignore' });

    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'issue-909.discarded-x');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'state\n');

    // Off-base checkout → the helper refuses BEFORE staging: tip unchanged, residue on disk.
    G.exec(tmpDir, ['checkout', '-b', 'workflow/other-lane'], { env: gitEnv, stdio: 'ignore' });
    const tipBefore = G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const off = commitDiscardArchive({ archived: true, dest: dest }, 'issue-909', 'main');
    assert(off && off.committed === false,
      '#715 F1: the helper refuses to commit the discard archive on a non-base branch, got ' + JSON.stringify(off));
    assert(off && off.branch === 'workflow/other-lane',
      '#715 F1: the refusal discloses the current (non-receiving) branch, got ' + JSON.stringify(off));
    assert(off && typeof off.detail === 'string' && off.detail.includes('main') && off.detail.includes('workflow/other-lane'),
      '#715 F1: the refusal detail names both the current and the surviving base branch, got ' + JSON.stringify(off));
    assert(G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === tipBefore,
      '#715 F1: a refused commit leaves the non-base branch tip unchanged');
    assert(fs.existsSync(dest),
      '#715 F1: a refused commit leaves the archive on disk as recoverable residue');

    // On-base checkout → the helper commits and discloses the receiving branch.
    G.exec(tmpDir, ['checkout', 'main'], { env: gitEnv, stdio: 'ignore' });
    const on = commitDiscardArchive({ archived: true, dest: dest }, 'issue-909', 'main');
    assert(on && on.committed === true,
      '#715 F1: the helper commits the discard archive on the base branch, got ' + JSON.stringify(on));
    assert(on && on.branch === 'main',
      '#715 F1: the success path discloses the receiving branch, got ' + JSON.stringify(on));
    const atHead = G.exec(tmpDir, ['cat-file', '-t', 'HEAD:kaola-workflow/archive/issue-909.discarded-x'], { encoding: 'utf8' }).trim();
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
    G.exec(tmpDir, ['init', '-b', 'main'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.email', 't@t'], { stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.name', 'T'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    G.exec(tmpDir, ['add', 'README.md'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['commit', '-m', 'init'], { env: gitEnv, stdio: 'ignore' });

    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'issue-910.discarded-x');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'state\n');

    // Honest path FIRST (lock pin — green before AND after the fix): on the base, the commit
    // lands and the post-commit re-resolution + reachability check passes (N5-B green side).
    const on = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'main',
      { discardedBranch: 'workflow/issue-910', defaultBase: 'main' });
    assert(on && on.committed === true && on.branch === 'main',
      '#715 N5-A/N5-B: the honest on-base path still commits and discloses the receiving branch, got ' + JSON.stringify(on));
    assert(G.exec(tmpDir, ['cat-file', '-t', 'main:kaola-workflow/archive/issue-910.discarded-x'], { encoding: 'utf8' }).trim() === 'tree',
      '#715 N5-B: the honest commit is a tree at the base ref');
    const anc = G.git(tmpDir, ['merge-base', '--is-ancestor', 'HEAD', 'main']);
    assert(anc.status === 0,
      '#715 N5-B: the honest archive commit is reachable from the base ref (merge-base --is-ancestor HEAD main)');

    // (a) Detached checkout + base='HEAD' (the sentinel): refused outright, nothing committed.
    G.exec(tmpDir, ['checkout', '--detach', 'HEAD'], { env: gitEnv, stdio: 'ignore' });
    const detachedTip = G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const sentinel = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'HEAD');
    assert(sentinel && sentinel.committed === false,
      '#715 N5-A: the guard must reject the detached-HEAD sentinel as a base outright, got ' + JSON.stringify(sentinel));
    assert(sentinel && sentinel.branch === 'HEAD',
      '#715 N5-A: the sentinel refusal discloses the (non-receiving) detached HEAD, got ' + JSON.stringify(sentinel));
    assert(G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === detachedTip,
      '#715 N5-A: a sentinel-refused commit leaves the detached HEAD tip unchanged');
    assert(fs.existsSync(dest),
      '#715 N5-A: a sentinel-refused commit leaves the archive on disk as recoverable residue');

    // (c-release) Base naming the branch the release discards (call-site-supplied discardedBranch).
    G.exec(tmpDir, ['checkout', '-b', 'workflow/issue-910'], { env: gitEnv, stdio: 'ignore' });
    const featTip = G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const discarded = commitDiscardArchive({ archived: true, dest: dest }, 'issue-910', 'workflow/issue-910',
      { discardedBranch: 'workflow/issue-910' });
    assert(discarded && discarded.committed === false,
      '#715 N5-A: the guard must refuse a base naming the branch being discarded (release posture), got ' + JSON.stringify(discarded));
    assert(discarded && discarded.branch === 'workflow/issue-910' &&
      typeof discarded.detail === 'string' && discarded.detail.includes('workflow/issue-910'),
      '#715 N5-A: the discarded-branch refusal discloses the current branch and names the base, got ' + JSON.stringify(discarded));
    assert(G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === featTip,
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
    assert(G.exec(tmpDir, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === featTip,
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
    G.exec(tmpDir, ['init', '-b', 'main'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.email', 't@t'], { stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.name', 'T'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');
    G.exec(tmpDir, ['add', 'README.md'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['commit', '-m', 'init'], { env: gitEnv, stdio: 'ignore' });
    // Pre-create the race branch at main's tip so the interleave has somewhere to land.
    G.exec(tmpDir, ['branch', 'race', 'main'], { env: gitEnv, stdio: 'ignore' });
    const mainTip = G.exec(tmpDir, ['rev-parse', 'main'], { encoding: 'utf8' }).trim();

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
    assert(G.exec(tmpDir, ['rev-parse', 'main'], { encoding: 'utf8' }).trim() === mainTip,
      '#715 N5-B: the base ref tip is unchanged by the raced commit');
    const onRace = G.exec(tmpDir, ['cat-file', '-t', 'race:kaola-workflow/archive/issue-910.discarded-x'], { encoding: 'utf8' }).trim();
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
    G.exec(tmpDir, ['init', '-b', 'main'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.email', 't@t'], { stdio: 'ignore' });
    G.exec(tmpDir, ['config', 'user.name', 'T'], { stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture\n');

    // The consumer repo TRACKS the active folder (the live-run precondition).
    const src = path.join(tmpDir, 'kaola-workflow', 'proj-x');
    fs.mkdirSync(path.join(src, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(src, 'workflow-state.md'), 'state\n');
    fs.writeFileSync(path.join(src, 'workflow-plan.md'), 'plan\n');
    fs.writeFileSync(path.join(src, '.cache', 'n1.md'), 'evidence\n');
    G.exec(tmpDir, ['add', '-A'], { env: gitEnv, stdio: 'ignore' });
    G.exec(tmpDir, ['commit', '-m', 'init'], { env: gitEnv, stdio: 'ignore' });

    // Unrelated dirt that must survive the pathspec-scoped commit byte-untouched.
    fs.writeFileSync(path.join(tmpDir, 'staged-dirt.txt'), 'staged\n');
    G.exec(tmpDir, ['add', 'staged-dirt.txt'], { env: gitEnv, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'fixture modified\n');

    // The archive move itself (archiveProjectDir's in-place branch): pure filesystem rename.
    const dest = path.join(tmpDir, 'kaola-workflow', 'archive', 'proj-x.discarded-x');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(src, dest);

    const moved = commitDiscardArchive({ archived: true, dest: dest }, 'proj-x', 'main');
    assert(moved && moved.committed === true,
      '#749 R2: the helper commits the complete archive move when the source folder is tracked, got ' + JSON.stringify(moved));
    assert(G.exec(tmpDir, ['cat-file', '-t', 'HEAD:kaola-workflow/archive/proj-x.discarded-x'], { encoding: 'utf8' }).trim() === 'tree',
      '#749 R2: the archive destination is a tree at HEAD after the commit');
    const srcAtHead = G.exec(tmpDir, ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'kaola-workflow/proj-x'], { encoding: 'utf8' }).trim();
    assert(srcAtHead === '',
      '#749 R2: committed:true must imply the tracked SOURCE folder is gone at HEAD, still present: ' + JSON.stringify(srcAtHead));
    const scoped = G.exec(tmpDir, ['status', '--porcelain', '--', 'kaola-workflow'], { encoding: 'utf8' }).trim();
    assert(scoped === '',
      '#749 R2: no kaola-workflow-scoped residue survives the discard-archive commit, got ' + JSON.stringify(scoped));
    // Unrelated dirt untouched: staged-dirt.txt still STAGED (never committed), README still unstaged.
    assert(G.exec(tmpDir, ['diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim() === 'staged-dirt.txt',
      '#749 R2: the pathspec-scoped commit leaves unrelated STAGED dirt staged and uncommitted');
    assert(G.exec(tmpDir, ['diff', '--name-only'], { encoding: 'utf8' }).trim() === 'README.md',
      '#749 R2: the pathspec-scoped commit leaves unrelated UNSTAGED dirt unstaged');
    const headFiles = G.exec(tmpDir, ['show', '--name-only', '--format=', 'HEAD'], { encoding: 'utf8' });
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
// #735 / #755 RE-DERIVED: a user-consented ABANDON must not demand artifacts the project never
// produced, and must complete its cleanup.
//
// Both groups drove that property through the epoch-authority archive gate: a schema-2 claim
// identity, a claim-root base tuple, an epoch lineage, a frozen plan_hash, a `## Node Ledger`, a
// `## Required Agent Compliance` table and a derived `workflow-tasks.json` — every one of them a
// different artifact the gate could DEMAND, and each window a different way of not having it. The
// gate is gone with the epochs, so the windows have nothing left to distinguish.
//
// What survives is the user-facing half, and it re-derives without a single node: a run folder that
// recorded nothing but its own claim still abandons cleanly. The artifact-poor shape is now the
// NORMAL shape rather than an exceptional one, which is why this is a scenario and not a table.
//
// GONE with the gate, and not replaced: the `authority_downgraded` reporting axis, the
// downgradable/non-downgradable split (#755's whole subject), and the
// snapshot_staging_incomplete / state_ledger_authority_invalid classifications.
// ---------------------------------------------------------------------------
{
  const { execFileSync: execFS735, spawnSync: spawnS735 } = require('child_process');
  const gitEnv735 = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  });
  const git735 = (root, args) => execFS735('git', ['-C', root, ...args],
    { encoding: 'utf8', env: gitEnv735, stdio: ['ignore', 'pipe', 'pipe'] }).trim();

  // A claimed project with a REAL linked worktree and a REAL feature branch, so the post-archive
  // cleanup is observable rather than asserted in the abstract. `extra` writes additional run
  // artifacts into the folder; omitting it is the artifact-poor shape under test.
  function fixture735(project, issue, extra) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw735-')));
    git735(root, ['init', '-b', 'main']);
    git735(root, ['config', 'user.name', 'Test']);
    git735(root, ['config', 'user.email', 't@example.com']);
    git735(root, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
    git735(root, ['add', 'product.js']);
    git735(root, ['commit', '-m', 'root']);
    const branch = 'workflow/' + project;
    const worktreePath = path.join(root, '.kw', 'worktrees', project);
    git735(root, ['worktree', 'add', '-b', branch, worktreePath]);
    const projectDir = path.join(root, 'kaola-workflow', project);
    fs.mkdirSync(path.join(projectDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
      'step: start', '', '## Sink',
      'branch: ' + branch, 'issue_number: ' + issue, 'sink: merge', 'main_root: ' + root,
      'session_marker: test-session', 'claim_ts: 2026-07-16T00:00:00.000Z',
      'worktree_path: ' + worktreePath, '',
    ].join('\n'));
    for (const rel of Object.keys(extra || {})) {
      fs.writeFileSync(path.join(projectDir, rel), extra[rel]);
    }
    return { root, project, projectDir, branch, worktreePath };
  }

  // The shared envelope vehicle for the claim release CLI: this site asserts the exit code and the
  // last parseable JSON line; the domain checks live in the callers.
  // spawn-class: cli-contract
  function runRelease735(fx) {
    const r = spawnS735('node', [path.join(__dirname, 'kaola-workflow-claim.js'), 'release',
      '--project', fx.project, '--json'], {
      cwd: fx.root, encoding: 'utf8',
      env: Object.assign({}, gitEnv735, { KAOLA_WORKFLOW_OFFLINE: '1' }),
    });
    let json = null;
    try { json = JSON.parse((r.stdout || '').trim()); } catch (_) {}
    return { status: r.status, json, raw: (r.stdout || '') + (r.stderr || '') };
  }

  // Each window is a different amount of recorded run state, and every one of them must abandon
  // identically. The artifact-rich window is the negative control: if the abandon were somehow
  // keyed on what the folder recorded, the two would not agree.
  const abandonWindows = [
    ['recorded nothing but its own claim', null],
    ['recorded a finalization summary and some cache evidence',
      { 'finalization-summary.md': '# Finalization\n', '.cache/notes.md': 'scratch\n' }],
  ];
  for (const win of abandonWindows) {
    const label = win[0];
    const fx = fixture735('issue-735', 735, win[1]);
    try {
      const r = runRelease735(fx);
      assert(r.status === 0 && r.json && r.json.released === true,
        '#735: a user-consented abandon succeeds whatever the run recorded (' + label + '), got ' + r.raw.trim());
      assert(!fs.existsSync(fx.projectDir) && r.json && r.json.dest && fs.existsSync(r.json.dest),
        '#735: the live folder is retired INTO an archive, never merely deleted (' + label + '), got dest=' + (r.json && r.json.dest));
      assert(r.json && r.json.dest && fs.existsSync(path.join(r.json.dest, 'workflow-state.md')),
        '#735: the archived copy carries the run state (' + label + ')');
      assert(!fs.existsSync(fx.worktreePath),
        '#735: the linked worktree is removed (' + label + ')');
      assert(git735(fx.root, ['branch', '--list', fx.branch]) === '',
        '#735: the feature branch is deleted (' + label + ')');
      assert(r.json && r.json.claim_label_removed === 'skipped_offline',
        '#735: the claim-label step is REACHED and reports its offline skip — the abandon runs the '
        + 'whole cleanup rather than stopping early (' + label + '), got ' + JSON.stringify(r.json && r.json.claim_label_removed));
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

// --- #837: the finalize refusal LADDER is subtracted -------------------------------------------
// cmdFinalize's preconditions surfaced as a SERIAL ladder: each refusal was observable only after
// the previous one was cleared, so an operator paid one full finalize round-trip per unmet
// precondition and learned exactly one new fact each time. Two subtractions, one generator:
//
//   (1) ONE PRECONDITION REPORT. `finalize --project P --check` evaluates EVERY precondition in a
//       single READ-ONLY pass and reports all of them together, reusing cmdVerifySink's
//       `{ project, ok, checks, reasons }` emit shape. N unmet preconditions ⇒ N reasons in ONE
//       invocation. The check pass MUST NOT reuse the mutating Step-8a mirror.
//
//   (2) SCRIPT-OWNED MIRROR SYNC. The worktree→main project-folder sync is a STEP INSIDE the
//       transaction, not an operator `rsync -a`. A main copy carrying a staler ledger is repaired
//       by the script and finalize proceeds. `finalize_mirror_refused` is RETAINED (all four
//       contract validators pin its literal) but RE-TYPED: `inner_reason: mirror_sync_failed`,
//       reachable only when the script's own sync cannot be performed — fail-closed, zero-write.
//
// Out of scope by owner decision D4 and deliberately NOT covered here: the "ordering paradox"
// (refuted — the validation gate addresses the committed+working landable tree, so it is invariant
// across stage→commit, and `validated_at_head` has no parser), consent classes (split out), and the
// compliance rung (that state is deleted elsewhere; it is not a cmdFinalize rung in the first place).
//
// Fixture is the #816 shape — a REAL `git worktree add` linked worktree — because both subtractions
// are about the main-checkout ↔ linked-worktree seam and neither is observable without it.
{
  const { execFileSync: execFS837, spawnSync: spawnS837 } = require('child_process');
  const CLAIM837 = path.join(__dirname, 'kaola-workflow-claim.js');
  const REPO837 = path.resolve(__dirname, '..');

  const GIT_ENV837 = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  };
  const g837 = (cwd, args) => {
    try {
      execFS837('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV837 });
      return true;
    } catch (_) { return false; }
  };
  const gOut837 = (cwd, args) => {
    const r = spawnS837('git', ['-C', cwd, ...args], { encoding: 'utf8', env: GIT_ENV837 });
    return String(r.stdout || '').trim();
  };
  const read837 = rel => { try { return fs.readFileSync(path.join(REPO837, rel), 'utf8'); } catch (_) { return ''; } };

  // Build a self-host repo whose feature branch lives in a REAL linked worktree, finalize-ready.
  function mk837(project) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-837-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });

    g837(mainRoot, ['init', '-b', 'main']);
    g837(mainRoot, ['config', 'user.email', 't@t.com']);
    g837(mainRoot, ['config', 'user.name', 'Test']);
    g837(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'package.json'), JSON.stringify({
      scripts: {
        'test:kaola-workflow:claude': 'true',
        'test:kaola-workflow:codex': 'true',
        'test:kaola-workflow:gitlab': 'true',
        'test:kaola-workflow:gitea': 'true'
      }
    }) + '\n');
    g837(mainRoot, ['add', 'package.json']);
    g837(mainRoot, ['commit', '-m', 'chore: self-host package.json']);
    g837(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);

    // A run folder with NO plan — same shape as mk816's. `--check` and the transaction read the
    // state file's `## Sink` block, the git tree and the chain receipt; none of them opens a plan.
    const wtProjDir = path.join(wtRoot, 'kaola-workflow', project);
    const wtCacheDir = path.join(wtProjDir, '.cache');
    fs.mkdirSync(wtCacheDir, { recursive: true });
    const stateText = [
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
      'base_branch: main',
      'issue_number: 837',
      'sink: merge',
      'run_posture: worktree',
      'worktree_path: ' + wtRoot,
      'main_root: ' + mainRoot,
      'session_marker: fixture-837',
      'claim_ts: 2026-01-01T00:00:00Z',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(wtProjDir, 'workflow-state.md'), stateText);

    fs.writeFileSync(path.join(wtRoot, 'impl.txt'), 'implementation\n');
    g837(wtRoot, ['add', '-A']);
    g837(wtRoot, ['commit', '-m', 'feat: impl for ' + project]);
    const headSha = gOut837(wtRoot, ['rev-parse', 'HEAD']);

    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(mainProjDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), stateText);

    fs.writeFileSync(path.join(wtCacheDir, 'chain-receipt.json'), JSON.stringify({
      headSha,
      chains: [
        { name: 'claude', exitCode: 0, accepted_red: false },
        { name: 'codex', exitCode: 0, accepted_red: false },
        { name: 'gitlab', exitCode: 0, accepted_red: false },
        { name: 'gitea', exitCode: 0, accepted_red: false }
      ]
    }) + '\n');

    return { base, mainRoot, wtRoot, project, headSha, wtCacheDir, mainProjDir, wtProjDir };
  }

  function runFinalize837(fx, extraArgs) {
    const e = Object.assign({}, process.env, GIT_ENV837, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    });
    // A fresh finalize process re-derives its whole verdict from durable state alone — the state
    // file, the receipts on disk and the git tree. That reconstruction from bytes is the property;
    // in one heap an already-parsed in-memory answer would stand in for the files.
    // spawn-class: durable-handoff
    const r = spawnS837(process.execPath,
      [CLAIM837, 'finalize', '--project', fx.project, '--keep-worktree', ...(extraArgs || [])],
      { cwd: fx.wtRoot, encoding: 'utf8', timeout: 60000, env: e });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  }
  // The ONE-PASS precondition report.
  const runCheck837 = fx => runFinalize837(fx, ['--check', '--json']);
  const cleanup837 = fx => { try { fs.rmSync(fx.base, { recursive: true, force: true }); } catch (_) {} };
  const REQUIRED_CHECK_KEYS_837 = [
    'mirror', 'workflow_state', 'implementation_commit', 'staging_guard', 'validation', 'dirty_paths'
  ];

  // --- P1: `--check` is a REGISTERED flag and a READ-ONLY full report on a finalize-ready run ----
  // `--check` must be registered in parseArgs; an unregistered long flag is turned into a typed
  // `unknown_flag` refusal by main() before any subcommand body runs, so the flag cannot exist at
  // all until it is registered. The report reuses cmdVerifySink's { project, ok, checks, reasons }.
  {
    const fx = mk837('issue-837a');
    try {
      // Main-only Finalization artifact + main-only residue: the mutating Step-8a mirror would copy
      // BOTH into the worktree. A check pass must copy neither.
      fs.writeFileSync(path.join(fx.mainProjDir, 'finalization-summary.md'), '# Finalization\n');
      fs.writeFileSync(path.join(fx.mainRoot, 'CHANGELOG.md'), '# Changelog\n\n- finalize residue\n');
      const beforeHead = gOut837(fx.wtRoot, ['rev-parse', 'HEAD']);
      const beforeStatus = gOut837(fx.wtRoot, ['status', '--porcelain']);

      const r = runCheck837(fx);
      assert(!(r.json && r.json.reason === 'unknown_flag'),
        '#837(P1): `finalize --check` must be a REGISTERED flag, not an unknown_flag refusal, got '
        + JSON.stringify(r.json));
      assert(r.status === 0 && r.json && r.json.ok === true,
        '#837(P1): a finalize-ready run must report ok:true and exit 0, got status=' + r.status
        + ' json=' + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 400));
      assert(r.json && r.json.project === fx.project,
        '#837(P1): the report must name the project (cmdVerifySink emit shape), got ' + JSON.stringify(r.json));
      assert(r.json && Array.isArray(r.json.reasons) && r.json.reasons.length === 0,
        '#837(P1): a finalize-ready run must report ZERO unmet preconditions, got '
        + JSON.stringify(r.json && r.json.reasons));
      const missingKeys = REQUIRED_CHECK_KEYS_837.filter(k => !(r.json && r.json.checks && k in r.json.checks));
      assert(missingKeys.length === 0,
        '#837(P1): the report must carry every precondition key even when all pass, missing '
        + JSON.stringify(missingKeys) + ' from ' + JSON.stringify(r.json && r.json.checks));

      // ZERO WRITE — the check pass must not run the mutating mirror, archive, or commit.
      assert(!fs.existsSync(path.join(fx.wtProjDir, 'finalization-summary.md')),
        '#837(P1): --check must NOT run the Step-8a artifact mirror (main-only artifact appeared in the worktree)');
      assert(!fs.existsSync(path.join(fx.wtRoot, 'CHANGELOG.md')),
        '#837(P1): --check must NOT mirror main residue into the worktree');
      assert(!fs.existsSync(path.join(fx.wtRoot, 'kaola-workflow', 'archive', fx.project)),
        '#837(P1): --check must NOT archive');
      assert(fs.existsSync(path.join(fx.wtProjDir, 'workflow-state.md')),
        '#837(P1): --check must leave the live project folder in place');
      assert(gOut837(fx.wtRoot, ['rev-parse', 'HEAD']) === beforeHead,
        '#837(P1): --check must author no commit');
      assert(gOut837(fx.wtRoot, ['status', '--porcelain']) === beforeStatus,
        '#837(P1): --check must leave the working tree byte-unchanged, got:\n'
        + gOut837(fx.wtRoot, ['status', '--porcelain']));
    } finally { cleanup837(fx); }
  }

  // --- P2: N unmet preconditions are reported in ONE invocation (the ladder becomes a checklist) -
  // Three simultaneous faults that the SERIAL ladder can only surface one at a time:
  //   (a) implementation commit missing   (b) two projects staged   (c) no chain receipt
  {
    const fx = mk837('issue-837b');
    try {
      // (a) rewind the branch so no implementation commit exists and impl.txt is uncommitted
      g837(fx.wtRoot, ['reset', '--soft', 'main']);
      g837(fx.wtRoot, ['reset']);
      // (b) a FOREIGN project's live folder staged alongside this one
      const foreign = path.join(fx.wtRoot, 'kaola-workflow', 'issue-999999');
      fs.mkdirSync(foreign, { recursive: true });
      fs.writeFileSync(path.join(foreign, 'workflow-state.md'), 'name: issue-999999\n');
      fs.writeFileSync(path.join(fx.wtProjDir, '.cache', 'own.md'), 'own evidence\n');
      g837(fx.wtRoot, ['add', '--', 'kaola-workflow/issue-999999',
        'kaola-workflow/' + fx.project + '/.cache/own.md']);
      // (c) the validation gate has nothing to read
      fs.unlinkSync(path.join(fx.wtCacheDir, 'chain-receipt.json'));
      // Main-side residue, so the read-only property is re-checked on the multi-fault path too.
      fs.writeFileSync(path.join(fx.mainRoot, 'CHANGELOG.md'), '# Changelog\n\n- finalize residue\n');

      const r = runCheck837(fx);
      const reasons = (r.json && r.json.reasons) || [];
      assert(r.status !== 0 && r.json && r.json.ok === false,
        '#837(P2): unmet preconditions must report ok:false and exit non-zero, got status=' + r.status
        + ' json=' + JSON.stringify(r.json) + ' stderr=' + String(r.stderr || '').slice(0, 400));
      assert(reasons.includes('implementation_commit_missing'),
        '#837(P2): rung 1 must be reported, got ' + JSON.stringify(reasons));
      assert(reasons.includes('staging_guard_multi_project'),
        '#837(P2): rung 2 must be reported IN THE SAME pass, got ' + JSON.stringify(reasons));
      // DELETED: the two assertions that put the validation rung in `reasons` and required
      // `reasons.length >= 3`. Validation stopped being a PRECONDITION when it stopped being a
      // verdict — it is reported in `checks.validation` for a reader to act on, and a non-green
      // classification no longer makes `ok` false. Leaving it in `reasons` would have kept
      // `--check` as the door the conversion removed, one surface over.
      assert(reasons.length >= 2,
        '#837(P2): ALL N unmet preconditions come back from ONE invocation, got ' + JSON.stringify(reasons));
      const checks = (r.json && r.json.checks) || {};
      assert(checks.implementation_commit === 'missing',
        '#837(P2): checks.implementation_commit must carry the probe state, got ' + JSON.stringify(checks));
      assert(checks.staging_guard === 'staging_guard_multi_project',
        '#837(P2): checks.staging_guard must carry the guard reason, got ' + JSON.stringify(checks));
      assert(checks.validation === 'chains_unverified',
        '#837(P2): checks.validation must carry the validation classification, got ' + JSON.stringify(checks));
      assert(Array.isArray(checks.dirty_paths) && checks.dirty_paths.includes('impl.txt'),
        '#837(P2): checks.dirty_paths must name the uncommitted implementation paths, got '
        + JSON.stringify(checks.dirty_paths));
      assert(Array.isArray(checks.dirty_paths) && !checks.dirty_paths.includes('CHANGELOG.md'),
        '#837(P2): --check must not manufacture its own dirt (main residue was mirrored), got '
        + JSON.stringify(checks.dirty_paths));
      assert(!fs.existsSync(path.join(fx.wtRoot, 'CHANGELOG.md')),
        '#837(P2): --check must stay read-only even when preconditions fail');
      assert(!fs.existsSync(path.join(fx.wtRoot, 'kaola-workflow', 'archive', fx.project)),
        '#837(P2): a failing --check must archive nothing');

      // CONTROL — subtracting the ladder must not loosen the fail-closed anchor underneath it. A
      // PLAIN finalize (no --check) still REFUSES on the same faults, still keys its top-level
      // reason to the first unmet rung, and still makes zero irreversible side effect. `--check` is
      // an added pre-flight surface, never a replacement for the transaction's own gates.
      // (A refusal emit that ALSO carries the full checks object is a superset and stays legal.)
      const ladder = runFinalize837(fx);
      assert(ladder.status !== 0 && ladder.json && ladder.json.reason === 'implementation_commit_missing',
        '#837(P2 control): the plain ladder still refuses at the first rung, got ' + JSON.stringify(ladder.json));
      assert(!fs.existsSync(path.join(fx.wtRoot, 'kaola-workflow', 'archive', fx.project))
        && fs.existsSync(path.join(fx.wtProjDir, 'workflow-state.md')),
        '#837(P2 control): the refusing transaction must still archive nothing');
      assert(!/^chore: (finalize|archive) /m.test(gOut837(fx.wtRoot, ['log', '--format=%s', '-5'])),
        '#837(P2 control): the refusing transaction must still author no bookkeeping commit');
    } finally { cleanup837(fx); }
  }

  // DELETED: #837 P3, P4 and P5 — the three mirror-sync scenarios, which staled a plan file's
  // `## Node Ledger` rows that no longer exist. Their PROPERTIES did not die with them: #877
  // re-pointed compareLedgers at the mission list's `status: done` items, and the restored
  // #816(T2) block above pins all three again over mission-list fixtures — the sync-required
  // classification and its read-only guarantee (T2a), the mirror_sync_failed fail-closed anchor
  // (T2b), and the fail-open first sync (T2c). scripts/test-ledger-compare.js pins the counting.
  // P1/P2 above pin the one-pass `--check` report on a run with nothing to sync; P6-P9 below pin
  // the usage surface and the four contract-validator literals.

  // --- P6: `--check` is documented on the usage surface -----------------------------------------
  {
    // A usage-string contract: `--help` must exit 0 and its stdout must document the flag. The usage
    // text is only observable as a real process's stdout.
    // spawn-class: cli-contract
    const h = spawnS837(process.execPath, [CLAIM837, '--help'],
      { encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert(h.status === 0 && /--check/.test(String(h.stdout || '')),
      '#837(P6): the USAGE string must document finalize --check, got:\n' + String(h.stdout || '').slice(0, 600));
  }

  // --- P7: the contract-validator pins must NOT rot ---------------------------------------------
  // All four validate-*-contracts.js assert the LITERAL `reason: 'finalize_mirror_refused',` and
  // `reason: 'implementation_commit_missing',` inside the claim script of their OWN tree. The
  // subtraction deliberately RETAINS both tokens (the mirror refusal is re-typed, not removed), so
  // the pins stay valid with zero validator edits — and these asserts fail loudly if a future edit
  // deletes either side of that agreement.
  {
    const CLAIM_TREES_837 = [
      'scripts/kaola-workflow-claim.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    ];
    const VALIDATORS_837 = [
      'scripts/validate-workflow-contracts.js',
      'plugins/kaola-workflow/scripts/validate-workflow-contracts.js',
      'plugins/kaola-workflow-gitlab/scripts/validate-kaola-workflow-gitlab-contracts.js',
      'plugins/kaola-workflow-gitea/scripts/validate-kaola-workflow-gitea-contracts.js',
    ];
    for (const rel of CLAIM_TREES_837) {
      const src = read837(rel);
      assert(src.includes("reason: 'finalize_mirror_refused',"),
        '#837(P7): ' + rel + ' must RETAIN the pinned finalize_mirror_refused literal (re-typed, not removed)');
      assert(src.includes("reason: 'implementation_commit_missing',"),
        '#837(P7): ' + rel + ' must retain the pinned implementation_commit_missing literal');
    }
    for (const rel of VALIDATORS_837) {
      const src = read837(rel);
      assert(src.includes("reason: 'finalize_mirror_refused',"),
        '#837(P7): ' + rel + ' must keep pinning finalize_mirror_refused — the needle must not be dropped');
      assert(src.includes("reason: 'implementation_commit_missing',"),
        '#837(P7): ' + rel + ' must keep pinning implementation_commit_missing');
    }
  }

  // --- P8: cross-edition parity — claim.js is a DIVERGENT HAND-PORT per forge -------------------
  // `npm run sync:editions` byte-copies only the codex twin; the gitlab/gitea claim ports are hand-
  // ported. Both subtractions must land in all four trees or the forge chains ship the old ladder.
  {
    const CLAIM_TREES_837 = [
      'scripts/kaola-workflow-claim.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    ];
    for (const rel of CLAIM_TREES_837) {
      const src = read837(rel);
      assert(src.includes('mirror_sync_failed'),
        '#837(P8): ' + rel + ' must carry the re-typed mirror_sync_failed inner reason');
      assert(src.includes('--check'),
        '#837(P8): ' + rel + ' must register + document the one-pass --check precondition report');
    }
  }

  // --- P9: the operator-rsync instruction leaves the generated finalize prose --------------------
  // The six finalize surfaces are BYTE-GENERATED from templates/routing/finalize.skeleton.md, so
  // the skeleton is the only authoring surface. Its "sync worktree→main FIRST" recovery instruction
  // describes an obligation the script now owns; leaving it in ships a manual step that no longer
  // exists, and the `--check` report has to be reachable from the prose to be used at all.
  {
    const skeleton = read837('templates/routing/finalize.skeleton.md');
    assert(skeleton.length > 0, '#837(P9): the finalize routing skeleton must be readable');
    assert(!/sync worktree→main first/i.test(skeleton),
      '#837(P9): the operator "sync worktree→main FIRST" instruction must be gone — the transaction '
      + 'owns that sync now');
    assert(!/on a refusal, sync worktree→main/i.test(skeleton),
      '#837(P9): the refusal-recovery rsync instruction must be gone from the finalize prose');
    // `--check` alone is NOT a valid needle — the skeleton's run-gap scanner section already uses
    // that token for an unrelated call. What must be true is that the flag appears in a FINALIZE
    // invocation the operator can copy, which is a property of the block, not of one byte sequence
    // (the invocation is line-continued, so `finalize --check` is never contiguous in the file).
    const finalizeCheckBlock = (skeleton.match(/```bash\n[\s\S]*?```/g) || [])
      .some(b => /\bfinalize\b/.test(b) && /--check\b/.test(b) && /--project/.test(b));
    assert(finalizeCheckBlock,
      '#837(P9): the finalize prose must surface the one-pass precondition report as a copyable '
      + 'finalize invocation carrying --check');
    assert(/precondition/i.test(skeleton),
      '#837(P9): the prose must describe the report as a PRECONDITION checklist, not a ladder rung');
    // The RECOVERY ROUTE, not the code spelling. This used to pin the literals
    // `finalize_mirror_refused` / `mirror_sync_failed`; an assertion naming a refusal code is a vote
    // against ever removing it, and those two are still live in claim.js only because the mirror
    // branch has not been re-derived yet. What the operator actually needs from the prose is what to
    // DO when the script cannot perform the sync it owns — that survives whatever the code is called.
    assert(/sync fails[\s\S]{0,120}not writable/i.test(skeleton),
      '#837(P9): the prose must give the recovery route for a sync the script cannot perform — '
      + 'the one branch of the mirror step the operator has to act on');
}}

// ---------------------------------------------------------------------------
// The typed selection record at claim, and the pre-claim `.origin/<target-key>/` staging fold.
//
// Selection is the ORCHESTRATOR'S, so `startup` takes two flags:
//
//   --target-source <user_directed|orchestrator_selected>   (default: user_directed)
//   --selection-record <path>                                (JSON, orchestrator-authored)
//
// and NEITHER can refuse. Claiming is bookkeeping: a claim that should not stand is one the agent
// re-states and re-makes elsewhere, so a commitment point that would not proceed is a stop nobody
// can act on. What the caller supplied is REPORTED and the claim goes through:
//   * flag absent, path unreadable, or bytes that will not parse as a JSON object
//       -> the canonical self-describing record is written in its place, a `selection_record_note`
//          names what was found, and the claim ACQUIRES at exit 0.
//   * a record that parses -> persisted BYTE-FOR-BYTE as authored, never graded. Its fields carry
//          the orchestrator's reasoning, and a script that graded reasoning would be re-deciding
//          the thing the agent already decided.
//
// On EVERY acquiring claim the record becomes durable state: persisted at
// kaola-workflow/<project>/.cache/origin/selection-record.json with its sha256 stamped into
// workflow-state.md as `selection_record_digest:`. An EXPLICIT-target claim supplies no record —
// startup writes the canonical one itself (`selection_mode: explicit-target`), so the field is
// never optional and never empty.
//
// B1: pre-claim reconnaissance has no durable home (the project folder does not exist yet), so it
// stages under kaola-workflow/.origin/<target-key>/ and the claim FOLDS it into
// kaola-workflow/<project>/.cache/origin/ and REMOVES the staging dir. <target-key> is the project
// name the claim resolves to (issue-<N> / bundle-<a>-<b>). Absent staging is a clean no-op.
// ---------------------------------------------------------------------------
{
  const { spawnSync: spawnS825 } = require('child_process');
  const crypto825 = require('crypto');
  const CLAIM825 = path.join(__dirname, 'kaola-workflow-claim.js');

  const REQUIRED_RECORD_FIELDS_825 = [
    'selection_mode', 'selection_bundle', 'selection_priority_basis',
    'selection_rejected', 'selection_disjointness', 'clarifications',
  ];

  function goodRecord825(mode) {
    return {
      selection_mode: mode || 'no-target-survey',
      selection_bundle: 'issue-825',
      selection_priority_basis: 'roadmap ## Active Work frontier row 1 (Next Step: implement)',
      selection_rejected: '#826 — lower frontier rank; #832 — co-tenant lane live',
      selection_disjointness: 'single issue; no write-set overlap with the live lane',
      clarifications: 'none',
    };
  }

  // Minimal git repo + a green mock classifier, mirroring the #770/#538 fixture above.
  const repo825 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-825-repo-')));
  const g825 = (a) => { try { spawnS825('git', ['-C', repo825, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} };
  g825(['init']); g825(['config', 'user.email', 't@t']); g825(['config', 'user.name', 't']); g825(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repo825, '.gitignore'), '.kw/\n'); g825(['add', '-A']); g825(['commit', '-m', 'init']);

  const mocks825 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-825-mocks-')));
  const mockGreen825 = path.join(mocks825, 'mock-green.js');
  fs.writeFileSync(mockGreen825,
    'process.stdout.write(JSON.stringify({ verdict: "green", reasoning: "ok" }) + "\\n");\n' +
    'process.exit(0);\n'
  );

  // `preload` (a --require path) is how #862 injects a REAL filesystem failure into the shipped
  // claim, rather than stubbing the writer. The whole defect there is that a swallowed failure is
  // indistinguishable from success, so a fixture supplying its own failure signal would reproduce
  // the bug instead of catching it.
  function runClaim825(argv, extraEnv, preload) {
    const e = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_BACKOFF_MS: '0',
      KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen825,
    }, extraEnv || {});
    delete e.KAOLA_PATH;
    // The shared envelope vehicle for the claim CLI in this scenario: everything this site itself
    // asserts is the envelope — the exit code, and the last parseable JSON line on the stream. The
    // domain checks live in the callers.
    // spawn-class: cli-contract
    const res = spawnS825('node', (preload ? ['--require', preload] : []).concat([CLAIM825], argv), { cwd: repo825, encoding: 'utf8', env: e });
    const stdout = String(res.stdout || '');
    const stderr = String(res.stderr || '');
    let json = null;
    const lines = stdout.trim().split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) { try { json = JSON.parse(lines[i]); break; } catch (_) {} }
    return { code: res.status == null ? 1 : res.status, json, stderr, raw: stdout + stderr };
  }

  function projDir825(issueN) { return path.join(repo825, 'kaola-workflow', 'issue-' + issueN); }
  function stateOf825(issueN) {
    const p = path.join(projDir825(issueN), 'workflow-state.md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }
  function recordPath825(issueN) {
    return path.join(projDir825(issueN), '.cache', 'origin', 'selection-record.json');
  }
  function cleanup825(issueN) {
    try { fs.rmSync(projDir825(issueN), { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(path.join(repo825, 'kaola-workflow', '.origin'), { recursive: true, force: true }); } catch (_) {}
    try { G.git(repo825, ['checkout', '-f', 'master'], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    try { G.git(repo825, ['checkout', '-f', 'main'], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    for (const b of String(G.git(repo825, ['branch', '--list', '*' + issueN + '*'], { encoding: 'utf8' }).stdout || '')
      .split('\n').map(s => s.replace(/^[*+ ]+/, '').trim()).filter(Boolean)) {
      try { G.git(repo825, ['worktree', 'remove', '--force', path.join(repo825, '..', b)], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
      try { G.git(repo825, ['branch', '-D', b], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
    }
    try { G.git(repo825, ['worktree', 'prune'], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {}
  }
  // A claim that had no usable record still CLAIMS, and the canonical record it wrote in place of
  // the missing one is what the digest covers. `note` and `mode` are FREE of whatever selected this
  // case, so a body that reported the wrong thing cannot pass by tautology.
  function assertCanonicalRecordClaim825(issueN, label, r, noteNeedle) {
    assert(r.code === 0, label + ': the claim must ANSWER at exit 0, got ' + r.code + ' raw=' + r.raw.trim());
    assert(r.json && r.json.status === 'acquired',
      label + ': the claim must acquire, got ' + JSON.stringify(r.json && r.json.status) + ' raw=' + r.raw.trim());
    assert(fs.existsSync(projDir825(issueN)),
      label + ': an acquiring claim must create its project folder, missing ' + projDir825(issueN));
    const persisted = recordPath825(issueN);
    assert(fs.existsSync(persisted), label + ': the canonical record must be persisted at ' + persisted);
    const bytes = fs.existsSync(persisted) ? fs.readFileSync(persisted, 'utf8') : '';
    let parsed = null; try { parsed = JSON.parse(bytes); } catch (_) {}
    assert(parsed && parsed.selection_mode === 'none-recorded',
      label + ': the synthesized record must SAY it recorded nothing, got '
        + JSON.stringify(parsed && parsed.selection_mode));
    assert(parsed && String(parsed.selection_priority_basis || '').indexOf('none recorded') === 0,
      label + ': every field of the synthesized record must be self-describing, got '
        + JSON.stringify(parsed && parsed.selection_priority_basis));
    const state = stateOf825(issueN);
    const m = state.match(/^selection_record_digest:\s*(\S+)\s*$/m);
    assert(m && m[1].toLowerCase() === crypto825.createHash('sha256').update(bytes).digest('hex'),
      label + ': the stamped digest must cover the canonical bytes actually written, got '
        + JSON.stringify(m && m[1]));
    assert(r.json && typeof r.json.selection_record_note === 'string'
      && r.json.selection_record_note.indexOf(noteNeedle) >= 0,
      label + ': the envelope must REPORT what it found, expected a note naming '
        + JSON.stringify(noteNeedle) + ' got ' + JSON.stringify(r.json && r.json.selection_record_note));
  }

  try {
    // --- (a) an orchestrator-selected claim with NO --selection-record still CLAIMS, on the
    // canonical record, and says so on the envelope.
    {
      cleanup825(82501);
      const r = runClaim825(['startup', '--target-issue', '82501', '--target-source', 'orchestrator_selected']);
      assertCanonicalRecordClaim825(82501, '#825(a)', r, '--target-source orchestrator_selected');
      cleanup825(82501);
    }

    // --- (b) a --selection-record path that does not exist: same, and the note NAMES the path
    // that would not read (a note that only said "something was wrong" would not survive this).
    {
      cleanup825(82502);
      const missingPath = path.join(mocks825, 'does-not-exist.json');
      const r = runClaim825(['startup', '--target-issue', '82502', '--target-source', 'orchestrator_selected',
        '--selection-record', missingPath]);
      assertCanonicalRecordClaim825(82502, '#825(b)', r, missingPath);
      cleanup825(82502);
    }

    // --- (c) A RECORD THAT PARSES IS NEVER GRADED. Blank and absent fields alike ride through
    // BYTE-FOR-BYTE: the fields carry the orchestrator's reasoning, and a script that graded
    // reasoning would be re-deciding what the agent already decided. Pinned on the persisted BYTES
    // (free of any predicate that could have selected this case) and on the claim going through.
    {
      cleanup825(82510);
      const rec = goodRecord825();
      rec.selection_rejected = '   ';        // whitespace-only
      delete rec.selection_disjointness;      // absent outright
      const recPath = path.join(mocks825, 'rec-thin.json');
      // Deliberately NON-canonical bytes: 4-space indent, a trailing blank line, and a key the
      // record schema never named. Canonical re-serialization would silently produce different
      // bytes here, which is the whole point — a fixture written with `JSON.stringify(rec, null, 2)`
      // is byte-identical to its own round-trip and could not tell byte-through from re-encoding.
      const bytes = JSON.stringify(rec, null, 4) + '\n\n';
      fs.writeFileSync(recPath, bytes);
      const r = runClaim825(['startup', '--target-issue', '82510', '--target-source', 'orchestrator_selected',
        '--selection-record', recPath]);
      assert(r.code === 0 && r.json && r.json.status === 'acquired',
        '#825(c): a thin-but-parseable record must still claim, got code=' + r.code + ' '
          + JSON.stringify(r.json && r.json.status) + ' raw=' + r.raw.trim());
      const persistedBytes = fs.readFileSync(recordPath825(82510), 'utf8');
      assert(persistedBytes === bytes,
        '#825(c): the authored bytes must persist UNCHANGED — no normalization, no re-serialization; got '
          + JSON.stringify(persistedBytes));
      assert(r.json && r.json.selection_record_note === undefined,
        '#825(c): a record that parsed is not a finding, so no note rides on the envelope, got '
          + JSON.stringify(r.json && r.json.selection_record_note));
      cleanup825(82510);
    }

    // --- (e) bytes that will not parse: the one property still checked, because a record a later
    // reader cannot parse is not a record. Answers, on the canonical record.
    {
      cleanup825(82530);
      const recPath = path.join(mocks825, 'rec-garbage.json');
      fs.writeFileSync(recPath, 'not json at all\n');
      const r = runClaim825(['startup', '--target-issue', '82530', '--target-source', 'orchestrator_selected',
        '--selection-record', recPath]);
      assertCanonicalRecordClaim825(82530, '#825(e)', r, 'not a JSON object');
      cleanup825(82530);
    }

    // --- (#862) A DIGEST MAY NOT OUTLIVE THE BYTES IT ATTESTS TO.
    //
    // `selection_record_digest` in workflow-state.md is a claim ABOUT the persisted record. The
    // record used to be written AFTER the claim stamped that digest, behind a bare catch, so a
    // failed write left state asserting a sha256 for a file that does not exist — and a successor
    // cannot tell that from a healthy claim. Since #855 deleted the record's grader those bytes are
    // the sole custody of why this issue was claimed, so the failure loses the only copy.
    //
    // THE FAILURE IS REAL, NOT SIMULATED. The preload fails the rename that `writeFileAtomicReplace`
    // finishes with, for this destination only — the state write, the folder and the branch all
    // proceed normally. Stubbing the writer, or calling the persist helper directly, would supply
    // the very failure signal whose ABSENCE is the defect.
    {
      cleanup825(82560);
      const preload = path.join(mocks825, 'fail-record-write.js');
      fs.writeFileSync(preload, [
        'const fs = require("fs"); const p = require("path");',
        'const real = fs.renameSync;',
        'fs.renameSync = function (from, to) {',
        '  if (p.basename(String(to)) === "selection-record.json") {',
        '    const e = new Error("EACCES: permission denied, rename selection record");',
        '    e.code = "EACCES"; throw e;',
        '  }',
        '  return real.apply(fs, arguments);',
        '};',
      ].join('\n') + '\n');
      const recPath = path.join(mocks825, 'rec-862.json');
      fs.writeFileSync(recPath, JSON.stringify({
        selection_mode: 'explicit-target', selection_bundle: 'none',
        selection_priority_basis: 'the user named it', selection_rejected: 'none',
        selection_disjointness: 'n/a', clarifications: 'none' }, null, 2) + '\n');

      const r = runClaim825(['startup', '--target-issue', '82560', '--target-source', 'orchestrator_selected',
        '--selection-record', recPath], null, preload);

      assert(r.code !== 0,
        '#862: a claim whose selection record did not persist must not report success — exit 0 '
        + 'tells every caller the claim and its record both landed, got ' + r.code);
      assert(!fs.existsSync(recordPath825(82560)),
        '#862 precondition: the record really did fail to persist, so this measures the defect and '
        + 'not a healthy claim');
      assert(!/^selection_record_digest:/m.test(stateOf825(82560)),
        '#862: ...and NO digest is stamped. A digest with no bytes behind it is worse than an '
        + 'absent one: a successor reads it and believes a record exists that hashed to that '
        + 'value, got ' + JSON.stringify((stateOf825(82560).match(/^selection_record_digest:.*$/m) || [])[0]));
      assert(!fs.existsSync(path.join(projDir825(82560), 'workflow-state.md')),
        '#862: ...and the claim rolled back whole rather than leaving a half-provisioned project — '
        + 'the record write sits inside the transaction, so its failure reverses every applied step');
      cleanup825(82560);
    }

    // --- (#862 control) The SAME claim without the injected fault acquires, persists the record,
    // and stamps its digest. Its own issue and its own fixture, so it survives any mutation of the
    // arm above rather than co-failing with it and reading as corroboration.
    {
      cleanup825(82561);
      const recPath = path.join(mocks825, 'rec-862-control.json');
      fs.writeFileSync(recPath, JSON.stringify({
        selection_mode: 'explicit-target', selection_bundle: 'none',
        selection_priority_basis: 'the user named it', selection_rejected: 'none',
        selection_disjointness: 'n/a', clarifications: 'none' }, null, 2) + '\n');
      const r = runClaim825(['startup', '--target-issue', '82561', '--target-source', 'orchestrator_selected',
        '--selection-record', recPath]);
      assert(r.code === 0 && r.json && r.json.status === 'acquired',
        '#862 control: with no injected fault the identical claim acquires — so the arm above '
        + 'measured the failed write and not a broken fixture, got ' + r.code + ' '
        + JSON.stringify(r.json && r.json.status));
      assert(fs.existsSync(recordPath825(82561))
        && /^selection_record_digest:/m.test(stateOf825(82561)),
        '#862 control: ...and the record and its digest BOTH land, which is the invariant the arm '
        + 'above checks the other half of');
      cleanup825(82561);
    }

    // --- (f) pick-next walks the SAME claim path, so it answers the same way.
    {
      cleanup825(82531);
      const r = runClaim825(['pick-next', '--target-issue', '82531', '--target-source', 'orchestrator_selected']);
      assertCanonicalRecordClaim825(82531, '#825(f)', r, '--target-source orchestrator_selected');
      cleanup825(82531);
    }

    // --- (g) HAPPY PATH: a valid record ACQUIRES, is persisted byte-identically, and its sha256
    // is stamped into workflow-state.md.
    {
      cleanup825(82540);
      const recPath = path.join(mocks825, 'rec-good.json');
      const bytes = JSON.stringify(goodRecord825(), null, 2) + '\n';
      fs.writeFileSync(recPath, bytes);
      const r = runClaim825(['startup', '--target-issue', '82540', '--target-source', 'orchestrator_selected',
        '--selection-record', recPath]);
      assert(r.json && r.json.status === 'acquired',
        '#825(g): a VALID selection record must acquire, got ' + JSON.stringify(r.json) + ' raw=' + r.raw.trim());
      const persisted = recordPath825(82540);
      assert(fs.existsSync(persisted),
        '#825(g): the record must be persisted at <project>/.cache/origin/selection-record.json, missing ' + persisted);
      const persistedBytes = fs.existsSync(persisted) ? fs.readFileSync(persisted, 'utf8') : '';
      let parsed = null; try { parsed = JSON.parse(persistedBytes); } catch (_) {}
      assert(parsed && REQUIRED_RECORD_FIELDS_825.every(f => typeof parsed[f] === 'string' ? parsed[f].trim().length > 0 : parsed[f] != null),
        '#825(g): the persisted record must carry every required field non-empty, got ' + JSON.stringify(parsed));
      assert(parsed && parsed.selection_priority_basis === goodRecord825().selection_priority_basis,
        '#825(g): the persisted record must be the ORCHESTRATOR-authored one (not a synthesized stub), got '
          + JSON.stringify(parsed && parsed.selection_priority_basis));
      const digest = crypto825.createHash('sha256').update(persistedBytes).digest('hex');
      const state = stateOf825(82540);
      const m = state.match(/^selection_record_digest:\s*(\S+)\s*$/m);
      assert(m !== null,
        '#825(g): workflow-state.md must carry a selection_record_digest line, got:\n' + state);
      assert(m && m[1].toLowerCase() === digest,
        '#825(g): the stamped digest must be the sha256 of the PERSISTED record bytes, expected '
          + digest + ' got ' + JSON.stringify(m && m[1]));
      assert(r.json && String(r.json.selection_record_digest || '').toLowerCase() === digest,
        '#825(g): the emitted claim JSON must surface selection_record_digest, got '
          + JSON.stringify(r.json && r.json.selection_record_digest));
      cleanup825(82540);
    }

    // --- (h) DEGENERATE record: an EXPLICIT-target claim supplies no record; startup writes one
    // itself with selection_mode: explicit-target, so the durable field is never optional.
    {
      cleanup825(82541);
      const r = runClaim825(['startup', '--target-issue', '82541']);
      assert(r.json && r.json.status === 'acquired',
        '#825(h): an explicit-target claim must still acquire with NO --selection-record, got '
          + JSON.stringify(r.json) + ' raw=' + r.raw.trim());
      const persisted = recordPath825(82541);
      assert(fs.existsSync(persisted),
        '#825(h): the explicit-target claim must write the DEGENERATE record itself, missing ' + persisted);
      let parsed = null; try { parsed = JSON.parse(fs.readFileSync(persisted, 'utf8')); } catch (_) {}
      assert(parsed && parsed.selection_mode === 'explicit-target',
        '#825(h): the degenerate record must carry selection_mode: explicit-target, got '
          + JSON.stringify(parsed && parsed.selection_mode));
      const emptyFields = parsed
        ? REQUIRED_RECORD_FIELDS_825.filter(f => parsed[f] == null || (typeof parsed[f] === 'string' && parsed[f].trim() === ''))
        : REQUIRED_RECORD_FIELDS_825;
      assert(emptyFields.length === 0,
        '#825(h): the degenerate record must still carry EVERY required field non-empty, empty/absent: '
          + JSON.stringify(emptyFields) + ' record=' + JSON.stringify(parsed));
      const state = stateOf825(82541);
      assert(/^selection_record_digest:\s*[0-9a-f]{64}\s*$/m.test(state),
        '#825(h): the explicit-target claim must stamp a selection_record_digest too, got:\n' + state);
      cleanup825(82541);
    }

    // --- (i) B1 FOLD: pre-claim staging at kaola-workflow/.origin/<target-key>/ is moved into
    // <project>/.cache/origin/ (relative layout preserved) and the staging dir is REMOVED.
    {
      cleanup825(82542);
      const staging = path.join(repo825, 'kaola-workflow', '.origin', 'issue-82542');
      fs.mkdirSync(path.join(staging, 'probes'), { recursive: true });
      fs.writeFileSync(path.join(staging, 'survey.md'), '# survey\nfindings\n');
      fs.writeFileSync(path.join(staging, 'probes', 'seams.json'), '{"seam":"claim.js:1647"}\n');
      const r = runClaim825(['startup', '--target-issue', '82542']);
      assert(r.json && r.json.status === 'acquired',
        '#825(i): a claim with pre-claim staging present must still acquire, got '
          + JSON.stringify(r.json) + ' raw=' + r.raw.trim());
      const originDir = path.join(projDir825(82542), '.cache', 'origin');
      assert(fs.existsSync(path.join(originDir, 'survey.md')),
        '#825(i): staged evidence must be folded into <project>/.cache/origin/, missing '
          + path.join(originDir, 'survey.md'));
      assert(fs.existsSync(path.join(originDir, 'probes', 'seams.json')),
        '#825(i): the fold must preserve the staged relative layout, missing '
          + path.join(originDir, 'probes', 'seams.json'));
      assert(fs.existsSync(path.join(originDir, 'survey.md'))
        && fs.readFileSync(path.join(originDir, 'survey.md'), 'utf8') === '# survey\nfindings\n',
        '#825(i): the folded evidence bytes must survive intact');
      assert(!fs.existsSync(staging),
        '#825(i): the staging dir kaola-workflow/.origin/<target-key>/ must be REMOVED after the fold, still at ' + staging);
      cleanup825(82542);
    }

    // --- (j) B1 NO-OP CONTROL: absent staging is not a refusal and creates no .origin residue.
    {
      cleanup825(82543);
      const r = runClaim825(['startup', '--target-issue', '82543']);
      assert(r.json && r.json.status === 'acquired',
        '#825(j): a claim with NO pre-claim staging must acquire unchanged, got '
          + JSON.stringify(r.json) + ' raw=' + r.raw.trim());
      assert(!fs.existsSync(path.join(repo825, 'kaola-workflow', '.origin')),
        '#825(j): the fold must not manufacture a kaola-workflow/.origin/ dir when nothing was staged');
      cleanup825(82543);
    }
  } finally {
    try {
      for (const b of String(G.git(repo825, ['worktree', 'list', '--porcelain'], { encoding: 'utf8' }).stdout || '')
        .split('\n').filter(l => l.startsWith('worktree ')).map(l => l.slice(9).trim())) {
        if (b !== repo825) { try { G.git(repo825, ['worktree', 'remove', '--force', b], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} }
      }
    } catch (_) {}
    fs.rmSync(repo825, { recursive: true, force: true });
    fs.rmSync(mocks825, { recursive: true, force: true });
  }
}


// --- the MISMATCHED-only arm of the archive-completeness gate ------------------------------------
//
// verifyArchiveComplete has two independent failure halves. `missing[]` is the one every existing
// scenario drives: the copy DROPPED a file the source held. `mismatched[]` is the other: the file
// reached the destination but is not the same thing — different bytes, a different mode, or an
// entry the walk could not treat as a plain file. That half had no scenario, which is how it stayed
// open long enough for a guard keyed on `missing.length > 0` to report success over a bad archive.
//
// WHERE THIS IS REACHABLE, measured rather than assumed. The copy+verify path runs only on the
// LINKED-RUN branch of archiveProjectDir (mainRoot !== linkedRoot); the in-place branch renames the
// folder, so no copy exists to be unfaithful. Instrumenting `isLinkedRun` across four suites: 20
// linked-run archives, every one of them entered from cmdFinalize inside a worktree, and ZERO from
// the sink — the sink resolves main itself and passes it, so its own call always renames. That is
// why this scenario drives `claim.js finalize`, not the sink.
//
// The fixture is the linked-worktree shape (a real `git worktree add`), because the seam does not
// exist without it. The mismatch vehicle is a SYMLINK inside the live .cache: copyDir follows it and
// writes a regular file, so the destination holds the right bytes under the right name while the
// source entry is not a plain file — `missing` stays empty and `mismatched` names the entry. That is
// exactly the shape the old guard waved through.
//
// NOT COVERED, because it is unreachable here: the `{missing:[], mismatched:['<root>']}` shape from
// a symlinked run-folder ROOT. Measured — cmdFinalize refuses earlier, at the workflow_state
// authority gate, with `finalize_gate_unverified` / `archive_authority_invalid_type`, so
// verifyArchiveComplete never sees it.
{
  const { execFileSync: execFS941, spawnSync: spawnS941 } = require('child_process');
  const CLAIM941 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV941 = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  };
  const g941 = (cwd, args) => {
    try { execFS941('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV941 }); return true; }
    catch (_) { return false; }
  };
  const gOut941 = (cwd, args) =>
    String(spawnS941('git', ['-C', cwd, ...args], { encoding: 'utf8', env: GIT_ENV941 }).stdout || '').trim();

  function mk941(project, plant) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-941-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });
    g941(mainRoot, ['init', '-b', 'main']);
    g941(mainRoot, ['config', 'user.email', 't@t.com']);
    g941(mainRoot, ['config', 'user.name', 'Test']);
    g941(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'package.json'), JSON.stringify({
      scripts: {
        'test:kaola-workflow:claude': 'true', 'test:kaola-workflow:codex': 'true',
        'test:kaola-workflow:gitlab': 'true', 'test:kaola-workflow:gitea': 'true'
      }
    }) + '\n');
    g941(mainRoot, ['add', 'package.json']);
    g941(mainRoot, ['commit', '-m', 'chore: self-host package.json']);
    g941(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);

    const wtProjDir = path.join(wtRoot, 'kaola-workflow', project);
    const wtCacheDir = path.join(wtProjDir, '.cache');
    fs.mkdirSync(wtCacheDir, { recursive: true });
    const stateText = [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive', 'step: start', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: 941',
      'sink: merge', 'run_posture: worktree', 'worktree_path: ' + wtRoot,
      'main_root: ' + mainRoot, 'session_marker: fixture-941', 'claim_ts: 2026-01-01T00:00:00Z', ''
    ].join('\n');
    fs.writeFileSync(path.join(wtProjDir, 'workflow-state.md'), stateText);
    fs.writeFileSync(path.join(wtRoot, 'impl.txt'), 'implementation\n');
    g941(wtRoot, ['add', '-A']);
    g941(wtRoot, ['commit', '-m', 'feat: impl for ' + project]);
    const headSha = gOut941(wtRoot, ['rev-parse', 'HEAD']);
    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(mainProjDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(mainProjDir, 'workflow-state.md'), stateText);
    fs.writeFileSync(path.join(wtCacheDir, 'chain-receipt.json'), JSON.stringify({
      headSha,
      chains: ['claude', 'codex', 'gitlab', 'gitea'].map(n => ({ name: n, exitCode: 0, accepted_red: false }))
    }) + '\n');
    if (plant) plant({ base, mainRoot, wtRoot, wtProjDir, wtCacheDir, mainProjDir, project });
    return { base, mainRoot, wtRoot, wtProjDir, wtCacheDir, mainProjDir, project };
  }

  // A fresh finalize process, driven from the WORKTREE so archiveProjectDir takes the linked-run
  // copy+verify branch. spawn-class: durable-handoff
  function runFinalize941(fx) {
    const e = Object.assign({}, process.env, GIT_ENV941, {
      KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    });
    const r = spawnS941(process.execPath,
      [CLAIM941, 'finalize', '--project', fx.project, '--keep-worktree'],
      { cwd: fx.wtRoot, encoding: 'utf8', timeout: 60000, env: e });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
  }
  const cleanup941 = fx => { try { fs.rmSync(fx.base, { recursive: true, force: true }); } catch (_) {} };

  // (1) DISCRIMINATOR: the same fixture WITHOUT the mismatch must finalize cleanly. Without this,
  // an assertion that finalize refuses proves nothing — a fixture broken in any other way refuses
  // too, and the scenario would pass while measuring the wrong failure.
  {
    const fx = mk941('issue-94101');
    try {
      const r = runFinalize941(fx);
      assert(r.status === 0,
        '#941 control: a faithful linked-run archive must finalize cleanly, got exit ' + r.status
        + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
      assert(r.json && (r.json.status === 'closed' || r.json.result !== 'refuse'),
        '#941 control: a faithful linked-run archive must not refuse, got ' + JSON.stringify(r.json));
    } finally { cleanup941(fx); }
  }

  // (2) THE ARM: mismatched non-empty, missing EMPTY.
  {
    const fx = mk941('issue-94102', f => {
      fs.writeFileSync(path.join(f.wtCacheDir, 'real-evidence.md'), 'verdict: pass\n');
      fs.symlinkSync(path.join(f.wtCacheDir, 'real-evidence.md'),
        path.join(f.wtCacheDir, 'linked-evidence.md'));
    });
    try {
      const r = runFinalize941(fx);
      const j = r.json || {};

      assert(r.status === 1,
        '#941: an archive whose copy does not faithfully reproduce the source must exit 1, got '
        + r.status + '\nstdout: ' + r.stdout);
      assert(j.result === 'refuse' && j.reason === 'archive_incomplete',
        '#941: the refusal must be typed archive_incomplete, got ' + JSON.stringify(j));

      // The load-bearing pair. `missing` empty is what made this shape invisible to a guard keyed
      // on it; `mismatched` non-empty is the only signal that says what actually went wrong.
      assert(Array.isArray(j.missing) && j.missing.length === 0,
        '#941: this shape must report an EMPTY missing[] — that is precisely why a guard keyed on '
        + 'missing.length could not see it; got ' + JSON.stringify(j.missing));
      assert(Array.isArray(j.mismatched) && j.mismatched.length > 0,
        '#941: the refusal envelope must carry the mismatched[] half. Without it the operator is '
        + 'told the archive "dropped evidence" and handed an empty list, which is both wrong and '
        + 'unactionable; got ' + JSON.stringify(j));
      assert(Array.isArray(j.mismatched) && j.mismatched.some(p => String(p).includes('linked-evidence.md')),
        '#941: mismatched[] must NAME the offending entry, not merely be non-empty — a locator is '
        + 'what makes the refusal repairable; got ' + JSON.stringify(j.mismatched));

      // Nothing DESTROYED: the refusal fires before either live copy is deleted, so the run record
      // still stands where the run left it — including the evidence the bad copy was carrying.
      assert(fs.existsSync(path.join(fx.wtProjDir, 'workflow-state.md')),
        '#941: the live project folder must survive the refusal');
      assert(fs.existsSync(path.join(fx.wtCacheDir, 'real-evidence.md')),
        '#941: the live evidence must survive the refusal — a refusal that protects the folder but '
        + 'not its contents protects nothing');

      // MEASURED, and deliberately not asserted in either direction: the half-written archive
      // destination IS left behind. copyDir runs before verifyArchiveComplete and the failure path
      // returns without unwinding it, so main keeps an untracked partial copy and a retry lands in
      // a `.archived-<ts>` sibling. Whether that is residue to clean up or evidence to preserve for
      // inspection is a judgement about the archive contract, not something this scenario can
      // settle — asserting a preference here would freeze one answer by accident.
    } finally { cleanup941(fx); }
  }

  // (3) THE COPY THAT CANNOT COMPLETE AT ALL — the disposal must fail LOUDLY and destroy NOTHING.
  //
  // Case (2) above covers a copy that finished but was unfaithful. This is the other failure: the
  // copy ABORTS PART-WAY. `copyDir` (claim.js:5033-5041) calls a bare `fs.copyFileSync` per entry, so
  // an unreadable source file throws out of the middle of the walk — before verifyArchiveComplete and
  // before the sidecar presence re-check ever run. `archiveProjectDirSafely` (:2660-2666) catches it
  // into a typed `archive_exception`, and the deletion of both live copies is downstream of a gate
  // that was never reached.
  //
  // WHY THIS IS PINNED AND THE ADJACENT GATE'S OWN EMIT IS NOT: the run folder is the only copy of
  // the run's evidence at this instant, so "an operation that would destroy something fails loudly"
  // is the property that actually protects work nobody agreed to lose. It is reachable end-to-end
  // with no seam and no test hook in shipped code, which the presence re-check's own output is not
  // (its destination is manufactured by copyDir from the source one statement earlier, at a path
  // proven fresh, so no on-disk construction can make the copy lossy-but-complete).
  //
  // The vehicle is an EXEMPT sidecar (`final-validation.md`), because that is the file class whose
  // loss verifyArchiveComplete is blind to — a non-exempt file would be caught by the completeness
  // comparison and this arm would be measuring case (2) again under a different name.
  {
    // A root process reads a mode-000 file regardless, which makes the whole axis inert and would
    // turn every assertion below into a vacuous pass. Skip LOUDLY instead.
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (uid === 0) {
      console.error('SKIP: #901(disposal) — running as uid 0, where chmod 000 is inert and this arm '
        + 'cannot fail. Re-run as a non-root user to exercise it.');
    } else {
      const fx = mk941('issue-94103', f => {
        fs.writeFileSync(path.join(f.wtCacheDir, 'final-validation.md'), 'verdict: pass\n');
        fs.writeFileSync(path.join(f.wtCacheDir, 'n1-evidence.md'), 'per-item evidence\n');
      });
      const sidecar = path.join(fx.wtCacheDir, 'final-validation.md');
      try {
        fs.chmodSync(sidecar, 0o000);
        // PROVE THE AXIS before running anything. A chmod that did not take (root, an exotic mount,
        // an ACL) would leave the copy succeeding and the refusal never firing — and the arm would
        // then be asserting nothing at all.
        let axisCode = null;
        try { fs.readFileSync(sidecar); } catch (e) { axisCode = e && e.code; }
        assert(axisCode === 'EACCES',
          '#901(disposal) premise: the source sidecar must be genuinely UNREADABLE, or the copy '
          + 'succeeds and every assertion below passes vacuously; fs.readFileSync gave '
          + JSON.stringify(axisCode) + ' (expected EACCES)');

        const r = runFinalize941(fx);
        const j = r.json || {};

        // FAILS LOUDLY, and says which door it failed at.
        assert(r.status === 1,
          '#901(disposal): a copy that cannot complete must exit 1, never proceed to the delete; got '
          + r.status + '\nstdout: ' + String(r.stdout || '').slice(0, 500));
        assert(j.result === 'refuse' && j.reason === 'archive_exception',
          '#901(disposal): the refusal is typed archive_exception — a DIFFERENT door from '
          + 'archive_incomplete, because the completeness gate was never reached; got '
          + JSON.stringify({ result: j.result, reason: j.reason }));
        assert(typeof j.detail === 'string' && j.detail.includes('final-validation.md'),
          '#901(disposal): the detail must NAME the file the copy died on — an unlocatable failure is '
          + 'unrepairable, the same property case (2) pins for mismatched[]; got ' + JSON.stringify(j.detail));

        // NOTHING DESTROYED. This is the whole arm; the four assertions are four distinct things the
        // delete would have taken.
        assert(fs.existsSync(path.join(fx.wtProjDir, 'workflow-state.md')),
          '#901(disposal): the live run folder in the WORKTREE must survive — the delete is downstream '
          + 'of a gate that never ran, so reaching it at all would destroy the only copy');
        assert(fs.existsSync(sidecar),
          '#901(disposal): the unreadable sidecar itself must survive. It is the file the copy could '
          + 'not carry, so it is precisely the one with no second copy anywhere');
        assert(fs.existsSync(path.join(fx.wtCacheDir, 'n1-evidence.md')),
          '#901(disposal): the sibling evidence the aborted walk never reached must survive too — a '
          + 'refusal that protects the folder but not its contents protects nothing');
        assert(fs.existsSync(path.join(fx.mainProjDir, 'workflow-state.md')),
          '#901(disposal): and the MAIN live copy must survive — archiveProjectDir deletes both, so '
          + 'both are at risk from one unreached gate');

        // No bookkeeping side effect either: a refusal this early must not have advanced the branch.
        assert(!/^chore: (finalize|archive) /m.test(gOut941(fx.wtRoot, ['log', '--format=%s', '-5'])),
          '#901(disposal): the refusing transaction must author no bookkeeping commit');

        // NOT asserted, for the same reason case (2) does not assert it: a PARTIAL archive
        // destination is left behind (measured — it holds whatever the walk copied before the throw).
        // Whether that is residue or evidence is a judgement about the archive contract.
      } finally {
        try { fs.chmodSync(sidecar, 0o644); } catch (_) {}
        cleanup941(fx);
      }
    }
  }
}


// --- #902: `finalize --check` must predict the authority the transaction CONSTRUCTS -------------
//
// On the ORDINARY linked-worktree topology — run folder resident in the MAIN checkout, the worktree
// not carrying it, no archive — Step 8a's artifact mirror CREATES the live folder the workflow_state
// resolution then reads. The read-only checklist resolved over the PRE-mirror tree, saw no authority
// at all, and reported `archive_authority_missing` + exit 1: an operator obligation for a step the
// script performs itself, unasked, one statement later. The real finalize from the SAME cwd
// succeeded with no repair, so the two surfaces disagreed about the same tree.
//
// WHY THE EXISTING CORPUS COULD NOT SEE IT — each reason is one arm below:
//   * every `--check` fixture in this repo (mk816, mk837, mk941) seeds the run folder into BOTH
//     roots, so `livePresent` is always true and the failing branch is unreachable from them. Arm A
//     is the UNSEEDED-worktree topology, which no existing fixture builds.
//   * NO test varies the CWD — runFinalize816/runFinalize837 hard-code `cwd: fx.wtRoot` — and the
//     cwd is the only variable that flips the answer. mk902's runner takes it as a parameter and
//     every arm asserts both cwds.
//   * check-vs-execute agreement WAS pinned (#816 T2a/T2b above), but only over a destination that
//     already existed — i.e. exactly where it already held. Arms A and E run the REAL transaction
//     over topologies where the two used to answer differently.
//
// AND WHY ARM A ALONE PROVES NOTHING. A blanket suppression — never pushing
// `archive_authority_missing` into `reasons` — passes arm A identically to a correct prediction.
// The arm that tells them apart is C: an authority NOTHING will construct must still fail closed,
// on BOTH surfaces, under the SAME token. C is mandatory, not decoration. D and E are its siblings:
// a prediction must not swallow an ambiguous authority, and where the mirror will construct a dest
// whose authority is still invalid the check must name the token EXECUTE names (`state_missing`),
// not the one it used to name for every shape at once.
{
  const { execFileSync: execFS902, spawnSync: spawnS902 } = require('child_process');
  const CLAIM902 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV902 = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  };
  const g902 = (cwd, args) => {
    try { execFS902('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV902 }); return true; }
    catch (_) { return false; }
  };
  const gOut902 = (cwd, args) =>
    String(spawnS902('git', ['-C', cwd, ...args], { encoding: 'utf8', env: GIT_ENV902 }).stdout || '').trim();

  // mk837's repo, with the ONE thing mk837 cannot express: which roots carry the run folder.
  //   seed.main      — the run folder lives in the MAIN checkout (the ordinary worktree-run shape)
  //   seed.mainState — false plants the folder WITHOUT workflow-state.md (arm E)
  //   seed.worktree  — the worktree ALSO carries it (the shape every existing fixture builds)
  //   seed.archives  — archive folder names planted in MAIN (findArchiveAuthorities searches the
  //                    run root AND the main root, so a main-side archive is visible from the wt)
  function mk902(project, seed) {
    const s = seed || {};
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-902-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });
    g902(mainRoot, ['init', '-b', 'main']);
    g902(mainRoot, ['config', 'user.email', 't@t.com']);
    g902(mainRoot, ['config', 'user.name', 'Test']);
    g902(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'package.json'), JSON.stringify({
      scripts: {
        'test:kaola-workflow:claude': 'true', 'test:kaola-workflow:codex': 'true',
        'test:kaola-workflow:gitlab': 'true', 'test:kaola-workflow:gitea': 'true'
      }
    }) + '\n');
    g902(mainRoot, ['add', 'package.json']);
    g902(mainRoot, ['commit', '-m', 'chore: self-host package.json']);
    g902(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);

    // The implementation commit lives on the branch, authored INSIDE the worktree.
    fs.writeFileSync(path.join(wtRoot, 'impl.txt'), 'implementation\n');
    g902(wtRoot, ['add', '-A']);
    g902(wtRoot, ['commit', '-m', 'feat: impl for ' + project]);
    const headSha = gOut902(wtRoot, ['rev-parse', 'HEAD']);

    const stateText = closed => [
      '# Kaola-Workflow State', '',
      '## Project', 'name: ' + project, 'status: ' + (closed ? 'closed' : 'active'), '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive',
      'workflow_path: adaptive', 'step: start', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: 902',
      'sink: merge', 'run_posture: worktree', 'worktree_path: ' + wtRoot,
      'main_root: ' + mainRoot, 'session_marker: fixture-902',
      'claim_ts: 2026-01-01T00:00:00Z', ''
    ].join('\n');
    const missionList = ['# close issue #902 — fixture', '',
      '- item: mission 1', '  status: done',
      '  dispatched: agent-1, output to out/1.md', '  result: out/1.md', ''].join('\n');
    // Bound to the WORKTREE head: the branch is the candidate under validation whichever tree the
    // folder happens to sit in, so a green classification is available from the wt cwd on every arm.
    const receipt = JSON.stringify({
      headSha,
      chains: ['claude', 'codex', 'gitlab', 'gitea'].map(n => ({ name: n, exitCode: 0, accepted_red: false }))
    }) + '\n';
    const plant = (dir, withState, closed) => {
      fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
      if (withState) fs.writeFileSync(path.join(dir, 'workflow-state.md'), stateText(!!closed));
      fs.writeFileSync(path.join(dir, 'mission-list.md'), missionList);
      fs.writeFileSync(path.join(dir, '.cache', 'chain-receipt.json'), receipt);
    };

    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    const wtProjDir = path.join(wtRoot, 'kaola-workflow', project);
    if (s.main) plant(mainProjDir, s.mainState !== false, false);
    if (s.worktree) plant(wtProjDir, true, false);
    for (const name of (s.archives || [])) {
      plant(path.join(mainRoot, 'kaola-workflow', 'archive', name), true, true);
    }
    return { base, mainRoot, wtRoot, project, headSha, mainProjDir, wtProjDir };
  }

  // THE CWD IS A PARAMETER. That is the whole point: the defect was invisible to every existing
  // finalize runner precisely because they all hard-code one cwd, and the answer differs by cwd.
  // spawn-class: durable-handoff
  function runFinalize902(fx, cwd, extraArgs) {
    const e = Object.assign({}, process.env, GIT_ENV902, {
      KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    });
    const r = spawnS902(process.execPath,
      [CLAIM902, 'finalize', '--project', fx.project, '--keep-worktree', ...(extraArgs || [])],
      { cwd, encoding: 'utf8', timeout: 120000, env: e });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  }
  const check902 = (fx, cwd) => runFinalize902(fx, cwd, ['--check', '--json']);
  const cleanup902 = fx => { try { fs.rmSync(fx.base, { recursive: true, force: true }); } catch (_) {} };
  const reasons902 = r => (r.json && Array.isArray(r.json.reasons)) ? r.json.reasons : ['(no reasons array)'];

  // The cwd-axis invariant, applied to every arm: whether the run is finalize-ready cannot depend on
  // which checkout of the same repository the operator is standing in, and the token reserved for an
  // unrepairable authority must appear from both cwds or neither. This is the assertion that would
  // have caught #902 directly.
  function assertCwdAxisAgrees(fx, label, expectOk) {
    const fromWt = check902(fx, fx.wtRoot);
    const fromMain = check902(fx, fx.mainRoot);
    assert((fromWt.status === 0) === expectOk && !!(fromWt.json && fromWt.json.ok) === expectOk,
      label + ' (cwd axis): from the LINKED WORKTREE, ok must be ' + expectOk + '; got status='
      + fromWt.status + ' json=' + JSON.stringify(fromWt.json) + ' stderr='
      + String(fromWt.stderr || '').slice(0, 300));
    assert((fromMain.status === 0) === expectOk && !!(fromMain.json && fromMain.json.ok) === expectOk,
      label + ' (cwd axis): from the MAIN ROOT, ok must be ' + expectOk + '; got status='
      + fromMain.status + ' json=' + JSON.stringify(fromMain.json));
    const missingWt = reasons902(fromWt).includes('archive_authority_missing');
    const missingMain = reasons902(fromMain).includes('archive_authority_missing');
    assert(missingWt === missingMain,
      label + ' (cwd axis): `archive_authority_missing` must be reported from BOTH cwds or NEITHER '
      + '— it is a fact about the repository, not about where the shell is. worktree='
      + JSON.stringify(reasons902(fromWt)) + ' main=' + JSON.stringify(reasons902(fromMain)));
    return { fromWt, fromMain };
  }

  // --- A: the #902 topology. The one axis no existing fixture varies. ---------------------------
  {
    const fx = mk902('issue-902a', { main: true });
    try {
      assert(!fs.existsSync(fx.wtProjDir) && fs.existsSync(fx.mainProjDir),
        '#902(A) fixture premise: the run folder is MAIN-resident and the worktree does NOT carry it '
        + '— the topology every existing --check fixture seeds away');
      assert(!fs.existsSync(path.join(fx.wtRoot, 'kaola-workflow', 'archive'))
        && !fs.existsSync(path.join(fx.mainRoot, 'kaola-workflow', 'archive')),
        '#902(A) fixture premise: no archive stands in for the live folder in either root');

      const { fromWt, fromMain } = assertCwdAxisAgrees(fx, '#902(A)', true);
      const checks = (fromWt.json && fromWt.json.checks) || {};
      assert(reasons902(fromWt).length === 0,
        '#902(A): a mirror the script itself performs one statement later is NOT an operator '
        + 'obligation — `reasons` must be empty, got ' + JSON.stringify(reasons902(fromWt)));
      assert(checks.workflow_state === 'pending_mirror',
        '#902(A): the pending construction must be reported as STATE, got '
        + JSON.stringify(checks.workflow_state));
      assert(checks.mirror === 'ready',
        '#902(A): the mirror probe must say the mirror will run, got ' + JSON.stringify(checks.mirror));

      // The authority topology — the new envelope key, and the only place a reader can see WHICH
      // tree each answer came from.
      const auth = (fromWt.json && fromWt.json.authority) || null;
      assert(auth && typeof auth === 'object',
        '#902(A): --check must emit the `authority` block, got ' + JSON.stringify(fromWt.json && fromWt.json.authority));
      assert(auth && auth.source === 'pending_mirror',
        '#902(A): authority.source must name the pending construction, got ' + JSON.stringify(auth));
      assert(auth && auth.linked_root === fx.wtRoot && auth.main_root === fx.mainRoot,
        '#902(A): the block must name both roots, got ' + JSON.stringify(auth));
      assert(auth && auth.source_dir === fx.mainProjDir,
        '#902(A): source_dir must be the MAIN-resident folder the mirror will copy, got ' + JSON.stringify(auth));
      assert(auth && auth.dest_dir === fx.wtProjDir && auth.dest_dir !== auth.source_dir,
        '#902(A): dest_dir must stay the tree EXECUTION reads — the authority is predicted, never '
        + 'relocated to main (a prediction naming main is the same defect inverted), got ' + JSON.stringify(auth));
      assert(fromMain.json && fromMain.json.authority && fromMain.json.authority.linked_root === null,
        '#902(A): an in-place (main-root) run has no linked root, got '
        + JSON.stringify(fromMain.json && fromMain.json.authority));

      // The second defect: the validation measurement was LOST to `not_checked` on this topology
      // purely because the rung above had not looked in the right tree yet.
      assert(checks.validation === 'chains_green',
        '#902(A): the validation measurement must be REAL over the predicted authority\'s .cache/, '
        + 'not lost to not_checked, got ' + JSON.stringify(checks.validation));
      assert(Array.isArray(checks.changed_paths) && checks.changed_paths.includes('impl.txt'),
        '#902(A): checks.changed_paths must carry the real branch diff, not [], got '
        + JSON.stringify(checks.changed_paths));

      // READ-ONLY. Predicting the mirror must not perform it.
      assert(!fs.existsSync(fx.wtProjDir),
        '#902(A): --check must PREDICT the mirror, never run it — the worktree folder must still '
        + 'not exist after two check passes');

      // CHECK vs EXECUTE, from the SAME cwd, over the SAME tree. This is the disagreement #902 is.
      const real = runFinalize902(fx, fx.wtRoot, []);
      assert(real.status === 0,
        '#902(A): the real transaction from the SAME cwd must succeed — --check reporting a stop the '
        + 'transaction does not hit is the defect, got status=' + real.status + ' json='
        + JSON.stringify(real.json) + ' stderr=' + String(real.stderr || '').slice(0, 400));
      assert(real.json && real.json.finalize_transaction && real.json.finalize_transaction.mirror === 'mirrored',
        '#902(A): the transaction records the mirror step --check predicted, got '
        + JSON.stringify(real.json && real.json.finalize_transaction));
      assert(real.json && real.json.validation && real.json.validation.classification === checks.validation,
        '#902(A): --check and the transaction must report the SAME validation classification over the '
        + 'same tree; check=' + JSON.stringify(checks.validation) + ' execute='
        + JSON.stringify(real.json && real.json.validation && real.json.validation.classification));
      // WHERE it archived to is READ from the envelope, never reconstructed. A collision-suffixed
      // dest (`archive/<project>.archived-<ts>`) escapes a hardcoded `archive/<project>`, so a pin
      // that rebuilt the path would silently measure a tree the transaction never wrote — and an
      // existence check against the wrong tree fails OPEN. Both halves are asserted: the envelope
      // names a dest, and the run folder is on disk AT that dest.
      const archivedDest = real.json && real.json.dest;
      assert(typeof archivedDest === 'string'
        && archivedDest.startsWith(path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project)),
        '#902(A): the transaction must REPORT an archive dest under MAIN\'s archive band for this '
        + 'project (plain or collision-suffixed); got ' + JSON.stringify(archivedDest));
      assert(typeof archivedDest === 'string' && fs.existsSync(path.join(archivedDest, 'workflow-state.md')),
        '#902(A): and the run it predicted an authority for is on disk at the dest the envelope names '
        + '— envelope and disk must agree; got dest=' + JSON.stringify(archivedDest));
    } finally { cleanup902(fx); }
  }

  // --- B: CONTROL — the seeded shape every existing fixture builds, unchanged ---------------------
  {
    const fx = mk902('issue-902b', { main: true, worktree: true });
    try {
      const { fromWt } = assertCwdAxisAgrees(fx, '#902(B control)', true);
      const checks = (fromWt.json && fromWt.json.checks) || {};
      assert(checks.workflow_state === 'ok',
        '#902(B control): a worktree that already carries the folder resolves a LIVE authority and '
        + 'must be untouched by the prediction, got ' + JSON.stringify(checks.workflow_state));
      const auth = (fromWt.json && fromWt.json.authority) || {};
      assert(auth.source === 'live' && auth.source_dir === fx.wtProjDir && auth.dest_dir === auth.source_dir,
        '#902(B control): on a live authority source_dir and dest_dir are the same tree, got '
        + JSON.stringify(auth));
      const real = runFinalize902(fx, fx.wtRoot, []);
      assert(real.status === 0,
        '#902(B control): the seeded topology must still finalize, got status=' + real.status
        + ' json=' + JSON.stringify(real.json));
    } finally { cleanup902(fx); }
  }

  // --- C: THE MANDATORY FAIL-CLOSED NEGATIVE ----------------------------------------------------
  // No live folder in EITHER root and no archive: there is nothing for the mirror to construct the
  // authority FROM, so `archive_authority_missing` is still the right answer and must still stop.
  // Arm A passes identically under a blanket suppression of this token; this arm is the ONLY one
  // that tells a prediction from a suppression, which is why it is not optional.
  {
    const fx = mk902('issue-902c', {});
    try {
      assert(!fs.existsSync(fx.wtProjDir) && !fs.existsSync(fx.mainProjDir),
        '#902(C) fixture premise: no live folder in either root');
      const { fromWt } = assertCwdAxisAgrees(fx, '#902(C)', false);
      assert(reasons902(fromWt).includes('archive_authority_missing'),
        '#902(C): an authority NOTHING will construct must STILL fail closed under the same typed '
        + 'token — this is the arm a blanket suppression reds on, got ' + JSON.stringify(reasons902(fromWt)));
      const checks = (fromWt.json && fromWt.json.checks) || {};
      assert(checks.workflow_state === 'archive_authority_missing',
        '#902(C): the state token must survive too, got ' + JSON.stringify(checks.workflow_state));
      assert(checks.mirror === 'source_absent',
        '#902(C): the mirror probe must report there is no source to copy, got ' + JSON.stringify(checks.mirror));
      const auth = (fromWt.json && fromWt.json.authority) || {};
      assert(auth.source === 'none' && auth.source_dir === null && auth.dest_dir === null,
        '#902(C): an unprovable authority is `none` with no directories, got ' + JSON.stringify(auth));

      // And EXECUTE agrees — the fail-closed half is pinned on both surfaces, not just the checklist.
      const real = runFinalize902(fx, fx.wtRoot, []);
      assert(real.status !== 0 && real.json && real.json.inner_reason === 'archive_authority_missing',
        '#902(C): the transaction must refuse under the SAME token the checklist reported, got status='
        + real.status + ' json=' + JSON.stringify(real.json));
    } finally { cleanup902(fx); }
  }

  // --- D: NEGATIVE — an ambiguous authority must survive the prediction untouched -----------------
  {
    const fx = mk902('issue-902d', { archives: ['issue-902d', 'issue-902d.archived-20260101T000000Z'] });
    try {
      const { fromWt } = assertCwdAxisAgrees(fx, '#902(D)', false);
      assert(reasons902(fromWt).includes('archive_authority_ambiguous'),
        '#902(D): two matching archives and no live folder is still ambiguous — the prediction must '
        + 'not convert a token it was never derived for, got ' + JSON.stringify(reasons902(fromWt)));
      const checks = (fromWt.json && fromWt.json.checks) || {};
      assert(checks.mirror === 'skipped_post_archive',
        '#902(D): with an archive standing in, the mirror is skipped — so `ready` alone can never be '
        + 'read as "the mirror will construct the destination", got ' + JSON.stringify(checks.mirror));
      const real = runFinalize902(fx, fx.wtRoot, []);
      assert(real.status !== 0 && real.json && real.json.inner_reason === 'archive_authority_ambiguous',
        '#902(D): execute must refuse under the same token, got status=' + real.status
        + ' json=' + JSON.stringify(real.json));
    } finally { cleanup902(fx); }
  }

  // --- E: the mirror WILL construct a destination whose authority is still invalid ----------------
  // Main source present but carrying no workflow-state.md. Before the prediction the two surfaces
  // named DIFFERENT tokens for the same tree — `archive_authority_missing` from the checklist,
  // `state_missing` from the transaction. The prediction must produce EXECUTE's token.
  {
    const fx = mk902('issue-902e', { main: true, mainState: false });
    try {
      assert(fs.existsSync(fx.mainProjDir) && !fs.existsSync(path.join(fx.mainProjDir, 'workflow-state.md')),
        '#902(E) fixture premise: the main source exists but carries no workflow-state.md');
      const fromWt = check902(fx, fx.wtRoot);
      assert(fromWt.status !== 0 && reasons902(fromWt).includes('state_missing'),
        '#902(E): the checklist must name the token EXECUTE names, got status=' + fromWt.status
        + ' reasons=' + JSON.stringify(reasons902(fromWt)));
      assert(!reasons902(fromWt).includes('archive_authority_missing'),
        '#902(E): `archive_authority_missing` is reserved for an authority nothing can construct — '
        + 'it must not double as the answer for a construction that lands invalid, got '
        + JSON.stringify(reasons902(fromWt)));
      const auth = (fromWt.json && fromWt.json.authority) || {};
      assert(auth.source === 'pending_mirror',
        '#902(E): the source is still the folder the mirror will copy, got ' + JSON.stringify(auth));
      const real = runFinalize902(fx, fx.wtRoot, []);
      assert(real.status !== 0 && real.json && real.json.inner_reason === 'state_missing',
        '#902(E): execute must refuse `state_missing` — the token the checklist now predicts, got '
        + 'status=' + real.status + ' json=' + JSON.stringify(real.json));
    } finally { cleanup902(fx); }
  }

  // --- F: a legitimate ARCHIVE resume must not be hijacked by the prediction ----------------------
  // Exactly one closed archive, no live folder anywhere: the authority is PROVEN today, so nothing
  // is pending and `source` must say `archive`. This completes the `source` vocabulary
  // (live / archive / pending_mirror / none) and pins that `dest_dir === source_dir` off
  // `pending_mirror`.
  {
    const fx = mk902('issue-902f', { archives: ['issue-902f'] });
    try {
      const { fromWt } = assertCwdAxisAgrees(fx, '#902(F)', true);
      const checks = (fromWt.json && fromWt.json.checks) || {};
      assert(checks.workflow_state === 'ok',
        '#902(F): a single closed archive IS a proven authority, got ' + JSON.stringify(checks.workflow_state));
      const auth = (fromWt.json && fromWt.json.authority) || {};
      assert(auth.source === 'archive',
        '#902(F): a proven archive authority must report `archive`, never `pending_mirror` — nothing '
        + 'is being constructed, got ' + JSON.stringify(auth));
      assert(auth.source_dir === path.join(fx.mainRoot, 'kaola-workflow', 'archive', fx.project)
        && auth.dest_dir === auth.source_dir,
        '#902(F): dest_dir differs from source_dir EXACTLY on pending_mirror, got ' + JSON.stringify(auth));
    } finally { cleanup902(fx); }
  }

  // --- G: `pending_mirror` must not PROMISE a mirror that cannot happen -------------------------
  //
  // `'ready'` is a promise that Step 8a's copy will run, and the prediction converts an operator
  // obligation into script-owned state on the strength of it. The writability probe used to live only
  // in the `sync_required` arm — and it probes the SOURCE, which is that arm's own write target — so
  // on the pending_mirror topology nothing probed the tree about to be WRITTEN. With the worktree's
  // `kaola-workflow/` read-only, `--check` said `ok:true` / `pending_mirror` / `reasons: []` and the
  // transaction then died one statement later with a raw EACCES and NO JSON ENVELOPE AT ALL.
  //
  // THE CONTROL IS THE WHOLE ARM, and G1 is it. A blanket re-refusal on this topology passes G2
  // identically while silently undoing the #902 conversion arms A-F exist to hold — the same lesson
  // arm C teaches about suppression, in the opposite direction. G1 and G2 differ in exactly one bit:
  // the mode of one directory.
  {
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    if (uid === 0) {
      console.error('SKIP: #902(G) — running as uid 0, where chmod 555 is inert, `--check` would '
        + 'report the writable answer, and G2 could not fail. Re-run as a non-root user.');
    } else {
      // G1 — CONTROL: the destination's parent EXISTS AND IS WRITABLE. The #902 conversion intact.
      {
        const fx = mk902('issue-902g1', { main: true });
        try {
          fs.mkdirSync(path.join(fx.wtRoot, 'kaola-workflow'), { recursive: true });
          const chk = check902(fx, fx.wtRoot);
          const checks = (chk.json && chk.json.checks) || {};
          assert(chk.status === 0 && chk.json && chk.json.ok === true,
            '#902(G1 control): a writable destination must still be finalize-ready, got status='
            + chk.status + ' json=' + JSON.stringify(chk.json));
          assert(checks.mirror === 'ready' && checks.workflow_state === 'pending_mirror',
            '#902(G1 control): and must still report the pending construction as STATE, got '
            + JSON.stringify(checks));
          assert(reasons902(chk).length === 0
            && !reasons902(chk).includes('archive_authority_missing'),
            '#902(G1 control): `reasons` must be EMPTY — if this arm ever reds, the writability probe '
            + 'has become a blanket refusal and the #902 conversion is undone; got '
            + JSON.stringify(reasons902(chk)));
          const real = runFinalize902(fx, fx.wtRoot, []);
          assert(real.status === 0,
            '#902(G1 control): and the transaction still succeeds, got status=' + real.status
            + ' json=' + JSON.stringify(real.json));
        } finally { cleanup902(fx); }
      }

      // G2 — the SAME topology, one bit changed: `kaola-workflow/` unwritable.
      {
        const fx = mk902('issue-902g2', { main: true });
        const wtKw = path.join(fx.wtRoot, 'kaola-workflow');
        try {
          fs.mkdirSync(wtKw, { recursive: true });
          fs.chmodSync(wtKw, 0o555);
          // Prove the axis before trusting anything below it.
          let axisCode = null;
          try { fs.accessSync(wtKw, fs.constants.W_OK); } catch (e) { axisCode = e && e.code; }
          assert(axisCode === 'EACCES',
            '#902(G2) premise: the destination parent must be genuinely unwritable, or `--check` '
            + 'reports the writable answer and this arm passes vacuously; accessSync gave '
            + JSON.stringify(axisCode));

          const chk = check902(fx, fx.wtRoot);
          const checks = (chk.json && chk.json.checks) || {};
          assert(chk.status !== 0 && chk.json && chk.json.ok === false,
            '#902(G2): a mirror that CANNOT happen is a genuine operator-owed precondition and must '
            + 'not be reported as ok; got status=' + chk.status + ' json=' + JSON.stringify(chk.json));
          assert(checks.mirror === 'sync_failed',
            '#902(G2): the promise is falsified by probing the tree that will be WRITTEN, and reuses '
            + 'the token this probe already carries; got ' + JSON.stringify(checks.mirror));
          assert(reasons902(chk).includes('mirror_sync_failed'),
            '#902(G2): the actionable token must be in `reasons`; got ' + JSON.stringify(reasons902(chk)));
          assert(checks.workflow_state !== 'pending_mirror',
            '#902(G2): and the authority must NOT be predicted — a construction that cannot happen is '
            + 'not a pending step; got ' + JSON.stringify(checks.workflow_state));
          // `archive_authority_missing` DOES reappear here, and that is correct: the prediction
          // declines to promise a construction that cannot happen. Deliberately not asserted absent —
          // asserting its absence would demand the checklist hide a real precondition.

          // THE TRANSACTION'S OWN HALF. The defect was the ABSENCE of an envelope, so the load-bearing
          // assertion is that the envelope PARSES — a reason-only assertion passes on a null envelope.
          const real = runFinalize902(fx, fx.wtRoot, []);
          assert(real.status !== 0, '#902(G2): the transaction must fail, got ' + real.status);
          assert(real.json !== null,
            '#902(G2): the transaction must emit a PARSEABLE JSON envelope — dying on a raw EACCES with '
            + 'no envelope is the defect, and asserting only the reason would pass on a null one; got '
            + 'stdout=' + JSON.stringify(String(real.stdout || '').slice(0, 200))
            + ' stderr=' + JSON.stringify(String(real.stderr || '').slice(0, 200)));
          assert(real.json && real.json.reason === 'finalize_mirror_refused'
            && real.json.inner_reason === 'mirror_sync_failed',
            '#902(G2): typed with the EXISTING vocabulary for "the mirror the script owes cannot be '
            + 'performed", not a new token; got ' + JSON.stringify(real.json && {
              result: real.json.result, reason: real.json.reason, inner_reason: real.json.inner_reason }));
        } finally {
          try { fs.chmodSync(wtKw, 0o755); } catch (_) {}
          cleanup902(fx);
        }
      }

      // G3 — a regular FILE where `kaola-workflow/` belongs. A second, independent way for the copy
      // to be impossible (ENOTDIR rather than EACCES), and it died untyped the same way.
      {
        const fx = mk902('issue-902g3', { main: true });
        try {
          fs.writeFileSync(path.join(fx.wtRoot, 'kaola-workflow'), 'not a directory\n');
          const real = runFinalize902(fx, fx.wtRoot, []);
          assert(real.status !== 0 && real.json !== null,
            '#902(G3): an ENOTDIR mirror failure must also come back as a PARSEABLE envelope, not a '
            + 'raw stack; got status=' + real.status + ' stderr='
            + JSON.stringify(String(real.stderr || '').slice(0, 200)));
          assert(real.json && real.json.reason === 'finalize_mirror_refused'
            && real.json.inner_reason === 'mirror_sync_failed',
            '#902(G3): and typed identically — one wrapper covers every way the copy can fail; got '
            + JSON.stringify(real.json && { reason: real.json.reason, inner_reason: real.json.inner_reason }));
        } finally { cleanup902(fx); }
      }
    }
  }
}

// --- D1: the destruction gate must guard EVERY live copy, not just the invoked one --------------
//
// `archiveProjectDir` deleted TWO live copies while measuring ONE. Both `verifyArchiveComplete` and
// the sidecar presence re-check read the copy the command was invoked from; main's live folder was
// `rmSync`'d with no comparison against the destination at all. Measured before the fix: a `release`
// from a linked worktree exited **0** reporting `archived: true` and lost three main-only files from
// EVERYWHERE — one of them an exempt sidecar.
//
// The three routes that reach here — release / discard, watch-pr on a merged PR, and the abandon
// backstop — run NO Step-8a mirror, so nothing upstream establishes "worktree ⊇ main" for them. That
// is why the pair `mainLive ↔ dest` is the one that can differ, and why it is the pair that must be
// compared. (It is also why the older `src ↔ dest` re-check could never fire on its own: `copyDir`
// had just made that pair identical one statement earlier.)
//
// PRESENCE, not byte-identity, for main — deliberately: the terminal stamp and the two sentinel
// rewrites all rewrite the INVOKING root's copy, so main's bytes legitimately differ from the
// archive's and a byte comparison would false-refuse every ordinary linked run.
//
// ONE AXIS, FIVE LEGS: what main's live folder holds relative to the worktree's. Three that must NOT
// refuse are as load-bearing as the two that must — a blanket refusal on this path would pass L4/L5
// and destroy nothing, which looks like a fix and is a broken `release`.
{
  const { execFileSync: execFS910, spawnSync: spawnS910 } = require('child_process');
  const CLAIM910 = path.join(__dirname, 'kaola-workflow-claim.js');
  const GIT_ENV910 = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  };
  const g910 = (cwd, args) => {
    try { execFS910('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV910 }); return true; }
    catch (_) { return false; }
  };

  // A linked-worktree run whose WORKTREE live folder is fixed and whose MAIN live folder is the axis.
  // `mainFiles === null` means main carries no live folder at all.
  function mk910(project, mainFiles) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-910-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });
    g910(mainRoot, ['init', '-b', 'main']);
    g910(mainRoot, ['config', 'user.email', 't@t.com']);
    g910(mainRoot, ['config', 'user.name', 'Test']);
    g910(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'README.md'), 'fixture\n');
    g910(mainRoot, ['add', '-A']);
    g910(mainRoot, ['commit', '-m', 'chore: init']);
    g910(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);

    const stateText = [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
      'runtime: claude', 'step: start', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: 910',
      'sink: merge', 'run_posture: worktree', 'worktree_path: ' + wtRoot,
      'main_root: ' + mainRoot, 'session_marker: fixture-910', 'claim_ts: 2026-01-01T00:00:00Z', ''
    ].join('\n');

    // The INVOKED tree's live folder — the same two files in every leg.
    const wtProjDir = path.join(wtRoot, 'kaola-workflow', project);
    fs.mkdirSync(path.join(wtProjDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(wtProjDir, 'workflow-state.md'), stateText);
    fs.writeFileSync(path.join(wtProjDir, '.cache', 'shared.md'), '# held by both copies\n');

    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    if (mainFiles) {
      fs.mkdirSync(path.join(mainProjDir, '.cache'), { recursive: true });
      for (const rel of mainFiles) {
        const abs = path.join(mainProjDir, ...rel.split('/'));
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, rel === 'workflow-state.md' ? stateText : '# ' + rel + '\n');
      }
    }
    return { base, mainRoot, wtRoot, project, mainProjDir, wtProjDir };
  }

  // `release` is driven rather than `finalize` because it is one of the three routes that run NO
  // Step-8a mirror — the lane where "worktree ⊇ main" is never established upstream.
  // spawn-class: durable-handoff
  function runRelease910(fx) {
    const e = Object.assign({}, process.env, GIT_ENV910, {
      KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
    });
    const r = spawnS910(process.execPath, [CLAIM910, 'release', '--project', fx.project, '--json'],
      { cwd: fx.wtRoot, encoding: 'utf8', timeout: 120000, env: e });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  }
  const cleanup910 = fx => { try { fs.rmSync(fx.base, { recursive: true, force: true }); } catch (_) {} };

  const LEGS_910 = [
    { name: 'L1_equal', main: ['workflow-state.md', '.cache/shared.md'], expect: 'archive',
      why: 'main holds exactly what the worktree holds — nothing can be lost' },
    { name: 'L2_subset', main: ['workflow-state.md'], expect: 'archive',
      why: 'main holds a strict SUBSET — still nothing only it has' },
    { name: 'L3_absent', main: null, expect: 'archive',
      why: 'no main live folder at all — nothing to compare and nothing to lose' },
    { name: 'L4_extra', main: ['workflow-state.md', '.cache/shared.md', '.cache/EXTRA.md'],
      expect: 'refuse', lost: '.cache/EXTRA.md',
      why: 'one ORDINARY main-only file — the archive is about to become the only copy and does not hold it' },
    { name: 'L5_sidecar', main: ['workflow-state.md', '.cache/shared.md', '.cache/final-validation.md'],
      expect: 'refuse', lost: '.cache/final-validation.md',
      why: 'one main-only EXEMPT sidecar — the half verifyArchiveComplete is blind to by design '
        + '(T6g in test-finalize-door.js pins that blindness), so this is the leg only a presence '
        + 're-check can catch' },
  ];

  for (const leg of LEGS_910) {
    const fx = mk910('issue-9101' + leg.name.slice(1, 2), leg.main);
    const label = '#901(D1 ' + leg.name + ')';
    try {
      const r = runRelease910(fx);
      const j = r.json || {};
      if (leg.expect === 'archive') {
        assert(r.status === 0 && j.released === true && j.archived === true,
          label + ': must still archive — ' + leg.why + '. A gate that refuses here is a broken '
          + '`release`, not a fix; got status=' + r.status + ' json=' + JSON.stringify(j)
          + ' stderr=' + String(r.stderr || '').slice(0, 300));
        assert(!fs.existsSync(fx.wtProjDir),
          label + ': and the invoked tree\'s live folder is disposed of as before');
        assert(!fs.existsSync(fx.mainProjDir),
          label + ': and main\'s live copy too — the gate must not strand it');
      } else {
        assert(r.status === 1 && j.result === 'refuse' && j.reason === 'archive_incomplete',
          label + ': ' + leg.why + ', so the disposal must REFUSE under the existing typed reason; got '
          + 'status=' + r.status + ' json=' + JSON.stringify(j)
          + ' stderr=' + String(r.stderr || '').slice(0, 300));
        assert(Array.isArray(j.missing) && j.missing.includes(leg.lost),
          label + ': and NAME the file that would be lost — an unnamed loss is unrepairable; got '
          + JSON.stringify(j.missing));
        // BOTH live copies retained. The refusal is worthless if it still destroys one of them.
        assert(fs.existsSync(path.join(fx.mainProjDir, ...leg.lost.split('/'))),
          label + ': main\'s live copy AND the at-risk file must survive the refusal — this is the '
          + 'file that was being lost from everywhere at exit 0');
        assert(fs.existsSync(path.join(fx.wtProjDir, 'workflow-state.md')),
          label + ': the invoked tree\'s live copy must survive too — the delete is all-or-nothing');
        assert(j.archived !== true,
          label + ': and the envelope must not claim it archived; got ' + JSON.stringify(j.archived));
      }
    } finally { cleanup910(fx); }
  }
}

// --- #906: the two destruction routes, driven on every edition ----------------------------------
//
// D1 above closed the case where main's live folder holds an ordinary FILE the archive lacks. #906 is
// the two halves D1 did not reach, and neither had any test on arrival:
//
//   ROUTE 2 — "cannot be compared" is not "bytes differ". `verifyArchiveComplete` reduced every entry
//     to bytes or to nothing; a symlink, a dangling symlink and a FIFO all reduced to NOTHING, so they
//     appeared in no half of the comparison and the delete ran at exit 0. The entry the operator lost
//     was, in the reported incident, a symlink under an EXEMPT SIDECAR name — the one shape both the
//     byte comparison and the presence re-check are blind to.
//   ROUTE 1 — the #395.4 crash backstop DELETED main's surviving live folder to clear the phantom
//     claim. Clearing the claim and destroying the folder are two different acts; only the first was
//     ever the goal (the backstop's own comment says so).
//
// `release` is the vehicle for route 2 and `finalize` for route 1, for the same reason D1 chose
// `release`: they are the routes that run NO Step-8a mirror, so nothing upstream establishes
// "worktree ⊇ main" and the pair `mainLive ↔ dest` is the one that can genuinely differ.
//
// PER EDITION, BEHAVIOURALLY. `claim.js`'s GitLab and Gitea copies are hand-ported and policed by
// nothing — absent from COMMON_SCRIPTS and from the rename-normalized families. The source-text pins
// in P7/P8 above can only say a literal is present; they cannot say the port WORKS. These run it.
{
  const { execFileSync: execFS906, spawnSync: spawnS906 } = require('child_process');
  const REPO906 = path.resolve(__dirname, '..');
  const EDITIONS_906 = [
    ['canonical', path.join(REPO906, 'scripts', 'kaola-workflow-claim.js')],
    ['codex', path.join(REPO906, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js')],
    ['gitlab', path.join(REPO906, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js')],
    ['gitea', path.join(REPO906, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js')],
  ];
  const GIT_ENV906 = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@t.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@t.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  };
  const g906 = (cwd, args) => {
    try { execFS906('git', ['-C', cwd, ...args], { stdio: ['ignore', 'ignore', 'ignore'], env: GIT_ENV906 }); return true; }
    catch (_) { return false; }
  };
  const lexists906 = p => { try { fs.lstatSync(p); return true; } catch (_) { return false; } };
  const cleanup906 = fx => { try { fs.rmSync(fx.base, { recursive: true, force: true }); } catch (_) {} };
  const state906 = (project, wtRoot, mainRoot, status) => [
    '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: ' + status, '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'runtime: claude', 'step: start', '',
    '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink', 'branch: workflow/' + project, 'base_branch: main', 'issue_number: 906',
    'sink: merge', 'run_posture: worktree', 'worktree_path: ' + wtRoot,
    'main_root: ' + mainRoot, 'session_marker: fixture-906', 'claim_ts: 2026-01-01T00:00:00Z', ''
  ].join('\n');

  // One CLI drive. OFFLINE is set EXPLICITLY on every leg including the controls, so it is provably
  // not what arms or silences the comparison under test: C1 below refuses under this exact value.
  function runClaim906(claimScript, cwd, argv) {
    // spawn-class: durable-handoff
    const r = spawnS906(process.execPath, [claimScript, ...argv], {
      cwd, encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, GIT_ENV906, {
        KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      }),
    });
    let json = null;
    try {
      const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
      if (lines.length) json = JSON.parse(lines[lines.length - 1]);
    } catch (_) {}
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
  }

  // ============================================================================================
  // ROUTE 2 — a linked-worktree `release` where main's live folder holds ONE extra entry, and the
  // axis is that entry's KIND. mk910 above plants regular files only; this plants the kinds that
  // reduce to no bytes, which is the whole subject.
  // ============================================================================================
  function mk906r2(project, rel, kind) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-906r2-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });
    g906(mainRoot, ['init', '-b', 'main']);
    g906(mainRoot, ['config', 'user.email', 't@t.com']);
    g906(mainRoot, ['config', 'user.name', 'Test']);
    g906(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'README.md'), 'fixture\n');
    g906(mainRoot, ['add', '-A']);
    g906(mainRoot, ['commit', '-m', 'chore: init']);
    g906(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);
    const text = state906(project, wtRoot, mainRoot, 'active');
    // BOTH live copies hold the same two files; the plant below is the only difference.
    for (const root of [wtRoot, mainRoot]) {
      const d = path.join(root, 'kaola-workflow', project);
      fs.mkdirSync(path.join(d, '.cache'), { recursive: true });
      fs.writeFileSync(path.join(d, 'workflow-state.md'), text);
      fs.writeFileSync(path.join(d, '.cache', 'shared.md'), '# held by both copies\n');
    }
    const mainProjDir = path.join(mainRoot, 'kaola-workflow', project);
    let entryAbs = null;
    if (kind) {
      entryAbs = path.join(mainProjDir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(entryAbs), { recursive: true });
      if (kind === 'file') fs.writeFileSync(entryAbs, '# main only\n');
      else if (kind === 'symlink') fs.symlinkSync(path.join(mainProjDir, '.cache', 'shared.md'), entryAbs);
      else if (kind === 'dangling') fs.symlinkSync(path.join(mainProjDir, 'NO-SUCH-TARGET'), entryAbs);
      else if (kind === 'fifo') execFS906('mkfifo', [entryAbs]);
      else if (kind === 'emptydir') fs.mkdirSync(entryAbs, { recursive: true });
      else throw new Error('unknown plant kind ' + kind);
    }
    return { base, mainRoot, wtRoot, project, mainProjDir,
      wtProjDir: path.join(wtRoot, 'kaola-workflow', project), entryAbs, rel, kind };
  }

  // THE TABLE. Three `archive` legs and five `refuse` legs, and the archive legs are as load-bearing
  // as the refuse ones: a blanket refusal would satisfy every `refuse` row and is a broken `release`.
  const LEGS_906R2 = [
    { name: 'C0_clean', rel: null, kind: null, expect: 'archive',
      why: 'nothing is main-only — a clean linked release must still archive at exit 0' },
    { name: 'C1_main_only_file', rel: '.cache/EXTRA.md', kind: 'file', expect: 'refuse',
      why: 'an ORDINARY main-only file. This is the POSITIVE CONTROL for the environment: it refuses '
        + 'under the identical KAOLA_WORKFLOW_OFFLINE=1 every other leg runs under, so the offline '
        + 'flag is demonstrably not what arms or silences the comparison' },
    { name: 'R2_top_symlink', rel: 'extra-link.txt', kind: 'symlink', expect: 'refuse',
      why: 'a main-only SYMLINK at top level — reduces to no bytes, so it appeared in no half of the '
        + 'comparison and was deleted at exit 0' },
    { name: 'R4_sidecar_symlink', rel: '.cache/final-validation.md', kind: 'symlink', expect: 'refuse',
      why: 'a main-only symlink under an EXEMPT SIDECAR name — the incident shape. Both the byte '
        + 'comparison and the sidecar presence re-check are blind to it, so it is the leg that needs '
        + 'the entry-kind fault to be named as such' },
    { name: 'R5_dangling', rel: 'mission-list.md', kind: 'dangling', expect: 'refuse',
      why: 'a DANGLING symlink — no target, therefore no bytes, therefore invisible to a comparison '
        + 'that only weighs bytes. The name is the ADR 0017 run record itself' },
    { name: 'R6_fifo', rel: 'pipe.md', kind: 'fifo', expect: 'refuse',
      why: 'a FIFO — the same class reached by a different entry kind, so the guard cannot be a '
        + 'symlink special case' },
    // ---- the empty-directory question, SETTLED. See the long note at the assertion below.
    { name: 'P1_empty_dir', rel: 'empty-evidence', kind: 'emptydir', expect: 'archive',
      why: 'a main-only EMPTY directory carries zero bytes and git cannot represent it at all, so '
        + 'there is nothing a refusal would be protecting' },
    { name: 'P2_dir_with_content', rel: 'deep-dir/inner.md', kind: 'file', expect: 'refuse',
      why: 'THE BOUND on the row above: a main-only directory that holds anything DOES refuse, naming '
        + 'the file inside it. The acceptance is scoped to "zero bytes", never to "directories"' },
  ];

  for (const [edName, claimScript] of EDITIONS_906) {
    if (!fs.existsSync(claimScript)) {
      assert(false, '#906(R2 ' + edName + '): the edition claim script exists at ' + claimScript);
      continue;
    }
    for (const leg of LEGS_906R2) {
      const label = '#906(R2 ' + edName + ' ' + leg.name + ')';
      const project = 'issue-9062' + Buffer.from(edName + leg.name).toString('hex').slice(0, 6);
      const fx = mk906r2(project, leg.rel, leg.kind);
      try {
        if (leg.kind) {
          assert(lexists906(fx.entryAbs),
            label + ' premise: the planted ' + leg.kind + ' must exist in MAIN\'s live folder before '
            + 'the run, or the leg measures nothing');
        }
        const r = runClaim906(claimScript, fx.wtRoot, ['release', '--project', fx.project, '--json']);
        const j = r.json || {};

        if (leg.expect === 'archive') {
          assert(r.status === 0 && j.released === true && j.archived === true,
            label + ': must still archive — ' + leg.why + '; got status=' + r.status
            + ' json=' + JSON.stringify(j) + ' stderr=' + String(r.stderr || '').slice(0, 300));
          assert(!fs.existsSync(fx.mainProjDir) && !fs.existsSync(fx.wtProjDir),
            label + ': and BOTH live copies are disposed of, as an ordinary release does');
          if (leg.name === 'P1_empty_dir') {
            // SETTLED, and recorded as ACCEPTED rather than left as a suspicion. A main-only empty
            // directory enters neither the walk's file map nor the invalid[] set, so no half of the
            // comparison can name it and the disposal deletes it silently — measured, exit 0, on the
            // no-mirror `release` route where no Step-8a mirror makes it moot.
            //
            // It is accepted because git cannot store an empty directory AT ALL. The archive band is
            // committed, so a preserved empty directory would vanish at the next commit and be absent
            // from every clone: preserving it would preserve something the durable record cannot
            // hold. Nothing is lost that could ever have been kept.
            //
            // What makes the acceptance safe is the P2 row directly below, not this reasoning: the
            // moment that directory holds ONE byte, the refusal fires and names it. If a future
            // change makes an empty directory meaningful, this pin is the place that has to change,
            // and it says so.
            assert(!lexists906(fx.entryAbs),
              label + ': the empty directory is deleted with the folder — pinned as KNOWN AND '
              + 'ACCEPTED, not as an oversight. If this ever starts surviving, read the note here '
              + 'before "fixing" the test');
            assert(!(Array.isArray(j.missing) && j.missing.length)
              && !(Array.isArray(j.mismatched) && j.mismatched.length),
              label + ': and it is named in nothing, which is the honest report for an entry with no '
              + 'bytes; got missing=' + JSON.stringify(j.missing) + ' mismatched=' + JSON.stringify(j.mismatched));
          }
        } else {
          assert(r.status === 1 && j.result === 'refuse' && j.reason === 'archive_incomplete',
            label + ': ' + leg.why + ' — the disposal must REFUSE; got status=' + r.status
            + ' json=' + JSON.stringify(j) + ' stderr=' + String(r.stderr || '').slice(0, 300));

          // THE REFUSAL MUST NAME WHAT IT REFUSED OVER. Before this bundle the release / watch-pr /
          // sweep routes reported `missing` only, so an entry-kind fault refused with an EMPTY list:
          // an operator told "archive_incomplete" and given nothing to look at. Either half may carry
          // it — which half is the implementer's — but SOME half must.
          const named = (Array.isArray(j.missing) ? j.missing : [])
            .concat(Array.isArray(j.mismatched) ? j.mismatched : []);
          assert(named.indexOf(leg.rel) >= 0,
            label + ': and NAME the entry it refused over. A refusal that lists nothing is one an '
            + 'operator cannot act on, and that is what shipped for these three no-mirror routes; got '
            + 'missing=' + JSON.stringify(j.missing) + ' mismatched=' + JSON.stringify(j.mismatched));

          // Nothing destroyed: the at-risk entry and BOTH live copies survive.
          assert(lexists906(fx.entryAbs),
            label + ': the at-risk entry survives the refusal — this is the entry that was being lost '
            + 'from everywhere at exit 0');
          assert(fs.existsSync(fx.mainProjDir) && fs.existsSync(fx.wtProjDir),
            label + ': and both live copies survive — the delete is all-or-nothing');
          assert(j.archived !== true,
            label + ': and the envelope must not claim it archived; got ' + JSON.stringify(j.archived));
        }
      } finally { cleanup906(fx); }
    }
  }

  // ============================================================================================
  // ROUTE 1 — the #395.4 crash backstop. The worktree's live folder is GONE (so archiveProjectDir is
  // source-missing), the archive under MAIN is already stamped closed, and MAIN's live folder
  // survived. The backstop must clear the phantom claim WITHOUT destroying what main still holds.
  //
  // Pinned as a RESULT: a file present only in main's live folder still exists somewhere afterwards,
  // and `status` from main reports no active folder. NOT pinned: the destination's name or its
  // timestamp format — those are the implementer's, and a pin on them rots.
  // ============================================================================================
  function mk906r1(project, mainOnlyRel, mainLiveAsSymlink) {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-906r1-')));
    const mainRoot = path.join(base, 'main');
    const wtRoot = path.join(base, 'wt');
    fs.mkdirSync(mainRoot, { recursive: true });
    g906(mainRoot, ['init', '-b', 'main']);
    g906(mainRoot, ['config', 'user.email', 't@t.com']);
    g906(mainRoot, ['config', 'user.name', 'Test']);
    g906(mainRoot, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(mainRoot, 'README.md'), 'fixture\n');
    g906(mainRoot, ['add', '-A']);
    g906(mainRoot, ['commit', '-m', 'chore: init']);
    g906(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, wtRoot]);

    // The archive under MAIN, already terminal-closed: the crash happened AFTER the rename.
    const archive = path.join(mainRoot, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(path.join(archive, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(archive, 'workflow-state.md'), state906(project, wtRoot, mainRoot, 'closed'));
    fs.writeFileSync(path.join(archive, '.cache', 'shared.md'), '# in both\n');

    // MAIN's live folder SURVIVED — this is what the backstop acts on. The worktree's is ABSENT,
    // which is what makes archiveProjectDir source-missing and reaches the backstop at all.
    const mainLive = path.join(mainRoot, 'kaola-workflow', project);
    const realLive = mainLiveAsSymlink ? path.join(base, 'elsewhere-live') : mainLive;
    fs.mkdirSync(path.join(realLive, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(realLive, 'workflow-state.md'), state906(project, wtRoot, mainRoot, 'active'));
    fs.writeFileSync(path.join(realLive, '.cache', 'shared.md'), '# in both\n');
    fs.writeFileSync(path.join(realLive, ...mainOnlyRel.split('/')), '# ONLY IN MAIN\n');
    if (mainLiveAsSymlink) {
      fs.mkdirSync(path.dirname(mainLive), { recursive: true });
      fs.symlinkSync(realLive, mainLive);
    }
    return { base, mainRoot, wtRoot, project, archive, mainLive, realLive, mainOnlyRel };
  }

  // Every file reachable under `dir`, as dir-relative paths. Directory-ness is decided by `statSync`,
  // which FOLLOWS symlinks, and that is deliberate: when main's live folder was itself a symlink the
  // backstop moves the LINK, so the rescued bytes are reachable THROUGH the orphan rather than copied
  // beneath it. A `withFileTypes` walk stops at the link and reports the rescue as a loss. Depth-capped
  // because following links means a cycle is representable.
  function walk906(dir, rel, out, depth) {
    if ((depth || 0) > 6) return out;
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) { return out; }
    for (const name of names) {
      const abs = path.join(dir, name);
      const r = rel ? rel + '/' + name : name;
      let isDir = false;
      try { isDir = fs.statSync(abs).isDirectory(); } catch (_) { isDir = false; }
      if (isDir) walk906(abs, r, out, (depth || 0) + 1); else out.push(r);
    }
    return out;
  }

  const MAIN_ONLY_906 = '.cache/ONLY-IN-MAIN.md';
  const LEGS_906R1 = [
    { name: 'L1_plain', extra: [], symlink: false, editions: null },
    { name: 'L2_keepworktree', extra: ['--keep-worktree'], symlink: false, editions: ['canonical'] },
    { name: 'L3_symlinked_main_live', extra: [], symlink: true, editions: ['canonical'] },
  ];

  for (const [edName, claimScript] of EDITIONS_906) {
    if (!fs.existsSync(claimScript)) continue;   // the R2 loop above already asserted existence
    for (const leg of LEGS_906R1) {
      if (leg.editions && leg.editions.indexOf(edName) < 0) continue;
      const label = '#906(R1 ' + edName + ' ' + leg.name + ')';
      const project = 'issue-9061' + Buffer.from(edName + leg.name).toString('hex').slice(0, 6);
      const fx = mk906r1(project, MAIN_ONLY_906, leg.symlink);
      try {
        assert(fs.existsSync(path.join(fx.realLive, ...MAIN_ONLY_906.split('/'))),
          label + ' premise: the main-only evidence file exists before the run');
        const r = runClaim906(claimScript, fx.wtRoot,
          ['finalize', '--project', fx.project, ...leg.extra, '--json']);
        const j = r.json || {};

        assert(r.status === 0 && j.status === 'closed',
          label + ': the crash-resume finalize still closes at exit 0 — nothing here refuses; got '
          + 'status=' + r.status + ' json=' + JSON.stringify(j && { status: j.status, reason: j.reason })
          + ' stderr=' + String(r.stderr || '').slice(0, 300));

        // (a) THE CLAIM IS CLEARED — measured from MAIN, not inferred from the folder being gone.
        assert(!lexists906(fx.mainLive),
          label + ': main no longer holds a live folder at kaola-workflow/<project>');
        const st = runClaim906(claimScript, fx.mainRoot, ['status', '--json']);
        assert(st.json && st.json.count === 0,
          label + ': and `status` FROM MAIN reports no active folder — the phantom claim a successor '
          + 'would resume is what the backstop exists to clear; got ' + JSON.stringify(st.json && st.json.count));

        // (b) NOTHING WAS DESTROYED. The result, not the destination's name: the bytes are still
        // readable somewhere under the archive authority.
        const archiveFiles = walk906(fx.archive, '', []);
        const survivors = archiveFiles.filter(p => p.endsWith(MAIN_ONLY_906.split('/').pop()));
        const survivedWithBytes = survivors.some(p => {
          try { return fs.readFileSync(path.join(fx.archive, ...p.split('/')), 'utf8').indexOf('ONLY IN MAIN') >= 0; }
          catch (_) { return false; }
        });
        assert(survivedWithBytes,
          label + ': the file only MAIN held must still be readable under the archive authority. '
          + 'Clearing the claim and destroying the folder are two different acts, and only the first '
          + 'was ever the goal; the archive now holds ' + JSON.stringify(archiveFiles.sort()));

        // (c) and the rescue must not create a SECOND archive authority the next resume trips over.
        const chk = runClaim906(claimScript, fx.wtRoot,
          ['finalize', '--project', fx.project, '--check', '--json']);
        assert(chk.json && chk.json.ok === true,
          label + ': `finalize --check` still answers ok afterwards — a rescue that made the next '
          + 'resume ambiguous would have traded one dead end for another; got '
          + JSON.stringify(chk.json && { ok: chk.json.ok, reasons: chk.json.reasons }));

        if (leg.symlink) {
          assert(fs.existsSync(path.join(fx.realLive, ...MAIN_ONLY_906.split('/'))),
            label + ': a SYMLINKED main live folder is moved as the link — the target directory and '
            + 'its bytes are left exactly where they were, never followed and deleted');
        }
      } finally { cleanup906(fx); }
    }
  }
}

spawnCensus.report();

if (failed > 0) {
  console.error('claim-hardening tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('claim-hardening tests passed (' + passed + ' assertions)');
}
