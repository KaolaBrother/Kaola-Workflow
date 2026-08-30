#!/usr/bin/env node
'use strict';

// Issue #1044 acceptance: ZCode deliberately has no Kaola hook integration.
// The live 3.10.1 self-lock and the 1M-context measurement make the earlier
// UserPromptSubmit/SessionStart/PreToolUse/PostToolUse/Stop design a retired
// mechanism.  Cursor and Grok own compact recovery; ZCode must not register a
// hook subprocess at all.  The shared prompt-bundle suite owns the helper
// lifecycle and tokenized/PostToolUse API.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const SYNC = path.join(REPO, 'scripts', 'sync-zcode-edition.js');
const INSTALLER = path.join(REPO, 'install-zcode.sh');

let passed = 0;
let failed = 0;

function assertReal(condition, message) {
  if (condition) passed++;
  else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

function tmpBase() {
  const value = os.tmpdir();
  return path.isAbsolute(value) ? value : '/tmp';
}

function write(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value, mode == null ? undefined : { mode });
}

function json(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function runNode(file, args, cwd, env) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath, [file].concat(args || []), {
    cwd: cwd || REPO,
    env: Object.assign({}, process.env, env || {}),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function runInstaller(fixture, args) {
  const options = (args || []).slice();
  if (!options.includes('--global')) options.push('--target', fixture.project);
  // spawn-class: environment
  return spawnSync('bash', [INSTALLER].concat(options, ['--yes']), {
    cwd: fixture.project,
    env: Object.assign({}, process.env, {
      HOME: fixture.home,
      ZCODE_HOME: fixture.zcodeHome,
      KAOLA_WORKFLOW_RUNTIME_DATA_ROOT: fixture.runtimeDataRoot,
    }),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function outputOf(result) {
  return String(result && result.stdout || '') + String(result && result.stderr || '');
}

function makeFixture(label) {
  const root = fs.mkdtempSync(path.join(tmpBase(), 'kw-1044-zcode-hooks-'));
  const project = path.join(root, 'project-' + label);
  const home = path.join(root, 'home');
  const zcodeHome = path.join(root, 'zcode-home');
  const runtimeDataRoot = path.join(root, 'runtime-data');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(zcodeHome, { recursive: true });
  fs.mkdirSync(runtimeDataRoot, { recursive: true });
  write(path.join(project, 'package.json'), json({ name: 'zcode-hook-fixture-' + label }));
  return { root, project, home, zcodeHome, runtimeDataRoot };
}

function cleanup(fixture) {
  if (!fixture) return;
  try { fs.rmSync(fixture.root, { recursive: true, force: true }); }
  catch (_) { /* isolated fixture cleanup */ }
}

function projectConfig(fixture) {
  return path.join(fixture.project, '.zcode', 'config.json');
}

function projectReceipt(fixture) {
  return path.join(fixture.project, '.zcode', 'kaola-workflow', 'zcode-hooks-state.json');
}

function legacyConfig(fixture) {
  return path.join(fixture.zcodeHome, 'cli', 'config.json');
}

function legacyReceipt(fixture) {
  return path.join(fixture.zcodeHome, 'kaola-workflow', 'zcode-hooks-state.json');
}

function hookRows(config) {
  const hooks = config && config.hooks && typeof config.hooks === 'object'
    ? config.hooks : {};
  const containers = [hooks];
  if (hooks.events && typeof hooks.events === 'object' && !Array.isArray(hooks.events)) {
    containers.push(hooks.events);
  }
  const rows = [];
  for (const container of containers) {
    for (const [event, entries] of Object.entries(container)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry && Array.isArray(entry.hooks)) {
          for (const nested of entry.hooks) rows.push({ event, entry: nested });
        } else rows.push({ event, entry });
      }
    }
  }
  return rows;
}

function isKaolaHook(row) {
  const command = row && row.entry && row.entry.command;
  return /kaola-workflow|runtime-hook|compact-(?:context|resume)/i.test(String(command || ''));
}

function assertNoKaolaHooks(config, label) {
  const rows = hookRows(config);
  assertReal(rows.filter(isKaolaHook).length === 0,
    label + ': no Kaola executable hook row is present');
}

function assertNoEventDeclarations(config, label) {
  const hooks = config && config.hooks;
  const directEvents = hooks && typeof hooks === 'object'
    ? Object.keys(hooks).filter(name => name !== 'enabled' && name !== 'events') : [];
  const nestedEvents = hooks && hooks.events && typeof hooks.events === 'object'
    && !Array.isArray(hooks.events) ? Object.keys(hooks.events) : [];
  assertReal(directEvents.length === 0 && nestedEvents.length === 0,
    label + ': no ZCode event declaration remains (direct=' + JSON.stringify(directEvents)
      + ' nested=' + JSON.stringify(nestedEvents) + ')');
}

function executableFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...executableFiles(file));
    else if (entry.isFile() && /\.(?:sh|command)$/.test(entry.name)) result.push(file);
  }
  return result;
}

