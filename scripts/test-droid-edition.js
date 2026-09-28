#!/usr/bin/env node
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const sync = require('./sync-droid-edition.js');
const facts = require('./runtime-adapter-facts.js');
const manifest = require('./kaola-workflow-install-manifest.js');

const adapters = facts.loadRuntimeAdapters(REPO);
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
// #1101: Kaola-Workflow defines no subagent roles on any runtime. The Droid adapter records only
// what the host itself provides; no retired role, profile, or model-binding capability survives.
// Host facts (not role facts), restored in #1101's review round (N6).
assert.strictEqual(droidAdapter.capabilities.instruction_loading, 'direct',
  'Droid discovers instructions root-to-cwd plus personal dirs');
assert.strictEqual(droidAdapter.capabilities.hook_scope, 'user_and_project',
  'Droid measures a user+project hook surface');
for (const key of facts.RETIRED_CAPABILITIES) {
  assert(!Object.prototype.hasOwnProperty.call(droidAdapter.capabilities, key),
    'Droid adapter carries no retired role capability ' + key);
}
assert.deepStrictEqual(Object.keys(droidAdapter.capabilities.delegation_guidance || {}).sort(),
  ['availability', 'native_routes'],
  'Droid delegation guidance is exactly native_routes + availability (no default binding)');
// The rendered adapter section carries the host guard, the native routes, and their availability
// facts verbatim, and names no retired role, role roster, default binding, or pinned model.
const RETIRED_ROLE_RE = /\b(?:code-explorer|code-reviewer|doc-updater|implementer|investigator|knowledge-lookup|tdd-guide)\b/;
const RETIRED_BINDING_RE = /\*\*Roles:\*\*|\*\*Subagent default:\*\*|<role>|^\s*(?:model|effort)\s*[:=]|model_reasoning_effort/m;
{
  const section = facts.renderRuntimeDelegationGuidanceForRuntime('droid');
  const guidance = droidAdapter.capabilities.delegation_guidance;
  assert(section.startsWith(facts.DELEGATION_GUIDANCE_START) && section.endsWith(facts.DELEGATION_GUIDANCE_END)
    && section.includes('## Runtime adapter facts')
    && section.includes('Host: Droid. If the running host is not Droid')
    && section.includes(guidance.native_routes) && section.includes(guidance.availability),
    'Droid adapter section renders the host guard, native_routes, and availability');
  assert(!RETIRED_ROLE_RE.test(section) && !RETIRED_BINDING_RE.test(section),
    'Droid adapter section names no retired role and pins no model: ' + section);
}
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
    assert(!RETIRED_ROLE_RE.test(skill) && !RETIRED_BINDING_RE.test(skill),
      forge + '/' + name + ' skill names no retired role and pins no subagent model');
    // #1078: Droid is an always-loaded carrier — generated Next/Finalize
    // skills carry the pointer once, no marked dispatch region, no adapter
    // facts (workflow-init carries no dispatch region at all).
    if (name !== 'workflow-init') {
      assert(!/KW-RUNTIME-DISPATCH-(?:START|END)/.test(skill)
        && !/KW-RUNTIME-DELEGATION-(?:START|END)/.test(skill)
        && !/Runtime dispatch contract \(always loaded\)/i.test(skill),
        forge + '/' + name + ' skill carries no dispatch block (the always-loaded carrier owns it)');
      assert(skill.split(facts.ALWAYS_LOADED_DISPATCH_POINTER).length - 1 === 1,
        forge + '/' + name + ' skill carries the always-loaded-carrier pointer exactly once');
    }
    assert(skill.includes('triggers:\n  - user\n  - model'),
      forge + '/' + name + ' skill triggers are user+model');
    // #1112: the shared ~/.agents/skills root is read by other runtimes, so every rendered
    // global skill is runtime-neutral — no Droid-home path, no --runtime flag, no
    // Droid-only dispatch routes or dirs.
    for (const forbidden of ['.factory', 'DROID_HOME', '--runtime droid', 'droids/',
        '`Task`', '`worker`', '`explorer`']) {
      assert(!skill.includes(forbidden),
        forge + '/' + name + ' skill is runtime-neutral — no ' + JSON.stringify(forbidden));
    }
    // The resolver probes the runtime-neutral global support dir before the self-dev repo
    // dir; only the script-invoking skills (next/finalize) carry a kaola_script resolver.
    if (name !== 'workflow-init') {
      assert(skill.includes('$HOME/.agents/kaola-workflow/scripts'),
        forge + '/' + name + ' skill resolver probes $HOME/.agents/kaola-workflow/scripts');
    }
    const baseDescription = fs.readFileSync(source, 'utf8').match(/^description:\s*(.+)$/m)[1]
      .replace(/^"|"$/g, '').replace(/\.$/, '');
    const rendered = JSON.parse(skill.match(/^description:\s*(.+)$/m)[1]);
    assert(rendered.startsWith(baseDescription + '. Invoke when the user asks for /' + name),
      forge + '/' + name + ' skill description keeps the command sentence verbatim, then says when to invoke: ' + rendered);
    if (name === 'workflow-next') {
      assert(skill.includes('node "$CLAIM_JS" startup --target-issues'),
        forge + '/workflow-next emits startup with no --runtime flag');
    }
    if (name === 'kaola-workflow-finalize') {
      assert(skill.includes('node "$CLAIM_JS" finalize --project {project}'),
        forge + '/kaola-workflow-finalize emits finalize --project');
    }
  }
}

