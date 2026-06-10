#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-models-'));

function readInstalledCommand(name) {
  return fs.readFileSync(path.join(tmp, '.claude', 'commands', name), 'utf8');
}

try {
  execFileSync(
    'bash',
    ['install.sh', '--yes', '--forge=github', '--profile=higher', '--no-settings-merge'],
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

  // Default profile is `higher`: a no-flag install renders the three reviewer
  // agents on Opus (this is what locks the default — not an explicit --profile).
  {
    const dtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-default-'));
    try {
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--no-settings-merge'],
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
      execFileSync('bash', ['install.sh', '--yes', '--forge=github', '--profile=common', '--no-settings-merge'],
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

  // #363: verification fails CLOSED for forges. Plant a typo'd entry in the gitea
  // SUPPORT_SCRIPT_NAMES (a temp copy IN the repo root so SCRIPT_DIR still resolves to the repo)
  // and assert the install ABORTS — the prior code silently skipped the missing source and verified
  // green (the 5.4.0 incident class).
  {
    const typoScript = path.join(root, '.kw-install-typo-test-363.sh');
    const ttmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-install-typo-'));
    try {
      const src = fs.readFileSync(path.join(root, 'install.sh'), 'utf8');
      // inject a bogus name right after the first gitea allowlist entry.
      const injected = src.replace('kaola-gitea-forge.js\n', 'kaola-gitea-forge.js\n      kaola-gitea-NONEXISTENT-typo-363.js\n');
      assert(injected !== src, 'planted-typo test: failed to inject a bogus gitea allowlist entry');
      fs.writeFileSync(typoScript, injected);
      const result = require('child_process').spawnSync('bash', [typoScript, '--yes', '--forge=gitea', '--no-settings-merge'],
        { cwd: root, env: { ...process.env, HOME: ttmp }, encoding: 'utf8' });
      assert(result.status !== 0, '#363: a typo\'d gitea SUPPORT_SCRIPT_NAMES entry must FAIL the install, got exit ' + result.status);
      assert(/missing from source/.test((result.stderr || '') + (result.stdout || '')),
        '#363: the install abort must name the missing source; got: ' + result.stderr);
    } finally {
      fs.rmSync(typoScript, { force: true });
      fs.rmSync(ttmp, { recursive: true, force: true });
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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Install model rendering tests passed');
