#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const sync = require('./sync-devin-edition.js');
const agents = require('./generate-agent-profiles.js');
const manifest = require('./kaola-workflow-install-manifest.js');

const contracts = agents.loadBehaviorContracts(REPO).roles;
const adapters = agents.loadRuntimeAdapters(REPO);
const devinAdapter = adapters.runtimes.devin;

assert(devinAdapter, 'runtime-capabilities declares a Devin adapter');
assert.deepStrictEqual(
  [devinAdapter.evidence].flat().sort(),
  [
    'devin_f1', 'devin_f2', 'devin_f3', 'devin_f4', 'devin_f5', 'devin_f6', 'devin_f7',
    'devin_f8', 'devin_f9', 'devin_f10', 'devin_f11', 'devin_f12', 'devin_f13', 'devin_f14'
  ].sort(),
  'Devin evidence covers F1–F14'
);
for (const id of devinAdapter.evidence) {
  const ev = adapters.evidence[id];
  assert(ev && ev.kind === 'runtime_probe'
    && ev.locator.includes('/Kaola-Workflow/issues/1058')
    && ev.observed_at.startsWith('2026-09-10'),
    'Evidence ' + id + ' is a runtime_probe anchored to issue #1058 on 2026-09-10');
}
assert.strictEqual(devinAdapter.capabilities.nesting, 1, 'Devin nesting is 1');
assert.strictEqual(devinAdapter.capabilities.hot_reload, false, 'Devin hot_reload is false');
assert.strictEqual(devinAdapter.capabilities.rules_survive_compaction, false, 'Devin rules_survive_compaction is false');
assert.deepStrictEqual(devinAdapter.compact_protocol.events, ['UserPromptSubmit'], 'Devin compact protocol uses UserPromptSubmit');
assert.strictEqual(devinAdapter.capabilities.role_dispatch, 'native_only',
  'Devin is native_only — it installs no Kaola role profiles');
assert.strictEqual(devinAdapter.capabilities.named_roles, false, 'Devin exposes no named Kaola roles');
assert.strictEqual(devinAdapter.capabilities.deterministic_profiles, false,
  'Devin renders no deterministic profiles');
assert(devinAdapter.capabilities.delegation_guidance
  && devinAdapter.capabilities.delegation_guidance.native_routes
  && devinAdapter.capabilities.delegation_guidance.availability,
  'Devin adapter declares native_routes + availability delegation guidance');
assert(!('subagent_default' in (devinAdapter.capabilities.delegation_guidance || {})),
  'native_only Devin declares NO subagent_default binding');

assert.strictEqual(agents.ROLES.length, 7, 'the canonical catalog is exactly 7 roles');
assert.strictEqual(typeof sync.renderAgent, 'undefined',
  'sync-devin-edition exposes no agent renderer — Devin is native_only');
assert.strictEqual(typeof sync.renderSkill, 'function',
  'sync-devin-edition still renders the native command skills');

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
    if (skill.includes('KW-RUNTIME-DELEGATION')) {
      assert(skill.includes('Host: Devin.'), forge + '/' + name + ' skill contains Devin host guard');
    }
    assert(skill.includes('triggers:\n  - user\n  - model'),
      forge + '/' + name + ' skill triggers are user+model');
    const baseDescription = fs.readFileSync(source, 'utf8').match(/^description:\s*(.+)$/m)[1]
      .replace(/^"|"$/g, '').replace(/\.$/, '');
    const rendered = JSON.parse(skill.match(/^description:\s*(.+)$/m)[1]);
    assert(rendered.startsWith(baseDescription + '. Invoke when the user asks for /' + name),
      forge + '/' + name + ' skill description keeps the command sentence verbatim, then says when to invoke: ' + rendered);
    if (name === 'workflow-next') {
      assert(skill.includes('node "$CLAIM_JS" startup --runtime devin --target-issues'),
        forge + '/workflow-next emits startup --runtime devin');
    }
    if (name === 'kaola-workflow-finalize') {
      assert(skill.includes('node "$CLAIM_JS" finalize --project {project}'),
        forge + '/kaola-workflow-finalize emits finalize --project');
    }
  }
}

// Host guard is present in every generated runtime adapter block.
function hostGuardFor(runtime) {
  const host = runtime.charAt(0).toUpperCase() + runtime.slice(1);
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
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-devin-test-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const doctorPayload = JSON.stringify({ detail: agents.ROLES });
  const devinStub = [
    '#!/bin/sh',
    'if [ "$1" = "doctor" ] && [ "$2" = "--json" ]; then',
    '  cat <<\'DOCTOR\'',
    doctorPayload,
    'DOCTOR',
    'else',
    '  exit 0',
    'fi',
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(bin, 'devin'), devinStub, { mode: 0o755 });
  return { home, bin };
}

