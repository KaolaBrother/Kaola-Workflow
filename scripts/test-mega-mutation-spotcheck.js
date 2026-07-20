#!/usr/bin/env node
'use strict';

// Mutation spot-check for the #725 Phase E test-suite prune (n2-overlap-prune / n4-bundle-claim-
// consolidate). Reintroduces a handful of CONCRETE, documented historical bug shapes into
// ISOLATED $TMPDIR copies of the pruned suite's source, then runs the KEPT pruned-suite assertion
// (lifted verbatim from its real line range, or the real test file itself) against each mutated
// copy and proves it still goes RED. This is the mutation-catch matrix that shows the n2/n4 prune
// did not silently drop coverage — the invariant the n1 dedup map and the n3/n5 adversarial
// falsification runs certified is genuinely still enforced, not merely documented as enforced.
//
// Design:
//   - Every source file touched is copied whole into a fresh $TMPDIR dir (fs.cpSync) so relative
//     `require('./...')` calls resolve to the mutated copy, never the real working tree.
//   - Each case runs its probe TWICE: once against a CLEAN (unmutated) copy — this must pass, or
//     the probe itself is broken and the case is reported as a harness bug, not a caught mutation
//     — and once against the MUTATED copy, which must fail. Baseline-green + mutated-red is what
//     makes a caught mutation meaningful rather than a probe that is vacuously always red.
//   - Mutations are applied via an exact, uniqueness-checked substring replace so a future source
//     drift fails loudly (mutation anchor not found / not unique) instead of silently mutating
//     nothing and reporting a false catch.
//   - No network. Every $TMPDIR copy is removed in a finally block, including on failure.
//
// NOT wired into package.json / the default claude chain (that would undo the Phase B receipt
// diet) — invoked on demand via the recorded validation_command.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const SCRIPTS_DIR = path.join(repoRoot, 'scripts');

let passedMutations = 0;
let failedMutations = 0;
const results = [];

function mkTmpScriptsCopy(label) {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-mutspot-' + label + '-'));
  try {
    fs.cpSync(SCRIPTS_DIR, path.join(tmpRoot, 'scripts'), { recursive: true });
  } catch (err) {
    // mkdtempSync already created tmpRoot — a mid-copy failure must not leak it, since the
    // caller's cleanup only starts tracking the dir once this function RETURNS successfully.
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    throw err;
  }
  return tmpRoot;
}

// Exact, uniqueness-checked textual mutation on the tmp COPY only — never the working tree.
function applyMutation(tmpRoot, relFile, find, replace) {
  const target = path.join(tmpRoot, 'scripts', relFile);
  const src = fs.readFileSync(target, 'utf8');
  const idx = src.indexOf(find);
  if (idx === -1) {
    throw new Error('mutation anchor not found in ' + relFile + ' (source drifted): ' + JSON.stringify(find));
  }
  if (src.indexOf(find, idx + 1) !== -1) {
    throw new Error('mutation anchor is not unique in ' + relFile + ': ' + JSON.stringify(find));
  }
  fs.writeFileSync(target, src.slice(0, idx) + replace + src.slice(idx + find.length));
}

function loadFixture(tmpScriptsDir) {
  return JSON.parse(fs.readFileSync(path.join(tmpScriptsDir, 'reviewer-conformance-fixtures.json'), 'utf8'));
}

// --- probes: each takes an absolute tmpScriptsDir and returns { ok, detail } ------------------

function probeDelegationVocab(tmpScriptsDir) {
  const { checkEvidenceShape } = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-node.js'));
  // Lifted verbatim from scripts/test-adaptive-node.js T611-AC5 (~:14962-14964): an unknown
  // delegation_outcome token is a typed refusal, independent of role, checked before role branches.
  const bad = checkEvidenceShape('tdd-guide', 'n1', 'delegation_outcome: exploded\nRED\nGREEN');
  const ok = bad.ok === false && bad.missingTokenClass === 'delegation_outcome';
  return { ok, detail: 'unknown delegation_outcome -> ' + JSON.stringify({ ok: bad.ok, missingTokenClass: bad.missingTokenClass }) };
}

function probeDeriveGateMode(tmpScriptsDir) {
  const schema = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const fixture = loadFixture(tmpScriptsDir);
  // Lifted verbatim from scripts/test-adaptive-node.js review-v2 corpus (~:17837-17841).
  const mismatches = [];
  for (const row of fixture.gate_modes) {
    const node = row.plan.nodes.find(n => n.id === row.node_id);
    const got = schema.deriveGateMode(row.plan, node);
    if (got !== row.expected) mismatches.push(row.name + ': expected ' + row.expected + ', got ' + got);
  }
  return { ok: mismatches.length === 0,
    detail: mismatches.length === 0
      ? fixture.gate_modes.length + '/' + fixture.gate_modes.length + ' gate_modes rows match'
      : mismatches.join('; ') };
}

