#!/usr/bin/env node
'use strict';

// Integration tests for bundle FINALIZE path (issue #328 finalization node).
// Hand-rolled assert + counter; repo style (no framework) — mirrors test-bundle-claim.js.
//
// SCOPE: AC#11 (all-or-nothing closure), AC#12 (bundle receipt fields), AC#13 (warning-first
//   on single remote-close failure), AC#1 (single-issue finalize regression).
//
// Covered scenarios:
//   (1) Bundle finalize closes all 3 members, removes all 3 .roadmap/issue-N.md sources,
//       regenerates ROADMAP.md once, archives ONE folder, receipt has closed_issues +
//       failed_issue_closures + roadmap_sources_removed.
//   (2) Warning-first: one member remote-close fails -> recorded in failed_issue_closures,
//       closure still completes (exit 0).
//   (3) Single-issue finalize regression (AC#1 / dogfooding): one issue closed, one roadmap
//       source removed, receipt has NO bundle fields (or empty), invariants pass.
//   (4) checkClosureInvariants per-issue: violation when a bundle member's .roadmap source
//       still exists.
//   (5) checkClosureInvariants roadmap-mirror-clean is row-anchored (#339): a legitimate
//       cross-reference to #N inside ANOTHER issue's row does not violate; an actual
//       active `| #N | ...` row still does.
//
// OFFLINE-safe strategy: same KAOLA_GH_MOCK_SCRIPT pattern as test-bundle-claim.js.
// All fixtures are written to $TMPDIR — NOTHING is written inside the repo tree.
//
// Driving approach for receipt assertions (per advisor): run finalize as a subprocess and
// inspect closure_receipt in the JSON output rather than calling buildClosureReceipt directly,
// since the bundle fields are attached in cmdFinalize AFTER the builder call.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const claimScript = path.join(repoRoot, 'scripts', 'kaola-workflow-claim.js');
const sinkMergeScript = path.join(repoRoot, 'scripts', 'kaola-workflow-sink-merge.js');
const planValidatorScript = path.join(repoRoot, 'scripts', 'kaola-workflow-plan-validator.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kw-bundle-finalize-'));
}

function initGitRepo(tmp) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
}

// #592: a git repo with a bare remote — needed to drive the real `--sink` transaction
// (kaola-workflow-sink-merge.js --sink) end to end (push_upstream/merge/push_main all
// operate against a real origin). Mirrors simulate-workflow-walkthrough.js's
// initGitRepoWithBareRemote.
function initGitRepoWithBareRemote(tmp) {
  initGitRepo(tmp);
  const remotePath = tmp + '-remote';
  spawnSync('git', ['init', '--bare', remotePath], { encoding: 'utf8' });
  spawnSync('git', ['-C', tmp, 'remote', 'add', 'origin', remotePath], { encoding: 'utf8' });
  spawnSync('git', ['-C', tmp, 'push', '-u', 'origin', 'main'], { encoding: 'utf8' });
  return remotePath;
}

// Write a roadmap source file for an issue.
function writeRoadmapFile(tmpRoot, issueNum) {
  const dir = path.join(tmpRoot, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + issueNum + '.md'), [
    'issue: #' + issueNum,
    'title: Test issue ' + issueNum,
    'status: active',
    'workflow_project: bundle-test',
    'next_step: TBD'
  ].join('\n') + '\n');
}

// Write a minimal ROADMAP.md that references the given issue numbers.
function writeRoadmapMirror(tmpRoot, issueNums) {
  const roadmapDir = path.join(tmpRoot, 'kaola-workflow');
  fs.mkdirSync(roadmapDir, { recursive: true });
  let content = '# Kaola-Workflow Roadmap\n\n';
  content += '| Issue | Title | Status | Project | Next Step |\n';
  content += '|-------|-------|--------|---------|----------|\n';
  for (const n of issueNums) {
    content += '| #' + n + ' | Test issue ' + n + ' | active | bundle-test | TBD |\n';
  }
  fs.writeFileSync(path.join(roadmapDir, 'ROADMAP.md'), content);
}

// Same pattern as simulate-workflow-walkthrough.js's seedAdaptiveFinalizeFixture (proven
// elsewhere, used dozens of times): a finalize with NO frozen workflow-plan.md now refuses
// adaptive_plan_missing (adaptive is the only workflow path). These fixtures jump straight
// from a hand-rolled state to finalize to exercise terminal archive/closure normalization —
// not an authored adaptive run — so seed a minimal FROZEN adaptive workflow-plan.md plus a
// passing consumer-mode final-validation gate, letting finalize's adaptive --finalize-check
// proceed to the archive/closure behavior each fixture actually asserts.
function stampVerifiedFinalizePlan(planPath) {
  const content = fs.readFileSync(planPath, 'utf8');
  if (/<!--\s*plan_hash:\s*[0-9a-f]{64}\s*-->/.test(content)) return;
  const validator = require(planValidatorScript);
  const hash = validator.computePlanHash(content);
  fs.writeFileSync(planPath, '<!-- plan_hash: ' + hash + ' -->\n\n' + content);
}

function seedAdaptiveFinalizeFixture(tmpRoot, project) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = path.join(dir, 'workflow-plan.md');
  fs.writeFileSync(planPath, [
    '# Workflow Plan', '', '## Meta', 'labels: enhancement', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| n1 | code-explorer | — | — | 1 | sequence |',
    '| n2 | finalize | n1 | — | 1 | sequence |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| n1 | complete |', '| n2 | complete |', '',
    '## Required Agent Compliance', '',
    '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
    '| code-explorer (n1) | subagent-invoked | evidence-binding: n1 planless | |',
    '| finalize (n2) | main-session-direct | evidence-binding: n2 planless | |', ''
  ].join('\n'));
  stampVerifiedFinalizePlan(planPath);
  try { JSON.parse(spawnSync(process.execPath, [planValidatorScript, planPath, '--freeze', '--json'], { cwd: tmpRoot, encoding: 'utf8' }).stdout); } catch (_) {}
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  let cand = '';
  try {
    cand = JSON.parse(spawnSync(process.execPath, [planValidatorScript, planPath, '--candidate-hash', '--json'], { cwd: tmpRoot, encoding: 'utf8' }).stdout).validated_candidate_hash || '';
  } catch (_) { cand = ''; }
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

// Write a bundle workflow-state.md file for a given project/members.
function writeBundleStateFile(tmpRoot, project, primaryIssue, memberIssues, opts) {
  opts = opts || {};
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const sinkLines = opts.sink === 'pr'
    ? ['sink: pr', 'pr_url: ' + (opts.prUrl || 'https://example.test/pr/1')]
    : ['sink: merge'];
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    // These fixtures exercise bundle closure, sink, and archive behavior rather than the
    // node-by-node adaptive lifecycle itself; a minimal frozen adaptive plan is seeded
    // alongside (seedAdaptiveFinalizeFixture below) so Finalization's adaptive
    // --finalize-check gate passes and the archive/closure behavior under test can run.
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: adaptive',
    'runtime: claude',
    'step: complete',
    'next_command: /kaola-workflow-finalize ' + project,
    'next_skill: kaola-workflow-finalize ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- finalization',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: startup',
    'last_result: folder_claimed',
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Sink',
    'branch: workflow/' + project,
    'issue_number: ' + primaryIssue,
    ...sinkLines,
    'run_posture: in-place',
    'issue_numbers: ' + memberIssues.join(','),
    'bundle_id: ' + project,
    'closure_policy: all_or_nothing'
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), lines.join('\n') + '\n');
}

// Write a single-issue adaptive state for closure-only Finalization fixtures.
function writeSingleStateFile(tmpRoot, project, issueNumber) {
  const dir = path.join(tmpRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + project,
    'status: active',
    '',
    '## Current Position',
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: adaptive',
    'runtime: claude',
    'step: complete',
    'next_command: /kaola-workflow-finalize ' + project,
    'next_skill: kaola-workflow-finalize ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- finalization',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: startup',
    'last_result: folder_claimed',
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Sink',
    'branch: workflow/issue-' + issueNumber,
    'issue_number: ' + issueNumber,
    'sink: merge',
    'run_posture: in-place'
  ];
  fs.writeFileSync(path.join(dir, 'workflow-state.md'), lines.join('\n') + '\n');
  seedAdaptiveFinalizeFixture(tmpRoot, project);
}

