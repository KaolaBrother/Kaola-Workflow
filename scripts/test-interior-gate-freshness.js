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

// ---- shared evidence writers (blocks 3-5) ----
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

// ---- 3. interior REVIEWER gate freshness end-to-end (#745) ----
// Same shape as block 2 but the interior change-gate is a code-reviewer / security-reviewer
// (no `certifies`; freeze-time G4 forbids it on reviewer roles). Its reviewed-producer slice
// is recomputed from the frozen graph + ledger and cross-checked against the seal attempt's
// producer_bindings. A disjoint downstream write must NOT stale it, and a genuine surface
// change must still refuse stale. Parameterised over BOTH admitted reviewer roles — the
// widening admits security-reviewer too, so it must be exercised, not merely assumed.
for (const probeRole of ['code-reviewer', 'security-reviewer']) {
  const tag = '745[' + probeRole + ']';
  const tmp3 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-interior-fresh-reviewer-')));
  try {
    initGitRepo(tmp3);
    const project = 'issue-745';
    const projectDir = path.join(tmp3, 'kaola-workflow', project);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(tmp3, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp3, 'lib', 'impl.js'), 'module.exports = 0;\n');
    fs.writeFileSync(path.join(tmp3, 'lib', 'other.js'), 'module.exports = 0;\n');
    const planPath = path.join(projectDir, 'workflow-plan.md');
    // writer -> probe (interior REVIEWER change-gate, NO certifies) -> docs
    // (disjoint downstream writer) -> cert (the code_certifier) -> finalize.
    fs.writeFileSync(planPath, [
      '# Workflow Plan — interior reviewer gate freshness (#745)', '',
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
      '| probe | ' + probeRole + ' | writer | — | 1 | sequence | probe-review | impl-surface | sequence | — |',
      '| docs | tdd-guide | probe | lib/other.js | 1 | sequence | — | — | — | — |',
      '| cert | code-reviewer | docs | — | 1 | sequence | review-change | code-tree | sequence | — |',
      '| finalize | finalize | cert | — | 1 | sequence | — | — | — | — |', '',
      '## Node Ledger', '',
      '| id | status |', '|---|---|',
      '| writer | pending |', '| probe | pending |', '| docs | pending |',
      '| cert | pending |', '| finalize | pending |', '',
      '## Required Agent Compliance', '',
      '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
      '| tdd-guide (writer) | pending | | |', '| ' + probeRole + ' (probe) | pending | | |',
      '| tdd-guide (docs) | pending | | |', '| code-reviewer (cert) | pending | | |',
      '| finalize (finalize) | pending | | |', '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), '# Workflow State\nstatus: active\n');

    const freeze = node(planValidatorScript, [planPath, '--freeze', '--json'], tmp3);
    assert(freeze.status === 0, tag + ' setup: interior reviewer plan freezes: ' + freeze.stdout + freeze.stderr);
    if (freeze.status !== 0) { throw new Error('freeze failed — cannot proceed'); }
    git(tmp3, ['add', '-A']);
    git(tmp3, ['commit', '-m', 'freeze']);

    // writer: ship v1.
    const openWriter = lastJson(node(adaptiveNodeScript, ['open-next', '--project', project, '--json'], tmp3));
    assert(openWriter && openWriter.opened && openWriter.opened.id === 'writer', tag + ': writer opens');
    fs.writeFileSync(path.join(tmp3, 'lib', 'impl.js'), 'module.exports = 1;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writer', '--stdin', '--json'], tmp3,
      writerEvidence('writer', openWriter.nonce, 'base')).status === 0, tag + ': writer evidence records');
    const closeWriter = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writer', '--json'], tmp3));
    assert(closeWriter && closeWriter.opened && closeWriter.opened.id === 'probe', tag + ': probe (interior reviewer gate) opens after writer: ' + JSON.stringify(closeWriter));
    const probeDispatch = closeWriter.opened.dispatch;

    // probe: interior reviewer change-gate seals PASS at candidate C1 (before docs writes).
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'probe', '--stdin', '--json'], tmp3,
      gateEvidence('probe', closeWriter.opened.nonce, probeDispatch, 'approved', ['findings_none: true'])).status === 0,
      tag + ': probe pass evidence records');
    const closeProbe = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'probe', '--json'], tmp3));
    assert(closeProbe && closeProbe.opened && closeProbe.opened.id === 'docs', tag + ': probe seals PASS and docs opens: ' + JSON.stringify(closeProbe));

    // docs: DISJOINT downstream write (lib/other.js), moving the whole candidate away from C1.
    const openDocs = closeProbe.opened;
    fs.writeFileSync(path.join(tmp3, 'lib', 'other.js'), 'module.exports = 99;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'docs', '--stdin', '--json'], tmp3,
      writerEvidence('docs', openDocs.nonce, 'disjoint')).status === 0, tag + ': docs evidence records');
    const closeDocs = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'docs', '--json'], tmp3));
    assert(closeDocs && closeDocs.opened && closeDocs.opened.id === 'cert', tag + ': cert (final certifier) opens after docs: ' + JSON.stringify(closeDocs));

    // cert: final code_certifier seals PASS at the FINAL candidate C2 (= current tree).
    const certDispatch = closeDocs.opened.dispatch;
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'cert', '--stdin', '--json'], tmp3,
      gateEvidence('cert', closeDocs.opened.nonce, certDispatch, 'approved', ['findings_none: true'])).status === 0,
      tag + ': cert pass evidence records');
    const closeCert = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'cert', '--json'], tmp3));
    assert(closeCert && closeCert.closed === 'cert', tag + ': cert seals PASS: ' + JSON.stringify(closeCert));

    // Sanity: probe sealed at a candidate DIFFERENT from cert's.
    assert(probeDispatch.candidate_digest !== certDispatch.candidate_digest,
      tag + ' sanity: probe and cert sealed against different whole candidates (disjoint downstream write moved it)');

    // THE FIX (#745): verdict-check passes. probe is a reviewer gate that is whole-candidate-stale
    // (C1 != current C2) but its reviewed surface (lib/impl.js) is byte-unchanged, so it stays fresh.
    // Pre-#745 this refused verdict_not_pass on the interior reviewer gate.
    const verdictFresh = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp3);
    const freshOut = lastJson(verdictFresh);
    assert(verdictFresh.status === 0 && freshOut && freshOut.ok === true,
      tag + ': interior reviewer gate with unchanged surface + disjoint downstream write finalizes fresh: '
      + verdictFresh.stdout + verdictFresh.stderr);

    // Fail-closed pin (P3-analog): a genuine change to the reviewed surface must re-stale the reviewer
    // gate — the widening must not degrade into an always-pass.
    fs.writeFileSync(path.join(tmp3, 'lib', 'impl.js'), 'module.exports = 7;\n');
    const verdictStale = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp3);
    const staleOut = lastJson(verdictStale);
    const probeStale = staleOut && Array.isArray(staleOut.failures)
      && staleOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || '')));
    assert(verdictStale.status !== 0 && staleOut && staleOut.ok === false && probeStale,
      tag + ' fail-closed: a genuine change to the interior reviewer surface still refuses stale: '
      + verdictStale.stdout + verdictStale.stderr);

    // FAIL-OPEN B pin (#745): the reviewer arm is only sound while the plan still has a FINAL certifier
    // holding the whole-candidate wall. Drop it (Meta is validation-invisible, so the candidate digest is
    // unchanged) and every reviewer gate — including `cert` itself — must fall back to whole-candidate
    // binding and refuse. Otherwise the final wall silently degrades into a surface-scoped interior gate.
    fs.writeFileSync(path.join(tmp3, 'lib', 'impl.js'), 'module.exports = 1;\n'); // restore probe's surface
    fs.writeFileSync(path.join(tmp3, 'lib', 'rogue.js'), 'module.exports = "unreviewed";\n');
    const rogueHonest = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp3);
    const rogueHonestOut = lastJson(rogueHonest);
    assert(rogueHonest.status !== 0 && rogueHonestOut && rogueHonestOut.ok === false
      && rogueHonestOut.failures.some(f => f && f.nodeId === 'cert' && /stale/.test(String(f.reason || ''))),
      tag + ' sanity: an unreviewed new file stales the FINAL certifier: ' + rogueHonest.stdout + rogueHonest.stderr);

    // FAIL-OPEN C pin (#745): RESOLVABILITY is not LIVENESS. `cert` still resolves out of Meta while its
    // Node Ledger row reads `n/a` — but an `n/a` row drops out of the verdict sweep's `checked` set, so
    // NOTHING is ever verified against the whole candidate. The reviewer arm must require a certifier that
    // is actually live, not merely nameable; otherwise every interior reviewer scopes to its own surface
    // and the unreviewed rogue file finalizes clean.
    const planWithLiveCert = fs.readFileSync(planPath, 'utf8');
    fs.writeFileSync(planPath, planWithLiveCert.replace(/^\|\s*cert\s*\|\s*complete\s*\|/m, '| cert | n/a |'));
    const naCert = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp3);
    const naCertOut = lastJson(naCert);
    assert(naCert.status !== 0 && naCertOut && naCertOut.ok === false
      && naCertOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
      tag + ' fail-open C: a final certifier whose ledger row is `n/a` is NOT a live whole-candidate wall — '
      + 'the interior reviewer must stay whole-candidate-bound and the unreviewed file must still refuse: '
      + naCert.stdout + naCert.stderr);

    // FAIL-OPEN D pin (#745): the sweep membership the liveness test mirrors is an ALLOW-list
    // (`if (ledger.get(node.id) !== 'complete') continue;`), not a deny-list. A certifier row reading
    // `pending` or `in_progress` is never reached by the finalize sweep either — at the finalize sweep
    // there is no "ahead" — so it holds no whole-candidate wall, exactly like `n/a`. Both must keep the
    // interior reviewer whole-candidate-bound so the unreviewed rogue file still refuses.
    for (const notComplete of ['pending', 'in_progress']) {
      fs.writeFileSync(planPath,
        planWithLiveCert.replace(/^\|\s*cert\s*\|\s*complete\s*\|/m, '| cert | ' + notComplete + ' |'));
      const softCert = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp3);
      const softCertOut = lastJson(softCert);
      assert(softCert.status !== 0 && softCertOut && softCertOut.ok === false
        && softCertOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
        tag + ' fail-open D: a final certifier whose ledger row is `' + notComplete + '` is never reached by '
        + 'the finalize verdict sweep, so it is NOT a live whole-candidate wall — the interior reviewer must '
        + 'stay whole-candidate-bound and the unreviewed file must still refuse: '
        + softCert.stdout + softCert.stderr);
    }
    fs.writeFileSync(planPath, planWithLiveCert); // restore the live certifier row

    fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8')
      .replace(/^code_certifier: cert$/m, 'code_certifier: none'));
    const noCert = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp3);
    const noCertOut = lastJson(noCert);
    assert(noCert.status !== 0 && noCertOut && noCertOut.ok === false
      && noCertOut.failures.some(f => f && f.nodeId === 'cert' && /stale/.test(String(f.reason || ''))),
      tag + ' fail-open B: with NO resolvable final certifier, the reviewer gate must NOT scope itself to '
      + 'its own surface — an unreviewed file still refuses: ' + noCert.stdout + noCert.stderr);
  } finally { fs.rmSync(tmp3, { recursive: true, force: true }); }
}