// 1. The renderer may keep a compatibility entry point, but its ZCode output
// must contain no Kaola hook event.  A project install cannot be wired to a
// native subprocess that this renderer does not declare.
{
  let rendered = '{}';
  let sync = null;
  try { sync = require(SYNC); } catch (_) { /* assertion below reports it */ }
  assertReal(!!sync, 'render: sync-zcode-edition loads');
  if (sync && typeof sync.renderZcodeConfigJson === 'function') {
    try { rendered = sync.renderZcodeConfigJson('github'); }
    catch (error) { rendered = '{}'; assertReal(false, 'render: config renderer does not throw — ' + error.message); }
  }
  let config = null;
  try { config = JSON.parse(rendered); } catch (_) { /* assertion below */ }
  assertReal(!!config, 'render: generated ZCode config remains valid JSON');
  if (config) {
    assertNoKaolaHooks(config, 'render');
    assertNoEventDeclarations(config, 'render');
  }
  assertReal(!/kaola-workflow\/hooks|runtime-hook|compact-(?:context|resume)/i.test(rendered),
    'render: serialized ZCode config contains no Kaola hook command path');
}

// 2. Project and global installs deploy the runtime's agents/commands but no
// ZCode hook declaration, hook receipt, or ambient executable hook carrier.
for (const scope of ['project', 'global']) {
  const fixture = makeFixture(scope);
  try {
    const result = runInstaller(fixture, scope === 'global' ? ['--global'] : []);
    const configPath = projectConfig(fixture);
    const config = fs.existsSync(configPath) ? readJson(configPath) : null;
    assertReal(result.status === 0,
      scope + ': install exits 0 (status=' + result.status + ')');
    if (configPath && fs.existsSync(configPath)) {
      assertNoKaolaHooks(config, scope);
      assertNoEventDeclarations(config, scope);
    }
    else assertReal(true, scope + ': no project config is a valid no-hook install');
    assertReal(!fs.existsSync(projectReceipt(fixture)),
      scope + ': no project hook ownership receipt is created');
    assertReal(!fs.existsSync(legacyReceipt(fixture)),
      scope + ': no legacy hook ownership receipt is created');
    assertReal(executableFiles(path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks')).length === 0,
      scope + ': no user-level executable hook shell is installed');
    const text = outputOf(result);
    assertReal(!/(?:approve all|pending review|hooks trust review|hook declarations)/i.test(text),
      scope + ': install output does not request obsolete hook approval/trust');
    if (scope === 'global') {
      assertReal(!fs.existsSync(path.join(fixture.project, '.zcode', 'config.json')),
        'global: no unrelated project hook config is materialized');
    }
  } finally {
    cleanup(fixture);
  }
}

// 3. Migration remains narrowly receipt-owned even though no new ZCode hook is
// installed.  Exact old user/project rows and the known old ambient shell are
// removed; foreign rows and foreign shells survive byte-for-byte.
{
  const fixture = makeFixture('migration');
  const ownedUser = { command: 'sh legacy-kaola-session-start.sh', timeout: 5 };
  const foreignUser = { command: 'sh /opt/customer/session-start.sh', timeout: 17 };
  const ownedProject = { command: 'sh legacy-kaola-project-start.sh', timeout: 5 };
  const foreignProject = { command: 'sh /opt/customer/project-start.sh', timeout: 19 };
  const ownedProjectRow = { matcher: '*', hooks: [ownedProject] };
  const foreignProjectRow = { matcher: '*', hooks: [foreignProject] };
  const userSeed = {
    theme: 'foreign-theme',
    hooks: {
      enabled: true,
      SessionStart: [ownedUser, foreignUser],
      UserPromptSubmit: [{ command: 'echo foreign-prompt', timeout: 7 }],
      events: {
        Stop: [{ matcher: '*', hooks: [{ type: 'command', command: 'echo foreign-stop', timeout: 8 }] }],
      },
    },
  };
  const projectSeed = {
    hooks: {
      enabled: true,
      events: {
        SessionStart: [ownedProjectRow, foreignProjectRow],
      },
    },
  };
  try {
    write(legacyConfig(fixture), json(userSeed), 0o600);
    write(legacyReceipt(fixture), json({
      schema: 'kaola-workflow-zcode-hooks-v1',
      destination: path.resolve(legacyConfig(fixture)),
      priorEnabled: { present: true, value: true },
      priorEvents: { present: true },
      added: [
        { event: 'SessionStart', entry: ownedUser },
      ],
    }), 0o600);
    write(projectConfig(fixture), json(projectSeed), 0o600);
    write(projectReceipt(fixture), json({
      schema: 'kaola-workflow-zcode-hooks-v1',
      destination: path.resolve(projectConfig(fixture)),
      priorEnabled: { present: true, value: true },
      priorEvents: { present: true },
      added: [
        { event: 'SessionStart', entry: ownedProjectRow },
      ],
    }), 0o600);
    const oldShell = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks',
      'kaola-workflow-subagent-dispatch-log.sh');
    const foreignShell = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks', 'customer-hook.sh');
    write(oldShell, '#!/bin/sh\n# receipt-owned legacy ambient shell\n', 0o755);
    write(foreignShell, '#!/bin/sh\n# foreign ambient shell\n', 0o755);

    const result = runInstaller(fixture);
    const afterUser = readJson(legacyConfig(fixture));
    const afterProject = readJson(projectConfig(fixture));
    assertReal(result.status === 0,
      'migration: project install exits 0 (status=' + result.status + ', output='
        + JSON.stringify(outputOf(result).slice(-500)) + ')');
    assertReal(afterUser && afterUser.theme === userSeed.theme,
      'migration: foreign user config top-level data survives');
    assertReal(hookRows(afterUser).some(row => JSON.stringify(row.entry) === JSON.stringify(foreignUser)),
      'migration: foreign user hook survives exact receipt cleanup');
    assertReal(!hookRows(afterUser).some(row => JSON.stringify(row.entry) === JSON.stringify(ownedUser)),
      'migration: receipt-owned legacy user row is removed');
    assertReal(afterProject && hookRows(afterProject).some(row => JSON.stringify(row.entry) === JSON.stringify(foreignProject)),
      'migration: foreign project hook row survives');
    assertReal(!hookRows(afterProject).some(row => JSON.stringify(row.entry) === JSON.stringify(ownedProject)),
      'migration: receipt-owned legacy project row is removed');
    assertReal(!fs.existsSync(legacyReceipt(fixture)) && !fs.existsSync(projectReceipt(fixture)),
      'migration: both exact ownership receipts are consumed');
    assertReal(!fs.existsSync(oldShell),
      'migration: receipt-owned old ambient shell is removed');
    assertReal(fs.existsSync(foreignShell)
      && fs.readFileSync(foreignShell, 'utf8') === '#!/bin/sh\n# foreign ambient shell\n',
    'migration: foreign ambient shell remains byte-identical');
    assertNoKaolaHooks(afterProject, 'migration: resulting project config');
  } finally {
    cleanup(fixture);
  }
}

