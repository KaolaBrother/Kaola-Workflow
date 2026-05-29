#!/usr/bin/env node
'use strict';

// Regression test for issue #193 (Branch A): release validation must catch a
// Codex manifest version that moved AFTER the tag. Exercises the real
// detectCodexReleaseSurfaceDrift comparison with an injected "read at tag"
// reader so the case is covered without creating a throwaway git repo.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectCodexReleaseSurfaceDrift } = require('./release-surface-drift');

let passed = 0;
function assert(cond, msg) {
  if (!cond) { throw new Error('FAIL: ' + msg); }
  passed++;
}

// Build a sandbox working tree with one Codex manifest at version 1.7.2.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-surface-drift-'));
const rel = 'plugins/kaola-workflow/.codex-plugin/plugin.json';
fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
fs.writeFileSync(path.join(tmp, rel), JSON.stringify({ name: 'kaola-workflow', version: '1.7.2' }) + '\n');

// 1. tag-exists-but-release-surface-moved-after-tag: tag recorded 1.7.1, tree is 1.7.2.
const movedReader = () => JSON.stringify({ name: 'kaola-workflow', version: '1.7.1' });
const moved = detectCodexReleaseSurfaceDrift(tmp, 'kaola-workflow--v9.9.9', [rel], movedReader);
assert(moved.length === 1, 'a version that moved after the tag must report drift');
assert(moved[0].tagged === '1.7.1' && moved[0].tree === '1.7.2',
  'drift entry must report tagged=1.7.1 tree=1.7.2, got ' + JSON.stringify(moved[0]));

// 2. In sync: tag records the same 1.7.2 the tree has -> no drift.
const sameReader = () => JSON.stringify({ name: 'kaola-workflow', version: '1.7.2' });
const same = detectCodexReleaseSurfaceDrift(tmp, 'kaola-workflow--v9.9.9', [rel], sameReader);
assert(same.length === 0, 'a manifest matching the tag must report no drift');

// 3. Manifest absent at the tag (added after the tag) -> drift with tagged=null.
const absentReader = () => null;
const absent = detectCodexReleaseSurfaceDrift(tmp, 'kaola-workflow--v9.9.9', [rel], absentReader);
assert(absent.length === 1 && absent[0].tagged == null,
  'a manifest absent at the tag must report drift with tagged=null');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Release-surface drift regression passed (' + passed + ' assertions)');
