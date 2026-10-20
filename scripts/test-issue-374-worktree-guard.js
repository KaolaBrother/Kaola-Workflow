#!/usr/bin/env node
'use strict';

// Issue #374: Kaola-Workflow calls Kaola Project Runner's read-only `worktree-guard` before its
// own `git worktree remove`. The guard is a mechanical dependency, not Skill prose:
//
//   - clear            -> remove as before
//   - occupied         -> keep the worktree, typed `worktree_occupied` with occupants + route
//   - cwd-unverifiable -> keep the worktree (fail-closed), typed `worktree_cwd_unverifiable`
//   - guard unavailable-> keep the worktree, typed `worktree_guard_unavailable`
//   - KPR not installed-> exactly the previous behavior (no hard dependency)
//
// The suite drives every claim edition's own `removeWorktree`, the stale/legacy cleanup CLIs, and
// asserts the sink copies stop before checkout on a guard refusal. A fake locator + fake
// `kaola-dispatch.py` keep the test hermetic; no real Runner installation or live session is used.
//
// `--claim <path> --sink <path>` selects the edition whose cleanup CLIs run. The direct
// `removeWorktree` checks always cover all four editions, so one chain catches a missed hand-port.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const EDITIONS = [
  { name: 'claude', branch: 'issue-', claim: 'scripts/kaola-workflow-claim.js',
    sink: 'scripts/kaola-workflow-sink-merge.js' },
  { name: 'codex', branch: 'issue-', claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    sink: 'plugins/kaola-workflow/scripts/kaola-workflow-sink-merge.js' },
  { name: 'gitlab', branch: 'gitlab-issue-',
    claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    sink: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-merge.js' },
  { name: 'gitea', branch: 'gitea-issue-',
    claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    sink: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-merge.js' },
];

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) passed++;
  else { failed++; console.error('FAIL: ' + message); }
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

const selectedClaim = argValue('--claim');
const selectedSink = argValue('--sink');
const activeEdition = EDITIONS.find(ed => ed.claim === selectedClaim) || EDITIONS[0];
if (selectedClaim && !EDITIONS.some(ed => ed.claim === selectedClaim)) {
  console.error('FAIL: unknown --claim path: ' + selectedClaim);
  process.exit(1);
}

function git(root, ...argv) {
  // spawn-class: environment
  const run = spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error('git ' + argv.join(' ') + ' failed: ' + (run.stderr || ''));
  return String(run.stdout || '');
}

function makeRepo(tag, issue, branchPrefix) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-' + tag + '-'));
  const root = path.join(base, 'repo');
  fs.mkdirSync(root);
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'i374@example.invalid');
  git(root, 'config', 'user.name', 'Issue 374');
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-q', '-m', 'base');
  const wt = path.join(base, 'wt');
  git(root, 'worktree', 'add', '-q', '-b', 'workflow/' + branchPrefix + issue, wt);
  return { base, root, wt };
}

function cleanup(fixture) {
  try {
    git(fixture.root, 'worktree', 'remove', '--force', '--', fixture.wt);
  } catch (_) {}
  try { fs.rmSync(fixture.base, { recursive: true, force: true }); } catch (_) {}
}

function realGit() {
  // spawn-class: environment
  const which = spawnSync('which', ['git'], { encoding: 'utf8' });
  const found = String(which.stdout || '').trim();
  return found || '/usr/bin/git';
}

function isolatedPath() {
  // No directory here holds kaola-project-runner-locate: the real one lives in the developer's
  // bin dir, and this is the "KPR absent" environment.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-path-'));
  fs.symlinkSync(realGit(), path.join(dir, 'git'));
  return { dir, value: dir + path.delimiter + '/usr/bin' + path.delimiter + '/bin' };
}

