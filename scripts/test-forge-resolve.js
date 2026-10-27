#!/usr/bin/env node
'use strict';

// test-forge-resolve.js — #1123 P1 table-driven coverage for the per-repo forge
// resolver: URL forms, T1-T4, §3.5 refusals, guard mapping, shell quoting,
// set/unset, and the no-userinfo guarantee.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RESOLVER = path.join(__dirname, 'kaola-workflow-forge-resolve.js');
const R = require('./kaola-workflow-forge-resolve.js');

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

function repo(opts) {
  const options = opts || {};
  const dir = temp('kw-fr-');
  git(dir, ['init', '-q', '.']);
  git(dir, ['config', 'user.email', 'p1@example.invalid']);
  git(dir, ['config', 'user.name', 'P1']);
  git(dir, ['commit', '-q', '--allow-empty', '-m', 'base']);
  if (options.origin) git(dir, ['remote', 'add', 'origin', options.origin]);
  return dir;
}

function writeRepoConfig(dir, value) {
  fs.mkdirSync(path.join(dir, 'kaola-workflow'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'kaola-workflow', 'config.json'),
    typeof value === 'string' ? value : JSON.stringify(value));
}

function writeMachineConfig(home, value) {
  const dir = path.join(home, '.config', 'kaola-workflow');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'),
    typeof value === 'string' ? value : JSON.stringify(value));
}

function runCli(args, opts) {
  const options = opts || {};
  // spawn-class: cli-contract
  const res = spawnSync(process.execPath, [RESOLVER].concat(args), {
    cwd: options.cwd || os.tmpdir(),
    encoding: 'utf8',
    env: Object.assign({}, process.env, options.env || {}),
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function jsonOf(result) {
  return JSON.parse(String(result.stdout).trim().split('\n').filter(Boolean).pop());
}

// --- URL forms ---------------------------------------------------------------

const URL_CASES = [
  ['git@github.com:Owner/Repo.git', { host: 'github.com', port: '' }],
  ['github.com:Owner/Repo.git', { host: 'github.com', port: '' }],
  ['ssh://git@git.example.com:2222/Owner/Repo.git', { host: 'git.example.com', port: '2222' }],
  ['ssh://git@git.example.com/Owner/Repo.git', { host: 'git.example.com', port: '' }],
  ['https://user:secret@git.example.com:3000/Owner/Repo.git', { host: 'git.example.com', port: '3000' }],
  ['https://git.example.com/Owner/Repo.git', { host: 'git.example.com', port: '' }],
  ['http://127.0.0.1:3000/kaola-test/repo.git', { host: '127.0.0.1', port: '3000' }],
  ['git://github.com/Owner/Repo.git', { host: 'github.com', port: '' }],
  ['file:///tmp/Owner/Repo.git', null],
  ['/tmp/Owner/Repo.git', null],
  ['./Owner/Repo.git', null],
  ['../Owner/Repo.git', null],
  ['C:\\repos\\Owner\\Repo.git', null],
  ['not-a-url', null],
  ['', null],
];

check('URL forms parse to host/port without userinfo', () => {
  for (const [input, expected] of URL_CASES) {
    assert.deepStrictEqual(R.parseRemoteHost(input), expected, 'parse ' + JSON.stringify(input));
    const serialized = JSON.stringify(R.parseRemoteHost(input));
    assert(!/user|secret|pass@/.test(serialized), 'userinfo leaked for ' + input + ': ' + serialized);
  }
});

check('https userinfo is stripped from the resolved JSON', () => {
  const dir = repo({ origin: 'https://user:secret@git.example.com:3000/Owner/Repo.git' });
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, { forge_hosts: { 'git.example.com:3000': 'gitea' } });
  const res = R.resolveForge({ cwd: dir, home, installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.host, 'git.example.com:3000');
  const serialized = JSON.stringify(res);
  assert(!serialized.includes('secret'), 'secret leaked');
  assert(!serialized.includes('user:'), 'userinfo leaked');
});

// --- T3: origin host / forge_hosts / built-ins --------------------------------

check('built-in github.com resolves github from origin', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'github');
  assert.strictEqual(res.source, 'remote');
  assert.strictEqual(res.host, 'github.com');
});

check('built-in gitea.com resolves gitea', () => {
  const dir = repo({ origin: 'git@gitea.com:Owner/Repo.git' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
});

check('forge_hosts exact host:port mapping wins', () => {
  const dir = repo({ origin: 'ssh://git@git.example.com:2222/Owner/Repo.git' });
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, { forge_hosts: { 'git.example.com:2222': 'gitea' } });
  const res = R.resolveForge({ cwd: dir, home, installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.source, 'remote');
});

check('host matching is exact: localhost aliases do not match 127.0.0.1', () => {
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, { forge_hosts: { '127.0.0.1:3000': 'gitea' } });
  const http = repo({ origin: 'http://localhost:3000/Owner/Repo.git' });
  const httpRes = R.resolveForge({ cwd: http, home, installed: ['github'] });
  assert.strictEqual(httpRes.ok, true, JSON.stringify(httpRes));
  assert.strictEqual(httpRes.source, 'default');
  assert.strictEqual(httpRes.forge, 'github');
  assert.strictEqual(httpRes.host, 'localhost:3000');

  const ssh = repo({ origin: 'ssh://git@localhost:2222/Owner/Repo.git' });
  const sshRes = R.resolveForge({ cwd: ssh, home, installed: ['github'] });
  assert.strictEqual(sshRes.ok, true, JSON.stringify(sshRes));
  assert.strictEqual(sshRes.source, 'default');
  assert.strictEqual(sshRes.forge, 'github');
  assert.strictEqual(sshRes.host, 'localhost:2222');
});

check('forge_hosts host-only mapping applies when no port key exists', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, { forge_hosts: { 'git.example.com': 'gitlab' } });
  const res = R.resolveForge({ cwd: dir, home, installed: ['gitlab'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitlab');
});

check('unknown host with one installed forge falls to T4 default', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.source, 'default');
  assert.strictEqual(res.host, 'git.example.com');
});

check('unknown host with two installed forges refuses forge_unresolved', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github', 'gitea'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_unresolved');
});