// Host guard is present in every generated runtime adapter block.
function hostGuardFor(runtime) {
  const host = facts.runtimeHostName(runtime);
  return 'Host: ' + host + '. If the running host is not ' + host;
}
for (const runtime of facts.RUNTIMES) {
  const text = facts.renderRuntimeDelegationGuidanceForRuntime(runtime);
  assert(text.includes(hostGuardFor(runtime)), 'host guard present for ' + runtime);
}

function tmpBase() {
  const dir = os.tmpdir();
  return path.isAbsolute(dir) ? dir : '/tmp';
}

// The render an install stages: the same tree sync-droid-edition.js --write emits.
const stagedRoot = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-stage-'));
{
  // spawn-class: environment
  const r = spawnSync(process.execPath,
    [path.join(REPO, 'scripts/sync-droid-edition.js'), '--forge=github', '--tree-root=' + stagedRoot, '--write'],
    { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'staged render: ' + r.stderr);
}
const STAGED_SKILLS = path.join(stagedRoot, '.factory', 'skills');
const stagedBytes = name => fs.readFileSync(path.join(STAGED_SKILLS, name, 'SKILL.md'));

// Functional resolver: from a NON-repo cwd the rendered kaola_script resolves the
// runtime-neutral $HOME/.agents/kaola-workflow/scripts dir.
{
  const resolverHome = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-resolver-'));
  const cwd = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-cwd-'));
  try {
    const stubDir = path.join(resolverHome, '.agents', 'kaola-workflow', 'scripts');
    fs.mkdirSync(stubDir, { recursive: true });
    fs.writeFileSync(path.join(stubDir, 'probe.js'), '// stub\n');
    const line = stagedBytes('workflow-next').toString('utf8').split('\n')
      .find(l => l.startsWith('kaola_script(){'));
    assert(line, 'staged workflow-next carries a kaola_script resolver line');
    // spawn-class: environment
    const r = spawnSync('bash', ['-c', line + '\nkaola_script probe.js'],
      { cwd, env: { ...process.env, HOME: resolverHome }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'resolver exits 0: ' + r.stderr);
    assert.strictEqual(r.stdout.trim(), path.join(stubDir, 'probe.js'),
      'resolver prints the $HOME/.agents/kaola-workflow/scripts path');
  } finally {
    fs.rmSync(resolverHome, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
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

function envFor(fixture) {
  return {
    ...process.env,
    HOME: fixture.home,
    DROID_HOME: path.join(fixture.home, '.factory'),
    PATH: fixture.bin + path.delimiter + process.env.PATH,
  };
}

// The installer is a shell script; hosting it in-process would test the suite's own
// HOME instead of the fixture's.
function runInstaller(env, args) {
  // spawn-class: environment
  const r = spawnSync('bash', [path.join(REPO, 'install-droid.sh')].concat(args),
    { cwd: REPO, env, encoding: 'utf8', timeout: 60000 });
  r.out = (r.stdout || '') + (r.stderr || '');
  return r;
}
const INSTALL_ARGS = ['--global', '--forge=github'];
const CHECK_ARGS = ['--global', '--forge=github', '--check'];

function seedSkill(root, name, bytes) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), bytes);
}

// T7 baseline: lstat the REAL home's skill roots (read-only) before any fixture runs so
// the suite can prove no invocation escaped its synthetic HOME/DROID_HOME.
function snapshotRealSkillRoots() {
  const realHome = os.userInfo().homedir;
  const snap = new Map();
  for (const rel of ['.agents/skills', '.factory/skills']) {
    const dir = path.join(realHome, rel);
    let st;
    try { st = fs.lstatSync(dir); } catch (_) { snap.set(rel, 'absent'); continue; }
    snap.set(rel, (st.isSymbolicLink() ? 'symlink:' + fs.readlinkSync(dir) : 'dir:' + st.mtimeMs));
    for (const child of fs.readdirSync(dir)) {
      const c = path.join(dir, child);
      const cs = fs.lstatSync(c);
      snap.set(rel + '/' + child,
        (cs.isSymbolicLink() ? 'symlink:' + fs.readlinkSync(c) : (cs.isDirectory() ? 'dir' : 'file') + ':' + cs.mtimeMs));
    }
  }
  return snap;
}
const realRootsBefore = snapshotRealSkillRoots();

// T1 — fresh global install into the shared ~/.agents/skills root.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    // A check against a home with nothing installed must name the missing Droid carrier instead of
    // aborting silently on the global-contract exit code.
    const preCheck = runInstaller(env, CHECK_ARGS);
    assert.notStrictEqual(preCheck.status, 0, 'pre-install --check fails');
    assert(/global contract/.test(preCheck.stderr) && /droid-local/.test(preCheck.stderr)
      && /\.factory\/AGENTS\.md/.test(preCheck.stderr),
      'pre-install --check names the global contract, the droid-local target, and its carrier path: ' + preCheck.stderr);

    const installResult = runInstaller(env, INSTALL_ARGS);
    assert.strictEqual(installResult.status, 0, installResult.stderr || installResult.stdout);

    const homeRoot = path.join(fixture.home, '.factory');
    const agentsSkills = path.join(fixture.home, '.agents', 'skills');
    assert(fs.existsSync(path.join(homeRoot, 'AGENTS.md')), 'global AGENTS.md carrier installed');
    assert(!fs.existsSync(path.join(homeRoot, 'agents')),
      'global install deploys NO agents dir — Droid is native_only');
    // No-hook protocol: the Droid home carries NO config.json, NO hooks.json, NO droids dir,
    // NO commands dir, NO settings.json after a global install.
    for (const forbidden of ['config.json', 'hooks.json', 'settings.json', 'droids', 'commands', 'mcp']) {
      assert(!fs.existsSync(path.join(homeRoot, forbidden)),
        'global install writes no harness surface ' + forbidden + ' in ~/.factory');
    }
    // #1112: global Skills live in ~/.agents/skills, byte-equal to the staged render,
    // and the former ~/.factory/skills root is never created.
    for (const name of commandNames) {
      const installed = path.join(agentsSkills, name, 'SKILL.md');
      assert(fs.existsSync(installed), 'global skill installed: ' + name);
      assert(fs.readFileSync(installed).equals(stagedBytes(name)),
        'global skill ' + name + ' is byte-equal to the staged render');
    }
    assert(!fs.existsSync(path.join(homeRoot, 'skills')),
      'global install never creates the former ~/.factory/skills root');
    const record = path.join(homeRoot, 'kaola-workflow', 'agents-skills.record');
    const rows = fs.readFileSync(record, 'utf8').split('\n').filter(Boolean);
    assert.deepStrictEqual(rows.map(l => l.split('\t')[0]).sort(), [...commandNames].sort(),
      'ownership record carries one row per installed skill');
    assert(rows.every(l => /^[^\t]+\t[0-9a-f]{64}$/.test(l)),
      'every record row is name<tab>sha256');
    // #1112: support scripts moved to the runtime-neutral shared root.
    for (const script of manifest.supportScripts('github')) {
      assert(fs.existsSync(path.join(fixture.home, '.agents', 'kaola-workflow', 'scripts', script)),
        'support script installed: ' + script);
    }
    assert(!fs.existsSync(path.join(homeRoot, 'kaola-workflow', 'scripts')),
      'install creates no legacy $DROID_HOME/kaola-workflow/scripts dir');

    const checkResult = runInstaller(env, CHECK_ARGS);
    assert.strictEqual(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T1b — install MOVES support scripts: manifest-named files under the former
// $DROID_HOME/kaola-workflow/scripts are retired, a non-manifest file there is preserved,
// and the new ~/.agents location is populated.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const legacyDir = path.join(fixture.home, '.factory', 'kaola-workflow', 'scripts');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyName = manifest.supportScripts('github')[0];
    fs.writeFileSync(path.join(legacyDir, legacyName), '// old copy\n');
    const nonManifest = Buffer.from('# keep me\n');
    fs.writeFileSync(path.join(legacyDir, 'not-ours.txt'), nonManifest);

    const r = runInstaller(env, INSTALL_ARGS);
    assert.strictEqual(r.status, 0, 'T1b install: ' + r.out);
    assert(!fs.existsSync(path.join(legacyDir, legacyName)),
      'T1b: manifest-named legacy support script retired');
    assert(fs.readFileSync(path.join(legacyDir, 'not-ours.txt')).equals(nonManifest),
      'T1b: non-manifest file preserved');
    assert(fs.lstatSync(legacyDir).isDirectory(),
      'T1b: non-empty legacy scripts dir left standing');
    for (const script of manifest.supportScripts('github')) {
      assert(fs.existsSync(path.join(fixture.home, '.agents', 'kaola-workflow', 'scripts', script)),
        'T1b: support script at new location: ' + script);
    }
    const c = runInstaller(env, CHECK_ARGS);
    assert.strictEqual(c.status, 0, 'T1b --check: ' + c.out);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T2a — migration: ownership-proven copies leave the former ~/.factory/skills root,
// a personal Skill is untouched, and the non-empty root itself is left standing.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const homeRoot = path.join(fixture.home, '.factory');
    const legacy = path.join(homeRoot, 'skills');
    for (const name of commandNames) seedSkill(legacy, name, stagedBytes(name));
    const personal = Buffer.from('# my own skill\n');
    seedSkill(legacy, 'my-skill', personal);

    // Before any install, --check flags each proven former-root copy as a conflict
    // naming the shared root it duplicates.
    const pre = runInstaller(env, CHECK_ARGS);
    assert.notStrictEqual(pre.status, 0, 'T2a: --check fails while proven duplicates remain');
    for (const name of commandNames) {
      const re = new RegExp('check: conflict ' + path.join(legacy, name).replace(/[/.]/g, '\\$&')
        + ' duplicates ' + path.join(fixture.home, '.agents', 'skills').replace(/[/.]/g, '\\$&')
        + '/' + name);
      assert(re.test(pre.out),
        'T2a: --check names ' + name + ' as a former-root conflict: ' + pre.out);
    }

    const r = runInstaller(env, INSTALL_ARGS);
    assert.strictEqual(r.status, 0, 'T2a install: ' + r.out);
    for (const name of commandNames) {
      assert(!fs.existsSync(path.join(legacy, name)),
        'T2a: proven legacy copy removed: ' + name);
    }
    assert(fs.readFileSync(path.join(legacy, 'my-skill', 'SKILL.md')).equals(personal),
      'T2a: personal Skill byte-identical');
    assert(fs.lstatSync(legacy).isDirectory(),
      'T2a: the non-empty legacy root is left standing');
    for (const name of commandNames) {
      assert(fs.existsSync(path.join(fixture.home, '.agents', 'skills', name, 'SKILL.md')),
        'T2a: migrated skill live in ~/.agents/skills: ' + name);
    }
    const c = runInstaller(env, CHECK_ARGS);
    assert.strictEqual(c.status, 0, 'T2a --check: ' + c.out);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T2b — an owner-edited legacy copy and a symlinked legacy dir are PRESERVED and reported:
// the install still lands the new root but exits non-zero so the duplicate is never silent.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const homeRoot = path.join(fixture.home, '.factory');
    const legacy = path.join(homeRoot, 'skills');
    const edited = Buffer.concat([stagedBytes('workflow-init'), Buffer.from('\n# my edit\n')]);
    seedSkill(legacy, 'workflow-init', edited);
    const outside = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-outside-'));
    fs.mkdirSync(path.join(legacy), { recursive: true });
    fs.symlinkSync(outside, path.join(legacy, 'kaola-workflow-finalize'));

    const r = runInstaller(env, INSTALL_ARGS);
    assert.notStrictEqual(r.status, 0, 'T2b: install exits non-zero while duplicates are preserved');
    assert(r.out.includes(path.join(legacy, 'workflow-init'))
        && r.out.includes(path.join(legacy, 'kaola-workflow-finalize')),
      'T2b: the report names both preserved paths: ' + r.out);
    assert(fs.readFileSync(path.join(legacy, 'workflow-init', 'SKILL.md')).equals(edited),
      'T2b: owner-edited legacy copy byte-identical');
    const lst = fs.lstatSync(path.join(legacy, 'kaola-workflow-finalize'));
    assert(lst.isSymbolicLink() && fs.readlinkSync(path.join(legacy, 'kaola-workflow-finalize')) === outside,
      'T2b: symlinked legacy dir still a symlink to its untouched target');
    const c = runInstaller(env, CHECK_ARGS);
    assert.notStrictEqual(c.status, 0, 'T2b: --check exits non-zero');
    assert(/check: conflict/.test(c.out)
        && c.out.includes(path.join(legacy, 'workflow-init'))
        && c.out.includes('not proven a Kaola-Workflow copy'),
      'T2b: --check names the preserved entries as conflicts: ' + c.out);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T2c — module level: retireLegacy honors an injected catalog and never removes a dir
// holding anything beyond the one proven SKILL.md.
{
  const skills = require('./kaola-workflow-droid-skills.js');
  const tmp = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-retire-'));
  try {
    const legacy = path.join(tmp, 'legacy');
    const src = path.join(tmp, 'src');
    fs.mkdirSync(src, { recursive: true });
    const bytes = Buffer.from('synthetic released bytes\n');
    const catalog = {
      'workflow-next': [skills.sha256(bytes)],
      'workflow-init': [skills.sha256(bytes)],
    };
    seedSkill(legacy, 'workflow-next', bytes);
    seedSkill(legacy, 'workflow-init', bytes);
    fs.writeFileSync(path.join(legacy, 'workflow-init', 'extra.txt'), 'x');
    const r = skills.retireLegacy({ dir: legacy, src, catalog, check: false });
    assert.deepStrictEqual(r.removed.map(d => d.file), [path.join(legacy, 'workflow-next')],
      'T2c: catalog-proven copy removed');
    assert.deepStrictEqual(r.preserved.map(p => p.file), [path.join(legacy, 'workflow-init')],
      'T2c: a two-file dir is preserved');
    assert(!fs.existsSync(path.join(legacy, 'workflow-next')),
      'T2c: removed dir gone');
    assert(fs.existsSync(path.join(legacy, 'workflow-init', 'extra.txt')),
      'T2c: preserved dir untouched');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Full recursive path→digest snapshot of a fixture HOME (dirs, symlinks, files) — the
// hard-refusal proof compares the whole tree, not a picked list of paths.
function snapshotHome(root) {
  const out = new Map();
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) out.set(r, 'symlink:' + fs.readlinkSync(p));
      else if (e.isDirectory()) { out.set(r, 'dir'); walk(p, r); }
      else out.set(r, 'file:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
    }
    return out;
  };
  return walk(root, '');
}

// T3 — a foreign same-name entry in the shared root refuses the WHOLE batch before ANY
// write: no support scripts, no skills, no former-root sweep, no carrier — the after
// snapshot of the entire HOME is byte-identical to the before.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const agentsSkills = path.join(fixture.home, '.agents', 'skills');
    const foreign = Buffer.from('# not ours\n');
    seedSkill(agentsSkills, 'workflow-next', foreign);
    const kpr = Buffer.from('# droid runner\n');
    seedSkill(agentsSkills, 'droid-kaola-project-runner', kpr);
    const receiptsDir = path.join(agentsSkills, '.kaola-install-receipts');
    fs.mkdirSync(receiptsDir, { recursive: true });
    const receipt = Buffer.from('{"skill":"droid-kaola-project-runner"}\n');
    fs.writeFileSync(path.join(receiptsDir, 'droid-kaola-project-runner.json'), receipt);
    const legacy = path.join(fixture.home, '.factory', 'skills');
    seedSkill(legacy, 'workflow-init', stagedBytes('workflow-init'));
    // A pre-existing support script the old layout installed must NOT be overwritten,
    // and a legacy manifest-named script must NOT be retired — nothing may run.
    const sentinelDir = path.join(fixture.home, '.agents', 'kaola-workflow', 'scripts');
    fs.mkdirSync(sentinelDir, { recursive: true });
    fs.writeFileSync(path.join(sentinelDir, 'kaola-workflow-claim.js'), 'SENTINEL-CLAIM\n');
    const legacyScripts = path.join(fixture.home, '.factory', 'kaola-workflow', 'scripts');
    fs.mkdirSync(legacyScripts, { recursive: true });
    fs.writeFileSync(path.join(legacyScripts, manifest.supportScripts('github')[0]), '// old\n');

    const before = snapshotHome(fixture.home);
    const r = runInstaller(env, INSTALL_ARGS);
    assert.notStrictEqual(r.status, 0, 'T3: foreign collision refuses the install');
    assert(r.out.includes('Refused: ' + path.join(agentsSkills, 'workflow-next')),
      'T3: the refused path is named: ' + r.out);
    assert.deepStrictEqual(snapshotHome(fixture.home), before,
      'T3: the whole HOME (incl. DROID_HOME) is untouched by a refused install');
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// preflight unit/CLI contract: clean dest exits 0 silently; foreign entry exits 1 with the
// Refused line — and mutates nothing either way.
{
  const skills = require('./kaola-workflow-droid-skills.js');
  const t = fs.mkdtempSync(path.join(tmpBase(), 'kw-droid-preflight-'));
  try {
    const dest = path.join(t, 'dest');
    const record = path.join(t, 'record.tsv');
    const cli = path.join(REPO, 'scripts', 'kaola-workflow-droid-skills.js');
    // spawn-class: cli-contract
    let r = spawnSync(process.execPath, [cli, 'preflight', '--src', STAGED_SKILLS,
      '--dest', dest, '--record', record], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'preflight: clean dest exits 0: ' + r.stderr);
    assert.strictEqual(r.stdout + r.stderr, '', 'preflight: clean exit is silent');
    assert.deepStrictEqual(skills.preflightSkills({ src: STAGED_SKILLS, dest, record }),
      { ok: true, conflicts: [] }, 'preflightSkills: clean dest is ok');
    seedSkill(dest, 'workflow-next', Buffer.from('# foreign\n'));
    // spawn-class: cli-contract
    r = spawnSync(process.execPath, [cli, 'preflight', '--src', STAGED_SKILLS,
      '--dest', dest, '--record', record], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1, 'preflight: foreign entry exits 1');
    assert(r.stderr.includes('Refused: ' + path.join(dest, 'workflow-next')),
      'preflight: names the conflict: ' + r.stderr);
    const pf = skills.preflightSkills({ src: STAGED_SKILLS, dest, record });
    assert.deepStrictEqual(pf, { ok: false, conflicts: [path.join(dest, 'workflow-next')] },
      'preflightSkills: returns the conflicting path');
    assert(!fs.existsSync(record), 'preflight writes no record');
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
}

// T4 — upgrade vs owner edit on the LIVE root: a recorded copy is refreshed, an
// unrecorded edit refuses and is preserved.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const homeRoot = path.join(fixture.home, '.factory');
    const agentsSkills = path.join(fixture.home, '.agents', 'skills');
    const record = path.join(homeRoot, 'kaola-workflow', 'agents-skills.record');
    assert.strictEqual(runInstaller(env, INSTALL_ARGS).status, 0, 'T4 clean install');

    // (a) recorded older release bytes: the record proves ownership, so a reinstall
    //     restores the current render.
    const older = Buffer.from('older release bytes\n');
    const file = path.join(agentsSkills, 'workflow-init', 'SKILL.md');
    fs.writeFileSync(file, older);
    const digest = crypto.createHash('sha256').update(older).digest('hex');
    const rows = fs.readFileSync(record, 'utf8').split('\n').filter(Boolean)
      .map(l => l.startsWith('workflow-init\t') ? 'workflow-init\t' + digest : l);
    fs.writeFileSync(record, rows.join('\n') + '\n');
    const ra = runInstaller(env, INSTALL_ARGS);
    assert.strictEqual(ra.status, 0, 'T4a reinstall: ' + ra.out);
    assert(fs.readFileSync(file).equals(stagedBytes('workflow-init')),
      'T4a: recorded copy restored to the render');

    // (b) unrecorded owner edit: refused, preserved.
    const editedFile = path.join(agentsSkills, 'workflow-next', 'SKILL.md');
    const edited = Buffer.concat([stagedBytes('workflow-next'), Buffer.from('\n# my edit\n')]);
    fs.writeFileSync(editedFile, edited);
    const rb = runInstaller(env, INSTALL_ARGS);
    assert.notStrictEqual(rb.status, 0, 'T4b: owner-edited install refuses');
    assert(rb.out.includes(path.join(agentsSkills, 'workflow-next')),
      'T4b: refused path named: ' + rb.out);
    assert(fs.readFileSync(editedFile).equals(edited), 'T4b: owner-edited bytes preserved');
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T5 — --check is honest about the shared root: missing, stale (drifted but provably a
// Kaola copy), and conflict (not provably ours) are reported distinctly and all exit 1.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const agentsSkills = path.join(fixture.home, '.agents', 'skills');
    const record = path.join(fixture.home, '.factory', 'kaola-workflow', 'agents-skills.record');
    assert.strictEqual(runInstaller(env, INSTALL_ARGS).status, 0, 'T5 clean install');
    fs.rmSync(path.join(agentsSkills, 'workflow-init'), { recursive: true });
    const c1 = runInstaller(env, CHECK_ARGS);
    assert.notStrictEqual(c1.status, 0, 'T5: removed skill fails --check');
    assert(/check: missing skill .*workflow-init/.test(c1.out),
      'T5: removed skill reads missing: ' + c1.out);
    assert.strictEqual(runInstaller(env, INSTALL_ARGS).status, 0, 'T5 restore install');

    // stale: bytes drifted, but the ownership record still proves the copy ours.
    const drifted = Buffer.concat([stagedBytes('workflow-next'), Buffer.from('\ndrift\n')]);
    fs.writeFileSync(path.join(agentsSkills, 'workflow-next', 'SKILL.md'), drifted);
    const d = crypto.createHash('sha256').update(drifted).digest('hex');
    const rows = fs.readFileSync(record, 'utf8').split('\n').filter(Boolean)
      .map(l => l.startsWith('workflow-next\t') ? 'workflow-next\t' + d : l);
    fs.writeFileSync(record, rows.join('\n') + '\n');
    const c2 = runInstaller(env, CHECK_ARGS);
    assert.notStrictEqual(c2.status, 0, 'T5: proven-drifted skill fails --check');
    assert(/check: stale skill .*workflow-next/.test(c2.out),
      'T5: proven drift reads stale: ' + c2.out);

    // conflict: foreign bytes nothing proves — install would refuse this entry.
    const foreign = Buffer.from('# not ours\n');
    fs.writeFileSync(path.join(agentsSkills, 'kaola-workflow-finalize', 'SKILL.md'), foreign);
    const c3 = runInstaller(env, CHECK_ARGS);
    assert.notStrictEqual(c3.status, 0, 'T5: foreign skill fails --check');
    assert(/check: conflict .*kaola-workflow-finalize.*not a Kaola-Workflow copy/.test(c3.out),
      'T5: foreign entry reads conflict: ' + c3.out);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T6 — uninstall removes only the proven Kaola skills and the record; a personal Skill
// and the shared root itself stay.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const homeRoot = path.join(fixture.home, '.factory');
    const agentsSkills = path.join(fixture.home, '.agents', 'skills');
    assert.strictEqual(runInstaller(env, INSTALL_ARGS).status, 0, 'T6 clean install');
    const personal = Buffer.from('# mine\n');
    seedSkill(agentsSkills, 'other', personal);
    const u = runInstaller(env, ['--global', '--forge=github', '--uninstall']);
    assert.strictEqual(u.status, 0, 'T6 uninstall: ' + u.out);
    for (const name of commandNames) {
      assert(!fs.existsSync(path.join(agentsSkills, name)), 'T6: skill removed: ' + name);
    }
    assert(!fs.existsSync(path.join(homeRoot, 'kaola-workflow', 'agents-skills.record')),
      'T6: ownership record removed');
    assert(fs.readFileSync(path.join(agentsSkills, 'other', 'SKILL.md')).equals(personal),
      'T6: personal Skill byte-identical');
    assert(fs.lstatSync(agentsSkills).isDirectory(), 'T6: shared root kept');
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
}

// T8 — a same-name NON-Kaola skill present in both roots is an advisory note only:
// install succeeds, both copies are byte-identical afterwards, and --check prints the
// note while still passing when everything else is current.
{
  const fixture = freshFixture();
  try {
    const env = envFor(fixture);
    const legacy = path.join(fixture.home, '.factory', 'skills');
    const agentsSkills = path.join(fixture.home, '.agents', 'skills');
    const mine = Buffer.from('# my own paired skill\n');
    seedSkill(legacy, 'my-skill', mine);
    seedSkill(agentsSkills, 'my-skill', mine);

    const r = runInstaller(env, INSTALL_ARGS);
    assert.strictEqual(r.status, 0, 'T8: non-Kaola same-name pair does not fail install: ' + r.out);
    assert(/note: same-name skill my-skill in both .* and .* — not a Kaola-Workflow skill, left untouched/.test(r.out),
      'T8: advisory note printed: ' + r.out);
    assert(fs.readFileSync(path.join(legacy, 'my-skill', 'SKILL.md')).equals(mine)
        && fs.readFileSync(path.join(agentsSkills, 'my-skill', 'SKILL.md')).equals(mine),
      'T8: both copies untouched');
    const c = runInstaller(env, CHECK_ARGS);
    assert.strictEqual(c.status, 0, 'T8: --check passes with the note advisory: ' + c.out);
    assert(/note: same-name skill my-skill/.test(c.out), 'T8: --check prints the note: ' + c.out);
  } finally {
    fs.rmSync(fixture.home, { recursive: true, force: true });
  }
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

// T7 — isolation: nothing this suite ran escaped its synthetic HOME/DROID_HOME. The real
// skill roots are compared by name and mtime against the baseline taken up front.
{
  const after = snapshotRealSkillRoots();
  assert.deepStrictEqual(after, realRootsBefore,
    'real ~/.agents/skills and ~/.factory/skills untouched by the suite: ' +
    JSON.stringify([...after.entries()].filter(([k, v]) => realRootsBefore.get(k) !== v)));
}
fs.rmSync(stagedRoot, { recursive: true, force: true });

console.log('droid-edition test passed');
