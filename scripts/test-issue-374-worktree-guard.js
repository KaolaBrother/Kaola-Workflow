#!/usr/bin/env node
'use strict';

// Issue #374: Kaola-Workflow calls Kaola Project Runner's read-only `worktree-guard` before its
// own `git worktree remove`. The guard is a mechanical dependency, not Skill prose:
//
//   - clear             -> remove as before (guard warnings[] are carried through)
//   - occupied          -> the ONLY hard block: keep the worktree, typed `worktree_occupied`
//   - cwd-unverifiable  -> remove, typed `worktree_cwd_unverifiable` warning (fail-open)
//   - locator/guard down-> remove, typed `worktree_guard_unavailable` warning with the repair route
//   - KPR not installed -> exactly the previous behavior (no hard dependency)
//
// The suite drives every claim edition's own `removeWorktree`, the stale/legacy cleanup CLIs, and
// asserts the sink copies only stop before checkout on an explicit `occupied` answer, while every
// infrastructure failure removes and reports a typed warning. A fake locator + fake
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

function writeFakeRunner(base, locatorReceipt, guardReceipt, exitCode, opts) {
  opts = opts || {};
  const bin = path.join(base, 'fake-bin');
  const runner = path.join(base, 'fake-kpr');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(runner, 'scripts'), { recursive: true });
  const locator = path.join(bin, 'kaola-project-runner-locate');
  const locatorBody = typeof locatorReceipt === 'string'
    ? locatorReceipt
    : 'printf \'%s\\n\' \'' + JSON.stringify(locatorReceipt).replace(/'/g, "'\\''") + '\'';
  fs.writeFileSync(locator, '#!/bin/sh\n' + locatorBody + '\n');
  fs.chmodSync(locator, 0o755);
  if (opts.omitDispatch !== true) {
    const dispatch = path.join(runner, 'scripts', 'kaola-dispatch.py');
    if (opts.rawDispatch) {
      fs.writeFileSync(dispatch, opts.rawDispatch);
    } else {
      const guardBody = typeof guardReceipt === 'string'
        ? guardReceipt
        : JSON.stringify(guardReceipt);
      fs.writeFileSync(dispatch, 'import sys\n'
        + 'sys.stdout.write(r\'\'\'' + guardBody + '\'\'\')\n'
        + 'sys.exit(' + exitCode + ')\n');
    }
  }
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

function assertRemovedWithWarning(result, fixture, guardReason, code, label) {
  assert(result && result.removed === true, label + ': must remove (fail-open), got '
    + JSON.stringify(result));
  assert(!fs.existsSync(fixture.wt), label + ': worktree directory must be gone');
  assert(!git(fixture.root, 'worktree', 'list', '--porcelain').includes(fixture.wt),
    label + ': registration must be gone');
  assert(result && Array.isArray(result.warnings) && result.warnings.length === 1,
    label + ': exactly one warning, got ' + JSON.stringify(result && result.warnings));
  const warning = result && result.warnings && result.warnings[0];
  assert(warning && warning.code === code, label + ': warning code ' + code + ', got '
    + (warning && warning.code));
  assert(warning && warning.guard_reason === guardReason, label + ': guard_reason ' + guardReason
    + ', got ' + (warning && warning.guard_reason));
  assert(warning && warning.path === fixture.wt, label + ': warning names the removed worktree');
  assert(warning && String(warning.detail || '').length > 0, label + ': warning detail');
  assert(warning && String(warning.recovery || '').length > 0, label + ': warning recovery route');
  return warning;
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

  // cwd-unverifiable -> fail-open: remove, warn, keep neither the tree nor a hard block
  {
    const fixture = makeRepo('unverifiable-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-unverifiable-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        unverifiableReceipt(fixture.wt), 3);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      const warning = assertRemovedWithWarning(result, fixture, 'cwd-unverifiable',
        'worktree_cwd_unverifiable', edition.name + ' unverifiable');
      assert(/could not verify cwd occupancy/i.test(warning.detail),
        edition.name + ': unverifiable detail');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // Every locator/guard infrastructure failure -> fail-open + typed warning with a repair route.
  const failureCases = [
    { tag: 'locator-failed',
      locator: () => 'echo "locator boom" >&2\nexit 7',
      guardReason: 'locator-failed',
      route: /kaola-project-runner-locate receipt[\s\S]*register --target local[\s\S]*install-local\.sh --bin-links/,
      detail: /locator boom/ },
    { tag: 'locator-refused',
      locator: () => ({ schema: 'kaola-project-runner-locator/1', result: 'refused',
        reasons: ['registration-stale'] }),
      guardReason: 'locator-refused',
      guardReasons: ['registration-stale'],
      route: /register --target local[\s\S]*install-local\.sh --bin-links/,
      detail: /registration-stale/ },
    { tag: 'locator-receipt-unreadable',
      locator: () => 'echo not-json',
      guardReason: 'locator-receipt-unreadable',
      route: /kaola-project-runner-locate receipt[\s\S]*register --target local/,
      detail: /not-json/ },
    { tag: 'guard-script-missing',
      locator: base => locatorOk(path.join(base, 'fake-kpr')),
      opts: { omitDispatch: true },
      guardReason: 'guard-script-missing',
      route: /scripts\/kaola-dispatch\.py[\s\S]*install-local\.sh --bin-links/,
      detail: /fake-kpr/ },
    { tag: 'guard-failed',
      locator: base => locatorOk(path.join(base, 'fake-kpr')),
      opts: { rawDispatch: 'import os, signal\nos.kill(os.getpid(), signal.SIGKILL)\n' },
      guardReason: 'guard-failed',
      route: /kaola-dispatch\.py[\s\S]*worktree-guard[\s\S]*install-local\.sh --bin-links/ },
    { tag: 'guard-receipt-unreadable',
      locator: base => locatorOk(path.join(base, 'fake-kpr')),
      guard: 'not-json-output',
      status: 0,
      guardReason: 'guard-receipt-unreadable',
      route: /kaola-dispatch\.py[\s\S]*worktree-guard/,
      detail: /not-json-output/ },
    { tag: 'guard-refused',
      locator: base => locatorOk(path.join(base, 'fake-kpr')),
      guard: { schema: 'kaola-worktree-remove/1', result: 'refused',
        reason: 'acp-state-unreadable', detail: 'the ACP record is unreadable',
        route: 'Repair the KPR ACP record, then retry.' },
      status: 2,
      guardReason: 'guard-refused',
      guardReasons: ['acp-state-unreadable'],
      route: /Repair the KPR ACP record[\s\S]*kaola-dispatch\.py[\s\S]*worktree-guard/,
      detail: /ACP record is unreadable/ },
    { tag: 'guard-unexpected-answer',
      locator: base => locatorOk(path.join(base, 'fake-kpr')),
      guard: { schema: 'kaola-worktree-remove/1', result: 'wat', probe: 'fake' },
      status: 0,
      guardReason: 'guard-unexpected-answer',
      route: /kaola-dispatch\.py[\s\S]*worktree-guard/,
      detail: /result=wat/ },
  ];
  for (const failure of failureCases) {
    const fixture = makeRepo('k2-' + failure.tag + '-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-k2-'));
    try {
      const fake = writeFakeRunner(fakeBase, failure.locator(fakeBase),
        failure.guard === undefined ? clearReceipt(fixture.wt) : failure.guard,
        failure.status || 0, failure.opts);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      const warning = assertRemovedWithWarning(result, fixture, failure.guardReason,
        'worktree_guard_unavailable', edition.name + ' ' + failure.tag);
      assert(failure.route.test(String(warning.recovery)),
        edition.name + ': ' + failure.tag + ' recovery route, got ' + warning.recovery);
      if (failure.detail) {
        assert(failure.detail.test(String(warning.detail)),
          edition.name + ': ' + failure.tag + ' detail, got ' + warning.detail);
      }
      if (failure.guardReasons) {
        assert(Array.isArray(warning.guard_reasons)
          && JSON.stringify(warning.guard_reasons) === JSON.stringify(failure.guardReasons),
          edition.name + ': ' + failure.tag + ' reason tokens, got '
          + JSON.stringify(warning.guard_reasons));
      }
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // A clear answer with guard-provided warnings still removes and carries the typed evidence.
  {
    const fixture = makeRepo('clear-warning-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-clear-warning-'));
    try {
      const receipt = clearReceipt(fixture.wt);
      receipt.warnings = [{ code: 'probe-degraded', path: fixture.wt,
        detail: 'one recorded row could not be probed', recovery: 'Inspect the KPR receipt.' }];
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        receipt, 0);
      const result = withPath(fake.path, () => requireEdition(edition).removeWorktree(
        fixture.root, 'issue-374', { worktree_path: fixture.wt }));
      assert(result && result.removed === true, edition.name + ': clear-with-warning removes');
      assert(Array.isArray(result.warnings) && result.warnings.length === 1
        && result.warnings[0].code === 'probe-degraded',
        edition.name + ': guard warning[] passthrough, got ' + JSON.stringify(result.warnings));
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // KPR absent -> exactly the previous behavior (no warning, no hard dependency)
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

  // stale-worktree-cleanup: a locator/guard failure removes and reports a typed warning.
  {
    const fixture = makeStaleFixture('stale-k2-' + edition.name, 374, edition.branch);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-stale-k2-'));
    try {
      const fake = writeFakeRunner(fakeBase,
        { schema: 'kaola-project-runner-locator/1', result: 'refused',
          reasons: ['registration-stale'] },
        clearReceipt(fixture.wt), 0);
      const run = runClaim(edition, ['stale-worktree-cleanup', '--execute'], fixture.root,
        fake.path);
      assert(run.status === 0, edition.name + ' stale k2 exit 0, got ' + run.status + ' '
        + run.stderr);
      assert(run.json && run.json.removed && run.json.removed.length === 1,
        edition.name + ' stale k2 removes, got ' + JSON.stringify(run.json));
      assert(run.json && Array.isArray(run.json.warnings) && run.json.warnings.length === 1,
        edition.name + ' stale k2 warning, got ' + JSON.stringify(run.json && run.json.warnings));
      const warning = run.json && run.json.warnings && run.json.warnings[0];
      assert(warning && warning.code === 'worktree_guard_unavailable'
        && warning.guard_reason === 'locator-refused',
        edition.name + ' stale k2 typed warning, got ' + JSON.stringify(warning));
      assert(warning && /register --target local/.test(String(warning.recovery)),
        edition.name + ' stale k2 recovery route');
      assert(!fs.existsSync(fixture.wt), edition.name + ' stale k2 deletes the worktree');
    } finally {
      cleanup(fixture);
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }

  // legacy-worktree-cleanup: a missing guard script removes and reports a typed warning.
  {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-legacy-k2-'));
    const root = path.join(base, 'repo');
    fs.mkdirSync(root);
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'i374@example.invalid');
    git(root, 'config', 'user.name', 'Issue 374');
    fs.writeFileSync(path.join(root, 'README.md'), '# legacy k2\n');
    git(root, 'add', 'README.md');
    git(root, 'commit', '-q', '-m', 'base');
    const wt = path.join(base, 'repo.kw', 'issue-55');
    git(root, 'worktree', 'add', '-q', '-b', 'workflow/' + edition.branch + '55', wt);
    const fakeBase = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-i374-fake-legacy-k2-'));
    try {
      const fake = writeFakeRunner(fakeBase, locatorOk(path.join(fakeBase, 'fake-kpr')),
        clearReceipt(wt), 0, { omitDispatch: true });
      const run = runClaim(edition, ['legacy-worktree-cleanup', '--execute'], root, fake.path);
      assert(run.status === 0, edition.name + ' legacy k2 exit 0, got ' + run.status + ' '
        + run.stderr);
      assert(run.json && run.json.removed && run.json.removed.length === 1,
        edition.name + ' legacy k2 removes, got ' + JSON.stringify(run.json));
      assert(run.json && Array.isArray(run.json.warnings) && run.json.warnings.length === 1,
        edition.name + ' legacy k2 warning, got ' + JSON.stringify(run.json && run.json.warnings));
      const warning = run.json && run.json.warnings && run.json.warnings[0];
      assert(warning && warning.code === 'worktree_guard_unavailable'
        && warning.guard_reason === 'guard-script-missing',
        edition.name + ' legacy k2 typed warning, got ' + JSON.stringify(warning));
      assert(warning && /install-local\.sh --bin-links/.test(String(warning.recovery)),
        edition.name + ' legacy k2 recovery route');
      assert(!fs.existsSync(wt), edition.name + ' legacy k2 deletes the worktree');
    } finally {
      try { git(root, 'worktree', 'remove', '--force', '--', wt); } catch (_) {}
      fs.rmSync(base, { recursive: true, force: true });
      fs.rmSync(fakeBase, { recursive: true, force: true });
    }
  }
}

// --- C. source contracts: only occupied hard-blocks; every failure is a typed warning ---------
for (const edition of EDITIONS) {
  const claimSrc = fs.readFileSync(path.join(repoRoot, edition.claim), 'utf8');
  assert(claimSrc.includes('function kprWorktreeGuard('), edition.name + ': claim carries the guard');
  assert(claimSrc.includes('function kprRecoveryRoute('), edition.name + ': claim carries recovery routes');
  assert(claimSrc.includes('function kprGuardWarnings('), edition.name + ': claim consumes guard warnings[]');
  assert(claimSrc.includes('function kprUnavailableWarning('), edition.name + ': claim types infrastructure failures');
  for (const subtype of ['locator-failed', 'locator-refused', 'locator-receipt-unreadable',
    'guard-script-missing', 'guard-failed', 'guard-receipt-unreadable', 'guard-refused',
    'guard-unexpected-answer']) {
    assert(claimSrc.includes("case '" + subtype + "':"),
      edition.name + ': recovery route maps ' + subtype);
  }
  assert(claimSrc.includes('only an explicit `occupied` answer is a hard block'),
    edition.name + ': only occupied hard-blocks');
  assert(claimSrc.includes("wtResult.reason === 'worktree_occupied'"),
    edition.name + ': finalize refuses only an occupied worktree');
  assert(claimSrc.includes('worktree_warnings'), edition.name + ': finalize carries worktree warnings');
  assert(claimSrc.includes('buckets.warnings.push'), edition.name + ': cleanup carries worktree warnings');
  assert(claimSrc.includes("code: 'worktree_cwd_unverifiable'"),
    edition.name + ': unverifiable is a warning, not a refusal');

  const sinkSrc = fs.readFileSync(path.join(repoRoot, edition.sink), 'utf8');
  // #374/K1: the dev-worktree teardown keeps its typed refusal, but ONLY for an explicit
  // `occupied` answer. It must carry occupants, route and warnings, precede the dirty re-probe,
  // and keep the branch because the worktree still checks it out.
  const k1 = sinkSrc.indexOf('answer keeps the dev worktree');
  const k1Tail = sinkSrc.slice(k1);
  assert(k1 > 0, edition.name + ': sink dev cleanup carries the K1 typed refusal');
  assert(sinkSrc.includes("wtRes.reason === 'worktree_occupied'"),
    edition.name + ': sink dev cleanup hard-blocks only occupied');
  assert(k1Tail.includes("result: 'refused'")
    && k1Tail.includes('reason: wtRes.reason')
    && k1Tail.includes('occupants: Array.isArray(wtRes.occupants)')
    && k1Tail.includes("route: wtRes.route || ''")
    && k1Tail.includes('warnings: Array.isArray(wtRes.warnings)'),
    edition.name + ': sink dev cleanup names reason/occupants/route/warnings');
  const pre = sinkSrc.indexOf('answer stops the sink before checkout');
  const checkout = sinkSrc.indexOf("checkout', args.branch", pre);
  assert(pre > 0 && checkout > pre, edition.name + ': sink refusal precedes the branch checkout');
  assert(sinkSrc.indexOf('const worktreeRefused =') > k1,
    edition.name + ': sink maps the dev cleanup object to a kept branch');
  assert(sinkSrc.includes('worktreeRefused ? worktreeCleanup.reason : worktreeCleanup'),
    edition.name + ': sink reports the dev cleanup refusal reason');
  // Fail-open propagation: a successful removal carries its warnings into cleanup and the sink
  // envelope, while the pre-checkout removal only refuses an occupied answer.
  assert(sinkSrc.includes("wtResult.reason === 'worktree_occupied'"),
    edition.name + ': sink pre-checkout refuses only occupied');
  assert(sinkSrc.includes('cleanupSummary.worktree_warnings = wtRes.warnings'),
    edition.name + ': sink cleanup carries worktree warnings');
  assert(sinkSrc.includes('if (wtWarnings.length) emit.worktree_warnings = wtWarnings;'),
    edition.name + ': sink envelope carries worktree warnings');
  assert(sinkSrc.includes('postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch, testGate.result, wtWarnings)'),
    edition.name + ': sink threads warnings into postMergeCleanup');
}

if (selectedSink && selectedSink !== activeEdition.sink) {
  console.error('note: --sink ' + selectedSink + ' differs from the selected edition; source checks cover all four');
}

if (failed) {
  console.error('\n' + failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log('test-issue-374-worktree-guard: PASS (' + passed + ' assertions, edition ' + activeEdition.name + ')');
