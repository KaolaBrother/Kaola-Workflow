#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

function run(script) {
  execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitlab/scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

// M4 + M2 (#277): static source-text assertions — the gitlab fork claim.js must contain the
// run_posture derivation (M4) and the dispatch-attestation function (M2).
// #284: Codex lifecycle hooks (SessionStart/PreToolUse/PostToolUse/SubagentStart) are now wired
// via plugins/kaola-workflow-gitlab/config/hooks.json; M1 dispatch-log hook ships in this release.
const gitlabClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js'), 'utf8');
if (!gitlabClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement run_posture');
}
if (!gitlabClaimSrc.includes('claim_planner_attested')) {
  throw new Error('M2 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement claim_planner_attested (warn-first attestation)');
}

// #284: static assertion — config/hooks.json must exist, parse, and register the SubagentStart
// dispatch-log hook (M1), proving the Codex lifecycle hook producer is wired in this edition.
const hooksJsonPath = path.join(root, 'plugins/kaola-workflow-gitlab/config/hooks.json');
if (!fs.existsSync(hooksJsonPath)) {
  throw new Error('#284: plugins/kaola-workflow-gitlab/config/hooks.json must exist');
}
let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
} catch (e) {
  throw new Error('#284: plugins/kaola-workflow-gitlab/config/hooks.json must parse as valid JSON: ' + e.message);
}
const subagentEntries = (hooksConfig.hooks && hooksConfig.hooks['SubagentStart']) || [];
const dispatchLogEntry = subagentEntries.find(
  e => e.id && e.id.startsWith('kaola-workflow:') &&
       (e.hooks || []).some(h => h.command && h.command.includes('kaola-workflow-subagent-dispatch-log.sh'))
);
if (!dispatchLogEntry) {
  throw new Error(
    '#284: config/hooks.json SubagentStart must contain a kaola-workflow: entry whose command references kaola-workflow-subagent-dispatch-log.sh'
  );
}

run('validate-kaola-workflow-gitlab-contracts.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');

console.log('GitLab Codex workflow walkthrough simulation passed');

