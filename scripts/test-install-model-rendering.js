#!/usr/bin/env node
'use strict';
// EVERY child process in this file is boundary class `environment` (ADR 0013): the property
// under test is what an INSTALL / MATERIALIZATION does to a filesystem tree and a synthetic
// HOME. There is no in-process equivalent — the installers are shell scripts, and the node-side
// preflight and doctor probes read the process's own HOME/cwd, so hosting them in the suite
// process would test the suite's environment instead of the fixture's. The annotations are
// per site rather than per file on purpose: the ratchet reads lines, so a site added later
// still has to declare itself.
//
// #1101: Kaola-Workflow ships no subagent profiles and no model bindings, so this suite no longer
// asserts that any are installed, rendered, pinned, manifested or repaired. Where each removed
// meaning went:
//   - role roster / frontmatter model / resolver tier pins, the Claude finalize implementer call
//     card, the Claude manifest columns, the Codex profile pin schema, reviewer-profile contracts,
//     profile byte-parity, managed-block canonical body, profile/config drift repair, layered
//     role overrides, autofix and doctor plugin-cache profile checks -> gone with the roles (the
//     negative is scripts/test-issue-1101-native-only.js);
//   - symlinked profile dir / config refusal -> the scope's .codex is retire-only now: reported,
//     never followed, not refused (#1101 H9) — test-issue-1101-codex-agent-migration.js C12; the
//     HOME write targets (hooks, hook home) still refuse, pinned below;
//   - ambiguous marker pair refused / role table outside the block refused / an unrelated user
//     [agents.*] role kept -> preserved-and-reported, and the user table kept — its C8;
//   - pruneStaleProfiles hash-only removal -> retire by record or released bytes only (H2) — its
//     C7/C9;
//   - profile staging-write safety -> the installer writes no profile; hook writes keep their
//     own staging tests below;
//   - the codex_multi_agent_v2_required refusal and profile-stale preflight statuses -> retired
//     with the roles (the preflight reports host facts; its own suites own that).

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-models-'));
const initialCodexVersion = process.env.KAOLA_CODEX_VERSION;
const codexProfileInstaller = require('../plugins/kaola-workflow/scripts/install-codex-agent-profiles');
const codexPreflight = require('./kaola-workflow-codex-preflight');

const CODEX_FLOOR_ATTESTATION = '0.145.0';
function withCodexVersionAttestation(env = process.env) {
  return { ...env, KAOLA_CODEX_VERSION: CODEX_FLOOR_ATTESTATION };
}

// #1036 R1: this suite must leave the parent environment untouched. Individual child preflight
// invocations that assert properties beyond the version gate opt into the floor attestation via
// withCodexVersionAttestation(); the no-override fixture below deliberately removes it.
assert.strictEqual(process.env.KAOLA_CODEX_VERSION, initialCodexVersion,
  '#1036 R1: the suite must not mutate process.env.KAOLA_CODEX_VERSION globally');

function runCodexInstaller(installerPath, projectRoot, homeRoot) {
  // spawn-class: environment
  return spawnSync(process.execPath, [installerPath, projectRoot], {
    cwd: path.dirname(path.dirname(installerPath)),
    env: { ...process.env, HOME: homeRoot },
    encoding: 'utf8',
  });
}

function trustCodexProject(homeRoot, projectRoot, trustLevel = 'trusted') {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const prefix = existing.length === 0 ? '' : existing.replace(/\s*$/, '\n\n');
  fs.writeFileSync(configPath,
    `${prefix}[projects.${JSON.stringify(path.resolve(projectRoot))}]\n`
    + `trust_level = ${JSON.stringify(trustLevel)}\n`);
}

// Kaola never writes features.multi_agent_v2 itself; a fixture that needs the host setting on
// enables it at the GLOBAL ~/.codex layer, which is sufficient for any project scope (an absent
// project-layer field never resets an explicitly-set value — see deriveEffectiveRuntime).
function enableMultiAgentV2(homeRoot) {
  const configPath = path.join(homeRoot, '.codex', 'config.toml');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  fs.writeFileSync(configPath, '[features.multi_agent_v2]\nenabled = true\n\n' + existing);
}

// Install targets are authority boundaries, not merely output paths. The installer WRITES only
// under HOME (hooks, the stable hook home), so a pre-existing symlink there is refused before any
// read or write through it. The scope's .codex is retire-only since #1101 (reported, never
// followed, not refused) — scripts/test-issue-1101-codex-agent-migration.js C12.
{
  const installerPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts',
    'install-codex-agent-profiles.js');
  const cases = [
    {
      label: 'global hooks symlink',
      prepare(projectRoot, homeRoot, outsideRoot) {
        fs.mkdirSync(path.join(homeRoot, '.codex'), { recursive: true });
        fs.symlinkSync(path.join(outsideRoot, 'sentinel.txt'),
          path.join(homeRoot, '.codex', 'hooks.json'));
      },
    },
    {
      label: 'stable hook home symlink',
      prepare(projectRoot, homeRoot, outsideRoot) {
        fs.mkdirSync(path.join(homeRoot, '.codex'), { recursive: true });
        fs.symlinkSync(outsideRoot, path.join(homeRoot, '.codex', 'kaola-workflow'));
      },
    },
  ];
  for (const fixture of cases) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-safe-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-safe-home-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-safe-outside-'));
    const sentinel = path.join(outsideRoot, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'unchanged\n');
    try {
      fixture.prepare(projectRoot, homeRoot, outsideRoot);
      const before = fs.readdirSync(outsideRoot).sort();
      const result = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.notStrictEqual(result.status, 0,
        fixture.label + ': installer must refuse before target reads or writes');
      assert(/^install_target_unsafe:/m.test(result.stderr),
        fixture.label + ': refusal must use the typed install_target_unsafe status: ' + result.stderr);
      assert.deepStrictEqual(fs.readdirSync(outsideRoot).sort(), before,
        fixture.label + ': installer must not create files through the symlink');
      assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n',
        fixture.label + ': installer must not mutate the external sentinel');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }
}