// ---- 4. FAIL-OPEN A pin (#745): a shrunk producer_bindings must not buy a pass ----
// The reviewer arm's freshness surface must be RECOMPUTED from the frozen graph + ledger and
// cross-checked against the journal — never read out of `.cache/review-attempts.json` on trust
// (mirrors the runtime's own "never trust the record" posture in reviewJournalIdentityMatchesPlan).
// Two upstream writers feed the interior gate; a downstream node then genuinely modifies ONE of the
// reviewed files. Honest journal => stale, correctly. Delete that writer's binding key and the
// surface shrinks to the untouched file — which must NOT flip the verdict to pass.
{
  const tmp4 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-interior-fresh-tamper-')));
  try {
    initGitRepo(tmp4);
    const project = 'issue-745t';
    const projectDir = path.join(tmp4, 'kaola-workflow', project);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(tmp4, 'lib'), { recursive: true });
    for (const f of ['first.js', 'second.js', 'other.js']) {
      fs.writeFileSync(path.join(tmp4, 'lib', f), 'module.exports = 0;\n');
    }
    const planPath = path.join(projectDir, 'workflow-plan.md');
    // writerA(lib/first.js) -> writerB(lib/second.js) -> probe (interior code-reviewer;
    // producer_bindings = {writerA, writerB}) -> docs (rewrites lib/first.js + lib/other.js)
    // -> cert (code_certifier, seals the FINAL candidate) -> finalize.
    fs.writeFileSync(planPath, [
      '# Workflow Plan — interior reviewer surface is recomputed (#745)', '',
      '## Meta',
      'plan_schema_version: 2',
      'labels: enhancement',
      'code_certifier: cert',
      'security_certifier: none',
      'inherited_frontier_digest: none',
      'inherited_frontier_classes: none',
      'validation_command: node --check lib/first.js',
      'validation_timeout_minutes: 5', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
      '|---|---|---|---|---|---|---|---|---|---|',
      '| writerA | tdd-guide | — | lib/first.js | 1 | sequence | — | — | — | — |',
      '| writerB | tdd-guide | writerA | lib/second.js | 1 | sequence | — | — | — | — |',
      '| probe | code-reviewer | writerB | — | 1 | sequence | probe-review | impl-surface | sequence | — |',
      '| docs | tdd-guide | probe | lib/first.js, lib/other.js | 1 | sequence | — | — | — | — |',
      '| cert | code-reviewer | docs | — | 1 | sequence | review-change | code-tree | sequence | — |',
      '| finalize | finalize | cert | — | 1 | sequence | — | — | — | — |', '',
      '## Node Ledger', '',
      '| id | status |', '|---|---|',
      '| writerA | pending |', '| writerB | pending |', '| probe | pending |',
      '| docs | pending |', '| cert | pending |', '| finalize | pending |', '',
      '## Required Agent Compliance', '',
      '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
      '| tdd-guide (writerA) | pending | | |', '| tdd-guide (writerB) | pending | | |',
      '| code-reviewer (probe) | pending | | |', '| tdd-guide (docs) | pending | | |',
      '| code-reviewer (cert) | pending | | |', '| finalize (finalize) | pending | | |', '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), '# Workflow State\nstatus: active\n');

    const freeze = node(planValidatorScript, [planPath, '--freeze', '--json'], tmp4);
    assert(freeze.status === 0, '745-A setup: two-writer plan freezes: ' + freeze.stdout + freeze.stderr);
    if (freeze.status !== 0) { throw new Error('freeze failed — cannot proceed'); }
    git(tmp4, ['add', '-A']);
    git(tmp4, ['commit', '-m', 'freeze']);

    const openA = lastJson(node(adaptiveNodeScript, ['open-next', '--project', project, '--json'], tmp4));
    assert(openA && openA.opened && openA.opened.id === 'writerA', '745-A: writerA opens');
    fs.writeFileSync(path.join(tmp4, 'lib', 'first.js'), 'module.exports = 1;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writerA', '--stdin', '--json'], tmp4,
      writerEvidence('writerA', openA.nonce, 'a')).status === 0, '745-A: writerA evidence records');
    const closeA = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writerA', '--json'], tmp4));
    assert(closeA && closeA.opened && closeA.opened.id === 'writerB', '745-A: writerB opens: ' + JSON.stringify(closeA));

    fs.writeFileSync(path.join(tmp4, 'lib', 'second.js'), 'module.exports = 2;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writerB', '--stdin', '--json'], tmp4,
      writerEvidence('writerB', closeA.opened.nonce, 'b')).status === 0, '745-A: writerB evidence records');
    const closeB = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writerB', '--json'], tmp4));
    assert(closeB && closeB.opened && closeB.opened.id === 'probe', '745-A: probe opens: ' + JSON.stringify(closeB));

    const probeDispatch = closeB.opened.dispatch;
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'probe', '--stdin', '--json'], tmp4,
      gateEvidence('probe', closeB.opened.nonce, probeDispatch, 'approved', ['findings_none: true'])).status === 0,
      '745-A: probe pass evidence records');
    const closeProbe = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'probe', '--json'], tmp4));
    assert(closeProbe && closeProbe.opened && closeProbe.opened.id === 'docs', '745-A: docs opens: ' + JSON.stringify(closeProbe));

    // docs genuinely REWRITES lib/first.js — a file the interior gate actually reviewed.
    fs.writeFileSync(path.join(tmp4, 'lib', 'first.js'), 'module.exports = 42;\n');
    fs.writeFileSync(path.join(tmp4, 'lib', 'other.js'), 'module.exports = 99;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'docs', '--stdin', '--json'], tmp4,
      writerEvidence('docs', closeProbe.opened.nonce, 'docs')).status === 0, '745-A: docs evidence records');
    const closeDocs = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'docs', '--json'], tmp4));
    assert(closeDocs && closeDocs.opened && closeDocs.opened.id === 'cert', '745-A: cert opens: ' + JSON.stringify(closeDocs));

    const certDispatch = closeDocs.opened.dispatch;
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'cert', '--stdin', '--json'], tmp4,
      gateEvidence('cert', closeDocs.opened.nonce, certDispatch, 'approved', ['findings_none: true'])).status === 0,
      '745-A: cert pass evidence records');
    const closeCert = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'cert', '--json'], tmp4));
    assert(closeCert && closeCert.closed === 'cert', '745-A: cert seals PASS: ' + JSON.stringify(closeCert));

    const journalPath = path.join(projectDir, '.cache', 'review-attempts.json');
    const honestJournal = fs.readFileSync(journalPath, 'utf8');
    const parsed = JSON.parse(honestJournal);
    const probeAttempt = parsed.attempts.find(a => a && a.logical_gate
      && Array.isArray(a.logical_gate.members) && a.logical_gate.members.includes('probe'));
    assert(probeAttempt && JSON.stringify(Object.keys(probeAttempt.producer_bindings || {}).sort())
      === JSON.stringify(['writerA', 'writerB']),
      '745-A setup: probe binds BOTH upstream writers: '
      + JSON.stringify(probeAttempt && Object.keys(probeAttempt.producer_bindings || {})));

    // Honest journal: probe's reviewed surface (lib/first.js) genuinely moved => stale, correctly.
    const honest = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp4);
    const honestOut = lastJson(honest);
    assert(honest.status !== 0 && honestOut && honestOut.ok === false
      && honestOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
      '745-A sanity: with an honest journal the modified reviewed surface refuses stale: '
      + honest.stdout + honest.stderr);

    // TAMPER: shrink producer_bindings so the derived surface no longer covers lib/first.js.
    delete probeAttempt.producer_bindings.writerA;
    fs.writeFileSync(journalPath, JSON.stringify(parsed, null, 2) + '\n');
    const tampered = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp4);
    const tamperedOut = lastJson(tampered);
    assert(tampered.status !== 0 && tamperedOut && tamperedOut.ok === false
      && tamperedOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
      '745-A fail-open A: a SHRUNK producer_bindings must not narrow the freshness surface — the '
      + 'validator recomputes the writer slice from the plan and falls back to whole-candidate: '
      + tampered.stdout + tampered.stderr);
  } finally { fs.rmSync(tmp4, { recursive: true, force: true }); }
}

if (failed) {
  console.error(`\ninterior-gate freshness test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`interior-gate freshness test passed (${passed} assertions).`);
