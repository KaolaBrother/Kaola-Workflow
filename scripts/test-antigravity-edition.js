#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const sync = require('./sync-antigravity-edition.js');
const facts = require('./runtime-adapter-facts.js');
const manifest = require('./kaola-workflow-install-manifest.js');

const adapters = facts.loadRuntimeAdapters(REPO);
const agyAdapter = adapters.runtimes.antigravity;

assert(agyAdapter, 'runtime-capabilities declares an Antigravity adapter');
assert.deepStrictEqual(
  [agyAdapter.evidence].flat().sort(),
  ['antigravity_cli', 'antigravity_customization_docs', 'antigravity_live_probe_20261026', 'antigravity_rules_docs'].sort(),
  'Antigravity evidence covers the four first-party entries'
);
assert(adapters.evidence.antigravity_live_probe_20261026.kind === 'runtime_probe'
  && adapters.evidence.antigravity_live_probe_20261026.locator.includes('/Kaola-Workflow/issues/1122')
  && adapters.evidence.antigravity_live_probe_20261026.observed_at.startsWith('2026-10-26'),
  'antigravity_live_probe_20261026 is a runtime_probe anchored to issue #1122 on 2026-10-26');
assert(adapters.evidence.antigravity_rules_docs.kind === 'official_docs'
  && adapters.evidence.antigravity_customization_docs.kind === 'official_docs',
  'doc citations are official_docs, never runtime_probe');
// #1101: no retired role/profile/model-binding capability on any runtime.
assert(['unknown', 'direct'].includes(agyAdapter.capabilities.instruction_loading),
  'Antigravity instruction_loading is unknown until measured, or direct once measured');
assert(['unknown', 'none'].includes(agyAdapter.capabilities.hook_scope),
  'Antigravity hook_scope is unknown until measured, or none');
for (const key of facts.RETIRED_CAPABILITIES) {
  assert(!Object.prototype.hasOwnProperty.call(agyAdapter.capabilities, key),
    'Antigravity adapter carries no retired role capability ' + key);
}
assert.deepStrictEqual(Object.keys(agyAdapter.capabilities.delegation_guidance || {}).sort(),
  ['availability', 'native_routes'],
  'Antigravity delegation guidance is exactly native_routes + availability (no default binding)');
assert.deepStrictEqual(agyAdapter.compact_protocol.events, [],
  'Antigravity compact protocol installs NO lifecycle events (no hooks)');

const RETIRED_ROLE_RE = /\b(?:code-explorer|code-reviewer|doc-updater|implementer|investigator|knowledge-lookup|tdd-guide)\b/;
const RETIRED_BINDING_RE = /\*\*Roles:\*\*|\*\*Subagent default:\*\*|<role>|^\s*(?:model|effort)\s*[:=]|model_reasoning_effort/m;
{
  const section = facts.renderRuntimeDelegationGuidanceForRuntime('antigravity');
  const guidance = agyAdapter.capabilities.delegation_guidance;
  assert(section.startsWith(facts.DELEGATION_GUIDANCE_START) && section.endsWith(facts.DELEGATION_GUIDANCE_END)
    && section.includes('## Runtime adapter facts')
    && section.includes('Host: Antigravity. If the running host is not Antigravity')
    && section.includes(guidance.native_routes) && section.includes(guidance.availability),
    'Antigravity adapter section renders the host guard, native_routes, and availability');
  assert(!RETIRED_ROLE_RE.test(section) && !RETIRED_BINDING_RE.test(section),
    'Antigravity adapter section names no retired role and pins no model: ' + section);
}

