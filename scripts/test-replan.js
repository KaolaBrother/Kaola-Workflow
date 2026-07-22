#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const schema = require('./kaola-workflow-adaptive-schema');
const replan = require('./kaola-workflow-replan');
const validator = require('./kaola-workflow-plan-validator');
const adaptiveNode = require('./kaola-workflow-adaptive-node');
const validationRunner = require('./kaola-workflow-validation-runner');
const { generateMirror } = require('./kaola-workflow-task-mirror');
const liveFixture = require('./replan-conformance-fixtures.json');
const SOURCE_ATTEMPT_ID = liveFixture.source.attempt_id;

const gitEnv = Object.assign({}, process.env, {
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
});
const git = (root, args, opts = {}) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'], ...opts,
}).trim();
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let passed = 0;
function ok(value, message) { assert.ok(value, message); passed++; }
function equal(actual, expected, message) { assert.strictEqual(actual, expected, message); passed++; }
function deepEqual(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); passed++; }
function notEqualReason(result, reason, message) {
  assert.notStrictEqual(result && result.reason, reason, message + ': ' + JSON.stringify(result));
  passed++;
}
function rejects(fn, reason, message) {
  let got = null;
  try { fn(); } catch (error) { got = error && error.message; }
  equal(got, reason, message);
}

function frozenPlan(project, meta, nodes, ledger) {
  const schema2 = Number(meta && meta.plan_schema_version) === 2;
  const rows = nodes.map(n => schema2
    ? `| ${n.id} | ${n.role} | ${n.depends_on || '—'} | ${n.write_set || '—'} | 1 | ${n.shape || 'sequence'} | ${n.model || 'standard'} | ${n.gate_claim || '—'} | ${n.gate_surface || '—'} | ${n.gate_aggregation || '—'} | ${n.certifies || '—'} |`
    : `| ${n.id} | ${n.role} | ${n.depends_on || '—'} | ${n.write_set || '—'} | 1 | ${n.shape || 'sequence'} | ${n.model || 'standard'} |`).join('\n');
  const ledgerRows = nodes.map(n => `| ${n.id} | ${ledger[n.id] || 'pending'} |`).join('\n');
  const complianceRows = nodes.map(n => {
    const status = ledger[n.id] || 'pending';
    if (status === 'complete') return `| ${n.role} (${n.id}) | invoked | .cache/${n.id}.md | |`;
    if (status === 'n/a') return `| ${n.role} (${n.id}) | n/a | | topology skip |`;
    return `| ${n.role} (${n.id}) | pending | | |`;
  }).join('\n');
  let text = [
    `# Workflow Plan — ${project}`, '', '## Meta', `project: ${project}`,
    'labels: enhancement', 'speculative_open_policy: auto', 'validation_command: node scripts/test-replan.js',
    // Schema-2 code-producing plans require a validation policy (bundle #693/#696/#697/#698): the command
    // above plus a timeout. Emitted for schema-2 only so legacy v1 fixtures stay byte-stable.
    ...(schema2 ? ['validation_timeout_minutes: 30'] : []),
    ...Object.entries(meta || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`),
    '', '## Nodes', '',
    schema2
      ? '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |'
      : '| id | role | depends_on | declared_write_set | cardinality | shape | model |',
    schema2
      ? '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
      : '| --- | --- | --- | --- | --- | --- | --- |', rows,
    '', '## Node Ledger', '', '| id | status |', '| --- | --- |', ledgerRows,
    '', '## Required Agent Compliance', '',
    '| Requirement | Status | Evidence | Skip Reason |',
    '| --- | --- | --- | --- |', complianceRows, '',
  ].join('\n');
  const hash = validator.computePlanHash(text);
  text = text.replace(/^# Workflow Plan[^\n]*\n/, match => match + `\n<!-- plan_hash: ${hash} -->\n`);
  return { text, hash };
}

function rehashPlan(text) {
  const unhashed = String(text).replace(/^<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->\r?\n?/im, '');
  const hash = validator.computePlanHash(unhashed);
  return {
    text: unhashed.replace(/^# Workflow Plan[^\n]*\n/, match => match + `\n<!-- plan_hash: ${hash} -->\n`),
    hash,
  };
}

function stateText(project, branch, root, planHash, extra = {}) {
  const base = [
    '# Kaola-Workflow State', '', '## Project', `name: ${project}`, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'step: start', `next_command: /kaola-workflow-plan-run ${project}`, `next_skill: kaola-workflow-plan-run ${project}`,
    '', '## Planning Evidence', `plan_hash: ${planHash}`, 'decision: auto-run',
    'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
    'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink', `branch: ${branch}`,
    'issue_number: 699', 'sink: merge', `main_root: ${root}`, 'session_marker: test-session',
    'claim_ts: 2026-07-16T00:00:00.000Z', `worktree_path: ${root}`,
  ];
  for (const [key, value] of Object.entries(extra)) base.push(`${key}: ${value}`);
  return base.join('\n') + '\n';
}

function writeSchema2RepairSource(fx, journal, attempt, config = {}) {
  const state = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
  const lineage = config.lineage || state;
  const journalBytes = fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'));
  const payload = {
    schema_version: 2,
    kind: 'repair_outcome',
    result: 'repair_requires_replan',
    attempt_id: attempt.attempt_id,
    reason: config.reason || 'dependent_producer_replay_required',
    producer_slice: (config.producerSlice || ['impl']).slice().sort(),
    parent_plan_hash: validator.readStoredHash(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8')),
    epoch_lineage_id: lineage.epoch_lineage_id,
    claim_identity_digest: lineage.claim_identity_digest,
    claim_root_base_digest: lineage.claim_root_base_digest,
    review_journal_digest: sha256(journalBytes),
    review_attempt_digest: sha256(Buffer.from(schema.canonicalJson(attempt), 'utf8')),
    effective_candidate_digest: schema.effectiveCandidate(attempt).digest,
  };
  const envelope = {
    ...payload,
    outcome_digest: schema.sha256Canonical(payload),
    persisted_at: config.persistedAt || '2026-07-16T00:30:00.000Z',
  };
  fs.writeFileSync(path.join(fx.cacheDir, 'replan-source.json'), schema.canonicalJson(envelope) + '\n');
  return envelope;
}

function initFixture(options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-replan-')));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.name', 'Test']);
  git(root, ['config', 'user.email', 't@example.com']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(root, ['add', 'product.js', 'README.md']);
  git(root, ['commit', '-m', 'root']);
  git(root, ['checkout', '-b', 'workflow/issue-699']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']);
  const project = 'issue-699';
  const sourceAttemptId = options.sourceAttemptId || SOURCE_ATTEMPT_ID;
  const projectDir = path.join(root, 'kaola-workflow', project);
  const cacheDir = path.join(projectDir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const parent = frozenPlan(project, {}, [
    { id: 'impl', role: 'tdd-guide', write_set: 'product.js' },
    { id: 'review', role: 'code-reviewer', depends_on: 'impl', model: 'reasoning' },
    { id: 'finalize', role: 'finalize', depends_on: 'review', model: '—' },
  ], { impl: 'complete', review: 'complete', finalize: 'pending' });
  const identity = schema.buildClaimIdentity({
    schema_version: 2, repository_id: 'local:' + root, issue_numbers: [699], primary_issue: 699,
    bundle_id: null, closure_policy: 'all_or_nothing', branch: 'workflow/issue-699', worktree_path: root,
    claim_ts: '2026-07-16T00:00:00.000Z', session_marker: 'test-session',
  });
  const rootBase = schema.buildClaimRootBase({
    schema_version: 2, object_format: commit.length === 64 ? 'sha256' : 'sha1',
    commit, tree, branch: 'workflow/issue-699',
  });
  const lineage = schema.buildEpochLineage(identity, rootBase);
  const legacyState = stateText(project, 'workflow/issue-699', root, parent.hash);
  const activeState = options.legacyState === true ? legacyState : schema.writeEpochStateBlock(legacyState, {
    epoch_schema_version: 2,
    claim_repository_id: identity.repository_id,
    claim_identity_digest: lineage.claim_identity_digest,
    claim_root_object_format: rootBase.object_format,
    claim_root_base_commit: rootBase.commit,
    claim_root_base_tree: rootBase.tree,
    claim_root_base_digest: lineage.claim_root_base_digest,
    epoch_lineage_id: lineage.epoch_lineage_id,
    plan_epoch: 1,
    active_plan_hash: parent.hash,
    inherited_frontier_digest: 'none',
    inherited_frontier_classes: 'none',
    automatic_review_replans: 0,
    authorized_epoch_ceiling: 2,
    case_b_exemption_consumed: false,
    replan_status: 'none',
    replan_transaction_id: 'none',
    replan_phase: 'none',
    active_snapshot_manifest_digest: 'none',
  });
  fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), parent.text);
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), activeState);
  fs.writeFileSync(path.join(projectDir, 'workflow-tasks.json'), JSON.stringify(
    generateMirror({ planContent: parent.text, now: '2026-07-16T00:00:00.000Z' }), null, 2) + '\n');
  fs.writeFileSync(path.join(cacheDir, 'barrier-open-impl'), commit + '\n');
  fs.writeFileSync(path.join(cacheDir, 'barrier-base-impl'), commit + '\n');
  fs.writeFileSync(path.join(cacheDir, 'impl.md'), 'evidence-binding: impl abc123\nGREEN: fixture\n');
  const generation = liveFixture.source.generation_nonce;
  const findingLines = liveFixture.source.findings.map(finding =>
    `finding: id=${finding.id} scope=${finding.scope} action=${finding.action} status=${finding.status} severity=${finding.severity} file=product.js fix_role=tdd-guide`);
  const reviewBody = [`evidence-binding: review ${generation}`, 'verdict: fail',
    `findings_blocking: ${findingLines.length}`, ...findingLines, ''].join('\n');
  fs.writeFileSync(path.join(cacheDir, 'review.md'), reviewBody);
  const logicalGate = schema.canonicalLogicalGateIdentity({
    kind: 'sequence', id: 'review', origin: ['impl'], members: ['review'],
  });
  const generations = [{ member: 'review', nonce: generation }];
  fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 2;\n');
  const candidateDigest = replan.computeReviewCandidateDigest(root, project);
  const parsedFindings = schema.parseNodeFindings(reviewBody).map(finding => ({ source_node: 'review', ...finding }));
  const routeCandidates = parsedFindings.map(finding => ({
    source_node: 'review', finding_id: finding.id, id: finding.id, scope: finding.scope,
    action: finding.action, status: finding.status, severity: finding.severity, file: finding.file,
    ownership_candidates: ['impl'], owning_node: 'impl', fix_role: finding.fix_role, raw: finding.raw,
  }));
  const journal = {
    schema_version: 1,
    plan_hash: parent.hash,
    attempts: [{
      attempt_id: sourceAttemptId, ordinal: liveFixture.source.ordinal, plan_hash: parent.hash,
      logical_gate: logicalGate,
      candidate_digest: candidateDigest, candidate_declared: {},
      candidate_residue_digest: liveFixture.source.candidate_residue_digest,
      lifecycle_settled: true, outcome: 'fail', reason: 'verdict_not_pass',
      repair: { selected_writer: null, settled: null }, rebind: [], consumed_by: null,
      producer_bindings: { impl: { baseline: commit, anchored_ref: commit, open_token: commit, generation: commit.slice(0, 12), ref: 'refs/kaola-workflow/barrier/issue-699/impl' } },
      findings: parsedFindings, route_candidates: routeCandidates,
      receipts: [{ node_id: 'review', generation, body: reviewBody,
        receipt_sha256: sha256(Buffer.from(reviewBody)), effective_pass: false,
        verdict: 'fail', findings_blocking: findingLines.length }],
      generations, settlement_command: 'close-node',
      transaction_key: sha256(Buffer.from(JSON.stringify({ plan_hash: parent.hash,
        logical_gate_key: logicalGate.key, candidate_digest: candidateDigest, generations }))),
      ...(options.scopeLineageId ? { scope_lineage_id: options.scopeLineageId } : {}),
    }],
  };
  fs.writeFileSync(path.join(cacheDir, 'review-attempts.json'), JSON.stringify(journal, null, 2) + '\n');
  const fx = { root, project, projectDir, cacheDir, parent, legacyState, activeState, commit, tree,
    identity, rootBase, lineage, sourceAttemptId,
    sameGateChild: options.sameGateChild === true,
    changedOriginChild: options.changedOriginChild === true };
  if (options.seedSource !== false) writeSchema2RepairSource(fx, journal, journal.attempts[0]);
  return fx;
}

// #729 AC3-AC6: the carry-forward declaration every child epoch must publish — one
// `<uid>=<node_id>` pair per source finding that still needs a repair owner, or the
// literal `none` when the source carries no such finding. Built from the SAME source
// projection the planner packet publishes, so a fixture can never declare an owner for a
// uid the packet never showed.
function findingOwnersLine(tx, ownerId) {
  const rows = replan.buildFindingIndex(tx.source)
    .filter(row => row.status !== 'resolved' && row.status !== 'deferred'
      && (row.action == null || row.action === '' || row.action === 'fix'));
  return rows.length ? rows.map(row => row.uid + '=' + ownerId
    + (row.anchor_paths.length ? '' : '@anchorless')).join(',') : 'none';
}

// The epoch-binding `## Meta` block every child of `tx` must carry. Extracted so a
// coverage fixture can author a DIFFERENT node table under the SAME binding block and
// still reach the carry-forward wall instead of tripping the binding wall first.
function childMetaFor(tx, ids) {
  return {
    plan_schema_version: 2,
    contract_version: 2,
    epoch_schema_version: 2,
    epoch_lineage_id: tx.epoch_lineage_id,
    plan_epoch: tx.parent.plan_epoch + 1,
    parent_plan_hash: tx.parent.plan_hash,
    parent_snapshot_manifest_digest: tx.snapshot && tx.snapshot.authority_digest || 'pending',
    claim_root_base_digest: tx.cas.prepare.claim_root_base_digest,
    inherited_frontier_digest: tx.cas.prepare.inherited_frontier_digest,
    inherited_frontier_classes: tx.source.inherited_frontier_classes.length ? tx.source.inherited_frontier_classes : 'none',
    transition_reason: tx.transition_reason,
    source_evidence_digest: tx.source.source_evidence_digest,
    ...(tx.transition_reason === 'diagnosis_to_build' ? {
      diagnosis_source_digest: tx.source.source_evidence_digest,
      recommended_shape_digest: tx.budget.case_b_proof.payload.recommended_shape_digest,
    } : {}),
    planner_binding: tx.planner.dispatch_nonce,
    code_certifier: ids.reviewId,
    security_certifier: ids.securityId,
  };
}

function childFor(tx, project, sameGateChild, changedOriginChild) {
  const implId = sameGateChild ? (changedOriginChild ? 'impl2' : 'impl') : 'child-impl';
  const reviewId = sameGateChild ? 'review' : 'child-review';
  const securityId = sameGateChild ? 'security' : 'child-security';
  const finalizeId = sameGateChild ? 'finalize' : 'child-finalize';
  return frozenPlan(project, {
    ...childMetaFor(tx, { reviewId, securityId }),
    finding_owners: findingOwnersLine(tx, implId),
  }, [
    { id: implId, role: 'tdd-guide', write_set: 'product.js' },
    { id: reviewId, role: 'code-reviewer', depends_on: implId, model: 'reasoning',
      gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: securityId, role: 'security-reviewer', depends_on: reviewId, model: 'reasoning',
      gate_claim: 'current security candidate is approved', gate_surface: 'full security candidate', gate_aggregation: 'sequence' },
    { id: finalizeId, role: 'finalize', depends_on: securityId, model: '—' },
  ], {});
}

function writePlannerResult(fx, tx) {
  const child = childFor(tx, fx.project, fx.sameGateChild, fx.changedOriginChild);
  fs.writeFileSync(path.join(fx.projectDir, 'workflow-plan.next.md'), child.text);
  writePlannerAttestationForExistingChild(fx, tx);
  return child;
}

function writePlannerAttestationForExistingChild(fx, tx) {
  const childBytes = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.next.md'));
  const childDigest = sha256(childBytes);
  const packetBytes = fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'));
  fs.appendFileSync(path.join(fx.cacheDir, 'dispatch-log.jsonl'), JSON.stringify({
    ts: tx.planner.pending_at || new Date().toISOString(), agent_type: 'workflow-planner', cwd: fx.root,
    project: fx.project, transaction_id: tx.transaction_id, dispatch_nonce: tx.planner.dispatch_nonce,
  }) + '\n');
  const attestation = {
    schema_version: 1, transaction_id: tx.transaction_id, project: fx.project,
    worktree_path: fx.root, packet_digest: sha256(packetBytes), dispatch_nonce: tx.planner.dispatch_nonce,
    profile_identity: 'workflow-planner-replan-v1', child_path: 'workflow-plan.next.md', child_digest: childDigest,
  };
  attestation.attestation_digest = schema.sha256Canonical(attestation);
  fs.writeFileSync(path.join(fx.cacheDir, 'replan-planner-attestation.json'), schema.canonicalJson(attestation) + '\n');
  return attestation;
}

function advanceToAttestedChild(fx, opts = {}) {
  const common = Object.assign({ repoRoot: fx.root, project: fx.project }, opts);
  const prepared = replan.prepareReplan(Object.assign({}, common, {
    sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan',
  }));
  equal(prepared.result, 'prepared', 'failpoint fixture prepares a transaction');
  const pending = replan.resumeReplan(common);
  equal(pending.reason, 'replan_planner_dispatch_required', 'failpoint fixture reaches planner_pending');
  const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
  writePlannerResult(fx, tx);
  return tx;
}

function installTypedCaseBParent(fx, config = {}) {
  const proofDir = path.join(fx.cacheDir, 'case-b');
  fs.mkdirSync(proofDir, { recursive: true });
  const evidence = statement => ({ statement, digest: schema.sha256Canonical({ statement }) });
  const artifacts = {
    diagnosis_root_cause: {
      schema_version: 2, kind: 'diagnosis_root_cause', status: 'diagnosis_complete', terminal: true,
      root_cause: 'The diagnosed implementation shape is absent.', evidence: [evidence('root cause reproduced')],
    },
    falsified_alternatives: {
      schema_version: 2, kind: 'falsified_alternatives', status: 'diagnosis_complete', terminal: true,
      alternatives: [{ alternative: 'documentation-only repair', result: 'falsified',
        evidence: [evidence('runtime counterexample persists')] }],
    },
    acceptance_contract: {
      schema_version: 2, kind: 'acceptance_contract', status: 'diagnosis_complete', terminal: true,
      acceptance_criteria: ['The diagnosed build shape executes end to end.'],
    },
    recommendation: {
      schema_version: 2, kind: 'recommended_shape', status: 'diagnosis_complete', terminal: true,
      recommended_shape: 'sequence', rationale: 'The diagnosis establishes one dependent build boundary.',
    },
  };
  const rows = {};
  for (const [key, artifact] of Object.entries(artifacts)) {
    const rel = '.cache/case-b/' + key.replace(/_/g, '-') + '.json';
    const bytes = schema.canonicalJson(artifact) + '\n';
    fs.writeFileSync(path.join(fx.projectDir, ...rel.split('/')), bytes);
    rows[key] = { path: rel, digest: sha256(Buffer.from(bytes)), artifact };
  }
  const meta = {
    contract_version: 2,
    planned_transition: 'diagnosis_to_build',
    diagnosis_root_cause_digest: rows.diagnosis_root_cause.digest,
    falsified_alternatives_digest: rows.falsified_alternatives.digest,
    acceptance_contract_digest: rows.acceptance_contract.digest,
    recommendation_digest: rows.recommendation.digest,
  };
  const writeSet = Object.values(rows).map(row => 'kaola-workflow/' + fx.project + '/' + row.path);
  if (config.extraWrite) writeSet.push(config.extraWrite);
  const plan = frozenPlan(fx.project, meta, [
    { id: 'diagnose', role: config.role || 'code-explorer', write_set: writeSet.join(',') },
    { id: 'finalize', role: 'finalize', depends_on: 'diagnose', model: '—' },
  ], { diagnose: 'complete', finalize: 'pending' });
  fs.writeFileSync(path.join(fx.projectDir, 'workflow-plan.md'), plan.text);
  fs.writeFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), JSON.stringify(
    generateMirror({ planContent: plan.text, now: '2026-07-16T01:00:00.000Z' }), null, 2) + '\n');
  let state = fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8');
  state = state.replace(/^plan_hash:[ \t]*.*$/m, 'plan_hash: ' + plan.hash);
  state = state.replace(/^first_node_id:[ \t]*.*$/m, 'first_node_id: diagnose');
  state = state.replace(/^first_node_role:[ \t]*.*$/m, 'first_node_role: code-explorer');
  state = schema.writeEpochStateBlock(state, { active_plan_hash: plan.hash });
  fs.writeFileSync(path.join(fx.projectDir, 'workflow-state.md'), state);
  for (const name of ['review-attempts.json', 'replan-source.json', 'review.md']) {
    try { fs.unlinkSync(path.join(fx.cacheDir, name)); } catch (_) {}
  }
  return { plan, rows, artifacts, writeSet };
}

function authorityCardinalities(fx) {
  let dispatches = [];
  try { dispatches = fs.readFileSync(path.join(fx.cacheDir, 'dispatch-log.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean); }
  catch (_) {}
  let snapshots = [];
  try { snapshots = fs.readdirSync(path.join(fx.cacheDir, 'epochs')).filter(name => /^\d+$/.test(name)); }
  catch (_) {}
  const state = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
  return {
    dispatches: dispatches.length,
    snapshots: snapshots.length,
    epoch: Number(state.plan_epoch || 0),
    count: Number(state.automatic_review_replans || 0),
    case_b: state.case_b_exemption_consumed,
  };
}

function exactAuthorityBytes(fx) {
  const read = file => fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null;
  const epochRoot = path.join(fx.cacheDir, 'epochs');
  const epochFiles = {};
  const walk = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else epochFiles[path.relative(epochRoot, abs).replace(/\\/g, '/')] = read(abs);
    }
  };
  walk(epochRoot);
  const historyFiles = {};
  for (const dirname of ['committed-transactions', 'replan-sources']) {
    const root = path.join(fx.cacheDir, dirname);
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).sort()) {
      historyFiles[dirname + '/' + name] = read(path.join(root, name));
    }
  }
  return {
    plan: read(path.join(fx.projectDir, 'workflow-plan.md')),
    state: read(path.join(fx.projectDir, 'workflow-state.md')),
    tasks: read(path.join(fx.projectDir, 'workflow-tasks.json')),
    transaction: read(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME)),
    source: read(path.join(fx.cacheDir, 'replan-source.json')),
    histories: historyFiles,
    snapshots: epochFiles,
    cardinalities: authorityCardinalities(fx),
  };
}

function authorityByteDiff(actual, expected) {
  const top = ['plan', 'state', 'tasks', 'transaction', 'source', 'histories', 'cardinalities']
    .filter(key => JSON.stringify(actual[key]) !== JSON.stringify(expected[key]));
  const snapshotKeys = [...new Set([...Object.keys(actual.snapshots), ...Object.keys(expected.snapshots)])].sort();
  return { top, snapshots: snapshotKeys.filter(key => actual.snapshots[key] !== expected.snapshots[key]) };
}

function driveReplanToCommit(fx, options = {}) {
  const common = { repoRoot: fx.root, project: fx.project,
    now: () => '2026-07-16T03:00:00.000Z', failpoint: options.failpoint,
    casMutation: options.casMutation };
  let result;
  try {
    result = replan.prepareReplan({ ...common, sourceAttemptId: fx.sourceAttemptId,
      transitionReason: 'review_repair_requires_replan' });
  } catch (error) {
    if (!options.allowCrash) throw error;
    result = { result: 'crashed', error };
  }
  for (let turn = 0; turn < 20; turn++) {
    if (result && ['committed', 'already_committed'].includes(result.result)) return result;
    if (result && result.reason === 'replan_planner_dispatch_required') {
      const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
      const childPath = path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME);
      if (!fs.existsSync(childPath) || fs.statSync(childPath).size === 0) writePlannerResult(fx, tx);
    }
    try { result = replan.resumeReplan(common); }
    catch (error) {
      if (!options.allowCrash) throw error;
      result = { result: 'crashed', error };
      common.failpoint = null;
      common.casMutation = null;
    }
  }
  throw new Error('replan_driver_did_not_converge:' + JSON.stringify(result));
}

function installCurrentReviewSource(fx, attemptId) {
  const planPath = path.join(fx.projectDir, 'workflow-plan.md');
  let planContent = fs.readFileSync(planPath, 'utf8');
  const nodes = validator.parseNodes(planContent);
  const progressed = [nodes[0], nodes.find(node => node.role === 'code-reviewer')].filter(Boolean);
  for (const node of progressed) {
    planContent = planContent.replace(new RegExp('^\\| ' + node.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')
      + ' \\| (?:pending|in_progress) \\|$', 'm'), `| ${node.id} | complete |`);
    planContent = planContent.replace(new RegExp('^\\| ' + node.role.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')
      + ' \\(' + node.id.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')
      + '\\) \\| pending \\| \\| \\|$', 'm'),
    `| ${node.role} (${node.id}) | invoked | .cache/${node.id}.md | |`);
    fs.writeFileSync(path.join(fx.cacheDir, node.id + '.md'),
      `evidence-binding: ${node.id} progress-proof\nGREEN: legal runtime progress\n`);
  }
  fs.writeFileSync(planPath, planContent);
  fs.writeFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), JSON.stringify(
    generateMirror({ planContent, now: '2026-07-16T02:00:00.000Z' }), null, 2) + '\n');
  const planHash = validator.readStoredHash(planContent);
  const priorJournal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
  const attempt = JSON.parse(JSON.stringify(priorJournal.attempts[0]));
  attempt.attempt_id = attemptId;
  attempt.ordinal = 1;
  attempt.plan_hash = planHash;
  attempt.candidate_digest = replan.computeReviewCandidateDigest(fx.root, fx.project);
  attempt.consumed_by = null;
  attempt.rebind = [];
  attempt.transaction_key = sha256(Buffer.from(JSON.stringify({
    plan_hash: planHash,
    logical_gate_key: attempt.logical_gate.key,
    candidate_digest: attempt.candidate_digest,
    generations: attempt.generations,
  })));
  const journal = { schema_version: 1, plan_hash: planHash, attempts: [attempt] };
  fs.writeFileSync(path.join(fx.cacheDir, 'review-attempts.json'), JSON.stringify(journal, null, 2) + '\n');
  for (const receipt of attempt.receipts) {
    fs.writeFileSync(path.join(fx.cacheDir, receipt.node_id + '.md'), receipt.body);
  }
  writeSchema2RepairSource(fx, journal, attempt);
  return attempt;
}

function installSchema2ReviewSource(fx, config = {}) {
  const planPath = path.join(fx.projectDir, 'workflow-plan.md');
  const planContent = fs.readFileSync(planPath, 'utf8');
  const planHash = validator.readStoredHash(planContent);
  const nodes = validator.parseNodes(planContent);
  const reviewId = config.reviewId || (fx.sameGateChild ? 'review' : 'child-review');
  const producerId = config.producerId
    || (fx.sameGateChild ? (fx.changedOriginChild ? 'impl2' : 'impl') : 'child-impl');
  const reviewNode = nodes.find(node => node.id === reviewId);
  const generation = config.generation || 'schema2gen001';
  const ordinal = config.ordinal || 1;
  const logicalGate = schema.canonicalLogicalGateIdentity({
    kind: 'sequence', id: reviewId, origin: reviewNode.dependsOn, members: [reviewId],
  });
  const findingId = config.findingId || 'R2';
  const findingLine = `finding: id=${findingId} scope=product action=fix status=open severity=high file=product.js fix_role=tdd-guide`;
  const body = [`evidence-binding: ${reviewId} ${generation}`, 'verdict: fail',
    'findings_blocking: 1', findingLine, ''].join('\n');
  const effective = schema.evaluateEffectiveVerdict(body);
  const parsedFindings = schema.parseNodeFindings(body).map(finding => ({ source_node: reviewId, ...finding }));
  const candidate = adaptiveNode.computeReviewCandidateDigest(planPath, fx.project, fx.root, new Set(['product.js']));
  const generations = [{ member: reviewId, nonce: generation }];
  const attempt = {
    attempt_id: `${reviewId}:${ordinal}`, ordinal, plan_hash: planHash, logical_gate: logicalGate,
    transaction_key: sha256(Buffer.from(JSON.stringify({ plan_hash: planHash,
      logical_gate_key: logicalGate.key, candidate_digest: candidate.digest, generations }))),
    candidate_digest: candidate.digest, candidate_declared: candidate.declared,
    candidate_residue_digest: candidate.residue_digest, generations,
    settlement_command: 'close-node', outcome: 'fail', reason: effective.reason,
    receipts: [{ node_id: reviewId, generation, body, receipt_sha256: sha256(Buffer.from(body)),
      effective_pass: false, verdict: 'fail', findings_blocking: 1 }],
    findings: parsedFindings,
    route_candidates: adaptiveNode.routeCanonicalFindings(parsedFindings, nodes, reviewId),
    lifecycle_settled: true,
    repair: { selected_writer: null, settled: null }, rebind: [], consumed_by: null,
  };
  const state = adaptiveNode.readReviewJournal({ planPath,
    readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
  }, planContent);
  ok(state.ok && state.journal, 'schema-2 source helper reads the inherited journal');
  state.journal.attempts.push(attempt);
  fs.writeFileSync(state.journalPath, JSON.stringify(state.journal, null, 2) + '\n');
  fs.writeFileSync(path.join(fx.cacheDir, reviewId + '.md'), body);
  writeSchema2RepairSource(fx, state.journal, attempt, { producerSlice: [producerId] });
  return { attempt, state };
}

// A PRODUCTION-SHAPED schema-2 review journal source (`schema_version: 2` + `contract_version: 2`,
// per-attempt `contract_version: 2`, and receipts that bind their evidence with `raw_evidence_sha256`
// and carry no embedded `body`). Every other journal fixture in this file is schema-1: they seal the
// LEGACY raw ls-tree candidate digest and legacy `body`/`receipt_sha256` receipts, so they exercise
// the legacy lane only. This helper is the schema-2 lane's live coverage — the candidate identity it
// seals is the validation runner's landable-tree digest, exactly what the schema-2 close path records.
function installReviewJournalV2Source(fx, config = {}) {
  const planPath = path.join(fx.projectDir, 'workflow-plan.md');
  const planContent = fs.readFileSync(planPath, 'utf8');
  const planHash = validator.readStoredHash(planContent);
  const reviewId = config.reviewId || 'review';
  const producerId = config.producerId || 'impl';
  const nonce = config.generation || 'v2gen0001';
  const surface = config.surface || 'product.js';
  const body = [`evidence-binding: ${reviewId} ${nonce}`, 'verdict: fail', 'findings_blocking: 1', ''].join('\n');
  const candidateDigest = validationRunner.computeLandableTreeDigest(fx.root,
    { test_consumed_paths: validator.parseValidationTestConsumes(planContent) });
  ok(/^[0-9a-f]{64}$/.test(String(candidateDigest || '')),
    'schema-2 replan source fixture seals the landable-tree candidate digest: ' + candidateDigest);
  const scopeLineageId = sha256(Buffer.from('scope:' + fx.project + ':' + reviewId));
  const contextHash = sha256(Buffer.from('review-context:' + reviewId));
  const profileHash = sha256(Buffer.from('resolved-profile:' + reviewId));
  const normalized = schema.normalizeFindingSet([{
    failure_class: 'correctness',
    trigger: {
      precondition_digest: sha256(Buffer.from('pre')), input_digest: sha256(Buffer.from('in')),
      expected_digest: sha256(Buffer.from('expected')), observed_digest: sha256(Buffer.from('observed')),
    },
    primary_anchor: config.primaryAnchor || {
      kind: 'evidence_observation',
      producer_evidence_digest: sha256(Buffer.from('producer-evidence:' + producerId)),
      observation_key: 'product/regression',
    },
    secondary_anchors: config.secondaryAnchors || [],
    severity: 'high', scope: 'product', action: 'fix', status: 'open', fix_role: 'tdd-guide',
  }], { scope_lineage_id: scopeLineageId });
  ok(normalized.ok, 'schema-2 replan source fixture normalizes its finding set: ' + JSON.stringify(normalized));
  const findings = normalized.findings;
  const openUids = findings.filter(finding => finding.status !== 'resolved').map(finding => finding.uid).sort();
  const gateIdentity = {
    kind: 'sequence', members: [reviewId], claim_digest: sha256(Buffer.from('claim:' + reviewId)),
    surface_digests: [schema.sha256Hex(surface)], aggregation: 'sequence',
    certified_producers: [producerId],
  };
  const gate = { ...gateIdentity, key: schema.sha256Hex(schema.canonicalJson(gateIdentity)) };
  const receipt = {
    schema_version: 2, contract_version: 2, node_id: reviewId,
    evidence_binding: { node_id: reviewId, nonce },
    review_context_hash: contextHash,
    behavior_contract_hash: sha256(Buffer.from('behavior:' + reviewId)),
    resolved_profile_hash: profileHash, candidate_digest: candidateDigest,
    execution_status: 'complete', domain_outcome: 'changes_requested',
    gate_effect: schema.deriveGateEffect('code-reviewer', 'change_gate', 'changes_requested', findings.length),
    surface, findings, resolutions: [], blocking_findings: findings.length,
    validation_vectors: [], certifier_digest: candidateDigest,
    raw_evidence_sha256: schema.sha256Hex(body),
  };
  const reduced = schema.reduceReviewReceipts({
    aggregation: gate.aggregation, role: 'code-reviewer', gate_mode: 'change_gate',
    expected_members: gate.members, expected_surfaces: [surface], receipts: [receipt],
  });
  ok(reduced.complete, 'schema-2 replan source fixture reduces its gate receipts: ' + JSON.stringify(reduced.reason));
  const attempt = {
    attempt_id: 'review2-' + gate.key.slice(0, 16) + ':1',
    ordinal: 1, plan_hash: planHash, contract_version: 2, logical_gate: gate,
    transaction_key: schema.sha256Hex(schema.canonicalJson({
      plan_hash: planHash, logical_gate_key: gate.key,
      candidate_digest: candidateDigest, context_hash: contextHash,
    })),
    candidate_digest: candidateDigest, candidate_declared: {},
    candidate_residue_digest: sha256(Buffer.from('residue:' + reviewId)),
    epoch_lineage_id: fx.lineage.epoch_lineage_id, gate_mode: 'change_gate',
    scope_lineage_id: scopeLineageId,
    context_hashes: [contextHash], profile_hashes: [profileHash], review_phase: 'discovery',
    prior_open_uids: [], current_open_uids: openUids,
    current_findings: findings, findings, resolutions: [],
    route_candidates: findings.map(finding => ({
      source_node: reviewId, finding_id: finding.uid, id: finding.uid, scope: finding.scope,
      action: finding.action, status: finding.status, severity: finding.severity,
      fix_role: finding.fix_role, ownership_candidates: [producerId], owning_node: producerId, raw: '',
    })),
    repair_delta: null, validation_obligations: [], validation_vectors: [],
    progress: {
      progress: null, reason: null, stop_reason: null, replan_required: false,
      consecutive_nonprogress: 0, idempotency_key: null,
      previous_open_uids: [], current_open_uids: openUids,
    },
    reducer: { role: 'code-reviewer', complete: reduced.complete, domain_outcome: reduced.domain_outcome,
      gate_effect: reduced.gate_effect, blocking_findings: reduced.blocking_findings },
    receipts: [receipt], outcome: 'fail', reason: 'review_gate_failed',
    settlement_command: 'close-node', lifecycle_settled: true,
    producer_bindings: { [producerId]: { baseline: fx.commit, anchored_ref: fx.commit,
      open_token: fx.commit, generation: fx.commit.slice(0, 12),
      ref: 'refs/kaola-workflow/barrier/' + fx.project + '/' + producerId } },
    repair: { selected_writer: null, settled: null }, rebind: [], consumed_by: null,
  };
  const journal = { schema_version: 2, contract_version: 2, plan_hash: planHash, attempts: [attempt] };
  // Fixture self-guard: if this refuses, the FIXTURE is wrong, not the code under test — a journal
  // the production validator rejects would never reach the source-evidence check at all.
  const journalCheck = schema.validateReviewJournal(journal, planHash, 2);
  ok(journalCheck.ok, 'schema-2 replan source fixture is a production-valid review journal: '
    + JSON.stringify(journalCheck));
  ok(receipt.body === undefined && receipt.receipt_sha256 === undefined,
    'schema-2 replan source fixture receipt embeds no legacy body/receipt_sha256 pair');
  fs.writeFileSync(path.join(fx.cacheDir, 'review-attempts.json'), JSON.stringify(journal, null, 2) + '\n');
  fs.writeFileSync(path.join(fx.cacheDir, reviewId + '.md'), body);
  writeSchema2RepairSource(fx, journal, attempt, { producerSlice: [producerId] });
  return { journal, attempt, receipt, body, candidateDigest, reviewId };
}

