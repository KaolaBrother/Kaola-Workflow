#!/usr/bin/env node
'use strict';
// #1087 Lane A (#1086 F1/F2): per-runtime uninstall ownership and the shared reference registry.
//
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property under
// test is what an install / uninstall does to a synthetic HOME. Every child runs with HOME inside one
// mkdtemp sandbox (assertSandboxed refuses otherwise) and KAOLA_* scrubbed, so no real runtime home
// is read or written.
//
// Proves, against the real installers:
//   (ii)  uninstalling a runtime while another holds a config-block reference keeps
//         ~/.config/kaola-workflow/config.json byte-identical (pr_auto_merge preserved); uninstalling
//         Claude leaves Codex's hooks.json entries and hook home intact;
//   (iii) the last referencing runtime's uninstall removes the block, and the registry with it;
//   (iv)  each uninstaller writes nothing outside its own runtime home and its own registry entry;
//   set semantics: re-registering a runtime never adds a second reference.

const assert = require('assert');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const refs = require('./kaola-workflow-shared-refs.js');
const CODEX_INSTALLER = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js');

const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), 'kaola-1087-lane-a-')));
const REAL_HOME = fs.realpathSync(os.homedir());
assert(!REAL_HOME.startsWith(SANDBOX + path.sep) && REAL_HOME !== SANDBOX, 'sandbox must not contain the real home');

let passed = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
}

function assertSandboxed(home) {
  const real = fs.realpathSync(home);
  assert(real.startsWith(SANDBOX + path.sep), `refusing HOME=${real}: outside the sandbox ${SANDBOX}`);
}

let homeSeq = 0;
function makeHome(name) {
  homeSeq += 1;
  const home = path.join(SANDBOX, `${homeSeq}-${name}`);
  fs.mkdirSync(path.join(home, 'cwd'), { recursive: true });
  return home;
}

function childEnv(home) {
  const env = Object.assign({}, process.env);
  for (const key of Object.keys(env)) if (key.startsWith('KAOLA_')) delete env[key];
  for (const key of ['OPENCODE_CONFIG_DIR', 'KIMI_HOME', 'GROK_HOME', 'CURSOR_HOME', 'ZCODE_HOME', 'CODEX_HOME']) delete env[key];
  env.HOME = home;
  return env;
}

function run(cmd, args, home) {
  assertSandboxed(home);
  // spawn-class: environment
  const r = spawnSync(cmd, args, { cwd: path.join(home, 'cwd'), env: childEnv(home), encoding: 'utf8' });
  return r;
}

