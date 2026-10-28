#!/usr/bin/env node
'use strict';

// test-issue-1123-codex-multi-plugin.js — #1123 P3 Codex decision.
//
// Codex is the runtime where BOTH forge plugins can be enabled at once: plugin caches are
// separate and Codex namespaces each plugin's skills by plugin name. This suite proves that in
// an isolated CODEX_HOME (the installed ~/.codex is never touched), then asserts the docs record
// the decision.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CODEX = process.env.CODEX_BIN || 'codex';

function run(args, env, cwd) {
  // spawn-class: cli-contract
  const res = spawnSync(CODEX, args, {
    cwd: cwd || ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, env || {}),
    timeout: 120000,
  });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

// spawn-class: environment
const probe = spawnSync('bash', ['-c', 'command -v "$1"', '_', CODEX], { encoding: 'utf8', env: process.env });
if (probe.status !== 0) {
  console.log('SKIP: test-issue-1123-codex-multi-plugin.js — codex CLI not found');
  process.exit(0);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-p3-codex-home-'));
const codexHome = path.join(home, '.codex');
fs.mkdirSync(codexHome, { recursive: true });
const env = { HOME: home, CODEX_HOME: codexHome };

try {
  const market = run(['plugin', 'marketplace', 'add', ROOT, '--json'], env);
  assert.strictEqual(market.status, 0, market.stdout + market.stderr);

  for (const plugin of ['kaola-workflow', 'kaola-workflow-gitea']) {
    const added = run(['plugin', 'add', plugin + '@kaolabrother-kaola-workflow', '--json'], env);
    assert.strictEqual(added.status, 0, plugin + ': ' + added.stdout + added.stderr);
  }

  const listed = run(['plugin', 'list', '--json'], env);
  assert.strictEqual(listed.status, 0, listed.stdout + listed.stderr);
  const rows = JSON.parse(listed.stdout).installed || [];
  const byId = new Map(rows.map(row => [row.pluginId, row]));
  for (const id of ['kaola-workflow@kaolabrother-kaola-workflow',
    'kaola-workflow-gitea@kaolabrother-kaola-workflow']) {
    assert(byId.has(id), 'plugin not installed: ' + id);
    assert.strictEqual(byId.get(id).enabled, true, 'plugin not enabled: ' + id);
  }

  const prompt = run(['debug', 'prompt-input'], env);
  assert.strictEqual(prompt.status, 0, prompt.stdout + prompt.stderr);
  assert(prompt.stdout.includes('kaola-workflow:kaola-workflow-next'),
    'github plugin skill is not namespaced: ' + prompt.stdout.slice(0, 400));
  assert(prompt.stdout.includes('kaola-workflow-gitea:kaola-workflow-next'),
    'gitea plugin skill is not namespaced: ' + prompt.stdout.slice(0, 400));

  // spawn-class: environment
  const carrier = spawnSync(process.execPath, [
    path.join(ROOT, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js'),
    '--global'], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, env) });
  assert.strictEqual(carrier.status, 0, carrier.stdout + carrier.stderr);

  // spawn-class: environment
  const check = spawnSync('bash', [path.join(ROOT, 'install-all.sh'), '--check',
    '--forge=github,gitea',
    '--skip=claude,opencode,kimi,grok,cursor,zcode,devin,droid,dsh,antigravity,hermes'], {
    cwd: ROOT, encoding: 'utf8', timeout: 180000,
    env: Object.assign({}, process.env, env),
  });
  assert(check.status === 0, check.stdout + check.stderr);
  assert(check.stdout.includes('[forge] codex: installed=github,gitea expected=github,gitea'),
    check.stdout + check.stderr);

  const docs = fs.readFileSync(path.join(ROOT, 'docs', 'installation.md'), 'utf8');
  assert(/#1123 P3/.test(docs), 'installation docs do not record the P3 Codex decision');
  assert(/both plugins|both forge plugins|multiple plugins/i.test(docs),
    'installation docs do not say both Codex plugins can be installed');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}

console.log('OK: test-issue-1123-codex-multi-plugin.js — both plugins enabled and namespaced');
