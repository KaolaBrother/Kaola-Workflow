#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const sync = require('./sync-droid-edition.js');
const agents = require('./generate-agent-profiles.js');
const manifest = require('./kaola-workflow-install-manifest.js');

const contracts = agents.loadBehaviorContracts(REPO).roles;
const adapters = agents.loadRuntimeAdapters(REPO);
const droidAdapter = adapters.runtimes.droid;

assert(droidAdapter, 'runtime-capabilities declares a Droid adapter');
assert.deepStrictEqual(
  [droidAdapter.evidence].flat().sort(),
  [
    'droid_agents_md', 'droid_skills', 'droid_commands', 'droid_subagents', 'droid_hooks',
    'droid_live_probe_20260916',
  ].sort(),
  'Droid evidence covers the six first-party entries'
);
assert(adapters.evidence.droid_live_probe_20260916.kind === 'runtime_probe'
  && adapters.evidence.droid_live_probe_20260916.locator.includes('/Kaola-Workflow/issues/1078')
  && adapters.evidence.droid_live_probe_20260916.observed_at.startsWith('2026-09-16'),
  'droid_live_probe_20260916 is a runtime_probe anchored to issue #1078 on 2026-09-16');
for (const id of ['droid_agents_md', 'droid_skills', 'droid_commands', 'droid_subagents', 'droid_hooks']) {
  const ev = adapters.evidence[id];
  assert(ev && ev.kind === 'official_docs' && ev.locator.startsWith('https://docs.factory.ai/'),
    'evidence ' + id + ' is an official_docs entry anchored to docs.factory.ai');
}
assert.strictEqual(droidAdapter.capabilities.role_dispatch, 'native_only',
  'Droid is native_only — it installs no Kaola role profiles');
assert.strictEqual(droidAdapter.capabilities.named_roles, false, 'Droid exposes no named Kaola roles');
assert.strictEqual(droidAdapter.capabilities.deterministic_profiles, false,
  'Droid renders no deterministic profiles');
assert.strictEqual(droidAdapter.capabilities.instruction_loading, 'direct',
  'Droid discovers instructions root-to-cwd plus personal dirs');
assert.strictEqual(droidAdapter.capabilities.hook_scope, 'user_and_project',
  'Droid measures a user+project hook surface');
assert(droidAdapter.capabilities.delegation_guidance
  && droidAdapter.capabilities.delegation_guidance.native_routes
  && droidAdapter.capabilities.delegation_guidance.availability,
  'Droid adapter declares native_routes + availability delegation guidance');
assert(!('subagent_default' in (droidAdapter.capabilities.delegation_guidance || {})),
  'native_only Droid declares NO subagent_default binding');
assert.deepStrictEqual(droidAdapter.compact_protocol.events, [],
  'Droid compact protocol installs NO lifecycle events (no hooks)');
assert.strictEqual(droidAdapter.install_scope.global_discovery, 'supported',
  'Droid supports machine-global skill/carrier discovery');

// ------- NO-HOOK / NO-HARNESS-ADDITIONS PROTOCOL -------
// The edition deliberately installs NONE of Droid's harness surfaces beyond the skills and the
// always-loaded AGENTS.md carrier: no hooks, no custom slash commands, no custom droids, no MCP,
// no settings.json. These are measured surfaces of the runtime (evidence droid_hooks /
// droid_commands / droid_subagents) that this edition chooses not to touch. The installer may
// DOCUMENT that it writes none of them (its header and usage say so); what it must never do is
// carry the machinery — a hook write path or a config/droid/MCP writer — so the guards below
// look for the write machinery, and the hermetic install later proves no harness file appears.
{
  const installer = fs.readFileSync(path.join(REPO, 'install-droid.sh'), 'utf8');
  for (const forbidden of [
    'manage_config_hook', 'UserPromptSubmit', 'ups_command', 'HOOK_MARKER', 'writeFileSync',
  ]) {
    assert(!installer.includes(forbidden),
      'install-droid.sh carries no harness-write machinery for "' + forbidden + '"');
  }
  for (const required of ['--uninstall', '--check', 'DROID_HOME', '.factory/skills', 'droid-local']) {
    assert(installer.includes(required), 'install-droid.sh names ' + required);
  }
  // The generator's ACTUAL output set is the proof: every key sync.expected() emits must be a
  // skill under .factory<forge>/skills/<name>/SKILL.md, and none may name a harness tree
  // (hooks/commands/agents/droids). Surface-name prose in native dispatch guidance is not a
  // write, so the check reads the rendered file set, never a regex over the source text.
  const synced = sync.expected('github');
  const harnessKeys = [...synced.keys()].filter(rel => /(^|\/)(?:hooks|commands|agents|droids)(?:\/|$)/.test(rel));
  assert(harnessKeys.length === 0,
    'sync-droid-edition renders only skills — no harness tree: ' + JSON.stringify(harnessKeys));
  assert(synced.size > 0 && [...synced.keys()].every(rel => /^\.factory\/skills\/[^/]+\/SKILL\.md$/.test(rel)),
    'sync-droid-edition emits exactly .factory/skills/<name>/SKILL.md files');
}

