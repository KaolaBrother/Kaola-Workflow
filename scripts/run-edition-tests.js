#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const suites = Object.freeze(process.argv.slice(2).map(requested => {
  const absolute = path.resolve(repoRoot, requested);
  if (path.dirname(absolute) !== __dirname || !/^test-.*\.js$/.test(path.basename(absolute))) {
    throw new Error('edition suite must be a scripts/test-*.js path: ' + requested);
  }
  return absolute;
}));

if (suites.length === 0) {
  throw new Error('no edition suites declared');
}

const failures = [];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    cwd: repoRoot,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failures.push({
      suite: path.relative(repoRoot, suite),
      status: result.status,
      signal: result.signal || null,
      error: result.error ? result.error.message : null,
    });
  }
}

if (failures.length > 0) {
  console.error('edition test lane FAILED after attempting all suites: ' + JSON.stringify(failures));
  process.exitCode = 1;
} else {
  console.log('edition test lane passed: all ' + suites.length + ' suites executed successfully.');
}
