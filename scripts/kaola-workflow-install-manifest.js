#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// kaola-workflow-install-manifest.js (issue #407 — #365 deferred half)
//
// SINGLE SOURCE for install.sh's per-forge SUPPORT_SCRIPT_NAMES / SUPPORT_HOOK_NAMES
// lists. Before #407 those lists were hand-maintained in THREE `case "$FORGE"` blocks
// in install.sh AND duplicated by the per-forge validator lists — the exact triplication
// that the surface-map-undercount class of batch-planning bugs feeds on (registering a
// new shared script meant ≥3 edits, and a missed copy silently shipped a broken edition).
//
// This manifest derives every forge's support set from ONE canonical list + a declared,
// rename-IFF-the-renamed-file-exists transform (the same discipline as edition-sync.js's
// aggregator-port rename map) + a small set of per-forge-only adds and content-rename
// overrides. install.sh consumes it via a portable `while read` loop (NOT mapfile — the
// install target may run macOS bash 3.2). Registering a new shared support script is now
// ≤2 places: add it to SUPPORT_SCRIPTS here (+ the rename map only if its forge port is
// content-renamed, e.g. sink-pr→sink-mr).
//
// Forge-NEUTRAL data + pure helpers only — no forge CLI calls, no remote URLs, no fs
// writes. The on-disk existence probe (renameIfPorted) reads only the plugin scripts dirs
// to decide rename-or-keep, exactly mirroring edition-sync's "renamed IFF a port exists".
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

// Anchor on the dir that actually carries install.sh (the consumer): from the canonical scripts/
// that is path.resolve(__dirname,'..'), but this script is also byte-mirrored into the codex plugin
// tree (validate-workflow-contracts.js require()s it) where __dirname/.. is the plugin root, NOT the
// repo root. Walk up to the first ancestor containing install.sh so the forge-dir probes resolve from
// either location. Falls back to __dirname/.. when install.sh isn't found (keeps tests robust).
function findRepoRoot(startDir) {
  // Test override: a temp manifest copy outside the tree (KAOLA_MANIFEST_REPO_ROOT) can name the repo
  // root explicitly so its forge-dir rename probes still resolve.
  if (process.env.KAOLA_MANIFEST_REPO_ROOT) return path.resolve(process.env.KAOLA_MANIFEST_REPO_ROOT);
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'install.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir, '..');
}
const repoRoot = findRepoRoot(__dirname);

// The canonical (github / Claude) support-script logical set, in install order. Every entry is a
// real file in scripts/ (github) and is the BASE the forge rename transform is applied to. This is
// the ONE place a new shared support script is registered.
//
// Intentional per-forge exclusions (dev/CI-only — deliberately NOT in this list):
//   kaola-workflow-edition-sync.js — github edition-sync; dev/CI tool, not a runtime script
//   kaola-workflow-fixtures-orphan-legality.js — CI-only fixture validator
//   kaola-workflow-fast-audit.js — CI-only audit tool
//   kaola-workflow-install-manifest.js (this file) — build-time manifest, not a runtime script
//   kaola-workflow-release-surface-drift.js — dev/CI release drift checker
//   validate-workflow-contracts.js + forge siblings — CI-only contract validators
//   install-codex-agent-profiles.js (gitlab/gitea) — Codex-only agent setup, not claude runtime
// Note: kaola-workflow-ledger-compare.js IS in this list (tracked separately; added in #412).
const SUPPORT_SCRIPTS = Object.freeze([
  'kaola-workflow-repair-state.js',
  'kaola-workflow-claim.js',
  'kaola-workflow-active-folders.js',
  'kaola-workflow-closure-audit.js',
  'kaola-workflow-closure-contract.js',
  'kaola-workflow-compact-context.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-plan-validator.js',
  'kaola-workflow-next-action.js',
  'kaola-workflow-commit-node.js',
  'kaola-workflow-adaptive-handoff.js',
  'kaola-workflow-adaptive-node.js',
  'kaola-workflow-parallel-batch.js',
  'kaola-workflow-adaptive-schema.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-codex-preflight.js',
  'kaola-workflow-task-mirror.js',
  'kaola-workflow-ledger-compare.js',
  'kaola-workflow-gap-sweep.js',
  'kaola-workflow-run-chains.js',
]);

// Hooks are forge-neutral (byte-identical across all four trees), so the same list serves
// every forge. Adding a hook is a one-place edit here.
const SUPPORT_HOOKS = Object.freeze([
  'kaola-workflow-pre-commit.sh',
  'kaola-workflow-subagent-dispatch-log.sh',
  'kaola-workflow-write-lane.sh',
]);