function fanoutJournalFixture(config = {}) {
  const planHash = config.planHash || 'a'.repeat(64);
  const members = (config.members || ['review-a', 'review-b', 'review-c']).slice().sort();
  const origin = (config.origin || ['writer']).slice().sort();
  const logicalGate = schema.canonicalLogicalGateIdentity({
    kind: 'fanout', id: config.group || 'reviews', origin, members,
  });
  const generations = members.map((member, index) => ({ member, nonce: `generation-${index + 1}` }));
  const receiptSpecs = config.receipts || {};
  const receipts = [];
  const findings = [];
  const routeCandidates = [];
  for (const { member, nonce } of generations) {
    const spec = receiptSpecs[member] || {};
    const lines = [
      `evidence-binding: ${member} ${nonce}`,
      `verdict: ${spec.verdict || 'pass'}`,
      `findings_blocking: ${Number.isInteger(spec.findings_blocking) ? spec.findings_blocking : 0}`,
    ];
    if (spec.finding) lines.push('finding: ' + spec.finding);
    const body = lines.join('\n') + '\n';
    const evaluated = schema.evaluateEffectiveVerdict(body);
    receipts.push({
      node_id: member,
      generation: nonce,
      body,
      receipt_sha256: sha256(Buffer.from(body)),
      effective_pass: evaluated.pass,
      verdict: evaluated.verdict,
      findings_blocking: evaluated.findings_blocking,
    });
    for (const finding of schema.parseNodeFindings(body).filter(row => row && row.id)) {
      const canonical = { source_node: member, ...finding };
      findings.push(canonical);
      const route = {
        source_node: member,
        finding_id: finding.id,
        id: finding.id,
        ownership_candidates: [],
        owning_node: null,
        raw: finding.raw,
      };
      for (const key of ['scope', 'action', 'status', 'severity', 'file', 'fix_role']) {
        if (Object.prototype.hasOwnProperty.call(finding, key)) route[key] = finding[key];
      }
      routeCandidates.push(route);
    }
  }
  const candidateDigest = 'b'.repeat(64);
  const attempt = {
    attempt_id: config.attemptId || 'fanout-reviews:1',
    ordinal: 1,
    plan_hash: planHash,
    logical_gate: logicalGate,
    transaction_key: sha256(Buffer.from(JSON.stringify({
      plan_hash: planHash,
      logical_gate_key: logicalGate.key,
      candidate_digest: candidateDigest,
      generations,
    }))),
    candidate_digest: candidateDigest,
    candidate_declared: {},
    candidate_residue_digest: 'c'.repeat(64),
    generations,
    settlement_command: 'close-node',
    outcome: Object.prototype.hasOwnProperty.call(config, 'outcome') ? config.outcome : 'pass',
    reason: Object.prototype.hasOwnProperty.call(config, 'reason') ? config.reason : null,
    receipts,
    findings,
    route_candidates: routeCandidates,
    lifecycle_settled: config.outcome !== null,
    repair: { selected_writer: null, settled: null },
    rebind: [],
    consumed_by: null,
  };
  return {
    journal: { schema_version: 1, plan_hash: planHash, attempts: [attempt] },
    contract: {
      logical_gate_key: logicalGate.key,
      role: config.role || 'code-reviewer',
      aggregation: config.aggregation || 'replicated_majority',
      members,
    },
  };
}

// Canonical serialization rejects ambiguous JavaScript values and is key-order stable.
equal(schema.canonicalJson({ z: 1, a: { y: 2, x: [3, 2, 1] } }), '{"a":{"x":[3,2,1],"y":2},"z":1}', 'canonicalJson sorts object keys and preserves caller-sorted arrays');
equal(schema.sha256Canonical({ b: 2, a: 1 }), schema.sha256Canonical({ a: 1, b: 2 }), 'canonical digest is independent of insertion order');
rejects(() => schema.canonicalJson(1.5), 'canonical_json_number_not_integer', 'floats are refused');
rejects(() => schema.canonicalJson({ x: undefined }), 'canonical_json_undefined', 'undefined is refused');
rejects(() => schema.canonicalJson(new Date()), 'canonical_json_non_plain_object', 'non-plain objects are refused');
const sparse = []; sparse.length = 1;
rejects(() => schema.canonicalJson(sparse), 'canonical_json_sparse_or_undefined', 'sparse arrays are refused');
const cyclic = {}; cyclic.self = cyclic;
rejects(() => schema.canonicalJson(cyclic), 'canonical_json_cycle', 'cycles are refused');

// #699 epoch-2 RED contract surface. Keep this grouped so a pre-implementation
// run reports the complete missing authority surface instead of stopping at the
// first absent helper.
{
  const missing = [];
  if (typeof replan.buildSnapshotAuthorityProjection !== 'function') missing.push('snapshot-authority-projection');
  if (typeof replan.verifyActivePlanningEvidence !== 'function') missing.push('planning-evidence-consistency');
  if (typeof replan.verifyCurrentEpochAuthority !== 'function') missing.push('current-epoch-authority');
  if (!Array.isArray(schema.REPLAN_DURABLE_WRITE_LABELS)) missing.push('durable-write-inventory');
  if (!schema.REPLAN_DURABLE_WRITE_LABELS_DYNAMIC) missing.push('dynamic-write-label-contract');
  if (schema.REPLAN_TRANSACTION_SCHEMA_VERSION !== 2) missing.push('versioned-transaction-writer');
  deepEqual(missing, [], 'epoch-2 lineage authority surface is present before behavioral execution');
}

// The only planless authority is the canonical epoch-1 zero-snapshot shape.
// A plan, task mirror, stale first-node evidence, or epoch drift is a hybrid.
// A genuinely pre-epoch state with no envelope fields remains readable only
// through the historical archive compatibility path; a partially stripped
// schema-2 envelope is never reclassified as legacy. The envelope-absent state
// is classified `legacy` (not `planless`, a specific schema-2 shape): the strict
// schema-2 active/planless split never applied to it, so a legacy project — with
// or without a real plan — stays archivable exactly as it was before this gate.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-replan-legacy-planless-'));
  const projectDir = path.join(root, 'issue-legacy');
  try {
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'),
      '# Legacy State\nstatus: closed\nissue_number: 1\n');
    ok(replan.verifyCurrentEpochAuthority(projectDir).authority_kind === 'legacy',
      'envelope-absent legacy authority remains readable for archive compatibility');
    ok(replan.verifyAllEpochSnapshots(projectDir).ok,
      'envelope-absent legacy history remains readable for archive compatibility');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// Backward-compat regression: a pre-#699 state carrying a real (old-format)
// Planning Evidence plan_hash and a real workflow-plan.md must still be accepted.
// Before the legacy branch honored the classifier flag, active_plan_hash defaulted
// to 'none' and forced this legacy-but-PLANNED shape down the strict planless branch,
// refusing state_planless_authority_invalid and blocking finalize/archive of every
// pre-#699 planned project. Both shared verifiers must accept it so destructive
// callers can proceed.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-replan-legacy-planned-'));
  const projectDir = path.join(root, 'issue-legacy-planned');
  try {
    fs.mkdirSync(projectDir);
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'),
      '## Project\nname: issue-legacy-planned\nstatus: active\nissue_number: 970\n'
      + 'next_command: /kaola-workflow-plan-run issue-legacy-planned\n'
      + '## Planning Evidence\nplan_hash: ' + 'a'.repeat(64) + '\ndecision: ask\n'
      + '## Sink\nbranch: workflow/issue-legacy-planned\nsink: pr\n');
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'),
      '<!-- plan_hash: ' + 'b'.repeat(64) + ' -->\n\n# Workflow Plan\n\n'
      + '## Node Ledger\n\n| id | status |\n|---|---|\n| n1 | complete |\n');
    const current = replan.verifyCurrentEpochAuthority(projectDir);
    ok(current.ok && current.authority_kind === 'legacy',
      'a pre-#699 legacy state WITH a real plan is accepted as legacy, not forced planless');
    ok(replan.verifyAllEpochSnapshots(projectDir).ok,
      'legacy planned snapshot authority stays readable for archive compatibility');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

{
  const fx = initFixture();
  try {
    const statePath = path.join(fx.projectDir, 'workflow-state.md');
    const plannedState = fs.readFileSync(statePath, 'utf8');
    const epochAuthorityMutations = [
      ['missing epoch schema version', value => value.replace(/^epoch_schema_version:.*\n/m, ''),
        'state_epoch_schema_missing'],
      ['unknown epoch schema version', value => value.replace(/^epoch_schema_version:.*$/m,
        'epoch_schema_version: 99'), 'state_epoch_schema_unsupported'],
      ['missing epoch lineage id', value => value.replace(/^epoch_lineage_id:.*\n/m, ''),
        'state_epoch_lineage_missing'],
      ['non-lineage-consistent epoch lineage id', value => value.replace(/^epoch_lineage_id:.*$/m,
        'epoch_lineage_id: ' + 'f'.repeat(64)), 'state_epoch_lineage_mismatch'],
    ];
    for (const [name, mutate, reason] of epochAuthorityMutations) {
      fs.writeFileSync(statePath, mutate(plannedState));
      equal(replan.verifyCurrentEpochAuthority(fx.projectDir).reason, reason,
        'planned current authority refuses ' + name + ' with the shared typed reason');
      equal(replan.verifyAllEpochSnapshots(fx.projectDir).reason, reason,
        'planned snapshot authority refuses ' + name + ' with the shared typed reason');
    }
    fs.writeFileSync(statePath, plannedState);
    let state = fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8')
      .replace(/^plan_hash:.*$/m, 'plan_hash: none')
      .replace(/^first_node_id:.*$/m, 'first_node_id: none')
      .replace(/^first_node_role:.*$/m, 'first_node_role: none');
    state = schema.writeEpochStateBlock(state, {
      plan_epoch: 1, active_plan_hash: 'none', active_snapshot_manifest_digest: 'none',
      replan_status: 'none', replan_transaction_id: 'none', replan_phase: 'none',
    });
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-state.md'), state);
    fs.unlinkSync(path.join(fx.projectDir, 'workflow-plan.md'));
    fs.unlinkSync(path.join(fx.projectDir, 'workflow-tasks.json'));
    ok(replan.verifyCurrentEpochAuthority(fx.projectDir).authority_kind === 'planless',
      'canonical epoch-1 zero-snapshot planless authority verifies');
    ok(replan.verifyAllEpochSnapshots(fx.projectDir).authority_kind === 'planless',
      'snapshot verification branches before trying to read a missing plan');
    const planlessState = fs.readFileSync(statePath, 'utf8');
    for (const [name, mutate, reason] of epochAuthorityMutations) {
      fs.writeFileSync(statePath, mutate(planlessState));
      equal(replan.verifyCurrentEpochAuthority(fx.projectDir).reason, reason,
        'planless current authority refuses ' + name + ' with the shared typed reason');
      equal(replan.verifyAllEpochSnapshots(fx.projectDir).reason, reason,
        'planless snapshot authority refuses ' + name + ' with the shared typed reason');
    }
    fs.writeFileSync(statePath, planlessState);
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), JSON.stringify({
      source_plan_hash: 'f'.repeat(64), tasks: [],
    }) + '\n');
    equal(replan.verifyCurrentEpochAuthority(fx.projectDir).reason, 'state_planless_authority_invalid',
      'planless authority refuses a task-mirror hybrid');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// A schema-2 plan freezes and resumes only when Required Agent Compliance is
// the exact one-row-per-node requirement set, including the finalize sink.
// Runtime status/evidence advancement remains mutable and is intentionally not
// rewritten by this validation wall.
{
  const livePlanPath = path.resolve(__dirname, '..', 'kaola-workflow', 'issue-699', 'workflow-plan.md');
  if (fs.existsSync(livePlanPath)) {
    const exact = fs.readFileSync(livePlanPath, 'utf8');
    ok(exact.includes('| finalize (e11-finalize) | pending | | |')
      && validator.validatePlan(exact, { root: path.resolve(__dirname, '..') }).result === 'in-grammar',
    'schema-2 freeze accepts the exact complete compliance requirement set including finalize');
    ok(validator.revalidateForResume(exact, { root: path.resolve(__dirname, '..') }).ok,
      'schema-2 resume accepts the exact complete compliance requirement set');
    const variants = [
      ['missing finalize requirement', exact.replace(/^\| finalize \(e11-finalize\).*\n/m, '')],
      ['duplicate requirement', exact.replace(
        /^(\| adversarial-verifier \(e10-falsify-publication-and-editions\).*\n)/m, '$1$1')],
      ['malformed requirement header', exact.replace(
        '| Requirement | Status | Evidence | Skip Reason |',
        '| Agent | Status | Evidence | Skip Reason |')],
    ];
    for (const [name, malformed] of variants) {
      equal(validator.validatePlan(malformed, { root: path.resolve(__dirname, '..') }).reason,
        'required_agent_compliance_invalid', 'schema-2 freeze refuses ' + name);
      equal(validator.revalidateForResume(malformed, { root: path.resolve(__dirname, '..') }).reasonCode,
        'required_agent_compliance_invalid', 'schema-2 resume refuses ' + name);
    }
  }
}

