#!/usr/bin/env node
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const sync = require('./sync-hermes-edition.js');
const facts = require('./runtime-adapter-facts.js');
const manifest = require('./kaola-workflow-install-manifest.js');

function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

const adapters = facts.loadRuntimeAdapters(REPO);
const hermes = adapters.runtimes.hermes;
assert(hermes, 'runtime-capabilities declares a Hermes adapter');
assert.strictEqual(Object.keys(adapters.runtimes).length, 14,
  'runtime-capabilities declares fourteen adapter variants');
assert.strictEqual(new Set(Object.values(adapters.runtimes).map(row => row.runtime)).size, 12,
  'runtime-capabilities declares twelve runtime families');
assert.deepStrictEqual([hermes.evidence].flat().sort(), [
  'hermes_cli',
  'hermes_compaction',
  'hermes_curator_update',
  'hermes_instructions',
  'hermes_live_probe_20261028',
  'hermes_skills',
  'hermes_soul',
].sort(), 'Hermes evidence covers the seven P0 entries');
for (const id of hermes.evidence) {
  assert(adapters.evidence[id] && adapters.evidence[id].kind === 'runtime_probe',
    'Hermes evidence ' + id + ' is a runtime_probe');
  assert(adapters.evidence[id].locator.includes('/Kaola-Workflow/issues/1124')
    && adapters.evidence[id].observed_at.startsWith('2026-10-28'),
    'Hermes evidence ' + id + ' is anchored to #1124 on 2026-10-28');
}
assert(hermes.capabilities.instruction_loading === 'direct',
  'Hermes instruction_loading is direct (P0 M1)');
assert(hermes.capabilities.hook_scope === 'user_only',
  'Hermes supports host user hooks (KW installs none), so hook_scope is user_only');
for (const key of facts.RETIRED_CAPABILITIES) {
  assert(!Object.prototype.hasOwnProperty.call(hermes.capabilities, key),
    'Hermes adapter carries no retired role capability ' + key);
}
assert.deepStrictEqual(Object.keys(hermes.capabilities.delegation_guidance || {}).sort(),
  ['availability', 'native_routes'],
  'Hermes delegation guidance is exactly native_routes + availability');
assert.deepStrictEqual(hermes.compact_protocol.events, [],
  'Hermes compact protocol installs NO lifecycle events (no hooks)');
assert(/SOUL\.md/.test(hermes.compact_protocol.reload)
  && /skill body/i.test(hermes.compact_protocol.reload),
  'Hermes compact reload records the measured SOUL/AGENTS survival and skill-body loss');
assert.strictEqual(hermes.install_scope.global_discovery, 'supported');
assert.strictEqual(hermes.install_scope.required_project_materialization, 'no');
assert.strictEqual(hermes.install_scope.ambient_repository_write, false);
assert.strictEqual(hermes.install_scope.evidence_status, 'measured');

const RETIRED_ROLE_RE = /\b(?:code-explorer|code-reviewer|doc-updater|implementer|investigator|knowledge-lookup|tdd-guide)\b/;
const RETIRED_BINDING_RE = /\*\*Roles:\*\*|\*\*Subagent default:\*\*|<role>|^\s*(?:model|effort)\s*[:=]|model_reasoning_effort/m;
{
  const section = facts.renderRuntimeDelegationGuidanceForRuntime('hermes');
  const guidance = hermes.capabilities.delegation_guidance;
  assert(section.startsWith(facts.DELEGATION_GUIDANCE_START)
    && section.endsWith(facts.DELEGATION_GUIDANCE_END)
    && section.includes('Host: Hermes. If the running host is not Hermes')
    && section.includes(guidance.native_routes) && section.includes(guidance.availability),
    'Hermes adapter section renders the host guard, native_routes, and availability');
  assert(!RETIRED_ROLE_RE.test(section) && !RETIRED_BINDING_RE.test(section),
    'Hermes adapter section names no retired role and pins no model: ' + section);
}

