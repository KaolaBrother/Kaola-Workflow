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
    'phase: adaptive',
    'phase_name: Adaptive',
    'workflow_path: adaptive',
    'runtime: claude',
    'step: start',
    'next_command: /kaola-workflow-plan-run ' + project,
    'next_skill: kaola-workflow-plan-run ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- workflow-plan',
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

// Write a single-issue workflow-state.md file.
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
    'phase: 1',
    'phase_name: Research',
    'workflow_path: full',
    'runtime: claude',
    'step: start',
    'next_command: /kaola-workflow-phase1 ' + project,
    'next_skill: kaola-workflow-research ' + project,
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- phase1-research',
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
const { checkClosureInvariants } = require('./kaola-workflow-claim');

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
// Test (2b) #369: partial-closure truthfulness — a member probed STILL OPEN while online lands in
// open_issues (never silently neither, AC2), the token is `partial` not `skipped_offline` (AC2),
// and the remote-members-closed invariant flags it warn-first-but-VISIBLE (AC4). Mutation proof:
// without #369 the open member vanished from every bucket and the token lied `skipped_offline`.
// ---------------------------------------------------------------------------

(function testBundleFinalizePartialOpenMember() {
  console.log('Test (2b) #369: partial close — member 47 still OPEN online → open_issues + partial token + invariant flagged');
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

    const result = runFinalize(['finalize', '--project', project], tmpRoot, binDir);
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
    }
    const inv = out && out.closure_invariants;
    assert(inv && inv.ok === false, '#369 AC4: closure_invariants.ok === false on a partial close');
    assert(inv && Array.isArray(inv.violations) && inv.violations.some(v => v.id === 'remote-members-closed'),
      '#369 AC4: remote-members-closed invariant flagged, got ' + JSON.stringify(inv && inv.violations));
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
    runFinalize(['finalize', '--project', 'bundle-42-47-53'], tmpRoot, binDir);
    const kwDir = path.join(tmpRoot, '.kw', 'worktrees');
    const hasWorktrees = fs.existsSync(kwDir) && fs.readdirSync(kwDir).length > 0;
    assert(!hasWorktrees, '#371 posture: NATIVE=0 in-place finalize provisions no worktree, got ' + (hasWorktrees ? fs.readdirSync(kwDir).join(',') : 'none'));
  } finally { fs.rmSync(tmpRoot, { recursive: true, force: true }); }
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