// Schema-2 repair outcomes are exact envelopes. A substituted journal,
// attempt, candidate, plan, lineage, root, identity, or outcome digest cannot
// start a transaction, and newly created schema-1 bootstrap JSON is refused.
for (const field of [
  'parent_plan_hash', 'epoch_lineage_id', 'claim_identity_digest', 'claim_root_base_digest',
  'review_journal_digest', 'review_attempt_digest', 'effective_candidate_digest', 'outcome_digest',
]) {
  const fx = initFixture();
  try {
    const sourcePath = path.join(fx.cacheDir, 'replan-source.json');
    const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    source[field] = 'f'.repeat(64);
    fs.writeFileSync(sourcePath, schema.canonicalJson(source) + '\n');
    const result = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' });
    ok(result.result === 'refuse' && /^replan_source_/.test(result.reason),
      'schema-2 repair outcome substitution refuses at ' + field + ': ' + JSON.stringify(result));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  const fx = initFixture();
  try {
    fs.writeFileSync(path.join(fx.cacheDir, 'replan-source.json'), JSON.stringify({
      schema_version: 1, result: 'repair_requires_replan', attempt_id: fx.sourceAttemptId,
      reason: 'dependent_producer_replay_required', producer_slice: ['impl'],
    }) + '\n');
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' }).reason,
    'replan_source_schema_invalid', 'new schema-1 operator bootstrap is refused');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #699 review outcome transport: begin with a real frozen parent and settled
// failed-review journal, drive the real repair-node result, crash immediately
// after its source-envelope write, retry idempotently, then let prepare consume
// that mechanically persisted authority and reach planner_pending. This fixture
// never writes replan-source.json itself.
{
  const fx = initFixture({ seedSource: false, sourceAttemptId: 'review:1' });
  try {
    const identity = schema.buildClaimIdentity({
      schema_version: 2, repository_id: 'local:' + fx.root, issue_numbers: [699], primary_issue: 699,
      bundle_id: null, closure_policy: 'all_or_nothing', branch: 'workflow/issue-699',
      worktree_path: fx.root, claim_ts: '2026-07-16T00:00:00.000Z', session_marker: 'test-session',
    });
    const rootBase = schema.buildClaimRootBase({
      schema_version: 2, object_format: fx.commit.length === 64 ? 'sha256' : 'sha1',
      commit: fx.commit, tree: fx.tree, branch: 'workflow/issue-699',
    });
    const lineage = schema.buildEpochLineage(identity, rootBase);
    const statePath = path.join(fx.projectDir, 'workflow-state.md');
    const state = schema.writeEpochStateBlock(fs.readFileSync(statePath, 'utf8'), {
      epoch_schema_version: 2, claim_repository_id: identity.repository_id,
      claim_identity_digest: lineage.claim_identity_digest,
      claim_root_object_format: rootBase.object_format, claim_root_base_commit: rootBase.commit,
      claim_root_base_tree: rootBase.tree, claim_root_base_digest: lineage.claim_root_base_digest,
      epoch_lineage_id: lineage.epoch_lineage_id, plan_epoch: 1, active_plan_hash: fx.parent.hash,
      inherited_frontier_digest: 'none', inherited_frontier_classes: 'none',
      automatic_review_replans: 0, authorized_epoch_ceiling: 2,
      case_b_exemption_consumed: false, replan_status: 'none', replan_transaction_id: 'none',
      replan_phase: 'none', active_snapshot_manifest_digest: 'none',
    });
    fs.writeFileSync(statePath, state);
    const journal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
    const attempt = journal.attempts[0];
    const originalIdentity = attempt.producer_bindings.impl;
    const repairOpts = {
      planPath: path.join(fx.projectDir, 'workflow-plan.md'), statePath, project: fx.project,
      repoRoot: fx.root, nodeId: 'impl', attemptId: attempt.attempt_id,
      shell: () => ({ exitCode: 0, result: 'ok', ok: true, overallOk: true,
        selectorCheck: { isSelector: false, ok: true } }),
      readFile: p => fs.readFileSync(p, 'utf8'), writeFile: (p, content) => fs.writeFileSync(p, content),
      cacheExists: p => fs.existsSync(p), unlink: p => { try { fs.unlinkSync(p); } catch (_) {} },
      readdir: p => { try { return fs.readdirSync(p); } catch (_) { return []; } },
      computeReviewCandidateDigest: () => attempt.candidate_digest,
      captureWriterBarrierIdentity: () => ({ ...originalIdentity, ref: originalIdentity.ref + '-substituted' }),
      reviewFailpoint: 'after_replan_source_outcome',
      now: () => '2026-07-16T01:00:00.000Z',
    };
    let crash = null;
    let firstOutcome = null;
    try { firstOutcome = adaptiveNode.runRepairNode(repairOpts); } catch (error) { crash = error; }
    ok(crash && crash.message === 'review_failpoint:after_replan_source_outcome',
      'repair outcome crashes only after the durable source envelope is published; outcome=' + JSON.stringify(firstOutcome));
    const sourcePath = path.join(fx.cacheDir, 'replan-source.json');
    ok(fs.existsSync(sourcePath), 'crash after source persistence leaves the envelope consumable');
    const firstBytes = fs.readFileSync(sourcePath, 'utf8');
    const envelope = JSON.parse(firstBytes);
    equal(envelope.schema_version, 2, 'mechanical repair source uses schema 2');
    equal(envelope.kind, 'repair_outcome', 'mechanical repair source is typed repair_outcome');
    equal(envelope.attempt_id, attempt.attempt_id, 'mechanical repair source binds the settled attempt');
    equal(envelope.parent_plan_hash, fx.parent.hash, 'mechanical repair source binds the frozen parent');
    equal(envelope.epoch_lineage_id, lineage.epoch_lineage_id, 'mechanical repair source binds claim lineage');
    const retried = adaptiveNode.runRepairNode({ ...repairOpts, reviewFailpoint: null,
      now: () => '2026-07-16T02:00:00.000Z' });
    equal(retried.result, 'repair_requires_replan', 'retry returns the same settled repair outcome');
    equal(fs.readFileSync(sourcePath, 'utf8'), firstBytes,
      'idempotent retry preserves the original source bytes and persisted_at');
    const durableFields = replan.parseStateFields(fs.readFileSync(statePath, 'utf8'));
    const durableIdentity = schema.buildClaimIdentity({
      schema_version: 2, repository_id: durableFields.claim_repository_id,
      issue_numbers: [durableFields.issue_number], primary_issue: Number(durableFields.issue_number),
      bundle_id: durableFields.bundle_id || null, closure_policy: durableFields.closure_policy || 'all_or_nothing',
      branch: durableFields.branch, worktree_path: fs.realpathSync(durableFields.worktree_path),
      claim_ts: durableFields.claim_ts, session_marker: durableFields.session_marker,
    });
    equal(schema.sha256Canonical(durableIdentity), lineage.claim_identity_digest,
      'transport fixture claim identity is exactly reconstructible from durable state: ' + JSON.stringify({ identity, durableIdentity }));
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: attempt.attempt_id, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'prepared', 'prepare consumes the mechanically persisted repair source: ' + JSON.stringify(prepared));
    const pending = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(pending.reason, 'replan_planner_dispatch_required',
      'real failed review -> repair outcome -> prepare reaches planner_pending without operator JSON');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Schema-2 code/security fanouts reduce under the exact plan-owned contract.
// Legacy metadata-absent fanouts retain the historical strict-majority rule.
{
  const dissent = { 'review-c': { verdict: 'fail' } };
  const partitioned = fanoutJournalFixture({ aggregation: 'partitioned_all', receipts: dissent,
    outcome: 'fail', reason: 'fanout_refuted' });
  const partitionedOptions = { schema2_review_gates: [partitioned.contract] };
  ok(schema.validateReviewJournal(partitioned.journal, partitioned.journal.plan_hash,
    partitionedOptions).ok, 'partitioned-all 2-pass/1-dissent persists fail');
  ok(schema.validateReviewJournal(JSON.parse(JSON.stringify(partitioned.journal)),
    partitioned.journal.plan_hash, partitionedOptions).ok,
  'partitioned-all failed attempt remains valid on durable reread');
  const launderedPartition = JSON.parse(JSON.stringify(partitioned.journal));
  launderedPartition.attempts[0].outcome = 'pass';
  launderedPartition.attempts[0].reason = null;
  equal(schema.validateReviewJournal(launderedPartition, launderedPartition.plan_hash,
    partitionedOptions).reason, 'review_journal_outcome_mismatch',
  'partitioned-all dissent stays repair-blocking instead of laundering to pass');

  const numericVeto = fanoutJournalFixture({ aggregation: 'replicated_majority',
    receipts: { 'review-c': { verdict: 'pass', findings_blocking: 1 } },
    outcome: 'fail', reason: 'fanout_refuted' });
  ok(schema.validateReviewJournal(numericVeto.journal, numericVeto.journal.plan_hash,
    { schema2_review_gates: [numericVeto.contract] }).ok,
  'replicated-majority numeric blocker veto persists fail on reread');

  const unresolvedVeto = fanoutJournalFixture({ aggregation: 'replicated_majority',
    receipts: { 'review-c': { verdict: 'pass', findings_blocking: 0,
      finding: 'id=R-HB scope=in_scope action=fix status=open severity=high file=runtime.js fix_role=tdd-guide' } },
    outcome: 'fail', reason: 'fanout_refuted' });
  ok(schema.validateReviewJournal(unresolvedVeto.journal, unresolvedVeto.journal.plan_hash,
    { schema2_review_gates: [unresolvedVeto.contract] }).ok,
  'zero numeric blockers cannot outvote an unresolved in-scope fix');

  const majority = fanoutJournalFixture({ aggregation: 'replicated_majority', receipts: dissent,
    outcome: 'pass', reason: null });
  ok(schema.validateReviewJournal(majority.journal, majority.journal.plan_hash,
    { schema2_review_gates: [majority.contract] }).ok,
  'replicated-majority 2-pass/1-non-blocking-dissent persists pass');
  const provisional = JSON.parse(JSON.stringify(majority.journal));
  provisional.attempts[0].receipts.pop();
  provisional.attempts[0].outcome = null;
  provisional.attempts[0].reason = null;
  provisional.attempts[0].lifecycle_settled = false;
  ok(schema.validateReviewJournal(provisional, provisional.plan_hash,
    { schema2_review_gates: [majority.contract] }).ok,
  'schema-2 fanout keeps a partial provisional null/null attempt legal');

  const legacy = fanoutJournalFixture({ aggregation: 'replicated_majority',
    receipts: { 'review-c': { verdict: 'pass', findings_blocking: 1 } },
    outcome: 'pass', reason: null });
  ok(schema.validateReviewJournal(legacy.journal, legacy.journal.plan_hash).ok,
    'options-absent legacy fanout keeps strict-majority behavior');

  const intersecting = fanoutJournalFixture({ members: ['review-a', 'review-b'],
    aggregation: 'replicated_majority', outcome: 'pass', reason: null });
  equal(schema.validateReviewJournal(intersecting.journal, intersecting.journal.plan_hash,
    { schema2_review_gates: [majority.contract] }).reason,
  'review_journal_schema2_gate_mismatch',
  'an intersecting member with unmatched key/member set is rejected');

  const emptyJournal = { schema_version: 1, plan_hash: 'd'.repeat(64), attempts: [] };
  equal(schema.validateReviewJournal(emptyJournal, emptyJournal.plan_hash,
    { schema2_review_gates: [majority.contract, { ...majority.contract }] }).reason,
  'review_journal_schema2_contract_invalid', 'duplicate schema-2 contracts are rejected before reduction');
  const overlap = { ...majority.contract, logical_gate_key: schema.canonicalLogicalGateIdentity({
    kind: 'fanout', id: 'other-reviews', origin: ['writer'], members: ['review-c', 'review-d'],
  }).key, members: ['review-c', 'review-d'] };
  equal(schema.validateReviewJournal(emptyJournal, emptyJournal.plan_hash,
    { schema2_review_gates: [majority.contract, overlap]
      .sort((a, b) => a.logical_gate_key.localeCompare(b.logical_gate_key)) }).reason,
  'review_journal_schema2_contract_invalid', 'overlapping schema-2 member ownership is rejected before reduction');
  equal(schema.validateReviewJournal(emptyJournal, emptyJournal.plan_hash,
    { schema2_review_gates: [{ ...majority.contract,
      members: majority.contract.members.slice().reverse() }] }).reason,
  'review_journal_schema2_contract_invalid', 'noncanonical schema-2 members are rejected');
  equal(schema.validateReviewJournal(emptyJournal, emptyJournal.plan_hash,
    { schema2_review_gates: [{ ...majority.contract, role: 'adversarial-verifier' }] }).reason,
  'review_journal_schema2_contract_invalid', 'schema-2 contract role mismatch is rejected');
  equal(schema.validateReviewJournal(emptyJournal, emptyJournal.plan_hash,
    { schema2_review_gates: [{ ...majority.contract, aggregation: 'sequence' }] }).reason,
  'review_journal_schema2_contract_invalid', 'schema-2 contract aggregation mismatch is rejected');
}

// The n2 transaction wrapper refuses substituted child paths and cannot call
// the n4 handoff without one durable, matching pre-freeze CAS receipt.
{
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-replan-handoff-')));
  try {
    const projectDir = path.join(root, 'issue-699');
    fs.mkdirSync(projectDir);
    const exactPath = path.join(projectDir, schema.REPLAN_PLAN_NEXT_NAME);
    const substitutePath = path.join(projectDir, 'substitute.md');
    fs.writeFileSync(exactPath, 'exact-child\n');
    fs.writeFileSync(substitutePath, 'substitute-child\n');
    const tuple = {
      candidate_digest: '1'.repeat(64),
      claim_root_base_digest: '2'.repeat(64),
      inherited_frontier_digest: '3'.repeat(64),
    };
    const transaction = {
      transaction_id: '4'.repeat(64),
      epoch_lineage_id: '5'.repeat(64),
      cas: { prepare: { seam: 'prepare', result: 'match', ...tuple },
        pre_freeze: { seam: 'pre_freeze', result: 'match', ...tuple } },
      parent: { plan_epoch: 1, plan_hash: '6'.repeat(64),
        claim_root_base_digest: tuple.claim_root_base_digest,
        claim_identity: { worktree_path: root } },
      planner: { dispatch_nonce: 'dispatch001' },
    };
    const substituted = replan.validateChildHandoffAuthority({ projectDir, childPath: substitutePath }, transaction);
    equal(substituted.reason, 'replan_child_path_invalid', 'absolute child path substitution is refused');
    equal(fs.readFileSync(exactPath, 'utf8'), 'exact-child\n', 'path substitution leaves the authority child untouched');
    equal(fs.readFileSync(substitutePath, 'utf8'), 'substitute-child\n', 'path substitution leaves the substituted path untouched');

    const missing = JSON.parse(JSON.stringify(transaction));
    missing.cas.pre_freeze = null;
    equal(replan.validateChildHandoffAuthority({ projectDir, childPath: exactPath }, missing).reason,
    'replan_pre_freeze_cas_missing', 'missing durable pre-freeze CAS refuses before delegation');
    const mismatched = JSON.parse(JSON.stringify(transaction));
    mismatched.cas.pre_freeze.candidate_digest = '7'.repeat(64);
    equal(replan.validateChildHandoffAuthority({ projectDir, childPath: exactPath }, mismatched).reason,
    'replan_pre_freeze_cas_mismatch', 'mismatched durable pre-freeze CAS refuses before delegation');
    equal(fs.readFileSync(exactPath, 'utf8'), 'exact-child\n', 'CAS authority refusals perform zero child writes');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

// A transaction is recovery authority only after its identity, lineage, CAS,
// and ordered activation prefix revalidate. Shallow fake committed JSON never
// opens the mutation fence beside stale state.
{
  const fake = {
    schema_version: 1, transaction_id: '1'.repeat(64), epoch_lineage_id: '2'.repeat(64),
    planner_attempt: 1, phase: 'committed', outcome: 'committed', transition_reason: 'review_repair_requires_replan',
    transition_cost: 1, parent: {}, source: {}, cas: {}, budget: {}, planner: {}, child: {}, snapshot: {},
    activation: Object.fromEntries(schema.REPLAN_ACTIVATION_STEPS.map(step => [step,
      { status: 'complete', digest: '3'.repeat(64), at: '2026-07-16T00:00:00.000Z' }])), attempts: [],
  };
  ok(!schema.validateReplanTransaction(fake).ok, 'shallow fake committed transaction is invalid');
  const fence = schema.readReplanFence('# stale parent state\nstatus: active\n', fake);
  ok(fence.fenced && !fence.ok, 'invalid committed transaction plus legacy state stays fenced');
}

// Claim/root lineage excludes plan/gate metadata and validates immutable Git objects.
{
  const fx = initFixture();
  try {
    const identity = schema.buildClaimIdentity({ repository_id: 'local:test', issue_numbers: [699, 699], primary_issue: 699,
      bundle_id: null, closure_policy: 'all_or_nothing', branch: 'workflow/issue-699', worktree_path: fx.root,
      claim_ts: '2026-07-16T00:00:00.000Z', session_marker: 'test-session' });
    deepEqual(identity.issue_numbers, [699], 'claim issue numbers are sorted and unique');
    const root = schema.buildClaimRootBase({ object_format: 'sha1', commit: fx.commit, tree: fx.tree, branch: 'workflow/issue-699' });
    const lineage = schema.buildEpochLineage(identity, root);
    ok(/^[0-9a-f]{64}$/.test(lineage.epoch_lineage_id), 'epoch lineage id is a canonical SHA-256');
    const altered = schema.buildEpochLineage(identity, root, { plan_hash: 'f'.repeat(64), logical_gate: 'ignored' });
    equal(altered.epoch_lineage_id, lineage.epoch_lineage_id, 'plan hash and logical gate are not lineage roots');
    const checked = replan.verifyClaimRootBase(fx.root, root);
    ok(checked.ok, 'persisted root commit/tree verifies against immutable Git objects');
    fs.writeFileSync(path.join(fx.root, 'later.txt'), 'later\n'); git(fx.root, ['add', 'later.txt']); git(fx.root, ['commit', '-m', 'advance']);
    ok(replan.verifyClaimRootBase(fx.root, root).ok, 'advancing mutable HEAD does not move the persisted claim root');
    const bad = replan.verifyClaimRootBase(fx.root, Object.assign({}, root, { tree: '0'.repeat(40) }));
    equal(bad.reason, 'claim_root_tree_mismatch', 'root-object drift fails closed');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Legacy import accepts one corroborated frontier root and rejects ambiguity.
{
  const fx = initFixture();
  try {
    const good = replan.deriveLegacyClaimRoot({ repoRoot: fx.root, branch: 'workflow/issue-699', barrier_open_commits: [fx.commit, fx.commit] });
    ok(good.ok && good.root.commit === fx.commit, 'legacy root derives from the common barrier-open commit');
    const later = git(fx.root, ['rev-parse', 'HEAD']);
    const bad = replan.deriveLegacyClaimRoot({ repoRoot: fx.root, branch: 'workflow/issue-699', barrier_open_commits: [fx.commit, later === fx.commit ? '0'.repeat(40) : later] });
    equal(bad.reason, 'legacy_claim_root_unprovable', 'ambiguous legacy roots fail closed');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// The live fixture is a byte-derived v1 shape, not a hard-coded runtime root oracle.
equal(liveFixture.source.parent_plan_hash, 'd2f4efb603e4952a861c2387d979a2df2d2f317de3e48d273a80aeba5ce40f05', 'fixture pins the verified live parent hash');
deepEqual(liveFixture.source.findings.map(f => f.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], 'fixture preserves all six typed findings');
deepEqual(liveFixture.source.rebind, [], 'fixture preserves the explicit empty rebind ledger');

// Optional local conformance proof: copy the immutable live evidence quartet,
// reconstruct the dirty live candidate in an isolated clone, then execute the
// complete legacy-root -> schema-2 transaction without touching the source.
{
  const externalRoot = path.resolve(__dirname, '..', '..', 'bundle-693-696-697-698');
  const externalProject = path.join(externalRoot, 'kaola-workflow', liveFixture.source.project);
  if (fs.existsSync(externalProject)) {
    const files = {
      parent_plan_file_sha256: path.join(externalProject, 'workflow-plan.md'),
      parent_state_file_sha256: path.join(externalProject, 'workflow-state.md'),
      review_journal_file_sha256: path.join(externalProject, '.cache', 'review-attempts.json'),
      review_evidence_file_sha256: path.join(externalProject, '.cache', 'n8-code-review.md'),
    };
    const before = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, {
      digest: sha256(fs.readFileSync(file)), mtimeMs: fs.statSync(file).mtimeMs,
    }]));
    for (const [key, proof] of Object.entries(before)) equal(proof.digest, liveFixture.source[key], 'live read-only ' + key + ' matches fixture');
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-live-conformance-'));
    try {
      for (const [key, file] of Object.entries(files)) fs.copyFileSync(file, path.join(scratch, key));
      const journal = JSON.parse(fs.readFileSync(path.join(scratch, 'review_journal_file_sha256'), 'utf8'));
      ok(schema.validateReviewJournal(journal, liveFixture.source.parent_plan_hash).ok, 'copied live v1 journal passes the structural validator');
      const attempt = journal.attempts.find(row => row.attempt_id === liveFixture.source.attempt_id);
      deepEqual(attempt.findings.map(finding => finding.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], 'copied live attempt preserves R1-R6');
      deepEqual(attempt.rebind, [], 'copied live attempt preserves empty rebind');

      const scratchRepo = path.join(scratch, 'repo');
      execFileSync('git', ['clone', '--quiet', '--no-hardlinks', '--branch', liveFixture.legacy_root_proof.branch,
        '--', externalRoot, scratchRepo], { env: gitEnv, stdio: ['ignore', 'ignore', 'pipe'] });
      // candidate_declared is the journal's exact path -> Git blob projection
      // at review time. Rehydrate those historical blobs from the source object
      // store instead of trusting the source worktree's later mutable bytes.
      for (const [rel, entry] of Object.entries(attempt.candidate_declared)) {
        const match = /^(100644|100755) ([0-9a-f]{40})$/.exec(entry);
        ok(match, 'copied live declared candidate entry has a regular-file Git identity: ' + rel);
        const sourceBytes = execFileSync('git', ['-C', externalRoot, 'cat-file', 'blob', match[2]], {
          env: gitEnv, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
        });
        const destination = path.join(scratchRepo, rel);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, sourceBytes);
        fs.chmodSync(destination, match[1] === '100755' ? 0o755 : 0o644);
      }
      const relocatedProject = path.join(scratchRepo, 'kaola-workflow', liveFixture.source.project);
      fs.cpSync(externalProject, relocatedProject, { recursive: true, preserveTimestamps: true });
      equal(replan.computeReviewCandidateDigest(scratchRepo, liveFixture.source.project),
        liveFixture.source.candidate_digest, 'journal-declared live blobs reconstruct the exact reviewed candidate digest');
      const relocatedStatePath = path.join(relocatedProject, 'workflow-state.md');
      const originalState = fs.readFileSync(relocatedStatePath, 'utf8');
      ok(originalState.includes(externalRoot), 'copied live state retains its exact source worktree binding before relocation');
      fs.writeFileSync(relocatedStatePath, originalState.replace(externalRoot, scratchRepo));
      const relocatedCache = path.join(relocatedProject, '.cache');
      const relocatedFields = replan.parseStateFields(fs.readFileSync(relocatedStatePath, 'utf8'));
      const relocatedIdentity = schema.buildClaimIdentity({
        schema_version: 2,
        repository_id: git(scratchRepo, ['remote', 'get-url', 'origin']),
        issue_numbers: relocatedFields.issue_numbers.split(','),
        primary_issue: Number(relocatedFields.issue_number),
        bundle_id: relocatedFields.bundle_id,
        closure_policy: relocatedFields.closure_policy,
        branch: relocatedFields.branch,
        worktree_path: fs.realpathSync(scratchRepo),
        claim_ts: relocatedFields.claim_ts,
        session_marker: relocatedFields.session_marker,
      });
      const relocatedRoot = schema.buildClaimRootBase({ schema_version: 2, ...liveFixture.legacy_root_proof });
      const relocatedLineage = schema.buildEpochLineage(relocatedIdentity, relocatedRoot);
      writeSchema2RepairSource({ projectDir: relocatedProject, cacheDir: relocatedCache }, journal, attempt, {
        producerSlice: liveFixture.source.producer_slice, lineage: relocatedLineage,
      });

      const livePrepared = replan.prepareReplan({ repoRoot: scratchRepo, project: liveFixture.source.project,
        sourceAttemptId: liveFixture.source.attempt_id, transitionReason: 'review_repair_requires_replan' });
      equal(livePrepared.result, 'prepared', 'copied live bundle derives a prepared transaction from its real root/frontier: ' + JSON.stringify(livePrepared));
      const liveTx = JSON.parse(fs.readFileSync(path.join(relocatedCache, 'replan-transaction.json'), 'utf8'));
      equal(liveTx.parent.claim_root_base.commit, liveFixture.legacy_root_proof.commit, 'copied live transaction preserves the barrier-derived root commit');
      equal(liveTx.parent.claim_root_base.tree, liveFixture.legacy_root_proof.tree, 'copied live transaction preserves the barrier-derived root tree');
      ok(/^[0-9a-f]{64}$/.test(liveTx.cas.prepare.candidate_digest)
        && /^[0-9a-f]{64}$/.test(liveTx.cas.prepare.inherited_frontier_digest), 'copied live candidate/frontier are freshly derived and digest-bound');
      equal(replan.resumeReplan({ repoRoot: scratchRepo, project: liveFixture.source.project }).reason,
        'replan_planner_dispatch_required', 'copied live transaction reaches the genuine planner boundary');
      const pendingLiveTx = JSON.parse(fs.readFileSync(path.join(relocatedCache, 'replan-transaction.json'), 'utf8'));
      writePlannerResult({ root: scratchRepo, project: liveFixture.source.project,
        projectDir: relocatedProject, cacheDir: relocatedCache }, pendingLiveTx);
      const liveCommitted = replan.resumeReplan({ repoRoot: scratchRepo, project: liveFixture.source.project });
      equal(liveCommitted.result, 'committed', 'copied live bundle completes all CAS, snapshot, and activation steps');
      const committedLiveTx = JSON.parse(fs.readFileSync(path.join(relocatedCache, 'replan-transaction.json'), 'utf8'));
      deepEqual(['prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation'].map(seam => committedLiveTx.cas[seam].result),
        ['match', 'match', 'match', 'match'], 'copied live bundle records all four matching CAS receipts');
      const liveSnapshots = replan.verifyAllEpochSnapshots(relocatedProject);
      ok(liveSnapshots.ok, 'copied live parent snapshot re-verifies against promoted state: ' + JSON.stringify(liveSnapshots));
      const stableLive = fs.readFileSync(path.join(relocatedCache, 'replan-transaction.json'), 'utf8');
      equal(replan.resumeReplan({ repoRoot: scratchRepo, project: liveFixture.source.project }).result,
        'already_committed', 'copied live second resume is idempotent');
      equal(fs.readFileSync(path.join(relocatedCache, 'replan-transaction.json'), 'utf8'), stableLive,
        'copied live second resume is transaction-byte-stable');
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
    for (const [key, file] of Object.entries(files)) {
      equal(sha256(fs.readFileSync(file)), before[key].digest, 'live source digest unchanged after conformance copy: ' + key);
      equal(fs.statSync(file).mtimeMs, before[key].mtimeMs, 'live source mtime unchanged after conformance copy: ' + key);
    }
  }
}

// End-to-end v1 -> schema-2 transaction: parent authority, genuine attestation, snapshot,
// deterministic mirror, exactly-once counters, and idempotent second resume.
{
  const fx = initFixture();
  try {
    const parentBytes = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'));
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project, sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'prepared', 'prepare creates the durable transaction');
    ok(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md')).equals(parentBytes), 'prepare leaves parent plan bytes authoritative');
    const pending = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(pending.reason, 'replan_planner_dispatch_required', 'prepared resume emits the one planner-dispatch refusal');
    const packetText = fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'), 'utf8');
    for (const forbidden of ['proposed_roles', 'node_ids', 'dependencies', 'write_sets', 'cardinality', 'shape', 'model']) {
      ok(!Object.prototype.hasOwnProperty.call(JSON.parse(packetText), forbidden), `planner packet carries no main-authored ${forbidden}`);
    }
    equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.next.md'), 'utf8'), '', 'planner output path is an empty harness seed before dispatch');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    writePlannerResult(fx, tx);
    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed', 'attested child activates through the transaction');
    const promoted = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    ok(promoted.includes('contract_version: 2'), 'promoted child is schema-2');
    const state = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(state.plan_epoch), 2, 'activation increments plan epoch exactly once');
    equal(Number(state.automatic_review_replans), 1, 'activation increments the review transition counter exactly once');
    equal(state.epoch_lineage_id, tx.epoch_lineage_id, 'lineage remains stable across activation');
    equal(state.replan_status, 'none', 'committed activation clears the fence last');
    const manifestPath = path.join(fx.cacheDir, 'epochs', '1', 'manifest.json');
    ok(fs.existsSync(manifestPath), 'canonical parent snapshot manifest exists');
    ok(replan.verifySnapshotManifest(path.dirname(manifestPath)).ok, 'snapshot recursively re-verifies');
    const snapJournal = JSON.parse(fs.readFileSync(path.join(path.dirname(manifestPath), 'files', '.cache', 'review-attempts.json'), 'utf8'));
    deepEqual(snapJournal.attempts[0].findings.map(finding => finding.id), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'], 'snapshot preserves the complete R1-R6 finding set');
    deepEqual(snapJournal.attempts[0].rebind, [], 'snapshot preserves the explicit empty rebind ledger');
    const mirror = JSON.parse(fs.readFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), 'utf8'));
    ok(mirror.tasks.every(task => task.ledger_status === 'pending'), 'child task mirror is generated from all-pending ledger rows');
    const before = [promoted, fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'), fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8')];
    const again = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(again.result, 'already_committed', 'second resume is an idempotent already_committed result');
    deepEqual([fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8'), fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'), fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8')], before, 'second resume is byte-stable');
    const finalTx = JSON.parse(before[2]);
    deepEqual(['prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation'].map(seam => finalTx.cas[seam].result),
      ['match', 'match', 'match', 'match'], 'all four durable CAS seams record matching tuples');
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-state.md'), Buffer.from(finalTx.parent.state_bytes_base64, 'base64'));
    const split = schema.readReplanFence(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'), finalTx);
    ok(split.fenced && split.reason === 'replan_integrity_mismatch', 'committed transaction plus stale parent state remains fenced');
    const repaired = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(repaired.result, 'committed', 'replan resume repairs the committed-state split brain');
    equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'), before[1], 'split-brain repair restores the exact recorded child state');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Schema-2 children bind the non-circular parent snapshot projection before
// freeze, while the later full manifest seals exact child and attestation
// bytes. Every substituted authority is rejected by recursive verification.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', 'schema-2 binding fixture commits');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    ok(/^[0-9a-f]{64}$/.test(tx.snapshot.authority_digest),
      'transaction persists the non-circular snapshot-authority digest');
    const promoted = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const promotedMeta = replan.validateChildPlan(Buffer.from(promoted), tx);
    ok(promotedMeta.ok && promoted.includes('parent_snapshot_manifest_digest: ' + tx.snapshot.authority_digest)
      && !promoted.includes('parent_snapshot_manifest_digest: pending'),
    'new child cites the exact authority projection and never commits pending');
    const epochDir = path.join(fx.cacheDir, 'epochs', '1');
    const verified = replan.verifySnapshotManifest(epochDir);
    ok(verified.ok && verified.binding_status === 'schema2_projection_bound',
      'schema-2 manifest recursively cross-binds projection, child, attestation, transaction, state, and live plan');
    equal(verified.manifest.schema_version, 2, 'new full snapshot seal uses schema 2');
    const resumeCheck = spawnSync(process.execPath, [path.join(__dirname, 'kaola-workflow-plan-validator.js'),
      path.join(fx.projectDir, 'workflow-plan.md'), '--resume-check', '--json'], {
      cwd: fx.root, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    });
    equal(resumeCheck.status, 0, 'projection-bound committed child passes focused --resume-check');
    const candidateHash = spawnSync(process.execPath, [path.join(__dirname, 'kaola-workflow-plan-validator.js'),
      path.join(fx.projectDir, 'workflow-plan.md'), '--candidate-hash', '--json'], {
      cwd: fx.root, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    });
    const candidatePayload = JSON.parse(String(candidateHash.stdout || '').trim());
    fs.writeFileSync(path.join(fx.cacheDir, 'final-validation.md'), [
      'verdict: pass', 'validated_candidate_hash: ' + candidatePayload.validated_candidate_hash, '',
    ].join('\n'));
    const finalizeCheck = spawnSync(process.execPath, [path.join(__dirname, 'kaola-workflow-plan-validator.js'),
      path.join(fx.projectDir, 'workflow-plan.md'), '--finalize-check', '--json', '--base', 'main'], {
      cwd: fx.root, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
    });
    equal(finalizeCheck.status, 0,
      'projection-bound committed child passes focused --finalize-check: ' + finalizeCheck.stdout + finalizeCheck.stderr);

    const baseCopy = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-binding-copy-'));
    try {
      fs.cpSync(fx.projectDir, path.join(baseCopy, fx.project), { recursive: true });
      const variants = {
        copied_child(projectDir) {
          fs.appendFileSync(path.join(projectDir, '.cache', 'epochs', '1', 'files', 'workflow-plan.next.md'), '\nsubstitute\n');
        },
        manifest_child(projectDir) {
          const manifestPath = path.join(projectDir, '.cache', 'epochs', '1', 'manifest.json');
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          manifest.child.digest = 'f'.repeat(64);
          manifest.manifest_self_digest = schema.snapshotManifestDigest(manifest);
          fs.writeFileSync(manifestPath, schema.canonicalJson(manifest) + '\n');
        },
        attestation(projectDir) {
          const attPath = path.join(projectDir, '.cache', 'epochs', '1', 'files', '.cache', 'replan-planner-attestation.json');
          const att = JSON.parse(fs.readFileSync(attPath, 'utf8'));
          att.child_digest = 'f'.repeat(64);
          delete att.attestation_digest;
          att.attestation_digest = schema.sha256Canonical(att);
          fs.writeFileSync(attPath, schema.canonicalJson(att) + '\n');
        },
        projection(projectDir) {
          const manifestPath = path.join(projectDir, '.cache', 'epochs', '1', 'manifest.json');
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          manifest.snapshot_authority_projection.entry_cas.candidate_digest = 'f'.repeat(64);
          manifest.snapshot_authority_digest = schema.sha256Canonical(manifest.snapshot_authority_projection);
          manifest.manifest_self_digest = schema.snapshotManifestDigest(manifest);
          fs.writeFileSync(manifestPath, schema.canonicalJson(manifest) + '\n');
        },
        parent_file(projectDir) {
          fs.appendFileSync(path.join(projectDir, '.cache', 'epochs', '1', 'files', 'workflow-plan.md'), '\nparent-substitute\n');
        },
        promoted_child(projectDir) {
          fs.appendFileSync(path.join(projectDir, 'workflow-plan.md'), '\nlive-substitute\n');
        },
      };
      for (const [name, mutate] of Object.entries(variants)) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-binding-variant-'));
        const projectDir = path.join(root, fx.project);
        fs.cpSync(path.join(baseCopy, fx.project), projectDir, { recursive: true });
        mutate(projectDir);
        const result = replan.verifySnapshotManifest(path.join(projectDir, '.cache', 'epochs', '1'));
        ok(!result.ok && /^snapshot_(?:authority|child|file|active|manifest)/.test(result.reason),
          'schema-2 ' + name + ' substitution fails recursive seal verification: ' + JSON.stringify(result));
        fs.rmSync(root, { recursive: true, force: true });
      }
    } finally { fs.rmSync(baseCopy, { recursive: true, force: true }); }
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Snapshot integrity is CONTENT-addressed: a sealed epoch that round-trips through a
// mode-lossy transport (git stores only 100644/100755, so the 0600 replan stages some
// staged files with comes back 0644) still verifies, while any content substitution —
// even one that preserves the exact byte length — still fails closed.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    // Production writes its exclusive authority files (replan-source.json, the committed
    // transaction receipts, the rotated sources) 0600; the fixture writes them 0644, so the
    // restrictive mode is reproduced here on a file the snapshot certainly carries.
    fs.chmodSync(path.join(fx.cacheDir, 'review-attempts.json'), 0o600);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', 'round-trip fixture commits');
    const epochDir = path.join(fx.cacheDir, 'epochs', '1');
    ok(replan.verifySnapshotManifest(epochDir).ok, 'the sealed epoch verifies before any round-trip');
    const manifest = JSON.parse(fs.readFileSync(path.join(epochDir, 'manifest.json'), 'utf8'));
    ok(manifest.files.some(file => file.mode !== '644'),
      'the fixture really does stage a file whose mode git cannot carry: '
      + JSON.stringify([...new Set(manifest.files.map(file => file.mode))]));
    ok(manifest.files.every(file => (parseInt(file.mode, 8) & 0o111) === 0),
      'no snapshot file is recorded executable — these are read-only evidence copies');
    // A git checkout / clone / fresh worktree materializes every non-executable blob 0644.
    for (const file of manifest.files) {
      fs.chmodSync(path.join(epochDir, 'files', ...file.path.split('/')), 0o644);
    }
    const roundTripped = replan.verifySnapshotManifest(epochDir);
    ok(roundTripped.ok && roundTripped.binding_status === 'schema2_projection_bound',
      'a git-round-tripped epoch snapshot still verifies: ' + JSON.stringify(roundTripped));
    // The load-bearing check is untouched: a length-preserving content edit still refuses,
    // so the size column alone cannot be what catches it.
    const tamperRel = 'workflow-plan.md';
    const tamperAbs = path.join(epochDir, 'files', tamperRel);
    const original = fs.readFileSync(tamperAbs);
    const mutated = Buffer.from(original);
    mutated[mutated.length - 2] = mutated[mutated.length - 2] === 0x41 ? 0x42 : 0x41;
    fs.writeFileSync(tamperAbs, mutated);
    equal(mutated.length, original.length, 'the content mutation preserves the recorded size exactly');
    const tampered = replan.verifySnapshotManifest(epochDir);
    ok(!tampered.ok && tampered.reason === 'snapshot_file_digest_mismatch' && tampered.path === tamperRel,
      'a same-size content substitution in a round-tripped snapshot still fails closed: '
      + JSON.stringify(tampered));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// A child changed after freeze is not replaced from transaction memory and an
// arbitrary correct-width projection digest cannot advance to snapshot.
for (const variant of ['pending', 'arbitrary', 'live-substitution']) {
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    const txPath = path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME);
    if (variant === 'live-substitution') {
      try {
        replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
          failpoint(name) { if (name === 'after_state_child_frozen_fence') throw new Error('stop-after-child-frozen'); } });
      } catch (_) {}
      fs.appendFileSync(path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME), '\nsubstitute\n');
    } else {
      const tx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
      let child = childFor(tx, fx.project).text;
      child = child.replace(/^parent_snapshot_manifest_digest:.*$/m,
        'parent_snapshot_manifest_digest: ' + (variant === 'pending' ? 'pending' : 'f'.repeat(64)));
      child = rehashPlan(child).text;
      fs.writeFileSync(path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME), child);
      writePlannerAttestationForExistingChild(fx, tx);
    }
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    ok(result.result === 'refuse' && ['replan_child_binding_invalid', 'replan_child_integrity_failure'].includes(result.reason),
      variant + ' child refuses before snapshot/activation: ' + JSON.stringify(result));
    equal(authorityCardinalities(fx).snapshots, 0, variant + ' child creates no epoch snapshot');
    equal(authorityCardinalities(fx).epoch, 1, variant + ' child advances no epoch');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// The already-frozen schema-1 self-host transition is admitted only through
// its exact committed receipt after successor rotation. Removing any one seal
// turns `pending` into a typed refusal; the issue number is never authority.
{
  const liveProject = path.resolve(__dirname, '..', 'kaola-workflow', 'issue-699');
  if (fs.existsSync(path.join(liveProject, '.cache', 'epochs', '1', 'manifest.json'))) {
    equal(schema.REPLAN_TRANSACTION_SCHEMA_VERSION, liveFixture.versioned_epoch_history.writer_schema_version,
      'conformance fixture pins the new transaction writer version');
    const current = replan.verifySnapshotManifest(path.join(liveProject, '.cache', 'epochs', '1'));
    ok(current.ok && current.binding_status === liveFixture.versioned_epoch_history.snapshot_bindings['1'],
      'current schema-1 self-host snapshot verifies through its preserved committed receipt: ' + JSON.stringify(current));
    const receipt = liveFixture.versioned_epoch_history.legacy_committed_receipt;
    const receiptBytes = fs.readFileSync(path.join(liveProject, ...receipt.path.split('/')));
    ok(receiptBytes.length === receipt.size && sha256(receiptBytes) === receipt.digest,
      'live preserved v1 transaction receipt matches the conformance fixture exactly');
    const projected = replan.verifySnapshotManifest(path.join(liveProject, '.cache', 'epochs', '2'));
    ok(projected.ok && projected.binding_status === liveFixture.versioned_epoch_history.snapshot_bindings['2'],
      'live epoch-2 projection remains recursively valid after legacy receipt rotation');
    const liveSnapshots = replan.verifyAllEpochSnapshots(liveProject);
    ok(liveSnapshots.ok && liveSnapshots.snapshots.length >= liveFixture.versioned_epoch_history.minimum_snapshot_count,
      'live self-host chain verifies all required versioned snapshots together');
    const planning = replan.verifyActivePlanningEvidence(liveProject);
    ok(planning.ok || /^state_(?:compliance|task|ledger|planning)/.test(planning.reason),
      'live mutable progress is judged independently from immutable snapshot history: ' + JSON.stringify(planning));
    const variants = {
      manifest_self(projectDir) {
        const file = path.join(projectDir, '.cache', 'epochs', '1', 'manifest.json');
        const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.manifest_self_digest = 'f'.repeat(64);
        fs.writeFileSync(file, schema.canonicalJson(value) + '\n');
      },
      copied_child(projectDir) { fs.appendFileSync(path.join(projectDir, '.cache', 'epochs', '1', 'files', 'workflow-plan.next.md'), '\n'); },
      manifest_child(projectDir) {
        const file = path.join(projectDir, '.cache', 'epochs', '1', 'manifest.json');
        const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.child.digest = 'f'.repeat(64);
        value.manifest_self_digest = schema.snapshotManifestDigest(value);
        fs.writeFileSync(file, schema.canonicalJson(value) + '\n');
      },
      transaction_child(projectDir) {
        const manifest = JSON.parse(fs.readFileSync(path.join(projectDir, '.cache', 'epochs', '1', 'manifest.json')));
        const file = path.join(projectDir, '.cache', 'committed-transactions', manifest.transaction_id + '.json');
        const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.child.digest = 'f'.repeat(64);
        fs.writeFileSync(file, schema.canonicalJson(value) + '\n');
      },
      attestation(projectDir) {
        const file = path.join(projectDir, '.cache', 'epochs', '1', 'files', '.cache',
          schema.REPLAN_PLANNER_ATTESTATION_NAME);
        const value = JSON.parse(fs.readFileSync(file, 'utf8')); value.child_digest = 'f'.repeat(64);
        delete value.attestation_digest; value.attestation_digest = schema.sha256Canonical(value);
        fs.writeFileSync(file, schema.canonicalJson(value) + '\n');
      },
    };
    for (const [name, mutate] of Object.entries(variants)) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-legacy-seal-'));
      const projectDir = path.join(root, 'legacy-project');
      fs.cpSync(liveProject, projectDir, { recursive: true });
      mutate(projectDir);
      const result = replan.verifySnapshotManifest(path.join(projectDir, '.cache', 'epochs', '1'));
      equal(result.reason, 'legacy_snapshot_binding_unsealed',
        'legacy pending child refuses when ' + name + ' external seal is removed');
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

// Two successive review-driven transitions rotate only a fully committed
// predecessor, preserve prior snapshot authority while fenced, and the third
// transition consent-halts at claim-lineage scope.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', 'multi-epoch fixture commits the first transition');
    const firstTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    equal(firstTx.schema_version, 2, 'the first newly authored transaction uses schema 2');
    const firstState = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(firstState.first_node_id, firstTx.child.first_node_id,
      'promoted Planning Evidence publishes the actual child first node');
    equal(firstState.first_node_role, firstTx.child.first_node_role,
      'promoted Planning Evidence publishes the actual child first role');
    const firstSnapshot = firstState.active_snapshot_manifest_digest;
    installCurrentReviewSource(fx, 'child-review:2');
    ok(replan.verifyCurrentEpochAuthority(fx.projectDir).ok,
      'the activated child advances through legal ledger, compliance, task-mirror, and state authority');
    const secondPrepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: 'child-review:2', transitionReason: 'review_repair_requires_replan' });
    equal(secondPrepared.result, 'prepared', 'a new lineage-unique source rotates the committed predecessor transaction: '
      + JSON.stringify(secondPrepared));
    const secondTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    equal(secondTx.schema_version, 2, 'the successor transaction remains schema 2');
    equal(secondTx.predecessor.transaction_id, firstTx.transaction_id,
      'successor cites the exact committed predecessor transaction');
    const predecessorBytes = fs.readFileSync(path.join(fx.projectDir, ...secondTx.predecessor.path.split('/')));
    equal(sha256(predecessorBytes), secondTx.predecessor.digest,
      'predecessor history path re-reads at the cited exact digest');
    const rotatedSourceBytes = fs.readFileSync(path.join(fx.projectDir, ...secondTx.source.rotated_from.path.split('/')));
    equal(sha256(rotatedSourceBytes), secondTx.source.rotated_from.digest,
      'settled predecessor source rotates to a digest-addressed exact receipt');
    const secondFenced = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(secondFenced.active_snapshot_manifest_digest, firstSnapshot,
      'second-transition fence preserves the active parent snapshot pointer');
    equal(Number(secondFenced.plan_epoch), 2, 'second-transition prepare leaves the parent epoch authoritative');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_planner_dispatch_required', 'second transition reaches a fresh planner handoff');
    writePlannerResult(fx, secondTx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', 'second allowed automatic transition commits');
    const secondState = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(secondState.plan_epoch), 3, 'two commits advance the plan epoch exactly twice');
    equal(Number(secondState.automatic_review_replans), 2, 'two commits consume exactly the claim-level automatic budget');
    const snapshots = replan.verifyAllEpochSnapshots(fx.projectDir);
    ok(snapshots.ok && snapshots.snapshots.length === 2,
      'both immutable parent epoch snapshots re-verify: ' + JSON.stringify(snapshots));
    for (const [name, file, mutate] of [
      ['predecessor transaction history', path.join(fx.projectDir, ...secondTx.predecessor.path.split('/')),
        bytes => Buffer.concat([bytes, Buffer.from('\n')])],
      ['rotated source history', path.join(fx.projectDir, ...secondTx.source.rotated_from.path.split('/')),
        bytes => Buffer.concat([bytes, Buffer.from('\n')])],
    ]) {
      const original = fs.readFileSync(file);
      fs.writeFileSync(file, mutate(original));
      ok(!replan.verifyAllEpochSnapshots(fx.projectDir).ok,
        name + ' tamper independently refuses the recursive epoch chain');
      fs.writeFileSync(file, original);
      ok(replan.verifyAllEpochSnapshots(fx.projectDir).ok, name + ' exact-byte restore re-verifies');
    }
    const activeStatePath = path.join(fx.projectDir, 'workflow-state.md');
    const activePlanPath = path.join(fx.projectDir, 'workflow-plan.md');
    const activeTxPath = path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME);
    // No `workflow-tasks.json` row: the mirror is a pure projection of this plan with no
    // consumer that reads its content for a decision, so "tampering" it only makes a
    // regenerable file stale. Its authority tier is pinned at the bottom of this file
    // instead — a settlement-folded ledger with a lagging mirror KEEPS authority.
    for (const [name, file, mutate, reason] of [
      ['final state receipt', activeStatePath,
        text => text.replace(/^automatic_review_replans: 2$/m, 'automatic_review_replans: 1'),
        'state_epoch_receipt_mismatch'],
      ['authored Meta', activePlanPath,
        text => text.replace(/^labels: (.*)$/m, 'labels: $1,tampered'), 'state_active_plan_invalid'],
      ['authored Nodes', activePlanPath,
        text => text.replace('| child-impl | tdd-guide |', '| child-impl | implementer |'), 'state_active_plan_invalid'],
      ['child first node receipt', activeTxPath,
        text => { const tx = JSON.parse(text); tx.child.first_node_id = 'forged-first';
          return schema.canonicalJson(tx) + '\n'; }, 'state_epoch_receipt_mismatch'],
    ]) {
      const original = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, mutate(original));
      equal(replan.verifyCurrentEpochAuthority(fx.projectDir).reason, reason,
        name + ' tamper has an independent typed current-authority refusal');
      fs.writeFileSync(file, original);
      ok(replan.verifyCurrentEpochAuthority(fx.projectDir).ok, name + ' exact restore re-verifies current authority');
    }
    installCurrentReviewSource(fx, 'child-review:3');
    const beforeHalt = exactAuthorityBytes(fx);
    const halted = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: 'child-review:3', transitionReason: 'review_repair_requires_replan' });
    equal(halted.reason, 'replan_consent_required', 'third automatic review transition requires explicit consent prospectively');
    deepEqual(exactAuthorityBytes(fx), beforeHalt,
      'third-transition consent refusal has zero plan/state/task/source/transaction/snapshot/history side effects');
    const haltedState = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(haltedState.plan_epoch), 3, 'consent halt advances no epoch');
    equal(Number(haltedState.automatic_review_replans), 2, 'consent halt consumes no counter slot');
    equal(haltedState.active_snapshot_manifest_digest, secondState.active_snapshot_manifest_digest,
      'consent-halt fence preserves the active epoch-2 snapshot pointer');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// A crash after either exclusive history write leaves the committed predecessor
// active; retry reuses the exact receipt and installs one v2 successor.
for (const target of ['after_predecessor_history', 'after_source_history']) {
  const fx = initFixture();
  try {
    driveReplanToCommit(fx);
    const predecessor = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    installCurrentReviewSource(fx, 'child-review:2');
    let crashed = null;
    try {
      replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
        sourceAttemptId: 'child-review:2', transitionReason: 'review_repair_requires_replan',
        failpoint(name) { if (name === target) throw new Error('history-crash:' + target); },
      });
    } catch (error) { crashed = error.message; }
    equal(crashed, 'history-crash:' + target, target + ' exposes its durable crash prefix');
    equal(JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8')).transaction_id,
      predecessor.transaction_id, target + ' crash leaves the committed predecessor active');
    const historyDir = path.join(fx.cacheDir,
      target === 'after_predecessor_history' ? 'committed-transactions' : 'replan-sources');
    const historyFile = path.join(historyDir, fs.readdirSync(historyDir)[0]);
    const historyBytes = fs.readFileSync(historyFile);
    fs.appendFileSync(historyFile, '\n');
    const collision = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: 'child-review:2', transitionReason: 'review_repair_requires_replan' });
    equal(collision.reason, 'replan_history_receipt_collision',
      target + ' retry refuses a conflicting pre-existing receipt');
    fs.writeFileSync(historyFile, historyBytes);
    const retried = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: 'child-review:2', transitionReason: 'review_repair_requires_replan' });
    equal(retried.result, 'prepared', target + ' retry installs the successor after exact receipt reuse');
    const successor = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(successor.predecessor.transaction_id, predecessor.transaction_id,
      target + ' successor cites the unchanged predecessor receipt');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #732: a sanctioned scratch reset removes the live `.cache/replan-transaction.json`