// Hook references and copies cross an authority boundary: accept only canonical
// hooks/ or scripts/ children, refuse redirected sources/destinations, and keep
// both the prior stable tree and hooks.json byte-identical on any staged failure.
{
  const pluginToken = '__KW_PLUGIN_ROOT__';
  function hookTemplate(relPaths) {
    return JSON.stringify({
      hooks: {
        SessionStart: [{
          id: 'kaola-workflow:test-hook-copy',
          hooks: relPaths.map(rel => ({
            type: 'command',
            command: `node "${pluginToken}/${rel}"`,
          })),
        }],
      },
    }, null, 2) + '\n';
  }

  function treeSnapshot(dir) {
    const rows = [];
    function visit(current, relative) {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const child = path.join(current, entry.name);
        const rel = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) {
          rows.push(['symlink', rel, fs.readlinkSync(child)]);
        } else if (entry.isDirectory()) {
          rows.push(['directory', rel]);
          visit(child, rel);
        } else {
          rows.push(['file', rel, fs.readFileSync(child).toString('base64')]);
        }
      }
    }
    visit(dir, '');
    return rows;
  }

  for (const description of ['user-owned hook file', null]) {
    const merged = codexProfileInstaller.mergeHooks({
      description,
      hooks: {
        SessionStart: [{ id: 'user:keep', hooks: [] }],
      },
    }, { hooks: {} });
    assert(Object.prototype.hasOwnProperty.call(merged, 'description'),
      'a present HooksFile description must survive the managed-hook merge');
    assert.strictEqual(merged.description, description,
      'the managed-hook merge must preserve a string/null HooksFile description exactly');
  }

  assert.deepStrictEqual(codexProfileInstaller.hookReferencedRelPaths(
    hookTemplate(['scripts/tool.js', 'hooks/check.sh', 'scripts/tool.js'])),
  ['hooks/check.sh', 'scripts/tool.js'],
  'canonical hook/script children are sorted and de-duplicated');

  const invalidReferences = [
    ['empty', ''],
    ['absolute', '/tmp/escape.js'],
    ['dot', '.'],
    ['dotdot', '../escape.js'],
    ['nested dotdot', 'hooks/../escape.js'],
    ['backslash', 'hooks\\escape.js'],
    ['Windows absolute', 'C:/escape.js'],
    ['repeated separator', 'hooks//escape.js'],
    ['nested dot', 'scripts/./escape.js'],
    ['unmanaged root', 'agents/escape.js'],
  ];
  for (const [label, rel] of invalidReferences) {
    assert.throws(() => codexProfileInstaller.hookReferencedRelPaths(hookTemplate([rel])),
      /hook reference/i, label + ' hook reference must be rejected');
  }

  const boundaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-hook-boundary-'));
  try {
    const sourceRoot = path.join(boundaryRoot, 'plugin');
    const stableDir = path.join(boundaryRoot, 'stable');
    const outsideDir = path.join(boundaryRoot, 'outside');
    fs.mkdirSync(path.join(sourceRoot, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(stableDir, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(stableDir, 'scripts'), { recursive: true });
    fs.mkdirSync(outsideDir);
    fs.writeFileSync(path.join(stableDir, 'hooks', 'old.sh'), 'old hook\n');
    fs.writeFileSync(path.join(stableDir, 'scripts', 'old.js'), 'old script\n');
    fs.writeFileSync(path.join(sourceRoot, 'hooks', 'good.sh'), 'new hook\n');
    fs.writeFileSync(path.join(outsideDir, 'source.sh'), 'outside source\n');
    const before = treeSnapshot(stableDir);

    assert.throws(() => codexProfileInstaller.copyHookScripts(
      stableDir, ['../outside.js'], sourceRoot), /hook reference/i,
    'direct copy rejects a destination escape before sweeping live files');
    assert.deepStrictEqual(treeSnapshot(stableDir), before,
      'invalid direct copy leaves the prior stable tree unchanged');

    fs.symlinkSync(path.join(outsideDir, 'source.sh'), path.join(sourceRoot, 'hooks', 'link.sh'));
    assert.throws(() => codexProfileInstaller.copyHookScripts(
      stableDir, ['hooks/link.sh'], sourceRoot), /symlink/i,
    'source symlink is not a managed hook source');
    assert.deepStrictEqual(treeSnapshot(stableDir), before,
      'source symlink refusal leaves the prior stable tree unchanged');

    fs.rmSync(path.join(stableDir, 'hooks'), { recursive: true, force: true });
    fs.symlinkSync(outsideDir, path.join(stableDir, 'hooks'));
    const outsideBefore = treeSnapshot(outsideDir);
    assert.throws(() => codexProfileInstaller.copyHookScripts(
      stableDir, ['hooks/good.sh'], sourceRoot), /symlink/i,
    'symlinked destination component is refused');
    assert.deepStrictEqual(treeSnapshot(outsideDir), outsideBefore,
      'destination refusal never writes through the symlink');
  } finally {
    fs.rmSync(boundaryRoot, { recursive: true, force: true });
  }

  function withHookUpdateFixture(label, priorHooks, callback) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kaola-hook-owned-${label}-`));
    const fixturePlugin = path.join(fixtureRoot, 'plugin');
    const fixtureHome = path.join(fixtureRoot, 'home');
    const fixtureInstallerPath = path.join(fixturePlugin, 'scripts',
      'install-codex-agent-profiles.js');
    const stableDir = path.join(fixtureHome, '.codex', 'kaola-workflow');
    const hooksPath = path.join(fixtureHome, '.codex', 'hooks.json');
    const previousHome = process.env.HOME;
    const originalWarn = console.warn;
    let fixtureInstaller;
    try {
      fs.mkdirSync(path.dirname(fixtureInstallerPath), { recursive: true });
      fs.mkdirSync(path.join(fixturePlugin, 'config'), { recursive: true });
      fs.mkdirSync(path.join(fixturePlugin, 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(stableDir, 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(stableDir, 'scripts'), { recursive: true });
      fs.copyFileSync(path.join(root, 'plugins', 'kaola-workflow', 'scripts',
        'install-codex-agent-profiles.js'), fixtureInstallerPath);
      fs.copyFileSync(path.join(root, 'plugins', 'kaola-workflow', 'scripts',
        'kaola-workflow-adaptive-schema.js'),
        path.join(fixturePlugin, 'scripts', 'kaola-workflow-adaptive-schema.js'));
      fs.writeFileSync(path.join(fixturePlugin, 'config', 'hooks.json'),
        hookTemplate(['hooks/first.sh']));
      fs.writeFileSync(path.join(fixturePlugin, 'hooks', 'first.sh'), 'replacement hook\n');
      fs.writeFileSync(path.join(stableDir, 'hooks', 'old.sh'), 'old hook\n');
      fs.writeFileSync(path.join(stableDir, 'scripts', 'old.js'), 'old script\n');
      fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
      fs.writeFileSync(hooksPath, priorHooks);
      process.env.HOME = fixtureHome;
      console.warn = () => {};
      fixtureInstaller = require(fixtureInstallerPath);
      callback({ fixtureInstaller, fixtureRoot, stableDir, hooksPath });
    } finally {
      console.warn = originalWarn;
      if (fixtureInstaller) delete require.cache[require.resolve(fixtureInstallerPath)];
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }

  for (const description of ['keep this description', null]) {
    const prior = JSON.stringify({
      description,
      hooks: { SessionStart: [{ id: 'user:keep', hooks: [] }] },
    }) + '\n';
    withHookUpdateFixture(description === null ? 'null-description' : 'string-description', prior,
      ({ fixtureInstaller, hooksPath }) => {
        fixtureInstaller.updateHooks();
        const installed = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
        assert(Object.prototype.hasOwnProperty.call(installed, 'description'),
          'a valid present HooksFile description must survive updateHooks');
        assert.strictEqual(installed.description, description,
          'updateHooks must preserve the exact string/null description value');
      });
  }

  function makeStableOwnershipFixture(label) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kaola-stable-owned-${label}-`));
    const sourceRoot = path.join(fixtureRoot, 'plugin');
    const stableDir = path.join(fixtureRoot, 'stable');
    fs.mkdirSync(path.join(sourceRoot, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(stableDir, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(stableDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'hooks', 'first.sh'), 'new hook\n');
    fs.writeFileSync(path.join(sourceRoot, 'scripts', 'second.js'), 'new script\n');
    fs.writeFileSync(path.join(stableDir, 'hooks', 'old.sh'), 'old hook\n');
    fs.writeFileSync(path.join(stableDir, 'scripts', 'old.js'), 'old script\n');
    return { fixtureRoot, sourceRoot, stableDir };
  }

  for (const kind of ['stage', 'backup']) {
    const fixture = makeStableOwnershipFixture(`${kind}-collision`);
    const originalMkdirSync = fs.mkdirSync;
    let collisionPath = null;
    try {
      fs.mkdirSync = function injectStableCollision(candidate, ...args) {
        const target = String(candidate);
        if (!collisionPath && target.includes(`.kaola-hooks-${kind}-`)) {
          originalMkdirSync.call(fs, candidate, ...args);
          fs.writeFileSync(path.join(target, 'foreign.txt'), 'foreign collision\n');
          collisionPath = target;
          const error = new Error('fixture exclusive-directory collision');
          error.code = 'EEXIST';
          throw error;
        }
        return originalMkdirSync.call(fs, candidate, ...args);
      };

      codexProfileInstaller.copyHookScripts(fixture.stableDir,
        ['hooks/first.sh', 'scripts/second.js'], fixture.sourceRoot);

      assert(collisionPath, `${kind} fixture must inject an exclusive-path collision`);
      assert.strictEqual(fs.readFileSync(path.join(collisionPath, 'foreign.txt'), 'utf8'),
        'foreign collision\n', `${kind} collision bytes must remain untouched`);
      assert.strictEqual(fs.readFileSync(path.join(fixture.stableDir, 'hooks', 'first.sh'), 'utf8'),
        'new hook\n', `${kind} collision must retry a fresh random path`);
    } finally {
      fs.mkdirSync = originalMkdirSync;
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = makeStableOwnershipFixture('backup-child-after-create');
    const originalMkdirSync = fs.mkdirSync;
    let collisionRoot = null;
    try {
      fs.mkdirSync = function injectBackupChildAfterCreate(candidate, ...args) {
        const result = originalMkdirSync.call(fs, candidate, ...args);
        const target = String(candidate);
        if (!collisionRoot && target.includes('.kaola-hooks-backup-')) {
          const child = path.join(target, 'active');
          originalMkdirSync.call(fs, child);
          fs.writeFileSync(path.join(child, 'foreign.txt'), 'foreign backup child\n');
          collisionRoot = target;
        }
        return result;
      };

      codexProfileInstaller.copyHookScripts(fixture.stableDir,
        ['hooks/first.sh', 'scripts/second.js'], fixture.sourceRoot);

      assert(collisionRoot, 'backup fixture must insert a child after exclusive root creation');
      assert.strictEqual(fs.readFileSync(
        path.join(collisionRoot, 'active', 'foreign.txt'), 'utf8'),
      'foreign backup child\n',
      'a post-create backup collision must remain untouched while a fresh root is selected');
      assert.strictEqual(fs.readFileSync(path.join(fixture.stableDir, 'hooks', 'first.sh'), 'utf8'),
        'new hook\n', 'post-create backup collision must not block a fresh reservation');
    } finally {
      fs.mkdirSync = originalMkdirSync;
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = makeStableOwnershipFixture('stage-replaced-before-promote');
    const originalRenameSync = fs.renameSync;
    let replacementStage = null;
    try {
      fs.renameSync = function replaceStableStage(source, target) {
        if (!replacementStage && String(source).includes('.kaola-hooks-stage-')
            && path.resolve(String(target)) === path.resolve(path.join(fixture.stableDir, 'hooks'))) {
          fs.rmSync(source, { recursive: true, force: true });
          fs.mkdirSync(source);
          fs.writeFileSync(path.join(source, 'foreign.txt'), 'foreign stage replacement\n');
          replacementStage = String(source);
          throw new Error('fixture stage promotion failure');
        }
        return originalRenameSync.call(fs, source, target);
      };

      assert.throws(() => codexProfileInstaller.copyHookScripts(fixture.stableDir,
        ['hooks/first.sh', 'scripts/second.js'], fixture.sourceRoot),
      /fixture stage promotion failure/,
      'a replaced stage must fail closed');
      assert.strictEqual(fs.readFileSync(path.join(replacementStage, 'foreign.txt'), 'utf8'),
        'foreign stage replacement\n', 'rollback must not delete a replacement stage inode');
      assert.strictEqual(fs.readFileSync(path.join(fixture.stableDir, 'hooks', 'old.sh'), 'utf8'),
        'old hook\n', 'the prior stable hook tree must be restored');
    } finally {
      fs.renameSync = originalRenameSync;
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = makeStableOwnershipFixture('live-replaced-after-promote');
    const originalRenameSync = fs.renameSync;
    let injected = false;
    try {
      fs.renameSync = function replacePromotedStable(source, target) {
        const result = originalRenameSync.call(fs, source, target);
        if (!injected && String(source).includes('.kaola-hooks-stage-')
            && path.resolve(String(target)) === path.resolve(path.join(fixture.stableDir, 'hooks'))) {
          fs.rmSync(target, { recursive: true, force: true });
          fs.mkdirSync(target);
          fs.writeFileSync(path.join(target, 'foreign.txt'), 'foreign live replacement\n');
          injected = true;
        }
        return result;
      };

      assert.throws(() => codexProfileInstaller.copyHookScripts(fixture.stableDir,
        ['hooks/first.sh', 'scripts/second.js'], fixture.sourceRoot),
      /changed during stage promotion|no longer owned/,
      'a live path replaced immediately after promotion must fail closed');
      assert.strictEqual(fs.readFileSync(path.join(fixture.stableDir, 'hooks', 'foreign.txt'), 'utf8'),
        'foreign live replacement\n', 'rollback must not delete an unowned live directory');
      const backupRoots = fs.readdirSync(fixture.stableDir)
        .filter(name => name.includes('.kaola-hooks-backup-'));
      assert(backupRoots.some(name => fs.existsSync(
        path.join(fixture.stableDir, name, 'active', 'old.sh'))),
      'the owned backup with the prior bytes must remain recoverable when live ownership is lost');
    } finally {
      fs.renameSync = originalRenameSync;
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    }
  }

  withHookUpdateFixture('file-backup-collision',
    '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n',
    ({ fixtureInstaller, hooksPath }) => {
      const originalLinkSync = fs.linkSync;
      let collisionPath = null;
      try {
        fs.linkSync = function injectFileBackupCollision(source, target) {
          if (!collisionPath && String(target).includes('.kaola-backup-')) {
            fs.writeFileSync(target, 'foreign backup collision\n');
            collisionPath = String(target);
            const error = new Error('fixture hard-link collision');
            error.code = 'EEXIST';
            throw error;
          }
          return originalLinkSync.call(fs, source, target);
        };
        fixtureInstaller.updateHooks();
        assert(collisionPath, 'hooks.json backup fixture must inject a collision');
        assert.strictEqual(fs.readFileSync(collisionPath, 'utf8'), 'foreign backup collision\n',
          'an atomic backup collision must survive while a fresh random candidate is retried');
        assert.notStrictEqual(fs.readFileSync(hooksPath, 'utf8'),
          '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n');
      } finally {
        fs.linkSync = originalLinkSync;
      }
    });

  withHookUpdateFixture('file-stage-collision',
    '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n',
    ({ fixtureInstaller, hooksPath }) => {
      const originalOpenSync = fs.openSync;
      let collisionPath = null;
      try {
        fs.openSync = function injectHookFileStageCollision(target, ...args) {
          const candidate = String(target);
          if (!collisionPath && candidate.includes('hooks.json.kaola-stage-')) {
            const descriptor = originalOpenSync.call(fs, target, 'wx', 0o600);
            fs.writeFileSync(descriptor, 'foreign stage collision\n');
            fs.closeSync(descriptor);
            collisionPath = candidate;
            const error = new Error('fixture exclusive-file collision');
            error.code = 'EEXIST';
            throw error;
          }
          return originalOpenSync.call(fs, target, ...args);
        };
        fixtureInstaller.updateHooks();
        assert(collisionPath, 'hooks.json stage fixture must inject an exclusive-file collision');
        assert.strictEqual(fs.readFileSync(collisionPath, 'utf8'), 'foreign stage collision\n',
          'a hooks.json stage collision must survive while a fresh random candidate is retried');
        assert.notStrictEqual(fs.readFileSync(hooksPath, 'utf8'),
          '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n');
      } finally {
        fs.openSync = originalOpenSync;
      }
    });

  withHookUpdateFixture('file-backup-replaced-after-create',
    '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n',
    ({ fixtureInstaller, stableDir, hooksPath }) => {
      const originalLinkSync = fs.linkSync;
      const priorHooks = fs.readFileSync(hooksPath, 'utf8');
      const stableBefore = treeSnapshot(stableDir);
      let replacementPath = null;
      try {
        fs.linkSync = function replaceHookFileBackupAfterCreate(source, target) {
          const result = originalLinkSync.call(fs, source, target);
          if (!replacementPath && String(target).includes('.kaola-backup-')) {
            fs.unlinkSync(target);
            fs.writeFileSync(target, 'foreign backup replacement\n');
            replacementPath = String(target);
          }
          return result;
        };
        assert.throws(() => fixtureInstaller.updateHooks(), /hook_refresh_failed/,
          'a backup replaced after exclusive creation must fail closed');
        assert.strictEqual(fs.readFileSync(replacementPath, 'utf8'),
          'foreign backup replacement\n',
        'backup validation must not delete a replacement inode it does not own');
        assert.strictEqual(fs.readFileSync(hooksPath, 'utf8'), priorHooks,
          'backup replacement refusal preserves the original live hooks.json bytes');
        assert.deepStrictEqual(treeSnapshot(stableDir), stableBefore,
          'backup replacement refusal leaves the stable hook tree unchanged');
      } finally {
        fs.linkSync = originalLinkSync;
      }
    });

  withHookUpdateFixture('file-stage-replaced',
    '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n',
    ({ fixtureInstaller, stableDir, hooksPath }) => {
      const originalRenameSync = fs.renameSync;
      const priorHooks = fs.readFileSync(hooksPath, 'utf8');
      const stableBefore = treeSnapshot(stableDir);
      let replacementStage = null;
      try {
        fs.renameSync = function replaceHookFileStage(source, target) {
          if (!replacementStage && String(source).includes('hooks.json.kaola-stage-')
              && path.resolve(String(target)) === path.resolve(hooksPath)) {
            fs.unlinkSync(source);
            fs.writeFileSync(source, 'foreign hook stage\n');
            replacementStage = String(source);
            throw new Error('fixture hook-file promotion failure');
          }
          return originalRenameSync.call(fs, source, target);
        };
        assert.throws(() => fixtureInstaller.updateHooks(), /hook_refresh_failed/,
          'a replaced hooks.json stage must fail closed');
        assert.strictEqual(fs.readFileSync(replacementStage, 'utf8'), 'foreign hook stage\n',
          'hooks.json cleanup must not delete a replacement stage inode');
        assert.strictEqual(fs.readFileSync(hooksPath, 'utf8'), priorHooks,
          'a pre-promotion hooks.json failure preserves the prior live bytes');
        assert.deepStrictEqual(treeSnapshot(stableDir), stableBefore,
          'a hooks.json promotion failure rolls back the stable hook tree');
      } finally {
        fs.renameSync = originalRenameSync;
      }
    });

  withHookUpdateFixture('file-live-replaced',
    '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n',
    ({ fixtureInstaller, stableDir, hooksPath }) => {
      const originalRenameSync = fs.renameSync;
      const stableBefore = treeSnapshot(stableDir);
      let injected = false;
      try {
        fs.renameSync = function replacePromotedHookFile(source, target) {
          const result = originalRenameSync.call(fs, source, target);
          if (!injected && String(source).includes('hooks.json.kaola-stage-')
              && path.resolve(String(target)) === path.resolve(hooksPath)) {
            fs.unlinkSync(target);
            fs.writeFileSync(target, 'foreign live hooks\n');
            injected = true;
          }
          return result;
        };
        assert.throws(() => fixtureInstaller.updateHooks(), /hook_refresh_failed/,
          'a hooks.json path replaced after promotion must fail closed');
        assert.strictEqual(fs.readFileSync(hooksPath, 'utf8'), 'foreign live hooks\n',
          'rollback must preserve an unowned live hooks.json inode');
        const backup = fs.readdirSync(path.dirname(hooksPath))
          .find(name => name.startsWith('hooks.json.kaola-backup-'));
        assert(backup, 'the prior hooks.json backup remains recoverable when live ownership is lost');
        assert.strictEqual(fs.readFileSync(path.join(path.dirname(hooksPath), backup), 'utf8'),
          '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n');
        assert.deepStrictEqual(treeSnapshot(stableDir), stableBefore,
          'lost hooks.json ownership still rolls the stable hook tree back safely');
      } finally {
        fs.renameSync = originalRenameSync;
      }
    });

  // #1108: the owned hooks.json backup is a hard link, so promoting the stage drops its link
  // count and advances its ctime. A successful update must still remove it; a backup that is no
  // longer the owned original must still survive, and rollback must still restore from it.
  {
    const priorHooks = '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n';
    const hookSiblings = hooksPath => fs.readdirSync(path.dirname(hooksPath))
      .filter(name => name.startsWith('hooks.json.kaola-')).sort();
    const isPromotion = (source, target, hooksPath) =>
      String(source).includes('hooks.json.kaola-stage-')
      && path.resolve(String(target)) === path.resolve(hooksPath);

    withHookUpdateFixture('issue-1108-success-leaves-no-backup', priorHooks,
      ({ fixtureInstaller, hooksPath }) => {
        assert.strictEqual(fixtureInstaller.updateHooks().status, 'updated',
          '#1108 fixture must update an existing hooks.json');
        assert.notStrictEqual(fs.readFileSync(hooksPath, 'utf8'), priorHooks);
        assert.deepStrictEqual(hookSiblings(hooksPath), [],
          '#1108: a successful hooks.json update must not leave a .kaola-backup-* file behind');
        assert.strictEqual(fixtureInstaller.updateHooks().status, 'unchanged');
        assert.deepStrictEqual(hookSiblings(hooksPath), [],
          '#1108: an unchanged hooks.json refresh leaves no sibling behind');
      });

    withHookUpdateFixture('issue-1108-backup-replaced-after-promotion', priorHooks,
      ({ fixtureInstaller, hooksPath }) => {
        const originalRenameSync = fs.renameSync;
        let replacedBackup = null;
        try {
          fs.renameSync = function replaceBackupAfterPromotion(source, target) {
            const result = originalRenameSync.call(fs, source, target);
            if (!replacedBackup && isPromotion(source, target, hooksPath)) {
              replacedBackup = path.join(path.dirname(hooksPath), hookSiblings(hooksPath)
                .find(name => name.startsWith('hooks.json.kaola-backup-')));
              fs.unlinkSync(replacedBackup);
              fs.writeFileSync(replacedBackup, 'foreign backup after promotion\n');
            }
            return result;
          };
          assert.strictEqual(fixtureInstaller.updateHooks().status, 'updated');
          assert(replacedBackup, '#1108 fixture must replace the backup after promotion');
          assert.strictEqual(fs.readFileSync(replacedBackup, 'utf8'),
            'foreign backup after promotion\n',
          '#1108: success cleanup must not delete a replacement backup inode it does not own');
        } finally {
          fs.renameSync = originalRenameSync;
        }
      });

    withHookUpdateFixture('issue-1108-backup-rewritten-after-promotion', priorHooks,
      ({ fixtureInstaller, hooksPath }) => {
        const originalRenameSync = fs.renameSync;
        // Same length and a whole-second mtime restored exactly: only the byte check can refuse.
        const tampered = priorHooks.replace('user:keep', 'user:edit');
        const pinnedTime = 1700000000;
        fs.utimesSync(hooksPath, pinnedTime, pinnedTime);
        let rewrittenBackup = null;
        try {
          fs.renameSync = function rewriteBackupAfterPromotion(source, target) {
            const result = originalRenameSync.call(fs, source, target);
            if (!rewrittenBackup && isPromotion(source, target, hooksPath)) {
              rewrittenBackup = path.join(path.dirname(hooksPath), hookSiblings(hooksPath)
                .find(name => name.startsWith('hooks.json.kaola-backup-')));
              fs.writeFileSync(rewrittenBackup, tampered);
              fs.utimesSync(rewrittenBackup, pinnedTime, pinnedTime);
            }
            return result;
          };
          assert.strictEqual(fixtureInstaller.updateHooks().status, 'updated');
          assert(rewrittenBackup, '#1108 fixture must rewrite the backup in place');
          assert.strictEqual(fs.readFileSync(rewrittenBackup, 'utf8'), tampered,
            '#1108: success cleanup must not delete a backup whose bytes are no longer the original');
        } finally {
          fs.renameSync = originalRenameSync;
        }
      });

    withHookUpdateFixture('issue-1108-rollback-after-promotion', priorHooks,
      ({ fixtureInstaller, stableDir, hooksPath }) => {
        const originalRenameSync = fs.renameSync;
        const stableBefore = treeSnapshot(stableDir);
        let injected = false;
        try {
          fs.renameSync = function reinodeLiveAfterPromotion(source, target) {
            const result = originalRenameSync.call(fs, source, target);
            if (!injected && isPromotion(source, target, hooksPath)) {
              const promoted = fs.readFileSync(target);
              fs.unlinkSync(target);
              fs.writeFileSync(target, promoted);
              injected = true;
            }
            return result;
          };
          assert.throws(() => fixtureInstaller.updateHooks(), /hook_refresh_failed/,
            '#1108 fixture must fail after promotion');
          assert(injected);
          assert.strictEqual(fs.readFileSync(hooksPath, 'utf8'), priorHooks,
            '#1108: a post-promotion failure still restores hooks.json from the owned backup');
          assert.deepStrictEqual(hookSiblings(hooksPath), [],
            '#1108: the restored backup is consumed, not duplicated');
          assert.deepStrictEqual(treeSnapshot(stableDir), stableBefore);
        } finally {
          fs.renameSync = originalRenameSync;
        }
      });
  }

  function assertAtomicUpdate(label, injectCopyFailure) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-hook-atomic-'));
    const fixturePlugin = path.join(fixtureRoot, 'plugin');
    const fixtureHome = path.join(fixtureRoot, 'home');
    const fixtureInstallerPath = path.join(fixturePlugin, 'scripts',
      'install-codex-agent-profiles.js');
    const stableDir = path.join(fixtureHome, '.codex', 'kaola-workflow');
    const hooksPath = path.join(fixtureHome, '.codex', 'hooks.json');
    const previousHome = process.env.HOME;
    const originalOpenSync = fs.openSync;
    const originalWarn = console.warn;
    let fixtureInstaller;
    try {
      fs.mkdirSync(path.dirname(fixtureInstallerPath), { recursive: true });
      fs.mkdirSync(path.join(fixturePlugin, 'config'), { recursive: true });
      fs.mkdirSync(path.join(fixturePlugin, 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(stableDir, 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(stableDir, 'scripts'), { recursive: true });
      fs.copyFileSync(path.join(root, 'plugins', 'kaola-workflow', 'scripts',
        'install-codex-agent-profiles.js'), fixtureInstallerPath);
      fs.copyFileSync(path.join(root, 'plugins', 'kaola-workflow', 'scripts',
        'kaola-workflow-adaptive-schema.js'),
        path.join(fixturePlugin, 'scripts', 'kaola-workflow-adaptive-schema.js'));
      fs.writeFileSync(path.join(fixturePlugin, 'config', 'hooks.json'),
        hookTemplate(['hooks/first.sh', 'scripts/second.js']));
      fs.writeFileSync(path.join(fixturePlugin, 'hooks', 'first.sh'), 'first replacement\n');
      if (injectCopyFailure) {
        fs.mkdirSync(path.join(fixturePlugin, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(fixturePlugin, 'scripts', 'second.js'), 'second replacement\n');
      }
      fs.writeFileSync(path.join(stableDir, 'hooks', 'old.sh'), 'old hook\n');
      fs.writeFileSync(path.join(stableDir, 'scripts', 'old.js'), 'old script\n');
      const priorHooks = '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n';
      fs.writeFileSync(hooksPath, priorHooks);
      const stableBefore = treeSnapshot(stableDir);

      process.env.HOME = fixtureHome;
      fixtureInstaller = require(fixtureInstallerPath);
      console.warn = () => {};
      if (injectCopyFailure) {
        fs.openSync = function injectedHookCopyFailure(file, ...args) {
          if (String(file).startsWith(stableDir) && String(file).includes('second.js')) {
            const error = new Error('simulated staged hook copy failure');
            error.code = 'EIO';
            throw error;
          }
          return originalOpenSync.call(fs, file, ...args);
        };
      }
      assert.throws(() => fixtureInstaller.updateHooks(), /hook_refresh_failed/i,
        label + ': hook refresh failure must propagate');
      fs.openSync = originalOpenSync;

      assert.deepStrictEqual(treeSnapshot(stableDir), stableBefore,
        label + ': prior stable hook set is restored byte-for-byte');
      assert.strictEqual(fs.readFileSync(hooksPath, 'utf8'), priorHooks,
        label + ': prior hooks.json is preserved byte-for-byte');
    } finally {
      fs.openSync = originalOpenSync;
      console.warn = originalWarn;
      if (fixtureInstaller) delete require.cache[require.resolve(fixtureInstallerPath)];
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }

  assertAtomicUpdate('missing later source', false);
  assertAtomicUpdate('staged copy failure', true);

  function assertInstallerHookFailureAtomic(label, priorHooks, injectCopyFailure, expectedReason) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-hook-install-failure-'));
    const projectRoot = path.join(fixtureRoot, 'project');
    const homeRoot = path.join(fixtureRoot, 'home');
    const stableDir = path.join(homeRoot, '.codex', 'kaola-workflow');
    const hooksPath = path.join(homeRoot, '.codex', 'hooks.json');
    const installerPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts',
      'install-codex-agent-profiles.js');
    try {
      fs.mkdirSync(projectRoot);
      fs.mkdirSync(path.join(stableDir, 'hooks'), { recursive: true });
      fs.mkdirSync(path.join(stableDir, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(stableDir, 'hooks', 'old.sh'), 'old hook\n');
      fs.writeFileSync(path.join(stableDir, 'scripts', 'old.js'), 'old script\n');
      fs.writeFileSync(hooksPath, priorHooks);
      const stableBefore = treeSnapshot(stableDir);
      const env = { ...process.env, HOME: homeRoot };

      if (injectCopyFailure) {
        const preloadPath = path.join(fixtureRoot, 'fail-hook-stage.js');
        fs.writeFileSync(preloadPath, [
          "'use strict';",
          "const fs = require('fs');",
          'const originalOpenSync = fs.openSync;',
          'fs.openSync = function failManagedHookStage(file, ...args) {',
          '  const target = String(file);',
          '  if (target.startsWith(process.env.KAOLA_TEST_HOOK_STABLE_DIR)',
          "      && target.endsWith('kaola-workflow-codex-compact-recovery.md')) {",
          "    const error = new Error('simulated installer hook refresh failure');",
          "    error.code = 'EIO';",
          '    throw error;',
          '  }',
          '  return originalOpenSync.call(fs, file, ...args);',
          '};',
          '',
        ].join('\n'));
        env.NODE_OPTIONS = `--require=${preloadPath}`;
        env.KAOLA_TEST_HOOK_STABLE_DIR = stableDir;
      }

      // spawn-class: environment
      const result = spawnSync(process.execPath, [installerPath, projectRoot], {
        cwd: path.join(root, 'plugins', 'kaola-workflow'),
        env,
        encoding: 'utf8',
      });
      assert.notStrictEqual(result.status, 0,
        label + ': installer must fail closed: ' + result.stdout + result.stderr);
      assert(/hook_refresh_failed/i.test(result.stderr),
        label + ': installer failure names hook_refresh_failed: ' + result.stderr);
      if (expectedReason) {
        assert(expectedReason.test(result.stderr),
          label + ': installer failure must identify the refusal reason: ' + result.stderr);
      }
      assert(!/status: ok/.test(result.stdout), label + ': installer must not print success');
      assert.strictEqual(fs.readFileSync(hooksPath, 'utf8'), priorHooks,
        label + ': prior hooks.json bytes survive failed install');
      assert.deepStrictEqual(treeSnapshot(stableDir), stableBefore,
        label + ': prior stable hook set survives failed install');
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }

  assertInstallerHookFailureAtomic('malformed existing hooks', '{ malformed hooks\n', false,
    /malformed existing hooks\.json/i);
  const invalidExistingHookSchemas = [
    ['top-level array', '[]\n'],
    ['top-level null', 'null\n'],
    ['top-level string', '"user data"\n'],
    ['top-level number', '42\n'],
    ['top-level boolean', 'true\n'],
    ['array hooks container', '{"hooks":[]}\n'],
    ['string hooks container', '{"hooks":"user data"}\n'],
    ['null hooks container', '{"hooks":null}\n'],
    ['number hooks container', '{"hooks":42}\n'],
    ['boolean hooks container', '{"hooks":false}\n'],
    ['numeric top-level description', '{"description":1,"hooks":{}}\n'],
    ['boolean top-level description', '{"description":false,"hooks":{}}\n'],
    ['array top-level description', '{"description":[],"hooks":{}}\n'],
    ['object top-level description', '{"description":{},"hooks":{}}\n'],
    ['null event container', '{"hooks":{"SessionStart":null}}\n'],
    ['false event container', '{"hooks":{"SessionStart":false}}\n'],
    ['zero event container', '{"hooks":{"SessionStart":0}}\n'],
    ['empty-string event container', '{"hooks":{"SessionStart":""}}\n'],
    ['object event container', '{"hooks":{"SessionStart":{}}}\n'],
    ['null matcher group', '{"hooks":{"SessionStart":[null]}}\n'],
    ['array matcher group', '{"hooks":{"SessionStart":[[]]}}\n'],
    ['string matcher group', '{"hooks":{"SessionStart":["user data"]}}\n'],
    ['numeric matcher', '{"hooks":{"SessionStart":[{"matcher":1,"hooks":[]}]}}\n'],
    ['numeric managed id', '{"hooks":{"SessionStart":[{"id":1,"hooks":[]}]}}\n'],
    ['null handler container', '{"hooks":{"SessionStart":[{"hooks":null}]}}\n'],
    ['object handler container', '{"hooks":{"SessionStart":[{"hooks":{}}]}}\n'],
    ['null handler entry', '{"hooks":{"SessionStart":[{"hooks":[null]}]}}\n'],
    ['array handler entry', '{"hooks":{"SessionStart":[{"hooks":[[]]}]}}\n'],
    ['missing handler type', '{"hooks":{"SessionStart":[{"hooks":[{"command":"true"}]}]}}\n'],
    ['unknown handler type', '{"hooks":{"SessionStart":[{"hooks":[{"type":"other"}]}]}}\n'],
    ['command handler missing command', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command"}]}]}}\n'],
    ['command handler non-string command', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":1}]}]}}\n'],
    ['command handler negative timeout', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"true","timeout":-1}]}]}}\n'],
    ['command handler fractional timeout', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"true","timeout":1.5}]}]}}\n'],
    ['command handler non-boolean async', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"true","async":"yes"}]}]}}\n'],
    ['command handler non-string status', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"true","statusMessage":1}]}]}}\n'],
    ['command handler duplicate Windows aliases', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"true","commandWindows":"one","command_windows":"two"}]}]}}\n'],
    ['command handler duplicate null Windows aliases', '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"true","commandWindows":null,"command_windows":null}]}]}}\n'],
  ];
  for (const [label, priorHooks] of invalidExistingHookSchemas) {
    assertInstallerHookFailureAtomic(`valid JSON with invalid schema (${label})`, priorHooks, false,
      /invalid existing hooks\.json schema/i);
  }
  assertInstallerHookFailureAtomic('injected staged-copy failure',
    '{"hooks":{"SessionStart":[{"id":"user:keep","hooks":[]}]}}\n', true,
    /simulated installer hook refresh failure/i);
}