const installer = fs.readFileSync(path.join(REPO, 'install-hermes.sh'), 'utf8');
for (const required of [
  '--uninstall', '--check', '--global', 'hermes-local', 'SOUL.md',
  'HERMES_HOME', 'sync-hermes-edition.js', '.kw-hermes',
]) {
  assert(installer.includes(required), 'install-hermes.sh names ' + required);
}
assert(!/writeFileSync/.test(installer), 'install-hermes.sh writes no Hermes config from JS');
assert(!/HERMES\.md/.test(installer), 'install-hermes.sh never creates HERMES.md');
assert(installer.lastIndexOf('install_global_carrier') > installer.lastIndexOf('cp "$src/SKILL.md"'),
  'install-hermes.sh installs the global-contract carrier LAST');
assert(/project scope is not supported/.test(installer), 'install-hermes.sh refuses project scope (D4)');

const synced = sync.expected('github');
assert.strictEqual(synced.size, 3, 'Hermes renders exactly the three workflow skills');
for (const rel of synced.keys()) {
  assert(/^\.kw-hermes\/skills\/[^/]+\/SKILL\.md$/.test(rel),
    'Hermes build tree is .kw-hermes/skills/<name>/SKILL.md: ' + rel);
  assert(!/^\.hermes\//.test(rel), 'the native <repo>/.hermes project root is never the build tree');
}
assert(sync.skillRel('workflow-next', 'gitlab') === '.kw-hermes-gitlab/skills/workflow-next/SKILL.md',
  'Hermes forge tree uses .kw-hermes-<forge>/');
assert(sync.treeLabel('github') === '.kw-hermes', 'github keeps the bare .kw-hermes tree');

const claudeTokens = /(CLAUDE_PLUGIN_ROOT|\.claude\/kaola-workflow|--runtime claude|subagent_type:\s*"<role>")/;
const commandNames = ['workflow-init', 'workflow-next', 'kaola-workflow-finalize'];
for (const forge of ['github', 'gitlab', 'gitea']) {
  for (const name of commandNames) {
    const source = forge === 'github'
      ? path.join(REPO, 'commands', name + '.md')
      : path.join(REPO, `plugins/kaola-workflow-${forge}`, 'commands', name + '.md');
    const skill = sync.renderSkill(fs.readFileSync(source, 'utf8'), name, forge);
    assert(!claudeTokens.test(skill), forge + '/' + name + ' skill contains no Claude path/token');
    assert(!/^\s*(model|subagent|agent|triggers):/mi.test(skill),
      forge + '/' + name + ' skill has no model/subagent/agent/triggers frontmatter');
    assert(!RETIRED_ROLE_RE.test(skill) && !RETIRED_BINDING_RE.test(skill),
      forge + '/' + name + ' skill names no retired role and pins no subagent model');
    assert(/^name: /m.test(skill) && /^description: /m.test(skill),
      forge + '/' + name + ' skill carries name+description frontmatter');
    if (name !== 'workflow-init') {
      assert(skill.includes('KW-RUNTIME-DISPATCH-START') && skill.includes('KW-RUNTIME-DISPATCH-END'),
        forge + '/' + name + ' skill keeps the dispatch contract inline');
      assert(skill.split(facts.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 0,
        forge + '/' + name + ' skill carries no always-loaded-carrier pointer');
      assert(skill.includes('Host: Hermes. If the running host is not Hermes'),
        forge + '/' + name + ' skill carries the Hermes adapter facts inline');
      assert(skill.includes('${HERMES_HOME:-$HOME/.hermes}'),
        forge + '/' + name + ' skill resolver probes HERMES_HOME');
      assert(skill.includes('_h/kaola-workflow/scripts'),
        'resolver uses the resolved _h variable for the support-script root');
    }
    if (name === 'workflow-next') {
      assert(skill.includes('node "$CLAIM_JS" startup --runtime hermes --target-issues'),
        forge + '/workflow-next emits startup --runtime hermes');
    }
    if (name === 'kaola-workflow-finalize') {
      assert(skill.includes('node "$CLAIM_JS" finalize --project {project}'),
        forge + '/kaola-workflow-finalize emits finalize --project');
    }
  }
}

// Byte parity / idempotence of the three forge renders against a fresh tree.
{
  const tmp = fs.mkdtempSync(path.join(tmpBase(), 'kw-hermes-parity-'));
  try {
    for (const forge of ['github', 'gitlab', 'gitea']) {
      // spawn-class: environment
      let r = spawnSync(process.execPath,
        [path.join(REPO, 'scripts/sync-hermes-edition.js'), '--tree-root=' + tmp, '--forge=' + forge, '--write'],
        { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
      // spawn-class: environment
      r = spawnSync(process.execPath,
        [path.join(REPO, 'scripts/sync-hermes-edition.js'), '--tree-root=' + tmp, '--forge=' + forge, '--write'],
        { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
      // spawn-class: cli-contract
      r = spawnSync(process.execPath,
        [path.join(REPO, 'scripts/sync-hermes-edition.js'), '--tree-root=' + tmp, '--forge=' + forge, '--check'],
        { encoding: 'utf8' });
      assert.strictEqual(r.status, 0, r.stderr);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function write(file, bytes, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { mode });
  fs.chmodSync(file, mode);
}
function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function freshFixture() {
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-hermes-test-home-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  write(path.join(bin, 'hermes'), '#!/bin/sh\nexit 0\n', 0o755);
  const hermesHome = path.join(home, '.hermes');
  fs.mkdirSync(hermesHome, { recursive: true });
  write(path.join(hermesHome, 'SOUL.md'), '# Owner identity\n\nKeep this byte.\n');
  return { home, bin, hermesHome };
}

const fixture = freshFixture();
try {
  const env = {
    ...process.env,
    HOME: fixture.home,
    HERMES_HOME: fixture.hermesHome,
    PATH: fixture.bin + path.delimiter + process.env.PATH,
  };
  const carrier = path.join(fixture.hermesHome, 'SOUL.md');
  const ownerBytes = fs.readFileSync(carrier);

  // spawn-class: cli-contract
  const preCheck = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.notStrictEqual(preCheck.status, 0, 'pre-install --check fails');
  assert(/global contract/.test(preCheck.stderr) && /hermes-local/.test(preCheck.stderr)
    && /SOUL\.md/.test(preCheck.stderr),
    'pre-install --check names the global contract, hermes-local target, and SOUL.md: ' + preCheck.stderr);

  // spawn-class: environment
  const installed = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(installed.status, 0, installed.stderr || installed.stdout);

  for (const name of commandNames) {
    assert(fs.existsSync(path.join(fixture.hermesHome, 'skills', name, 'SKILL.md')),
      'global skill installed: ' + name);
  }
  for (const script of manifest.supportScripts('github')) {
    assert(fs.existsSync(path.join(fixture.hermesHome, 'kaola-workflow', 'scripts', script)),
      'support script installed: ' + script);
  }
  assert(fs.existsSync(path.join(fixture.hermesHome, 'kaola-workflow', 'scripts', 'kaola-workflow-forge-resolve.js')),
    'P1 resolver guard script is installed with the support set');
  assert(!fs.existsSync(path.join(fixture.hermesHome, 'HERMES.md')),
    'installer never creates HERMES.md (it would shadow AGENTS.md)');
  assert(!fs.existsSync(path.join(fixture.hermesHome, 'plugins')),
    'installer creates no Hermes plugin tree');
  assert(!fs.existsSync(path.join(fixture.hermesHome, 'hooks')),
    'installer creates no hooks tree');
  assert(!fs.existsSync(path.join(fixture.hermesHome, 'config.yaml')),
    'installer never writes the owner config.yaml');
  assert(fs.readFileSync(carrier).subarray(0, ownerBytes.length).equals(ownerBytes),
    'owner SOUL.md bytes survive managed insertion');
  const soulText = fs.readFileSync(carrier, 'utf8');
  assert(soulText.includes('KW-GLOBAL-CONTRACT-MANAGED-START')
    && soulText.includes('KW-GLOBAL-CONTRACT-MANAGED-END'),
    'SOUL.md receives this runtime\'s managed contract region');

  // An unrelated user-owned skill is retained by check, reinstall, and uninstall.
  const unrelated = path.join(fixture.hermesHome, 'skills', 'user-own-skill');
  fs.mkdirSync(unrelated, { recursive: true });
  fs.writeFileSync(path.join(unrelated, 'SKILL.md'), '---\nname: user-own-skill\ndescription: user content\n---\n');

  // spawn-class: cli-contract
  const checked = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(checked.status, 0, checked.stderr || checked.stdout);
  assert(fs.existsSync(path.join(unrelated, 'SKILL.md')), 'unrelated user skill retained by check');

  // A drifted KW skill fails the check; restore it afterwards.
  const driftedSkill = path.join(fixture.hermesHome, 'skills', 'workflow-next', 'SKILL.md');
  const goodSkill = fs.readFileSync(driftedSkill);
  fs.appendFileSync(driftedSkill, '\nowner drift\n');
  // spawn-class: cli-contract
  const driftCheck = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--check'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.notStrictEqual(driftCheck.status, 0, 'check fails on a drifted KW skill');
  assert(/workflow-next/.test(driftCheck.stderr), 'check names the drifted skill');
  fs.writeFileSync(driftedSkill, goodSkill);

  // An owner-edited managed region is refused and left byte-identical.
  const installedCarrier = fs.readFileSync(carrier);
  const edited = installedCarrier.toString('utf8').replace(
    /(<!-- KW-GLOBAL-CONTRACT-MANAGED-START -->\n)/,
    '$1owner edit\n');
  fs.writeFileSync(carrier, edited);
  // spawn-class: environment
  const conflict = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.notStrictEqual(conflict.status, 0, 'reinstall refuses an owner-edited managed region');
  assert(/OWNER_CONFLICT|owner-edited|differs/i.test(conflict.stderr + conflict.stdout),
    'owner conflict is reported: ' + conflict.stderr + conflict.stdout);
  assert.strictEqual(fs.readFileSync(carrier, 'utf8'), edited,
    'owner-edited carrier is left byte-identical');
  fs.writeFileSync(carrier, installedCarrier);

  // Reinstall over a clean install is idempotent and stays green.
  // spawn-class: environment
  const reinstall = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--forge=github'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(reinstall.status, 0, reinstall.stderr || reinstall.stdout);
  assert(fs.existsSync(path.join(unrelated, 'SKILL.md')), 'unrelated user skill retained by reinstall');

  // Guard fixture (#1123 P3): a Hermes github edition refuses a gitea-origin repo before gh runs.
  {
    const guardRepo = fs.mkdtempSync(path.join(tmpBase(), 'kw-hermes-guard-repo-'));
    try {
      // spawn-class: environment
      const git = (args) => spawnSync('git', args, { cwd: guardRepo, encoding: 'utf8' });
      assert.strictEqual(git(['init', '-q', '.']).status, 0);
      git(['config', 'user.email', 'hermes-p1@example.invalid']);
      git(['config', 'user.name', 'Hermes P1']);
      git(['commit', '-q', '--allow-empty', '-m', 'base']);
      git(['remote', 'add', 'origin', 'https://gitea.com/example/a.git']);
      const ghMarker = path.join(guardRepo, 'gh.calls');
      const ghMock = path.join(guardRepo, 'gh-mock.js');
      fs.writeFileSync(ghMock, [
        "const fs = require('fs');",
        'fs.appendFileSync(' + JSON.stringify(ghMarker) + ", 'called\\n');",
        "process.stdout.write('{}\n');",
      ].join('\n'));
      // spawn-class: cli-contract
      const guarded = spawnSync(process.execPath, [
        path.join(fixture.hermesHome, 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js'),
        'startup', '--target-issue', '1', '--json',
      ], {
        cwd: guardRepo, encoding: 'utf8', timeout: 60000,
        env: { HOME: fixture.home, HERMES_HOME: fixture.hermesHome,
          PATH: fixture.bin + path.delimiter + process.env.PATH,
          KAOLA_GH_MOCK_SCRIPT: ghMock },
      });
      assert.strictEqual(guarded.status, 1,
        'Hermes github edition refuses a gitea-origin repo: ' + guarded.stdout + guarded.stderr);
      const body = JSON.parse(String(guarded.stdout).trim().split('\n').pop());
      assert.strictEqual(body.reason, 'forge_mismatch',
        'Hermes guard refusal is forge_mismatch');
      assert(!fs.existsSync(ghMarker), 'gh was not called before the Hermes guard refusal');
    } finally {
      fs.rmSync(guardRepo, { recursive: true, force: true });
    }
  }

  // spawn-class: environment
  const uninstall = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global', '--uninstall'],
    { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  for (const name of commandNames) {
    assert(!fs.existsSync(path.join(fixture.hermesHome, 'skills', name)),
      'uninstall removes the Kaola skill dir: ' + name);
  }
  assert(!fs.existsSync(path.join(fixture.hermesHome, 'kaola-workflow', 'scripts', 'kaola-workflow-claim.js')),
    'uninstall removes the support scripts');
  const residue = fs.readFileSync(carrier);
  assert(residue.equals(ownerBytes),
    'uninstall restores the SOUL.md owner bytes exactly');
  assert(!residue.toString('utf8').includes('KW-GLOBAL-CONTRACT-MANAGED-START')
    && !residue.toString('utf8').includes('KW-GLOBAL-CONTRACT-MANAGED-END'),
    'global uninstall strips this runtime\'s own managed region');
  assert(fs.existsSync(path.join(unrelated, 'SKILL.md')),
    'uninstall preserves unrelated user skills');
} finally {
  fs.rmSync(fixture.home, { recursive: true, force: true });
}

// A symlinked SOUL.md is refused before the first write.
{
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-hermes-symlink-'));
  try {
    const hermesHome = path.join(home, '.hermes');
    fs.mkdirSync(hermesHome, { recursive: true });
    const target = path.join(home, 'foreign-identity.md');
    write(target, 'foreign\n');
    fs.symlinkSync(target, path.join(hermesHome, 'SOUL.md'));
    const env = { ...process.env, HOME: home, HERMES_HOME: hermesHome,
      PATH: path.join(home, 'bin') + path.delimiter + process.env.PATH };
    fs.mkdirSync(path.join(home, 'bin'));
    write(path.join(home, 'bin', 'hermes'), '#!/bin/sh\nexit 0\n', 0o755);
    // spawn-class: environment
    const r = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global'],
      { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
    assert.notStrictEqual(r.status, 0, 'symlinked SOUL.md fails the install');
    assert(/symlink|PREFLIGHT_BLOCKED/i.test(r.stderr + r.stdout),
      'symlink refusal is explicit: ' + r.stderr + r.stdout);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'foreign\n',
      'symlink target is untouched');
    assert(!fs.existsSync(path.join(hermesHome, 'skills')),
      'symlink failure occurs before any skills write');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// A non-default sticky profile with HERMES_HOME unset is refused, not guessed.
{
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-hermes-profile-'));
  try {
    write(path.join(home, '.hermes', 'active_profile'), 'work\n');
    const env = { ...process.env, HOME: home };
    delete env.HERMES_HOME;
    // spawn-class: environment
    const r = spawnSync('bash', [path.join(REPO, 'install-hermes.sh'), '--global'],
      { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
    assert.notStrictEqual(r.status, 0, 'sticky non-default profile fails the install');
    assert(/active profile|HERMES_HOME/i.test(r.stderr + r.stdout),
      'profile refusal is explicit: ' + r.stderr + r.stdout);
    assert(!fs.existsSync(path.join(home, '.hermes', 'skills')),
      'profile refusal occurs before any skills write');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// Project scope is not implemented in P1 (D4).
{
  const home = fs.mkdtempSync(path.join(tmpBase(), 'kw-hermes-project-'));
  try {
    const env = { ...process.env, HOME: home, HERMES_HOME: path.join(home, '.hermes') };
    const project = path.join(home, 'project');
    fs.mkdirSync(project);
    // spawn-class: environment
    const r = spawnSync('bash',
      [path.join(REPO, 'install-hermes.sh'), '--project=' + project],
      { cwd: REPO, env, encoding: 'utf8', timeout: 120000 });
    assert.notStrictEqual(r.status, 0, 'project scope is refused');
    assert(/project scope is not supported/.test(r.stderr + r.stdout),
      'project refusal names D4: ' + r.stderr + r.stdout);
    assert(!fs.existsSync(path.join(project, '.hermes', 'skills')),
      'project refusal writes no project skill tree');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

const registry = JSON.parse(fs.readFileSync(
  path.join(REPO, 'templates/global/runtime-contract-adapters.json'), 'utf8'));
const target = registry.targets.find(row => row.runtime === 'hermes');
assert(target && target.id === 'hermes-local', 'global registry declares hermes-local');
assert.deepStrictEqual(target.discovery, { kind: 'command', commands: ['hermes'] },
  'global registry discovers Hermes via the hermes command');
assert(target.carrier.kind === 'managed_region'
  && target.carrier.root_env === 'HERMES_HOME'
  && target.carrier.default_root === '.hermes'
  && target.carrier.relative_path === 'SOUL.md',
  'global registry targets ${HERMES_HOME:-~/.hermes}/SOUL.md as a managed region');
assert(target.carrier_group === 'hermes-global-soul', 'Hermes carrier group is its own');
assert(/HERMES\.md/.test(target.precedence) && /shadows AGENTS\.md/.test(target.precedence),
  'registry records the measured HERMES.md shadowing rule');
assert(/54→12/.test(target.reload) && /skill body/i.test(target.reload),
  'registry reload records the measured M5 result');

const installAll = fs.readFileSync(path.join(REPO, 'install-all.sh'), 'utf8');
assert(installAll.includes('install-hermes.sh') && /RUNTIMES=\([^)]*hermes/.test(installAll),
  'install-all.sh includes the hermes runtime and installer');
assert(/--skip=[^\n]*hermes/.test(installAll), 'install-all.sh --skip names hermes');
assert(/carrier_state\(\)/.test(installAll), 'install-all.sh keeps per-runtime carrier checks');
const gitignore = fs.readFileSync(path.join(REPO, '.gitignore'), 'utf8');
assert(gitignore.split(/\r?\n/).includes('.kw-hermes/')
  && gitignore.split(/\r?\n/).includes('.kw-hermes-*/'),
  '.gitignore ignores .kw-hermes/ and per-forge .kw-hermes-*/ trees');

for (const [file, needle] of [
  ['scripts/kaola-workflow-claim.js', 'antigravity|hermes'],
  ['plugins/kaola-workflow/scripts/kaola-workflow-claim.js', 'antigravity|hermes'],
  ['plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js', 'antigravity|hermes'],
  ['plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js', 'antigravity|hermes'],
]) {
  const source = fs.readFileSync(path.join(REPO, file), 'utf8');
  assert(source.includes('--runtime claude|codex|opencode|kimi|grok|zcode|devin|droid|dsh|' + needle),
    file + ' USAGE includes antigravity and hermes');
}

const docs = fs.readFileSync(path.join(REPO, 'docs/hermes-edition.md'), 'utf8');
assert(docs.includes('#1123 P3'), 'hermes: docs record the #1123 P3 forge posture');
assert(/single-forge/i.test(docs), 'hermes: docs record the single-forge decision');
assert(/P1 resolver guard/i.test(docs), 'hermes: docs name the P1 guard');
assert(/HERMES\.md/.test(docs) && /shadows/.test(docs),
  'hermes: docs warn that HERMES.md shadows AGENTS.md');
assert(/\.agents\/skills/.test(docs), 'hermes: docs record the .agents/skills collision risk');

console.log('hermes-edition test passed');
