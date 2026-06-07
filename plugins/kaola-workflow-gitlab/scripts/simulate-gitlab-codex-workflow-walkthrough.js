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
// (Codex edition has no dispatch-log hook — M1 deferred to #266.)
const gitlabClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js'), 'utf8');
if (!gitlabClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement run_posture');
}
if (!gitlabClaimSrc.includes('claim_planner_attested')) {
  throw new Error('M2 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement claim_planner_attested (warn-first attestation)');
}

run('validate-kaola-workflow-gitlab-contracts.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');

console.log('GitLab Codex workflow walkthrough simulation passed');

