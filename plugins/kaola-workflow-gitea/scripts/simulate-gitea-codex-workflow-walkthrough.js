#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

function run(script) {
  execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitea/scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

// M4 + M2 (#277): static source-text assertions — the gitea fork claim.js must contain the
// run_posture derivation (M4) and the dispatch-attestation function (M2).
// (#284): Codex lifecycle hooks (SessionStart/PreToolUse/PostToolUse/SubagentStart including
// dispatch-log) are now wired via config/hooks.json + install-codex-agent-profiles.js.
const giteaClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js'), 'utf8');
if (!giteaClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitea-codex: kaola-gitea-workflow-claim.js must implement run_posture');
}
if (!giteaClaimSrc.includes('claim_planner_attested')) {
  throw new Error('M2 (#277): gitea-codex: kaola-gitea-workflow-claim.js must implement claim_planner_attested (warn-first attestation)');
}

// #284: config/hooks.json must exist, parse, and register the SubagentStart dispatch-log hook.
const hooksConfigPath = path.join(root, 'plugins/kaola-workflow-gitea/config/hooks.json');
if (!fs.existsSync(hooksConfigPath)) {
  throw new Error('#284: plugins/kaola-workflow-gitea/config/hooks.json must exist');
}
let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));
} catch (e) {
  throw new Error('#284: plugins/kaola-workflow-gitea/config/hooks.json must be valid JSON: ' + e.message);
}
const subagentEntries = (hooksConfig.hooks && hooksConfig.hooks['SubagentStart']) || [];
const dispatchLogEntry = subagentEntries.find(
  e => e.id && e.id.startsWith('kaola-workflow:') &&
       e.hooks && e.hooks.some(h => h.command && h.command.includes('kaola-workflow-subagent-dispatch-log.sh'))
);
if (!dispatchLogEntry) {
  throw new Error(
    '#284: config/hooks.json SubagentStart must have a kaola-workflow: entry whose command references ' +
    'kaola-workflow-subagent-dispatch-log.sh'
  );
}

run('validate-kaola-workflow-gitea-contracts.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');

console.log('Gitea Codex workflow walkthrough simulation passed');