{
  const installer = fs.readFileSync(path.join(REPO, 'install-antigravity.sh'), 'utf8');
  for (const forbidden of [
    'manage_config_hook', 'UserPromptSubmit', 'ups_command', 'HOOK_MARKER', 'writeFileSync',
  ]) {
    assert(!installer.includes(forbidden),
      'install-antigravity.sh carries no harness-write machinery for "' + forbidden + '"');
  }
  assert(installer.includes('never writes'),
    'install-antigravity.sh documents that it never writes user Antigravity config');
  for (const required of ['--uninstall', '--check', '.gemini/config/skills', 'antigravity-local']) {
    assert(installer.includes(required), 'install-antigravity.sh names ' + required);
  }
  assert(!/AGY_HOME|ANTIGRAVITY_HOME|ANTIGRAVITY_CONFIG_DIR/.test(installer),
    'install-antigravity.sh invents no root-override env (none is measured)');
  assert(installer.lastIndexOf('install_global_carrier') > installer.lastIndexOf('cp "$src/SKILL.md"'),
    'install-antigravity.sh installs the global-contract carrier LAST');
  const synced = sync.expected('github');
  const harnessKeys = [...synced.keys()].filter(rel => /(^|\/)(?:hooks|commands|agents|settings)(?:\/|$)/.test(rel));
  assert(harnessKeys.length === 0,
    'sync-antigravity-edition renders only skills — no harness tree: ' + JSON.stringify(harnessKeys));
  assert(synced.size > 0 && [...synced.keys()].every(rel => /^\.antigravity\/skills\/[^/]+\/SKILL\.md$/.test(rel)),
    'sync-antigravity-edition emits exactly .antigravity/skills/<name>/SKILL.md files');
}

assert.strictEqual(typeof sync.renderSkill, 'function',
  'sync-antigravity-edition renders the native command skills');

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
    assert(!RETIRED_ROLE_RE.test(skill) && !RETIRED_BINDING_RE.test(skill),
      forge + '/' + name + ' skill names no retired role and pins no subagent model');
    assert(/^name: /m.test(skill) && /^description: /m.test(skill),
      forge + '/' + name + ' skill carries required name+description frontmatter');
    if (name !== 'workflow-init') {
      // Antigravity keeps the dispatch contract INLINE (it is not an always-loaded-carrier
      // recovery runtime): the common block stays, only the adapter-facts region is rendered.
      assert(skill.includes('KW-RUNTIME-DISPATCH-START') && skill.includes('KW-RUNTIME-DISPATCH-END'),
        forge + '/' + name + ' skill keeps the dispatch contract inline');
      assert(skill.split(facts.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 0,
        forge + '/' + name + ' skill carries no always-loaded-carrier pointer');
      assert(skill.includes('Host: Antigravity. If the running host is not Antigravity'),
        forge + '/' + name + ' skill carries the Antigravity adapter facts inline');
      assert(skill.includes(facts.DELEGATION_GUIDANCE_START) && skill.includes(facts.DELEGATION_GUIDANCE_END),
        forge + '/' + name + ' skill carries the delegation-guidance region with markers');
      assert(/\.gemini\/config\b/.test(skill),
        forge + '/' + name + ' skill resolver probes the Antigravity global root');
    }
    const baseDescription = fs.readFileSync(source, 'utf8').match(/^description:\s*(.+)$/m)[1]
      .replace(/^"|"$/g, '').replace(/\.$/, '');
    const rendered = JSON.parse(skill.match(/^description:\s*(.+)$/m)[1]);
    assert(rendered.startsWith(baseDescription + '. Invoke when the user asks for /' + name),
      forge + '/' + name + ' skill description keeps the command sentence verbatim, then says when to invoke: ' + rendered);
    if (name === 'workflow-next') {
      assert(skill.includes('node "$CLAIM_JS" startup --runtime antigravity --target-issues'),
        forge + '/workflow-next emits startup --runtime antigravity');
    }
    if (name === 'kaola-workflow-finalize') {
      assert(skill.includes('node "$CLAIM_JS" finalize --project {project}'),
        forge + '/kaola-workflow-finalize emits finalize --project');
    }
  }
}

