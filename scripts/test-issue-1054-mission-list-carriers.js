#!/usr/bin/env node
'use strict';

// test-issue-1054-mission-list-carriers.js — acceptance oracle for issue #1054, PART 1: finalize
// stops parsing/counting the Mission List.
//
// Authority: `gh issue view 1054` (rewritten body, 2026-09-09) and the 09:01Z owner-approved
// correction comment, which WITHDRAW the earlier "teach the readers a second carrier" remedy.
// The Mission List is the Main Orchestrator's raw coordination record: four field MEANINGS
// (item/status/dispatched/result) and three write moments are fixed (ADR 0017); the LAYOUT is
// not, and a script that counts missions cannot prove completion. New scope for finalize:
//   1. No auto `## Mission List` statistics in finalization-summary.md (no `items: N`, no
//      contradiction line), and no `mission_list` measurement on the finalize envelope.
//   2. Layout independence — a real 7-row table, a line-form list, and an unfamiliar layout all
//      finalize identically (no count, no flagged-line list, no error, no "unrecognized"
//      complaint) and the H1 goal still reaches `goal_declared` (parseGoal/computeGoalDeclaration
//      stay in scope and keep working).
//   3. `probeMissionListCoherence` and `persistMissionListToSummary` are absent — by symbol and by
//      behavior — from every claim.js tree (canonical, Codex, GitLab, Gitea).
//   4. A hand-written `## Mission List` section survives untouched (the existing fill-if-empty
//      rule for OTHER script-owned headings is unaffected).
//
// TEST INFRASTRUCTURE ONLY. Nothing here is shipped, installed, or imported by a production
// script. PUBLIC PATH: the real `finalize` CLI, spawned exactly as scripts/test-finalize-door.js's
// T17 and scripts/test-forge-finalize-findings.js drive it — a real git fixture repo, offline
// (`KAOLA_WORKFLOW_OFFLINE=1`, no gh mock needed), a pre-seeded `.cache/final-validation.md` so
// the validation gate passes without running real chains, and the real `finalization-summary.md`
// the transaction writes. No mock of the reader under test.
//
// Usage
//   node scripts/test-issue-1054-mission-list-carriers.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

const repoRoot = path.resolve(__dirname, '..');
const fixturesDir = path.join(__dirname, 'fixtures', 'issue-1054');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; return; }
  failed++;
  console.error('FAIL: ' + msg);
}

// The four claim.js trees, same shape scripts/test-forge-finalize-findings.js uses to reach them.
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

function rm(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} }

// Same construction as test-finalize-door.js's T17 runLeg: a "main resident" self-host-shaped
// fixture (no linked worktree — finalize's simplest, most-exercised shape), CONSUMER repo kind
// (no package.json declaring chains) so the validation gate takes the `final-validation.md` arm
// instead of running real chains, per scripts/test-forge-finalize-findings.js's buildFixture.
function buildRepo(ed, project, issueNumber, missionListText) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1054-p1-' + ed.key + '-'));
  G.init(repo, { branch: 'main' });
  fs.writeFileSync(path.join(repo, 'README.md'), '# fixture\n');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'src', 'app.js'), 'module.exports = 1;\n');
  G.commitAll(repo, 'init');
  G.checkout(repo, 'workflow/' + project, { create: true });
  fs.writeFileSync(path.join(repo, 'src', 'orphan.js'), 'module.exports = "orphan";\n');
  G.commitAll(repo, 'work no record describes');

  const dir = path.join(repo, 'kaola-workflow', project);
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
  ].concat(ed.stateForgeSection, [
    '## Current Position', 'phase: adaptive', 'phase_name: Adaptive', 'workflow_path: adaptive',
    'runtime: claude', 'step: complete', 'next_command: /kaola-workflow-finalize ' + project,
    'main_session_role: orchestrator', '',
    '## Sink', 'branch: workflow/' + project, 'issue_number: ' + issueNumber, 'sink: merge',
    'run_posture: in-place', '',
  ]).join('\n'));
  fs.writeFileSync(path.join(dir, 'mission-list.md'), missionListText);

  const schema = require(path.join(repoRoot, ed.schema));
  let hash = '';
  try { hash = schema.computeCodeTreeHash(repo, project, schema.VALIDATION_TEST_CONSUMES) || ''; } catch (_) { hash = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + hash + '\n');
  return { repo, dir };
}

