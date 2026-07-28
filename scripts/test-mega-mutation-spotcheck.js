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

// --- #834 review-journal probes ---------------------------------------------------------------
//
// #834 DELETES fail-closed guards (the read-time producer-slice recomputation in both journal
// lanes, and the re-derived gate mode behind --verdict-check freshness). Per "a guard is evidence
// only once mutation-proven", a green suite is not evidence those deletions were safe: what has to
// be shown is that the guards which REMAIN — the graph-maximal writer proof, the producer-binding
// lineage chain, and the ledger chain hash — are genuinely armed and not merely present.
//
// Each probe below asserts the #834 acceptance itself, so it is RED on a pre-#834 checkout (the
// runner reports it as a broken BASELINE, which is the correct signal: the guard cannot be proven
// armed until the subtraction it survives has landed). Once #834 lands, baseline goes green and
// the mutation must turn it red again.

// Shared fixture kit: a 4-node spine (base -> writer -> review -> finalize) plus a schema-1 review
// journal builder, materialized against a tmp scripts COPY so the mutated module is what answers.
function journalKit(tmpScriptsDir) {
  const crypto = require('crypto');
  const node = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-node.js'));
  const validator = require(path.join(tmpScriptsDir, 'kaola-workflow-plan-validator.js'));
  const schema = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const NODE_ROWS = [
    '| base | implementer | — | scripts/base.js | 1 | sequence |',
    '| writer | tdd-guide | base | scripts/a.js | 1 | sequence |',
    '| review | code-reviewer | writer | — | 1 | sequence |',
    '| finalize | finalize | review | — | 1 | sequence |',
  ];
  const LEDGER = ['| base | complete | |', '| writer | complete | |',
    '| review | pending | |', '| finalize | pending | |'];
  const planBody = [
    '# Workflow Plan — mutation-spotcheck', '', '## Meta', 'plan_form: spine', 'labels: area:scripts', '',
    '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '| --- | --- | --- | --- | --- | --- |', ...NODE_ROWS, '', '## Design', '',
    'Decompose the frozen spine into its concrete role nodes; each sequence edge is a real data '
      + 'dependency (S1 — the downstream node consumes the upstream node\'s change). Done means the '
      + 'review gate clears and validation passes.', '',
    '## Node Ledger', '', '| id | status | notes |', '| --- | --- | --- |', ...LEDGER, '',
  ].join('\n') + '\n';
  const planHash = validator.computePlanHash(planBody);
  const plan = '<!-- plan_hash: ' + planHash + ' -->\n' + planBody;
  const gate = schema.canonicalLogicalGateIdentity({ kind: 'sequence', id: 'review',
    origin: ['writer'], members: ['review'] });
  const identity = seed => ({ baseline: seed.repeat(40).slice(0, 40), anchored_ref: seed.repeat(40).slice(0, 40),
    open_token: seed.repeat(40).slice(0, 40), generation: seed.repeat(12).slice(0, 12),
    ref: 'refs/kaola-workflow/barrier/spotcheck/' + seed });
  const attemptAt = (ordinal, bindings, writer) => {
    const nonce = 'spotcheckord' + ordinal;
    const generations = [{ member: 'review', nonce }];
    const digest = String(ordinal).repeat(64).slice(0, 64);
    const body = 'evidence-binding: review ' + nonce + '\nverdict: fail\nfindings_blocking: 1\n';
    return { attempt_id: 'review:' + ordinal, ordinal, plan_hash: planHash, logical_gate: gate,
      candidate_digest: digest, candidate_declared: {}, candidate_residue_digest: 'd'.repeat(64),
      rebind: [], generations,
      transaction_key: crypto.createHash('sha256').update(JSON.stringify({ plan_hash: planHash,
        logical_gate_key: gate.key, candidate_digest: digest, generations })).digest('hex'),
      settlement_command: 'close-node', outcome: 'fail', reason: 'verdict_not_pass',
      receipts: [{ node_id: 'review', generation: nonce, body,
        receipt_sha256: crypto.createHash('sha256').update(body).digest('hex'),
        effective_pass: false, verdict: 'fail', findings_blocking: 1 }],
      findings: [], route_candidates: [], lifecycle_settled: true,
      producer_bindings: bindings, repair: { selected_writer: writer, settled: true }, consumed_by: writer };
  };
  const readSchema1 = attempts => {
    const files = { '/mut/workflow-plan.md': plan,
      '/mut/.cache/review-attempts.json': JSON.stringify({ schema_version: 1, plan_hash: planHash, attempts }) };
    const state = node.readReviewJournal({ planPath: '/mut/workflow-plan.md',
      readFile: p => { if (!(p in files)) throw new Error('ENOENT'); return files[p]; },
      cacheExists: p => p in files }, plan);
    return { ok: state.ok === true, reason: state.reason || null };
  };
  const readSchema2 = (bindings, writer) => {
    const nodes = validator.parseNodes(plan);
    const g = node.reviewLogicalGate(nodes, nodes.find(n => n.id === 'review'));
    const finding = { uid: 'F-1', scope: 'in_scope', action: 'fix', status: 'open',
      severity: 'high', primary_anchor: { path: 'scripts/a.js' } };
    const journal = { schema_version: 2, attempts: [{
      attempt_id: 'review:1', ordinal: 1, gate_mode: 'change_gate',
      logical_gate: { key: g.key, kind: g.kind, members: g.members, claim_digest: g.claim_digest,
        surface_digests: g.surface_digests, aggregation: g.aggregation,
        certified_producers: g.certified_producers },
      outcome: 'fail', lifecycle_settled: true, consumed_by: writer,
      repair: { selected_writer: writer, settled: true }, producer_bindings: bindings,
      receipts: [{ node_id: 'review', findings: [finding] }],
      route_candidates: node.schema2RouteCandidates([finding], nodes, 'review'),
    }] };
    const out = node.reviewJournalV2MatchesPlan(journal, plan);
    return { ok: out.ok === true, reason: out.reason || null };
  };
  return { identity, attemptAt, readSchema1, readSchema2 };
}

