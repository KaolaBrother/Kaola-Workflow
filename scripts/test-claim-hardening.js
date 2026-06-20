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
  JSON.stringify({ parallel_mode: 'auto', installed_paths: [] }, null, 2) + '\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

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

// --- #538: path-legality gate (adaptive default + installed_paths opt-in) -------
// REPLACES the retired #515 `path_requires_explicit_opt_in` guard. Under #538 there is no on/off
// switch: adaptive is the unconditional default and is ALWAYS legal; fast/full are legal ONLY when
// recorded in `installed_paths` in ~/.config/kaola-workflow/config.json. A named-but-not-installed
// path is a TYPED `path_not_installed` refusal (NEVER a silent adaptive substitution).
//
// Legality is driven by the HERMETIC HOME config (the sandbox seeded at the top of this file), NOT
// by env and NOT by any repo-local .config (claimProject reads os.homedir()). Each sub-test rewrites
// that HOME config via setHomeInstalled(...) before the spawn. KAOLA_ENABLE_ADAPTIVE is retired —
// no env lever survives. Distinct target-issue numbers avoid the `owned` early-return false-green.
{
  const { execFileSync: execFS538 } = require('child_process');
  const CLAIM538 = path.join(__dirname, 'kaola-workflow-claim.js');
  const homeCfg538 = path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json');

  // Rewrite the hermetic HOME config to record exactly `installedPaths` as installed (adaptive is
  // implicit-always and never listed). Restored to [] at the end so later blocks see the default.
  function setHomeInstalled(installedPaths) {
    fs.writeFileSync(homeCfg538, JSON.stringify({ parallel_mode: 'auto', installed_paths: installedPaths }, null, 2) + '\n');
  }

  function runClaim538(argv, extraEnv, cwd) {
    const e = Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_TIMEOUT_MS: '500',
      KAOLA_CLASSIFIER_BACKOFF_MS: '0'
    }, extraEnv || {});
    // KAOLA_PATH defaults to undefined so the claim's `|| 'adaptive'` default fires unless overridden.
    if (!('KAOLA_PATH' in (extraEnv || {}))) delete e.KAOLA_PATH;
    try {
      const out = execFS538('node', [CLAIM538, ...argv], { cwd, encoding: 'utf8', env: e });
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

  // Minimal git repo so worktree provisioning doesn't error on the legal-path (acquired) cases.
  const repo538 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-538-repo-')));
  const g538 = (a) => { try { execFS538('git', ['-C', repo538, ...a], { stdio: ['ignore', 'ignore', 'ignore'] }); } catch (_) {} };
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

  // (a) DEFAULT (no --workflow-path, no KAOLA_PATH) under installed_paths:[] → ACQUIRED (adaptive default).
  {
    setHomeInstalled([]);
    const r = runClaim538(
      ['startup', '--target-issue', '5380'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5380');
    assert(r.json && r.json.status === 'acquired',
      '#538(a): default (no path) must be acquired via adaptive (got ' + JSON.stringify(r.json) + ')');
  }

  // (b) KAOLA_PATH=fast under installed_paths:[] → REFUSE path_not_installed (fast not installed).
  {
    setHomeInstalled([]);
    const r = runClaim538(
      ['startup', '--target-issue', '5381'],
      { KAOLA_PATH: 'fast', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5381'); // guard REFUSES so no project dir is created; rmProj is defensive
    assert(r.json && r.json.status === 'path_not_installed' && r.json.result === 'refuse',
      '#538(b): fast under installed_paths:[] must refuse path_not_installed/refuse (got ' + JSON.stringify(r.json) + ')');
    assert(r.json && r.json.claim === 'none',
      '#538(b): path_not_installed must have claim:none (got ' + JSON.stringify(r.json) + ')');
  }

  // (c) KAOLA_PATH=fast under installed_paths:['fast'] → ACQUIRED (installed → legal).
  {
    setHomeInstalled(['fast']);
    const r = runClaim538(
      ['startup', '--target-issue', '5382'],
      { KAOLA_PATH: 'fast', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5382');
    assert(r.json && r.json.status === 'acquired',
      '#538(c): fast under installed_paths:[\'fast\'] must be acquired (got ' + JSON.stringify(r.json) + ')');
  }

  // (d) --workflow-path full under installed_paths:[] → REFUSE path_not_installed (full not installed).
  {
    setHomeInstalled([]);
    const r = runClaim538(
      ['startup', '--target-issue', '5383', '--workflow-path', 'full'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5383');
    assert(r.json && r.json.status === 'path_not_installed' && r.json.result === 'refuse',
      '#538(d): full under installed_paths:[] must refuse path_not_installed/refuse (got ' + JSON.stringify(r.json) + ')');
  }

  // (e) --workflow-path full under installed_paths:['full'] → ACQUIRED (installed → legal).
  {
    setHomeInstalled(['full']);
    const r = runClaim538(
      ['startup', '--target-issue', '5384', '--workflow-path', 'full'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5384');
    assert(r.json && r.json.status === 'acquired',
      '#538(e): full under installed_paths:[\'full\'] must be acquired (got ' + JSON.stringify(r.json) + ')');
  }

  // (f) explicit KAOLA_PATH=adaptive under installed_paths:[] → ACQUIRED (adaptive ALWAYS legal).
  {
    setHomeInstalled([]);
    const r = runClaim538(
      ['startup', '--target-issue', '5385'],
      { KAOLA_PATH: 'adaptive', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    rmProj538('5385');
    assert(r.json && r.json.status === 'acquired',
      '#538(f): explicit adaptive under installed_paths:[] must be acquired (got ' + JSON.stringify(r.json) + ')');
  }

  // (g) authoring-allowed is UNCONDITIONAL (no switch) — always allowed, even under installed_paths:[].
  {
    setHomeInstalled([]);
    const r = runClaim538(
      ['authoring-allowed', '--project', 'issue-5386'],
      { KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538 },
      repo538
    );
    assert(r.json && r.json.status === 'authoring_allowed' && r.json.allowed === true,
      '#538(g): authoring-allowed must be unconditionally allowed (got ' + JSON.stringify(r.json) + ')');
  }

  // (h) #550 OFFLINE-DETERMINISM REGRESSION GUARD — the path_not_installed refusal must make ZERO gh
  // invocations. The path-legality gate (claim.js claimProject ~:851) returns path_not_installed
  // BEFORE probeIssueState (~:866, the only gh-touching call in this flow), so a non-installed path
  // never reaches gh. This guard runs the #538(b) scenario WITHOUT KAOLA_WORKFLOW_OFFLINE (so ghExec
  // would actually shell the mock if the probe were reached) and points KAOLA_GH_MOCK_SCRIPT at a
  // mock that DROPS A SENTINEL FILE + EXITS NON-ZERO IF INVOKED. We assert (1) the result is still
  // path_not_installed/refuse and (2) the sentinel was never written — proving zero gh round-trips.
  // A regression that reorders the gate to probe-before-legality would fire the mock and fail here.
  {
    setHomeInstalled([]);
    const sentinel538 = path.join(tmpDir538, 'gh-invoked.sentinel');
    try { fs.rmSync(sentinel538, { force: true }); } catch (_) {}
    const ghBoomMock538 = path.join(tmpDir538, 'gh-boom.js');
    fs.writeFileSync(ghBoomMock538,
      'require(\'fs\').writeFileSync(' + JSON.stringify(sentinel538) + ', \'gh was invoked\');\n' +
      'process.stderr.write(\'gh mock invoked — path-legality gate did NOT short-circuit\\n\');\n' +
      'process.exit(1);\n'
    );
    const r = runClaim538(
      ['startup', '--target-issue', '5387'],
      // NOTE: KAOLA_WORKFLOW_OFFLINE explicitly EMPTIED so ghExec would shell the mock if reached.
      { KAOLA_WORKFLOW_OFFLINE: '', KAOLA_PATH: 'fast', KAOLA_CLASSIFIER_MOCK_SCRIPT: mockGreen538, KAOLA_GH_MOCK_SCRIPT: ghBoomMock538 },
      repo538
    );
    rmProj538('5387'); // guard REFUSES so no project dir is created; rmProj is defensive
    assert(r.json && r.json.status === 'path_not_installed' && r.json.result === 'refuse',
      '#550(h): a non-installed path still refuses path_not_installed even with no OFFLINE flag (got ' + JSON.stringify(r.json) + ')');
    assert(!fs.existsSync(sentinel538),
      '#550(h): ZERO gh invocations — the gh mock (exits non-zero if called) was never invoked; path-legality short-circuits before probeIssueState');
    try { fs.rmSync(sentinel538, { force: true }); } catch (_) {}
  }

  // Restore the hermetic HOME to the default-install shape so subsequent test blocks see adaptive-only.
  setHomeInstalled([]);
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
// Scenario C (N/A gate): no workflow-plan.md → gate skipped, finalize succeeds.
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
      'worktree_path: ' + wtRoot
    ].join('\n') + '\n');

    // (4) Write a minimal valid workflow-plan.md with a complete node covering impl.txt.
    //     This plan is committed on main at branch-creation (not on the feature branch) to keep
    //     `git diff main...HEAD` clean of the plan file itself. The plan's write-set covers
    //     impl.txt which IS committed on the feature branch below.
    const planContent = [
      '# Workflow Plan — ' + project,
      '',
      '## Meta',
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
      ''
    ].join('\n');

    // Freeze the plan to stamp a plan_hash (use validator --freeze).
    // Write plan to main first, then freeze.
    const planPath = path.join(mainProjDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, planContent);

    // Freeze via plan-validator so plan_hash is stamped (needed for --finalize-check).
    try {
      execFS522('node', [PLAN_VALIDATOR522, planPath, '--freeze', '--json'],
        { cwd: mainRoot, encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    } catch (_) { /* freeze may fail in this minimal repo; gate still needs the plan */ }

    // (5) Write the plan into the worktree project dir too.
    const wtPlanPath = path.join(projDir, 'workflow-plan.md');
    fs.writeFileSync(wtPlanPath, fs.readFileSync(planPath, 'utf8'));

    // (6) Write workflow-state.md into the worktree project dir.
    fs.writeFileSync(path.join(projDir, 'workflow-state.md'),
      fs.readFileSync(path.join(mainProjDir, 'workflow-state.md'), 'utf8'));

    // (7) Commit the plan + state + impl.txt onto the feature branch in main.
    //     impl.txt is an attributed change (declared in `impl` node's write_set).
    fs.writeFileSync(path.join(mainRoot, 'impl.txt'), 'implementation\n');
    g(mainRoot, ['add', '-A']);
    g(mainRoot, ['commit', '-m', 'feat: impl + plan for issue-522test']);

    // (8) Point the worktree gitdir at main (simulate git worktree linkage).
    //     For the gate we just need `git rev-parse HEAD` to resolve from the worktree.
    //     We use --git-dir pointing to main's .git to simulate a linked worktree.
    const mainGitDir = path.join(mainRoot, '.git');
    // Write a .git FILE (not dir) in wtRoot to point to main's worktrees dir.
    // This is a proper git worktree linkage simulation.
    const wtGitLinkDir = path.join(mainGitDir, 'worktrees', 'kw-522-wt');
    fs.mkdirSync(wtGitLinkDir, { recursive: true });
    // Write commondir to link back
    fs.writeFileSync(path.join(wtGitLinkDir, 'commondir'), '../..\n');
    fs.writeFileSync(path.join(wtGitLinkDir, 'gitdir'), path.join(wtRoot, '.git') + '\n');
    // Write the worktree HEAD to track same branch
    const headSha = spawnS522('git', ['-C', mainRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    fs.writeFileSync(path.join(wtGitLinkDir, 'HEAD'), headSha + '\n');
    // Write .git file in wt
    fs.writeFileSync(path.join(wtRoot, '.git'), 'gitdir: ' + path.join(wtGitLinkDir) + '\n');

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

  // --- #522 Scenario C: no workflow-plan.md → gate is N/A, finalize succeeds ---
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

      // Project folder with NO workflow-plan.md (non-adaptive run).
      const projDir = path.join(tmpC, 'kaola-workflow', project);
      fs.mkdirSync(projDir, { recursive: true });
      fs.writeFileSync(path.join(projDir, 'workflow-state.md'), [
        '# Kaola-Workflow State',
        '## Project', 'name: ' + project, 'status: active',
        '## Current Position', 'phase: 2', 'phase_name: Implementation',
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

      assert(r.status === 0,
        '#522(C): finalize with NO workflow-plan.md must succeed (gate N/A), got ' + r.status + '\nstderr: ' + (r.stderr || '').slice(0, 200));

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

if (failed > 0) {
  console.error('claim-hardening tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('claim-hardening tests passed (' + passed + ' assertions)');
}