// Write a mock gh script. Behaviour:
//   - `issue view N` returns closed JSON for closedIssues, open for others.
//   - `issue edit N --remove-label` logs "label-removed:N" to logFile.
//   - `issue comment N --body ...` logs "comment:N" to logFile.
//   - `throwOnIssueView`: if a number, throw on `issue view N` for that issue.
//   - other calls: no-op exit 0.
function writeGhMockScript(binDir, opts) {
  const logFile = opts && opts.logFile ? JSON.stringify(opts.logFile) : 'null';
  const closedIssues = opts && opts.closedIssues ? JSON.stringify(opts.closedIssues) : '[]';
  const throwOnView = opts && opts.throwOnIssueView != null ? String(opts.throwOnIssueView) : 'null';
  // #371: `pr view` route for cmdWatchPr coverage — configurable PR state (MERGED/CLOSED/OPEN).
  const prState = opts && opts.prState ? JSON.stringify(opts.prState) : 'null';

  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + logFile + ';',
    'const closedIssues = new Set(' + closedIssues + '.map(String));',
    'const throwOnView = ' + throwOnView + ';',
    'const prState = ' + prState + ';',
    '',
    'function log(msg) {',
    '  if (!logFile) return;',
    '  try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {}',
    '}',
    '',
    '// repo view',
    'if (a.includes("repo view")) {',
    '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// #371: pr view <url> --json state,number',
    'if (a.includes("pr view")) {',
    '  log("pr-view");',
    '  process.stdout.write(JSON.stringify({state: prState || "OPEN", number: 999}) + "\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// issue view N --json state',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  if (throwOnView !== "null" && n === String(throwOnView)) {',
    '    process.stderr.write("mock gh: forced error on issue view " + n + "\\n");',
    '    process.exit(1);',
    '  }',
    '  if (closedIssues.has(n)) {',
    '    process.stdout.write(JSON.stringify({number:parseInt(n),state:"closed",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  } else {',
    '    process.stdout.write(JSON.stringify({number:parseInt(n),state:"open",title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  }',
    '  process.exit(0);',
    '}',
    '',
    '// #617: issue close N --comment ... -> logged as close:N (proves whether/when a real close was attempted)',
    'const closeM = a.match(/^issue close (\\d+)/);',
    'if (closeM) {',
    '  log("close:" + closeM[1]);',
    '  process.stdout.write("\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// issue edit N --remove-label',
    'if (a.includes("issue edit") && a.includes("--remove-label")) {',
    '  const em = a.match(/issue edit (\\d+)/);',
    '  const n = em ? em[1] : "?";',
    '  log("label-removed:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// issue edit N --add-label',
    'if (a.includes("issue edit") && a.includes("--add-label")) {',
    '  const em = a.match(/issue edit (\\d+)/);',
    '  const n = em ? em[1] : "?";',
    '  log("label-added:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// issue comment N --body ...',
    'if (a.includes("issue comment")) {',
    '  const cm = a.match(/issue comment (\\d+)/);',
    '  const n = cm ? cm[1] : "?";',
    '  log("comment:" + n);',
    '  process.exit(0);',
    '}',
    '',
    '// label create ...',
    'if (a.includes("label create")) { process.exit(0); }',
    '',
    '// api repos/.../issues/N/comments => []',
    'if (a.includes("api") && a.includes("comments")) {',
    '  process.stdout.write("[]\\n");',
    '  process.exit(0);',
    '}',
    '',
    '// api --method DELETE ...',
    'if (a.includes("api") && a.includes("DELETE")) { process.exit(0); }',
    '',
    'process.stdout.write("\\n");',
    'process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'gh.js'), script);
}

function runFinalize(args, cwd, binDir, extraEnv) {
  const mockEnv = fs.existsSync(path.join(binDir, 'gh.js'))
    ? { KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js') }
    : {};
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '0',  // in-place mode: avoid git worktree ops in $TMPDIR
    }, mockEnv, extraEnv || {})
  });
  return result;
}

function parseOutput(result) {
  const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  if (!lines.length) return null;
  try { return JSON.parse(lines[lines.length - 1]); } catch (_) { return null; }
}

