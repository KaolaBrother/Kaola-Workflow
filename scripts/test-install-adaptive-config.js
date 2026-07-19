#!/usr/bin/env node
'use strict';

// issue #725: fast/full retirement. Adaptive is the unconditional and sole workflow path.
// install.sh seeds ~/.config/kaola-workflow/config.json with parallel_mode only (never
// installed_paths); the retired --with-fast / --with-full flags are now unknown-flag errors and the
// install ships no fast/full command artifacts. Uninstall clears the shared config.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');

function freshHome(slug) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-adaptive-' + slug + '-'));
}
function runInstall(home, extraArgs) {
  return execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge', ...extraArgs], {
    cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function runUninstall(home, extraArgs) {
  return execFileSync('bash', ['uninstall.sh', '--forge=github', ...extraArgs], {
    cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}
// #2: the opencode installer seeds the SAME shared ~/.config/kaola-workflow/config.json the
// github install writes (parallel_mode default-ON parity). Deploy into a throwaway target dir
// (--no-scripts skips the manifest-driven support-script copy that needs node round-trips).
function runOpencodeInstall(home, target) {
  return execFileSync('bash', ['install-opencode.sh', '--yes', '--no-scripts', '--target', target], {
    cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function configPath(home) { return path.join(home, '.config', 'kaola-workflow', 'config.json'); }
function readConfig(home) { return JSON.parse(fs.readFileSync(configPath(home), 'utf8')); }
function commandsDir(home) { return path.join(home, '.claude', 'commands'); }
function commandExists(home, name) { return fs.existsSync(path.join(commandsDir(home), name)); }
// #703: the plan-run reference cards ship under $SUPPORT_DIR/docs/plan-run-cards (github SUPPORT_DIR).
function cardExists(home, name) {
  return fs.existsSync(path.join(home, '.claude', 'kaola-workflow', 'docs', 'plan-run-cards', name));
}

const homes = [];
function cleanup() { for (const h of homes) try { fs.rmSync(h, { recursive: true, force: true }); } catch (_) {} }

try {
  // AC1 (retirement regression): a bare install seeds parallel_mode:auto, NEVER writes installed_paths
  // (fast/full retired), migrates away enable_adaptive, installs NO fast/full command artifacts, and
  // installs the adaptive command surface + plan-run cards.
  {
    const home = freshHome('ac1-default'); homes.push(home);
    runInstall(home, []);
    const cfg = readConfig(home);
    assert(cfg.parallel_mode === 'auto', 'AC1: bare install must seed parallel_mode:auto, got ' + JSON.stringify(cfg));
    assert(!('installed_paths' in cfg),
      'AC1: bare install must NOT write installed_paths (retired), got ' + JSON.stringify(cfg));
    assert(!('enable_adaptive' in cfg), 'AC1: bare install must NOT write enable_adaptive field, got ' + JSON.stringify(cfg));
    assert(!commandExists(home, 'kaola-workflow-fast.md'),
      'AC1: bare install must NOT install kaola-workflow-fast.md');
    for (let i = 1; i <= 5; i++) {
      assert(!commandExists(home, `kaola-workflow-phase${i}.md`),
        `AC1: bare install must NOT install kaola-workflow-phase${i}.md`);
    }
    // Adaptive commands must be present
    for (const cmd of ['workflow-init.md', 'workflow-next.md', 'kaola-workflow-adapt.md',
                       'kaola-workflow-plan-run.md', 'kaola-workflow-finalize.md']) {
      assert(commandExists(home, cmd), `AC1: bare install must install adaptive command ${cmd}`);
    }
    // #703: the plan-run reference cards ship into the install layout so operators can follow the
    // barrier/repair/resume recovery recipes the plan-run command cites (repair-routing.md is canonical).
    assert(cardExists(home, 'repair-routing.md'),
      'AC1: bare install must ship docs/plan-run-cards/repair-routing.md into the support dir');
  }

  // AC2 (flags refused): the retired --with-fast / --with-full are unknown-flag errors (exit non-zero),
  // and no fast/full command artifact is installed.
  for (const flag of ['--with-fast', '--with-full']) {
    const home = freshHome('ac2-refuse-' + flag.replace(/[^a-z]/gi, '')); homes.push(home);
    const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge', flag], {
      cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8',
    });
    assert(result.status !== 0,
      `AC2: ${flag} must be an unknown-flag error (exit non-zero), got status=${result.status}\nstderr: ${result.stderr}`);
    assert(/Unknown argument/.test(result.stderr || ''),
      `AC2: ${flag} must print an unknown-argument error, got stderr: ${result.stderr}`);
    assert(!commandExists(home, 'kaola-workflow-fast.md'),
      `AC2: a refused ${flag} install must not have the retired fast command`);
  }

  // AC3 (reset lifecycle): a bare install writes the shared config; uninstall removes it; a bare
  // reinstall comes back up with parallel_mode:auto and still no installed_paths / fast artifacts.
  {
    const home = freshHome('ac3-reset'); homes.push(home);
    runInstall(home, []);
    assert(fs.existsSync(configPath(home)), 'AC3: config must exist after install');
    runUninstall(home, []);
    assert(!fs.existsSync(configPath(home)), 'AC3: config must be removed after uninstall');
    runInstall(home, []); // bare reinstall
    const cfg = readConfig(home);
    assert(cfg.parallel_mode === 'auto',
      'AC3: reinstall after uninstall must seed parallel_mode:auto, got ' + JSON.stringify(cfg));
    assert(!('installed_paths' in cfg),
      'AC3: reinstall after uninstall must NOT write installed_paths, got ' + JSON.stringify(cfg));
    assert(!commandExists(home, 'kaola-workflow-fast.md'),
      'AC3: reinstall after uninstall must NOT have the retired fast command');
  }

  // AC4 (stale installed_paths tolerated on read, stripped on write): a pre-existing config carrying a
  // stale installed_paths from an old install is tolerated and stripped on the next install (never
  // re-written), while a user parallel_mode and unrelated user fields are preserved.
  {
    const home = freshHome('ac4-strip-stale'); homes.push(home);
    fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
    fs.writeFileSync(configPath(home),
      JSON.stringify({ parallel_mode: 'manual', installed_paths: ['fast', 'full'], user_field: 'keep' }, null, 2) + '\n');
    runInstall(home, []);
    const cfg = readConfig(home);
    assert(!('installed_paths' in cfg),
      'AC4: install must strip a stale installed_paths (never re-writes it), got ' + JSON.stringify(cfg));
    assert(cfg.parallel_mode === 'manual', 'AC4: install must preserve a user parallel_mode, got ' + JSON.stringify(cfg));
    assert(cfg.user_field === 'keep', 'AC4: install must preserve unrelated user config fields, got ' + JSON.stringify(cfg));
  }

  // AC5: --enable-adaptive warns-and-ignores (exit 0, no enable_adaptive field written, deprecation
  // warning on stderr); the seeded config carries parallel_mode:auto and no retired installed_paths.
  {
    const home = freshHome('ac5-deprecated'); homes.push(home);
    const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge', '--enable-adaptive=yes'], {
      cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8',
    });
    assert(result.status === 0,
      'AC5: --enable-adaptive=yes must exit 0 (warn-and-ignore), got status=' + result.status +
      '\nstderr: ' + result.stderr + '\nstdout: ' + result.stdout);
    const cfg = readConfig(home);
    assert(!('enable_adaptive' in cfg),
      'AC5: --enable-adaptive=yes must NOT write enable_adaptive field, got ' + JSON.stringify(cfg));
    assert(cfg.parallel_mode === 'auto',
      'AC5: config must seed parallel_mode:auto after --enable-adaptive=yes install, got ' + JSON.stringify(cfg));
    assert(!('installed_paths' in cfg),
      'AC5: config must NOT carry installed_paths after --enable-adaptive=yes install, got ' + JSON.stringify(cfg));
    const hasWarning = (result.stderr || '').includes('retired') || (result.stderr || '').includes('#538');
    assert(hasWarning,
      'AC5: --enable-adaptive must emit a deprecation warning on stderr mentioning retired/#538, got stderr: ' + result.stderr);
  }

  // Preserved test: issue #242 — uninstall.sh must remove .kaola-agent-models.json
  {
    const home = freshHome('uninstall-manifest'); homes.push(home);
    runInstall(home, []);
    const manifestPath = path.join(home, '.claude', 'agents', '.kaola-agent-models.json');
    assert(fs.existsSync(manifestPath), 'manifest must exist after install (prerequisite for uninstall test)');
    execFileSync('bash', ['uninstall.sh', '--forge=github'],
      { cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert(!fs.existsSync(manifestPath), 'uninstall.sh must remove .kaola-agent-models.json');
    assert(!fs.existsSync(path.join(home, '.claude', 'agents', 'contractor.md')), 'uninstall.sh must remove contractor.md');
  }

  // Preserved test: contractor manifest mapping (issue #242 Part B).
  for (const args of [[], ['--profile=higher']]) {
    const h = freshHome('contractor-' + (args[0] || 'default').replace(/[^a-z]/gi, '')); homes.push(h);
    runInstall(h, args);
    const manifestPath = path.join(h, '.claude', 'agents', '.kaola-agent-models.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(manifest['contractor'] === 'sonnet', 'install ' + JSON.stringify(args) + ' must map contractor->sonnet; got ' + manifest['contractor']);
  }

  // #2: opencode install-time parity — install-opencode.sh seeds the shared
  // ~/.config/kaola-workflow/config.json with parallel_mode:'auto' (default-ON parallelism),
  // mirroring the github AC1 assertion. opencode is adaptive-only (no fast/full opt-ins), so
  // installed_paths is []. This locks the opencode seed against drift from the github install.
  {
    const home = freshHome('opencode-parallel'); homes.push(home);
    const target = freshHome('opencode-target'); homes.push(target);
    runOpencodeInstall(home, target);
    const cfg = readConfig(home);
    assert(cfg.parallel_mode === 'auto',
      'OPENCODE: install-opencode.sh must write parallel_mode:auto, got ' + JSON.stringify(cfg));
    assert(Array.isArray(cfg.installed_paths) && cfg.installed_paths.length === 0,
      'OPENCODE: install-opencode.sh must write installed_paths:[] (adaptive-only), got ' + JSON.stringify(cfg));
    assert(!('enable_adaptive' in cfg),
      'OPENCODE: install-opencode.sh must NOT write enable_adaptive field, got ' + JSON.stringify(cfg));
  }

  console.log('Install adaptive-config tests passed');
} finally {
  cleanup();
}
