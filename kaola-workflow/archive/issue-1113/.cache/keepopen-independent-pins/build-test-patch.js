'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = '/Users/ylmacstudio/Workspace/kaola-workflow';
const output = path.join(__dirname, 'proposed-test-integration.patch');
const snapshot = 'kaola-workflow/issue-1113/.cache/keepopen-independent-pins/frozen-source/provider-fe7e4443a8c367cfc111c65755191ae6790e810e';
const testSourceRelative = 'kaola-workflow/issue-1113/.cache/keepopen-independent-pins/proposed-test/scripts/test-issue-1113-keepopen-pr.js';
const testSource = path.join(repo, testSourceRelative);
const testTarget = 'scripts/test-issue-1113-keepopen-pr.js';
const basePackageRelative = snapshot + '/package.json';
const proposedPackageRelative = 'kaola-workflow/issue-1113/.cache/keepopen-independent-pins/proposed-test/package.json';
const proposedPackage = path.join(repo, proposedPackageRelative);
const pkg = JSON.parse(fs.readFileSync(path.join(repo, basePackageRelative), 'utf8'));
pkg.scripts['test:issue-1113:keepopen-pr'] = 'node scripts/test-issue-1113-keepopen-pr.js';
fs.writeFileSync(proposedPackage, JSON.stringify(pkg, null, 2) + '\n');

const testDiff = spawnSync('git', ['diff', '--no-index', '--', '/dev/null', testSourceRelative], {
  cwd: repo, encoding: 'utf8',
});
const packageDiff = spawnSync('git', ['diff', '--no-index', '--', basePackageRelative, proposedPackageRelative], {
  cwd: repo, encoding: 'utf8',
});
assert.strictEqual(testDiff.status, 1, 'new-file diff should exit 1 before it is integrated');
assert.strictEqual(packageDiff.status, 1, 'package diff should exit 1 because it adds the focused test command');
const testPatch = testDiff.stdout
  .replaceAll('a/' + testSourceRelative, 'a/' + testTarget)
  .replaceAll('b/' + testSourceRelative, 'b/' + testTarget);
const packagePatch = packageDiff.stdout
  .replaceAll('a/' + basePackageRelative, 'a/package.json')
  .replaceAll('b/' + proposedPackageRelative, 'b/package.json');
const patch = testPatch + packagePatch;
assert(patch.includes('diff --git a/' + testTarget + ' b/' + testTarget), 'suite path was not normalized');
assert(patch.includes('+++ b/' + testTarget), 'suite add path was not normalized');
assert(patch.includes('diff --git a/package.json b/package.json'), 'focused npm command path was not normalized');
fs.writeFileSync(output, patch);
const receipt = {
  diffs: [
    { command: 'git diff --no-index -- /dev/null ' + testSourceRelative, exit: testDiff.status, meaning: 'expected 1 because the suite is a new file' },
    { command: 'git diff --no-index -- ' + basePackageRelative + ' ' + proposedPackageRelative, exit: packageDiff.status, meaning: 'expected 1 because the proposal adds a focused npm command' },
  ],
  patch_path: output,
  patch_sha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
  source_sha256: crypto.createHash('sha256').update(fs.readFileSync(testSource)).digest('hex'),
  proposed_package_sha256: crypto.createHash('sha256').update(fs.readFileSync(proposedPackage)).digest('hex'),
};
fs.writeFileSync(path.join(__dirname, 'patch-build-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log('test-only patch built: ' + receipt.patch_sha256);
