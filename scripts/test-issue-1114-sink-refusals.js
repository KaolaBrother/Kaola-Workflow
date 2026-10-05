#!/usr/bin/env node
'use strict';

// #1114 item 3 — regression lock for the sink's fail-closed publication refusals.
// These are CORRECT refusals, locked as-is: a force push or an automatic overwrite
// is a repair, not something this suite should ever ask for. The locks:
//   (a)  OFFLINE + a diverged candidate refuses at push_main; the local default
//        branch and the remote never move. Negative control: the same seed with a
//        NON-diverged candidate publishes locally — divergence is the only axis.
//   (b)  ONLINE + a static remote and a non-descendant candidate reports
//        non_fast_forward after a REAL git rejection; never a --force. Negative
//        control: the same plain push publishes when it IS a fast-forward.
//   (c)  An OFFLINE push_main success is a LOCAL fast-forward only — nothing
//        reaches the remote — and the envelope reports publication 'unknown'.
//   (d)  archive_commit ordering and resume semantics: a receipt with
//        archive_commit pre-marked done proves NOTHING about the step being
//        skipped — a done mark is trusted, not re-run — while a fresh run really
//        does execute archive_commit before push_main.
// Every git call routes through scripts/test-git-fixture.js; the only direct
// spawn is the sink CLI itself, which is the cli-contract under test.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const G = require('./test-git-fixture');

const repoRoot = path.resolve(__dirname, '..');
const SINK_STEPS_EXPECTED = ['preflight', 'push_upstream', 'merge', 'finalize',
  'stash_restore', 'archive_commit', 'push_main', 'closure'];

const EDITIONS = [
  ['root', path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js'), 'KAOLA_GH_MOCK_SCRIPT'],
  ['codex', path.join(repoRoot, 'plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-sink-merge.js'), 'KAOLA_GH_MOCK_SCRIPT'],
  ['gitlab', path.join(repoRoot, 'plugins', 'kaola-workflow-gitlab', 'scripts', 'kaola-gitlab-workflow-sink-merge.js'), 'KAOLA_GLAB_MOCK_SCRIPT'],
  ['gitea', path.join(repoRoot, 'plugins', 'kaola-workflow-gitea', 'scripts', 'kaola-gitea-workflow-sink-merge.js'), 'KAOLA_TEA_MOCK_SCRIPT'],
];

// --------------------------------------------------------------------------- helpers

function write(base, rel, text) {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function lastJson(result) {
  const ls = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!ls.length) return null;
  try { return JSON.parse(ls[ls.length - 1]); } catch (_) { return null; }
}

// The stateful gh mock, borrowed verbatim in spirit from test-sink-merge.js: a
// `issue view` answers from the close/reopen log, every mutating call is logged,
// and the cwd check keeps the mock honest the way real gh is.
function writeGhMock(binDir, logFile) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, 'gh.js'), [
    "'use strict';",
    'const fs = require("fs");',
    'const path = require("path");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + JSON.stringify(logFile) + ';',
    'function log(m){ try { fs.appendFileSync(logFile, m + "\\n"); } catch(_){} }',
    'let d = process.cwd(); let inRepo = false;',
    'for (;;) { if (fs.existsSync(path.join(d, ".git"))) { inRepo = true; break; } const p = path.dirname(d); if (p === d) break; d = p; }',
    'if (!inRepo) { log("REJECTED-wrong-cwd:" + process.cwd() + " args=" + a); process.stderr.write("gh: could not determine base repo, use --repo (cwd not a git repository)\\n"); process.exit(1); }',
    'function lines(){ try { return fs.readFileSync(logFile,"utf8").split("\\n"); } catch(_){ return []; } }',
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({owner:{login:"t"},name:"r"})+"\\n"); process.exit(0); }',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1]; const ls = lines();',
    '  let closed = false;',
    '  for (const l of ls) { if (l === "close:"+n) closed = true; else if (l === "reopen:"+n) closed = false; }',
    '  process.stdout.write((closed ? "closed" : "open") + "\\n"); process.exit(0);',
    '}',
    'const closeM = a.match(/issue close (\\d+)/);',
    'if (closeM) { log("close:"+closeM[1]); process.stdout.write("\\n"); process.exit(0); }',
    'const reopenM = a.match(/issue reopen (\\d+)/);',
    'if (reopenM) { log("reopen:"+reopenM[1]); process.stdout.write("\\n"); process.exit(0); }',
    'const commentM = a.match(/issue comment (\\d+)/);',
    'if (commentM) { log("comment:"+commentM[1]); process.exit(0); }',
    'process.stdout.write("\\n"); process.exit(0);',
  ].join('\n'));
}