// Codex rust-v0.144.4 accepts a top-level project_root_markers array in normal
// multiline TOML form. The preflight boundary parser must consume the complete
// value while still refusing malformed or duplicate top-level declarations.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-root-marker-home-'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-root-marker-project-'));
  try {
    // spawn-class: environment
    const install = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: homeRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(install.status, 0,
      'multiline root-marker fixture fresh global install: ' + install.stderr);
    enableMultiAgentV2(homeRoot);
    const globalConfig = path.join(homeRoot, '.codex', 'config.toml');
    const canonical = fs.readFileSync(globalConfig, 'utf8');
    // spawn-class: environment
    const invoke = () => spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot,
        '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8', env: withCodexVersionAttestation() });

    fs.writeFileSync(globalConfig,
      'project_root_markers = [\n'
      + '  ".git",\n'
      + ']\n\n'
      + canonical);
    let result = invoke();
    assert.strictEqual(result.status, 0,
      'a valid multiline top-level project_root_markers array passes normal preflight: '
      + result.stderr + result.stdout);
    assert.strictEqual(JSON.parse(result.stdout).status, 'ok',
      'valid multiline root markers retain the normal preflight ok status');

    for (const fixture of [
      {
        label: 'non-array root markers',
        declaration: 'project_root_markers = ".git"\n\n',
      },
      {
        label: 'non-string array member',
        declaration: 'project_root_markers = [".git", 1]\n\n',
      },
      {
        label: 'duplicate top-level root markers',
        declaration: 'project_root_markers = [".git"]\n'
          + 'project_root_markers = ["ROOT.marker"]\n\n',
      },
    ]) {
      fs.writeFileSync(globalConfig, fixture.declaration + canonical);
      result = invoke();
      assert.notStrictEqual(result.status, 0,
        fixture.label + ' must fail closed');
      assert.strictEqual(JSON.parse(result.stdout).status, 'project_root_markers_invalid',
        fixture.label + ' uses the typed project-root boundary refusal');
    }
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