// Per-forge CONTENT-rename overrides: a canonical base whose forge port is NOT a pure prefix
// rename. gitlab renames sink-pr → sink-mr (merge-request vocabulary); gitea keeps sink-pr but
// prefix-renames it. github keeps the canonical name. Only the genuinely content-renamed pair
// needs an entry; pure prefix renames are handled by renameIfPorted below.
const FORGE_RENAME_OVERRIDES = Object.freeze({
  gitlab: { 'kaola-workflow-sink-pr.js': 'kaola-gitlab-workflow-sink-mr.js' },
  gitea: {},
  github: {},
});

// Per-forge-only ADDS (scripts that exist only in a forge edition): the forge data-layer script +
// the edition-named Codex compact-resume hook script. Appended after the transformed shared set.
const FORGE_ONLY_SCRIPTS = Object.freeze({
  github: [],
  gitlab: ['kaola-gitlab-forge.js', 'kaola-gitlab-workflow-codex-compact-resume.js'],
  gitea: ['kaola-gitea-forge.js', 'kaola-gitea-workflow-codex-compact-resume.js'],
});

const FORGES = Object.freeze(['github', 'gitlab', 'gitea']);

function forgePluginScriptsDir(forge) {
  if (forge === 'github') return path.join(repoRoot, 'scripts');
  return path.join(repoRoot, 'plugins', `kaola-workflow-${forge}`, 'scripts');
}

// Rename a canonical base for a forge: an explicit content-rename override wins; otherwise the
// prefix transform kaola-workflow-<X> -> kaola-<forge>-workflow-<X> applies IFF that port exists
// on disk (so byte-identical shared files — closure-contract, adaptive-schema, resolve-agent-model,
// codex-preflight — keep their canonical name, exactly the edition-sync rename-IFF-ported rule).
function renameIfPorted(base, forge) {
  if (forge === 'github') return base;
  const override = FORGE_RENAME_OVERRIDES[forge] && FORGE_RENAME_OVERRIDES[forge][base];
  if (override) return override;
  const prefixed = base.replace(/^kaola-workflow-/, `kaola-${forge}-workflow-`);
  if (prefixed === base) return base; // no kaola-workflow- prefix to rename
  return fs.existsSync(path.join(forgePluginScriptsDir(forge), prefixed)) ? prefixed : base;
}

// The ordered support-script names install.sh must copy for a forge.
function supportScripts(forge) {
  assertForge(forge);
  const shared = SUPPORT_SCRIPTS.map(base => renameIfPorted(base, forge));
  return [...shared, ...(FORGE_ONLY_SCRIPTS[forge] || [])];
}

// The ordered support-hook names install.sh must copy for a forge (forge-neutral).
function supportHooks(forge) {
  assertForge(forge);
  return [...SUPPORT_HOOKS];
}

function assertForge(forge) {
  if (!FORGES.includes(forge)) {
    throw new Error(`unknown forge "${forge}" (expected one of ${FORGES.join('/')})`);
  }
}

// CLI: install.sh shells `node kaola-workflow-install-manifest.js --forge=<f> --scripts|--hooks`,
// one name per line. Self-check (#407 anti-5.4.0-silent-empty): a non-empty list is mandatory —
// exit 2 on an empty emission so install.sh never silently copies zero support files.
function main(argv) {
  let forge = null;
  let mode = null;
  for (const arg of argv) {
    if (arg.startsWith('--forge=')) forge = arg.slice('--forge='.length);
    else if (arg === '--scripts') mode = 'scripts';
    else if (arg === '--hooks') mode = 'hooks';
    else {
      process.stderr.write(`install-manifest: unknown argument "${arg}"\n`);
      process.exit(2);
    }
  }
  if (!forge || !mode) {
    process.stderr.write('install-manifest: usage: --forge=<github|gitlab|gitea> (--scripts|--hooks)\n');
    process.exit(2);
  }
  let names;
  try {
    names = mode === 'scripts' ? supportScripts(forge) : supportHooks(forge);
  } catch (e) {
    process.stderr.write(`install-manifest: ${e.message}\n`);
    process.exit(2);
  }
  if (!Array.isArray(names) || names.length === 0) {
    process.stderr.write(`install-manifest: empty ${mode} list for forge ${forge} — refusing (would copy zero support files)\n`);
    process.exit(2);
  }
  process.stdout.write(names.join('\n') + '\n');
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  SUPPORT_SCRIPTS,
  SUPPORT_HOOKS,
  FORGES,
  supportScripts,
  supportHooks,
  renameIfPorted,
};
