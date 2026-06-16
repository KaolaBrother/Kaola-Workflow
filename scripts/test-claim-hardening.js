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

const { ghExec, isSafeBranchArg, removeBranch, postAdvisoryClaim, defaultBranch } = require('./kaola-workflow-claim.js');
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
      KAOLA_ENABLE_ADAPTIVE: 'true',
      KAOLA_PATH: 'adaptive',
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
  // Put an adaptive config so adaptive path is truly enabled
  const kwCfgDir = path.join(repoDir, '.config', 'kaola-workflow');
  fs.mkdirSync(kwCfgDir, { recursive: true });
  fs.writeFileSync(path.join(kwCfgDir, 'config.json'), JSON.stringify({ enable_adaptive: true }));

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

  // --- (c) determinate non-zero NOT retried (bundle path — also tests result:refuse) ---
  {
    const counterFile = path.join(tmpMockDir, 'counter-c-bundle.txt');
    fs.writeFileSync(counterFile, '0');
    // Mock: always exits with code 1 (clean non-zero) emitting a red verdict JSON
    const mockScript = path.join(tmpMockDir, 'mock-c-bundle.js');
    fs.writeFileSync(mockScript,
      'const fs = require("fs");\n' +
      'const count = parseInt(fs.readFileSync(' + JSON.stringify(counterFile) + ', "utf8") || "0", 10) + 1;\n' +
      'fs.writeFileSync(' + JSON.stringify(counterFile) + ', String(count));\n' +
      'process.stdout.write(JSON.stringify({ verdict: "red", reasoning: "blocked by policy" }) + "\\n");\n' +
      'process.exit(1);\n'  // clean non-zero: subprocess ran and decided
    );
    const r = runClaim(['startup', '--target-issues', '83,143'], { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockScript }, repoDir);
    const cnt = parseInt(fs.readFileSync(counterFile, 'utf8') || '0', 10);
    // The determinate non-zero exit maps to target_set_unavailable (the clean_nonzero branch returns verdict:'target_unavailable',
    // which bundle maps to status:'target_set_unavailable' with result:'refuse').
    assert(r.json && (r.json.status === 'target_set_unavailable' || r.json.status === 'target_set_red'),
      '#495(c-bundle): determinate non-zero → target_set_unavailable or target_set_red (got status=' + (r.json && r.json.status) + ')');
    assert(r.json && r.json.result === 'refuse',
      '#495(c-bundle): determinate non-zero → result:refuse (got result=' + (r.json && r.json.result) + ')');
    assert(cnt === 1, '#495(c-bundle): determinate NOT retried — counter=' + cnt + ' (expected 1)');
  }

  fs.rmSync(tmpMockDir, { recursive: true, force: true });
  fs.rmSync(repoDir, { recursive: true, force: true });
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
    'name: issue-63\nissue_number: 63\nstatus: in_progress\nphase: 2\nnext_command: /kaola-workflow-phase2 issue-63\n');
  fs.writeFileSync(path.join(proj65, 'workflow-state.md'),
    'name: issue-65\nissue_number: 65\nstatus: in_progress\nphase: 3\nnext_command: /kaola-workflow-phase3 issue-65\n');

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
    'name: issue-65\nissue_number: 65\nstatus: in_progress\nphase: 3\nnext_command: /kaola-workflow-phase3 issue-65\n');
  const rExplicit = runResume(['--project', 'issue-65'], repo503);
  assert(rExplicit.code === 0,
    '#503(C): explicit --project must exit 0 (got code=' + rExplicit.code + ', json=' + JSON.stringify(rExplicit.json) + ')');
  assert(rExplicit.json && rExplicit.json.project === 'issue-65',
    '#503(C): explicit --project issue-65 must resume issue-65 (got ' + JSON.stringify(rExplicit.json) + ')');

  fs.rmSync(repo503, { recursive: true, force: true });
}

if (failed > 0) {
  console.error('claim-hardening tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('claim-hardening tests passed (' + passed + ' assertions)');
}