// (plus the planner packet/attestation) but never the durable
// `.cache/committed-transactions/` receipts. Before the recovery path existed, the
// re-prepare read the predecessor ONLY from the live transaction file, so it
// returned `prepared` while authoring a `predecessor: null` (and
// `source.rotated_from: null`) epoch >= 3 successor under the SAME transaction id —
// a false success that silently overwrote the durable record and wedged the next
// read on `replan_transaction_predecessor_invalid`.
{
  const scratchReset = () => {
    const fx = initFixture();
    driveReplanToCommit(fx);
    const firstTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    installCurrentReviewSource(fx, 'child-review:2');
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: 'child-review:2', transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'prepared', 'scratch-reset fixture prepares the epoch-2 successor');
    for (const name of [schema.REPLAN_TRANSACTION_NAME, schema.REPLAN_PLANNER_ATTESTATION_NAME,
      schema.REPLAN_PLANNER_PACKET_NAME]) {
      const file = path.join(fx.cacheDir, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    return { fx, firstTx, prepare: () => replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: 'child-review:2', transitionReason: 'review_repair_requires_replan' }) };
  };

  // (a) EXACTLY ONE identity-matching committed receipt recovers the predecessor.
  {
    const { fx, firstTx, prepare } = scratchReset();
    try {
      const again = prepare();
      equal(again.result, 'prepared', 're-prepare after a scratch reset prepares: ' + JSON.stringify(again));
      const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
      ok(tx.predecessor, 're-prepare recovers a committed predecessor from the durable receipts');
      equal(tx.predecessor.transaction_id, firstTx.transaction_id,
        're-prepare cites the exact committed predecessor transaction');
      ok(tx.source.rotated_from, 're-prepare recovers the archived source receipt');
      equal(tx.source.rotated_from.transaction_id, firstTx.transaction_id,
        're-prepare cites the predecessor as the rotated source origin');
      ok(schema.validateReplanTransaction(tx).ok,
        'the recovered successor is a valid schema-2 transaction: '
        + JSON.stringify(schema.validateReplanTransaction(tx).reason));
      equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
        'replan_planner_dispatch_required', 'the recovered successor resumes instead of wedging');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // (b) ZERO identity-matching receipts fail closed with no transaction written.
  {
    const { fx, firstTx, prepare } = scratchReset();
    try {
      fs.unlinkSync(path.join(fx.cacheDir, 'committed-transactions', firstTx.transaction_id + '.json'));
      const again = prepare();
      equal(again.reason, 'replan_committed_predecessor_unresolved',
        'an unrecoverable predecessor refuses instead of authoring a null-predecessor successor');
      equal(again.detail, 'no_committed_predecessor', 'the zero-match refusal is typed by detail');
      equal(again.matched, 0, 'the zero-match refusal reports its candidate cardinality');
      ok(!fs.existsSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME)),
        'the zero-match refusal writes no transaction');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }

  // (c) MULTIPLE identity-matching receipts fail closed rather than guessing.
  {
    const { fx, firstTx, prepare } = scratchReset();
    try {
      const historyDir = path.join(fx.cacheDir, 'committed-transactions');
      const twin = JSON.parse(fs.readFileSync(path.join(historyDir, firstTx.transaction_id + '.json'), 'utf8'));
      // A twin is only probative if it is FULLY schema-valid, so every id-bound
      // field is recomputed from the new identity preimage.
      twin.source.source_attempt_ids = ['child-review:twin'];
      twin.transaction_id = schema.sha256Canonical({
        schema_version: twin.schema_version,
        epoch_lineage_id: twin.epoch_lineage_id,
        parent_plan_epoch: twin.parent.plan_epoch,
        parent_plan_hash: twin.parent.plan_hash,
        source_reason: twin.source.source_reason,
        source_attempt_ids: twin.source.source_attempt_ids.slice().sort(),
        prepare_candidate_digest: twin.cas.prepare.candidate_digest,
        prepare_inherited_frontier_digest: twin.cas.prepare.inherited_frontier_digest,
      });
      twin.planner.dispatch_nonce = schema.sha256Canonical({
        transaction_id: twin.transaction_id, role: 'workflow-planner',
        planner_attempt: twin.planner_attempt,
      }).slice(0, 12);
      twin.snapshot.authority_projection.transaction_id = twin.transaction_id;
      twin.snapshot.authority_digest = schema.sha256Canonical(twin.snapshot.authority_projection);
      const twinCheck = schema.validateReplanTransaction(twin);
      ok(twinCheck.ok, 'the ambiguity fixture is itself a fully valid committed transaction: '
        + JSON.stringify(twinCheck.reason));
      ok(twin.transaction_id !== firstTx.transaction_id, 'the ambiguity fixture has a distinct identity');
      fs.writeFileSync(path.join(historyDir, twin.transaction_id + '.json'),
        schema.canonicalJson(twin) + '\n');
      const again = prepare();
      equal(again.reason, 'replan_committed_predecessor_unresolved',
        'two identity-matching committed receipts refuse instead of picking one');
      equal(again.detail, 'ambiguous_committed_predecessor', 'the many-match refusal is typed by detail');
      equal(again.matched, 2, 'the many-match refusal reports its candidate cardinality');
      ok(!fs.existsSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME)),
        'the many-match refusal writes no transaction');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

// CAS mismatch before freeze advances no epoch/counter and preserves the parent.
{
  const fx = initFixture();
  try {
    const parent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'));
    replan.prepareReplan({ repoRoot: fx.root, project: fx.project, sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    writePlannerResult(fx, tx);
    fs.writeFileSync(path.join(fx.root, 'product.js'), 'module.exports = 3;\n');
    const changed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(changed.reason, 'replan_candidate_changed', 'pre-freeze candidate mismatch is typed');
    ok(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md')).equals(parent), 'candidate mismatch preserves parent bytes');
    const state = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(state.automatic_review_replans || 0), 0, 'failed CAS costs zero transitions');
    const oldTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    const staleChildDigest = sha256(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.next.md')));
    const reauthored = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(reauthored.result, 'reauthored', 'candidate mismatch derives a fresh planner transaction instead of dead-ending');
    ok(reauthored.transaction_id !== oldTx.transaction_id, 'new candidate tuple derives a new transaction id');
    equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.next.md'), 'utf8'), '', 'stale child is quarantined into the transaction and output seed is reset');
    const nextTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    equal(nextTx.attempts.length, 1, 'candidate-changed attempt receipt remains append-only in the replacement transaction');
    equal(nextTx.attempts[0].child.digest, staleChildDigest, 'stale child digest is retained in the failed-attempt receipt');
    const pending = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(pending.reason, 'replan_planner_dispatch_required', 'replacement transaction reaches a fresh planner handoff');
    const refreshedTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    writePlannerResult(fx, refreshedTx);
    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed', 'reauthored candidate can commit normally');
    const finalState = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(finalState.automatic_review_replans), 1, 'only the committed replacement costs one transition');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Four independent CAS seams × candidate/root/frontier axes. The mismatch
// receipt is the only durable effect: no epoch/count/dispatch/snapshot/task or
// activation side effect is permitted at any cell in the matrix.
for (const seam of ['prepare', 'pre_freeze', 'pre_snapshot', 'pre_activation']) {
  for (const axis of ['candidate_digest', 'claim_root_base_digest', 'inherited_frontier_digest']) {
    const fx = initFixture();
    try {
      const common = { repoRoot: fx.root, project: fx.project };
      try {
        replan.prepareReplan({ ...common, sourceAttemptId: fx.sourceAttemptId,
          transitionReason: 'review_repair_requires_replan',
          failpoint(name) { if (seam === 'prepare' && name === 'after_state_prepared_fence') throw new Error('stage-prepare'); } });
      } catch (_) {}
      if (seam !== 'prepare') {
        replan.resumeReplan(common);
        const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
        writePlannerResult(fx, tx);
      }
      if (seam === 'pre_snapshot') {
        try {
          replan.resumeReplan({ ...common,
            failpoint(name) { if (name === 'after_state_child_frozen_fence') throw new Error('stage-pre-snapshot'); } });
        } catch (_) {}
      }
      if (seam === 'pre_activation') {
        try {
          replan.resumeReplan({ ...common,
            failpoint(name) { if (name === 'after_state_parent_archived_fence') throw new Error('stage-pre-activation'); } });
        } catch (_) {}
      }
      const planBefore = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
      const tasksBefore = fs.readFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), 'utf8');
      const countsBefore = authorityCardinalities(fx);
      const result = replan.resumeReplan({ ...common,
        casMutation: { seam, axis, value: 'f'.repeat(64) } });
      equal(result.reason, 'replan_candidate_changed', seam + '/' + axis + ' mismatch is typed');
      equal(result.seam, seam, seam + '/' + axis + ' identifies the exact CAS seam');
      equal(result.axis, axis, seam + '/' + axis + ' identifies the exact observation axis');
      ok(result.expected !== result.actual, seam + '/' + axis + ' returns distinct expected/actual scalar values');
      equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8'), planBefore,
        seam + '/' + axis + ' preserves parent plan bytes');
      equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), 'utf8'), tasksBefore,
        seam + '/' + axis + ' preserves parent task-mirror bytes');
      deepEqual(authorityCardinalities(fx), countsBefore,
        seam + '/' + axis + ' adds no epoch/count/dispatch/snapshot/Case-B effect');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

// Child freeze is delegated only after the matching CAS receipt is durable.
// A crash in the narrow handoff-to-journal gap reuses the same child identity.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    let firstCrash = null;
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_child_frozen_bytes') throw new Error('stop_after_handoff_freeze'); } });
    } catch (error) { firstCrash = error.message; }
    equal(firstCrash, 'stop_after_handoff_freeze', 'handoff freeze crash seam fires before child_frozen journaling');
    const childPath = path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME);
    const frozenDigest = sha256(fs.readFileSync(childPath));
    const frozenPlanHash = validator.readStoredHash(fs.readFileSync(childPath, 'utf8'));
    const pendingTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(pendingTx.phase, 'planner_pending', 'crash before child journal leaves planner_pending authoritative');
    equal(pendingTx.cas.pre_freeze.result, 'match', 'matching pre-freeze CAS is durable before handoff freeze');

    let journalCrash = null;
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_state_child_frozen_fence') throw new Error('stop_after_child_journal'); } });
    } catch (error) { journalCrash = error.message; }
    equal(journalCrash, 'stop_after_child_journal', 'handoff replay journals child_frozen exactly once');
    const frozenTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(frozenTx.phase, 'child_frozen', 'replay advances the durable child phase');
    equal(frozenTx.child.digest, frozenDigest, 'replay journals the same frozen child digest');
    equal(frozenTx.child.plan_hash, frozenPlanHash, 'replay journals the same frozen child plan hash');
    equal(sha256(fs.readFileSync(childPath)), frozenDigest, 'handoff replay never rewrites child identity');

    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed', 'crash-idempotent child handoff rolls forward to commit');
    equal(committed.plan_hash, frozenPlanHash, 'commit returns the handoff child identity');
    const replay = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(replay.result, 'already_committed', 'committed handoff replay is idempotent');
    equal(replay.plan_hash, frozenPlanHash, 'committed replay returns the same child identity');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Candidate reauthoring itself is a crash-resumable durable prefix. A crash
// after the replacement transaction, stale-child quarantine, or fence rebound
// must converge to the same fresh planner handoff without charging an epoch.
for (const target of [
  'after_tx_reauthored',
  'after_child_reauthor_seeded',
  'after_state_reauthor_fence',
]) {
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    fs.writeFileSync(path.join(fx.root, 'product.js'), 'module.exports = 3;\n');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_candidate_changed', target + ' fixture records the failed CAS');
    let crash = null;
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === target) throw new Error('simulated_reauthor_crash:' + target); } });
    } catch (error) { crash = error.message; }
    equal(crash, 'simulated_reauthor_crash:' + target, target + ' fires after its durable write');
    const durable = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    equal(durable.attempts.length, 1, target + ' replacement retains one failed-attempt receipt');
    ok(schema.validateReplanTransaction(durable).ok, target + ' replacement transaction strictly revalidates');
    const recovered = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(recovered.reason, 'replan_planner_dispatch_required', target + ' rolls forward to the fresh planner handoff');
    equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.next.md'), 'utf8'), '', target + ' leaves an exact empty planner seed');
    const beforeCommit = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(beforeCommit.plan_epoch), 1, target + ' recovery advances no epoch before commit');
    equal(Number(beforeCommit.automatic_review_replans), 0, target + ' recovery charges no failed transition');
    const refreshed = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    writePlannerResult(fx, refreshed);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', target + ' recovered replacement commits once');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'already_committed', target + ' second resume is idempotent');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// If a candidate oscillates back to an earlier tuple, the architecture's
// tuple-derived transaction id repeats by design. Planner attempt identity and
// dispatch nonce must still be fresh so an old dispatch cannot replay.
{
  const fx = initFixture();
  try {
    const initial = advanceToAttestedChild(fx);
    fs.writeFileSync(path.join(fx.root, 'product.js'), 'module.exports = 3;\n');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_candidate_changed', 'oscillation fixture records candidate B');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'reauthored', 'oscillation fixture authors candidate-B transaction');
    fs.writeFileSync(path.join(fx.root, 'product.js'), 'module.exports = 2;\n');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_candidate_changed', 'oscillation back to candidate A records a second failed attempt');
    const oscillated = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(oscillated.result, 'reauthored', 'oscillation authors a fresh planner attempt for candidate A: ' + JSON.stringify(oscillated));
    const cycled = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    equal(cycled.transaction_id, initial.transaction_id, 'returning to the same CAS tuple returns the deterministic transaction id');
    equal(cycled.planner_attempt, 3, 'candidate oscillation advances the append-only planner attempt number');
    ok(cycled.planner.dispatch_nonce !== initial.planner.dispatch_nonce,
      'candidate oscillation derives a fresh dispatch nonce despite the repeated transaction id');
    ok(schema.validateReplanTransaction(cycled).ok, 'cycled transaction and both failed-attempt receipts strictly validate');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Every durable activation/cleanup prefix rolls forward exactly once. In
// particular, once the child plan is visible no recovery path may restore or
// revalidate the parent as the active plan.
const REQUIRED_DURABLE_LABELS = [
  'after_tx_prepared', 'after_state_prepared_fence', 'after_packet_written', 'after_child_seeded',
  'after_tx_planner_pending', 'after_state_planner_pending_fence', 'after_tx_pre_freeze_cas',
  'after_child_frozen_bytes', 'after_tx_child_frozen', 'after_state_child_frozen_fence',
  'after_tx_pre_snapshot_cas', 'after_snapshot_stage_created', 'after_snapshot_stage_file',
  'after_snapshot_manifest_written', 'after_snapshot_epoch_renamed', 'after_tx_parent_archived',
  'after_state_parent_archived_fence', 'after_tx_pre_activation_cas', 'after_plan_child_promoted',
  'after_tx_child_plan_promoted', 'after_state_child_promoted_fenced',
  'after_tx_child_state_promoted_fenced', 'after_tasks_child_promoted', 'after_tx_task_mirror_promoted',
  'after_tx_cleanup_intent', 'after_cache_unlinked', 'after_tx_active_cache_cleaned', 'after_tx_committed',
  'after_state_unfenced', 'after_tx_state_unfenced', 'after_tx_candidate_changed',
  'after_state_candidate_changed', 'after_tx_reauthored', 'after_child_reauthor_seeded',
  'after_state_reauthor_fence', 'after_consent_ledger', 'after_state_consent_ceiling',
  'after_tx_consent_resumed', 'after_tx_failure_snapshot', 'after_tx_failure_task_mirror',
  'after_tx_failure_cleanup', 'after_predecessor_history', 'after_source_history',
];
deepEqual(schema.REPLAN_DURABLE_WRITE_LABELS, REQUIRED_DURABLE_LABELS,
  'central durable-write inventory is exact and ordered');
deepEqual(schema.REPLAN_DURABLE_WRITE_LABELS_DYNAMIC, {
  after_snapshot_stage_file: 'after_snapshot_stage_file:<sorted-ordinal>:<path-digest>',
  after_tx_cleanup_intent: 'after_tx_cleanup_intent:<sorted-ordinal>:<path-digest>',
  after_cache_unlinked: 'after_cache_unlinked:<sorted-ordinal>:<path-digest>',
  after_tx_candidate_changed: 'after_tx_candidate_changed:<cas-seam>',
  after_state_candidate_changed: 'after_state_candidate_changed:<cas-seam>',
}, 'dynamic durable-write labels have deterministic ordinal/path or seam suffixes');
const persistenceSource = fs.readFileSync(path.join(__dirname, 'kaola-workflow-replan.js'), 'utf8');
deepEqual([...persistenceSource.matchAll(/(?:schema\.writeFileAtomicReplace|fs\.renameSync|fs\.unlinkSync|fs\.writeFileSync)/g)]
  .map(match => match[0]), [
    'schema.writeFileAtomicReplace', 'fs.renameSync', 'fs.unlinkSync',
    'fs.writeFileSync', 'fs.writeFileSync',
  ], 'static persistence inventory exposes no unclassified file replacement, rename, unlink, snapshot copy, or manifest write');
ok(persistenceSource.includes("fireFailpoint(opts, deterministicPathLabel('after_snapshot_stage_file'")
  && persistenceSource.includes("fireFailpoint(opts, 'after_snapshot_manifest_written')"),
'the two intentional raw snapshot writers terminate in deterministic durable failpoints');

// Discover every concrete main-path label (including every staged file and
// cleanup ordinal), then crash once at each write, resume once to the exact
// uninterrupted bytes, and require a byte-stable `already_committed` replay.
{
  const discovery = initFixture();
  const trace = [];
  try { driveReplanToCommit(discovery, { failpoint: name => trace.push(name) }); }
  finally { fs.rmSync(discovery.root, { recursive: true, force: true }); }
  const uniqueTrace = [...new Set(trace)];
  for (const required of REQUIRED_DURABLE_LABELS.slice(0, 30)) {
    if (['after_snapshot_stage_file', 'after_tx_cleanup_intent', 'after_cache_unlinked'].includes(required)) {
      ok(uniqueTrace.some(name => name.startsWith(required + ':')), 'main control executes dynamic label ' + required);
    } else {
      ok(uniqueTrace.includes(required), 'main control executes durable label ' + required);
    }
  }
  const prefixTargets = process.env.KW_REPLAN_PREFIX_TARGET
    ? uniqueTrace.filter(target => target === process.env.KW_REPLAN_PREFIX_TARGET) : uniqueTrace;
  for (const target of prefixTargets) {
    const fx = initFixture();
    const backup = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-prefix-backup-'));
    const seed = path.join(backup, 'seed');
    try {
      fs.cpSync(fx.root, seed, { recursive: true });
      driveReplanToCommit(fx);
      const control = exactAuthorityBytes(fx);
      fs.rmSync(fx.root, { recursive: true, force: true });
      fs.cpSync(seed, fx.root, { recursive: true });
      let fired = 0;
      driveReplanToCommit(fx, { allowCrash: true, failpoint(name) {
        if (name === target && fired++ === 0) throw new Error('prefix-crash:' + target);
      } });
      equal(fired, 1, target + ' failpoint fires exactly once after its durable mutation');
      const recovered = exactAuthorityBytes(fx);
      ok(JSON.stringify(recovered) === JSON.stringify(control), target
        + ' one resume converges to exact control bytes/cardinalities: '
        + JSON.stringify(authorityByteDiff(recovered, control)));
      const stable = exactAuthorityBytes(fx);
      equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
        'already_committed', target + ' second resume is already_committed');
      deepEqual(exactAuthorityBytes(fx), stable, target + ' second resume has zero byte/cardinality effect');
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
      fs.rmSync(backup, { recursive: true, force: true });
    }
  }
}

for (const target of [
  'after_plan_child_promoted', 'after_state_child_promoted_fenced',
  'after_tasks_child_promoted', 'after_tx_cleanup_intent', 'after_cache_unlinked',
  'after_tx_active_cache_cleaned', 'after_tx_committed',
  'after_state_unfenced', 'after_tx_state_unfenced',
]) {
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    let crash = null;
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === target || name.startsWith(target + ':')) throw new Error('simulated_activation_crash:' + target); } });
    } catch (error) { crash = error.message; }
    equal(crash, 'simulated_activation_crash:' + target, target + ' failpoint fires after its durable write');
    const resumed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    ok(['committed', 'already_committed'].includes(resumed.result), target + ' resumes by rolling forward');
    const state = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(state.plan_epoch), 2, target + ' increments epoch exactly once');
    equal(Number(state.automatic_review_replans), 1, target + ' increments counter exactly once');
    const stable = fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'already_committed', target + ' second resume is stable');
    equal(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'), stable, target + ' second resume leaves transaction bytes unchanged');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Completed activation outputs are authority receipts, not skip flags. A
// tampered mirror after its durable journal entry must block and stay fenced.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_tx_task_mirror_promoted') throw new Error('stop_after_mirror'); } });
    } catch (_) {}
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), '{"tampered":true}\n');
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.reason, 'replan_activation_integrity_failure', 'tampered completed mirror blocks activation');
    equal(result.step, 'task_mirror_promoted', 'mirror integrity refusal identifies the completed prefix');
    ok(replan.readStatus({ repoRoot: fx.root, project: fx.project }).fenced, 'mirror integrity failure remains transaction-fenced');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Cleanup accepts disappearance only behind a durable delete-intent receipt.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_tx_task_mirror_promoted') throw new Error('stop_before_cleanup'); } });
    } catch (_) {}
    fs.rmSync(path.join(fx.projectDir, 'workflow-plan.next.md'));
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.reason, 'replan_cache_cleanup_failed', 'unsanctioned missing cleanup input is refused');
    ok(String(result.detail).includes('cleanup_missing_without_receipt'), 'cleanup refusal names the missing-receipt invariant');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Snapshot construction refuses symlinks without touching parent authority;
