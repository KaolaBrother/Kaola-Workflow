#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'templates', 'global', 'kaola-workflow-global.md');
const REGISTRY = path.join(ROOT, 'templates', 'global', 'runtime-contract-adapters.json');
const CLI = path.join(ROOT, 'scripts', 'kaola-workflow-global-contract.js');
const INIT = path.join(ROOT, 'scripts', 'kaola-workflow-project-instructions.js');
const EXPECTED_SURFACES = [
  'claude-local', 'codex-local', 'opencode-local', 'kimi-local', 'grok-local',
  'cursor-cli-local', 'cursor-app-local', 'cursor-cloud', 'zcode-local',
];

let passed = 0;
function ok(value, message) {
  assert.ok(value, message);
  passed += 1;
}
function same(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
  passed += 1;
}
function sha(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function write(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { mode });
  fs.chmodSync(file, mode);
}
function fakeExecutable(bin, name) {
  write(path.join(bin, name), '#!/bin/sh\nexit 0\n', 0o755);
}
function run(args, env, expected = 0) {
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 20000,
  });
  same(result.status, expected,
    `global-contract ${args.join(' ')} exit (stderr=${result.stderr})`);
  let json = null;
  if (result.stdout.trim()) {
    try { json = JSON.parse(result.stdout); }
    catch (_) { throw new Error(`non-JSON output for ${args.join(' ')}: ${result.stdout}`); }
  }
  return { ...result, json };
}
function runInit(args, env, expected = 0) {
  // spawn-class: cli-contract
  const result = spawnSync(process.execPath, [INIT, ...args], {
    cwd: ROOT, env, encoding: 'utf8', timeout: 20000,
  });
  same(result.status, expected,
    `project-instructions ${args.join(' ')} exit (stderr=${result.stderr})`);
  return JSON.parse(result.stdout);
}
function makeEnvironment(root, { installed = true } = {}) {
  const home = path.join(root, 'home');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  if (installed) {
    for (const command of ['claude', 'codex', 'opencode', 'kimi', 'grok', 'agent']) {
      fakeExecutable(bin, command);
    }
  }
  const cursorApp = path.join(root, 'Cursor.app');
  const zcodeApp = path.join(root, 'ZCode.app');
  if (installed) {
    fs.mkdirSync(cursorApp, { recursive: true });
    fs.mkdirSync(zcodeApp, { recursive: true });
  }
  return {
    ...process.env,
    HOME: home,
    PATH: bin,
    CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CODEX_HOME: path.join(home, '.codex'),
    OPENCODE_CONFIG_DIR: path.join(home, '.config', 'opencode'),
    KIMI_CODE_HOME: path.join(home, '.kimi-code'),
    GROK_HOME: path.join(home, '.grok'),
    CURSOR_HOME: path.join(home, '.cursor'),
    ZCODE_HOME: path.join(home, '.zcode'),
    KAOLA_CURSOR_APP_PATH: cursorApp,
    KAOLA_ZCODE_APP_PATH: zcodeApp,
  };
}

ok(fs.existsSync(SOURCE), 'A1: one universal global-contract source exists');
ok(fs.existsSync(REGISTRY), 'A1: one runtime adapter registry exists');
ok(fs.existsSync(CLI), 'A1: one installation transaction exists');

const source = fs.readFileSync(SOURCE, 'utf8');
for (const phrase of [
  'Correct first', 'Then save human time', 'Then spend as little as possible',
  'Machines decide facts; humans decide values', 'Own your own verdicts',
  'item', 'status', 'dispatched', 'result', 'three write moments',
  'Custody', 'carrier', 'failure frontier', 'test custody',
  'Finalization, issue closure, archive, and sink are not Mission List items',
]) ok(source.includes(phrase), `A1: universal contract carries ${phrase}`);
for (const forbidden of [
  'Claude', 'Codex', 'OpenCode', 'Kimi', 'Grok', 'Cursor', 'ZCode',
  'subagent_type', 'spawn_agent', '~/', '/Users/', '.claude/', '.codex/', '.cursor/',
]) ok(!source.includes(forbidden), `A1: universal source omits runtime-private token ${forbidden}`);
ok(source.split(/\r?\n/).length < 120, 'A1: universal contract stays concise');

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
same(registry.targets.map(target => target.id), EXPECTED_SURFACES,
  'A2: live matrix is derived from the closed nine-surface registry');