function runFinalize(ed, repo, project) {
  const r = spawnSync(process.execPath,
    [path.join(repoRoot, ed.claim), 'finalize', '--project', project, '--base', 'main'],
    { cwd: repo, encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' }) });
  const lines = String(r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  let out = null;
  if (lines.length) { try { out = JSON.parse(lines[lines.length - 1]); } catch (_) { /* keep null */ } }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, out };
}

function readSummary(repo, project, dest) {
  const candidates = [];
  if (dest) candidates.push(path.join(dest, 'finalization-summary.md'));
  candidates.push(path.join(repo, 'kaola-workflow', project, 'finalization-summary.md'));
  const archiveBase = path.join(repo, 'kaola-workflow', 'archive');
  try { for (const name of fs.readdirSync(archiveBase)) candidates.push(path.join(archiveBase, name, 'finalization-summary.md')); }
  catch (_) { /* no archive dir */ }
  for (const p of candidates) { try { return fs.readFileSync(p, 'utf8'); } catch (_) { /* next */ } }
  return null;
}
function sectionBody(text, heading) {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex(l => l.trim() === heading);
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) { if (/^##\s/.test(lines[i])) break; out.push(lines[i]); }
  return out.join('\n');
}

let uniq = 0;
function runOneLayout(ed, layoutName, missionListText) {
  uniq++;
  const project = 'issue-99' + uniq;
  const { repo } = buildRepo(ed, project, 9900 + uniq, missionListText);
  try {
    const r = runFinalize(ed, repo, project);
    assert(r.status === 0, ed.label + '/' + layoutName + ': finalize exits 0; got ' + r.status
      + '\nstderr: ' + String(r.stderr || '').slice(0, 500));
    assert(r.out !== null, ed.label + '/' + layoutName + ': envelope parses as JSON');
    return { r, repo, project };
  } finally { /* caller removes repo after assertions that need it */ }
}

// ===========================================================================
// PART 1a — no auto Mission List statistics, on every layout, on every claim.js tree.
// ===========================================================================
const REAL_TABLE = fs.readFileSync(path.join(fixturesDir, 'bundle-1053-mission-list.md'), 'utf8');
const LINE_FORM = [
  '# goal: line-form equivalent record', '',
  '- item: investigate the timeout', '  status: done', '  result: notes/1.md',
  '- item: patch the retry loop', '  status: in-flight', '  dispatched: self',
  ''
].join('\n');
const UNFAMILIAR_LAYOUT = [
  '# goal: unfamiliar numbered-bold layout', '',
  '1. **Investigate the timeout** — done, see notes/1.md',
  '2. **Patch the retry loop** — in progress, dispatched to self',
  ''
].join('\n');
const LAYOUTS = [['table', REAL_TABLE], ['line-form', LINE_FORM], ['unfamiliar', UNFAMILIAR_LAYOUT]];

for (const ed of EDITIONS) {
  for (const [layoutName, text] of LAYOUTS) {
    console.log('1a: ' + ed.label + '/' + layoutName + ' — no auto Mission List statistics');
    const { r, repo, project } = runOneLayout(ed, layoutName, text);
    try {
      assert(!r.out || !('mission_list' in r.out),
        ed.label + '/' + layoutName + ': the finalize envelope carries no `mission_list` measurement; got '
        + JSON.stringify(r.out && r.out.mission_list));
      const summary = readSummary(repo, project, r.out && r.out.dest);
      assert(summary !== null, ed.label + '/' + layoutName + ': finalization-summary.md exists');
      if (summary !== null) {
        assert(!/^items:\s*\d+/m.test(summary),
          ed.label + '/' + layoutName + ': no `items: N` line in the durable summary; got summary containing '
          + JSON.stringify((summary.match(/^items:.*$/m) || [null])[0]));
        assert(!/carrying an outcome while their status is not/i.test(summary),
          ed.label + '/' + layoutName + ': no contradiction-count line in the durable summary');
        assert(!/unrecognized|could not (read|parse)|unsupported format/i.test(summary),
          ed.label + '/' + layoutName + ': no "unrecognized/unsupported format" complaint in the summary');
        // Layout independence: the H1 goal is still read (parseGoal/computeGoalDeclaration are
        // NOT retired) regardless of what the rest of the file looks like.
        const goalDeclared = r.out && r.out.closure_receipt && r.out.closure_receipt.goal_declared;
        assert(goalDeclared === true,
          ed.label + '/' + layoutName + ': `closure_receipt.goal_declared` stays true — the H1 goal '
          + 'line is still read regardless of the rest of the file\'s layout; got ' + JSON.stringify(goalDeclared));
      }
    } finally { rm(repo); }
  }
}

// ===========================================================================
// PART 1b — a hand-written `## Mission List` section survives untouched.
// ===========================================================================
(function handWrittenSurvives() {
  console.log('1b: an orchestrator-authored `## Mission List` section survives untouched');
  const ed = EDITIONS[0];
  const project = 'issue-hw1';
  const { repo, dir } = buildRepo(ed, project, 9950, REAL_TABLE);
  const HAND_WRITTEN = 'All seven missions landed; verified by reading the record directly, no '
    + 'automated count taken. — orchestrator';
  const planted = [
    '# Finalization — Summary: ' + project, '',
    '## Delivered', '', '## Files Changed', '', '## Test Coverage', '',
    '## Validation', '', '## Changed Paths', '',
    '## Mission List', '', HAND_WRITTEN, '',
    '## Documentation Docking', '', '## Run gaps', '', '## Follow-Up Items', '',
    '## Status: READY FOR FINAL GIT GATE', ''
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'finalization-summary.md'), planted);
  try {
    const r = runFinalize(ed, repo, project);
    assert(r.status === 0, '1b: finalize exits 0; got ' + r.status + '\nstderr: ' + String(r.stderr || '').slice(0, 500));
    const summary = readSummary(repo, project, r.out && r.out.dest);
    assert(summary !== null, '1b: finalization-summary.md exists');
    if (summary !== null) {
      const body = sectionBody(summary, '## Mission List');
      assert(body !== null && body.trim() === HAND_WRITTEN,
        '1b: the hand-written `## Mission List` prose is left exactly as written, never replaced '
        + 'or appended to; got ' + JSON.stringify(body));
      assert((summary.split('\n').filter(l => l.trim() === '## Mission List')).length === 1,
        '1b: `## Mission List` occurs exactly once — no second copy appended');
    }
  } finally { rm(repo); }
})();

// ===========================================================================
// PART 1c — probeMissionListCoherence / persistMissionListToSummary are absent, by symbol AND by
// behavior, from every claim.js tree. Scoped to those two names only — "Mission List" prose
// elsewhere (comments, docs, ADR references) is untouched by this pin.
// ===========================================================================
for (const ed of EDITIONS) {
  console.log('1c: ' + ed.label + ' — probeMissionListCoherence/persistMissionListToSummary absent');
  const file = path.join(repoRoot, ed.claim);
  const text = fs.readFileSync(file, 'utf8');
  assert(!/\bprobeMissionListCoherence\b/.test(text),
    '1c: ' + ed.label + ': `probeMissionListCoherence` does not appear anywhere in ' + ed.claim);
  assert(!/\bpersistMissionListToSummary\b/.test(text),
    '1c: ' + ed.label + ': `persistMissionListToSummary` does not appear anywhere in ' + ed.claim);
  let mod = null;
  try { mod = require(file); } catch (_) { /* ignore */ }
  assert(mod === null || typeof mod.probeMissionListCoherence === 'undefined',
    '1c: ' + ed.label + ': not exported either');
  assert(mod === null || typeof mod.persistMissionListToSummary === 'undefined',
    '1c: ' + ed.label + ': not exported either');
}

// ---------------------------------------------------------------------------
if (failed > 0) {
  console.error('test-issue-1054-mission-list-carriers.js FAILED (' + failed + ' failures, ' + passed + ' passed)');
  process.exitCode = 1;
} else {
  console.log('test-issue-1054-mission-list-carriers.js passed (' + passed + ' assertions)');
}
