#!/usr/bin/env node
'use strict';

// issue #227 + #254: install.sh --enable-adaptive switch behavior. The default path (bare
// install, no flag) now writes enable_adaptive:true (adaptive ON by default, issue #254);
// --enable-adaptive=yes explicitly writes enable_adaptive:true; --enable-adaptive=no writes
// enable_adaptive:false (hard opt-out; survives re-install over a stale :true — the
// stale-config trap). Both yes and no paths use read-modify-write, preserving parallel_mode.
// A bad value exits 2.

const assert = require('assert');
const { execFileSync } = require('child_process');
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
function configPath(home) { return path.join(home, '.config', 'kaola-workflow', 'config.json'); }
function readConfig(home) { return JSON.parse(fs.readFileSync(configPath(home), 'utf8')); }

const homes = [];
function cleanup() { for (const h of homes) try { fs.rmSync(h, { recursive: true, force: true }); } catch (_) {} }

try {
  // (a) bare install (no flag) -> config written with enable_adaptive:true AND parallel_mode:auto
  // (adaptive is now the default under issue #254)
  let home = freshHome('noflag'); homes.push(home);
  runInstall(home, []);
  let cfg = readConfig(home);
  assert(cfg.enable_adaptive === true, 'bare install must write enable_adaptive:true, got ' + JSON.stringify(cfg));
  assert(cfg.parallel_mode === 'auto', 'bare install must write parallel_mode:auto, got ' + JSON.stringify(cfg));

  // (b) --enable-adaptive=yes -> config created with enable_adaptive:true AND parallel_mode:auto
  home = freshHome('yes'); homes.push(home);
  runInstall(home, ['--enable-adaptive=yes']);
  cfg = readConfig(home);
  assert(cfg.enable_adaptive === true, '--enable-adaptive=yes must set enable_adaptive:true, got ' + JSON.stringify(cfg));
  assert(cfg.parallel_mode === 'auto', '--enable-adaptive=yes must default parallel_mode:auto, got ' + JSON.stringify(cfg));

  // (c) pre-existing config with parallel_mode:on -> preserved, enable_adaptive added
  home = freshHome('preserve'); homes.push(home);
  fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
  fs.writeFileSync(configPath(home), JSON.stringify({ parallel_mode: 'on' }, null, 2) + '\n');
  runInstall(home, ['--enable-adaptive=yes']);
  cfg = readConfig(home);
  assert(cfg.parallel_mode === 'on', 'read-modify-write must preserve parallel_mode:on, got ' + JSON.stringify(cfg));
  assert(cfg.enable_adaptive === true, 'read-modify-write must add enable_adaptive:true, got ' + JSON.stringify(cfg));

  // (d) --enable-adaptive=no -> config written with enable_adaptive:false (hard opt-out)
  home = freshHome('no'); homes.push(home);
  runInstall(home, ['--enable-adaptive=no']);
  cfg = readConfig(home);
  assert(cfg.enable_adaptive === false, '--enable-adaptive=no must write enable_adaptive:false, got ' + JSON.stringify(cfg));

  // (e) reinstall without the flag does NOT revoke enable_adaptive:true
  // bare install writes true, so a prior true is preserved by the read-modify-write.
  home = freshHome('reinstall'); homes.push(home);
  runInstall(home, ['--enable-adaptive=yes']);
  runInstall(home, []); // second install, no flag (bare writes true — still true)
  cfg = readConfig(home);
  assert(cfg.enable_adaptive === true, 'reinstall without flag must NOT revoke enable_adaptive:true, got ' + JSON.stringify(cfg));

  // (f) bad value -> exit 2
  home = freshHome('bad'); homes.push(home);
  let failed = false;
  try { runInstall(home, ['--enable-adaptive=maybe']); }
  catch (e) { failed = true; assert(e.status === 2, 'bad --enable-adaptive must exit 2, got ' + e.status); }
  assert(failed, '--enable-adaptive=maybe must be rejected');

  // issue #254 case 3: stale-config trap — pre-existing config with enable_adaptive:true,
  // --enable-adaptive=no must overwrite it to false AND preserve other keys (parallel_mode).
  home = freshHome('stale'); homes.push(home);
  fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
  fs.writeFileSync(configPath(home), JSON.stringify({ parallel_mode: 'auto', enable_adaptive: true }, null, 2) + '\n');
  runInstall(home, ['--enable-adaptive=no']);
  cfg = readConfig(home);
  assert(cfg.enable_adaptive === false, 'stale-config trap: --enable-adaptive=no must write false over stale true, got ' + JSON.stringify(cfg));
  assert(cfg.parallel_mode === 'auto', 'stale-config trap: --enable-adaptive=no must preserve parallel_mode:auto, got ' + JSON.stringify(cfg));

  // issue #242: .kaola-agent-models.json manifest — uninstall.sh must remove it.
  // (g) after install then uninstall, manifest is gone.
  {
    home = freshHome('uninstall'); homes.push(home);
    runInstall(home, []);
    const manifestPath = path.join(home, '.claude', 'agents', '.kaola-agent-models.json');
    assert(fs.existsSync(manifestPath), 'manifest must exist after install (prerequisite for uninstall test)');
    execFileSync('bash', ['uninstall.sh', '--forge=github'],
      { cwd: root, env: { ...process.env, HOME: home }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert(!fs.existsSync(manifestPath), 'uninstall.sh must remove .kaola-agent-models.json');
    assert(!fs.existsSync(path.join(home, '.claude', 'agents', 'contractor.md')), 'uninstall.sh must remove contractor.md');
  }

  // issue #242 Part B: contractor agent manifest assertions.
  // contractor must map to sonnet in both default (higher) and --profile=higher installs.
  for (const args of [[], ['--profile=higher']]) {
    const h = freshHome('contractor-' + (args[0] || 'default').replace(/[^a-z]/gi,'')); homes.push(h);
    runInstall(h, args);
    const manifestPath = path.join(h, '.claude', 'agents', '.kaola-agent-models.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(manifest['contractor'] === 'sonnet', 'install ' + JSON.stringify(args) + ' must map contractor→sonnet; got ' + manifest['contractor']);
  }

  console.log('Install adaptive-config tests passed');
} finally {
  cleanup();
}