// A live-project workflow-state.md (## Sink block with a claim_ts), written on the
// feature branch — the sole-archiver shape the sink then archives itself.
function liveState(project, issue, claimTs) {
  return [
    '# Kaola-Workflow State', '',
    '## Project', 'name: ' + project, 'status: active', '',
    '## Current Position', 'phase: adaptive', 'runtime: claude', 'step: start', '',
    '## Last Updated', new Date().toISOString(), '',
    '## Sink',
    'branch: workflow/' + project,
    'issue_number: ' + issue,
    'sink: merge',
    'run_posture: in-place',
    'main_root: (test)',
    'session_marker: test-session',
    'claim_ts: ' + claimTs,
  ].join('\n') + '\n';
}

function roadmapSource(issue) {
  return ['issue: #' + issue, 'title: Test issue ' + issue, 'status: active',
    'workflow_project: sink-test', 'next_step: TBD'].join('\n') + '\n';
}

function roadmapMirror(issues) {
  let c = '# Kaola-Workflow Roadmap\n\n| Issue | Title | Status | Project | Next Step |\n|---|---|---|---|---|\n';
  for (const n of issues) c += '| #' + n + ' | Test issue ' + n + ' | active | sink-test | TBD |\n';
  return c;
}

function commitAll(repo, message) {
  G.gitOk(repo, ['add', '-A']);
  G.gitOk(repo, ['commit', '-m', message]);
  return G.head(repo);
}

// The ONE spawn site in this file: the sink CLI under test. Every property this
// suite measures lives at this boundary — the process's own exit code, its
// emitted envelope, its stderr, and the repository state it leaves behind.
function runSinkCli(script, cwd, extraArgs, extraEnv) {
  // spawn-class: cli-contract
  return spawnSync(process.execPath,
    [script, '--sink', '--json'].concat(extraArgs || []),
    {
      cwd: cwd, encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, process.env, extraEnv || {}),
    });
}

function sinkEnv(mockEnvName, binDir, offline, extraEnv) {
  const mock = path.join(binDir, 'gh.js');
  return Object.assign({}, process.env, {
    KAOLA_WORKFLOW_SKIP_TESTGATE: '1',
    KAOLA_WORKFLOW_OFFLINE: offline ? '1' : '0',
    KAOLA_GH_MOCK_SCRIPT: mock,
    KAOLA_GLAB_MOCK_SCRIPT: mock,
    KAOLA_TEA_MOCK_SCRIPT: mock,
  }, mockEnvName ? { [mockEnvName]: mock } : {}, extraEnv || {});
}