// removal of the unsafe path permits the same frozen child to resume.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_state_child_frozen_fence') throw new Error('stop_before_snapshot'); } });
    } catch (_) {}
    const parent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'));
    const badLink = path.join(fx.cacheDir, 'unsafe-link');
    fs.symlinkSync(path.join(fx.root, 'product.js'), badLink);
    const refused = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(refused.reason, 'replan_snapshot_incomplete', 'snapshot symlink is a typed refusal');
    ok(String(refused.detail).includes('snapshot_symlink_refused'), 'snapshot refusal preserves the symlink reason');
    ok(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md')).equals(parent), 'snapshot refusal preserves parent plan bytes');
    fs.unlinkSync(badLink);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed', 'safe retry resumes the frozen child');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Authority paths reject intermediate symlink substitution before lock or
// transaction creation; lstat of only the final JSON file is insufficient.
{
  const fx = initFixture();
  try {
    const realCache = path.join(fx.projectDir, '.cache-real');
    fs.renameSync(fx.cacheDir, realCache);
    fs.symlinkSync('.cache-real', fx.cacheDir, 'dir');
    const refused = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    equal(refused.reason, 'replan_authority_path_invalid', 'symlinked .cache authority is refused before locking');
    ok(!fs.existsSync(path.join(realCache, 'replan-transaction.json')), 'symlinked authority refusal creates no transaction');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Snapshot creation never follows an epochs-directory symlink to an external
// destination, even after the child has already frozen.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_state_child_frozen_fence') throw new Error('stop_before_symlinked_epochs'); } });
    } catch (_) {}
    const outsideEpochs = path.join(fx.projectDir, 'outside-epochs');
    fs.mkdirSync(outsideEpochs);
    fs.symlinkSync('../outside-epochs', path.join(fx.cacheDir, 'epochs'), 'dir');
    const refused = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(refused.reason, 'replan_snapshot_incomplete', 'symlinked epochs authority blocks snapshot construction');
    ok(String(refused.detail).includes('snapshot_directory_invalid'), 'symlinked epochs refusal preserves the path-integrity reason');
    deepEqual(fs.readdirSync(outsideEpochs), [], 'symlinked external epochs destination remains untouched');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Recovery verification independently lstats the epoch component chain; it
// never follows a symlink to an otherwise self-consistent manifest.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed', 'snapshot verifier fixture commits');
    const epochDir = path.join(fx.cacheDir, 'epochs', '1');
    const realDir = path.join(fx.cacheDir, 'epoch-1-real');
    fs.renameSync(epochDir, realDir);
    fs.symlinkSync(realDir, epochDir);
    const checked = replan.verifySnapshotManifest(epochDir);
    ok(!checked.ok && String(checked.detail).includes('snapshot_directory_invalid'), 'symlinked epoch directory is refused during recovery verification');
    fs.unlinkSync(epochDir);
    fs.renameSync(realDir, epochDir);
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// The state, not directory existence, determines whether epoch snapshots are
// required. Deleting the complete snapshot tree after epoch 2 must fail closed.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', 'missing-snapshot-tree fixture commits epoch 2');
    fs.rmSync(path.join(fx.cacheDir, 'epochs'), { recursive: true, force: true });
    const checked = replan.verifyAllEpochSnapshots(fx.projectDir);
    equal(checked.reason, 'snapshot_epoch_sequence_invalid', 'schema-2 epoch 2 refuses a missing snapshot tree');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Scope lineage is part of every frontier read; it must not disappear after prepare.
{
  const fx = initFixture({ scopeLineageId: '1'.repeat(64) });
  try {
    advanceToAttestedChild(fx);
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.result, 'committed', 'schema-2 scope lineage does not false-trip later CAS seams');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-transaction.json'), 'utf8'));
    deepEqual(tx.cas.pre_freeze.inherited_frontier_view.scope_lineage_ids, ['1'.repeat(64)], 'pre-freeze frontier retains scope lineage');
    deepEqual(tx.cas.pre_activation.inherited_frontier_view.scope_lineage_ids, ['1'.repeat(64)], 'pre-activation frontier retains scope lineage');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Parent source and planner packet bytes are immutable after prepare/pending.
{
  const fx = initFixture();
  try {
    replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    fs.appendFileSync(path.join(fx.cacheDir, 'review-attempts.json'), ' \n');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_source_changed', 'journal byte drift after prepare is refused');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    const packetPath = path.join(fx.cacheDir, schema.REPLAN_PLANNER_PACKET_NAME);
    const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
    packet.tampered_after_pending = true;
    fs.writeFileSync(packetPath, JSON.stringify(packet) + '\n');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    writePlannerResult(fx, tx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_planner_attestation_invalid', 'attestation over a rewritten packet cannot replace the transaction-bound packet digest');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// The scheduler lock is exclusive and never auto-taken over.
{
  const fx = initFixture();
  try {
    fs.writeFileSync(path.join(fx.cacheDir, schema.SCHEDULER_LOCK_NAME), JSON.stringify({
      pid: process.pid, host: os.hostname(), ts: Date.now(), subcommand: 'other mutation',
    }));
    const blocked = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    equal(blocked.reason, 'scheduler_lock_held', 'concurrent prepare refuses the live scheduler lock');
    ok(fs.existsSync(path.join(fx.cacheDir, schema.SCHEDULER_LOCK_NAME)), 'lock refusal never unlinks another holder');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Consent is an exactly-once digest chain. A retry of the same user turn repairs
// at most the state cache and never adds a second ceiling slot.
{
  const fx = initFixture();
  try {
    let state = fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8');
    state += 'automatic_review_replans: 2\nauthorized_epoch_ceiling: 2\ncase_b_exemption_consumed: false\n';
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-state.md'), state);
    const halted = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    equal(halted.reason, 'replan_consent_required', 'transition three durably consent-halts before planner dispatch');
    const extended = replan.appendConsentExtension({ repoRoot: fx.root, project: fx.project,
      userTurnReference: 'user-turn-699-1', reason: 'authorize one additional review transition',
      now: () => '2026-07-16T01:00:00.000Z' });
    equal(extended.authorized_epoch_ceiling, 3, 'one user turn grants exactly one ceiling slot');
    const replay = replan.appendConsentExtension({ repoRoot: fx.root, project: fx.project,
      userTurnReference: 'user-turn-699-1', reason: 'authorize one additional review transition',
      now: () => '2026-07-16T01:01:00.000Z' });
    equal(replay.result, 'consent_already_extended', 'same user turn is idempotent');
    const ledger = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.EPOCH_CONSENT_EXTENSIONS_NAME), 'utf8'));
    equal(ledger.entries.length, 1, 'consent retry cannot mint a second ledger entry');
    const consentState = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    const verifiedConsent = replan.verifyConsentLedger(ledger, consentState.epoch_lineage_id);
    ok(verifiedConsent.ok, 'consent extension digest chain re-verifies before resume');
    equal(Number(consentState.authorized_epoch_ceiling), verifiedConsent.ceiling, 'state ceiling is only a cache of the verified chain');
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'prepared', 'verified consent authorizes one fresh transaction without replaying a refused mutation');
    const resumed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(resumed.reason, 'replan_planner_dispatch_required', 'verified consent releases only the newly prepared transaction to planner_pending: ' + JSON.stringify(resumed));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// Review liveness and the one-shot diagnosis-to-build exemption are claim-scoped.
{
  const lineage = '1'.repeat(64);
  const halted = replan.evaluateTransitionBudget({ epoch_lineage_id: lineage, automatic_review_replans: 2, authorized_epoch_ceiling: 2, case_b_exemption_consumed: false }, { transition_reason: 'review_repair_requires_replan' });
  equal(halted.reason, 'replan_consent_required', 'third automatic review transition consent-halts');
  const caseB = replan.evaluateTransitionBudget({ epoch_lineage_id: lineage, automatic_review_replans: 2, authorized_epoch_ceiling: 2, case_b_exemption_consumed: false }, {
    transition_reason: 'diagnosis_to_build', planned_transition: 'diagnosis_to_build', parent_complete: true,
    unresolved_review: false, writers: [{ role: 'code-explorer', artifacts_only: true }], diagnosis_root_cause_digest: '2'.repeat(64),
    falsified_alternatives_digest: '3'.repeat(64), acceptance_contract_digest: '4'.repeat(64), recommendation_digest: '5'.repeat(64),
  }, { ceiling: 2, consent_ledger_digest: null, case_b_verified: true,
    case_b_proof: { proof_digest: '6'.repeat(64) } });
  ok(caseB.ok && caseB.cost === 0 && caseB.case_b_exemption, 'filesystem-verified first diagnosis-to-build transition is zero-cost');
  const callerAsserted = replan.evaluateTransitionBudget({ epoch_lineage_id: lineage, automatic_review_replans: 2,
    authorized_epoch_ceiling: 2, case_b_exemption_consumed: false }, {
    transition_reason: 'diagnosis_to_build', planned_transition: 'diagnosis_to_build', parent_complete: true,
    unresolved_review: false, writers: [{ role: 'code-explorer', artifacts_only: true }],
    diagnosis_root_cause_digest: '2'.repeat(64), falsified_alternatives_digest: '3'.repeat(64),
    acceptance_contract_digest: '4'.repeat(64), recommendation_digest: '5'.repeat(64),
  });
  equal(callerAsserted.reason, 'replan_consent_required', 'caller-asserted Case-B literals cannot mint an exemption');
  const forgedCeiling = replan.evaluateTransitionBudget({ epoch_lineage_id: lineage, automatic_review_replans: 2,
    authorized_epoch_ceiling: 999, case_b_exemption_consumed: false }, { transition_reason: 'review_repair_requires_replan' });
  equal(forgedCeiling.reason, 'replan_consent_ledger_invalid', 'plaintext ceiling without a verified ledger is rejected');
  const second = replan.evaluateTransitionBudget({ epoch_lineage_id: lineage, automatic_review_replans: 2, authorized_epoch_ceiling: 2, case_b_exemption_consumed: true }, {
    transition_reason: 'diagnosis_to_build', planned_transition: 'diagnosis_to_build', parent_complete: true,
    unresolved_review: false, writers: [{ role: 'code-explorer', artifacts_only: true }], diagnosis_root_cause_digest: '2'.repeat(64),
    falsified_alternatives_digest: '3'.repeat(64), acceptance_contract_digest: '4'.repeat(64), recommendation_digest: '5'.repeat(64),
  }, { ceiling: 2, consent_ledger_digest: null, case_b_verified: true,
    case_b_proof: { proof_digest: '6'.repeat(64) } });
  equal(second.reason, 'replan_consent_required', 'the Case-B exemption cannot be consumed twice');
}

// Genuine Case B starts with no review journal and no source-outcome file. The
// typed terminal diagnosis is resolved directly from the completed parent,
// cited by the child, costs zero exactly once, and disallows writer laundering.
{
  const fx = initFixture({ seedSource: false });
  try {
    const installed = installTypedCaseBParent(fx);
    const paths = { project: fx.project, projectDir: fx.projectDir };
    const proof = replan.verifyCaseBProof(paths, installed.plan.text, null,
      'diagnosis_to_build', fx.lineage);
    ok(proof.ok && /^[0-9a-f]{64}$/.test(proof.proof_digest),
      'typed digest-bound Case-B artifacts verify without review-shaped source JSON: ' + JSON.stringify(proof));
    equal(proof.payload.recommended_shape_digest, installed.rows.recommendation.digest,
      'Case-B proof binds the exact recommended-shape artifact');

    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      transitionReason: 'diagnosis_to_build' });
    equal(prepared.result, 'prepared', 'no-review diagnosis enters the real re-plan transaction');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_planner_dispatch_required', 'typed diagnosis reaches one planner dispatch');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    ok(tx.budget.case_b_exemption && tx.transition_cost === 0,
      'genuine Case B records the one-shot zero-cost budget authority');
    const child = writePlannerResult(fx, tx);
    const childMeta = replan.validateChildPlan(Buffer.from(child.text), tx);
    ok(childMeta.ok, 'Case-B child carries exact diagnosis and recommendation citations');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'committed', 'cited Case-B child snapshots and activates');
    const state = replan.parseStateFields(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'));
    equal(Number(state.automatic_review_replans), 0, 'first genuine Case B leaves review re-plan count unchanged');
    equal(state.case_b_exemption_consumed, 'true', 'first genuine Case B consumes the exemption exactly once');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result,
      'already_committed', 'Case-B activation is idempotent on second resume');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

for (const variant of ['untyped', 'writer-bearing', 'review-present']) {
  const fx = initFixture({ seedSource: false });
  try {
    const installed = installTypedCaseBParent(fx, variant === 'writer-bearing' ? { extraWrite: 'product.js' } : {});
    if (variant === 'untyped') {
      const row = installed.rows.diagnosis_root_cause;
      const bytes = schema.canonicalJson({ schema_version: 2, kind: 'diagnosis_root_cause', terminal: true }) + '\n';
      fs.writeFileSync(path.join(fx.projectDir, ...row.path.split('/')), bytes);
    }
    if (variant === 'review-present') {
      const prior = initFixture();
      try {
        fs.copyFileSync(path.join(prior.cacheDir, 'review-attempts.json'), path.join(fx.cacheDir, 'review-attempts.json'));
        fs.copyFileSync(path.join(prior.cacheDir, 'replan-source.json'), path.join(fx.cacheDir, 'replan-source.json'));
        fs.copyFileSync(path.join(prior.cacheDir, 'review.md'), path.join(fx.cacheDir, 'review.md'));
      } finally { fs.rmSync(prior.root, { recursive: true, force: true }); }
    }
    const result = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      transitionReason: 'diagnosis_to_build' });
    ok(result.result === 'refuse' && /^case_b_/.test(result.reason),
    'Case-B ' + variant + ' variant refuses: ' + JSON.stringify(result));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #699 G4: inherited code is a virtual producer. Even a child with zero local
// writers must carry a named, reachable, executable code certifier.
{
  const baseMeta = {
    plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
    epoch_lineage_id: '1'.repeat(64), plan_epoch: 2,
    parent_plan_hash: '2'.repeat(64), parent_snapshot_manifest_digest: 'pending',
    claim_root_base_digest: '3'.repeat(64), inherited_frontier_digest: '4'.repeat(64),
    inherited_frontier_classes: 'code', transition_reason: 'review_repair_requires_replan',
    source_evidence_digest: '5'.repeat(64), planner_binding: 'dispatch-699',
    code_certifier: 'child-review', security_certifier: 'none',
  };

  // N4-ACTIVATION-LEGACY / N4-ACTIVATION-MIXED: the plan validator and
  // plan-bound journal adapter must share one fail-closed activation boundary.
  // Metadata-free legacy fanouts remain legal, while schema-2 gate metadata on
  // an inactive plan and any mixed-aggregation schema-2 group refuse at freeze.
  const legacyFanout = frozenPlan('issue-699', {}, [
    { id: 'legacy-a', role: 'code-reviewer', shape: 'fanout(legacy)' },
    { id: 'legacy-b', role: 'code-reviewer', shape: 'fanout(legacy)' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'legacy-a,legacy-b', model: '—' },
  ], {});
  const explicitSource = frozenPlan('issue-699', baseMeta, [
    { id: 'legacy-a', role: 'code-reviewer', shape: 'fanout(legacy)',
      gate_claim: 'current code candidate is approved', gate_surface: 'surface-a',
      gate_aggregation: 'partitioned_all' },
    { id: 'legacy-b', role: 'code-reviewer', shape: 'fanout(legacy)',
      gate_claim: 'current code candidate is approved', gate_surface: 'surface-b',
      gate_aggregation: 'partitioned_all' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'legacy-a,legacy-b', model: '—' },
  ], {});
  let explicitLegacyText = explicitSource.text;
  for (const key of Object.keys(baseMeta)) {
    explicitLegacyText = explicitLegacyText.replace(new RegExp('^' + key + ':[^\\n]*\\n', 'm'), '');
  }
  const explicitLegacy = rehashPlan(explicitLegacyText);
  const mixed = frozenPlan('issue-699', { ...baseMeta, code_certifier: 'group(cert)' }, [
    { id: 'mixed-a', role: 'code-reviewer', shape: 'fanout(mixed)',
      gate_claim: 'current code candidate is approved', gate_surface: 'full candidate',
      gate_aggregation: 'replicated_majority' },
    { id: 'mixed-b', role: 'code-reviewer', shape: 'fanout(mixed)',
      gate_claim: 'current code candidate is approved', gate_surface: 'partition-b',
      gate_aggregation: 'partitioned_all' },
    { id: 'cert-a', role: 'code-reviewer', depends_on: 'mixed-a,mixed-b', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'surface-a',
      gate_aggregation: 'partitioned_all' },
    { id: 'cert-b', role: 'code-reviewer', depends_on: 'mixed-a,mixed-b', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'surface-b',
      gate_aggregation: 'partitioned_all' },
    { id: 'child-finalize', role: 'finalize',
      depends_on: 'cert-a,cert-b', model: '—' },
  ], {});
  const legacyActivation = validator.validatePlan(explicitLegacy.text, {});
  const mixedActivation = validator.validatePlan(mixed.text, {});
  let legacyAdapterError = null;
  let mixedAdapterError = null;
  try { validator.schema2ReviewGateContracts(explicitLegacy.text); } catch (error) { legacyAdapterError = error; }
  try { validator.schema2ReviewGateContracts(mixed.text); } catch (error) { mixedAdapterError = error; }
  const activationProof = {
    legacy_result: legacyActivation.result,
    legacy_errors: legacyActivation.errors,
    legacy_adapter_error: legacyAdapterError && legacyAdapterError.message,
    mixed_result: mixedActivation.result,
    mixed_errors: mixedActivation.errors,
    mixed_adapter_error: mixedAdapterError && mixedAdapterError.message,
  };
  ok(legacyActivation.result === 'refuse'
    && legacyActivation.errors.some(error => /schema-2.*metadata/i.test(error))
    && legacyAdapterError && /schema-2.*metadata/i.test(legacyAdapterError.message)
    && mixedActivation.result === 'refuse'
    && mixedActivation.errors.some(error => /logical review fanout.*aggregation/i.test(error))
    && mixedAdapterError && /logical review fanout.*aggregation/i.test(mixedAdapterError.message),
  'N4 activation boundary refuses legacy metadata and mixed schema-2 aggregation without silent adapter omission: '
    + JSON.stringify(activationProof));
  equal(validator.validatePlan(legacyFanout.text, {}).result, 'in-grammar',
    'metadata-absent legacy reviewer fanout remains byte-compatible');

  const zeroWriter = frozenPlan('issue-699', baseMeta, [
    { id: 'child-finalize', role: 'finalize', model: '—' },
  ], {});
  const bad = validator.validatePlan(zeroWriter.text, {});
  equal(bad.reason, 'plan_invalid', 'schema-2 zero-writer child cannot launder inherited code without G4 certifier');
  ok(bad.errors.some(e => e.includes('G4') && e.includes('child-review')), 'G4 refusal identifies the missing named inherited certifier');

  const candidate = '6'.repeat(64);
  const certifierBody = (member, kind, gate, aggregation, candidateDigest = candidate,
    verdict = 'pass', findingsBlocking = 0) => [
    'evidence-binding: ' + member + ' nonce-' + member,
    'verdict: ' + verdict, 'findings_blocking: ' + findingsBlocking,
    'certifier_kind: ' + kind,
    'certifier_aggregation: ' + aggregation,
    'certifier_gate_digest: ' + schema.sha256Canonical(gate),
    'certifier_epoch_lineage_id: ' + baseMeta.epoch_lineage_id,
    'certifier_inherited_frontier_digest: ' + baseMeta.inherited_frontier_digest,
    'certified_candidate_digest: ' + candidateDigest,
  ].join('\n') + '\n';
  const certifierIdentity = (kind, rows, claim, aggregation, certified = []) => ({
    kind,
    members: rows.map(row => row.id).sort(),
    claim_digest: schema.sha256Hex(claim),
    surface_digests: rows.slice().sort((a, b) => a.id.localeCompare(b.id))
      .map(row => schema.sha256Hex(row.surface)),
    aggregation,
    certified_producers: certified.slice().sort(),
  });
  const sequenceGate = certifierIdentity('sequence',
    [{ id: 'child-review', surface: 'full code candidate' }], 'current code candidate is approved', 'sequence');
  const good = frozenPlan('issue-699', baseMeta, [
    { id: 'child-review', role: 'code-reviewer', gate_claim: 'current code candidate is approved',
      gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'child-review', model: '—' },
  ], { 'child-review': 'complete', 'child-finalize': 'pending' });
  equal(validator.validatePlan(good.text, {}).result, 'in-grammar', 'named inherited code certifier makes zero-writer child G4-valid');
  const goodReceipt = certifierBody('child-review', 'code', sequenceGate, 'sequence');
  ok(validator.verifyGateExecution(good.text, {
    currentCandidateDigest: candidate,
    readCache: name => name === 'child-review.md' ? goodReceipt : null,
  }).ok, 'completed inherited certifier executes G4 with current-candidate role receipt');
  ok(!validator.verifyGateExecution(good.text, {
    currentCandidateDigest: '7'.repeat(64),
    readCache: name => name === 'child-review.md' ? goodReceipt : null,
  }).ok, 'a later relevant mutation stales the inherited certifier receipt');
  ok(!validator.verifyGateExecution(good.text, {
    currentCandidateDigest: candidate, readCache: () => null,
  }).ok, 'a completed ledger row without a genuine certifier receipt cannot satisfy G4');

  const localMeta = { ...baseMeta, inherited_frontier_classes: 'none', code_certifier: 'local-review' };
  const localGate = certifierIdentity('sequence',
    [{ id: 'local-review', surface: 'full code candidate' }], 'current code candidate is approved', 'sequence');
  const localOnly = frozenPlan('issue-699', localMeta, [
    { id: 'local-writer', role: 'tdd-guide', write_set: 'product.js' },
    { id: 'local-review', role: 'code-reviewer', depends_on: 'local-writer',
      gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'local-review', model: '—' },
  ], { 'local-writer': 'complete', 'local-review': 'complete', 'child-finalize': 'pending' });
  equal(validator.validatePlan(localOnly.text, {}).result, 'in-grammar',
    'schema-2 local writer requires and accepts a current-candidate certifier even without inherited code');
  ok(!validator.verifyGateExecution(localOnly.text, {
    currentCandidateDigest: candidate, readCache: () => null,
  }).ok, 'local-only schema-2 certification cannot fall back to legacy verdict evidence');
  ok(validator.verifyGateExecution(localOnly.text, {
    currentCandidateDigest: candidate,
    readCache: name => name === 'local-review.md'
      ? certifierBody('local-review', 'code', localGate, 'sequence') : null,
  }).ok, 'local-only schema-2 certification accepts the full bound receipt');
  const skipped = good.text.replace('| child-review | complete |', '| child-review | n/a |');
  const skippedResult = validator.verifyGateExecution(skipped, {
    currentCandidateDigest: candidate,
    readCache: name => name === 'child-review.md' ? goodReceipt : null,
  });
  ok(!skippedResult.ok && skippedResult.unsatisfied.some(row => row.requirement.includes('G4')),
  'inherited certifier cannot be laundered to n/a at runtime');

  const afterCertifier = frozenPlan('issue-699', baseMeta, [
    { id: 'child-review', role: 'code-reviewer', gate_claim: 'current code candidate is approved',
      gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: 'test-consumed-doc', role: 'doc-updater', depends_on: 'child-review', write_set: 'README.md' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'test-consumed-doc', model: '—' },
  ], {});
  const afterResult = validator.validatePlan(afterCertifier.text, {});
  ok(afterResult.result === 'refuse' && afterResult.errors.some(error => error.includes('G4')
    && error.includes('test-consumed-doc')),
  'built-in test-consumed prose written after the certifier is a G4 producer');
  const customMeta = { ...baseMeta, validation_test_consumes: 'docs/custom-policy.md' };
  const customAfter = frozenPlan('issue-699', customMeta, [
    { id: 'child-review', role: 'code-reviewer', gate_claim: 'current code candidate is approved',
      gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: 'custom-policy', role: 'doc-updater', depends_on: 'child-review', write_set: 'docs/custom-policy.md' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'custom-policy', model: '—' },
  ], {});
  ok(validator.validatePlan(customAfter.text, {}).errors.some(error => error.includes('G4')
    && error.includes('custom-policy')),
  'Meta validation_test_consumes prose written after the certifier is a G4 producer');
  const inertAfter = frozenPlan('issue-699', baseMeta, [
    { id: 'child-review', role: 'code-reviewer', gate_claim: 'current code candidate is approved',
      gate_surface: 'full code candidate', gate_aggregation: 'sequence' },
    { id: 'inert-doc', role: 'doc-updater', depends_on: 'child-review', write_set: 'docs/inert-note.md' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'inert-doc', model: '—' },
  ], {});
  equal(validator.validatePlan(inertAfter.text, {}).result, 'in-grammar',
    'truly validation-inert prose remains outside G4');

  const groupGate = certifierIdentity('group', [
    { id: 'review-a', surface: 'api surface' }, { id: 'review-b', surface: 'runtime surface' },
  ], 'current code candidate is approved', 'partitioned_all');
  const groupMeta = { ...baseMeta, code_certifier: 'group(cert)' };
  const group = frozenPlan('issue-699', groupMeta, [
    { id: 'review-a', role: 'code-reviewer', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'api surface', gate_aggregation: 'partitioned_all' },
    { id: 'review-b', role: 'code-reviewer', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'runtime surface', gate_aggregation: 'partitioned_all' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'review-a,review-b', model: '—' },
  ], { 'review-a': 'complete', 'review-b': 'complete', 'child-finalize': 'pending' });
  equal(validator.validatePlan(group.text, {}).result, 'in-grammar',
    'named G4 certifier resolves the full same-origin role fanout');
  const groupReceipts = {
    'review-a.md': certifierBody('review-a', 'code', groupGate, 'partitioned_all'),
    'review-b.md': certifierBody('review-b', 'code', groupGate, 'partitioned_all'),
  };
  ok(validator.verifyGateExecution(group.text, {
    currentCandidateDigest: candidate, readCache: name => groupReceipts[name] || null,
  }).ok, 'partitioned-all logical certifier requires and accepts every member receipt');
  ok(!validator.verifyGateExecution(group.text, {
    currentCandidateDigest: candidate, readCache: name => name === 'review-a.md' ? groupReceipts[name] : null,
  }).ok, 'partitioned-all logical certifier refuses a missing member receipt');

  // #695 (tighten-only guard): the unified inherited-frontier coverage is NOT a rubber stamp. A root that
  // bypasses the named certifier fanout entirely (reaches the sink without routing through any member) is
  // still a genuinely-uncovered inherited frontier and must refuse with the SAME g4_inherited_frontier_uncovered.
  const bypassRoot = frozenPlan('issue-699', groupMeta, [
    { id: 'review-a', role: 'code-reviewer', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'api surface', gate_aggregation: 'partitioned_all' },
    { id: 'review-b', role: 'code-reviewer', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'runtime surface', gate_aggregation: 'partitioned_all' },
    { id: 'bypass', role: 'doc-updater', write_set: 'docs/note.md' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'review-a,review-b,bypass', model: '—' },
  ], { 'review-a': 'complete', 'review-b': 'complete', 'bypass': 'complete', 'child-finalize': 'pending' });
  ok(validator.validatePlan(bypassRoot.text, {}).errors.some(error => error.includes('g4_inherited_frontier_uncovered')),
    'an inherited-frontier root that bypasses the named certifier fanout still refuses g4_inherited_frontier_uncovered');

  const directMember = frozenPlan('issue-699', { ...groupMeta, code_certifier: 'review-a' }, [
    { id: 'review-a', role: 'code-reviewer', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'api surface', gate_aggregation: 'partitioned_all' },
    { id: 'review-b', role: 'code-reviewer', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'runtime surface', gate_aggregation: 'partitioned_all' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'review-a,review-b', model: '—' },
  ], {});
  ok(validator.validatePlan(directMember.text, {}).errors.some(error => error.includes('aggregation')),
    'a direct fanout member id denotes sequence and cannot alias the logical partition group');

  const replicaRows = [
    { id: 'replica-a', surface: 'full code candidate' },
    { id: 'replica-b', surface: 'full code candidate' },
    { id: 'replica-c', surface: 'full code candidate' },
  ];
  const replicaGate = certifierIdentity('group', replicaRows,
    'current code candidate is approved', 'replicated_majority');
  const replica = frozenPlan('issue-699', { ...baseMeta, code_certifier: 'fanout(replicas)' }, [
    ...replicaRows.map(row => ({ id: row.id, role: 'code-reviewer', shape: 'fanout(replicas)',
      gate_claim: 'current code candidate is approved', gate_surface: row.surface,
      gate_aggregation: 'replicated_majority' })),
    { id: 'child-finalize', role: 'finalize', depends_on: replicaRows.map(row => row.id).join(','), model: '—' },
  ], { 'replica-a': 'complete', 'replica-b': 'complete', 'replica-c': 'complete', 'child-finalize': 'pending' });
  equal(validator.validatePlan(replica.text, {}).result, 'in-grammar',
    'declared replicated-majority logical certifier is schema-2 valid');
  const journalContracts = validator.schema2ReviewGateContracts(replica.text);
  deepEqual(journalContracts.map(contract => ({ role: contract.role,
    aggregation: contract.aggregation, members: contract.members })), [{
    role: 'code-reviewer', aggregation: 'replicated_majority',
    members: ['replica-a', 'replica-b', 'replica-c'],
  }], 'schema-2 plan adapter supplies the exact plan-hash-bound journal reduction contract');
  const replicaReceipts = {
    'replica-a.md': certifierBody('replica-a', 'code', replicaGate, 'replicated_majority'),
    'replica-b.md': certifierBody('replica-b', 'code', replicaGate, 'replicated_majority'),
    'replica-c.md': certifierBody('replica-c', 'code', replicaGate, 'replicated_majority', candidate, 'fail', 0),
  };
  ok(validator.verifyGateExecution(replica.text, {
    currentCandidateDigest: candidate, readCache: name => replicaReceipts[name] || null,
  }).ok, 'replicated-majority accepts a strict bound majority when no member reports a blocker');
  ok(validator.verifyVerdictBlock(replica.text, {
    readCache: name => replicaReceipts[name] || null,
  }).ok, 'whole-plan verdict reduction accepts one non-blocking dissent in a replicated majority');
  const vetoReceipts = { ...replicaReceipts,
    'replica-c.md': certifierBody('replica-c', 'code', replicaGate, 'replicated_majority', candidate, 'fail', 1) };
  ok(!validator.verifyGateExecution(replica.text, {
    currentCandidateDigest: candidate, readCache: name => vetoReceipts[name] || null,
  }).ok, 'replicated-majority cannot outvote a role-specific blocking finding');
  const unresolvedFixReceipts = { ...replicaReceipts,
    'replica-c.md': certifierBody('replica-c', 'code', replicaGate, 'replicated_majority')
      + 'finding: id=R-G4 scope=in_scope action=fix status=open severity=high file=runtime.js fix_role=tdd-guide\n' };
  ok(!validator.verifyGateExecution(replica.text, {
    currentCandidateDigest: candidate, readCache: name => unresolvedFixReceipts[name] || null,
  }).ok, 'replicated-majority cannot outvote an unresolved in-scope fix when findings_blocking is zero');
  ok(!validator.verifyVerdictBlock(replica.text, {
    readCache: name => unresolvedFixReceipts[name] || null,
  }).ok, 'whole-plan logical-group reduction preserves the unresolved-fix veto');

  const ambiguous = frozenPlan('issue-699', { ...baseMeta, code_certifier: 'group(cert)' }, [
    { id: 'writer-a', role: 'tdd-guide', write_set: 'a.js' },
    { id: 'writer-b', role: 'tdd-guide', write_set: 'b.js' },
    { id: 'review-a', role: 'code-reviewer', depends_on: 'writer-a', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'surface-a', gate_aggregation: 'partitioned_all' },
    { id: 'review-b', role: 'code-reviewer', depends_on: 'writer-b', shape: 'fanout(cert)',
      gate_claim: 'current code candidate is approved', gate_surface: 'surface-b', gate_aggregation: 'partitioned_all' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'review-a,review-b', model: '—' },
  ], {});
  ok(validator.validatePlan(ambiguous.text, {}).errors.some(error => error.includes('ambiguous')),
    'one group label at multiple dependency origins refuses instead of merging branch-local certifiers');

  const avMeta = { ...baseMeta, inherited_frontier_classes: 'none', code_certifier: 'review' };
  const avMissingCertifies = frozenPlan('issue-699', avMeta, [
    { id: 'writer', role: 'tdd-guide', write_set: 'product.js' },
    { id: 'skeptic', role: 'adversarial-verifier', depends_on: 'writer',
      gate_claim: 'candidate withstands falsification', gate_surface: 'full code candidate',
      gate_aggregation: 'sequence' },
    { id: 'review', role: 'code-reviewer', depends_on: 'skeptic',
      gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate',
      gate_aggregation: 'sequence' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'review', model: '—' },
  ], {});
  ok(validator.validatePlan(avMissingCertifies.text, {}).errors.some(error =>
    error.includes('certifies') && error.includes('skeptic')),
  'schema-2 change-gate adversarial verifier must explicitly declare its certified producer set');

  const investigationMeta = { ...baseMeta, inherited_frontier_classes: 'none',
    code_certifier: 'none', security_certifier: 'none' };
  const investigationCertifies = frozenPlan('issue-699', investigationMeta, [
    { id: 'source', role: 'code-explorer' },
    { id: 'skeptic', role: 'adversarial-verifier',
      gate_claim: 'question is falsified', gate_surface: 'research record',
      gate_aggregation: 'sequence', certifies: 'source' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'source,skeptic', model: '—' },
  ], {});
  ok(validator.validatePlan(investigationCertifies.text, {}).errors.some(error =>
    error.includes('investigation') && error.includes('certifies') && error.includes('skeptic')),
  'schema-2 investigation adversarial verifier must keep certifies empty');

  const unreachableCertifies = frozenPlan('issue-699', avMeta, [
    { id: 'writer', role: 'tdd-guide', write_set: 'product.js' },
    { id: 'source', role: 'code-explorer' },
    { id: 'skeptic', role: 'adversarial-verifier', depends_on: 'writer',
      gate_claim: 'candidate withstands falsification', gate_surface: 'full code candidate',
      gate_aggregation: 'sequence', certifies: 'source' },
    { id: 'review', role: 'code-reviewer', depends_on: 'source,skeptic',
      gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate',
      gate_aggregation: 'sequence' },
    { id: 'child-finalize', role: 'finalize', depends_on: 'review', model: '—' },
  ], {});
  ok(validator.validatePlan(unreachableCertifies.text, {}).errors.some(error =>
    error.includes('certifies') && error.includes('unreachable') && error.includes('source')),
  'every schema-2 adversarial certified producer must reach the verifier, and the verifier must reach the sink');
}

// #699 valid-transaction fence integration: all runtime entry points consume
// the same n2 transaction and refuse before any filesystem mutation.
{
  const fx = initFixture();
  try {
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'prepared', 'runtime fence fixture prepares a valid transaction');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    const snapshot = root => {
      const rows = [];
      const walk = (dir, rel) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const nextRel = rel ? rel + '/' + entry.name : entry.name;
          const absolute = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(absolute, nextRel);
          else rows.push([nextRel, sha256(fs.readFileSync(absolute))]);
        }
      };
      walk(root, '');
      return rows;
    };
    const before = snapshot(fx.projectDir);
    const commands = [
      ['kaola-workflow-adaptive-node.js', ['open-next', '--project', fx.project, '--json']],
      ['kaola-workflow-adaptive-node.js', ['orient', '--project', fx.project, '--json', '--summary']],
      ['kaola-workflow-adaptive-handoff.js', ['--project', fx.project, '--json']],
      ['kaola-workflow-plan-validator.js', [path.join(fx.projectDir, 'workflow-plan.md'), '--finalize-check', '--json']],
    ];
    for (const [script, args] of commands) {
      const child = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
        cwd: fx.root, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' },
      });
      ok(child.status !== 0, script + ' refuses a live valid re-plan fence');
      const out = JSON.parse(String(child.stdout || '').trim().split('\n').filter(Boolean).pop());
      equal(out.reason, 'replan_in_progress', script + ' reports the shared typed fence reason');
      equal(out.transaction_id, tx.transaction_id, script + ' reports the exact transaction id');
      equal(out.parent_plan_hash, tx.parent.plan_hash, script + ' reports the exact parent plan hash');
      equal(out.resume_command,
        'node scripts/kaola-workflow-replan.js resume --project ' + fx.project + ' --json',
        script + ' exposes the sole legal local mutation');
    }
    deepEqual(snapshot(fx.projectDir), before,
      'valid transaction runtime refusals are zero-mutation (no lock/task-mirror/envelope writes)');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #699 cross-epoch journal import: an activated child consumes the immutable
// parent journal through lineage provenance instead of failing plan-hash mismatch.
{
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed', 'cross-epoch journal fixture activates child');
    const childContent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const journal = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent);
    ok(journal.ok && journal.journal && journal.journal.plan_hash === validator.readStoredHash(childContent)
      && journal.journal.legacy_import && journal.journal.legacy_import.parent_plan_hash,
    'activated child receives a fresh epoch-local journal with immutable parent import provenance: ' + JSON.stringify(journal));
    fs.writeFileSync(journal.journalPath, JSON.stringify(journal.journal, null, 2) + '\n');
    const reread = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent);
    ok(reread.ok && reread.journal.legacy_import
      && reread.journal.legacy_import.journal_digest === journal.journal.legacy_import.journal_digest,
    'epoch-local journal persists and revalidates its immutable import pointer');
    const importedAttempts = adaptiveNode.reviewJournalAttempts(reread.journal);
    ok(importedAttempts.some(attempt => attempt.attempt_id === SOURCE_ATTEMPT_ID)
      && importedAttempts.some(attempt => attempt.findings.some(finding => finding.id === 'R1')),
    'claim-scoped lookup retains imported parent attempts and immutable findings');
    const parentAttempt = importedAttempts.find(attempt => attempt.attempt_id === SOURCE_ATTEMPT_ID);
    equal(adaptiveNode.nextReviewAttemptOrdinal(importedAttempts, parentAttempt.logical_gate.key), 2,
      'claim-scoped imported history prevents ordinal reset');
    equal(adaptiveNode.reviewJournalBlocker(reread.journal), null,
      'the source attempt is visible but consumed by the committed transition, so it does not re-block');
    const tampered = JSON.parse(JSON.stringify(reread.journal));
    tampered.legacy_import.snapshot_path = '../attacker/review-attempts.json';
    fs.writeFileSync(journal.journalPath, JSON.stringify(tampered, null, 2) + '\n');
    const rejected = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent);
    equal(rejected.reason, 'review_journal_legacy_import_mismatch',
      'tampered/traversal legacy import pointer fails closed against transaction and snapshot');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #699 sequence reviewer identity is claim-scoped across epoch topology changes.
// Reusing a reviewer id with a different producer origin must continue at :2,
// not collide with the imported parent review:1 or restart a gate-local ordinal.
{
  const fx = initFixture({ sameGateChild: true, changedOriginChild: true, sourceAttemptId: 'review:1' });
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      'changed-origin sequence fixture commits epoch 1 -> 2');
    const childContent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const state = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent);
    const childReview = validator.parseNodes(childContent).find(node => node.id === 'review');
    const childGate = schema.canonicalLogicalGateIdentity({
      kind: 'sequence', id: childReview.id, origin: childReview.dependsOn, members: [childReview.id],
    });
    equal(adaptiveNode.nextReviewAttemptOrdinal(adaptiveNode.reviewJournalAttempts(state.journal), childGate), 2,
      'changed-origin sequence reviewer advances the claim-global reviewer ordinal');
    const nonceBase = 'b'.repeat(40);
    const liveChild = childContent
      .replace('| impl2 | pending |', '| impl2 | complete |')
      .replace('| review | pending |', '| review | in_progress |');
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-plan.md'), liveChild);
    fs.writeFileSync(path.join(fx.cacheDir, 'barrier-base-review'), nonceBase + '\n');
    fs.writeFileSync(path.join(fx.cacheDir, 'review.md'), [
      'evidence-binding: review ' + nonceBase.slice(0, 12),
      'verdict: fail', 'findings_blocking: 1',
      'finding: id=R2 scope=product action=fix status=open severity=high file=product.js fix_role=tdd-guide',
      '',
    ].join('\n'));
    const writerIdentity = { baseline: fx.commit, anchored_ref: fx.commit,
      open_token: 'open-impl2', generation: fx.commit.slice(0, 12),
      ref: 'refs/kaola-workflow/barrier/issue-699/impl2' };
    const closed = adaptiveNode.runCloseNode({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'), project: fx.project,
      nodeId: 'review', repoRoot: fx.root,
      shell: (_script, args) => args.includes('--resume-check')
        ? { exitCode: 0, ok: true }
        : { exitCode: 0, result: 'ok', ok: true, overallOk: true,
            selectorCheck: { isSelector: false, ok: true } },
      readFile: p => fs.readFileSync(p, 'utf8'),
      writeFile: (p, value) => fs.writeFileSync(p, value),
      cacheExists: p => fs.existsSync(p), unlink: p => fs.unlinkSync(p),
      readdir: p => fs.readdirSync(p),
      computeReviewCandidateDigest: () => 'c'.repeat(64),
      captureWriterBarrierIdentity: id => id === 'impl2' ? writerIdentity : null,
    });
    equal(closed.attempt_id, 'review:2',
      'real close-node begin writes a collision-free claim-scoped sequence attempt id');
    equal(closed.result, 'review_failed',
      'real close-node settlement persists the changed-origin review failure');
    const persistedChild = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const reread = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, persistedChild);
    const attempts = reread.ok ? adaptiveNode.reviewJournalAttempts(reread.journal) : [];
    ok(reread.ok && attempts.map(attempt => attempt.attempt_id).join(',') === 'review:1,review:2'
      && attempts[0].logical_gate.key !== attempts[1].logical_gate.key,
    'changed-origin sequence attempt persists and rereads with distinct gate identities and continuous ids: '
      + JSON.stringify(reread));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #699 multi-epoch journal continuity: local ordinals continue the imported logical-gate sequence,
// survive persistence/reread, and a second committed re-plan retains the full immutable history chain.
{
  const fx = initFixture({ sameGateChild: true });
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      'multi-hop journal fixture commits epoch 1 -> 2');
    const local = installSchema2ReviewSource(fx, { ordinal: 2, findingId: 'R2' });
    const childContent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const persisted = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent);
    ok(persisted.ok && adaptiveNode.reviewJournalAttempts(persisted.journal).map(row => row.ordinal).join(',') === '1,2',
      'same-gate child ordinal 2 persists and rereads behind imported ordinal 1: ' + JSON.stringify(persisted));
    equal(adaptiveNode.nextReviewAttemptOrdinal(adaptiveNode.reviewJournalAttempts(persisted.journal),
      local.attempt.logical_gate.key), 3, 'combined imported/current view advances the next same-gate ordinal to 3');
    const stableChildJournal = fs.readFileSync(persisted.journalPath, 'utf8');
    const ordinalGap = JSON.parse(stableChildJournal);
    ordinalGap.attempts[0].ordinal = 3;
    ordinalGap.attempts[0].attempt_id = 'review:3';
    fs.writeFileSync(persisted.journalPath, JSON.stringify(ordinalGap, null, 2) + '\n');
    equal(adaptiveNode.readReviewJournal({ planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent).reason, 'review_journal_attempt_identity_mismatch',
    'a persisted child ordinal gap after the imported prefix fails closed');
    const importedCollision = JSON.parse(stableChildJournal);
    importedCollision.attempts[0].attempt_id = SOURCE_ATTEMPT_ID;
    fs.writeFileSync(persisted.journalPath, JSON.stringify(importedCollision, null, 2) + '\n');
    equal(adaptiveNode.readReviewJournal({ planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent).reason, 'review_journal_attempt_identity_mismatch',
    'a current attempt id collision with immutable imported history fails closed');
    fs.writeFileSync(persisted.journalPath, stableChildJournal);

    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: local.attempt.attempt_id, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'prepared', 'multi-hop journal fixture prepares epoch 2 -> 3 from local attempt: '
      + JSON.stringify(prepared));
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_planner_dispatch_required', 'multi-hop journal fixture reaches second planner handoff');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    writePlannerResult(fx, tx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      'multi-hop journal fixture commits epoch 2 -> 3');
    const grandContent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const grand = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, grandContent);
    const grandAttempts = grand.ok ? adaptiveNode.reviewJournalAttempts(grand.journal) : [];
    ok(grand.ok && grandAttempts.some(row => row.attempt_id === SOURCE_ATTEMPT_ID)
      && grandAttempts.some(row => row.attempt_id === local.attempt.attempt_id)
      && grandAttempts.some(row => row.findings.some(finding => finding.id === 'R1'))
      && grandAttempts.some(row => row.findings.some(finding => finding.id === 'R2')),
    'epoch 3 resolves epoch-1 and epoch-2 attempts/findings through the recursive immutable pointer chain: '
      + JSON.stringify(grand));
    fs.writeFileSync(grand.journalPath, JSON.stringify(grand.journal, null, 2) + '\n');

    const oldestJournal = path.join(fx.cacheDir, 'epochs', '1', 'files', '.cache', 'review-attempts.json');
    fs.appendFileSync(oldestJournal, '\n');
    const nestedTamper = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, grandContent);
    equal(nestedTamper.reason, 'review_journal_legacy_import_snapshot_invalid',
      'tampering the N-2 archived journal fails the recursive legacy-import chain closed');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #703 replan resume tail: a post-dominating gate that failed on a finding spanning multiple upstream