function readLog(logFile) {
  try { return fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch (_) { return []; }
}

// Also import checkClosureInvariants for direct per-issue invariant testing.
const { checkClosureInvariants, verifyArchiveComplete, archiveProjectDir,
  buildClaimAnchors } = require('./kaola-workflow-claim');
const { archiveSucceeded } = require('./kaola-workflow-closure-contract');

// ---------------------------------------------------------------------------
// Test (1): Bundle finalize — closes all 3 members
// ---------------------------------------------------------------------------

(function testBundleFinalizeAllMembers() {
  console.log('Test (1): bundle finalize closes all 3 members, removes all roadmap sources, archives one folder');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeRoadmapMirror(tmpRoot, [42, 47, 53]);

    // All issues are "closed" so the receipt shows closed_issues=[42,47,53]
    writeGhMockScript(binDir, {
      logFile,
      closedIssues: [42, 47, 53],
    });
    // Seed LAST, after every fixture file (gh mock, roadmap) is in place, so the
    // recorded validated_candidate_hash matches the tree finalize will recompute over.
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    assert(result.status === 0, 'bundle finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'finalize emits JSON');
    assert(out.status === 'closed', 'output status is closed, got ' + JSON.stringify(out && out.status));

    // Archive folder exists; live project dir is gone
    const archiveBase = path.join(tmpRoot, 'kaola-workflow', 'archive');
    const archiveDest = out && out.dest;
    assert(archiveDest != null, 'finalize output has dest');
    assert(fs.existsSync(archiveDest), 'archive folder exists at ' + archiveDest);
    const liveDir = path.join(tmpRoot, 'kaola-workflow', project);
    assert(!fs.existsSync(liveDir), 'live project dir is gone after finalize');

    // All three .roadmap source files were removed
    for (const n of [42, 47, 53]) {
      const src = path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md');
      assert(!fs.existsSync(src), 'roadmap source issue-' + n + '.md was removed');
    }

    // Closure receipt fields
    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'closure_receipt present in output');
    if (receipt) {
      // closed_issues: all three members
      assert(Array.isArray(receipt.closed_issues), 'receipt has closed_issues array');
      if (Array.isArray(receipt.closed_issues)) {
        assert(receipt.closed_issues.length === 3, 'closed_issues has 3 entries, got ' + receipt.closed_issues.length);
        assert(receipt.closed_issues.includes(42), 'closed_issues includes 42');
        assert(receipt.closed_issues.includes(47), 'closed_issues includes 47');
        assert(receipt.closed_issues.includes(53), 'closed_issues includes 53');
      }

      // failed_issue_closures: empty (all succeeded)
      assert(Array.isArray(receipt.failed_issue_closures), 'receipt has failed_issue_closures array');
      if (Array.isArray(receipt.failed_issue_closures)) {
        assert(receipt.failed_issue_closures.length === 0, 'failed_issue_closures is empty');
      }

      // roadmap_sources_removed: three entries
      assert(Array.isArray(receipt.roadmap_sources_removed), 'receipt has roadmap_sources_removed array');
      if (Array.isArray(receipt.roadmap_sources_removed)) {
        assert(receipt.roadmap_sources_removed.length === 3, 'roadmap_sources_removed has 3 entries, got ' + receipt.roadmap_sources_removed.length);
        for (const n of [42, 47, 53]) {
          assert(receipt.roadmap_sources_removed.includes('issue-' + n + '.md'),
            'roadmap_sources_removed contains issue-' + n + '.md');
        }
      }

      // issue_numbers on the receipt
      assert(Array.isArray(receipt.issue_numbers), 'receipt has issue_numbers');
      if (Array.isArray(receipt.issue_numbers)) {
        assert(receipt.issue_numbers.length === 3, 'receipt.issue_numbers has 3 entries');
      }
    }

    // Labels were removed for all members
    const calls = readLog(logFile);
    const labelsRemoved = calls.filter(c => c.startsWith('label-removed:'));
    assert(labelsRemoved.some(c => c === 'label-removed:42'), 'label removed for member 42');
    assert(labelsRemoved.some(c => c === 'label-removed:47'), 'label removed for member 47');
    assert(labelsRemoved.some(c => c === 'label-removed:53'), 'label removed for member 53');

    // Closure invariants pass
    const invariants = out && out.closure_invariants;
    assert(invariants != null, 'closure_invariants present');
    assert(invariants && invariants.ok === true, 'closure invariants pass; violations: ' + JSON.stringify(invariants && invariants.violations));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2): Warning-first — one member remote-close probe fails
// ---------------------------------------------------------------------------

(function testBundleFinalizeWarningFirst() {
  console.log('Test (2): warning-first — issue view fails for member 47, recorded in failed_issue_closures, closure still completes');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeRoadmapMirror(tmpRoot, [42, 47, 53]);

    // issue view throws for member 47 -> that member lands in failed_issue_closures
    // issues 42 and 53 are closed normally
    writeGhMockScript(binDir, {
      closedIssues: [42, 53],
      throwOnIssueView: 47,
    });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    // Closure must complete successfully despite the probe failure
    assert(result.status === 0, 'warning-first finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'warning-first finalize emits JSON');
    assert(out.status === 'closed', 'status is closed, got ' + JSON.stringify(out && out.status));

    // Archive folder should exist
    assert(out && out.dest && fs.existsSync(out.dest), 'archive folder exists');

    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'receipt present');
    if (receipt) {
      // failed_issue_closures includes member 47
      assert(Array.isArray(receipt.failed_issue_closures), 'receipt has failed_issue_closures');
      if (Array.isArray(receipt.failed_issue_closures)) {
        assert(receipt.failed_issue_closures.includes(47), 'failed_issue_closures includes 47');
      }
      // closed_issues includes 42 and 53 (probed successfully as closed)
      assert(Array.isArray(receipt.closed_issues), 'receipt has closed_issues');
      if (Array.isArray(receipt.closed_issues)) {
        assert(receipt.closed_issues.includes(42), 'closed_issues includes 42');
        assert(receipt.closed_issues.includes(53), 'closed_issues includes 53');
        assert(!receipt.closed_issues.includes(47), 'failed member 47 not in closed_issues');
      }
    }

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2b) #369 + #396.4 (D2): partial-closure truthfulness at the cmdFinalize MERGE LANE — a member
// probed STILL OPEN while online lands in open_issues (never silently neither, AC2) and the token is
// `partial` not `skipped_offline` (AC2). BUT cmdFinalize runs BEFORE sink-merge closes members, so on
// the NORMAL bundle merge-lane finalize every member is open → the old code fired remote-members-closed
// (ok:false) on the HAPPY PATH (alarm fatigue, the #396.4/D2 bug). The fix: cmdFinalize tags its receipt
// close_disposition:'close_pending' and checkClosureInvariants SKIPS remote-members-closed for it. The
// bucket arrays + token stay truthful; only the premature ALARM is defused (it fires truthfully at
// sink-merge/watch-pr, where close_disposition is unset — see Test (#371) watch-pr below + test-gitlab/gitea-sinks).
// ---------------------------------------------------------------------------

(function testBundleFinalizePartialOpenMember() {
  console.log('Test (2b) #369+#396.4 (D2): merge-lane finalize — member 47 open → open_issues + partial token, close_pending suppresses the premature alarm');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const project = 'bundle-42-47-53';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42);
    writeRoadmapFile(tmpRoot, 47);
    writeRoadmapFile(tmpRoot, 53);
    writeRoadmapMirror(tmpRoot, [42, 47, 53]);
    // 42 + 53 closed; 47 returns state:open (not in closedIssues, no throw).
    writeGhMockScript(binDir, { closedIssues: [42, 53] });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    // #427: merge-lane finalize uses --keep-worktree (sink-merge closes members later).
    // Without --keep-worktree, #427's closeIssueIdempotent would close 47 here.
    const result = runFinalize(['finalize', '--project', project, '--keep-worktree'], tmpRoot, binDir);
    const out = parseOutput(result);
    assert(result.status === 0, 'partial finalize still exits 0 (warn-first); got ' + result.status);
    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'receipt present');
    if (receipt) {
      assert(Array.isArray(receipt.open_issues) && receipt.open_issues.includes(47),
        '#369 AC2: member 47 (open online) recorded in open_issues, got ' + JSON.stringify(receipt.open_issues));
      assert(!(receipt.closed_issues || []).includes(47), '#369: 47 not in closed_issues');
      assert(!(receipt.failed_issue_closures || []).includes(47), '#369: 47 not in failed_issue_closures');
      assert(receipt.remote_issue_closed === 'partial',
        '#369 AC2: online partial close → remote_issue_closed === partial (never skipped_offline), got ' + receipt.remote_issue_closed);
      // #396.4 (D2): the merge-lane finalize tags close_pending so the premature alarm is suppressed.
      assert(receipt.close_disposition === 'close_pending',
        '#396.4 (D2): merge-lane finalize tags close_disposition: close_pending, got ' + receipt.close_disposition);
    }
    const inv = out && out.closure_invariants;
    // #396.4 (D2): remote-members-closed is SKIPPED at the close-pending merge lane (the members will
    // close at sink). The invariant set is therefore clean for THIS reason — assert it is NOT flagged.
    assert(inv && !(Array.isArray(inv.violations) && inv.violations.some(v => v.id === 'remote-members-closed')),
      '#396.4 (D2): remote-members-closed is suppressed (close_pending) at the merge lane, got ' + JSON.stringify(inv && inv.violations));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (2c) #396.4 (D2) FIRING DIRECTION — the post-sink partial-failure MUST still fire
// remote-members-closed (close_disposition UNSET). Test (2b) proved the pre-sink merge lane
// SUPPRESSES it; this proves the gate is not a blanket suppression. The contrast pair (same
// receipt, only close_disposition differs) locks the gate exactly: a future bug that always
// suppresses (or stamps close_pending on a post-sink receipt) breaks exactly one of the two.
// Closes the R1 coverage gap the cluster-L adversarial review flagged (Test (2b) inverted the
// only firing assertion with no replacement).
// ---------------------------------------------------------------------------

(function testRemoteMembersClosedFiresPostSink() {
  console.log('Test (2c) #396.4 (D2): post-sink partial (close_disposition UNSET) FIRES remote-members-closed; close_pending suppresses the SAME receipt');
  const tmpRoot = makeTmpRoot();
  try {
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'bundle-42-47-53');
    fs.mkdirSync(archiveDest, { recursive: true });
    // A post-sink partial: member 47 failed to close; sink-merge/watch-pr leave close_disposition UNSET.
    const postSink = { issue_numbers: [42, 47, 53], closed_issues: [42, 53], failed_issue_closures: [47], remote_issue_closed: 'partial' };
    const invFires = checkClosureInvariants(tmpRoot, postSink, archiveDest);
    assert(invFires && Array.isArray(invFires.violations) && invFires.violations.some(function(v) { return v.id === 'remote-members-closed'; }),
      '#396.4 (D2) FIRING: a post-sink partial (no close_disposition) MUST fire remote-members-closed, got ' + JSON.stringify(invFires && invFires.violations));
    assert(invFires && invFires.ok === false, '#396.4 (D2) FIRING: ok===false on a real post-sink partial');
    // The SAME receipt tagged close_pending (the pre-sink merge lane) suppresses it — the gate flips ONLY on the disposition.
    const prePending = Object.assign({}, postSink, { close_disposition: 'close_pending' });
    const invSuppressed = checkClosureInvariants(tmpRoot, prePending, archiveDest);
    assert(invSuppressed && !(Array.isArray(invSuppressed.violations) && invSuppressed.violations.some(function(v) { return v.id === 'remote-members-closed'; })),
      '#396.4 (D2): close_pending on the SAME receipt suppresses remote-members-closed, got ' + JSON.stringify(invSuppressed && invSuppressed.violations));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (3): Single-issue finalize regression (AC#1 / dogfooding)
// ---------------------------------------------------------------------------

(function testSingleIssueFinalizeRegression() {
  console.log('Test (3): single-issue finalize — one issue closed, one roadmap source removed, receipt has NO bundle fields');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const project = 'issue-99';
  try {
    initGitRepo(tmpRoot);
    writeSingleStateFile(tmpRoot, project, 99);
    writeRoadmapFile(tmpRoot, 99);
    writeRoadmapMirror(tmpRoot, [99]);

    writeGhMockScript(binDir, {
      closedIssues: [99],
    });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    assert(result.status === 0, 'single-issue finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, 'single-issue finalize emits JSON');
    assert(out.status === 'closed', 'status is closed, got ' + JSON.stringify(out && out.status));

    // Roadmap source removed
    const src = path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-99.md');
    assert(!fs.existsSync(src), 'roadmap source issue-99.md was removed for single issue');

    // Archive folder exists; live project dir gone
    assert(out && out.dest && fs.existsSync(out.dest), 'archive folder exists');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', project)), 'live project dir gone');

    // Receipt has NO bundle-specific fields (or empty arrays)
    const receipt = out && out.closure_receipt;
    assert(receipt != null, 'receipt present');
    if (receipt) {
      // closed_issues / failed_issue_closures must be absent or empty
      assert(
        receipt.closed_issues == null || (Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0),
        'single-issue receipt has no closed_issues bundle field; got ' + JSON.stringify(receipt.closed_issues)
      );
      assert(
        receipt.failed_issue_closures == null || (Array.isArray(receipt.failed_issue_closures) && receipt.failed_issue_closures.length === 0),
        'single-issue receipt has no failed_issue_closures bundle field; got ' + JSON.stringify(receipt.failed_issue_closures)
      );
      assert(
        receipt.roadmap_sources_removed == null || (Array.isArray(receipt.roadmap_sources_removed) && receipt.roadmap_sources_removed.length === 0),
        'single-issue receipt has no roadmap_sources_removed bundle field; got ' + JSON.stringify(receipt.roadmap_sources_removed)
      );
      // Standard single-issue receipt fields still present
      assert(receipt.roadmap_source_removed != null, 'receipt has roadmap_source_removed (scalar)');
      assert(receipt.roadmap_regenerated != null, 'receipt has roadmap_regenerated');
    }

    // Closure invariants pass for the single-issue path
    const invariants = out && out.closure_invariants;
    assert(invariants != null, 'closure_invariants present');
    assert(invariants && invariants.ok === true, 'single-issue closure invariants pass; violations: ' + JSON.stringify(invariants && invariants.violations));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (4): checkClosureInvariants per-issue — violation when a member's roadmap source still exists
// ---------------------------------------------------------------------------

(function testCheckClosureInvariantsPerIssue() {
  console.log('Test (4): checkClosureInvariants per-issue — violation when bundle member source still present');
  const tmpRoot = makeTmpRoot();
  try {
    initGitRepo(tmpRoot);

    // Create a roadmap mirror with no active issues (so mirror is clean)
    const roadmapDir = path.join(tmpRoot, 'kaola-workflow');
    fs.mkdirSync(roadmapDir, { recursive: true });
    fs.writeFileSync(path.join(roadmapDir, 'ROADMAP.md'), '# Kaola-Workflow Roadmap\n\nNo active issues.\n');

    // Leave issue-47.md present (not removed) — should trigger roadmap-source-absent violation
    writeRoadmapFile(tmpRoot, 47);

    // Create archive dest with a closed state file
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'bundle-42-47-53');
    fs.mkdirSync(archiveDest, { recursive: true });
    fs.writeFileSync(path.join(archiveDest, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      'name: bundle-42-47-53',
      'status: closed',
      'step: complete'
    ].join('\n') + '\n');

    // Build a receipt for a bundle project where member 47's roadmap source still exists
    const receipt = {
      project: 'bundle-42-47-53',
      issue_number: 42,
      issue_numbers: [42, 47, 53],
      archive: 'closed',
      roadmap_source_removed: 'removed',   // scalar says removed (primary was removed)
      roadmap_regenerated: 'regenerated',
      remote_issue_closed: 'already_closed',
      claim_label_removed: 'removed',       // so in-progress-label-removed passes
      worktree_removed: 'missing',
      branch_removed: 'kept',
      claim_planner_attested: 'missing',
      finalize_contractor_attested: 'missing',
      warnings: []
    };

    // Call checkClosureInvariants directly (exported)
    const invariantResult = checkClosureInvariants(tmpRoot, receipt, archiveDest);

    // Should have a violation for roadmap-source-absent (member 47's source still present)
    assert(invariantResult.ok === false, 'invariants fail when member 47 source still present');
    const ids = invariantResult.violations.map(v => v.id);
    assert(ids.includes('roadmap-source-absent'), 'roadmap-source-absent violation fired for bundle; violations: ' + JSON.stringify(invariantResult.violations));

    // Now remove member 47's source and confirm invariants pass
    fs.unlinkSync(path.join(tmpRoot, 'kaola-workflow', '.roadmap', 'issue-47.md'));
    const invariantResult2 = checkClosureInvariants(tmpRoot, receipt, archiveDest);
    assert(invariantResult2.ok === true, 'invariants pass after all member sources removed; violations: ' + JSON.stringify(invariantResult2.violations));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (5): roadmap-mirror-clean is row-anchored (#339) — cross-reference vs active row
// ---------------------------------------------------------------------------

(function testMirrorCleanCrossReference() {
  console.log('Test (5): roadmap-mirror-clean (#339) — cross-reference to #N in another row passes; active | #N | row violates');
  const tmpRoot = makeTmpRoot();
  try {
    initGitRepo(tmpRoot);

    const roadmapDir = path.join(tmpRoot, 'kaola-workflow');
    fs.mkdirSync(roadmapDir, { recursive: true });

    // Archive dest with a closed state file (so archive-state-closed passes)
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'issue-562');
    fs.mkdirSync(archiveDest, { recursive: true });
    fs.writeFileSync(path.join(archiveDest, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      'name: issue-562',
      'status: closed',
      'step: complete'
    ].join('\n') + '\n');

    // Single-issue receipt (no issue_numbers): issue #562 fully closed
    const receipt = {
      project: 'issue-562',
      issue_number: 562,
      archive: 'closed',
      roadmap_source_removed: 'removed',
      roadmap_regenerated: 'regenerated',
      remote_issue_closed: 'already_closed',
      claim_label_removed: 'removed',
      worktree_removed: 'missing',
      branch_removed: 'kept',
      claim_planner_attested: 'missing',
      finalize_contractor_attested: 'missing',
      warnings: []
    };

    const tableHeader =
      '# Kaola-Workflow Roadmap\n\n' +
      '| Issue | Title | Status | Project | Next Step |\n' +
      '|-------|-------|--------|---------|----------|\n';

    // Fixture A (AC1): the ONLY #562 mention is a legitimate cross-reference
    // inside ANOTHER issue's row (next_step cell of the #485 row).
    fs.writeFileSync(path.join(roadmapDir, 'ROADMAP.md'),
      tableHeader +
      '| #485 | layered rendering | open | issue-485 | place_inside (#562 opacity) |\n');
    const resA = checkClosureInvariants(tmpRoot, receipt, archiveDest);
    assert(resA.ok === true,
      '#339 A: cross-reference-only mirror must pass closure invariants; violations: ' + JSON.stringify(resA.violations));
    assert(!resA.violations.some(v => v.id === 'roadmap-mirror-clean'),
      '#339 A: no roadmap-mirror-clean violation for a cross-reference inside another row');

    // Fixture B (AC2): an actual active `| #562 | ...` row must still violate.
    fs.writeFileSync(path.join(roadmapDir, 'ROADMAP.md'),
      tableHeader +
      '| #485 | layered rendering | open | issue-485 | place_inside (#562 opacity) |\n' +
      '| #562 | opacity flag | active | issue-562 | TBD |\n');
    const resB = checkClosureInvariants(tmpRoot, receipt, archiveDest);
    assert(resB.ok === false,
      '#339 B: mirror with an active #562 row must fail closure invariants');
    assert(resB.violations.some(v => v.id === 'roadmap-mirror-clean'),
      '#339 B: roadmap-mirror-clean violation fires for an active row; violations: ' + JSON.stringify(resB.violations));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (#371): cmdRelease bundle path — clears the advisory claim for EVERY member
// (the per-member clearAdvisoryClaim loop had zero test references).
// ---------------------------------------------------------------------------
(function testReleaseBundleClearsEveryMember() {
  console.log('Test (#371): release bundle clears the advisory claim for every member');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile });

    const result = runFinalize(['release', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(result.status === 0, '#371 release: exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 release: advisory claim cleared for member ' + n + ', got: ' + JSON.stringify(calls));
    }
    // The active folder is gone (archived as discarded).
    const active = fs.readdirSync(path.join(tmpRoot, 'kaola-workflow')).filter(n => n.startsWith('bundle-42-47-53'));
    assert(active.length === 0, '#371 release: active bundle folder removed (discarded), got: ' + JSON.stringify(active));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371): cmdWatchPr bundle MERGED — per-member close buckets + truthful token.
// The watch-pr bundle MERGED path (per-member probe + closed/open buckets + `partial`
// token) had zero test references. This is also the planted-regression target: a
// change that drops a member from the receipt buckets fails here.
// ---------------------------------------------------------------------------
(function testWatchPrBundleMergedReceipt() {
  console.log('Test (#371): watch-pr bundle MERGED → per-member buckets + partial token');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53], { sink: 'pr', prUrl: 'https://example.test/pr/7' });
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    // PR merged; members 42 + 53 closed online, 47 still OPEN → partial.
    writeGhMockScript(binDir, { logFile, prState: 'MERGED', closedIssues: [42, 53] });

    const result = runFinalize(['watch-pr'], tmpRoot, binDir);
    assert(result.status === 0, '#371 watch-pr: exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const out = parseOutput(result);
    assert(out && Array.isArray(out.cleanups) && out.cleanups.length === 1, '#371 watch-pr: one cleanup emitted, got ' + JSON.stringify(out && out.cleanups));
    const r = out.cleanups[0].receipt;
    assert(JSON.stringify(r.issue_numbers) === JSON.stringify([42, 47, 53]), '#371 watch-pr: receipt.issue_numbers=[42,47,53], got ' + JSON.stringify(r.issue_numbers));
    assert(JSON.stringify(r.closed_issues) === JSON.stringify([42, 53]), '#371 watch-pr: closed_issues=[42,53], got ' + JSON.stringify(r.closed_issues));
    assert(JSON.stringify(r.open_issues) === JSON.stringify([47]), '#371 watch-pr: open_issues=[47] (member still open never silently dropped), got ' + JSON.stringify(r.open_issues));
    assert(r.remote_issue_closed === 'partial', '#371 watch-pr: truthful `partial` token (not skipped_offline), got ' + JSON.stringify(r.remote_issue_closed));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 watch-pr: advisory claim cleared for member ' + n + ', got ' + JSON.stringify(calls));
    }
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371): cmdWatchPr bundle CLOSED (PR closed unmerged) — abandoned archive,
// every member's advisory claim cleared, bundle receipt carries issue_numbers.
// ---------------------------------------------------------------------------
(function testWatchPrBundleClosed() {
  console.log('Test (#371): watch-pr bundle CLOSED → abandoned archive + per-member label clear');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53], { sink: 'pr', prUrl: 'https://example.test/pr/8' });
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile, prState: 'CLOSED' });

    const result = runFinalize(['watch-pr'], tmpRoot, binDir);
    assert(result.status === 0, '#371 watch-pr CLOSED: exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const out = parseOutput(result);
    assert(out && Array.isArray(out.cleanups) && out.cleanups.length === 1, '#371 watch-pr CLOSED: one cleanup, got ' + JSON.stringify(out && out.cleanups));
    assert(JSON.stringify(out.cleanups[0].receipt.issue_numbers) === JSON.stringify([42, 47, 53]),
      '#371 watch-pr CLOSED: receipt.issue_numbers preserved, got ' + JSON.stringify(out.cleanups[0].receipt.issue_numbers));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 watch-pr CLOSED: claim cleared for member ' + n);
    }
    // Live folder discarded (archived abandoned).
    const live = fs.readdirSync(path.join(tmpRoot, 'kaola-workflow')).filter(n => n === 'bundle-42-47-53');
    assert(live.length === 0, '#371 watch-pr CLOSED: live bundle folder archived, got ' + JSON.stringify(live));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371) crash interleaving (a): kill mid-label-loop after writeState leaves a
// live folder with partial labels; recovery via `release` must clear EVERY member's
// advisory claim (idempotent — clears all, regardless of which were added pre-crash).
// ---------------------------------------------------------------------------
(function testCrashRecoveryReleaseClearsAllMembers() {
  console.log('Test (#371) crash-a: release after a mid-claim crash clears every member');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    // Simulate the post-crash state: a live bundle folder exists (writeState ran) but
    // assume the label loop only got partway — release must still clear ALL members.
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile });

    const result = runFinalize(['release', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(result.status === 0, '#371 crash-a: release exit 0, got ' + result.status + '\nstderr: ' + (result.stderr || ''));
    const calls = readLog(logFile);
    for (const n of [42, 47, 53]) {
      assert(calls.includes('label-removed:' + n), '#371 crash-a: member ' + n + ' advisory claim cleared on recovery, got ' + JSON.stringify(calls));
    }
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371) crash interleaving (b): a finalize RE-RUN after a post-rename crash —
// the live source folder is already archived, so the second run must NOT crash and
// must NOT silently succeed-with-leaked-labels. Documents the actual recovery shape.
// ---------------------------------------------------------------------------
(function testCrashRecoveryFinalizeRerunAfterArchive() {
  console.log('Test (#371) crash-b: finalize re-run after the source folder is already archived');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { logFile, closedIssues: [42, 47, 53] });
    seedAdaptiveFinalizeFixture(tmpRoot, 'bundle-42-47-53');

    // First finalize: closes + archives the bundle.
    const first = runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(first.status === 0, '#371 crash-b: first finalize exit 0, got ' + first.status + '\nstderr: ' + (first.stderr || ''));
    const liveAfter = fs.readdirSync(path.join(tmpRoot, 'kaola-workflow')).filter(n => n === 'bundle-42-47-53');
    assert(liveAfter.length === 0, '#371 crash-b: first finalize archived the live folder, got ' + JSON.stringify(liveAfter));

    // Second finalize (the post-rename crash re-run): the live folder is gone. Must not crash
    // (graceful no-active-folder refusal), never a stack trace.
    const second = runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    assert(second.status !== null, '#371 crash-b: finalize re-run did not crash/timeout');
    assert(!/Error:|TypeError|at Object\.|at Module\./.test(second.stderr || ''),
      '#371 crash-b: finalize re-run is a graceful refusal, not an uncaught exception, got stderr: ' + (second.stderr || '').slice(0, 300));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#371): worktree-suppression posture — in-place (KAOLA_WORKTREE_NATIVE=0)
// finalize leaves NO `.worktrees/` provisioned for the bundle (posture contract).
// ---------------------------------------------------------------------------
(function testBundleWorktreePostureInPlace() {
  console.log('Test (#371): in-place finalize provisions no worktree for the bundle');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, 'bundle-42-47-53', 42, [42, 47, 53]);
    writeRoadmapFile(tmpRoot, 42); writeRoadmapFile(tmpRoot, 47); writeRoadmapFile(tmpRoot, 53);
    writeGhMockScript(binDir, { closedIssues: [42, 47, 53] });
    seedAdaptiveFinalizeFixture(tmpRoot, 'bundle-42-47-53');
    runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    const kwDir = path.join(tmpRoot, '.kw', 'worktrees');
    const hasWorktrees = fs.existsSync(kwDir) && fs.readdirSync(kwDir).length > 0;
    assert(!hasWorktrees, '#371 posture: NATIVE=0 in-place finalize provisions no worktree, got ' + (hasWorktrees ? fs.readdirSync(kwDir).join(',') : 'none'));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Test (#508): bundle merge-lane close-accounting — all-open case
//
// BUG: on the merge lane (--keep-worktree), when ALL members are open, the probe
// loop at line ~2175 computes remote_issue_closed='partial' (because
// closedIssues.length===0 !== issueNumbers.length===3, so the 'already_closed'
// arm misses and falls to the else). But closed_issues is [], so the token
// ('partial') disagrees with the list ([]): "some closed" vs "none".
//
// The #497 invariant: no remote member should be closed before sink-merge on the
// merge lane. The no-close assertion (no `issue close` calls) must hold.
//
// FIX: extend the ternary to add a close_pending arm when closedIssues.length===0:
//   closed_all → 'already_closed'
//   none_closed → 'close_pending'   ← the fix
//   some_closed → 'partial'          ← mixed, already-correct
// ---------------------------------------------------------------------------

(function testBundleMergeLaneAllOpenAccountingFix() {
  console.log('Test (#508): merge-lane --keep-worktree all-open bundle → remote_issue_closed:close_pending + closed_issues:[] + zero close calls');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  const project = 'bundle-496-497';
  try {
    initGitRepo(tmpRoot);
    writeBundleStateFile(tmpRoot, project, 496, [496, 497]);
    writeRoadmapFile(tmpRoot, 496);
    writeRoadmapFile(tmpRoot, 497);
    writeRoadmapMirror(tmpRoot, [496, 497]);

    // ALL members are OPEN on the forge (none in closedIssues).
    // Write a custom mock that also logs `issue close N` calls so we can assert none happen
    // on the --keep-worktree merge lane (#497 invariant: no pre-sink remote close).
    const customScript = [
      "'use strict';",
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const a = argv.join(" ");',
      'const logFile = ' + JSON.stringify(logFile) + ';',
      'function log(msg) {',
      '  try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {}',
      '}',
      '// repo view',
      'if (a.includes("repo view")) {',
      '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue close N (must NOT be called on --keep-worktree merge lane)',
      'if (a.match(/^issue close \\d+/)) {',
      '  const m = a.match(/issue close (\\d+)/);',
      '  const n = m ? m[1] : "?";',
      '  log("issue-close:" + n);',
      '  process.stdout.write("\\n");',
      '  process.exit(0);',
      '}',
      '// issue view N → open (all members are open)',
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const n = viewM[1];',
      '  process.stdout.write(JSON.stringify({number:parseInt(n),state:"open",title:"issue "+n,body:"",labels:[]}) + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue edit N --remove-label',
      'if (a.includes("issue edit") && a.includes("--remove-label")) {',
      '  const em = a.match(/issue edit (\\d+)/);',
      '  log("label-removed:" + (em ? em[1] : "?"));',
      '  process.exit(0);',
      '}',
      '// issue edit N --add-label',
      'if (a.includes("issue edit") && a.includes("--add-label")) { process.exit(0); }',
      '// issue comment N --body ...',
      'if (a.includes("issue comment")) {',
      '  const cm = a.match(/issue comment (\\d+)/);',
      '  log("comment:" + (cm ? cm[1] : "?"));',
      '  process.exit(0);',
      '}',
      '// label create',
      'if (a.includes("label create")) { process.exit(0); }',
      '// api repos/.../issues/N/comments => []',
      'if (a.includes("api") && a.includes("comments")) {',
      '  process.stdout.write("[]\\n");',
      '  process.exit(0);',
      '}',
      '// api --method DELETE',
      'if (a.includes("api") && a.includes("DELETE")) { process.exit(0); }',
      'process.stdout.write("\\n");',
      'process.exit(0);',
    ].join('\n');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'gh.js'), customScript);
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(
      ['finalize', '--project', project, '--keep-worktree'],
      tmpRoot, binDir
    );
    const out = parseOutput(result);

    assert(result.status === 0, '#508 merge-lane finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, '#508 finalize emits JSON');

    const receipt = out && out.closure_receipt;
    assert(receipt != null, '#508 receipt present');
    if (receipt) {
      // THE BUG: pre-fix, remote_issue_closed is 'partial' even though closed_issues=[]
      // POST-FIX: when all members are open (closed_issues=[]), token must be 'close_pending'
      assert(receipt.remote_issue_closed === 'close_pending',
        '#508: all-open merge-lane bundle must report remote_issue_closed=close_pending, got ' + JSON.stringify(receipt.remote_issue_closed));

      // closed_issues must be empty — no member was closed before sink-merge
      assert(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
        '#508: closed_issues must be [] on merge lane (no pre-sink close), got ' + JSON.stringify(receipt.closed_issues));

      // close_disposition must be close_pending (consistent with the token)
      assert(receipt.close_disposition === 'close_pending',
        '#508: close_disposition must be close_pending, got ' + JSON.stringify(receipt.close_disposition));

      // closure.closed must be empty
      const closure = out && out.closure_receipt && out.closure_receipt.closure;
      assert(Array.isArray(closure && closure.closed) && closure.closed.length === 0,
        '#508: closure.closed must be [] on merge lane, got ' + JSON.stringify(closure && closure.closed));
    }

    // #497 invariant: zero `issue close` calls (no pre-sink remote close)
    const calls = readLog(logFile);
    const closeCalls = calls.filter(c => c.startsWith('issue-close:'));
    assert(closeCalls.length === 0,
      '#508 #497-invariant: zero gh issue-close calls on --keep-worktree merge lane, got ' + JSON.stringify(closeCalls));

  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Test (#592): `--sink --issue-numbers A,B` (no `--issue`) must actually run the
// closure loop — not skip it. Pre-fix, the closure step's gate was
// `!OFFLINE && args.issue != null`; with only `--issue-numbers` (no `--issue`), the
// gate is false, the entire close loop is skipped, yet execution falls through to
// stepDone('closure') unconditionally — the receipt reports closure:done having
// closed zero issues, and status:sinked, while both issues remain open on the forge.
// Drives the real `--sink` transaction end to end (kaola-workflow-sink-merge.js) with
// a bare remote — the exact shape reported live on bundle-587-589.
// ---------------------------------------------------------------------------

(function testSinkIssueNumbersOnlyRunsClosureLoop() {
  console.log('Test (#592): --sink --issue-numbers A,B (no --issue) must close every member, not skip closure');
  const tmpRoot = makeTmpRoot();
  // The gh mock lives OUTSIDE the repo root — a mock file inside the repo would be
  // classified as foreign-dirt by the sink preflight and refuse before closure ever runs.
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink592-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const project = 'bundle-9601-9602';
  const branch = 'workflow/' + project;
  let remotePath = null;
  try {
    remotePath = initGitRepoWithBareRemote(tmpRoot);

    // A dedicated gh mock (mirrors simulate-workflow-walkthrough.js's #497-close style):
    // both issues start OPEN, `issue close N` is logged so the test can assert it was
    // actually ATTEMPTED (the pre-fix bug never calls it at all).
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'gh.js'), [
      "'use strict';",
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const a = argv.join(" ");',
      'const logFile = ' + JSON.stringify(logFile) + ';',
      'function log(msg) { try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
      'if (a.includes("repo view")) {',
      '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
      '  process.exit(0);',
      '}',
      // #619(2): the sink now probes `issue view --jq .state` on the CLOSE SUCCESS path too (not
      // just in the catch branch), so this mock must be STATEFUL — open until a matching `issue
      // close N` has actually been logged, then closed (mirrors real gh --jq output: a bare state
      // string, not a JSON blob). A constant 'open' would make the new post-close probe wrongly
      // bucket every real close as failed.
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const n = viewM[1];',
      '  let alreadyClosed = false;',
      '  try { alreadyClosed = fs.readFileSync(logFile, "utf8").split("\\n").includes("close:" + n); } catch (_) {}',
      '  process.stdout.write((alreadyClosed ? "closed" : "open") + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue close N --comment ... -> succeeds, logged as close:N',
      'const closeM = a.match(/^issue close (\\d+)/);',
      'if (closeM) {',
      '  log("close:" + closeM[1]);',
      '  process.stdout.write("\\n");',
      '  process.exit(0);',
      '}',
      '// issue edit N --remove-label -> logged as label-removed:N',
      'if (a.includes("issue edit") && a.includes("--remove-label")) {',
      '  const em = a.match(/issue edit (\\d+)/);',
      '  log("label-removed:" + (em ? em[1] : "?"));',
      '  process.exit(0);',
      '}',
      'process.stdout.write("\\n");',
      'process.exit(0);',
    ].join('\n'));

    // Feature branch carrying a deliverable — pushed upstream, mirrors the real sink shape.
    spawnSync('git', ['-C', tmpRoot, 'checkout', '-b', branch], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'push', '-u', 'origin', branch], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
    spawnSync('git', ['-C', tmpRoot, 'add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'commit', '-m', 'feat: deliverable'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'push', 'origin', branch], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'checkout', 'main'], { encoding: 'utf8' });

    // The bundle sink shape from the issue: --issue-numbers only, NO --issue.
    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', branch, '--project', project,
      '--issue-numbers', '9601,9602', '--sink', '--json',
    ], {
      cwd: tmpRoot,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
      }),
    });
    const out = parseOutput(result);

    assert(result.status === 0, '#592: --issue-numbers-only sink should exit 0 once closure genuinely runs and succeeds; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);

    // THE BUG: pre-fix, the close loop is gated on args.issue != null, so with only
    // --issue-numbers neither issue's `gh issue close` is ever invoked.
    const calls = readLog(logFile);
    const closeCalls = calls.filter(c => c.startsWith('close:'));
    assert(closeCalls.includes('close:9601'), '#592: issue 9601 close must be ATTEMPTED (bug: closure loop is skipped entirely when --issue is absent); calls=' + JSON.stringify(calls));
    assert(closeCalls.includes('close:9602'), '#592: issue 9602 close must be ATTEMPTED; calls=' + JSON.stringify(calls));

    // The receipt must record the actually-closed set (not report closure:done having
    // closed zero issues) so a resume can verify rather than skip.
    assert(out !== null, '#592: sink transaction emits JSON');
    const receipt = out && out.receipt;
    assert(receipt != null, '#592: output has an embedded receipt');
    if (receipt) {
      assert(receipt.steps && receipt.steps.closure === 'done', '#592: closure step reports done once it genuinely ran; got ' + JSON.stringify(receipt.steps));
      assert(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 2,
        '#592: receipt.closed_issues must record both actually-closed members, got ' + JSON.stringify(receipt.closed_issues));
      if (Array.isArray(receipt.closed_issues)) {
        assert(receipt.closed_issues.includes(9601) && receipt.closed_issues.includes(9602),
          '#592: receipt.closed_issues must include 9601 and 9602, got ' + JSON.stringify(receipt.closed_issues));
      }
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
    if (remotePath) fs.rmSync(remotePath, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// Issue #617 — a GitHub issue could be closed by cmdFinalize even though the merge sink (push to
// main) never actually ran; the recorded implementation commit never became an ancestor of main.
// ---------------------------------------------------------------------------

// (A) cmdFinalize's issue-close guard must derive merge-lane deferral from durable state (the
// `sink:` field), not solely from the caller remembering --keep-worktree.
(function testMergeLaneFinalizeDefersActualClose() {
  console.log('Test (#617 A): merge-lane finalize (sink:merge, no --keep-worktree) must NOT close an open issue online — defers to the merge sink');
  const tmpRoot = makeTmpRoot();
  const binDir = path.join(tmpRoot, 'bin');
  const logFile = path.join(tmpRoot, 'gh-calls.log');
  const project = 'issue-61701';
  try {
    initGitRepo(tmpRoot);
    writeSingleStateFile(tmpRoot, project, 61701);
    writeRoadmapFile(tmpRoot, 61701);
    writeRoadmapMirror(tmpRoot, [61701]);
    // Issue starts OPEN (never pre-closed) — a genuine close attempt is the observable bug.
    writeGhMockScript(binDir, { logFile });
    seedAdaptiveFinalizeFixture(tmpRoot, project);

    const result = runFinalize(['finalize', '--project', project], tmpRoot, binDir);
    const out = parseOutput(result);

    assert(result.status === 0, '#617 A: finalize exits 0; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, '#617 A: finalize emits JSON');

    const calls = readLog(logFile);
    assert(!calls.some(c => c.startsWith('close:')),
      '#617 A: merge-lane finalize (no --keep-worktree) must NOT call `gh issue close` before the merge sink runs; calls=' + JSON.stringify(calls));

    const receipt = out && out.closure_receipt;
    assert(receipt != null, '#617 A: closure_receipt present');
    assert(receipt && receipt.remote_issue_closed === 'close_pending',
      '#617 A: receipt.remote_issue_closed must be close_pending (deferred to the merge sink), got ' + JSON.stringify(receipt && receipt.remote_issue_closed));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// (B) the --sink transaction: closure must run AFTER push_main, never before. Proven with the
// existing KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL test hook — if closure ran before push_main (the
// pre-fix SINK_STEPS order), a forced push_main failure would still have already closed the issue.
(function testSinkTransactionClosureNeverBeforePushMain() {
  console.log('Test (#617 B): --sink transaction — closure must run AFTER push_main; a forced push_main failure must NOT have already closed the issue');
  const tmpRoot = makeTmpRoot();
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-sink617-mock-'));
  const logFile = path.join(binDir, 'gh-calls.log');
  const project = 'issue-61702';
  const branch = 'workflow/' + project;
  let remotePath = null;
  try {
    remotePath = initGitRepoWithBareRemote(tmpRoot);

    fs.writeFileSync(path.join(binDir, 'gh.js'), [
      "'use strict';",
      'const fs = require("fs");',
      'const argv = process.argv.slice(2);',
      'const a = argv.join(" ");',
      'const logFile = ' + JSON.stringify(logFile) + ';',
      'function log(msg) { try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
      'if (a.includes("repo view")) {',
      '  process.stdout.write(JSON.stringify({owner:{login:"test"},name:"repo"}) + "\\n");',
      '  process.exit(0);',
      '}',
      // #619(2): stateful — open until a matching `issue close N` has been logged (mirrors real
      // gh --jq bare-state output). Unreached in this test (FORCE_PUSH_MAIN_FAIL fails before
      // closure ever runs) but kept consistent with the #592 mock above for defensive correctness.
      'const viewM = a.match(/issue view (\\d+)/);',
      'if (viewM) {',
      '  const n = viewM[1];',
      '  let alreadyClosed = false;',
      '  try { alreadyClosed = fs.readFileSync(logFile, "utf8").split("\\n").includes("close:" + n); } catch (_) {}',
      '  process.stdout.write((alreadyClosed ? "closed" : "open") + "\\n");',
      '  process.exit(0);',
      '}',
      '// issue close N -> logged as close:N',
      'const closeM = a.match(/^issue close (\\d+)/);',
      'if (closeM) {',
      '  log("close:" + closeM[1]);',
      '  process.stdout.write("\\n");',
      '  process.exit(0);',
      '}',
      '// issue edit N --remove-label -> logged as label-removed:N',
      'if (a.includes("issue edit") && a.includes("--remove-label")) {',
      '  const em = a.match(/issue edit (\\d+)/);',
      '  log("label-removed:" + (em ? em[1] : "?"));',
      '  process.exit(0);',
      '}',
      'process.stdout.write("\\n");',
      'process.exit(0);',
    ].join('\n'));

    // Feature branch carrying a deliverable — pushed upstream, mirrors the real sink shape.
    spawnSync('git', ['-C', tmpRoot, 'checkout', '-b', branch], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'push', '-u', 'origin', branch], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmpRoot, 'DELIVERABLE.txt'), 'deliverable\n');
    spawnSync('git', ['-C', tmpRoot, 'add', 'DELIVERABLE.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'commit', '-m', 'feat: deliverable'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'push', 'origin', branch], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'checkout', 'main'], { encoding: 'utf8' });

    const result = spawnSync(process.execPath, [
      sinkMergeScript, '--branch', branch, '--project', project, '--issue', '61702', '--sink', '--json',
    ], {
      cwd: tmpRoot,
      encoding: 'utf8',
      timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_GH_MOCK_SCRIPT: path.join(binDir, 'gh.js'),
        KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL: '1',
      }),
    });
    const out = parseOutput(result);

    assert(result.status !== 0, '#617 B: forced push_main failure must exit non-zero; got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out && out.result === 'refuse' && out.reason === 'sink_incomplete' && out.step === 'push_main',
      '#617 B: refusal reason must be sink_incomplete at step push_main, got ' + JSON.stringify(out));

    const calls = readLog(logFile);
    assert(!calls.some(c => c.startsWith('close:')),
      '#617 B: closure must NEVER run before push_main succeeds — the issue must not be closed when push_main fails; calls=' + JSON.stringify(calls));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
    if (remotePath) fs.rmSync(remotePath, { recursive: true, force: true });
  }
})();

// (C) checkClosureInvariants — the remote-closed-after-publish invariant (declared in
// kaola-workflow-closure-contract.js, previously never evaluated) must fire when the recorded
// implementation commit is NOT an ancestor of the sink target, and clear once it actually is.
(function testRemoteClosedAfterPublishInvariant() {
  console.log('Test (#617 C): checkClosureInvariants — remote-closed-after-publish fires when the impl commit is not an ancestor of the sink target, clears once merged');
  const tmpRoot = makeTmpRoot();
  try {
    initGitRepo(tmpRoot);
    spawnSync('git', ['-C', tmpRoot, 'checkout', '-b', 'workflow/issue-61703'], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmpRoot, 'feature.txt'), 'feature\n');
    spawnSync('git', ['-C', tmpRoot, 'add', 'feature.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'commit', '-m', 'feat: unmerged'], { encoding: 'utf8' });
    const implSha = spawnSync('git', ['-C', tmpRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
    spawnSync('git', ['-C', tmpRoot, 'checkout', 'main'], { encoding: 'utf8' });

    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'issue-61703');
    fs.mkdirSync(archiveDest, { recursive: true });
    fs.writeFileSync(path.join(archiveDest, 'workflow-state.md'),
      '# Kaola-Workflow State\nname: issue-61703\nstatus: closed\nstep: complete\n');

    const receipt = {
      project: 'issue-61703', issue_number: 61703,
      archive: 'closed', roadmap_source_removed: 'absent', roadmap_regenerated: 'skipped',
      remote_issue_closed: 'closed', claim_label_removed: 'removed',
      worktree_removed: 'missing', branch_removed: 'kept',
      claim_planner_attested: 'missing', finalize_contractor_attested: 'missing', warnings: []
    };

    // Not yet merged — the invariant must fire.
    const bad = checkClosureInvariants(tmpRoot, receipt, archiveDest, { implRef: implSha, sinkTarget: 'main' });
    assert(bad.ok === false, '#617 C: closure invariants must fail when the impl commit is not an ancestor of the sink target; got ' + JSON.stringify(bad.violations));
    assert(bad.violations.some(v => v.id === 'remote-closed-after-publish'),
      '#617 C: remote-closed-after-publish violation must fire, got ' + JSON.stringify(bad.violations));
    assert(receipt.remote_closed_after_publish === 'failed',
      '#617 C: receipt.remote_closed_after_publish must be failed, got ' + receipt.remote_closed_after_publish);

    // Merge it — the SAME check must now pass.
    spawnSync('git', ['-C', tmpRoot, 'merge', '--no-ff', 'workflow/issue-61703', '-m', 'merge'], { encoding: 'utf8' });
    const receipt2 = Object.assign({}, receipt, { remote_closed_after_publish: undefined });
    const good = checkClosureInvariants(tmpRoot, receipt2, archiveDest, { implRef: implSha, sinkTarget: 'main' });
    assert(!good.violations.some(v => v.id === 'remote-closed-after-publish'),
      '#617 C: after the real merge, remote-closed-after-publish must NOT fire, got ' + JSON.stringify(good.violations));
    assert(receipt2.remote_closed_after_publish === 'verified',
      '#617 C: receipt.remote_closed_after_publish must be verified once actually merged, got ' + receipt2.remote_closed_after_publish);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// (D) the standalone `verify-sink` subcommand — an audit an operator can run independently —
// must detect an orphaned close: an archived (closed) project whose recorded branch was never
// actually merged into the sink target.
(function testVerifySinkDetectsOrphanedClose() {
  console.log('Test (#617 D): verify-sink subcommand detects an orphaned close (archived project, commit not an ancestor of the sink target)');
  const tmpRoot = makeTmpRoot();
  try {
    initGitRepo(tmpRoot);
    const project = 'issue-61704';
    // Unmerged feature branch — mirrors the incident: the implementation only ever landed on
    // the stale branch, never merged into main.
    spawnSync('git', ['-C', tmpRoot, 'checkout', '-b', 'workflow/' + project], { encoding: 'utf8' });
    fs.writeFileSync(path.join(tmpRoot, 'impl.txt'), 'implementation\n');
    spawnSync('git', ['-C', tmpRoot, 'add', 'impl.txt'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'commit', '-m', 'feat: unmerged implementation'], { encoding: 'utf8' });
    spawnSync('git', ['-C', tmpRoot, 'checkout', 'main'], { encoding: 'utf8' });

    // Archived + closed — active folder gone, archive present — but the branch was NEVER merged.
    const archiveDir = path.join(tmpRoot, 'kaola-workflow', 'archive', project);
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      'name: ' + project, 'status: closed', 'step: complete',
      '## Sink', 'branch: workflow/' + project, 'issue_number: 61704', 'sink: merge'
    ].join('\n') + '\n');

    const result = spawnSync(process.execPath, [claimScript, 'verify-sink', '--project', project], {
      cwd: tmpRoot, encoding: 'utf8', timeout: 30000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
    });
    const out = parseOutput(result);

    assert(result.status !== 0, '#617 D: verify-sink must exit non-zero for an orphaned close, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    assert(out !== null, '#617 D: verify-sink emits JSON');
    assert(out && out.ok === false, '#617 D: ok must be false, got ' + JSON.stringify(out));
    assert(out && Array.isArray(out.reasons) && out.reasons.includes('impl_commit_not_ancestor'),
      '#617 D: reasons must include impl_commit_not_ancestor, got ' + JSON.stringify(out && out.reasons));
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();

// ---------------------------------------------------------------------------
// #699: linked-worktree archive verification is recursive for epoch snapshots,
// including non-Markdown proof files. A dropped or tampered descendant must
// refuse before either live copy is removed.
// ---------------------------------------------------------------------------
(function testRecursiveEpochArchiveCompleteness() {
  console.log('Test (#699): verifyArchiveComplete recursively preserves epoch snapshots');
  const src = makeTmpRoot();
  const dest = makeTmpRoot();
  try {
    fs.writeFileSync(path.join(src, 'workflow-state.md'), 'status: closed\n');
    fs.mkdirSync(path.join(src, '.cache', 'epochs', '1', 'files', '.cache'), { recursive: true });
    fs.writeFileSync(path.join(src, '.cache', 'epochs', '1', 'manifest.json'), '{"manifest_self_digest":"fixture"}\n');
    fs.writeFileSync(path.join(src, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'), Buffer.from([0, 1, 2, 3]));
    fs.mkdirSync(path.join(dest, '.cache', 'epochs', '1', 'files', '.cache'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'workflow-state.md'), 'status: closed\n');
    fs.writeFileSync(path.join(dest, '.cache', 'epochs', '1', 'manifest.json'), '{"manifest_self_digest":"fixture"}\n');
    let checked = verifyArchiveComplete(src, dest);
    assert(checked.ok === false && checked.missing.some(p => p.endsWith('receipt.bin')),
      '#699: a missing non-md epoch receipt makes archive completeness fail, got ' + JSON.stringify(checked));
    fs.writeFileSync(path.join(dest, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'), Buffer.from([9, 9, 9, 9]));
    checked = verifyArchiveComplete(src, dest);
    assert(checked.ok === false && Array.isArray(checked.mismatched) && checked.mismatched.some(p => p.endsWith('receipt.bin')),
      '#699: a digest-mismatched epoch receipt makes archive completeness fail, got ' + JSON.stringify(checked));
    fs.copyFileSync(path.join(src, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'), path.join(dest, '.cache', 'epochs', '1', 'files', '.cache', 'receipt.bin'));
    checked = verifyArchiveComplete(src, dest);
    assert(checked.ok === true, '#699: byte-identical recursive epoch archive verifies, got ' + JSON.stringify(checked));
  } finally {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(dest, { recursive: true, force: true });
  }
})();

// #699: every archive caller shares one fail-closed success predicate. Only a
// completed archive or the idempotent source-missing retry is success; every
// partial, malformed, or absent result is a refusal.
(function testArchiveSuccessPredicate699() {
  assert(typeof archiveSucceeded === 'function', '#699: closure contract exports archiveSucceeded');
  if (typeof archiveSucceeded !== 'function') return;
  assert(archiveSucceeded({ archived: true }) === true, '#699: archived:true is archive success');
  assert(archiveSucceeded({ skipped: 'source-missing' }) === true, '#699: source-missing retry is archive success');
  for (const result of [null, undefined, {}, { archived: false }, { archive_incomplete: true },
    { snapshot_error: 'invalid' }, { skipped: 'other' }]) {
    assert(archiveSucceeded(result) === false,
      '#699: malformed/refused archive result fails closed: ' + JSON.stringify(result));
  }
})();

// #699: the canonical epoch-1 planless tuple is positive authority, not a
// missing-plan error. Archive it directly and prove the live folder is removed
// only after the shared verifier accepts the complete shape.
(function testCanonicalPlanlessEpochOneArchive699() {
  const root = makeTmpRoot();
  const project = 'issue-69901';
  const projectDir = path.join(root, 'kaola-workflow', project);
  try {
    initGitRepo(root);
    const anchors = buildClaimAnchors(root, {
      issue_number: 69901,
      branch: 'workflow/' + project,
      claim_ts: '2026-01-01T00:00:00Z',
      session_marker: 'bundle-finalize-699',
    });
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project,
      'status: active', '', '## Planning Evidence', 'plan_hash: none',
      'decision: none', 'first_node_id: none', 'first_node_role: none', '',
      '## Epoch Lineage', 'epoch_schema_version: ' + anchors.epoch_schema_version,
      'claim_repository_id: ' + anchors.claim_repository_id,
      'claim_identity_digest: ' + anchors.claim_identity_digest,
      'claim_root_object_format: ' + anchors.claim_root_object_format,
      'claim_root_base_commit: ' + anchors.claim_root_base_commit,
      'claim_root_base_tree: ' + anchors.claim_root_base_tree,
      'claim_root_base_digest: ' + anchors.claim_root_base_digest,
      'epoch_lineage_id: ' + anchors.epoch_lineage_id, 'plan_epoch: 1',
      'active_plan_hash: none', 'active_snapshot_manifest_digest: none', '',
      '## Sink', 'issue_number: 69901', 'branch: workflow/' + project, 'sink: merge',
      'main_root: ' + root, 'session_marker: bundle-finalize-699',
      'claim_ts: 2026-01-01T00:00:00Z', '',
    ].join('\n'));
    const result = archiveProjectDir(root, project, 'abandoned', '.planless');
    assert(result && result.archived === true && result.dest
      && !fs.existsSync(projectDir) && fs.existsSync(result.dest),
    '#699 canonical planless epoch-1 authority archives successfully, got ' + JSON.stringify(result));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('');
if (failed > 0) {
  console.error('test-bundle-finalize: ' + failed + ' test(s) FAILED, ' + passed + ' passed');
  process.exit(1);
} else {
  console.log('test-bundle-finalize: all ' + passed + ' tests passed');
  process.exit(0);
}
