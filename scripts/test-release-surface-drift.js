#!/usr/bin/env node
'use strict';

// Regression test for issue #193 (Branch A): release validation must catch a
// Codex manifest version that moved AFTER the tag. Exercises the real
// detectCodexReleaseSurfaceDrift comparison with an injected "read at tag"
// reader so the case is covered without creating a throwaway git repo.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { detectCodexReleaseSurfaceDrift, tagAncestry } = require('./release-surface-drift');

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

// issue #402: tagAncestry — the release tag must point at an ancestor of HEAD.
// Injected git primitives so the comparison runs without a real repo.

// 4. Tag IS an ancestor of HEAD -> ok:true reason 'ok'.
const ancestor = tagAncestry('/repo', 'kaola-workflow--v9.9.9', 'HEAD', {
  tagTarget: () => 'aaaaaaa',
  isAncestor: () => true,
});
assert(ancestor.ok === true && ancestor.reason === 'ok' && ancestor.tagSha === 'aaaaaaa',
  'an ancestor tag must report ok:true reason:ok, got ' + JSON.stringify(ancestor));

// 5. Tag is ORPHANED (present but not an ancestor — the rebase hazard) -> ok:false.
const orphaned = tagAncestry('/repo', 'kaola-workflow--v9.9.9', 'HEAD', {
  tagTarget: () => 'bbbbbbb',
  isAncestor: () => false,
});
assert(orphaned.ok === false && orphaned.reason === 'tag_not_ancestor_of_head' && orphaned.tagSha === 'bbbbbbb',
  'an orphaned tag must report ok:false reason:tag_not_ancestor_of_head, got ' + JSON.stringify(orphaned));

// 6. Tag ABSENT (rev-list could not resolve it) -> inert ok:true reason 'tag_absent';
//    isAncestor must never be consulted (the existing tag-existence assert owns absence).
let ancestorProbed = false;
const noTag = tagAncestry('/repo', 'kaola-workflow--vNONE', 'HEAD', {
  tagTarget: () => null,
  isAncestor: () => { ancestorProbed = true; return false; },
});
assert(noTag.ok === true && noTag.reason === 'tag_absent' && noTag.tagSha === null,
  'an absent tag must be inert ok:true reason:tag_absent, got ' + JSON.stringify(noTag));
assert(ancestorProbed === false,
  'an absent tag must short-circuit before the ancestry probe');

// 7. Ancestry INDETERMINATE (shallow clone / git error -> null) -> inert ok:true.
const indeterminate = tagAncestry('/repo', 'kaola-workflow--v9.9.9', 'HEAD', {
  tagTarget: () => 'ccccccc',
  isAncestor: () => null,
});
assert(indeterminate.ok === true && indeterminate.reason === 'ancestry_indeterminate',
  'an indeterminate ancestry must stay inert ok:true, got ' + JSON.stringify(indeterminate));

console.log('Release-surface drift regression passed (' + passed + ' assertions)');