// ---------------------------------------------------------------------------
// The KPR seed (observed reproduction): a bare remote carrying m1+m2 on main, a
// clone whose local main sits at m2, a feature branch, a minimal live run folder,
// and a receipt pre-marked 'done' on every step before push_main.
//   diverged=true  — feature branched off m1, main advanced to m2 afterwards
//                    (candidate_base m1 offline / m2 online).
//   diverged=false — feature branched off m2, so local main IS an ancestor of the
//                    candidate (the negative-control shape).
function buildKprSeed(parent, name, opts) {
  const diverged = opts.diverged;
  const mode = opts.mode || 'offline';
  const project = 'i260t3';
  const issue = '900261';
  const branch = 'workflow/issue-' + issue;
  const bare = path.join(parent, name + '-origin.git');
  const repo = path.join(parent, name);
  const r = G.raw(['init', '--bare', '-b', 'main', bare]);
  if (r.status !== 0) throw new Error('init --bare failed: ' + r.stderr);
  const c = G.clone(bare, repo);
  if (c.status !== 0) throw new Error('clone failed: ' + c.stderr);
  G.git(repo, ['config', 'user.email', 'test@example.com']);
  G.git(repo, ['config', 'user.name', 'Test User']);

  fs.writeFileSync(path.join(repo, 'README.md'), name + '\n');
  const m1 = commitAll(repo, 'm1');
  G.gitOk(repo, ['push', 'origin', 'main']);

  let feature;
  let m2;
  if (diverged) {
    G.gitOk(repo, ['checkout', '-b', branch]);
    fs.writeFileSync(path.join(repo, 'feature.txt'), 'feature\n');
    feature = commitAll(repo, 'feature');
    G.gitOk(repo, ['checkout', 'main']);
    fs.writeFileSync(path.join(repo, 'external.txt'), 'external fast-forward\n');
    m2 = commitAll(repo, 'external fast-forward');
    G.gitOk(repo, ['push', 'origin', 'main']);
  } else {
    fs.writeFileSync(path.join(repo, 'external.txt'), 'external fast-forward\n');
    m2 = commitAll(repo, 'external fast-forward');
    G.gitOk(repo, ['push', 'origin', 'main']);
    G.gitOk(repo, ['checkout', '-b', branch]);
    fs.writeFileSync(path.join(repo, 'feature.txt'), 'feature\n');
    feature = commitAll(repo, 'feature');
    G.gitOk(repo, ['checkout', 'main']);
  }

  const claimTs = '2026-10-05T03:00:00.000Z';
  write(repo, 'kaola-workflow/' + project + '/workflow-state.md', [
    'name: ' + project,
    'claim_ts: ' + claimTs,
    'status: active',
    'issue_number: ' + issue,
    'branch: ' + branch,
  ].join('\n') + '\n');
  const steps = {};
  for (const s of SINK_STEPS_EXPECTED) {
    steps[s] = (s === 'push_main' || s === 'closure') ? 'pending' : 'done';
  }
  write(repo, 'kaola-workflow/' + project + '/.cache/sink-receipt.json', JSON.stringify({
    project: project,
    branch: branch,
    issue_number: Number(issue),
    claim_ts: claimTs,
    branch_head: feature,
    candidate_head: feature,
    candidate_base: diverged ? (mode === 'online' ? m2 : m1) : m2,
    resolved_default_branch: 'main',
    archive_dest: 'kaola-workflow/archive/' + project,
    steps: steps,
  }, null, 2));

  return {
    repo, bare, project, issue, branch,
    m1, m2, feature,
    mainBefore: G.out(repo, ['rev-parse', 'main']),
    remoteBefore: G.out(bare, ['rev-parse', 'main']),
    liveReceipt: path.join(repo, 'kaola-workflow', project, '.cache', 'sink-receipt.json'),
  };
}