// writers (so repair-node refuses repair_requires_replan — no unique maximal routable producer) is
// repaired by an inserted repair-writer through the committed epoch, and the child epoch RESUMES: the
// imported failed attempt is consumed (does not re-block), and a real end-to-end `open-next` proceeds
// to open the inserted writer instead of the in-place path's circular review_attempt_unresolved block.
// This is the sanctioned recovery that replaces the hand-edited-journal exit the consumer was forced
// into. childFor's fresh `child-impl` writer upstream of the `child-review` gate is exactly the
// "insert a repair-writer upstream of the failed gate" plan shape.
{
  // The condition that forces repair_requires_replan (a finding spanning multiple upstream writers with
  // no unique maximal routable producer — the real consumer bundle's n2..n7) is the DIAGNOSIS, covered by
  // the #701 ownership tests and the live-conformance block above. This block proves the RESUME the
  // in-place path lacked: after the sanctioned epoch commit, open-next proceeds instead of the circular
  // review_attempt_unresolved block. childFor's fresh `child-impl` writer upstream of the `child-review`
  // gate is exactly the "insert a repair-writer upstream of the failed gate" plan shape.
  const fx = initFixture();
  try {
    advanceToAttestedChild(fx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      '#703 inserted-writer child epoch commits (no hand-edited journal, no --freeze --repair)');
    const childContent = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const journal = adaptiveNode.readReviewJournal({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'),
      readFile: p => fs.readFileSync(p, 'utf8'), cacheExists: p => fs.existsSync(p),
    }, childContent);
    ok(journal.ok && journal.journal.legacy_import && journal.journal.legacy_import.parent_plan_hash,
      '#703 committed child receives a fresh epoch-local journal importing the immutable parent (no plan_hash-mismatch cascade)');
    const imported = adaptiveNode.reviewJournalAttempts(journal.journal);
    ok(imported.some(a => a.attempt_id === SOURCE_ATTEMPT_ID),
      '#703 the failed source attempt is imported (its fail evidence is preserved, not laundered)');
    equal(adaptiveNode.reviewJournalBlocker(journal.journal), null,
      '#703 the imported source attempt is consumed by the transition, so open-next is NOT circularly blocked');

    // The load-bearing regression: a REAL end-to-end open-next on the committed child epoch RESUMES —
    // it opens the inserted repair-writer instead of dead-ending on review_attempt_unresolved (the exact
    // in-place cascade the issue documents). Parse the last JSON line the CLI emits.
    const opened = spawnSync(process.execPath,
      [path.join(__dirname, 'kaola-workflow-adaptive-node.js'), 'open-next', '--project', fx.project, '--json'],
      { cwd: fx.root, encoding: 'utf8', timeout: 180000, killSignal: 'SIGKILL',
        env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    const openedOut = JSON.parse(String(opened.stdout || '').trim().split('\n').filter(Boolean).pop() || '{}');
    ok(openedOut.reason !== 'review_attempt_unresolved',
      '#703 open-next on the committed child does NOT reproduce the in-place circular block: ' + JSON.stringify(openedOut));
    ok(opened.status === 0 && openedOut.result === 'ok' && openedOut.opened && openedOut.opened.id === 'child-impl',
      '#703 open-next resumes the child epoch by opening the inserted repair-writer (child-impl): ' + JSON.stringify(openedOut));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #703 baseline retention: reconcile-running-set must NOT drop the barrier baseline of a COMPLETE
// producer referenced by an unresolved (consumed_by: null) review attempt's producer_bindings — that
// baseline is the repair-node non-discard recovery ref, not an orphan. A genuinely-orphaned baseline
// (no live owner, not referenced by any attempt) still sweeps. Reproduces the issue's aggravator: a
// mid-diagnosis `no_running_set` reconcile that deleted the exact files the repair needed.
{
  // sourceAttemptId 'review:1' keeps the journal plan-consistent (attempt id matches the `review` gate),
  // so readReviewJournal returns ok — the live-run state in which a mid-diagnosis reconcile fired.
  const fx = initFixture({ sourceAttemptId: 'review:1' });
  try {
    // Sanity: the settled-fail attempt is unresolved and references `impl` (a complete node) as a producer.
    const journal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
    ok(journal.attempts[0].consumed_by === null
      && Object.prototype.hasOwnProperty.call(journal.attempts[0].producer_bindings, 'impl'),
      '#703 fixture has an unresolved settled-fail attempt referencing complete producer impl');
    ok(fs.existsSync(path.join(fx.cacheDir, 'barrier-base-impl')),
      '#703 the referenced producer baseline exists on disk before reconcile');
    // A genuine orphan: no ledger row, not in the running set, not referenced by any attempt.
    fs.writeFileSync(path.join(fx.cacheDir, 'barrier-base-ghost'), 'f'.repeat(40) + '\n');
    const dropped = [];
    const shell = (_script, args) => {
      if (args.includes('--drop-base')) {
        const idx = args.indexOf('--node-id');
        const id = idx >= 0 ? args[idx + 1] : null;
        dropped.push(id);
        for (const prefix of ['barrier-base-', 'barrier-open-']) {
          try { fs.unlinkSync(path.join(fx.cacheDir, prefix + id)); } catch (_) {}
        }
        return { exitCode: 0, result: 'ok', nodeId: id };
      }
      return { exitCode: 0, result: 'ok' };
    };
    const reconciled = adaptiveNode.runReconcileRunningSet({
      planPath: path.join(fx.projectDir, 'workflow-plan.md'), project: fx.project, shell,
      readFile: p => fs.readFileSync(p, 'utf8'), writeFile: (p, v) => fs.writeFileSync(p, v),
      cacheExists: p => fs.existsSync(p), unlink: p => { try { fs.unlinkSync(p); } catch (_) {} },
    });
    equal(reconciled.result, 'ok', '#703 reconcile completes on the pre-replan serial project');
    ok(fs.existsSync(path.join(fx.cacheDir, 'barrier-base-impl')) && !dropped.includes('impl'),
      '#703 reconcile PRESERVES the baseline referenced by the unresolved attempt (repair-node recovery ref)');
    ok(!fs.existsSync(path.join(fx.cacheDir, 'barrier-base-ghost')) && (reconciled.orphanBaselinesDropped || []).includes('ghost'),
      '#703 reconcile still sweeps a genuinely-orphaned baseline: ' + JSON.stringify(reconciled.orphanBaselinesDropped));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// #706 baseline retention (ledger-complete writers, gate not yet attempted): reconcile-running-set must
// NOT drop the barrier baseline of a ledger-COMPLETE writer even when NO review attempt references it
// yet. A post-dominating gate records its FIRST attempt at ITS OWN close, and that close captures every
// complete producer's writer identity (base file + open token + anchored ref) from
// `.cache/barrier-base-<writer>` — so the #703 journal-referenced retention alone cannot protect a
// pending gate's producers. Sweeping them (as both the `no_running_set` reconcile of a crashed serial
// run and a running-set-present hygiene reconcile did) makes the later gate close refuse
// `writer_identity_unavailable`; the manual `--record-base` remedy re-anchors on the CURRENT tree and
// loses the writer's historical diff attribution. A genuinely-orphaned baseline (no ledger row — a
// discarded / never-completed node) must still sweep on BOTH paths.
function initPendingGateFixture() {
  // Journal-silent mid-run state: the `review` gate is live (in_progress) but has NOT yet recorded an
  // attempt, so retention of `impl` (complete) can only come from the ledger-complete rule.
  const fx = initFixture({ sourceAttemptId: 'review:1', seedSource: false });
  fs.rmSync(path.join(fx.cacheDir, 'review-attempts.json'), { force: true });
  fs.rmSync(path.join(fx.cacheDir, 'review.md'), { force: true });
  const planPath = path.join(fx.projectDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8')
    .replace('| review | complete |', '| review | in_progress |')
    // The gate never closed: its verdict-role compliance row must not exist yet, or the journal-absent
    // read refuses review_journal_missing instead of creating the first attempt at the gate close.
    .replace('| code-reviewer (review) | invoked | .cache/review.md | |\n', ''));
  // The live gate's own open identity (its evidence-binding nonce source).
  const gateBase = 'b'.repeat(40);
  fs.writeFileSync(path.join(fx.cacheDir, 'barrier-base-review'), gateBase + '\n');
  fs.writeFileSync(path.join(fx.cacheDir, 'barrier-open-review'), gateBase + '\n');
  // A genuine orphan: no ledger row, no running-set owner, no journal reference.
  fs.writeFileSync(path.join(fx.cacheDir, 'barrier-base-ghost'), 'f'.repeat(40) + '\n');
  // Anchored-ref store: the git-ref half of the writer identity; --drop-base removes file + ref together.
  const refs = new Map([['impl', fx.commit], ['review', gateBase], ['ghost', 'f'.repeat(40)]]);
  const dropped = [];
  const shell = (_script, args) => {
    if (args.includes('--drop-base')) {
      const idx = args.indexOf('--node-id');
      const id = idx >= 0 ? args[idx + 1] : null;
      dropped.push(id);
      refs.delete(id);
      for (const prefix of ['barrier-base-', 'barrier-open-']) {
        try { fs.unlinkSync(path.join(fx.cacheDir, prefix + id)); } catch (_) {}
      }
      return { exitCode: 0, result: 'ok', nodeId: id };
    }
    if (args.includes('--resume-check')) return { exitCode: 0, ok: true };
    return { exitCode: 0, result: 'ok', ok: true, overallOk: true,
      selectorCheck: { isSelector: false, ok: true } };
  };
  const common = {
    planPath, project: fx.project, shell,
    readFile: p => fs.readFileSync(p, 'utf8'), writeFile: (p, v) => fs.writeFileSync(p, v),
    cacheExists: p => fs.existsSync(p), unlink: p => { try { fs.unlinkSync(p); } catch (_) {} },
    readdir: p => fs.readdirSync(p),
    resolveBarrierRef: (_ref, id) => refs.get(id) || '',
    computeReviewCandidateDigest: () => 'c'.repeat(64),
    // NO captureWriterBarrierIdentity injection: the REAL capture must read the on-disk identity —
    // exactly the seam that refused writer_identity_unavailable after the buggy sweep.
  };
  // The gate close: record pass evidence bound to the live generation, then a real runCloseNode.
  const closeGate = () => {
    fs.writeFileSync(path.join(fx.cacheDir, 'review.md'), [
      'evidence-binding: review ' + gateBase.slice(0, 12),
      'verdict: pass', 'findings_blocking: 0', '',
    ].join('\n'));
    return adaptiveNode.runCloseNode({ ...common, nodeId: 'review' });
  };
  return { fx, refs, dropped, common, closeGate };
}

// #706 shape (i) — the close-crash / hygiene reconcile with a running set PRESENT: a ledger-complete
// writer still in the 'open' set (its close's running-set removal crashed) is dropped FROM THE SET, but
// its baseline is RETAINED, and the pending post-dominating gate then closes successfully.
{
  const h = initPendingGateFixture();
  try {
    fs.writeFileSync(path.join(h.fx.cacheDir, 'running-set.json'), JSON.stringify({
      state: 'open', nodes: [
        { id: 'impl', role: 'tdd-guide', kind: 'write', baseline: 'recorded' },
        { id: 'review', role: 'code-reviewer', kind: 'read', baseline: 'recorded' },
      ] }, null, 2));
    const reconciled = adaptiveNode.runReconcileRunningSet(h.common);
    equal(reconciled.result, 'ok', '#706(i) reconcile completes on the close-crash running set');
    ok(reconciled.reconciled === true && (reconciled.closedDropped || []).includes('impl'),
      '#706(i) the terminal member leaves the running set (close-crash repair): '
      + JSON.stringify({ reconciled: reconciled.reconciled, closedDropped: reconciled.closedDropped }));
    ok(fs.existsSync(path.join(h.fx.cacheDir, 'barrier-base-impl'))
      && fs.existsSync(path.join(h.fx.cacheDir, 'barrier-open-impl'))
      && !h.dropped.includes('impl'),
    '#706(i) the ledger-complete writer KEEPS its baseline identity (a successful close would have kept it), '
      + 'dropped=' + JSON.stringify(h.dropped));
    ok(!fs.existsSync(path.join(h.fx.cacheDir, 'barrier-base-ghost'))
      && (reconciled.orphanBaselinesDropped || []).includes('ghost'),
    '#706(i) a genuinely-orphaned baseline still sweeps: ' + JSON.stringify(reconciled.orphanBaselinesDropped));
    const closed = h.closeGate();
    ok(closed.reason !== 'writer_identity_unavailable',
      '#706(i) the gate close no longer refuses writer_identity_unavailable: ' + JSON.stringify(closed));
    equal(closed.result, 'ok', '#706(i) the post-dominating gate close SUCCEEDS after reconcile '
      + '(no manual --record-base remedy): ' + JSON.stringify(closed));
    const journal = JSON.parse(fs.readFileSync(path.join(h.fx.cacheDir, 'review-attempts.json'), 'utf8'));
    equal(journal.attempts[0].producer_bindings.impl.baseline, h.fx.commit,
      '#706(i) the attempt binds the writer ORIGINAL baseline (historical diff attribution intact, '
      + 'not a semantically-weaker current-tree re-record)');
  } finally { fs.rmSync(h.fx.root, { recursive: true, force: true }); }
}

// #706 shape (ii) — the `no_running_set` path (a crashed serial run: open-next writes no manifest): the
// reconcile still reports reconciled:false, but its hoisted orphan sweep must not drop ledger-complete
// writers' baselines. The sweep itself stays (its crash-repair purpose: reclaiming baselines of
// discarded / never-completed nodes, which would otherwise be silently reused by a later open) — proven
// by the ghost still sweeping on this same run.
{
  const h = initPendingGateFixture();
  try {
    ok(!fs.existsSync(path.join(h.fx.cacheDir, 'running-set.json')),
      '#706(ii) precondition: no running-set.json (serial run)');
    const reconciled = adaptiveNode.runReconcileRunningSet(h.common);
    equal(reconciled.result, 'ok', '#706(ii) reconcile returns ok on the manifest-less project');
    ok(reconciled.reconciled === false && reconciled.reason === 'no_running_set',
      '#706(ii) the manifest-less reconcile stays a no-transaction report: '
      + JSON.stringify({ reconciled: reconciled.reconciled, reason: reconciled.reason }));
    ok(fs.existsSync(path.join(h.fx.cacheDir, 'barrier-base-impl'))
      && fs.existsSync(path.join(h.fx.cacheDir, 'barrier-open-impl'))
      && !h.dropped.includes('impl')
      && !(reconciled.orphanBaselinesDropped || []).includes('impl'),
    '#706(ii) the no_running_set sweep RETAINS the ledger-complete writer baseline (pre-fix it reported '
      + 'it in orphanBaselinesDropped), got ' + JSON.stringify(reconciled.orphanBaselinesDropped));
    ok(!fs.existsSync(path.join(h.fx.cacheDir, 'barrier-base-ghost'))
      && (reconciled.orphanBaselinesDropped || []).includes('ghost'),
    '#706(ii) a genuinely-orphaned baseline still sweeps on the no_running_set path: '
      + JSON.stringify(reconciled.orphanBaselinesDropped));
    const closed = h.closeGate();
    ok(closed.reason !== 'writer_identity_unavailable',
      '#706(ii) the gate close no longer refuses writer_identity_unavailable: ' + JSON.stringify(closed));
    equal(closed.result, 'ok', '#706(ii) the post-dominating gate close SUCCEEDS after the manifest-less '
      + 'reconcile: ' + JSON.stringify(closed));
  } finally { fs.rmSync(h.fx.root, { recursive: true, force: true }); }
}

// Schema-2 replan source authority. `readSource` verifies TWO bindings on the parent review
// attempt: the sealed candidate identity, and the per-node evidence receipts. Both are shape-
// dependent, and both must accept the schema-2 shape without ever accepting a genuine divergence:
//   * candidate — a contract-2 attempt seals the validation runner's LANDABLE tree digest; only a
//     contract-1 attempt sealed the legacy raw ls-tree digest.
//   * evidence  — a schema-2 receipt binds its bytes with `raw_evidence_sha256` and embeds no body;
//     only a schema-1 receipt carries the `body` + `receipt_sha256` pair.
{
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx);
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: v2.attempt.attempt_id, transitionReason: 'review_repair_requires_replan' });
    notEqualReason(prepared, 'replan_source_candidate_changed',
      'an unmutated schema-2 candidate is verified against the digest algorithm that sealed it');
    notEqualReason(prepared, 'replan_source_evidence_mismatch',
      'a schema-2 receipt binding unmutated evidence through raw_evidence_sha256 verifies');
    equal(prepared.result, 'prepared',
      'a production-shaped schema-2 review source reaches the planner handoff: ' + JSON.stringify(prepared));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  // Anti-loosening: a genuine change inside the reviewed candidate band still refuses.
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx);
    fs.writeFileSync(path.join(fx.root, 'product.js'), 'module.exports = 99;\n');
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: v2.attempt.attempt_id, transitionReason: 'review_repair_requires_replan' }).reason,
    'replan_source_candidate_changed',
    'a genuine landable-band code change still refuses the schema-2 candidate');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  // The reviewed candidate band is the landable tree: validation-invisible prose the reviewer never
  // bound must not masquerade as a candidate change.
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx);
    fs.writeFileSync(path.join(fx.root, 'README.md'), '# fixture CHANGED\n');
    notEqualReason(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: v2.attempt.attempt_id, transitionReason: 'review_repair_requires_replan' }),
    'replan_source_candidate_changed',
    'a validation-invisible prose edit does not fake a schema-2 candidate change');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  // Anti-loosening: one mutated evidence byte still refuses under the schema-2 raw-digest binding.
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx);
    fs.appendFileSync(path.join(fx.cacheDir, v2.reviewId + '.md'), 'x');
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: v2.attempt.attempt_id, transitionReason: 'review_repair_requires_replan' }).reason,
    'replan_source_evidence_mismatch',
    'a single mutated evidence byte still refuses under the schema-2 raw-digest binding');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
// LEGACY-LANE REGRESSION PIN. The schema-1 lane is not dead code: it still seals the raw ls-tree
// candidate digest and legacy body/receipt_sha256 receipts, and its attempts carry NO
// `contract_version` key. This block exists so a future refactor cannot quietly collapse the two
// shapes into one — remove it only together with the schema-1 producer.
{
  const fx = initFixture();
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
    equal(journal.schema_version, 1, 'the legacy fixture journal stays schema-1');
    ok(!Object.prototype.hasOwnProperty.call(journal.attempts[0], 'contract_version'),
      'the legacy fixture attempt carries no contract_version, so the raw-digest comparison keeps a live test');
    ok(typeof journal.attempts[0].receipts[0].body === 'string'
      && typeof journal.attempts[0].receipts[0].receipt_sha256 === 'string'
      && journal.attempts[0].receipts[0].raw_evidence_sha256 === undefined,
    'the legacy fixture receipt keeps the embedded body/receipt_sha256 binding');
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' }).result,
    'prepared', 'a contract-1 attempt still verifies against the legacy raw candidate digest');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  const fx = initFixture();
  try {
    fs.writeFileSync(path.join(fx.root, 'product.js'), 'module.exports = 99;\n');
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' }).reason,
    'replan_source_candidate_changed',
    'a contract-1 attempt still refuses a genuinely changed raw candidate');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}
{
  const fx = initFixture();
  try {
    fs.appendFileSync(path.join(fx.cacheDir, 'review.md'), 'x');
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' }).reason,
    'replan_source_evidence_mismatch',
    'a contract-1 attempt still refuses a mutated legacy receipt body');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #737: the planner attests the image it AUTHORED. `resume` owns the freeze that
// stamps plan_hash (and, for schema-2, seeds Required Agent Compliance), so the
// frozen bytes legally differ from the attested bytes. The transaction records the
// authored witness pair (`child_authored.digest` / `.frozen_digest`) at freeze time
// and every downstream identity seam is then pure digest arithmetic over bytes that
// are already recorded. No seam may re-derive the stamp by calling freezePlan /
// validatePlan / reading the live worktree: the declared_write_set walls are
// deliberately freeze-only "so a legacy in-flight plan never bricks", and
// re-applying them at audit time would retroactively invalidate sealed epochs.
// ---------------------------------------------------------------------------

// Writes the UNSTAMPED image a planner authors plus a fresh attestation over exactly
// those bytes. Every call re-attests, which is what makes the bounded child-repair
// loop (invalid child -> repair -> re-attest, all inside one transaction) testable.
function authoredChild(fx, tx, mutate) {
  const stamped = childFor(tx, fx.project);
  let text = stamped.text.replace(/\n\n<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->\n/, '\n');
  if (typeof mutate === 'function') text = mutate(text);
  fs.writeFileSync(path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME), text);
  const attestation = writePlannerAttestationForExistingChild(fx, tx);
  return { text, attestation, stamped_plan_hash: stamped.hash };
}

// A forged image that shares the frozen child's plan_hash but differs in bytes.
// computePlanHash covers only Meta + Nodes (+ Node Briefs), so a trailing edit is
// hash-neutral — any seam that compared plan hashes instead of digests would admit it.
function hashPreservingForgery(text) {
  return String(text) + '<!-- forged authored image -->\n';
}

// (a) Re-attestation inside ONE live transaction converges. The planner's first
// authored image is invalid; it repairs and RE-ATTESTS without a new transaction.
// (c) rides on the same fixture: the sealed epoch must stay verifiable after the
// live worktree is mutated in a way that would fail a freeze-mode revalidation.
{
  const fx = initFixture();
  try {
    const tx = advanceToAttestedChild(fx);
    const childPath = path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME);

    authoredChild(fx, tx, text => text.replace('| child-impl | tdd-guide |', '| child-impl | not-a-role |'));
    const invalid = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(invalid.reason, 'replan_child_invalid',
      'an invalid unstamped authored child refuses: ' + JSON.stringify(invalid));
    const pendingTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(pendingTx.phase, 'planner_pending', 'the refused child leaves planner_pending authoritative');
    equal(pendingTx.cas.pre_freeze.result, 'match', 'the pre-freeze CAS receipt is already durable');

    const repaired = authoredChild(fx, pendingTx);
    const authoredDigest = sha256(fs.readFileSync(childPath));
    equal(repaired.attestation.child_digest, authoredDigest,
      're-attestation signs exactly the repaired authored image');

    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed',
      'a re-authored + re-attested unstamped child converges in the same transaction: '
        + JSON.stringify(committed));

    const sealed = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    ok(sealed.child.digest !== authoredDigest,
      'the freeze genuinely moved the attested bytes (otherwise this test pins nothing)');
    equal(sealed.child_authored.digest, authoredDigest,
      'the transaction records the authored image digest the planner signed');
    equal(sealed.child_authored.frozen_digest, sealed.child.digest,
      'the transaction records the frozen witness digest produced by that same freeze');
    equal(sealed.child_authored.attestation_digest, repaired.attestation.attestation_digest,
      'the authored record is bound to the attestation that signed it');
    equal(sha256(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'))), sealed.child.digest,
      'the promoted plan is the frozen image, not the authored one');

    const snapshots = replan.verifyAllEpochSnapshots(fx.projectDir);
    ok(snapshots.ok, 'the sealed epoch verifies with an authored attestation: ' + JSON.stringify(snapshots));

    // (c) ARCHIVE PURITY. `product.js` is a declared_write_set token of the sealed
    // child; turning it into a directory reds the freeze-only `directory_shaped_bare`
    // wall. The archive is immutable, so a seam that re-derived the stamp here would
    // brick a committed epoch with no repair path.
    fs.unlinkSync(path.join(fx.root, 'product.js'));
    fs.mkdirSync(path.join(fx.root, 'product.js'));
    ok(validator.freezePlan(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8'),
      { root: fx.root }).frozen !== true,
    'the mutated live tree really does fail a freeze-mode revalidation of the sealed child');
    const afterMutation = replan.verifyAllEpochSnapshots(fx.projectDir);
    ok(afterMutation.ok,
      'a sealed epoch snapshot stays verifiable when the live worktree changes — identity seams '
        + 'are pure digest arithmetic and never re-derive the stamp: ' + JSON.stringify(afterMutation));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// (d) The freeze MOVES bytes on disk before the child_frozen journal is durable.
// A crash in that gap must roll forward from the recorded authored image, not wedge
// on an attestation that no longer matches the file.
{
  const fx = initFixture();
  try {
    const tx = advanceToAttestedChild(fx);
    const childPath = path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME);
    const authored = authoredChild(fx, tx);
    const authoredDigest = sha256(fs.readFileSync(childPath));

    let crash = null;
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_child_frozen_bytes') throw new Error('stop_after_handoff_freeze'); } });
    } catch (error) { crash = error.message; }
    equal(crash, 'stop_after_handoff_freeze', 'the authored-child freeze crash seam fires before journaling');
    const midTx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(midTx.phase, 'planner_pending', 'the crash leaves planner_pending authoritative');
    equal(midTx.child_authored.digest, authoredDigest,
      'the authored image is durable before any freeze can move the bytes');
    ok(sha256(fs.readFileSync(childPath)) !== authoredDigest,
      'the crash really did leave frozen bytes where the attested image used to be');

    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed',
      'the freeze/journal gap rolls forward from the recorded authored image: ' + JSON.stringify(committed));
    const sealed = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(sealed.child_authored.attestation_digest, authored.attestation.attestation_digest,
      'the replay commits under the original planner attestation');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// (b) FORGED AUTHORED IMAGE. The recorded authored bytes are byte-pinned to their own
// digest and to the attestation. A forgery that only preserves plan_hash is refused.
for (const variant of ['forged_bytes', 'unbound_digest']) {
  const fx = initFixture();
  try {
    const tx = advanceToAttestedChild(fx);
    const childPath = path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME);
    authoredChild(fx, tx);
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_child_frozen_bytes') throw new Error('stop'); } });
    } catch (_) {}
    const txPath = path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME);
    const midTx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
    equal(midTx.phase, 'planner_pending', variant + ' fixture stops in the freeze/journal gap');
    const realAuthored = Buffer.from(midTx.child_authored.bytes_base64, 'base64').toString('utf8');
    const forged = hashPreservingForgery(realAuthored);
    equal(validator.computePlanHash(forged), validator.computePlanHash(realAuthored),
      variant + ' forgery shares the authored image plan_hash (the non-hash-covered edit is real)');
    ok(sha256(Buffer.from(forged, 'utf8')) !== midTx.child_authored.digest,
      variant + ' forgery is a genuinely different image');
    // forged_bytes: the recorded image no longer hashes to its own recorded digest.
    // unbound_digest: a self-consistent forged record that the attestation never signed.
    midTx.child_authored.bytes_base64 = Buffer.from(forged, 'utf8').toString('base64');
    if (variant === 'unbound_digest') midTx.child_authored.digest = sha256(Buffer.from(forged, 'utf8'));
    fs.writeFileSync(txPath, JSON.stringify(midTx, null, 2) + '\n');
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.reason, 'replan_planner_attestation_invalid',
      variant + ' forged authored image is refused, not admitted on a shared plan_hash: '
        + JSON.stringify(result));
    ok(fs.existsSync(childPath), variant + ' refusal leaves the child path in place');
    equal(authorityCardinalities(fx).snapshots, 0, variant + ' forgery creates no epoch snapshot');
    equal(authorityCardinalities(fx).epoch, 1, variant + ' forgery advances no epoch');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// (b, archive seam) The sealed epoch binds the authored attestation through the exact