const fixture = freshFixture();
try {
  const env = {
    ...process.env,
    HOME: fixture.home,
    PATH: fixture.bin + path.delimiter + process.env.PATH,
  };
  // A check against a home with nothing installed must name the missing Devin carrier instead of
  // aborting silently on the global-contract exit code.
  // spawn-class: cli-contract
  const preCheck = spawnSync(
    'bash',
    [path.join(REPO, 'install-devin.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.notStrictEqual(preCheck.status, 0, 'pre-install --check fails');
  assert(/global contract/.test(preCheck.stderr) && /devin-local/.test(preCheck.stderr)
    && /\.config\/devin\/AGENTS\.md/.test(preCheck.stderr),
    'pre-install --check names the global contract, the devin-local target, and its carrier path: ' + preCheck.stderr);

  // spawn-class: environment
  const installResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-devin.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.strictEqual(installResult.status, 0, installResult.stderr || installResult.stdout);

  const homeRoot = path.join(fixture.home, '.config', 'devin');
  assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')), 'global AGENTS.md carrier installed');
  assert(!fs.existsSync(path.join(homeRoot, 'agents')),
    'global install deploys NO agents dir — Devin is native_only');
  for (const role of agents.ROLES) {
    assert(!fs.existsSync(path.join(homeRoot, 'agents', role + '.md')),
      'global install deploys no profile for ' + role);
  }
  for (const name of commandNames) {
    assert(fs.existsSync(path.join(homeRoot, 'skills', name, 'SKILL.md')),
      'global skill installed: ' + name);
  }
  for (const script of manifest.supportScripts('github')) {
    assert(fs.existsSync(path.join(homeRoot, 'kaola-workflow', 'scripts', script)),
      'support script installed: ' + script);
  }

  const config = JSON.parse(fs.readFileSync(path.join(homeRoot, 'config.json'), 'utf8'));
  assert(Array.isArray(config.hooks.UserPromptSubmit), 'UserPromptSubmit hooks is array');
  const kaolaEntries = config.hooks.UserPromptSubmit.filter(entry => {
    const hooks = Array.isArray(entry.hooks) ? entry.hooks : [];
    return hooks.some(h => h && typeof h.command === 'string' && h.command.includes('# kaola-workflow-userpromptsubmit-hook'));
  });
  assert.strictEqual(kaolaEntries.length, 1, 'exactly one Kaola UserPromptSubmit entry');
  const entry = kaolaEntries[0];
  assert.strictEqual(entry.matcher, '', 'UserPromptSubmit matcher is empty');
  assert.strictEqual(entry.hooks[0].type, 'command', 'hook type is command');
  assert(entry.hooks[0].command.includes('hookEventName:"UserPromptSubmit"'), 'hook emits hookEventName');
  assert(entry.hooks[0].command.includes('additionalContext:"'), 'hook emits additionalContext');
  assert(
    entry.hooks[0].command.includes('KW-COMPACT-RECOVERY-V2 is not in your context'),
    'hook additionalContext is the short recovery instruction'
  );

  // spawn-class: cli-contract
  const checkResult = spawnSync(
    'bash',
    [path.join(REPO, 'install-devin.sh'), '--global', '--forge=github', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 }
  );
  assert.strictEqual(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
} finally {
  fs.rmSync(fixture.home, { recursive: true, force: true });
}

// sync --write/--check roundtrip against a blank staging root.
const tmp = fs.mkdtempSync(path.join(tmpBase(), 'kw-devin-sync-'));
try {
  // spawn-class: environment
  let r = spawnSync(process.execPath, [path.join(REPO, 'scripts/sync-devin-edition.js'), '--tree-root=' + tmp, '--write'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert(!fs.existsSync(path.join(tmp, '.devin', 'agents')),
    'sync writes NO .devin/agents tree — Devin is native_only');
  for (const name of commandNames) {
    assert(fs.existsSync(path.join(tmp, '.devin', 'skills', name, 'SKILL.md')), 'sync writes skill: ' + name);
  }
  // spawn-class: cli-contract
  r = spawnSync(process.execPath, [path.join(REPO, 'scripts/sync-devin-edition.js'), '--tree-root=' + tmp, '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const registry = JSON.parse(fs.readFileSync(path.join(REPO, 'templates/global/runtime-contract-adapters.json'), 'utf8'));
const devinTarget = registry.targets.find(t => t.runtime === 'devin');
assert(devinTarget && devinTarget.carrier.default_root === '.config/devin' && devinTarget.carrier.relative_path === 'AGENTS.md',
  'global registry targets Devin to ~/.config/devin/AGENTS.md');
const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
assert(installAll.includes('install-devin.sh') && /RUNTIMES=\([^)]*devin/.test(installAll),
  'install-all.sh includes devin runtime and installer');

const claimSrc = fs.readFileSync(path.join(REPO, 'scripts/kaola-workflow-claim.js'), 'utf8');
assert(claimSrc.includes('--runtime claude|codex|opencode|kimi|grok|zcode|devin'),
  'claim.js USAGE includes devin runtime');

console.log('devin-edition test passed');
