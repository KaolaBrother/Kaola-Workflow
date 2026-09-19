#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const sync = require('./sync-dsh-edition.js');
const agents = require('./generate-agent-profiles.js');
const manifest = require('./kaola-workflow-install-manifest.js');

const contracts = agents.loadBehaviorContracts(REPO).roles;
const adapters = agents.loadRuntimeAdapters(REPO);
const dshAdapter = adapters.runtimes.dsh;

assert(dshAdapter, 'runtime-capabilities declares a DSH adapter');
assert.deepStrictEqual(
  [dshAdapter.evidence].flat().sort(),
  [
    'dsh_cli', 'dsh_home', 'dsh_instructions', 'dsh_live_probe_20260919',
    'dsh_skills', 'dsh_subagents',
  ].sort(),
  'DSH evidence covers the six first-party entries'
);
assert(adapters.evidence.dsh_live_probe_20260919.kind === 'runtime_probe'
  && adapters.evidence.dsh_live_probe_20260919.locator.includes('/Kaola-Workflow/issues/1081')
  && adapters.evidence.dsh_live_probe_20260919.observed_at.startsWith('2026-09-19'),
  'dsh_live_probe_20260919 is a runtime_probe anchored to issue #1081 on 2026-09-19');
for (const id of ['dsh_cli', 'dsh_home', 'dsh_instructions', 'dsh_skills', 'dsh_subagents']) {
  const ev = adapters.evidence[id];
  assert(ev && ev.kind === 'official_docs' && ev.locator.includes('deepseek-ai/deepseek-harness'),
    'evidence ' + id + ' is an official_docs entry anchored to deepseek-harness');
}
assert.strictEqual(dshAdapter.capabilities.role_dispatch, 'native_only',
  'DSH is native_only — it installs no Kaola role profiles');
assert.strictEqual(dshAdapter.capabilities.named_roles, false, 'DSH exposes no named Kaola roles');
assert.strictEqual(dshAdapter.capabilities.deterministic_profiles, false,
  'DSH renders no deterministic profiles');
assert.strictEqual(dshAdapter.capabilities.instruction_loading, 'direct',
  'DSH discovers instructions from user-global AGENTS.md plus the project chain');
assert.strictEqual(dshAdapter.capabilities.hook_scope, 'none',
  'DSH edition installs no hook surface');
assert(dshAdapter.capabilities.delegation_guidance
  && dshAdapter.capabilities.delegation_guidance.native_routes
  && dshAdapter.capabilities.delegation_guidance.availability,
  'DSH adapter declares native_routes + availability delegation guidance');
assert(!('subagent_default' in (dshAdapter.capabilities.delegation_guidance || {})),
  'native_only DSH declares NO subagent_default binding');
assert.deepStrictEqual(dshAdapter.compact_protocol.events, [],
  'DSH compact protocol installs NO lifecycle events (no hooks)');
assert.strictEqual(dshAdapter.install_scope.global_discovery, 'supported',
  'DSH supports machine-global skill/carrier discovery');

{
  const installer = fs.readFileSync(path.join(REPO, 'install-dsh.sh'), 'utf8');
  for (const forbidden of [
    'manage_config_hook', 'UserPromptSubmit', 'ups_command', 'HOOK_MARKER', 'writeFileSync',
  ]) {
    assert(!installer.includes(forbidden),
      'install-dsh.sh carries no harness-write machinery for "' + forbidden + '"');
  }
  assert(installer.includes('never writes'),
    'install-dsh.sh documents that it never writes user DSH config');
  for (const required of ['--uninstall', '--check', 'DSH_HOME', '.dsh/skills', 'dsh-local']) {
    assert(installer.includes(required), 'install-dsh.sh names ' + required);
  }
  const synced = sync.expected('github');
  const harnessKeys = [...synced.keys()].filter(rel => /(^|\/)(?:hooks|commands|agents|settings)(?:\/|$)/.test(rel));
  assert(harnessKeys.length === 0,
    'sync-dsh-edition renders only skills — no harness tree: ' + JSON.stringify(harnessKeys));
  assert(synced.size > 0 && [...synced.keys()].every(rel => /^\.dsh\/skills\/[^/]+\/SKILL\.md$/.test(rel)),
    'sync-dsh-edition emits exactly .dsh/skills/<name>/SKILL.md files');
}