// frozen witness digest. A forged witness that only preserves the sealed child's
// plan_hash is refused — the seam compares digests, never plan hashes.
{
  const fx = initFixture();
  try {
    const tx = advanceToAttestedChild(fx);
    authoredChild(fx, tx);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      'the archive-forgery fixture commits an authored-attestation epoch');
    ok(replan.verifySnapshotManifest(path.join(fx.cacheDir, 'epochs', '1')).ok,
      'the authored-attestation epoch seals cleanly before tampering');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-737-forge-'));
    try {
      const projectDir = path.join(root, fx.project);
      fs.cpSync(fx.projectDir, projectDir, { recursive: true });
      const epochDir = path.join(projectDir, '.cache', 'epochs', '1');
      const frozenChild = fs.readFileSync(path.join(epochDir, 'files', schema.REPLAN_PLAN_NEXT_NAME), 'utf8');
      const forged = hashPreservingForgery(frozenChild);
      equal(validator.computePlanHash(forged), validator.computePlanHash(frozenChild),
        'the forged frozen witness shares the sealed child plan_hash');

      const txRel = '.cache/' + schema.REPLAN_TRANSACTION_NAME;
      const txFile = path.join(epochDir, 'files', '.cache', schema.REPLAN_TRANSACTION_NAME);
      const archived = JSON.parse(fs.readFileSync(txFile, 'utf8'));
      ok(archived.child_authored && archived.child_authored.digest !== archived.child.digest
        && archived.child_authored.frozen_digest === archived.child.digest,
      'the sealed transaction carries the authored/frozen witness pair');
      archived.child_authored.frozen_digest = sha256(Buffer.from(forged, 'utf8'));
      const bytes = Buffer.from(JSON.stringify(archived, null, 2) + '\n', 'utf8');
      fs.writeFileSync(txFile, bytes);

      const manifestPath = path.join(epochDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const row = manifest.files.find(file => file.path === txRel);
      ok(!!row, 'the sealed manifest indexes the archived transaction');
      row.digest = sha256(bytes);
      row.size = bytes.length;
      manifest.manifest_self_digest = schema.snapshotManifestDigest(manifest);
      fs.writeFileSync(manifestPath, schema.canonicalJson(manifest) + '\n');

      const result = replan.verifySnapshotManifest(epochDir);
      equal(result.reason, 'snapshot_child_binding_invalid',
        'a forged frozen witness sharing the sealed plan_hash is refused: ' + JSON.stringify(result));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// A settled failed review folds ledger rows back to `pending` and returns without
// regenerating the derived task mirror. The mirror is a pure projection of the plan
// (source hash + one row per node, all re-derived from the same bytes the authority
// already parsed), so a not-yet-regenerated mirror is a lag in a regenerable file,
// never a divergent authority — current-epoch authority must survive it. The guard
// below proves the assertion is not vacuous: the SAME lagging-mirror state, mutated
// into a genuinely illegal ledger progression, still refuses.
{
  const fx = initFixture();
  try {
    driveReplanToCommit(fx);
    const planPath = path.join(fx.projectDir, 'workflow-plan.md');
    const tasksPath = path.join(fx.projectDir, 'workflow-tasks.json');
    const nodes = validator.parseNodes(fs.readFileSync(planPath, 'utf8'));
    const writer = nodes[0];
    const gate = nodes[1];

    // Run the child epoch forward to the shape a live gate has: writer complete, gate live.
    const setRow = (text, id, status) => text.replace(
      new RegExp('^\\| ' + id + ' \\| (?:pending|in_progress|complete) \\|$', 'm'),
      `| ${id} | ${status} |`);
    let progressed = setRow(fs.readFileSync(planPath, 'utf8'), writer.id, 'complete');
    progressed = progressed.replace(
      new RegExp('^\\| ' + writer.role + ' \\(' + writer.id + '\\) \\| pending \\| \\| \\|$', 'm'),
      `| ${writer.role} (${writer.id}) | invoked | .cache/${writer.id}.md | |`);
    progressed = setRow(progressed, gate.id, 'in_progress');
    fs.writeFileSync(path.join(fx.cacheDir, writer.id + '.md'),
      `evidence-binding: ${writer.id} progress-proof\nGREEN: legal runtime progress\n`);
    fs.writeFileSync(planPath, progressed);
    fs.writeFileSync(tasksPath, JSON.stringify(
      generateMirror({ planContent: progressed, now: '2026-07-21T00:00:00.000Z' }), null, 2) + '\n');
    ok(replan.verifyCurrentEpochAuthority(fx.projectDir).ok,
      'baseline: the live-gate child epoch holds current authority with a freshly derived mirror');

    // The settlement transaction: fold the gate row back to `pending`, write the plan, return.
    // No mirror regeneration — exactly what prepareSchema2ReviewClose / prepareReviewClose do.
    const folded = setRow(fs.readFileSync(planPath, 'utf8'), gate.id, 'pending');
    fs.writeFileSync(planPath, folded);
    const staleMirror = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
    equal(staleMirror.tasks.find(task => task.id === gate.id).ledger_status, 'in_progress',
      'the settlement leaves the mirror reporting the pre-fold status');
    const afterFold = replan.verifyCurrentEpochAuthority(fx.projectDir);
    ok(afterFold.ok && afterFold.authority_kind === 'planned',
      'a settlement-folded ledger KEEPS current-epoch authority while its derived task mirror '
      + 'still reports the pre-fold status: ' + JSON.stringify(afterFold));

    // Non-tautology guard: the SAME lagging mirror over a genuinely illegal ledger
    // progression (a settled row above a `pending` dependency) must still refuse.
    const illegal = setRow(folded, nodes[2].id, 'complete');
    fs.writeFileSync(planPath, illegal);
    equal(replan.verifyCurrentEpochAuthority(fx.projectDir).reason, 'state_ledger_progress_invalid',
      'the lagging mirror does not launder an illegal ledger progression — a `complete` row above a '
      + '`pending` dependency still refuses, so the authority function is not merely gutted');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #722 — cross-epoch schema-2 journal rotation. Activation deliberately PRESERVES
// `.cache/review-attempts.json` (it is absent from cleanupAllowed, because cross-epoch
// review history is indexed by scope lineage), so after a committed repair->replan the
// ACTIVE journal is still bound to the PARENT plan_hash until the child epoch's first
// attempt lands. The child epoch's first review gate must still OPEN, run, and CLOSE.
//
// Driven through the REAL transaction path (prepareReplan/resumeReplan to `committed`)
// and the REAL node lifecycle (runOpenNext -> runRecordEvidence -> runCloseNode), so
// every seal — snapshot manifest, legacy-import pointer, review context, receipt — is
// genuine rather than hand-built.
//
// Both parent-journal schemas are covered, because they must route to DIFFERENT lanes:
//   * schema-1 parent -> schema-1 child journal -> the child's gate closes continue the
//     imported schema-1 attempt chain (the pre-existing #699 contract).
//   * schema-2 parent -> schema-2 child journal -> the child's gates stay on the V2
//     candidate/context-bound lane their own plan contract requires.
// ---------------------------------------------------------------------------
{
  const io = {
    readFile: p => fs.readFileSync(p, 'utf8'),
    writeFile: (p, value) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, value); },
    mkdirp: p => fs.mkdirSync(p, { recursive: true }),
    cacheExists: p => fs.existsSync(p),
    unlink: p => fs.unlinkSync(p),
  };

  // Runs the child epoch forward to the frontier a live gate sees: writer complete with
  // evidence on disk, gate pending with its open-time baseline recorded.
  const stageChildFrontier = (fx, nonce) => {
    const planPath = path.join(fx.projectDir, 'workflow-plan.md');
    let plan = fs.readFileSync(planPath, 'utf8');
    const nodes = validator.parseNodes(plan);
    const writer = nodes[0];
    const gate = nodes.find(node => node.role === 'code-reviewer');
    plan = plan
      .replace(new RegExp('^\\| ' + writer.id + ' \\| pending \\|$', 'm'), `| ${writer.id} | complete |`)
      .replace(new RegExp('^\\| ' + writer.role + ' \\(' + writer.id + '\\) \\| pending \\| \\| \\|$', 'm'),
        `| ${writer.role} (${writer.id}) | invoked | .cache/${writer.id}.md | |`);
    fs.writeFileSync(planPath, plan);
    fs.writeFileSync(path.join(fx.cacheDir, writer.id + '.md'),
      `evidence-binding: ${writer.id} progress-proof\nGREEN: legal runtime progress\n`);
    fs.writeFileSync(path.join(fx.cacheDir, 'barrier-base-' + gate.id), nonce + 'trailing\n');
    const shell = (script, args) => {
      const base = path.basename(script);
      if (base === 'kaola-workflow-next-action.js') {
        return { exitCode: 0, result: 'ok', readySet: [{ id: gate.id, role: gate.role }],
          readyPending: [{ id: gate.id, role: gate.role }], nextNode: { id: gate.id, role: gate.role } };
      }
      if (base === 'kaola-workflow-commit-node.js') {
        return { exitCode: 0, result: 'ok', overallOk: true, recordBase: { base: nonce + 'trailing' },
          selectorCheck: { isSelector: false, ok: true } };
      }
      return { exitCode: 0, ok: true };
    };
    return { planPath, writer, gate, shell };
  };

  for (const parentJournalSchema of [2, 1]) {
    const label = '#722 (schema-' + parentJournalSchema + ' parent journal)';
    const fx = initFixture();
    try {
      if (parentJournalSchema === 2) {
        const v2 = installReviewJournalV2Source(fx);
        fx.sourceAttemptId = v2.attempt.attempt_id;
      }
      equal(driveReplanToCommit(fx).result, 'committed', label + ' commits the repair->replan transaction');

      const parentBoundJournal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
      const childPlanHash = validator.readStoredHash(
        fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8'));
      equal(parentBoundJournal.schema_version, parentJournalSchema,
        label + ' the activated epoch preserves the parent journal at its own schema');
      ok(parentBoundJournal.plan_hash !== childPlanHash,
        label + ' the preserved journal is still bound to the PARENT plan_hash — the exact state that '
        + 'wedged the child epoch on review_journal_plan_hash_mismatch');

      const nonce = 'a'.repeat(12);
      const { planPath, gate, shell } = stageChildFrontier(fx, nonce);

      const opened = adaptiveNode.runOpenNext({
        planPath, statePath: path.join(fx.projectDir, 'workflow-state.md'), project: fx.project,
        nodeId: gate.id, repoRoot: fx.root, shell, ...io,
      });
      notEqualReason(opened, 'review_journal_plan_hash_mismatch',
        label + ' the child epoch first gate OPEN does not refuse on the parent-bound journal');
      notEqualReason(opened, 'review_journal_version_mismatch',
        label + ' the child epoch first gate OPEN does not refuse on the parent journal schema');
      equal(opened.result, 'ok', label + ' the child epoch first gate OPENS: ' + JSON.stringify(opened));

      // The open routes the gate onto the lane its journal schema dictates, and the required-token
      // set is the observable witness of that routing.
      const tokens = opened.opened.required_tokens;
      if (parentJournalSchema === 2) {
        ok(tokens.includes('review_context_hash') && tokens.includes('domain_outcome')
          && !tokens.includes('verdict'),
        label + ' a schema-2 parent keeps the child gate on the V2 lane: ' + JSON.stringify(tokens));
      } else {
        ok(tokens.includes('verdict') && !tokens.includes('review_context_hash'),
          label + ' a schema-1 parent keeps the child gate on the imported schema-1 lane: '
          + JSON.stringify(tokens));
      }

      const dispatch = opened.opened.dispatch;
      const body = parentJournalSchema === 2 ? [
        'evidence-binding: ' + gate.id + ' ' + nonce,
        'contract_version: 2',
        'review_context_hash: ' + dispatch.review_context_hash,
        'behavior_contract_hash: ' + dispatch.behavior_contract_hash,
        'resolved_profile_hash: ' + dispatch.resolved_profile_hash,
        'candidate_digest: ' + dispatch.candidate_digest,
        'domain_outcome: approved',
        'gate_claim: ' + dispatch.gate_claim,
        'gate_surface: ' + dispatch.gate_surface,
        'gate_aggregation: ' + dispatch.gate_aggregation,
        'findings_none: true', '',
      ].join('\n') : [
        'evidence-binding: ' + gate.id + ' ' + nonce,
        'verdict: pass', 'findings_blocking: 0', '',
      ].join('\n');
      equal(adaptiveNode.runRecordEvidence({ planPath, project: fx.project, nodeId: gate.id,
        stdinContent: body, ...io }).result, 'ok',
      label + ' the child epoch gate records its reviewer evidence');

      const closed = adaptiveNode.runCloseNode({
        planPath, project: fx.project, nodeId: gate.id, repoRoot: fx.root, shell, ...io,
        captureWriterBarrierIdentity: id => ({ baseline: fx.commit, anchored_ref: fx.commit,
          open_token: 'open-' + id, generation: fx.commit.slice(0, 12),
          ref: 'refs/kaola-workflow/barrier/' + fx.project + '/' + id }),
      });
      notEqualReason(closed, 'review_journal_plan_hash_mismatch',
        label + ' the child epoch first gate CLOSE does not refuse on the parent-bound journal');
      equal(closed.result, 'ok', label + ' the child epoch first gate CLOSES: ' + JSON.stringify(closed));

      // The child journal is now persisted. It must be bound to the CHILD plan hash, carry the
      // child's own attempt at its own schema, and still resolve the immutable parent history.
      const persisted = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
      equal(persisted.plan_hash, childPlanHash, label + ' the persisted child journal binds the CHILD plan hash');
      equal(persisted.schema_version, parentJournalSchema,
        label + ' the persisted child journal inherits the parent journal schema');
      equal(persisted.attempts.length, 1, label + ' the child epoch attempt persists locally');
      ok(!!persisted.legacy_import && persisted.legacy_import.parent_plan_hash === parentBoundJournal.plan_hash,
        label + ' the persisted child journal keeps the immutable parent import pointer');

      const reread = adaptiveNode.readReviewJournal({ planPath, ...io }, fs.readFileSync(planPath, 'utf8'));
      ok(reread.ok, label + ' the persisted child journal rereads: ' + JSON.stringify(reread));
      const allAttempts = adaptiveNode.reviewJournalAttempts(reread.journal);
      equal(allAttempts.length, 2,
        label + ' the reread claim-scoped view still resolves the parent attempt PLUS the child attempt — '
        + 'the rotation preserves audit history rather than dropping it');
      equal(adaptiveNode.reviewJournalBlocker(reread.journal), null,
        label + ' the consumed parent attempt does not re-block the child epoch');

      // ANTI-LOOSENING: the plan_hash binding that makes the mismatch detectable is intact. A journal
      // that DECLARES a cross-epoch import with no committed transaction backing it still fails closed,
      // and so does a pointer tampered away from the sealed transaction's canonical one.
      const stable = fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8');
      const tampered = JSON.parse(stable);
      tampered.legacy_import.snapshot_path = '../attacker/review-attempts.json';
      fs.writeFileSync(path.join(fx.cacheDir, 'review-attempts.json'), JSON.stringify(tampered, null, 2) + '\n');
      equal(adaptiveNode.readReviewJournal({ planPath, ...io },
        fs.readFileSync(planPath, 'utf8')).reason, 'review_journal_legacy_import_mismatch',
      label + ' a tampered import pointer on the rotated child journal still fails closed');

      const orphaned = JSON.parse(stable);
      delete orphaned.legacy_import;
      fs.writeFileSync(path.join(fx.cacheDir, 'review-attempts.json'), JSON.stringify(orphaned, null, 2) + '\n');
      // Both lanes fail closed; they just refuse at different walls. A schema-2 child loses its proven
      // pointer and refuses on the import comparison; a schema-1 child ALSO loses the cross-epoch
      // exemption that let a schema-1 journal live under a schema-2 plan at all, so it refuses one wall
      // earlier on the version mismatch.
      equal(adaptiveNode.readReviewJournal({ planPath, ...io },
        fs.readFileSync(planPath, 'utf8')).reason,
      parentJournalSchema === 2 ? 'review_journal_legacy_import_mismatch' : 'review_journal_version_mismatch',
      label + ' a child journal that DROPS the import pointer under a committed transaction fails closed');

      fs.writeFileSync(path.join(fx.cacheDir, 'review-attempts.json'), stable);
      fs.unlinkSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME));
      equal(adaptiveNode.readReviewJournal({ planPath, ...io },
        fs.readFileSync(planPath, 'utf8')).reason, 'review_journal_legacy_import_transaction_invalid',
      label + ' a declared import with NO committed transaction behind it still fails closed — the '
        + 'rotation is gated on proven provenance, never on bare key presence');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

// ---------------------------------------------------------------------------
// #729 — REPLAN-SIDE FRONTIER INVARIANT (defence in depth over the #728 settlement
// guard). A settled FAILED review attempt whose canonical `findings` array is EMPTY
// carries no record of what failed, so the child epoch it authorizes has nothing to
// repair — the live financial-agent#332 epoch-2 plan was read-only adversary -> docs
// writer -> review, and the same defect was rediscovered, costing another epoch.
//
// #728 closed the PRODUCER seam (a failed schema-2 gate can no longer SETTLE with an
// empty open frontier). This pins the CONSUMER seam independently: a corrupted, hand
// -written, or pre-#728 journal must fail closed here too, and the refusal must be
// typed rather than a silent pass.
//
// Three frontiers reach the mechanism and each is pinned separately:
//   1. readSource        — prepare, and every resume phase via verifySourceAuthority.
//   2. buildPlannerPacket — the packet the child planner actually consumes; reachable
//      with an empty array even when readSource is clean, because a transaction on
//      disk carries its own copy of `source.findings` that validateReplanTransaction
//      does not recompute.
//   3. reauthorCandidate — the candidate-changed re-author, which rebuilds a
//      transaction from the STORED source without re-reading the journal.
// ---------------------------------------------------------------------------
function installEmptyFrontierSource(fx) {
  const journalPath = path.join(fx.cacheDir, 'review-attempts.json');
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
  const attempt = journal.attempts[0];
  const receipt = attempt.receipts[0];
  // The exact live shape: verdict:fail with no structured finding row at all. The
  // journal stays production-valid — validateReviewJournal recomputes findings FROM
  // the receipt bodies, so zero rows means zero canonical findings, legally.
  const body = [`evidence-binding: ${receipt.node_id} ${receipt.generation}`,
    'verdict: fail', 'findings_blocking: 0', ''].join('\n');
  receipt.body = body;
  receipt.receipt_sha256 = sha256(Buffer.from(body));
  receipt.findings_blocking = 0;
  receipt.effective_pass = false;
  receipt.verdict = 'fail';
  attempt.findings = [];
  attempt.route_candidates = [];
  attempt.outcome = 'fail';
  attempt.reason = 'verdict_not_pass';
  fs.writeFileSync(path.join(fx.cacheDir, receipt.node_id + '.md'), body);
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
  writeSchema2RepairSource(fx, journal, attempt);
  return { journal, attempt, body };
}

{
  // Frontier 1 — prepare. The malformed source never opens a transaction.
  const fx = initFixture();
  try {
    installEmptyFrontierSource(fx);
    const planBefore = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const stateBefore = fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8');
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.result, 'refuse',
      'a settled failed review source with an EMPTY canonical frontier is refused, never prepared: '
      + JSON.stringify(prepared));
    equal(prepared.reason, 'replan_source_findings_missing',
      'the empty-frontier refusal is typed, and is not a generic journal/authority reason: '
      + JSON.stringify(prepared));
    ok(!fs.existsSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME)),
      'the empty-frontier refusal opens no replan transaction');
    equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8'), planBefore,
      'the empty-frontier refusal preserves the frozen parent plan bytes');
    equal(fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8'), stateBefore,
      'the empty-frontier refusal writes no state fence');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // Frontier 1 — the schema-2 review lane reaches the same wall. Its canonical finding
  // set is normalized/UID-bearing rather than parsed from flat rows, so the guard must
  // not be accidentally bound to the schema-1 shape.
  //
  // The gate is an ADVERSARIAL-VERIFIER refutation, which is the only schema-2 shape that
  // can carry a failing aggregate with zero canonical findings and still be a
  // production-valid journal: validateReviewJournal's coherence pair
  // (`changes_requested` => at least one open finding) is explicitly gated on
  // `role !== 'adversarial-verifier'`. It is also the exact live shape —
  // {"outcome":"fail","findings":[],"route_candidates":[]} behind a refuted verifier.
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx);
    const journalPath = path.join(fx.cacheDir, 'review-attempts.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const attempt = journal.attempts[0];
    const receipt = attempt.receipts[0];
    receipt.domain_outcome = 'refuted';
    receipt.findings = [];
    receipt.blocking_findings = 0;
    receipt.gate_effect = schema.deriveGateEffect('adversarial-verifier', 'change_gate', 'refuted', 0);
    equal(receipt.gate_effect, 'fail', 'a refuted change-gate verifier receipt is a gate FAILURE');
    const reduced = schema.reduceReviewReceipts({
      aggregation: attempt.logical_gate.aggregation, role: 'adversarial-verifier',
      gate_mode: attempt.gate_mode, expected_members: attempt.logical_gate.members,
      expected_surfaces: [receipt.surface], receipts: [receipt],
    });
    attempt.reducer = { role: 'adversarial-verifier', complete: reduced.complete,
      domain_outcome: reduced.domain_outcome, gate_effect: reduced.gate_effect,
      blocking_findings: reduced.blocking_findings };
    attempt.findings = [];
    attempt.current_findings = [];
    attempt.current_open_uids = [];
    attempt.route_candidates = [];
    attempt.progress.current_open_uids = [];
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
    writeSchema2RepairSource(fx, journal, attempt, { producerSlice: ['impl'] });
    const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: v2.attempt.attempt_id, transitionReason: 'review_repair_requires_replan' });
    equal(prepared.reason, 'replan_source_findings_missing',
      'the schema-2 review lane refuses an empty canonical frontier at the same wall: '
      + JSON.stringify(prepared));
    ok(!fs.existsSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME)),
      'the schema-2 empty-frontier refusal opens no replan transaction');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // Frontier 2 — the STORED transaction source, at EVERY resume phase. The journal on
  // disk is untouched and re-reads clean, so readSource passes; only the transaction's
  // own copy is empty, and validateReplanTransaction does not recompute it.
  //
  //   * `prepared`        — the literal defect: the empty array is copied verbatim into
  //                         the planner packet the child planner reads.
  //   * `planner_pending` — the empty array would otherwise survive the child freeze and
  //                         be digested into the snapshot authority projection. Binding
  //                         only the packet site leaves this second frontier open, which
  //                         is exactly the shape of miss this pin exists to prevent.
  for (const entryPhase of ['prepared', 'planner_pending']) {
    const label = '#729 stored frontier @' + entryPhase;
    const fx = initFixture();
    try {
      equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
        sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' }).result,
      'prepared', label + ': prepares from a real six-finding source');
      if (entryPhase === 'planner_pending') {
        equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
          'replan_planner_dispatch_required', label + ': reaches the planner-pending phase');
      }
      const txPath = path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME);
      const tx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
      equal(tx.phase, entryPhase, label + ': the transaction is parked at the entry phase');
      ok(tx.source.findings.length > 0, label + ': the transaction carries the real frontier');
      tx.source.findings = [];
      fs.writeFileSync(txPath, JSON.stringify(tx, null, 2) + '\n');
      ok(schema.validateReplanTransaction(JSON.parse(fs.readFileSync(txPath, 'utf8'))).ok,
        label + ': the transaction schema does NOT recompute source.findings — the stored '
        + 'frontier is genuinely reachable with an empty array and needs its own wall');
      const packetBefore = fs.existsSync(path.join(fx.cacheDir, 'replan-planner-packet.json'))
        ? fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'), 'utf8') : null;
      if (entryPhase === 'planner_pending') writePlannerResult(fx, tx);
      const resumed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
      equal(resumed.reason, 'replan_source_findings_missing',
        label + ': an empty stored frontier is refused: ' + JSON.stringify(resumed));
      equal(fs.existsSync(path.join(fx.cacheDir, 'replan-planner-packet.json'))
        ? fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'), 'utf8') : null,
      packetBefore, label + ': the refusal writes no planner packet');
      const after = JSON.parse(fs.readFileSync(txPath, 'utf8'));
      equal(after.phase, entryPhase, label + ': the refusal does not advance the transaction phase');
      equal(after.child.digest, null, label + ': the refusal freezes no child plan');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

{
  // Frontier 3 — candidate-changed re-author. reauthorCandidate rebuilds the successor
  // transaction from transaction.source WITHOUT re-reading the journal, so a stored
  // empty frontier would otherwise be laundered into a fresh transaction.
  const fx = initFixture();
  try {
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: fx.sourceAttemptId, transitionReason: 'review_repair_requires_replan' }).result,
    'prepared', 'the reauthor-frontier fixture prepares from a real six-finding source');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
      casMutation: { seam: 'prepare', axis: 'candidate_digest', value: 'f'.repeat(64) } }).reason,
    'replan_candidate_changed', 'the fixture reaches the candidate_changed outcome');
    const txPath = path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME);
    const tx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
    equal(tx.outcome, 'candidate_changed', 'the stored transaction is parked on the re-author route');
    tx.source.findings = [];
    fs.writeFileSync(txPath, JSON.stringify(tx, null, 2) + '\n');
    const reauthored = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(reauthored.reason, 'replan_source_findings_missing',
      'the candidate-changed re-author refuses an empty stored frontier: ' + JSON.stringify(reauthored));
    equal(JSON.parse(fs.readFileSync(txPath, 'utf8')).transaction_id, tx.transaction_id,
      'the refused re-author writes no successor transaction');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // OVER-REFUSAL CONTROL. A legitimate replan — real findings on the source, a real
  // write-set-bearing fixer in the child plan — still runs end to end and ACTIVATES.
  // The guard must cost a legal transition nothing.
  const fx = initFixture();
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
    ok(journal.attempts[0].findings.length > 0, 'the control source carries a real frontier');
    equal(driveReplanToCommit(fx).result, 'committed',
      'a legitimate empty-frontier-free replan still commits its child epoch');
    const childPlan = fs.readFileSync(path.join(fx.projectDir, 'workflow-plan.md'), 'utf8');
    const writers = validator.parseNodes(childPlan).filter(node => node.writeSet && node.writeSet.size > 0);
    ok(writers.length > 0,
      'the activated child epoch carries a real write node: ' + JSON.stringify(writers.map(n => n.id)));
    equal(Number(replan.parseStateFields(
      fs.readFileSync(path.join(fx.projectDir, 'workflow-state.md'), 'utf8')).plan_epoch), 2,
    'the legitimate transition advances the epoch');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}


// ---------------------------------------------------------------------------
// #729 AC2 — THE PLANNER PACKET CARRIES THE FAILURE RECORD IT EXPECTS REPAIRED.
//
// The empty-frontier walls above prove a transition never opens with NO record of
// what failed. They say nothing about whether the child planner can READ that record.
// Before this slice the packet copied `source.findings` verbatim and carried no route
// or ownership data at all, so the two review lanes handed the planner two different
// shapes (schema-1 flat `id=`/`file=` rows; schema-2 uid + immutable anchor objects)
// and the ownership the reviewer had ALREADY resolved (`route_candidates` —
// ownership_candidates / owning_node, a REQUIRED attempt field in both journal
// validators) was dropped on the floor between the journal and the packet.
//
// The projection lives at `packet.source.finding_index`, INSIDE the packet's source
// evidence. Its placement is load-bearing, not cosmetic: the planner profile tells the
// re-plan planner to treat the packet's claim/root/epoch/candidate/frontier/budget
// fields as immutable integrity constraints, and to read its source evidence as a
// semantic task input. A top-level key named `frontier` would therefore have handed the
// planner the one record it must ACT on under the label of a field it must not touch.
//
// This pins the PLUMBING only: every source finding appears with its immutable uid, its
// anchor, its status, and whatever route/ownership rows the source actually carried. It
// deliberately does NOT assert any coverage obligation on the child plan — that is a
// later criterion and it needs a plan-grammar addition in the validator. Enforcing
// coverage against a planner that was never shown the findings would wedge the loop
// until the budget escalated.
// ---------------------------------------------------------------------------
function findingIndexRow(packet, uid) {
  const rows = packet && packet.source && Array.isArray(packet.source.finding_index)
    ? packet.source.finding_index : [];
  return rows.find(row => row && row.uid === uid) || null;
}

function findingIndexUids(packet) {
  return (packet.source.finding_index || []).map(row => row.uid);
}

function preparedPacket(fx, sourceAttemptId) {
  const prepared = replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
    sourceAttemptId, transitionReason: 'review_repair_requires_replan' });
  equal(prepared.result, 'prepared',
    '#729 AC2: the packet fixture prepares: ' + JSON.stringify(prepared));
  equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
    'replan_planner_dispatch_required', '#729 AC2: the packet fixture reaches planner dispatch');
  return JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'), 'utf8'));
}

// A path-bearing anchor. `required_absence` is the cheapest anchor kind that carries a
// real path (no blob/object identity to fabricate), which is all the projection reads.
function absenceAnchor(anchorPath, seed) {
  return {
    kind: 'required_absence', path: anchorPath,
    acceptance_clause_digest: sha256(Buffer.from('acceptance:' + seed)),
    candidate_tree_digest: sha256(Buffer.from('candidate-tree:' + seed)),
  };
}

// A minimal transaction shell for the seams reachable only by calling the EXPORTED
// buildPlannerPacket directly (a hand-built source the journal validators would refuse
// to produce, but which the contract/edition suites are free to pass in).
function packetFromSource(fx, source) {
  return replan.buildPlannerPacket({ project: fx.project }, {
    transaction_id: '8'.repeat(64), transition_reason: 'review_repair_requires_replan',
    epoch_lineage_id: fx.lineage.epoch_lineage_id,
    parent: { claim_identity: { repository_id: 'repo', worktree_path: fx.root },
      claim_identity_digest: '1'.repeat(64), claim_root_base_digest: '2'.repeat(64),
      plan_epoch: 1, plan_hash: '3'.repeat(64) },
    snapshot: { authority_projection: {}, authority_digest: 'b'.repeat(64) },
    source: Object.assign({ source_attempt_ids: ['a1'], source_reason: 'review_repair_requires_replan',
      source_evidence_digest: '5'.repeat(64), producer_slice: ['impl'], rebind: [],
      inherited_frontier_classes: ['code'], validation_obligations: [] }, source),
    cas: { prepare: { candidate_digest: '6'.repeat(64), inherited_frontier_digest: '7'.repeat(64) } },
    budget: { count_before: 0, ceiling: 2, transition_cost: 1, case_b_exemption: false,
      case_b_proof: null, consent_ledger_digest: '9'.repeat(64) },
    planner: { profile_identity: 'workflow-planner-replan-v1', dispatch_nonce: 'dispatch-729' },
  });
}

{
  // Lane 1 — schema-1. Six flat findings (R1-R6), each anchored by a `file=` token and
  // routed to the `impl` writer by the reviewer.
  const fx = initFixture();
  try {
    const packet = preparedPacket(fx, SOURCE_ATTEMPT_ID);
    ok(!Object.prototype.hasOwnProperty.call(packet, 'frontier'),
      '#729 AC2: the record the planner must ACT on is NOT published under the `frontier` label '
      + 'the planner profile pins as an immutable integrity constraint: ' + JSON.stringify(Object.keys(packet)));
    ok(Array.isArray(packet.source.finding_index),
      '#729 AC2: the packet indexes its source findings: ' + JSON.stringify(Object.keys(packet.source)));
    deepEqual(findingIndexUids(packet), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
      '#729 AC2: every source finding reaches the planner under its immutable id — none is dropped');
    const row = findingIndexRow(packet, 'R1');
    ok(row, '#729 AC2: R1 has an index row');
    equal(row.status, 'open', '#729 AC2: the row carries the finding status');
    equal(row.scope, 'in_scope', '#729 AC2: the row carries the finding scope');
    equal(row.action, 'fix', '#729 AC2: the row carries the finding action');
    equal(row.severity, 'high', '#729 AC2: the row carries the finding severity');
    equal(row.fix_role, 'tdd-guide', '#729 AC2: the row carries the reviewer-suggested fix role');
    equal(row.failure_class, null,
      '#729 AC2: a schema-1 finding declares no failure class and none is invented');
    equal(row.primary_anchor, null,
      '#729 AC2: a schema-1 finding declares no immutable anchor object and none is invented');
    deepEqual(row.anchor_paths, ['product.js'], '#729 AC2: the row carries the finding anchor path');
    deepEqual(row.source_nodes, ['review'], '#729 AC2: the row names the node whose evidence produced it');
    equal(row.owning_node, 'impl', '#729 AC2: the row carries the ownership the SOURCE already resolved');
    deepEqual(row.ownership_candidates, ['impl'], '#729 AC2: the row carries the full ownership candidate set');
    // Every projected row must be the SAME shape — a planner that reads one row must not
    // have to probe for keys on the next one.
    for (const other of packet.source.finding_index) {
      deepEqual(Object.keys(other).sort(), Object.keys(row).sort(),
        '#729 AC2: every index row carries the identical key set: ' + other.uid);
    }
    // Plumbing, not derivation: nothing here decides whether the child plan covers the row.
    for (const forbidden of ['covered', 'coverage', 'uncovered', 'required_writers']) {
      ok(!Object.prototype.hasOwnProperty.call(row, forbidden),
        '#729 AC2: the index row derives no coverage verdict: ' + forbidden);
    }
    // The packet must stay free of orchestrator-authored child-DAG keys — the control
    // boundary the planner profile refuses with planner_control_boundary_violation.
    const keys = new Set();
    (function collect(value) {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) return value.forEach(collect);
      for (const [key, child] of Object.entries(value)) { keys.add(key); collect(child); }
    })(packet);
    for (const forbidden of ['nodes', 'node_ids', 'roles', 'depends_on', 'declared_write_set',
      'write_set', 'cardinality', 'shape', 'model', 'build_order']) {
      ok(!keys.has(forbidden), '#729 AC2: the index introduces no child-DAG key: ' + forbidden);
    }
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // Lane 2 — schema-2 (contract 2). The canonical finding is uid-bearing and anchored by an
  // `evidence_observation` primary anchor, which legally carries NO path. The projection must
  // report that honestly (kind present, empty path list) rather than inventing one, and must
  // still carry the uid, status, failure class, and the ownership the reviewer resolved.
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx);
    const finding = v2.attempt.findings[0];
    const packet = preparedPacket(fx, v2.attempt.attempt_id);
    deepEqual(findingIndexUids(packet), [finding.uid],
      '#729 AC2: the schema-2 lane indexes the canonical uid');
    const row = packet.source.finding_index[0];
    equal(row.status, 'open', '#729 AC2: the schema-2 row carries the status');
    equal(row.failure_class, 'correctness', '#729 AC2: the schema-2 row carries the failure class');
    equal(row.severity, 'high', '#729 AC2: the schema-2 row carries the severity');
    equal(row.scope, 'product', '#729 AC2: the schema-2 row carries the scope');
    equal(row.action, 'fix', '#729 AC2: the schema-2 row carries the action');
    equal(row.fix_role, 'tdd-guide', '#729 AC2: the schema-2 row carries the fix role');
    deepEqual(row.primary_anchor, finding.primary_anchor,
      '#729 AC2: the schema-2 row carries the IMMUTABLE primary anchor verbatim');
    deepEqual(row.anchor_paths, [],
      '#729 AC2: an evidence_observation anchor carries no path and none is invented');
    deepEqual(row.source_nodes, ['review'], '#729 AC2: the schema-2 row names its reporting member');
    equal(row.owning_node, 'impl', '#729 AC2: the schema-2 row carries the resolved owner');
    deepEqual(row.ownership_candidates, ['impl'], '#729 AC2: the schema-2 row carries the owner set');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // SECONDARY ANCHORS ARE PART OF THE RECORD. A schema-2 finding may anchor the same defect at
  // several places in the candidate; `anchor_paths` is the primary PLUS the secondaries, so a
  // planner routing by path sees every surface the reviewer named, not just the first one.
  // The primary here sorts LAST and one secondary repeats its path under a different anchor
  // identity, so this one assertion also pins the sort and the de-duplication.
  const fx = initFixture();
  try {
    const v2 = installReviewJournalV2Source(fx, {
      primaryAnchor: absenceAnchor('src/z-primary.js', 'primary'),
      secondaryAnchors: [absenceAnchor('src/a-secondary.js', 'secondary-a'),
        absenceAnchor('src/z-primary.js', 'secondary-z')],
    });
    const finding = v2.attempt.findings[0];
    equal(finding.secondary_anchors.length, 2,
      '#729 AC2: the fixture really carries two secondary anchors: ' + JSON.stringify(finding.secondary_anchors));
    const packet = preparedPacket(fx, v2.attempt.attempt_id);
    const row = packet.source.finding_index[0];
    deepEqual(row.anchor_paths, ['src/a-secondary.js', 'src/z-primary.js'],
      '#729 AC2: anchor_paths is the primary PLUS every secondary anchor path, sorted and de-duplicated');
    deepEqual(row.primary_anchor, finding.primary_anchor,
      '#729 AC2: the primary anchor object is still carried verbatim alongside the path list');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // A RESOLVED finding is still projected, with its real status. The frontier guard's predicate is
  // deliberately non-empty FINDINGS rather than non-empty OPEN frontier — an attempt that failed
  // only on progress legally carries an all-resolved record — so the projection must neither drop
  // a resolved row nor report every row as open.
  const fx = initFixture();
  try {
    const journalPath = path.join(fx.cacheDir, 'review-attempts.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const attempt = journal.attempts[0];
    const receipt = attempt.receipts[0];
    const body = receipt.body.replace('id=R2 scope=in_scope action=fix status=open',
      'id=R2 scope=in_scope action=fix status=resolved');
    ok(body !== receipt.body, '#729 AC2: the resolved-status fixture actually rewrote R2');
    const evaluated = schema.evaluateEffectiveVerdict(body);
    receipt.body = body;
    receipt.receipt_sha256 = sha256(Buffer.from(body));
    receipt.effective_pass = evaluated.pass;
    receipt.verdict = evaluated.verdict;
    receipt.findings_blocking = evaluated.findings_blocking;
    attempt.findings = schema.parseNodeFindings(body).map(finding => ({ source_node: 'review', ...finding }));
    attempt.route_candidates = attempt.findings.map(finding => ({
      source_node: 'review', finding_id: finding.id, id: finding.id, scope: finding.scope,
      action: finding.action, status: finding.status, severity: finding.severity, file: finding.file,
      ownership_candidates: ['impl'], owning_node: 'impl', fix_role: finding.fix_role, raw: finding.raw,
    }));
    fs.writeFileSync(path.join(fx.cacheDir, 'review.md'), body);
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
    writeSchema2RepairSource(fx, journal, attempt);
    const packet = preparedPacket(fx, SOURCE_ATTEMPT_ID);
    deepEqual(findingIndexUids(packet), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
      '#729 AC2: a resolved finding is still projected — the packet is the whole record, not the open set');
    equal(findingIndexRow(packet, 'R2').status, 'resolved',
      '#729 AC2: the resolved row reports its REAL status');
    equal(findingIndexRow(packet, 'R1').status, 'open',
      '#729 AC2: its still-open siblings are unaffected');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // Absent ownership is reported as ABSENT, never guessed. A route row the reviewer left
  // unresolved (`ownership_candidates: []`) must arrive as an empty candidate set with a
  // null owner — the planner needs to see that the source could not route it.
  const fx = initFixture();
  try {
    const journalPath = path.join(fx.cacheDir, 'review-attempts.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    const attempt = journal.attempts[0];
    attempt.route_candidates = attempt.route_candidates.map(route => (route.finding_id === 'R2'
      ? { ...route, ownership_candidates: [], owning_node: null } : route));
    fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n');
    writeSchema2RepairSource(fx, journal, attempt);
    const packet = preparedPacket(fx, SOURCE_ATTEMPT_ID);
    const row = findingIndexRow(packet, 'R2');
    ok(row, '#729 AC2: an unrouted finding still reaches the planner');
    equal(row.owning_node, null, '#729 AC2: an unresolved owner is null, never guessed');
    deepEqual(row.ownership_candidates, [], '#729 AC2: an unresolved candidate set stays empty');
    deepEqual(row.anchor_paths, ['product.js'],
      '#729 AC2: the anchor survives even when ownership does not');
    equal(findingIndexRow(packet, 'R1').owning_node, 'impl',
      '#729 AC2: its routed siblings keep their owner');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // DUPLICATE ROUTE ROWS ARE MERGED, NOT RACED. A fan-out gate whose members each report the
  // same defect legally produces ONE deduped finding (normalizeFindingSet is uid-keyed) and
  // one route row PER REPORTING MEMBER — the contract-2 validator sizes route_candidates from
  // receipts.flatMap(receipt.findings), not from the deduped set. A first-wins join would drop
  // the second member's row silently, so both reporters and the union of what they resolved
  // must survive into the index.
  //
  // Exercised at the packet seam with a hand-built source: a genuine two-member schema-2
  // fan-out journal is a fixture, not a behavior, and buildPlannerPacket is exported precisely
  // so this seam can be driven directly — the same way validate-kaola-workflow-contracts.js and
  // each edition's test-*-workflow-scripts.js drive it with a hand-built transaction.
  const fx = initFixture();
  try {
    const finding = { uid: 'R1', status: 'open', scope: 'in_scope', action: 'fix', file: 'product.js' };
    const agreed = packetFromSource(fx, { findings: [finding], route_candidates: [
      { source_node: 'review-b', finding_id: 'R1', ownership_candidates: ['impl'], owning_node: 'impl' },
      { source_node: 'review-a', finding_id: 'R1', ownership_candidates: ['docs', 'impl'], owning_node: 'impl' },
    ] });
    const merged = agreed.source.finding_index[0];
    deepEqual(findingIndexUids(agreed), ['R1'],
      '#729 AC2: two members reporting one uid still project exactly one row');
    deepEqual(merged.source_nodes, ['review-a', 'review-b'],
      '#729 AC2: BOTH reporting members survive the join — neither is dropped first-wins');
    deepEqual(merged.ownership_candidates, ['docs', 'impl'],
      '#729 AC2: the candidate sets are unioned, sorted and de-duplicated');
    equal(merged.owning_node, 'impl',
      '#729 AC2: an owner every route row agrees on is carried');

    const split = packetFromSource(fx, { findings: [finding], route_candidates: [
      { source_node: 'review-a', finding_id: 'R1', ownership_candidates: ['impl'], owning_node: 'impl' },
      { source_node: 'review-b', finding_id: 'R1', ownership_candidates: ['docs'], owning_node: 'docs' },
    ] });
    equal(split.source.finding_index[0].owning_node, null,
      '#729 AC2: route rows that DISAGREE about the owner have resolved none — null, not a coin flip');
    deepEqual(split.source.finding_index[0].ownership_candidates, ['docs', 'impl'],
      '#729 AC2: the disagreement stays VISIBLE as the unioned candidate set');

    const partial = packetFromSource(fx, { findings: [finding], route_candidates: [
      { source_node: 'review-a', finding_id: 'R1', ownership_candidates: ['impl'], owning_node: 'impl' },
      { source_node: 'review-b', finding_id: 'R1', ownership_candidates: [], owning_node: null },
    ] });
    equal(partial.source.finding_index[0].owning_node, null,
      '#729 AC2: a member that resolved NO owner is a dissent too — one resolved row is not unanimity');
    deepEqual(partial.source.finding_index[0].source_nodes, ['review-a', 'review-b'],
      '#729 AC2: the member that could not route is still named');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // A source that carries NO route rows at all. Both journal validators refuse such an attempt
  // outright (route cardinality must equal the canonical finding set), so this cannot be reached
  // through prepare — but buildPlannerPacket is EXPORTED, and validate-kaola-workflow-contracts.js
  // plus each edition's test-*-workflow-scripts.js call it directly with a hand-built transaction
  // whose source omits `route_candidates` entirely. The
  // projection must therefore stay total: no throw, the whole record still projected, and route
  // fields absent-shaped rather than fabricated.
  const fx = initFixture();
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'review-attempts.json'), 'utf8'));
    const attempt = journal.attempts[0];
    const packet = packetFromSource(fx, { source_attempt_ids: [attempt.attempt_id],
      findings: attempt.findings });
    deepEqual(findingIndexUids(packet), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
      '#729 AC2: a route-less source still projects its whole record');
    const row = findingIndexRow(packet, 'R1');
    equal(row.owning_node, null, '#729 AC2: no route row means no owner, not a guessed one');
    deepEqual(row.ownership_candidates, [], '#729 AC2: no route row means an empty candidate set');
    deepEqual(row.source_nodes, ['review'],
      '#729 AC2: the finding-borne reporter survives without any route row');
    equal(row.status, 'open', '#729 AC2: the finding itself still carries its own status');
    deepEqual(row.anchor_paths, ['product.js'],
      '#729 AC2: the finding-borne anchor survives without any route row');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // Idempotent across a crash-prefix retry: the packet is a pure function of the frozen
  // transaction, so a re-entry that rebuilds it produces byte-identical bytes and leaves the
  // recorded packet digest valid.
  const fx = initFixture();
  try {
    const packetPath = path.join(fx.cacheDir, 'replan-planner-packet.json');
    const packet = preparedPacket(fx, SOURCE_ATTEMPT_ID);
    equal(packet.source.finding_index.length, 6,
      '#729 AC2: the idempotence fixture carries the full record');
    const bytes = fs.readFileSync(packetPath, 'utf8');
    const tx = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(schema.canonicalJson(replan.buildPlannerPacket({ project: fx.project }, tx)),
      schema.canonicalJson(JSON.parse(bytes)),
      '#729 AC2: rebuilding the packet from the stored transaction reproduces it exactly');
    equal(sha256(Buffer.from(bytes, 'utf8')), tx.planner.packet_digest,
      '#729 AC2: the transaction still binds the written packet digest');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // DURABLE COMPATIBILITY. source_evidence_digest is INVARIANT under the carried route/ownership
  // rows, so this carriage-only addition leaves the digest of every already-stored transaction
  // untouched. Cover them instead and a transaction prepared by an earlier build recomputes a
  // different digest on its very next resume and fails closed with replan_source_changed — a
  // mid-flight run wedged by a field that adds no authority at all, since the journal the rows
  // are read from is already pinned byte-exact by journal_digest.
  const bare = { authority_kind: 'review_outcome', attempt_id: 'a1', findings: [{ id: 'R1' }] };
  equal(replan.sourceEvidenceDigest(Object.assign({}, bare, { route_candidates: [
    { finding_id: 'R1', source_node: 'review', owning_node: 'impl', ownership_candidates: ['impl'] }] })),
  replan.sourceEvidenceDigest(bare),
  '#729 AC2: the source authority digest is unchanged by the route rows the source carries');
  ok(replan.sourceEvidenceDigest(Object.assign({}, bare, { findings: [{ id: 'R2' }] }))
    !== replan.sourceEvidenceDigest(bare),
  '#729 AC2: the same digest still moves when the evidence it DOES cover changes');

  const fx = initFixture();
  try {
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' }).result,
    'prepared', '#729 AC2: the durable-compat fixture prepares');
    const txPath = path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME);
    const tx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
    ok(Array.isArray(tx.source.route_candidates) && tx.source.route_candidates.length === 6,
      '#729 AC2: a freshly prepared transaction stores its route rows');
    // Exactly the durable shape an earlier build wrote: same digest, no route rows.
    delete tx.source.route_candidates;
    fs.writeFileSync(txPath, JSON.stringify(tx, null, 2) + '\n');
    const resumed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(resumed.reason, 'replan_planner_dispatch_required',
      '#729 AC2: a transaction stored by an earlier build resumes — no replan_source_changed: '
      + JSON.stringify(resumed));
    const packet = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'), 'utf8'));
    deepEqual(findingIndexUids(packet), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
      '#729 AC2: that transaction still gets a complete index, with route fields absent-shaped');
    equal(findingIndexRow(packet, 'R1').owning_node, null,
      '#729 AC2: an earlier-build transaction records no ownership, and none is invented for it');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // CANDIDATE-CHANGED RE-AUTHOR. reauthorCandidate rebuilds the successor transaction from the
  // STORED transaction.source without re-reading the journal, so the route rows must survive
  // that copy — otherwise a re-authored epoch silently hands its planner an ownership-free
  // record while a first-attempt epoch gets the full one.
  const fx = initFixture();
  try {
    equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
      sourceAttemptId: SOURCE_ATTEMPT_ID, transitionReason: 'review_repair_requires_replan' }).result,
    'prepared', '#729 AC2: the re-author fixture prepares');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
      casMutation: { seam: 'prepare', axis: 'candidate_digest', value: 'f'.repeat(64) } }).reason,
    'replan_candidate_changed', '#729 AC2: the re-author fixture reaches candidate_changed');
    const first = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'reauthored',
      '#729 AC2: the fixture re-authors a successor transaction');
    const next = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
    equal(first.outcome, 'candidate_changed', '#729 AC2: the predecessor is parked on the re-author route');
    equal(next.attempts.length, 1,
      '#729 AC2: the successor is a fresh transaction carrying the failed attempt receipt');
    ok(next.outcome !== 'candidate_changed', '#729 AC2: the successor is live, not parked');
    deepEqual(next.source.route_candidates, first.source.route_candidates,
      '#729 AC2: the re-authored source carries the SAME route rows');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_planner_dispatch_required', '#729 AC2: the successor reaches its own planner dispatch');
    const packet = JSON.parse(fs.readFileSync(path.join(fx.cacheDir, 'replan-planner-packet.json'), 'utf8'));
    deepEqual(findingIndexUids(packet), ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'],
      '#729 AC2: the re-authored packet indexes the whole record');
    equal(findingIndexRow(packet, 'R1').owning_node, 'impl',
      '#729 AC2: the re-authored packet still carries the ownership the source resolved');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // THE INDEX IS A PURE FUNCTION OF AN ATTEMPT-SHAPED BAG — `{ findings, route_candidates }`,
  // which is exactly a review journal attempt as well as the transaction's source projection of
  // one. It reads no fs, no transaction identity and no replan phase, so any consumer holding an
  // attempt can build the same index without opening a replan transaction. These cases also pin
  // the normalization the packet's ONE readable shape depends on: a planner must never have to
  // decide whether an absent value arrived as null, undefined, or a missing key.
  equal(typeof replan.buildFindingIndex, 'function',
    '#729 AC2: the index builder is exported for use outside a replan transaction');
  deepEqual(replan.buildFindingIndex({ findings: [{ id: 'R1' }] }), [{
    uid: 'R1', status: null, scope: null, action: null, severity: null, failure_class: null,
    primary_anchor: null, anchor_paths: [], fix_role: null, source_nodes: [],
    owning_node: null, ownership_candidates: [],
  }], '#729 AC2: a bare finding projects a complete, fully null-shaped row');
  deepEqual(replan.buildFindingIndex({}), [],
    '#729 AC2: a bag with no findings projects nothing rather than throwing');
  deepEqual(replan.buildFindingIndex({ findings: 'six' }), [],
    '#729 AC2: a malformed findings value projects nothing rather than throwing');
  deepEqual(replan.buildFindingIndex({ findings: [null, 'R1', ['R1'], { id: 'R2' }] }).map(row => row.uid),
    ['R2'], '#729 AC2: non-object findings are skipped, not projected as empty rows');
  deepEqual(replan.buildFindingIndex({ findings: [{ id: 7, severity: 3 }] })
    .map(row => [row.uid, row.severity]), [['7', '3']],
  '#729 AC2: every projected scalar is normalized to a string');
  equal(replan.buildFindingIndex({ findings: [{ id: 'R1', primary_anchor: ['not-an-object'] }] })[0].primary_anchor,
    null, '#729 AC2: a non-object primary anchor is reported absent, not passed through');
  deepEqual(replan.buildFindingIndex({ findings: [{ uid: 'R1' }],
    route_candidates: [{ id: 'R1', source_node: 'review', ownership_candidates: ['impl'], owning_node: 'impl' }] })[0]
    .ownership_candidates, ['impl'],
  '#729 AC2: a route row keyed only by the legacy `id` still joins its finding');
  deepEqual(replan.buildFindingIndex({ findings: [{ uid: 'R1' }],
    route_candidates: [{ finding_id: 'R1', ownership_candidates: ['impl', null, 'impl'] }] })[0]
    .ownership_candidates, ['impl'],
  '#729 AC2: null and repeated candidates are dropped from the carried set');
  deepEqual(replan.buildFindingIndex({ findings: [{ uid: 'R1' }],
    route_candidates: [{ finding_id: 'R1', ownership_candidates: 'impl' }] })[0]
    .ownership_candidates, [],
  '#729 AC2: a malformed candidate set carries nothing rather than a stringified guess');
  deepEqual(replan.buildFindingIndex({ findings: [{ uid: 'R1' }],
    route_candidates: [null, 'R1', { finding_id: 'R2', owning_node: 'docs' }] })[0].owning_node, null,
  '#729 AC2: malformed and non-matching route rows are never joined to a finding');
  deepEqual(replan.buildFindingIndex({ findings: [{ uid: 'R1', source_node: 'review-c' }],
    route_candidates: [{ finding_id: 'R1', source_node: 'review-a' }] })[0].source_nodes,
  ['review-a', 'review-c'],
  '#729 AC2: the finding-borne reporter and the route-borne reporters are unioned and sorted');
  {
    // The route-borne scalars are normalized on the SAME contract as the finding-borne ones —
    // a planner reading `owning_node` must never have to type-check a node id.
    const routed = replan.buildFindingIndex({ findings: [{ uid: 'R1' }],
      route_candidates: [{ finding_id: 'R1', source_node: 7, owning_node: 7 }] })[0];
    deepEqual(routed.source_nodes, ['7'],
      '#729 AC2: a route-borne reporter is normalized to a string');
    equal(routed.owning_node, '7',
      '#729 AC2: a route-borne owner is normalized to a string');
  }
}