// Codex loads project `.codex` layers only after an explicit project trust decision: an untrusted
// project layer is excluded from the effective runtime and labelled ignored. (#1101: the
// project_trust_required refusal of an ignored Kaola profile footprint retired with the profiles.)
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  // spawn-class: environment
  const invoke = (projectRoot, homeRoot, doctor = false) => spawnSync(process.execPath,
    [preflightPath, ...(doctor ? ['--doctor'] : []), '--project-root', projectRoot,
      '--home', homeRoot, '--no-autofix', '--json'],
    { cwd: pluginRoot, encoding: 'utf8', env: withCodexVersionAttestation() });

  {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-trust-ignored-transport-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-trust-ignored-transport-home-'));
    try {
      // spawn-class: environment
      const install = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
      });
      assert.strictEqual(install.status, 0, 'ignored transport: global fixture install');
      // #775: the global layer is deliberately left WITHOUT enableMultiAgentV2 here — this test
      // proves the untrusted project layer's [agents].enabled=true is excluded, so the effective
      // runtime must read false regardless (an enabled global layer would mask that proof).
      trustCodexProject(homeRoot, projectRoot, 'untrusted');
      const projectCodex = path.join(projectRoot, '.codex');
      fs.mkdirSync(projectCodex, { recursive: true });
      fs.writeFileSync(path.join(projectCodex, 'config.toml'), '[features.multi_agent_v2]\nenabled = true\n');

      const normal = invoke(projectRoot, homeRoot);
      assert.strictEqual(normal.status, 0,
        'an untrusted project config is reported, never a refusal: ' + normal.stderr + normal.stdout);
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.multi_agent_v2_enabled, false,
        'ignored project [agents].enabled=true does not enter the effective runtime');

      const doctor = invoke(projectRoot, homeRoot, true);
      const doctorJson = JSON.parse(doctor.stdout);
      assert((doctorJson.scopes || []).some(scope =>
        scope.codex_dir === projectCodex && scope.config_layer_ignored === true),
      'doctor labels the untrusted project layer ignored');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }
}

// Config layers themselves must be regular, non-symlink readable files. The normal
// gate emits a typed JSON refusal instead of following a link, blocking on a special
// file, or throwing a Node stack when a layer cannot be read.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const cases = [
    {
      label: 'config path is a directory',
      prepare(configPath) { fs.mkdirSync(configPath); },
    },
    {
      label: 'config path is a symlink',
      prepare(configPath, outsideRoot) {
        const target = path.join(outsideRoot, 'outside-config.toml');
        fs.writeFileSync(target, '[features]\nmulti_agent = true\n');
        fs.symlinkSync(target, configPath);
      },
    },
  ];
  for (const fixture of cases) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-safe-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-safe-home-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-safe-outside-'));
    try {
      // spawn-class: environment
      const globalInstall = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot,
        env: { ...process.env, HOME: homeRoot },
        encoding: 'utf8',
      });
      assert.strictEqual(globalInstall.status, 0,
        fixture.label + ': global fixture install: ' + globalInstall.stderr);
      trustCodexProject(homeRoot, projectRoot);
      const projectCodex = path.join(projectRoot, '.codex');
      fs.mkdirSync(projectCodex);
      const configPath = path.join(projectCodex, 'config.toml');
      fixture.prepare(configPath, outsideRoot);
      // spawn-class: environment
      const result = spawnSync(process.execPath,
        [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
        { cwd: pluginRoot, encoding: 'utf8', env: withCodexVersionAttestation() });
      assert.notStrictEqual(result.status, 0, fixture.label + ': normal gate must refuse');
      assert.doesNotThrow(() => JSON.parse(result.stdout),
        fixture.label + ': refusal must remain machine-readable JSON: ' + result.stdout + result.stderr);
      const json = JSON.parse(result.stdout);
      assert.strictEqual(json.status, 'config_layer_unsafe', fixture.label + ': typed status');
      assert.strictEqual(json.config_path, configPath, fixture.label + ': exact unsafe path');
      assert(!/\n\s+at /.test(result.stderr), fixture.label + ': no Node stack escapes');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }
}

function readInstalledCommand(name) {
  return fs.readFileSync(path.join(tmp, '.claude', 'commands', name), 'utf8');
}

