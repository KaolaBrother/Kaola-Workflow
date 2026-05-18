#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

function run(script) {
  execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitlab/scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

run('test-gitlab-forge-helpers.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');

console.log('GitLab workflow walkthrough simulation passed');

