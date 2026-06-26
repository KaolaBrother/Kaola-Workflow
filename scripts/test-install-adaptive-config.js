#!/usr/bin/env node
'use strict';

// issue #538: install.sh adaptive-default switch flip.
// Adaptive is now the unconditional default; --with-fast / --with-full are install-time opt-ins.
// Config writes `installed_paths: []` (default) instead of `enable_adaptive: true/false`.
// Re-install preserves (UNION) what was installed. Uninstall clears the shared config.

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

const homes = [];
function cleanup() { for (const h of homes) try { fs.rmSync(h, { recursive: true, force: true }); } catch (_) {} }

try {
  // AC1: Default install (bare, no flags) -> config installed_paths: [] AND no fast/full commands.
  {
    const home = freshHome('ac1-default'); homes.push(home);
    runInstall(home, []);
    const cfg = readConfig(home);
    assert(Array.isArray(cfg.installed_paths) && cfg.installed_paths.length === 0,
      'AC1: bare install must write installed_paths:[], got ' + JSON.stringify(cfg));
    assert(cfg.parallel_mode === 'auto', 'AC1: bare install must write parallel_mode:auto, got ' + JSON.stringify(cfg));
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
  }

  // AC2a: --with-fast -> installed_paths contains 'fast' AND kaola-workflow-fast.md is installed.
  {
    const home = freshHome('ac2a-fast'); homes.push(home);
    runInstall(home, ['--with-fast']);
    const cfg = readConfig(home);
    assert(Array.isArray(cfg.installed_paths) && cfg.installed_paths.includes('fast'),
      'AC2a: --with-fast must write installed_paths containing fast, got ' + JSON.stringify(cfg));
    assert(!cfg.installed_paths.includes('full'),
      'AC2a: --with-fast must NOT include full in installed_paths, got ' + JSON.stringify(cfg));
    assert(commandExists(home, 'kaola-workflow-fast.md'),
      'AC2a: --with-fast must install kaola-workflow-fast.md');
    // full phase commands still absent
    for (let i = 1; i <= 5; i++) {
      assert(!commandExists(home, `kaola-workflow-phase${i}.md`),
        `AC2a: --with-fast must NOT install kaola-workflow-phase${i}.md`);
    }
  }

  // AC2b: --with-full -> installed_paths contains 'full' AND phase commands are installed.
  {
    const home = freshHome('ac2b-full'); homes.push(home);
    runInstall(home, ['--with-full']);
    const cfg = readConfig(home);
    assert(Array.isArray(cfg.installed_paths) && cfg.installed_paths.includes('full'),
      'AC2b: --with-full must write installed_paths containing full, got ' + JSON.stringify(cfg));
    assert(!cfg.installed_paths.includes('fast'),
      'AC2b: --with-full must NOT include fast in installed_paths, got ' + JSON.stringify(cfg));
    for (let i = 1; i <= 5; i++) {
      assert(commandExists(home, `kaola-workflow-phase${i}.md`),
        `AC2b: --with-full must install kaola-workflow-phase${i}.md`);
    }
    // fast command still absent
    assert(!commandExists(home, 'kaola-workflow-fast.md'),
      'AC2b: --with-full must NOT install kaola-workflow-fast.md');
  }

  // AC3: Re-install preserves installed paths. Install --with-fast, then bare reinstall ->
  // installed_paths STILL contains fast AND kaola-workflow-fast.md is still present (spared AND refreshed).
  {
    const home = freshHome('ac3-preserve'); homes.push(home);
    runInstall(home, ['--with-fast']);
    let cfg = readConfig(home);
    assert(cfg.installed_paths.includes('fast'), 'AC3 precondition: first install must have fast');
    runInstall(home, []); // bare reinstall
    cfg = readConfig(home);
    assert(Array.isArray(cfg.installed_paths) && cfg.installed_paths.includes('fast'),
      'AC3: bare reinstall must preserve fast in installed_paths, got ' + JSON.stringify(cfg));
    assert(commandExists(home, 'kaola-workflow-fast.md'),
      'AC3: bare reinstall must preserve kaola-workflow-fast.md (spare AND refresh)');
  }

  // AC4: Uninstall -> reinstall -> config gone after uninstall; bare reinstall comes up installed_paths: [].
  {
    const home = freshHome('ac4-reset'); homes.push(home);
    runInstall(home, ['--with-fast']);
    assert(fs.existsSync(configPath(home)), 'AC4: config must exist after install');
    runUninstall(home, []);
    assert(!fs.existsSync(configPath(home)), 'AC4: config must be removed after uninstall');
    // bare reinstall -> adaptive-only
    runInstall(home, []);
    const cfg = readConfig(home);
    assert(Array.isArray(cfg.installed_paths) && cfg.installed_paths.length === 0,
      'AC4: reinstall after uninstall must come up installed_paths:[], got ' + JSON.stringify(cfg));
    assert(!commandExists(home, 'kaola-workflow-fast.md'),
      'AC4: reinstall after uninstall must NOT have fast command');
  }

  // AC5: --enable-adaptive warns-and-ignores (exit 0, no enable_adaptive field written, deprecation warning on stderr).
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
    assert(Array.isArray(cfg.installed_paths),
      'AC5: config must have installed_paths field after --enable-adaptive=yes install, got ' + JSON.stringify(cfg));
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
