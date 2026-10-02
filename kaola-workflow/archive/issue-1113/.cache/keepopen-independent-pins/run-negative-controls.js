'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const out = __dirname;
const suite = path.join(out, 'proposed-test', 'scripts', 'test-issue-1113-keepopen-pr.js');
const adapter = path.join(out, 'fixture-adapter.js');
const controls = [
  ['close-body', 'closing reference found'],
  ['qualified-commit-close', 'closing reference found'],
  ['auto-merge', 'auto-merge or merge-queue operation occurred'],
  ['queue', 'auto-merge or merge-queue operation occurred'],
  ['identity-loss', 'claim, branch, MAIN/worktree, ledger, and evidence identity must match'],
  ['ledger-mutation', 'ledger hash changed'],
  ['artifact-drop', 'evidence inventory changed'],
  ['wrong-base', 'PR base mismatch'],
  ['wrong-head', 'PR head mismatch'],
  ['duplicate-pr', 'retry duplicated the PR'],
  ['index-mutation', 'MAIN index changed'],
  ['unknown-as-open', 'watcher disposition is not truthful'],
  ['closed-as-kept-open', 'watcher disposition is not truthful'],
  ['auto-reopen', 'automatically reopened the issue'],
  ['unrelated-scope', 'watcher changed an unrelated issue folder'],
  ['refusal-effect', 'unsafe effect occurred before refusal'],
  ['merged-republish', 'MERGED request was republished'],
  ['accept-missing-action', 'unsafe or unsupported input must refuse'],
  ['main-head-mutation', 'MAIN HEAD changed'],
];

const receipts = [];
for (const [name, expectedMessage] of controls) {
  const child = spawnSync(process.execPath, [suite], {
    cwd: out,
    encoding: 'utf8',
    timeout: 15000,
    env: {
      ...process.env,
      KW_ISSUE_1113_KEEP_OPEN_TEST_ADAPTER: adapter,
      KW1113_MUTANT: name,
    },
  });
  const stdout = child.stdout || '';
  const stderr = child.stderr || '';
  fs.writeFileSync(path.join(out, 'negative-final-' + name + '.stdout.raw'), stdout);
  fs.writeFileSync(path.join(out, 'negative-final-' + name + '.stderr.raw'), stderr);
  fs.writeFileSync(path.join(out, 'negative-final-' + name + '.exit'), String(child.status) + '\n');
  assert.notStrictEqual(child.status, 0, name + ': test suite accepted an unsafe adapter mutation');
  assert(stderr.includes(expectedMessage), name + ': rejection did not come from the intended assertion: ' + stderr);
  receipts.push({ name, expected_rejection: expectedMessage, exit: child.status, detected: true });
}

fs.writeFileSync(path.join(out, 'negative-controls-final.json'), JSON.stringify({ controls: receipts }, null, 2) + '\n');
console.log('negative controls: ' + receipts.length + '/' + receipts.length + ' unsafe adapter mutations rejected by named acceptance assertions');
