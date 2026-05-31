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
  const phase6 = readInstalledCommand('kaola-workflow-phase6.md');
  const fast = readInstalledCommand('kaola-workflow-fast.md');

  assert(phase3.includes('model="opus",'), 'higher profile should render code-architect as opus');
  assert(phase4.includes('model="sonnet",'), 'tdd-guide should render as sonnet');
  assert(
    phase4.includes('\n\n## Validation Delegation Policy\n\n'),
    'installer rendering should preserve blank markdown lines'
  );
  assert(phase5.includes('model="opus",'), 'higher profile should render reviewers as opus');
  assert(phase6.includes('model="sonnet",'), 'doc-updater should render as sonnet');
  assert(
    phase5.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'phase5 routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    phase6.includes('subagent_type="build-error-resolver",\n  model="sonnet",'),
    'phase6 routed-fix build-error-resolver block should render as sonnet'
  );
  assert(
    phase5.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'phase5 routed-fix tdd-guide block should render as sonnet'
  );
  assert(
    phase6.includes('subagent_type="tdd-guide",\n  model="sonnet",'),
    'phase6 routed-fix tdd-guide block should render as sonnet'
  );
  assert(fast.includes('model="opus",'), 'fast command should render higher-profile reviewer/planner models');

  const allCommands = fs.readdirSync(path.join(tmp, '.claude', 'commands'))
    .filter(name => name.endsWith('.md'))
    .map(name => readInstalledCommand(name))
    .join('\n');
  assert(!/model="\{[A-Z_]+_MODEL\}"/.test(allCommands), 'installed commands must not keep model placeholders');

  const requiredAgents = ['code-explorer','docs-lookup','planner','code-architect','tdd-guide',
    'build-error-resolver','code-reviewer','security-reviewer','doc-updater'];
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
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('Install model rendering tests passed');
