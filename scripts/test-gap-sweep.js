#!/usr/bin/env node
'use strict';

// Standalone tests for kaola-workflow-gap-sweep.js (#435 — run-gap capture gate).
// Tests scanner dedup, gate refuse, gate pass (filed + noise), vacuous pass on
// empty sweep. Uses synthetic fixtures in os.tmpdir() — never touches the real repo.
// Hand-rolled assert pattern — no test framework dependency.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

let passed = 0, failed = 0;
function assert(c, m) {
  if (c) { passed++; }
  else { failed++; console.error('FAIL: ' + m); }
}

const GAP_SWEEP = path.join(__dirname, 'kaola-workflow-gap-sweep.js');

// ---------------------------------------------------------------------------
// Helper: create a fake kaola-workflow/<project>/.cache/ tree under a tmpdir.
// Returns { root, cacheDir, project } where root is the synthetic repo root and
// the script can be pointed at it via KAOLA_GAP_ROOT=root.
// ---------------------------------------------------------------------------
function makeFixture(project) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-sweep-'));
  const cacheDir = path.join(root, 'kaola-workflow', project, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  return { root, cacheDir, project };
}

// Run gap-sweep as a subprocess with KAOLA_GAP_ROOT pointing at a synthetic root.
function run(root, extraArgs) {
  const r = spawnSync(process.execPath, [GAP_SWEEP, ...extraArgs], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    env: Object.assign({}, process.env, { KAOLA_GAP_ROOT: root }),
  });
  let stdout = r.stdout || '';
  let jsonOut = null;
  // Try to parse the last JSON line from stdout.
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { jsonOut = JSON.parse(lines[i]); break; } catch (_) {}
  }
  return { exitCode: r.status, stdout, stderr: r.stderr || '', jsonOut };
}

// DELETED: writeProvenance(). It seeded a provenance-log.jsonl of open/close events keyed on
// `nodeId`, the sole input to the `in_run_repair` reason class ("a node opened more than once").
// There are no nodes and no node-open events, so the class has no producer. Two reason classes
// remain and both are node-free: `deferred_red_chain` (a chain-receipt entry with
// accepted_red:true) and `manual:<slug>` (an operator line in run-gaps-manual.md). Every scenario
// below that merely NEEDED some swept class to react to now uses one of those two.

