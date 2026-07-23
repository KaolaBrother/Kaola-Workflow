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
function node(script, args, cwd, input, envExtra) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd, encoding: 'utf8', input,
    env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', ...GIT_ISOLATION_ENV, ...(envExtra || {}) },
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
    'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
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
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
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
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
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

// ---- 5. #750: the SEAL-TIME BLOB MAP must be corroborated, not trusted ----
// `attempt.candidate_declared` is the map that decides whether the reviewed surface CHANGED, and it
// was read verbatim out of the same review journal whose freshness verdict it produces. Editing one
// entry to match the CURRENT bytes re-freshened a genuinely stale interior gate and turned a refusing
// --verdict-check into a passing one. The map must now be corroborated against the gate's own
// git-ref-anchored barrier baseline (an authority the journal writer does not own), falling back to
// the whole-candidate binding whenever it cannot be. Parameterised over BOTH arms that consume the
// map (adversarial-verifier and reviewer) x BOTH scenarios: `disjoint` is the NO-OVER-REFUSAL control
// (an untampered gate must still get its scoped freshness) and `surface-touched` is the pin.
for (const probeRole of ['adversarial-verifier', 'code-reviewer']) {
  for (const scenario of ['disjoint', 'surface-touched']) {
    const tag = '750[' + probeRole + '/' + scenario + ']';
    const isAv = probeRole === 'adversarial-verifier';
    const touchesSurface = scenario === 'surface-touched';
    const docsWriteSet = touchesSurface ? 'lib/impl.js, lib/other.js' : 'lib/other.js';
    const tmp5 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-seal-map-tamper-')));
    try {
      initGitRepo(tmp5);
      const project = 'issue-750';
      const projectDir = path.join(tmp5, 'kaola-workflow', project);
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(tmp5, 'lib'), { recursive: true });
      fs.writeFileSync(path.join(tmp5, 'lib', 'impl.js'), 'module.exports = 0;\n');
      fs.writeFileSync(path.join(tmp5, 'lib', 'other.js'), 'module.exports = 0;\n');
      const planPath = path.join(projectDir, 'workflow-plan.md');
      fs.writeFileSync(planPath, [
        '# Workflow Plan — seal-map corroboration', '',
        '## Meta',
        'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
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
        '| probe | ' + probeRole + ' | writer | — | 1 | sequence | probe-gate | impl-surface | sequence | '
          + (isAv ? 'writer' : '—') + ' |',
        '| docs | tdd-guide | probe | ' + docsWriteSet + ' | 1 | sequence | — | — | — | — |',
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

      const freeze = node(planValidatorScript, [planPath, '--freeze', '--json'], tmp5);
      assert(freeze.status === 0, tag + ' setup: plan freezes: ' + freeze.stdout + freeze.stderr);
      if (freeze.status !== 0) { throw new Error('freeze failed — cannot proceed'); }
      git(tmp5, ['add', '-A']);
      git(tmp5, ['commit', '-m', 'freeze']);

      const probeExtras = isAv
        ? ['claim_outcome: not_refuted', 'gate_mode: change_gate', 'findings_none: true']
        : ['findings_none: true'];
      const probeOutcome = isAv ? 'not_refuted' : 'approved';

      const openWriter = lastJson(node(adaptiveNodeScript, ['open-next', '--project', project, '--json'], tmp5));
      assert(openWriter && openWriter.opened && openWriter.opened.id === 'writer', tag + ': writer opens');
      fs.writeFileSync(path.join(tmp5, 'lib', 'impl.js'), 'module.exports = 1;\n');
      assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writer', '--stdin', '--json'], tmp5,
        writerEvidence('writer', openWriter.nonce, 'base')).status === 0, tag + ': writer evidence records');
      const closeWriter = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writer', '--json'], tmp5));
      assert(closeWriter && closeWriter.opened && closeWriter.opened.id === 'probe', tag + ': probe opens: ' + JSON.stringify(closeWriter));
      const probeDispatch = closeWriter.opened.dispatch;
      assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'probe', '--stdin', '--json'], tmp5,
        gateEvidence('probe', closeWriter.opened.nonce, probeDispatch, probeOutcome, probeExtras)).status === 0,
        tag + ': probe pass evidence records');
      const closeProbe = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'probe', '--json'], tmp5));
      assert(closeProbe && closeProbe.opened && closeProbe.opened.id === 'docs', tag + ': probe seals PASS: ' + JSON.stringify(closeProbe));

      // docs moves the whole candidate. In `surface-touched` it ALSO rewrites the file the interior
      // gate reviewed, so that gate is genuinely stale on its own surface.
      fs.writeFileSync(path.join(tmp5, 'lib', 'other.js'), 'module.exports = 99;\n');
      if (touchesSurface) fs.writeFileSync(path.join(tmp5, 'lib', 'impl.js'), 'module.exports = 42;\n');
      assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'docs', '--stdin', '--json'], tmp5,
        writerEvidence('docs', closeProbe.opened.nonce, 'downstream')).status === 0, tag + ': docs evidence records');
      const closeDocs = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'docs', '--json'], tmp5));
      assert(closeDocs && closeDocs.opened && closeDocs.opened.id === 'cert', tag + ': cert opens: ' + JSON.stringify(closeDocs));
      const certDispatch = closeDocs.opened.dispatch;
      assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'cert', '--stdin', '--json'], tmp5,
        gateEvidence('cert', closeDocs.opened.nonce, certDispatch, 'approved', ['findings_none: true'])).status === 0,
        tag + ': cert pass evidence records');
      const closeCert = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'cert', '--json'], tmp5));
      assert(closeCert && closeCert.closed === 'cert', tag + ': cert seals PASS: ' + JSON.stringify(closeCert));

      // The final certifier sealed the CURRENT candidate, so nothing else is stale: the whole verdict
      // now turns on the interior gate alone.
      const honest = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp5);
      const honestOut = lastJson(honest);
      if (!touchesSurface) {
        assert(honest.status === 0 && honestOut && honestOut.ok === true,
          tag + ' CONTROL (no over-refusal): an UNTAMPERED interior gate whose own surface is unchanged '
          + 'still gets its scoped freshness after a disjoint downstream write: ' + honest.stdout + honest.stderr);
      } else {
        assert(honest.status !== 0 && honestOut && honestOut.ok === false
          && honestOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
          tag + ' baseline: with an honest journal the rewritten reviewed surface refuses stale: '
          + honest.stdout + honest.stderr);
      }

      const journalPath = path.join(projectDir, '.cache', 'review-attempts.json');
      const honestJournalBytes = fs.readFileSync(journalPath, 'utf8');
      const parsed = JSON.parse(honestJournalBytes);
      const probeAttempt = parsed.attempts.find(a => a && a.logical_gate
        && Array.isArray(a.logical_gate.members) && a.logical_gate.members.includes('probe'));
      const currentEntry = runner.computeLandableBlobEntries(tmp5, { paths: ['lib/impl.js'] })['lib/impl.js'];
      assert(probeAttempt && probeAttempt.candidate_declared && currentEntry,
        tag + ' setup: the probe attempt records a candidate_declared entry for the reviewed surface');

      if (touchesSurface) {
        // THE PIN (#750): rewrite ONE candidate_declared entry so the seal map claims the CURRENT
        // bytes. Trusting the map verbatim re-freshens the stale gate and the whole --verdict-check
        // flips from refuse to PASS. Corroborating it against the gate's anchored barrier baseline
        // must keep the whole-candidate binding and keep refusing.
        assert(probeAttempt.candidate_declared['lib/impl.js'] !== currentEntry,
          tag + ' setup: the sealed entry and the current blob genuinely differ before tampering');
        probeAttempt.candidate_declared['lib/impl.js'] = currentEntry;
        fs.writeFileSync(journalPath, JSON.stringify(parsed, null, 2) + '\n');
        const tampered = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp5);
        const tamperedOut = lastJson(tampered);
        assert(tampered.status !== 0 && tamperedOut && tamperedOut.ok === false
          && tamperedOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
          tag + ' PIN: a TAMPERED candidate_declared entry must not re-freshen a stale interior gate — '
          + 'the seal map is corroborated against the gate\'s anchored barrier baseline and falls back '
          + 'to whole-candidate: ' + tampered.stdout + tampered.stderr);
      } else {
        // Same tamper primitive on the CONTROL fixture: rewriting the entry to a value that disagrees
        // with the anchored baseline must cost the gate its scoped freshness even though the tree is
        // otherwise honest — the corroboration is a real comparison, not a formality.
        probeAttempt.candidate_declared['lib/impl.js'] = '100644 ' + 'f'.repeat(40);
        fs.writeFileSync(journalPath, JSON.stringify(parsed, null, 2) + '\n');
        const forged = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp5);
        const forgedOut = lastJson(forged);
        assert(forged.status !== 0 && forgedOut && forgedOut.ok === false
          && forgedOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
          // NOTE: this arm already refused before the corroboration shipped (the bogus entry also
          // disagrees with the CURRENT tree), so it is a control, not the discriminating pin.
          tag + ' sanity: a seal-map entry that disagrees with the gate\'s anchored barrier baseline is '
          + 'not corroborated, so the interior gate falls back to whole-candidate and refuses: '
          + forged.stdout + forged.stderr);
        // Restore the honest journal: the scoped freshness must come back (proves the refusal above is
        // caused by the tamper, not by the corroboration retiring the scoped path).
        fs.writeFileSync(journalPath, honestJournalBytes);
        const restored = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp5);
        const restoredOut = lastJson(restored);
        assert(restored.status === 0 && restoredOut && restoredOut.ok === true,
          tag + ' CONTROL: restoring the honest journal restores the scoped freshness: '
          + restored.stdout + restored.stderr);
      }
    } finally { fs.rmSync(tmp5, { recursive: true, force: true }); }
  }
}

