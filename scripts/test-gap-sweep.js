#!/usr/bin/env node
'use strict';

// Standalone tests for kaola-workflow-gap-sweep.js.
//
// #1054 item 1/2/4 (settled production decision): the script survives ONLY as an optional,
// non-gating diagnostic scanner. `--check` (the `## Run gaps` reconciliation gate), `--summary`,
// `--offline`/the issue-existence probe, and the `run-gaps-manual.md` hand-seed grammar are
// RETIRED outright — not decoupled from finalize, gone from the script. Nothing in finalize
// invokes this script any more. What remains: `--project` (required), `--json`, `--output`,
// `-h`/`--help`; one reason class (`deferred_red_chain`, read from `chain-receipt.json`); the
// project-archived and foreign-output write-safety refusals (unrelated to the retired gate); and
// the run-root resolution rule.
//
// REWRITTEN from the retired file's 26 tests, per team-lead instruction: assertions on `--check`
// refusal semantics (`gaps_unswept`, `observed_gap_unseeded`), the sample-containment/lazy-vs-
// greedy grammar fixes, and the `run-gaps-manual.md` seed grammar are DELETED — that surface no
// longer exists to test. Deleted wholesale: T2, T3, T4, T5, T8, T9, T10, T11, T17, T18, T19, T20,
// T21, T22, T23, T23b, T24 (all `--check`- and/or manual-seed-grammar-specific; no observable
// replacement exists for a refusal path the script no longer has). KEPT, unchanged in substance:
// T1 (scanner dedup, manual-seed half dropped), T6/T7 (missing --project / unknown argument),
// T12-T16 (`#675`/`#679`/`#681` write-safety refusals — pure scanner-side, never touched `--check`).
// REWRITTEN to drop `--check` calls and substitute `chain-receipt.json` seeds for the retired
// `run-gaps-manual.md` grammar, preserving the root-resolution claim each pins: T25(a,c,d,e,f) ->
// the "resolve against SCAN" legs below (T25b is dropped as redundant now that both b and c drove
// the same worktree-reads-main claim through a scan rather than a gate); T26(baseline,a,b,c,d,e) ->
// consolidated to four legs (baseline, one leftover leg standing for the pre-#971-leftover and
// bare-empty-directory populations together, and the two controls) since the differential they all
// proved lived in `--check`'s vacuous-pass envelope, which is gone — the SCAN-observable form of
// the same claim (does a leftover silently produce an empty sweep indistinguishable from a
// legitimate empty run, or does it say which other tree holds the real one) is what survives.
// ADDED: T7b, pinning explicitly that each of the three retired flags now falls through to the
// generic "unknown argument" path (exit 1) rather than being silently accepted or ignored.
//
// Hand-rolled assert pattern — no test framework dependency. Synthetic fixtures in os.tmpdir()
// only — never touches the real repo.

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