check('local-path origin is unknown, not guessed', () => {
  const dir = repo({ origin: '/tmp/some-bare-repo.git' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.source, 'default');
  assert.strictEqual(res.host, null);
});

check('no origin falls to T4 default', () => {
  const dir = repo();
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.source, 'default');
  assert.strictEqual(res.host, null);
});

check('insteadOf expansion is what the resolver maps', () => {
  const dir = repo({ origin: 'gt:Owner/Repo.git' });
  git(dir, ['config', 'url.ssh://git@git.example.com:2222/.insteadOf', 'gt:']);
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, { forge_hosts: { 'git.example.com:2222': 'gitea' } });
  const res = R.resolveForge({ cwd: dir, home, installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.host, 'git.example.com:2222');
  assert(!JSON.stringify(res).includes('git@'), 'insteadOf userinfo leaked');
});

check('invalid machine forge_hosts value refuses forge_config_invalid', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, { forge_hosts: { 'git.example.com': 'svn' } });
  const res = R.resolveForge({ cwd: dir, home, installed: ['gitea'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_config_invalid');
});

check('unparseable machine config refuses forge_config_invalid', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  const home = temp('kw-fr-home-');
  writeMachineConfig(home, '{not json');
  const res = R.resolveForge({ cwd: dir, home, installed: ['gitea'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_config_invalid');
});

// --- T1 / T2 and §3.5 --------------------------------------------------------

check('T1 config decides and reports source=config', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  writeRepoConfig(dir, { forge: 'gitea' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.source, 'config');
});

check('T1 unparseable JSON refuses without falling through', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  writeRepoConfig(dir, '{broken');
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_config_invalid');
});

check('T1 non-object root refuses', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  writeRepoConfig(dir, '[]');
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_config_invalid');
});

check('T1 unknown forge value refuses', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  writeRepoConfig(dir, { forge: 'svn' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_config_invalid');
});

check('T2 marker decides and reports source=marker', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  git(dir, ['config', '--local', 'kaola-workflow.forge', 'gitea']);
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.source, 'marker');
});

check('T2 invalid marker refuses forge_marker_invalid', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  git(dir, ['config', '--local', 'kaola-workflow.forge', 'svn']);
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_marker_invalid');
});

check('T1 shadows a different T2 with warning, no refusal', () => {
  const dir = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  writeRepoConfig(dir, { forge: 'gitea' });
  git(dir, ['config', '--local', 'kaola-workflow.forge', 'github']);
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.forge, 'gitea');
  assert.deepStrictEqual(res.warnings, ['forge_marker_shadowed']);
});

check('T1 vs decisive T3 refuses forge_conflict', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  writeRepoConfig(dir, { forge: 'gitea' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_conflict');
  assert.strictEqual(res.forge, 'gitea');
  assert.strictEqual(res.host, 'github.com');
});

check('T2 vs decisive T3 refuses forge_conflict', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  git(dir, ['config', '--local', 'kaola-workflow.forge', 'gitea']);
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_conflict');
});

check('resolved forge outside the installed set refuses forge_not_installed', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_not_installed');
  assert.strictEqual(res.forge, 'github');
});

check('no T1-T3 and installed set empty refuses forge_unresolved', () => {
  const dir = repo();
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: [] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'forge_unresolved');
});

check('non-repo cwd refuses not_a_git_repo', () => {
  const dir = temp('kw-fr-norepo-');
  const res = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['github'] });
  assert.strictEqual(res.ok, false, JSON.stringify(res));
  assert.strictEqual(res.reason, 'not_a_git_repo');
});

// --- guard mapping -----------------------------------------------------------

check('guard passes github.com + github and unknown host + gitea', () => {
  const gh = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const unk = repo({ origin: 'https://git.example.com/Owner/Repo.git' });
  assert.strictEqual(R.guardEdition('github', { cwd: gh, home: temp('kw-fr-home-') }), null);
  assert.strictEqual(R.guardEdition('gitea', { cwd: unk, home: temp('kw-fr-home-') }), null);
});