// ---------------------------------------------------------------------------
// #729 case (b) — CHILD CARRY-FORWARD COVERAGE (AC3/AC4/AC5/AC6/AC7).
//
// The empty-frontier wall above proves a transition never opens with NO record of what
// failed, and the packet index proves the planner is SHOWN that record. Neither proves the
// child epoch can REPAIR it. The live defect was exactly that gap: a valid, non-empty
// finding frontier reached a child whose only writer was a documentation node, the child
// activated, the same defect was rediscovered by the child's own reviewer, and a second
// epoch was burned.
//
// The sound check is a SET COMPARISON, not an inference: the child DECLARES, in its
// hash-covered `## Meta`, which child node owns each inherited finding uid, and the
// transaction verifies the declaration against the graph. Absence is never "fine" — a
// missing declaration, a missing uid, or a missing owner row is the corruption signature
// this wall exists to catch, so every one of them refuses.
// ---------------------------------------------------------------------------
function pendingTransactionFor(fx, sourceAttemptId) {
  equal(replan.prepareReplan({ repoRoot: fx.root, project: fx.project,
    sourceAttemptId: sourceAttemptId || fx.sourceAttemptId,
    transitionReason: 'review_repair_requires_replan' }).result, 'prepared',
  '#729 coverage fixture prepares a transaction');
  equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
    'replan_planner_dispatch_required', '#729 coverage fixture reaches planner dispatch');
  return JSON.parse(fs.readFileSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
}

// Author an arbitrary child node table under the transaction's real binding block and
// attest it, exactly as writePlannerResult does for the canonical child.
function writeChildPlan(fx, tx, meta, nodes) {
  const child = frozenPlan(fx.project, { ...childMetaFor(tx, {
    reviewId: 'child-review', securityId: 'child-security' }), ...meta }, nodes, {});
  fs.writeFileSync(path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME), child.text);
  writePlannerAttestationForExistingChild(fx, tx);
  return child;
}

// The live-repro node table: a read-only skeptic, a DOCUMENTATION writer, and the two
// certifier walls. Every gate the epoch contract requires is present; nothing repairs
// `product.js`.
const REVIEW_ONLY_CHILD_NODES = [
  { id: 'child-adversary', role: 'adversarial-verifier', model: 'reasoning',
    gate_claim: 'the parent finding is analysed', gate_surface: 'parent evidence',
    gate_aggregation: 'sequence' },
  { id: 'child-docs', role: 'doc-updater', depends_on: 'child-adversary', write_set: 'README.md' },
  { id: 'child-review', role: 'code-reviewer', depends_on: 'child-docs', model: 'reasoning',
    gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate',
    gate_aggregation: 'sequence' },
  { id: 'child-security', role: 'security-reviewer', depends_on: 'child-review', model: 'reasoning',
    gate_claim: 'current security candidate is approved', gate_surface: 'full security candidate',
    gate_aggregation: 'sequence' },
  { id: 'child-finalize', role: 'finalize', depends_on: 'child-security', model: '—' },
];

// The canonical repair table: one writer whose declared write set is the finding's anchor,
// upstream of both certifier walls.
const COVERED_CHILD_NODES = [
  { id: 'child-impl', role: 'tdd-guide', write_set: 'product.js' },
  { id: 'child-review', role: 'code-reviewer', depends_on: 'child-impl', model: 'reasoning',
    gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate',
    gate_aggregation: 'sequence' },
  { id: 'child-security', role: 'security-reviewer', depends_on: 'child-review', model: 'reasoning',
    gate_claim: 'current security candidate is approved', gate_surface: 'full security candidate',
    gate_aggregation: 'sequence' },
  { id: 'child-finalize', role: 'finalize', depends_on: 'child-security', model: '—' },
];

const SOURCE_UIDS = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
const ownersFor = (uids, node) => uids.map(uid => uid + '=' + node).join(',');

{
  // AC4 — a review-only child cannot activate for an unresolved path-based product finding,
  // and AC3 — the refusal names the exact uncovered uid, its anchor path, and the node
  // mapping that failed. The child here declares NO owners at all: absence must refuse.
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    const before = exactAuthorityBytes(fx);
    writeChildPlan(fx, tx, {}, REVIEW_ONLY_CHILD_NODES);
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.result, 'refuse',
      '#729 AC4: a child that declares no finding owners refuses: ' + JSON.stringify(result));
    equal(result.reason, 'replan_child_finding_owners_invalid',
      '#729 AC4: an ABSENT carry-forward declaration is a typed refusal, never a silent pass: '
      + JSON.stringify(result));
    const after = exactAuthorityBytes(fx);
    equal(after.cardinalities.epoch, 1, '#729 AC4: the parent epoch is not advanced');
    equal(after.cardinalities.count, 0,
      '#729 AC4: automatic_review_replans is not incremented by a coverage refusal');
    equal(after.cardinalities.snapshots, 0, '#729 AC4: no parent snapshot is sealed');
    equal(after.plan, before.plan, '#729 AC4: the parent plan remains authoritative byte for byte');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // #729 — a coverage refusal leaves the authored child UNCORRUPTED, so the planner can repair in
  // place inside the same transaction.
  //
  // READ THIS BEFORE USING IT AS AN ORDERING PIN, BECAUSE IT IS NOT ONE. The wall is applied twice:
  // early in `resumeReplanUnlocked` on the attested image, and again inside `validateChildPlan`
  // after `freezeAttestedChildWithHandoff`. It is tempting to assume the early copy is what keeps a
  // coverage failure write-free, and to pin it by asserting the child bytes are untouched. That was
  // MEASURED AND IS FALSE: the freeze writes `attested.child` VERBATIM to the same path the planner
  // already wrote, so the bytes are identical either way. Stubbing the early check to `{ok: true}`
  // leaves this whole block green.
  //
  // So the early placement remains UNPINNED by any outcome assertion here, and the two placements
  // are not distinguishable by final state — only by which durable-write labels the crash journal
  // passes through. Anything that reworks this seam must pin it on the journal, or accept that
  // deleting one of the two copies is invisible to this suite. What IS pinned below: the refusal
  // itself, its typed reason, and non-corruption of the authored child.
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    writeChildPlan(fx, tx, {}, REVIEW_ONLY_CHILD_NODES);
    const childPath = path.join(fx.projectDir, schema.REPLAN_PLAN_NEXT_NAME);
    const authored = fs.readFileSync(childPath).toString('base64');
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.result, 'refuse',
      '#729: the uncovered child refuses: ' + JSON.stringify(result));
    equal(result.reason, 'replan_child_finding_owners_invalid',
      '#729: with a typed reason, never a silent pass');
    equal(fs.readFileSync(childPath).toString('base64'), authored,
      '#729: the authored child is left byte-identical by a coverage refusal, so the planner can '
      + 'repair it in place inside the same transaction (see the note above: this does NOT pin '
      + 'which of the two wall placements produced the refusal)');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // AC3/AC4 — the SAME review-only child, now declaring the documentation writer as the
  // owner of every finding. A declaration is not authority: the docs node cannot write
  // `product.js`, so the refusal must name the uid, the anchor path, and the node.
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    writeChildPlan(fx, tx, { finding_owners: ownersFor(SOURCE_UIDS, 'child-docs') },
      REVIEW_ONLY_CHILD_NODES);
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.reason, 'replan_child_finding_uncovered',
      '#729 AC4: a documentation-only owner does not cover a product anchor: ' + JSON.stringify(result));
    const report = (result.errors || []).join(' ');
    ok(/R1/.test(report), '#729 AC3: the refusal names the uncovered finding uid: ' + report);
    ok(/product\.js/.test(report), '#729 AC3: the refusal names the uncovered anchor path: ' + report);
    ok(/child-docs/.test(report), '#729 AC3: the refusal names the declared owner node: ' + report);
    equal(authorityCardinalities(fx).epoch, 1, '#729 AC4: the parent epoch is not advanced');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // AC6 — covering N-1 of N refuses, and the report names the ONE uid that was dropped
  // rather than collapsing to "some finding is uncovered".
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    writeChildPlan(fx, tx, { finding_owners: ownersFor(SOURCE_UIDS.slice(0, 5), 'child-impl') },
      COVERED_CHILD_NODES);
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.reason, 'replan_child_finding_uncovered',
      '#729 AC6: covering 5 of 6 findings refuses: ' + JSON.stringify(result));
    const report = (result.errors || []).join(' ');
    ok(/R6/.test(report), '#729 AC6: the report names the dropped uid: ' + report);
    ok(!/R1\b/.test(report), '#729 AC6: the report does not name the five covered uids: ' + report);
    equal(authorityCardinalities(fx).epoch, 1, '#729 AC6: the parent epoch is not advanced');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // AC6 — a declaration naming a uid the source never carried is a source/child mismatch,
  // not a harmless extra: it is how a hand-edited child manufactures apparent coverage.
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    writeChildPlan(fx, tx, {
      finding_owners: ownersFor(SOURCE_UIDS.concat(['R7']), 'child-impl') }, COVERED_CHILD_NODES);
    const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(result.reason, 'replan_child_finding_owners_invalid',
      '#729 AC6: a uid the source never carried refuses: ' + JSON.stringify(result));
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // A declared owner that is not a node of the child, and a declared owner that is the
  // certifier itself. Neither may pass: the second is the exact "the finding disappears
  // because the child contains a certifier" shape the issue names.
  for (const [owner, label] of [['ghost-node', 'an owner outside the child graph'],
    ['child-review', 'the certifier certifying its own repair']]) {
    const fx = initFixture();
    try {
      const tx = pendingTransactionFor(fx);
      writeChildPlan(fx, tx, { finding_owners: ownersFor(SOURCE_UIDS, owner) }, COVERED_CHILD_NODES);
      const result = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
      equal(result.reason, 'replan_child_finding_uncovered',
        '#729 AC4: ' + label + ' refuses: ' + JSON.stringify(result));
      equal(authorityCardinalities(fx).epoch, 1, '#729 AC4: ' + label + ' advances no epoch');
    } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
  }
}

{
  // AC5 — a correctly mapped writer -> certifier child activates, and the second resume is
  // idempotent. This is the same canonical child every other suite in this file drives, so
  // its green path is the regression floor for the whole wall.
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    writeChildPlan(fx, tx, { finding_owners: ownersFor(SOURCE_UIDS, 'child-impl') },
      COVERED_CHILD_NODES);
    const committed = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(committed.result, 'committed',
      '#729 AC5: a mapped writer -> certifier child activates: ' + JSON.stringify(committed));
    equal(authorityCardinalities(fx).epoch, 2, '#729 AC5: the child epoch is promoted');
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'already_committed',
      '#729 AC5: the activated child resumes idempotently');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // AC5 — the anchorless lane. A schema-2 `evidence_observation` finding legally carries NO
  // path, so anchor containment cannot be computed at all. The TYPED policy is that such a
  // finding must be declared with an EXPLICIT `@anchorless` marker: it may never be absorbed
  // by default classification, which is exactly how the live repro's child swallowed one.
  const fx = initFixture({ sameGateChild: true });
  try {
    const v2 = installReviewJournalV2Source(fx);
    const uid = v2.attempt.findings[0].uid;
    ok(/^[0-9a-f]{64}$/.test(uid), '#729 AC5: the anchorless lane carries a canonical uid');
    const tx = pendingTransactionFor(fx, v2.attempt.attempt_id);
    writeChildPlan(fx, tx, { finding_owners: uid + '=child-docs' }, REVIEW_ONLY_CHILD_NODES);
    const refused = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(refused.reason, 'replan_child_finding_uncovered',
      '#729 AC5: an anchorless finding is never covered by DEFAULT classification: '
      + JSON.stringify(refused));
    ok(/anchorless/.test((refused.errors || []).join(' ')),
      '#729 AC5: the anchorless policy is named in the report: ' + JSON.stringify(refused.errors));
    writeChildPlan(fx, tx, { finding_owners: uid + '=child-impl@anchorless' }, COVERED_CHILD_NODES);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      '#729 AC5: an anchorless finding explicitly mapped to a real writer activates');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // AC7 — crash prefix + idempotent retry across the new seam. The coverage verdict is a
  // pure function of (child bytes, source frontier): re-running the refusal must change
  // nothing on disk, a crash at the last durable write BEFORE the seam must replay into the
  // same typed refusal, and repairing the child in the SAME transaction must still activate.
  const fx = initFixture();
  try {
    const tx = pendingTransactionFor(fx);
    writeChildPlan(fx, tx, { finding_owners: ownersFor(SOURCE_UIDS.slice(0, 1), 'child-impl') },
      COVERED_CHILD_NODES);
    const first = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(first.reason, 'replan_child_finding_uncovered', '#729 AC7: the seam refuses once');
    const settled = exactAuthorityBytes(fx);
    const second = replan.resumeReplan({ repoRoot: fx.root, project: fx.project });
    equal(second.reason, 'replan_child_finding_uncovered',
      '#729 AC7: the retry lands on the SAME typed refusal');
    deepEqual(authorityByteDiff(exactAuthorityBytes(fx), settled), { top: [], snapshots: [] },
      '#729 AC7: the retry mutates no durable authority byte');
    let crashed = null;
    try {
      replan.resumeReplan({ repoRoot: fx.root, project: fx.project,
        failpoint(name) { if (name === 'after_tx_pre_freeze_cas') throw new Error('crash:' + name); } });
    } catch (error) { crashed = error.message; }
    ok(crashed === null || crashed === 'crash:after_tx_pre_freeze_cas',
      '#729 AC7: the crash prefix fires at the last durable write before the seam: ' + crashed);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).reason,
      'replan_child_finding_uncovered', '#729 AC7: the crash prefix replays into the same refusal');
    // In-transaction repair: the planner re-authors and re-attests, and the child activates
    // without a new transaction or a spent epoch.
    writeChildPlan(fx, tx, { finding_owners: ownersFor(SOURCE_UIDS, 'child-impl') },
      COVERED_CHILD_NODES);
    equal(replan.resumeReplan({ repoRoot: fx.root, project: fx.project }).result, 'committed',
      '#729 AC7: the repaired child activates inside the same transaction');
    equal(authorityCardinalities(fx).epoch, 2, '#729 AC7: exactly one epoch is spent');
  } finally { fs.rmSync(fx.root, { recursive: true, force: true }); }
}

{
  // The wall is a PURE function over (child content, transaction source) — no fs, no phase.
  // These cases pin the grammar and the fail direction directly.
  equal(typeof replan.childFindingCoverage, 'function',
    '#729: the carry-forward wall is exported for direct coverage');
  const nodes = [
    { id: 'w', role: 'tdd-guide', write_set: 'src/a.js' },
    { id: 'g', role: 'code-reviewer', depends_on: 'w', model: 'reasoning',
      gate_claim: 'approved', gate_surface: 'candidate', gate_aggregation: 'sequence' },
    { id: 'z', role: 'finalize', depends_on: 'g', model: '—' },
  ];
  const plan = owners => frozenPlan('p', {
    plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
    code_certifier: 'g', security_certifier: 'none', finding_owners: owners }, nodes, {}).text;
  const tx = findings => ({ source: { findings } });
  const check = (owners, findings) => replan.childFindingCoverage(plan(owners), tx(findings));
  const open = { id: 'F1', status: 'open', action: 'fix', file: 'src/a.js' };

  ok(check('F1=w', [open]).ok, '#729: a covered path-anchored finding passes');
  equal(check('F1=z', [open]).reason, 'replan_child_finding_uncovered',
    '#729: the terminal sink is not a repair owner');
  equal(check('none', [open]).reason, 'replan_child_finding_uncovered',
    '#729: `none` with a live frontier refuses rather than discharging it');
  ok(check('none', []).ok, '#729: `none` with no frontier is the legal empty declaration');
  ok(check('none', [{ id: 'F1', status: 'resolved' }]).ok,
    '#729: an explicitly resolved finding needs no owner');
  ok(check('none', [{ id: 'F1', status: 'deferred' }]).ok,
    '#729: an explicitly deferred finding needs no owner');
  ok(check('none', [{ id: 'F1', status: 'open', action: 'note' }]).ok,
    '#729: an explicitly non-fix action needs no owner');
  equal(check('none', [{ id: 'F1' }]).reason, 'replan_child_finding_uncovered',
    '#729 FAIL DIRECTION: a finding with NO status and NO action still requires an owner — '
    + 'absence never discharges the obligation');
  equal(check('none', [{ id: 'F1', scope: 'product', status: 'open', action: 'fix' }]).reason,
    'replan_child_finding_uncovered',
    '#729 FAIL DIRECTION: the schema-2 free-form scope vocabulary never discharges an owner — '
    + 'reading `scope !== in_scope` as out-of-scope would fail OPEN on the canonical lane');
  equal(check('F1=w,F1=w', [open]).reason, 'replan_child_finding_owners_invalid',
    '#729: a duplicated uid declaration refuses');
  equal(check('F1', [open]).reason, 'replan_child_finding_owners_invalid',
    '#729: a token with no `=` refuses');
  equal(check('F1=', [open]).reason, 'replan_child_finding_owners_invalid',
    '#729: a token with an empty owner refuses');
  equal(check('none,F1=w', [open]).reason, 'replan_child_finding_owners_invalid',
    '#729: `none` mixed with real pairs refuses');
  equal(check('', []).reason, 'replan_child_finding_owners_invalid',
    '#729 FAIL DIRECTION: an EMPTY value is not the empty declaration — only the literal `none` '
    + 'positively states that nothing needs an owner');
  equal(check('F1=w,,F1=w', [open]).reason, 'replan_child_finding_owners_invalid',
    '#729: an empty token between pairs does not silently collapse a duplicate declaration');
  // A REPEATED `finding_owners:` LINE, which is the case `metaFieldOccurrences` exists for and
  // the only one its `metaFields`-vs-occurrences distinction can decide. Every case above
  // repeats a token inside ONE line, so all of them still pass if the wall reads a single
  // last-wins value — which means the duplicate-LINE defence was previously unpinned.
  const duplicateLinePlan = plan('F1=w').replace(/^finding_owners:.*$/m,
    match => match + '\nfinding_owners: F1=z');
  ok(/^finding_owners:/m.test(duplicateLinePlan)
    && duplicateLinePlan.match(/^finding_owners:/gm).length === 2,
  '#729: the duplicate-line fixture really does declare finding_owners twice');
  const duplicateLine = replan.childFindingCoverage(duplicateLinePlan, tx([open]));
  equal(duplicateLine.reason, 'replan_child_finding_owners_invalid',
    '#729: a REPEATED finding_owners LINE refuses — a second line must never silently replace '
    + 'the first, which is what a last-wins read would do: ' + JSON.stringify(duplicateLine));
  ok(/2 times/.test(duplicateLine.detail || ''),
    '#729: the duplicate-line refusal names the occurrence count rather than a token error, so '
    + 'the two failure shapes stay distinguishable: ' + JSON.stringify(duplicateLine.detail));
  equal(replan.childFindingCoverage(
    frozenPlan('p', { plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
      code_certifier: 'g', security_certifier: 'none' }, nodes, {}).text, tx([open])).reason,
  'replan_child_finding_owners_invalid',
  '#729 FAIL DIRECTION: an ABSENT finding_owners key refuses — absence is the corruption '
    + 'signature, never an exemption');
  // The relocation escape is an EXPLICIT planner assertion, never an inference: the repair
  // site legitimately differs from the observation anchor, but the owner must still be a
  // write-capable node that reaches the certifier.
  equal(check('F1=w', [{ id: 'F1', status: 'open', action: 'fix', file: 'src/elsewhere.js' }]).reason,
    'replan_child_finding_uncovered',
    '#729: an anchor outside the declared write set refuses without an explicit relocation');
  ok(check('F1=w@relocated', [{ id: 'F1', status: 'open', action: 'fix', file: 'src/elsewhere.js' }]).ok,
    '#729: an explicitly relocated repair site is admitted');
  equal(check('F1=g@relocated', [open]).reason, 'replan_child_finding_uncovered',
    '#729: relocation waives only anchor containment, never write-capability or certification');
  // The anchorless policy is symmetric: it is REQUIRED where no anchor exists and REFUSED
  // where one does, so it can never be used as a free bypass of containment.
  const anchorless = { id: 'F1', status: 'open', action: 'fix' };
  equal(check('F1=w', [anchorless]).reason, 'replan_child_finding_uncovered',
    '#729: an anchorless finding without the explicit policy refuses');
  ok(check('F1=w@anchorless', [anchorless]).ok,
    '#729: an anchorless finding with the explicit policy and a real owner passes');
  equal(check('F1=w@anchorless', [open]).reason, 'replan_child_finding_uncovered',
    '#729: the anchorless policy on an ANCHORED finding refuses — it is not a containment bypass');
  equal(check('F1=w@guessed', [open]).reason, 'replan_child_finding_owners_invalid',
    '#729: an unknown policy suffix refuses rather than being parsed away as part of the node id');
  // Two clauses that the cases above cannot reach, because a simpler clause fires first on
  // those fixtures. Both assert the exact CAUSE, not just the reason: the causes are how the
  // planner is told WHICH rule it broke, and a cause that silently degrades to a neighbouring
  // one is the same defect as a rule that stops firing.
  {
    // Write-capability, isolated. An anchorless finding waives anchor containment, so a
    // read-only node declared as its owner reaches the capability clause with nothing else in
    // front of it — this is the exact shape a review-only child would use to absorb one.
    const readOnlyOwner = frozenPlan('p', {
      plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
      code_certifier: 'g', security_certifier: 'none', finding_owners: 'F1=r@anchorless' }, [
      { id: 'r', role: 'code-explorer' },
      { id: 'g', role: 'code-reviewer', depends_on: 'r', model: 'reasoning',
        gate_claim: 'approved', gate_surface: 'candidate', gate_aggregation: 'sequence' },
      { id: 'z', role: 'finalize', depends_on: 'g', model: '—' },
    ], {}).text;
    const verdict = replan.childFindingCoverage(readOnlyOwner,
      { source: { findings: [{ id: 'F1', status: 'open', action: 'fix' }] } });
    deepEqual(verdict.errors, ['uncovered finding uid=F1 path=none node=r cause=owner_not_write_capable'],
      '#729: a READ-ONLY node cannot own even an anchorless finding — the explicit policy waives '
      + 'the anchor check, never write-capability: ' + JSON.stringify(verdict));
  }
  {
    // Self-certification, isolated. A security-reviewer is a legal writer, so a child may name
    // the designated security wall itself as the repair owner; that is the "the finding vanishes
    // because the child contains a certifier" shape, and it must be reported as such.
    const selfCertifying = frozenPlan('p', {
      plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
      code_certifier: 'none', security_certifier: 's', finding_owners: 'F1=s@relocated' }, [
      { id: 'w', role: 'tdd-guide', write_set: 'src/a.js' },
      { id: 's', role: 'security-reviewer', depends_on: 'w', write_set: 'src/b.js', model: 'reasoning',
        gate_claim: 'approved', gate_surface: 'candidate', gate_aggregation: 'sequence' },
      { id: 'z', role: 'finalize', depends_on: 's', model: '—' },
    ], {}).text;
    const verdict = replan.childFindingCoverage(selfCertifying,
      { source: { findings: [{ id: 'F1', status: 'open', action: 'fix', file: 'src/a.js' }] } });
    deepEqual(verdict.errors,
      ['uncovered finding uid=F1 path=src/a.js node=s cause=owner_is_the_designated_certifier'],
      '#729: a write-capable certifier cannot certify its own repair, and the cause says so '
      + 'rather than degrading to the generic reachability message: ' + JSON.stringify(verdict));
  }
  // Anchor containment is EXACT-path, matching the per-node barrier. Neither a
  // directory-shaped nor a glob token proves coverage — and neither can reach this wall in the
  // first place, because the validator's freeze wall refuses both shapes outright.
  for (const token of ['src/', 'src/*.js']) {
    equal(replan.childFindingCoverage(frozenPlan('p', {
      plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
      code_certifier: 'g', security_certifier: 'none', finding_owners: 'F1=w' },
    [{ id: 'w', role: 'tdd-guide', write_set: token }, nodes[1], nodes[2]], {}).text, tx([open])).reason,
    'replan_child_finding_uncovered',
    '#729: a non-exact write-set token "' + token + '" never proves anchor coverage');
    ok(validator.validatePlan(frozenPlan('p', { plan_schema_version: 2 },
      [{ id: 'w', role: 'tdd-guide', write_set: token }], {}).text, { root: __dirname }).result === 'refuse',
    '#729: ...and the freeze wall refuses "' + token + '" outright, so the strict reading is '
      + 'the only reading a real child can ever be judged under');
  }
}

console.log(`test-replan: PASSED (${passed} assertions)`);
