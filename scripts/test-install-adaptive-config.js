#!/usr/bin/env node
'use strict';

// issue #227: install.sh --enable-adaptive switch behavior. The default path writes
// NO config (adaptive stays OFF); --enable-adaptive=yes writes enable_adaptive:true
// into ~/.config/kaola-workflow/config.json via read-modify-write, preserving
// parallel_mode; a bad value exits 2.

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
  // (a) no flag -> config absent (adaptive OFF by absence)
  let home = freshHome('noflag'); homes.push(home);
  runInstall(home, []);
  assert(!fs.existsSync(configPath(home)), 'no --enable-adaptive => install must NOT write config.json');

  // (b) --enable-adaptive=yes -> config created with enable_adaptive:true AND parallel_mode:auto
  home = freshHome('yes'); homes.push(home);
  runInstall(home, ['--enable-adaptive=yes']);
  let cfg = readConfig(home);
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

  // (d) --enable-adaptive=no -> config NOT written (default-equivalent)
  home = freshHome('no'); homes.push(home);
  runInstall(home, ['--enable-adaptive=no']);
  assert(!fs.existsSync(configPath(home)), '--enable-adaptive=no must NOT write config.json');

  // (e) reinstall without the flag does NOT clobber an existing enable_adaptive:true
  home = freshHome('reinstall'); homes.push(home);
  runInstall(home, ['--enable-adaptive=yes']);
  runInstall(home, []); // second install, no flag
  cfg = readConfig(home);
  assert(cfg.enable_adaptive === true, 'reinstall without flag must NOT revoke enable_adaptive:true, got ' + JSON.stringify(cfg));

  // (f) bad value -> exit 2
  home = freshHome('bad'); homes.push(home);
  let failed = false;
  try { runInstall(home, ['--enable-adaptive=maybe']); }
  catch (e) { failed = true; assert(e.status === 2, 'bad --enable-adaptive must exit 2, got ' + e.status); }
  assert(failed, '--enable-adaptive=maybe must be rejected');

  console.log('Install adaptive-config tests passed');
} finally {
  cleanup();
}
