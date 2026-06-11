#!/usr/bin/env node
'use strict';

// Release-surface drift detection (issue #193, Branch A policy).
//
// The root `kaola-workflow--v<X.Y.Z>` tag is the single source of truth for the
// entire release surface. Codex plugin manifests carry their own independent
// version numbers, so a Codex manifest bump that lands AFTER the tag (without a
// new root version + tag) silently moves the released surface out from under the
// tag. The root-version tag-existence check cannot catch this because the Codex
// version axis is independent of the package version.
//
// This module compares each Codex manifest's working-tree version against the
// version recorded at the tag and reports drift. validate-workflow-contracts.js
// fails the release validation when drift is present; the remote read is
// injectable so the regression test can exercise the comparison without git.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Reads a file's contents from a git tag's tree. Returns null when the path did
// not exist at that tag (a manifest added after the tag) or git is unavailable.
function defaultReadAtTag(root, tagName, relPath) {
  try {
    return execFileSync('git', ['show', tagName + ':' + relPath], { cwd: root, encoding: 'utf8' });
  } catch (_) {
    return null;
  }
}

function versionOf(jsonText) {
  if (jsonText == null) return null;
  try { return JSON.parse(jsonText).version; } catch (_) { return undefined; }
}

// issue #402: a release tag must point at a commit that is an ANCESTOR of HEAD.
// Two live hazards the bare tag-existence check cannot see:
//   1. An origin-advance rebase of the release stack ORPHANS the tag — it keeps
//      pointing at the pre-rebase commit while npm test stays green (post-rebase
//      content is identical, so the surface-drift check reports nothing).
//   2. `gh release create` with an UNPUSHED tag creates the remote tag at the
//      default-branch tip — a different commit than the local tag target.
// Both are caught by requiring the tag's commit to be reachable from HEAD.
//
// `tagTarget(root, tagName)` resolves the tag to its commit SHA (default: a real
// `git rev-list -1 <tag>`); `isAncestor(root, sha, ref)` answers "is <sha> an
// ancestor of <ref>?" (default: `git merge-base --is-ancestor`, exit 0 => true,
// exit 1 => false). Both are injectable so the regression test runs without git.
//
// Result contract:
//   { ok:true,  tagSha:null,  reason:'tag_absent' }              — tag missing => INERT
//   { ok:true,  tagSha:<sha>, reason:'ok' }                       — tag is an ancestor of HEAD
//   { ok:true,  tagSha:<sha>, reason:'ancestry_indeterminate' }   — merge-base could not decide
//                                                                    (shallow clone / git error) => INERT
//   { ok:false, tagSha:<sha>, reason:'tag_not_ancestor_of_head' } — tag is present but ORPHANED => RED
// Only a DEFINITIVE "not an ancestor" reds; an indeterminate answer never false-fails a release.
function defaultTagTarget(root, tagName) {
  try {
    return execFileSync('git', ['rev-list', '-1', tagName], { cwd: root, encoding: 'utf8' }).trim() || null;
  } catch (_) {
    return null;
  }
}

// Returns true (ancestor), false (definitively not an ancestor), or null
// (indeterminate: git error, shallow clone, unknown ref) — the caller treats
// null as inert, never as a failure.
function defaultIsAncestor(root, sha, ref) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, ref], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (err) {
    // git merge-base --is-ancestor exits 1 for "not an ancestor" (a DEFINITIVE
    // negative) and a higher code for any other error (bad ref, shallow clone) —
    // which we report as indeterminate so it stays inert.
    if (err && err.status === 1) return false;
    return null;
  }
}

function tagAncestry(root, tagName, headRef, deps) {
  deps = deps || {};
  const resolveTarget = deps.tagTarget || defaultTagTarget;
  const ancestor = deps.isAncestor || defaultIsAncestor;
  const ref = headRef || 'HEAD';
  const tagSha = resolveTarget(root, tagName);
  if (!tagSha) {
    // No tag (or unresolvable) — inert. The caller's existing tag-existence
    // assert owns the genuine "tag must exist" failure; this guard never
    // double-reds an absent tag.
    return { ok: true, tagSha: null, reason: 'tag_absent' };
  }
  const verdict = ancestor(root, tagSha, ref);
  if (verdict === false) {
    return { ok: false, tagSha, reason: 'tag_not_ancestor_of_head' };
  }
  if (verdict === null) {
    return { ok: true, tagSha, reason: 'ancestry_indeterminate' };
  }
  return { ok: true, tagSha, reason: 'ok' };
}

// Returns one drift entry per manifest whose tagged version differs from the
// working-tree version. A manifest absent at the tag reports tagged: null.
// `readAtTag` is injectable for testing; it defaults to a real `git show`.
function detectCodexReleaseSurfaceDrift(root, tagName, manifestRelPaths, readAtTag) {
  const read = readAtTag || defaultReadAtTag;
  const drift = [];
  for (const relPath of manifestRelPaths) {
    const treeVersion = versionOf(fs.readFileSync(path.join(root, relPath), 'utf8'));
    const taggedVersion = versionOf(read(root, tagName, relPath));
    if (taggedVersion !== treeVersion) {
      drift.push({ file: relPath, tagged: taggedVersion, tree: treeVersion });
    }
  }
  return drift;
}

module.exports = {
  detectCodexReleaseSurfaceDrift,
  defaultReadAtTag,
  versionOf,
  tagAncestry,
  defaultTagTarget,
  defaultIsAncestor,
};
