#!/usr/bin/env node
'use strict';

// Issue #1044 acceptance: ZCode is deliberately a hook-free rendering target.
//
// ZCode 3.10.1 has a 1,000,000-token context in the measured installation, and
// the live hook experiment could self-lock Workflow Next by intercepting the
// model's compatibility bind. Compact-only prompt recovery belongs to Cursor
// and Grok. The ZCode installer therefore deploys agents/commands/support
// files, but declares no Kaola hook at project scope or global scope. Legacy
// hook rows are removable only with their exact ownership receipt; foreign
// configuration and foreign shells are never a cleanup casualty.
//
// This suite intentionally does not emulate ZCode's private trust store or
// invent a trust-review command. There is no ZCode declaration to approve.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const INSTALLER = path.join(REPO, 'install-zcode.sh');
const SYNC = path.join(REPO, 'scripts', 'sync-zcode-edition.js');

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

function writeJson(file, value, mode) {
  write(file, json(value), mode);
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return null; }
}

function outputOf(result) {
  return String(result && result.stdout || '') + String(result && result.stderr || '');
}

function makeFixture(label) {
  const root = fs.mkdtempSync(path.join(tmpBase(), 'kw-1044-zcode-install-'));
  const project = path.join(root, 'project-' + label);
  const home = path.join(root, 'home');
  const zcodeHome = path.join(root, 'zcode-home');
  const runtimeDataRoot = path.join(root, 'runtime-data');
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(zcodeHome, { recursive: true });
  fs.mkdirSync(runtimeDataRoot, { recursive: true });
  writeJson(path.join(project, 'package.json'), { name: 'zcode-install-' + label });
  return { root, project, home, zcodeHome, runtimeDataRoot };
}

function cleanup(fixture) {
  if (!fixture) return;
  try { fs.rmSync(fixture.root, { recursive: true, force: true }); }
  catch (_) { /* isolated fixture cleanup */ }
}

function envFor(fixture) {
  return Object.assign({}, process.env, {
    HOME: fixture.home,
    ZCODE_HOME: fixture.zcodeHome,
    KAOLA_WORKFLOW_RUNTIME_DATA_ROOT: fixture.runtimeDataRoot,
  });
}

