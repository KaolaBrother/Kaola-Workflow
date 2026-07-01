#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-models-'));

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
  execFileSync(
    'bash',
    ['install.sh', '--yes', '--forge=github', '--profile=higher', '--with-fast', '--with-full', '--no-settings-merge'],
    {
      cwd: root,
      env: { ...process.env, HOME: tmp },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );

  const phase3 = readInstalledCommand('kaola-workflow-phase3.md');
  const phase4 = readInstalledCommand('kaola-workflow-phase4.md');
  const phase5 = readInstalledCommand('kaola-workflow-phase5.md');
  const finalize = readInstalledCommand('kaola-workflow-finalize.md');
  const fast = readInstalledCommand('kaola-workflow-fast.md');

  assert(phase3.includes('model="opus",'), 'higher profile should render code-architect as opus');
  assert(phase4.includes('model="sonnet",'), 'tdd-guide should render as sonnet');
  assert(
    phase4.includes('\n\n## Validation Delegation Policy\n\n'),
    'installer rendering should preserve blank markdown lines'
  );
  assert(phase5.includes('model="opus",'), 'higher profile should render reviewers as opus');
  assert(finalize.includes('model="sonnet",'), 'doc-updater should render as sonnet');
  assert(
    phase5.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'phase5 routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    finalize.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'finalize routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    phase5.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'phase5 routed-fix tdd-guide block should render as sonnet'
  );
  assert(
    finalize.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'finalize routed-fix tdd-guide block should render as sonnet'
  );
  assert(fast.includes('model="opus",'), 'fast command should render higher-profile reviewer/planner models');

  const allCommands = fs.readdirSync(path.join(tmp, '.claude', 'commands'))
    .filter(name => name.endsWith('.md'))
    .map(name => readInstalledCommand(name))
    .join('\n');
  assert(!/model="\{[A-Z_]+_MODEL\}"/.test(allCommands), 'installed commands must not keep model placeholders');

  const requiredAgents = ['code-explorer','knowledge-lookup','planner','code-architect','tdd-guide',
    'build-error-resolver','code-reviewer','security-reviewer','doc-updater','adversarial-verifier','contractor','workflow-planner'];
  for (const agent of requiredAgents) {
    const installed = fs.readFileSync(path.join(tmp,'.claude','agents',agent+'.md'),'utf8');
    const fmEnd = installed.indexOf('\n---', 3);
    const frontmatter = installed.slice(0, fmEnd === -1 ? installed.length : fmEnd);
    assert(/\bmodel:\s*inherit\b/.test(frontmatter), agent+' installed frontmatter must be model: inherit');
    assert(installed.includes('kaola-workflow-managed-agent: true'), agent+' installed file must keep managed marker');
  }

  // Default profile is `higher`: an install with no `--profile` flag renders the
  // three reviewer agents on Opus (this is what locks the default — not an explicit
  // --profile). #538: full-path commands are an opt-in, so pass --with-full to install
  // the phase[1-5] files this block reads (the profile defaulting under test is unaffected).
  {
    const dtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-default-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--with-fast', '--with-full', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: dtmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const rd = n => fs.readFileSync(path.join(dtmp, '.claude', 'commands', n), 'utf8');
      assert(rd('kaola-workflow-phase3.md').includes('subagent_type="code-architect",\n  model="opus",'),
        'no-flag install must render code-architect as opus (higher is the default profile)');
      assert(rd('kaola-workflow-phase5.md').includes('subagent_type="code-reviewer",\n  model="opus",'),
        'no-flag install must render code-reviewer as opus (higher is the default profile)');
    } finally { fs.rmSync(dtmp, { recursive: true, force: true }); }
  }

  // `--profile=common` must be requested explicitly to get the Sonnet assignments.
  {
    const ctmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-common-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--profile=common', '--with-fast', '--with-full', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: ctmp }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const rd = n => fs.readFileSync(path.join(ctmp, '.claude', 'commands', n), 'utf8');
      assert(rd('kaola-workflow-phase3.md').includes('subagent_type="code-architect",\n  model="sonnet",'),
        '--profile=common must render code-architect as sonnet');
      assert(rd('kaola-workflow-phase5.md').includes('subagent_type="code-reviewer",\n  model="sonnet",'),
        '--profile=common must render code-reviewer as sonnet');
    } finally { fs.rmSync(ctmp, { recursive: true, force: true }); }
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
      assert(managedIds.length >= 4, '#447 AC1: global hooks.json must carry at least four kaola-workflow: entries; found ' + managedIds.length + ': ' + managedIds.join(', '));
      const expectedIds = ['kaola-workflow:compact-context', 'kaola-workflow:pre-commit-guard', 'kaola-workflow:write-lane', 'kaola-workflow:subagent-dispatch-log'];
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

      // AC2: managed [agents.*] block in the positional-form project's .codex/config.toml
      const projectConfigPath = path.join(cproj, '.codex', 'config.toml');
      assert(fs.existsSync(projectConfigPath), '#447 AC2: positional-form override must write .codex/config.toml to the given path');
      const configText = fs.readFileSync(projectConfigPath, 'utf8');
      assert(configText.includes('# BEGIN kaola-workflow agents'), '#447 AC2: positional-form config.toml must contain managed agents block');
      const codexPreflightPath = path.join(root, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-codex-preflight.js');
      function configWithFeatureLine(line) {
        return configText.replace('multi_agent = true', 'multi_agent = true\n' + line);
      }
      function assertDispatchModeForConfig(body, expectedMode, label, checkDoctor) {
        fs.writeFileSync(projectConfigPath, body);
        const result = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
          cwd: path.join(root, 'plugins', 'kaola-workflow'),
          encoding: 'utf8'
        });
        assert.strictEqual(result.status, 0, label + ': preflight must pass: ' + result.stderr + result.stdout);
        const json = JSON.parse(result.stdout);
        assert.strictEqual(json.dispatch_mode, expectedMode, label + ': dispatch_mode');
        assert.strictEqual(json.multi_agent_v2_enabled, expectedMode === 'v2-task-name', label + ': multi_agent_v2_enabled');
        if (checkDoctor) {
          const doctorResult = spawnSync(process.execPath, [codexPreflightPath, '--doctor', '--project-root', cproj, '--home', chome, '--json'], {
            cwd: path.join(root, 'plugins', 'kaola-workflow'),
            encoding: 'utf8'
          });
          const doctorJson = JSON.parse(doctorResult.stdout);
          const projectScope = doctorJson.scopes.find(s => s.scope === 'project');
          assert(projectScope && projectScope.dispatch_mode === expectedMode,
            label + ': doctor project scope reports ' + expectedMode + ', got ' + JSON.stringify(projectScope));
        }
      }

      let preflight = spawnSync(process.execPath, [codexPreflightPath, '--project-root', cproj, '--home', chome, '--no-autofix', '--json'], {
        cwd: path.join(root, 'plugins', 'kaola-workflow'),
        encoding: 'utf8'
      });
      assert.strictEqual(preflight.status, 0, '#581: preflight over fresh project profiles must pass: ' + preflight.stderr + preflight.stdout);
      let preflightJson = JSON.parse(preflight.stdout);
      assert.strictEqual(preflightJson.dispatch_mode, 'v1-thread-id', '#581: preflight reports v1-thread-id by default');
      assertDispatchModeForConfig(configText, 'v1-thread-id', '#584 no multi_agent_v2 key', false);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = true'), 'v2-task-name', '#584 boolean true', true);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = false'), 'v1-thread-id', '#584 boolean false', false);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = true, hide_spawn_agent_metadata = false, non_code_mode_only = false }'), 'v2-task-name', '#584 inline object enabled true', true);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { enabled = false, hide_spawn_agent_metadata = false, non_code_mode_only = false }'), 'v1-thread-id', '#584 inline object enabled false', false);
      assertDispatchModeForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = true'), 'v2-task-name', '#584 table enabled true', true);
      assertDispatchModeForConfig(configWithFeatureLine('[features.multi_agent_v2]\nenabled = false'), 'v1-thread-id', '#584 table enabled false', false);
      assertDispatchModeForConfig('[notice]\nsuppress_unstable_features_warning = true\n\n' + configText, 'v1-thread-id', '#584 warning suppression only', false);
      assertDispatchModeForConfig('multi_agent_v2 = true\n\n' + configText, 'v1-thread-id', '#584 top-level key ignored', false);
      assertDispatchModeForConfig(configWithFeatureLine('multi_agent_v2 = { hide_spawn_agent_metadata = false }'), 'v1-thread-id', '#584 inline object missing enabled fails closed', false);

      // #543 cross-edition: a default (no-flags) codex installer run must seed the shared
      // ~/.config/kaola-workflow/config.json with installed_paths:[] (adaptive-only). This is the
      // claude-chain behavioral-identity assertion that the codex triplet writer (node port) and the
      // Claude install.sh D4 writer produce the same config shape read by the runtime legality gate.
      const sharedConfigPath = path.join(chome, '.config', 'kaola-workflow', 'config.json');
      assert(fs.existsSync(sharedConfigPath), '#543: default install must seed ~/.config/kaola-workflow/config.json');
      const sharedConfig = JSON.parse(fs.readFileSync(sharedConfigPath, 'utf8'));
      assert(Array.isArray(sharedConfig.installed_paths) && sharedConfig.installed_paths.length === 0,
        '#543: default install installed_paths must be [] (adaptive-only), got: ' + JSON.stringify(sharedConfig.installed_paths));
      assert(sharedConfig.parallel_mode === 'auto', '#543: default install parallel_mode setdefault "auto"');
    } finally {
      fs.rmSync(cproj, { recursive: true, force: true });
      fs.rmSync(chome, { recursive: true, force: true });
    }
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Install model rendering tests passed');
