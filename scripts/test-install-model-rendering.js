#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-models-'));
const codexProfileInstaller = require('../plugins/kaola-workflow/scripts/install-codex-agent-profiles');
const codexPreflight = require('./kaola-workflow-codex-preflight');
const reviewerGenerator = require('./generate-reviewer-profiles');

function renderClaudeInstalledReviewer(source) {
  let rendered = source.replace(/^model:\s*\S+\s*$/m, 'model: inherit');
  const matches = [...rendered.matchAll(/^resolved_profile_hash:\s*([0-9a-f]{64})\s*$/gm)];
  assert.strictEqual(matches.length, 1, 'generated Claude reviewer must carry one resolved_profile_hash');
  const actual = matches[0][1];
  const offset = matches[0].index + matches[0][0].indexOf(actual);
  const normalized = rendered.slice(0, offset) + '0'.repeat(64) + rendered.slice(offset + 64);
  const next = reviewerGenerator.sha256(normalized);
  return rendered.slice(0, offset) + next + rendered.slice(offset + 64);
}

function parseCodexReviewerIdentity(source) {
  const behaviorVersion = source.match(/^behavior_contract_version:\s*(\d+)$/m);
  const behaviorHash = source.match(/^behavior_contract_hash:\s*([0-9a-f]{64})$/m);
  const profileHash = source.match(/^resolved_profile_hash:\s*([0-9a-f]{64})$/m);
  assert(behaviorVersion && behaviorHash && profileHash,
    'generated Codex reviewer must keep its complete identity inside developer_instructions');
  return {
    behavior_contract_version: Number(behaviorVersion[1]),
    behavior_contract_hash: behaviorHash[1],
    resolved_profile_hash: profileHash[1],
  };
}

function resignCodexReviewer(source) {
  const matches = [...String(source).matchAll(/^resolved_profile_hash:\s*([0-9a-f]{64})\s*$/gm)];
  assert.strictEqual(matches.length, 1, 'Codex reviewer mutation must carry one resolved hash field');
  const actual = matches[0][1];
  const offset = matches[0].index + matches[0][0].indexOf(actual);
  const normalized = source.slice(0, offset) + '0'.repeat(64) + source.slice(offset + 64);
  const digest = reviewerGenerator.sha256(normalized);
  return normalized.slice(0, offset) + digest + normalized.slice(offset + 64);
}