// ---- 6. #751: a GROUP certifier is not a live whole-candidate wall ----
// Under an ACTIVE epoch contract the whole-plan verdict sweep routes a code/security-reviewer FANOUT
// certifier to the schema-2 logical GROUP reducer, which reduces verdicts only and never compares the
// sealed candidate against the current tree (the single-node arm does). Counting such a certifier as
// a live whole-candidate wall let interior gates drop to scoped freshness behind a wall that checks
// nothing. Group arm => interior gate keeps its whole-candidate binding and refuses; single-node arm
// (the control) => interior gate keeps its scoped freshness.
for (const certKind of ['group', 'single']) {
  const tag = '751[' + certKind + ']';
  const groupCert = certKind === 'group';
  const tmp6 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-group-certifier-')));
  try {
    initGitRepo(tmp6);
    const project = 'issue-751';
    const projectDir = path.join(tmp6, 'kaola-workflow', project);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(tmp6, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp6, 'lib', 'impl.js'), 'module.exports = 0;\n');
    fs.writeFileSync(path.join(tmp6, 'lib', 'other.js'), 'module.exports = 0;\n');
    const planPath = path.join(projectDir, 'workflow-plan.md');
    const certIds = groupCert ? ['cert-1', 'cert-2'] : ['cert'];
    const certRows = groupCert
      ? certIds.map(id => '| ' + id + ' | code-reviewer | docs | — | 1 | fanout(cert) | review-change | code-tree | replicated_majority | — |')
      : ['| cert | code-reviewer | docs | — | 1 | sequence | review-change | code-tree | sequence | — |'];
    // An epoch CHILD plan (epoch_schema_version present) is the only shape that activates the epoch
    // contract, which is what routes a reviewer fanout to the group reducer. Placeholder digests
    // mirror the replan fixtures; the freeze wall checks format + graph, not provenance.
    fs.writeFileSync(planPath, [
      '# Workflow Plan — group certifier wall', '',
      '## Meta',
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
      'plan_schema_version: 2',
      'contract_version: 2',
      'epoch_schema_version: 2',
      'plan_epoch: 2',
      'epoch_lineage_id: ' + '1'.repeat(64),
      'parent_plan_hash: ' + '2'.repeat(64),
      'parent_snapshot_manifest_digest: pending',
      'claim_root_base_digest: ' + '3'.repeat(64),
      'inherited_frontier_digest: ' + '4'.repeat(64),
      'inherited_frontier_classes: code',
      'source_evidence_digest: ' + '5'.repeat(64),
      'transition_reason: review_repair_requires_replan',
      'planner_binding: dispatch-751',
      'labels: enhancement',
      'code_certifier: ' + (groupCert ? 'group(cert)' : 'cert'),
      'security_certifier: none',
      'validation_command: node --check lib/impl.js',
      'validation_timeout_minutes: 5', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
      '|---|---|---|---|---|---|---|---|---|---|',
      '| writer | tdd-guide | — | lib/impl.js | 1 | sequence | — | — | — | — |',
      '| probe | code-reviewer | writer | — | 1 | sequence | probe-review | impl-surface | sequence | — |',
      '| docs | tdd-guide | probe | lib/other.js | 1 | sequence | — | — | — | — |',
      ...certRows,
      '| finalize | finalize | ' + certIds.join(',') + ' | — | 1 | sequence | — | — | — | — |', '',
      '## Node Ledger', '',
      '| id | status |', '|---|---|',
      '| writer | pending |', '| probe | pending |', '| docs | pending |',
      ...certIds.map(id => '| ' + id + ' | pending |'),
      '| finalize | pending |', '',
      '## Required Agent Compliance', '',
      '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
      '| tdd-guide (writer) | pending | | |', '| code-reviewer (probe) | pending | | |',
      '| tdd-guide (docs) | pending | | |',
      ...certIds.map(id => '| code-reviewer (' + id + ') | pending | | |'),
      '| finalize (finalize) | pending | | |', '',
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), '# Workflow State\nstatus: active\n');

    const freeze = node(planValidatorScript, [planPath, '--freeze', '--json'], tmp6);
    assert(freeze.status === 0, tag + ' setup: epoch-child plan freezes: ' + freeze.stdout + freeze.stderr);
    if (freeze.status !== 0) { throw new Error('freeze failed — cannot proceed'); }
    git(tmp6, ['add', '-A']);
    git(tmp6, ['commit', '-m', 'freeze']);

    const openWriter = lastJson(node(adaptiveNodeScript, ['open-next', '--project', project, '--json'], tmp6));
    assert(openWriter && openWriter.opened && openWriter.opened.id === 'writer', tag + ': writer opens');
    fs.writeFileSync(path.join(tmp6, 'lib', 'impl.js'), 'module.exports = 1;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writer', '--stdin', '--json'], tmp6,
      writerEvidence('writer', openWriter.nonce, 'base')).status === 0, tag + ': writer evidence records');
    const closeWriter = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writer', '--json'], tmp6));
    assert(closeWriter && closeWriter.opened && closeWriter.opened.id === 'probe', tag + ': probe opens: ' + JSON.stringify(closeWriter));
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'probe', '--stdin', '--json'], tmp6,
      gateEvidence('probe', closeWriter.opened.nonce, closeWriter.opened.dispatch, 'approved', ['findings_none: true'])).status === 0,
      tag + ': probe pass evidence records');
    const closeProbe = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'probe', '--json'], tmp6));
    assert(closeProbe && closeProbe.opened && closeProbe.opened.id === 'docs', tag + ': docs opens: ' + JSON.stringify(closeProbe));

    // Disjoint downstream write moves the WHOLE candidate away from the interior gate's seal.
    fs.writeFileSync(path.join(tmp6, 'lib', 'other.js'), 'module.exports = 99;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'docs', '--stdin', '--json'], tmp6,
      writerEvidence('docs', closeProbe.opened.nonce, 'disjoint')).status === 0, tag + ': docs evidence records');
    const closeDocs = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'docs', '--json'], tmp6));
    assert(closeDocs && closeDocs.result === 'ok', tag + ': docs closes: ' + JSON.stringify(closeDocs));

    if (groupCert) {
      // A code-reviewer FANOUT under schema-2 is owned by the schema-1 provisional-fanout machinery,
      // which cannot share one journal with the schema-2 attempt the sequence gate already wrote — so
      // the group seal is planted exactly as the verdict sweep reads it (per-member evidence + ledger
      // rows), which is also exactly what the sweep would find on disk after a resume.
      for (const id of certIds) {
        fs.writeFileSync(path.join(projectDir, '.cache', id + '.md'),
          'evidence-binding: ' + id + ' 000000000000\nverdict: pass\nfindings_blocking: 0\n');
      }
      let plan = fs.readFileSync(planPath, 'utf8');
      for (const id of certIds) {
        plan = plan.replace(new RegExp('^\\|\\s*' + id + '\\s*\\|\\s*pending\\s*\\|', 'm'), '| ' + id + ' | complete |');
      }
      fs.writeFileSync(planPath, plan);
    } else {
      const certDispatch = closeDocs.opened.dispatch;
      assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'cert', '--stdin', '--json'], tmp6,
        gateEvidence('cert', closeDocs.opened.nonce, certDispatch, 'approved', ['findings_none: true'])).status === 0,
        tag + ': cert pass evidence records');
      const closeCert = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'cert', '--json'], tmp6));
      assert(closeCert && closeCert.closed === 'cert', tag + ': cert seals PASS: ' + JSON.stringify(closeCert));
    }

    const verdict = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp6);
    const verdictOut = lastJson(verdict);
    if (groupCert) {
      assert(verdict.status !== 0 && verdictOut && verdictOut.ok === false
        && verdictOut.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
        tag + ' PIN: a GROUP certifier reduces verdicts without any candidate-staleness check, so it is '
        + 'NOT a live whole-candidate wall — the interior gate must keep its whole-candidate binding and '
        + 'refuse stale: ' + verdict.stdout + verdict.stderr);
    } else {
      assert(verdict.status === 0 && verdictOut && verdictOut.ok === true,
        tag + ' control: a SINGLE-NODE certifier does compare the sealed candidate, so it remains a live '
        + 'whole-candidate wall and the interior gate keeps its scoped freshness: '
        + verdict.stdout + verdict.stderr);
    }
  } finally { fs.rmSync(tmp6, { recursive: true, force: true }); }
}