function writeFakeRunner(base, locatorReceipt, guardReceipt, exitCode) {
  const bin = path.join(base, 'fake-bin');
  const runner = path.join(base, 'fake-kpr');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(runner, 'scripts'), { recursive: true });
  const locator = path.join(bin, 'kaola-project-runner-locate');
  fs.writeFileSync(locator, '#!/bin/sh\nprintf \'%s\\n\' \''
    + JSON.stringify(locatorReceipt).replace(/'/g, "'\\''") + '\'\n');
  fs.chmodSync(locator, 0o755);
  const dispatch = path.join(runner, 'scripts', 'kaola-dispatch.py');
  fs.writeFileSync(dispatch, 'import sys\n'
    + 'sys.stdout.write(r\'\'\'' + JSON.stringify(guardReceipt) + '\'\'\')\n'
    + 'sys.exit(' + exitCode + ')\n');
  return { bin, runner, path: bin + path.delimiter + process.env.PATH };
}

function withPath(value, fn) {
  const saved = process.env.PATH;
  process.env.PATH = value;
  try { return fn(); } finally { process.env.PATH = saved; }
}

function locatorOk(runner) {
  return { schema: 'kaola-project-runner-locator/1', result: 'ok', root: { path: runner } };
}

function clearReceipt(target) {
  return { schema: 'kaola-worktree-remove/1', repo: path.dirname(target), path: target,
    result: 'clear', occupants: [], probe: 'fake' };
}

function occupiedReceipt(target) {
  const occupants = [
    { pid: 101, ppid: 1, exe_basename: 'zsh', cwd: target, cwd_deleted: false,
      source: 'process', session: { platform: 'codex', session: 'codex-KT-host', role: 'host',
        holder_instance_id: 'h-host' } },
    { pid: 202, ppid: 1, exe_basename: 'zsh', cwd: target, cwd_deleted: false,
      source: 'process', session: { platform: 'codex', session: 'codex-KT-sideagent',
        role: 'sideagent', holder_instance_id: 'h-side' } },
    { pid: null, ppid: null, exe_basename: null, cwd: target, cwd_deleted: false,
      source: 'recorded', session: { platform: 'codex', session: 'codex-KT-seat', role: 'worker',
        holder_instance_id: 'h-seat' } },
  ];
  return { schema: 'kaola-worktree-remove/1', repo: path.dirname(target), path: target,
    result: 'occupied', occupants, route: 'Move the shell out of ' + target
      + ' or stop that seat, then rerun.', probe: 'fake' };
}

function unverifiableReceipt(target) {
  return { schema: 'kaola-worktree-remove/1', repo: path.dirname(target), path: target,
    result: 'unverifiable', occupants: [], route: 'The cwd probe is unavailable; keep and inspect.',
    probe: 'none' };
}

function requireEdition(edition) {
  return require(path.join(repoRoot, edition.claim));
}

function assertKept(result, fixture, reason, label) {
  assert(result && result.removed === false, label + ': must not remove, got ' + JSON.stringify(result));
  assert(result && result.reason === reason, label + ': expected reason ' + reason + ', got '
    + (result && result.reason));
  assert(fs.existsSync(fixture.wt), label + ': worktree must survive');
  assert(git(fixture.root, 'worktree', 'list', '--porcelain').includes(fixture.wt),
    label + ': registration must survive');
}

// --- A. every edition's own removeWorktree ------------------------------------------------
for (const edition of EDITIONS) {
  // clear
  {
    const fixture = makeRepo('clear-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-clear-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        clearReceipt(fixture.wt), 0);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      assert(result && result.removed === true, edition.name + ': clear must remove, got '
        + JSON.stringify(result));
      assert(!fs.existsSync(fixture.wt), edition.name + ': clear must delete the directory');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // occupied -> typed keep with occupants (Host + Sideagent + seat) and route
  {
    const fixture = makeRepo('occupied-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-occupied-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        occupiedReceipt(fixture.wt), 3);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      assertKept(result, fixture, 'worktree_occupied', edition.name + ' occupied');
      assert(result && result.guard === 'kaola-project-runner/worktree-guard',
        edition.name + ': guard marker');
      assert(result && Array.isArray(result.occupants) && result.occupants.length === 3,
        edition.name + ': occupants carried');
      assert(result && /host/.test(JSON.stringify(result.occupants[0].session))
        && /sideagent/.test(JSON.stringify(result.occupants[1].session))
        && /worker/.test(JSON.stringify(result.occupants[2].session)),
        edition.name + ': Host, Sideagent and seat each carried');
      assert(result && /rewritten|Move the shell|stop that seat/.test(String(result.route)),
        edition.name + ': route carried');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // cwd-unverifiable -> typed fail-closed keep
  {
    const fixture = makeRepo('unverifiable-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-unverifiable-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        unverifiableReceipt(fixture.wt), 3);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      assertKept(result, fixture, 'worktree_cwd_unverifiable', edition.name + ' unverifiable');
      assert(result && result.occupants.length === 0, edition.name + ': unverifiable has no occupants');
      assert(result && String(result.route).length > 0, edition.name + ': unverifiable route');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // locator present but refused -> typed fail-closed keep
  {
    const fixture = makeRepo('refused-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-refused-'));
    try {
      const fake = writeFakeRunner(fakeBase,
        { schema: 'kaola-project-runner-locator/1', result: 'refused', reasons: ['registration-stale'] },
        clearReceipt(fixture.wt), 0);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      assertKept(result, fixture, 'worktree_guard_unavailable', edition.name + ' locator-refused');
      assert(result && String(result.route).length > 0, edition.name + ': unavailable route');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // KPR absent -> exactly the previous behavior
  {
    const fixture = makeRepo('absent-' + edition.name, 374, edition.branch);
    const stub = isolatedPath();
    try {
      const result = withPath(stub.value, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      assert(result && result.removed === true, edition.name + ': absent KPR must remove as today, got '
        + JSON.stringify(result));
      assert(!fs.existsSync(fixture.wt), edition.name + ': absent KPR leaves no directory');
    } finally {
      cleanup(fixture);
      fs.rmSync(stub.dir, { recursive: true, force: true });
    }
  }
}

// --- B. the cleanup CLIs keep the worktree on a guard refusal ------------------------------
function makeStaleFixture(tag, issue, branchPrefix) {
  const fixture = makeRepo(tag, issue, branchPrefix);
  const wt = path.join(fixture.root, '.kw', 'worktrees', 'issue-' + issue);
  git(fixture.root, 'worktree', 'remove', '--force', '--', fixture.wt);
  git(fixture.root, 'worktree', 'add', '-q', wt, 'workflow/' + branchPrefix + issue);
  fs.mkdirSync(path.join(fixture.root, 'kaola-workflow', 'archive', 'issue-' + issue),
    { recursive: true });
  fs.writeFileSync(path.join(fixture.root, 'kaola-workflow', 'archive', 'issue-' + issue,
    'finalization-summary.md'), '# archived\n');
  fixture.wt = wt;
  return fixture;
}

function runClaim(edition, argv, cwd, fakePath) {
  // spawn-class: cli-contract
  const run = spawnSync(process.execPath, [path.join(repoRoot, edition.claim), ...argv], {
    cwd,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      PATH: fakePath,
      KAOLA_WORKFLOW_OFFLINE: '1',
      KAOLA_GH_REMOTE_TIMEOUT_MS: '5000',
    }),
  });
  let parsed = null;
  try { parsed = JSON.parse(String(run.stdout || '').trim()); } catch (_) {}
  return { status: run.status, stdout: String(run.stdout || ''), stderr: String(run.stderr || ''),
    json: parsed };
}

for (const edition of [activeEdition]) {
  // stale-worktree-cleanup: occupied keeps, clear removes on the second run
  {
    const fixture = makeStaleFixture('stale-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-stale-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        occupiedReceipt(fixture.wt), 3);
      const first = runClaim(edition, ['stale-worktree-cleanup', '--execute'], fixture.root, fake.path);
      assert(first.status === 0, edition.name + ' stale occupied exit 0, got ' + first.status
        + ' ' + first.stderr);
      assert(first.json && Array.isArray(first.json.skipped_occupied)
        && first.json.skipped_occupied.length === 1, edition.name + ' stale skipped_occupied, got '
        + JSON.stringify(first.json));
      assert(first.json && first.json.removed && first.json.removed.length === 0,
        edition.name + ' stale must remove nothing');
      assert(fs.existsSync(fixture.wt), edition.name + ' stale worktree survives');
      const entry = first.json && first.json.skipped_occupied && first.json.skipped_occupied[0];
      assert(entry && entry.reason === 'worktree_occupied' && entry.occupants.length === 3
        && entry.route, edition.name + ' stale typed entry');

      const clearFake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        clearReceipt(fixture.wt), 0);
      const second = runClaim(edition, ['stale-worktree-cleanup', '--execute'], fixture.root,
        clearFake.path);
      assert(second.status === 0, edition.name + ' stale clear exit 0, got ' + second.status
        + ' ' + second.stderr);
      assert(second.json && second.json.removed && second.json.removed.length === 1,
        edition.name + ' stale clear removes, got ' + JSON.stringify(second.json));
      assert(!fs.existsSync(fixture.wt), edition.name + ' stale clear deletes the worktree');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // legacy-worktree-cleanup: same guard, same typed keep
  {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-legacy-'));
    const root = path.join(base, 'repo');
    fs.mkdirSync(root);
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'i374@example.invalid');
    git(root, 'config', 'user.name', 'Issue 374');
    fs.writeFileSync(path.join(root, 'README.md'), '# legacy\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-q', '-m', 'base');
    const wt = path.join(base, 'repo.kw', 'issue-55');
    git(root, 'worktree', 'add', '-q', '-b', 'workflow/' + edition.branch + '55', wt);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-legacy-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        occupiedReceipt(wt), 3);
      const first = runClaim(edition, ['legacy-worktree-cleanup', '--execute'], root, fake.path);
      assert(first.status === 0, edition.name + ' legacy occupied exit 0, got ' + first.status
        + ' ' + first.stderr);
      assert(first.json && first.json.skipped_occupied
        && first.json.skipped_occupied.length === 1, edition.name + ' legacy skipped_occupied, got '
        + JSON.stringify(first.json));
      assert(fs.existsSync(wt), edition.name + ' legacy worktree survives');

      const clearFake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        clearReceipt(wt), 0);
      const second = runClaim(edition, ['legacy-worktree-cleanup', '--execute'], root,
        clearFake.path);
      assert(second.status === 0, edition.name + ' legacy clear exit 0, got ' + second.status
        + ' ' + second.stderr);
      const removedPaths = (second.json && second.json.removed) || [];
      assert(second.json && removedPaths.length === 1
        && path.basename(removedPaths[0]) === path.basename(wt),
        edition.name + ' legacy clear removes, got ' + JSON.stringify(second.json));
      assert(!fs.existsSync(wt), edition.name + ' legacy clear deletes the worktree');
    } finally {
      try { git(root, 'worktree', 'remove', '--force', '--', wt); } catch (_) {}
      fs.rmSync(base, { recursive: true, force: true });
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }
}

// --- C. sink copies stop before checkout; finalize copies emit the typed refusal -----------
for (const edition of EDITIONS) {
  const claimSrc = fs.readFileSync(path.join(repoRoot, edition.claim), 'utf8');
  assert(claimSrc.includes('function kprWorktreeGuard('), edition.name + ': claim carries the guard');
  assert(claimSrc.includes('skipped_occupied'), edition.name + ': cleanup buckets carry the typed keep');
  assert(claimSrc.includes('worktree_guard_unavailable'), edition.name + ': claim handles an unavailable guard');
  assert(claimSrc.includes("status: 'refused'"), edition.name + ': finalize emits a typed refusal');

  const sinkSrc = fs.readFileSync(path.join(repoRoot, edition.sink), 'utf8');
  const typed = sinkSrc.indexOf('worktree_guard_unavailable');
  const checkout = sinkSrc.indexOf("checkout', args.branch", typed);
  assert(typed > 0, edition.name + ': sink handles the guard refusal');
  assert(checkout > typed, edition.name + ': sink refusal precedes the branch checkout');
  assert(sinkSrc.includes('occupants: wtResult.occupants || []'),
    edition.name + ': sink carries occupants');
}

if (selectedSink && selectedSink !== activeEdition.sink) {
  console.error('note: --sink ' + selectedSink + ' differs from the selected edition; source checks cover all four');
}

if (failed) {
  console.error('\n' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-issue-374-worktree-guard: PASS (' + passed + ' assertions, edition ' + activeEdition.name + ')');
