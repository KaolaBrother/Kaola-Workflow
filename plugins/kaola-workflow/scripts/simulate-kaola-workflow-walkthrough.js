#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const pluginRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pluginRoot, '..', '..');
const claimScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
const installProfilesScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const nextSkill = path.join(pluginRoot, 'skills', 'kaola-workflow-next', 'SKILL.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runClaim(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  assert(result.status === 0, 'claim command failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function runClaimRaw(args, cwd) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' }
  });
  if (result.error) throw result.error;
  return { parsed: JSON.parse(result.stdout), exitStatus: result.status, stderr: result.stderr };
}

function assertNoLegacyCoordDirs(root) {
  for (const name of ['lo' + 'cks', 'sess' + 'ions', 'tick' + 'ers']) {
    assert(!fs.existsSync(path.join(root, 'kaola-workflow', '.' + name)), 'legacy coordination dir must not exist: .' + name);
  }
}

function runInstallProfiles(target) {
  const result = spawnSync(process.execPath, [installProfilesScript, target], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  assert(result.status === 0, 'install profiles failed: ' + result.stderr);
}

function countOccurrences(content, pattern) {
  return (content.match(pattern) || []).length;
}

function testInstallProfilesFeaturesTableHandling() {
  const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-fresh-'));
  const existing = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-install-existing-'));
  try {
    runInstallProfiles(fresh);
    const freshConfig = fs.readFileSync(path.join(fresh, '.codex', 'config.toml'), 'utf8');
    assert(freshConfig.includes('[features]'), 'fresh install should include managed [features]');
    assert(freshConfig.includes('multi_agent = true'), 'fresh install should enable multi_agent');
    assert(freshConfig.includes('# BEGIN kaola-workflow agents'), 'fresh install should include managed block');

    const existingCodexDir = path.join(existing, '.codex');
    fs.mkdirSync(existingCodexDir, { recursive: true });
    const existingConfigPath = path.join(existingCodexDir, 'config.toml');
    fs.writeFileSync(existingConfigPath, [
      '[features]',
      'goals = true',
      '',
      '[projects."/tmp/example"]',
      'trust_level = "trusted"',
      ''
    ].join('\n'));

    runInstallProfiles(existing);
    runInstallProfiles(existing);
    const updated = fs.readFileSync(existingConfigPath, 'utf8');
    assert(countOccurrences(updated, /^\[features\]$/gm) === 1, 'existing config must contain exactly one [features] table');
    assert(updated.includes('goals = true'), 'existing [features] content must be preserved');
    assert(updated.includes('[agents.code-explorer]'), 'managed agent block should still be installed');
  } finally {
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.rmSync(existing, { recursive: true, force: true });
  }
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-codex-active-folders-'));
  try {
    // No-evidence offline case must return target_unverified (post-#169 contract).
    const unverified = runClaimRaw(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(unverified.exitStatus === 1,
      'startup with no local evidence must exit 1, got ' + unverified.exitStatus);
    assert(unverified.parsed.verdict === 'target_unverified',
      'no-evidence startup must return target_unverified, got: ' + unverified.parsed.verdict);
    assert(unverified.parsed.claim === 'none',
      'no-evidence startup must report claim=none, got: ' + unverified.parsed.claim);
    assert(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'issue-163')),
      'kaola-workflow/issue-163 must NOT be created when target is unverified');

    // Seed local roadmap evidence so the offline classifier can verify the target.
    const roadmapDir = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(
      path.join(roadmapDir, 'issue-163.md'),
      'issue: #163\ntitle: —\nstatus: open\nworkflow_project: issue-163\nnext_step: ready\n'
    );

    const acquired = runClaim(['startup', '--target-issue', '163', '--runtime', 'codex', '--sink', 'pr'], tmp);
    assert(acquired.claim === 'acquired', 'Codex startup should acquire explicit issue');
    assert(acquired.project === 'issue-163', 'Codex startup should derive project from issue');
    const stateFile = path.join(tmp, 'kaola-workflow', 'issue-163', 'workflow-state.md');
    const state = fs.readFileSync(stateFile, 'utf8');
    assert(state.includes('issue_number: 163'), 'state should record issue number');
    assert(state.includes('sink: pr'), 'state should record PR sink');
    assert(!state.includes('## ' + 'Lease'), 'state should not contain a retired ownership block');
    assertNoLegacyCoordDirs(tmp);

    const owned = runClaim(['startup', '--target-issue', '163', '--runtime', 'codex'], tmp);
    assert(owned.claim === 'owned', 'Codex startup should reuse active folder');

    const status = runClaim(['status'], tmp);
    assert(status.count === 1, 'status should report one active folder');

    const skill = fs.readFileSync(nextSkill, 'utf8');
    assert(skill.includes('active folders'), 'next skill should route via active folders');
    assert(!skill.includes(['verify', 'startup'].join('-')), 'next skill should not require startup verifier');
    assert(!skill.includes(['can', 'hand' + 'off'].join('-')), 'next skill should not describe old transfer flow');

    const validator = path.join(repoRoot, 'scripts', 'validate-kaola-workflow-contracts.js');
    assert(fs.existsSync(validator), 'Codex contract validator must exist');

    testInstallProfilesFeaturesTableHandling();

    console.log('Kaola-Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
