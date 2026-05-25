#!/usr/bin/env node
// Drift guard: ensures scripts shared by both Claude Code (scripts/) and Codex
// (plugins/kaola-workflow/scripts/) trees stay byte-identical. Fails CI when
// out of sync. See issue #36.

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const claudeDir = path.join(repoRoot, 'scripts');
const codexDir = path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts');

// Scripts present in BOTH trees that must stay in sync. Tree-specific files
// are intentionally excluded:
//
//   simulate-workflow-walkthrough.js (Claude) and simulate-kaola-workflow-walkthrough.js
//     (Codex) — these test DIFFERENT surfaces and must NEVER be synced. The Claude
//     variant is a 4700-line end-to-end workflow walkthrough that exercises the
//     compact-context.js hook (Claude-only). The Codex variant is a focused 1100-line
//     test of Codex-specific claim semantics (runtime tagging, parallel bootstrap,
//     roadmap sync). A previous "sync everything" pass (commit 308f747) clobbered
//     the Codex variant with the Claude one; do not repeat that.
//
//   kaola-workflow-compact-context.js (Claude-only) —
//     this implements the Claude Code compact-context hook that has no Codex equivalent.
//     The Codex simulation invokes kaola-workflow-compact-context.js via a repo-root
//     absolute path (see `plugins/kaola-workflow/scripts/simulate-kaola-workflow-walkthrough.js`),
//     so no plugin-local copy is needed.
//
//   validate-kaola-workflow-contracts.js (Codex-only) — Codex contract validator;
//     the Claude validator is validate-workflow-contracts.js (in the allowlist below).
//
//   install-codex-agent-profiles.js (Codex-only) — installs .codex/agents/ TOML
//     profiles; not used by the Claude pack.
//
// Hook files that must stay byte-identical across every install surface are
// checked below. `hooks/hooks.json` is intentionally excluded because each forge
// points at its own compact-context script name.
const COMMON_SCRIPTS = [
  'kaola-workflow-claim.js',
  'kaola-workflow-active-folders.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-repair-state.js',
  'kaola-workflow-resolve-agent-model.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'validate-workflow-contracts.js',
];

const BYTE_IDENTICAL_GROUPS = [
  {
    label: 'pre-commit hook copies',
    files: [
      'hooks/kaola-workflow-pre-commit.sh',
      'plugins/kaola-workflow/hooks/kaola-workflow-pre-commit.sh',
      'plugins/kaola-workflow-gitlab/hooks/kaola-workflow-pre-commit.sh',
      'plugins/kaola-workflow-gitea/hooks/kaola-workflow-pre-commit.sh',
    ],
  },
  {
    label: 'closure-contract module copies',
    files: [
      'scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow/scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-closure-contract.js',
      'plugins/kaola-workflow-gitea/scripts/kaola-workflow-closure-contract.js',
    ],
  },
];

function readOrNull(p) {
  try { return fs.readFileSync(p); } catch { return null; }
}

const drift = [];
const missing = [];

for (const name of COMMON_SCRIPTS) {
  const a = readOrNull(path.join(claudeDir, name));
  const b = readOrNull(path.join(codexDir, name));
  if (a === null) missing.push(`scripts/${name}`);
  if (b === null) missing.push(`plugins/kaola-workflow/scripts/${name}`);
  if (a !== null && b !== null && !a.equals(b)) {
    drift.push(name);
  }
}

for (const group of BYTE_IDENTICAL_GROUPS) {
  const [reference, ...copies] = group.files;
  const referenceBytes = readOrNull(path.join(repoRoot, reference));
  if (referenceBytes === null) {
    missing.push(reference);
    continue;
  }
  for (const copy of copies) {
    const copyBytes = readOrNull(path.join(repoRoot, copy));
    if (copyBytes === null) {
      missing.push(copy);
    } else if (!referenceBytes.equals(copyBytes)) {
      drift.push(`${group.label}: ${copy} differs from ${reference}`);
    }
  }
}

if (missing.length === 0 && drift.length === 0) {
  console.log(`OK: ${COMMON_SCRIPTS.length} common scripts and ${BYTE_IDENTICAL_GROUPS.length} byte-identical file group in sync.`);
  process.exit(0);
}

if (missing.length > 0) {
  console.error('Missing files:');
  for (const m of missing) console.error(`  - ${m}`);
}
if (drift.length > 0) {
  console.error('Out of sync (scripts/ vs plugins/kaola-workflow/scripts/):');
  for (const d of drift) console.error(`  - ${d}`);
  console.error('');
  console.error('Fix: copy the canonical version. Example:');
  console.error('  for f in ' + drift.join(' ') + '; do');
  console.error('    cp "scripts/$f" "plugins/kaola-workflow/scripts/$f"');
  console.error('  done');
}
process.exit(1);