// The graph-maximal writer proof is what remains once the recorded key set is trusted: a recorded
// `selected_writer` still has to BE the unique maximal producer of its gate. #834 requires BOTH
// lanes to enforce it (schema-2 has no such proof today, which is why this baseline is red until
// the subtraction lands).
function probeWriterMaximality(tmpScriptsDir) {
  const kit = journalKit(tmpScriptsDir);
  const bindings = { base: kit.identity('b'), writer: kit.identity('w') };
  const s1 = kit.readSchema1([kit.attemptAt(1, bindings, 'base')]);
  const s2 = kit.readSchema2(bindings, 'base');
  const ok = s1.ok === false && s1.reason === 'review_journal_repair_identity_mismatch'
    && s2.ok === false && s2.reason === 'review_journal_repair_identity_mismatch';
  return { ok, detail: 'non-maximal recorded writer -> schema-1 ' + JSON.stringify(s1)
    + ', schema-2 ' + JSON.stringify(s2)
    + (ok ? '' : ' [EXPECTED on a pre-#834 checkout: the schema-2 lane carries no writer proof yet, '
      + 'so the guard cannot be mutation-proven until the lanes converge — this is the acceptance, '
      + 'not a broken probe]') };
}

// The producer-binding LINEAGE chain is the producer-identity tamper boundary once the derivation
// is gone: attempt N+1's raw binding must equal attempt N's effective (post-rebind) binding, so a
// freshly re-snapshotted baseline cannot be laundered in.
function probeBindingLineage(tmpScriptsDir) {
  const kit = journalKit(tmpScriptsDir);
  const honest = { base: kit.identity('b'), writer: kit.identity('w') };
  const forged = { base: kit.identity('b'), writer: kit.identity('z') };
  const broken = kit.readSchema1([kit.attemptAt(1, honest, 'writer'), kit.attemptAt(2, forged, 'writer')]);
  const intact = kit.readSchema1([kit.attemptAt(1, honest, 'writer'), kit.attemptAt(2, honest, 'writer')]);
  const ok = broken.ok === false && broken.reason === 'review_journal_repair_identity_mismatch'
    && intact.ok === true;
  return { ok, detail: 'forged continuation -> ' + JSON.stringify(broken)
    + '; intact chain -> ' + JSON.stringify(intact) };
}