function probeDeriveGateEffect(tmpScriptsDir) {
  const schema = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const fixture = loadFixture(tmpScriptsDir);
  // Lifted verbatim from scripts/test-adaptive-node.js review-v2 corpus (~:17857-17862).
  const mismatches = [];
  for (const row of fixture.outcomes) {
    const got = schema.deriveGateEffect(row.role, row.gate_mode, row.domain_outcome, row.blocking_findings || 0);
    if (got !== row.expected_gate_effect) {
      mismatches.push(row.role + '/' + row.gate_mode + '/' + row.domain_outcome + ': expected ' + row.expected_gate_effect + ', got ' + got);
    }
  }
  return { ok: mismatches.length === 0,
    detail: mismatches.length === 0
      ? fixture.outcomes.length + '/' + fixture.outcomes.length + ' outcomes rows match'
      : mismatches.join('; ') };
}

function probeReduceReviewReceipts(tmpScriptsDir) {
  const schema = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const fixture = loadFixture(tmpScriptsDir);
  // Lifted verbatim from scripts/test-adaptive-node.js review-v2 corpus (~:18059-18064).
  const mismatches = [];
  for (const row of fixture.reducers) {
    const got = schema.reduceReviewReceipts(row.input);
    if (got.complete !== row.expected.complete || got.gate_effect !== row.expected.gate_effect
      || got.domain_outcome !== row.expected.domain_outcome) {
      mismatches.push(row.name + ': expected ' + JSON.stringify(row.expected) + ', got '
        + JSON.stringify({ complete: got.complete, gate_effect: got.gate_effect, domain_outcome: got.domain_outcome }));
    }
  }
  return { ok: mismatches.length === 0,
    detail: mismatches.length === 0
      ? fixture.reducers.length + '/' + fixture.reducers.length + ' reducers rows match'
      : mismatches.join('; ') };
}

function probeBundleClaim(tmpScriptsDir) {
  // Runs the REAL pruned suite file as a subprocess so its own __dirname-derived claimScript
  // path picks up the mutated kaola-workflow-claim.js sitting next to it in the same tmp copy.
  const testFile = path.join(tmpScriptsDir, 'test-bundle-claim.js');
  const result = spawnSync(process.execPath, [testFile], { encoding: 'utf8', timeout: 120000 });
  const combined = String(result.stdout || '') + String(result.stderr || '');
  const summary = combined.match(/test-bundle-claim: .+/);
  return { ok: result.status === 0,
    detail: 'exit=' + result.status + (summary ? ', ' + summary[0] : ', no summary line (crash/timeout?)') };
}

// --- the mutation cases --------------------------------------------------------------------

const CASES = [
  {
    name: 'delegation-outcome-vocab-bypass',
    keeper: 'scripts/test-adaptive-node.js T611-AC5 (~:14962-14964)',
    provenance: 'closed-vocab typed delegation_outcome refusal, issue #611 (join-protocol AC5)',
    file: 'kaola-workflow-adaptive-node.js',
    find: "if (dm && !DELEGATION_OUTCOME_VOCABULARY.includes(dm[1].toLowerCase())) {",
    replace: "if (false && dm && !DELEGATION_OUTCOME_VOCABULARY.includes(dm[1].toLowerCase())) {",
    probe: probeDelegationVocab,
  },
  {
    name: 'derive-gate-mode-inverted',
    keeper: 'scripts/test-adaptive-node.js review-v2 gate_modes corpus (~:17837-17841)',
    provenance: 'schema-2 candidate-bound review engine gate classifier, issues #693/#696/#697/#698',
    file: 'kaola-workflow-adaptive-schema.js',
    find: "  return producers.some(id => id !== nodeId && byId.has(id) && reaches(id, nodeId))\n    ? 'change_gate' : 'investigation';",
    replace: "  return producers.some(id => id !== nodeId && byId.has(id) && reaches(id, nodeId))\n    ? 'investigation' : 'change_gate';",
    probe: probeDeriveGateMode,
  },
  {
    name: 'derive-gate-effect-inverted',
    keeper: 'scripts/test-adaptive-node.js review-v2 outcomes corpus (~:17857-17862)',
    provenance: 'schema-2 candidate-bound review engine three-axis gate effect, issues #693/#696/#697/#698',
    file: 'kaola-workflow-adaptive-schema.js',
    find: "return outcome === 'not_refuted' ? 'pass' : 'fail';",
    replace: "return outcome === 'not_refuted' ? 'fail' : 'pass';",
    probe: probeDeriveGateEffect,
  },
  {
    name: 'reduce-review-receipts-partitioned-refuted-swallowed',
    keeper: 'scripts/test-adaptive-node.js review-v2 reducers corpus (~:18059-18064)',
    provenance: 'schema-2 candidate-bound review engine receipt reducer, issues #693/#696/#697/#698 (a gate-verdict-finding-line-class defect: a refuted partitioned_all member silently swallowed into not_refuted)',
    file: 'kaola-workflow-adaptive-schema.js',
    find: "domainOutcome = ordered.some(r => r.domain_outcome === 'refuted') ? 'refuted'",
    replace: "domainOutcome = ordered.some(r => r.domain_outcome === 'refuted') ? 'not_refuted'",
    probe: probeReduceReviewReceipts,
  },
  {
    name: 'bundle-issue-numbers-order-corrupted',
    keeper: 'scripts/test-bundle-claim.js bundle startup state-file assertions (~:269-273)',
    provenance: 'bundle-claim multi-target entrypoint state write, issue #328',
    file: 'kaola-workflow-claim.js',
    find: "lines.push('issue_numbers: ' + data.issue_numbers.join(','));",
    replace: "lines.push('issue_numbers: ' + data.issue_numbers.slice().reverse().join(','));",
    probe: probeBundleClaim,
  },
];

