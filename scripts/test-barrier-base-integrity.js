#!/usr/bin/env node
'use strict';

// Integration tests for #368: the per-node barrier baseline is cross-checked against the
// gc-anchored ref (refs/kaola-workflow/barrier/<proj>/<id>). Overwriting the .cache base file
// with the SHA of a fresh snapshot (the trivial spoof) — or a missing ref while the file exists
// — is refused barrier_base_mismatch. Also covers --drop-base (file+ref deletion together).
// Uses a REAL temp git repo (the cross-check shells `git rev-parse`).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let passed = 0, failed = 0;
function assert(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }

const VALIDATOR = path.join(__dirname, 'kaola-workflow-plan-validator.js');

function git(repo, args) { return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim(); }
function safeLastJson(s) {
  const lines = (s || '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) { try { return JSON.parse(lines[i]); } catch (_) {} }
  return {};
}
function val(repo, planPath, args) {
  // cwd=repo: anchorBase's `git update-ref` (record-base) resolves the repo from cwd.
  try {
    const out = execFileSync(process.execPath, [VALIDATOR, planPath, ...args], { cwd: repo, encoding: 'utf8' });
    return { exitCode: 0, json: safeLastJson(out) };
  } catch (e) {
    return { exitCode: e.status || 1, json: safeLastJson((e.stdout || '').toString()) };
  }
}

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bb-'));
try {
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.email', 't@t']);
  git(repo, ['config', 'user.name', 't']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'seed\n');
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-q', '-m', 'seed']);

  const projDir = path.join(repo, 'kaola-workflow', 'issue-1');
  fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
  const planPath = path.join(projDir, 'workflow-plan.md');
  fs.writeFileSync(planPath, [
    '# Workflow Plan — issue-1', '', '## Meta', 'labels: refactor', '',
    '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| n1 | tdd-guide | — | scripts/x.js | 1 | sequence |',
    '| done | finalize | n1 | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| n1 | in_progress |', '| done | pending |', '',
  ].join('\n') + '\n');

  const baseFile = path.join(projDir, '.cache', 'barrier-base-n1');
  const ref = 'refs/kaola-workflow/barrier/issue-1/n1';

  // T1: record-base writes BOTH the .cache file and the anchored ref; they agree.
  const rb = val(repo, planPath, ['--record-base', '--node-id', 'n1', '--json']);
  assert(rb.json.result === 'ok', '#368 T1: record-base ok');
  const fileSha = fs.readFileSync(baseFile, 'utf8').trim();
  let refSha = '';
  try { refSha = git(repo, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']); } catch (_) {}
  assert(!!fileSha && fileSha === refSha, '#368 T1: .cache base SHA == anchored ref SHA');

  // T2: legitimate base passes the cross-check (no barrier_base_mismatch).
  const bc1 = val(repo, planPath, ['--barrier-check', '--node-id', 'n1', '--json']);
  assert(bc1.json.reason !== 'barrier_base_mismatch', '#368 T2: matching base/ref → cross-check does not refuse');

  // T3: tamper — overwrite the file with a DIFFERENT valid commit (HEAD) → refuse.
  const head = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(baseFile, head + '\n');
  const bc2 = val(repo, planPath, ['--barrier-check', '--node-id', 'n1', '--json']);
  assert(bc2.exitCode === 1 && bc2.json.reason === 'barrier_base_mismatch', '#368 T3: tampered base file SHA != ref → barrier_base_mismatch');

  // T4: correct SHA restored but the ref deleted → ref-missing-while-file-exists → refuse.
  fs.writeFileSync(baseFile, fileSha + '\n');
  git(repo, ['update-ref', '-d', ref]);
  const bc3 = val(repo, planPath, ['--barrier-check', '--node-id', 'n1', '--json']);
  assert(bc3.exitCode === 1 && bc3.json.reason === 'barrier_base_mismatch', '#368 T4: anchored ref missing while file exists → barrier_base_mismatch');

  // T5: --drop-base removes file AND ref together; idempotent.
  // #424 (D-424-01) WINDOW-LOCK: --drop-base is honored ONLY when the node's ledger status is
  // `pending` (the legal stale-baseline recovery is ledger-reset → pending → drop → fresh open). The
  // fixture above has n1 `in_progress` (so T1-T4 exercise a live baseline); reset n1 to `pending`
  // here — the legal window — before exercising the mechanical file+ref deletion.
  fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('| n1 | in_progress |', '| n1 | pending |'));
  try { fs.unlinkSync(baseFile); } catch (_) {}
  const rb2 = val(repo, planPath, ['--record-base', '--node-id', 'n1', '--json']);
  assert(rb2.json.result === 'ok' && fs.existsSync(baseFile), '#368 T5 setup: re-record recreates file + ref');
  const db = val(repo, planPath, ['--drop-base', '--node-id', 'n1', '--json']);
  assert(db.json.result === 'ok' && db.json.fileRemoved === true, '#368 T5: drop-base reports fileRemoved');
  assert(!fs.existsSync(baseFile), '#368 T5: base file gone after drop');
  let refGone = true;
  try { git(repo, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']); refGone = false; } catch (_) {}
  assert(refGone === true, '#368 T5: anchored ref gone after drop (no dangling ref)');
  const db2 = val(repo, planPath, ['--drop-base', '--node-id', 'n1', '--json']);
  assert(db2.json.result === 'ok', '#368 T5: second drop-base is an idempotent no-op success');
} finally {
  try { fs.rmSync(repo, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------------------------
// #724: the WHOLE-PLAN barrier must union the SEALED parent-epoch write sets into the declared
// allowlist. A schema-2 child produced by repair->replan carries an ACCUMULATED candidate: files a
// parent epoch legitimately declared, wrote, and gated are still on the branch at finalize, but the
// child plan (a fresh, narrower DAG) does not declare them — so the child-only allowlist refused
// write_set_overflow on legitimate work.
//
// The union WIDENS a safety allowlist, so the parent snapshots become load-bearing evidence. They
// live under .cache/** which is inside the barrier's OWN exempt allowband, i.e. a hand-edited parent
// snapshot is invisible to the barrier. The fix therefore verifies the whole on-disk lineage
// (replan.verifyAllEpochSnapshots — manifest seals, authority projection recomputed from the
// archived plan bytes, contiguity, lineage id, claim root, active manifest digest, live plan hash)
// BEFORE unioning, and refuses `epoch_lineage_unverified` at the CLI when it does not verify.
//
// Fixtures are driven through the REAL replan transaction (prepareReplan -> resumeReplan -> commit)
// so the snapshot seals are genuine, never hand-written to look sealed.
{
  const crypto = require('crypto');
  const schema = require('./kaola-workflow-adaptive-schema');
  const replan = require('./kaola-workflow-replan');
  const validator = require('./kaola-workflow-plan-validator');
  const { generateMirror } = require('./kaola-workflow-task-mirror');
  const liveFixture = require('./replan-conformance-fixtures.json');
  const SOURCE_ATTEMPT_ID = liveFixture.source.attempt_id;

  const gitEnv = Object.assign({}, process.env, {
    GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 't@example.com',
    GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 't@example.com',
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
  });
  const fgit = (root, xs) => execFileSync('git', ['-C', root, ...xs], {
    encoding: 'utf8', env: gitEnv, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

  function frozenPlan(project, meta, nodes, ledger) {
    const s2 = Number(meta && meta.plan_schema_version) === 2;
    const rows = nodes.map(n => s2
      ? `| ${n.id} | ${n.role} | ${n.depends_on || '—'} | ${n.write_set || '—'} | 1 | sequence | ${n.model || 'standard'} | ${n.gate_claim || '—'} | ${n.gate_surface || '—'} | ${n.gate_aggregation || '—'} | — |`
      : `| ${n.id} | ${n.role} | ${n.depends_on || '—'} | ${n.write_set || '—'} | 1 | sequence | ${n.model || 'standard'} |`).join('\n');
    const ledgerRows = nodes.map(n => `| ${n.id} | ${ledger[n.id] || 'pending'} |`).join('\n');
    const complianceRows = nodes.map(n => {
      const status = ledger[n.id] || 'pending';
      if (status === 'complete') return `| ${n.role} (${n.id}) | invoked | .cache/${n.id}.md | |`;
      if (status === 'n/a') return `| ${n.role} (${n.id}) | n/a | | topology skip |`;
      return `| ${n.role} (${n.id}) | pending | | |`;
    }).join('\n');
    let text = [
      `# Workflow Plan — ${project}`, '', '## Meta', `project: ${project}`,
      // fixture must declare the spine discriminator (a caller may still override via meta.plan_form).
      ...((meta && 'plan_form' in meta) ? [] : ['plan_form: spine']),
      'labels: enhancement', 'speculative_open_policy: auto',
      'validation_command: node scripts/test-replan.js',
      ...(s2 ? ['validation_timeout_minutes: 30'] : []),
      ...Object.entries(meta || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`),
      '', '## Nodes', '',
      s2 ? '| id | role | depends_on | declared_write_set | cardinality | shape | model | gate_claim | gate_surface | gate_aggregation | certifies |'
        : '| id | role | depends_on | declared_write_set | cardinality | shape | model |',
      s2 ? '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
        : '| --- | --- | --- | --- | --- | --- | --- |', rows,
      '', '## Node Ledger', '', '| id | status |', '| --- | --- |', ledgerRows,
      '', '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |',
      '| --- | --- | --- | --- |', complianceRows, '',
    ].join('\n');
    const hash = validator.computePlanHash(text);
    return { text: text.replace(/^# Workflow Plan[^\n]*\n/, m => m + `\n<!-- plan_hash: ${hash} -->\n`), hash };
  }

  // A committed epoch-2 project whose SEALED epoch-1 parent declares two paths the child does not:
  //   legacy.js  — parent owner `impl`    with ledger status `complete` (legitimate parent work)
  //   stale.js   — parent owner `skipped` with ledger status `n/a`      (never produced)
  function buildLineageFixture() {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-724-')));
    fgit(root, ['init', '-b', 'main']);
    fgit(root, ['config', 'user.name', 'Test']);
    fgit(root, ['config', 'user.email', 't@example.com']);
    fgit(root, ['config', 'commit.gpgsign', 'false']);
    fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 1;\n');
    fs.writeFileSync(path.join(root, 'legacy.js'), 'module.exports = "legacy";\n');
    fs.writeFileSync(path.join(root, 'stale.js'), 'module.exports = "stale";\n');
    fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
    fgit(root, ['add', '-A']);
    fgit(root, ['commit', '-m', 'root']);
    fgit(root, ['checkout', '-b', 'workflow/issue-699']);
    const commit = fgit(root, ['rev-parse', 'HEAD']);
    const tree = fgit(root, ['rev-parse', 'HEAD^{tree}']);
    const project = 'issue-699';
    const projectDir = path.join(root, 'kaola-workflow', project);
    const cacheDir = path.join(projectDir, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const parent = frozenPlan(project, {}, [
      { id: 'impl', role: 'tdd-guide', write_set: 'product.js,legacy.js' },
      { id: 'skipped', role: 'tdd-guide', depends_on: 'impl', write_set: 'stale.js' },
      { id: 'review', role: 'code-reviewer', depends_on: 'impl', model: 'reasoning' },
      { id: 'finalize', role: 'finalize', depends_on: 'review,skipped', model: '—' },
    ], { impl: 'complete', skipped: 'n/a', review: 'complete', finalize: 'pending' });
    const identity = schema.buildClaimIdentity({
      schema_version: 2, repository_id: 'local:' + root, issue_numbers: [699], primary_issue: 699,
      bundle_id: null, closure_policy: 'all_or_nothing', branch: 'workflow/issue-699',
      worktree_path: root, claim_ts: '2026-07-16T00:00:00.000Z', session_marker: 'test-session',
    });
    const rootBase = schema.buildClaimRootBase({ schema_version: 2,
      object_format: commit.length === 64 ? 'sha256' : 'sha1', commit, tree, branch: 'workflow/issue-699' });
    const lineage = schema.buildEpochLineage(identity, rootBase);
    const legacyState = [
      '# Kaola-Workflow State', '', '## Project', `name: ${project}`, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
      'step: start', `next_command: /kaola-workflow-plan-run ${project}`,
      `next_skill: kaola-workflow-plan-run ${project}`, '', '## Planning Evidence',
      `plan_hash: ${parent.hash}`, 'decision: auto-run',
      'risk: sensitivity=false blast_radius=false uncertain=false reasons=—',
      'first_node_id: impl', 'first_node_role: tdd-guide', '', '## Sink', 'branch: workflow/issue-699',
      'issue_number: 699', 'sink: merge', `main_root: ${root}`, 'session_marker: test-session',
      'claim_ts: 2026-07-16T00:00:00.000Z', `worktree_path: ${root}`,
    ].join('\n') + '\n';
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), schema.writeEpochStateBlock(legacyState, {
      epoch_schema_version: 2, claim_repository_id: identity.repository_id,
      claim_identity_digest: lineage.claim_identity_digest,
      claim_root_object_format: rootBase.object_format, claim_root_base_commit: rootBase.commit,
      claim_root_base_tree: rootBase.tree, claim_root_base_digest: lineage.claim_root_base_digest,
      epoch_lineage_id: lineage.epoch_lineage_id, plan_epoch: 1, active_plan_hash: parent.hash,
      inherited_frontier_digest: 'none', inherited_frontier_classes: 'none',
      automatic_review_replans: 0, authorized_epoch_ceiling: 2, case_b_exemption_consumed: false,
      replan_status: 'none', replan_transaction_id: 'none', replan_phase: 'none',
      active_snapshot_manifest_digest: 'none',
    }));
    fs.writeFileSync(path.join(projectDir, 'workflow-plan.md'), parent.text);
    fs.writeFileSync(path.join(projectDir, 'workflow-tasks.json'), JSON.stringify(
      generateMirror({ planContent: parent.text, now: '2026-07-16T00:00:00.000Z' }), null, 2) + '\n');
    fs.writeFileSync(path.join(cacheDir, 'barrier-open-impl'), commit + '\n');
    fs.writeFileSync(path.join(cacheDir, 'barrier-base-impl'), commit + '\n');
    fs.writeFileSync(path.join(cacheDir, 'impl.md'), 'evidence-binding: impl abc123\nGREEN: fixture\n');
    const generation = liveFixture.source.generation_nonce;
    const findingLines = liveFixture.source.findings.map(f =>
      `finding: id=${f.id} scope=${f.scope} action=${f.action} status=${f.status} severity=${f.severity} file=product.js fix_role=tdd-guide`);
    const reviewBody = [`evidence-binding: review ${generation}`, 'verdict: fail',
      `findings_blocking: ${findingLines.length}`, ...findingLines, ''].join('\n');
    fs.writeFileSync(path.join(cacheDir, 'review.md'), reviewBody);
    const logicalGate = schema.canonicalLogicalGateIdentity({
      kind: 'sequence', id: 'review', origin: ['impl'], members: ['review'] });
    const generations = [{ member: 'review', nonce: generation }];
    fs.writeFileSync(path.join(root, 'product.js'), 'module.exports = 2;\n');
    const candidateDigest = replan.computeReviewCandidateDigest(root, project);
    const parsedFindings = schema.parseNodeFindings(reviewBody).map(f => ({ source_node: 'review', ...f }));
    const journal = {
      schema_version: 1, plan_hash: parent.hash,
      attempts: [{
        attempt_id: SOURCE_ATTEMPT_ID, ordinal: liveFixture.source.ordinal, plan_hash: parent.hash,
        logical_gate: logicalGate, candidate_digest: candidateDigest, candidate_declared: {},
        candidate_residue_digest: liveFixture.source.candidate_residue_digest,
        lifecycle_settled: true, outcome: 'fail', reason: 'verdict_not_pass',
        repair: { selected_writer: null, settled: null }, rebind: [], consumed_by: null,
        producer_bindings: { impl: { baseline: commit, anchored_ref: commit, open_token: commit,
          generation: commit.slice(0, 12), ref: 'refs/kaola-workflow/barrier/issue-699/impl' } },
        findings: parsedFindings,
        route_candidates: parsedFindings.map(f => ({ source_node: 'review', finding_id: f.id, id: f.id,
          scope: f.scope, action: f.action, status: f.status, severity: f.severity, file: f.file,
          ownership_candidates: ['impl'], owning_node: 'impl', fix_role: f.fix_role, raw: f.raw })),
        receipts: [{ node_id: 'review', generation, body: reviewBody,
          receipt_sha256: sha256(Buffer.from(reviewBody)), effective_pass: false, verdict: 'fail',
          findings_blocking: findingLines.length }],
        generations, settlement_command: 'close-node',
        transaction_key: sha256(Buffer.from(JSON.stringify({ plan_hash: parent.hash,
          logical_gate_key: logicalGate.key, candidate_digest: candidateDigest, generations }))),
      }],
    };
    fs.writeFileSync(path.join(cacheDir, 'review-attempts.json'), JSON.stringify(journal, null, 2) + '\n');
    const attempt = journal.attempts[0];
    const state = replan.parseStateFields(fs.readFileSync(path.join(projectDir, 'workflow-state.md'), 'utf8'));
    const payload = {
      schema_version: 2, kind: 'repair_outcome', result: 'repair_requires_replan',
      attempt_id: attempt.attempt_id, reason: 'dependent_producer_replay_required',
      producer_slice: ['impl'], parent_plan_hash: parent.hash,
      epoch_lineage_id: state.epoch_lineage_id, claim_identity_digest: state.claim_identity_digest,
      claim_root_base_digest: state.claim_root_base_digest,
      review_journal_digest: sha256(fs.readFileSync(path.join(cacheDir, 'review-attempts.json'))),
      review_attempt_digest: sha256(Buffer.from(schema.canonicalJson(attempt), 'utf8')),
      effective_candidate_digest: schema.effectiveCandidate(attempt).digest,
    };
    fs.writeFileSync(path.join(cacheDir, 'replan-source.json'), schema.canonicalJson({ ...payload,
      outcome_digest: schema.sha256Canonical(payload), persisted_at: '2026-07-16T00:30:00.000Z' }) + '\n');

    // Drive the REAL replan transaction to `committed` (this is what seals .cache/epochs/1).
    const common = { repoRoot: root, project, now: () => '2026-07-16T03:00:00.000Z' };
    let result = replan.prepareReplan({ ...common, sourceAttemptId: SOURCE_ATTEMPT_ID,
      transitionReason: 'review_repair_requires_replan' });
    for (let turn = 0; turn < 20 && !['committed', 'already_committed'].includes(result && result.result); turn++) {
      if (result && result.reason === 'replan_planner_dispatch_required') {
        const tx = JSON.parse(fs.readFileSync(path.join(cacheDir, schema.REPLAN_TRANSACTION_NAME), 'utf8'));
        const childPath = path.join(projectDir, schema.REPLAN_PLAN_NEXT_NAME);
        if (!fs.existsSync(childPath) || fs.statSync(childPath).size === 0) {
          const child = frozenPlan(project, {
            plan_schema_version: 2, contract_version: 2, epoch_schema_version: 2,
            epoch_lineage_id: tx.epoch_lineage_id, plan_epoch: tx.parent.plan_epoch + 1,
            parent_plan_hash: tx.parent.plan_hash,
            parent_snapshot_manifest_digest: (tx.snapshot && tx.snapshot.authority_digest) || 'pending',
            claim_root_base_digest: tx.cas.prepare.claim_root_base_digest,
            inherited_frontier_digest: tx.cas.prepare.inherited_frontier_digest,
            inherited_frontier_classes: tx.source.inherited_frontier_classes.length
              ? tx.source.inherited_frontier_classes : 'none',
            transition_reason: tx.transition_reason,
            source_evidence_digest: tx.source.source_evidence_digest,
            planner_binding: tx.planner.dispatch_nonce,
            code_certifier: 'child-review', security_certifier: 'child-security',
            // The child carry-forward declaration: which child node repairs each inherited
            // finding uid. Derived from the transaction's own source projection so this
            // fixture can never claim coverage for a uid the packet never published.
            finding_owners: replan.buildFindingIndex(tx.source)
              .map(row => row.uid + '=child-impl' + (row.anchor_paths.length ? '' : '@anchorless'))
              .join(',') || 'none',
          }, [
            { id: 'child-impl', role: 'tdd-guide', write_set: 'product.js' },
            { id: 'child-review', role: 'code-reviewer', depends_on: 'child-impl', model: 'reasoning',
              gate_claim: 'current code candidate is approved', gate_surface: 'full code candidate',
              gate_aggregation: 'sequence' },
            { id: 'child-security', role: 'security-reviewer', depends_on: 'child-review', model: 'reasoning',
              gate_claim: 'current security candidate is approved', gate_surface: 'full security candidate',
              gate_aggregation: 'sequence' },
            { id: 'child-finalize', role: 'finalize', depends_on: 'child-security', model: '—' },
          ], {});
          fs.writeFileSync(childPath, child.text);
          fs.appendFileSync(path.join(cacheDir, 'dispatch-log.jsonl'), JSON.stringify({
            ts: tx.planner.pending_at || new Date().toISOString(), agent_type: 'workflow-planner',
            cwd: root, project, transaction_id: tx.transaction_id,
            dispatch_nonce: tx.planner.dispatch_nonce }) + '\n');
          const attestation = { schema_version: 1, transaction_id: tx.transaction_id, project,
            worktree_path: root, packet_digest: sha256(fs.readFileSync(path.join(cacheDir, 'replan-planner-packet.json'))),
            dispatch_nonce: tx.planner.dispatch_nonce, profile_identity: 'workflow-planner-replan-v1',
            child_path: 'workflow-plan.next.md', child_digest: sha256(fs.readFileSync(childPath)) };
          attestation.attestation_digest = schema.sha256Canonical(attestation);
          fs.writeFileSync(path.join(cacheDir, 'replan-planner-attestation.json'),
            schema.canonicalJson(attestation) + '\n');
        }
      }
      result = replan.resumeReplan(common);
    }
    if (!['committed', 'already_committed'].includes(result && result.result)) {
      throw new Error('#724 fixture: replan did not commit: ' + JSON.stringify(result));
    }
    // The ledger is NOT hash-covered, so closing the child producer keeps plan_hash (and therefore
    // the state binding verifyAllEpochSnapshots asserts) intact.
    const livePath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(livePath, fs.readFileSync(livePath, 'utf8')
      .replace('| child-impl | pending |', '| child-impl | complete |'));
    return { root, project, projectDir, cacheDir, planPath: livePath };
  }

  // The whole-plan barrier diffs `git diff --name-only <merge-base>`, which never lists UNTRACKED
  // paths — stage every fixture write so a brand-new file is actually visible to the gate.
  const touch = (root, rel, body) => {
    fs.writeFileSync(path.join(root, rel), body);
    fgit(root, ['add', rel]);
  };
  const wholePlan = fx => val(fx.root, fx.planPath, ['--barrier-check', '--base', 'main', '--json']);
  const withFixture = fn => {
    const fx = buildLineageFixture();
    try { fn(fx); } finally { try { fs.rmSync(fx.root, { recursive: true, force: true }); } catch (_) {} }
  };

  // #724 T1: a production write declared ONLY by a sealed parent-epoch node whose PARENT ledger row
  // is `complete` passes the whole-plan barrier. This is the reported regression.
  withFixture(fx => {
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    const r = wholePlan(fx);
    assert(r.exitCode === 0 && r.json.result === 'pass',
      '#724 T1: a parent-epoch-declared, parent-complete write passes the whole-plan barrier '
      + '(got ' + r.json.result + '/' + r.json.reason + ' outOfAllow=' + JSON.stringify(r.json.outOfAllow) + ')');
  });

  // #724 T2: a production write declared by NOBODY in the whole lineage still refuses
  // write_set_overflow — the union widens the allowlist, it does not disable the gate.
  withFixture(fx => {
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    touch(fx.root, 'orphan.js', 'module.exports = "orphan";\n');
    const r = wholePlan(fx);
    assert(r.exitCode === 1 && r.json.reason === 'write_set_overflow'
      && (r.json.outOfAllow || []).includes('orphan.js') && !(r.json.outOfAllow || []).includes('legacy.js'),
      '#724 T2: a write declared by no epoch in the lineage still refuses write_set_overflow '
      + '(got ' + r.json.reason + ' outOfAllow=' + JSON.stringify(r.json.outOfAllow) + ')');
  });

  // #724 T3: a path declared by a parent-epoch node whose PARENT ledger row is `n/a` is unioned into
  // the allowlist but lands on the EXISTING rank-4 unattributed floor — the producer claims it never
  // ran, so the write is unreviewed. Proves anyCompleteOwner was extended, not just `declared`.
  withFixture(fx => {
    touch(fx.root, 'stale.js', 'module.exports = "stale-touched";\n');
    const r = wholePlan(fx);
    assert(r.exitCode === 1 && r.json.reason === 'unattributed_write'
      && (r.json.unattributed || []).includes('stale.js'),
      '#724 T3: a parent-declared path whose parent owner is n/a refuses unattributed_write '
      + '(got ' + r.json.reason + ' unattributed=' + JSON.stringify(r.json.unattributed) + ')');
  });

  // #724 T4 (the security argument): a TAMPERED parent snapshot plan that widens the parent write set
  // to an attacker-chosen path must refuse `epoch_lineage_unverified` — never accept the path, and
  // never mislabel it write_set_overflow (whose documented operator response, revert-overflow, would
  // destroy legitimate parent-epoch work).
  withFixture(fx => {
    const snapPlan = path.join(fx.cacheDir, 'epochs', '1', 'files', 'workflow-plan.md');
    fs.writeFileSync(snapPlan, fs.readFileSync(snapPlan, 'utf8')
      .replace('| product.js,legacy.js |', '| product.js,legacy.js,attacker.js |'));
    touch(fx.root, 'attacker.js', 'module.exports = "pwn";\n');
    const r = wholePlan(fx);
    assert(r.exitCode === 1 && r.json.reason === 'epoch_lineage_unverified',
      '#724 T4: a tampered parent snapshot plan refuses epoch_lineage_unverified '
      + '(got ' + r.json.reason + ' outOfAllow=' + JSON.stringify(r.json.outOfAllow) + ')');
    assert(r.json.result === 'refuse' && !(r.json.outOfAllow || []).length,
      '#724 T4: the attacker-widened path is never accepted, and the refusal is NOT the '
      + 'write_set_overflow lie (result=' + r.json.result + ')');
    assert(typeof r.json.lineage_reason === 'string' && r.json.lineage_reason.length > 0,
      '#724 T4: the verbatim lineage verifier reason travels in a sibling field '
      + '(got ' + JSON.stringify(r.json.lineage_reason) + ')');
  });

  // #724 T5: a tampered snapshot MANIFEST refuses epoch_lineage_unverified.
  withFixture(fx => {
    const manifestPath = path.join(fx.cacheDir, 'epochs', '1', 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files[0].digest = 'f'.repeat(64);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    const r = wholePlan(fx);
    assert(r.exitCode === 1 && r.json.reason === 'epoch_lineage_unverified',
      '#724 T5: a tampered snapshot manifest refuses epoch_lineage_unverified (got ' + r.json.reason + ')');
  });

  // #724 T6: a MISSING parent snapshot refuses epoch_lineage_unverified (never a silent child-only
  // allowlist, which would report write_set_overflow — a lie about the real fault).
  withFixture(fx => {
    fs.rmSync(path.join(fx.cacheDir, 'epochs', '1'), { recursive: true, force: true });
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    const r = wholePlan(fx);
    assert(r.exitCode === 1 && r.json.reason === 'epoch_lineage_unverified',
      '#724 T6: a missing parent snapshot refuses epoch_lineage_unverified (got ' + r.json.reason + ')');
  });

  // #724 T7: opts.lineagePlans ABSENT is byte-identical for every existing caller — the pure
  // barrierCheck keeps refusing a parent-only path when no lineage is supplied.
  withFixture(fx => {
    const childContent = fs.readFileSync(fx.planPath, 'utf8');
    const bare = validator.barrierCheck(childContent, ['product.js', 'legacy.js'], { project: fx.project });
    assert(bare.result === 'refuse' && bare.reason === 'write_set_overflow'
      && (bare.outOfAllow || []).includes('legacy.js'),
      '#724 T7: barrierCheck without lineagePlans is unchanged (got ' + bare.reason + ')');
    const parentContent = fs.readFileSync(
      path.join(fx.cacheDir, 'epochs', '1', 'files', 'workflow-plan.md'), 'utf8');
    const withLineage = validator.barrierCheck(childContent, ['product.js', 'legacy.js'], {
      project: fx.project,
      lineagePlans: [{ epoch: 1, nodes: validator.parseNodes(parentContent),
        ledger: validator.parseLedger(parentContent) }],
    });
    assert(withLineage.result === 'pass',
      '#724 T7: the same call WITH lineagePlans passes (got ' + withLineage.reason + ')');
  });

  // -------------------------------------------------------------------------------------------
  // #753: the FINALIZE attribution sweep (`--finalize-check` section B) is the OTHER HALF of #724.
  // It builds `completeDeclared` from parseNodes(content) — the CHILD plan only — so a replanned
  // (schema-2, plan_epoch >= 2) run now clears the whole-plan barrier and is then refused
  // `unattributed_change` at finalize on EXACTLY the same parent-epoch paths.
  //
  // The sweep must union the SEALED parent-epoch declarations, each keyed to ITS OWN epoch's ledger
  // status: unioning DECLARATIONS without unioning ATTRIBUTION would turn the fix into a laundering
  // primitive (a parent node that never ran would carry its declared file through the union).
  //
  // Fixture mechanics: the sweep enumerates `git diff main...HEAD`, which lists COMMITTED content
  // only, so every fixture write is committed. The fixture repo has NO package.json => CONSUMER mode
  // (#475), whose (A') gate needs `.cache/final-validation.md` with a column-0 `verdict: pass` plus a
  // `validated_candidate_hash` (#653) bound to the CURRENT code tree — produced here by the
  // validator's own --candidate-hash mode AFTER the last landable edit.
  // --finalize-check ALSO runs replan.verifyCurrentEpochAuthority (via validateCommittedEpochBinding),
  // which cross-checks the live child plan's `## Required Agent Compliance` table and workflow-tasks.json
  // against the ledger. buildLineageFixture closes `child-impl` in the LEDGER only (the ledger is not
  // hash-covered, so the state binding survives); align the other two authority surfaces the same way a
  // real close would, or the run refuses state_compliance_progress_invalid before the sweep is reached.
  const alignChildAuthority = fx => {
    const live = fs.readFileSync(fx.planPath, 'utf8')
      .replace('| tdd-guide (child-impl) | pending | | |',
        '| tdd-guide (child-impl) | invoked | .cache/child-impl.md | |');
    fs.writeFileSync(fx.planPath, live);
    fs.writeFileSync(path.join(fx.projectDir, 'workflow-tasks.json'), JSON.stringify(
      generateMirror({ planContent: live, now: '2026-07-16T04:00:00.000Z' }), null, 2) + '\n');
    fs.writeFileSync(path.join(fx.cacheDir, 'child-impl.md'),
      'evidence-binding: child-impl fixture\nGREEN: fixture\n');
  };
  // The replan transaction journal is a CRASH-RESUME artifact under .cache/**; once it is gone (or the
  // state no longer points at it) validateCommittedEpochBinding — the OTHER finalize-time consumer of
  // verifyAllEpochSnapshots — short-circuits to ok on its very first line. Disposing it is what isolates
  // the SWEEP's own lineage gate, so the tamper tests below measure this fix and not the fence.
  const disposeReplanJournal = fx => {
    fs.rmSync(path.join(fx.cacheDir, schema.REPLAN_TRANSACTION_NAME), { force: true });
    const statePath = path.join(fx.projectDir, 'workflow-state.md');
    fs.writeFileSync(statePath, fs.readFileSync(statePath, 'utf8')
      .replace(/^replan_transaction_id: .*$/m, 'replan_transaction_id: none')
      .replace(/^replan_phase: .*$/m, 'replan_phase: none'));
  };
  const commitAll = (root, msg) => { fgit(root, ['add', '-A']); fgit(root, ['commit', '-m', msg]); };
  const recordAgentValidation = fx => {
    const h = val(fx.root, fx.planPath, ['--candidate-hash', '--json']);
    if (!h.json || !h.json.validated_candidate_hash) {
      throw new Error('#753 fixture: --candidate-hash failed: ' + JSON.stringify(h.json));
    }
    fs.writeFileSync(path.join(fx.cacheDir, 'final-validation.md'),
      'verdict: pass\nvalidated_candidate_hash: ' + h.json.validated_candidate_hash + '\n');
  };
  const finalizeCheck = fx => {
    alignChildAuthority(fx);
    commitAll(fx.root, 'fixture work');
    recordAgentValidation(fx);
    return val(fx.root, fx.planPath, ['--finalize-check', '--base', 'main', '--json']);
  };

  // #753 F1: a path declared ONLY by a sealed parent-epoch node whose PARENT ledger row is `complete`
  // must PASS the finalize sweep. This is the reported second-half regression.
  withFixture(fx => {
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    const r = finalizeCheck(fx);
    assert(r.exitCode === 0 && r.json.result === 'pass',
      '#753 F1: a parent-epoch-declared, parent-complete write passes --finalize-check '
      + '(got ' + r.json.result + '/' + r.json.reason + ' unattributed='
      + JSON.stringify(r.json.unattributed) + ')');
  });

  // #753 F2: a path declared by NOBODY in the lineage still refuses `unattributed_change` — the union
  // WIDENS the attributed set, it does not disable the sweep.
  withFixture(fx => {
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    touch(fx.root, 'orphan.js', 'module.exports = "orphan";\n');
    const r = finalizeCheck(fx);
    assert(r.exitCode === 1 && r.json.reason === 'unattributed_change'
      && (r.json.unattributed || []).includes('orphan.js')
      && !(r.json.unattributed || []).includes('legacy.js'),
      '#753 F2: a write declared by no epoch in the lineage still refuses unattributed_change '
      + '(got ' + r.json.reason + ' unattributed=' + JSON.stringify(r.json.unattributed) + ')');
  });

  // #753 F3 (the load-bearing half): a path declared ONLY by a parent node whose PARENT ledger row is
  // `n/a` is NOT attributed — the producer claims it never ran, so the write is unreviewed and must
  // still refuse. Proves the ATTRIBUTION (ledger) extension, not just the DECLARATION union.
  withFixture(fx => {
    touch(fx.root, 'stale.js', 'module.exports = "stale-touched";\n');
    const r = finalizeCheck(fx);
    assert(r.exitCode === 1 && r.json.reason === 'unattributed_change'
      && (r.json.unattributed || []).includes('stale.js'),
      '#753 F3: a parent-declared path whose parent owner is n/a still refuses unattributed_change '
      + '(got ' + r.json.reason + ' unattributed=' + JSON.stringify(r.json.unattributed) + ')');
  });

  // #753 F4 (the security argument): a TAMPERED parent snapshot plan that widens the parent write set
  // to an attacker-chosen path must fail CLOSED with the lineage reason — never accept the path, and
  // never mislabel it `unattributed_change` (whose documented operator response is to delete the file).
  withFixture(fx => {
    disposeReplanJournal(fx);
    const snapPlan = path.join(fx.cacheDir, 'epochs', '1', 'files', 'workflow-plan.md');
    fs.writeFileSync(snapPlan, fs.readFileSync(snapPlan, 'utf8')
      .replace('| product.js,legacy.js |', '| product.js,legacy.js,attacker.js |'));
    touch(fx.root, 'attacker.js', 'module.exports = "pwn";\n');
    const r = finalizeCheck(fx);
    assert(r.exitCode === 1 && r.json.result === 'refuse' && r.json.reason === 'epoch_lineage_unverified',
      '#753 F4: a tampered parent snapshot plan refuses epoch_lineage_unverified at finalize '
      + '(got ' + r.json.result + '/' + r.json.reason + ')');
    assert(!(r.json.unattributed || []).length && r.json.reason !== 'unattributed_change',
      '#753 F4: the attacker-widened path is never accepted and never mislabelled unattributed_change '
      + '(got ' + r.json.reason + ' unattributed=' + JSON.stringify(r.json.unattributed) + ')');
    assert(typeof r.json.lineage_reason === 'string' && r.json.lineage_reason.length > 0,
      '#753 F4: the verbatim lineage verifier reason travels in a sibling field '
      + '(got ' + JSON.stringify(r.json.lineage_reason) + ')');
  });

  // #753 F5: a MISSING parent snapshot fails closed the same way — never a silent child-only sweep
  // (which would report unattributed_change, a lie about the real fault).
  withFixture(fx => {
    disposeReplanJournal(fx);
    fs.rmSync(path.join(fx.cacheDir, 'epochs', '1'), { recursive: true, force: true });
    touch(fx.root, 'legacy.js', 'module.exports = "legacy-fixed";\n');
    const r = finalizeCheck(fx);
    assert(r.exitCode === 1 && r.json.reason === 'epoch_lineage_unverified',
      '#753 F5: a missing parent snapshot refuses epoch_lineage_unverified at finalize '
      + '(got ' + r.json.reason + ')');
  });
}

if (failed > 0) {
  console.error('barrier-base-integrity tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('barrier-base-integrity tests passed (' + passed + ' assertions)');
}