function runInstaller(fixture, options) {
  options = options || {};
  const args = ['--yes'];
  if (options.global) args.push('--global');
  else args.push('--target', fixture.project);
  if (options.forge) args.push('--forge=' + options.forge);
  if (options.uninstall) args.push('--uninstall');
  if (options.noScripts) args.push('--no-scripts');
  // spawn-class: environment
  return spawnSync('bash', [INSTALLER].concat(args), {
    cwd: fixture.project,
    env: envFor(fixture),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function projectConfigPath(fixture) {
  return path.join(fixture.project, '.zcode', 'config.json');
}

function userConfigPath(fixture) {
  return path.join(fixture.zcodeHome, 'cli', 'config.json');
}

function projectReceiptPath(fixture) {
  return path.join(fixture.project, '.zcode', 'kaola-workflow', 'zcode-hooks-state.json');
}

function legacyReceiptPath(fixture) {
  return path.join(fixture.zcodeHome, 'kaola-workflow', 'zcode-hooks-state.json');
}

function allFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allFiles(file));
    else if (entry.isFile()) out.push(file);
  }
  return out;
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

function commandText(row) {
  return String(row && row.entry && row.entry.command || '');
}

function isKaolaHook(row) {
  // Support scripts are legitimate deployment artifacts. Only hook carriers
  // and the retired compact/runtime hook names count here.
  return /(?:kaola-workflow[/\\]hooks[/\\]|(?:^|[/\\])runtime-hook(?:\.sh)?\b|compact-(?:context|resume))/i
    .test(commandText(row));
}

function assertNoKaolaHooks(config, label) {
  const kaola = hookRows(config).filter(isKaolaHook);
  assertReal(kaola.length === 0,
    label + ': no Kaola hook command is declared (found ' + JSON.stringify(kaola.map(commandText)) + ')');
}

function assertNoEventDeclarations(config, label) {
  const hooks = config && config.hooks && typeof config.hooks === 'object'
    ? config.hooks : {};
  const direct = Object.keys(hooks).filter(key => key !== 'enabled' && key !== 'events');
  const nested = hooks.events && typeof hooks.events === 'object' && !Array.isArray(hooks.events)
    ? Object.keys(hooks.events) : [];
  assertReal(direct.length === 0 && nested.length === 0,
    label + ': no ZCode hook event declaration remains (direct=' + JSON.stringify(direct)
      + ', nested=' + JSON.stringify(nested) + ')');
}

function assertNoAmbientHooks(fixture, label) {
  const hookDir = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks');
  const files = allFiles(hookDir).filter(file => /\.(?:sh|command)$/.test(file));
  assertReal(files.length === 0,
    label + ': no user-level executable Kaola hook shell is installed (' + files.join(', ') + ')');
}

function configIfPresent(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function assertNoObsoleteTrustOutput(result, label) {
  const text = outputOf(result);
  assertReal(!/(?:approve|approval|trust review|pending review|hook declaration)/i.test(text),
    label + ': install output does not advertise a retired ZCode hook approval/trust flow');
}

// A. Renderer contract: a generated ZCode config, when the compatibility
// renderer returns one, has no Kaola event rows or executable hook path.
{
  let sync = null;
  try { sync = require(SYNC); } catch (_) { /* assertion below */ }
  assertReal(!!sync, 'A1: sync-zcode-edition loads');
  let rendered = '{}';
  if (sync && typeof sync.renderZcodeConfigJson === 'function') {
    try { rendered = sync.renderZcodeConfigJson('github'); }
    catch (error) {
      rendered = '{}';
      assertReal(false, 'A2: ZCode config renderer does not throw — ' + error.message);
    }
  }
  let config = null;
  try { config = JSON.parse(rendered); } catch (_) { /* assertion below */ }
  assertReal(!!config, 'A3: rendered ZCode config remains valid JSON');
  if (config) {
    assertNoKaolaHooks(config, 'A4');
    assertNoEventDeclarations(config, 'A5');
  }
  assertReal(!/kaola-workflow[/\\](?:hooks|runtime-hook)|compact-(?:context|resume)/i.test(rendered),
    'A6: rendered ZCode config contains no Kaola hook path');
}

// B. Clean project/global installs must not create a ZCode hook declaration,
// receipt, ambient shell, or obsolete trust hand-off. Agents and commands
// remain the actual ZCode edition surface.
for (const scope of ['project', 'global']) {
  const fixture = makeFixture(scope);
  try {
    const result = runInstaller(fixture, { global: scope === 'global' });
    const projectConfig = configIfPresent(projectConfigPath(fixture));
    assertReal(result.status === 0,
      scope + ': install exits 0 (status=' + result.status + ')');
    if (projectConfig) {
      assertNoKaolaHooks(projectConfig, scope + ' B1');
      assertNoEventDeclarations(projectConfig, scope + ' B2');
    } else {
      assertReal(true, scope + ': no project config is a valid hook-free install');
    }
    assertReal(!fs.existsSync(projectReceiptPath(fixture)),
      scope + ': no project hook ownership receipt is created');
    assertReal(!fs.existsSync(legacyReceiptPath(fixture)),
      scope + ': no legacy hook ownership receipt is created');
    assertNoAmbientHooks(fixture, scope + ' B3');
    assertNoObsoleteTrustOutput(result, scope + ' B4');
    if (scope === 'global') {
      assertReal(!fs.existsSync(projectConfigPath(fixture)),
        'global: no unrelated project hook config is materialized');
    }
    assertReal(fs.existsSync(path.join(fixture.zcodeHome, 'agents')),
      scope + ': agent roster is still deployed');
    const commandRoot = scope === 'global'
      ? path.join(fixture.zcodeHome, 'commands')
      : path.join(fixture.project, '.zcode', 'commands');
    assertReal(fs.existsSync(commandRoot), scope + ': command surface is still deployed');
  } finally {
    cleanup(fixture);
  }
}

// C. Migration is receipt-owned and exact. The old direct rows and the old
// nested rows named by their receipts disappear; an unowned row and a foreign
// shell remain. The migration must not replace retired rows with a new ZCode
// hook declaration.
{
  const fixture = makeFixture('migration');
  const ownedUserDirect = { command: 'sh legacy-kaola-session-start.sh', timeout: 5 };
  const ownedUserNested = { type: 'command', command: 'sh legacy-kaola-pre-tool.sh', timeout: 6 };
  const foreignUser = { command: 'echo customer-user-hook', timeout: 17 };
  const ownedProject = { type: 'command', command: 'sh legacy-kaola-project-start.sh', timeout: 7 };
  const foreignProject = { type: 'command', command: 'echo customer-project-hook', timeout: 19 };
  const ownedProjectRow = { matcher: '*', hooks: [ownedProject] };
  const foreignProjectRow = { matcher: '*', hooks: [foreignProject] };
  const userSeed = {
    theme: 'foreign-user-theme',
    hooks: {
      enabled: true,
      SessionStart: [ownedUserDirect, foreignUser],
      events: {
        PreToolUse: [{ matcher: '*', hooks: [ownedUserNested] }],
        Stop: [{ matcher: '*', hooks: [foreignProject] }],
      },
    },
  };
  const projectSeed = {
    project: 'foreign-project-data',
    hooks: {
      enabled: true,
      events: { SessionStart: [ownedProjectRow, foreignProjectRow] },
    },
  };
  try {
    writeJson(userConfigPath(fixture), userSeed, 0o600);
    writeJson(legacyReceiptPath(fixture), {
      schema: 'kaola-workflow-zcode-hooks-v1',
      destination: path.resolve(userConfigPath(fixture)),
      priorEnabled: { present: true, value: true },
      priorEvents: { present: true },
      added: [
        { event: 'SessionStart', entry: ownedUserDirect },
        { event: 'PreToolUse', entry: { matcher: '*', hooks: [ownedUserNested] } },
      ],
    }, 0o600);
    writeJson(projectConfigPath(fixture), projectSeed, 0o600);
    writeJson(projectReceiptPath(fixture), {
      schema: 'kaola-workflow-zcode-hooks-v1',
      destination: path.resolve(projectConfigPath(fixture)),
      priorEnabled: { present: true, value: true },
      priorEvents: { present: true },
      added: [{ event: 'SessionStart', entry: ownedProjectRow }],
    }, 0o600);

    const oldShell = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks',
      'kaola-workflow-subagent-dispatch-log.sh');
    let runtimeHookBytes = '#!/bin/sh\n# receipt-owned legacy runtime hook\n';
    let compactHookBytes = '#!/bin/sh\n# receipt-owned legacy compact hook\n';
    try {
      const sync = require(SYNC);
      if (typeof sync.renderRuntimeHookWrapper === 'function') {
        runtimeHookBytes = sync.renderRuntimeHookWrapper('github');
      }
      if (typeof sync.renderCompactWrapper === 'function') {
        compactHookBytes = sync.renderCompactWrapper('github');
      }
    } catch (_) { /* fallback fixture bytes still exercise ownership */ }
    const sameByteHook = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks',
      'kaola-workflow-runtime-hook.sh');
    const modifiedHook = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks',
      'kaola-workflow-compact-context.sh');
    const foreignShell = path.join(fixture.zcodeHome, 'kaola-workflow', 'hooks', 'customer-hook.sh');
    write(oldShell, '#!/bin/sh\n# receipt-owned legacy ambient shell\n', 0o755);
    write(sameByteHook, runtimeHookBytes, 0o755);
    write(modifiedHook, compactHookBytes + '\n# local edit: no longer receipt-owned\n', 0o755);
    const foreignShellBytes = '#!/bin/sh\n# customer-owned ambient shell\n';
    write(foreignShell, foreignShellBytes, 0o755);

    const result = runInstaller(fixture);
    const afterUser = configIfPresent(userConfigPath(fixture));
    const afterProject = configIfPresent(projectConfigPath(fixture));
    assertReal(result.status === 0,
      'C1: project install performs migration (status=' + result.status + ')');
    assertReal(!!afterUser && afterUser.theme === userSeed.theme,
      'C2: foreign user config data survives exact cleanup');
    assertReal(hookRows(afterUser).some(row => JSON.stringify(row.entry) === JSON.stringify(foreignUser)),
      'C3: foreign direct user row survives');
    assertReal(!hookRows(afterUser).some(row => JSON.stringify(row.entry) === JSON.stringify(ownedUserDirect)),
      'C4: receipt-owned direct user row is removed');
    assertReal(!hookRows(afterUser).some(row => JSON.stringify(row.entry) === JSON.stringify(ownedUserNested)),
      'C5: receipt-owned nested user row is removed without being moved into events');
    assertReal(!!afterProject && afterProject.project === projectSeed.project,
      'C6: foreign project config data survives exact cleanup');
    assertReal(hookRows(afterProject).some(row => JSON.stringify(row.entry) === JSON.stringify(foreignProject)),
      'C7: foreign project row survives');
    assertReal(!hookRows(afterProject).some(row => JSON.stringify(row.entry) === JSON.stringify(ownedProject)),
      'C8: receipt-owned project row is removed');
    assertReal(!fs.existsSync(projectReceiptPath(fixture)) && !fs.existsSync(legacyReceiptPath(fixture)),
      'C9: consumed ownership receipts are removed');
    assertReal(!fs.existsSync(oldShell),
      'C10: receipt-owned legacy ambient shell is removed');
    assertReal(!fs.existsSync(sameByteHook),
      'C10b: same-byte generated legacy hook shell is removed');
    assertReal(fs.existsSync(modifiedHook)
      && fs.readFileSync(modifiedHook, 'utf8') === compactHookBytes + '\n# local edit: no longer receipt-owned\n',
    'C10c: modified legacy hook shell is treated as foreign and preserved');
    assertReal(fs.existsSync(foreignShell)
      && fs.readFileSync(foreignShell, 'utf8') === foreignShellBytes,
    'C11: foreign ambient shell remains byte-identical');
    assertNoKaolaHooks(afterProject, 'C12: resulting project config');
  } finally {
    cleanup(fixture);
  }
}