// 4. Without an exact ownership receipt, uninstall is transparent to foreign
// project/user config.  This protects the no-hook change from broad cleanup.
{
  const fixture = makeFixture('foreign');
  const userBytes = json({
    theme: 'foreign-user',
    hooks: { enabled: false, Stop: [{ command: 'echo foreign-stop', timeout: 11 }] },
  });
  const projectBytes = json({
    name: 'foreign-project',
    hooks: { events: { SessionStart: [{ matcher: '*', hooks: [
      { type: 'command', command: 'echo foreign-project', timeout: 13 },
    ] }] } },
  });
  try {
    write(legacyConfig(fixture), userBytes, 0o600);
    write(projectConfig(fixture), projectBytes, 0o600);
    const result = runInstaller(fixture, ['--uninstall']);
    assertReal(result.status === 0,
      'foreign: uninstall without receipts exits 0 (status=' + result.status + ')');
    assertReal(fs.readFileSync(legacyConfig(fixture), 'utf8') === userBytes,
      'foreign: unreceipted user config remains byte-identical');
    assertReal(fs.readFileSync(projectConfig(fixture), 'utf8') === projectBytes,
      'foreign: unreceipted project config remains byte-identical');
  } finally {
    cleanup(fixture);
  }
}

// 5. The installer source must not expose the retired merge/trust path as a
// product route.  Receipt-owned strip cleanup is intentionally exercised above.
if (fs.existsSync(INSTALLER)) {
  const source = fs.readFileSync(INSTALLER, 'utf8');
  assertReal(!/Installed\s+(?:five|six|two)\s+workspace hook declarations/i.test(source),
    'source: installer does not claim to install a hook declaration count');
}

if (failed) {
  console.error('\nzcode hook protocol acceptance FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('zcode hook protocol acceptance passed (' + passed + ' assertions).');