// A sole-archiver fixture (noPriorArchive): main carries the roadmap source +
// mirror; the feature branch carries the live folder + a deliverable. The sink
// archives the live folder itself and lands it at the plain archive path.
function buildSoleArchiverFixture(parent, name, project, issue) {
  const bare = path.join(parent, name + '-origin.git');
  const repo = path.join(parent, name);
  const branch = 'workflow/' + project;
  const r = G.raw(['init', '--bare', '-b', 'main', bare]);
  if (r.status !== 0) throw new Error('init --bare failed: ' + r.stderr);
  const c = G.clone(bare, repo);
  if (c.status !== 0) throw new Error('clone failed: ' + c.stderr);
  G.git(repo, ['config', 'user.email', 'test@example.com']);
  G.git(repo, ['config', 'user.name', 'Test User']);

  fs.writeFileSync(path.join(repo, 'README.md'), name + '\n');
  write(repo, 'kaola-workflow/.roadmap/issue-' + issue + '.md', roadmapSource(issue));
  write(repo, 'kaola-workflow/ROADMAP.md', roadmapMirror([issue]));
  commitAll(repo, 'init');
  G.gitOk(repo, ['push', 'origin', 'main']);

  G.gitOk(repo, ['checkout', '-b', branch]);
  write(repo, 'kaola-workflow/' + project + '/workflow-state.md',
    liveState(project, issue, new Date().toISOString()));
  write(repo, 'kaola-workflow/' + project + '/finalization-summary.md',
    '# Finalization Summary\n\nREADY FOR FINAL GIT GATE\n');
  fs.writeFileSync(path.join(repo, 'DELIVERABLE.txt'), 'deliverable\n');
  commitAll(repo, 'feat: deliverable + live state');
  G.gitOk(repo, ['push', '-u', 'origin', branch]);
  G.gitOk(repo, ['checkout', 'main']);

  return {
    repo, bare, project, issue: String(issue), branch,
    mainBefore: G.out(repo, ['rev-parse', 'main']),
    remoteBefore: G.out(bare, ['rev-parse', 'main']),
  };
}

// Where the transaction's receipt lives after finalize has archived the live
// folder. The merge stage can leave a STALE receipt copy under the plain archive
// path while the authoritative one moves to the actual archive dest (possibly a
// collision-suffixed <project>.archived-<ts>/), so candidates are ranked by the
// count of steps marked done — the live receipt is the furthest advanced.
function findReceiptFile(repo, project) {
  const candidates = [
    path.join(repo, 'kaola-workflow', project, '.cache', 'sink-receipt.json'),
  ];
  const archiveRoot = path.join(repo, 'kaola-workflow', 'archive');
  try {
    for (const entry of fs.readdirSync(archiveRoot).sort()) {
      if (entry !== project && !entry.startsWith(project + '.')) continue;
      candidates.push(path.join(archiveRoot, entry, '.cache', 'sink-receipt.json'));
    }
  } catch (_) {}
  let best = null;
  let bestDone = -1;
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let steps = {};
    try { steps = JSON.parse(fs.readFileSync(p, 'utf8')).steps || {}; } catch (_) {}
    const done = Object.keys(steps).filter(k => steps[k] === 'done').length;
    if (done > bestDone) { best = p; bestDone = done; }
  }
  return best;
}

function isAncestor(repo, sha, ref) {
  return G.git(repo, ['merge-base', '--is-ancestor', sha, ref]).status === 0;
}

function blobExists(repo, refPath) {
  return G.git(repo, ['cat-file', '-e', refPath]).status === 0;
}

// --------------------------------------------------------------------------- suite

