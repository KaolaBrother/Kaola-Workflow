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

module.exports = { detectCodexReleaseSurfaceDrift, defaultReadAtTag, versionOf };