// D. Without an exact ownership receipt, uninstall cannot mutate either
// config. This is the negative ownership boundary for foreign hook rows.
{
  const fixture = makeFixture('unreceipted');
  const userBytes = json({
    owner: 'customer',
    hooks: { enabled: false, Stop: [{ command: 'echo customer-stop', timeout: 11 }] },
  });
  const projectBytes = json({
    owner: 'customer-project',
    hooks: { events: { SessionStart: [{ matcher: '*', hooks: [
      { type: 'command', command: 'echo customer-session', timeout: 13 },
    ] }] } },
  });
  try {
    write(userConfigPath(fixture), userBytes, 0o600);
    write(projectConfigPath(fixture), projectBytes, 0o600);
    const result = runInstaller(fixture, { uninstall: true });
    assertReal(result.status === 0,
      'D1: unreceipted uninstall exits 0 (status=' + result.status + ')');
    assertReal(fs.readFileSync(userConfigPath(fixture), 'utf8') === userBytes,
      'D2: unreceipted user config remains byte-identical');
    assertReal(fs.readFileSync(projectConfigPath(fixture), 'utf8') === projectBytes,
      'D3: unreceipted project config remains byte-identical');
  } finally {
    cleanup(fixture);
  }
}

// E. --no-scripts still cannot create a hook declaration or approval path.
{
  const fixture = makeFixture('no-scripts');
  try {
    const result = runInstaller(fixture, { noScripts: true });
    const config = configIfPresent(projectConfigPath(fixture));
    assertReal(result.status === 0, 'E1: --no-scripts exits 0 (status=' + result.status + ')');
    if (config) {
      assertNoKaolaHooks(config, 'E2');
      assertNoEventDeclarations(config, 'E3');
    } else assertReal(true, 'E2: --no-scripts has no hook config');
    assertReal(!fs.existsSync(projectReceiptPath(fixture)) && !fs.existsSync(legacyReceiptPath(fixture)),
      'E4: --no-scripts creates no hook receipts');
    assertNoAmbientHooks(fixture, 'E5');
    assertNoObsoleteTrustOutput(result, 'E6');
  } finally {
    cleanup(fixture);
  }
}

// F. Static source guard: the installer may retain a shared migration utility,
// but it must not route a fresh install through a hook declaration installer or
// emit an approval count. This catches a near-miss where runtime behavior is
// hook-free only because a branch happened to be skipped.
{
  const source = fs.readFileSync(INSTALLER, 'utf8');
  assertReal(!/^[ \t]*install_hook_declarations\s*\(\s*$/m.test(source),
    'F1: installer has no fresh-install hook-declaration call');
  assertReal(!/Installed\s+(?:two|five|six)\s+workspace hook declarations/i.test(source),
    'F2: installer does not claim to install a ZCode hook declaration count');
  assertReal(!/approve all|zcode hooks trust review|Workspace Hooks pending review/i.test(source),
    'F3: installer source carries no retired ZCode hook approval instructions');
}

if (failed) {
  console.error('\nzcode install acceptance FAILED: ' + failed + ' failure(s), ' + passed + ' passed.');
  process.exit(1);
}
console.log('zcode install acceptance passed (' + passed + ' assertions).');