check('guard passes non-git roots (no contrary declaration; T4 would pick the edition)', () => {
  const dir = temp('kw-fr-norepo-guard-');
  assert.strictEqual(R.guardEdition('gitea', { cwd: dir, home: temp('kw-fr-home-') }), null);
});

check('guard maps a foreign resolution to forge_mismatch', () => {
  const gh = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const gate = R.guardEdition('gitea', { cwd: gh, home: temp('kw-fr-home-') });
  assert(gate, 'expected a refusal');
  assert.strictEqual(gate.reason, 'forge_mismatch');
  assert.strictEqual(gate.edition, 'gitea');
  assert.strictEqual(gate.resolved, 'github');
});

check('guard preserves non-mismatch refusals', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  writeRepoConfig(dir, { forge: 'gitea' });
  const gate = R.guardEdition('gitea', { cwd: dir, home: temp('kw-fr-home-') });
  assert(gate, 'expected a refusal');
  assert.strictEqual(gate.reason, 'forge_conflict');
});

// --- set / unset / shell -----------------------------------------------------

check('set then unset round-trips the marker', () => {
  const dir = repo();
  const set = R.setForge('gitea', { cwd: dir });
  assert.strictEqual(set.ok, true, JSON.stringify(set));
  assert.strictEqual(git(dir, ['config', '--local', '--get', 'kaola-workflow.forge']), 'gitea');
  const unset = R.unsetForge({ cwd: dir });
  assert.strictEqual(unset.ok, true, JSON.stringify(unset));
  assert.strictEqual(unset.removed, true);
  const again = R.unsetForge({ cwd: dir });
  assert.strictEqual(again.ok, true, JSON.stringify(again));
  assert.strictEqual(again.removed, false);
});

check('set rejects an unknown forge', () => {
  const dir = repo();
  const set = R.setForge('svn', { cwd: dir });
  assert.strictEqual(set.ok, false);
  assert.strictEqual(set.reason, 'forge_invalid');
});

check('shell output has exactly the three whitelisted assignments and escapes', () => {
  const dir = repo();
  const result = R.resolveForge({ cwd: dir, home: temp('kw-fr-home-'), installed: ['gitea'] });
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  const scriptsDir = "/tmp/a b'c";
  const shell = R.shellAssignments(result, scriptsDir);
  const lines = shell.split('\n');
  assert.deepStrictEqual(lines.map(l => l.slice(0, l.indexOf('='))),
    ['KW_FORGE', 'KAOLA_SCRIPTS', 'CLAIM_JS']);
  assert(lines[0].includes("'gitea'"), lines[0]);
  assert(lines[1].includes("'/tmp/a b'\\''c'"), lines[1]);
  assert(lines[2].includes('kaola-gitea-workflow-claim.js'), lines[2]);
});

// --- CLI contract ------------------------------------------------------------

check('CLI resolve exits 0 and emits JSON for a passing repo', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const out = runCli(['resolve', '--json', '--installed', 'github', '--cwd', dir]);
  assert.strictEqual(out.status, 0, out.stderr);
  const body = jsonOf(out);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.forge, 'github');
});

check('CLI resolve exits 1 and emits a typed refusal', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const out = runCli(['resolve', '--json', '--installed', 'gitea', '--cwd', dir]);
  assert.strictEqual(out.status, 1, out.stdout + out.stderr);
  const body = jsonOf(out);
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.reason, 'forge_not_installed');
});

check('CLI --shell prints nothing on refusal and exits 1', () => {
  const dir = repo({ origin: 'https://github.com/Owner/Repo.git' });
  const out = runCli(['resolve', '--shell', '--installed', 'gitea', '--cwd', dir]);
  assert.strictEqual(out.status, 1, out.stdout);
  assert.strictEqual(out.stdout.trim(), '');
  assert(out.stderr.includes('forge_not_installed'), out.stderr);
});

check('CLI set/unset writes the local marker', () => {
  const dir = repo();
  const set = runCli(['set', 'gitlab', '--cwd', dir, '--json']);
  assert.strictEqual(set.status, 0, set.stderr);
  assert.strictEqual(git(dir, ['config', '--local', '--get', 'kaola-workflow.forge']), 'gitlab');
  const unset = runCli(['unset', '--cwd', dir, '--json']);
  assert.strictEqual(unset.status, 0, unset.stderr);
  assert.strictEqual(unset.stdout.includes('"removed":true'), true, unset.stdout);
});

check('CLI help exits 0 without side effects', () => {
  const out = runCli(['--help']);
  assert.strictEqual(out.status, 0, out.stderr);
  assert(out.stdout.includes('usage:'), out.stdout);
});

// --- cleanup -----------------------------------------------------------------

for (const dir of temps) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

if (failed) {
  console.error('test-forge-resolve: ' + failed + ' FAILED, ' + passed + ' passed');
  process.exit(1);
}
console.log('OK: test-forge-resolve.js — ' + passed + ' checks');
