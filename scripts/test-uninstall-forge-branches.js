#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.


// uninstall.sh must carry a working removal path for EVERY forge the install manifest ships.
// Deleting one forge's removal branch used to leave all four chains green — `bash -n` is
// syntax-only, and a `github|gitlab|gitea|all` text needle matches the ARG-VALIDATION case, which
// says nothing about whether the removal branch still exists. `./uninstall.sh --forge=gitlab` then
// silently no-ops, reports success, and orphans the installed edition.
//
// This guard OBSERVES THE EFFECT instead of reading the shell text: it installs each edition into a
// sandboxed HOME, runs the real uninstaller against a copy of that HOME, and asserts exactly the
// selected edition's directories are gone and the other editions' survived. That structurally
// catches a deleted branch, swapped branch bodies, a branch nested inside another forge's branch, a
// renamed SUPPORT_DIR (the expected directories are derived from what install.sh actually created,
// never hardcoded), and a changed `FORGE` default — none of which a text pin can see reliably.
//
// SAFETY: the uninstaller really deletes directories. Every install/uninstall child runs with HOME
// (and $PWD, which uninstall.sh uses for its project-local Codex cleanup) inside one mkdtemp
// sandbox; `assertSandboxed` refuses to spawn otherwise, `KAOLA_*` env vars are scrubbed so
// `KAOLA_AGENT_DIR` cannot redirect a child at the real home, and a tripwire asserts no top-level
// entry of the developer's real ~/.claude disappeared.
//
// Set KAOLA_UNINSTALL_SH=<path> to point the suite at a mutated copy of uninstall.sh (used to prove
// the assertions actually go red).

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const { FORGES } = require('./kaola-workflow-install-manifest.js');
const UNINSTALL_SH = process.env.KAOLA_UNINSTALL_SH || path.join(root, 'uninstall.sh');
const INSTALL_SH = path.join(root, 'install.sh');
// Removed by the github branch alongside the current support dir; install.sh no longer creates it,
// so it is planted by hand.
const LEGACY_GITHUB_DIRS = ['claude-workflow'];

const SANDBOX = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-uninstall-forge-')));
const REAL_HOME = fs.realpathSync(os.homedir());
const REAL_CLAUDE_DIR = path.join(REAL_HOME, '.claude');
assert(REAL_HOME !== SANDBOX && !REAL_HOME.startsWith(SANDBOX + path.sep),
  `sandbox ${SANDBOX} must not contain the real home ${REAL_HOME}`);

const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const realClaudeBefore = listDir(REAL_CLAUDE_DIR);

// Hard refusal: never hand a child a HOME outside this run's sandbox.
function assertSandboxed(home) {
  const real = fs.realpathSync(home);
  assert(real.startsWith(SANDBOX + path.sep),
    `refusing to run an installer with HOME=${real}: outside the sandbox ${SANDBOX}`);
  assert(real !== REAL_HOME && !REAL_HOME.startsWith(real + path.sep),
    `refusing to run an installer with HOME=${real}: it contains the real home ${REAL_HOME}`);
}

function makeHome(name) {
  const home = path.join(SANDBOX, name);
  fs.mkdirSync(path.join(home, 'cwd'), { recursive: true });
  return home;
}

function childEnv(home) {
  const env = Object.assign({}, process.env);
  for (const key of Object.keys(env)) if (key.startsWith('KAOLA_')) delete env[key];
  env.HOME = home;
  return env;
}

function runScript(script, args, home) {
  assertSandboxed(home);
  // spawn-class: environment
  return spawnSync('bash', [script].concat(args), {
    cwd: path.join(home, 'cwd'), // uninstall.sh's Codex cleanup is $PWD-relative
    env: childEnv(home),
    encoding: 'utf8'
  });
}

