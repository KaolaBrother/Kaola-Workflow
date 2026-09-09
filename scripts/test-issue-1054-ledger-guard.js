#!/usr/bin/env node
'use strict';

// test-issue-1054-ledger-guard.js — acceptance oracle for issue #1054, PART 2: the record is
// never overwritten by a staler copy, decided by CONTENT (not counts), across the real
// mirror/sink call sites the trace found (kaola-workflow/bundle-1054/.cache/sync-guard-trace.md).
//
// Facts from the trace, driving this fixture's shape: the ONLY callers of `compareLedgers` are
// `mirrorFinalizationArtifacts` (write path) and `probeFinalizeMirror`/`finalize --check`
// (read-only prediction), inside `cmdFinalize`, in all four claim.js editions. SOURCE is always
// the main-root `kaola-workflow/<project>/mission-list.md`; DEST is always the linked worktree's
// copy. The step runs BEFORE any other gate (claim.js's own comment: "Step 8a — artifact mirror,
// BEFORE any gate reads the authority and before any side effect"). Under the corrected scope the
// automatic worktree-wins repair is RETIRED: on divergence the transaction refuses fail-closed
// under `finalize_mirror_refused` / `mirror_sync_failed`, zero-write on BOTH sides, naming both
// absolute paths and a diff.
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script. PUBLIC PATH: the real `finalize --keep-worktree` and `finalize --check` CLI, reached per
// edition exactly as scripts/test-forge-finalize-findings.js's buildFixture/runFinalize do (a real
// main root + a real linked git worktree, offline, no gh mock needed).
//
// Usage
//   node scripts/test-issue-1054-ledger-guard.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

function sha256(text) { return crypto.createHash('sha256').update(text, 'utf8').digest('hex'); }

const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures', 'issue-1054');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

const EDITIONS = Object.freeze([
  { key: 'canonical', label: 'claude/canonical',
    claim: 'scripts/kaola-workflow-claim.js',
    schema: 'scripts/kaola-workflow-adaptive-schema.js', stateForgeSection: [] },
  { key: 'codex', label: 'codex',
    claim: 'plugins/kaola-workflow/scripts/kaola-workflow-claim.js',
    schema: 'plugins/kaola-workflow/scripts/kaola-workflow-adaptive-schema.js', stateForgeSection: [] },
  { key: 'gitlab', label: 'gitlab',
    claim: 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js',
    schema: 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: ['## GitLab', 'issue_iid: 1', 'project_id: 77', 'path_with_namespace: g/p', ''] },
  { key: 'gitea', label: 'gitea',
    claim: 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js',
    schema: 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js',
    stateForgeSection: ['## Gitea', 'issue_iid: 1', 'full_name: g/p',
      'project_html_url: https://gitea.example/g/p', ''] },
]);

const REAL_TABLE = fs.readFileSync(path.join(fixturesDir, 'bundle-1053-mission-list.md'), 'utf8');
function staleTable() {
  const rows = REAL_TABLE.split('\n');
  const doneRowIdx = rows.map((l, i) => [l, i]).filter(([l]) => l.includes('| done |')).map(([, i]) => i);
  const drop = new Set(doneRowIdx.slice(4));
  return rows.filter((_, i) => !drop.has(i)).join('\n');
}
const STALE_TABLE = staleTable();

function lineForm(items) {
  const lines = ['# fence fixture — one goal line', ''];
  for (const it of items) {
    const slug = it.item.replace(/\s+/g, '-');
    lines.push('- item: ' + it.item);
    lines.push('  status: ' + it.status);
    if (it.status !== 'todo') lines.push('  dispatched: agent, output to ' + slug + '.md');
    if (it.status === 'done') lines.push('  result: out/' + slug + '.md');
    lines.push('');
  }
  return lines.join('\n');
}

