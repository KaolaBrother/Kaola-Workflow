#!/usr/bin/env node
'use strict';

// test-forge-guards.js — #1123 P1 fixture proof that each edition refuses a
// foreign-forge repo BEFORE its first forge CLI call, in both directions:
//
//   github.com repo   + gitea/gitlab claim  -> forge_mismatch, tea/glab never invoked
//   mapped gitea repo + github claim        -> forge_mismatch, gh never invoked
//
// The forge CLIs are replaced by recorder scripts; a recorder file that does not
// exist is the zero-call evidence. The same guard is checked on claim startup,
// claim resume, and the sink entries.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CLAIMS = {
  github: path.join(ROOT, 'scripts', 'kaola-workflow-claim.js'),
  codex: path.join(ROOT, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js'),
  gitlab: path.join(ROOT, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-claim.js'),
  gitea: path.join(ROOT, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js'),
};
const SINKS = {
  'sink-merge-github': path.join(ROOT, 'scripts', 'kaola-workflow-sink-merge.js'),
  'sink-merge-gitea': path.join(ROOT, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'),
  'sink-pr-github': path.join(ROOT, 'scripts', 'kaola-workflow-sink-pr.js'),
  'sink-pr-gitea': path.join(ROOT, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-pr.js'),
  'sink-mr-gitlab': path.join(ROOT, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-mr.js'),
  'sink-merge-gitlab': path.join(ROOT, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'),
  'sink-merge-codex': path.join(ROOT, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'),
  'sink-pr-codex': path.join(ROOT, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-pr.js'),
};

let passed = 0;
let failed = 0;
const temps = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.error('FAIL: ' + name + '\n  ' + (err && err.stack ? err.stack : err));
  }
}

function temp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function git(cwd, args) {
  // spawn-class: environment
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function makeRepo(origin) {
  const dir = temp('kw-fg-repo-');
  git(dir, ['init', '-q', '.']);
  git(dir, ['config', 'user.email', 'p1@example.invalid']);
  git(dir, ['config', 'user.name', 'P1']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', 'base']);
  git(dir, ['remote', 'add', 'origin', origin]);
  return dir;
}

function makeHome(forgeHosts) {
  const home = temp('kw-fg-home-');
  if (forgeHosts) {
    const dir = path.join(home, '.config', 'kaola-workflow');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ forge_hosts: forgeHosts }));
  }
  return home;
}

function makeRecorder() {
  const dir = temp('kw-fg-bin-');
  // Every seam runs the mock as `node <mock>` (claim/sink/sink-pr), so the recorder
  // must be JavaScript. A `#!/bin/sh` file here is a SyntaxError under node, which
  // would leave the marker absent and make assertNoCalls vacuously true.
  const script = path.join(dir, 'mock.js');
  fs.writeFileSync(script, [
    "const fs = require('fs');",
    "fs.appendFileSync(process.env.MOCK_MARKER, process.argv.slice(2).join(' ') + '\\n');",
    'process.exit(1);',
  ].join('\n'));
  return script;
}

function run(file, args, opts) {
  const options = opts || {};
  const marker = options.marker || path.join(temp('kw-fg-calls-'), 'calls');
  const mock = makeRecorder();
  // spawn-class: cli-contract
  const res = spawnSync(process.execPath, [file].concat(args), {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: Object.assign({}, process.env, {
      HOME: options.home || temp('kw-fg-home-'),
      MOCK_MARKER: marker,
      KAOLA_GH_MOCK_SCRIPT: mock,
      KAOLA_TEA_MOCK_SCRIPT: mock,
      KAOLA_GLAB_MOCK_SCRIPT: mock,
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_COTENANT: '0',
    }),
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', marker };
}

function lastJson(result) {
  const lines = String(result.stdout).trim().split('\n').filter(Boolean);
  assert(lines.length > 0, 'no stdout JSON; stderr=' + result.stderr);
  return JSON.parse(lines[lines.length - 1]);
}

function assertNoCalls(result, label) {
  assert(!fs.existsSync(result.marker),
    label + ': a forge CLI was invoked: ' + (fs.existsSync(result.marker) ? fs.readFileSync(result.marker, 'utf8') : ''));
}

const GITHUB_REPO = 'https://github.com/Owner/Repo.git';
const GITEA_HOST = 'git.example.com';
const GITEA_HOSTS = { [GITEA_HOST]: 'gitea' };

// Positive controls: prove BOTH halves of the zero-call evidence — the recorder fires,
// and assertNoCalls actually rejects a marker. The second control is what mutation A
// lacked: a recorder that cannot run makes the assertion vacuous even when it is called.
check('assertNoCalls positive control: a recorded call fails the assertion', () => {
  const marker = path.join(temp('kw-fg-calls-'), 'calls');
  fs.writeFileSync(marker, 'issue list\n');
  assert.throws(() => assertNoCalls({ marker }, 'control'), /forge CLI was invoked/);
});

// Positive control: prove the recorder actually fires. Without this, a recorder that
// cannot run (or a seam that never reaches it) makes every zero-call assertion vacuous.
check('recorder positive control: a real gh call writes the marker', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(CLAIMS.github, ['list-open'], { cwd: repo, home: makeHome() });
  assert(fs.existsSync(out.marker), 'recorder did not fire on a passing github list-open');
  assert(fs.readFileSync(out.marker, 'utf8').includes('issue list'), fs.readFileSync(out.marker, 'utf8'));
});

// --- claim: forge editions refuse a github.com repo -------------------------

check('gitea claim startup refuses github.com before tea', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(CLAIMS.gitea, ['startup', '--target-issue', '1', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  const body = lastJson(out);
  assert.strictEqual(body.reason, 'forge_mismatch', JSON.stringify(body));
  assert.strictEqual(body.edition, 'gitea');
  assert.strictEqual(body.resolved, 'github');
  assertNoCalls(out, 'gitea claim startup');
});

check('gitlab claim startup refuses github.com before glab', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(CLAIMS.gitlab, ['startup', '--target-issue', '1', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  const body = lastJson(out);
  assert.strictEqual(body.reason, 'forge_mismatch', JSON.stringify(body));
  assert.strictEqual(body.edition, 'gitlab');
  assertNoCalls(out, 'gitlab claim startup');
});

check('gitea claim resume refuses github.com before tea', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(CLAIMS.gitea, ['resume', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'gitea claim resume');
});

check('sink-pr gh seam positive control: a passing github sink writes the marker', () => {
  const repo = makeRepo(GITHUB_REPO);
  fs.mkdirSync(path.join(repo, 'kaola-workflow', 'p'), { recursive: true });
  const out = run(SINKS['sink-pr-github'], ['--branch', 'b', '--project', 'p'], { cwd: repo, home: makeHome() });
  assert(fs.existsSync(out.marker), 'sink-pr did not reach the gh recorder: ' + out.stdout + out.stderr);
});

check('gitlab claim resume refuses github.com before glab', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(CLAIMS.gitlab, ['resume', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'gitlab claim resume');
});

// --- claim: github editions refuse a mapped gitea repo ---------------------

check('github claim startup refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(CLAIMS.github, ['startup', '--target-issue', '1', '--json'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  const body = lastJson(out);
  assert.strictEqual(body.reason, 'forge_mismatch', JSON.stringify(body));
  assert.strictEqual(body.edition, 'github');
  assert.strictEqual(body.resolved, 'gitea');
  assertNoCalls(out, 'github claim startup');
});

check('codex github claim refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(CLAIMS.codex, ['startup', '--target-issue', '1', '--json'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'codex claim startup');
});

check('github claim resume refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(CLAIMS.github, ['resume', '--json'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'github claim resume');
});

check('a T1/T3 conflict is not flattened into forge_mismatch', () => {
  const repo = makeRepo(GITHUB_REPO);
  fs.mkdirSync(path.join(repo, 'kaola-workflow'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'kaola-workflow', 'config.json'), JSON.stringify({ forge: 'gitea' }));
  const out = run(CLAIMS.gitea, ['startup', '--target-issue', '1', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_conflict');
  assertNoCalls(out, 'gitea conflict');
});

// --- sink entries -----------------------------------------------------------

check('github sink-merge refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(SINKS['sink-merge-github'], ['--branch', 'b', '--project', 'p', '--sink'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  const body = lastJson(out);
  assert.strictEqual(body.reason, 'forge_mismatch', JSON.stringify(body));
  assertNoCalls(out, 'github sink-merge');
});

check('gitea sink-merge refuses github.com before tea', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(SINKS['sink-merge-gitea'], ['--branch', 'b', '--project', 'p', '--sink'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'gitea sink-merge');
});

check('github sink-pr refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(SINKS['sink-pr-github'], ['--branch', 'b', '--project', 'p'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'github sink-pr');
});

check('gitea sink-pr refuses github.com before tea', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(SINKS['sink-pr-gitea'], ['--branch', 'b', '--project', 'p'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'gitea sink-pr');
});

check('gitlab sink-mr refuses github.com before glab', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(SINKS['sink-mr-gitlab'], ['--branch', 'b', '--project', 'p'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'gitlab sink-mr');
});

check('gitlab sink-merge refuses github.com before glab', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(SINKS['sink-merge-gitlab'], ['--branch', 'b', '--project', 'p', '--sink'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'gitlab sink-merge');
});

check('codex sink-merge refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(SINKS['sink-merge-codex'], ['--branch', 'b', '--project', 'p', '--sink'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'codex sink-merge');
});

check('codex sink-pr refuses a mapped gitea repo before gh', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(SINKS['sink-pr-codex'], ['--branch', 'b', '--project', 'p'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert.strictEqual(lastJson(out).reason, 'forge_mismatch');
  assertNoCalls(out, 'codex sink-pr');
});

// --- help stays a zero-effect answer ---------------------------------------

check('claim --help in a foreign repo exits 0 with no forge call', () => {
  const repo = makeRepo(GITHUB_REPO);
  const out = run(CLAIMS.gitea, ['--help'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
  assertNoCalls(out, 'gitea claim --help');
});

check('sink-merge --help in a foreign repo exits 0 with no forge call', () => {
  const repo = makeRepo(GITEA_HOST ? 'https://' + GITEA_HOST + '/Owner/Repo.git' : GITHUB_REPO);
  const out = run(SINKS['sink-merge-github'], ['--help'], { cwd: repo, home: makeHome(GITEA_HOSTS) });
  assert.strictEqual(out.status, 0, out.stdout + out.stderr);
  assert(out.stdout.includes('usage:'), out.stdout);
  assertNoCalls(out, 'sink-merge --help');
});

// --- existing scenarios pass the guard -------------------------------------

check('github.com repo does not forge-refuse the github claim', () => {
  const repo = makeRepo(GITHUB_REPO);
  // `resume` with no active folder reaches the guard and then answers normally, with
  // no claim mutation and no forge call. Any forge refusal would replace that answer.
  const out = run(CLAIMS.github, ['resume', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert(!out.stdout.includes('forge_mismatch'), out.stdout);
  assert(!out.stdout.includes('forge_not_installed'), out.stdout);
  assert(out.stdout.includes('resumed'), out.stdout);
  assertNoCalls(out, 'github resume pass');
});

check('unknown host does not forge-refuse the gitea claim', () => {
  const repo = makeRepo('https://' + GITEA_HOST + '/Owner/Repo.git');
  const out = run(CLAIMS.gitea, ['resume', '--json'], { cwd: repo, home: makeHome() });
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  assert(!out.stdout.includes('forge_mismatch'), out.stdout);
  assert(!out.stdout.includes('forge_not_installed'), out.stdout);
  assert(out.stdout.includes('resumed'), out.stdout);
  assertNoCalls(out, 'gitea resume pass');
});

// --- cleanup ----------------------------------------------------------------

for (const dir of temps) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

if (failed) {
  console.error('test-forge-guards: ' + failed + ' FAILED, ' + passed + ' passed');
  process.exit(1);
}
console.log('OK: test-forge-guards.js — ' + passed + ' checks');