assert.strictEqual(agents.ROLES.length, 7, 'the canonical catalog is exactly 7 roles');
assert.strictEqual(typeof sync.renderAgent, 'undefined',
  'sync-dsh-edition exposes no agent renderer — DSH is native_only');
assert.strictEqual(typeof sync.renderSkill, 'function',
  'sync-dsh-edition still renders the native command skills');
void contracts;

const claudeTokens = /(CLAUDE_PLUGIN_ROOT|\.claude\/kaola-workflow|--runtime claude|subagent_type:\s*"<role>")/;
const commandNames = ['workflow-init', 'workflow-next', 'kaola-workflow-finalize'];
for (const forge of ['github', 'gitlab', 'gitea']) {
  for (const name of commandNames) {
    const source = forge === 'github'
      ? path.join(REPO, 'commands', name + '.md')
      : path.join(REPO, `plugins/kaola-workflow-${forge}`, 'commands', name + '.md');
    const skill = sync.renderSkill(fs.readFileSync(source, 'utf8'), name, forge);
    assert(!claudeTokens.test(skill),
      forge + '/' + name + ' skill contains no Claude path/token');
    assert(!/^\s*(model|subagent|agent|triggers):/mi.test(skill),
      forge + '/' + name + ' skill has no model/subagent/agent/triggers frontmatter');
    assert(/^name: /m.test(skill) && /^description: /m.test(skill),
      forge + '/' + name + ' skill carries required DSH name+description frontmatter');
    if (name !== 'workflow-init') {
      assert(!/KW-RUNTIME-DISPATCH-(?:START|END)/.test(skill)
        && !/KW-RUNTIME-DELEGATION-(?:START|END)/.test(skill)
        && !/Runtime dispatch contract \(always loaded\)/i.test(skill),
        forge + '/' + name + ' skill carries no dispatch block (the always-loaded carrier owns it)');
      assert(skill.split(agents.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 1,
        forge + '/' + name + ' skill carries the always-loaded-carrier pointer exactly once');
    }
    if (name !== 'workflow-init') {
      assert(/\$\{DSH_HOME|\.dsh\b/.test(skill),
        forge + '/' + name + ' skill resolver probes the DSH home');
    }
    const baseDescription = fs.readFileSync(source, 'utf8').match(/^description:\s*(.+)$/m)[1]
      .replace(/^"|"$/g, '').replace(/\.$/, '');
    const rendered = JSON.parse(skill.match(/^description:\s*(.+)$/m)[1]);
    assert(rendered.startsWith(baseDescription + '. Invoke when the user asks for /' + name),
      forge + '/' + name + ' skill description keeps the command sentence verbatim, then says when to invoke: ' + rendered);
    if (name === 'workflow-next') {
      assert(skill.includes('node "$CLAIM_JS" startup --runtime dsh --target-issues'),
        forge + '/workflow-next emits startup --runtime dsh');
    }
    if (name === 'kaola-workflow-finalize') {
      assert(skill.includes('node "$CLAIM_JS" finalize --project {project}'),
        forge + '/kaola-workflow-finalize emits finalize --project');
    }
  }
}

function hostGuardFor(runtime) {
  const host = typeof agents.runtimeHostName === 'function'
    ? agents.runtimeHostName(runtime)
    : runtime.charAt(0).toUpperCase() + runtime.slice(1);
  return 'Host: ' + host + '. If the running host is not ' + host;
}
for (const runtime of agents.RUNTIMES) {
  const text = agents.renderRuntimeDelegationGuidanceForRuntime(runtime);
  assert(text.includes(hostGuardFor(runtime)), 'host guard present for ' + runtime);
}

function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

function freshFixture() {
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-dsh-test-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const dshStub = [
    '#!/bin/sh',
    'if [ "$1" = "--version" ] || [ "$1" = "-V" ]; then',
    '  echo "0.1.5-rc.2"',
    'else',
    '  exit 0',
    'fi',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(bin, 'dsh'), dshStub, { mode: 0o755 });
  return { home, bin };
}

const fixture = freshFixture();
try {
  const env = {
    ...process.env,
    HOME: fixture.home,
    DSH_HOME: path.join(fixture.home, '.dsh'),
    PATH: fixture.bin + path.delimiter + process.env.PATH,
  };
  // spawn-class: cli-contract
  const preCheck = spawnSync(
    'bash',
    [path.join(REPO, 'install-dsh.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.notStrictEqual(preCheck.status, 0, 'pre-install --check fails');
  assert(/global contract/.test(preCheck.stderr) && /dsh-local/.test(preCheck.stderr)
    && /\.dsh\/AGENTS\.md/.test(preCheck.stderr),
    'pre-install --check names the global contract, the dsh-local target, and its carrier path: ' + preCheck.stderr);

  // spawn-class: environment
  const installResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-dsh.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.strictEqual(installResult.status, 0, installResult.stderr || installResult.stdout);

  const homeRoot = path.join(fixture.home, '.dsh');
  assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')), 'global AGENTS.md carrier installed');
  assert(!fs.existsSync(path.join(homeRoot, 'agents')),
    'global install deploys NO agents dir — DSH is native_only');
  for (const role of agents.ROLES) {
    assert(!fs.existsSync(path.join(homeRoot, 'agents', role + '.md')),
      'global install deploys no profile for ' + role);
  }
  for (const forbidden of ['settings.yaml', '.env', '.credentials.yaml', 'hooks.json', 'commands']) {
    assert(!fs.existsSync(path.join(homeRoot, forbidden)),
      'global install writes no user-owned DSH surface ' + forbidden);
  }
  for (const name of commandNames) {
    assert(fs.existsSync(path.join(homeRoot, 'skills', name, 'SKILL.md')),
      'global skill installed: ' + name);
  }
  for (const script of manifest.supportScripts('github')) {
    assert(fs.existsSync(path.join(homeRoot, 'kaola-workflow', 'scripts', script)),
      'support script installed: ' + script);
  }

  // spawn-class: cli-contract
  const checkResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-dsh.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.strictEqual(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
} finally {
  fs.rmSync(fixture.home, { recursive: true, force: true });
}

const tmp = fs.mkdtempSync(path.join(tmpBase(), 'kw-dsh-sync-'));
try {
  // spawn-class: environment
  let r = spawnSync(process.execPath, [path.join(REPO, 'scripts/sync-dsh-edition.js'), '--tree-root=' + tmp, '--write'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert(!fs.existsSync(path.join(tmp, '.dsh', 'agents')),
    'sync writes NO .dsh/agents tree — DSH is native_only');
  for (const name of commandNames) {
    assert(fs.existsSync(path.join(tmp, '.dsh', 'skills', name, 'SKILL.md')), 'sync writes skill: ' + name);
  }
  for (const forbidden of ['settings.yaml', '.env', 'hooks.json', 'commands']) {
    assert(!fs.existsSync(path.join(tmp, '.dsh', forbidden)),
      'sync writes no harness surface .dsh/' + forbidden);
  }
  // spawn-class: cli-contract
  r = spawnSync(process.execPath, [path.join(REPO, 'scripts/sync-dsh-edition.js'), '--tree-root=' + tmp, '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'templates/global/runtime-contract-adapters.json'), 'utf8'));
const dshTarget = registry.targets.find(t => t.runtime === 'dsh');
assert(dshTarget && dshTarget.carrier.default_root === '.dsh' && dshTarget.carrier.relative_path === 'AGENTS.md',
  'global registry targets DSH to ~/.dsh/AGENTS.md');
assert.deepStrictEqual(dshTarget.discovery, { kind: 'command', commands: ['dsh'] },
  'global registry discovers DSH via the dsh command');
const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
assert(installAll.includes('install-dsh.sh') && /RUNTIMES=\([^)]*dsh/.test(installAll),
  'install-all.sh includes dsh runtime and installer');
const gitignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
assert(gitignore.split(/\r?\n/).includes('.dsh/') && gitignore.split(/\r?\n/).includes('.dsh-*/'),
  '.gitignore ignores generated .dsh/ and per-forge .dsh-*/ trees');

const claimSrc = fs.readFileSync(path.join(REPO, 'scripts/kaola-workflow-claim.js'), 'utf8');
assert(claimSrc.includes('--runtime claude|codex|opencode|kimi|grok|zcode|devin|droid|dsh'),
  'claim.js USAGE includes the dsh runtime');

console.log('dsh-edition test passed');