function stateFor(ed, project, issueNumber, wtPath) {
  return ['# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '']
    .concat(ed.stateForgeSection)
    .concat(['## Sink', 'branch: workflow/' + project, 'issue_number: ' + issueNumber, 'sink: merge',
      'worktree_path: ' + wtPath, ''])
    .join('\n');
}

// Same construction as scripts/test-forge-finalize-findings.js's buildFixture: a main root plus a
// REAL linked git worktree (mirrorFinalizationArtifacts is a no-op unless `root !== mainRoot`).
// `srcMissionList` is the main copy; `destMissionList === null` means the dest project folder does
// not exist at all yet (first sync) — everything the mirror would copy down lives on the SOURCE
// side instead; otherwise the dest folder is pre-seeded as a resumed run.
function buildLinkedFixture(ed, project, issueNumber, srcMissionList, destMissionList) {
  const mainRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw1054lg-' + ed.key + '-')));
  const kwRoot = mainRoot + '.kw';
  const wtPath = path.join(kwRoot, project);
  G.init(mainRoot, { branch: 'main' });
  fs.writeFileSync(path.join(mainRoot, 'README.md'), 'init\n');
  G.commitAll(mainRoot, 'init');
  fs.mkdirSync(kwRoot, { recursive: true });
  G.exec(mainRoot, ['worktree', 'add', '-b', 'workflow/' + project, '--', wtPath, 'main'],
    { encoding: 'utf8', stdio: 'pipe' });

  const srcDir = path.join(mainRoot, 'kaola-workflow', project);
  fs.mkdirSync(path.join(srcDir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'mission-list.md'), srcMissionList);

  const schema = require(path.join(repoRoot, ed.schema));
  let hash = '';
  try { hash = schema.computeCodeTreeHash(wtPath, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { hash = ''; }
  const validationText = 'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + hash + '\n';

  if (destMissionList === null) {
    // First sync: nothing on dest; workflow-state.md + final-validation.md live on the SOURCE side
    // so the unconditional post-guard mirror step copies them down along with mission-list.md.
    fs.writeFileSync(path.join(srcDir, 'workflow-state.md'), stateFor(ed, project, issueNumber, wtPath));
    fs.writeFileSync(path.join(srcDir, '.cache', 'final-validation.md'), validationText);
  } else {
    const destDir = path.join(wtPath, 'kaola-workflow', project);
    fs.mkdirSync(path.join(destDir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(destDir, 'workflow-state.md'), stateFor(ed, project, issueNumber, wtPath));
    fs.writeFileSync(path.join(destDir, 'mission-list.md'), destMissionList);
    fs.writeFileSync(path.join(destDir, '.cache', 'final-validation.md'), validationText);
  }
  return { mainRoot, kwRoot, wtPath, srcDir };
}

function destroyFixture(fx) {
  try { G.exec(fx.mainRoot, ['worktree', 'remove', '--force', fx.wtPath], { encoding: 'utf8' }); } catch (_) { /* best effort */ }
  fs.rmSync(fx.mainRoot, { recursive: true, force: true });
  fs.rmSync(fx.kwRoot, { recursive: true, force: true });
}

function parseEnvelope(stdout) {
  const lines = String(stdout || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('{')) continue;
    try { return JSON.parse(line); } catch (_) { /* keep looking */ }
  }
  return null;
}
function runFinalize(ed, fx, project, extraArgs) {
  // spawn-class: cli-contract
  const r = spawnSync(process.execPath,
    [path.join(repoRoot, ed.claim), 'finalize', '--project', project, '--keep-worktree'].concat(extraArgs || []),
    { cwd: fx.wtPath, encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: parseEnvelope(r.stdout) };
}

// The live-or-archived mission-list.md bytes, wherever finalize left them. `dest` (the envelope's
// own `dest` field, when the run archived) is authoritative and checked first — a `--keep-worktree`
// run archives under the resolved AUTHORITY root, which is the main checkout, not necessarily the
// worktree passed as `root`; guessing the location instead of reading what the transaction itself
// reported would silently test the wrong tree. `root`/`project` remain the fallback for the live
// (unarchived) case and for read-only `--check` runs, which never archive at all.
function readMissionList(dest, root, project) {
  if (dest) {
    try { return fs.readFileSync(path.join(dest, 'mission-list.md'), 'utf8'); } catch (_) { /* fall through */ }
  }
  const live = path.join(root, 'kaola-workflow', project, 'mission-list.md');
  try { return fs.readFileSync(live, 'utf8'); } catch (_) { /* try archive */ }
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  try {
    for (const name of fs.readdirSync(archiveBase)) {
      const p = path.join(archiveBase, name, 'mission-list.md');
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    }
  } catch (_) { /* none */ }
  return null;
}

let uniq = 0;
function nextProject() { uniq++; return 'issue-99g' + uniq; }

// ===========================================================================
// (a) first sync copies — no dest, finalize succeeds, dest ends up with the source's bytes.
// ===========================================================================
(function firstSyncCopies() {
  console.log('2a: first sync — dest absent, finalize copies the source down');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9800, REAL_TABLE, null);
  try {
    const r = runFinalize(ed, fx, project);
    assert(r.status === 0, '2a: finalize exits 0 on a first sync; got ' + r.status
      + '\nstderr: ' + String(r.stderr || '').slice(0, 500));
    const destBytes = readMissionList(r.out && r.out.dest, fx.wtPath, project);
    assert(destBytes === REAL_TABLE,
      '2a: the worktree copy now carries the real source content, byte-for-byte; got '
      + (destBytes === null ? 'null (not found live or archived)' : 'DIFFERENT content'));
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// (b) identical repeat is a safe no-op.
// ===========================================================================
(function identicalRepeatSafe() {
  console.log('2b: identical repeat — byte-identical src/dest, finalize succeeds, nothing lost');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9801, REAL_TABLE, REAL_TABLE);
  try {
    const r = runFinalize(ed, fx, project);
    assert(r.status === 0, '2b: finalize exits 0 on an identical repeat; got ' + r.status
      + '\nstderr: ' + String(r.stderr || '').slice(0, 500));
    const destBytes = readMissionList(r.out && r.out.dest, fx.wtPath, project);
    assert(destBytes === REAL_TABLE, '2b: the record is unchanged after an idempotent repeat');
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// (c) a staler source (table-form, real data) is refused fail-closed; NEITHER side is mutated —
// the retired worktree-wins auto-repair must not fire.
// ===========================================================================
(function stalerSourceRefusedNoMutation() {
  console.log('2c: staler source refused fail-closed — dest AND main bytes unchanged afterward');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9802, STALE_TABLE, REAL_TABLE);
  try {
    const r = runFinalize(ed, fx, project);
    assert(r.status !== 0, '2c: finalize refuses (non-zero exit); got ' + r.status);
    assert(r.out && r.out.result === 'refuse' && r.out.reason === 'finalize_mirror_refused',
      '2c: envelope names the pinned refusal reason; got ' + JSON.stringify(r.out && { result: r.out.result, reason: r.out.reason }));
    assert(r.out && r.out.inner_reason === 'mirror_sync_failed',
      '2c: inner_reason is mirror_sync_failed; got ' + JSON.stringify(r.out && r.out.inner_reason));

    // Zero-write on BOTH sides: the worktree copy is untouched, and — the regression this part
    // exists to close — the RETIRED auto-repair does not overwrite the main copy either.
    const destBytes = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destBytes === REAL_TABLE, '2c: the worktree (dest) record is byte-unchanged after the refusal');
    const srcBytes = fs.readFileSync(path.join(fx.srcDir, 'mission-list.md'), 'utf8');
    assert(srcBytes === STALE_TABLE,
      '2c: the MAIN (source) record is ALSO byte-unchanged — the retired worktree-wins repair did '
      + 'not fire and overwrite it; got a record that differs from what was planted');

    // (e) the refusal names both absolute paths and carries a diff summary.
    const detail = String(r.out && r.out.detail || '');
    assert(detail.includes(fx.srcDir) || detail.includes(path.join(fx.srcDir, 'mission-list.md')),
      '2c/e: the refusal detail names the main-copy path; got ' + detail.slice(0, 300));
    assert(detail.includes(fx.wtPath) || detail.includes(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md')),
      '2c/e: the refusal detail names the worktree-copy path; got ' + detail.slice(0, 300));
    assert(/dest \(worktree copy\)|src \(main copy\)|^[-+]/m.test(detail),
      '2c/e: the refusal detail carries a diff-shaped summary of what would be lost; got '
      + detail.slice(0, 500));
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// (d) THE COUNT-PROXY TRAP, end to end: equal `status: done` counts, different content — the real
// CLI must still refuse (line-form, distinguishing this leg from (c)'s table-form).
// ===========================================================================
(function countProxyTrapEndToEnd() {
  console.log('2d: count-proxy trap end-to-end — equal done counts, different content, still refused');
  const ed = EDITIONS[0];
  const project = nextProject();
  const destText = lineForm([
    { item: 'investigate the timeout', status: 'done' },
    { item: 'patch the retry loop', status: 'done' },
    { item: 'write the regression test', status: 'in-flight' },
  ]);
  const srcText = lineForm([
    { item: 'investigate the timeout', status: 'done' },
    { item: 'roll back the bad config', status: 'done' },
    { item: 'write the regression test', status: 'todo' },
  ]);
  const fx = buildLinkedFixture(ed, project, 9803, srcText, destText);
  try {
    const r = runFinalize(ed, fx, project);
    assert(r.status !== 0 && r.out && r.out.reason === 'finalize_mirror_refused',
      '2d: a real finalize refuses when done-counts match (2/2) but the completed missions differ; '
      + 'got status ' + r.status + ' out ' + JSON.stringify(r.out && { result: r.out.result, reason: r.out.reason }));
    const destBytes = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destBytes === destText, '2d: the dest record is unchanged');
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// (f) every forge port behaves the same — leg (c) repeated across all four claim.js trees.
// ===========================================================================
for (const ed of EDITIONS) {
  console.log('2f: ' + ed.label + ' — staler-source refusal, per port');
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9810, STALE_TABLE, REAL_TABLE);
  try {
    const r = runFinalize(ed, fx, project);
    assert(r.status !== 0 && r.out && r.out.reason === 'finalize_mirror_refused' && r.out.inner_reason === 'mirror_sync_failed',
      '2f: ' + ed.label + ' refuses the same divergent copy the same way; got status ' + r.status
      + ' out ' + JSON.stringify(r.out && { result: r.out.result, reason: r.out.reason, inner_reason: r.out.inner_reason }));
    const destBytes = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destBytes === REAL_TABLE, '2f: ' + ed.label + ' — dest record unchanged');
  } finally { destroyFixture(fx); }
}

// ===========================================================================
// (g) `finalize --check` predicts the same verdict, read-only — no mutation of either file.
// ===========================================================================
(function checkPredictsReadOnly() {
  console.log('2g: finalize --check predicts sync_failed read-only, without touching either file');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9820, STALE_TABLE, REAL_TABLE);
  try {
    const r = runFinalize(ed, fx, project, ['--check']);
    assert(r.status !== 0, '2g: --check reports the non-ready state via a non-zero exit; got ' + r.status);
    assert(r.out && r.out.checks && r.out.checks.mirror === 'sync_failed',
      '2g: checks.mirror predicts sync_failed for a divergent pair; got ' + JSON.stringify(r.out && r.out.checks));
    assert(r.out && Array.isArray(r.out.reasons) && r.out.reasons.includes('mirror_sync_failed'),
      '2g: reasons includes mirror_sync_failed; got ' + JSON.stringify(r.out && r.out.reasons));

    const destBytes = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destBytes === REAL_TABLE, '2g: --check left the worktree record byte-unchanged (read-only)');
    const srcBytes = fs.readFileSync(path.join(fx.srcDir, 'mission-list.md'), 'utf8');
    assert(srcBytes === STALE_TABLE, '2g: --check left the main record byte-unchanged (read-only)');

    // And the SAME fixture, run for real right after, produces the SAME verdict (the prediction
    // was not a coincidence of a different code path).
    const real = runFinalize(ed, fx, project);
    assert(real.status !== 0 && real.out && real.out.reason === 'finalize_mirror_refused',
      '2g: the real finalize over the SAME still-untouched fixture reaches the SAME refusal --check '
      + 'predicted; got ' + JSON.stringify(real.out && { result: real.out.result, reason: real.out.reason }));
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// R1 (#1054 review, candidate 5743eb15): the mirror must not refuse its own prior write when the
// MAIN-side record legitimately advances after a successful mirror. Reproduces the review's own
// probe methodology exactly — calling the production `mirrorFinalizationArtifacts(root, project)`
// directly, twice, with a main-side content change in between — rather than driving two full
// `finalize` CLI runs, because the first CLI run archives the project (moving it out of the live
// tree), which would make a genuine second mirror call unreachable through the CLI at all.
//
// Design of record (team lead, for the implementer, pinned here as the observable contract): the
// mirror writes `.cache/mirror-digest.json` into the DEST project folder, mapping the mirrored
// basename to the sha256 of the bytes it copied. `mirrorDigestPath` and `readMirrorDigest` below
// pin the receipt's LOCATION and SHAPE, not the code that produces it.
// ===========================================================================

function mirrorDigestPath(wtPath, project) {
  return path.join(wtPath, 'kaola-workflow', project, '.cache', 'mirror-digest.json');
}
function readMirrorDigest(wtPath, project) {
  try { return JSON.parse(fs.readFileSync(mirrorDigestPath(wtPath, project), 'utf8')); } catch (_) { return null; }
}

// Advance a mission-list text the way a legitimate main-side edit would — the guard treats content
// as opaque text (no parser, no schema), so any byte change stands in for a real one.
function advanced(text) {
  return text + '\n<!-- R1 fixture: main advanced after the prior mirror -->\n';
}

// ===========================================================================
// (a) after a successful mirror, a main-side advance with an UNTOUCHED worktree copy mirrors again
// — safe, and the copy proceeds — on all four editions.
// ===========================================================================
for (const ed of EDITIONS) {
  console.log('R1a: ' + ed.label + ' — main advances after a successful mirror; the next mirror must not refuse');
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9830, REAL_TABLE, null);
  try {
    const claim = require(path.join(repoRoot, ed.claim));
    // PASS 1 — first sync. Real production call, not a simulation of one.
    const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass1.refused, 'R1a: ' + ed.label + ' — pass 1 (first sync) must not refuse; got '
      + JSON.stringify(pass1));
    const destAfter1 = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destAfter1 === REAL_TABLE,
      'R1a: ' + ed.label + ' — pass 1 must have actually copied the source down; got different content');

    // The main-side advance. The worktree copy is left byte-for-byte what pass 1 wrote.
    const v2 = advanced(REAL_TABLE);
    fs.writeFileSync(path.join(fx.srcDir, 'mission-list.md'), v2);

    // PASS 2 — the case R1 measured as a false refusal at 5743eb15.
    const pass2 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass2.refused,
      'R1a: ' + ed.label + ' — pass 2 (main advanced, worktree untouched since pass 1) must NOT '
      + 'refuse mirror_sync_failed; got ' + JSON.stringify(pass2));
    const destAfter2 = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destAfter2 === v2,
      'R1a: ' + ed.label + ' — pass 2 must actually copy the advanced source down (the mirror '
      + 'proceeds, it does not merely decline to refuse); got '
      + (destAfter2 === REAL_TABLE ? 'the STALE pass-1 content (copy silently skipped)' : 'neither'));

    // The receipt: written by the mirror itself, in the DEST project folder's .cache, mapping the
    // mirrored basename to the sha256 of what it just copied (v2's bytes, after pass 2).
    const digest = readMirrorDigest(fx.wtPath, project);
    assert(digest !== null,
      'R1a: ' + ed.label + ' — ' + mirrorDigestPath(fx.wtPath, project) + ' must exist after a '
      + 'successful mirror');
    assert(digest && digest['mission-list.md'] === sha256(v2),
      'R1a: ' + ed.label + ' — the receipt must map mission-list.md to the sha256 of the bytes the '
      + 'mirror just copied (' + sha256(v2) + '); got ' + JSON.stringify(digest));
  } finally { destroyFixture(fx); }
}

// ===========================================================================
// (b) a worktree copy edited independently after a successful mirror — even by one byte — still
// refuses content_diverged. The receipt existing is not enough; its recorded digest has to match
// dest's CURRENT bytes.
// ===========================================================================
(function worktreeEditedIndependentlyStillRefuses() {
  console.log('R1b: a worktree copy hand-edited after the mirror still refuses content_diverged');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9831, REAL_TABLE, null);
  try {
    const claim = require(path.join(repoRoot, ed.claim));
    const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass1.refused, 'R1b: pass 1 (first sync) must not refuse; got ' + JSON.stringify(pass1));
    assert(readMirrorDigest(fx.wtPath, project) !== null, 'R1b: pass 1 must have written the receipt');

    // The worktree copy is edited independently — ONE byte — after the mirror wrote it.
    const destPath = path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md');
    const editedByOneByte = REAL_TABLE + '.';
    fs.writeFileSync(destPath, editedByOneByte);

    // Main also advances, exactly as in R1a — the ordinary trigger for the new safe arm.
    const v2 = advanced(REAL_TABLE);
    fs.writeFileSync(path.join(fx.srcDir, 'mission-list.md'), v2);

    const pass2 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(pass2.refused === true && pass2.inner_reason === 'mirror_sync_failed',
      'R1b: a worktree copy that no longer matches the mirror\'s own receipt must refuse '
      + 'mirror_sync_failed, receipt or no receipt; got ' + JSON.stringify(pass2));
    const destUnchanged = fs.readFileSync(destPath, 'utf8');
    assert(destUnchanged === editedByOneByte,
      'R1b: zero-write on refusal — the hand-edited worktree copy must be untouched');
    const srcUnchanged = fs.readFileSync(path.join(fx.srcDir, 'mission-list.md'), 'utf8');
    assert(srcUnchanged === v2, 'R1b: zero-write on refusal — the main copy must be untouched');
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// (c) REGRESSION CONTROL — first_sync and identical-unchanged still behave exactly as before,
// driven the SAME way (direct mirrorFinalizationArtifacts calls) as the new legs above, so a
// regression introduced by the R1 change lands on the same call path this file now exercises twice.
// ===========================================================================
(function firstSyncAndIdenticalStillWork() {
  console.log('R1c: first_sync and identical-repeat are unchanged by the R1 addition');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9832, REAL_TABLE, null);
  try {
    const claim = require(path.join(repoRoot, ed.claim));
    const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass1.refused, 'R1c: first sync must not refuse; got ' + JSON.stringify(pass1));

    // An immediate repeat with NOTHING changed on either side — the plain identical case, which
    // must still short-circuit to 'identical' and never depend on the new receipt at all.
    const pass2 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass2.refused, 'R1c: an untouched identical repeat must not refuse; got ' + JSON.stringify(pass2));
    const dest = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(dest === REAL_TABLE, 'R1c: the record is unchanged after the identical repeat');
  } finally { destroyFixture(fx); }
})();

// ===========================================================================
// (d) a MISSING or CORRUPT receipt falls back to today's behaviour — divergence refuses. The new
// safe arm is not a general "trust the worktree" relaxation; without a valid receipt matching
// dest's current bytes, the exact same main-advanced/worktree-untouched shape as R1a must refuse.
// ===========================================================================
(function missingOrCorruptReceiptFallsBackToRefusal() {
  console.log('R1d: a missing or corrupt mirror-digest.json falls back to refusing content_diverged');
  const ed = EDITIONS[0];

  // (d1) MISSING — pass 1 mirrors normally, the receipt is then deleted, main advances, worktree
  // is untouched (byte-identical to what R1a proves is otherwise SAFE). Without the receipt this
  // must refuse exactly as it did before R1 — the safety is not derivable any other way.
  {
    const project = nextProject();
    const fx = buildLinkedFixture(ed, project, 9833, REAL_TABLE, null);
    try {
      const claim = require(path.join(repoRoot, ed.claim));
      const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
      assert(!pass1.refused, 'R1d1: pass 1 (first sync) must not refuse; got ' + JSON.stringify(pass1));
      const digestFile = mirrorDigestPath(fx.wtPath, project);
      assert(fs.existsSync(digestFile), 'R1d1 precondition: the receipt must exist after pass 1');
      fs.rmSync(digestFile, { force: true });

      const v2 = advanced(REAL_TABLE);
      fs.writeFileSync(path.join(fx.srcDir, 'mission-list.md'), v2);

      const pass2 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
      assert(pass2.refused === true && pass2.inner_reason === 'mirror_sync_failed',
        'R1d1: a missing receipt must fall back to refusing mirror_sync_failed for a shape that '
        + 'would otherwise be safe — got ' + JSON.stringify(pass2));
      const destUnchanged = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
      assert(destUnchanged === REAL_TABLE, 'R1d1: zero-write on refusal — dest untouched');
    } finally { destroyFixture(fx); }
  }

  // (d2) CORRUPT — the receipt exists but is not parseable JSON. Same fallback: refuse, never throw
  // and never silently treat unparseable evidence as permission.
  {
    const project = nextProject();
    const fx = buildLinkedFixture(ed, project, 9834, REAL_TABLE, null);
    try {
      const claim = require(path.join(repoRoot, ed.claim));
      const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
      assert(!pass1.refused, 'R1d2: pass 1 (first sync) must not refuse; got ' + JSON.stringify(pass1));
      const digestFile = mirrorDigestPath(fx.wtPath, project);
      fs.writeFileSync(digestFile, '{ not valid json');

      const v2 = advanced(REAL_TABLE);
      fs.writeFileSync(path.join(fx.srcDir, 'mission-list.md'), v2);

      let pass2 = null;
      let threw = null;
      try {
        const claim2 = require(path.join(repoRoot, ed.claim));
        pass2 = claim2.mirrorFinalizationArtifacts(fx.wtPath, project);
      } catch (e) { threw = e; }
      assert(threw === null,
        'R1d2: a corrupt receipt must degrade to a refusal, never throw out of the transaction; got '
        + (threw && threw.message));
      assert(pass2 && pass2.refused === true && pass2.inner_reason === 'mirror_sync_failed',
        'R1d2: a corrupt (unparseable) receipt must fall back to refusing mirror_sync_failed; got '
        + JSON.stringify(pass2));
    } finally { destroyFixture(fx); }
  }
})();

// ===========================================================================
// R1-follow-up (#1054 review, candidate 5743eb15, docs-agent gap): `finalize --check` is the
// READ-ONLY twin of the transaction's own Step-8a mirror (`probeFinalizeMirror`, `evaluateFinalize
// Preconditions`), and its own doc comment says its prediction "must agree with what the transaction
// will actually do." R1a already proves the real transaction now accepts a main-advanced /
// worktree-untouched pair as safe (`prior_mirror`). `--check` must predict that SAME verdict — not
// the pre-R1 `sync_failed` the ordinary content-diverged branch would still produce without also
// consulting the mirror's own receipt.
// ===========================================================================

// ---------------------------------------------------------------------------
// (e) after a real mirror + a main-side advance with an UNTOUCHED worktree copy, `finalize --check`
// must NOT predict `sync_failed` / `mirror_sync_failed` — on all four editions — and must remain
// read-only (neither record file nor the receipt itself is touched by the prediction).
// ---------------------------------------------------------------------------
for (const ed of EDITIONS) {
  console.log('R1e: ' + ed.label + ' — --check must not predict sync_failed for a prior_mirror-safe pair');
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9840, REAL_TABLE, null);
  try {
    const claim = require(path.join(repoRoot, ed.claim));
    const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass1.refused, 'R1e: ' + ed.label + ' — pass 1 (first sync) must not refuse; got ' + JSON.stringify(pass1));
    const digestBefore = fs.readFileSync(mirrorDigestPath(fx.wtPath, project), 'utf8');

    // Main advances; the worktree copy is left byte-for-byte what pass 1 wrote — the exact shape
    // R1a proves the real transaction now accepts.
    const v2 = advanced(REAL_TABLE);
    fs.writeFileSync(path.join(fx.srcDir, 'mission-list.md'), v2);

    const r = runFinalize(ed, fx, project, ['--check']);
    assert(r.out && r.out.checks && r.out.checks.mirror === 'ready',
      'R1e: ' + ed.label + ' — checks.mirror must predict "ready" (the mirror will proceed safely), '
      + 'not sync_failed, for a main-advanced/worktree-untouched pair; got '
      + JSON.stringify(r.out && r.out.checks));
    assert(r.out && Array.isArray(r.out.reasons) && !r.out.reasons.includes('mirror_sync_failed'),
      'R1e: ' + ed.label + ' — reasons must NOT include mirror_sync_failed for this pair; got '
      + JSON.stringify(r.out && r.out.reasons));

    // Read-only: --check never copies, and never rewrites the receipt it just consulted.
    const destBytes = fs.readFileSync(path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md'), 'utf8');
    assert(destBytes === REAL_TABLE, 'R1e: ' + ed.label + ' — --check left the worktree record byte-unchanged');
    const srcBytes = fs.readFileSync(path.join(fx.srcDir, 'mission-list.md'), 'utf8');
    assert(srcBytes === v2, 'R1e: ' + ed.label + ' — --check left the main record byte-unchanged');
    const digestAfter = fs.readFileSync(mirrorDigestPath(fx.wtPath, project), 'utf8');
    assert(digestAfter === digestBefore, 'R1e: ' + ed.label + ' — --check left the mirror receipt byte-unchanged');
  } finally { destroyFixture(fx); }
}

// ---------------------------------------------------------------------------
// (f) with an independently edited worktree copy (the receipt no longer matches dest's CURRENT
// bytes), `--check` still predicts the refusal — the receipt alone is not a blanket "trust the
// worktree" relaxation for the prediction either, mirroring R1b's real-transaction assertion.
// ---------------------------------------------------------------------------
(function checkStillPredictsRefusalWhenWorktreeEditedIndependently() {
  console.log('R1f: --check still predicts mirror_sync_failed when the worktree copy was hand-edited');
  const ed = EDITIONS[0];
  const project = nextProject();
  const fx = buildLinkedFixture(ed, project, 9841, REAL_TABLE, null);
  try {
    const claim = require(path.join(repoRoot, ed.claim));
    const pass1 = claim.mirrorFinalizationArtifacts(fx.wtPath, project);
    assert(!pass1.refused, 'R1f: pass 1 (first sync) must not refuse; got ' + JSON.stringify(pass1));

    const destPath = path.join(fx.wtPath, 'kaola-workflow', project, 'mission-list.md');
    const editedByOneByte = REAL_TABLE + '.';
    fs.writeFileSync(destPath, editedByOneByte);

    const v2 = advanced(REAL_TABLE);
    fs.writeFileSync(path.join(fx.srcDir, 'mission-list.md'), v2);

    const r = runFinalize(ed, fx, project, ['--check']);
    assert(r.out && r.out.checks && r.out.checks.mirror === 'sync_failed',
      'R1f: checks.mirror must still predict sync_failed once the worktree copy no longer matches '
      + 'the receipt; got ' + JSON.stringify(r.out && r.out.checks));
    assert(r.out && Array.isArray(r.out.reasons) && r.out.reasons.includes('mirror_sync_failed'),
      'R1f: reasons must still include mirror_sync_failed; got ' + JSON.stringify(r.out && r.out.reasons));

    const destUnchanged = fs.readFileSync(destPath, 'utf8');
    assert(destUnchanged === editedByOneByte, 'R1f: --check left the hand-edited worktree record byte-unchanged');
    const srcUnchanged = fs.readFileSync(path.join(fx.srcDir, 'mission-list.md'), 'utf8');
    assert(srcUnchanged === v2, 'R1f: --check left the main record byte-unchanged');
  } finally { destroyFixture(fx); }
})();

// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('test-issue-1054-ledger-guard.js FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('test-issue-1054-ledger-guard.js passed (' + passed + ' assertions)');
}