// ---------------------------------------------------------------------------
// T1: SCAN dedup — a chain receipt carrying the SAME waived chain twice => exactly 1 sweptClasses
//     entry (deferred_red_chain), the duplicate collapsed with its count SUMMED, and the artifact
//     written to disk.
//
// Dedup is keyed on (reasonClass, sample), which is class-agnostic. The retired file proved this
// through two producers (a chain-receipt entry and a manual seed); only the chain-receipt producer
// survives, and it proves the same rule over a class that can genuinely repeat (the same chain
// waived under the same issue on a re-run).
// ---------------------------------------------------------------------------
const fix1 = makeFixture('proj-t1');
try {
  writeChainReceipt(fix1.cacheDir, [
    { name: 'claude',  exitCode: 0, accepted_red: false, accepted_red_issue: null },
    { name: 'codex',   exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
    // The SAME (name, issue) pair a second time — one swept entry, count 2.
    { name: 'codex',   exitCode: 1, accepted_red: true,  accepted_red_issue: '99' },
  ]);

  const r1 = run(fix1.root, ['--project', 'proj-t1', '--json']);

  assert(r1.exitCode === 0, 'T1: scanner exits 0 as a diagnostic');
  assert(r1.jsonOut !== null, 'T1: JSON output parseable');
  if (r1.jsonOut) {
    assert(r1.jsonOut.result === 'swept', 'T1: result = swept');
    assert(r1.jsonOut.project === 'proj-t1', 'T1: project field matches');
    assert(Array.isArray(r1.jsonOut.sweptClasses), 'T1: sweptClasses is array');
    assert(r1.jsonOut.sweptClasses.length === 1,
      'T1: exactly 1 swept class (deferred_red_chain) — the manual: producer is retired; got ' + JSON.stringify(r1.jsonOut.sweptClasses));
    const drc = r1.jsonOut.sweptClasses.find(c => c.reasonClass === 'deferred_red_chain');
    assert(drc !== undefined, 'T1: deferred_red_chain class present — the one surviving reason class is reported');
    if (drc) {
      assert(drc.sample === 'codex:99', 'T1: deferred_red_chain sample = codex:99, got ' + drc.sample);
      assert(drc.count === 2, 'T1: dedup SUMS the counts of the collapsed duplicates, got ' + drc.count);
    }
    // artifact written
    assert(typeof r1.jsonOut.artifact === 'string' && r1.jsonOut.artifact.length > 0, 'T1: artifact path returned');
    const artifactExists = fs.existsSync(r1.jsonOut.artifact);
    assert(artifactExists, 'T1: artifact file exists at returned path');
    if (artifactExists) {
      const saved = JSON.parse(fs.readFileSync(r1.jsonOut.artifact, 'utf8'));
      assert(Array.isArray(saved.sweptClasses), 'T1: artifact has sweptClasses array (the diagnostic shape)');
    }
  }
} finally {
  try { fs.rmSync(fix1.root, { recursive: true, force: true }); } catch (_) {}
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
// T7b (#1054): the three RETIRED flags — --check, --summary, --offline — are reported as unknown
// arguments (exit 1, stderr message), not silently accepted or silently ignored. This is the
// consumer-visible proof that the gate is gone, not merely unwired: an operator who still types
// `--check` out of habit gets a loud, immediate error rather than a script that quietly runs the
// scanner and drops the flag.
// ---------------------------------------------------------------------------
for (const retiredFlag of ['--check', '--summary', '--offline']) {
  const fix7b = makeFixture('proj-t7b');
  try {
    const args = retiredFlag === '--summary'
      ? ['--project', 'proj-t7b', retiredFlag, '/tmp/whatever.md']
      : ['--project', 'proj-t7b', retiredFlag];
    const r7b = run(fix7b.root, args);
    assert(r7b.exitCode !== 0,
      'T7b: retired flag ' + retiredFlag + ' must exit non-zero (unknown argument), not be silently accepted; got exit ' + r7b.exitCode);
    assert((r7b.stderr || '').toLowerCase().includes('unknown'),
      'T7b: retired flag ' + retiredFlag + ' must be reported via the unknown-argument path; got stderr=' + JSON.stringify(r7b.stderr));
  } finally {
    try { fs.rmSync(fix7b.root, { recursive: true, force: true }); } catch (_) {}
  }
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
// T25 (#971): the run folder is resolved against the tree it LIVES in, not against cwd.
//
// Every scenario above hands the script a KAOLA_GAP_ROOT, so none of them can see where the
// script would have looked on its own. On a worktree run nobody does: the operator stands in the
// linked worktree while `kaola-workflow/<project>/` is resident in the MAIN checkout, uncommitted.
// Resolving against cwd then reads a tree that has no run folder at all — the scan would sweep the
// worktree's empty .cache and silently miss a real signal in main.
//
// The fixture is a real linked worktree, because the defect lives in the tree topology. Seeds use
// chain-receipt.json (the surviving reason-class producer) in place of the retired
// run-gaps-manual.md grammar.
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
// worktree exists and left uncommitted — the real run-time topology. `chainTag`, when given, seeds
// a deferred_red_chain signal (chain name 'seed', accepted_red_issue chainTag) into main's .cache.
function makeWorktreeFixture(project, chainTag) {
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
  if (chainTag) writeChainReceipt(cacheDir, [{ name: 'seed', exitCode: 1, accepted_red: true, accepted_red_issue: chainTag }]);
  return { tmp, main, wt, cacheDir, project };
}

const GAP_TAG = 'flaky-suite';
const GAP_CLASS = 'deferred_red_chain';
const GAP_SAMPLE = 'seed:' + GAP_TAG;

// --- T25a: the reference behaviour, from MAIN. This is what every other scenario must match. ---
const fx25a = makeWorktreeFixture('proj-t25a', GAP_TAG);
try {
  const scan = runIn(fx25a.main, ['--project', 'proj-t25a', '--json']);
  assert(scan.exitCode === 0, 'T25a: scanner from main exits 0, got ' + scan.exitCode);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].reasonClass === GAP_CLASS && scan.jsonOut.sweptClasses[0].sample === GAP_SAMPLE,
    'T25a: scanner from main sweeps the seeded gap, got ' + JSON.stringify(scan.jsonOut));
} finally {
  try { fs.rmSync(fx25a.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T25c: THE FALSE GREEN, now on the scan alone. The operator stands in the worktree and the
//     run folder is resident only in main. Nothing here may silently sweep an empty worktree
//     .cache, and nothing may be written into the worktree.
const fx25c = makeWorktreeFixture('proj-t25c', GAP_TAG);
try {
  const scan = runIn(fx25c.wt, ['--project', 'proj-t25c', '--json']);
  assert(scan.exitCode === 0, 'T25c: scanner from the worktree exits 0, got ' + scan.exitCode);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1,
    'T25c (#971): the scanner run from the linked worktree sweeps MAIN\'s seeded gap rather than '
    + 'an empty worktree .cache, got ' + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  if (scan.jsonOut && scan.jsonOut.sweptClasses && scan.jsonOut.sweptClasses[0]) {
    assert(scan.jsonOut.sweptClasses[0].reasonClass === GAP_CLASS && scan.jsonOut.sweptClasses[0].sample === GAP_SAMPLE,
      'T25c: the swept class/sample match, got ' + JSON.stringify(scan.jsonOut.sweptClasses[0]));
  }
  assert(scan.jsonOut && typeof scan.jsonOut.artifact === 'string'
    && realish(scan.jsonOut.artifact) === realish(path.join(fx25c.cacheDir, 'run-gaps.json')),
    'T25c (#971): the artifact lands in MAIN\'s .cache, got ' + (scan.jsonOut && scan.jsonOut.artifact));
  assert(fs.existsSync(path.join(fx25c.cacheDir, 'run-gaps.json')),
    'T25c: run-gaps.json exists in MAIN\'s .cache after a worktree scan');
  assert(!fs.existsSync(path.join(fx25c.wt, 'kaola-workflow', 'proj-t25c')),
    'T25c (#971): the scanner leaves NO stray run folder in the worktree — mkdirSync on a '
    + 'cwd-resolved output path is what creates one');
} finally {
  try { fs.rmSync(fx25c.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T25d: KAOLA_GAP_ROOT keeps precedence over any tree lookup. Every other assertion in this
//     file rides on that override, so it is pinned here rather than merely relied on: a resolution
//     that lets the tree win would silently redirect all of them. The override points at a THIRD
//     tree carrying a DIFFERENT gap, so the swept class names which root was actually read.
const fx25d = makeWorktreeFixture('proj-t25d', GAP_TAG);
const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-envroot-'));
try {
  const envCache = path.join(envRoot, 'kaola-workflow', 'proj-t25d', '.cache');
  fs.mkdirSync(envCache, { recursive: true });
  writeChainReceipt(envCache, [{ name: 'seed', exitCode: 1, accepted_red: true, accepted_red_issue: 'env-root-gap' }]);

  const scan = runIn(fx25d.wt, ['--project', 'proj-t25d', '--json'], { KAOLA_GAP_ROOT: envRoot });
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].sample === 'seed:env-root-gap',
    'T25d: KAOLA_GAP_ROOT wins over the tree lookup — the scan reads the override root, not main '
    + '(sample seed:' + GAP_TAG + ' here means main won), got ' + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  assert(scan.jsonOut && realish(scan.jsonOut.artifact) === realish(path.join(envCache, 'run-gaps.json')),
    'T25d: the artifact lands under KAOLA_GAP_ROOT, got ' + (scan.jsonOut && scan.jsonOut.artifact));
  assert(!fs.existsSync(path.join(fx25d.cacheDir, 'run-gaps.json')),
    'T25d: nothing is written into main when KAOLA_GAP_ROOT is set');
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
  writeChainReceipt(wtCache, [{ name: 'seed', exitCode: 1, accepted_red: true, accepted_red_issue: 'wt-only' }]);

  const scan = runIn(fx25e.wt, ['--project', 'proj-t25e', '--json']);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].sample === 'seed:wt-only',
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
  writeChainReceipt(cache, [{ name: 'seed', exitCode: 1, accepted_red: true, accepted_red_issue: 'nogit' }]);
  const scan = runIn(noGitRoot, ['--project', 'proj-t25f', '--json']);
  assert(scan.exitCode === 0, 'T25f: a cwd outside any git repository still scans, got exit '
    + scan.exitCode + ' / ' + scan.stderr.trim());
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].sample === 'seed:nogit',
    'T25f: resolution falls back to cwd when there is no repository to ask, got '
    + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
} finally {
  try { fs.rmSync(noGitRoot, { recursive: true, force: true }); } catch (_) {}
}

// ---------------------------------------------------------------------------
// T26 (#974): a run folder that is a LEFTOVER ARTIFACT rather than the run's real one must not
// silently satisfy the resolver.
//
// #971 taught the resolver to look past cwd — but only when cwd holds NOTHING. A
// `kaola-workflow/<project>/` sitting in the invoking tree terminates the search there, and the
// run's real folder, one directory over, is never read.
//
// The retired file proved this through `--check`'s vacuous-pass envelope (two opposite situations
// producing byte-identical `{"result":"pass","mapped":0,...}` output). `--check` is gone, so the
// SCAN-observable form of the same claim is pinned instead: a scan over a leftover must not
// silently report an empty sweep indistinguishable from a legitimate empty run — either the sweep
// differs from the legitimate baseline, or the output names the other tree that holds the real
// folder. Consolidated from six legs to four: the pre-#971-leftover and bare-empty-directory
// populations (T26a/T26b/T26c in the retired file) are collapsed into one representative leg
// (T26a below) since both reached the identical scan-observable state; the two controls survive
// unchanged in substance.
// ---------------------------------------------------------------------------

// Does this run's output name the OTHER working tree that also holds the run folder?
function namesRoot(r, root) {
  const blob = (r.stdout || '') + (r.stderr || '');
  return blob.includes(root) || blob.includes(realish(root));
}

// The bare silent sweep: a scan that reports `swept` with zero classes and says nothing else.
function isEmptySweep(r) {
  return r.exitCode === 0 && r.jsonOut !== null && r.jsonOut.result === 'swept'
    && Array.isArray(r.jsonOut.sweptClasses) && r.jsonOut.sweptClasses.length === 0;
}

function scanObservable(r) {
  return JSON.stringify([r.exitCode, r.stdout, r.stderr]);
}

// Main's run folder in these scenarios is CLAIM-CREATED, and the claim transaction writes
// workflow-state.md into it.
function markClaimCreated(root, project) {
  fs.writeFileSync(path.join(root, 'kaola-workflow', project, 'workflow-state.md'),
    '# Workflow State\n\n- issue: 974\n', 'utf8');
}

// --- T26 baseline: the LEGITIMATE sole copy. The run folder lives in the invoking worktree and
//     NOWHERE else. Its .cache is empty, nothing was swept — a silent empty sweep is the CORRECT
//     answer here and must survive. Pinned before it is used as the control for T26a below.
let LEGIT_SOLE_COPY_SCAN = null;
const fx26base = makeWorktreeFixture('proj-t26', null);
try {
  fs.rmSync(path.join(fx26base.main, 'kaola-workflow'), { recursive: true, force: true });
  fs.mkdirSync(path.join(fx26base.wt, 'kaola-workflow', 'proj-t26', '.cache'), { recursive: true });
  const scan = runIn(fx26base.wt, ['--project', 'proj-t26', '--json']);
  LEGIT_SOLE_COPY_SCAN = scanObservable(scan);
  assert(isEmptySweep(scan),
    'T26 baseline: a run folder that is the SOLE copy, with an empty .cache, still sweeps empty — '
    + 'that is a correct answer and #974 does not touch it; got exit ' + scan.exitCode + ' / ' + scan.stdout.trim());
  assert(!namesRoot(scan, fx26base.main),
    'T26 baseline: and it names no other tree, because there is no other tree holding this folder; got '
    + scan.stdout.trim() + ' / ' + scan.stderr.trim());
} finally {
  try { fs.rmSync(fx26base.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26a: the leftover populations, consolidated. A worktree holds a bare leftover
//     `kaola-workflow/<project>/` (built the same way a pre-#971 sweep — or an operator's stray
//     `mkdir` — would leave it: no `.cache` seeded, nothing swept there), while main holds the
//     real folder with an unswept gap in it. A scan invoked from the worktree must either read
//     main's real gap, or its output must be OBSERVABLY DIFFERENT from the legitimate-sole-copy
//     baseline, or it must name the other tree.
const fx26a = makeWorktreeFixture('proj-t26a', GAP_TAG);
try {
  markClaimCreated(fx26a.main, 'proj-t26a');
  fs.mkdirSync(path.join(fx26a.wt, 'kaola-workflow', 'proj-t26a'), { recursive: true });
  assert(fs.readdirSync(path.join(fx26a.wt, 'kaola-workflow', 'proj-t26a')).length === 0,
    'T26a fixture: the leftover directory is genuinely empty');

  const scan = runIn(fx26a.wt, ['--project', 'proj-t26a', '--json']);
  assert(scanObservable(scan) !== LEGIT_SOLE_COPY_SCAN || namesRoot(scan, fx26a.main)
    || (scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length > 0),
    'T26a (#974): a scan run from a tree holding a LEFTOVER run folder, while main holds this run\'s '
    + 'real one with an unswept gap in it, must not be indistinguishable from a scan over a '
    + 'legitimately worktree-resident empty run — either the sweep is non-empty, the output differs, '
    + 'or it names the other tree (' + fx26a.main + '); got ' + JSON.stringify(scan.jsonOut) + ' / '
    + scan.stderr.trim());

  const mainArtifact = JSON.parse(fs.readFileSync(path.join(fx26a.cacheDir, 'run-gaps.json'), 'utf8'));
  assert(Array.isArray(mainArtifact.sweptClasses) && mainArtifact.sweptClasses.length === 1
    && mainArtifact.sweptClasses[0].sample === GAP_SAMPLE,
    'T26a: main\'s artifact still names the real unswept gap throughout; got ' + JSON.stringify(mainArtifact));
} finally {
  try { fs.rmSync(fx26a.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26d: CONTROL — the post-mirror window, where both trees legitimately hold the run folder and
//     the worktree copy is the right one to read. The finalize transaction copies main's run folder
//     into the worktree (`workflow-state.md` included), and from that moment "another tree also
//     holds this folder" is TRUE of a perfectly healthy run. Green at HEAD; it must stay green.
const fx26d = makeWorktreeFixture('proj-t26d', GAP_TAG);
try {
  const wtCache26d = path.join(fx26d.wt, 'kaola-workflow', 'proj-t26d', '.cache');
  fs.mkdirSync(wtCache26d, { recursive: true });
  writeChainReceipt(wtCache26d, [{ name: 'seed', exitCode: 1, accepted_red: true, accepted_red_issue: GAP_TAG }]);
  fs.writeFileSync(path.join(fx26d.wt, 'kaola-workflow', 'proj-t26d', 'workflow-state.md'),
    '# Workflow State\n', 'utf8');

  const scan = runIn(fx26d.wt, ['--project', 'proj-t26d', '--json']);
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].sample === GAP_SAMPLE,
    'T26d (#974 control): after the finalize mirror the worktree\'s own copy is complete and IS the '
    + 'run folder — the scan reads it and sweeps its gap; got ' + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
  assert(scan.jsonOut && realish(scan.jsonOut.artifact) === realish(path.join(wtCache26d, 'run-gaps.json')),
    'T26d (#974 control): and the artifact lands in the worktree\'s own .cache, got '
    + (scan.jsonOut && scan.jsonOut.artifact));
} finally {
  try { fs.rmSync(fx26d.tmp, { recursive: true, force: true }); } catch (_) {}
}

// --- T26e: CONTROL — KAOLA_GAP_ROOT keeps tier-1 precedence WITH a leftover present in cwd.
const fx26e = makeWorktreeFixture('proj-t26e', GAP_TAG);
const envRoot26e = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gap-envroot26-'));
try {
  markClaimCreated(fx26e.main, 'proj-t26e');
  fs.mkdirSync(path.join(fx26e.wt, 'kaola-workflow', 'proj-t26e'), { recursive: true });
  const envCache = path.join(envRoot26e, 'kaola-workflow', 'proj-t26e', '.cache');
  fs.mkdirSync(envCache, { recursive: true });
  writeChainReceipt(envCache, [{ name: 'seed', exitCode: 1, accepted_red: true, accepted_red_issue: 'env-root-gap' }]);

  const scan = runIn(fx26e.wt, ['--project', 'proj-t26e', '--json'], { KAOLA_GAP_ROOT: envRoot26e });
  assert(scan.jsonOut && Array.isArray(scan.jsonOut.sweptClasses) && scan.jsonOut.sweptClasses.length === 1
    && scan.jsonOut.sweptClasses[0].sample === 'seed:env-root-gap',
    'T26e (#974 control): KAOLA_GAP_ROOT still wins outright when cwd holds a leftover run folder — a '
    + 'sample of seed:' + GAP_TAG + ' here means main won, an empty list means the leftover won; got '
    + JSON.stringify(scan.jsonOut && scan.jsonOut.sweptClasses));
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