same(new Set(registry.targets.map(target => target.runtime)).size, 7,
  'A2: nine surfaces cover seven runtime families');
for (const target of registry.targets) {
  ok(target.discovery && target.carrier && target.precedence && target.reload,
    `A2[${target.id}]: discovery, carrier, precedence, and reload are measured`);
}
const reloadPatterns = {
  'claude-local': /SessionStart\(source=compact\).*static V2/,
  'codex-local': /SessionStart\(source=compact\).*static V2/,
  'opencode-local': /fresh session/,
  'kimi-local': /new session/,
  'grok-local': /every interaction.*after compact/,
  'cursor-cli-local': /alwaysApply.*each model context/,
  'cursor-app-local': /alwaysApply.*each model context/,
  'cursor-cloud': /Save the Environment Build.*new top-level Agent/,
  'zcode-local': /new task/,
};
for (const target of registry.targets) {
  ok(reloadPatterns[target.id].test(target.reload),
    `A2[${target.id}]: reload text matches the measured lifecycle class`);
}
for (const id of ['opencode-local', 'kimi-local', 'zcode-local']) {
  const target = registry.targets.find(row => row.id === id);
  ok(!/compact|hook/i.test(target.reload),
    `A2[${id}]: registry does not invent an unmeasured compact lifecycle`);
}

const api = require(CLI);
ok(typeof api.renderContract === 'function' && typeof api.execute === 'function',
  'A3: installer exposes deterministic render and transaction APIs');
