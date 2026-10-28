#!/usr/bin/env node
'use strict';

// test-issue-1123-additive-guard.js — #1123 P3 additive-runtime decision evidence.
//
// The additive runtimes chose the issue's explicit "single forge, P1 guard" alternative. This
// suite ties each edition to that decision without pretending a union layout exists:
//   - every docs/<runtime>-edition.md records the single-forge posture;
//   - the shared gitea install manifest (consumed by every runtime) carries the guarded claim;
//   - the guarded gitea claim refuses a github.com repo with forge_mismatch before tea runs.
// The full install/prune path is deliberately not claimed here; that path is the single-forge
// replacement documented in each edition doc.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNTIMES = ['opencode', 'kimi', 'grok', 'cursor', 'zcode', 'devin', 'droid', 'dsh', 'antigravity', 'hermes'];
const GITEA_CLAIM = path.join(ROOT, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-claim.js');

for (const runtime of RUNTIMES) {
  const docs = fs.readFileSync(path.join(ROOT, 'docs', runtime + '-edition.md'), 'utf8');
  assert(docs.includes('#1123 P3'), runtime + ': docs record the P3 decision');
  assert(/single-forge/i.test(docs), runtime + ': docs record the single-forge decision');
  assert(/P1 resolver guard/i.test(docs), runtime + ': docs name the P1 guard');

  // spawn-class: cli-contract
  const manifest = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'kaola-workflow-install-manifest.js'), '--forge=gitea', '--scripts'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(manifest.status, 0, runtime + ': gitea manifest exits 0');
  assert(manifest.stdout.split('\n').includes('kaola-gitea-workflow-claim.js'),
    runtime + ': gitea manifest installs the guarded claim');
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-p3-additive-'));
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-p3-additive-repo-'));
try {
  // spawn-class: environment
  const git = (args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.strictEqual(git(['init', '-q', '.']).status, 0);
  git(['config', 'user.email', 'p3@example.invalid']);
  git(['config', 'user.name', 'P3']);
  git(['commit', '-q', '--allow-empty', '-m', 'base']);
  git(['remote', 'add', 'origin', 'https://github.com/example/a.git']);

  const marker = path.join(home, 'tea.calls');
  const mock = path.join(home, 'tea-mock.js');
  fs.writeFileSync(mock, [
    "const fs = require('fs');",
    'fs.appendFileSync(' + JSON.stringify(marker) + ", 'called\\n');",
    "process.stdout.write('[]\\n');",
  ].join('\n'));

  // spawn-class: cli-contract
  const res = spawnSync(process.execPath, [GITEA_CLAIM, 'startup', '--target-issue', '1', '--json'], {
    cwd: repo,
    encoding: 'utf8',
    timeout: 60000,
    env: { HOME: home, PATH: process.env.PATH, KAOLA_TEA_MOCK_SCRIPT: mock },
  });
  assert.strictEqual(res.status, 1, 'gitea claim refuses a github repo: ' + res.stdout + res.stderr);
  const body = JSON.parse(String(res.stdout).trim().split('\n').pop());
  assert.strictEqual(body.reason, 'forge_mismatch', 'refusal reason is forge_mismatch');
  assert(!fs.existsSync(marker), 'tea was not called before the refusal');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
}

console.log('OK: test-issue-1123-additive-guard.js — ' + RUNTIMES.length + ' runtime decisions; shared manifest + guard');
