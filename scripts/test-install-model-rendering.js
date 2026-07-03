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
      assert(manifest['synthesizer'] === 'opus', 'higher manifest must map synthesizer→opus; got ' + manifest['synthesizer']);
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
      assertDispatchPostureForConfig(configText.replace('multi_agent = true', 'multi_agent = false'), 'none',
        '#598 multi_agent=false, no multi_agent_v2 -> none');
      assertDispatchPostureForConfig('model_reasoning_effort = "ultra"\n\n' + configText, 'proactive',
        '#598 effort=ultra with multi_agent=true -> proactive');
      assertDispatchPostureForConfig('model_reasoning_effort = "xhigh"\n\n' + configText, 'explicitRequestOnly',
        '#598 effort=xhigh (below ultra) stays explicitRequestOnly');
      assertDispatchPostureForConfig(
        'model_reasoning_effort = "ultra"\n\n' + configText.replace('multi_agent = true', 'multi_agent = false'),
        'none', '#598 effort=ultra but features disabled -> none (features gate outranks effort)');
      assertDispatchPostureForConfig(configWithFeatureLine('multi_agent_v2 = true'), 'explicitRequestOnly',
        '#598 multi_agent_v2=true, no effort -> explicitRequestOnly');
      assertDispatchPostureForConfig(
        'model_reasoning_effort = "ultra"\n\n' + configWithFeatureLine('multi_agent_v2 = true').replace('multi_agent = true', 'multi_agent = false'),
        'proactive', '#598 multi_agent=false + multi_agent_v2=true + effort=ultra -> proactive (either feature gates)');
      assertDispatchPostureForConfig(configText.replace('multi_agent = true', 'multi_agent = true\nmodel_reasoning_effort = "ultra"'),
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
      assertMultiAgentV2BoundsForConfig(configWithFeatureLine('multi_agent_v2 = true'), {
        max_concurrent_threads_per_session: 4,
        max_concurrent_threads_per_session_source: 'observed_default',
        effective_subagent_width: 3,
        min_wait_timeout_ms: null,
        max_wait_timeout_ms: null,
        default_wait_timeout_ms: null,
      }, '#611 v2 enabled, no bounds configured -> observed default 4 / width 3');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('multi_agent_v2 = { enabled = true, max_concurrent_threads_per_session = 6 }'),
        {
          max_concurrent_threads_per_session: 6,
          max_concurrent_threads_per_session_source: 'config',
          effective_subagent_width: 5,
          min_wait_timeout_ms: null,
          max_wait_timeout_ms: null,
          default_wait_timeout_ms: null,
        }, '#611 v2 enabled via inline object, threads configured -> config source, width = threads-1');
      assertMultiAgentV2BoundsForConfig(
        configWithFeatureLine('[features.multi_agent_v2]\nenabled = true\nmax_concurrent_threads_per_session = 2\nmin_wait_timeout_ms = 1000\nmax_wait_timeout_ms = 1800000\ndefault_wait_timeout_ms = 60000'),
        {
          max_concurrent_threads_per_session: 2,
          max_concurrent_threads_per_session_source: 'config',
          effective_subagent_width: 1,
          min_wait_timeout_ms: 1000,
          max_wait_timeout_ms: 1800000,
          default_wait_timeout_ms: 60000,
        }, '#611 v2 enabled via dotted table form, all four numeric fields configured');
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
        configWithFeatureLine('multi_agent_v2 = { enabled = true, max_concurrent_threads_per_session = 0 }'),
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

    const postureFixtures = [
      { label: 'no features table at all', cfg: '', expected: 'none' },
      { label: 'multi_agent=true, no effort', cfg: '[features]\nmulti_agent = true\n', expected: 'explicitRequestOnly' },
      { label: 'multi_agent=false, no effort', cfg: '[features]\nmulti_agent = false\n', expected: 'none' },
      { label: 'multi_agent=true, effort=ultra', cfg: 'model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = true\n', expected: 'proactive' },
      { label: 'multi_agent=true, effort=xhigh (below ultra)', cfg: 'model_reasoning_effort = "xhigh"\n\n[features]\nmulti_agent = true\n', expected: 'explicitRequestOnly' },
      { label: 'multi_agent=false + effort=ultra (features gate wins)', cfg: 'model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = false\n', expected: 'none' },
      { label: 'multi_agent_v2=true only (no multi_agent key)', cfg: '[features]\nmulti_agent_v2 = true\n', expected: 'explicitRequestOnly' },
      { label: 'multi_agent=false + multi_agent_v2=true, effort=ultra', cfg: 'model_reasoning_effort = "ultra"\n\n[features]\nmulti_agent = false\nmulti_agent_v2 = true\n', expected: 'proactive' },
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