function runEdition(label, script, mockEnvName, sinkOverride) {
  let checks = 0;
  let failures = 0;
  function check(ok, msg) {
    checks++;
    if (!ok) { failures++; console.error('FAIL [' + label + ']: ' + msg); }
  }
  function section(name, fn) {
    try { fn(); }
    catch (error) { check(false, name + ' threw: ' + (error && error.stack || error)); }
  }
  const sink = sinkOverride || script;
  const mkTmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-1114sr-')));

  // (c)'s run-1 record is re-read by (d3) — its fixture stays on disk until (d3)
  // has asserted against it, then is removed there.
  let cRun1 = null;

  // --- (a) OFFLINE diverged candidate refused at push_main --------------------
  section('a/offline-diverged-refused', () => {
    const tmp = mkTmp();
    try {
      const binDir = path.join(tmp, 'bin');
      writeGhMock(binDir, path.join(binDir, 'gh-calls.log'));
      const seed = buildKprSeed(tmp, 'a', { diverged: true, mode: 'offline' });
      const res = runSinkCli(sink, seed.repo,
        ['--project', seed.project, '--branch', seed.branch, '--issue', seed.issue, '--keep-issue-open'],
        sinkEnv(mockEnvName, binDir, true));
      const env = lastJson(res);
      const seen = 'exit=' + res.status + ' envelope=' + JSON.stringify(env)
        + ' stderr=' + String(res.stderr || '').slice(-400);
      check(res.status === 1, '(a) exit must be 1, got ' + seen);
      check(env && env.result === 'refuse', '(a) result must be refuse, got ' + seen);
      check(env && env.reason === 'sink_incomplete', '(a) reason must be sink_incomplete, got ' + seen);
      check(env && env.step === 'push_main', '(a) step must be push_main, got ' + seen);
      check(env && env.push_main === 'failed', '(a) push_main must be failed, got ' + seen);
      check(env && env.publication === 'unknown', '(a) publication must be unknown, got ' + seen);
      check(env && /offline fast-forward refused/.test(String(env.detail || '')),
        '(a) detail must carry the offline fast-forward refusal, got ' + seen);
      check(G.out(seed.repo, ['rev-parse', 'main']) === seed.m2,
        '(a) local main must not move off m2');
      check(G.out(seed.bare, ['rev-parse', 'main']) === seed.m2,
        '(a) bare remote main must not move off m2');
      check(!isAncestor(seed.repo, seed.feature, 'main'),
        '(a) the feature must NOT be an ancestor of main');
      const receipt = readJson(seed.liveReceipt);
      check(receipt.steps && receipt.steps.push_main !== 'done',
        '(a) live receipt steps.push_main must not be done, got ' + JSON.stringify(receipt.steps));
      check(receipt.push_main === 'failed',
        '(a) live receipt must record push_main failed, got ' + JSON.stringify(receipt.push_main));
      check(!receipt.published_head, '(a) no published_head may be stamped');
      check(fs.existsSync(path.join(seed.repo, 'external.txt')),
        '(a) external.txt must still be on disk in the main checkout');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  // --- (a-ctl) + (d2): non-diverged control; a done archive_commit is trusted --
  section('a-ctl/d2-non-diverged-control', () => {
    const tmp = mkTmp();
    try {
      const binDir = path.join(tmp, 'bin');
      writeGhMock(binDir, path.join(binDir, 'gh-calls.log'));
      const seed = buildKprSeed(tmp, 'actl', { diverged: false, mode: 'offline' });
      const res = runSinkCli(sink, seed.repo,
        ['--project', seed.project, '--branch', seed.branch, '--issue', seed.issue, '--keep-issue-open'],
        sinkEnv(mockEnvName, binDir, true, { KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'push_main' }));
      const seen = 'exit=' + res.status + ' stdout=' + String(res.stdout || '').slice(-400)
        + ' stderr=' + String(res.stderr || '').slice(-400);
      check(res.status === 99, '(a-ctl) a NON-diverged offline candidate must reach abort-after-push_main (exit 99), got ' + seen);
      check(G.out(seed.repo, ['rev-parse', 'main']) === seed.feature,
        '(a-ctl) the local fast-forward must land main === feature — divergence was the only thing that made (a) refuse');
      // (d2) the receipt had archive_commit pre-marked done and NO archive was
      // ever written: resume trusts the mark — nothing archived, no extra commit.
      check(!blobExists(seed.repo, 'main:kaola-workflow/archive/' + seed.project + '/workflow-state.md'),
        '(d2) a pre-marked done archive_commit must not retroactively create an archive blob on main');
      check(G.out(seed.repo, ['rev-list', '--count', seed.m2 + '..main']) === '1',
        '(d2) only the feature commit may sit on top of m2 — no archive commit was created, got '
        + G.out(seed.repo, ['rev-list', '--count', seed.m2 + '..main']));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  // --- (b) ONLINE static remote, non-descendant candidate ----------------------
  section('b/online-non-descendant-non-fast-forward', () => {
    const tmp = mkTmp();
    try {
      const binDir = path.join(tmp, 'bin');
      writeGhMock(binDir, path.join(binDir, 'gh-calls.log'));
      const seed = buildKprSeed(tmp, 'b', { diverged: true, mode: 'online' });
      const res = runSinkCli(sink, seed.repo,
        ['--project', seed.project, '--branch', seed.branch, '--issue', seed.issue, '--keep-issue-open'],
        sinkEnv(mockEnvName, binDir, false));
      const env = lastJson(res);
      const stderr = String(res.stderr || '');
      const seen = 'exit=' + res.status + ' envelope=' + JSON.stringify(env)
        + ' stderr=' + stderr.slice(-400);
      check(res.status === 2, '(b) exit must be 2, got ' + seen);
      check(env && env.result === 'report', '(b) result must be report, got ' + seen);
      check(env && env.status === 'not_merged', '(b) status must be not_merged, got ' + seen);
      check(env && env.reason === 'non_fast_forward', '(b) reason must be non_fast_forward, got ' + seen);
      check(env && env.step === 'push_main', '(b) step must be push_main, got ' + seen);
      check(env && env.publication === 'not_published', '(b) publication must be not_published, got ' + seen);
      check(env && /never a --force/.test(String(env.detail || '')),
        '(b) detail must state never a --force, got ' + seen);
      check(/\[rejected\]/.test(stderr) && /non-fast-forward/.test(stderr),
        '(b) stderr must carry a real git rejection ([rejected] + non-fast-forward), got ' + stderr.slice(-400));
      check(G.out(seed.bare, ['rev-parse', 'main']) === seed.m2,
        '(b) the bare remote main must not move — nothing was forced');
      check(G.out(seed.repo, ['rev-parse', 'main']) === seed.m2,
        '(b) local main must not move');
      check(G.out(seed.repo, ['rev-parse', 'origin/main']) === seed.m2,
        '(b) local origin/main must not move');
      check(!isAncestor(seed.bare, seed.feature, 'main'),
        '(b) the feature must not be an ancestor of the bare remote main');
      const receipt = readJson(seed.liveReceipt);
      check(receipt.steps && receipt.steps.push_main !== 'done',
        '(b) live receipt steps.push_main must not be done, got ' + JSON.stringify(receipt.steps));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  // --- (b-ctl) online descendant control -------------------------------------
  section('b-ctl/online-descendant-publishes', () => {
    const tmp = mkTmp();
    try {
      const binDir = path.join(tmp, 'bin');
      writeGhMock(binDir, path.join(binDir, 'gh-calls.log'));
      const seed = buildKprSeed(tmp, 'bctl', { diverged: false, mode: 'online' });
      const res = runSinkCli(sink, seed.repo,
        ['--project', seed.project, '--branch', seed.branch, '--issue', seed.issue, '--keep-issue-open'],
        sinkEnv(mockEnvName, binDir, false, { KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'push_main' }));
      const seen = 'exit=' + res.status + ' stdout=' + String(res.stdout || '').slice(-400)
        + ' stderr=' + String(res.stderr || '').slice(-400);
      check(res.status === 99, '(b-ctl) a descendant candidate must reach abort-after-push_main (exit 99), got ' + seen);
      check(G.out(seed.bare, ['rev-parse', 'main']) === seed.feature,
        '(b-ctl) the same plain push must publish when it IS a fast-forward — bare remote main === feature, got '
        + G.out(seed.bare, ['rev-parse', 'main']));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  });

  // --- (c) OFFLINE push_main success is a LOCAL fast-forward only --------------
  // The fixture is deliberately NOT removed in the finally: (d3) re-reads run 1's
  // receipt and main tree. It is removed at the end of (d3).
  section('c/offline-push-main-local-only', () => {
    const tmp = mkTmp();
    try {
      const binDir = path.join(tmp, 'bin');
      writeGhMock(binDir, path.join(binDir, 'gh-calls.log'));
      const fx = buildSoleArchiverFixture(tmp, 'c', 'i1114c', 911141);
      const args = ['--project', fx.project, '--branch', fx.branch, '--issue', fx.issue, '--keep-issue-open'];

      const res1 = runSinkCli(sink, fx.repo, args,
        sinkEnv(mockEnvName, binDir, true, { KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'push_main' }));
      const seen1 = 'exit=' + res1.status + ' stdout=' + String(res1.stdout || '').slice(-400)
        + ' stderr=' + String(res1.stderr || '').slice(-400);
      check(res1.status === 99, '(c) run 1 must abort after push_main (exit 99), got ' + seen1);

      const receiptFile = findReceiptFile(fx.repo, fx.project);
      check(receiptFile !== null, '(c) the receipt the aborted run wrote must be locatable');
      const receipt = receiptFile ? readJson(receiptFile) : null;
      check(receipt && receipt.steps && receipt.steps.push_main === 'done',
        '(c) steps.push_main must be done after the abort, got ' + JSON.stringify(receipt && receipt.steps));
      const localMain = G.out(fx.repo, ['rev-parse', 'main']);
      check(receipt && /^[0-9a-f]{40}$/.test(String(receipt.published_head || '')),
        '(c) published_head must be a stamped 40-hex sha, got ' + JSON.stringify(receipt && receipt.published_head));
      check(receipt && receipt.published_head === localMain,
        '(c) published_head must equal the local main tip (' + localMain + '), got '
        + JSON.stringify(receipt && receipt.published_head));
      check(localMain !== fx.mainBefore,
        '(c) the local fast-forward must advance main off ' + fx.mainBefore);
      check(blobExists(fx.repo, 'main:DELIVERABLE.txt'),
        '(c) the branch deliverable must be present at main');
      check(G.out(fx.bare, ['rev-parse', 'main']) === fx.remoteBefore,
        '(c) NOTHING may reach the remote — bare main must stay at ' + fx.remoteBefore);
      check(receipt && !isAncestor(fx.bare, String(receipt.published_head), 'main'),
        '(c) published_head must NOT be an ancestor of the bare remote main');

      const res2 = runSinkCli(sink, fx.repo, args, sinkEnv(mockEnvName, binDir, true));
      const env2 = lastJson(res2);
      const seen2 = 'exit=' + res2.status + ' envelope=' + JSON.stringify(env2)
        + ' stderr=' + String(res2.stderr || '').slice(-400);
      check(env2 && env2.publication === 'unknown',
        '(c) resume must report publication unknown even with push_main done, got ' + seen2);
      check(env2 && env2.status === 'sinked',
        '(c) the resumed run must complete with status sinked, got ' + seen2);
      check(G.out(fx.bare, ['rev-parse', 'main']) === fx.remoteBefore,
        '(c) the remote must STILL be unmoved after the completed offline sink');
      cRun1 = { fx, receipt, res1, tmp };
    } finally {
      if (!cRun1) fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // --- (d1) SINK_STEPS source order, per edition -------------------------------
  section('d1/sink-steps-order', () => {
    const text = fs.readFileSync(script, 'utf8');
    const m = /const SINK_STEPS = \[([^\]]*)\]/.exec(text);
    check(m !== null, '(d1) ' + script + ' must declare a SINK_STEPS literal');
    if (m) {
      const steps = (m[1].match(/'[^']*'/g) || []).map(s => s.slice(1, -1));
      check(JSON.stringify(steps) === JSON.stringify(SINK_STEPS_EXPECTED),
        '(d1) SINK_STEPS must be ' + JSON.stringify(SINK_STEPS_EXPECTED) + ', got ' + JSON.stringify(steps));
      check(steps.indexOf('archive_commit') !== -1 && steps.indexOf('push_main') !== -1
        && steps.indexOf('archive_commit') < steps.indexOf('push_main'),
        '(d1) archive_commit must precede push_main');
    }
  });

  // --- (d3) a FRESH run executes archive_commit before push_main ---------------
  section('d3/archive-commit-before-push-main', () => {
    const tmp = mkTmp();
    try {
      const binDir = path.join(tmp, 'bin');
      writeGhMock(binDir, path.join(binDir, 'gh-calls.log'));
      const fx = buildSoleArchiverFixture(tmp, 'd3', 'i1114e', 911143);
      const res = runSinkCli(sink, fx.repo,
        ['--project', fx.project, '--branch', fx.branch, '--issue', fx.issue, '--keep-issue-open'],
        sinkEnv(mockEnvName, binDir, true, { KAOLA_WORKFLOW_SINK_ABORT_AFTER: 'archive_commit' }));
      const seen = 'exit=' + res.status + ' stdout=' + String(res.stdout || '').slice(-400)
        + ' stderr=' + String(res.stderr || '').slice(-400);
      check(res.status === 99, '(d3) abort after archive_commit must exit 99, got ' + seen);
      const receiptFile = findReceiptFile(fx.repo, fx.project);
      const receipt = receiptFile ? readJson(receiptFile) : null;
      check(receipt && receipt.steps && receipt.steps.archive_commit === 'done',
        '(d3) steps.archive_commit must be done, got ' + JSON.stringify(receipt && receipt.steps));
      check(receipt && receipt.steps && receipt.steps.push_main !== 'done',
        '(d3) steps.push_main must NOT be done yet, got ' + JSON.stringify(receipt && receipt.steps));
      check(G.out(fx.repo, ['rev-parse', 'main']) === fx.mainBefore,
        '(d3) local main must be unmoved — push_main has not run (' + fx.mainBefore + ')');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    // ...and from (c)'s fresh run, the archive commit was real and reached local
    // main through push_main: main carries the archive blob at the recorded dest.
    check(cRun1 !== null && cRun1.res1.status === 99,
      '(d3) (c) run 1 must have aborted after push_main cleanly, got '
      + (cRun1 ? 'exit=' + cRun1.res1.status : 'no run'));
    if (cRun1 && cRun1.receipt && cRun1.receipt.archive_dest) {
      const refPath = 'main:' + String(cRun1.receipt.archive_dest).replace(/\/+$/, '') + '/workflow-state.md';
      check(blobExists(cRun1.fx.repo, refPath),
        '(d3) the fresh run must have executed archive_commit — ' + refPath + ' must be a blob on main '
        + '(published locally by push_main)');
    } else {
      check(false, '(d3) (c) run 1 receipt must carry archive_dest, got '
        + JSON.stringify(cRun1 && cRun1.receipt && cRun1.receipt.archive_dest));
    }
    if (cRun1) {
      try { fs.rmSync(cRun1.tmp, { recursive: true, force: true }); } catch (_) {}
      cRun1 = null;
    }
  });

  console.log('Issue 1114 sink refusals (' + label + '): ' + checks + ' checks, ' + failures + ' failures');
  return failures;
}

const sinkOverride = process.env.KAOLA_1114_SINK_OVERRIDE || '';
const requested = process.argv[2];
const editions = requested
  ? EDITIONS.filter(([n]) => n === requested)
  : EDITIONS;
if (!editions.length) throw new Error('Unknown edition ' + requested);
let failed = false;
for (const [label, script, mockEnv] of editions) {
  if (!fs.existsSync(script)) {
    console.error('FAIL [' + label + ']: sink edition missing at ' + script);
    failed = true;
    continue;
  }
  // KAOLA_1114_SINK_OVERRIDE exists only for the mutation-check driver: it swaps
  // the executed sink for a scratch copy while (d1) still reads the edition's
  // own source. Never set in the standing suite.
  if (runEdition(label, script, mockEnv, sinkOverride || null) > 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