// Byte parity / idempotence of the three forge renders against a fresh tree.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-agy-parity-'));
  try {
    for (const forge of ['github', 'gitlab', 'gitea']) {
      // spawn-class: environment
      let r = spawnSync(process.execPath,
        [path.join(REPO, 'scripts/sync-antigravity-edition.js'), '--tree-root=' + tmp, '--forge=' + forge, '--write'],
        { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
      // spawn-class: environment
      r = spawnSync(process.execPath,
        [path.join(REPO, 'scripts/sync-antigravity-edition.js'), '--tree-root=' + tmp, '--forge=' + forge, '--write'],
        { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
      // spawn-class: cli-contract
      r = spawnSync(process.execPath,
        [path.join(REPO, 'scripts/sync-antigravity-edition.js'), '--tree-root=' + tmp, '--forge=' + forge, '--check'],
        { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

function freshFixture() {
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-agy-test-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const agyStub = [
    '#!/bin/sh',
    'if [ "$1" = "--version" ]; then',
    '  echo "1.4.7"',
    'else',
    '  exit 0',
    'fi',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(bin, 'agy'), agyStub, { mode: 0o755 });
  return { home, bin };
}

const fixture = freshFixture();
try {
  const env = {
    ...process.env,
    HOME: fixture.home,
    PATH: fixture.bin + path.delimiter + process.env.PATH,
  };
  const homeRoot = path.join(fixture.home, '.gemini', 'config');

  // Pre-install --check fails and names the target + carrier path.
  // spawn-class: cli-contract
  const preCheck = spawnSync(
    'bash',
    [path.join(REPO, 'install-antigravity.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
  );
  assert.notStrictEqual(preCheck.status, 0, 'pre-install --check fails');
  assert(/global contract/.test(preCheck.stderr) && /antigravity-local/.test(preCheck.stderr)
    && /\.gemini\/config\/AGENTS\.md/.test(preCheck.stderr),
    'pre-install --check names the global contract, the antigravity-local target, and its carrier path: ' + preCheck.stderr);

  // spawn-class: environment
  const installResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-antigravity.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
  );
  assert.strictEqual(installResult.status, 0, installResult.stderr || installResult.stdout);

  assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')), 'global AGENTS.md carrier installed');
  assert(!fs.existsSync(path.join(homeRoot, 'agents')),
    'global install deploys NO agents dir — Antigravity is native_only');
  assert(!fs.existsSync(path.join(fixture.home, '.gemini', 'antigravity-cli', 'settings.json')),
    'global install writes nothing under the CLI settings root');
  for (const name of commandNames) {
    assert(fs.existsSync(path.join(homeRoot, 'skills', name, 'SKILL.md')),
      'global skill installed: ' + name);
  }
  for (const script of manifest.supportScripts('github')) {
    assert(fs.existsSync(path.join(homeRoot, 'kaola-workflow', 'scripts', script)),
      'support script installed: ' + script);
  }

  // An unrelated user-owned skill is retained by check, reinstall, and uninstall.
  const unrelated = path.join(homeRoot, 'skills', 'user-own-skill');
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'SKILL.md'), '---\nname: user-own-skill\ndescription: user content\n---\n');

  // spawn-class: cli-contract
  const checkResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-antigravity.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
  );
  assert.strictEqual(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
  assert(fs.existsSync(path.join(unrelated, 'SKILL.md')), 'unrelated user skill retained by check');

  const projectDir = fs.mkdtempSync(path.join(tmpBase(), 'kw-agy-proj-'));
  try {
    fs.mkdirSync(path.join(projectDir, '.git'), { recursive: true });
    // spawn-class: environment
    const projInstall = spawnSync(
      'bash',
      [path.join(REPO, 'install-antigravity.sh'), '--project=' + projectDir, '--forge=github'],
      { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
    );
    assert.strictEqual(projInstall.status, 0, projInstall.stderr || projInstall.stdout);
    for (const name of commandNames) {
      assert(fs.existsSync(path.join(projectDir, '.agents', 'skills', name, 'SKILL.md')),
        'project skill installed: ' + name);
    }
    assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')),
      'project install leaves the machine-global carrier in place');
    const gitEntries = fs.readdirSync(path.join(projectDir, '.git'));
    assert(gitEntries.length === 0, 'no ambient .git writes during project install');
    // spawn-class: environment
    const projUninstall = spawnSync(
      'bash',
      [path.join(REPO, 'install-antigravity.sh'), '--project=' + projectDir, '--uninstall', '--forge=github'],
      { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
    );
    assert.strictEqual(projUninstall.status, 0, projUninstall.stderr || projUninstall.stdout);
    assert(!fs.existsSync(path.join(projectDir, '.agents', 'skills', 'workflow-next')),
      'project uninstall removes the Kaola skill');
    assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')),
      'project uninstall leaves the machine-global carrier intact');
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }

  // Reinstall over a clean install is idempotent and stays green.
  // spawn-class: environment
  const reinstall = spawnSync(
    'bash',
    [path.join(REPO, 'install-antigravity.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
  );
  assert.strictEqual(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
  assert(fs.existsSync(path.join(unrelated, 'SKILL.md')), 'unrelated user skill retained by reinstall');

  // spawn-class: environment
  const uninstall = spawnSync(
    'bash',
    [path.join(REPO, 'install-antigravity.sh'), '--global', '--uninstall', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 }
  );
  assert.strictEqual(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  for (const name of commandNames) {
    assert(!fs.existsSync(path.join(homeRoot, 'skills', name)),
      'uninstall removes the Kaola skill dir: ' + name);
  }
  assert(!fs.existsSync(path.join(homeRoot, 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js')),
    'uninstall removes the support scripts');
  const carrierPath = path.join(homeRoot, 'AGENTS.md');
  if (fs.existsSync(carrierPath)) {
    const residue = fs.readFileSync(carrierPath, 'utf8');
    assert(!residue.includes('KW-GLOBAL-CONTRACT-MANAGED-START')
      && !residue.includes('KW-GLOBAL-CONTRACT-MANAGED-END')
      && !residue.includes('Global Workflow Contract'),
      'global uninstall strips this runtime\'s own managed region (an empty file may remain)');
  }
  assert(fs.existsSync(path.join(homeRoot, 'skills', 'user-own-skill', 'SKILL.md')),
    'uninstall preserves unrelated user skills');
} finally {
  fs.rmSync(fixture.home, { recursive: true, force: true });
}

const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'templates/global/runtime-contract-adapters.json'), 'utf8'));
const agyTarget = registry.targets.find(t => t.runtime === 'antigravity');
assert(agyTarget && agyTarget.carrier.default_root === '.gemini/config' && agyTarget.carrier.relative_path === 'AGENTS.md',
  'global registry targets Antigravity to ~/.gemini/config/AGENTS.md');
assert(!Object.prototype.hasOwnProperty.call(agyTarget.carrier, 'root_env'),
  'global registry invents no Antigravity root-override env');
assert.deepStrictEqual(agyTarget.discovery, { kind: 'command', commands: ['agy'] },
  'global registry discovers Antigravity via the agy command');
const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
assert(installAll.includes('install-antigravity.sh') && /RUNTIMES=\([^)]*antigravity/.test(installAll),
  'install-all.sh includes the antigravity runtime and installer');
const gitignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
assert(gitignore.split(/\r?\n/).includes('.antigravity/') && gitignore.split(/\r?\n/).includes('.antigravity-*/'),
  '.gitignore ignores generated .antigravity/ and per-forge .antigravity-*/ trees');

const claimSrc = fs.readFileSync(path.join(REPO, 'scripts/kaola-workflow-claim.js'), 'utf8');
assert(claimSrc.includes('--runtime claude|codex|opencode|kimi|grok|zcode|devin|droid|dsh|antigravity'),
  'claim.js USAGE includes the antigravity runtime');

console.log('antigravity-edition test passed');
