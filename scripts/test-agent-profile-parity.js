#!/usr/bin/env node
'use strict';

// #422.2: agent-profile md↔toml token-pin parity. For each agents/<name>.md that has a .toml twin
// triple (codex/gitlab/gitea), any "feature token" present in the .md MUST also appear in ALL THREE
// .toml twins. Goes RED when a feature paragraph is added to a .md without mirroring the token into
// the toml profiles (the #404 planner-gap class). GREEN at HEAD (#413 landed write_set_granularity
// into the three workflow-planner.toml twins). This is a forge-neutral regression guard run in the
// claude chain (and pinned by all four validate-*-contracts.js, #422.3).

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Curated feature tokens. A token is only enforced for a profile when it APPEARS in that .md, so an
// unused token never causes a false RED. Keep only tokens that are GREEN at HEAD (present in the .md
// AND in all three twins) — add a new token here when a feature paragraph is mirrored into the tomls.
const FEATURE_TOKENS = [
  'write_set_granularity',
  'main-session-gate',
];

// codex tree is the canonical agents/ source for the toml triple.
const TOML_TREES = [
  'plugins/kaola-workflow/agents',
  'plugins/kaola-workflow-gitlab/agents',
  'plugins/kaola-workflow-gitea/agents',
];

function read(p) {
  try { return fs.readFileSync(path.join(root, p), 'utf8'); } catch { return null; }
}

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

const mdDir = path.join(root, 'agents');
const mdFiles = fs.readdirSync(mdDir).filter(f => f.endsWith('.md'));

for (const md of mdFiles) {
  const base = md.slice(0, -'.md'.length);
  // Only enforce profiles that have a .toml twin in ALL THREE trees.
  const tomlPaths = TOML_TREES.map(t => t + '/' + base + '.toml');
  const tomlContents = tomlPaths.map(read);
  if (tomlContents.some(c => c === null)) continue; // no full twin set → not a parity target
  const mdText = read('agents/' + md);
  if (mdText === null) continue;
  for (const token of FEATURE_TOKENS) {
    if (!mdText.includes(token)) continue; // token not used by this profile → nothing to mirror
    tomlPaths.forEach((tp, idx) => {
      assert(tomlContents[idx].includes(token),
        '#422.2: token "' + token + '" is in agents/' + md + ' but MISSING from ' + tp +
        ' (md↔toml feature drift — mirror the feature paragraph token into the .toml twin)');
    });
  }
}

if (failed > 0) {
  console.error('agent-profile parity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('agent-profile parity tests passed (' + passed + ' assertions)');
}