// --- runner ----------------------------------------------------------------------------------

function runMutationCase(c) {
  let cleanRoot;
  let mutRoot;
  try {
    cleanRoot = mkTmpScriptsCopy(c.name + '-clean');
    let cleanResult;
    try {
      cleanResult = c.probe(path.join(cleanRoot, 'scripts'));
    } catch (err) {
      failedMutations++;
      results.push({ name: c.name, ok: false, detail: 'BASELINE probe threw: ' + err.message });
      return;
    }
    if (!cleanResult.ok) {
      failedMutations++;
      results.push({ name: c.name, ok: false,
        detail: 'BASELINE (unmutated) probe did not pass — the probe itself is broken, not the mutation: ' + cleanResult.detail });
      return;
    }

    mutRoot = mkTmpScriptsCopy(c.name + '-mut');
    applyMutation(mutRoot, c.file, c.find, c.replace);
    let mutResult;
    try {
      mutResult = c.probe(path.join(mutRoot, 'scripts'));
    } catch (err) {
      // A thrown exception from the mutated copy is a legitimate RED signal (the suite crashing
      // on the mutation is still "the mutation was caught"), not an escape.
      passedMutations++;
      results.push({ name: c.name, ok: true,
        detail: 'baseline GREEN (' + cleanResult.detail + '); mutated copy threw: ' + err.message,
        keeper: c.keeper, provenance: c.provenance });
      return;
    }
    if (mutResult.ok) {
      failedMutations++;
      results.push({ name: c.name, ok: false,
        detail: 'MUTATION ESCAPED — the pruned suite did NOT go red: ' + mutResult.detail });
      return;
    }
    passedMutations++;
    results.push({ name: c.name, ok: true,
      detail: 'baseline GREEN (' + cleanResult.detail + '); mutated RED (' + mutResult.detail + ')',
      keeper: c.keeper, provenance: c.provenance });
  } finally {
    for (const r of [cleanRoot, mutRoot]) {
      if (r) fs.rmSync(r, { recursive: true, force: true });
    }
  }
}

console.log('test-mega-mutation-spotcheck: reintroducing ' + CASES.length + ' documented bug shapes into isolated $TMPDIR copies...');
console.log('');
for (const c of CASES) {
  runMutationCase(c);
}

for (const r of results) {
  console.log((r.ok ? 'CAUGHT ' : 'ESCAPED') + '  ' + r.name);
  console.log('    ' + r.detail);
  if (r.ok) {
    console.log('    kept by: ' + r.keeper);
    console.log('    provenance: ' + r.provenance);
  }
}

console.log('');
if (failedMutations > 0) {
  console.error('test-mega-mutation-spotcheck: ' + failedMutations + '/' + CASES.length + ' mutation(s) ESCAPED the pruned suite');
  process.exit(1);
} else {
  console.log('test-mega-mutation-spotcheck: all ' + passedMutations + '/' + CASES.length + ' mutations caught by the pruned suite');
  process.exit(0);
}
