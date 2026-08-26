#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const suites = Object.freeze([
  'test-opencode-edition.js',
  'test-kimi-edition.js',
  'test-grok-edition.js',
  'test-cursor-edition.js',
  'test-zcode-edition.js',
]);

const failures = [];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [path.join(__dirname, suite)], {
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    failures.push({
      suite,
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
