#!/usr/bin/env node
'use strict';
// Regression for #740: an INTERIOR schema-2 change-gate whose own certified surface
// is byte-unchanged stays fresh at --verdict-check even after a DISJOINT downstream
// write moves the whole candidate — while the final certifier keeps whole-candidate
// binding and a genuine surface change is still refused stale.
//
// Drives the REAL runtime (open/record/close) so every receipt + journal attempt is
// authentic, then exercises the actual plan-validator --verdict-check path.
// Hand-rolled assert, exit 0 + sentinel on pass, exit 1 on failure.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const adaptiveNodeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-adaptive-node.js');
const planValidatorScript = path.join(repoRoot, 'scripts', 'kaola-workflow-plan-validator.js');
const runner = require('./kaola-workflow-validation-runner');
const GIT_ISOLATION_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) passed++; else { failed++; console.error('FAIL: ' + msg); } }

function git(tmp, args) {
  return spawnSync('git', args, { cwd: tmp, encoding: 'utf8', env: { ...process.env, ...GIT_ISOLATION_ENV } });
}
function initGitRepo(tmp) {
  git(tmp, ['init', '-b', 'main']);
  git(tmp, ['config', 'user.email', 'test@example.com']);
  git(tmp, ['config', 'user.name', 'Test User']);
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  git(tmp, ['add', 'README.md']);
  git(tmp, ['commit', '-m', 'init']);
}
function node(script, args, cwd, input) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd, encoding: 'utf8', input,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', ...GIT_ISOLATION_ENV },
  });
}
function lastJson(r) {
  const line = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{')).pop();
  try { return line ? JSON.parse(line) : null; } catch (_) { return null; }
}

// ---- 1. computeLandableBlobEntries unit assertions (the new digest primitive) ----
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-blob-entries-')));
  try {
    initGitRepo(tmp);
    fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib', 'a.js'), 'A\n');
    const first = runner.computeLandableBlobEntries(tmp, { paths: ['lib/a.js', 'lib/missing.js'] });
    assert(first && /^[0-7]{6} [0-9a-f]{40,64}$/.test(first['lib/a.js'] || ''),
      '1: present path returns a <mode> <sha> entry');
    assert(first && !('lib/missing.js' in first), '1: absent path is omitted');
    assert(JSON.stringify(runner.computeLandableBlobEntries(tmp, { paths: [] })) === '{}',
      '1: empty path list returns an empty map');
    fs.writeFileSync(path.join(tmp, 'lib', 'a.js'), 'A CHANGED\n');
    const second = runner.computeLandableBlobEntries(tmp, { paths: ['lib/a.js'] });
    assert(second['lib/a.js'] !== first['lib/a.js'], '1: a content change moves the entry');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---- 2. interior-gate freshness end-to-end ----
const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-interior-fresh-')));
try {
  initGitRepo(tmp);
  const project = 'issue-740';
  const projectDir = path.join(tmp, 'kaola-workflow', project);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'lib', 'impl.js'), 'module.exports = 0;\n');
  fs.writeFileSync(path.join(tmp, 'lib', 'other.js'), 'module.exports = 0;\n');
  const planPath = path.join(projectDir, 'workflow-plan.md');
  // writer -> probe (interior adversarial change-gate, certifies writer) -> docs
  // (disjoint downstream writer) -> cert (the code_certifier) -> finalize.
  fs.writeFileSync(planPath, [
    '# Workflow Plan — interior gate freshness (#740)', '',
    '## Meta',
    'plan_schema_version: 2',
    'labels: enhancement',
    'code_certifier: cert',
    'security_certifier: none',
    'inherited_frontier_digest: none',
    'inherited_frontier_classes: none',
    'validation_command: node --check lib/impl.js',
    'validation_timeout_minutes: 5', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| writer | tdd-guide | — | lib/impl.js | 1 | sequence | — | — | — | — |',
    '| probe | adversarial-verifier | writer | — | 1 | sequence | probe-change | impl-surface | sequence | writer |',
    '| docs | tdd-guide | probe | lib/other.js | 1 | sequence | — | — | — | — |',
    '| cert | code-reviewer | docs | — | 1 | sequence | review-change | code-tree | sequence | — |',
    '| finalize | finalize | cert | — | 1 | sequence | — | — | — | — |', '',
    '## Node Ledger', '',
    '| id | status |', '|---|---|',
    '| writer | pending |', '| probe | pending |', '| docs | pending |',
    '| cert | pending |', '| finalize | pending |', '',
    '## Required Agent Compliance', '',
    '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
    '| tdd-guide (writer) | pending | | |', '| adversarial-verifier (probe) | pending | | |',
    '| tdd-guide (docs) | pending | | |', '| code-reviewer (cert) | pending | | |',
    '| finalize (finalize) | pending | | |', '',
  ].join('\n'));
  fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), '# Workflow State\nstatus: active\n');

  const freeze = node(planValidatorScript, [planPath, '--freeze', '--json'], tmp);
  assert(freeze.status === 0, 'setup: interior-gate plan freezes: ' + freeze.stdout + freeze.stderr);
  if (freeze.status !== 0) { throw new Error('freeze failed — cannot proceed'); }
  git(tmp, ['add', '-A']);
  git(tmp, ['commit', '-m', 'freeze']);

  const writerEvidence = (id, nonce, tag) => 'evidence-binding: ' + id + ' ' + nonce
    + '\nRED: ' + tag + ' reproduced\nGREEN: ' + tag + ' passes\n';
  const gateEvidence = (id, nonce, dispatch, outcome, extraRows) => [
    'evidence-binding: ' + id + ' ' + nonce,
    'contract_version: 2',
    'review_context_hash: ' + dispatch.review_context_hash,
    'behavior_contract_hash: ' + dispatch.behavior_contract_hash,
    'resolved_profile_hash: ' + dispatch.resolved_profile_hash,
    'candidate_digest: ' + dispatch.candidate_digest,
    'domain_outcome: ' + outcome,
    'gate_claim: ' + dispatch.gate_claim,
    'gate_surface: ' + dispatch.gate_surface,
    'gate_aggregation: ' + dispatch.gate_aggregation,
    ...(extraRows || []), '',
  ].join('\n');

  // writer: ship v1.
  const openWriter = lastJson(node(adaptiveNodeScript, ['open-next', '--project', project, '--json'], tmp));
  assert(openWriter && openWriter.opened && openWriter.opened.id === 'writer', 'writer opens');
  fs.writeFileSync(path.join(tmp, 'lib', 'impl.js'), 'module.exports = 1;\n');
  assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writer', '--stdin', '--json'], tmp,
    writerEvidence('writer', openWriter.nonce, 'base')).status === 0, 'writer evidence records');
  const closeWriter = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writer', '--json'], tmp));
  assert(closeWriter && closeWriter.opened && closeWriter.opened.id === 'probe', 'probe (interior gate) opens after writer: ' + JSON.stringify(closeWriter));
  const probeDispatch = closeWriter.opened.dispatch;

  // probe: interior adversarial change-gate seals PASS at candidate C1 (before docs writes).
  assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'probe', '--stdin', '--json'], tmp,
    gateEvidence('probe', closeWriter.opened.nonce, probeDispatch, 'not_refuted',
      ['claim_outcome: not_refuted', 'gate_mode: ' + (probeDispatch.gate_mode || 'change_gate'), 'findings_none: true'])).status === 0,
    'probe pass evidence records');
  const closeProbe = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'probe', '--json'], tmp));
  assert(closeProbe && closeProbe.opened && closeProbe.opened.id === 'docs', 'probe seals PASS and docs opens: ' + JSON.stringify(closeProbe));

  // docs: DISJOINT downstream write (lib/other.js), moving the whole candidate away from C1.
  const openDocs = closeProbe.opened;
  fs.writeFileSync(path.join(tmp, 'lib', 'other.js'), 'module.exports = 99;\n');
  assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'docs', '--stdin', '--json'], tmp,
    writerEvidence('docs', openDocs.nonce, 'disjoint')).status === 0, 'docs evidence records');
  const closeDocs = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'docs', '--json'], tmp));
  assert(closeDocs && closeDocs.opened && closeDocs.opened.id === 'cert', 'cert (final certifier) opens after docs: ' + JSON.stringify(closeDocs));

  // cert: final code_certifier seals PASS at the FINAL candidate C2 (= current tree).
  const certDispatch = closeDocs.opened.dispatch;
  assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'cert', '--stdin', '--json'], tmp,
    gateEvidence('cert', closeDocs.opened.nonce, certDispatch, 'approved', ['findings_none: true'])).status === 0,
    'cert pass evidence records');
  const closeCert = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'cert', '--json'], tmp));
  assert(closeCert && closeCert.closed === 'cert', 'cert seals PASS: ' + JSON.stringify(closeCert));

  // Sanity: probe sealed at a candidate DIFFERENT from cert's (a disjoint write moved the whole tree).
  assert(probeDispatch.candidate_digest !== certDispatch.candidate_digest,
    'sanity: probe and cert sealed against different whole candidates (disjoint downstream write moved it)');

  // P2 — THE FIX: verdict-check passes. probe is whole-candidate-stale (C1 != current C2) but its
  // certified surface (lib/impl.js) is byte-unchanged, so it stays fresh; cert binds the whole
  // final candidate and is fresh. Pre-#740 this refused verdict_not_pass on the interior gate.
  const verdictFresh = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp);
  const freshOut = lastJson(verdictFresh);
  assert(verdictFresh.status === 0 && freshOut && freshOut.ok === true,
    'P2: interior gate with unchanged surface + disjoint downstream write finalizes fresh (no reopen): '
    + verdictFresh.stdout + verdictFresh.stderr);

  // P3 — surface genuinely changes: the interior gate must go stale again (regression pin that the
  // scoping is a real content check, not an always-pass).
  fs.writeFileSync(path.join(tmp, 'lib', 'impl.js'), 'module.exports = 7;\n');
  const verdictStale = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp);
  const staleOut = lastJson(verdictStale);
  const probeStale = staleOut && Array.isArray(staleOut.failures)
    && staleOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || '')));
  assert(verdictStale.status !== 0 && staleOut && staleOut.ok === false && probeStale,
    'P3: a genuine change to the interior gate surface still refuses stale: ' + verdictStale.stdout + verdictStale.stderr);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

if (failed) {
  console.error(`\ninterior-gate freshness test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`interior-gate freshness test passed (${passed} assertions).`);
