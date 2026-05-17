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
// (compact-context, session-env, simulate-*, validate-kaola-workflow-contracts,
// install-codex-agent-profiles) are intentionally excluded.
const COMMON_SCRIPTS = [
  'kaola-workflow-claim.js',
  'kaola-workflow-classifier.js',
  'kaola-workflow-repair-state.js',
  'kaola-workflow-roadmap.js',
  'kaola-workflow-sink-merge.js',
  'kaola-workflow-sink-pr.js',
  'validate-workflow-contracts.js',
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

if (missing.length === 0 && drift.length === 0) {
  console.log(`OK: ${COMMON_SCRIPTS.length} common scripts in sync.`);
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