// Write a chain-receipt.json with the given chains array (partial — only name/accepted_red/accepted_red_issue needed).
function writeChainReceipt(cacheDir, chains) {
  const receipt = {
    headSha: 'abc1234',
    workTreeHash: 'clean',
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    chains,
  };
  fs.writeFileSync(path.join(cacheDir, 'chain-receipt.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
}

// Write finalization-summary.md with an optional ## Run gaps section.
function writeSummary(cacheDir, projectDir, gapLines) {
  const summaryPath = path.join(projectDir, 'finalization-summary.md');
  let content = '# Finalization Summary\n\n## Chain Receipt\n\nAll chains green.\n\n';
  if (gapLines !== null) {
    content += '## Run gaps\n\n' + gapLines.join('\n') + '\n';
  }
  fs.writeFileSync(summaryPath, content, 'utf8');
}

// ---------------------------------------------------------------------------
// T1: SCAN dedup — a chain receipt carrying the SAME waived chain twice plus a manual seed
//     => exactly 2 sweptClasses (deferred_red_chain, manual:<slug>), the duplicate collapsed to
//     one entry whose count SUMS the occurrences, and the artifact written to disk.
//
// Dedup is keyed on (reasonClass, sample), which is class-agnostic — it never knew what produced
// the item. It used to be proven through a node opened twice; the two surviving producers prove
// exactly the same rule, and the receipt one proves it over a class that can genuinely repeat
// (the same chain waived under the same issue on a re-run).
// ---------------------------------------------------------------------------
const fix1 = makeFixture('proj-t1');
try {
  writeChainReceipt(fix1.cacheDir, [
    { name: 'claude',  exitCode: 0, accepted_red: false, accepted_red_issue: null },
    { name: 'codex',   exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
    // The SAME (name, issue) pair a second time — one swept entry, count 2.
    { name: 'codex',   exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
  ]);
  fs.writeFileSync(
    path.join(fix1.cacheDir, 'run-gaps-manual.md'),
    'gap: coresim-busy — one transient Busy event\n',
    'utf8'
  );

  const r1 = run(fix1.root, ['--project', 'proj-t1', '--json']);

  assert(r1.exitCode === 0, 'T1: scanner exits 0');
  assert(r1.jsonOut !== null, 'T1: JSON output parseable');
  if (r1.jsonOut) {
    assert(r1.jsonOut.result === 'swept', 'T1: result = swept');
    assert(r1.jsonOut.project === 'proj-t1', 'T1: project field matches');
    assert(Array.isArray(r1.jsonOut.sweptClasses), 'T1: sweptClasses is array');
    assert(r1.jsonOut.sweptClasses.length === 2, 'T1: exactly 2 swept classes (deferred_red_chain + manual:coresim-busy), got ' + JSON.stringify(r1.jsonOut.sweptClasses));
    const drc = r1.jsonOut.sweptClasses.find(c => c.reasonClass === 'deferred_red_chain');
    assert(drc !== undefined, 'T1: deferred_red_chain class present');
    if (drc) {
      assert(drc.sample === 'codex:99', 'T1: deferred_red_chain sample = codex:99, got ' + drc.sample);
      assert(drc.count === 2, 'T1: dedup SUMS the counts of the collapsed duplicates, got ' + drc.count);
    }
    const mc = r1.jsonOut.sweptClasses.find(c => c.reasonClass === 'manual:coresim-busy');
    assert(mc !== undefined, 'T1: manual:coresim-busy class present');
    // Dedup: the duplicated chain yields exactly ONE entry, not two.
    const drcAll = r1.jsonOut.sweptClasses.filter(c => c.reasonClass === 'deferred_red_chain');
    assert(drcAll.length === 1, 'T1: dedup: only one deferred_red_chain entry for a repeated (name, issue) pair, got ' + drcAll.length);
    // artifact written
    assert(typeof r1.jsonOut.artifact === 'string' && r1.jsonOut.artifact.length > 0, 'T1: artifact path returned');
    const artifactExists = fs.existsSync(r1.jsonOut.artifact);
    assert(artifactExists, 'T1: artifact file exists at returned path');
    if (artifactExists) {
      const saved = JSON.parse(fs.readFileSync(r1.jsonOut.artifact, 'utf8'));
      assert(Array.isArray(saved.sweptClasses), 'T1: artifact has sweptClasses array');
    }
  }
} finally {
  try { fs.rmSync(fix1.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T2: GATE refuse — swept class present but NO ## Run gaps section
//     => result:refuse, reason:gaps_unswept, unmapped lists the class, exit 1.
// ---------------------------------------------------------------------------
const fix2 = makeFixture('proj-t2');
try {
  writeChainReceipt(fix2.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
    { name: 'codex',  exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
  ]);
  // Run scanner first to produce run-gaps.json
  run(fix2.root, ['--project', 'proj-t2', '--json']);
  // Write summary WITHOUT ## Run gaps section
  const projDir = path.join(fix2.root, 'kaola-workflow', 'proj-t2');
  writeSummary(fix2.cacheDir, projDir, null);

  const r2 = run(fix2.root, [
    '--project', 'proj-t2',
    '--check',
    '--json',
    '--summary', path.join(projDir, 'finalization-summary.md'),
  ]);

  assert(r2.exitCode !== 0, 'T2: gate exits non-zero on missing ## Run gaps section');
  assert(r2.jsonOut !== null, 'T2: JSON output parseable on refuse');
  if (r2.jsonOut) {
    assert(r2.jsonOut.result === 'refuse', 'T2: result = refuse');
    assert(r2.jsonOut.reason === 'gaps_unswept', 'T2: reason = gaps_unswept');
    assert(Array.isArray(r2.jsonOut.unmapped) && r2.jsonOut.unmapped.length > 0, 'T2: unmapped array non-empty');
    const u = r2.jsonOut.unmapped[0];
    assert(u.reasonClass === 'deferred_red_chain', 'T2: unmapped[0].reasonClass = deferred_red_chain, got ' + u.reasonClass);
  }
} finally {
  try { fs.rmSync(fix2.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T3: GATE pass after map — add ## Run gaps section mapping class to filed: #123
//     (offline) => result:pass exit 0.
// ---------------------------------------------------------------------------
const fix3 = makeFixture('proj-t3');
try {
  writeChainReceipt(fix3.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
    { name: 'codex',  exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
  ]);
  // Run scanner to produce run-gaps.json
  run(fix3.root, ['--project', 'proj-t3', '--json']);
  // Write summary WITH ## Run gaps section — filed mapping
  const projDir = path.join(fix3.root, 'kaola-workflow', 'proj-t3');
  writeSummary(fix3.cacheDir, projDir, [
    '- deferred_red_chain (codex:99): filed: #123',
  ]);

  const r3 = run(fix3.root, [
    '--project', 'proj-t3',
    '--check',
    '--json',
    '--summary', path.join(projDir, 'finalization-summary.md'),
    // Force offline to skip the live issue probe
    '--offline',
  ]);

  assert(r3.exitCode === 0, 'T3: gate exits 0 when all classes mapped with filed:#N (offline)');
  assert(r3.jsonOut !== null, 'T3: JSON output parseable on pass');
  if (r3.jsonOut) {
    assert(r3.jsonOut.result === 'pass', 'T3: result = pass');
    assert(typeof r3.jsonOut.mapped === 'number' && r3.jsonOut.mapped >= 1, 'T3: mapped count >= 1');
    assert(typeof r3.jsonOut.filed === 'number' && r3.jsonOut.filed >= 1, 'T3: filed count >= 1');
  }
} finally {
  try { fs.rmSync(fix3.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T4: noise: mapping also passes.
// ---------------------------------------------------------------------------
const fix4 = makeFixture('proj-t4');
try {
  writeChainReceipt(fix4.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
    { name: 'codex',  exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
  ]);
  run(fix4.root, ['--project', 'proj-t4', '--json']);
  const projDir = path.join(fix4.root, 'kaola-workflow', 'proj-t4');
  writeSummary(fix4.cacheDir, projDir, [
    '- deferred_red_chain (codex:99): noise: expected flap in test run',
  ]);

  const r4 = run(fix4.root, [
    '--project', 'proj-t4',
    '--check',
    '--json',
    '--summary', path.join(projDir, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r4.exitCode === 0, 'T4: gate exits 0 with noise: mapping');
  if (r4.jsonOut) {
    assert(r4.jsonOut.result === 'pass', 'T4: result = pass with noise mapping');
    assert(r4.jsonOut.noise >= 1, 'T4: noise count >= 1');
  }
} finally {
  try { fs.rmSync(fix4.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T5: empty sweep => pass vacuously without a section.
// ---------------------------------------------------------------------------
const fix5 = makeFixture('proj-t5');
try {
  // chain receipt with no accepted_red
  writeChainReceipt(fix5.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  run(fix5.root, ['--project', 'proj-t5', '--json']);
  // NO summary file (section absent entirely), but sweep is empty so gate must pass
  const projDir = path.join(fix5.root, 'kaola-workflow', 'proj-t5');
  // Write summary with NO ## Run gaps section
  writeSummary(fix5.cacheDir, projDir, null);

  const r5 = run(fix5.root, [
    '--project', 'proj-t5',
    '--check',
    '--json',
    '--summary', path.join(projDir, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r5.exitCode === 0, 'T5: empty sweep => vacuous pass (exit 0) even without ## Run gaps section');
  if (r5.jsonOut) {
    assert(r5.jsonOut.result === 'pass', 'T5: result = pass on empty sweep');
    assert(r5.jsonOut.mapped === 0, 'T5: mapped = 0 on empty sweep');
  }
} finally {
  try { fs.rmSync(fix5.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T6: missing --project flag => exit 1 with a helpful error.
// ---------------------------------------------------------------------------
const fix6 = makeFixture('proj-t6');
try {
  const r6 = run(fix6.root, ['--json']);
  assert(r6.exitCode !== 0, 'T6: exit non-zero when --project is missing');
  assert((r6.stderr || '').length > 0, 'T6: stderr message when --project missing');
} finally {
  try { fs.rmSync(fix6.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T7: unknown argument => exit 1.
// ---------------------------------------------------------------------------
const fix7 = makeFixture('proj-t7');
try {
  const r7 = run(fix7.root, ['--project', 'proj-t7', '--unknown-flag-xyz']);
  assert(r7.exitCode !== 0, 'T7: exit non-zero on unknown argument');
} finally {
  try { fs.rmSync(fix7.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T8: manual seed via run-gaps-manual.md => manual:<slug> class in sweptClasses.
// ---------------------------------------------------------------------------
const fix8 = makeFixture('proj-t8');
try {
  writeChainReceipt(fix8.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  // Write optional manual seed
  fs.writeFileSync(
    path.join(fix8.cacheDir, 'run-gaps-manual.md'),
    'gap: test-coverage — missing branch coverage for error path\n',
    'utf8'
  );

  const r8 = run(fix8.root, ['--project', 'proj-t8', '--json']);

  assert(r8.exitCode === 0, 'T8: scanner exits 0 with manual seed');
  if (r8.jsonOut) {
    assert(r8.jsonOut.sweptClasses.length >= 1, 'T8: at least 1 swept class from manual seed');
    const mc = r8.jsonOut.sweptClasses.find(c => c.reasonClass.startsWith('manual:'));
    assert(mc !== undefined, 'T8: manual:<slug> class present');
  }
} finally {
  try { fs.rmSync(fix8.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T9 (#653 finding D1): reverse containment — an observed ## Run gaps entry that was NEVER
// seeded through the scanner (sweptClasses is empty) must refuse observed_gap_unseeded, not
// pass vacuously. Before the fix, gate mode returned early on empty sweptClasses and never even
// read the summary — this is the exact vacuous-pass hole D1 closes.
// ---------------------------------------------------------------------------
const fix9 = makeFixture('proj-t9');
try {
  // Clean chain receipt, no manual seed: sweptClasses will be empty.
  writeChainReceipt(fix9.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  run(fix9.root, ['--project', 'proj-t9', '--json']); // produces sweptClasses: []
  const projDir9 = path.join(fix9.root, 'kaola-workflow', 'proj-t9');
  writeSummary(fix9.cacheDir, projDir9, [
    '- manual:coresim-busy (one transient Busy event): noise: environment',
  ]);

  const r9 = run(fix9.root, [
    '--project', 'proj-t9',
    '--check',
    '--json',
    '--summary', path.join(projDir9, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r9.exitCode !== 0, 'T9: gate exits non-zero on an observed-but-unseeded gap even with empty sweep');
  assert(r9.jsonOut !== null, 'T9: JSON output parseable on refuse');
  if (r9.jsonOut) {
    assert(r9.jsonOut.result === 'refuse', 'T9: result = refuse');
    assert(r9.jsonOut.reason === 'observed_gap_unseeded', 'T9: reason = observed_gap_unseeded, got ' + r9.jsonOut.reason);
    assert(Array.isArray(r9.jsonOut.unseeded) && r9.jsonOut.unseeded.length === 1, 'T9: unseeded array has exactly 1 entry');
    if (r9.jsonOut.unseeded && r9.jsonOut.unseeded[0]) {
      assert(r9.jsonOut.unseeded[0].reasonClass === 'manual:coresim-busy', 'T9: unseeded[0].reasonClass = manual:coresim-busy');
      assert(r9.jsonOut.unseeded[0].sample === 'one transient Busy event', 'T9: unseeded[0].sample = one transient Busy event');
    }
    assert(typeof r9.jsonOut.detail === 'string' && r9.jsonOut.detail.indexOf('run-gaps-manual.md') !== -1, 'T9: detail names run-gaps-manual.md');
  }
} finally {
  try { fs.rmSync(fix9.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T10 (#653 finding D1): the same gap, once seeded through run-gaps-manual.md, is emitted by the
// scanner as manual:coresim-busy — the reverse-containment check must then pass, and the existing
// forward mapping (noise:) still applies. result:pass, mapped:1, noise:1.
// ---------------------------------------------------------------------------
const fix10 = makeFixture('proj-t10');
try {
  writeChainReceipt(fix10.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix10.cacheDir, 'run-gaps-manual.md'),
    'gap: coresim-busy — one transient Busy event\n',
    'utf8'
  );
  run(fix10.root, ['--project', 'proj-t10', '--json']); // sweptClasses now includes manual:coresim-busy
  const projDir10 = path.join(fix10.root, 'kaola-workflow', 'proj-t10');
  writeSummary(fix10.cacheDir, projDir10, [
    '- manual:coresim-busy (one transient Busy event): noise: environment',
  ]);

  const r10 = run(fix10.root, [
    '--project', 'proj-t10',
    '--check',
    '--json',
    '--summary', path.join(projDir10, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r10.exitCode === 0, 'T10: gate exits 0 once the observed gap is seeded through run-gaps-manual.md');
  assert(r10.jsonOut !== null, 'T10: JSON output parseable on pass');
  if (r10.jsonOut) {
    assert(r10.jsonOut.result === 'pass', 'T10: result = pass');
    assert(r10.jsonOut.mapped === 1, 'T10: mapped = 1, got ' + r10.jsonOut.mapped);
    assert(r10.jsonOut.noise === 1, 'T10: noise = 1, got ' + r10.jsonOut.noise);
  }
} finally {
  try { fs.rmSync(fix10.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T11 (#653 finding D1): forward direction still refuses gaps_unswept. Reverse containment
// (every ## Run gaps entry is seeded) is satisfied here, but a SECOND swept class (a waived red
// chain) has no matching ## Run gaps entry — the pre-existing forward check must still catch it,
// proving the new reverse check does not weaken or replace the forward one.
// ---------------------------------------------------------------------------
const fix11 = makeFixture('proj-t11');
try {
  // A waived chain -> deferred_red_chain swept class, left unmapped in the summary below.
  writeChainReceipt(fix11.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
    { name: 'codex',  exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
  ]);
  fs.writeFileSync(
    path.join(fix11.cacheDir, 'run-gaps-manual.md'),
    'gap: coresim-busy — one transient Busy event\n',
    'utf8'
  );
  run(fix11.root, ['--project', 'proj-t11', '--json']); // sweptClasses: deferred_red_chain + manual:coresim-busy
  const projDir11 = path.join(fix11.root, 'kaola-workflow', 'proj-t11');
  // Only the manual gap is mapped in the summary — deferred_red_chain is left unmapped.
  writeSummary(fix11.cacheDir, projDir11, [
    '- manual:coresim-busy (one transient Busy event): noise: environment',
  ]);

  const r11 = run(fix11.root, [
    '--project', 'proj-t11',
    '--check',
    '--json',
    '--summary', path.join(projDir11, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r11.exitCode !== 0, 'T11: gate still exits non-zero on a swept-but-unmapped class (forward direction unchanged)');
  if (r11.jsonOut) {
    assert(r11.jsonOut.result === 'refuse', 'T11: result = refuse');
    assert(r11.jsonOut.reason === 'gaps_unswept', 'T11: reason = gaps_unswept (not observed_gap_unseeded), got ' + r11.jsonOut.reason);
    assert(Array.isArray(r11.jsonOut.unmapped) && r11.jsonOut.unmapped.some(u => u.reasonClass === 'deferred_red_chain'), 'T11: unmapped includes deferred_red_chain, got ' + JSON.stringify(r11.jsonOut.unmapped));
  }
} finally {
  try { fs.rmSync(fix11.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T12 (#675): a scan invoked AFTER the project has been archived (no active kaola-workflow/<project>/
// dir, only kaola-workflow/archive/<project>/) must refuse project_archived — it must NOT recreate a
// stray active .cache/ tree, and it must NOT overwrite the archived run-gaps.json.
// ---------------------------------------------------------------------------
const fix12 = makeFixture('proj-t12-unused'); // borrow tmpdir mgmt; we build the archive layout manually
try {
  // Discard the active fixture the helper made — this test needs NO active dir at all.
  fs.rmSync(path.join(fix12.root, 'kaola-workflow', 'proj-t12-unused'), { recursive: true, force: true });

  const project12 = 'proj-t12';
  const archiveCacheDir = path.join(fix12.root, 'kaola-workflow', 'archive', project12, '.cache');
  fs.mkdirSync(archiveCacheDir, { recursive: true });
  const archivedArtifact = {
    project: project12,
    sweptClasses: [{ reasonClass: 'deferred_red_chain', sample: 'codex:99', count: 1 }],
  };
  const archivedRunGapsPath = path.join(archiveCacheDir, 'run-gaps.json');
  fs.writeFileSync(archivedRunGapsPath, JSON.stringify(archivedArtifact, null, 2) + '\n', 'utf8');

  // (12.1) default output path (no --output) — must refuse and must NOT recreate the active dir.
  const r12a = run(fix12.root, ['--project', project12, '--json']);
  assert(r12a.exitCode !== 0, 'T12.1: scanner exits non-zero when the project is archived');
  assert(r12a.jsonOut !== null, 'T12.1: JSON output parseable on refuse');
  if (r12a.jsonOut) {
    assert(r12a.jsonOut.result === 'refuse', 'T12.1: result = refuse, got ' + r12a.jsonOut.result);
    assert(r12a.jsonOut.reason === 'project_archived', 'T12.1: reason = project_archived, got ' + r12a.jsonOut.reason);
  }
  const activeDir12 = path.join(fix12.root, 'kaola-workflow', project12);
  assert(!fs.existsSync(activeDir12), 'T12.1: a stray active kaola-workflow/' + project12 + '/ dir must NOT be recreated');

  // (12.2) explicit --output pointing directly at the archived run-gaps.json — must refuse and must
  // NOT clobber the archived artifact's sweptClasses.
  const r12b = run(fix12.root, [
    '--project', project12, '--json',
    '--output', path.join('kaola-workflow', 'archive', project12, '.cache', 'run-gaps.json'),
  ]);
  assert(r12b.exitCode !== 0, 'T12.2: scanner exits non-zero with an explicit --output at the archive');
  if (r12b.jsonOut) {
    assert(r12b.jsonOut.result === 'refuse', 'T12.2: result = refuse, got ' + r12b.jsonOut.result);
    assert(r12b.jsonOut.reason === 'project_archived', 'T12.2: reason = project_archived, got ' + r12b.jsonOut.reason);
  }
  const preserved = JSON.parse(fs.readFileSync(archivedRunGapsPath, 'utf8'));
  assert(Array.isArray(preserved.sweptClasses) && preserved.sweptClasses.length === 1,
    'T12.2: the archived run-gaps.json must be untouched (still 1 swept class), got: ' + JSON.stringify(preserved.sweptClasses));
  assert(preserved.sweptClasses[0] && preserved.sweptClasses[0].reasonClass === 'deferred_red_chain' && preserved.sweptClasses[0].sample === 'codex:99',
    'T12.2: the archived run-gaps.json content must be byte-preserved, got: ' + JSON.stringify(preserved.sweptClasses));
} finally {
  try { fs.rmSync(fix12.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T13 (#675): a project that was NEVER claimed (no active dir, no archive dir) is unaffected by the
// project_archived refusal — the original vacuous-empty-scan behavior is preserved for a genuinely
// new project name (out of scope for #675: only the archived case must refuse).
// ---------------------------------------------------------------------------
const fix13Root = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-sweep-'));
try {
  const r13 = run(fix13Root, ['--project', 'proj-t13-never-claimed', '--json']);
  assert(r13.exitCode === 0, 'T13: a never-claimed project (no active, no archive) still scans vacuously, got exit ' + r13.exitCode);
  if (r13.jsonOut) {
    assert(r13.jsonOut.result === 'swept', 'T13: result = swept for a never-claimed project');
    assert(Array.isArray(r13.jsonOut.sweptClasses) && r13.jsonOut.sweptClasses.length === 0, 'T13: sweptClasses empty');
  }
} finally {
  try { fs.rmSync(fix13Root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T14 (#679): a LIVE project dir AND a same-named leftover archive BOTH exist (the #675 refusal
// above only fires when the active dir is GONE — !existsSync(projectDir) && existsSync(archiveDir)
// is false here since projectDir exists). An explicit --output aimed at the archive's run-gaps.json
// must still refuse — never silently clobber a prior cycle's durable archived gap evidence — and the
// archived artifact must come out byte-for-byte unchanged.
// ---------------------------------------------------------------------------
const fix14 = makeFixture('proj-t14');
try {
  // Live project has its own distinct defect signal (differs from the archived content below, so a
  // clobber would be detectable even by content, not just by refusal).
  writeChainReceipt(fix14.cacheDir, [
    { name: 'claude', exitCode: 1, accepted_red: true, accepted_red_issue: 'live-77' },
  ]);

  const archiveCacheDir14 = path.join(fix14.root, 'kaola-workflow', 'archive', 'proj-t14', '.cache');
  fs.mkdirSync(archiveCacheDir14, { recursive: true });
  const archivedRunGapsPath14 = path.join(archiveCacheDir14, 'run-gaps.json');
  const archivedArtifact14 = {
    project: 'proj-t14',
    sweptClasses: [{ reasonClass: 'deferred_red_chain', sample: 'archived-gitea:404', count: 5 }],
  };
  const archivedRaw14 = JSON.stringify(archivedArtifact14, null, 2) + '\n';
  fs.writeFileSync(archivedRunGapsPath14, archivedRaw14, 'utf8');

  const r14 = run(fix14.root, [
    '--project', 'proj-t14', '--json',
    '--output', path.join('kaola-workflow', 'archive', 'proj-t14', '.cache', 'run-gaps.json'),
  ]);

  assert(r14.exitCode !== 0, 'T14: scanner exits non-zero when --output targets a foreign/archived run-gaps.json while the live project dir exists');
  assert(r14.jsonOut !== null, 'T14: JSON output parseable on refuse');
  if (r14.jsonOut) {
    assert(r14.jsonOut.result === 'refuse', 'T14: result = refuse, got ' + r14.jsonOut.result);
    assert(typeof r14.jsonOut.reason === 'string' && r14.jsonOut.reason.length > 0, 'T14: reason is a non-empty typed string, got ' + r14.jsonOut.reason);
    assert(r14.jsonOut.reason !== 'project_archived', 'T14: reason must NOT be project_archived (the live project dir exists — this is the residual #679 edge, distinct from #675)');
  }
  const afterRaw14 = fs.readFileSync(archivedRunGapsPath14, 'utf8');
  assert(afterRaw14 === archivedRaw14, 'T14: the archived run-gaps.json must be byte-for-byte unchanged after the refused scan');
} finally {
  try { fs.rmSync(fix14.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T15 (#679): a normal explicit --output pointed at the SCANNED project's own .cache/run-gaps.json
// (no foreign/archived path involved) must still write as before — the #679 guard must not
// over-refuse a legitimate in-project --output.
// ---------------------------------------------------------------------------
const fix15 = makeFixture('proj-t15');
try {
  writeChainReceipt(fix15.cacheDir, [
    { name: 'codex', exitCode: 1, accepted_red: true, accepted_red_issue: '99' },
  ]);

  const ownOutputPath15 = path.join('kaola-workflow', 'proj-t15', '.cache', 'run-gaps.json');
  const r15 = run(fix15.root, [
    '--project', 'proj-t15', '--json',
    '--output', ownOutputPath15,
  ]);

  assert(r15.exitCode === 0, 'T15: scanner exits 0 with an explicit --output at the project\'s own .cache/run-gaps.json, got ' + r15.exitCode);
  assert(r15.jsonOut !== null, 'T15: JSON output parseable');
  if (r15.jsonOut) {
    assert(r15.jsonOut.result === 'swept', 'T15: result = swept, got ' + r15.jsonOut.result);
    assert(Array.isArray(r15.jsonOut.sweptClasses) && r15.jsonOut.sweptClasses.length === 1, 'T15: exactly 1 swept class written');
  }
  const writtenPath15 = path.join(fix15.root, ownOutputPath15);
  assert(fs.existsSync(writtenPath15), 'T15: artifact written at the project\'s own explicit --output path');
} finally {
  try { fs.rmSync(fix15.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T16 (#681): an explicit --output aimed at a run-gaps.json OUTSIDE the scanned project's own
// .cache/ that does NOT yet exist there must STILL refuse foreign_run_gaps_output — the #679
// guard's "&& fs.existsSync(outputPath)" precondition let a scan silently write a stray FRESH
// run-gaps.json into a foreign/archive tree as long as nothing was there yet. Nothing must be
// written at that path at all.
// ---------------------------------------------------------------------------
const fix16 = makeFixture('proj-t16');
try {
  writeChainReceipt(fix16.cacheDir, [
    { name: 'codex', exitCode: 1, accepted_red: true, accepted_red_issue: '99' },
  ]);

  // Foreign archive dir for a DIFFERENT project exists, but no run-gaps.json lives there yet.
  const foreignArchiveCacheDir16 = path.join(fix16.root, 'kaola-workflow', 'archive', 'proj-t16-other', '.cache');
  fs.mkdirSync(foreignArchiveCacheDir16, { recursive: true });
  const foreignOutputPath16 = path.join(foreignArchiveCacheDir16, 'run-gaps.json');
  assert(!fs.existsSync(foreignOutputPath16), 'T16: precondition — foreign run-gaps.json does not exist yet');

  const r16 = run(fix16.root, [
    '--project', 'proj-t16', '--json',
    '--output', path.join('kaola-workflow', 'archive', 'proj-t16-other', '.cache', 'run-gaps.json'),
  ]);

  assert(r16.exitCode !== 0, 'T16: scanner exits non-zero when --output targets a NON-EXISTENT foreign run-gaps.json');
  assert(r16.jsonOut !== null, 'T16: JSON output parseable on refuse');
  if (r16.jsonOut) {
    assert(r16.jsonOut.result === 'refuse', 'T16: result = refuse, got ' + r16.jsonOut.result);
    assert(r16.jsonOut.reason === 'foreign_run_gaps_output', 'T16: reason = foreign_run_gaps_output, got ' + r16.jsonOut.reason);
  }
  assert(!fs.existsSync(foreignOutputPath16), 'T16: nothing must be written at the foreign path — pre-fix this silently writes a stray file');
} finally {
  try { fs.rmSync(fix16.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T17 (#726): a sample that itself contains ")" — e.g. an API symbol like retryAfter(from:) —
// must map. The original negated-class sample group ([^)]+) could never match such a sample, so a
// correctly-seeded, correctly-written mapping row silently failed to parse and the gate refused
// gaps_unswept for a gap the operator HAD mapped. RED pre-fix (exit 1, gaps_unswept).
// ---------------------------------------------------------------------------
const fix17 = makeFixture('proj-t17');
try {
  writeChainReceipt(fix17.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix17.cacheDir, 'run-gaps-manual.md'),
    'gap: rev — retryAfter(from:)\n',
    'utf8'
  );
  run(fix17.root, ['--project', 'proj-t17', '--json']); // sweeps manual:rev / sample "retryAfter(from:)"
  const projDir17 = path.join(fix17.root, 'kaola-workflow', 'proj-t17');
  writeSummary(fix17.cacheDir, projDir17, [
    '- manual:rev (retryAfter(from:)): filed: #726',
  ]);

  const r17 = run(fix17.root, [
    '--project', 'proj-t17',
    '--check',
    '--json',
    '--summary', path.join(projDir17, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r17.exitCode === 0, 'T17: gate exits 0 for a paren-bearing sample, got ' + r17.exitCode + ' / ' + r17.stdout.trim());
  if (r17.jsonOut) {
    assert(r17.jsonOut.result === 'pass', 'T17: result = pass, got ' + r17.jsonOut.result);
    assert(r17.jsonOut.mapped === 1, 'T17: mapped = 1, got ' + r17.jsonOut.mapped);
    assert(r17.jsonOut.filed === 1, 'T17: filed = 1, got ' + r17.jsonOut.filed);
  }
} finally {
  try { fs.rmSync(fix17.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T18 (#726): the LAZY-vs-GREEDY boundary pin. "noise: <justification>" is unconstrained free
// text, so a justification may legally contain "): filed: #N". A GREEDY sample group backtracks to
// the LAST "): " in the line and mis-carves the sample (swallowing "): noise: ...") AND flips the
// entry's kind to filed — turning a passing gate into observed_gap_unseeded quoting a sample the
// operator never wrote. RED under greedy (.+), GREEN under lazy (.+?). The mapped/noise/filed
// counts are what discriminate the two: greedy yields refuse, lazy yields noise:1 filed:0.
// ---------------------------------------------------------------------------
const fix18 = makeFixture('proj-t18');
try {
  writeChainReceipt(fix18.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix18.cacheDir, 'run-gaps-manual.md'),
    'gap: rev — plain sample\n',
    'utf8'
  );
  run(fix18.root, ['--project', 'proj-t18', '--json']); // sweeps manual:rev / sample "plain sample"
  const projDir18 = path.join(fix18.root, 'kaola-workflow', 'proj-t18');
  writeSummary(fix18.cacheDir, projDir18, [
    '- manual:rev (plain sample): noise: superseded by the earlier sweep (see run 3): filed: #700',
  ]);

  const r18 = run(fix18.root, [
    '--project', 'proj-t18',
    '--check',
    '--json',
    '--summary', path.join(projDir18, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r18.exitCode === 0, 'T18: gate exits 0 when noise free text contains "): filed: #N", got ' + r18.exitCode + ' / ' + r18.stdout.trim());
  if (r18.jsonOut) {
    assert(r18.jsonOut.result === 'pass', 'T18: result = pass (greedy would refuse observed_gap_unseeded), got ' + r18.jsonOut.result);
    assert(r18.jsonOut.mapped === 1, 'T18: mapped = 1, got ' + r18.jsonOut.mapped);
    assert(r18.jsonOut.noise === 1, 'T18: the entry is classified noise, got noise=' + r18.jsonOut.noise);
    assert(r18.jsonOut.filed === 0, 'T18: the trailing "filed: #700" inside the justification must NOT become the entry kind, got filed=' + r18.jsonOut.filed);
  }
} finally {
  try { fs.rmSync(fix18.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T19 (#726): the reverse-containment TIGHTENING the sample-group fix delivers. Pre-fix, a
// hand-typed paren-bearing ## Run gaps row escaped the reverse-containment check entirely: the row
// never parsed, so gapEntries came back EMPTY and — with an empty sweep — the both-sides-empty
// vacuous pass fired (exit 0). An unseeded observed gap therefore passed finalization silently
// whenever its sample happened to contain ")". Post-fix the row parses and is correctly refused
// observed_gap_unseeded. RED pre-fix (vacuous exit 0).
// ---------------------------------------------------------------------------
const fix19 = makeFixture('proj-t19');
try {
  // Clean signals: sweptClasses will be empty, and nothing is seeded via run-gaps-manual.md.
  writeChainReceipt(fix19.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  run(fix19.root, ['--project', 'proj-t19', '--json']); // sweptClasses: []
  const projDir19 = path.join(fix19.root, 'kaola-workflow', 'proj-t19');
  writeSummary(fix19.cacheDir, projDir19, [
    '- manual:never-seeded (retryAfter(from:)): filed: #726',
  ]);

  const r19 = run(fix19.root, [
    '--project', 'proj-t19',
    '--check',
    '--json',
    '--summary', path.join(projDir19, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r19.exitCode !== 0, 'T19: a hand-typed paren-bearing row must no longer slip through the vacuous both-sides-empty pass, got exit ' + r19.exitCode + ' / ' + r19.stdout.trim());
  if (r19.jsonOut) {
    assert(r19.jsonOut.result === 'refuse', 'T19: result = refuse, got ' + r19.jsonOut.result);
    assert(r19.jsonOut.reason === 'observed_gap_unseeded', 'T19: reason = observed_gap_unseeded, got ' + r19.jsonOut.reason);
    assert(Array.isArray(r19.jsonOut.unseeded) && r19.jsonOut.unseeded.length === 1, 'T19: unseeded has exactly 1 entry');
    if (r19.jsonOut.unseeded && r19.jsonOut.unseeded[0]) {
      assert(r19.jsonOut.unseeded[0].reasonClass === 'manual:never-seeded', 'T19: unseeded[0].reasonClass = manual:never-seeded, got ' + r19.jsonOut.unseeded[0].reasonClass);
      assert(r19.jsonOut.unseeded[0].sample === 'retryAfter(from:)', 'T19: unseeded[0].sample is the verbatim paren-bearing sample, got ' + r19.jsonOut.unseeded[0].sample);
    }
  }
} finally {
  try { fs.rmSync(fix19.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T20 (#726): the diagnostic on the previously-silent `continue`. A line that LOOKS like a mapping
// attempt (parenthesised sample + a filed:/noise: tail marker) but fails the strict grammar must
// name itself on stderr instead of vanishing and resurfacing later as an unrelated-looking
// refusal. The back-compat contract is pinned in the same breath: free-text bullets ("- none" and
// prose notes) are ignored BY DESIGN and must produce NO warning, and the diagnostic must not
// change the parse result, the exit code, or the single --json line on stdout.
// ---------------------------------------------------------------------------
const fix20 = makeFixture('proj-t20');
try {
  writeChainReceipt(fix20.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  run(fix20.root, ['--project', 'proj-t20', '--json']); // sweptClasses: []
  const projDir20 = path.join(fix20.root, 'kaola-workflow', 'proj-t20');
  writeSummary(fix20.cacheDir, projDir20, [
    '- none',
    '- No deferred_red_chain (the receipt carries no waiver), nothing seeded by hand (no manual gaps).',
    '- **R5 / #635** (FILED) — the load-flake; filed as #635 with a roadmap stub.',
    '- manual:typo (some sample): filed: 726',   // malformed: missing "#" — the mapping attempt
  ]);

  const r20 = run(fix20.root, [
    '--project', 'proj-t20',
    '--check',
    '--json',
    '--summary', path.join(projDir20, 'finalization-summary.md'),
    '--offline',
  ]);

  // Outcome is unchanged by the diagnostic: nothing parsed, nothing swept => vacuous pass.
  assert(r20.exitCode === 0, 'T20: the diagnostic must not change the exit code, got ' + r20.exitCode);
  assert(r20.jsonOut !== null && r20.jsonOut.result === 'pass', 'T20: result still pass (diagnostic is advisory only)');
  const warnLines = (r20.stderr || '').split('\n').filter(x => x.indexOf('malformed ## Run gaps mapping line') !== -1);
  assert(warnLines.length === 1, 'T20: exactly ONE diagnostic line, got ' + warnLines.length + ': ' + JSON.stringify(r20.stderr));
  assert(warnLines.length === 1 && warnLines[0].indexOf('- manual:typo (some sample): filed: 726') !== -1,
    'T20: the diagnostic quotes the offending line verbatim, got ' + JSON.stringify(warnLines[0]));
  assert((r20.stderr || '').indexOf('- none') === -1, 'T20: "- none" must NOT warn (free-text bullets are ignored by design)');
  assert((r20.stderr || '').indexOf('deferred_red_chain (the receipt carries no waiver)') === -1, 'T20: a prose bullet with parentheses must NOT warn');
  assert((r20.stderr || '').indexOf('R5 / #635') === -1, 'T20: a prose bullet naming a filed issue must NOT warn');
  assert((r20.stdout || '').indexOf('malformed') === -1, 'T20: the diagnostic must never contaminate stdout (--json consumers parse it)');
} finally {
  try { fs.rmSync(fix20.root, { recursive: true, force: true }); } catch (_) {}
}

// ===========================================================================
// #836 — match a summary sample to its seeded gap by MEANING, not by bytes.
//
// The `## Run gaps` sample used to be compared with strict `===` against the seeded
// run-gaps-manual.md text in BOTH directions (reverse containment → observed_gap_unseeded,
// forward match → gaps_unswept). A finalization summary that ABBREVIATED or PARAPHRASED the
// seeded prose — the normal thing to write in a summary — refused twice in a row even though the
// gap was correctly seeded, correctly observed, and correctly mapped.
//
// The rule these scenarios pin: within a reasonClass that still matches EXACTLY, a summary sample
// matches a seeded sample when either is a prefix/substring of the other (after trimming).
// Nothing else loosens: a different reasonClass never matches, a sample with no containment
// relation still refuses observed_gap_unseeded, and a seeded gap with no mapping row at all still
// refuses gaps_unswept.
// ===========================================================================

// ---------------------------------------------------------------------------
// T21 (#836): THE REPRODUCTION — the summary sample is a PREFIX of the seeded gap text, and the
// seeded text carries nested parentheses. Pre-#836 this refused observed_gap_unseeded (the reverse
// containment check runs first), and after seeding it would have refused gaps_unswept as well.
// ---------------------------------------------------------------------------
const fix21 = makeFixture('proj-t21');
try {
  writeChainReceipt(fix21.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix21.cacheDir, 'run-gaps-manual.md'),
    'gap: consent receipt ordering — the consent receipt is written before the halt row clears '
      + '(replan.js:1474), so a resume re-reads a stale halt\n',
    'utf8'
  );
  run(fix21.root, ['--project', 'proj-t21', '--json']);
  const projDir21 = path.join(fix21.root, 'kaola-workflow', 'proj-t21');
  // Abbreviated in the summary — the same gap, fewer words, no "(replan.js:1474)" tail.
  writeSummary(fix21.cacheDir, projDir21, [
    '- manual:consent-receipt-ordering (the consent receipt is written before the halt row clears): filed: #826',
  ]);

  const r21 = run(fix21.root, [
    '--project', 'proj-t21',
    '--check',
    '--json',
    '--summary', path.join(projDir21, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r21.exitCode === 0,
    'T21 (#836): an ABBREVIATED summary sample of a correctly seeded gap must pass — the information '
    + 'is present and correct, only the serialization differed, got exit ' + r21.exitCode + ' / ' + r21.stdout.trim());
  if (r21.jsonOut) {
    assert(r21.jsonOut.result === 'pass', 'T21: result = pass, got ' + r21.jsonOut.result);
    assert(r21.jsonOut.mapped === 1, 'T21: mapped = 1, got ' + r21.jsonOut.mapped);
    assert(r21.jsonOut.filed === 1, 'T21: filed = 1, got ' + r21.jsonOut.filed);
  }
} finally {
  try { fs.rmSync(fix21.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T22 (#836): containment in the OTHER direction — the summary sample ELABORATES on a shorter
// seeded text. Matching is symmetric: whichever side is the substring, the pair matches.
// A parenthesised API symbol in the sample (the shape the lazy row regex exists to carve out)
// still resolves.
// ---------------------------------------------------------------------------
const fix22 = makeFixture('proj-t22');
try {
  writeChainReceipt(fix22.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix22.cacheDir, 'run-gaps-manual.md'),
    'gap: flaky load — the load test flaked\n'
      + 'gap: retry backoff — retryAfter(from:) ignores the (nested) Retry-After header\n',
    'utf8'
  );
  run(fix22.root, ['--project', 'proj-t22', '--json']);
  const projDir22 = path.join(fix22.root, 'kaola-workflow', 'proj-t22');
  writeSummary(fix22.cacheDir, projDir22, [
    // Superset of the seeded text.
    '- manual:flaky-load (the load test flaked once under concurrency): noise: environment',
    // Prefix of the seeded text, and the prefix itself carries nested parentheses.
    '- manual:retry-backoff (retryAfter(from:)): filed: #900',
  ]);

  const r22 = run(fix22.root, [
    '--project', 'proj-t22',
    '--check',
    '--json',
    '--summary', path.join(projDir22, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r22.exitCode === 0,
    'T22 (#836): containment is symmetric — an elaborated sample and a paren-bearing prefix both '
    + 'match their seeded gaps, got exit ' + r22.exitCode + ' / ' + r22.stdout.trim() + ' / ' + r22.stderr.trim());
  if (r22.jsonOut) {
    assert(r22.jsonOut.result === 'pass', 'T22: result = pass, got ' + r22.jsonOut.result);
    assert(r22.jsonOut.mapped === 2, 'T22: mapped = 2, got ' + r22.jsonOut.mapped);
    assert(r22.jsonOut.filed === 1, 'T22: filed = 1, got ' + r22.jsonOut.filed);
    assert(r22.jsonOut.noise === 1, 'T22: noise = 1, got ' + r22.jsonOut.noise);
  }
} finally {
  try { fs.rmSync(fix22.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T23 (#836): FAIL-CLOSED. Containment loosens the SAMPLE comparison and nothing else:
//   (a) a summary sample with no containment relation to any seeded sample of the same class still
//       refuses observed_gap_unseeded;
//   (b) the reasonClass comparison stays EXACT — a sample that would match by containment under a
//       DIFFERENT class does not rescue the row.
// ---------------------------------------------------------------------------
const fix23 = makeFixture('proj-t23');
try {
  writeChainReceipt(fix23.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix23.cacheDir, 'run-gaps-manual.md'),
    'gap: coresim-busy — one transient Busy event during the third chain\n',
    'utf8'
  );
  run(fix23.root, ['--project', 'proj-t23', '--json']);
  const projDir23 = path.join(fix23.root, 'kaola-workflow', 'proj-t23');
  writeSummary(fix23.cacheDir, projDir23, [
    // Right class, sample shares no containment relation with the seeded text.
    '- manual:coresim-busy (the sink refused twice on a stale receipt): filed: #999',
  ]);

  const r23 = run(fix23.root, [
    '--project', 'proj-t23',
    '--check',
    '--json',
    '--summary', path.join(projDir23, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r23.exitCode !== 0,
    'T23a (#836): an unrelated sample under a seeded class must still refuse — containment is a '
    + 'match rule, not a waiver, got exit ' + r23.exitCode + ' / ' + r23.stdout.trim());
  if (r23.jsonOut) {
    assert(r23.jsonOut.result === 'refuse', 'T23a: result = refuse, got ' + r23.jsonOut.result);
    assert(r23.jsonOut.reason === 'observed_gap_unseeded',
      'T23a: reason = observed_gap_unseeded, got ' + r23.jsonOut.reason);
  }
} finally {
  try { fs.rmSync(fix23.root, { recursive: true, force: true }); } catch (_) {}
}

const fix23b = makeFixture('proj-t23b');
try {
  writeChainReceipt(fix23b.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix23b.cacheDir, 'run-gaps-manual.md'),
    'gap: coresim-busy — one transient Busy event during the third chain\n',
    'utf8'
  );
  run(fix23b.root, ['--project', 'proj-t23b', '--json']);
  const projDir23b = path.join(fix23b.root, 'kaola-workflow', 'proj-t23b');
  writeSummary(fix23b.cacheDir, projDir23b, [
    // Sample WOULD match by containment, but the class is wrong.
    '- manual:some-other-class (one transient Busy event): noise: environment',
  ]);

  const r23b = run(fix23b.root, [
    '--project', 'proj-t23b',
    '--check',
    '--json',
    '--summary', path.join(projDir23b, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r23b.exitCode !== 0,
    'T23b (#836): the reasonClass comparison stays EXACT — a containing sample under a different '
    + 'class does not seed it, got exit ' + r23b.exitCode + ' / ' + r23b.stdout.trim());
  if (r23b.jsonOut) {
    assert(r23b.jsonOut.result === 'refuse', 'T23b: result = refuse, got ' + r23b.jsonOut.result);
    assert(r23b.jsonOut.reason === 'observed_gap_unseeded',
      'T23b: reason = observed_gap_unseeded, got ' + r23b.jsonOut.reason);
  }
} finally {
  try { fs.rmSync(fix23b.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T24 (#836): FAIL-CLOSED, forward direction. A swept gap that is not mapped AT ALL still refuses
// gaps_unswept — containment must not let an unrelated mapping row cover a second, unmentioned gap.
// ---------------------------------------------------------------------------
const fix24 = makeFixture('proj-t24');
try {
  writeChainReceipt(fix24.cacheDir, [
    { name: 'claude', exitCode: 0, accepted_red: false, accepted_red_issue: null },
  ]);
  fs.writeFileSync(
    path.join(fix24.cacheDir, 'run-gaps-manual.md'),
    'gap: coresim-busy — one transient Busy event during the third chain\n'
      + 'gap: sink retry — the sink retried after a stale receipt\n',
    'utf8'
  );
  run(fix24.root, ['--project', 'proj-t24', '--json']);
  const projDir24 = path.join(fix24.root, 'kaola-workflow', 'proj-t24');
  writeSummary(fix24.cacheDir, projDir24, [
    // Only the first gap is mapped; manual:sink-retry is never mentioned.
    '- manual:coresim-busy (one transient Busy event): noise: environment',
  ]);

  const r24 = run(fix24.root, [
    '--project', 'proj-t24',
    '--check',
    '--json',
    '--summary', path.join(projDir24, 'finalization-summary.md'),
    '--offline',
  ]);

  assert(r24.exitCode !== 0,
    'T24 (#836): an entirely unmapped swept gap must still refuse gaps_unswept, got exit '
    + r24.exitCode + ' / ' + r24.stdout.trim());
  if (r24.jsonOut) {
    assert(r24.jsonOut.result === 'refuse', 'T24: result = refuse, got ' + r24.jsonOut.result);
    assert(r24.jsonOut.reason === 'gaps_unswept', 'T24: reason = gaps_unswept, got ' + r24.jsonOut.reason);
    assert(Array.isArray(r24.jsonOut.unmapped) && r24.jsonOut.unmapped.length === 1,
      'T24: exactly one unmapped gap, got ' + JSON.stringify(r24.jsonOut.unmapped));
    if (r24.jsonOut.unmapped && r24.jsonOut.unmapped[0]) {
      assert(r24.jsonOut.unmapped[0].reasonClass === 'manual:sink-retry',
        'T24: the unmapped gap is manual:sink-retry, got ' + r24.jsonOut.unmapped[0].reasonClass);
    }
  }
} finally {
  try { fs.rmSync(fix24.root, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// Final result
// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('gap-sweep tests FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('gap-sweep tests passed (' + passed + ' assertions)');
}