function runOk(cmd, args, home, label) {
  const r = run(cmd, args, home);
  assert.strictEqual(r.status, 0, `${label} must exit 0, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r;
}

// Whole-HOME snapshot: relative path -> kind + content hash (symlinks by target).
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const rel = path.relative(dir, p);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) out[rel] = 'link:' + fs.readlinkSync(p);
      else if (st.isDirectory()) { out[rel] = 'dir'; walk(p); }
      else out[rel] = 'file:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  })(dir);
  return out;
}

const REGISTRY_REL = path.join('.config', 'kaola-workflow', 'shared-refs.json');
const CONFIG_REL = path.join('.config', 'kaola-workflow', 'config.json');

// Every path that changed between two snapshots and is NOT under one of `ownRoots` (nor the
// registry file, which the uninstaller legitimately rewrites to drop its own reference).
function foreignChanges(before, after, ownRoots) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const owned = rel => rel === REGISTRY_REL
    || ownRoots.some(r => rel === r || rel.startsWith(r + path.sep));
  return [...keys].filter(k => before[k] !== after[k] && !owned(k)).sort();
}

function seedConfig(home) {
  const file = path.join(home, CONFIG_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ pr_auto_merge: true, custom: 'kept' }, null, 2) + '\n');
  return fs.readFileSync(file);
}

const exists = (home, rel) => fs.existsSync(path.join(home, rel));

try {
  // ---- 1. registry contract, in-process against fixture homes ---------------------------------
  {
    const home = makeHome('registry-unit');
    const config = seedConfig(home);
    let r = refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'opencode', { scope: 'global' }, { home });
    check(r.added === true && r.refs.join() === 'opencode', 'first registration adds one reference');
    r = refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'opencode', { scope: 'global' }, { home });
    check(r.added === false && r.refs.length === 1, 'set semantics: re-registering the same runtime does not double count');
    r = refs.installSharedConfigBlock('kimi', { scope: 'global' }, { home });
    check(r.configPresent === true && r.refs.join() === 'kimi,opencode', 'install helper registers and reports the existing block');
    check(fs.readFileSync(path.join(home, CONFIG_REL)).equals(config), 'install helper never rewrites an existing config.json');

    // Multi-scope: a project-scope deregistration keeps the runtime's global reference.
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'opencode', { scope: 'project:/p' }, { home });
    r = refs.deregisterSharedRef(refs.CONFIG_BLOCK_ID, 'opencode', { home, scope: 'project:/p' });
    check(r.released === false && r.remaining === 2, 'releasing one scope keeps the runtime reference while another scope remains');
    check(JSON.stringify(refs.listRefs(refs.CONFIG_BLOCK_ID, { home }).opencode.scopes) === '["global"]', 'listRefs shows the remaining scope');

    r = refs.deregisterSharedRef(refs.CONFIG_BLOCK_ID, 'opencode', { home, scope: 'global' });
    check(r.released && r.remaining === 1 && !r.cleaned, 'releasing while another runtime holds a reference keeps the block');
    check(fs.readFileSync(path.join(home, CONFIG_REL)).equals(config), '(ii) config.json byte-identical while a reference remains');

    // A second block keeps the registry alive after the config block is cleaned.
    let hookRan = 0;
    refs.onZeroRefs('other-block', () => { hookRan += 1; return true; });
    refs.registerSharedRef('other-block', 'droid', {}, { home });
    r = refs.deregisterSharedRef(refs.CONFIG_BLOCK_ID, 'kimi', { home, scope: 'global' });
    check(r.cleaned && r.remaining === 0 && !exists(home, CONFIG_REL), '(iii) last reference cleans the config block');
    check(exists(home, REGISTRY_REL) && !r.registryRemoved, 'registry outlives the config block while another block is referenced');
    r = refs.deregisterSharedRef('other-block', 'droid', { home });
    check(hookRan === 1 && r.registryRemoved && !exists(home, REGISTRY_REL), 'zero-reference hook runs; registry is cleaned last');
    check(!exists(home, '.config/kaola-workflow'), 'empty shared directory is removed after the registry');

    // Deregistering a runtime that never held a reference cleans nothing (legacy machines).
    const legacy = makeHome('registry-legacy');
    seedConfig(legacy);
    r = refs.deregisterSharedRef(refs.CONFIG_BLOCK_ID, 'claude-code', { home: legacy });
    check(!r.released && !r.cleaned && exists(legacy, CONFIG_REL), 'no registry record: deregistration never removes the block');

    // Operator override ignores references.
    const op = makeHome('registry-operator');
    seedConfig(op);
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', {}, { home: op });
    assert.throws(() => refs.operatorRemoveAll({ home: op }), /operatorOverride/);
    r = refs.operatorRemoveAll({ home: op, operatorOverride: true });
    check(r.registryRemoved && !exists(op, CONFIG_REL) && !exists(op, REGISTRY_REL), 'operator override cleans every block regardless of references');

    // Fail closed on a malformed registry or a symlinked store.
    const bad = makeHome('registry-bad');
    const badConfig = seedConfig(bad);
    fs.writeFileSync(path.join(bad, REGISTRY_REL), '{not json');
    assert.throws(() => refs.deregisterSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { home: bad }), /malformed/);
    check(fs.readFileSync(path.join(bad, CONFIG_REL)).equals(badConfig), 'malformed registry: block untouched');
    fs.unlinkSync(path.join(bad, REGISTRY_REL));
    fs.symlinkSync(path.join(bad, 'elsewhere.json'), path.join(bad, REGISTRY_REL));
    assert.throws(() => refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', {}, { home: bad }), /symlink/);
    check(!exists(bad, 'elsewhere.json'), 'symlinked registry is refused, never followed');
    assert.throws(() => refs.registerSharedRef(refs.CONFIG_BLOCK_ID, '../x', {}, { home: bad }), /invalid runtime id/);
    passed += 3;

    check(JSON.stringify(Object.keys(refs).sort()) === JSON.stringify([
      'CONFIG_BLOCK_ID', 'deregisterSharedRef', 'installSharedConfigBlock', 'listRefs',
      'onZeroRefs', 'operatorRemoveAll', 'registerSharedRef', 'registryPath',
    ]), 'registry export surface is exactly the documented contract');
  }

  // ---- 2. Claude: uninstall.sh leaves Codex and the shared block alone (F1) --------------------
  {
    const home = makeHome('claude');
    runOk('bash', [path.join(root, 'install.sh'), '--yes', '--forge=github', '--no-settings-merge'], home, 'install.sh');
    runOk('node', [CODEX_INSTALLER, '--global'], home, 'codex install');
    const config = seedConfig(home);
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'claude-code', {}, { home });
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { scope: 'global' }, { home });
    const codexHooks = fs.readFileSync(path.join(home, '.codex', 'hooks.json'));
    check(codexHooks.includes('kaola-workflow:'), 'fixture: codex install wrote managed hook entries');
    const before = snapshot(home);

    runOk('bash', [path.join(root, 'uninstall.sh'), '--forge=all'], home, 'uninstall.sh');
    const after = snapshot(home);
    check(!exists(home, '.claude/kaola-workflow'), 'uninstall.sh removed the Claude edition');
    check(fs.readFileSync(path.join(home, '.codex', 'hooks.json')).equals(codexHooks), '(ii) codex hooks.json byte-identical after Claude uninstall');
    check(exists(home, '.codex/kaola-workflow/hooks'), '(ii) codex hook home intact after Claude uninstall');
    check(fs.readFileSync(path.join(home, CONFIG_REL)).equals(config), '(ii) config.json byte-identical (pr_auto_merge kept) while codex holds a reference');
    check(Object.keys(refs.listRefs(refs.CONFIG_BLOCK_ID, { home })).join() === 'codex', 'uninstall.sh released only the claude-code reference');
    const foreign = foreignChanges(before, after, ['.claude']);
    check(foreign.length === 0, `(iv) uninstall.sh wrote outside ~/.claude: ${foreign.join(', ')}`);

    // Partial: with another Claude edition still installed, no reference is released.
    const partial = makeHome('claude-partial');
    runOk('bash', [path.join(root, 'install.sh'), '--yes', '--forge=github', '--no-settings-merge'], partial, 'install.sh github');
    runOk('bash', [path.join(root, 'install.sh'), '--yes', '--forge=gitlab', '--no-settings-merge'], partial, 'install.sh gitlab');
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'claude-code', {}, { home: partial });
    runOk('bash', [path.join(root, 'uninstall.sh'), '--forge=gitlab'], partial, 'uninstall.sh gitlab');
    check(Object.keys(refs.listRefs(refs.CONFIG_BLOCK_ID, { home: partial })).join() === 'claude-code',
      'a partial forge uninstall keeps the claude-code reference while an edition remains');

    // Legacy machine (no registry): the shared config survives a Claude uninstall.
    const legacy = makeHome('claude-legacy');
    runOk('bash', [path.join(root, 'install.sh'), '--yes', '--forge=github', '--no-settings-merge'], legacy, 'install.sh');
    const legacyConfig = seedConfig(legacy);
    runOk('bash', [path.join(root, 'uninstall.sh')], legacy, 'uninstall.sh');
    check(fs.readFileSync(path.join(legacy, CONFIG_REL)).equals(legacyConfig), 'no registry: uninstall.sh keeps config.json');
  }

  // ---- 3. Codex owns its removal: install-codex-agent-profiles.js --uninstall ------------------
  {
    const home = makeHome('codex');
    runOk('bash', [path.join(root, 'install.sh'), '--yes', '--forge=github', '--no-settings-merge'], home, 'install.sh');
    runOk('node', [CODEX_INSTALLER, '--global'], home, 'codex install');
    const hooksFile = path.join(home, '.codex', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    hooks.description = 'user description';
    hooks.hooks.Stop = [{ id: 'user:mine', hooks: [{ type: 'command', command: 'echo user' }] }];
    fs.writeFileSync(hooksFile, JSON.stringify(hooks, null, 2) + '\n');
    const configToml = path.join(home, '.codex', 'config.toml');
    fs.writeFileSync(configToml, 'model = "user-model"\n' + fs.readFileSync(configToml, 'utf8'));
    const agentsDir = path.join(home, '.codex', 'agents', 'kaola-workflow');
    const profiles = fs.readdirSync(agentsDir).filter(n => n.endsWith('.toml')).sort();
    fs.appendFileSync(path.join(agentsDir, profiles[0]), '# user edit\n');
    const config = seedConfig(home);
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'claude-code', {}, { home });
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { scope: 'global' }, { home });
    const claudeBefore = snapshot(path.join(home, '.claude'));
    const before = snapshot(home);

    const r = runOk('node', [CODEX_INSTALLER, '--global', '--uninstall'], home, 'codex --uninstall');
    const after = snapshot(home);
    const left = JSON.parse(fs.readFileSync(hooksFile, 'utf8'));
    check(!JSON.stringify(left).includes('kaola-workflow:'), 'codex --uninstall removed its managed hook entries');
    check(left.description === 'user description' && left.hooks.Stop.length === 1 && left.hooks.Stop[0].id === 'user:mine',
      'codex --uninstall preserved the user hook entry and description');
    check(!exists(home, '.codex/kaola-workflow'), 'codex --uninstall removed its hook home');
    const toml = fs.readFileSync(configToml, 'utf8');
    check(!toml.includes('# BEGIN kaola-workflow agents') && toml.includes('model = "user-model"'), 'codex --uninstall stripped only the managed config block');
    check(fs.readdirSync(agentsDir).join() === profiles[0], 'codex --uninstall removed unmodified profiles and preserved the modified one');
    check(/preserved modified profile/.test(r.stdout), 'codex --uninstall reports the preserved profile');
    check(fs.readFileSync(path.join(home, CONFIG_REL)).equals(config), '(ii) config.json byte-identical while claude-code holds a reference');
    check(JSON.stringify(snapshot(path.join(home, '.claude'))) === JSON.stringify(claudeBefore), '(ii) Claude surfaces untouched by codex --uninstall');
    const foreign = foreignChanges(before, after, ['.codex']);
    check(foreign.length === 0, `(iv) codex --uninstall wrote outside ~/.codex: ${foreign.join(', ')}`);

    // (iii) last referencing runtime: Claude's uninstall now cleans the block and the registry.
    runOk('bash', [path.join(root, 'uninstall.sh'), '--forge=all'], home, 'uninstall.sh');
    check(!exists(home, CONFIG_REL) && !exists(home, REGISTRY_REL), '(iii) last reference cleaned config.json and the registry');

    // Project scope: profiles/config go, the global hooks (shared across Codex scopes) stay.
    const proj = makeHome('codex-project');
    const projectDir = path.join(proj, 'repo');
    fs.mkdirSync(projectDir);
    runOk('node', [CODEX_INSTALLER, projectDir], proj, 'codex project install');
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { scope: 'global' }, { home: proj });
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { scope: 'project:' + projectDir }, { home: proj });
    const globalHooks = fs.readFileSync(path.join(proj, '.codex', 'hooks.json'));
    runOk('node', [CODEX_INSTALLER, projectDir, '--uninstall'], proj, 'codex project --uninstall');
    check(!exists(projectDir, '.codex/agents/kaola-workflow'), 'project uninstall removed project profiles');
    check(fs.readFileSync(path.join(proj, '.codex', 'hooks.json')).equals(globalHooks), 'project uninstall leaves the global hooks');
    const codexRef = refs.listRefs(refs.CONFIG_BLOCK_ID, { home: proj }).codex;
    check(codexRef && JSON.stringify(codexRef.scopes) === '["global"]', 'project uninstall released only its own scope');
  }

  // ---- 4. Additive runtimes: --global --uninstall ---------------------------------------------
  const ADDITIVE = [
    { id: 'opencode', script: 'install-opencode.sh', own: [path.join('.config', 'opencode')] },
    { id: 'kimi', script: 'install-kimi.sh', own: ['.kimi-code'] },
    { id: 'grok', script: 'install-grok.sh', own: ['.grok'] },
    { id: 'cursor', script: 'install-cursor.sh', own: ['.cursor'] },
    { id: 'zcode', script: 'install-zcode.sh', own: ['.zcode'] },
    { id: 'droid', script: 'install-droid.sh', own: ['.factory'] },
    { id: 'dsh', script: 'install-dsh.sh', own: ['.dsh'] },
  ];
  for (const rt of ADDITIVE) {
    const home = makeHome(rt.id);
    const script = path.join(root, rt.script);
    runOk('bash', [script, '--global', '--yes'], home, `${rt.script} install`);
    const config = seedConfig(home);
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, rt.id, { scope: 'global' }, { home });
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, rt.id, { scope: 'global' }, { home });
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { scope: 'global' }, { home });
    check(Object.keys(refs.listRefs(refs.CONFIG_BLOCK_ID, { home })).length === 2, `${rt.id}: reinstall registration does not double count`);
    const before = snapshot(home);

    runOk('bash', [script, '--global', '--uninstall'], home, `${rt.script} --uninstall`);
    const after = snapshot(home);
    check(fs.readFileSync(path.join(home, CONFIG_REL)).equals(config), `(ii) ${rt.id}: config.json byte-identical while codex holds a reference`);
    check(Object.keys(refs.listRefs(refs.CONFIG_BLOCK_ID, { home })).join() === 'codex', `${rt.id}: released only its own reference`);
    const foreign = foreignChanges(before, after, rt.own);
    check(foreign.length === 0, `(iv) ${rt.id} --uninstall wrote outside ${rt.own.join(', ')}: ${foreign.join(', ')}`);

    // (iii): this runtime as the last holder. Codex leaves first (not last: nothing is cleaned).
    refs.registerSharedRef(refs.CONFIG_BLOCK_ID, rt.id, { scope: 'global' }, { home });
    const codexOut = refs.deregisterSharedRef(refs.CONFIG_BLOCK_ID, 'codex', { home, scope: 'global' });
    check(!codexOut.cleaned && exists(home, CONFIG_REL), `${rt.id}: codex release before the last holder cleans nothing`);
    runOk('bash', [script, '--global', '--uninstall'], home, `${rt.script} --uninstall (last)`);
    check(!exists(home, CONFIG_REL) && !exists(home, REGISTRY_REL), `(iii) ${rt.id}: last reference cleaned config.json and the registry`);
  }

  console.log(`PASS test-issue-1087-lane-a: ${passed} assertions`);
} finally {
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}
