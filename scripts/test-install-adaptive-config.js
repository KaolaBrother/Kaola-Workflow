#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.


// issue #725: fast/full retirement. Adaptive is the unconditional and sole workflow path.
// install.sh seeds ~/.config/kaola-workflow/config.json with parallel_mode only (never
// installed_paths); the retired --with-fast / --with-full flags are now unknown-flag errors and the
// install ships no fast/full command artifacts. Uninstall clears the shared config.

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');

function freshHome(slug) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-adaptive-' + slug + '-'));
}
function runInstall(home, extraArgs) {
  // spawn-class: environment
  return execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge', ...extraArgs], {
    cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function runUninstall(home, extraArgs) {
  // spawn-class: environment
  return execFileSync('bash', ['uninstall.sh', '--forge=github', ...extraArgs], {
    cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}
// #2: the opencode installer seeds the SAME shared ~/.config/kaola-workflow/config.json the
// github install writes (parallel_mode default-ON parity). Deploy into a throwaway target dir
// (--no-scripts skips the manifest-driven support-script copy that needs node round-trips).
function runOpencodeInstall(home, target) {
  // spawn-class: environment
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
  // AC1 (retirement regression): a bare install seeds parallel_mode:auto, NEVER writes installed_paths
  // (fast/full retired), migrates away enable_adaptive, installs NO fast/full command artifacts, and
  // installs the adaptive command surface.
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
    for (const cmd of ['workflow-init.md', 'workflow-next.md', 'kaola-workflow-finalize.md']) {
      assert(commandExists(home, cmd), `AC1: bare install must install adaptive command ${cmd}`);
    }
  }

  // AC2 (flags refused): the retired --with-fast / --with-full are unknown-flag errors (exit non-zero),
  // and no fast/full command artifact is installed.
  for (const flag of ['--with-fast', '--with-full']) {
    const home = freshHome('ac2-refuse-' + flag.replace(/[^a-z]/gi, '')); homes.push(home);
    // spawn-class: environment
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

  // AC5: --enable-adaptive warns-and-ignores (exit 0, no enable_adaptive field written, a
  // present-tense no-op note on stderr); the seeded config carries parallel_mode:auto and no
  // installed_paths. The flag is a no-op (adaptive is always installed) but is accepted rather
  // than rejected so callers passing it are not broken.
  {
    const home = freshHome('ac5-deprecated'); homes.push(home);
    // spawn-class: environment
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
    const hasWarning = (result.stderr || '').includes('--enable-adaptive') && (result.stderr || '').includes('Ignoring');
    assert(hasWarning,
      'AC5: --enable-adaptive must emit a warn-and-ignore note on stderr naming the flag, got stderr: ' + result.stderr);
  }

  // Retired install-time model manifest: install.sh must never write it, and must DISPOSE of a
  // pre-existing one on upgrade. uninstall.sh keeps its removal line for older trees.
  {
    const home = freshHome('uninstall-manifest'); homes.push(home);
    runInstall(home, []);
    const manifestPath = path.join(home, '.claude', 'agents', '.kaola-agent-models.json');
    assert(!fs.existsSync(manifestPath), 'install.sh must NOT write the retired .kaola-agent-models.json');
    // Plant a stale manifest (an older install's residue) and re-run: it must be disposed of.
    fs.writeFileSync(manifestPath, JSON.stringify({ contractor: 'opus' }));
    const upgradeOut = String(runInstall(home, []) || '');
    assert(!fs.existsSync(manifestPath), 'install.sh must DELETE a pre-existing .kaola-agent-models.json on upgrade');
    assert(upgradeOut.includes('Removed retired agent model manifest'),
      'install.sh must name the disposed manifest on stdout, got: ' + upgradeOut);
    // uninstall.sh keeps its disposal line: plant once more, then uninstall.
    fs.writeFileSync(manifestPath, JSON.stringify({ contractor: 'opus' }));
    // spawn-class: environment
    execFileSync('bash', ['uninstall.sh', '--forge=github'],
      { cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert(!fs.existsSync(manifestPath), 'uninstall.sh must remove .kaola-agent-models.json');
    assert(!fs.existsSync(path.join(home, '.claude', 'agents', 'contractor.md')), 'uninstall.sh must remove contractor.md');
  }

  // The retired install-time model axis: --profile is an UNKNOWN argument and fails loudly.
  for (const flag of ['--profile=higher', '--profile=common']) {
    const h = freshHome('retired-profile-' + flag.replace(/[^a-z]/gi, '')); homes.push(h);
    let threw = null;
    try {
      // spawn-class: environment
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', flag, '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: h }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { threw = e; }
    assert(threw && threw.status !== 0, 'install.sh ' + flag + ' must exit non-zero');
    assert(String(threw.stderr || '').includes('Unknown argument'),
      'install.sh ' + flag + ' must fail with the generic unknown-argument error, got: ' + (threw.stderr || ''));
  }

  // A standard-tier role resolves from the static defaults alone (no manifest).
  {
    const h = freshHome('implementer-default'); homes.push(h);
    runInstall(h, []);
    // spawn-class: environment
    const resolved = execFileSync('node',
      [path.join(root, 'scripts', 'kaola-workflow-resolve-agent-model.js'), 'implementer',
        '--agent-dir', path.join(h, '.claude', 'agents'), '--raw'],
      { cwd: root, encoding: 'utf8' }).trim();
    assert(resolved === 'sonnet', 'implementer must resolve to sonnet from the static defaults; got ' + resolved);
  }

  // #816: the RETIRED bookkeeping role must be swept from a previously-installed box — by the
  // installer on upgrade (manifest-driven sweep_retired_agents) AND by uninstall (RETIRED_AGENTS).
  {
    const h = freshHome('retired-contractor-sweep'); homes.push(h);
    runInstall(h, []);
    const agentsDir = path.join(h, '.claude', 'agents');
    const stale = path.join(agentsDir, 'contractor.md');
    const manifest = path.join(agentsDir, '.kaola-workflow-agent-manifest');
    // Simulate a box that installed the role on a PREVIOUS release: the file plus its manifest row.
    const staleBody = '---\nname: contractor\nmodel: sonnet\n---\n<!--\nkaola-workflow-managed-agent: true\n-->\nbody\n';
    fs.writeFileSync(stale, staleBody);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(stale)).digest('hex');
    fs.appendFileSync(manifest, 'contractor.md\t' + sha + '\n');
    const upgradeOut2 = String(runInstall(h, []) || '');
    assert(!fs.existsSync(stale),
      '#816: install.sh must sweep a previously-installed contractor.md (retired role)');
    assert(upgradeOut2.includes('Removed retired agent'),
      '#816: the sweep must name the removal on stdout, got: ' + upgradeOut2);
    // uninstall path: plant it again (no manifest row needed — RETIRED_AGENTS removes by name).
    fs.writeFileSync(stale, staleBody);
    // spawn-class: environment
    execFileSync('bash', ['uninstall.sh', '--forge=github'],
      { cwd: root, env: { ...process.env, HOME: h }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert(!fs.existsSync(stale),
      '#816: uninstall.sh must remove a previously-installed contractor.md (RETIRED_AGENTS)');
  }

  // #2: opencode install-time parity — install-opencode.sh seeds the shared
  // ~/.config/kaola-workflow/config.json with parallel_mode:'auto' (default-ON parallelism),
  // mirroring the github AC1 assertion. The installer writes parallel_mode only and never an
  // installed_paths field. This locks the opencode seed against drift from the github install.
  {
    const home = freshHome('opencode-parallel'); homes.push(home);
    const target = freshHome('opencode-target'); homes.push(target);
    runOpencodeInstall(home, target);
    const cfg = readConfig(home);
    assert(cfg.parallel_mode === 'auto',
      'OPENCODE: install-opencode.sh must write parallel_mode:auto, got ' + JSON.stringify(cfg));
    assert(!('installed_paths' in cfg),
      'OPENCODE: install-opencode.sh must NOT write installed_paths, got ' + JSON.stringify(cfg));
    assert(!('enable_adaptive' in cfg),
      'OPENCODE: install-opencode.sh must NOT write enable_adaptive field, got ' + JSON.stringify(cfg));
  }

  console.log('Install adaptive-config tests passed');
} finally {
  cleanup();
}