try {
  // ---- 1. install each edition into its own sandbox HOME, and DERIVE its footprint -------------
  // The per-edition directory is whatever install.sh created that the other editions did not, so a
  // renamed SUPPORT_DIR moves the expectation with it instead of leaving a stale hardcoded name.
  const installed = {};
  for (const forge of FORGES) {
    const home = makeHome(`install-${forge}`);
    const r = runScript(INSTALL_SH, ['--yes', `--forge=${forge}`, '--no-settings-merge'], home);
    assert.strictEqual(r.status, 0,
      `install.sh --forge=${forge} must succeed, got status=${r.status}\n${r.stderr || ''}`);
    installed[forge] = { home, entries: listDir(path.join(home, '.claude')) };
  }
  const shared = installed[FORGES[0]].entries
    .filter(entry => FORGES.every(forge => installed[forge].entries.includes(entry)));
  const editionDirs = {};
  for (const forge of FORGES) {
    const own = installed[forge].entries.filter(entry => !shared.includes(entry));
    // >= 1, not === 1: the derivable-expectation requirement is that the forge owns at least one
    // distinguishable directory. Pinning the exact count would turn a legitimate future install.sh
    // that creates a second edition-specific dir into a red on the always-run chain, which is a
    // test-design constraint masquerading as a product invariant.
    assert.ok(own.length >= 1,
      `install.sh --forge=${forge} must create at least one edition-specific directory under ` +
      `~/.claude so the uninstall expectation is derivable, found: ${JSON.stringify(own)}`);
    editionDirs[forge] = own.concat(forge === 'github' ? LEGACY_GITHUB_DIRS : []);
  }

  // ---- 2. one template HOME with EVERY edition installed ---------------------------------------
  const template = makeHome('template');
  fs.cpSync(installed[FORGES[0]].home, template, { recursive: true });
  for (const forge of FORGES.slice(1)) {
    for (const dir of editionDirs[forge]) {
      const src = path.join(installed[forge].home, '.claude', dir);
      if (fs.existsSync(src)) fs.cpSync(src, path.join(template, '.claude', dir), { recursive: true });
    }
  }
  for (const dir of LEGACY_GITHUB_DIRS) {
    const planted = path.join(template, '.claude', dir);
    fs.mkdirSync(planted, { recursive: true });
    fs.writeFileSync(path.join(planted, 'marker.txt'), 'legacy install artefact\n');
  }
  for (const forge of FORGES) {
    for (const dir of editionDirs[forge]) {
      assert(listDir(path.join(template, '.claude', dir)).length > 0,
        `template HOME must carry a non-empty ~/.claude/${dir} for ${forge}`);
    }
  }

  // ---- 3. run the real uninstaller per selection and observe what survived ----------------------
  const scenarios = FORGES.map(forge => ({
    label: `--forge=${forge}`, args: [`--forge=${forge}`], status: 0, removes: [forge]
  })).concat([
    { label: '--forge=all', args: ['--forge=all'], status: 0, removes: FORGES.slice() },
    { label: 'bare (FORGE must default to all)', args: [], status: 0, removes: FORGES.slice() },
    { label: '--forge=bogus', args: ['--forge=bogus'], status: 2, removes: [] }
  ]);

  for (const scenario of scenarios) {
    const home = makeHome(`run-${scenario.label.replace(/[^a-z0-9]+/gi, '-')}`);
    fs.rmSync(home, { recursive: true, force: true });
    fs.cpSync(template, home, { recursive: true });
    fs.mkdirSync(path.join(home, 'cwd'), { recursive: true });

    const r = runScript(UNINSTALL_SH, scenario.args, home);
    assert.strictEqual(r.status, scenario.status,
      `./uninstall.sh ${scenario.label} must exit ${scenario.status}, got ${r.status}\n` +
      `${r.stdout || ''}${r.stderr || ''}`);

    for (const forge of FORGES) {
      const removed = scenario.removes.includes(forge);
      for (const dir of editionDirs[forge]) {
        const target = path.join(home, '.claude', dir);
        if (removed) {
          assert(!fs.existsSync(target),
            `./uninstall.sh ${scenario.label} must REMOVE the ${forge} install directory ` +
            `~/.claude/${dir} — it survived, so that edition is orphaned`);
        } else {
          assert(listDir(target).length > 0,
            `./uninstall.sh ${scenario.label} must LEAVE the ${forge} install directory ` +
            `~/.claude/${dir} intact — it was removed or emptied, so an unselected edition was ` +
            'destroyed');
        }
      }
    }
  }

  // ---- 4. cheap text pin: the usage string names every shipped forge ----------------------------
  const usage = /Usage:[^\n]*/.exec(fs.readFileSync(UNINSTALL_SH, 'utf8'));
  assert(usage, 'uninstall.sh must print a `Usage:` line');
  for (const forge of FORGES) {
    assert(usage[0].includes(forge), `uninstall.sh usage string must list ${forge}: ${usage[0]}`);
  }

  // ---- 5. tripwire: the developer's real ~/.claude lost nothing ---------------------------------
  const realClaudeAfter = listDir(REAL_CLAUDE_DIR);
  const vanished = realClaudeBefore.filter(entry => !realClaudeAfter.includes(entry));
  assert.deepStrictEqual(vanished, [],
    `this suite must never touch the real ~/.claude; these entries disappeared: ${vanished.join(', ')}`);

  console.log('Uninstall forge-branch tests passed');
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}
