#!/usr/bin/env node
'use strict';

// Standalone tests for kaola-workflow-gap-sweep.js (#435 — run-gap capture gate).
// Tests scanner dedup, gate refuse, gate pass (filed + noise), vacuous pass on
// empty sweep. Uses synthetic fixtures in os.tmpdir() — never touches the real repo.
// Hand-rolled assert pattern — no test framework dependency.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

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
// T25 (#971): the run folder is resolved against the tree it LIVES in, not against cwd.
//
// Every scenario above hands the script a KAOLA_GAP_ROOT, so none of them can see where the
// script would have looked on its own. On a worktree run nobody does: the operator stands in the
// linked worktree while `kaola-workflow/<project>/` is resident in the MAIN checkout, uncommitted
// (the claim creates it there and Step 7 runs before any mirror). Resolving against cwd then reads
// a tree that has no run folder at all.
//
// The visible symptom is a missing artifact, and that half is nearly harmless. The half that costs
// evidence is what happens next: the operator reads "run scanner first", runs the scanner from the
// worktree, and the scan reads the worktree's EMPTY .cache — sweeping zero classes, writing a
// stray untracked run folder into the worktree, and leaving the gate to take its vacuous-pass
// branch and exit 0. A real gap sits unswept in main's cache while the gate certifies nothing.
// So the assertions below are on the FALSE GREEN, not on the missing-artifact message.
//
// The fixture is a real linked worktree, because the defect lives in the tree topology and a
// synthetic root cannot express it. Both modes must resolve identically — a scanner and a gate
// that disagree about the folder is exactly how the false green is produced.
// ---------------------------------------------------------------------------

function git(cwd, args) {
  // spawn-class: environment
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// Run gap-sweep from an arbitrary cwd, WITHOUT KAOLA_GAP_ROOT unless the caller supplies one —
// the only runner in this file that lets the script resolve the root itself.
function runIn(cwd, extraArgs, env) {
  const childEnv = Object.assign({}, process.env, env || {});
  delete childEnv.KAOLA_GAP_ROOT;
  if (env && env.KAOLA_GAP_ROOT) childEnv.KAOLA_GAP_ROOT = env.KAOLA_GAP_ROOT;
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath, [GAP_SWEEP, ...extraArgs], {
    cwd, encoding: 'utf8', timeout: 20000, env: childEnv,
  });
  let jsonOut = null;
  const lines = (r.stdout || '').trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    try { jsonOut = JSON.parse(lines[i]); break; } catch (_) {}
  }
  return { exitCode: r.status, stdout: r.stdout || '', stderr: r.stderr || '', jsonOut };
}

// macOS resolves os.tmpdir() through a symlink, so a cwd-derived path and a constructed one
// differ by a /private prefix. Compare canonicalized.
function realish(p) {
  try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); }
}

// A main checkout with a linked worktree, and the run folder created in MAIN only, AFTER the
// worktree exists and left uncommitted — the real run-time topology.
function makeWorktreeFixture(project, gapLine) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-wt-'));
  const main = path.join(tmp, 'main');
  fs.mkdirSync(main, { recursive: true });
  git(main, ['init', '-b', 'main']);
  git(main, ['config', 'user.email', 't@t.com']);
  git(main, ['config', 'user.name', 'T']);
  fs.writeFileSync(path.join(main, 'README.md'), 'repo\n');
  git(main, ['add', '-A']);
  git(main, ['commit', '-m', 'init']);
  git(main, ['branch', 'workflow/' + project]);
  const wt = path.join(tmp, 'wt');
  git(main, ['worktree', 'add', wt, 'workflow/' + project]);
  const cacheDir = path.join(main, 'kaola-workflow', project, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  if (gapLine) fs.writeFileSync(path.join(cacheDir, 'run-gaps-manual.md'), gapLine + '\n', 'utf8');
  return { tmp, main, wt, cacheDir, project };
}

const GAP_LINE = 'gap: flaky-suite — the sink suite went red once';
const GAP_CLASS = 'manual:flaky-suite';