// The ledger chain hash is the tamper detection #834 leans on when it stops re-deriving the
// producer slice from the ledger. It must catch a doctored entry by RECOMPUTED DIGEST, not by any
// semantic re-reading of what the entry says.
function probeLedgerChainDigest(tmpScriptsDir) {
  const schema = require(path.join(tmpScriptsDir, 'kaola-workflow-adaptive-schema.js'));
  const lineage = 'a'.repeat(64);
  const built = schema.extendLedgerChain({
    oldHead: null, oldJournal: null, epochLineageId: lineage, planHash: 'b'.repeat(64),
    subcommand: 'open-next', oldLedgerDigest: 'c'.repeat(64), newLedgerDigest: 'd'.repeat(64),
    deltas: [{ id: 'writer', from: 'pending', to: 'in_progress' }],
    oldExpansionDigest: 'e'.repeat(64), newExpansionDigest: 'e'.repeat(64),
  });
  if (!built.ok) return { ok: false, detail: 'fixture chain did not build: ' + JSON.stringify(built) };
  const verifyArgs = entries => ({ head: built.head,
    journal: { schema_version: schema.LEDGER_CHAIN_SCHEMA_VERSION, epoch_lineage_id: lineage, entries },
    epochLineageId: lineage, currentLedgerDigest: 'd'.repeat(64) });
  const clean = schema.verifyLedgerChain(verifyArgs(built.entries));
  // Doctor the recorded transition WITHOUT re-stamping its entry_digest: only the hash can see it.
  const doctored = JSON.parse(JSON.stringify(built.entries));
  doctored[doctored.length - 1].deltas = [{ id: 'writer', from: 'pending', to: 'complete' }];
  const tampered = schema.verifyLedgerChain(verifyArgs(doctored));
  const ok = clean.ok === true && tampered.ok === false
    && tampered.reason === 'ledger_chain_entry_digest_mismatch';
  return { ok, detail: 'clean chain -> ' + JSON.stringify(clean)
    + '; doctored entry -> ' + JSON.stringify(tampered) };
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
  {
    name: 'review-journal-writer-maximality-bypass',
    keeper: 'scripts/test-adaptive-node.js TRUST-THE-RECORD matrix (PROVE writer rows, both lanes)',
    provenance: 'the guard that must SURVIVE the derive-and-refuse subtraction: with the recorded '
      + 'producer key set trusted, the recorded selected_writer is still proven graph-maximal '
      + 'against the frozen graph + ledger. Dropping it would let an edited journal name any bound '
      + 'node as the repair writer and receive a fresh baseline for it.',
    file: 'kaola-workflow-adaptive-node.js',
    find: "  const ok = history_valid && producer_slice.includes(selectedWriter)\n    && producer_slice.every(id => id === selectedWriter || selectedAncestors.has(id) || replay.has(id));",
    replace: "  const ok = history_valid;",
    probe: probeWriterMaximality,
  },
  {
    name: 'review-journal-binding-lineage-continuity-bypass',
    keeper: 'scripts/test-adaptive-node.js TRUST-THE-RECORD LINEAGE (must stay refused) + control',
    provenance: 'the producer-identity tamper boundary that REPLACES the deleted key-set '
      + 'recomputation: a re-snapshotted baseline appears in no rebind record, so only the '
      + 'attempt-to-attempt binding chain refuses it.',
    file: 'kaola-workflow-adaptive-node.js',
    find: "        if (!carried || identityKey(lineage[i].producer_bindings[writer]) !== identityKey(carried)) {",
    replace: "        if (false && (!carried || identityKey(lineage[i].producer_bindings[writer]) !== identityKey(carried))) {",
    probe: probeBindingLineage,
  },
  {
    name: 'ledger-chain-entry-digest-bypass',
    keeper: 'scripts/test-mega-mutation-spotcheck.js probeLedgerChainDigest (direct verifyLedgerChain)',
    provenance: 'the chain hash #834 leans on once journal reads stop re-deriving the producer '
      + 'slice from the ledger — tamper detection has to be the recomputed entry digest, never a '
      + 'semantic second opinion about what the ledger says.',
    file: 'kaola-workflow-adaptive-schema.js',
    find: "    if (sha256Canonical(copy) !== entry.entry_digest) {",
    replace: "    if (false && sha256Canonical(copy) !== entry.entry_digest) {",
    probe: probeLedgerChainDigest,
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