assert.strictEqual(agents.ROLES.length, 7, 'the canonical catalog is exactly 7 roles');
assert.strictEqual(typeof sync.renderAgent, 'undefined',
  'sync-droid-edition exposes no agent renderer — Droid is native_only');
assert.strictEqual(typeof sync.renderSkill, 'function',
  'sync-droid-edition still renders the native command skills');

const claudeTokens = /(CLAUDE_PLUGIN_ROOT|\.claude\/kaola-workflow|--runtime claude|subagent_type:\s*"<role>")/;
const commandNames = ['workflow-init', 'workflow-next', 'kaola-workflow-finalize'];
const renderedSkills = new Map();
for (const forge of ['github', 'gitlab', 'gitea']) {
  for (const name of commandNames) {
    const source = forge === 'github'
      ? path.join(REPO, 'commands', name + '.md')
      : path.join(REPO, `plugins/kaola-workflow-${forge}`, 'commands', name + '.md');
    const skill = sync.renderSkill(fs.readFileSync(source, 'utf8'), name, forge);
    renderedSkills.set(forge + '/' + name, skill);
    assert(!claudeTokens.test(skill),
      forge + '/' + name + ' skill contains no Claude path/token');
    assert(!/^\s*(model|subagent|agent):/mi.test(skill),
      forge + '/' + name + ' skill has no model/subagent/agent frontmatter');
    // #1078: Droid is an always-loaded carrier — generated Next/Finalize
    // skills carry the pointer once, no marked dispatch region, no adapter
    // facts (workflow-init carries no dispatch region at all).
    if (name !== 'workflow-init') {
      assert(!/KW-RUNTIME-DISPATCH-(?:START|END)/.test(skill)
        && !/KW-RUNTIME-DELEGATION-(?:START|END)/.test(skill)
        && !/Runtime dispatch contract \(always loaded\)/i.test(skill),
        forge + '/' + name + ' skill carries no dispatch block (the always-loaded carrier owns it)');
      assert(skill.split(agents.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 1,
        forge + '/' + name + ' skill carries the always-loaded-carrier pointer exactly once');
    }
    assert(skill.includes('triggers:\n  - user\n  - model'),
      forge + '/' + name + ' skill triggers are user+model');
    // The resolver probes the machine-global Droid home (~/.factory) before the self-dev repo
    // dir; only the script-invoking skills (next/finalize) carry a kaola_script resolver at all.
    if (name !== 'workflow-init') {
      assert(/\$\{DROID_HOME|\.factory\b/.test(skill),
        forge + '/' + name + ' skill resolver probes the Droid home');
    }
    const baseDescription = fs.readFileSync(source, 'utf8').match(/^description:\s*(.+)$/m)[1]
      .replace(/^"|"$/g, '').replace(/\.$/, '');
    const rendered = JSON.parse(skill.match(/^description:\s*(.+)$/m)[1]);
    assert(rendered.startsWith(baseDescription + '. Invoke when the user asks for /' + name),
      forge + '/' + name + ' skill description keeps the command sentence verbatim, then says when to invoke: ' + rendered);
    if (name === 'workflow-next') {
      assert(skill.includes('node "$CLAIM_JS" startup --runtime droid --target-issues'),
        forge + '/workflow-next emits startup --runtime droid');
    }
    if (name === 'kaola-workflow-finalize') {
      assert(skill.includes('node "$CLAIM_JS" finalize --project {project}'),
        forge + '/kaola-workflow-finalize emits finalize --project');
    }
  }
}

// Host guard is present in every generated runtime adapter block.
function hostGuardFor(runtime) {
  const host = agents.runtimeHostName(runtime);
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
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-test-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const droidStub = [
    '#!/bin/sh',
    'if [ "$1" = "--version" ] || [ "$1" = "version" ]; then',
    '  echo "0.220.0"',
    'else',
    '  exit 0',
    'fi',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(bin, 'droid'), droidStub, { mode: 0o755 });
  return { home, bin };
}

const fixture = freshFixture();
try {
  const env = {
    ...process.env,
    HOME: fixture.home,
    DROID_HOME: path.join(fixture.home, '.factory'),
    PATH: fixture.bin + path.delimiter + process.env.PATH,
  };
  // A check against a home with nothing installed must name the missing Droid carrier instead of
  // aborting silently on the global-contract exit code.
  // spawn-class: cli-contract
  const preCheck = spawnSync(
    'bash',
    [path.join(REPO, 'install-droid.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.notStrictEqual(preCheck.status, 0, 'pre-install --check fails');
  assert(/global contract/.test(preCheck.stderr) && /droid-local/.test(preCheck.stderr)
    && /\.factory\/AGENTS\.md/.test(preCheck.stderr),
    'pre-install --check names the global contract, the droid-local target, and its carrier path: ' + preCheck.stderr);

  // spawn-class: environment
  const installResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-droid.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.strictEqual(installResult.status, 0, installResult.stderr || installResult.stdout);

  const homeRoot = path.join(fixture.home, '.factory');
  assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')), 'global AGENTS.md carrier installed');
  assert(!fs.existsSync(path.join(homeRoot, 'agents')),
    'global install deploys NO agents dir — Droid is native_only');
  for (const role of agents.ROLES) {
    assert(!fs.existsSync(path.join(homeRoot, 'agents', role + '.md')),
      'global install deploys no profile for ' + role);
  }
  // No-hook protocol: the Droid home carries NO config.json, NO hooks.json, NO droids dir,
  // NO commands dir, NO settings.json after a global install.
  for (const forbidden of ['config.json', 'hooks.json', 'settings.json', 'droids', 'commands', 'mcp']) {
    assert(!fs.existsSync(path.join(homeRoot, forbidden)),
      'global install writes no harness surface ' + forbidden + ' in ~/.factory');
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
    [path.join(REPO, 'install-droid.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.strictEqual(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
} finally {
  fs.rmSync(fixture.home, { recursive: true, force: true });
}

// sync --write/--check roundtrip against a blank staging root.
const tmp = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-sync-'));
try {
  // spawn-class: environment
  let r = spawnSync(process.execPath, [path.join(REPO, 'scripts/sync-droid-edition.js'), '--tree-root=' + tmp, '--write'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert(!fs.existsSync(path.join(tmp, '.factory', 'agents')),
    'sync writes NO .factory/agents tree — Droid is native_only');
  for (const name of commandNames) {
    assert(fs.existsSync(path.join(tmp, '.factory', 'skills', name, 'SKILL.md')), 'sync writes skill: ' + name);
  }
  // No-hook protocol: the sync tree is skills-only.
  for (const forbidden of ['config.json', 'hooks.json', 'commands', 'droids', 'mcp']) {
    assert(!fs.existsSync(path.join(tmp, '.factory', forbidden)),
      'sync writes no harness surface .factory/' + forbidden);
  }
  // spawn-class: cli-contract
  r = spawnSync(process.execPath, [path.join(REPO, 'scripts/sync-droid-edition.js'), '--tree-root=' + tmp, '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'templates/global/runtime-contract-adapters.json'), 'utf8'));
const droidTarget = registry.targets.find(t => t.runtime === 'droid');
assert(droidTarget && droidTarget.carrier.default_root === '.factory' && droidTarget.carrier.relative_path === 'AGENTS.md',
  'global registry targets Droid to ~/.factory/AGENTS.md');
const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
assert(installAll.includes('install-droid.sh') && /RUNTIMES=\([^)]*droid/.test(installAll),
  'install-all.sh includes droid runtime and installer');

const claimSrc = fs.readFileSync(path.join(REPO, 'scripts/kaola-workflow-claim.js'), 'utf8');
assert(claimSrc.includes('--runtime claude|codex|opencode|kimi|grok|zcode|devin|droid|dsh'),
  'claim.js USAGE includes droid and dsh runtimes');

console.log('droid-edition test passed');
