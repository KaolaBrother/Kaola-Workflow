#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..', '..');

const sinkPr = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr'));
const claimScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js');

function run(script) {
  execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitea/scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function testFallbackGuardsAfterArchive() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-fallback-archive-'));
  try {
    // Arrange: live project files
    const liveDir = path.join(tmpRoot, 'kaola-workflow', 'fb-project');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '## Project\nname: fb-project\nstatus: active\n## Sink\nbranch: workflow/fb-project\nsink: pr\n');
    fs.writeFileSync(path.join(liveDir, 'phase6-summary.md'),
      '# Phase 6 Summary\n## Final Validation\nFinal Validation: pass\n');

    // Simulate cmdFinalize: archive the project dir
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive'), { recursive: true });
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'fb-project');
    fs.renameSync(liveDir, archiveDest);

    // Snapshot archive content before dispatch chain
    const snapshot = {};
    for (const f of fs.readdirSync(archiveDest)) {
      snapshot[f] = fs.readFileSync(path.join(archiveDest, f), 'utf8');
    }

    // Step 0: sink-merge on archived project — must exit 3, no live dir recreated
    const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
    const smResult = spawnSync(process.execPath,
      [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
    assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
    assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');

    // Step 1: cmdSinkFallback — archived project should return updated: false
    const fbResult = spawnSync(process.execPath,
      [claimScript, 'sink-fallback', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(fbResult.status, 0, 'sink-fallback should exit 0 on archived project');
    const fbParsed = JSON.parse(fbResult.stdout);
    assert.strictEqual(fbParsed.updated, false, 'updated should be false');
    assert.strictEqual(fbParsed.reason, 'project archived', 'reason should be project archived');
    assert(!fs.existsSync(liveDir), 'live dir must not be recreated by sink-fallback');

    // Step 2: appendSummary on archived path — should return false, not recreate dir
    const summaryFile = path.join(tmpRoot, 'kaola-workflow', 'fb-project', 'phase6-summary.md');
    const appendResult = sinkPr.appendSummary(summaryFile, 'https://gitea.example/repo/pulls/99', 99);
    assert.strictEqual(appendResult, false, 'appendSummary should return false on archived dir');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'fb-project')),
      'appendSummary must not recreate live dir');

    // Step 3: verify archive is byte-for-byte unchanged
    for (const [f, originalContent] of Object.entries(snapshot)) {
      const currentContent = fs.readFileSync(path.join(archiveDest, f), 'utf8');
      assert.strictEqual(currentContent, originalContent, `archive file ${f} must be unchanged`);
    }

    console.log('testFallbackGuardsAfterArchive: PASSED');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

testFallbackGuardsAfterArchive();

function _initGitRepo(root) {
  let r = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: root, encoding: 'utf8' });
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  r = spawnSync('git', ['add', 'README.md'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  r = spawnSync('git', ['commit', '-m', 'init'], { cwd: root, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
}

function _writeShimFiles(shimPath, jsLines) {
  fs.writeFileSync(shimPath + '.js', jsLines.join('\n'));
}

function _teaMockEnv(binDir) {
  const jsPath = path.join(binDir, 'tea.js');
  return fs.existsSync(jsPath) ? { KAOLA_TEA_MOCK_SCRIPT: jsPath } : {};
}

function _runClaimOnline(args, cwd, binDir) {
  const result = spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: {
      ...process.env,
      KAOLA_WORKFLOW_OFFLINE: '0',
      ..._teaMockEnv(binDir),
      PATH: binDir + path.delimiter + path.dirname(process.execPath) + path.delimiter + (process.env.PATH || '')
    }
  });
  assert(!result.signal, 'online claim killed: ' + result.signal + '\n' + result.stderr);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

function testAuditAndRepairLabels() {
  // (a) audit-labels: lists stale issues without removing
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-audit-labels-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      _initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      _writeShimFiles(path.join(binDir, 'tea'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issues edit') && a.includes('--remove-labels')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issues list')) {",
        "  process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = _runClaimOnline(['audit-labels'], tmp, binDir);
      assert(
        Array.isArray(result.stale) && result.stale.length === 1,
        'audit-labels must return stale array of length 1, got: ' + JSON.stringify(result.stale)
      );
      assert(
        result.count === 1,
        'audit-labels must return count:1, got: ' + result.count
      );
      assert(
        !fs.existsSync(marker),
        'audit-labels must NOT call --remove-labels (marker must not exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (b) repair-labels dry-run (no --execute): reports would_remove without removing
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-repair-labels-dry-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      _initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      _writeShimFiles(path.join(binDir, 'tea'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issues edit') && a.includes('--remove-labels')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issues list')) {",
        "  process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"url\":\"http://x\"}]\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = _runClaimOnline(['repair-labels'], tmp, binDir);
      assert(
        result.dry_run === true,
        'repair-labels without --execute must return dry_run:true, got: ' + result.dry_run
      );
      assert(
        Array.isArray(result.would_remove) && result.would_remove.length === 1,
        'repair-labels dry-run must return would_remove with 1 entry, got: ' + JSON.stringify(result.would_remove)
      );
      assert(
        !fs.existsSync(marker),
        'repair-labels dry-run must NOT call --remove-labels (marker must not exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  // (c) repair-labels --execute: removes the label and returns removed list
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-repair-labels-exec-'));
    const binDir = path.join(tmp, 'bin');
    const marker = path.join(tmp, 'label-removed.marker');
    try {
      _initGitRepo(tmp);
      fs.mkdirSync(binDir, { recursive: true });
      _writeShimFiles(path.join(binDir, 'tea'), [
        "const fs = require('fs');",
        "const a = process.argv.slice(2).join(' ');",
        "if (a.includes('issues edit') && a.includes('--remove-labels')) {",
        "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
        "  process.stdout.write('{}\\n');",
        "} else if (a.includes('issues list')) {",
        "  process.stdout.write('[{\"number\":99,\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"url\":\"http://x\"}]\\n');",
        "} else if (a.includes('repo view')) {",
        "  process.stdout.write('{\"full_name\":\"owner/repo\",\"html_url\":\"http://x\"}\\n');",
        "} else {",
        "  process.stdout.write('{}\\n');",
        "}"
      ]);
      const result = _runClaimOnline(['repair-labels', '--execute'], tmp, binDir);
      assert(
        result.dry_run === false,
        'repair-labels --execute must return dry_run:false, got: ' + result.dry_run
      );
      assert(
        Array.isArray(result.removed) && result.removed.includes(99),
        'repair-labels --execute must return removed containing 99, got: ' + JSON.stringify(result.removed)
      );
      assert(
        fs.existsSync(marker),
        'repair-labels --execute must call --remove-labels (marker must exist)'
      );
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  console.log('testAuditAndRepairLabels: PASSED');
}

function testRepairFastEscalation() {
  const repairScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js');

  // --- Assertion 1: ESCALATED fast → full/Phase1 ---
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-repair-fast-esc-'));
  try {
    const projectDir = path.join(tmp, 'kaola-workflow', 'fast-esc');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      '## Project',
      'name: fast-esc',
      'status: active',
      '## Current Position',
      'phase: fast',
      'phase_name: Fast',
      'workflow_path: fast',
      'next_command: /kaola-workflow-fast fast-esc',
      'next_skill: kaola-workflow-fast fast-esc',
      ''
    ].join('\n'));
    fs.writeFileSync(path.join(projectDir, 'fast-summary.md'),
      '# Fast Summary: fast-esc\n\n## Status\nESCALATED\n');

    const result = spawnSync(process.execPath, [repairScript, 'fast-esc'], {
      cwd: tmp,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0, 'gitea repair should exit 0 for ESCALATED fast, got: ' + result.status + ' stderr: ' + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.repaired, true, 'gitea repair must mark repaired:true for ESCALATED fast');
    const state = fs.readFileSync(path.join(projectDir, 'workflow-state.md'), 'utf8');
    assert.ok(state.includes('workflow_path: full'), 'gitea: ESCALATED fast must rewrite to workflow_path: full');
    assert.ok(state.includes('next_command: /kaola-workflow-phase1 fast-esc'), 'gitea: ESCALATED fast must route to /kaola-workflow-phase1');
    assert.ok(!state.includes('next_command: /kaola-workflow-fast'), 'gitea: rewritten state must not retain /kaola-workflow-fast');

    // --- Assertion 2 (negative control): non-ESCALATED fast → stays on /kaola-workflow-fast ---
    const project2Dir = path.join(tmp, 'kaola-workflow', 'fast-ok');
    fs.mkdirSync(project2Dir, { recursive: true });
    fs.writeFileSync(path.join(project2Dir, 'fast-summary.md'),
      '# Fast Summary: fast-ok\n\n## Status\nIN_PROGRESS\n');

    const result2 = spawnSync(process.execPath, [repairScript, 'fast-ok'], {
      cwd: tmp,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result2.status, 0, 'gitea repair should exit 0 for IN_PROGRESS fast');
    const state2 = fs.readFileSync(path.join(project2Dir, 'workflow-state.md'), 'utf8');
    assert.ok(state2.includes('next_command: /kaola-workflow-fast fast-ok'), 'gitea: IN_PROGRESS fast must still route to /kaola-workflow-fast');
    assert.ok(!state2.includes('workflow_path: full'), 'gitea: IN_PROGRESS fast must not redirect to full');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testRepairFastEscalation: PASSED');
}

testAuditAndRepairLabels();
testRepairFastEscalation();

// issue #227: adaptive-path port — toggle guard + routeAdaptive resume on the Gitea fork.
function testGiteaAdaptive() {
  const repairScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js');
  const valScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js');
  const PLAN = [
    '# Workflow Plan', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| e | code-explorer | — | — | 1 | sequence |',
    '| i | tdd-guide | e | lib/x.js | 1 | sequence |',
    '| r | code-reviewer | i | — | 1 | sequence |',
    '| d | finalize | r | — | 1 | sequence |', ''
  ].join('\n');
  function spawnNode(script, args, cwd, env) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }, env || {})
    });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-adaptive-'));
  try {
    fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
    let r = JSON.parse(spawnNode(claimScript, ['claim', '--project', 'issue-901', '--workflowPath', 'adaptive'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert.strictEqual(r.status, 'workflow_path_refused', 'gitea: OFF + adaptive claim must be a typed refusal');
    r = JSON.parse(spawnNode(claimScript, ['claim', '--project', 'issue-902', '--workflowPath', 'adaptive'], tmp, { KAOLA_ENABLE_ADAPTIVE: '1' }).stdout);
    assert.strictEqual(r.status, 'acquired', 'gitea: ON + adaptive claim must acquire');
    const claimedState = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-902', 'workflow-state.md'), 'utf8');
    assert.ok(/workflow_path: adaptive/.test(claimedState) && /next_command: \/kaola-workflow-plan-run issue-902/.test(claimedState),
      'gitea: adaptive claim state must route to plan-run');

    const pdir = path.join(tmp, 'kaola-workflow', 'issue-903');
    fs.mkdirSync(pdir, { recursive: true });
    const planPath = path.join(pdir, 'workflow-plan.md');
    fs.writeFileSync(planPath, PLAN);
    assert.strictEqual(spawnNode(valScript, [planPath, '--freeze'], tmp).status, 0, 'gitea: plan freeze must exit 0');
    assert.strictEqual(spawnNode(repairScript, ['issue-903'], tmp).status, 0, 'gitea: adaptive repair must exit 0');
    const repairedState = fs.readFileSync(path.join(pdir, 'workflow-state.md'), 'utf8');
    assert.ok(/next_command: \/kaola-workflow-plan-run issue-903/.test(repairedState), 'gitea: frozen plan must resume to plan-run');

    const tdir = path.join(tmp, 'kaola-workflow', 'issue-904');
    fs.mkdirSync(tdir, { recursive: true });
    const tplan = path.join(tdir, 'workflow-plan.md');
    fs.writeFileSync(tplan, PLAN);
    spawnNode(valScript, [tplan, '--freeze'], tmp);
    fs.writeFileSync(tplan, fs.readFileSync(tplan, 'utf8').replace('lib/x.js', 'lib/y.js'));
    assert.ok(/typed refusal/.test(spawnNode(repairScript, ['issue-904'], tmp).stdout), 'gitea: tampered plan must be a typed refusal');

    // 2026-06-03 audit fixes (I1): the gate-refusal behavior must hold on the FORK validator too,
    // since its classifier is a manual port. A1 finalize-sink code, A2 slashless root file, B1
    // decoy labels line outside ## Meta dropping G2.
    function gateVal(rows, label, rawDoc) {
      const p = path.join(tmp, 'gate-plan.md');
      const content = rawDoc !== undefined ? rawDoc : [
        '# Plan', '', '## Meta', 'labels: ' + label, '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
      ].concat(rows).concat(['']).join('\n');
      fs.writeFileSync(p, content);
      return JSON.parse(spawnNode(valScript, [p, '--json'], tmp).stdout);
    }
    assert.strictEqual(gateVal(['| e | code-explorer | — | — | 1 | sequence |', '| d | finalize | e | src/app.js | 1 | sequence |'], 'feature').result,
      'refuse', 'gitea A1: code on the finalize sink must refuse (G1)');
    assert.strictEqual(gateVal(['| n1 | doc-updater | — | Dockerfile | 1 | sequence |', '| d | finalize | n1 | — | 1 | sequence |'], 'chore').result,
      'refuse', 'gitea A2: slashless root file must require code-reviewer (G1)');
    assert.strictEqual(gateVal(null, null, [
      '# Plan', '', 'labels: chore', '', '## Meta', 'labels: security', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| n1 | tdd-guide | — | src/h.js | 1 | sequence |',
      '| rv | code-reviewer | n1 | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |', ''
    ].join('\n')).result, 'refuse', 'gitea B1: decoy labels line outside ## Meta must not drop G2');

    // issue #233 (audit B6): fan-out groups are scoped by (label, origin). Independent branches
    // reusing label `impl` (3+3) must NOT sum against FANOUT_CAP; a genuine single-origin over-cap
    // fan-out (5 under one parent) must still refuse.
    assert.strictEqual(gateVal([
      '| root1 | code-explorer | — | — | 1 | sequence |',
      '| root2 | code-explorer | — | — | 1 | sequence |',
      '| a1 | tdd-guide | root1 | aaa/1.js | 1 | fanout(impl) |',
      '| a2 | tdd-guide | root1 | bbb/1.js | 1 | fanout(impl) |',
      '| a3 | tdd-guide | root1 | ccc/1.js | 1 | fanout(impl) |',
      '| b1 | tdd-guide | root2 | ddd/1.js | 1 | fanout(impl) |',
      '| b2 | tdd-guide | root2 | eee/1.js | 1 | fanout(impl) |',
      '| b3 | tdd-guide | root2 | fff/1.js | 1 | fanout(impl) |',
      '| r | code-reviewer | a1,a2,a3,b1,b2,b3 | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitea B6: independent branches reusing a label must not sum against FANOUT_CAP');
    assert.strictEqual(gateVal([
      '| root | code-explorer | — | — | 1 | sequence |',
      '| i1 | tdd-guide | root | aaa/1.js | 1 | fanout(impl) |',
      '| i2 | tdd-guide | root | bbb/1.js | 1 | fanout(impl) |',
      '| i3 | tdd-guide | root | ccc/1.js | 1 | fanout(impl) |',
      '| i4 | tdd-guide | root | ddd/1.js | 1 | fanout(impl) |',
      '| i5 | tdd-guide | root | eee/1.js | 1 | fanout(impl) |',
      '| r | code-reviewer | i1,i2,i3,i4,i5 | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea B6 control: single-origin over-cap fan-out must still refuse');

    // issue #232 (audit A3): concurrent non-fanout siblings (same parent) writing the EXACT same
    // file must refuse; independent branches (no common ancestor) with identical writes must NOT.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | e | lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | e | lib/foo.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea A3: concurrent siblings writing the same file must refuse');
    assert.strictEqual(gateVal([
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | r2 | lib/foo.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea A3 (v3.20.1): independent-branch EXACT-file overlap is a clobber and must refuse');
    // CONTROL (no over-rotation): independent branches, DIFFERENT files same coarse area -> in-grammar.
    assert.strictEqual(gateVal([
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | src/aaa.js | 1 | sequence |',
      '| b | tdd-guide | r2 | src/bbb.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitea A3 control: independent branches with different files in the same area stay in-grammar');

    // issue #234 E1: a stale phaseN next_command on an adaptive project must reconcile to plan-run.
    const e1dir = path.join(tmp, 'kaola-workflow', 'issue-940');
    fs.mkdirSync(e1dir, { recursive: true });
    fs.writeFileSync(path.join(e1dir, 'workflow-state.md'), ['name: issue-940', 'issue_iid: 940', 'status: active', 'phase: adaptive', 'workflow_path: adaptive', 'next_command: /kaola-workflow-phase4 issue-940', ''].join('\n'));
    const e1 = JSON.parse(spawnNode(claimScript, ['resume', '--project', 'issue-940'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert.strictEqual(e1.next_command, '/kaola-workflow-plan-run issue-940', 'gitea E1: stale phaseN on an adaptive project must reconcile to plan-run');

    // issue #234 E2: a durable consent_halt in the Node Ledger surfaces on resume even with no state file.
    const e2dir = path.join(tmp, 'kaola-workflow', 'issue-941');
    fs.mkdirSync(e2dir, { recursive: true });
    const e2plan = path.join(e2dir, 'workflow-plan.md');
    fs.writeFileSync(e2plan, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| done | finalize | — | — | 1 | sequence |', '', '## Node Ledger', '', '| id | status |', '|---|---|', '| done | pending |', 'consent_halt: pending', ''].join('\n'));
    spawnNode(valScript, [e2plan, '--freeze'], tmp);
    spawnNode(repairScript, ['issue-941'], tmp);
    assert.ok(/consent-halt-surface/.test(fs.readFileSync(path.join(e2dir, 'workflow-state.md'), 'utf8')),
      'gitea E2: durable Node-Ledger consent must surface on resume with no prior workflow-state.md');

    // issue #235 D8: hard authoring guard — OFF refuses, ON allows (toggle read at the authoring entry).
    let ar = JSON.parse(spawnNode(claimScript, ['authoring-allowed', '--project', 'issue-960'], tmp, { KAOLA_ENABLE_ADAPTIVE: '0' }).stdout);
    assert.strictEqual(ar.status, 'authoring_refused', 'gitea D8: authoring under an OFF switch must refuse');
    ar = JSON.parse(spawnNode(claimScript, ['authoring-allowed', '--project', 'issue-960'], tmp, { KAOLA_ENABLE_ADAPTIVE: '1' }).stdout);
    assert.strictEqual(ar.status, 'authoring_allowed', 'gitea D8: authoring under an ON switch must be allowed');

    // v3.20.1 (adversarial-review follow-ups): the fork validator must carry the same fixes.
    // Fix #3 — independent-branch exact-file overlap must refuse (was a #233 regression).
    assert.strictEqual(gateVal([
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | src/foo.js | 1 | fanout(impl) |',
      '| b | tdd-guide | r2 | src/foo.js | 1 | fanout(impl) |',
      '| rv | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea v3.20.1 #3: independent-branch exact-file overlap must refuse');
    // Fix #1 + #2 — pure barrierCheck on the fork validator.
    const fv = require(valScript);
    const mkL = (nodes, ledger, lbl) => ['# Plan', '', '## Meta', 'labels: ' + (lbl || 'chore'), '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|']
      .concat(nodes).concat(['', '## Node Ledger', '', '| id | status |', '|---|---|']).concat(ledger).join('\n');
    const naT = mkL(['| imp | tdd-guide | — | src/auth/session.js | 1 | sequence |', '| sec | security-reviewer | imp | — | 1 | sequence |', '| done | finalize | sec | — | 1 | sequence |'], ['| imp | n/a |', '| sec | n/a |', '| done | complete |'], 'security');
    assert.strictEqual(fv.barrierCheck(naT, ['src/auth/session.js'], {}).result, 'refuse', 'gitea v3.20.1 #1: n/a-target sensitive write must refuse');
    const cleanL = mkL(['| imp | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | imp | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| imp | complete |', '| rv | complete |', '| done | complete |'], 'refactor');
    assert.strictEqual(fv.barrierCheck(cleanL, ['test/login.test.js'], {}).result, 'pass', 'gitea v3.20.1 #2: tests-only sensitive-named path must NOT refuse');

    // v3.21.0 #238: the FORK classifier carries the curated-root claim-overlap (yellow) + ./ canon.
    const fcl = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js'));
    const cdir = path.join(tmp, 'kaola-workflow', 'curated-claimed-238');
    fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, 'workflow-plan.md'), ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | Dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |', ''].join('\n'));
    const fr238 = fcl.classify({ body: 'this change also edits the Dockerfile build stage' }, [{ project: 'curated-claimed-238', project_dir: cdir }]);
    assert.strictEqual(fr238.verdict, 'yellow', 'gitea #238: curated root (Dockerfile) overlap must be yellow, got ' + JSON.stringify(fr238));
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | e | ./lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | e | lib//foo.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea v3.21.0: ./lib/foo.js vs lib//foo.js is the same file and must refuse as a clobber');

    // v3.21.0 #239: per-instance own-lane barrier on the FORK validator.
    const perInst = mkL(['| a | tdd-guide | — | aaa/x.js | 1 | fanout(impl) |', '| b | tdd-guide | — | bbb/y.js | 1 | fanout(impl) |', '| rv | code-reviewer | a,b | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| a | complete |', '| b | complete |', '| done | complete |'], 'enhancement');
    assert.strictEqual(fv.barrierCheck(perInst, ['aaa/x.js', 'bbb/y.js'], { nodeId: 'a' }).result, 'refuse', 'gitea #239: per-node overflow into sibling lane must refuse');
    assert.strictEqual(fv.barrierCheck(perInst, ['aaa/x.js'], { nodeId: 'a' }).result, 'pass', 'gitea #239: per-node own-lane must pass');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testGiteaAdaptive: PASSED');
}

// issue #237: the leading-dot FILE_PATH_REGEX widening must hold on the FORK classifier too —
// a dot-leading CI/supply-chain path is captured (so cross-project claim-overlap can see it on
// both the candidate and claimed sides) while bare-word prose still does not over-match.
function testGitea237DotPathExtraction() {
  const classifier = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-classifier.js'));
  const got = classifier.extractFilePaths('this issue rewrites .github/workflows/deploy.yml for CI');
  assert.ok(got.has('.github/workflows/deploy.yml'),
    'gitea #237: dot-leading CI path must be extracted, got: ' + JSON.stringify([...got]));
  const prose = classifier.extractFilePaths('use Node.js version 3.19.1 with package.json and config.json');
  assert.strictEqual(prose.size, 0,
    'gitea #237: bare-word prose must NOT over-match into paths, got: ' + JSON.stringify([...prose]));
  console.log('testGitea237DotPathExtraction: PASSED');
}
testGiteaAdaptive();
testGitea237DotPathExtraction();

run('test-gitea-forge-helpers.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');

console.log('Gitea workflow walkthrough simulation passed');
