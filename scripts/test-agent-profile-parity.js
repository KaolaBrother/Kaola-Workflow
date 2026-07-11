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
  'simulate-kaola-workflow-walkthrough.js',
  // #463 Slice 6 (AC11 note): the synthesizer's non-lowerable reasoning floor — present in
  // agents/synthesizer.md, so this enforces its three .toml twins carry it (md↔toml parity coverage
  // for the new write-overlap convergence role).
  'REASONING_FLOOR_ROLES',
  // #495 (n3-result-routing-prose): indeterminate classifier verdict token — present in
  // agents/workflow-planner.md escalate-routing paragraph, enforces all three .toml twins carry it.
  'target_set_indeterminate',
  // #513 (n1-impl-513-planner-heuristic): speculative-open-eligible shaping rubric — distinctive
  // substring of the authoring paragraph (shape a node whose sole unsatisfied predecessor is a
  // high-probability-pass gate — now read OR write, #596/#597). Present in
  // agents/workflow-planner.md, so this enforces all three .toml twins carry the rubric (md↔toml
  // parity for the #439 authoring lever).
  'unsatisfied predecessor is a high-probability-pass gate',
  // #596/#597 (n3-rubric): write-speculation eligibility — a leg-contained write node whose declared
  // set is exactly resolvable, PROTECTED-free, and not the sink can now speculate too; on a gate
  // fail its leg/evidence are torn down unconditionally (the keep-or-discard asymmetry vs. reads).
  // Present in agents/workflow-planner.md, so this enforces all three .toml twins carry the
  // write-eligibility discipline (md↔toml parity for the #596-class authoring lever).
  'DISCARD-ONLY',
  // #547 (D-547-01): the planner's "record the validation command once" authoring lever — present in
  // agents/workflow-planner.md, so this enforces all three .toml twins carry the validation_command /
  // validation_test_consumes ## Meta guidance (md↔toml parity for the Stage-2 record-once discipline).
  'validation_command',
  // #559 (D-542-01 prose freshness): the co-open-default-on kill-switch token — present in the D-419-01
  // scheduler-default-posture paragraph of agents/workflow-planner.md, so this enforces all three .toml
  // twins carry the #542 "disjoint-write antichains co-open BY DEFAULT; serial only on KAOLA_PARALLEL_WRITES=0"
  // framing (md↔toml parity that locks the stale "co-schedule under lane containment" wording from returning).
  'KAOLA_PARALLEL_WRITES',
  // #607 (n3-planner-prose): gate instrumentation is provisioned upstream, never authored by the
  // gate itself — present in agents/workflow-planner.md's main-session-gate authoring paragraph, so
  // this enforces all three .toml twins carry the rule (md↔toml parity for the #607 authoring lever).
  'the gate never authors or deletes files',
  // #634 (n3-register): the metric-optimizer's mandatory scoped-revert safety rule — present in
  // agents/metric-optimizer.md's ratchet-protocol reject step, so this enforces its three .toml
  // twins carry it (md↔toml parity coverage for the new bounded metric-ratchet role).
  'git reset --hard',
  'wait_budget_minutes',
  'planner_override',
  'difficulty alone is not evidence',
  'never inflate a budget to hide a wedged agent',
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

for (const file of ['agents/workflow-planner.md', ...TOML_TREES.map(t => t + '/workflow-planner.toml')]) {
  const content = read(file) || '';
  for (const token of ['wait_budget_minutes', 'planner_override', 'through 720 minutes',
    'nondelegable', 'optimizer conflict', 'difficulty alone is not evidence',
    'never inflate a budget to hide a wedged agent']) {
    assert(content.includes(token), `${file} must carry planner wait-budget contract token ${JSON.stringify(token)}`);
  }
}

if (failed > 0) {
  console.error('agent-profile parity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('agent-profile parity tests passed (' + passed + ' assertions)');
}