// ---- 7. #745 fail-closed fallback MATRIX for the newly-eligible reviewer roles ----
// Widening `interiorSurfaceFresh` from adversarial-verifier to code-reviewer / security-reviewer
// must NOT widen what counts as fresh. Every input the scoped path depends on is perturbed ONE AT A
// TIME on an otherwise-honest fixture; each perturbation must degrade to the whole-candidate binding
// (probe refuses stale), and the immediately following restore must bring the scoped freshness back —
// so each refusal is provably caused by that perturbation and not by the scoped path being dead.
// Exercised for BOTH newly-admitted roles; the adversarial-verifier arm consumes the same journal +
// corroboration inputs (blocks 2 and 5 cover it end to end).
//
// Two guards in interiorSurfaceFresh are deliberately NOT pinned here, verified by mutation:
//   * the mixed-receipt-candidate guard (`receipts.some(r => r.candidate_digest !== seal)`) is vacuous
//     for a one-member gate and unreachable for the newly-eligible roles at any width — a code/security
//     reviewer FANOUT is routed to the schema-1 provisional-fanout machinery, which materializes no
//     schema-2 review context for its members, so such a group never reaches this comparison at all.
//     Its only live shape is an adversarial-verifier fanout, whose eligibility this widening did not
//     change.
//   * `if (!attempts) return false` is an equivalent mutant of the `if (!attempt) return false` below
//     it (an empty/absent attempt list finds no attempt either). The missing/malformed-journal arms
//     below still pin the OBSERVABLE fail-closed behavior, which is what the contract owes.
for (const probeRole of ['code-reviewer', 'security-reviewer']) {
  const tag = '745-F[' + probeRole + ']';
  const tmp7 = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-interior-fallbacks-')));
  try {
    initGitRepo(tmp7);
    const project = 'issue-745-fallbacks';
    const projectDir = path.join(tmp7, 'kaola-workflow', project);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(path.join(tmp7, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp7, 'lib', 'impl.js'), 'module.exports = 0;\n');
    fs.writeFileSync(path.join(tmp7, 'lib', 'other.js'), 'module.exports = 0;\n');
    const planPath = path.join(projectDir, 'workflow-plan.md');
    fs.writeFileSync(planPath, [
      '# Workflow Plan — interior reviewer fail-closed matrix', '',
      '## Meta',
      'plan_form: spine', // #765: all-concrete spine — legacy dag grammar retired at freeze
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

    const freeze = node(planValidatorScript, [planPath, '--freeze', '--json'], tmp7);
    assert(freeze.status === 0, tag + ' setup: plan freezes: ' + freeze.stdout + freeze.stderr);
    if (freeze.status !== 0) { throw new Error('freeze failed — cannot proceed'); }
    git(tmp7, ['add', '-A']);
    git(tmp7, ['commit', '-m', 'freeze']);

    const openWriter = lastJson(node(adaptiveNodeScript, ['open-next', '--project', project, '--json'], tmp7));
    assert(openWriter && openWriter.opened && openWriter.opened.id === 'writer', tag + ' setup: writer opens');
    fs.writeFileSync(path.join(tmp7, 'lib', 'impl.js'), 'module.exports = 1;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'writer', '--stdin', '--json'], tmp7,
      writerEvidence('writer', openWriter.nonce, 'base')).status === 0, tag + ' setup: writer evidence records');
    const closeWriter = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'writer', '--json'], tmp7));
    assert(closeWriter && closeWriter.opened && closeWriter.opened.id === 'probe',
      tag + ' setup: probe opens: ' + JSON.stringify(closeWriter));
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'probe', '--stdin', '--json'], tmp7,
      gateEvidence('probe', closeWriter.opened.nonce, closeWriter.opened.dispatch, 'approved', ['findings_none: true'])).status === 0,
      tag + ' setup: probe pass evidence records');
    const closeProbe = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'probe', '--json'], tmp7));
    assert(closeProbe && closeProbe.opened && closeProbe.opened.id === 'docs',
      tag + ' setup: docs opens: ' + JSON.stringify(closeProbe));

    // Disjoint downstream write: moves the WHOLE candidate, leaves the reviewed surface untouched.
    fs.writeFileSync(path.join(tmp7, 'lib', 'other.js'), 'module.exports = 99;\n');
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'docs', '--stdin', '--json'], tmp7,
      writerEvidence('docs', closeProbe.opened.nonce, 'disjoint')).status === 0, tag + ' setup: docs evidence records');
    const closeDocs = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'docs', '--json'], tmp7));
    assert(closeDocs && closeDocs.opened && closeDocs.opened.id === 'cert',
      tag + ' setup: cert opens: ' + JSON.stringify(closeDocs));
    assert(node(adaptiveNodeScript, ['record-evidence', '--project', project, '--node-id', 'cert', '--stdin', '--json'], tmp7,
      gateEvidence('cert', closeDocs.opened.nonce, closeDocs.opened.dispatch, 'approved', ['findings_none: true'])).status === 0,
      tag + ' setup: cert pass evidence records');
    const closeCert = lastJson(node(adaptiveNodeScript, ['close-and-open-next', '--project', project, '--node-id', 'cert', '--json'], tmp7));
    assert(closeCert && closeCert.closed === 'cert', tag + ' setup: cert seals PASS: ' + JSON.stringify(closeCert));

    const verdict = env => {
      const r = node(planValidatorScript, [planPath, '--verdict-check', '--json'], tmp7, undefined, env);
      return { r, out: lastJson(r) };
    };
    const refusedNode = (v, id) => v.r.status !== 0 && v.out && v.out.ok === false
      && Array.isArray(v.out.failures)
      && v.out.failures.some(f => f && f.nodeId === id && /stale/.test(String(f.reason || '')));
    const isFresh = v => v.r.status === 0 && v.out && v.out.ok === true;

    const cacheDir = path.join(projectDir, '.cache');
    const journalPath = path.join(cacheDir, 'review-attempts.json');
    const basePath = path.join(cacheDir, 'barrier-base-probe');
    const barrierRef = 'refs/kaola-workflow/barrier/' + project + '/probe';
    const honestJournal = fs.readFileSync(journalPath, 'utf8');
    const honestBase = fs.readFileSync(basePath, 'utf8');
    const honestRefSha = String(git(tmp7, ['rev-parse', '--verify', barrierRef + '^{commit}']).stdout || '').trim();
    assert(/^[0-9a-f]{40,64}$/.test(honestRefSha),
      tag + ' setup: the probe gate has an anchored barrier baseline ref: ' + honestRefSha);

    // CONTROL: the honest fixture gets the scoped freshness. Every perturbation below must take it away.
    assert(isFresh(verdict()),
      tag + ' CONTROL: the honest interior reviewer gate is fresh on its own surface: '
      + verdict().r.stdout + verdict().r.stderr);

    // SECOND FRONTIER, in-process. repair-state does NOT go through the CLI — it calls
    // verifyVerdictBlock directly with its own readCache/globCache plus root/planPath. The
    // widening binds there too, but every arm in this block drives the CLI, so that shape was
    // unexercised. Assert the honest chain is fresh through repair-state's exact call, and that
    // dropping root/planPath collapses it to stale — which is what makes the threading
    // load-bearing rather than decorative.
    {
      const planValidator = require('./kaola-workflow-plan-validator');
      const planText = fs.readFileSync(planPath, 'utf8');
      const readCacheIP = fileName => {
        try { return fs.readFileSync(path.join(cacheDir, fileName), 'utf8'); } catch (_) { return null; }
      };
      const globCacheIP = prefix => {
        try { return fs.readdirSync(cacheDir).filter(f => f.startsWith(prefix) && f.endsWith('.md')); } catch (_) { return []; }
      };
      const threaded = planValidator.verifyVerdictBlock(planText,
        { readCache: readCacheIP, globCache: globCacheIP, root: tmp7, planPath });
      assert(threaded && threaded.ok === true,
        tag + ' SECOND FRONTIER: repair-state\'s in-process call shape sees the interior gate as fresh, got '
        + JSON.stringify(threaded && threaded.failures));

      const unthreaded = planValidator.verifyVerdictBlock(planText,
        { readCache: readCacheIP, globCache: globCacheIP });
      assert(unthreaded && unthreaded.ok === false && Array.isArray(unthreaded.failures)
        && unthreaded.failures.some(f => f && f.nodeId === 'probe' && /stale/.test(String(f.reason || ''))),
        tag + ' SECOND FRONTIER: without root/planPath the same call reports the gate stale, so the '
        + 'threading is load-bearing, got ' + JSON.stringify(unthreaded && unthreaded.failures));
    }

    const withJournal = mutate => {
      const parsed = JSON.parse(honestJournal);
      const probeAttempt = parsed.attempts.find(a => a && a.logical_gate
        && Array.isArray(a.logical_gate.members) && a.logical_gate.members.includes('probe'));
      const next = mutate(parsed, probeAttempt);
      fs.writeFileSync(journalPath, JSON.stringify(next === undefined ? parsed : next, null, 2) + '\n');
    };
    // Each entry: [label, apply, why]. Restore-and-recheck runs after every one.
    const perturbations = [
      ['missing journal', () => fs.rmSync(journalPath),
        'with no review journal there is no seal attempt to scope freshness against'],
      ['malformed journal', () => fs.writeFileSync(journalPath, '{ not json'),
        'an unparsable journal yields no attempts'],
      ['journal without an attempts array', () => fs.writeFileSync(journalPath, JSON.stringify({ attempts: 'nope' })),
        'a journal whose attempts field is not an array yields no attempts'],
      // KNOWN RESIDUAL, pinned as intended behavior: after a cross-epoch journal rotation the seal
      // attempt is absent, so the child epoch falls back to whole-candidate and the false-block can
      // reappear there. Tighten-only, and deliberately NOT rescued by this widening.
      ['seal attempt absent (cross-epoch rotation shape)',
        () => withJournal(parsed => ({ attempts: parsed.attempts.filter(a => !(a && a.logical_gate
          && Array.isArray(a.logical_gate.members) && a.logical_gate.members.includes('probe'))) })),
        'no attempt carries the gate\'s sealed candidate'],
      ['attempt without candidate_declared',
        () => withJournal((parsed, attempt) => { delete attempt.candidate_declared; }),
        'without a seal-time blob map there is nothing to compare the current surface against'],
      ['attempt candidate_digest does not match the sealed receipt',
        () => withJournal((parsed, attempt) => { attempt.candidate_digest = 'a'.repeat(64); }),
        'the attempt no longer describes the candidate the gate actually sealed'],
      ['attempt gate membership does not contain the gate',
        () => withJournal((parsed, attempt) => { attempt.logical_gate.members = ['someone-else']; }),
        'the recorded logical gate is not this gate'],
      ['anchored barrier ref deleted (git lookup fails)',
        () => { const d = git(tmp7, ['update-ref', '-d', barrierRef]); assert(d.status === 0, tag + ': barrier ref deletes'); },
        'the corroboration authority for the seal map cannot be resolved'],
      ['filed barrier baseline disagrees with the anchored ref',
        () => fs.writeFileSync(basePath, 'b'.repeat(40) + '\n'),
        'the baseline cross-check the corroboration depends on fails'],
      ['filed barrier baseline missing', () => fs.rmSync(basePath),
        'no filed baseline means no corroboration'],
    ];
    for (const [label, apply, why] of perturbations) {
      apply();
      assert(refusedNode(verdict(), 'probe'),
        tag + ' FAIL-CLOSED [' + label + ']: ' + why + ' — the interior reviewer gate must fall back to '
        + 'the whole-candidate binding and refuse stale');
      fs.writeFileSync(journalPath, honestJournal);
      fs.writeFileSync(basePath, honestBase);
      git(tmp7, ['update-ref', barrierRef, honestRefSha]);
      assert(isFresh(verdict()),
        tag + ' RESTORE [' + label + ']: restoring the perturbed input restores the scoped freshness — '
        + 'the refusal above is caused by the perturbation, not by a dead scoped path');
    }

    // git itself unavailable: the whole-candidate digest cannot be computed either, so the gate refuses
    // without ever reaching the scoped path. Coarser than the arms above (it does not isolate one call)
    // but it pins the end-to-end property: no git => no pass.
    // OUTSIDE the fixture repo: anything written under tmp7 joins the landable tree and would move
    // the whole candidate by itself, staling the final certifier and confounding the arm.
    const stubDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gitless-')));
    fs.writeFileSync(path.join(stubDir, 'git'), '#!/bin/sh\nexit 127\n', { mode: 0o755 });
    const gitless = verdict({ PATH: stubDir });
    fs.rmSync(stubDir, { recursive: true, force: true });
    assert(gitless.r.status !== 0 && (!gitless.out || gitless.out.ok !== true),
      tag + ' FAIL-CLOSED [git unavailable]: with git failing, no gate can be proved fresh: '
      + gitless.r.stdout + gitless.r.stderr);
    assert(isFresh(verdict()),
      tag + ' RESTORE [git unavailable]: with git back, the scoped freshness returns');

    // FINAL-CERTIFIER MEMBERSHIP: the widening must never scope the plan's own final certifier to its
    // own surface. An unreviewed new file moves the whole candidate but touches NO producer write set,
    // so a certifier allowed to scope itself would finalize it clean.
    fs.writeFileSync(path.join(tmp7, 'lib', 'rogue.js'), 'module.exports = "unreviewed";\n');
    assert(refusedNode(verdict(), 'cert'),
      tag + ' FAIL-CLOSED [final-certifier membership]: the designated final certifier keeps its '
      + 'whole-candidate binding, so an unreviewed new file still refuses stale');
    fs.rmSync(path.join(tmp7, 'lib', 'rogue.js'));
    assert(isFresh(verdict()),
      tag + ' RESTORE [final-certifier membership]: removing the unreviewed file restores the pass');
  } finally { fs.rmSync(tmp7, { recursive: true, force: true }); }
}

if (failed) {
  console.error(`\ninterior-gate freshness test FAILED: ${failed} failure(s), ${passed} passed.`);
  process.exit(1);
}
console.log(`interior-gate freshness test passed (${passed} assertions).`);