try {
  // spawn-class: environment
  const installOutput = execFileSync(
    'bash',
    ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
    {
      cwd: root,
      env: { ...process.env, HOME: tmp },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  // #1101: a fresh Claude install writes no subagent profile, no agent manifest and no model
  // binding, and says nothing about installing agents. (Retiring what an earlier release installed
  // is scripts/test-issue-1101-claude-agent-migration.js.)
  const claudeAgentsDir = path.join(tmp, '.claude', 'agents');
  assert(!fs.existsSync(claudeAgentsDir)
    || fs.readdirSync(claudeAgentsDir).filter(name => name.endsWith('.md')).length === 0,
  '#1101: a fresh install writes no Claude subagent profile');
  assert(!fs.existsSync(path.join(claudeAgentsDir, '.kaola-workflow-agent-manifest')),
    '#1101: a fresh install writes no agent manifest');
  assert(!fs.existsSync(path.join(claudeAgentsDir, '.kaola-agent-models.json')),
    '#1101: a fresh install writes no agent model binding');
  assert(!/Installed agent|Verified managed Kaola-Workflow agents|runtime prompt loading/.test(installOutput),
    '#1101: the installer reports no agent install');


  const allCommands = fs.readdirSync(path.join(tmp, '.claude', 'commands'))
    .filter(name => name.endsWith('.md'))
    .map(name => readInstalledCommand(name))
    .join('\n');
  assert(!/model="\{[A-Z_]+_MODEL\}"/.test(allCommands), 'installed commands must not keep model placeholders');
  // #610: the plan-column tier rename (opus/sonnet → reasoning/standard) is the PLAN vocabulary only —
  // it must NOT leak into any Agent(model=…) rendering (#1101: the commands pin no model at all).
  assert(!/model="(reasoning|standard|heavy)"/.test(allCommands),
    'installed commands must render concrete Claude model aliases, never the neutral plan-tier tokens');

  // The retired flag fails LOUD at the operator's terminal on both former values.
  for (const flag of ['--profile=higher', '--profile=common']) {
    const ptmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-retired-profile-'));
    try {
      let threw = null;
      try {
        // spawn-class: environment
        execFileSync('bash', ['install.sh', '--yes', '--forge=github', flag, '--no-settings-merge'],
          { cwd: root, env: { ...process.env, HOME: ptmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) { threw = e; }
      assert(threw && threw.status !== 0, 'install.sh ' + flag + ' must exit non-zero');
      assert(String(threw.stderr || '').includes('Unknown argument'),
        'install.sh ' + flag + ' must fail via the generic unknown-argument handler; got ' + (threw.stderr || ''));
    } finally { fs.rmSync(ptmp, { recursive: true, force: true }); }
  }

  // #363: forge installs must run end-to-end (HOME=tmpdir) — the prior suite only exercised
  // --forge=github, so the forge copy/verify paths (now fail-closed) were never run. Assert each
  // forge install exits 0 + writes a VALID-JSON manifest (the node encoder) + a rendered hooks.json.
  for (const forge of ['gitlab', 'gitea']) {
    const ftmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-' + forge + '-'));
    try {
      // spawn-class: environment
      execFileSync('bash', ['install.sh', '--yes', '--forge=' + forge, '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: ftmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      assert(!fs.existsSync(path.join(ftmp, '.claude', 'agents', '.kaola-agent-models.json')),
        forge + ' install must not write the retired agent model manifest');
      const hooksPath = path.join(ftmp, '.claude', 'kaola-workflow-' + forge, 'hooks', 'hooks.json');
      assert(fs.existsSync(hooksPath), forge + ' install must render hooks.json');
      JSON.parse(fs.readFileSync(hooksPath, 'utf8')); // throws if the node rewrite produced invalid JSON
    } finally { fs.rmSync(ftmp, { recursive: true, force: true }); }
  }

  // #363 / #407: verification fails CLOSED for forges. The SUPPORT_SCRIPT_NAMES list is now
  // single-sourced from scripts/kaola-workflow-install-manifest.js (#407), so plant the bogus entry in
  // a TEMP manifest copy (fed via KAOLA_INSTALL_MANIFEST so the in-repo manifest is never mutated) and
  // assert the install ABORTS — the prior code silently skipped the missing source and verified green
  // (the 5.4.0 incident class).
  {
    const manifestSrc = path.join(root, 'scripts', 'kaola-workflow-install-manifest.js');
    const ttmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-typo-'));
    const typoManifest = path.join(ttmp, 'typo-manifest.js');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-typo-home-'));
    try {
      const original = fs.readFileSync(manifestSrc, 'utf8');
      // inject a bogus gitea-only support script into FORGE_ONLY_SCRIPTS.gitea.
      const injected = original.replace(
        "  gitea: ['kaola-gitea-forge.js'],",
        "  gitea: ['kaola-gitea-NONEXISTENT-typo-363.js', 'kaola-gitea-forge.js'],");
      assert(injected !== original, 'planted-typo test: failed to inject a bogus gitea manifest entry');
      fs.writeFileSync(typoManifest, injected);
      // spawn-class: environment
      const result = require('child_process').spawnSync('bash', ['install.sh', '--yes', '--forge=gitea', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: home, KAOLA_INSTALL_MANIFEST: typoManifest, KAOLA_MANIFEST_REPO_ROOT: root }, encoding: 'utf8' });
      assert(result.status !== 0, '#363/#407: a typo\'d gitea manifest support entry must FAIL the install, got exit ' + result.status);
      assert(/missing from source/.test((result.stderr || '') + (result.stdout || '')),
        '#363/#407: the install abort must name the missing source; got: ' + result.stderr);
    } finally {
      fs.rmSync(ttmp, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  }

  // #447 AC1/AC5/AC2 + #571: codex installer positional-form invariant (claude chain).
  // #571 default is GLOBAL (--global targets ~/.codex); the POSITIONAL form (pass a path as
  // argv[2]) is an optional per-repo override that installs to that path's .codex/.
  // This test exercises the positional-form override to verify the project-local path still
  // works and hooks still go to the global HOME. Run under a temp HOME so the real ~/.codex
  // is never touched.
  {
    const codexInstallerPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js');
    const cproj = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-447-proj-'));
    const chome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-447-home-'));
    try {
      // spawn-class: environment
      execFileSync('node', [codexInstallerPath, cproj], {
        cwd: path.join(root, 'plugins', 'kaola-workflow'),
        env: { ...process.env, HOME: chome },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      trustCodexProject(chome, cproj);

      // AC1: global hooks.json is written to <tempHOME>/.codex/hooks.json
      const globalHooksPath = path.join(chome, '.codex', 'hooks.json');
      assert(fs.existsSync(globalHooksPath), '#447 AC1: hooks.json must be written to global HOME/.codex, not found at: ' + globalHooksPath);

      // AC1: global hooks.json carries the four kaola-workflow: hook entries
      const installedHooks = JSON.parse(fs.readFileSync(globalHooksPath, 'utf8'));
      const managedIds = [];
      for (const event of Object.keys(installedHooks.hooks || {})) {
        for (const entry of (installedHooks.hooks[event] || [])) {
          if (entry && entry.id && entry.id.startsWith('kaola-workflow:')) {
            managedIds.push(entry.id);
          }
        }
      }
      assert(managedIds.length >= 1, '#447 AC1: global hooks.json must carry a kaola-workflow: entry; found ' + managedIds.length + ': ' + managedIds.join(', '));
      const expectedIds = ['kaola-workflow:compact-context'];
      for (const id of expectedIds) {
        assert(managedIds.includes(id), '#447 AC1: global hooks.json must carry hook id "' + id + '"; found: ' + managedIds.join(', '));
      }

      // AC1: stable home directories are populated under <tempHOME>/.codex/kaola-workflow
      const globalStableHooksDir = path.join(chome, '.codex', 'kaola-workflow', 'hooks');
      const globalStableScriptsDir = path.join(chome, '.codex', 'kaola-workflow', 'scripts');
      assert(fs.existsSync(globalStableHooksDir), '#447 AC1: stable hooks dir must be written to HOME/.codex/kaola-workflow/hooks');
      assert(fs.existsSync(globalStableScriptsDir), '#447 AC1: stable scripts dir must be written to HOME/.codex/kaola-workflow/scripts');

      // AC5: no hooks.json is written to the project-local .codex directory
      const projectHooksPath = path.join(cproj, '.codex', 'hooks.json');
      assert(!fs.existsSync(projectHooksPath), '#447 AC5: no hooks.json must be written to project .codex, found at: ' + projectHooksPath);

      // #1101: the positional (project) form installs NO role profile and registers none; the
      // scope's .codex only ever loses what an earlier release put there (the migration suite).
      assert(!fs.existsSync(path.join(cproj, '.codex', 'agents', 'kaola-workflow')),
        '#1101: the positional form must not create .codex/agents/kaola-workflow/');
      const projectConfigPath = path.join(cproj, '.codex', 'config.toml');
      assert(!fs.existsSync(projectConfigPath) || !fs.readFileSync(projectConfigPath, 'utf8').includes('# BEGIN kaola-workflow agents'),
        '#1101: the positional form must not register a managed agents block');
      fs.mkdirSync(path.dirname(projectConfigPath), { recursive: true });
      const configText = '';
      const codexPreflightPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-codex-preflight.js');
      // #775 (Codex 0.145 re-baseline): the MultiAgentV2 switch lives at
      // `features.multi_agent_v2.enabled`, NOT in the top-level [agents] table ([agents] has no
      // `enabled` key). This helper prepends a [features.multi_agent_v2] table; its NAME is
      // historical: it enables V2 the way Codex actually reads it, not via [agents].
      function configWithAgentsEnabled(extraLines) {
        return '[features.multi_agent_v2]\nenabled = true\n' + (extraLines ? extraLines + '\n' : '') + '\n' + configText;
      }

      function runPreflightForConfig(body) {
        fs.writeFileSync(projectConfigPath, body);
        // spawn-class: environment
        return spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8',
          env: withCodexVersionAttestation(),
        });
      }

      // (#1101: the preflight's Codex version floor and its codex_version_unsupported refusal were
      // dropped with the roles it guarded, so their pins went with them.)

      // #1101: multi_agent_v2 disabled is a reported host fact, never a refusal (the
      // codex_multi_agent_v2_required status retired with the roles).
      const noV2 = runPreflightForConfig(configText);
      assert.strictEqual(noV2.status, 0, '#1101: v2 disabled must not fail preflight: ' + noV2.stderr + noV2.stdout);
      const noV2Json = JSON.parse(noV2.stdout);
      assert.strictEqual(noV2Json.multi_agent_v2_enabled, false, '#1101: v2-disabled config reports multi_agent_v2_enabled:false');
      assert.strictEqual(noV2Json.dispatch_mode, null, '#1101: v2-disabled config reports no dispatch mode');
      assert(/neither requires nor writes/.test(noV2Json.dispatch_posture_warning || ''),
        '#1101: the report states that Kaola-Workflow neither requires nor writes the setting: ' + noV2Json.dispatch_posture_warning);
      const withV2 = runPreflightForConfig(configWithAgentsEnabled());
      assert.strictEqual(withV2.status, 0, '#775: enabled config passes preflight: ' + withV2.stderr + withV2.stdout);
      assert.strictEqual(JSON.parse(withV2.stdout).multi_agent_v2_enabled, true, '#775: enabled config reports multi_agent_v2_enabled:true');
      assert.strictEqual(JSON.parse(withV2.stdout).dispatch_mode, 'v2-task-name', '#775: enabled config reports the v2-task-name dispatch mode');

      // #775 (Codex 0.145 re-baseline): dispatch mode is binary now — the whole 0.142/0.144
      // transport-mode grammar (tool_namespace / hide_spawn_agent_metadata / non_code_mode_only,
      // quoted/dotted/array-of-table edge cases, the codex_v2_*_transport_unsafe refusals) is
      // retired along with the [features.multi_agent_v2] table shape; the ONLY question left is
      // whether the top-level [agents] table's `enabled` is true (v2-task-name) or not 
      function assertDispatchModeForConfig(body, expectedEnabled, label) {
        const result = runPreflightForConfig(body);
        assert.strictEqual(result.status, 0, label + ': preflight reports, never refuses, on the v2 setting: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.multi_agent_v2_enabled, expectedEnabled, label + ': multi_agent_v2_enabled');
        assert.strictEqual(json.dispatch_mode, expectedEnabled ? 'v2-task-name' : null, label + ': dispatch_mode (no v1 fallback)');
      }
      assertDispatchModeForConfig(configText, false, '#775 no [agents] table at all');
      assertDispatchModeForConfig('[features.multi_agent_v2]\nenabled = false\n\n' + configText, false, '#775 [agents] table present but enabled=false');
      assertDispatchModeForConfig(configWithAgentsEnabled(), true, '#775 [agents]\\nenabled = true');
      assertDispatchModeForConfig('[notice]\nsuppress_unstable_features_warning = true\n\n' + configText, false,
        '#775 warning suppression alone must not enable v2');
      assertDispatchModeForConfig('multi_agent_v2 = true\n\n' + configText, false,
        '#775 a retired top-level multi_agent_v2 key is not read (no more [features] grammar)');

      // #598 AC2: effort-gated MultiAgentMode dispatch-POSTURE E2E coverage (distinct from
      // dispatch_mode above — posture reflects whether the runtime will REFUSE a spawn, not
      // just whether the tools are exposed). A non-proactive posture is a reported fact, never a
      // preflight failure.
      function assertDispatchPostureForConfig(body, label) {
        const result = runPreflightForConfig(body);
        assert.strictEqual(result.status, 0, label + ': config-fact report must never fail preflight: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.dispatch_posture, null,
          label + ': dispatch_posture stays unknown, got ' + JSON.stringify(json.dispatch_posture));
        assert.ok(json.dispatch_posture_warning && !/does not expose|explicitRequestOnly|proactive delegation/.test(json.dispatch_posture_warning),
          label + ': warning reports the config fact without a capability verdict: ' + json.dispatch_posture_warning);
        if (body.includes('model_reasoning_effort = "ultra"') && body.indexOf('model_reasoning_effort') < body.indexOf('[')) {
          assert.ok(/model_reasoning_effort is "ultra"/.test(json.dispatch_posture_warning),
            label + ': a root effort value is reported as read: ' + json.dispatch_posture_warning);
        }
      }
      assertDispatchPostureForConfig(configWithAgentsEnabled(),
        '#1111 enabled flag, no effort, is not a posture');
      assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + configWithAgentsEnabled(),
        '#1111 effort=ultra is not a dispatch authorization');
      assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + configWithAgentsEnabled(),
        '#1111 effort=xhigh is not a posture');
      assertDispatchPostureForConfig(configWithAgentsEnabled() + '\nmodel_reasoning_effort = "ultra"\n',
        '#1111 effort after the first table is not reported as a root key');

      // --- #775: MultiAgentV2 concurrency + wait-timeout bounds — the arithmetic itself is
      // UNCHANGED (cap is INCLUSIVE of the root session; width = cap-1; default 4 -> width 3);
      // the bounds are read from `features.multi_agent_v2`, and `max_threads` is NOT an alias for
      // max_concurrent_threads_per_session — see the assertion below. ---
      function assertMultiAgentV2BoundsForConfig(body, expected, label) {
        const result = runPreflightForConfig(body);
        assert.strictEqual(result.status, 0, label + ': multi_agent_v2 bounds report must never fail preflight once v2 is enabled: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        for (const key of Object.keys(expected)) {
          assert.strictEqual(json[key], expected[key],
            label + ': expected ' + key + ' ' + JSON.stringify(expected[key]) + ', got ' + JSON.stringify(json[key]));
        }
      }
      assertMultiAgentV2BoundsForConfig(configWithAgentsEnabled(), {
        max_concurrent_threads_per_session: null,
        max_concurrent_threads_per_session_source: 'absent',
        effective_subagent_width: null,
        min_wait_timeout_ms: null,
        max_wait_timeout_ms: null,
        default_wait_timeout_ms: null,
      }, '#1111 v2 enabled, no bounds configured -> absent, not a default width');
      assertMultiAgentV2BoundsForConfig(configWithAgentsEnabled('max_concurrent_threads_per_session = 6'), {
        max_concurrent_threads_per_session: 6,
        max_concurrent_threads_per_session_source: 'config',
        effective_subagent_width: null,
        min_wait_timeout_ms: null,
        max_wait_timeout_ms: null,
        default_wait_timeout_ms: null,
      }, '#775 configured threads=6 -> config source, width = threads-1');
      // max_threads is NOT an alias for max_concurrent_threads_per_session, so the V2 budget must
      // come from max_concurrent_threads_per_session alone and a stray max_threads leaves the cap
      // at the observed default rather than silently setting it. That is what the assertion below
      // pins, and #842 does not disturb it: the old comment here also claimed Codex REJECTS
      // agents.max_threads once multi_agent_v2 is enabled, which is false (measured on 0.145.0 —
      // see the AC1 bounds-note assertions), but the key being INERT for this parser's cap math is
      // true either way. Note the fixture puts max_threads inside [features.multi_agent_v2], not
      // under [agents] at all: this pins THIS parser, never any Codex behaviour.
      assertMultiAgentV2BoundsForConfig(configWithAgentsEnabled('max_threads = 6'), {
        max_concurrent_threads_per_session: null,
        max_concurrent_threads_per_session_source: 'absent',
        effective_subagent_width: null,
        min_wait_timeout_ms: null,
        max_wait_timeout_ms: null,
        default_wait_timeout_ms: null,
      }, '#1111 max_threads is NOT an alias and does not invent a default cap');
      assertMultiAgentV2BoundsForConfig(
        configWithAgentsEnabled('max_concurrent_threads_per_session = 2\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\ndefault_wait_timeout_ms = 60000'),
        {
          max_concurrent_threads_per_session: 2,
          max_concurrent_threads_per_session_source: 'config',
          effective_subagent_width: null,
          min_wait_timeout_ms: 1000,
          max_wait_timeout_ms: 1800000,
          default_wait_timeout_ms: 60000,
        }, '#775 all four numeric fields configured under [features.multi_agent_v2]');
      assertMultiAgentV2BoundsForConfig(configWithAgentsEnabled('max_concurrent_threads_per_session = 0'), {
        max_concurrent_threads_per_session: null,
        max_concurrent_threads_per_session_source: 'absent',
        effective_subagent_width: null,
      }, '#1111 a non-positive threads value is not a config fact and is not replaced with a default');

      // AC1 (#775): installer REPORT step — a fresh install must print the effective dispatch
      // posture it reads, and this must NEVER change the installer's own exit code (#1101: Kaola
      // neither requires nor writes multi_agent_v2, and the preflight only reports it).
      const codexInstallerPathForPosture = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js');
      const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-775-proj-'));
      const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-775-home-'));
      try {
        // spawn-class: environment
        const freshInstall = spawnSync(process.execPath, [codexInstallerPathForPosture, postureProj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: postureHome },
          encoding: 'utf8'
        });
        assert.strictEqual(freshInstall.status, 0, '#775 AC1: dispatch-posture report must never fail an otherwise-good install: ' + freshInstall.stderr);
        assert(/status: ok/.test(freshInstall.stdout), '#775 AC1: existing "status: ok" output must be unchanged (install always succeeds)');
        assert(/Kaola-Workflow Codex multi_agent_v2: not enabled$/m.test(freshInstall.stdout),
          '#775 AC1: a fresh install (no [agents] enabled=true; Kaola never writes it per D2) must report multi_agent_v2 not enabled: ' + freshInstall.stdout);
        assert(/Kaola-Workflow Codex config: Config fact:/.test(freshInstall.stdout)
          && !/does not expose/.test(freshInstall.stdout),
          '#1111 AC1: a fresh install reports the config fact and does not claim missing tools: ' + freshInstall.stdout);
        assert(/0\.145\.0/.test(freshInstall.stdout), '#775 AC1: report must carry the version-guard note (0.145.0): ' + freshInstall.stdout);
        assert(/does not infer an effective subagent width/.test(freshInstall.stdout)
          && /neither requires nor writes/.test(freshInstall.stdout),
          '#1101: a fresh install documents how Codex bounds [features.multi_agent_v2] as a host fact, recommending nothing: ' + freshInstall.stdout);
        assert(/max_concurrent_threads_per_session/.test(freshInstall.stdout) && /wait_timeout_ms/.test(freshInstall.stdout),
          '#775 AC1: the bounds note must name both knobs: ' + freshInstall.stdout);
        // #842: the note keeps its ADVICE about agents.max_threads and loses its false MECHANISM.
        // Measured on the installed codex-cli 0.145.0, isolated CODEX_HOME, read-only probes:
        //   * `[features.multi_agent_v2] enabled = true` + `[agents] max_threads = 6` loads clean —
        //     `codex doctor --summary` reports "config loaded", `codex features list` exits 0 with
        //     multi_agent_v2 stable true. The key is ACCEPTED, not rejected.
        //   * Non-vacuity: an UNRECOGNISED [agents] scalar in the same position IS refused —
        //     `invalid type: integer 6, expected struct AgentRoleToml`, exit 1 — so the acceptance
        //     above is a real acceptance and not an unchecked path.
        //   * The quoted vendor error is absent from the shipped binary: neither "cannot be set
        //     when" nor "multi_agent_v2 is enabled" occurs anywhere in the 271MB Mach-O, so no
        //     Codex code path can print it at config load, session start, or spawn.
        // Shipping a fabricated vendor error to consumers is worse than shipping no note, so the
        // verbatim quote is pinned ABSENT rather than merely un-pinned.
        assert(/agents\.max_threads/.test(freshInstall.stdout),
          'AC1: the note must still NAME agents.max_threads — the advice to leave it out is correct '
          + 'and a reader who has already set it deserves to learn it does nothing: ' + freshInstall.stdout);
        assert(!/cannot be set when multi_agent_v2 is enabled/.test(freshInstall.stdout),
          'AC1 (#842): the note must NOT quote "agents.max_threads cannot be set when multi_agent_v2 '
          + 'is enabled". That string exists in no Codex 0.145.0 binary; printing it tells the operator '
          + 'their config will be refused when it loads clean: ' + freshInstall.stdout);
        assert(/not an alias/i.test(freshInstall.stdout),
          'AC1 (#842): the note must state the ACCURATE relationship — agents.max_threads is a separate '
          + 'key and NOT an alias for the V2 budget, which comes from '
          + 'features.multi_agent_v2.max_concurrent_threads_per_session alone: ' + freshInstall.stdout);

        // Enable multi_agent_v2 with effort=ultra, then re-run (idempotent
        // update) — the posture must flip to 'proactive' and multi_agent_v2 must report enabled.
        const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
        // #1101: the install writes no config.toml (no registration block); the user's own starts empty.
        fs.mkdirSync(path.dirname(postureConfigPath), { recursive: true });
        const beforeUltra = fs.existsSync(postureConfigPath) ? fs.readFileSync(postureConfigPath, 'utf8') : '';
        fs.writeFileSync(postureConfigPath, 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n\n' + beforeUltra);
        // spawn-class: environment
        const reinstall = spawnSync(process.execPath, [codexInstallerPathForPosture, postureProj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: postureHome },
          encoding: 'utf8'
        });
        assert.strictEqual(reinstall.status, 0, '#775 AC1: re-install with [agents] enabled + effort=ultra must still exit 0: ' + reinstall.stderr);
        assert(/model_reasoning_effort is "ultra"/.test(reinstall.stdout)
          && !/dispatch posture: proactive/.test(reinstall.stdout),
          '#1111 AC1: effort=ultra is reported as a config fact, not a posture: ' + reinstall.stdout);
        // #842: the label reports STATE and must not credit the RETIRED key for it. The detector
        // reads features.multi_agent_v2 — three shapes plus dotted-root equivalents — and this
        // fixture turns V2 on through [features.multi_agent_v2]; `[agents] enabled = true` is not
        // what enabled it. An operator reading the old parenthetical either believes their [agents]
        // block did it, or writes that key and gets nothing. Four assertions in four chains pinned
        // it, which is the #849 shape: a pin proves a sentence is PRESENT, never that it is TRUE.
        // A label that only reports state cannot be wrong about mechanism, so dropping the
        // parenthetical satisfies both halves; naming the real switch does too.
        assert(/Kaola-Workflow Codex multi_agent_v2: enabled/.test(reinstall.stdout),
          '#775 AC1: enabled config must report multi_agent_v2 enabled: ' + reinstall.stdout);
        assert(!/multi_agent_v2: enabled \([^)]*\[agents\]/.test(reinstall.stdout),
          '#842 AC1: ...and must NOT attribute it to [agents] — that key did not enable V2 here and '
          + 'does not enable it anywhere: ' + reinstall.stdout);
        assert(!/refuse sub-agent spawns/.test(reinstall.stdout),
          '#775 AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstall.stdout);
        assert(!/effective subagent width \d/.test(reinstall.stdout),
          '#1111 AC1: enabled with no configured threads must not invent a width: ' + reinstall.stdout);

        // Configure explicit bounds under the SAME [features.multi_agent_v2] table, re-install (idempotent
        // update) — the report must now print the concrete width + every configured bound.
        const beforeBounds = fs.readFileSync(postureConfigPath, 'utf8');
        fs.writeFileSync(postureConfigPath, beforeBounds.replace('[features.multi_agent_v2]\nenabled = true\n',
          '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 3\nmin_wait_timeout_ms = 1000\n'
          + 'max_wait_timeout_ms = 1800000\ndefault_wait_timeout_ms = 60000\n'));
        // spawn-class: environment
        const v2Install = spawnSync(process.execPath, [codexInstallerPathForPosture, postureProj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: postureHome },
          encoding: 'utf8'
        });
        assert.strictEqual(v2Install.status, 0, '#775 AC1: re-install with bounds configured must still exit 0: ' + v2Install.stderr);
        assert(/config max_concurrent_threads_per_session=3 \[config\]/.test(v2Install.stdout)
          && !/effective subagent width \d/.test(v2Install.stdout),
          '#1111 AC1: configured threads=3 are reported without an inferred width: ' + v2Install.stdout);
        assert(/min_wait_timeout_ms=1000/.test(v2Install.stdout), '#775 AC1: must report configured min_wait_timeout_ms: ' + v2Install.stdout);
        assert(/max_wait_timeout_ms=1800000/.test(v2Install.stdout), '#775 AC1: must report configured max_wait_timeout_ms: ' + v2Install.stdout);
        assert(/default_wait_timeout_ms=60000/.test(v2Install.stdout), '#775 AC1: must report configured default_wait_timeout_ms: ' + v2Install.stdout);
      } finally {
        fs.rmSync(postureProj, { recursive: true, force: true });
        fs.rmSync(postureHome, { recursive: true, force: true });
      }

      // cross-edition: the shared ~/.config/kaola-workflow/config.json is user-owned. Neither the
      // codex triplet installer nor install.sh writes it — the workflow has no install-time
      // configuration to seed, so the behavioral-identity assertion is that both create nothing.
      const sharedConfigPath = path.join(chome, '.config', 'kaola-workflow', 'config.json');
      assert(!fs.existsSync(sharedConfigPath),
        'default install must not create ~/.config/kaola-workflow/config.json, found ' + sharedConfigPath);
    } finally {
      fs.rmSync(cproj, { recursive: true, force: true });
      fs.rmSync(chome, { recursive: true, force: true });
    }
  }


  // #775 (Codex 0.145 re-baseline): the "root dotted [features] assignment" and "root inline
  // features" authority-preservation tests are retired wholesale — [features] is not read at all
  // anymore (config/agents.toml's managed block carries only [agents.<role>] entries), so there
  // is no external-[features]-authority concept left to preserve. The transport-safety dimension
  // (codex_v2_transport_mode / codex_v2_direct_transport_ready / codex_v2_role_transport_ready /
  // codex_v2_tool_namespace / codex_v2_role_metadata_visible, and the CODEX_V2_*_NOTE constants)
  // is retired with it — Codex >=0.145.0's stabilized MultiAgentV2 needs none of it.

  // #598: effort-gated MultiAgentMode dispatch-posture — pure-function unit coverage (no
  // subprocess). #775: posture now derives from ONLY the top-level [agents].enabled boolean (the
  // legacy [features] multi_agent / multi_agent_v2 OR-join is retired) —
  //   [agents] enabled absent-or-false -> 'none'
  //   otherwise: root-level model_reasoning_effort = "ultra" -> 'proactive', else 'explicitRequestOnly'.
  // Exercises BOTH the installer's and the preflight's copy of deriveDispatchPosture — they are
  // duplicated (not shared) by design, so this is the semantic-parity check the whole-file
  // byte-identity validator (validate-script-sync.js) cannot itself express.
  {
    const preflightModulePath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-codex-preflight.js');
    const installerModulePath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js');
    const preflightMod = require(preflightModulePath);
    const installerMod = require(installerModulePath);

    // (#1101: the legacy-pin / malformed-profile inspectScope case retired with the profiles.)

    const postureFixtures = [
      { label: 'no agents table at all', cfg: '', effort: 'absent', flag: 'not true' },
      { label: 'v2 enabled, no effort', cfg: '[features.multi_agent_v2]\nenabled = true\n', effort: 'absent', flag: 'true' },
      { label: 'v2 enabled=false, no effort', cfg: '[features.multi_agent_v2]\nenabled = false\n', effort: 'absent', flag: 'not true' },
      { label: 'v2 enabled, effort=ultra', cfg: 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = true\n', effort: '"ultra"', flag: 'true' },
      { label: 'v2 enabled, effort=xhigh', cfg: 'model_reasoning_effort = "xhigh"\n\n[features.multi_agent_v2]\nenabled = true\n', effort: '"xhigh"', flag: 'true' },
      { label: 'v2 disabled + effort=ultra', cfg: 'model_reasoning_effort = "ultra"\n\n[features.multi_agent_v2]\nenabled = false\n', effort: '"ultra"', flag: 'not true' },
      { label: 'effort after first table is not a root key', cfg: '[features.multi_agent_v2]\nenabled = true\nmodel_reasoning_effort = "ultra"\n', effort: 'absent', flag: 'true' },
    ];
    for (const mod of [preflightMod, installerMod]) {
      for (const f of postureFixtures) {
        const result = mod.deriveDispatchPosture(f.cfg);
        assert.strictEqual(result.dispatch_posture, null,
          '#1111 ' + f.label + ': posture stays unknown, got ' + JSON.stringify(result));
        assert.ok(result.dispatch_posture_warning
          && result.dispatch_posture_warning.includes('features.multi_agent_v2.enabled is ' + f.flag)
          && result.dispatch_posture_warning.includes('model_reasoning_effort is ' + f.effort)
          && !/does not expose/.test(result.dispatch_posture_warning),
          '#1111 ' + f.label + ': warning is the config fact, got ' + JSON.stringify(result.dispatch_posture_warning));
      }
    }

    // The installer and preflight must ship the identical version-guard note (semantic
    // lock-step check, distinct from the whole-file byte-identity the sync validator enforces).
    assert.strictEqual(installerMod.DISPATCH_POSTURE_VERSION_NOTE, preflightMod.DISPATCH_POSTURE_VERSION_NOTE,
      '#598: installer and preflight version-guard notes must match verbatim');
    assert(/0\.145\.0/.test(installerMod.DISPATCH_POSTURE_VERSION_NOTE),
      '#775: version-guard note must name the Codex CLI version the coupling is guarded against');

    // #611 AC6 (#775: bounds are read from [features.multi_agent_v2]; arithmetic UNCHANGED)
    // — MultiAgentV2 concurrency + wait-timeout bounds — pure-function unit coverage (no
    // subprocess):
    //   v2 not enabled -> not_applicable, every field null.
    //   v2 enabled, max_concurrent_threads_per_session absent/non-positive -> OBSERVED default 4
    //     (effective subagent width 3); configured -> reported verbatim, width = threads - 1.
    //   min/max/default_wait_timeout_ms have no independently verified default -> read ONLY
    //     when explicitly present; null when absent (no fabricated fallback).
    // Exercises BOTH the installer's and the preflight's copy of deriveMultiAgentV2Bounds — they
    // are duplicated (not shared) by design, so this is the semantic-parity check the whole-file
    // byte-identity validator (validate-script-sync.js) cannot itself express.
    const boundsFixtures = [
      { label: 'no agents table at all', cfg: '', v2Enabled: false,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'not_applicable', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled, no bounds configured', cfg: '[features.multi_agent_v2]\nenabled = true\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'absent', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled, threads configured', cfg: '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 6\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 6, max_concurrent_threads_per_session_source: 'config', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled, stray max_threads is NOT an alias for max_concurrent_threads_per_session', cfg: '[features.multi_agent_v2]\nenabled = true\nmax_threads = 6\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'absent', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled, all four numeric fields configured', cfg: '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 2\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\ndefault_wait_timeout_ms = 60000\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 2, max_concurrent_threads_per_session_source: 'config', effective_subagent_width: null, min_wait_timeout_ms: 1000, max_wait_timeout_ms: 1800000, default_wait_timeout_ms: 60000 } },
      { label: 'unrelated table after [agents] does not over-collect bounds', cfg: '[features.multi_agent_v2]\nenabled = true\n\n[mcp_servers."srv"]\nmax_concurrent_threads_per_session = 99\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'absent', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'non-integer configured threads value is not a config fact', cfg: '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = "six"\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'absent', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'zero configured threads value is not a config fact', cfg: '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 0\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'absent', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
    ];
    for (const mod of [preflightMod, installerMod]) {
      for (const f of boundsFixtures) {
        const result = mod.deriveMultiAgentV2Bounds(f.cfg, f.v2Enabled);
        for (const key of Object.keys(f.expected)) {
          assert.strictEqual(result[key], f.expected[key],
            '#611 ' + f.label + ': expected ' + key + ' ' + JSON.stringify(f.expected[key]) + ', got ' + JSON.stringify(result));
        }
      }
    }

    assert.strictEqual(installerMod.OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION, undefined,
      '#1111: the report no longer exports a default concurrency budget');
    assert.strictEqual(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE, preflightMod.MULTI_AGENT_V2_BOUNDS_NOTE,
      '#611: installer and preflight multi_agent_v2 bounds notes must match verbatim');
    assert(/0\.145\.0/.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#775: multi_agent_v2 bounds note must name the verified Codex CLI version');
    assert(/agents\.max_threads/.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      'bounds note must name agents.max_threads — the advice to leave it out is correct');
    // #842, on the note CONSTANT rather than on installer stdout, so the negatives are scoped to
    // the exact string both surfaces print. The guidance stays; only the mechanism was false.
    // (#1101: the note no longer ADVISES a subagent configuration — Kaola-Workflow neither requires nor
    // writes multi_agent_v2 — so the #842 keep-the-advice pin retired; the mechanism pins stay.)
    assert(!/\breject(s|ed|ion)?\b/i.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#842: the note must NOT claim Codex rejects agents.max_threads. Measured on codex-cli 0.145.0 '
      + '(isolated CODEX_HOME): v2-enabled + [agents] max_threads = 6 loads clean under both '
      + '`codex doctor` and `codex features list`, while an unrecognised [agents] scalar in the same '
      + 'position is refused — so the key is a RECOGNISED, ACCEPTED field, not a rejected one: '
      + installerMod.MULTI_AGENT_V2_BOUNDS_NOTE);
    assert(/(no effect|ineffective|does not (raise|set|change)|is ignored|silently)/i
      .test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#842: the note must say what setting agents.max_threads ACTUALLY does — nothing. It does not '
      + 'raise the V2 budget, so a stray one is silently ineffective rather than an error. That is '
      + 'the reason to leave it out, and it is the reason the note is allowed to keep the advice: '
      + installerMod.MULTI_AGENT_V2_BOUNDS_NOTE);
    assert(/not an alias/i.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#842: the note must state that agents.max_threads is NOT an alias for the V2 budget; the '
      + 'budget comes from features.multi_agent_v2.max_concurrent_threads_per_session alone: '
      + installerMod.MULTI_AGENT_V2_BOUNDS_NOTE);
    assert(/max_concurrent_threads_per_session/.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#842: the note must name the key that DOES set the budget');
    // #842 OVERCLAIM FENCE — the boundary of what was actually measured. Two facts are established:
    // the key is ACCEPTED at config load (codex doctor / codex features list, isolated CODEX_HOME,
    // against an unrecognised-[agents]-scalar control that IS refused), and it does not raise the V2
    // cap (this parser's own math, pinned above). What Codex does with the value INTERNALLY —
    // ignores it, discards it, drops it — was NOT measured and cannot be from outside: no read-only
    // surface dumps the resolved config, and settling it would need a real multi-agent spawn.
    // Replacing a fabricated claim with a differently-fabricated one is the same defect wearing a
    // correction's clothes, so the stronger sentence is pinned OUT rather than left to a reader.
    // Both constants, because the note is duplicated in the installer and the preflight and the
    // equality assert above only proves they AGREE — two copies of an overclaim agree perfectly.
    for (const [label, note] of [['installer', installerMod.MULTI_AGENT_V2_BOUNDS_NOTE],
      ['preflight', preflightMod.MULTI_AGENT_V2_BOUNDS_NOTE]]) {
      assert(!/codex[^.]{0,40}\b(ignor\w*|discard\w*|drop\w*)\b/i.test(note),
        '#842 (' + label + '): the note must not claim Codex IGNORES / DISCARDS / DROPS '
        + 'agents.max_threads. Measured: the key is accepted at config load and does not raise the '
        + 'V2 cap; what the runtime does with the value internally is unmeasured, so budget-frame it '
        + '("does not raise the cap") and stop there: ' + note);
    }

    // (#1101: CODEX_MULTI_AGENT_V2_REQUIRED_REMEDIATION and its refusal retired with the roles; the
    // #842 mechanism pins on the bounds note above cover the one string that still ships.)
  }

  // #1111: Claude install reports the CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS value it actually
  // read (process env, and settings env blocks). It does not infer teams/classic, does not claim
  // a tool is always available, and NEVER writes settings. Non-fatal.
  const claudeConfigSection = (stdout) => {
    const start = stdout.indexOf('Kaola-Workflow Claude config:');
    if (start < 0) return '';
    const rest = stdout.slice(start);
    const end = rest.indexOf('\n\n');
    return end < 0 ? rest : rest.slice(0, end);
  };
  const noCapabilityVerdict = (stdout) => {
    const section = claudeConfigSection(stdout);
    return section.length > 0
      && !/claude_dispatch_posture\s*:/.test(section)
      && !/always available/i.test(section)
      && !/teammate-mode/i.test(section)
      && !/to enable/i.test(section)
      && !/\b(?:teams|classic)\b/.test(section);
  };
  {
    // (a) env var set to "1" is reported as that value, not as a capability.
    const teamsEnvHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-606-teams-env-'));
    try {
      // spawn-class: environment
      const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'], {
        cwd: root,
        env: { ...process.env, HOME: teamsEnvHome, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
        encoding: 'utf8'
      });
      assert.strictEqual(result.status, 0, '#1111: env-var config report must not fail the install: ' + result.stderr);
      assert(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS \(process env\): 1/.test(result.stdout),
        '#1111: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 must be reported as the process-env value; got: ' + result.stdout);
      assert(/not a session tool inventory/.test(result.stdout),
        '#1111: the Claude config report must say it is not a session tool inventory; got: ' + result.stdout);
      assert(noCapabilityVerdict(result.stdout),
        '#1111: the Claude config report must not infer a capability; got: ' + result.stdout);
    } finally { fs.rmSync(teamsEnvHome, { recursive: true, force: true }); }

    // (b) env unset and no settings key -> both facts absent. No enablement tutorial.
    const classicHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-606-classic-'));
    try {
      const env = { ...process.env, HOME: classicHome };
      delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      // spawn-class: environment
      const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
        { cwd: root, env, encoding: 'utf8' });
      assert.strictEqual(result.status, 0, '#1111: absent config report must not fail the install: ' + result.stderr);
      assert(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS \(process env\): absent/.test(result.stdout),
        '#1111: an unset env var must be reported absent; got: ' + result.stdout);
      assert(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS \(settings env\): absent/.test(result.stdout),
        '#1111: no settings env key must be reported absent; got: ' + result.stdout);
      assert(!/to enable/i.test(claudeConfigSection(result.stdout)),
        '#1111: the report must not teach how to enable a mode; got: ' + claudeConfigSection(result.stdout));
      assert(noCapabilityVerdict(result.stdout),
        '#1111: an absent flag must not become a capability verdict; got: ' + result.stdout);
    } finally { fs.rmSync(classicHome, { recursive: true, force: true }); }

    // (c) env unset but ~/.claude/settings.json "env" carries the key. Report that value and
    // path, and leave the file byte-unchanged (--no-settings-merge isolates the hooks writer).
    const settingsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-606-settings-'));
    try {
      const settingsDir = path.join(settingsHome, '.claude');
      fs.mkdirSync(settingsDir, { recursive: true });
      const settingsPath = path.join(settingsDir, 'settings.json');
      const settingsBefore = JSON.stringify({ env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } }, null, 2) + '\n';
      fs.writeFileSync(settingsPath, settingsBefore);

      const env = { ...process.env, HOME: settingsHome };
      delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      // spawn-class: environment
      const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
        { cwd: root, env, encoding: 'utf8' });
      assert.strictEqual(result.status, 0, '#1111: settings config report must not fail the install: ' + result.stderr);
      assert(result.stdout.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS (settings env): 1 in ' + settingsPath),
        '#1111: a settings env value must be reported with its path; got: ' + result.stdout);
      assert(/CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS \(process env\): absent/.test(result.stdout),
        '#1111: an unset process env stays absent when settings carries the key; got: ' + result.stdout);
      assert(noCapabilityVerdict(result.stdout),
        '#1111: a settings value must not become a capability verdict; got: ' + result.stdout);

      const settingsAfter = fs.readFileSync(settingsPath, 'utf8');
      assert.strictEqual(settingsAfter, settingsBefore,
        '#1111: the report-only read must never mutate settings.json; boundary broken');
    } finally { fs.rmSync(settingsHome, { recursive: true, force: true }); }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// #1104 (carried through #1101's rebase): the live cached preflight keeps its plugin identity check
// when --home reaches the cache through a symlink, stays ok for a matching manifest under either
// --home form, and a lexical scriptDir through a symlinked cache layer keeps its non-symlink
// refusal. The fixture helpers are the base suite's, minus the retired agents/ copy.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const pluginIdentity = JSON.parse(fs.readFileSync(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));
  const marketplace = 'kaola-test-marketplace';

  function cacheFixture() {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-home-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-project-'));
    const versionRoot = path.join(homeRoot, '.codex', 'plugins', 'cache', marketplace,
      pluginIdentity.name, pluginIdentity.version);
    fs.mkdirSync(versionRoot, { recursive: true });
    fs.cpSync(path.join(pluginRoot, 'config'), path.join(versionRoot, 'config'), { recursive: true });
    fs.cpSync(path.join(pluginRoot, '.codex-plugin'), path.join(versionRoot, '.codex-plugin'),
      { recursive: true });
    fs.mkdirSync(path.join(versionRoot, 'scripts'));
    return { homeRoot, projectRoot, versionRoot };
  }

  function doctor(fixture, liveCachedSource = false) {
    return codexPreflight.runDoctor({
      projectRoot: fixture.projectRoot,
      home: fixture.homeRoot,
      scriptDir: liveCachedSource
        ? path.join(fixture.versionRoot, 'scripts')
        : path.join(pluginRoot, 'scripts'),
    });
  }

  // #1104: the CLI's __dirname is realpath-resolved, so the live cache copy must
  // keep its manifest/path identity check when --home reaches it through a symlink.
  {
    const fixture = cacheFixture();
    const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-link-'));
    try {
      for (const script of ['kaola-workflow-codex-preflight.js', 'kaola-workflow-adaptive-schema.js']) {
        fs.copyFileSync(path.join(pluginRoot, 'scripts', script),
          path.join(fixture.versionRoot, 'scripts', script));
      }
      const manifestPath = path.join(fixture.versionRoot, '.codex-plugin', 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.version = '0.0.0';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      const realHome = fs.realpathSync(fixture.homeRoot);
      const linkedHome = path.join(linkRoot, 'home');
      fs.symlinkSync(realHome, linkedHome);
      for (const [label, home] of [['symlinked', linkedHome], ['real', realHome]]) {
        // spawn-class: environment
        const run = spawnSync(process.execPath,
          [path.join(fixture.versionRoot, 'scripts', 'kaola-workflow-codex-preflight.js'),
            '--doctor', '--home', home, '--project-root', fixture.projectRoot, '--json'],
          { encoding: 'utf8', env: process.env });
        assert.strictEqual(run.status, 2,
          `live cached CLI doctor with a ${label} --home rejects manifest version drift: `
            + run.stdout + run.stderr);
        const report = JSON.parse(run.stdout);
        assert.strictEqual(report.status, 'plugin_identity_invalid',
          `live cached CLI doctor with a ${label} --home has a typed identity refusal`);
        assert(report.error.includes('plugin_manifest_version_mismatch'),
          `live cached CLI doctor with a ${label} --home names the manifest version mismatch`);
      }
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(linkRoot, { recursive: true, force: true });
    }
  }

  // #1104: the same live cache copy with a matching manifest stays ok under
  // either --home form.
  {
    const fixture = cacheFixture();
    const linkRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-link-'));
    try {
      for (const script of ['kaola-workflow-codex-preflight.js', 'kaola-workflow-adaptive-schema.js']) {
        fs.copyFileSync(path.join(pluginRoot, 'scripts', script),
          path.join(fixture.versionRoot, 'scripts', script));
      }
      const realHome = fs.realpathSync(fixture.homeRoot);
      const linkedHome = path.join(linkRoot, 'home');
      fs.symlinkSync(realHome, linkedHome);
      for (const [label, home] of [['symlinked', linkedHome], ['real', realHome]]) {
        // spawn-class: environment
        const run = spawnSync(process.execPath,
          [path.join(fixture.versionRoot, 'scripts', 'kaola-workflow-codex-preflight.js'),
            '--doctor', '--home', home, '--project-root', fixture.projectRoot, '--json'],
          { encoding: 'utf8', env: process.env });
        assert.strictEqual(run.status, 0,
          `live cached CLI doctor with a ${label} --home accepts a matching manifest: `
            + run.stdout + run.stderr);
        assert.strictEqual(JSON.parse(run.stdout).status, 'ok',
          `live cached CLI doctor with a ${label} --home reports ok for a matching manifest`);
      }
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(linkRoot, { recursive: true, force: true });
    }
  }

  // #1104: a lexical scriptDir reaching the live cache through a symlinked cache
  // layer keeps the lexical containment check and its non-symlink refusal.
  for (const layer of ['.codex', 'version']) {
    const fixture = cacheFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-layer-'));
    try {
      const linked = layer === '.codex' ? path.join(fixture.homeRoot, '.codex') : fixture.versionRoot;
      const outside = path.join(outsideRoot, 'target');
      fs.renameSync(linked, outside);
      fs.symlinkSync(outside, linked);
      const result = doctor(fixture, true);
      assert.strictEqual(result.exitCode, 2,
        `live installed-source doctor rejects a symlinked ${layer} cache layer reached lexically`);
      assert.strictEqual(result.result.status, 'plugin_identity_invalid',
        `symlinked ${layer} cache layer has a typed identity refusal`);
      assert(result.result.error.includes('plugin_cache_path_unsafe'),
        `symlinked ${layer} cache layer refusal names plugin_cache_path_unsafe`);
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }
}

// Custody restored in #1101's review round (N6): behaviour that still ships and had lost its tests.
// Installs no longer create profiles, so the scopes below start from the frozen pre-#1101 install
// (scripts/fixtures/issue-1101/v12.2.6-46fbe12d), i.e. real retired-role residue.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const frozenCodex = path.join(root, 'scripts', 'fixtures', 'issue-1101', 'v12.2.6-46fbe12d', 'home', 'dot-codex');
  const plantFrozenCodex = dest => {
    const walk = (src, dst) => {
      fs.mkdirSync(dst, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const name = entry.name.startsWith('dot-') ? '.' + entry.name.slice(4) : entry.name;
        if (entry.isDirectory()) walk(path.join(src, entry.name), path.join(dst, name));
        else fs.copyFileSync(path.join(src, entry.name), path.join(dst, name));
      }
    };
    walk(frozenCodex, dest);
  };

  // A redirected Codex scope authority is refused before anything is read through it: normal
  // preflight with a typed status and no stack, and the doctor naming the unsafe scope.
  const cases = [
    ['Codex scope directory symlink', '.codex', 'config_layer_unsafe'],
    ['agents parent directory symlink', path.join('.codex', 'agents'), 'scope_authority_unsafe'],
    ['managed agent directory symlink', path.join('.codex', 'agents', 'kaola-workflow'), 'scope_authority_unsafe'],
  ];
  for (const [label, rel, expectedStatus] of cases) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-authority-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-authority-home-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-authority-outside-'));
    try {
      plantFrozenCodex(path.join(homeRoot, '.codex'));
      const source = path.join(homeRoot, rel);
      const target = path.join(outsideRoot, 'redirected');
      fs.renameSync(source, target);
      fs.symlinkSync(target, source);
      // spawn-class: environment
      const normal = spawnSync(process.execPath,
        [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
        { cwd: pluginRoot, encoding: 'utf8', env: { ...process.env, HOME: homeRoot } });
      assert.notStrictEqual(normal.status, 0, label + ': normal preflight must reject redirected authority');
      assert.strictEqual(JSON.parse(normal.stdout).status, expectedStatus, label + ': normal typed authority refusal');
      assert(!/\n\s+at /.test(normal.stderr), label + ': normal refusal has no Node stack');
      // spawn-class: environment
      const doctor = spawnSync(process.execPath,
        [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
        { cwd: pluginRoot, encoding: 'utf8', env: { ...process.env, HOME: homeRoot } });
      assert.notStrictEqual(doctor.status, 0, label + ': doctor must reject the same redirected authority');
      const doctorJson = JSON.parse(doctor.stdout);
      assert.strictEqual(doctorJson.status, 'stale', label + ': doctor typed stale result');
      assert((doctorJson.scopes || []).some(scope =>
        scope.config_layer_unsafe === true || scope.scope_authority_unsafe === true),
      label + ': doctor identifies the unsafe authority scope');
      assert(!/\n\s+at /.test(doctor.stderr), label + ': doctor refusal has no Node stack');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }

  // An explicit --home is the complete global authority for both inspection and autofix: the
  // child installer retires the residue beneath the selected home and never falls back to the
  // preflight process HOME.
  {
    const selectedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-selected-home-'));
    const inheritedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-inherited-home-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-selected-home-project-'));
    const originalHome = process.env.HOME;
    try {
      plantFrozenCodex(path.join(selectedHome, '.codex'));
      const selectedProfile = path.join(selectedHome, '.codex', 'agents', 'kaola-workflow', 'implementer.toml');
      assert(fs.existsSync(selectedProfile), 'selected-home fixture carries retired-role residue');
      process.env.HOME = inheritedHome;
      const result = codexPreflight.runPreflight({
        projectRoot,
        home: selectedHome,
        scriptDir: path.join(pluginRoot, 'scripts'),
        noAutofix: false,
      });
      assert.strictEqual(result.exitCode, 0,
        'global autofix honors the explicitly selected home: ' + JSON.stringify(result.result));
      assert.strictEqual(result.result.autofixed, true,
        'selected-home repair reports autofixed after persisted re-verification');
      assert(!fs.existsSync(selectedProfile),
        'global autofix retires the residue beneath the selected home');
      assert(!fs.existsSync(path.join(inheritedHome, '.codex')),
        'global autofix must not create or mutate the inherited process home');
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(selectedHome, { recursive: true, force: true });
      fs.rmSync(inheritedHome, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  // #1105 (N6 c2/c3/c4/c6/c9): the rest of the live behaviour #1101 left untested.
  // spawn-class: environment
  const runCli = (homeRoot, args) => spawnSync(process.execPath, [preflightPath, ...args],
    { cwd: pluginRoot, encoding: 'utf8', env: { ...process.env, HOME: homeRoot } });
  const writeFile = (file, content) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const snapshotTree = dir => {
    const bytes = {};
    const walk = current => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) walk(full);
        else bytes[path.relative(dir, full)] = fs.readFileSync(full).toString('base64');
      }
    };
    walk(dir);
    return bytes;
  };

  // c3: from a nested cwd, residue in the repository-root .codex layer is found, and the doctor
  // lists every layer from the root to the cwd.
  {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-nested-home-'));
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-nested-repo-'));
    try {
      fs.mkdirSync(path.join(repoRoot, '.git'));
      plantFrozenCodex(path.join(repoRoot, '.codex'));
      trustCodexProject(homeRoot, repoRoot, 'trusted');
      const nested = path.join(repoRoot, 'a', 'b');
      fs.mkdirSync(nested, { recursive: true });
      const rootProfile = path.join(repoRoot, '.codex', 'agents', 'kaola-workflow', 'implementer.toml');

      const normal = runCli(homeRoot,
        ['--project-root', nested, '--home', homeRoot, '--no-autofix', '--json']);
      assert.strictEqual(normal.status, 1,
        'c3: nested cwd reports repository-root residue: ' + normal.stdout + normal.stderr);
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.status, 'retired_role_residue', 'c3: typed residue status');
      assert(normalJson.residue_paths.includes(rootProfile),
        'c3: residue_paths name the repository-root profile: ' + JSON.stringify(normalJson.residue_paths));
      assert(normalJson.residue_paths.includes(path.join(repoRoot, '.codex', 'config.toml')),
        'c3: residue_paths name the repository-root managed block');

      const doctor = runCli(homeRoot, ['--doctor', '--project-root', nested, '--home', homeRoot, '--json']);
      const doctorDirs = (JSON.parse(doctor.stdout).scopes || []).map(scope => scope.codex_dir);
      for (const dir of [path.join(repoRoot, '.codex'), path.join(repoRoot, 'a', '.codex'),
        path.join(nested, '.codex')]) {
        assert(doctorDirs.includes(dir), `c3: doctor lists the ${dir} layer: ` + JSON.stringify(doctorDirs));
      }
      assert(fs.existsSync(rootProfile), 'c3: --no-autofix and the doctor never mutate');
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  }

  // c2: custom project_root_markers find the trusted root layer, and an exact nested untrusted
  // record outranks the trusted-root fallback for that layer.
  {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-markers-home-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-markers-project-'));
    try {
      const nested = path.join(projectRoot, 'nested');
      writeFile(path.join(projectRoot, 'ROOT.marker'), '');
      const rootConfig = path.join(projectRoot, '.codex', 'config.toml');
      const nestedConfig = path.join(nested, '.codex', 'config.toml');
      writeFile(rootConfig, '[features.multi_agent_v2]\nenabled = true\nmax_wait_timeout_ms = 1800000\n');
      writeFile(nestedConfig, '[features.multi_agent_v2]\nmax_concurrent_threads_per_session = 2\n');
      writeFile(path.join(homeRoot, '.codex', 'config.toml'), 'project_root_markers = ["ROOT.marker"]\n');
      trustCodexProject(homeRoot, projectRoot, 'trusted');
      trustCodexProject(homeRoot, nested, 'untrusted');

      const normal = runCli(homeRoot,
        ['--project-root', nested, '--home', homeRoot, '--no-autofix', '--json']);
      assert.strictEqual(normal.status, 0, 'c2: marker-rooted layers are ok: ' + normal.stdout + normal.stderr);
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.max_wait_timeout_ms, 1800000,
        'c2: the trusted marker-root layer enters the effective runtime');
      assert.strictEqual(normalJson.max_concurrent_threads_per_session, null,
        'c2: the exact untrusted nested layer stays out of the effective runtime');
      assert.notStrictEqual(normalJson.max_concurrent_threads_per_session, 2,
        'c2: the untrusted nested thread count is not adopted');
      assert.deepStrictEqual(normalJson.effective_config_paths,
        [path.join(homeRoot, '.codex', 'config.toml'), rootConfig],
        'c2: only the global and trusted root layers are loaded');

      const doctor = runCli(homeRoot, ['--doctor', '--project-root', nested, '--home', homeRoot, '--json']);
      const scopes = JSON.parse(doctor.stdout).scopes || [];
      const rootScope = scopes.find(scope => scope.codex_dir === path.join(projectRoot, '.codex'));
      const nestedScope = scopes.find(scope => scope.codex_dir === path.join(nested, '.codex'));
      assert(rootScope && rootScope.project_trust === 'trusted' && rootScope.config_layer_ignored === false,
        'c2: the marker-root layer is trusted and active: ' + JSON.stringify(scopes));
      assert(nestedScope && nestedScope.project_trust === 'untrusted' && nestedScope.config_layer_ignored === true,
        'c2: the exact untrusted nested layer is ignored: ' + JSON.stringify(scopes));
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  // c4: autofix proves every scope repairable before the first installer runs. A repairable global
  // scope and a later project scope with an unbalanced marker pair refuse with exit 4, and the
  // global scope is left byte-identical.
  {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-order-home-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-order-project-'));
    try {
      plantFrozenCodex(path.join(homeRoot, '.codex'));
      trustCodexProject(homeRoot, projectRoot, 'trusted');
      writeFile(path.join(projectRoot, '.codex', 'config.toml'),
        '# BEGIN kaola-workflow agents\n[agents.implementer]\n'
        + 'config_file = "./agents/kaola-workflow/implementer.toml"\n');
      const globalBefore = snapshotTree(path.join(homeRoot, '.codex'));
      assert(Object.keys(globalBefore).some(rel => rel.startsWith(path.join('agents', 'kaola-workflow') + path.sep)),
        'c4: the global scope carries repairable residue');

      const run = runCli(homeRoot, ['--project-root', projectRoot, '--home', homeRoot, '--json']);
      assert.strictEqual(run.status, 4, 'c4: a later ambiguous scope refuses autofix: ' + run.stdout + run.stderr);
      const json = JSON.parse(run.stdout);
      assert.strictEqual(json.status, 'autofix_unsafe', 'c4: typed autofix_unsafe status');
      assert.strictEqual(json.scope, projectRoot, 'c4: the refusal names the ambiguous project scope');
      assert.deepStrictEqual(snapshotTree(path.join(homeRoot, '.codex')), globalBefore,
        'c4: the repairable global scope is byte-identical after the refusal');
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  // c6: bounds combine per field across layers; a later layer never resets a field it leaves unset.
  {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-bounds-home-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-bounds-project-'));
    try {
      writeFile(path.join(homeRoot, '.codex', 'config.toml'),
        '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 6\n');
      trustCodexProject(homeRoot, projectRoot, 'trusted');
      writeFile(path.join(projectRoot, '.codex', 'config.toml'),
        '[features.multi_agent_v2]\nmax_wait_timeout_ms = 1800000\n');
      const run = runCli(homeRoot, ['--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json']);
      assert.strictEqual(run.status, 0, 'c6: two-layer bounds are ok: ' + run.stdout + run.stderr);
      const json = JSON.parse(run.stdout);
      assert.strictEqual(json.max_concurrent_threads_per_session, 6, 'c6: the global thread cap survives');
      assert.strictEqual(json.max_concurrent_threads_per_session_source, 'config', 'c6: the cap comes from config');
      assert.strictEqual(json.effective_subagent_width, null, 'c6: a configured thread count is not an inferred width');
      assert.strictEqual(json.max_wait_timeout_ms, 1800000, 'c6: the project wait bound is added');
    } finally {
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }

  // c9: the doctor refuses a redirected plugin manifest file or manifest directory before trusting
  // the identity it names.
  for (const [label, linkRel, expectedError] of [
    ['plugin.json symlink', path.join('.codex-plugin', 'plugin.json'), 'plugin_manifest_unsafe'],
    ['.codex-plugin symlink', '.codex-plugin', 'plugin_manifest_path_unsafe'],
  ]) {
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-manifest-home-'));
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-manifest-project-'));
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-manifest-plugin-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-n6-manifest-outside-'));
    try {
      fs.cpSync(path.join(pluginRoot, '.codex-plugin'), path.join(sourceRoot, '.codex-plugin'), { recursive: true });
      fs.mkdirSync(path.join(sourceRoot, 'scripts'));
      const linked = path.join(sourceRoot, linkRel);
      const target = path.join(outsideRoot, path.basename(linkRel));
      fs.renameSync(linked, target);
      fs.symlinkSync(target, linked);
      const result = codexPreflight.runDoctor({
        projectRoot, home: homeRoot, scriptDir: path.join(sourceRoot, 'scripts'),
      });
      assert.strictEqual(result.exitCode, 2, `c9: ${label} is refused: ` + JSON.stringify(result.result));
      assert.strictEqual(result.result.status, 'plugin_identity_invalid', `c9: ${label} has a typed identity refusal`);
      assert(result.result.error.startsWith(expectedError + ':'),
        `c9: ${label} refusal names ${expectedError}: ${result.result.error}`);
    } finally {
      for (const dir of [homeRoot, projectRoot, sourceRoot, outsideRoot]) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}

console.log('Install model rendering tests passed');