function runCodexInstaller(installerPath, projectRoot, homeRoot) {
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

// Install targets are authority boundaries, not merely output paths. Refuse every
// pre-existing symlink before reading or writing through it so project/global setup
// cannot redirect profiles, config, hooks, the stable hook home, or the manifest.
{
  const installerPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts',
    'install-codex-agent-profiles.js');
  const cases = [
    {
      label: 'managed agents directory symlink',
      prepare(projectRoot, homeRoot, outsideRoot) {
        fs.mkdirSync(path.join(projectRoot, '.codex', 'agents'), { recursive: true });
        fs.symlinkSync(outsideRoot, path.join(projectRoot, '.codex', 'agents', 'kaola-workflow'));
      },
    },
    {
      label: 'project config symlink',
      prepare(projectRoot, homeRoot, outsideRoot) {
        fs.mkdirSync(path.join(projectRoot, '.codex'), { recursive: true });
        fs.symlinkSync(path.join(outsideRoot, 'sentinel.txt'),
          path.join(projectRoot, '.codex', 'config.toml'));
      },
    },
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

// Profile and shared-config replacement stages must never reuse the predictable
// historical `.tmp-<pid>` path, follow a planted symlink, or clobber a colliding
// randomized stage. A collision is retried with a fresh exclusive candidate;
// exhausting the retry budget preserves both the live target and the collision.
{
  const failures = [];

  function runStageRegression(label, callback) {
    try {
      callback();
    } catch (error) {
      failures.push(`${label}: ${error && error.stack ? error.stack : error}`);
    }
  }

  function withRandomStageHexes(hexes, callback) {
    const originalRandomBytes = crypto.randomBytes;
    let index = 0;
    crypto.randomBytes = size => {
      const hex = hexes[Math.min(index, hexes.length - 1)];
      index += 1;
      assert.strictEqual(hex.length, size * 2, 'fixture hex must match requested random-byte width');
      return Buffer.from(hex, 'hex');
    };
    try {
      return { value: callback(), calls: index };
    } finally {
      crypto.randomBytes = originalRandomBytes;
    }
  }

  runStageRegression('profile predictable-stage symlink', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-stage-source-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-stage-target-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-stage-outside-'));
    const target = path.join(targetDir, 'implementer.toml');
    const sentinel = path.join(outsideDir, 'sentinel.txt');
    const plantedStage = `${target}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(path.join(sourceDir, 'implementer.toml'), 'new profile bytes\n');
      fs.writeFileSync(sentinel, 'unchanged\n');
      fs.symlinkSync(sentinel, plantedStage);
      assert.strictEqual(typeof codexProfileInstaller.copyAgentProfiles, 'function',
        'installer must export its profile staging helper for filesystem regressions');

      codexProfileInstaller.copyAgentProfiles(sourceDir, targetDir);

      assert.strictEqual(fs.readFileSync(target, 'utf8'), 'new profile bytes\n');
      assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n',
        'profile staging must not write through the historical predictable symlink');
      assert(fs.lstatSync(plantedStage).isSymbolicLink(),
        'profile staging must leave an unowned predictable-path collision untouched');
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  runStageRegression('shared-config predictable-stage symlink', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-stage-home-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-stage-outside-'));
    const configFile = path.join(homeDir, '.config', 'kaola-workflow', 'config.json');
    const sentinel = path.join(outsideDir, 'sentinel.txt');
    const plantedStage = `${configFile}.tmp-${process.pid}`;
    try {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(sentinel, 'unchanged\n');
      fs.symlinkSync(sentinel, plantedStage);

      codexProfileInstaller.seedKaolaConfig(homeDir);

      const seeded = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      assert.strictEqual(seeded.parallel_mode, 'auto');
      assert.ok(!('installed_paths' in seeded), 'shared-config seed must not write installed_paths (retired)');
      assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n',
        'shared-config staging must not write through the historical predictable symlink');
      assert(fs.lstatSync(plantedStage).isSymbolicLink(),
        'shared-config staging must leave an unowned predictable-path collision untouched');
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  runStageRegression('randomized-stage collision retry', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-collision-source-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-collision-target-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-collision-outside-'));
    const target = path.join(targetDir, 'implementer.toml');
    const sentinel = path.join(outsideDir, 'sentinel.txt');
    const collisionHex = '11'.repeat(16);
    const collision = `${target}.kaola-stage-${collisionHex}`;
    try {
      fs.writeFileSync(path.join(sourceDir, 'implementer.toml'), 'collision-safe profile\n');
      fs.writeFileSync(sentinel, 'unchanged\n');
      fs.symlinkSync(sentinel, collision);

      const random = withRandomStageHexes([collisionHex, '22'.repeat(16)], () => {
        codexProfileInstaller.copyAgentProfiles(sourceDir, targetDir);
      });

      assert.strictEqual(random.calls, 2,
        'profile staging must retry the colliding exclusive candidate with fresh randomness');
      assert.strictEqual(fs.readFileSync(target, 'utf8'), 'collision-safe profile\n');
      assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n');
      assert(fs.lstatSync(collision).isSymbolicLink(),
        'exclusive profile staging must preserve a colliding symlink owned by another process');
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  runStageRegression('shared-config randomized-stage collision retry', () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-collision-home-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-collision-outside-'));
    const configFile = path.join(homeDir, '.config', 'kaola-workflow', 'config.json');
    const sentinel = path.join(outsideDir, 'sentinel.txt');
    const collisionHex = '33'.repeat(16);
    const collision = `${configFile}.kaola-stage-${collisionHex}`;
    try {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      fs.writeFileSync(configFile, '{"parallel_mode":"manual","installed_paths":["fast"]}\n');
      fs.writeFileSync(sentinel, 'unchanged\n');
      fs.symlinkSync(sentinel, collision);

      const random = withRandomStageHexes([collisionHex, '44'.repeat(16)], () => {
        codexProfileInstaller.seedKaolaConfig(homeDir);
      });

      assert.strictEqual(random.calls, 2,
        'shared-config staging must retry the colliding exclusive candidate with fresh randomness');
      const installed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      assert.strictEqual(installed.parallel_mode, 'manual');
      assert.ok(!('installed_paths' in installed), 'shared-config seed must strip a stale installed_paths (retired)');
      assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n');
      assert(fs.lstatSync(collision).isSymbolicLink(),
        'exclusive shared-config staging must preserve a colliding symlink owned by another process');
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  for (const mutation of ['replacement inode', 'same-inode content']) {
    runStageRegression(`shared-config compare-and-swap retry (${mutation})`, () => {
      const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-config-cas-home-'));
      const configFile = path.join(homeDir, '.config', 'kaola-workflow', 'config.json');
      const concurrentStage = `${configFile}.fixture-concurrent`;
      const originalReadFileSync = fs.readFileSync;
      const initial = {
        parallel_mode: 'initial',
        installed_paths: ['fast'],
        initial_owner: 'superseded',
      };
      const concurrent = {
        parallel_mode: 'manual',
        installed_paths: ['full'],
        concurrent_owner: 'preserve-me',
      };
      let initialIdentity = null;
      let injected = false;
      try {
        fs.mkdirSync(path.dirname(configFile), { recursive: true });
        fs.writeFileSync(configFile, JSON.stringify(initial, null, 2) + '\n');
        initialIdentity = fs.lstatSync(configFile);
        fs.readFileSync = (file, ...args) => {
          const bytes = originalReadFileSync(file, ...args);
          let readsInitialConfig = false;
          if (typeof file === 'number') {
            const descriptorStat = fs.fstatSync(file);
            readsInitialConfig = descriptorStat.dev === initialIdentity.dev
              && descriptorStat.ino === initialIdentity.ino;
          } else {
            readsInitialConfig = path.resolve(String(file)) === path.resolve(configFile);
          }
          if (!injected && readsInitialConfig) {
            const concurrentBytes = JSON.stringify(concurrent, null, 2) + '\n';
            if (mutation === 'replacement inode') {
              fs.writeFileSync(concurrentStage, concurrentBytes);
              fs.renameSync(concurrentStage, configFile);
            } else {
              fs.writeFileSync(configFile, concurrentBytes);
              const mutatedIdentity = fs.lstatSync(configFile);
              assert.strictEqual(mutatedIdentity.dev, initialIdentity.dev,
                'same-inode fixture must retain the target device');
              assert.strictEqual(mutatedIdentity.ino, initialIdentity.ino,
                'same-inode fixture must retain the target inode');
            }
            injected = true;
          }
          return bytes;
        };

        const result = codexProfileInstaller.seedKaolaConfig(homeDir);

        assert.strictEqual(injected, true,
          'fixture must mutate config after the seed read and before its compare-and-swap');
        assert.strictEqual(result.status, 'updated');
        const installed = JSON.parse(originalReadFileSync(configFile, 'utf8'));
        assert.strictEqual(installed.concurrent_owner, 'preserve-me',
          'a concurrent owner field must survive a read/merge/write interleaving');
        assert.strictEqual(installed.initial_owner, undefined,
          'retry must merge from the concurrent replacement, not the superseded snapshot');
        assert.strictEqual(installed.parallel_mode, 'manual',
          'retry must preserve the concurrent writer parallel_mode');
        assert.ok(!('installed_paths' in installed),
          'retry must strip a stale installed_paths from the concurrent writer (retired)');
      } finally {
        fs.readFileSync = originalReadFileSync;
        fs.rmSync(homeDir, { recursive: true, force: true });
      }
    });
  }

  runStageRegression('randomized-stage collision exhaustion', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-exhaust-source-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-exhaust-target-'));
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-exhaust-outside-'));
    const target = path.join(targetDir, 'implementer.toml');
    const sentinel = path.join(outsideDir, 'sentinel.txt');
    const collisionHex = '55'.repeat(16);
    const collision = `${target}.kaola-stage-${collisionHex}`;
    try {
      fs.writeFileSync(path.join(sourceDir, 'implementer.toml'), 'replacement profile\n');
      fs.writeFileSync(target, 'live profile\n');
      fs.writeFileSync(sentinel, 'unchanged\n');
      fs.symlinkSync(sentinel, collision);

      assert.throws(() => {
        withRandomStageHexes([collisionHex], () => {
          codexProfileInstaller.copyAgentProfiles(sourceDir, targetDir);
        });
      }, error => error && /^atomic_stage_collision:/.test(error.message),
      'exhausted exclusive-stage collisions must raise a typed refusal');

      assert.strictEqual(fs.readFileSync(target, 'utf8'), 'live profile\n',
        'collision exhaustion must preserve the live target');
      assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'unchanged\n');
      assert(fs.lstatSync(collision).isSymbolicLink(),
        'collision exhaustion must not clean up a stage the installer did not create');
    } finally {
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  runStageRegression('owned-stage cleanup after rename failure', () => {
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-cleanup-source-'));
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-profile-cleanup-target-'));
    const target = path.join(targetDir, 'implementer.toml');
    const stageHex = '66'.repeat(16);
    const stage = `${target}.kaola-stage-${stageHex}`;
    const originalRenameSync = fs.renameSync;
    try {
      fs.writeFileSync(path.join(sourceDir, 'implementer.toml'), 'replacement profile\n');
      fs.writeFileSync(target, 'live profile\n');
      fs.renameSync = (source, destination) => {
        if (source === stage && destination === target) {
          throw new Error('fixture rename failure');
        }
        return originalRenameSync(source, destination);
      };

      assert.throws(() => {
        withRandomStageHexes([stageHex], () => {
          codexProfileInstaller.copyAgentProfiles(sourceDir, targetDir);
        });
      }, /fixture rename failure/);

      assert.strictEqual(fs.existsSync(stage), false,
        'a failed rename must remove only the exclusive stage created by this writer');
      assert.strictEqual(fs.readFileSync(target, 'utf8'), 'live profile\n',
        'a failed rename must preserve the live target');
    } finally {
      fs.renameSync = originalRenameSync;
      fs.rmSync(sourceDir, { recursive: true, force: true });
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  });

  assert.strictEqual(failures.length, 0,
    `atomic stage regressions failed:\n${failures.join('\n\n')}`);
}

// The installer owns one exact managed marker pair and one declaration for each
// managed role. Ambiguous marker spellings and pre-existing aliases must refuse
// before profiles, hooks, manifests, or config bytes are written. Unrelated user
// roles remain valid neighbors.
{
  const installerPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts',
    'install-codex-agent-profiles.js');
  const begin = '# BEGIN kaola-workflow agents';
  const end = '# END kaola-workflow agents';
  const installerSource = fs.readFileSync(installerPath, 'utf8');
  const postVerifySource = installerSource.slice(
    installerSource.indexOf('function postVerify('),
    installerSource.indexOf('// issue #543 D4:', installerSource.indexOf('function postVerify(')),
  );
  assert(postVerifySource.includes('managedConfigProof('),
    'postVerify must reuse the canonical marker/body/outside-declaration proof');
  assert(!/indexOf\(\s*(?:beginMarker|endMarker)\s*\)/.test(postVerifySource),
    'postVerify must not fall back to raw marker indexOf checks');

  function assertInstallerRefusesWithoutWrites(configText, expectedStatus, label) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-config-proof-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-config-proof-home-'));
    const configPath = path.join(projectRoot, '.codex', 'config.toml');
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, configText);
      const before = fs.readFileSync(configPath, 'utf8');
      const result = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.notStrictEqual(result.status, 0, label + ': installer must refuse');
      assert(new RegExp(`^${expectedStatus}:`, 'm').test(result.stderr),
        label + ': installer must use ' + expectedStatus + '; got ' + result.stderr);
      assert.strictEqual(fs.readFileSync(configPath, 'utf8'), before,
        label + ': refusal must preserve config.toml byte-for-byte');
      assert(!fs.existsSync(path.join(projectRoot, '.codex', 'agents')),
        label + ': refusal must happen before profile writes');
      assert(!fs.existsSync(path.join(homeRoot, '.codex')),
        label + ': refusal must happen before global hook/stable-home writes');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }

  const markerCases = [
    ['leading marker whitespace', `  ${begin}\n  ${end}\n`],
    ['trailing marker whitespace', `${begin}  \n${end}\t\n`],
    ['marker suffix comments', `${begin} # duplicate\n${end} # duplicate\n`],
    ['marker case drift', '# begin KAOLA-WORKFLOW Agents\n# end KAOLA-WORKFLOW Agents\n'],
    ['unpaired marker', `${begin}\n`],
  ];
  for (const [label, configText] of markerCases) {
    assertInstallerRefusesWithoutWrites(configText, 'managed_block_ambiguous', label);
  }

  const conflictCases = [
    ['exact managed role table', '[agents.code-reviewer]\nconfig_file = "local.toml"\n'],
    ['nested managed role table', '[agents.code-reviewer.extra]\nvalue = true\n'],
    ['quoted managed role table', '["agents"."code-reviewer"]\nconfig_file = "local.toml"\n'],
    ['dotted managed role assignment',
      '"agents"."code-reviewer".config_file = "local.toml"\n'],
    ['managed role assignment inside agents table',
      '[agents]\n"code-reviewer" = { config_file = "local.toml" }\n'],
    ['managed role inside root inline agents table',
      'agents = { "code-reviewer" = { config_file = "local.toml" } }\n'],
  ];
  for (const [label, configText] of conflictCases) {
    assertInstallerRefusesWithoutWrites(configText, 'managed_role_conflict_outside', label);
  }

  {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-unrelated-role-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-unrelated-role-home-'));
    const configPath = path.join(projectRoot, '.codex', 'config.toml');
    const unrelated = '[agents.my-local-role]\nconfig_file = "./agents/my-local-role.toml"\n';
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, unrelated);
      const result = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.strictEqual(result.status, 0,
        'unrelated role declaration must coexist with managed profiles: ' + result.stderr);
      const installed = fs.readFileSync(configPath, 'utf8');
      assert(installed.startsWith(unrelated),
        'unrelated role declaration must be preserved byte-for-byte before the managed block');
      assert(installed.includes(`${begin}\n`) && installed.includes(`\n${end}`),
        'unrelated role install must append one canonical managed marker pair');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }
}

// The supported inheritance representation is omission, while an exact historical full pin is
// stale migration input rather than fresh schema input.
{
  const inherited = fs.readFileSync(path.join(root, 'plugins/kaola-workflow/agents/implementer.toml'), 'utf8');
  const pinned = inherited.replace(/^developer_instructions/m,
    'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions');
  assert.deepStrictEqual(codexProfileInstaller.validateProfileText(inherited, 'implementer'), [],
    'an unpinned inherited profile must satisfy the source schema');
  assert.strictEqual(typeof codexProfileInstaller.classifyProfilePinPosture, 'function',
    'installer exports the profile pin migration classifier');
  assert.strictEqual(codexProfileInstaller.classifyProfilePinPosture(pinned), 'legacy_pinned',
    'an exact historical Sol/medium pair is stale migration input, not fresh');
}

// A previous manifest proves stale ownership only when it still binds the exact
// bytes on disk. Drifted or unverifiable paths become unmanaged, even when a
// stale entry uses a historically retired Kaola filename.
{
  const agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-stale-profile-prune-'));
  const managedName = 'old-managed.toml';
  const customName = 'custom-profile.toml';
  const malformedName = 'malformed-hash.toml';
  const unverifiableName = 'unverifiable.toml';
  const retiredName = codexProfileInstaller.RETIRED_PROFILE_FILES[0];
  const digest = value => 'sha256:' + reviewerGenerator.sha256(value);
  try {
    fs.writeFileSync(path.join(agentsDir, managedName), 'managed bytes\n');
    fs.writeFileSync(path.join(agentsDir, customName), 'custom bytes\n');
    fs.writeFileSync(path.join(agentsDir, malformedName), 'malformed hash bytes\n');
    fs.mkdirSync(path.join(agentsDir, unverifiableName));
    fs.writeFileSync(path.join(agentsDir, retiredName), 'custom retired-name bytes\n');

    const result = codexProfileInstaller.pruneStaleProfiles(agentsDir, [], {
      files: {
        [managedName]: digest('managed bytes\n'),
        [customName]: digest('old managed bytes\n'),
        [malformedName]: 'sha256:not-a-digest',
        [unverifiableName]: digest('old directory bytes\n'),
        [retiredName]: digest('old retired bytes\n'),
      },
    });

    assert(!fs.existsSync(path.join(agentsDir, managedName)),
      'byte-identical stale managed profile must be deleted');
    assert.deepStrictEqual(result.removed, [{ file: managedName, reason: 'stale-managed' }],
      'only an exact previous-manifest hash match is stale-managed');
    assert.deepStrictEqual(result.extraUnmanaged,
      [customName, malformedName, retiredName, unverifiableName].sort(),
      'modified, malformed-hash, retired-name, and unverifiable entries stay unmanaged');
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, customName), 'utf8'), 'custom bytes\n',
      'an old manifest hash must not delete a custom profile');
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, retiredName), 'utf8'),
      'custom retired-name bytes\n',
      'a previous-manifest mismatch must not fall through to retired-name deletion');
    assert(fs.statSync(path.join(agentsDir, unverifiableName)).isDirectory(),
      'an unverifiable stale path must remain on disk');
  } finally {
    fs.rmSync(agentsDir, { recursive: true, force: true });
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
          "      && target.includes('.kaola-scripts-stage-')",
          "      && target.endsWith('kaola-workflow-codex-compact-resume.js')) {",
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

// A project-local Codex layer has higher precedence than the global layer. A
// fresh global install must therefore never mask a present, stale project
// Kaola profile set, even when the mutation is parse-valid, self-rehashed, and
// its local manifest is rewritten to agree with the mutated bytes.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-project-override-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-global-base-'));
  try {
    const runInstaller = args => execFileSync(process.execPath, [installerPath, ...args], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: homeRoot },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    runInstaller(['--global']);
    trustCodexProject(homeRoot, projectRoot);
    runInstaller([projectRoot]);

    const projectAgents = path.join(projectRoot, '.codex', 'agents', 'kaola-workflow');
    const profilePath = path.join(projectAgents, 'code-reviewer.toml');
    const canonical = fs.readFileSync(profilePath, 'utf8');
    const mutated = resignCodexReviewer(canonical.replace(
      'use read-only repository inspection and shell execution tools',
      'use read-only repository inspection and command execution tools'));
    assert.notStrictEqual(mutated, canonical,
      'project override fixture must change parse-valid runtime-adapter policy bytes');
    assert.deepStrictEqual(codexPreflight.validateProfileText(mutated, 'code-reviewer'), [],
      'project override fixture remains schema/identity valid so exact provenance is the deciding gate');
    fs.writeFileSync(profilePath, mutated);

    const manifestPath = path.join(projectAgents, '.kaola-managed-profiles.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files['code-reviewer.toml'] = 'sha256:' + reviewerGenerator.sha256(mutated);
    manifest.profile_contracts['code-reviewer.toml'] = parseCodexReviewerIdentity(mutated);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    const refused = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(refused.status, 0,
      'fresh global profiles must not mask a stale higher-precedence project override');
    const refusal = JSON.parse(refused.stdout);
    assert.strictEqual(refusal.status, 'profiles_stale',
      'parse-valid project override drift is an exact-byte stale refusal');
    assert((refusal.stale_profiles || []).some(entry =>
      (entry.reasons || []).some(reason => reason.includes('profile_bytes_mismatch'))),
    'project override refusal must preserve the exact bundled-source mismatch reason');

    const repaired = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(repaired.status, 0,
      'normal preflight may repair the active project override before dispatch: ' + repaired.stderr);
    assert.strictEqual(fs.readFileSync(profilePath, 'utf8'), canonical,
      'project override autofix restores the canonical bundled reviewer bytes');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

// The preflight must validate the complete managed config bytes that Codex will
// load, not just count table headings. Metadata/path drift and outside wildcard,
// exact, or nested Kaola-role collisions fail normal + doctor gates; unrelated
// user roles remain valid outside the canonical managed markers.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const cases = [
    {
      label: 'managed features removed without external replacement',
      mutate: text => text.replace('[features]\nmulti_agent = true\n\n', ''),
    },
    {
      label: 'missing config_file',
      mutate: text => text.replace(
        'config_file = "./agents/kaola-workflow/code-reviewer.toml"\n', ''),
    },
    {
      label: 'cross-role existing config_file',
      mutate: text => text.replace(
        'config_file = "./agents/kaola-workflow/code-reviewer.toml"',
        'config_file = "./agents/kaola-workflow/security-reviewer.toml"'),
    },
    {
      label: 'absolute config_file',
      mutate: text => text.replace(
        'config_file = "./agents/kaola-workflow/code-reviewer.toml"',
        'config_file = "/tmp/code-reviewer.toml"'),
    },
    {
      label: 'description metadata drift',
      mutate: text => text.replace(
        'description = "Precision-first code review specialist',
        'description = "Drifted code review specialist'),
    },
    {
      label: 'nickname metadata drift',
      mutate: text => text.replace(
        'nickname_candidates = ["Reviewer", "Critic", "Inspector"]',
        'nickname_candidates = ["Wrong", "Critic", "Inspector"]'),
    },
    {
      label: 'extra managed key',
      mutate: text => text.replace(
        'config_file = "./agents/kaola-workflow/code-reviewer.toml"',
        'config_file = "./agents/kaola-workflow/code-reviewer.toml"\nmodel = "foreign"'),
    },
    {
      label: 'quoted outside agent table',
      mutate: text => text + '\n[agents."code-reviewer"]\nconfig_file = "./agents/kaola-workflow/code-reviewer.toml"\n',
      outside: true,
    },
    {
      label: 'nested table below managed role',
      mutate: text => text + '\n[agents.code-reviewer.extra]\nvalue = "shadow"\n',
      outside: true,
    },
    {
      label: 'fully quoted outside agent table',
      mutate: text => text + '\n["agents"."code-reviewer"]\nconfig_file = "./agents/kaola-workflow/code-reviewer.toml"\n',
      outside: true,
    },
    {
      label: 'unicode-escaped outside agent table',
      mutate: text => text + '\n["ag\\u0065nts"."code-reviewer"]\nconfig_file = "./agents/kaola-workflow/code-reviewer.toml"\n',
      outside: true,
    },
    {
      label: 'long-unicode-escaped outside agent table',
      mutate: text => text + '\n["ag\\U00000065nts"."code-reviewer"]\nconfig_file = "./agents/kaola-workflow/code-reviewer.toml"\n',
      outside: true,
    },
    {
      label: 'unicode-escaped root dotted agent assignment',
      mutate: text => '"ag\\u0065nts"."code-reviewer".config_file = "./agents/kaola-workflow/code-reviewer.toml"\n\n' + text,
      outside: true,
    },
    {
      label: 'long-unicode-escaped root inline agent assignment',
      mutate: text => '"ag\\U00000065nts" = { code-reviewer = { config_file = "./agents/kaola-workflow/code-reviewer.toml" } }\n\n' + text,
      outside: true,
    },
    {
      label: 'indented outside agent table',
      mutate: text => text + '\n  [ agents . code-reviewer ]\nconfig_file = "./agents/kaola-workflow/code-reviewer.toml"\n',
      outside: true,
    },
    {
      label: 'wildcard agents table override',
      mutate: text => text + '\n[agents]\ncode-reviewer = { config_file = "./agents/kaola-workflow/code-reviewer.toml" }\n',
      outside: true,
    },
  ];

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-managed-config-project-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-managed-config-home-'));
  try {
    const installed = runCodexInstaller(installerPath, projectRoot, homeRoot);
    assert.strictEqual(installed.status, 0, 'managed-config fixture install: ' + installed.stderr);
    trustCodexProject(homeRoot, projectRoot);
    const configPath = path.join(projectRoot, '.codex', 'config.toml');
    const canonical = fs.readFileSync(configPath, 'utf8');
    const userProfile = path.join(projectRoot, '.codex', 'agents', 'my-local-role.toml');
    fs.mkdirSync(path.dirname(userProfile), { recursive: true });
    fs.writeFileSync(userProfile,
      'name = "my-local-role"\ndeveloper_instructions = "project user role"\n');
    fs.writeFileSync(configPath, canonical
      + '\n[agents.my-local-role]\n'
      + 'description = "unrelated project user role"\n'
      + 'config_file = "./agents/my-local-role.toml"\n');
    let unrelated = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(unrelated.status, 0,
      'an unrelated project role outside canonical managed markers remains allowed: '
      + unrelated.stderr + unrelated.stdout);
    unrelated = spawnSync(process.execPath,
      [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(unrelated.status, 0,
      'doctor stays green for an unrelated project role outside canonical managed markers: '
      + unrelated.stderr + unrelated.stdout);
    assert.strictEqual(JSON.parse(unrelated.stdout).status, 'ok',
      'unrelated project role does not make the doctor scope stale');

    for (const fixture of cases) {
      const mutated = fixture.mutate(canonical);
      assert.notStrictEqual(mutated, canonical, fixture.label + ': mutation must change config bytes');
      fs.writeFileSync(configPath, mutated);

      const normal = spawnSync(process.execPath,
        [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
        { cwd: pluginRoot, encoding: 'utf8' });
      assert.notStrictEqual(normal.status, 0,
        fixture.label + ': normal preflight must refuse managed config drift');
      const normalJson = JSON.parse(normal.stdout);
      assert.notStrictEqual(normalJson.status, 'ok', fixture.label + ': refusal status must not be ok');
      if (fixture.outside) {
        assert.strictEqual(normalJson.status, 'autofix_unsafe',
          fixture.label + ': outside agents declaration requires manual repair');
      } else {
        assert.strictEqual(normalJson.status, 'config_stale',
          fixture.label + ': managed block byte drift is typed config_stale');
      }

      const doctor = spawnSync(process.execPath,
        [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
        { cwd: pluginRoot, encoding: 'utf8' });
      assert.notStrictEqual(doctor.status, 0, fixture.label + ': doctor must report stale');
      const doctorJson = JSON.parse(doctor.stdout);
      const projectScope = doctorJson.scopes.find(scope => scope.scope === 'project');
      assert(projectScope, fixture.label + ': doctor must include project scope');
      if (fixture.outside) {
        assert((projectScope.conflicting_roles_outside || []).length > 0,
          fixture.label + ': doctor records the outside agents declaration');
      } else {
        assert.strictEqual(projectScope.managed_block_drift, true,
          fixture.label + ': doctor records exact managed block drift');
      }
    }

    fs.writeFileSync(configPath,
      '[mcp_servers.context7.env]\nagents = "ordinary-env-value"\n\n' + canonical);
    const nestedAgentsKey = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(nestedAgentsKey.status, 0,
      'an `agents` key inside a non-agent TOML table is not a top-level override: '
      + nestedAgentsKey.stderr + nestedAgentsKey.stdout);

    const proseOnly = 'decoy = """\n'
      + canonical.trimEnd() + '\n'
      + '[features.multi_agent_v2]\n'
      + 'enabled = true\nnon_code_mode_only = false\n'
      + '"""\n'
      + "literal_notes = '''\n[agents.security-reviewer]\n[features]\n'''\n";
    fs.writeFileSync(configPath, proseOnly);
    const decoyPreflight = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(decoyPreflight.status, 0,
      'a canonical-looking managed block inside multiline prose is not an active block');
    assert.notStrictEqual(JSON.parse(decoyPreflight.stdout).status, 'ok',
      'multiline marker decoy must never satisfy the managed config gate');
    const proseInstall = runCodexInstaller(installerPath, projectRoot, homeRoot);
    assert.strictEqual(proseInstall.status, 0,
      'table-looking lines inside TOML multiline strings must not affect installer parsing: '
      + proseInstall.stderr);
    const proseInstalledConfig = fs.readFileSync(configPath, 'utf8');
    assert(proseInstalledConfig.includes(
      '# BEGIN kaola-workflow agents\n[features]\nmulti_agent = true\n'),
    'multiline prose that says [features] must not suppress the canonical managed features table');
    const prosePreflight = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(prosePreflight.status, 0,
      'table-looking lines inside TOML multiline strings must not create false conflicts or unsafe transport: '
      + prosePreflight.stderr + prosePreflight.stdout);

    fs.writeFileSync(configPath, '  ["features"] # TOML-equivalent quoted table\nmulti_agent = true\n');
    const quotedFeaturesInstall = runCodexInstaller(installerPath, projectRoot, homeRoot);
    assert.strictEqual(quotedFeaturesInstall.status, 0,
      'installer accepts a quoted/indented external features table: '
      + quotedFeaturesInstall.stderr);
    const quotedFeaturesConfig = fs.readFileSync(configPath, 'utf8');
    assert(!quotedFeaturesConfig.includes(
      '# BEGIN kaola-workflow agents\n[features]\n'),
    'quoted external features table suppresses the duplicate managed features table');
    assert(quotedFeaturesConfig.includes(
      '# BEGIN kaola-workflow agents\n[agents.'),
    'quoted external features table selects the canonical agent-only managed body');
    const quotedFeaturesPreflight = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(quotedFeaturesPreflight.status, 0,
      'preflight derives the same managed-body grammar for quoted external features: '
      + quotedFeaturesPreflight.stderr + quotedFeaturesPreflight.stdout);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

// Codex merges config layers from HOME through the repository root to cwd. Profile
// freshness and V2 transport must therefore be evaluated against the effective
// overlay: no lower fresh layer may mask a higher unsafe or stale declaration.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-layered-project-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-layered-home-'));
  try {
    const globalInstall = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: homeRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(globalInstall.status, 0, 'layered fixture global install: ' + globalInstall.stderr);
    trustCodexProject(homeRoot, projectRoot);
    const projectCodex = path.join(projectRoot, '.codex');
    fs.mkdirSync(projectCodex, { recursive: true });
    const projectConfig = path.join(projectCodex, 'config.toml');

    fs.writeFileSync(projectConfig,
      '[features.multi_agent_v2]\n'
      + 'enabled = true\n'
      + 'tool_namespace = "agents"\n'
      + 'hide_spawn_agent_metadata = false\n'
      + 'non_code_mode_only = false\n');
    let result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'project feature-only unsafe V2 must override fresh global profiles');
    assert.strictEqual(JSON.parse(result.stdout).status, 'codex_v2_encrypted_transport_unsafe',
      'effective unsafe project transport has the typed refusal');
    assert.strictEqual(JSON.parse(result.stdout).config_path, projectConfig,
      'unsafe project transport reports the actual winning config layer');
    let doctor = spawnSync(process.execPath,
      [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(doctor.status, 0,
      'doctor must refuse the same feature-only unsafe effective project transport');
    let doctorJson = JSON.parse(doctor.stdout);
    assert((doctorJson.scopes || []).some(scope =>
      scope.scope === 'project'
      && scope.codex_v2_direct_transport_ready === false
      && scope.transport_config_path === projectConfig),
    'doctor project report carries effective unsafe transport and winning provenance');

    fs.writeFileSync(projectConfig,
      '[agents.code-reviewer]\n'
      + 'description = "override"\n'
      + 'config_file = "./agents/kaola-workflow/code-reviewer.toml"\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'one-role project override must not be masked by fresh global profiles');
    assert.strictEqual(JSON.parse(result.stdout).status, 'autofix_unsafe',
      'one-role project override is a typed manual-repair refusal');

    fs.writeFileSync(projectConfig,
      '[agents.code-reviewer.extra]\nvalue = "shadow"\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'a nested table below a managed Kaola role must not be masked by global profiles');
    assert.strictEqual(JSON.parse(result.stdout).status, 'autofix_unsafe',
      'nested managed-role shadow uses the manual-repair refusal');

    fs.mkdirSync(path.join(projectCodex, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(projectCodex, 'agents', 'my-local-role.toml'),
      'name = "my-local-role"\ndeveloper_instructions = "local"\n');
    fs.writeFileSync(projectConfig,
      '[agents.my-local-role]\n'
      + 'description = "unrelated local role"\n'
      + 'config_file = "./agents/my-local-role.toml"\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0,
      'an unrelated valid project role must coexist with fresh global Kaola profiles: '
      + result.stderr + result.stdout);

    const globalConfigPath = path.join(homeRoot, '.codex', 'config.toml');
    const globalCanonical = fs.readFileSync(globalConfigPath, 'utf8');

    fs.writeFileSync(globalConfigPath, globalCanonical
      + '\n[agents."code-reviewer"]\n'
      + 'config_file = "./agents/kaola-workflow/code-reviewer.toml"\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'a duplicate managed Kaola role outside the global managed markers must fail closed');
    assert.strictEqual(JSON.parse(result.stdout).status, 'autofix_unsafe',
      'a duplicate global managed-role declaration requires manual repair');
    doctor = spawnSync(process.execPath,
      [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(doctor.status, 0,
      'doctor must mark an outside duplicate global managed role stale');
    doctorJson = JSON.parse(doctor.stdout);
    const duplicateGlobalScope = (doctorJson.scopes || []).find(scope => scope.scope === 'user');
    assert(duplicateGlobalScope
      && (duplicateGlobalScope.managed_role_conflicts_outside || []).includes('code-reviewer'),
    'doctor reports the exact conflicting global managed role');

    const globalUserRole = path.join(homeRoot, '.codex', 'agents', 'global-user-role.toml');
    fs.mkdirSync(path.dirname(globalUserRole), { recursive: true });
    fs.writeFileSync(globalUserRole,
      'name = "global-user-role"\ndeveloper_instructions = "global user role"\n');
    fs.writeFileSync(globalConfigPath, globalCanonical
      + '\n[agents.global-user-role]\n'
      + 'description = "unrelated global user role"\n'
      + 'config_file = "./agents/global-user-role.toml"\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0,
      'an unrelated global user role must coexist with managed Kaola roles: '
      + result.stderr + result.stdout);
    doctor = spawnSync(process.execPath,
      [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(doctor.status, 0,
      'doctor stays green for an unrelated global user role: '
      + doctor.stderr + doctor.stdout);
    assert.strictEqual(JSON.parse(doctor.stdout).status, 'ok',
      'unrelated global role does not make the doctor scope stale');

    const globalAgentOnly = globalCanonical.replace(
      '# BEGIN kaola-workflow agents\n[features]\nmulti_agent = true\n\n',
      '# BEGIN kaola-workflow agents\n');
    fs.writeFileSync(globalConfigPath,
      '[features]\nmulti_agent = true\n\n'
      + '[features.multi_agent_v2]\n'
      + 'enabled = true\n'
      + 'tool_namespace = "agents"\n'
      + 'hide_spawn_agent_metadata = false\n'
      + 'non_code_mode_only = false\n\n'
      + globalAgentOnly);
    fs.writeFileSync(projectConfig,
      '[features.multi_agent_v2]\n'
      + 'enabled = true\n'
      + 'tool_namespace = "agents"\n'
      + 'hide_spawn_agent_metadata = false\n'
      + 'non_code_mode_only = true\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0,
      'fully safe project transport must override unsafe lower global transport: '
      + result.stderr + result.stdout);
    assert.strictEqual(JSON.parse(result.stdout).codex_v2_role_transport_ready, true,
      'effective overlay reports the higher safe role transport');

    fs.writeFileSync(globalConfigPath,
      '[features]\nmulti_agent = true\n\n'
      + '[features.multi_agent_v2]\n'
      + 'enabled = true\n'
      + 'tool_namespace = "agents"\n'
      + 'hide_spawn_agent_metadata = false\n'
      + 'non_code_mode_only = true\n\n'
      + globalAgentOnly);
    fs.writeFileSync(projectConfig, '[features]\nmulti_agent_v2 = true\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 7,
      'a higher scalar V2 value replaces the lower safe table and must fail the transport gate');
    assert.strictEqual(JSON.parse(result.stdout).status, 'codex_v2_role_transport_unsafe',
      'higher scalar replacement must use Codex defaults, not retain lower role-safe subfields');
    assert.strictEqual(JSON.parse(result.stdout).config_path, projectConfig,
      'scalar/table replacement reports the higher scalar layer as transport authority');

    fs.writeFileSync(globalConfigPath,
      '[features]\nmulti_agent = true\nmulti_agent_v2 = true\n\n' + globalAgentOnly);
    fs.writeFileSync(projectConfig,
      '[features.multi_agent_v2]\n'
      + 'enabled = true\n'
      + 'tool_namespace = "agents"\n'
      + 'hide_spawn_agent_metadata = false\n'
      + 'non_code_mode_only = true\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0,
      'a higher role-safe table replaces a lower scalar V2 value: ' + result.stderr + result.stdout);
    assert.strictEqual(JSON.parse(result.stdout).codex_v2_role_transport_ready, true,
      'scalar-to-table replacement uses only the higher table fields');

    fs.writeFileSync(projectConfig, '[features]\nmulti_agent = true\n');
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'unsafe global transport remains effective when the project does not override it');
    assert.strictEqual(JSON.parse(result.stdout).config_path, globalConfigPath,
      'unsafe global transport reports HOME config, not the selected project profile scope');

    // A nested cwd still loads every project config layer from repository root.
    fs.writeFileSync(globalConfigPath, globalCanonical);
    fs.mkdirSync(path.join(projectRoot, '.git'));
    const nested = path.join(projectRoot, 'src', 'nested');
    fs.mkdirSync(nested, { recursive: true });
    const projectInstall = runCodexInstaller(installerPath, projectRoot, homeRoot);
    assert.strictEqual(projectInstall.status, 0,
      'nested-layer fixture project install: ' + projectInstall.stderr);
    const rootProjectConfig = path.join(projectRoot, '.codex', 'config.toml');
    fs.writeFileSync(rootProjectConfig, fs.readFileSync(rootProjectConfig, 'utf8').replace(
      'config_file = "./agents/kaola-workflow/code-reviewer.toml"',
      'config_file = "./agents/kaola-workflow/security-reviewer.toml"'));
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', nested, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'nested cwd must refuse stale repository-root managed config');
    assert.strictEqual(JSON.parse(result.stdout).status, 'config_stale',
      'root project layer drift remains a typed config refusal from nested cwd');
    doctor = spawnSync(process.execPath,
      [preflightPath, '--doctor', '--project-root', nested, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(doctor.status, 0,
      'doctor from nested cwd must refuse the same stale repository-root layer');
    doctorJson = JSON.parse(doctor.stdout);
    assert((doctorJson.scopes || []).some(scope =>
      scope.codex_dir === path.join(projectRoot, '.codex')
      && scope.managed_block_drift === true),
    'doctor enumerates and reports the stale repository-root project layer');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

// Autofix must repair and then re-verify every trusted loaded project layer,
// not stop after the first stale repository-root footprint while a higher cwd
// override remains active.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-multilayer-project-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-multilayer-home-'));
  const nestedRoot = path.join(projectRoot, 'packages', 'nested');
  try {
    fs.mkdirSync(path.join(projectRoot, '.git'));
    fs.mkdirSync(nestedRoot, { recursive: true });
    let install = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
    });
    assert.strictEqual(install.status, 0, 'multi-layer fixture global install');
    trustCodexProject(homeRoot, projectRoot);
    install = runCodexInstaller(installerPath, projectRoot, homeRoot);
    assert.strictEqual(install.status, 0, 'multi-layer fixture repository-root install');
    install = runCodexInstaller(installerPath, nestedRoot, homeRoot);
    assert.strictEqual(install.status, 0, 'multi-layer fixture nested install');

    const managedDirs = [projectRoot, nestedRoot].map(dir =>
      path.join(dir, '.codex', 'agents', 'kaola-workflow'));
    for (const managedDir of managedDirs) {
      fs.rmSync(path.join(managedDir, 'implementer.toml'));
    }
    let result = spawnSync(process.execPath,
      [preflightPath, '--project-root', nestedRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.notStrictEqual(result.status, 0,
      'two stale trusted layers refuse before autofix');
    assert.strictEqual(JSON.parse(result.stdout).status, 'profiles_missing',
      'multi-layer missing profiles retain the typed refusal');

    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', nestedRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0,
      'autofix repairs every stale trusted layer: ' + result.stderr + result.stdout);
    assert.strictEqual(JSON.parse(result.stdout).autofixed, true,
      'multi-layer repair reports autofixed only after the complete recursive postcheck');
    for (const managedDir of managedDirs) {
      assert(fs.existsSync(path.join(managedDir, 'implementer.toml')),
        'multi-layer repair restores implementer in ' + managedDir);
    }

    for (const managedDir of managedDirs) {
      const profile = path.join(managedDir, 'tdd-guide.toml');
      fs.writeFileSync(profile, fs.readFileSync(profile, 'utf8').replace(
        'name = "tdd-guide"', 'name = "wrong-role"'));
    }
    result = spawnSync(process.execPath,
      [preflightPath, '--project-root', nestedRoot, '--home', homeRoot, '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });
    assert.strictEqual(result.status, 0,
      'autofix repairs malformed profiles in every trusted layer: ' + result.stderr + result.stdout);
    for (const managedDir of managedDirs) {
      assert(/^name = "tdd-guide"$/m.test(fs.readFileSync(
        path.join(managedDir, 'tdd-guide.toml'), 'utf8')),
      'multi-layer malformed repair restores canonical role identity in ' + managedDir);
    }

    const firstRepairTarget = path.join(managedDirs[0], 'implementer.toml');
    fs.rmSync(firstRepairTarget);
    const laterManifestPath = path.join(managedDirs[1], '.kaola-managed-profiles.json');
    const canonicalLaterManifest = fs.readFileSync(laterManifestPath, 'utf8');
    const laterManifest = JSON.parse(canonicalLaterManifest);
    laterManifest.schema_version = 999;
    fs.writeFileSync(laterManifestPath, JSON.stringify(laterManifest, null, 2) + '\n');
    result = codexPreflight.runPreflight({
      projectRoot: nestedRoot,
      home: homeRoot,
      scriptDir: path.join(pluginRoot, 'scripts'),
      planPath: null,
      noAutofix: false,
    });
    assert.strictEqual(result.exitCode, 6,
      'autofix must preflight every stale target before mutating the first one');
    assert.strictEqual(result.result.status, 'profile_schema_version_unsupported',
      'a later future-schema target keeps its typed non-repairable refusal');
    assert(!fs.existsSync(firstRepairTarget),
      'a later unrepairable target must prevent writes to every earlier repair target');

    fs.writeFileSync(laterManifestPath, canonicalLaterManifest);
    const laterConfigPath = path.join(nestedRoot, '.codex', 'config.toml');
    fs.writeFileSync(laterConfigPath, '# BEGIN kaola-workflow agents\n');
    result = codexPreflight.runPreflight({
      projectRoot: nestedRoot,
      home: homeRoot,
      scriptDir: path.join(pluginRoot, 'scripts'),
      planPath: null,
      noAutofix: false,
    });
    assert.strictEqual(result.exitCode, 4,
      'autofix must preflight a later ambiguous marker range before all writes');
    assert.strictEqual(result.result.status, 'autofix_unsafe',
      'a later ambiguous marker range keeps its typed manual-repair refusal');
    assert(!fs.existsSync(firstRepairTarget),
      'a later ambiguous marker range must prevent writes to every earlier target');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
}

// An explicit --home is the complete global authority for both inspection and
// autofix. The child installer must not fall back to the preflight process HOME.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const selectedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-selected-home-'));
  const inheritedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-inherited-home-'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-selected-home-project-'));
  const originalHome = process.env.HOME;
  try {
    const install = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: selectedHome },
      encoding: 'utf8',
    });
    assert.strictEqual(install.status, 0, 'selected-home fixture global install: ' + install.stderr);
    const selectedProfile = path.join(selectedHome, '.codex', 'agents', 'kaola-workflow',
      'implementer.toml');
    fs.rmSync(selectedProfile);

    process.env.HOME = inheritedHome;
    const result = codexPreflight.runPreflight({
      projectRoot,
      home: selectedHome,
      scriptDir: path.join(pluginRoot, 'scripts'),
      planPath: null,
      noAutofix: false,
    });
    assert.strictEqual(result.exitCode, 0,
      'global autofix honors the explicitly selected home: ' + JSON.stringify(result.result));
    assert.strictEqual(result.result.autofixed, true,
      'selected-home repair reports autofixed after persisted re-verification');
    assert(fs.existsSync(selectedProfile),
      'global autofix restores the stale profile beneath the selected home');
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

// Doctor cache inspection is scoped to the exact installed Kaola plugin identity.
// Unrelated plugins must be invisible, while the selected name/version cache is a
// closed, non-symlink source tree with its manifest, config, and every role intact.
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
    fs.cpSync(path.join(pluginRoot, 'agents'), path.join(versionRoot, 'agents'), { recursive: true });
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

  {
    const fixture = cacheFixture();
    try {
      const result = doctor(fixture, true);
      assert.strictEqual(result.exitCode, 0,
        'doctor preserves the normal live installed-source cache layout');
      assert.strictEqual(cacheScope(result).plugin_name, pluginIdentity.name,
        'live installed-source doctor derives its plugin name from its own manifest');
      assert.strictEqual(cacheScope(result).plugin_version, pluginIdentity.version,
        'live installed-source doctor derives its plugin version from its own manifest');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  function cacheScope(result) {
    return result.result.scopes.find(scope => scope.scope === 'plugin_cache');
  }

  {
    const fixture = cacheFixture();
    try {
      const unrelatedAgents = path.join(fixture.homeRoot, '.codex', 'plugins', 'cache',
        marketplace, 'unrelated-plugin', '99.0.0', 'agents');
      fs.mkdirSync(unrelatedAgents, { recursive: true });
      fs.writeFileSync(path.join(unrelatedAgents, 'broken.toml'), 'not valid managed TOML\n');
      const oldKaolaAgents = path.join(fixture.homeRoot, '.codex', 'plugins', 'cache',
        marketplace, pluginIdentity.name, '0.0.1', 'agents');
      fs.mkdirSync(oldKaolaAgents, { recursive: true });
      fs.writeFileSync(path.join(oldKaolaAgents, 'broken.toml'), 'not valid managed TOML\n');
      const result = doctor(fixture);
      assert.strictEqual(result.exitCode, 0,
        'doctor ignores malformed files from unrelated plugins and non-selected versions');
      assert.strictEqual(result.result.scopes.filter(scope => scope.scope === 'plugin_cache').length, 1,
        'doctor reports only the cache matching its own plugin name/version identity');
      assert.strictEqual(cacheScope(result).plugin_name, pluginIdentity.name,
        'plugin cache report exposes the validated manifest name');
      assert.strictEqual(cacheScope(result).plugin_version, pluginIdentity.version,
        'plugin cache report exposes the validated manifest version');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  for (const role of reviewerGenerator.ROLES) {
    const fixture = cacheFixture();
    try {
      fs.rmSync(path.join(fixture.versionRoot, 'agents', role + '.toml'));
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0,
        'doctor rejects a cache missing required reviewer role ' + role);
      assert(cacheScope(result).missing_roles.includes(role),
        'cache report names missing reviewer role ' + role);
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = cacheFixture();
    try {
      fs.rmSync(path.join(fixture.versionRoot, 'agents', 'implementer.toml'));
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0,
        'doctor rejects a cache missing an ordinary configured role');
      assert(cacheScope(result).missing_roles.includes('implementer'),
        'cache report names an ordinary missing template role');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = cacheFixture();
    try {
      fs.writeFileSync(path.join(fixture.versionRoot, 'agents', 'stale-role.toml'),
        'name = "stale-role"\ndescription = "stale"\nnickname_candidates = ["Stale"]\ndeveloper_instructions = """stale"""\n');
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0, 'doctor rejects stale extra cached role TOMLs');
      assert(cacheScope(result).stale_files.includes('stale-role.toml'),
        'cache report names the stale extra role TOML');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  for (const configCase of [
    {
      label: 'missing cached config',
      reason: 'plugin_config_path_missing',
      mutate(fixture) {
        fs.rmSync(path.join(fixture.versionRoot, 'config', 'agents.toml'));
      },
    },
    {
      label: 'symlinked cached config',
      reason: 'plugin_config_path_unsafe',
      mutate(fixture, outsideRoot) {
        const configPath = path.join(fixture.versionRoot, 'config', 'agents.toml');
        const outsideConfig = path.join(outsideRoot, 'agents.toml');
        fs.copyFileSync(configPath, outsideConfig);
        fs.rmSync(configPath);
        fs.symlinkSync(outsideConfig, configPath);
      },
    },
    {
      label: 'byte-drifted cached config',
      reason: 'plugin_config_bytes_mismatch',
      mutate(fixture) {
        fs.appendFileSync(path.join(fixture.versionRoot, 'config', 'agents.toml'),
          '\n# stale cached config\n');
      },
    },
  ]) {
    const fixture = cacheFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-config-'));
    try {
      configCase.mutate(fixture, outsideRoot);
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0, 'doctor rejects ' + configCase.label);
      assert(cacheScope(result).malformed.some(entry =>
        (entry.reasons || []).some(reason => reason.includes(configCase.reason))),
      'cache report types ' + configCase.label + ' as ' + configCase.reason);
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }

  for (const mutation of [
    { field: 'name', value: 'not-kaola-workflow', reason: 'plugin_manifest_name_mismatch' },
    { field: 'version', value: '0.0.0', reason: 'plugin_manifest_version_mismatch' },
  ]) {
    const fixture = cacheFixture();
    try {
      const manifestPath = path.join(fixture.versionRoot, '.codex-plugin', 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest[mutation.field] = mutation.value;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0,
        'doctor rejects cached plugin manifest ' + mutation.field + ' drift');
      assert(cacheScope(result).malformed.some(entry =>
        (entry.reasons || []).some(reason => reason.includes(mutation.reason))),
      'cache report carries typed manifest mismatch ' + mutation.reason);
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = cacheFixture();
    try {
      const manifestPath = path.join(fixture.versionRoot, '.codex-plugin', 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.version = '0.0.0';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      const result = doctor(fixture, true);
      assert.notStrictEqual(result.exitCode, 0,
        'live installed-source doctor rejects manifest identity drift from its version path');
      assert.strictEqual(result.result.status, 'plugin_identity_invalid',
        'live manifest/path mismatch has a typed identity refusal');
      assert(result.result.error.includes('plugin_manifest_version_mismatch'),
        'live identity refusal names the manifest version mismatch');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = cacheFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-outside-'));
    try {
      const manifestPath = path.join(fixture.versionRoot, '.codex-plugin', 'plugin.json');
      const outsideManifest = path.join(outsideRoot, 'plugin.json');
      fs.copyFileSync(manifestPath, outsideManifest);
      fs.rmSync(manifestPath);
      fs.symlinkSync(outsideManifest, manifestPath);
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0, 'doctor rejects a symlinked cached plugin manifest');
      assert(cacheScope(result).malformed.some(entry =>
        (entry.reasons || []).some(reason => reason.includes('plugin_manifest_unsafe'))),
      'cache report types a symlinked manifest as unsafe');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = cacheFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-root-'));
    try {
      const cacheRoot = path.join(fixture.homeRoot, '.codex', 'plugins', 'cache');
      const outsideCache = path.join(outsideRoot, 'cache');
      fs.renameSync(cacheRoot, outsideCache);
      fs.symlinkSync(outsideCache, cacheRoot);
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0, 'doctor rejects a symlinked plugin cache component');
      assert(cacheScope(result).malformed.some(entry =>
        (entry.reasons || []).some(reason => reason.includes('plugin_cache_path_unsafe'))),
      'cache report types a symlinked cache component as unsafe');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }

  for (const inspectionCase of [
    {
      method: 'lstatSync', code: 'EACCES', operation: 'inspect cache root',
      target: fixture => path.join(fixture.homeRoot, '.codex', 'plugins', 'cache'),
      reason: 'plugin_cache_path_unsafe',
    },
    {
      method: 'readdirSync', code: 'EIO', operation: 'list cache root',
      target: fixture => path.join(fixture.homeRoot, '.codex', 'plugins', 'cache'),
      reason: 'plugin_cache_path_unsafe',
    },
    {
      method: 'lstatSync', code: 'EACCES', operation: 'inspect selected plugin directory',
      target: fixture => path.dirname(fixture.versionRoot),
      reason: 'plugin_cache_path_unsafe',
    },
    {
      method: 'lstatSync', code: 'EIO', operation: 'inspect selected version directory',
      target: fixture => fixture.versionRoot,
      reason: 'plugin_cache_path_unsafe',
    },
    {
      method: 'readdirSync', code: 'EIO', operation: 'list selected agents directory',
      target: fixture => path.join(fixture.versionRoot, 'agents'),
      reason: 'plugin_cache_agents_path_unsafe',
    },
  ]) {
    const fixture = cacheFixture();
    try {
      const failingPath = inspectionCase.target(fixture);
      const original = fs[inspectionCase.method];
      let result;
      try {
        fs[inspectionCase.method] = function failCacheInspection(target, ...args) {
          if (path.resolve(String(target)) === path.resolve(failingPath)) {
            const error = new Error(`simulated cache ${inspectionCase.operation} failure`);
            error.code = inspectionCase.code;
            throw error;
          }
          return original.call(fs, target, ...args);
        };
        result = doctor(fixture);
      } finally {
        fs[inspectionCase.method] = original;
      }
      assert.notStrictEqual(result.exitCode, 0,
        `doctor fails closed when it cannot ${inspectionCase.operation}`);
      assert(cacheScope(result),
        `cache ${inspectionCase.operation} failure must remain a visible plugin_cache scope`);
      assert(cacheScope(result).malformed.some(entry =>
        (entry.reasons || []).some(reason => reason.includes(inspectionCase.reason))),
      `cache ${inspectionCase.operation} failure is typed as ${inspectionCase.reason}`);
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
    }
  }

  {
    const fixture = cacheFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-doctor-version-'));
    try {
      fs.cpSync(fixture.versionRoot, outsideRoot, { recursive: true });
      fs.rmSync(fixture.versionRoot, { recursive: true });
      fs.symlinkSync(outsideRoot, fixture.versionRoot);
      const result = doctor(fixture);
      assert.notStrictEqual(result.exitCode, 0, 'doctor rejects a symlinked expected cache version');
      assert(cacheScope(result).malformed.some(entry =>
        (entry.reasons || []).some(reason => reason.includes('plugin_cache_path_unsafe'))),
      'cache report types a symlinked expected version path as unsafe');
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }

  for (const sourceCase of [
    {
      label: 'symlinked live-cache source profile',
      relative: path.join('agents', 'implementer.toml'),
      reason: 'plugin_source_profile_unsafe',
    },
    {
      label: 'symlinked live-cache source config',
      relative: path.join('config', 'agents.toml'),
      reason: 'plugin_config_path_unsafe',
    },
  ]) {
    const fixture = cacheFixture();
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-cache-source-wall-'));
    try {
      const sourcePath = path.join(fixture.versionRoot, sourceCase.relative);
      const outsidePath = path.join(outsideRoot, path.basename(sourceCase.relative));
      fs.renameSync(sourcePath, outsidePath);
      fs.symlinkSync(outsidePath, sourcePath);
      const result = codexPreflight.runPreflight({
        projectRoot: fixture.projectRoot,
        home: fixture.homeRoot,
        scriptDir: path.join(fixture.versionRoot, 'scripts'),
        planPath: null,
        noAutofix: true,
      });
      assert.strictEqual(result.exitCode, 2,
        'normal preflight rejects ' + sourceCase.label + ' before dispatch');
      assert.strictEqual(result.result.status, 'profile_source_stale',
        'normal preflight uses the source-contract refusal for ' + sourceCase.label);
      assert((result.result.malformed || []).some(reason => reason.includes(sourceCase.reason)),
        sourceCase.label + ' carries typed reason ' + sourceCase.reason);
    } finally {
      fs.rmSync(fixture.homeRoot, { recursive: true, force: true });
      fs.rmSync(fixture.projectRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }
}

// The documented repository-root normal and doctor commands read the bundled
// plugin as their source authority while retaining exact identity gates in caches.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-root-doctor-home-'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-root-doctor-project-'));
  try {
    const install = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: homeRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(install.status, 0, 'root-entrypoint fixture global install: ' + install.stderr);

    const normal = spawnSync(process.execPath,
      [path.join(root, 'scripts', 'kaola-workflow-codex-preflight.js'),
        '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(normal.status, 0,
      'repository-root normal command uses the canonical bundled plugin source: '
      + normal.stderr + normal.stdout);
    assert.strictEqual(JSON.parse(normal.stdout).status, 'ok',
      'repository-root normal command verifies the selected installed scope');

    const doctorResult = spawnSync(process.execPath,
      [path.join(root, 'scripts', 'kaola-workflow-codex-preflight.js'),
        '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
      { cwd: root, encoding: 'utf8' });
    assert.strictEqual(doctorResult.status, 0,
      'repository-root doctor command uses the canonical bundled plugin source: '
      + doctorResult.stderr + doctorResult.stdout);
    const report = JSON.parse(doctorResult.stdout);
    assert.strictEqual(report.status, 'ok',
      'repository-root doctor stays green when no installed scope is stale');
    assert((report.scopes || []).some(scope => scope.scope === 'repository'),
      'repository-root doctor reports its bundled repository source scope');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

// #716: a frozen schema-2 plan's ## Nodes table mixes DELEGATED roles with the
// built-in, intentionally non-delegable roles (`main-session-gate`, `finalize`).
// The built-ins run in the main session and carry no Codex profile and no
// config/agents.toml entry BY DESIGN, so exact-plan preflight must exempt them
// from the template/profile availability check — while staying fail-closed for
// any unknown or genuinely missing DELEGATED role. The downstream reproduction
// entry is the repository-root command with `--plan` appended.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const rootPreflightPath = path.join(root, 'scripts', 'kaola-workflow-codex-preflight.js');
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-plan-builtin-home-'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-plan-builtin-project-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-plan-builtin-fixture-'));
  try {
    const install = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: homeRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(install.status, 0, '#716 fixture global install: ' + install.stderr);

    function writePlan(basename, roles) {
      const planPath = path.join(fixtureRoot, basename);
      const rows = roles.map((role, index) =>
        `| n${index + 1} | ${role} | ${index === 0 ? '—' : 'n1'} | — | 1 | sequence | — | — | — | — | — | — | — | — |`);
      fs.writeFileSync(planPath, [
        '# Workflow Plan — #716 fixture',
        '',
        '## Meta',
        'plan_schema_version: 2',
        '',
        '## Nodes',
        '',
        '| id | role | depends_on | declared_write_set | cardinality | shape | selector_source | model | wait_budget_minutes | observes | gate_claim | gate_surface | gate_aggregation | certifies |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rows,
        '',
        '## Node Briefs',
        '',
      ].join('\n'));
      return planPath;
    }

    function runPlanPreflight(planPath) {
      return spawnSync(process.execPath,
        [rootPreflightPath, '--project-root', projectRoot, '--home', homeRoot,
          '--no-autofix', '--json', '--plan', planPath],
        { cwd: root, encoding: 'utf8' });
    }

    // (a) delegated roles + both built-in non-delegable roles pass exact-plan
    // preflight on a fresh install, with NO fabricated built-in profiles.
    const mixedPlan = writePlan('workflow-plan-mixed.md',
      ['implementer', 'code-reviewer', 'main-session-gate', 'finalize']);
    const mixed = runPlanPreflight(mixedPlan);
    assert.strictEqual(mixed.status, 0,
      '#716(a): mixed delegated + built-in plan must pass exact-plan preflight: '
      + mixed.stderr + mixed.stdout);
    const mixedJson = JSON.parse(mixed.stdout);
    assert.strictEqual(mixedJson.status, 'ok',
      '#716(a): a fresh install keeps the ok status under --plan');
    assert(!mixedJson.roles_checked.includes('main-session-gate')
        && !mixedJson.roles_checked.includes('finalize'),
      '#716(a): built-in non-delegable roles are exempt from the profile availability check');
    assert(mixedJson.roles_checked.includes('implementer')
        && mixedJson.roles_checked.includes('code-reviewer'),
      '#716(a): delegated plan roles keep the required-role union behavior');
    const globalAgentsDir = path.join(homeRoot, '.codex', 'agents', 'kaola-workflow');
    assert(!fs.existsSync(path.join(globalAgentsDir, 'main-session-gate.toml'))
        && !fs.existsSync(path.join(globalAgentsDir, 'finalize.toml')),
      '#716(a): no fake profiles exist for the non-delegable roles');

    // (b) an unknown DELEGATED role still refuses, naming that role.
    const unknownPlan = writePlan('workflow-plan-unknown.md', ['implementer', 'not-a-real-role']);
    const unknown = runPlanPreflight(unknownPlan);
    assert.notStrictEqual(unknown.status, 0,
      '#716(b): an unknown delegated role must still refuse exact-plan preflight');
    const unknownJson = JSON.parse(unknown.stdout);
    assert.strictEqual(unknownJson.status, 'role_not_in_template',
      '#716(b): an unknown delegated role keeps the role_not_in_template refusal');
    assert((unknownJson.missing_roles || []).includes('not-a-real-role'),
      '#716(b): the refusal names the unknown delegated role');

    // (c) a genuinely missing DELEGATED profile still refuses under --plan.
    fs.rmSync(path.join(globalAgentsDir, 'implementer.toml'));
    const missingProfile = runPlanPreflight(mixedPlan);
    assert.notStrictEqual(missingProfile.status, 0,
      '#716(c): a truly missing delegated profile must still refuse under --plan');
    const missingJson = JSON.parse(missingProfile.stdout);
    assert.strictEqual(missingJson.status, 'profiles_missing',
      '#716(c): the missing delegated profile keeps the profiles_missing refusal');
    assert((missingJson.missing_roles || []).includes('implementer'),
      '#716(c): the refusal names the missing delegated profile');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
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
    const install = spawnSync(process.execPath, [installerPath, '--global'], {
      cwd: pluginRoot,
      env: { ...process.env, HOME: homeRoot },
      encoding: 'utf8',
    });
    assert.strictEqual(install.status, 0,
      'multiline root-marker fixture fresh global install: ' + install.stderr);
    const globalConfig = path.join(homeRoot, '.codex', 'config.toml');
    const canonical = fs.readFileSync(globalConfig, 'utf8');
    const invoke = () => spawnSync(process.execPath,
      [preflightPath, '--project-root', projectRoot, '--home', homeRoot,
        '--no-autofix', '--json'],
      { cwd: pluginRoot, encoding: 'utf8' });

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

// Codex loads project `.codex` layers only after an explicit project trust
// decision. The gate must refuse ignored Kaola footprints, exclude ignored
// transport, honor exact per-layer/root trust precedence, and use the persisted
// project_root_markers when discovering layers from a nested workdir.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const invoke = (projectRoot, homeRoot, doctor = false) => spawnSync(process.execPath,
    [preflightPath, ...(doctor ? ['--doctor'] : []), '--project-root', projectRoot,
      '--home', homeRoot, '--no-autofix', '--json'],
    { cwd: pluginRoot, encoding: 'utf8' });

  for (const trustLevel of ['unknown', 'untrusted']) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kaola-trust-${trustLevel}-project-`));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kaola-trust-${trustLevel}-home-`));
    try {
      let install = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
      });
      assert.strictEqual(install.status, 0, trustLevel + ': global fixture install');
      install = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.strictEqual(install.status, 0, trustLevel + ': project fixture install');
      if (trustLevel === 'untrusted') trustCodexProject(homeRoot, projectRoot, 'untrusted');
      if (trustLevel === 'unknown') {
        const managedDir = path.join(projectRoot, '.codex', 'agents', 'kaola-workflow');
        const externalManagedDir = path.join(homeRoot, 'ignored-project-agent-authority');
        fs.renameSync(managedDir, externalManagedDir);
        fs.symlinkSync(externalManagedDir, managedDir);
      }

      const normal = invoke(projectRoot, homeRoot);
      assert.notStrictEqual(normal.status, 0,
        trustLevel + ': ignored project Kaola footprint must refuse normal preflight');
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.status, 'project_trust_required',
        trustLevel + ': normal preflight uses the typed trust refusal');
      assert.strictEqual(normalJson.project_trust, trustLevel,
        trustLevel + ': normal refusal records the effective trust level');
      assert.strictEqual(normalJson.authority_path, undefined,
        trustLevel + ': ignored project authority is not followed or reclassified before trust');

      const doctor = invoke(projectRoot, homeRoot, true);
      assert.notStrictEqual(doctor.status, 0,
        trustLevel + ': doctor must gate the same ignored Kaola footprint');
      const doctorJson = JSON.parse(doctor.stdout);
      assert.strictEqual(doctorJson.project_trust_required, true,
        trustLevel + ': doctor exposes the same trust blocker');
      assert.strictEqual(doctorJson.project_trust, trustLevel,
        trustLevel + ': doctor records effective project trust');
      assert((doctorJson.scopes || []).some(scope =>
        scope.kaola_footprint === true && scope.project_trust === trustLevel),
      trustLevel + ': doctor identifies the ignored Kaola project scope');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }

  for (const ambiguity of ['duplicate', 'invalid']) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kaola-trust-${ambiguity}-project-`));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kaola-trust-${ambiguity}-home-`));
    try {
      let install = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
      });
      assert.strictEqual(install.status, 0, ambiguity + ': global fixture install');
      install = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.strictEqual(install.status, 0, ambiguity + ': project fixture install');
      const globalConfig = path.join(homeRoot, '.codex', 'config.toml');
      fs.appendFileSync(globalConfig,
        `\n[projects.${JSON.stringify(path.resolve(projectRoot))}]\n`
        + (ambiguity === 'duplicate'
          ? 'trust_level = "trusted"\ntrust_level = "untrusted"\n'
          : 'trust_level = "conditionally-trusted"\n'));

      const normal = invoke(projectRoot, homeRoot);
      assert.notStrictEqual(normal.status, 0,
        ambiguity + ': ambiguous trust configuration must fail closed');
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.status, 'project_trust_required',
        ambiguity + ': ambiguous trust uses the typed trust refusal');
      assert.strictEqual(normalJson.project_trust, 'ambiguous',
        ambiguity + ': ambiguity is explicit, never silently trusted');

      const doctor = invoke(projectRoot, homeRoot, true);
      assert.notStrictEqual(doctor.status, 0,
        ambiguity + ': doctor must fail closed on the same trust ambiguity');
      const doctorJson = JSON.parse(doctor.stdout);
      assert.strictEqual(doctorJson.project_trust, 'ambiguous',
        ambiguity + ': doctor reports trust ambiguity');
      assert.strictEqual(doctorJson.project_trust_required, true,
        ambiguity + ': doctor exposes the trust blocker');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }

  {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-trust-ignored-transport-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-trust-ignored-transport-home-'));
    try {
      const install = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
      });
      assert.strictEqual(install.status, 0, 'ignored transport: global fixture install');
      trustCodexProject(homeRoot, projectRoot, 'untrusted');
      const projectCodex = path.join(projectRoot, '.codex');
      fs.mkdirSync(projectCodex, { recursive: true });
      fs.writeFileSync(path.join(projectCodex, 'config.toml'),
        '[features.multi_agent_v2]\n'
        + 'enabled = true\n'
        + 'tool_namespace = "agents"\n'
        + 'hide_spawn_agent_metadata = false\n'
        + 'non_code_mode_only = false\n');

      const normal = invoke(projectRoot, homeRoot);
      assert.strictEqual(normal.status, 0,
        'unsafe transport in an untrusted, footprint-free project config is excluded: '
        + normal.stderr + normal.stdout);
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.scope, 'global', 'ignored project transport leaves global profiles active');
      assert.strictEqual(normalJson.multi_agent_v2_enabled, false,
        'ignored project V2 keys do not enter the effective runtime');

      const doctor = invoke(projectRoot, homeRoot, true);
      assert.strictEqual(doctor.status, 0,
        'doctor also excludes untrusted project transport: ' + doctor.stderr + doctor.stdout);
      const doctorJson = JSON.parse(doctor.stdout);
      assert.strictEqual(doctorJson.project_trust_required, false,
        'a footprint-free ignored config requires no trust decision');
      assert((doctorJson.scopes || []).some(scope =>
        scope.codex_dir === projectCodex && scope.config_layer_ignored === true),
      'doctor labels the untrusted project layer ignored');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }

  {
    const trustedParent = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-trusted-parent-'));
    const repositoryRoot = path.join(trustedParent, 'repository');
    const nestedRoot = path.join(repositoryRoot, 'src', 'nested');
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-trusted-parent-home-'));
    try {
      fs.mkdirSync(repositoryRoot, { recursive: true });
      fs.writeFileSync(path.join(repositoryRoot, 'ROOT.marker'), 'root\n');
      fs.mkdirSync(nestedRoot, { recursive: true });
      let install = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
      });
      assert.strictEqual(install.status, 0, 'trusted parent: global fixture install');
      const globalConfig = path.join(homeRoot, '.codex', 'config.toml');
      fs.writeFileSync(globalConfig,
        '"project_root_mark\\u0065rs" = ["ROOT.marker"]\n\n'
        + fs.readFileSync(globalConfig, 'utf8'));
      install = runCodexInstaller(installerPath, repositoryRoot, homeRoot);
      assert.strictEqual(install.status, 0, 'trusted parent: project fixture install');
      trustCodexProject(homeRoot, trustedParent, 'trusted');
      const projectConfig = path.join(repositoryRoot, '.codex', 'config.toml');
      fs.appendFileSync(projectConfig,
        '\n[features.multi_agent_v2]\n'
        + 'enabled = true\n'
        + 'tool_namespace = "agents"\n'
        + 'hide_spawn_agent_metadata = false\n'
        + 'non_code_mode_only = true\n');

      let normal = invoke(nestedRoot, homeRoot);
      assert.notStrictEqual(normal.status, 0,
        'an arbitrary trusted parent must not authorize a descendant project layer');
      let normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.status, 'project_trust_required',
        'trusted parent mismatch uses the typed trust refusal');

      trustCodexProject(homeRoot, repositoryRoot, 'trusted');
      normal = invoke(nestedRoot, homeRoot);
      assert.strictEqual(normal.status, 0,
        'exact detected-root trust enables repository config from a nested cwd: '
        + normal.stderr + normal.stdout);
      normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.dispatch_mode, 'v2-task-name',
        'custom project_root_markers discovers the trusted root V2 layer');
      assert.strictEqual(normalJson.codex_v2_role_transport_ready, true,
        'trusted project role transport remains safe');

      for (const keySpelling of ['"project_root_markers"', "'project_root_markers'"]) {
        const currentGlobal = fs.readFileSync(globalConfig, 'utf8');
        fs.writeFileSync(globalConfig, currentGlobal.replace(
          /^"project_root_mark(?:\\u0065|e)rs"|^'project_root_markers'/m,
          keySpelling));
        const spellingResult = invoke(nestedRoot, homeRoot);
        assert.strictEqual(spellingResult.status, 0,
          `${keySpelling}: TOML-equivalent root-marker key discovers the same trusted layer: `
          + spellingResult.stderr + spellingResult.stdout);
      }

      let doctor = invoke(nestedRoot, homeRoot, true);
      assert.strictEqual(doctor.status, 0,
        'doctor honors exact detected-root trust: ' + doctor.stderr + doctor.stdout);
      let doctorJson = JSON.parse(doctor.stdout);
      assert((doctorJson.scopes || []).some(scope =>
        scope.codex_dir === path.join(repositoryRoot, '.codex')
        && scope.codex_v2_role_transport_ready === true),
      'doctor applies the custom-marker repository-root transport from nested cwd');

      // Exact nested trust outranks the shared detected-root fallback for that
      // layer only; an ignored unsafe nested transport must not mask the still
      // trusted root profile/config authority.
      trustCodexProject(homeRoot, nestedRoot, 'untrusted');
      {
        const trustConfig = fs.readFileSync(globalConfig, 'utf8');
        const lastTrust = trustConfig.lastIndexOf('trust_level = "untrusted"');
        assert(lastTrust >= 0, 'nested trust fixture must contain its exact untrusted decision');
        fs.writeFileSync(globalConfig,
          trustConfig.slice(0, lastTrust)
          + '"trust_l\\u0065vel" = "untrusted"'
          + trustConfig.slice(lastTrust + 'trust_level = "untrusted"'.length));
      }
      const nestedCodex = path.join(nestedRoot, '.codex');
      fs.mkdirSync(nestedCodex, { recursive: true });
      fs.writeFileSync(path.join(nestedCodex, 'config.toml'),
        '[features.multi_agent_v2]\n'
        + 'enabled = true\n'
        + 'tool_namespace = "agents"\n'
        + 'hide_spawn_agent_metadata = false\n'
        + 'non_code_mode_only = false\n');
      normal = invoke(nestedRoot, homeRoot);
      assert.strictEqual(normal.status, 0,
        'exact nested untrusted excludes only that layer while trusted root remains active: '
        + normal.stderr + normal.stdout);
      normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.codex_v2_role_transport_ready, true,
        'ignored nested unsafe transport cannot override trusted root safe transport');
      for (const keySpelling of ['"trust_level"', "'trust_level'"]) {
        const trustConfig = fs.readFileSync(globalConfig, 'utf8');
        fs.writeFileSync(globalConfig, trustConfig.replace(
          /^"trust_l(?:\\u0065|e)vel"|^'trust_level'/m,
          keySpelling));
        const spellingResult = invoke(nestedRoot, homeRoot);
        assert.strictEqual(spellingResult.status, 0,
          `${keySpelling}: exact nested untrusted decision must outrank trusted root fallback: `
          + spellingResult.stderr + spellingResult.stdout);
      }
      doctor = invoke(nestedRoot, homeRoot, true);
      assert.strictEqual(doctor.status, 0,
        'doctor applies the same per-layer trust precedence');
      doctorJson = JSON.parse(doctor.stdout);
      assert((doctorJson.scopes || []).some(scope =>
        scope.codex_dir === nestedCodex
        && scope.project_trust === 'untrusted'
        && scope.config_layer_ignored === true),
      'doctor reports exact nested layer as ignored without disabling trusted root');
    } finally {
      fs.rmSync(trustedParent, { recursive: true, force: true });
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
      const result = spawnSync(process.execPath,
        [preflightPath, '--project-root', projectRoot, '--home', homeRoot, '--no-autofix', '--json'],
        { cwd: pluginRoot, encoding: 'utf8' });
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

// Exact profile bytes are insufficient if a scope authority path can be redirected
// after install. Normal preflight and doctor both reject symlinked scope/agent/profile
// and manifest paths before reading through them.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
  const preflightPath = path.join(pluginRoot, 'scripts', 'kaola-workflow-codex-preflight.js');
  const cases = [
    {
      label: 'Codex scope directory symlink',
      expectedStatus: 'config_layer_unsafe',
      redirect(homeRoot, outsideRoot) {
        const source = path.join(homeRoot, '.codex');
        const target = path.join(outsideRoot, 'codex-scope');
        fs.renameSync(source, target);
        fs.symlinkSync(target, source);
      },
    },
    {
      label: 'agents parent directory symlink',
      expectedStatus: 'scope_authority_unsafe',
      redirect(homeRoot, outsideRoot) {
        const source = path.join(homeRoot, '.codex', 'agents');
        const target = path.join(outsideRoot, 'agents');
        fs.renameSync(source, target);
        fs.symlinkSync(target, source);
      },
    },
    {
      label: 'managed agent directory symlink',
      expectedStatus: 'scope_authority_unsafe',
      redirect(homeRoot, outsideRoot) {
        const source = path.join(homeRoot, '.codex', 'agents', 'kaola-workflow');
        const target = path.join(outsideRoot, 'managed-agents');
        fs.renameSync(source, target);
        fs.symlinkSync(target, source);
      },
    },
    {
      label: 'required profile symlink',
      expectedStatus: 'scope_authority_unsafe',
      redirect(homeRoot, outsideRoot) {
        const source = path.join(homeRoot, '.codex', 'agents', 'kaola-workflow',
          'code-reviewer.toml');
        const target = path.join(outsideRoot, 'code-reviewer.toml');
        fs.renameSync(source, target);
        fs.symlinkSync(target, source);
      },
    },
    {
      label: 'managed manifest symlink',
      expectedStatus: 'scope_authority_unsafe',
      redirect(homeRoot, outsideRoot) {
        const source = path.join(homeRoot, '.codex', 'agents', 'kaola-workflow',
          '.kaola-managed-profiles.json');
        const target = path.join(outsideRoot, 'manifest.json');
        fs.renameSync(source, target);
        fs.symlinkSync(target, source);
      },
    },
  ];

  for (const fixture of cases) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-authority-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-authority-home-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-authority-outside-'));
    try {
      const install = spawnSync(process.execPath, [installerPath, '--global'], {
        cwd: pluginRoot, env: { ...process.env, HOME: homeRoot }, encoding: 'utf8',
      });
      assert.strictEqual(install.status, 0, fixture.label + ': global fixture install');
      fixture.redirect(homeRoot, outsideRoot);

      const normal = spawnSync(process.execPath,
        [preflightPath, '--project-root', projectRoot, '--home', homeRoot,
          '--no-autofix', '--json'],
        { cwd: pluginRoot, encoding: 'utf8' });
      assert.notStrictEqual(normal.status, 0,
        fixture.label + ': normal preflight must reject redirected authority');
      const normalJson = JSON.parse(normal.stdout);
      assert.strictEqual(normalJson.status, fixture.expectedStatus,
        fixture.label + ': normal typed authority refusal');
      assert(!/\n\s+at /.test(normal.stderr), fixture.label + ': normal refusal has no Node stack');

      const doctor = spawnSync(process.execPath,
        [preflightPath, '--doctor', '--project-root', projectRoot, '--home', homeRoot, '--json'],
        { cwd: pluginRoot, encoding: 'utf8' });
      assert.notStrictEqual(doctor.status, 0,
        fixture.label + ': doctor must reject the same redirected authority');
      const doctorJson = JSON.parse(doctor.stdout);
      assert.strictEqual(doctorJson.status, 'stale', fixture.label + ': doctor typed stale result');
      assert((doctorJson.scopes || []).some(scope =>
        scope.config_layer_unsafe === true || scope.scope_authority_unsafe === true),
      fixture.label + ': doctor identifies the unsafe authority scope');
      assert(!/\n\s+at /.test(doctor.stderr), fixture.label + ': doctor refusal has no Node stack');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  }
}

// Reviewer profiles are generated contracts, not merely syntactically valid TOML. The installer
// wall must reject contract/version/hash drift before any repository or installed-scope write.
{
  const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
  const reviewer = fs.readFileSync(path.join(pluginRoot, 'agents', 'code-reviewer.toml'), 'utf8');
  const cases = [
    {
      label: 'missing behavior contract version',
      text: reviewer.replace(/^behavior_contract_version: 2\n/m, ''),
      code: 'reviewer_behavior_core_version_missing',
    },
    {
      label: 'unsupported behavior contract version',
      text: reviewer.replace(/^behavior_contract_version: 2$/m, 'behavior_contract_version: 1'),
      code: 'reviewer_contract_version_unsupported',
    },
    {
      label: 'malformed behavior hash',
      text: reviewer.replace(/^behavior_contract_hash: [0-9a-f]{64}$/m,
        'behavior_contract_hash: malformed'),
      code: 'reviewer_behavior_core_hash_missing',
    },
    {
      label: 'unsupported top-level reviewer metadata',
      text: reviewer.replace(/^developer_instructions =/m,
        'behavior_contract_version = 2\ndeveloper_instructions ='),
      code: 'reviewer_adapter_field_forbidden',
    },
    {
      label: 'resolved profile hash mismatch',
      text: reviewer.replace('Precision-first code review specialist',
        'Precision-first code-review specialist'),
      code: 'reviewer_resolved_profile_hash_mismatch',
    },
    {
      label: 'foreign adapter field',
      text: reviewer.replace(/^developer_instructions =/m,
        'adapter_prompt = "foreign"\ndeveloper_instructions ='),
      code: 'reviewer_adapter_field_forbidden',
    },
    {
      label: 'foreign adapter field after instructions',
      text: reviewer + '\nadapter_prompt = "foreign"\n',
      code: 'reviewer_adapter_field_forbidden',
    },
    {
      label: 'foreign adapter table after instructions',
      text: reviewer + '\n[adapter]\nprompt = "foreign"\n',
      code: 'reviewer_adapter_table_forbidden',
    },
    {
      label: 'foreign dotted adapter field after instructions',
      text: reviewer + '\nadapter.prompt = "foreign"\n',
      code: 'reviewer_adapter_field_forbidden',
    },
    {
      label: 'quoted retired reviewer metadata with valid self-hash',
      text: resignCodexReviewer(reviewer.replace(/^developer_instructions/m,
        '"behavior_contract_version" = 2\ndeveloper_instructions')),
      code: 'reviewer_adapter_field_forbidden',
    },
    {
      label: 'indented model override with valid self-hash',
      text: resignCodexReviewer(reviewer.replace(/^developer_instructions/m,
        '  model = "gpt-5.6-sol"\ndeveloper_instructions')),
      code: 'reviewer_adapter_field_forbidden',
    },
    {
      label: 'commented foreign table before instructions with valid self-hash',
      text: resignCodexReviewer(reviewer.replace(/^developer_instructions/m,
        '[shadow] # valid TOML table\ndeveloper_instructions')),
      code: 'reviewer_adapter_table_forbidden',
    },
    {
      label: 'duplicate canonical top-level field with valid self-hash',
      text: resignCodexReviewer(reviewer.replace(/^description/m,
        'name = "code-reviewer"\ndescription')),
      code: 'reviewer_top_level_field_duplicate',
    },
    {
      label: 'duplicate behavior version before the marked core',
      text: resignCodexReviewer(reviewer.replace(/^developer_instructions = """$/m,
        'developer_instructions = """\nbehavior_contract_version: 1')),
      code: 'reviewer_behavior_contract_version_not_unique',
    },
    {
      label: 'duplicate behavior hash before the marked core',
      text: resignCodexReviewer(reviewer.replace(/^developer_instructions = """$/m,
        `developer_instructions = """\nbehavior_contract_hash: ${'f'.repeat(64)}`)),
      code: 'reviewer_behavior_contract_hash_not_unique',
    },
    {
      label: 'duplicate reviewer role inside the marked core',
      text: resignCodexReviewer(reviewer.replace('role: code-reviewer',
        'role: code-reviewer\nrole: security-reviewer')),
      code: 'reviewer_behavior_core_role_not_unique',
    },
    {
      label: 'resolved hash without its identity markers',
      text: resignCodexReviewer(reviewer
        .replace('<!-- reviewer-profile-identity:start -->\n', '')
        .replace('<!-- reviewer-profile-identity:end -->\n', '')),
      code: 'reviewer_profile_identity_invalid',
    },
    {
      label: 'invalid TOML escape inside reviewer instructions',
      text: resignCodexReviewer(reviewer.replace('## Prompt defense',
        '## Prompt defense\n\n- invalid TOML escape: \\q')),
      code: 'reviewer_instruction_toml_backslash_forbidden',
    },
    {
      label: 'invalid TOML escape inside reviewer description',
      text: resignCodexReviewer(reviewer.replace(/^description = .*$/m,
        'description = "Bad \\q"')),
      code: 'reviewer_toml_backslash_forbidden',
    },
    {
      label: 'invalid TOML escape inside reviewer nickname array',
      text: resignCodexReviewer(reviewer.replace(/^nickname_candidates = .*$/m,
        'nickname_candidates = ["Bad \\q"]')),
      code: 'reviewer_toml_backslash_forbidden',
    },
    {
      label: 'raw control character in reviewer TOML comment',
      text: resignCodexReviewer(`# raw control \u0001\n${reviewer}`),
      code: 'reviewer_toml_control_character_forbidden',
    },
    {
      label: 'bare carriage return inside reviewer instructions',
      text: resignCodexReviewer(reviewer.replace('## Prompt defense', '## Prompt defense\rX')),
      code: 'reviewer_toml_line_endings_forbidden',
    },
  ];
  for (const fixture of cases) {
    const reasons = codexProfileInstaller.validateProfileText(fixture.text, 'code-reviewer');
    assert(reasons.some(reason => reason.includes(fixture.code)),
      fixture.label + ' must fail with ' + fixture.code + '; got ' + JSON.stringify(reasons));
    const preflightReasons = codexPreflight.validateProfileText(fixture.text, 'code-reviewer');
    assert(preflightReasons.some(reason => reason.includes(fixture.code)),
      'preflight: ' + fixture.label + ' must fail with ' + fixture.code
        + '; got ' + JSON.stringify(preflightReasons));
  }

  const ordinary = fs.readFileSync(path.join(pluginRoot, 'agents', 'implementer.toml'), 'utf8');
  const ordinaryMutations = [
    ordinary.replace(/^developer_instructions/m, '"model" = "gpt-5.6-sol"\ndeveloper_instructions'),
    ordinary.replace(/^developer_instructions/m, '  model = "gpt-5.6-sol"\ndeveloper_instructions'),
    ordinary.replace(/^developer_instructions/m, '[shadow] # valid TOML table\ndeveloper_instructions'),
    ordinary.replace(/^description/m, 'name = "implementer"\ndescription'),
    ordinary.replace('Purpose:', 'Purpose:\n- invalid TOML escape: \\q'),
    ordinary.replace('Purpose:', 'Purpose:\rX'),
    `# raw control \u0001\n${ordinary}`,
  ];
  for (const [index, mutation] of ordinaryMutations.entries()) {
    assert(codexProfileInstaller.validateProfileText(mutation, 'implementer').length > 0,
      `ordinary managed role closed-schema mutation ${index + 1} must fail`);
    assert(codexPreflight.validateProfileText(mutation, 'implementer').length > 0,
      `preflight ordinary managed role closed-schema mutation ${index + 1} must fail`);
  }
  const sourceCheck = codexProfileInstaller.validateSourceProfiles(pluginRoot);
  assert(sourceCheck.ok,
    'repository reviewer profiles and config catalog must be reconciled before install: ' +
    sourceCheck.errors.join('; '));

  const catalogMutations = [
    {
      label: 'duplicate role entry',
      expected: 'duplicate [agents.implementer] entry',
      mutate(fixtureRoot, template) {
        const block = template.match(/\[agents\.implementer\][\s\S]*?(?=\n\[agents\.|\s*$)/);
        assert(block, 'duplicate-role fixture must find the implementer catalog block');
        fs.appendFileSync(path.join(fixtureRoot, 'config', 'agents.toml'), `\n${block[0].trim()}\n`);
      },
    },
    {
      label: 'duplicate basename reference',
      expected: 'duplicate config_file basename "implementer.toml" reference',
      mutate(fixtureRoot, template) {
        fs.writeFileSync(path.join(fixtureRoot, 'config', 'agents.toml'), template.replace(
          'config_file = "./agents/kaola-workflow/code-explorer.toml"',
          'config_file = "./agents/kaola-workflow/implementer.toml"'));
      },
    },
    {
      label: 'role and basename mismatch',
      expected: '[agents.implementer] config_file basename must be "implementer.toml"',
      mutate(fixtureRoot, template) {
        fs.writeFileSync(path.join(fixtureRoot, 'config', 'agents.toml'), template.replace(
          'config_file = "./agents/kaola-workflow/implementer.toml"',
          'config_file = "./agents/kaola-workflow/renamed-implementer.toml"'));
        fs.renameSync(
          path.join(fixtureRoot, 'agents', 'implementer.toml'),
          path.join(fixtureRoot, 'agents', 'renamed-implementer.toml'));
      },
    },
  ];
  for (const fixture of catalogMutations) {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-agent-catalog-bijection-'));
    try {
      fs.cpSync(path.join(pluginRoot, 'config'), path.join(fixtureRoot, 'config'), { recursive: true });
      fs.cpSync(path.join(pluginRoot, 'agents'), path.join(fixtureRoot, 'agents'), { recursive: true });
      const templatePath = path.join(fixtureRoot, 'config', 'agents.toml');
      fixture.mutate(fixtureRoot, fs.readFileSync(templatePath, 'utf8'));

      const installerCheck = codexProfileInstaller.validateSourceProfiles(fixtureRoot);
      assert.strictEqual(installerCheck.ok, false,
        fixture.label + ': installer source wall must reject the non-bijective catalog');
      assert(installerCheck.errors.some(error => error.includes(fixture.expected)),
        fixture.label + ': installer must report ' + fixture.expected
        + '; got ' + JSON.stringify(installerCheck.errors));

      const preflightCheck = codexPreflight.readTemplateRoles(path.join(fixtureRoot, 'scripts'));
      assert((preflightCheck.sourceErrors || []).some(error => error.includes(fixture.expected)),
        fixture.label + ': preflight source wall must report ' + fixture.expected
        + '; got ' + JSON.stringify(preflightCheck.sourceErrors));
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  }

  const staleRepository = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-reviewer-source-drift-'));
  try {
    fs.cpSync(path.join(pluginRoot, 'config'), path.join(staleRepository, 'config'), { recursive: true });
    fs.cpSync(path.join(pluginRoot, 'agents'), path.join(staleRepository, 'agents'), { recursive: true });
    const stalePath = path.join(staleRepository, 'agents', 'code-reviewer.toml');
    fs.writeFileSync(stalePath, fs.readFileSync(stalePath, 'utf8').replace(
      'Precision-first code review specialist', 'Precision-first stale code review specialist'));
    const staleCheck = codexProfileInstaller.validateSourceProfiles(staleRepository);
    assert(!staleCheck.ok, 'modified repository reviewer profile must fail source validation');
    assert.strictEqual(staleCheck.repair,
      'node scripts/generate-reviewer-profiles.js --write && node scripts/generate-reviewer-profiles.js --check',
      'repository drift must carry the exact generator repair command');
  } finally {
    fs.rmSync(staleRepository, { recursive: true, force: true });
  }
}

function readInstalledCommand(name) {
  return fs.readFileSync(path.join(tmp, '.claude', 'commands', name), 'utf8');
}

function parseCodexAgentMetadata(pluginRoot) {
  const config = fs.readFileSync(path.join(pluginRoot, 'config', 'agents.toml'), 'utf8');
  const out = new Map();
  let current = null;
  for (const line of config.split(/\r?\n/)) {
    const head = line.match(/^\[agents\.([a-z0-9-]+)\]\s*$/);
    if (head) {
      current = { description: null, nicknameLine: null };
      out.set(head[1], current);
      continue;
    }
    if (!current) continue;
    const desc = line.match(/^description\s*=\s*("[^"]*")\s*$/);
    if (desc) current.description = desc[1];
    const nick = line.match(/^nickname_candidates\s*=\s*(\[[^\]]*\])\s*$/);
    if (nick) current.nicknameLine = nick[1];
  }
  return out;
}

try {
  const higherInstallOutput = execFileSync(
    'bash',
    ['install.sh', '--yes', '--forge=github', '--profile=higher', '--no-settings-merge'],
    {
      cwd: root,
      env: { ...process.env, HOME: tmp },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const finalize = readInstalledCommand('kaola-workflow-finalize.md');
  const adapt = readInstalledCommand('kaola-workflow-adapt.md');

  // The always-opus workflow-planner tier (adapt command) renders opus under the higher profile;
  // the finalize command carries the sonnet routed-fix (tdd-guide / build-error-resolver) and
  // doc-updater tiers. (The profile-sensitive reviewer/architect tiers are proven at the agent-model
  // manifest level below, the surface the adaptive resolver actually reads.)
  assert(adapt.includes('subagent_type="workflow-planner",\n  model="opus",'),
    'higher profile should render the workflow-planner as opus');
  assert(finalize.includes('model="sonnet",'), 'doc-updater should render as sonnet');
  assert(
    finalize.includes('\n\n## Validation Delegation Policy\n\n'),
    'installer rendering should preserve blank markdown lines'
  );
  assert(
    finalize.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'finalize routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    finalize.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'finalize routed-fix tdd-guide block should render as sonnet'
  );

  const allCommands = fs.readdirSync(path.join(tmp, '.claude', 'commands'))
    .filter(name => name.endsWith('.md'))
    .map(name => readInstalledCommand(name))
    .join('\n');
  assert(!/model="\{[A-Z_]+_MODEL\}"/.test(allCommands), 'installed commands must not keep model placeholders');
  // #610: the plan-column tier rename (opus/sonnet → reasoning/standard) is the PLAN vocabulary only —
  // it must NOT leak into the Claude Agent(model=…) rendering, which stays the concrete Claude aliases
  // (they feed the harness verbatim). A neutral token as an Agent model value would be a dispatch bug.
  assert(!/model="(reasoning|standard)"/.test(allCommands),
    'installed commands must render concrete Claude model aliases, never the neutral plan-tier tokens');

  const requiredAgents = ['code-explorer','knowledge-lookup','planner','code-architect','tdd-guide',
    'build-error-resolver','code-reviewer','security-reviewer','doc-updater','adversarial-verifier','contractor','workflow-planner','synthesizer'];
  for (const agent of requiredAgents) {
    const installed = fs.readFileSync(path.join(tmp,'.claude','agents',agent+'.md'),'utf8');
    const fmEnd = installed.indexOf('\n---', 3);
    const frontmatter = installed.slice(0, fmEnd === -1 ? installed.length : fmEnd);
    assert(/\bmodel:\s*inherit\b/.test(frontmatter), agent+' installed frontmatter must be model: inherit');
    assert(installed.includes('kaola-workflow-managed-agent: true'), agent+' installed file must keep managed marker');
    if (reviewerGenerator.ROLES.includes(agent)) {
      const baseSource = path.join(root, 'agents', agent + '.md');
      const higherSource = path.join(root, 'agents', 'profiles', 'higher', agent + '.md');
      const selectedSource = fs.existsSync(higherSource) ? higherSource : baseSource;
      const expectedInstalled = renderClaudeInstalledReviewer(fs.readFileSync(selectedSource, 'utf8'));
      assert.strictEqual(installed, expectedInstalled,
        agent + ' installed bytes must equal the selected generated source after the documented inherit rewrite');
      assert.doesNotThrow(() => reviewerGenerator.verifyResolvedProfileHash(installed),
        agent + ' installed resolved_profile_hash must bind the complete installed bytes');
      assert.strictEqual(reviewerGenerator.extractBehaviorCore(installed),
        reviewerGenerator.extractBehaviorCore(fs.readFileSync(selectedSource, 'utf8')),
      agent + ' installed behavior core must byte-match the generated source core');
    }
  }
  const claudeManifestLines = fs.readFileSync(
    path.join(tmp, '.claude', 'agents', '.kaola-workflow-agent-manifest'), 'utf8').trim().split('\n');
  for (const role of reviewerGenerator.ROLES) {
    const row = claudeManifestLines.find(line => line.startsWith(role + '.md\t'));
    assert(row, 'Claude managed-agent manifest must carry ' + role);
    const columns = row.split('\t');
    assert(columns.length === 5 && columns[2] === '2'
      && /^[0-9a-f]{64}$/.test(columns[3]) && /^[0-9a-f]{64}$/.test(columns[4]),
    'Claude managed-agent manifest must record installed sha, behavior version/hash, and resolved profile hash for ' + role);
  }
  assert(higherInstallOutput.includes('filesystem bytes only; runtime prompt loading is not attested'),
    'Claude installer must state the filesystem-only proof boundary without claiming private prompt loading');

  // Default profile is `higher`: an install with NO --profile flag must resolve the profile-sensitive
  // reviewer/architect tier to opus (this is what locks the default). Proven via the .kaola-agent-models.json
  // manifest — the surface the adaptive resolver actually reads — since the retired phase[1-5] command
  // surfaces that once carried these placeholders no longer exist. The explicit --profile=common contrast
  // is covered by the manifest section (ii) below.
  {
    const dtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-default-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: dtmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dtmp, '.claude', 'agents', '.kaola-agent-models.json'), 'utf8'));
      assert(manifest['code-architect'] === 'opus',
        'no-flag install must resolve code-architect→opus (higher is the default profile); got ' + manifest['code-architect']);
      assert(manifest['code-reviewer'] === 'opus',
        'no-flag install must resolve code-reviewer→opus (higher is the default profile); got ' + manifest['code-reviewer']);
    } finally { fs.rmSync(dtmp, { recursive: true, force: true }); }
  }

  // issue #242: .kaola-agent-models.json manifest — produced by install.sh so the
  // adaptive resolver has a profile-aware model for every agent.
  //
  // (i) higher-profile install: manifest exists, maps planner→opus, sonnet agents→sonnet,
  //     and higher-profile trio (code-architect/code-reviewer/security-reviewer)→opus.
  {
    const htmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-manifest-higher-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--profile=higher', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: htmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const manifestPath = path.join(htmp, '.claude', 'agents', '.kaola-agent-models.json');
      assert(fs.existsSync(manifestPath), 'higher-profile install must write .kaola-agent-models.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert(manifest['planner'] === 'opus', 'manifest must map planner→opus; got ' + manifest['planner']);
      assert(manifest['code-architect'] === 'opus', 'higher manifest must map code-architect→opus; got ' + manifest['code-architect']);
      assert(manifest['code-reviewer'] === 'opus', 'higher manifest must map code-reviewer→opus; got ' + manifest['code-reviewer']);
      assert(manifest['security-reviewer'] === 'opus', 'higher manifest must map security-reviewer→opus; got ' + manifest['security-reviewer']);
      assert(manifest['tdd-guide'] === 'sonnet', 'manifest must map tdd-guide→sonnet; got ' + manifest['tdd-guide']);
      assert(manifest['code-explorer'] === 'sonnet', 'manifest must map code-explorer→sonnet; got ' + manifest['code-explorer']);
      assert(manifest['contractor'] === 'sonnet', 'higher manifest must map contractor→sonnet');
      assert(manifest['workflow-planner'] === 'opus', 'higher manifest must map workflow-planner→opus; got ' + manifest['workflow-planner']);
      assert(manifest['synthesizer'] === 'opus', 'higher manifest must map synthesizer→opus; got ' + manifest['synthesizer']);
      // #646: the governed issue-scout tier — higher profile installs the profiles/higher/issue-scout.md
      // (model: opus) override, so the manifest the adaptive resolver reads must map issue-scout→opus.
      assert(manifest['issue-scout'] === 'opus', 'higher manifest must map issue-scout→opus; got ' + manifest['issue-scout']);
      // All keys must be non-empty and in {opus,sonnet}
      for (const [k, v] of Object.entries(manifest)) {
        assert(v === 'opus' || v === 'sonnet', 'manifest value for ' + k + ' must be opus or sonnet; got ' + v);
      }
    } finally { fs.rmSync(htmp, { recursive: true, force: true }); }
  }

  // (ii) common-profile install: manifest maps security-reviewer→sonnet (profile-aware contrast).
  {
    const cmtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-manifest-common-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--profile=common', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: cmtmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const manifestPath = path.join(cmtmp, '.claude', 'agents', '.kaola-agent-models.json');
      assert(fs.existsSync(manifestPath), 'common-profile install must write .kaola-agent-models.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert(manifest['security-reviewer'] === 'sonnet', 'common manifest must map security-reviewer→sonnet (no higher override); got ' + manifest['security-reviewer']);
      assert(manifest['code-architect'] === 'sonnet', 'common manifest must map code-architect→sonnet; got ' + manifest['code-architect']);
      assert(manifest['code-reviewer'] === 'sonnet', 'common manifest must map code-reviewer→sonnet; got ' + manifest['code-reviewer']);
      assert(manifest['planner'] === 'opus', 'common manifest must still map planner→opus; got ' + manifest['planner']);
      assert(manifest['contractor'] === 'sonnet', 'common manifest must map contractor→sonnet (the contractor stays sonnet under every profile); got ' + manifest['contractor']);
      assert(manifest['workflow-planner'] === 'opus', 'common manifest must still map workflow-planner→opus (Opus under every profile); got ' + manifest['workflow-planner']);
      // #646: the governed issue-scout tier — common profile has no higher override, so the base
      // agents/issue-scout.md (model: sonnet) tier lands; the manifest must map issue-scout→sonnet.
      assert(manifest['issue-scout'] === 'sonnet', 'common manifest must map issue-scout→sonnet (no higher override); got ' + manifest['issue-scout']);
    } finally { fs.rmSync(cmtmp, { recursive: true, force: true }); }
  }

  // #363: forge installs must run end-to-end (HOME=tmpdir) — the prior suite only exercised
  // --forge=github, so the forge copy/verify paths (now fail-closed) were never run. Assert each
  // forge install exits 0 + writes a VALID-JSON manifest (the node encoder) + a rendered hooks.json.
  for (const forge of ['gitlab', 'gitea']) {
    const ftmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-' + forge + '-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=' + forge, '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: ftmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const manifestPath = path.join(ftmp, '.claude', 'agents', '.kaola-agent-models.json');
      assert(fs.existsSync(manifestPath), forge + ' install must write the agent model manifest');
      JSON.parse(fs.readFileSync(manifestPath, 'utf8')); // throws if invalid JSON (#363 encoder)
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
        "  gitea: ['kaola-gitea-forge.js',",
        "  gitea: ['kaola-gitea-NONEXISTENT-typo-363.js', 'kaola-gitea-forge.js',");
      assert(injected !== original, 'planted-typo test: failed to inject a bogus gitea manifest entry');
      fs.writeFileSync(typoManifest, injected);
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

  // #363: the manifest encoder must produce VALID JSON even when a model value contains a quote or
  // backslash (the string-concat builder it replaced would emit corrupt JSON). Exercise the exact
  // node encoding used in install.sh with a hostile value.
  {
    const etmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-quote-'));
    try {
      const out = path.join(etmp, 'manifest.json');
      execFileSync('node',
        ['-e', 'const fs=require("fs");const o2=process.argv[1];const a=process.argv.slice(2);const o={};for(let i=0;i<a.length;i+=2)o[a[i]]=a[i+1];fs.writeFileSync(o2,JSON.stringify(o,null,2)+"\\n");',
         out, 'planner', 'op"us\\back'],
        { encoding: 'utf8' });
      const parsed = JSON.parse(fs.readFileSync(out, 'utf8')); // throws if the quote/backslash broke JSON
      assert(parsed.planner === 'op"us\\back', '#363: quote/backslash in a model value round-trips through valid JSON; got ' + JSON.stringify(parsed.planner));
    } finally { fs.rmSync(etmp, { recursive: true, force: true }); }
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
      assert(managedIds.length >= 2, '#447 AC1: global hooks.json must carry at least two kaola-workflow: entries; found ' + managedIds.length + ': ' + managedIds.join(', '));
      const expectedIds = ['kaola-workflow:compact-context', 'kaola-workflow:subagent-dispatch-log'];
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

      // AC2: positional-form override installs agent profiles to the given project path.
      // (#571: --global is the documented default for new installs; passing a path positionally
      // is an optional per-repo override that installs to that path's .codex/.)
      const projectAgentsDir = path.join(cproj, '.codex', 'agents', 'kaola-workflow');
      assert(fs.existsSync(projectAgentsDir), '#447 AC2: positional-form override must create .codex/agents/kaola-workflow/ at the given path');
      const tomlFiles = fs.readdirSync(projectAgentsDir).filter(f => f.endsWith('.toml'));
      assert(tomlFiles.length > 0, '#447 AC2: positional-form override must write at least one agent profile .toml to the given path');
      const metadata = parseCodexAgentMetadata(path.join(root, 'plugins', 'kaola-workflow'));
      for (const file of tomlFiles) {
        const role = file.replace(/\.toml$/, '');
        const expected = metadata.get(role);
        assert(expected, '#581: installed profile role must exist in config/agents.toml: ' + role);
        const body = fs.readFileSync(path.join(projectAgentsDir, file), 'utf8');
        assert(body.includes('description = ' + expected.description + '\n'),
          '#581: installed ' + file + ' must carry config description metadata');
        assert(body.includes('nickname_candidates = ' + expected.nicknameLine + '\n'),
          '#581: installed ' + file + ' must carry config nickname_candidates metadata');
      }
      const installedProfileManifest = JSON.parse(fs.readFileSync(
        path.join(projectAgentsDir, '.kaola-managed-profiles.json'), 'utf8'));
      for (const role of reviewerGenerator.ROLES) {
        const file = role + '.toml';
        const sourceBytes = fs.readFileSync(path.join(root, 'plugins', 'kaola-workflow', 'agents', file));
        const installedBytes = fs.readFileSync(path.join(projectAgentsDir, file));
        assert(sourceBytes.equals(installedBytes),
          '#reviewer-contract: installed ' + file + ' must byte-match its selected source');
        const text = installedBytes.toString('utf8');
        assert.deepStrictEqual(installedProfileManifest.profile_contracts[file],
          parseCodexReviewerIdentity(text),
          '#reviewer-contract: manifest must bind behavior/profile identity for ' + file);
      }

      // AC2: managed [agents.*] block in the positional-form project's .codex/config.toml
      const projectConfigPath = path.join(cproj, '.codex', 'config.toml');
      assert(fs.existsSync(projectConfigPath), '#447 AC2: positional-form override must write .codex/config.toml to the given path');
      const configText = fs.readFileSync(projectConfigPath, 'utf8');
      assert(configText.includes('# BEGIN kaola-workflow agents'), '#447 AC2: positional-form config.toml must contain managed agents block');
      const codexPreflightPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-codex-preflight.js');
      function configWithFeatureSettings(multiAgent, line) {
        const agentOnlyManaged = configText.replace(
          '# BEGIN kaola-workflow agents\n[features]\nmulti_agent = true\n\n',
          '# BEGIN kaola-workflow agents\n');
        const externalFeatures = /^\s*\[features\./.test(line)
          ? `[features]\nmulti_agent = ${multiAgent}\n\n${line}\n\n`
          : `[features]\nmulti_agent = ${multiAgent}${line ? `\n${line}` : ''}\n\n`;
        return externalFeatures + agentOnlyManaged;
      }
      function configWithFeatureLine(line) {
        return configWithFeatureSettings('true', line);
      }
      const roleSafeV2Inline = 'multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true }';
      const roleSafeV2Table = '[features.multi_agent_v2]\nenabled = true\ntool_namespace = "agents"\nhide_spawn_agent_metadata = false\nnon_code_mode_only = true';
      function assertDispatchModeForConfig(body, expectedMode, label, checkDoctor) {
        fs.writeFileSync(projectConfigPath, body);
        const result = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        const expectedRoleReady = expectedMode === 'v2-task-name'
          ? /tool_namespace\s*=\s*["']agents["']/.test(body)
            && /hide_spawn_agent_metadata\s*=\s*false/.test(body)
            && !/non_code_mode_only\s*=\s*false/.test(body)
          : null;
        assert.strictEqual(result.status === 0, expectedRoleReady !== false,
          label + ': preflight role-transport result: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.dispatch_mode, expectedMode, label + ': dispatch_mode');
        assert.strictEqual(json.multi_agent_v2_enabled, expectedMode === 'v2-task-name', label + ': multi_agent_v2_enabled');
        assert.strictEqual(json.codex_v2_transport_mode,
          expectedMode === 'v2-task-name' ? 'direct-only' : 'not_applicable',
          label + ': codex_v2_transport_mode');
        assert.strictEqual(json.codex_v2_direct_transport_ready,
          expectedMode === 'v2-task-name' ? true : null,
          label + ': codex_v2_direct_transport_ready');
        assert.strictEqual(json.codex_v2_role_transport_ready, expectedRoleReady,
          label + ': codex_v2_role_transport_ready');
        if (expectedRoleReady === false) {
          assert.strictEqual(json.status, 'codex_v2_role_transport_unsafe',
            label + ': role-aware V2 must fail with typed schema refusal');
        }
        if (checkDoctor) {
          const doctorResult = spawnSync(process.execPath, [codexPreflightPath, '--doctor', '--project-root', cproj, '--home', chome, '--json'], {
            cwd: path.join(root, 'plugins', 'kaola-workflow'),
            encoding: 'utf8'
          });
          const doctorJson = JSON.parse(doctorResult.stdout);
          const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
          assert(projectScope && projectScope.dispatch_mode === expectedMode,
            label + ': doctor project scope reports ' + expectedMode + ', got ' + JSON.stringify(projectScope));
          assert.strictEqual(projectScope.codex_v2_transport_mode,
            expectedMode === 'v2-task-name' ? 'direct-only' : 'not_applicable',
            label + ': doctor codex_v2_transport_mode');
          assert.strictEqual(projectScope.codex_v2_role_transport_ready, expectedRoleReady,
            label + ': doctor codex_v2_role_transport_ready');
        }
      }

      function assertUnsafeV2RoleTransportForConfig(body, label) {
        fs.writeFileSync(projectConfigPath, body);
        const result = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        assert.notStrictEqual(result.status, 0, label + ': reserved/hidden role transport must fail');
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.status, 'codex_v2_role_transport_unsafe', label + ': typed role refusal');
        assert.strictEqual(json.codex_v2_direct_transport_ready, true, label + ': direct transport itself remains ready');
        assert.strictEqual(json.codex_v2_role_transport_ready, false, label + ': role transport readiness');
        assert(/tool_namespace = "agents"/.test(json.repair), label + ': repair names the proven namespace');

        const installResult = spawnSync(process.execPath, [codexInstallerPath, cproj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: chome },
          encoding: 'utf8'
        });
        assert.notStrictEqual(installResult.status, 0, label + ': installer must refuse before writes');
        assert(/codex_v2_role_transport_unsafe/.test(installResult.stderr),
          label + ': installer prints typed role refusal: ' + installResult.stderr);
      }

      function assertUnsafeV2TransportForConfig(body, label, expectedMode = 'nested-allowed') {
        fs.writeFileSync(projectConfigPath, body);
        const result = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        assert.strictEqual(result.status, 7,
          label + ': nested-allowed V2 transport must fail preflight: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.status, 'codex_v2_encrypted_transport_unsafe', label + ': typed refusal');
        assert.strictEqual(json.codex_v2_transport_mode, expectedMode, label + ': transport mode');
        assert.strictEqual(json.codex_v2_direct_transport_ready, false, label + ': transport readiness');

        const doctorResult = spawnSync(process.execPath, [codexPreflightPath, '--doctor', '--project-root', cproj, '--home', chome, '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        assert.notStrictEqual(doctorResult.status, 0, label + ': doctor must fail on nested-allowed V2 transport');
        const doctorJson = JSON.parse(doctorResult.stdout);
        const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
        assert(projectScope && projectScope.codex_v2_transport_mode === expectedMode
          && projectScope.codex_v2_direct_transport_ready === false,
        label + ': doctor must expose unsafe transport fields, got ' + JSON.stringify(projectScope));
        assert(/non_code_mode_only = true/.test(projectScope.repair),
          label + ': doctor repair must name the direct-only setting, got ' + projectScope.repair);

        const installResult = spawnSync(process.execPath, [codexInstallerPath, cproj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: chome },
          encoding: 'utf8'
        });
        assert.notStrictEqual(installResult.status, 0,
          label + ': installer must refuse unsafe transport before writing');
        assert(/codex_v2_encrypted_transport_unsafe/.test(installResult.stderr),
          label + ': installer must print the typed transport refusal: ' + installResult.stderr);
      }

      let preflight = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
        cwd: path.join(root, 'plugins', 'kaola-workflow'),
        encoding: 'utf8'
      });
      assert.strictEqual(preflight.status, 0, '#581: preflight over fresh project profiles must pass: ' + preflight.stderr + preflight.stdout);
      let preflightJson = JSON.parse(preflight.stdout);
      assert.strictEqual(preflightJson.dispatch_mode, 'v1-thread-id', '#581: preflight reports v1-thread-id by default');
      const reviewerProfilePath = path.join(projectAgentsDir, 'code-reviewer.toml');
      const reviewerProfileBeforeDrift = fs.readFileSync(reviewerProfilePath, 'utf8');
      fs.writeFileSync(reviewerProfilePath, reviewerProfileBeforeDrift.replace(
        'Precision-first code review specialist', 'Precision-first modified code review specialist'));
      const reviewerDrift = spawnSync(process.execPath,
        [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'],
        { cwd: path.join(root, 'plugins', 'kaola-workflow'), encoding: 'utf8' });
      assert.notStrictEqual(reviewerDrift.status, 0,
        '#reviewer-contract: modified installed project profile must fail preflight');
      const reviewerDriftJson = JSON.parse(reviewerDrift.stdout);
      assert.strictEqual(reviewerDriftJson.status, 'profiles_stale',
        '#reviewer-contract: exact-byte drift must be classified profiles_stale');
      assert.strictEqual(reviewerDriftJson.repair, `node ${codexInstallerPath} ${cproj}`,
        '#reviewer-contract: project drift must name the exact scoped installer command');
      const repairedReviewer = spawnSync(process.execPath,
        [codexPreflightPath, '--project-root', cproj, '--home', chome, '--json'],
        { cwd: path.join(root, 'plugins', 'kaola-workflow'), encoding: 'utf8' });
      assert.strictEqual(repairedReviewer.status, 0,
        '#reviewer-contract: project drift autofix must reinstall exact source bytes: ' + repairedReviewer.stderr);
      assert(fs.readFileSync(reviewerProfilePath).equals(
        fs.readFileSync(path.join(root, 'plugins', 'kaola-workflow', 'agents', 'code-reviewer.toml'))),
      '#reviewer-contract: project autofix must restore exact selected source bytes');
      const legacyProfilePath = path.join(projectAgentsDir, 'implementer.toml');
      const inheritedProfile = fs.readFileSync(legacyProfilePath, 'utf8');
      fs.writeFileSync(legacyProfilePath, inheritedProfile.replace(/^developer_instructions/m,
        'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions'));
      const configBeforeMigration = fs.readFileSync(projectConfigPath, 'utf8');
      const staleLegacy = spawnSync(process.execPath,
        [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'],
        { cwd: path.join(root, 'plugins', 'kaola-workflow'), encoding: 'utf8' });
      assert.notStrictEqual(staleLegacy.status, 0, 'legacy pinned project profile must not satisfy preflight');
      const staleLegacyJson = JSON.parse(staleLegacy.stdout);
      assert.strictEqual(staleLegacyJson.status, 'profiles_stale', 'legacy full pin has the stale migration status');
      assert(Array.isArray(staleLegacyJson.stale_profiles)
        && staleLegacyJson.stale_profiles.some(p => p.role === 'implementer'), 'stale result names the legacy profile');
      const migratedLegacy = spawnSync(process.execPath,
        [codexPreflightPath, '--project-root', cproj, '--home', chome, '--json'],
        { cwd: path.join(root, 'plugins', 'kaola-workflow'), encoding: 'utf8' });
      assert.strictEqual(migratedLegacy.status, 0, 'default project preflight migrates a legacy full pin: ' + migratedLegacy.stderr);
      assert.strictEqual(JSON.parse(migratedLegacy.stdout).autofixed, true, 'legacy migration reports autofixed');
      const migratedProfile = fs.readFileSync(legacyProfilePath, 'utf8');
      assert(!/^model\s*=/m.test(migratedProfile) && !/^model_reasoning_effort\s*=/m.test(migratedProfile),
        'legacy migration installs the inherited omission posture');
      assert.strictEqual(fs.readFileSync(projectConfigPath, 'utf8'), configBeforeMigration,
        'profile migration does not rewrite the root-level user-owned dispatch posture');
      assertDispatchModeForConfig(configText, 'v1-thread-id', '#584 no multi_agent_v2 key', false);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = true'), 'v2-task-name', '#584 boolean true', true);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = false'), 'v1-thread-id', '#584 boolean false', false);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true }'), 'v2-task-name', '#650 inline role transport ready', true);
      assertUnsafeV2RoleTransportForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = true, hide_spawn_agent_metadata = false, non_code_mode_only = true }'), '#650 reserved collaboration schema with visible metadata');
      assertUnsafeV2RoleTransportForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = true, non_code_mode_only = true }'), '#650 hidden role metadata');
      assertUnsafeV2TransportForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = true, hide_spawn_agent_metadata = false, non_code_mode_only = false }'), '#584 inline object nested transport');
      assertUnsafeV2TransportForConfig(configWithFeatureLine('"multi_agent_v\\u0032" = { "enabled" = true, \'tool_namespace\' = "agents", "hide_spawn_agent_metadata" = false, \'non_code_mode_only\' = false }'), '#runtime-grammar quoted and Unicode-equivalent assignment keys');
      assertUnsafeV2TransportForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = true, non_code_mode_only = "maybe" }'), '#584 inline object ambiguous transport', 'unknown');
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = false, hide_spawn_agent_metadata = false, non_code_mode_only = false }'), 'v1-thread-id', '#584 inline object enabled false', false);
      assertDispatchModeForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = true'), 'v2-task-name', '#584 table enabled true', true);
      assertUnsafeV2TransportForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = true\nnon_code_mode_only = false'), '#584 dotted table nested transport');
      assertUnsafeV2TransportForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = true\nnon_code_mode_only = "maybe"'), '#584 dotted table ambiguous transport', 'unknown');
      assertDispatchModeForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = false'), 'v1-thread-id', '#584 table enabled false', false);
      assertDispatchModeForConfig(configWithFeatureLine('["features.multi_agent_v2"]\nenabled = true'), 'v1-thread-id', '#647 basic quoted literal dotted table must not enable v2', false);
      assertDispatchModeForConfig(configWithFeatureLine('[\'features.multi_agent_v2\']\nenabled = true'), 'v1-thread-id', '#647 literal quoted dotted table must not enable v2', false);
      assertDispatchModeForConfig(configWithFeatureLine('[[features.multi_agent_v2]]\nenabled = true'), 'v1-thread-id', '#647 R2 array-of-table dotted v2 table must not enable v2', false);
      assertDispatchModeForConfig(configWithFeatureLine('[[features."multi_agent_v2"]]\nenabled = true'), 'v1-thread-id', '#647 R2 quoted-segment array-of-table v2 table must not enable v2', false);
      assertDispatchModeForConfig(
        configWithFeatureLine('[features.multi_agent_v2]\nenabled = true\n\n[projects."/tmp/kaola-project"]\nenabled = true\n\n[plugins."sample@test"]\nenabled = true'),
        'v2-task-name', '#647 quoted project/plugin tables after dotted v2 table reset parser state', true);
      assertDispatchModeForConfig(
        configWithFeatureLine('[features.multi_agent_v2]\nenabled = true\n\n[[plugins.\'sample@test\'.mcp_servers]]\nenabled = true'),
        'v2-task-name', '#647 array-of-table literal quoted segment after dotted v2 table resets parser state', false);
      assertDispatchModeForConfig(
        configWithFeatureLine('[features.multi_agent_v2]\nenabled = true\n\n[[features.multi_agent_v2]]\nenabled = false'),
        'v2-task-name', '#647 R2 exact array-of-table after dotted v2 table resets parser state', false);
      assertDispatchModeForConfig('[notice]\nsuppress_unstable_features_warning = true\n\n' + configText, 'v1-thread-id', '#584 warning suppression only', false);
      assertDispatchModeForConfig('multi_agent_v2 = true\n\n' + configText, 'v1-thread-id', '#584 top-level key ignored', false);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { hide_spawn_agent_metadata = false }'), 'v1-thread-id', '#584 inline object missing enabled fails closed', false);

      // #598 AC2: effort-gated MultiAgentMode dispatch-POSTURE E2E coverage (distinct from
      // dispatch_mode above — posture reflects whether the runtime will REFUSE a spawn, not
      // just whether the tools are exposed). ATTESTATION-STYLE / NON-FATAL: every case below
      // must still exit 0 — a non-proactive posture is a WARN, never a preflight failure.
      function assertDispatchPostureForConfig(body, expectedPosture, label) {
        fs.writeFileSync(projectConfigPath, body);
        const result = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        assert.strictEqual(result.status, 0, label + ': dispatch-posture WARN must never fail preflight: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.dispatch_posture, expectedPosture,
          label + ': expected dispatch_posture ' + expectedPosture + ', got ' + JSON.stringify(json.dispatch_posture));
        assert.strictEqual(json.dispatch_posture_warning === null, expectedPosture === 'proactive',
          label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(json.dispatch_posture_warning));
      }
      assertDispatchPostureForConfig(configText, 'explicitRequestOnly', '#598 base fixture (multi_agent=true, no effort)');
      assertDispatchPostureForConfig(configWithFeatureSettings('false', ''), 'none',
        '#598 multi_agent=false, no multi_agent_v2 -> none');
      assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + configText, 'proactive',
        '#598 effort=ultra with multi_agent=true -> proactive');
      assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + configText, 'explicitRequestOnly',
        '#598 effort=xhigh (below ultra) stays explicitRequestOnly');
      assertDispatchPostureForConfig(
        'model_reasoning_effort = "ultra"\n\n' + configWithFeatureSettings('false', ''),
        'none', '#598 effort=ultra but features disabled -> none (features gate outranks effort)');
      assertDispatchPostureForConfig(configWithFeatureLine(roleSafeV2Inline), 'explicitRequestOnly',
        '#598 multi_agent_v2=true, no effort -> explicitRequestOnly');
      assertDispatchPostureForConfig(
        'model_reasoning_effort = "ultra"\n\n' + configWithFeatureLine(roleSafeV2Inline).replace('multi_agent = true', 'multi_agent = false'),
        'proactive', '#598 multi_agent=false + multi_agent_v2=true + effort=ultra -> proactive (either feature gates)');
      assertDispatchPostureForConfig(configWithFeatureLine('model_reasoning_effort = "ultra"'),
        'explicitRequestOnly', '#598 effort AFTER the first [table] is not a valid TOML root key -> ignored');

      // #611 AC6: MultiAgentV2 concurrency + wait-timeout bounds E2E coverage — extends the
      // dispatch-posture report above with the effective v2 slot budget and wait-timeout knobs.
      // ATTESTATION-STYLE / NON-FATAL: every case below must still exit 0.
      function assertMultiAgentV2BoundsForConfig(body, expected, label) {
        fs.writeFileSync(projectConfigPath, body);
        const result = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        assert.strictEqual(result.status, 0, label + ': multi_agent_v2 bounds report must never fail preflight: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        for (const key of Object.keys(expected)) {
          assert.strictEqual(json[key], expected[key],
            label + ': expected ' + key + ' ' + JSON.stringify(expected[key]) + ', got ' + JSON.stringify(json[key]));
        }
      }
      assertMultiAgentV2BoundsForConfig(configText, {
        max_concurrent_threads_per_session: null,
        max_concurrent_threads_per_session_source: 'not_applicable',
        effective_subagent_width: null,
        min_wait_timeout_ms: null,
        max_wait_timeout_ms: null,
        default_wait_timeout_ms: null,
      }, '#611 v2 not enabled -> not_applicable, all null');
      assertMultiAgentV2BoundsForConfig(configWithFeatureLine(roleSafeV2Inline), {
        max_concurrent_threads_per_session: 4,
        max_concurrent_threads_per_session_source: 'observed_default',
        effective_subagent_width: 3,
        min_wait_timeout_ms: null,
        max_wait_timeout_ms: null,
        default_wait_timeout_ms: null,
      }, '#611 v2 enabled, no bounds configured -> observed default 4 / width 3');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true, max_concurrent_threads_per_session = 6 }'),
        {
          max_concurrent_threads_per_session: 6,
          max_concurrent_threads_per_session_source: 'config',
          effective_subagent_width: 5,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#611 v2 enabled via inline object, threads configured -> config source, width = threads-1');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine(roleSafeV2Table + '\nmax_concurrent_threads_per_session = 2\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\ndefault_wait_timeout_ms = 60000'),
        {
          max_concurrent_threads_per_session: 2,
          max_concurrent_threads_per_session_source: 'config',
          effective_subagent_width: 1,
          min_wait_timeout_ms: 1000,
          max_wait_timeout_ms: 1800000,
          default_wait_timeout_ms: 60000,
        }, '#611 v2 enabled via dotted table form, all four numeric fields configured');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine(roleSafeV2Table + '\n\n[mcp_servers."srv"]\nmax_concurrent_threads_per_session = 99'),
        {
          max_concurrent_threads_per_session: 4,
          max_concurrent_threads_per_session_source: 'observed_default',
          effective_subagent_width: 3,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#647 quoted unrelated table after dotted v2 table must not over-collect bounds');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine(roleSafeV2Table + '\n\n["features.multi_agent_v2"]\nmax_concurrent_threads_per_session = 99'),
        {
          max_concurrent_threads_per_session: 4,
          max_concurrent_threads_per_session_source: 'observed_default',
          effective_subagent_width: 3,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#647 basic quoted literal dotted table must not over-collect bounds');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine(roleSafeV2Table + '\n\n[\'features.multi_agent_v2\']\nmax_concurrent_threads_per_session = 99'),
        {
          max_concurrent_threads_per_session: 4,
          max_concurrent_threads_per_session_source: 'observed_default',
          effective_subagent_width: 3,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#647 literal quoted dotted table must not over-collect bounds');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('[[features.multi_agent_v2]]\nenabled = true\nmax_concurrent_threads_per_session = 9'),
        {
          max_concurrent_threads_per_session: null,
          max_concurrent_threads_per_session_source: 'not_applicable',
          effective_subagent_width: null,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#647 R2 array-of-table dotted v2 table must not enable v2 or collect bounds');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('[[features."multi_agent_v2"]]\nenabled = true\nmax_concurrent_threads_per_session = 9'),
        {
          max_concurrent_threads_per_session: null,
          max_concurrent_threads_per_session_source: 'not_applicable',
          effective_subagent_width: null,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#647 R2 quoted-segment array-of-table v2 table must not enable v2 or collect bounds');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine(roleSafeV2Table + '\n\n[[features.multi_agent_v2]]\nmax_concurrent_threads_per_session = 99'),
        {
          max_concurrent_threads_per_session: 4,
          max_concurrent_threads_per_session_source: 'observed_default',
          effective_subagent_width: 3,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#647 R2 exact array-of-table after dotted v2 table must not over-collect bounds');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('multi_agent_v2 = { enabled = false, max_concurrent_threads_per_session = 8 }'),
        {
          max_concurrent_threads_per_session: null,
          max_concurrent_threads_per_session_source: 'not_applicable',
          effective_subagent_width: null,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#611 enabled=false wins over a configured threads value -> not_applicable');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('multi_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true, max_concurrent_threads_per_session = 0 }'),
        {
          max_concurrent_threads_per_session: 4,
          max_concurrent_threads_per_session_source: 'observed_default',
          effective_subagent_width: 3,
        }, '#611 non-positive configured threads value falls back to the observed default (Codex itself rejects < 1)');

      // AC1: installer REPORT step — a fresh install must print the effective dispatch posture and
      // (non-proactive) the exact remediation, and this must NEVER change the installer's own exit code.
      const codexInstallerPathForPosture = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js');
      const postureProj = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-598-proj-'));
      const postureHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-codex-598-home-'));
      try {
        const freshInstall = spawnSync(process.execPath, [codexInstallerPathForPosture, postureProj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: postureHome },
          encoding: 'utf8'
        });
        assert.strictEqual(freshInstall.status, 0, '#598 AC1: dispatch-posture report must never fail an otherwise-good install: ' + freshInstall.stderr);
        assert(/status: ok/.test(freshInstall.stdout), '#598 AC1: existing "status: ok" output must be unchanged');
        assert(/Kaola-Workflow Codex multi_agent_v2 transport: not_applicable/.test(freshInstall.stdout),
          '#598 AC1: fresh v1 install must report its transport mode: ' + freshInstall.stdout);
        assert(/Kaola-Workflow Codex dispatch posture: explicitRequestOnly/.test(freshInstall.stdout),
          '#598 AC1: fresh install (multi_agent=true, no effort configured) must report explicitRequestOnly posture: ' + freshInstall.stdout);
        assert(/model_reasoning_effort = "ultra"/.test(freshInstall.stdout),
          '#598 AC1: non-proactive posture must print the exact remediation naming model_reasoning_effort="ultra": ' + freshInstall.stdout);
        assert(/codex -c model_reasoning_effort=ultra/.test(freshInstall.stdout),
          '#598 AC1: remediation must also name the per-session codex -c override: ' + freshInstall.stdout);
        assert(/0\.142\.5/.test(freshInstall.stdout), '#598 AC1/AC2: report must carry the version-guard note (0.142.5): ' + freshInstall.stdout);

        // Set model_reasoning_effort="ultra" ahead of the managed block, then re-run (idempotent
        // update) — the posture must flip to 'proactive' and the remediation line must disappear.
        const postureConfigPath = path.join(postureProj, '.codex', 'config.toml');
        const beforeUltra = fs.readFileSync(postureConfigPath, 'utf8');
        fs.writeFileSync(postureConfigPath, 'model_reasoning_effort = "ultra"\n\n' + beforeUltra);
        const reinstall = spawnSync(process.execPath, [codexInstallerPathForPosture, postureProj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: postureHome },
          encoding: 'utf8'
        });
        assert.strictEqual(reinstall.status, 0, '#598 AC1: re-install with effort=ultra must still exit 0: ' + reinstall.stderr);
        assert(/Kaola-Workflow Codex dispatch posture: proactive/.test(reinstall.stdout),
          '#598 AC1: effort=ultra must report proactive posture: ' + reinstall.stdout);
        assert(!/refuse sub-agent spawns/.test(reinstall.stdout),
          '#598 AC1: a proactive posture must NOT print the non-proactive remediation: ' + reinstall.stdout);

        // #611 AC6: a fresh install (no multi_agent_v2 configured) must print the recommended
        // config note + version-guard, and must NEVER report a concrete width (v2 not active).
        assert(/multi_agent_v2:.*Recommended \[features\.multi_agent_v2\] config/.test(freshInstall.stdout),
          '#611 AC6: fresh install must document the recommended [features.multi_agent_v2] config: ' + freshInstall.stdout);
        assert(/max_concurrent_threads_per_session/.test(freshInstall.stdout) && /max_wait_timeout_ms/.test(freshInstall.stdout),
          '#611 AC6: recommended config note must name both knobs: ' + freshInstall.stdout);
        assert(/\[agents\]\.max_threads.*cannot be set/.test(freshInstall.stdout),
          '#611 AC6: note must state agents.max_threads is invalid under v2: ' + freshInstall.stdout);
        assert(!/effective subagent width/.test(freshInstall.stdout),
          '#611 AC6: v2 not enabled -> must NOT print a concrete effective-width line: ' + freshInstall.stdout);
        assert(/0\.142\.5/.test(freshInstall.stdout), '#611 AC6: multi_agent_v2 report must carry the version-guard note (0.142.5): ' + freshInstall.stdout);

        // Enable v2 with explicit bounds ahead of the managed block, re-install (idempotent
        // update) — the report must now print the concrete width + every configured bound.
        const beforeV2 = fs.readFileSync(postureConfigPath, 'utf8');
        fs.writeFileSync(postureConfigPath, beforeV2 + '\n[features.multi_agent_v2]\nenabled = true\n'
          + 'tool_namespace = "agents"\nhide_spawn_agent_metadata = false\nnon_code_mode_only = true\n'
          + 'max_concurrent_threads_per_session = 3\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\n'
          + 'default_wait_timeout_ms = 60000\n');
        const v2Install = spawnSync(process.execPath, [codexInstallerPathForPosture, postureProj], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          env: { ...process.env, HOME: postureHome },
          encoding: 'utf8'
        });
        assert.strictEqual(v2Install.status, 0, '#611 AC6: re-install with v2 bounds configured must still exit 0: ' + v2Install.stderr);
        assert(/effective subagent width 2 \(max_concurrent_threads_per_session=3 \[config\]\)/.test(v2Install.stdout),
          '#611 AC6: configured threads=3 must report width=2 (threads-1) and source=config: ' + v2Install.stdout);
        assert(/min_wait_timeout_ms=1000/.test(v2Install.stdout), '#611 AC6: must report configured min_wait_timeout_ms: ' + v2Install.stdout);
        assert(/max_wait_timeout_ms=1800000/.test(v2Install.stdout), '#611 AC6: must report configured max_wait_timeout_ms: ' + v2Install.stdout);
        assert(/default_wait_timeout_ms=60000/.test(v2Install.stdout), '#611 AC6: must report configured default_wait_timeout_ms: ' + v2Install.stdout);
      } finally {
        fs.rmSync(postureProj, { recursive: true, force: true });
        fs.rmSync(postureHome, { recursive: true, force: true });
      }

      // cross-edition: a default codex installer run must seed the shared
      // ~/.config/kaola-workflow/config.json with parallel_mode:auto and NEVER an installed_paths field
      // (fast/full retired). This is the behavioral-identity assertion that the codex triplet writer
      // (node port) and the Claude install.sh writer produce the same config shape.
      const sharedConfigPath = path.join(chome, '.config', 'kaola-workflow', 'config.json');
      assert(fs.existsSync(sharedConfigPath), 'default install must seed ~/.config/kaola-workflow/config.json');
      const sharedConfig = JSON.parse(fs.readFileSync(sharedConfigPath, 'utf8'));
      assert(!('installed_paths' in sharedConfig),
        'default install must NOT write installed_paths (retired), got: ' + JSON.stringify(sharedConfig));
      assert(sharedConfig.parallel_mode === 'auto', 'default install parallel_mode setdefault "auto"');
    } finally {
      fs.rmSync(cproj, { recursive: true, force: true });
      fs.rmSync(chome, { recursive: true, force: true });
    }
  }

  // A root dotted assignment creates the same TOML authority as an explicit
  // [features] table. The installer must preserve that user-owned authority instead
  // of appending a redefining managed table, and preflight/runtime parsing must agree.
  {
    const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
    const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
    const template = fs.readFileSync(path.join(pluginRoot, 'config', 'agents.toml'), 'utf8');
    const fixtures = [
      { label: 'bare dotted features key', assignment: 'features.multi_agent = true' },
      { label: 'quoted dotted features key', assignment: '"features"."multi_agent" = true' },
      { label: 'literal-quoted dotted features key', assignment: "'features'.'multi_agent' = true" },
      { label: 'Unicode-equivalent dotted features key', assignment: '"featur\\u0065s"."multi_agent" = true' },
    ];

    for (const fixture of fixtures) {
      const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-dotted-features-project-'));
      const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-dotted-features-home-'));
      try {
        const codexDir = path.join(projectRoot, '.codex');
        const configPath = path.join(codexDir, 'config.toml');
        fs.mkdirSync(codexDir, { recursive: true });
        fs.writeFileSync(configPath, fixture.assignment + '\n');

        const install = spawnSync(process.execPath, [installerPath, projectRoot], {
          cwd: pluginRoot,
          env: { ...process.env, HOME: homeRoot },
          encoding: 'utf8',
        });
        assert.strictEqual(install.status, 0,
          fixture.label + ': installer must accept the external dotted authority: '
          + install.stderr + install.stdout);
        assert(/status: ok\s*$/.test(install.stdout),
          fixture.label + ': installer must preserve the success sentinel');

        const installed = fs.readFileSync(configPath, 'utf8');
        assert(installed.includes(fixture.assignment),
          fixture.label + ': installer must preserve the external assignment bytes');
        assert.strictEqual((installed.match(/^\s*\[features\]\s*$/gm) || []).length, 0,
          fixture.label + ': installer must not append a redefining [features] table');
        const block = codexPreflight.checkManagedBlock(installed, template);
        assert.strictEqual(block.blockFound, true,
          fixture.label + ': canonical preflight must find the managed agents block');
        assert.strictEqual(block.managedBlockDrift, false,
          fixture.label + ': canonical preflight must accept the agent-only managed body');

        const installerPosture = codexProfileInstaller.deriveDispatchPosture(installed);
        const preflightPosture = codexPreflight.deriveDispatchPosture(installed);
        assert.strictEqual(installerPosture.multi_agent_enabled, true,
          fixture.label + ': installer runtime parser must recognize the equivalent dotted path');
        assert.strictEqual(preflightPosture.multi_agent_enabled, true,
          fixture.label + ': preflight runtime parser must recognize the equivalent dotted path');
        assert.strictEqual(installerPosture.dispatch_posture, 'explicitRequestOnly',
          fixture.label + ': dotted multi_agent=true must expose explicit-request dispatch');
        assert.deepStrictEqual(preflightPosture, installerPosture,
          fixture.label + ': installer and preflight dispatch reports must stay identical');
      } finally {
        fs.rmSync(projectRoot, { recursive: true, force: true });
        fs.rmSync(homeRoot, { recursive: true, force: true });
      }
    }
  }

  // Root inline `features` is a real Codex authority shape. Nested commas must
  // remain inside the nested V2 object, quoted keys decode normally, and layered
  // table/scalar replacement must match Codex's recursive config overlay.
  {
    const pluginRoot = path.join(root, 'plugins', 'kaola-workflow');
    const installerPath = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
    const safe = 'features = { multi_agent_v2 = { enabled = true, tool_namespace = "agents", '
      + 'hide_spawn_agent_metadata = false, non_code_mode_only = true, '
      + 'max_concurrent_threads_per_session = 6 } }\n';
    const unsafe = 'features = { multi_agent_v2 = { enabled = true, tool_namespace = "agents", '
      + 'hide_spawn_agent_metadata = false, non_code_mode_only = false } }\n';
    const malformed = 'features = { multi_agent_v2 = { enabled = true, '
      + 'non_code_mode_only = "maybe" } }\n';
    const quoted = '"featur\\u0065s" = { "multi_agent_v\\u0032" = { "enabled" = true, '
      + "'tool_namespace' = \"agents\", \"hide_spawn_agent_metadata\" = false, "
      + "'non_code_mode_only' = true } }\n";
    const v1 = 'features = { "multi_agent" = true }\n';

    for (const [label, mod] of [
      ['installer', codexProfileInstaller],
      ['preflight', codexPreflight],
    ]) {
      const safeMode = mod.detectCodexDispatchMode(safe);
      assert.strictEqual(safeMode.multi_agent_v2_enabled, true,
        label + ': safe root inline features enables V2');
      assert.strictEqual(safeMode.codex_v2_role_transport_ready, true,
        label + ': safe root inline features proves role transport');
      assert.strictEqual(
        mod.deriveMultiAgentV2Bounds(safe, safeMode.multi_agent_v2_enabled)
          .max_concurrent_threads_per_session,
        6,
        label + ': root inline nested numeric fields remain intact across comma splitting');

      const unsafeMode = mod.detectCodexDispatchMode(unsafe);
      assert.strictEqual(unsafeMode.codex_v2_transport_mode, 'nested-allowed',
        label + ': unsafe root inline features exposes nested transport');
      assert.strictEqual(unsafeMode.codex_v2_direct_transport_ready, false,
        label + ': unsafe root inline features fails the direct transport gate');

      const malformedMode = mod.detectCodexDispatchMode(malformed);
      assert.strictEqual(malformedMode.codex_v2_transport_mode, 'unknown',
        label + ': malformed root inline V2 transport fails closed');
      assert.strictEqual(malformedMode.codex_v2_direct_transport_ready, false,
        label + ': malformed root inline V2 is unsafe');

      assert.strictEqual(mod.detectCodexDispatchMode(quoted).codex_v2_role_transport_ready, true,
        label + ': quoted and Unicode-equivalent root inline feature keys decode structurally');
      const v1Posture = mod.deriveDispatchPosture(v1);
      assert.strictEqual(v1Posture.multi_agent_enabled, true,
        label + ': root inline v1 multi_agent is recognized');
      assert.strictEqual(v1Posture.dispatch_posture, 'explicitRequestOnly',
        label + ': root inline v1 feature exposes explicit-request dispatch');
    }

    const lowerSafeTable = '[features.multi_agent_v2]\n'
      + 'enabled = true\n'
      + 'tool_namespace = "agents"\n'
      + 'hide_spawn_agent_metadata = false\n'
      + 'non_code_mode_only = true\n'
      + 'max_concurrent_threads_per_session = 7\n';
    const recursivelyMerged = codexPreflight.deriveEffectiveRuntime([
      { content: lowerSafeTable, configPath: '/lower/config.toml' },
      { content: 'features = { multi_agent_v2 = { non_code_mode_only = false } }\n',
        configPath: '/higher/config.toml' },
    ]);
    assert.strictEqual(recursivelyMerged.multi_agent_v2_enabled, true,
      'table/table root-inline overlay inherits lower enabled');
    assert.strictEqual(recursivelyMerged.codex_v2_transport_mode, 'nested-allowed',
      'table/table root-inline overlay applies the higher unsafe field');
    assert.strictEqual(recursivelyMerged.max_concurrent_threads_per_session, 7,
      'table/table root-inline overlay recursively retains lower numeric fields');
    assert.strictEqual(recursivelyMerged.transport_config_path, '/higher/config.toml',
      'root-inline overlay refusal reports the winning field layer');

    const tableToScalar = codexPreflight.deriveEffectiveRuntime([
      lowerSafeTable,
      'features = { multi_agent_v2 = false }\n',
    ]);
    assert.strictEqual(tableToScalar.multi_agent_v2_enabled, false,
      'higher root-inline scalar replaces the lower V2 table');
    assert.strictEqual(tableToScalar.max_concurrent_threads_per_session, null,
      'table-to-scalar replacement clears inherited numeric V2 fields');

    const scalarToTable = codexPreflight.deriveEffectiveRuntime([
      '[features]\nmulti_agent_v2 = false\n',
      safe,
    ]);
    assert.strictEqual(scalarToTable.multi_agent_v2_enabled, true,
      'higher root-inline table replaces a lower V2 scalar');
    assert.strictEqual(scalarToTable.codex_v2_role_transport_ready, true,
      'scalar-to-table replacement uses only the higher safe object');

    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-root-inline-features-project-'));
    const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-root-inline-features-home-'));
    try {
      const codexDir = path.join(projectRoot, '.codex');
      fs.mkdirSync(codexDir, { recursive: true });
      fs.writeFileSync(path.join(codexDir, 'config.toml'), unsafe);
      const install = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.notStrictEqual(install.status, 0,
        'installer must refuse unsafe root inline features before writing');
      assert(/codex_v2_encrypted_transport_unsafe/.test(install.stderr),
        'installer root-inline refusal uses the typed transport status: ' + install.stderr);
      assert(!fs.existsSync(path.join(codexDir, 'agents', 'kaola-workflow')),
        'installer root-inline refusal happens before profile writes');

      fs.writeFileSync(path.join(codexDir, 'config.toml'), safe);
      const safeInstall = runCodexInstaller(installerPath, projectRoot, homeRoot);
      assert.strictEqual(safeInstall.status, 0,
        'installer accepts proven-safe root inline features: '
        + safeInstall.stderr + safeInstall.stdout);
      const safeInstalledConfig = fs.readFileSync(path.join(codexDir, 'config.toml'), 'utf8');
      assert.strictEqual((safeInstalledConfig.match(/^\s*\[features\]\s*$/gm) || []).length, 0,
        'safe root inline features remains the sole features authority after install');
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      fs.rmSync(homeRoot, { recursive: true, force: true });
    }
  }

  // #598: effort-gated MultiAgentMode dispatch-posture — pure-function unit coverage
  // (no subprocess). VERSION-GUARD: derivation verified on codex-tui 0.142.5 —
  //   [features] multi_agent / multi_agent_v2 absent-or-false -> 'none'
  //   otherwise: root-level model_reasoning_effort = "ultra" -> 'proactive', else 'explicitRequestOnly'.
  // Exercises BOTH the installer's and the preflight's copy of deriveDispatchPosture — they are
  // duplicated (not shared) by design, so this is the semantic-parity check the whole-file
  // byte-identity validator (validate-script-sync.js) cannot itself express.
  {
    const preflightModulePath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-codex-preflight.js');
    const installerModulePath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'install-codex-agent-profiles.js');
    const preflightMod = require(preflightModulePath);
    const installerMod = require(installerModulePath);

    const mixedLegacyScope = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-mixed-legacy-profile-'));
    try {
      const mixedAgentsDir = path.join(mixedLegacyScope, 'agents', 'kaola-workflow');
      fs.mkdirSync(mixedAgentsDir, { recursive: true });
      const sourceProfile = fs.readFileSync(path.join(root, 'plugins', 'kaola-workflow', 'agents', 'implementer.toml'), 'utf8');
      const mixedProfile = sourceProfile
        .replace(/^name = "implementer"$/m, 'name = "wrong-role"')
        .replace(/^developer_instructions/m,
          'model = "gpt-5.6-sol"\nmodel_reasoning_effort = "medium"\ndeveloper_instructions');
      fs.writeFileSync(path.join(mixedAgentsDir, 'implementer.toml'), mixedProfile);
      const inspection = preflightMod.inspectScope({
        codexDir: mixedLegacyScope,
        templateRoles: ['implementer'],
        templateEntries: []
      });
      assert.strictEqual(inspection.legacyPinnedProfiles.length, 0,
        'legacy pair is safely migratable only when the remaining profile schema is valid');
      assert(inspection.malformed.some(item => item.role === 'implementer'
        && item.reasons.some(reason => reason.includes('must equal the role "implementer"'))),
      'legacy pin plus invalid role metadata remains profiles_malformed');
    } finally {
      fs.rmSync(mixedLegacyScope, { recursive: true, force: true });
    }

    const postureFixtures = [
      { label: 'no features table at all', cfg: '', expected: 'none' },
      { label: 'multi_agent=true, no effort', cfg: '[features]\nmulti_agent = true\n', expected: 'explicitRequestOnly' },
      { label: 'multi_agent=false, no effort', cfg: '[features]\nmulti_agent = false\n', expected: 'none' },
      { label: 'multi_agent=true, effort=ultra', cfg: 'model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = true\n', expected: 'proactive' },
      { label: 'multi_agent=true, effort=xhigh (below ultra)', cfg: 'model_reasoning_effort = "xhigh"\n\n[features]\nmulti_agent = true\n', expected: 'explicitRequestOnly' },
      { label: 'multi_agent=false + effort=ultra (features gate wins)', cfg: 'model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = false\n', expected: 'none' },
      { label: 'multi_agent_v2=true only (no multi_agent key)', cfg: '[features]\nmulti_agent_v2 = true\n', expected: 'explicitRequestOnly' },
      { label: 'multi_agent=false + multi_agent_v2=true, effort=ultra', cfg: 'model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = false\nmulti_agent_v2 = true\n', expected: 'proactive' },
      { label: 'basic quoted literal dotted v2 table does not enable v2', cfg: '["features.multi_agent_v2"]\nenabled = true\n', expected: 'none' },
      { label: 'literal quoted dotted v2 table does not enable v2', cfg: '[\'features.multi_agent_v2\']\nenabled = true\n', expected: 'none' },
      { label: 'array-of-table dotted v2 table does not enable v2', cfg: '[[features.multi_agent_v2]]\nenabled = true\n', expected: 'none' },
      { label: 'quoted-segment array-of-table v2 table does not enable v2', cfg: '[[features."multi_agent_v2"]]\nenabled = true\n', expected: 'none' },
      // TOML root-key rule: model_reasoning_effort placed AFTER the first [table] header is NOT
      // a root key (it would belong to that table), so it must not gate the posture.
      { label: 'effort after first table is not a root key (ignored)', cfg: '[features]\nmulti_agent = true\nmodel_reasoning_effort = "ultra"\n', expected: 'explicitRequestOnly' },
    ];
    for (const mod of [preflightMod, installerMod]) {
      for (const f of postureFixtures) {
        const result = mod.deriveDispatchPosture(f.cfg);
        assert.strictEqual(result.dispatch_posture, f.expected,
          '#598 ' + f.label + ': expected dispatch_posture ' + f.expected + ', got ' + JSON.stringify(result));
        assert.strictEqual(result.dispatch_posture_warning === null, f.expected === 'proactive',
          '#598 ' + f.label + ': dispatch_posture_warning must be null iff proactive, got ' + JSON.stringify(result));
      }
    }

    const transportFixtures = [
      { label: 'v2 omitted transport uses direct-only default', cfg: '[features]\nmulti_agent_v2 = true\n', mode: 'direct-only', ready: true },
      { label: 'inline true is direct-only', cfg: '[features]\nmulti_agent_v2 = { enabled = true, non_code_mode_only = true }\n', mode: 'direct-only', ready: true },
      { label: 'inline false permits unsafe nested adapter', cfg: '[features]\nmulti_agent_v2 = { enabled = true, non_code_mode_only = false }\n', mode: 'nested-allowed', ready: false },
      { label: 'malformed inline transport fails closed', cfg: '[features]\nmulti_agent_v2 = { enabled = true, non_code_mode_only = "maybe" }\n', mode: 'unknown', ready: false },
      { label: 'malformed dotted transport fails closed', cfg: '[features.multi_agent_v2]\nenabled = true\nnon_code_mode_only = "maybe"\n', mode: 'unknown', ready: false },
      { label: 'disabled v2 is not applicable', cfg: '[features]\nmulti_agent_v2 = false\n', mode: 'not_applicable', ready: null },
    ];
    for (const mod of [preflightMod, installerMod]) {
      for (const f of transportFixtures) {
        const result = mod.detectCodexDispatchMode(f.cfg);
        assert.strictEqual(result.codex_v2_transport_mode, f.mode,
          '#v2-transport ' + f.label + ': mode, got ' + JSON.stringify(result));
        assert.strictEqual(result.codex_v2_direct_transport_ready, f.ready,
          '#v2-transport ' + f.label + ': readiness, got ' + JSON.stringify(result));
      }
    }
    const roleTransportFixtures = [
      {
        label: 'proven inline agents namespace keeps role metadata visible',
        cfg: '[features]\nmulti_agent_v2 = { enabled = true, tool_namespace = "agents", hide_spawn_agent_metadata = false, non_code_mode_only = true }\n',
        namespace: 'agents', metadataVisible: true, ready: true,
      },
      {
        label: 'reserved collaboration plus visible metadata reproduces HTTP 400 schema mismatch',
        cfg: '[features]\nmulti_agent_v2 = { enabled = true, hide_spawn_agent_metadata = false, non_code_mode_only = true }\n',
        namespace: 'collaboration', metadataVisible: true, ready: false,
      },
      {
        label: 'runtime defaults match reserved schema but hide Kaola role selection',
        cfg: '[features]\nmulti_agent_v2 = true\n',
        namespace: 'collaboration', metadataVisible: false, ready: false,
      },
      {
        label: 'custom namespace with hidden metadata still cannot select a Kaola role',
        cfg: '[features.multi_agent_v2]\nenabled = true\ntool_namespace = "agents"\nhide_spawn_agent_metadata = true\nnon_code_mode_only = true\n',
        namespace: 'agents', metadataVisible: false, ready: false,
      },
      {
        label: 'dotted agents namespace keeps role metadata visible',
        cfg: '[features.multi_agent_v2]\nenabled = true\ntool_namespace = "agents"\nhide_spawn_agent_metadata = false\nnon_code_mode_only = true\n',
        namespace: 'agents', metadataVisible: true, ready: true,
      },
      {
        label: 'malformed namespace fails closed',
        cfg: '[features]\nmulti_agent_v2 = { enabled = true, tool_namespace = agents, hide_spawn_agent_metadata = false, non_code_mode_only = true }\n',
        namespace: null, metadataVisible: true, ready: false,
      },
    ];
    for (const mod of [preflightMod, installerMod]) {
      for (const f of roleTransportFixtures) {
        const result = mod.detectCodexDispatchMode(f.cfg);
        assert.strictEqual(result.codex_v2_tool_namespace, f.namespace,
          '#650 ' + f.label + ': namespace, got ' + JSON.stringify(result));
        assert.strictEqual(result.codex_v2_role_metadata_visible, f.metadataVisible,
          '#650 ' + f.label + ': metadata visibility, got ' + JSON.stringify(result));
        assert.strictEqual(result.codex_v2_role_transport_ready, f.ready,
          '#650 ' + f.label + ': role transport readiness, got ' + JSON.stringify(result));
      }
    }
    assert.strictEqual(installerMod.CODEX_V2_DIRECT_TRANSPORT_NOTE, preflightMod.CODEX_V2_DIRECT_TRANSPORT_NOTE,
      '#v2-transport: installer and preflight repair notes must match verbatim');
    assert.strictEqual(installerMod.CODEX_V2_ROLE_TRANSPORT_NOTE, preflightMod.CODEX_V2_ROLE_TRANSPORT_NOTE,
      '#650: installer and preflight role-transport repair notes must match verbatim');
    assert.strictEqual(installerMod.CODEX_V2_ROLE_TOOL_NAMESPACE, 'agents',
      '#650: the live-proven role-aware namespace must remain agents');

    // The installer and preflight must ship the identical version-guard note (semantic
    // lock-step check, distinct from the whole-file byte-identity the sync validator enforces).
    assert.strictEqual(installerMod.DISPATCH_POSTURE_VERSION_NOTE, preflightMod.DISPATCH_POSTURE_VERSION_NOTE,
      '#598: installer and preflight version-guard notes must match verbatim');
    assert(/0\.142\.5/.test(installerMod.DISPATCH_POSTURE_VERSION_NOTE),
      '#598: version-guard note must name the verified Codex CLI version');

    // #611 AC6: MultiAgentV2 concurrency + wait-timeout bounds — pure-function unit coverage
    // (no subprocess). VERSION-GUARD: derivation verified on codex-tui 0.142.5 —
    //   v2 not enabled -> not_applicable, every field null.
    //   v2 enabled, max_concurrent_threads_per_session absent/non-positive -> OBSERVED default 4
    //     (effective subagent width 3); configured -> reported verbatim, width = threads - 1.
    //   min/max/default_wait_timeout_ms have no independently verified default -> read ONLY
    //     when explicitly present; null when absent (no fabricated fallback).
    // Exercises BOTH the installer's and the preflight's copy of deriveMultiAgentV2Bounds — they
    // are duplicated (not shared) by design, so this is the semantic-parity check the whole-file
    // byte-identity validator (validate-script-sync.js) cannot itself express.
    const boundsFixtures = [
      { label: 'no features table at all', cfg: '', v2Enabled: false,
        expected: { max_concurrent_threads_per_session: null, max_concurrent_threads_per_session_source: 'not_applicable', effective_subagent_width: null, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled, no bounds configured', cfg: '[features]\nmulti_agent_v2 = true\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled via inline object, threads configured', cfg: '[features]\nmulti_agent_v2 = { enabled = true, max_concurrent_threads_per_session = 6 }\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 6, max_concurrent_threads_per_session_source: 'config', effective_subagent_width: 5, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'v2 enabled via dotted table form, all four numeric fields configured', cfg: '[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 2\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\ndefault_wait_timeout_ms = 60000\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 2, max_concurrent_threads_per_session_source: 'config', effective_subagent_width: 1, min_wait_timeout_ms: 1000, max_wait_timeout_ms: 1800000, default_wait_timeout_ms: 60000 } },
      { label: 'quoted unrelated table after dotted v2 table does not over-collect bounds', cfg: '[features.multi_agent_v2]\nenabled = true\n\n[mcp_servers."srv"]\nmax_concurrent_threads_per_session = 99\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'basic quoted literal dotted table after dotted v2 table does not over-collect bounds', cfg: '[features.multi_agent_v2]\nenabled = true\n\n["features.multi_agent_v2"]\nmax_concurrent_threads_per_session = 99\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'literal quoted dotted table after dotted v2 table does not over-collect bounds', cfg: '[features.multi_agent_v2]\nenabled = true\n\n[\'features.multi_agent_v2\']\nmax_concurrent_threads_per_session = 99\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'array-of-table dotted v2 table does not collect bounds', cfg: '[[features.multi_agent_v2]]\nmax_concurrent_threads_per_session = 99\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'quoted-segment array-of-table v2 table does not collect bounds', cfg: '[[features."multi_agent_v2"]]\nmax_concurrent_threads_per_session = 99\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'non-integer configured threads value falls back to observed default', cfg: '[features]\nmulti_agent_v2 = { enabled = true, max_concurrent_threads_per_session = "six" }\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
      { label: 'zero configured threads value falls back to observed default (Codex itself rejects < 1)', cfg: '[features]\nmulti_agent_v2 = { enabled = true, max_concurrent_threads_per_session = 0 }\n', v2Enabled: true,
        expected: { max_concurrent_threads_per_session: 4, max_concurrent_threads_per_session_source: 'observed_default', effective_subagent_width: 3, min_wait_timeout_ms: null, max_wait_timeout_ms: null, default_wait_timeout_ms: null } },
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

    assert.strictEqual(installerMod.OBSERVED_DEFAULT_MAX_CONCURRENT_THREADS_PER_SESSION, 4,
      '#611: the observed default concurrency budget must be 4 (width 3)');
    assert.strictEqual(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE, preflightMod.MULTI_AGENT_V2_BOUNDS_NOTE,
      '#611: installer and preflight multi_agent_v2 bounds notes must match verbatim');
    assert(/0\.142\.5/.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#611: multi_agent_v2 bounds note must name the verified Codex CLI version');
    assert(/\[agents\]\.max_threads.*cannot be set/.test(installerMod.MULTI_AGENT_V2_BOUNDS_NOTE),
      '#611: bounds note must state agents.max_threads is invalid under v2');
  }

  // #606: report-only Claude dispatch-posture detection (agent teams, gated by
  // CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS) mirrors the Codex dispatch-posture report above —
  // env probe first, settings "env" block fallback, non-fatal, NEVER writes settings.
  {
    // (a) env var set to "1" -> teams, regardless of settings state.
    const teamsEnvHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-606-teams-env-'));
    try {
      const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'], {
        cwd: root,
        env: { ...process.env, HOME: teamsEnvHome, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' },
        encoding: 'utf8'
      });
      assert.strictEqual(result.status, 0, '#606: teams posture (env var) must not fail the install: ' + result.stderr);
      assert(/claude_dispatch_posture: teams/.test(result.stdout),
        '#606: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 must report claude_dispatch_posture: teams; got: ' + result.stdout);
    } finally { fs.rmSync(teamsEnvHome, { recursive: true, force: true }); }

    // (b) env unset, no settings flag anywhere -> classic (the default posture), with the
    // classic-led remediation: leads with the always-available classic subagents path, then
    // qualifies agent teams as experimental + flag-gated.
    const classicHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-606-classic-'));
    try {
      const env = { ...process.env, HOME: classicHome };
      delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
        { cwd: root, env, encoding: 'utf8' });
      assert.strictEqual(result.status, 0, '#606: classic posture must not fail the install: ' + result.stderr);
      assert(/claude_dispatch_posture: classic/.test(result.stdout),
        '#606: no env var and no settings flag must report claude_dispatch_posture: classic; got: ' + result.stdout);
      assert(/[Cc]lassic subagents.*always available/.test(result.stdout),
        '#606: classic posture must lead with the always-available classic-subagents path; got: ' + result.stdout);
      assert(/experimental/.test(result.stdout) && /CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1/.test(result.stdout),
        '#606: classic remediation must qualify agent teams as experimental and name the flag; got: ' + result.stdout);
      assert(/settings.*env/i.test(result.stdout),
        '#606: classic remediation must mention the settings "env" block route; got: ' + result.stdout);
    } finally { fs.rmSync(classicHome, { recursive: true, force: true }); }

    // (c)+(d) env unset but the sandboxed ~/.claude/settings.json "env" block carries the flag
    // ("1") -> teams (the settings fallback), AND the settings file is byte-unchanged by the
    // detection itself (--no-settings-merge disables the unrelated hooks-merge writer, isolating
    // this assertion to the new detection code path only).
    const settingsHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-606-settings-'));
    try {
      const settingsDir = path.join(settingsHome, '.claude');
      fs.mkdirSync(settingsDir, { recursive: true });
      const settingsPath = path.join(settingsDir, 'settings.json');
      const settingsBefore = JSON.stringify({ env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } }, null, 2) + '\n';
      fs.writeFileSync(settingsPath, settingsBefore);

      const env = { ...process.env, HOME: settingsHome };
      delete env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
      const result = spawnSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
        { cwd: root, env, encoding: 'utf8' });
      assert.strictEqual(result.status, 0, '#606: teams posture (settings fallback) must not fail the install: ' + result.stderr);
      assert(/claude_dispatch_posture: teams/.test(result.stdout),
        '#606: settings.json env block carrying the flag must report claude_dispatch_posture: teams; got: ' + result.stdout);

      const settingsAfter = fs.readFileSync(settingsPath, 'utf8');
      assert.strictEqual(settingsAfter, settingsBefore,
        '#606: the report-only detection must never mutate settings.json; boundary broken');
    } finally { fs.rmSync(settingsHome, { recursive: true, force: true }); }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Install model rendering tests passed');