// --- T25a: the reference behaviour, from MAIN. This is what every other scenario must match. ---
const fx25a = makeWorktreeFixture('proj-t25a', GAP_LINE);
try {
  const scan = runIn(fx25a.main, ['--project', 'proj-t25a', '--json']);
  assert(scan.exitCode === 0, 'T25a: scanner from main exits 0, got ' + scan.exitCode);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === GAP_CLASS,
    'T25a: scanner from main sweeps the seeded gap, got ' + JSON.stringify(scan.jsonOut));
  const check = runIn(fx25a.main, ['--project', 'proj-t25a', '--check', '--json', '--offline']);
  assert(check.exitCode === 1, 'T25a: gate from main exits 1 on the unmapped gap, got ' + check.exitCode);
  assert(check.jsonOut && check.jsonOut.reason === 'gaps_unswept',
    'T25a: gate from main refuses gaps_unswept, got ' + JSON.stringify(check.jsonOut));
} finally {
  try { fs.rmSync(fx25a.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T25b: scanner ran from MAIN; the gate runs from the WORKTREE. Same repository, same run
//     folder, same command — it must reach the same verdict, not report the artifact missing.
//     Pinned on the REASON, deliberately not on the "artifact not found" text: the emitted path is
//     absolute and a verbatim pin would freeze a string nobody emits.
const fx25b = makeWorktreeFixture('proj-t25b', GAP_LINE);
try {
  runIn(fx25b.main, ['--project', 'proj-t25b', '--json']);
  const check = runIn(fx25b.wt, ['--project', 'proj-t25b', '--check', '--json', '--offline']);
  assert(check.jsonOut && check.jsonOut.reason === 'gaps_unswept',
    'T25b (#971): the gate run from the linked worktree reads MAIN\'s run folder and refuses '
    + 'gaps_unswept, the same verdict it reaches from main — got ' + JSON.stringify(check.jsonOut));
  assert(check.exitCode === 1, 'T25b: gate from the worktree exits 1, got ' + check.exitCode);
} finally {
  try { fs.rmSync(fx25b.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T25c: THE FALSE GREEN. The operator's natural recovery — "it says run the scanner, so I run
//     the scanner" — done entirely from the worktree. Nothing here may pass vacuously, and nothing
//     may be written into the worktree.
const fx25c = makeWorktreeFixture('proj-t25c', GAP_LINE);
try {
  const scan = runIn(fx25c.wt, ['--project', 'proj-t25c', '--json']);
  assert(scan.exitCode === 0, 'T25c: scanner from the worktree exits 0, got ' + scan.exitCode);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1,
    'T25c (#971): the scanner run from the linked worktree sweeps MAIN\'s seeded gap rather than '
    + 'an empty worktree .cache, got ' + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  if (scan.jsonOut && scan.jsonOut.sweptClasses && scan.jsonOut.sweptClasses[0]) {
    assert(scan.jsonOut.sweptClasses[0].reasonClass === GAP_CLASS,
      'T25c: the swept class is ' + GAP_CLASS + ', got ' + scan.jsonOut.sweptClasses[0].reasonClass);
  }
  assert(scan.jsonOut && typeof scan.jsonOut.artifact === 'string'
    && realish(scan.jsonOut.artifact) === realish(path.join(fx25c.cacheDir, 'run-gaps.json')),
    'T25c (#971): the artifact lands in MAIN\'s .cache, got ' + (scan.jsonOut && scan.jsonOut.artifact));
  assert(fs.existsSync(path.join(fx25c.cacheDir, 'run-gaps.json')),
    'T25c: run-gaps.json exists in MAIN\'s .cache after a worktree scan');
  assert(!fs.existsSync(path.join(fx25c.wt, 'kaola-workflow', 'proj-t25c')),
    'T25c (#971): the scanner leaves NO stray run folder in the worktree — mkdirSync on a '
    + 'cwd-resolved output path is what creates one');

  const check = runIn(fx25c.wt, ['--project', 'proj-t25c', '--check', '--json', '--offline']);
  assert(check.exitCode === 1,
    'T25c (#971): scan-then-check entirely from the worktree must NOT exit 0 while a real gap sits '
    + 'unswept in main — got exit ' + check.exitCode + ' / ' + check.stdout.trim());
  assert(check.jsonOut && check.jsonOut.result === 'refuse' && check.jsonOut.reason === 'gaps_unswept',
    'T25c (#971): the gate refuses gaps_unswept instead of taking the vacuous-pass branch, got '
    + JSON.stringify(check.jsonOut));
  assert(check.jsonOut && Array.isArray(check.jsonOut.unmapped) && check.jsonOut.unmapped.length === 1
    && check.jsonOut.unmapped[0].reasonClass === GAP_CLASS,
    'T25c (#971): the unmapped gap is named, got ' + JSON.stringify(check.jsonOut && check.jsonOut.unmapped));
} finally {
  try { fs.rmSync(fx25c.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T25d: KAOLA_GAP_ROOT keeps precedence over any tree lookup. Every other assertion in this
//     file rides on that override, so it is pinned here rather than merely relied on: a resolution
//     that lets the tree win would silently redirect all of them. The override points at a THIRD
//     tree carrying a DIFFERENT gap, so the swept class names which root was actually read.
const fx25d = makeWorktreeFixture('proj-t25d', GAP_LINE);
const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-envroot-'));
try {
  const envCache = path.join(envRoot, 'kaola-workflow', 'proj-t25d', '.cache');
  fs.mkdirSync(envCache, { recursive: true });
  fs.writeFileSync(path.join(envCache, 'run-gaps-manual.md'),
    'gap: env-root-gap — seeded only in the KAOLA_GAP_ROOT tree\n', 'utf8');

  const scan = runIn(fx25d.wt, ['--project', 'proj-t25d', '--json'], { KAOLA_GAP_ROOT: envRoot });
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === 'manual:env-root-gap',
    'T25d: KAOLA_GAP_ROOT wins over the tree lookup — the scan reads the override root, not main '
    + '(a manual:flaky-suite here means main won), got ' + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  assert(scan.jsonOut && realish(scan.jsonOut.artifact) === realish(path.join(envCache, 'run-gaps.json')),
    'T25d: the artifact lands under KAOLA_GAP_ROOT, got ' + (scan.jsonOut && scan.jsonOut.artifact));
  assert(!fs.existsSync(path.join(fx25d.cacheDir, 'run-gaps.json')),
    'T25d: nothing is written into main when KAOLA_GAP_ROOT is set');

  const check = runIn(fx25d.wt, ['--project', 'proj-t25d', '--check', '--json', '--offline'],
    { KAOLA_GAP_ROOT: envRoot });
  assert(check.jsonOut && check.jsonOut.reason === 'gaps_unswept'
    && Array.isArray(check.jsonOut.unmapped) && check.jsonOut.unmapped.length === 1
    && check.jsonOut.unmapped[0].reasonClass === 'manual:env-root-gap',
    'T25d: the gate reads the override root too — both modes honour KAOLA_GAP_ROOT identically, got '
    + JSON.stringify(check.jsonOut));
} finally {
  try { fs.rmSync(fx25d.tmp, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(envRoot, { recursive: true, force: true }); } catch (_) {}
}

// --- T25e: the run folder that lives in the INVOKING tree stays there. Reaching for main
//     unconditionally would break the post-mirror topology, where the folder is worktree-resident.
//     The rule is "the tree the run folder lives in", not "always main".
const fx25e = makeWorktreeFixture('proj-t25e', null);
try {
  fs.rmSync(path.join(fx25e.main, 'kaola-workflow'), { recursive: true, force: true });
  const wtCache = path.join(fx25e.wt, 'kaola-workflow', 'proj-t25e', '.cache');
  fs.mkdirSync(wtCache, { recursive: true });
  fs.writeFileSync(path.join(wtCache, 'run-gaps-manual.md'),
    'gap: wt-only — seeded in the worktree, absent from main\n', 'utf8');

  const scan = runIn(fx25e.wt, ['--project', 'proj-t25e', '--json']);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === 'manual:wt-only',
    'T25e: a run folder resident only in the invoking worktree is still the one read, got '
    + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  assert(scan.jsonOut && realish(scan.jsonOut.artifact) === realish(path.join(wtCache, 'run-gaps.json')),
    'T25e: the artifact lands in the worktree\'s own .cache, got ' + (scan.jsonOut && scan.jsonOut.artifact));
  assert(!fs.existsSync(path.join(fx25e.main, 'kaola-workflow', 'proj-t25e')),
    'T25e: no stray run folder is created in main');
} finally {
  try { fs.rmSync(fx25e.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T25f: no git anywhere and no override. A tree lookup that throws must not take the script
//     with it; the cwd fallback is what every non-repo consumer checkout relies on.
const noGitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-nogit-'));
try {
  const cache = path.join(noGitRoot, 'kaola-workflow', 'proj-t25f', '.cache');
  fs.mkdirSync(cache, { recursive: true });
  fs.writeFileSync(path.join(cache, 'run-gaps-manual.md'), 'gap: nogit — no repository here\n', 'utf8');
  const scan = runIn(noGitRoot, ['--project', 'proj-t25f', '--json']);
  assert(scan.exitCode === 0, 'T25f: a cwd outside any git repository still scans, got exit '
    + scan.exitCode + ' / ' + scan.stderr.trim());
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === 'manual:nogit',
    'T25f: resolution falls back to cwd when there is no repository to ask, got '
    + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
} finally {
  try { fs.rmSync(noGitRoot, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T26 (#974): a run folder that is a LEFTOVER ARTIFACT rather than the run's real one must not
// silently satisfy the resolver.
//
// #971 taught the resolver to look past cwd — but only when cwd holds NOTHING. The stop condition is
// a bare existence test, so a `kaola-workflow/<project>/` sitting in the invoking tree terminates the
// search there and the run's real folder, one directory over, is never read. Three populations reach
// that state and all three are measured below: the leftover a PRE-#971 sweep wrote into the linked
// worktree (T26a, T26b), and a bare empty directory that anything at all created (T26c) — no
// `.cache`, no artifact, no content of any kind is required for the hijack.
//
// WHAT IS PINNED IS THAT THE LEFTOVER STOPS BEING INVISIBLE — not a refusal, and not a mechanism.
// This failure class is a VACUOUS PASS, not a missing door: the gate already refuses loudly when the
// artifact is absent, and what is wrong here is that a pass means nothing, so the repair is to stop
// the pass being vacuous rather than to add a gate. No assertion below demands a new non-zero exit
// code, and none names a candidate root field, a marker, or a resolution rule. Two observable
// properties carry the whole claim:
//
//   * DIFFERENTIAL. A run over a leftover and a run over a LEGITIMATELY worktree-resident run folder
//     are byte-identical today — measured at 69264936, both emit
//     `{"result":"pass","mapped":0,"filed":0,"noise":0}` on stdout, nothing on stderr, exit 0, while
//     one of them has a real unswept gap in the other tree and the other has no other tree at all.
//     They are semantically opposite, so an implementation whose own output still cannot tell them
//     apart has not seen the leftover. Reporting the other candidate root closes this; so does
//     marking the artifact; so does resolving somewhere else. The assertion prefers none of them.
//   * ACTIONABILITY. In the leftover case the run either stops being a bare vacuous pass, or its
//     output NAMES the other working tree that also holds this run folder. A signal that does not
//     say which other tree is silence with extra bytes in it, and the shipped precedent for this
//     exact question already names paths. Both spellings of the path count: macOS resolves
//     os.tmpdir() through a symlink, so the same directory has a /private-prefixed twin.
//
// The LEGITIMATE topologies are pinned alongside, because a fix that "closes" #974 by breaking one of
// them has relocated the false green rather than removed it. T26d is the post-mirror window in which
// BOTH trees genuinely hold the folder — the finalize transaction copies main's run folder into the
// worktree, and from that moment the worktree copy is the right one to read. T26e is the
// KAOLA_GAP_ROOT override, which 127 assertions in this file ride on. Both are GREEN AT HEAD and the
// point of them is that they stay green; they are controls, not the claim.
// ---------------------------------------------------------------------------

// The whole observable of a --check run. --check emits no paths, so runs from two different tmpdir
// fixtures are directly comparable with no normalization — which is exactly why the differential
// below is a byte comparison and not a shape comparison.
function checkObservable(r) {
  return JSON.stringify([r.exitCode, r.stdout, r.stderr]);
}

// Does this run's output name the OTHER working tree that also holds the run folder?
function namesRoot(r, root) {
  const blob = (r.stdout || '') + (r.stderr || '');
  return blob.includes(root) || blob.includes(realish(root));
}

// Every refusal class the script ships, read off its five `reason:` sites. Used only to pin that the
// leftover does not earn a SIXTH one.
const SHIPPED_REFUSAL_REASONS = [
  'project_archived', 'foreign_run_gaps_output', 'artifact_missing',
  'observed_gap_unseeded', 'gaps_unswept',
];

// The bare vacuous pass: the gate certified a run whose swept set was empty, and said nothing else.
function isBareVacuousPass(r) {
  return r.exitCode === 0 && r.jsonOut !== null && r.jsonOut.result === 'pass' && r.jsonOut.mapped === 0;
}

// The leftover is manufactured by the shipped scanner with its root pinned at the worktree, which is
// byte-for-byte the pre-#971 `root := cwd` behaviour — not hand-carved, so the fixture cannot drift
// from what the real population looks like.
function makePreFixLeftover(fx) {
  return runIn(fx.wt, ['--project', fx.project, '--json'], { KAOLA_GAP_ROOT: fx.wt });
}

// Main's run folder in these scenarios is CLAIM-CREATED, and the claim transaction writes
// workflow-state.md into it. The fixture says so rather than leaving it out: without it the fixture
// would quietly forbid the one content-level signal that exists on disk for telling a claimed run
// folder from a folder something else made, and a test that forbids a mechanism is a test that
// picked one.
function markClaimCreated(root, project) {
  fs.writeFileSync(path.join(root, 'kaola-workflow', project, 'workflow-state.md'),
    '# Workflow State\n\n- issue: 974\n', 'utf8');
}

// --- T26 baseline: the LEGITIMATE sole copy. The run folder lives in the invoking worktree and
//     NOWHERE else (T25e's topology: run-chains writes this shape on a first run, and #910's
//     resolver comment protects it). Its .cache is empty, nothing was swept, nothing was mapped — a
//     vacuous pass is the CORRECT answer here and must survive. This measurement is the control the
//     three leftover legs are compared against, so it is pinned before it is used: if this leg stops
//     being a bare vacuous pass, the differentials below stop meaning anything.
let LEGIT_SOLE_COPY_CHECK = null;
const fx26base = makeWorktreeFixture('proj-t26', null);
try {
  fs.rmSync(path.join(fx26base.main, 'kaola-workflow'), { recursive: true, force: true });
  fs.mkdirSync(path.join(fx26base.wt, 'kaola-workflow', 'proj-t26', '.cache'), { recursive: true });
  runIn(fx26base.wt, ['--project', 'proj-t26', '--json']);
  const check = runIn(fx26base.wt, ['--project', 'proj-t26', '--check', '--json', '--offline']);
  LEGIT_SOLE_COPY_CHECK = checkObservable(check);
  assert(isBareVacuousPass(check),
    'T26 baseline: a run folder that is the SOLE copy, with an empty .cache and no mapped gaps, still '
    + 'passes vacuously — that is a correct answer and #974 does not touch it; got exit '
    + check.exitCode + ' / ' + check.stdout.trim());
  assert(!namesRoot(check, fx26base.main),
    'T26 baseline: and it names no other tree, because there is no other tree holding this folder; got '
    + check.stdout.trim() + ' / ' + check.stderr.trim());
} finally {
  try { fs.rmSync(fx26base.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26a: THE SHAPE THE FINALIZE FLOW ACTUALLY TAKES. The sweep already happened, correctly, from
//     MAIN — main's artifact names a real gap that nothing has mapped. Step 7 of finalize issues ONE
//     command, `--check`, and the operator never re-scans. Run from a worktree carrying a pre-#971
//     leftover, that single command certifies an empty run folder while the evidence sits one
//     directory over. The false green therefore does NOT require the sweep to have failed, which is
//     the half of this defect that makes it reachable in a run where everything else went right.
const fx26a = makeWorktreeFixture('proj-t26a', GAP_LINE);
try {
  markClaimCreated(fx26a.main, 'proj-t26a');
  const scanMain = runIn(fx26a.main, ['--project', 'proj-t26a', '--json']);
  assert(scanMain.jsonOut && Array.isArray(scanMain.jsonOut.sweptClasses)
    && scanMain.jsonOut.sweptClasses.length === 1,
    'T26a fixture: the scan from main sweeps the real gap first — without that this leg would be '
    + 'measuring an empty run; got ' + JSON.stringify(scanMain.jsonOut));
  makePreFixLeftover(fx26a);
  assert(fs.existsSync(path.join(fx26a.wt, 'kaola-workflow', 'proj-t26a', '.cache', 'run-gaps.json')),
    'T26a fixture: the pre-#971 leftover is resident in the worktree');

  const check = runIn(fx26a.wt, ['--project', 'proj-t26a', '--check', '--json', '--offline']);
  assert(checkObservable(check) !== LEGIT_SOLE_COPY_CHECK,
    'T26a (#974): --check run from a tree holding a LEFTOVER run folder, while main holds this run\'s '
    + 'real one with an unmapped gap in it, is byte-identical to --check over a legitimately '
    + 'worktree-resident empty run — two opposite situations, one output. The leftover has to be '
    + 'visible in SOMETHING the run emits; got ' + JSON.stringify(checkObservable(check)));
  assert(!isBareVacuousPass(check) || namesRoot(check, fx26a.main),
    'T26a (#974): and the difference has to be actionable — either this stops being a bare vacuous '
    + 'pass, or the output names the other working tree that holds this run folder ('
    + fx26a.main + '); got exit ' + check.exitCode + ' / ' + check.stdout.trim()
    + ' / ' + check.stderr.trim());

  // NO NEW DOOR. #974 is a vacuous pass, not a missing refusal — the gate already refuses loudly
  // when there is nothing to read. A repair may of course end up refusing for a reason that was
  // already shipped (a retargeted resolver reaching main's real gap refuses gaps_unswept, which is
  // the CORRECT verdict), but a fresh refusal class invented for the leftover itself is the thing
  // this issue says not to build. Pinned once here; the rule is the same on every leg above.
  assert(!(check.jsonOut && check.jsonOut.result === 'refuse')
    || SHIPPED_REFUSAL_REASONS.indexOf(check.jsonOut.reason) !== -1,
    'T26a (#974): a leftover run folder must not earn a NEW refusal class — the shipped reasons are '
    + SHIPPED_REFUSAL_REASONS.join(', ') + '; got ' + JSON.stringify(check.jsonOut));

  const mainArtifact = JSON.parse(fs.readFileSync(path.join(fx26a.cacheDir, 'run-gaps.json'), 'utf8'));
  assert(Array.isArray(mainArtifact.sweptClasses) && mainArtifact.sweptClasses.length === 1
    && mainArtifact.sweptClasses[0].reasonClass === GAP_CLASS,
    'T26a: main\'s artifact still names the real unmapped gap throughout — this is what the gate '
    + 'certified past, and without it the two assertions above would be about nothing; got '
    + JSON.stringify(mainArtifact));
} finally {
  try { fs.rmSync(fx26a.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26b: the issue's own chain — scan AND check from the polluted worktree. The scanner finds the
//     leftover in cwd, stops, sweeps its empty .cache, rewrites the leftover artifact with zero
//     classes, and the gate then passes over it. T25c pins this same operator recovery on a CLEAN
//     worktree, where it now reads main correctly; the leftover is what puts the pre-#971 answer back.
const fx26b = makeWorktreeFixture('proj-t26b', GAP_LINE);
try {
  markClaimCreated(fx26b.main, 'proj-t26b');
  makePreFixLeftover(fx26b);
  const scan = runIn(fx26b.wt, ['--project', 'proj-t26b', '--json']);
  assert((scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length > 0)
    || namesRoot(scan, fx26b.main),
    'T26b (#974): a scan invoked from a tree holding a LEFTOVER run folder reports `swept` with an '
    + 'empty class list and names only the leftover it swept — the run\'s real .cache, holding a '
    + 'seeded gap in main, is neither read nor mentioned. The scan must either reach it or say that '
    + 'another tree holds this folder; got ' + JSON.stringify(scan.jsonOut));

  const check = runIn(fx26b.wt, ['--project', 'proj-t26b', '--check', '--json', '--offline']);
  assert(checkObservable(check) !== LEGIT_SOLE_COPY_CHECK,
    'T26b (#974): scan-then-check entirely inside the polluted worktree ends in the same byte-identical '
    + 'vacuous pass as a legitimate empty run; got ' + JSON.stringify(checkObservable(check)));
  assert(!isBareVacuousPass(check) || namesRoot(check, fx26b.main),
    'T26b (#974): with nothing an operator could act on — neither a changed verdict nor the name of '
    + 'the other tree (' + fx26b.main + '); got exit ' + check.exitCode + ' / ' + check.stdout.trim()
    + ' / ' + check.stderr.trim());
  assert(fs.existsSync(path.join(fx26b.cacheDir, 'run-gaps-manual.md')),
    'T26b: main\'s seeded gap is still sitting there unswept — the fixture\'s whole point');
} finally {
  try { fs.rmSync(fx26b.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26c: AN EMPTY DIRECTORY IS ENOUGH. The stop condition is a bare existence test: no `.cache`,
//     no artifact, no `workflow-state.md`, nothing. `mkdir kaola-workflow/<P>` in the worktree — which
//     is exactly what the shipped final-validation operator hint tells operators not to do, so the
//     population is not bounded to trees that ran a pre-#971 sweep — hijacks the resolver. The first
//     --check then reports the artifact missing (honest, and deliberately not pinned here: which
//     answer that recovery step gives depends on the repair), the operator does the documented thing
//     and re-runs the scanner, and the rescan manufactures the artifact in the same hijacked tree.
const fx26c = makeWorktreeFixture('proj-t26c', GAP_LINE);
try {
  markClaimCreated(fx26c.main, 'proj-t26c');
  fs.mkdirSync(path.join(fx26c.wt, 'kaola-workflow', 'proj-t26c'), { recursive: true });
  assert(fs.readdirSync(path.join(fx26c.wt, 'kaola-workflow', 'proj-t26c')).length === 0,
    'T26c fixture: the hijacking directory is genuinely EMPTY — if the fixture had to put anything '
    + 'inside it, this leg would be measuring the leftover-artifact case again');

  const scan = runIn(fx26c.wt, ['--project', 'proj-t26c', '--json']);
  assert((scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length > 0)
    || namesRoot(scan, fx26c.main),
    'T26c (#974): an EMPTY DIRECTORY of the right name is enough to redirect the scan away from the '
    + 'run folder that has the evidence in it; got ' + JSON.stringify(scan.jsonOut));

  const check = runIn(fx26c.wt, ['--project', 'proj-t26c', '--check', '--json', '--offline']);
  assert(checkObservable(check) !== LEGIT_SOLE_COPY_CHECK,
    'T26c (#974): and the gate that follows is again byte-identical to a legitimate empty run; got '
    + JSON.stringify(checkObservable(check)));
  assert(!isBareVacuousPass(check) || namesRoot(check, fx26c.main),
    'T26c (#974): with nothing naming the other tree (' + fx26c.main + '); got exit '
    + check.exitCode + ' / ' + check.stdout.trim() + ' / ' + check.stderr.trim());
} finally {
  try { fs.rmSync(fx26c.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26d: CONTROL — the post-mirror window, where both trees legitimately hold the run folder and
//     the worktree copy is the right one to read. The finalize transaction copies main's run folder
//     into the worktree (`workflow-state.md` included), and from that moment "another tree also holds
//     this folder" is TRUE of a perfectly healthy run. A repair that treats that fact alone as the
//     signal breaks this leg, and breaking it is worse than the defect: the gate would stop reading
//     the tree the operator is finalizing from. Green at HEAD; it must stay green.
const fx26d = makeWorktreeFixture('proj-t26d', GAP_LINE);
try {
  fs.writeFileSync(path.join(fx26d.main, 'kaola-workflow', 'proj-t26d', 'workflow-state.md'),
    '# Workflow State\n', 'utf8');
  const wtCache26d = path.join(fx26d.wt, 'kaola-workflow', 'proj-t26d', '.cache');
  fs.mkdirSync(wtCache26d, { recursive: true });
  fs.writeFileSync(path.join(wtCache26d, 'run-gaps-manual.md'), GAP_LINE + '\n', 'utf8');
  fs.writeFileSync(path.join(fx26d.wt, 'kaola-workflow', 'proj-t26d', 'workflow-state.md'),
    '# Workflow State\n', 'utf8');

  const scan = runIn(fx26d.wt, ['--project', 'proj-t26d', '--json']);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === GAP_CLASS,
    'T26d (#974 control): after the finalize mirror the worktree\'s own copy is complete and IS the '
    + 'run folder — the scan reads it and sweeps its gap; got ' + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  assert(scan.jsonOut && realish(scan.jsonOut.artifact) === realish(path.join(wtCache26d, 'run-gaps.json')),
    'T26d (#974 control): and the artifact lands in the worktree\'s own .cache, got '
    + (scan.jsonOut && scan.jsonOut.artifact));

  const check = runIn(fx26d.wt, ['--project', 'proj-t26d', '--check', '--json', '--offline']);
  assert(check.exitCode === 1 && check.jsonOut && check.jsonOut.reason === 'gaps_unswept',
    'T26d (#974 control): and the gate still refuses the unmapped gap from that tree — this leg is '
    + 'what stops #974 being "closed" by making the gate read main unconditionally; got exit '
    + check.exitCode + ' / ' + check.stdout.trim());
  assert(check.jsonOut && Array.isArray(check.jsonOut.unmapped) && check.jsonOut.unmapped.length === 1
    && check.jsonOut.unmapped[0].reasonClass === GAP_CLASS,
    'T26d (#974 control): naming the gap it found, got ' + JSON.stringify(check.jsonOut && check.jsonOut.unmapped));
} finally {
  try { fs.rmSync(fx26d.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26e: CONTROL — KAOLA_GAP_ROOT keeps tier-1 precedence WITH a leftover present in cwd. T25d
//     pins the override against a clean tree; this pins it against the one input a #974 repair adds
//     to the resolver. 127 assertions in this file reach their root through that override, so a
//     repair that consults the trees before honouring it redirects all of them somewhere else.
const fx26e = makeWorktreeFixture('proj-t26e', GAP_LINE);
const envRoot26e = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-envroot26-'));
try {
  markClaimCreated(fx26e.main, 'proj-t26e');
  makePreFixLeftover(fx26e);
  const envCache = path.join(envRoot26e, 'kaola-workflow', 'proj-t26e', '.cache');
  fs.mkdirSync(envCache, { recursive: true });
  fs.writeFileSync(path.join(envCache, 'run-gaps-manual.md'),
    'gap: env-root-gap — seeded only in the KAOLA_GAP_ROOT tree\n', 'utf8');

  const scan = runIn(fx26e.wt, ['--project', 'proj-t26e', '--json'], { KAOLA_GAP_ROOT: envRoot26e });
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === 'manual:env-root-gap',
    'T26e (#974 control): KAOLA_GAP_ROOT still wins outright when cwd holds a leftover run folder — a '
    + 'manual:flaky-suite here means main won, an empty list means the leftover won; got '
    + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  const check = runIn(fx26e.wt, ['--project', 'proj-t26e', '--check', '--json', '--offline'],
    { KAOLA_GAP_ROOT: envRoot26e });
  assert(check.jsonOut && check.jsonOut.reason === 'gaps_unswept'
    && Array.isArray(check.jsonOut.unmapped) && check.jsonOut.unmapped.length === 1
    && check.jsonOut.unmapped[0].reasonClass === 'manual:env-root-gap',
    'T26e (#974 control): and the gate honours it identically, got ' + JSON.stringify(check.jsonOut));
} finally {
  try { fs.rmSync(fx26e.tmp, { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(envRoot26e, { recursive: true, force: true }); } catch (_) {}
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