const nonce = `KW1046_${crypto.randomBytes(8).toString('hex')}`;
for (const target of registry.targets) {
  const rendered = api.renderContract({ source, target, nonce });
  ok(Buffer.isBuffer(rendered) && rendered.includes(Buffer.from(nonce)),
    `A3[${target.id}]: adapter render carries the live nonce`);
  same(rendered.toString('utf8').split(nonce).length - 1, 1,
    `A3[${target.id}]: adapter render carries the nonce once`);
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1046-contract-'));
try {
  const env = makeEnvironment(sandbox);
  const ownerFiles = [
    path.join(env.CODEX_HOME, 'AGENTS.md'),
    path.join(env.OPENCODE_CONFIG_DIR, 'AGENTS.md'),
    path.join(env.KIMI_CODE_HOME, 'AGENTS.md'),
    path.join(env.ZCODE_HOME, 'AGENTS.md'),
  ];
  for (const file of ownerFiles) write(file, '# Owner instructions\n\nKeep this byte.\n');

  const installed = run(['install', '--json', '--nonce', nonce], env).json;
  same(installed.status, 'INSTALLED', 'A4: whole-batch install succeeds');
  same(installed.targets.map(row => row.id), EXPECTED_SURFACES,
    'A4: receipt retains every registry row, including remote Cloud');
  const localRows = installed.targets.filter(row => row.status === 'INSTALLED');
  same(localRows.length, 8, 'A4: all eight installed local surfaces are current');
  same(installed.targets.find(row => row.id === 'cursor-cloud').status, 'REMOTE_REQUIRED',
    'A4: Cursor Cloud remains an explicit independent target');
  for (const row of localRows) {
    ok(row.source_sha256 && row.render_sha256 && row.install_sha256 && row.carrier,
      `A4[${row.id}]: receipt binds source, render, install, and carrier`);
  }
  for (const file of ownerFiles) {
    const bytes = fs.readFileSync(file, 'utf8');
    ok(bytes.startsWith('# Owner instructions\n\nKeep this byte.\n'),
      `A4: owner bytes survive managed insertion in ${file}`);
    same(bytes.split(nonce).length - 1, 1, `A4: ${file} contains one contract`);
  }
  const dedicated = [
    path.join(env.CLAUDE_CONFIG_DIR, 'rules', 'kaola-workflow-global.md'),
    path.join(env.GROK_HOME, 'rules', 'kaola-workflow-global.md'),
    path.join(env.CURSOR_HOME, 'rules', 'kaola-workflow-global.mdc'),
  ];
  for (const file of dedicated) {
    ok(fs.existsSync(file), `A4: dedicated carrier exists at ${file}`);
    same(fs.readFileSync(file, 'utf8').split(nonce).length - 1, 1,
      `A4: dedicated carrier contains one contract at ${file}`);
  }
  same(localRows.find(row => row.id === 'cursor-cli-local').path,
    localRows.find(row => row.id === 'cursor-app-local').path,
    'A4: Cursor CLI and App share one deduplicated local carrier');

  const receipt = installed.receipt_path;
  ok(fs.existsSync(receipt), 'A4: batch receipt exists');
  const before = new Map([...ownerFiles, ...dedicated, receipt]
    .map(file => [file, sha(fs.readFileSync(file))]));
  const checked = run(['check', '--json', '--nonce', nonce], env).json;
  same(checked.status, 'CURRENT', 'A4: check reports CURRENT');
  run(['install', '--json', '--nonce', nonce], env);
  for (const [file, digest] of before) same(sha(fs.readFileSync(file)), digest,
    `A4: reinstall is byte-idempotent for ${file}`);

  const cloudRepo = path.join(sandbox, 'cloud-repo');
  fs.mkdirSync(cloudRepo);
  // spawn-class: environment
  spawnSync('git', ['init', '-q', cloudRepo]);
  const cloud = run(['install-cloud', '--target', cloudRepo, '--json', '--nonce', nonce], env).json;
  same(cloud.status, 'INSTALLED', 'A5: explicit Cursor Cloud materialization succeeds');
  same(cloud.target.id, 'cursor-cloud', 'A5: Cloud receipt uses the registry row');
  ok(fs.existsSync(path.join(cloudRepo, '.cursor', 'rules', 'kaola-workflow-global.mdc')),
    'A5: Cloud installs the required selected-repository Rule');

  const consumer = path.join(sandbox, 'consumer');
  fs.mkdirSync(consumer);
  const initEnv = { ...env, KAOLA_GLOBAL_CONTRACT_RECEIPT: receipt };
  const init = runInit(['apply', '--project-root', consumer, '--json'], initEnv);
  same(init.status, 'applied', 'A6: workflow-init accepts a compatible global receipt');
  const agents = fs.readFileSync(path.join(consumer, 'AGENTS.md'), 'utf8');
  for (const heading of ['## Project Snapshot', '## Commands', '## Project Constraints',
    '## Validation Policy', '## Documentation Map', '## Local Overrides']) {
    ok(agents.includes(heading), `A6: minimal project contract keeps ${heading}`);
  }
  for (const removed of ['## First Principles', 'three write moments',
    'Custody (who decides meaning)', 'Finalization, Issue closure']) {
    ok(!agents.includes(removed), `A6: project contract subtracts ${removed}`);
  }
  ok(agents.includes('global_contract_schema: 1'),
    'A6: project contract keeps one minimal adoption marker');

  const noReceipt = path.join(sandbox, 'no-receipt');
  fs.mkdirSync(noReceipt);
  same(runInit(['plan', '--project-root', noReceipt, '--json'], {
    ...env, KAOLA_GLOBAL_CONTRACT_RECEIPT: path.join(sandbox, 'absent.json'),
  }, 2).status, 'decision_required',
  'A6: workflow-init writes no minimal contract without a compatible global receipt');

  const active = path.join(sandbox, 'active');
  fs.mkdirSync(path.join(active, 'kaola-workflow', 'run'), { recursive: true });
  write(path.join(active, 'kaola-workflow', 'run', 'workflow-state.md'), 'status: active\n');
  write(path.join(active, 'AGENTS.md'), '# Owner active bytes\n');
  const activeBefore = fs.readFileSync(path.join(active, 'AGENTS.md'));
  const activeResult = runInit(['apply', '--project-root', active, '--json'], initEnv);
  same(activeResult.status, 'active_run_preserved', 'A6: active run is never rewritten mid-run');
  ok(fs.readFileSync(path.join(active, 'AGENTS.md')).equals(activeBefore),
    'A6: active-run instruction bytes stay unchanged');

  const modified = dedicated[0];
  fs.appendFileSync(modified, 'owner mutation\n');
  const uninstall = run(['uninstall', '--json', '--nonce', nonce], env, 2).json;
  same(uninstall.status, 'OWNER_CONFLICT',
    'A7: uninstall refuses a modified receipt-owned carrier before any deletion');
  ok(fs.existsSync(dedicated[1]), 'A7: failed uninstall leaves every other carrier present');

  const conflictRoot = path.join(sandbox, 'symlink-conflict');
  const conflictEnv = makeEnvironment(conflictRoot);
  write(path.join(conflictRoot, 'foreign'), 'foreign\n');
  fs.mkdirSync(conflictEnv.CODEX_HOME, { recursive: true });
  fs.symlinkSync(path.join(conflictRoot, 'foreign'), path.join(conflictEnv.CODEX_HOME, 'AGENTS.md'));
  same(run(['install', '--json', '--nonce', nonce], conflictEnv, 2).json.status,
    'PREFLIGHT_BLOCKED', 'A7: one symlink blocks the whole batch');
  ok(!fs.existsSync(path.join(conflictEnv.CLAUDE_CONFIG_DIR, 'rules', 'kaola-workflow-global.md')),
    'A7: symlink failure occurs before the first write');

  const futureRoot = path.join(sandbox, 'future-receipt');
  const futureEnv = makeEnvironment(futureRoot);
  const futureReceipt = path.join(futureEnv.HOME, '.config', 'kaola-workflow',
    'global-contract-receipt.json');
  write(futureReceipt, JSON.stringify({ schema_version: 999 }) + '\n');
  same(run(['install', '--json', '--nonce', nonce], futureEnv, 2).json.status,
    'PREFLIGHT_BLOCKED', 'A7: future receipt schema blocks the whole batch');

  const duplicateRoot = path.join(sandbox, 'duplicate-registry');
  const duplicateEnv = makeEnvironment(duplicateRoot);
  const duplicateRegistry = path.join(duplicateRoot, 'registry.json');
  const mutated = JSON.parse(JSON.stringify(registry));
  mutated.targets.push({ ...mutated.targets[0], id: 'duplicate-claude', carrier_group: 'foreign-group' });
  write(duplicateRegistry, JSON.stringify(mutated));
  same(run(['install', '--json', '--nonce', nonce], {
    ...duplicateEnv, KAOLA_GLOBAL_CONTRACT_REGISTRY: duplicateRegistry,
  }, 2).json.status, 'PREFLIGHT_BLOCKED',
  'A7: duplicate physical target with a different owner blocks the whole batch');

  const hostileRoot = path.join(sandbox, 'hostile-receipt');
  const hostileEnv = makeEnvironment(hostileRoot);
  const hostileInstalled = run(['install', '--json', '--nonce', nonce], hostileEnv).json;
  const hostileReceipt = JSON.parse(fs.readFileSync(hostileInstalled.receipt_path, 'utf8'));
  const foreign = path.join(hostileRoot, 'foreign-owner-file');
  write(foreign, 'must survive\n');
  const hostileRow = hostileReceipt.targets.find(row => row.status === 'INSTALLED');
  hostileRow.path = foreign;
  hostileRow.install_sha256 = sha(fs.readFileSync(foreign));
  write(hostileInstalled.receipt_path, JSON.stringify(hostileReceipt, null, 2) + '\n');
  same(run(['uninstall', '--json', '--nonce', nonce], hostileEnv, 2).json.status,
    'OWNER_CONFLICT', 'A7: a receipt cannot redirect uninstall outside its registry-derived carrier');
  same(fs.readFileSync(foreign, 'utf8'), 'must survive\n',
    'A7: hostile receipt target remains untouched');

  const absentRoot = path.join(sandbox, 'not-installed');
  const absentEnv = makeEnvironment(absentRoot, { installed: false });
  const absent = run(['install', '--json', '--nonce', nonce], absentEnv).json;
  same(absent.targets.filter(row => row.status === 'NOT_INSTALLED').length, 8,
    'A8: every absent local surface is reported NOT_INSTALLED');
  same(absent.targets.find(row => row.id === 'cursor-cloud').status, 'REMOTE_REQUIRED',
    'A8: missing local runtimes never erase the Cloud row');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log(`issue-1046 global-contract acceptance: ${passed} passed`);
