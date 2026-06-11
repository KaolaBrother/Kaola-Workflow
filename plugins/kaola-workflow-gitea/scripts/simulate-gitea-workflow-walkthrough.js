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

function tail30(str) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - 30)).join('\n');
}

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitea/scripts', script)], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe'
    });
  } catch (err) {
    process.stderr.write('\n--- CHILD FAILURE: ' + script + ' ---\n');
    const out = tail30(err.stdout);
    if (out.trim()) process.stderr.write('stdout (last 30 lines):\n' + out + '\n');
    const errOut = tail30(err.stderr);
    if (errOut.trim()) process.stderr.write('stderr (last 30 lines):\n' + errOut + '\n');
    process.stderr.write('--- END CHILD OUTPUT ---\n');
    throw err;
  }
}

function testFallbackGuardsAfterArchive() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-fallback-archive-'));
  try {
    // Arrange: live project files
    const liveDir = path.join(tmpRoot, 'kaola-workflow', 'fb-project');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '## Project\nname: fb-project\nstatus: active\n## Sink\nbranch: workflow/fb-project\nsink: pr\n');
    fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'),
      '# Finalization Summary\n## Final Validation\nFinal Validation: pass\n');

    // Simulate cmdFinalize: archive the project dir
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive'), { recursive: true });
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'fb-project');
    fs.renameSync(liveDir, archiveDest);

    // #394: snapshot the summary BEFORE the chain (the state file is now LEGITIMATELY mutated by
    // sink-fallback — it records the fallback in the archive so the chain has a home).
    const summarySnapshot = fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8');

    // Step 0: sink-merge on archived project — must exit 3, no live dir recreated.
    // #394: it now writes a fallback receipt to the ARCHIVE .cache (was "skipping receipt write").
    const sinkScript = path.join(__dirname, 'kaola-gitea-workflow-sink-merge.js');
    const smResult = spawnSync(process.execPath,
      [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
    assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
    assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');
    assert(fs.existsSync(path.join(archiveDest, '.cache', 'sink-fallback.json')),
      '#394: sink-merge writes the fallback receipt to the archive .cache');

    // Step 1: cmdSinkFallback — #394: archived project now OPERATES on the archived state (records
    // the fallback there) instead of the old no-op. Returns updated:true + archived:true.
    const fbResult = spawnSync(process.execPath,
      [claimScript, 'sink-fallback', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(fbResult.status, 0, 'sink-fallback should exit 0 on archived project');
    const fbParsed = JSON.parse(fbResult.stdout);
    assert.strictEqual(fbParsed.updated, true, '#394: sink-fallback now updates the archived state');
    assert.strictEqual(fbParsed.archived, true, '#394: sink-fallback reports it operated on the archive');
    assert.strictEqual(fbParsed.sink, 'pr', '#394: sink recorded as pr in the archived state');
    assert(!fs.existsSync(liveDir), 'live dir must not be recreated by sink-fallback');
    // #394: the archived state still reads sink: pr (the sink line is rewritten on the archived copy).
    const archivedStateAfter = fs.readFileSync(path.join(archiveDest, 'workflow-state.md'), 'utf8');
    assert(/^sink: pr$/m.test(archivedStateAfter), '#394: the archived state keeps sink: pr after the fallback rewrite');

    // Step 2: appendSummary on the (absent) LIVE path — should return false, not recreate dir.
    const summaryFile = path.join(tmpRoot, 'kaola-workflow', 'fb-project', 'finalization-summary.md');
    const appendResult = sinkPr.appendSummary(summaryFile, 'https://gitea.example/repo/pulls/99', 99);
    assert.strictEqual(appendResult, false, 'appendSummary should return false on absent live dir');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'fb-project')),
      'appendSummary must not recreate live dir');

    // Step 3: the archived SUMMARY stays byte-unchanged (only workflow-state.md is the #394 target).
    assert.strictEqual(fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8'), summarySnapshot,
      'archive finalization-summary.md must be unchanged');

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

// issue #283: repair-state must use finalization-summary.md (not phase6-summary.md) as the
// completion signal, emit stage: finalization / stage_name: Finalization / next_command:
// /kaola-workflow-finalize for the terminal routine, and the one-way migration must convert
// a legacy active folder (phase6-summary.md→finalization-summary.md, state fields rewritten).
function testRepairFinalizationRoute() {
  const repairScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-repair-state.js');
  const { reconstruct } = require(repairScript);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-repair-finalization-'));
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.mkdirSync(workflowDir, { recursive: true });

  function writeProject(projectName, files) {
    const projectDir = path.join(workflowDir, projectName);
    fs.mkdirSync(projectDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(projectDir, name), content);
    }
  }

  function readState(projectName) {
    return fs.readFileSync(path.join(workflowDir, projectName, 'workflow-state.md'), 'utf8');
  }

  try {
    // --- R1: finalization-summary.md present → reconstruct reports complete ---
    writeProject('fin-complete', {
      'finalization-summary.md': '# Finalization Summary\n'
    });
    const finComplete = reconstruct(tmp, workflowDir, 'fin-complete');
    assert.ok(finComplete.complete === true,
      'R1: finalization-summary.md must be the completion signal, got: ' + JSON.stringify(finComplete));

    // --- R2: ONLY phase6-summary.md present → reconstruct must NOT report complete ---
    writeProject('legacy-complete', {
      'phase6-summary.md': '# Phase 6 Summary\n'
    });
    const legacyComplete = reconstruct(tmp, workflowDir, 'legacy-complete');
    assert.ok(legacyComplete.complete !== true,
      'R2: phase6-summary.md alone must NOT be the completion signal (hard-removed), got: ' + JSON.stringify(legacyComplete));

    // --- R3: phase5-review.md present (with compliance) → state must use finalization names ---
    const phase5Content = [
      '# Phase 5 - Review: fin-route',
      '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-reviewer | subagent-invoked | .cache/review.md | |',
      ''
    ].join('\n');
    writeProject('fin-route', {
      'phase5-review.md': phase5Content,
      'phase4-progress.md': [
        '# Phase 4',
        '## Tasks',
        '| # | Task | Status |',
        '|---|------|--------|',
        '| 1 | done | complete |',
        ''
      ].join('\n')
    });
    const r3 = spawnSync(process.execPath, [repairScript, 'fin-route'], {
      cwd: tmp,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(r3.status, 0, 'R3: repair must exit 0 for fin-route, stderr: ' + r3.stderr);
    const finRouteState = readState('fin-route');
    assert.ok(finRouteState.includes('stage: finalization'),
      'R3: repair must emit stage: finalization for terminal routine, got state:\n' + finRouteState);
    assert.ok(finRouteState.includes('stage_name: Finalization'),
      'R3: repair must emit stage_name: Finalization for terminal routine, got state:\n' + finRouteState);
    assert.ok(finRouteState.includes('next_command: /kaola-workflow-finalize fin-route'),
      'R3: repair must emit next_command: /kaola-workflow-finalize, got state:\n' + finRouteState);
    assert.ok(!finRouteState.includes('phase: 6'),
      'R3: repair must NOT emit phase: 6, got state:\n' + finRouteState);
    assert.ok(!finRouteState.includes('next_command: /kaola-workflow-phase6'),
      'R3: repair must NOT emit /kaola-workflow-phase6, got state:\n' + finRouteState);

    // --- R4: one-way migration converts legacy active folder ---
    writeProject('legacy-active', {
      'phase6-summary.md': '# Phase 6 Summary\nLegacy content\n',
      'workflow-state.md': [
        '# Kaola-Workflow State',
        '## Project',
        'name: legacy-active',
        'status: active',
        '## Current Position',
        'phase: 6',
        'phase_name: Finalize',
        'step: some-step',
        'task: N/A',
        'next_command: /kaola-workflow-phase6 legacy-active',
        'next_skill: kaola-workflow-finalize legacy-active',
        ''
      ].join('\n')
    });
    const r4 = spawnSync(process.execPath, [repairScript, 'legacy-active'], {
      cwd: tmp,
      encoding: 'utf8',
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(r4.status, 0, 'R4: repair must exit 0 for legacy-active, stderr: ' + r4.stderr);
    const migratedDir = path.join(workflowDir, 'legacy-active');
    assert.ok(!fs.existsSync(path.join(migratedDir, 'phase6-summary.md')),
      'R4: migration must remove phase6-summary.md from active folder');
    assert.ok(fs.existsSync(path.join(migratedDir, 'finalization-summary.md')),
      'R4: migration must create finalization-summary.md in active folder');
    const migratedState = readState('legacy-active');
    assert.ok(!migratedState.includes('phase: 6'),
      'R4: migrated state must not contain phase: 6, got:\n' + migratedState);
    assert.ok(!migratedState.includes('next_command: /kaola-workflow-phase6'),
      'R4: migrated state must not contain /kaola-workflow-phase6, got:\n' + migratedState);

  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testRepairFinalizationRoute: PASSED');
}

// issue #283: sink-pr must read/write finalization-summary.md (not phase6-summary.md).
function testSinkPrUsesFinalizationSummary() {
  const sinkPrScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-sink-pr.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-sink-pr-fin-'));
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    execFileSync('git', ['-C', tmp, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', tmp, 'config', 'user.name', 'Test User'], { encoding: 'utf8', stdio: 'pipe' });
    const kwDir = path.join(tmp, 'kaola-workflow', 'issue-2830');
    fs.mkdirSync(kwDir, { recursive: true });
    fs.writeFileSync(path.join(kwDir, 'workflow-state.md'), [
      '# Kaola-Workflow State',
      '## Project',
      'name: issue-2830',
      'status: active',
      '## Sink',
      'branch: workflow/issue-2830',
      'issue_number: 2830',
      'sink: pr',
      ''
    ].join('\n'));
    // Plant finalization-summary.md (the new canonical file)
    fs.writeFileSync(path.join(kwDir, 'finalization-summary.md'), '# Finalization Summary\n');
    execFileSync('git', ['-C', tmp, 'add', '-A'], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', tmp, 'commit', '-m', 'initial'], { encoding: 'utf8', stdio: 'pipe' });

    const result = spawnSync(process.execPath, [
      sinkPrScript,
      '--branch', 'workflow/issue-2830',
      '--project', 'issue-2830',
      '--issue', '2830'
    ], {
      cwd: tmp,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0,
      'sink-pr (finalization-summary) offline should exit 0, got ' + result.status + '. stderr: ' + result.stderr);

    // finalization-summary.md must exist and contain PR URL
    const finSummaryPath = path.join(kwDir, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'sink-pr must write to finalization-summary.md, not phase6-summary.md');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(finContent.includes('PR URL:'),
      'finalization-summary.md must contain PR URL after sink-pr, got: ' + finContent);

    // phase6-summary.md must NOT be created
    assert.ok(!fs.existsSync(path.join(kwDir, 'phase6-summary.md')),
      'sink-pr must NOT create phase6-summary.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testSinkPrUsesFinalizationSummary: PASSED');
}

testRepairFinalizationRoute();
testSinkPrUsesFinalizationSummary();

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
    assert.ok(/^run_posture: (worktree|in-place)$/m.test(claimedState),
      'M4 (#277): gitea adaptive claim state must contain run_posture: worktree or in-place');

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
    // reusing label `impl` (3+3) must NOT sum into one group. #303: a single-origin over-cap
    // fan-out (5 under one parent) is now IN-GRAMMAR — FANOUT_CAP is a runtime concurrency limit,
    // not a planning validity cap (write-role fan-out still demotes the decision to ask).
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
    ], 'enhancement').result, 'in-grammar', 'gitea B6 control (#303): single-origin over-cap fan-out is in-grammar (runtime concurrency limit, not validity cap)');

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

    // issue #340: the two freeze-time write-set completeness checks on the GITEA edition-named
    // port (carries pre-existing #294 drift — port-level asserts are load-bearing). Mech 2 (A4/A5)
    // is a pure graph check (no anchor); mech 1 (A1/A2) is anchor-gated to the repo.
    // A4 (mech-2 refusal): a port parallel to its root-editing node must refuse.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| rootedit | tdd-guide | e | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| port | implementer | e | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 1 | sequence |',
      '| rv | code-reviewer | rootedit,port | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea #340 A4: a port parallel to its root edit must refuse (forge-port ordering gap)');
    // A5 (mech-2 positive): the same port downstream of all its root edits is in-grammar.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| rootedit | tdd-guide | e | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| port | implementer | rootedit | plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js | 1 | sequence |',
      '| rv | code-reviewer | port | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitea #340 A5: a port downstream of all its root edits is in-grammar');
    // A1 (mech-1 refusal): with the anchor planted, an agent add omitting the surface must refuse
    // naming the surface; A2: without the anchor the check is inert (in-grammar).
    {
      fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'scripts', 'validate-vendored-agents.js'), '// anchor\n');
      const a1 = gateVal([
        '| scout | implementer | e | agents/new-scout.md | 1 | sequence |',
        '| e | code-explorer | — | — | 1 | sequence |',
        '| rv | code-reviewer | scout | — | 1 | sequence |',
        '| d | finalize | rv | — | 1 | sequence |',
      ], 'enhancement');
      const a1err = (a1.errors || []).join('\n');
      assert.ok(a1.result === 'refuse' && /agent-registration gap:.*validate-vendored-agents\.js/.test(a1err) && /agent-registration gap:.*uninstall\.sh/.test(a1err),
        'gitea #340 A1: agent add omitting the surface must refuse naming validate-vendored-agents.js + uninstall.sh, got ' + JSON.stringify(a1));
      fs.rmSync(path.join(tmp, 'scripts', 'validate-vendored-agents.js'));
      const a2 = gateVal([
        '| scout | implementer | e | agents/new-scout.md | 1 | sequence |',
        '| e | code-explorer | — | — | 1 | sequence |',
        '| rv | code-reviewer | scout | — | 1 | sequence |',
        '| d | finalize | rv | — | 1 | sequence |',
      ], 'enhancement');
      assert.strictEqual(a2.result, 'in-grammar', 'gitea #340 A2: without the anchor the mech-1 check must be inert');
    }

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
    // v3.21.0: the candidate-side detector must normalize sentence punctuation (trailing '.', leading
    // './') before exact membership, else the fork classifier+schema chain fails open to green.
    for (const body of ['this change also edits the Dockerfile. plus src/server.js', 'tweak ./Dockerfile and src/server.js']) {
      const fr = fcl.classify({ body }, [{ project: 'curated-claimed-238', project_dir: cdir }]);
      assert.strictEqual(fr.verdict, 'yellow', 'gitea #238/v3.21.0: punctuated curated overlap must be yellow ("' + body + '"), got ' + JSON.stringify(fr));
    }
    // F9 (v3.21.0): the CLAIMED-PROSE side (extractCuratedRootPaths over phase3 prose, NOT the
    // structured fold) must also detect a curated overlap. The fork classifier is a hand-port
    // (non-identical to root), so this is NOT transitively covered — guard it directly. The prose is
    // punctuated ("Dockerfile.") so it also covers the claimed-side normalization.
    const pdir238 = path.join(tmp, 'kaola-workflow', 'prose-curated-238');
    fs.mkdirSync(pdir238, { recursive: true });
    fs.writeFileSync(path.join(pdir238, 'phase3-plan.md'), '# Phase 3\nWe will edit the Dockerfile.\n');
    const frProse = fcl.classify({ body: 'this change also edits the Dockerfile and src/app.js' }, [{ project: 'prose-curated-238', project_dir: pdir238 }]);
    assert.strictEqual(frProse.verdict, 'yellow', 'gitea F9: claimed-PROSE curated overlap must be yellow, got ' + JSON.stringify(frProse));
    // v3.21.0 re-gate#3: the structured-claimed fold must CANONICALIZE — a lowercase `dockerfile`
    // declaration must intersect a canonical `Dockerfile` candidate (mutation-covers fork classifier:337).
    const lcdir = path.join(tmp, 'kaola-workflow', 'lc-curated-238');
    fs.mkdirSync(lcdir, { recursive: true });
    fs.writeFileSync(path.join(lcdir, 'workflow-plan.md'), ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |', ''].join('\n'));
    const frLc = fcl.classify({ body: 'this change also edits the Dockerfile build stage' }, [{ project: 'lc-curated-238', project_dir: lcdir }]);
    assert.strictEqual(frLc.verdict, 'yellow', 'gitea v3.21.0: lowercase structured curated declaration must intersect canonical candidate, got ' + JSON.stringify(frLc));
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

    // #334: non-delegable main-session-gate on the FORK validator.
    // in-grammar control: a post-dominating gate freezes.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| imp | implementer | e | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | imp | — | 1 | sequence |',
      '| vgate | main-session-gate | rv | — | 1 | sequence |',
      '| d | finalize | vgate | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitea #334: a post-dominating main-session-gate is in-grammar');
    // G3 freeze refusal: a side-branch gate (does not post-dominate impl).
    { const g3v = gateVal([
        '| e | code-explorer | — | — | 1 | sequence |',
        '| imp | implementer | e | lib/foo.js | 1 | sequence |',
        '| rv | code-reviewer | imp | — | 1 | sequence |',
        '| vgate | main-session-gate | e | — | 1 | sequence |',
        '| d | finalize | rv,vgate | — | 1 | sequence |',
      ], 'enhancement');
      assert.strictEqual(g3v.result, 'refuse', 'gitea #334: side-branch gate must refuse');
      assert.ok(/G3/.test((g3v.errors || []).join(';')), 'gitea #334: side-branch gate refusal names G3'); }
    // read-only refusal: a gate declaring a write set.
    assert.strictEqual(gateVal([
      '| imp | implementer | — | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | imp | — | 1 | sequence |',
      '| vgate | main-session-gate | rv | lib/bar.js | 1 | sequence |',
      '| d | finalize | vgate | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea #334: a main-session-gate write set must refuse (read-only)');
    // shape refusal: a gate as a fan-out member.
    assert.strictEqual(gateVal([
      '| imp | implementer | — | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | imp | — | 1 | sequence |',
      '| g1 | main-session-gate | rv | — | 1 | fanout(gates) |',
      '| g2 | main-session-gate | rv | — | 1 | fanout(gates) |',
      '| d | finalize | g1,g2 | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitea #334: a main-session-gate fan-out member must refuse (shape)');
    // G3 runtime: impl complete + gate PENDING -> verifyGateExecution unsatisfied + --gate-verify exit 1.
    const g3Nodes = ['| imp | implementer | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | imp | — | 1 | sequence |', '| vgate | main-session-gate | rv | — | 1 | sequence |', '| d | finalize | vgate | — | 1 | sequence |'];
    const g3Pending = mkL(g3Nodes, ['| imp | complete |', '| rv | complete |', '| vgate | pending |', '| d | pending |'], 'chore');
    assert.strictEqual(fv.verifyGateExecution(g3Pending, {}).ok, false, 'gitea #334: impl complete + gate pending must be unsatisfied (regression scenario)');
    { const projDir = path.join(tmp, 'kaola-workflow', 'issue-334-gt'); fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
      const gp = path.join(projDir, 'workflow-plan.md');
      fs.writeFileSync(gp, g3Pending);
      assert.strictEqual(spawnNode(valScript, [gp, '--gate-verify', '--json'], tmp).status, 1, 'gitea #334: --gate-verify exit 1 when gate pending');
      // n/a -> exit 1.
      fs.writeFileSync(gp, mkL(g3Nodes, ['| imp | complete |', '| rv | complete |', '| vgate | n/a |', '| d | complete |'], 'chore'));
      assert.strictEqual(spawnNode(valScript, [gp, '--gate-verify', '--json'], tmp).status, 1, 'gitea #334: --gate-verify exit 1 when gate n/a');
      // pass control: gate complete + .cache verdicts -> --gate-verify AND --verdict-check exit 0.
      fs.writeFileSync(gp, mkL(g3Nodes, ['| imp | complete |', '| rv | complete |', '| vgate | complete |', '| d | complete |'], 'chore'));
      fs.writeFileSync(path.join(projDir, '.cache', 'rv.md'), 'verdict: pass\nfindings_blocking: 0\n');
      fs.writeFileSync(path.join(projDir, '.cache', 'vgate.md'), 'verdict: pass\nfindings_blocking: 0\nvisual confirmed\n');
      assert.strictEqual(spawnNode(valScript, [gp, '--gate-verify', '--json'], tmp).status, 0, 'gitea #334: --gate-verify exit 0 when gate complete + post-dominates');
      assert.strictEqual(spawnNode(valScript, [gp, '--verdict-check', '--json'], tmp).status, 0, 'gitea #334: --verdict-check exit 0 when gate records verdict: pass'); }

    // M2 (#277): warn-first attestation — finalize must emit closure_receipt with
    // claim_planner_attested and finalize_contractor_attested; both 'missing' in offline test
    // (no dispatch-log), but closure_invariants.ok must still be true (warn-first contract).
    const m2dir = path.join(tmp, 'kaola-workflow', 'issue-970');
    fs.mkdirSync(m2dir, { recursive: true });
    // #333: seed an active next_command + a STALE Planning Evidence plan_hash so the archive
    // must neutralize next_command and refresh the hash from the (re-frozen) plan file.
    const STALE_HASH_970 = 'a'.repeat(64);
    const FINAL_HASH_970 = 'b'.repeat(64);
    fs.writeFileSync(path.join(m2dir, 'workflow-state.md'),
      '## Project\nname: issue-970\nstatus: active\nissue_number: 970\n'
      + 'next_command: /kaola-workflow-plan-run issue-970\nnext_skill: kaola-workflow-plan-run issue-970\n'
      + '## Planning Evidence\nplan_hash: ' + STALE_HASH_970 + '\ndecision: ask\n'
      + '## Sink\nbranch: workflow/issue-970\nsink: pr\n'
      + '## Pending Gates\n- workflow-plan\n\n## Last Evidence\nlast_command: startup\nlast_result: folder_claimed\n'
      + '\n## Last Updated\n2020-01-01T00:00:00.000Z\n');
    // #333: workflow-plan.md re-frozen with a DIFFERENT hash than the claim-time state hash.
    fs.writeFileSync(path.join(m2dir, 'workflow-plan.md'),
      '<!-- plan_hash: ' + FINAL_HASH_970 + ' -->\n\n# Workflow Plan\n\n## Node Ledger\n\n| id | status |\n|---|---|\n| n1 | complete |\n');
    // #324: seed a PRE-SINK finalization-summary carrying the terminal-mistakable sentinels.
    fs.writeFileSync(path.join(m2dir, 'finalization-summary.md'),
      '## Status\nREADY FOR FINAL GIT GATE\n\n## Commit And Push\nPending final git gate. Final hash reported after push.\n');
    // #324 AC3: seed a false-absolute validation claim in the cache evidence.
    fs.mkdirSync(path.join(m2dir, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(m2dir, '.cache', 'final-validation.md'), 'chains run at n16.\nNo files changed after those runs.\n');
    const roadmapM2Dir = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapM2Dir, { recursive: true });
    fs.writeFileSync(path.join(roadmapM2Dir, 'issue-970.md'),
      'issue: #970\ntitle: t\nstatus: open\nworkflow_project: issue-970\nnext_step: ready\n');
    const m2Result = JSON.parse(spawnNode(claimScript, ['finalize', '--project', 'issue-970'], tmp).stdout);
    assert.strictEqual(m2Result.status, 'closed', 'M2 (#277): gitea finalize must return status:closed');
    assert.ok(
      m2Result.closure_receipt && 'claim_planner_attested' in m2Result.closure_receipt,
      'M2 (#277): gitea closure_receipt must have claim_planner_attested field'
    );
    assert.ok(
      m2Result.closure_receipt && 'finalize_contractor_attested' in m2Result.closure_receipt,
      'M2 (#277): gitea closure_receipt must have finalize_contractor_attested field'
    );
    assert.ok(
      m2Result.closure_receipt.claim_planner_attested === 'missing' ||
      m2Result.closure_receipt.claim_planner_attested === 'attested',
      'M2 (#277): gitea claim_planner_attested must be missing or attested, got ' + m2Result.closure_receipt.claim_planner_attested
    );
    assert.ok(
      m2Result.closure_receipt.finalize_contractor_attested === 'missing' ||
      m2Result.closure_receipt.finalize_contractor_attested === 'attested',
      'M2 (#277): gitea finalize_contractor_attested must be missing or attested, got ' + m2Result.closure_receipt.finalize_contractor_attested
    );
    assert.ok(
      m2Result.closure_invariants && m2Result.closure_invariants.ok === true,
      'M2 (#277): gitea closure_invariants.ok must be true (warn-first: attestation miss is not a hard violation)'
    );
    // #324: archived closure artifacts must not retain pre-run / pre-sink state.
    const m2Archived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-970'));
    assert.strictEqual(m2Archived.length, 1, '#324: gitea finalize archives issue-970');
    const m2State = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', m2Archived[0], 'workflow-state.md'), 'utf8');
    assert.ok(!/## Pending Gates\n[\s\S]*?workflow-plan/.test(m2State), '#324: gitea archived state drops pre-run Pending Gates');
    assert.ok(!m2State.includes('last_command: startup'), '#324: gitea archived state drops last_command: startup');
    assert.ok(m2State.includes('last_command: finalize'), '#324: gitea archived state normalizes last_command to finalize');
    const m2Summary = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', m2Archived[0], 'finalization-summary.md'), 'utf8');
    assert.ok(!m2Summary.includes('READY FOR FINAL GIT GATE'), '#324: gitea archived summary neutralizes the pre-sink sentinel');
    const m2FinalVal = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', m2Archived[0], '.cache', 'final-validation.md'), 'utf8');
    assert.ok(!m2FinalVal.includes('No files changed after those runs'), '#324 AC3: gitea archived final-validation neutralizes the false absolute');
    // #333: archived state must not advertise an active resume command, and plan_hash + Last
    // Updated must be refreshed from the (re-frozen) plan file.
    assert.ok(m2State.includes('next_command: none (archived)'), '#333: gitea archived next_command neutralized to "none (archived)"');
    assert.ok(!/next_command:.*kaola-workflow-plan-run/.test(m2State), '#333: gitea archived state drops the active plan-run resume command');
    assert.ok(m2State.includes('plan_hash: ' + FINAL_HASH_970), '#333: gitea archived plan_hash refreshed from the final plan file, got: ' + m2State);
    assert.ok(!m2State.includes('plan_hash: ' + STALE_HASH_970), '#333: gitea archived plan_hash drops the stale claim-time hash');
    assert.ok(!m2State.includes('2020-01-01T00:00:00.000Z'), '#333: gitea archived ## Last Updated refreshed');

    // #338: contractor self-attest back-fill — finalize --attest-contractor-spawn must make
    // finalize_contractor_attested:attested even with no hook/dispatch-log present.
    const csDir = path.join(tmp, 'kaola-workflow', 'issue-9701');
    fs.mkdirSync(csDir, { recursive: true });
    fs.writeFileSync(path.join(csDir, 'workflow-state.md'),
      '## Project\nname: issue-9701\nstatus: active\nissue_number: 9701\n'
      + 'next_command: /kaola-workflow-plan-run issue-9701\n'
      + '## Sink\nbranch: workflow/issue-9701\nsink: merge\n'
      + '## Pending Gates\n- workflow-plan\n\n## Last Evidence\nlast_command: startup\nlast_result: folder_claimed\n');
    fs.writeFileSync(path.join(roadmapM2Dir, 'issue-9701.md'),
      'issue: #9701\ntitle: t\nstatus: open\nworkflow_project: issue-9701\nnext_step: ready\n');
    const csResult = JSON.parse(spawnNode(claimScript, ['finalize', '--project', 'issue-9701', '--attest-contractor-spawn'], tmp).stdout);
    assert.strictEqual(csResult.status, 'closed', '#338: gitea finalize --attest-contractor-spawn returns status:closed');
    assert.strictEqual(csResult.closure_receipt.finalize_contractor_attested, 'attested',
      '#338: gitea --attest-contractor-spawn must make finalize_contractor_attested attested, got ' + csResult.closure_receipt.finalize_contractor_attested);
    const csArchived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-9701'));
    const csLog = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', csArchived[0], '.cache', 'dispatch-log.jsonl'), 'utf8');
    assert.ok(csLog.includes('finalize-backfill'), '#338: gitea archived dispatch-log carries the finalize-backfill marker');

    // #333: --keep-open stamp — last_result: closed_keep_open + issue_disposition: kept-open.
    const koDir = path.join(tmp, 'kaola-workflow', 'issue-971');
    fs.mkdirSync(koDir, { recursive: true });
    fs.writeFileSync(path.join(koDir, 'workflow-state.md'),
      '## Project\nname: issue-971\nstatus: active\nissue_number: 971\n'
      + 'next_command: /kaola-workflow-plan-run issue-971\n'
      + '## Sink\nbranch: workflow/issue-971\nsink: merge\n'
      + '## Pending Gates\n- workflow-plan\n\n## Last Evidence\nlast_command: startup\nlast_result: folder_claimed\n');
    fs.writeFileSync(path.join(roadmapM2Dir, 'issue-971.md'),
      'issue: #971\ntitle: t\nstatus: open\nworkflow_project: issue-971\nnext_step: ready\n');
    const koResult = JSON.parse(spawnNode(claimScript, ['finalize', '--project', 'issue-971', '--keep-open'], tmp).stdout);
    assert.strictEqual(koResult.status, 'closed', '#333: gitea keep-open finalize returns status:closed');
    assert.strictEqual(koResult.issue_disposition, 'kept-open', '#333: gitea keep-open JSON issue_disposition is kept-open');
    const koArchived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-971'));
    const koState = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', koArchived[0], 'workflow-state.md'), 'utf8');
    assert.ok(koState.includes('last_result: closed_keep_open'), '#333: gitea keep-open archived last_result is closed_keep_open');
    assert.ok(/^## Closure$/m.test(koState), '#333: gitea keep-open archived state carries a ## Closure block');
    assert.ok(koState.includes('issue_disposition: kept-open'), '#333: gitea keep-open ## Closure records issue_disposition: kept-open');

    // #333 (port gap 3/5): manual-archive backstop — a state archived MANUALLY (live folder
    // absent) with status: active must be healed in place. This fails loudly (status stays
    // active, archive_state_stamped: 'failed') if the port backstop ever leaks a
    // removeLegacyStateBlocks call that throws a swallowed ReferenceError.
    const bsArchiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-972');
    fs.mkdirSync(bsArchiveDir, { recursive: true });
    fs.writeFileSync(path.join(bsArchiveDir, 'workflow-state.md'),
      '## Project\nname: issue-972\nstatus: active\nissue_number: 972\n'
      + 'next_command: /kaola-workflow-plan-run issue-972\n'
      + '## Sink\nbranch: workflow/issue-972\nsink: merge\n');
    const bsResult = JSON.parse(spawnNode(claimScript, ['finalize', '--project', 'issue-972'], tmp).stdout);
    assert.strictEqual(bsResult.status, 'closed', '#333: gitea backstop finalize returns status:closed');
    assert.strictEqual(bsResult.archive_state_stamped, 'repaired', '#333: gitea backstop must report archive_state_stamped: repaired (port has no removeLegacyStateBlocks)');
    const bsState = fs.readFileSync(path.join(bsArchiveDir, 'workflow-state.md'), 'utf8');
    assert.ok(bsState.includes('status: closed'), '#333: gitea backstop must stamp manual archive status: closed, got: ' + bsState);
    assert.ok(/^## Closure$/m.test(bsState), '#333: gitea backstop appends a ## Closure block');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testGiteaAdaptive: PASSED');
}

// #418.5: adaptive new-behavior smoke — the #408 fused freeze chain on the FORK validator.
// --freeze-checked returns the planHash WITHOUT writing; a subsequent --freeze --governance-ack with
// a STALE hash (plan mutated between the two spawns) must refuse governance_ack_stale and NOT write.
function testGiteaAdaptiveFreezeChecked() {
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-freeze-checked-'));
  try {
    const planPath = path.join(tmp, 'workflow-plan.md');
    fs.writeFileSync(planPath, PLAN);
    // SPAWN 1: --freeze-checked validates + returns planHash, does NOT write plan_hash into the file.
    const checked = JSON.parse(spawnNode(valScript, [planPath, '--freeze-checked', '--json'], tmp).stdout);
    assert.strictEqual(checked.result, 'in-grammar', 'gitea #418.5: --freeze-checked is in-grammar');
    assert.strictEqual(checked.frozen, false, 'gitea #418.5: --freeze-checked does NOT freeze');
    assert.ok(typeof checked.planHash === 'string' && checked.planHash.length > 0,
      'gitea #418.5: --freeze-checked returns a planHash');
    assert.ok(!fs.readFileSync(planPath, 'utf8').includes('plan_hash:'),
      'gitea #418.5: --freeze-checked leaves the file unfrozen (no plan_hash stamped)');
    // Mutate the plan AFTER governance (dodging the ack the operator approved).
    fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('lib/x.js', 'lib/z.js'));
    // SPAWN 2: --freeze --governance-ack <stale hash> must refuse governance_ack_stale, no write.
    const stale = JSON.parse(spawnNode(valScript, [planPath, '--freeze', '--governance-ack', checked.planHash, '--json'], tmp).stdout);
    assert.strictEqual(stale.result, 'refuse', 'gitea #418.5: stale governance-ack must refuse');
    assert.strictEqual(stale.reason, 'governance_ack_stale', 'gitea #418.5: refuse reason is governance_ack_stale');
    assert.strictEqual(stale.frozen, false, 'gitea #418.5: governance_ack_stale must NOT write/freeze');
    assert.ok(!fs.readFileSync(planPath, 'utf8').includes('plan_hash:'),
      'gitea #418.5: governance_ack_stale leaves the plan unfrozen');
    console.log('testGiteaAdaptiveFreezeChecked: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ===========================================================================
// issue #342: bundle-lane E2E behavioral coverage for the Gitea edition.
// Mirrors the six root scenarios (simulate-workflow-walkthrough.js §#328) modulo
// forge nouns, driving the REAL gitea edition CLIs via subprocess (no direct-call
// shims — the #292 io-shim lesson). Reuses the existing _initGitRepo helper. Each
// scenario uses its own mkdtempSync root + try/finally cleanup. Forbidden-token
// discipline: the GitLab-CLI binary token must never appear here (the gitea
// validator scans this file); we use tea.js / tea-calls.log.
// ===========================================================================

function gtPlantRoadmapIssue(tmp, n) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + n + '.md'),
    ['issue: #' + n, 'title: bundle test issue ' + n, 'status: open',
     'workflow_project: —', 'next_step: ready', ''].join('\n'));
}

function gtWriteProject(tmp, project, files) {
  const dir = path.join(tmp, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

// Mirrors the root writeBundleGhMockScript with tea arg shapes (kaola-gitea-forge.js).
// opts: { logFile, openIssues: number[], closedIssues: number[] }
function writeBundleTeaMockScript(binDir, opts) {
  const logFile = opts && opts.logFile ? JSON.stringify(opts.logFile) : 'null';
  const openIssues = opts && opts.openIssues ? JSON.stringify(opts.openIssues) : '[]';
  const closedIssues = opts && opts.closedIssues ? JSON.stringify(opts.closedIssues) : '[]';
  fs.mkdirSync(binDir, { recursive: true });
  const script = [
    "'use strict';",
    'const fs = require("fs");',
    'const argv = process.argv.slice(2);',
    'const a = argv.join(" ");',
    'const logFile = ' + logFile + ';',
    'const openIssues = new Set(' + openIssues + '.map(String));',
    'const closedIssues = new Set(' + closedIssues + '.map(String));',
    'function log(msg) { if (!logFile) return; try { fs.appendFileSync(logFile, msg + "\\n"); } catch(_) {} }',
    // repo view → gitea project shape (full_name feeds discoverProject early-return + comment URLs).
    // Required before any label call: addBundleLabel calls discoverProjectSafe() FIRST.
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({full_name:"owner/repo",html_url:"http://gt.invalid/owner/repo"}) + "\\n"); process.exit(0); }',
    'const viewM = a.match(/issues view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  const state = closedIssues.has(n) ? "closed" : "open";',
    '  process.stdout.write(JSON.stringify({number:parseInt(n),state,title:"issue "+n,body:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("issues edit") && a.includes("--add-labels")) { const m = a.match(/issues edit (\\d+)/); log("label-added:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("issues edit") && a.includes("--remove-labels")) { const m = a.match(/issues edit (\\d+)/); log("label-removed:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    // POST/DELETE must precede the GET /comments check (all three contain /comments).
    'if (a.includes("-X POST") && a.includes("/comments")) { log("comment:"); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("-X DELETE")) { process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("/comments")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("issues list")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'process.stdout.write("{}\\n"); process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'tea.js'), script);
}

// Online runner mirroring the root walkthrough's pattern: spawn the real edition CLI with
// KAOLA_TEA_MOCK_SCRIPT routed at the mock and adaptive switch ON. Returns the full spawnSync
// result so refusal scenarios can assert a non-zero exit (unlike _runClaimOnline which asserts 0).
function gtSpawnBundle(args, cwd, binDir, extraEnv) {
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_ENABLE_ADAPTIVE: '1',
      KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js'),
    }, extraEnv || {})
  });
}

function gtLastJson(stdout) {
  const lines = (stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  assert(lines.length > 0, 'expected a JSON object line, got: ' + stdout);
  return JSON.parse(lines[lines.length - 1]);
}

// S1: explicit bundle claim creates exactly ONE active folder + the three additive
// bundle fields in workflow-state.md. AC#2 + AC#3 E2E guard.
function testGiteaBundleClaimCreatesOneFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-claim-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'tea-calls.log');
  try {
    _initGitRepo(tmp);
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    writeBundleTeaMockScript(binDir, { logFile, openIssues: [42, 47, 53] });

    const result = gtSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 0,
      'gitea #342 S1: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitea #342 S1: claim must be acquired, got ' + JSON.stringify(out.claim));
    assert.strictEqual(out.bundle_id, 'bundle-42-47-53', 'gitea #342 S1: bundle_id must be bundle-42-47-53, got ' + JSON.stringify(out.bundle_id));
    assert.ok(Array.isArray(out.issue_numbers) && out.issue_numbers.length === 3,
      'gitea #342 S1: issue_numbers must have 3 members, got ' + JSON.stringify(out.issue_numbers));

    const kwDir = path.join(tmp, 'kaola-workflow');
    const projects = fs.readdirSync(kwDir).filter(n => !n.startsWith('.') && n !== 'archive' && n !== 'ROADMAP.md');
    assert.ok(projects.length === 1 && projects[0] === 'bundle-42-47-53',
      'gitea #342 S1: exactly one active folder (bundle-42-47-53) expected, got ' + projects.join(','));

    const state = fs.readFileSync(path.join(kwDir, 'bundle-42-47-53', 'workflow-state.md'), 'utf8');
    assert.ok(/^issue_number:\s*42\s*$/m.test(state), 'gitea #342 S1: state must have issue_number: 42 (primary)');
    assert.ok(/^issue_numbers:\s*42,47,53\s*$/m.test(state), 'gitea #342 S1: state must have issue_numbers: 42,47,53');
    assert.ok(/^bundle_id:\s*bundle-42-47-53\s*$/m.test(state), 'gitea #342 S1: state must have bundle_id: bundle-42-47-53');
    assert.ok(/^closure_policy:\s*all_or_nothing\s*$/m.test(state), 'gitea #342 S1: state must have closure_policy: all_or_nothing');
    assert.ok(!/^closure_policy:/m.test(state.replace(/^closure_policy:\s*all_or_nothing\s*$/m, '')),
      'gitea #342 S1: closure_policy must appear exactly once');
    assert.ok(/^branch:\s*workflow\/gitea-bundle-42-47-53\s*$/m.test(state),
      'gitea #342 S1: state must have branch: workflow/gitea-bundle-42-47-53');

    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const added = calls.filter(c => c.startsWith('label-added:'));
    assert.ok(added.includes('label-added:42'), 'gitea #342 S1: label added for member 42');
    assert.ok(added.includes('label-added:47'), 'gitea #342 S1: label added for member 47');
    assert.ok(added.includes('label-added:53'), 'gitea #342 S1: label added for member 53');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleClaimCreatesOneFolder: PASSED');
}

// #347: --attest-planner-spawn on the forge claim back-fills the planner dispatch-log line (the
// #280 producer, ported here). Without the flag-parse + back-fill the line is never written and the
// forge sink-merge attestation (#300 consumer) is structurally dead on this edition. Behavioral
// proof: a startup claim WITH the flag writes a workflow-planner entry to dispatch-log.jsonl.
function testGiteaPlannerAttestBackfill() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-attest-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'tea-calls.log');
  try {
    _initGitRepo(tmp);
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    writeBundleTeaMockScript(binDir, { logFile, openIssues: [42, 47, 53] });
    const result = gtSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive', '--attest-planner-spawn'], tmp, binDir);
    assert.strictEqual(result.status, 0, 'gitea #347: exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitea #347: claim must be acquired');
    const dispatchLog = path.join(tmp, 'kaola-workflow', 'bundle-42-47-53', '.cache', 'dispatch-log.jsonl');
    assert.ok(fs.existsSync(dispatchLog), 'gitea #347: --attest-planner-spawn must create dispatch-log.jsonl at ' + dispatchLog);
    const lines = fs.readFileSync(dispatchLog, 'utf8').split('\n').filter(Boolean);
    const plannerLine = lines.find(l => { try { return JSON.parse(l).agent_type === 'workflow-planner'; } catch (_) { return false; } });
    assert.ok(plannerLine, 'gitea #347: dispatch-log must carry a workflow-planner back-fill entry, got: ' + lines.join('|'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaPlannerAttestBackfill: PASSED');
}

// S2: a refused bundle claim (closed member #47) leaves NO active folder and applies
// ZERO labels (pre-mutation refusal). AC#5 + AC#6 guard.
function testGiteaBundleRefusalLeavesNoFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-refuse-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'tea-calls.log');
  try {
    _initGitRepo(tmp);
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    writeBundleTeaMockScript(binDir, { logFile, openIssues: [42, 53], closedIssues: [47] });

    const result = gtSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 1,
      'gitea #342 S2: exit 1 expected for closed member, got ' + result.status + '\nstdout: ' + result.stdout);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.status, 'target_set_has_closed_issue',
      'gitea #342 S2: status must be target_set_has_closed_issue, got ' + JSON.stringify(out.status));
    assert.strictEqual(out.issue, 47, 'gitea #342 S2: refused on issue 47, got ' + JSON.stringify(out.issue));

    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'bundle-42-47-53')),
      'gitea #342 S2: no bundle-42-47-53 folder must exist after refusal');
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    assert.strictEqual(labelsAdded.length, 0,
      'gitea #342 S2: no labels must be applied after pre-mutation refusal, got: ' + labelsAdded.join(', '));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleRefusalLeavesNoFolder: PASSED');
}

// S3: a live bundle [42,47,53] blocks (a) a direct single-issue claim of member 47 and
// (b) an overlapping bundle claim [47,77]. Offline. AC#8 duplicate-block guard.
function testGiteaBundleDuplicateIssueBlocking() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-dup-')));
  try {
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 77);
    gtWriteProject(tmp, 'bundle-42-47-53', {
      'workflow-state.md': [
        'name: bundle-42-47-53', 'status: active', 'phase: adaptive',
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: bundle-42-47-53', 'closure_policy: all_or_nothing',
        'branch: workflow/gitea-bundle-42-47-53', 'sink: merge', ''
      ].join('\n')
    });

    const offlineEnv = { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_ENABLE_ADAPTIVE: '1' };
    const r1 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '47'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    const o1 = JSON.parse(r1.stdout);
    assert.ok(o1.claim === 'owned' || o1.claim === 'none',
      'gitea #342 S3 (a): claim must be owned or none for live bundle member 47, got ' + JSON.stringify(o1.claim));
    if (o1.claim === 'owned') {
      assert.strictEqual(o1.project, 'bundle-42-47-53',
        'gitea #342 S3 (a): owned claim must resolve to bundle-42-47-53, got ' + JSON.stringify(o1.project));
    }

    const r2 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issues', '47,77', '--workflow-path', 'adaptive'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    assert.strictEqual(r2.status, 1,
      'gitea #342 S3 (b): overlapping bundle [47,77] must exit 1, got ' + r2.status + '\nstdout: ' + r2.stdout);
    const o2 = JSON.parse(r2.stdout);
    assert.strictEqual(o2.status, 'target_set_conflicts_active_work',
      'gitea #342 S3 (b): status must be target_set_conflicts_active_work, got ' + JSON.stringify(o2.status));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleDuplicateIssueBlocking: PASSED');
}

// S4: adaptive orient on a bundle project surfaces bundleId / issueNumbers / primaryIssue /
// closurePolicy. Offline. AC#14 (orient surface) guard.
function testGiteaBundleOrientSurfacesBundleIdentity() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-orient-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  const adaptiveNodeScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js');
  const valScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js');
  try {
    const project = 'bundle-42-47-53';
    gtWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- workflow-plan', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Gitea', 'issue_number: 42', 'full_name: owner/repo', '',
        '## Sink', 'branch: workflow/gitea-' + project,
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing', 'sink: merge', ''
      ].join('\n')
    });

    // Plant + freeze a 2-node adaptive plan with the EDITION validator (mirrors testGiteaAdaptive).
    const planPath = path.join(tmp, 'kaola-workflow', project, 'workflow-plan.md');
    fs.writeFileSync(planPath, [
      '# Workflow Plan — ' + project, '',
      '## Meta', 'labels: enhancement', '',
      '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| explore | code-explorer | — | — | 1 | sequence |',
      '| done | finalize | explore | — | 1 | sequence |', ''
    ].join('\n'));
    const fr = spawnSync(process.execPath, [valScript, planPath, '--freeze'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert.strictEqual(fr.status, 0, 'gitea #342 S4: plan freeze must exit 0, stderr: ' + fr.stderr);

    const result = spawnSync(process.execPath, [adaptiveNodeScript, 'orient', '--project', project, '--json'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert.strictEqual(result.status, 0,
      'gitea #342 S4: orient exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert.strictEqual(out.bundleId, 'bundle-42-47-53', 'gitea #342 S4: bundleId must be bundle-42-47-53, got ' + JSON.stringify(out.bundleId));
    assert.ok(Array.isArray(out.issueNumbers) && out.issueNumbers.length === 3 &&
      out.issueNumbers[0] === 42 && out.issueNumbers[1] === 47 && out.issueNumbers[2] === 53,
      'gitea #342 S4: issueNumbers must be [42,47,53], got ' + JSON.stringify(out.issueNumbers));
    assert.strictEqual(out.primaryIssue, 42, 'gitea #342 S4: primaryIssue must be 42, got ' + JSON.stringify(out.primaryIssue));
    assert.strictEqual(out.closurePolicy, 'all_or_nothing', 'gitea #342 S4: closurePolicy must be all_or_nothing, got ' + JSON.stringify(out.closurePolicy));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleOrientSurfacesBundleIdentity: PASSED');
}

// S5: finalize on a bundle project removes ALL member .roadmap/issue-N.md files, regenerates
// the mirror once, archives ONE folder, and the closure receipt carries the bundle fields.
// THIS IS THE SCENARIO THAT WOULD HAVE CAUGHT THE #328 CR1 FORGE-FINALIZATION DEFECT.
// AC#11 + AC#12 + AC#13 E2E guard.
function testGiteaBundleFinalizeRoadmapCleanup() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-finalize-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-42-47-53';
  try {
    _initGitRepo(tmp);
    gtWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## Gitea', 'issue_number: 42', 'full_name: owner/repo', '',
        '## Sink', 'branch: workflow/gitea-' + project,
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    gtPlantRoadmapIssue(tmp, 42);
    gtPlantRoadmapIssue(tmp, 47);
    gtPlantRoadmapIssue(tmp, 53);
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md'), [
      '# Kaola-Workflow Roadmap', '',
      '| Issue | Title | Status |', '|-------|-------|--------|',
      '| #42 | Test 42 | active |', '| #47 | Test 47 | active |', '| #53 | Test 53 | active |', ''
    ].join('\n'));
    writeBundleTeaMockScript(binDir, { closedIssues: [42, 47, 53] });

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_TEA_MOCK_SCRIPT: path.join(binDir, 'tea.js'),
      })
    });
    assert.strictEqual(result.status, 0,
      'gitea #342 S5: finalize exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = gtLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitea #342 S5: status must be closed, got ' + JSON.stringify(out.status));
    assert.ok(out.closure_receipt && out.closure_receipt.roadmap_regenerated === 'regenerated',
      'gitea #342 S5: receipt.roadmap_regenerated must be "regenerated", got ' +
      JSON.stringify(out.closure_receipt && out.closure_receipt.roadmap_regenerated));

    for (const n of [42, 47, 53]) {
      assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md')),
        'gitea #342 S5: issue-' + n + '.md roadmap source must be removed after finalize');
    }
    assert.ok(out.dest && fs.existsSync(out.dest), 'gitea #342 S5: archive folder must exist at dest');
    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', project)),
      'gitea #342 S5: live project folder must be gone after finalize');

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitea #342 S5: closure_receipt must be present');
    assert.ok(Array.isArray(receipt.roadmap_sources_removed) && receipt.roadmap_sources_removed.length === 3,
      'gitea #342 S5: roadmap_sources_removed must have 3 entries, got ' + JSON.stringify(receipt.roadmap_sources_removed));
    for (const n of [42, 47, 53]) {
      assert.ok(receipt.roadmap_sources_removed.includes('issue-' + n + '.md'),
        'gitea #342 S5: roadmap_sources_removed must include issue-' + n + '.md');
    }
    assert.ok(Array.isArray(receipt.closed_issues), 'gitea #342 S5: receipt must have closed_issues array');
    assert.ok(Array.isArray(receipt.failed_issue_closures) && receipt.failed_issue_closures.length === 0,
      'gitea #342 S5: failed_issue_closures must be empty when all probes succeed, got ' + JSON.stringify(receipt.failed_issue_closures));
    assert.ok(Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length === 3,
      'gitea #342 S5: receipt must have issue_numbers with 3 members, got ' + JSON.stringify(receipt.issue_numbers));

    const inv = out.closure_invariants;
    assert.ok(inv && inv.ok === true,
      'gitea #342 S5: closure_invariants must pass; violations: ' + JSON.stringify(inv && inv.violations));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleFinalizeRoadmapCleanup: PASSED');
}

// S6: AC#1 contamination guard — a single-issue claim must NOT write the bundle fields. Offline.
function testGiteaBundleSingleIssueStateHasNoBundleFields() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gt-bundle-single-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  try {
    gtPlantRoadmapIssue(tmp, 601);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '601'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitea #342 S6: single-issue startup must acquire, got ' + JSON.stringify(out.claim));
    const state = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-601', 'workflow-state.md'), 'utf8');
    assert.ok(!/^issue_numbers:/m.test(state), 'gitea #342 S6: single-issue state must NOT contain issue_numbers line');
    assert.ok(!/^bundle_id:/m.test(state), 'gitea #342 S6: single-issue state must NOT contain bundle_id line');
    assert.ok(!/^closure_policy:/m.test(state), 'gitea #342 S6: single-issue state must NOT contain closure_policy line');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGiteaBundleSingleIssueStateHasNoBundleFields: PASSED');
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
// M1 (#277): dispatch-log hook must be installed in the gitea plugin hooks directory.
function testGiteaDispatchHookExists() {
  const hooksDir = path.join(root, 'plugins/kaola-workflow-gitea/hooks');
  const dispatchLog = path.join(hooksDir, 'kaola-workflow-subagent-dispatch-log.sh');
  assert.ok(fs.existsSync(dispatchLog), 'M1 (#277): gitea hooks/kaola-workflow-subagent-dispatch-log.sh must exist');
  const hooksJson = path.join(hooksDir, 'hooks.json');
  assert.ok(fs.existsSync(hooksJson), 'M1 (#277): gitea hooks/hooks.json must exist');
  const hooks = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  const subagentHooks = (hooks.hooks && hooks.hooks.SubagentStart) || [];
  assert.ok(
    subagentHooks.some(e => e.id === 'kaola-workflow:subagent-dispatch-log'),
    'M1 (#277): gitea hooks.json must have a SubagentStart entry with id: kaola-workflow:subagent-dispatch-log'
  );
  console.log('testGiteaDispatchHookExists: PASSED');
}

function testGiteaWriteLaneHookExists() {
  // #376: the write-lane containment hook ships + is registered (PreToolUse Write|Edit) in this edition.
  const hooksDir = path.join(root, 'plugins/kaola-workflow-gitea/hooks');
  assert.ok(fs.existsSync(path.join(hooksDir, 'kaola-workflow-write-lane.sh')), '#376: gitea hooks/kaola-workflow-write-lane.sh must exist');
  const hooks = JSON.parse(fs.readFileSync(path.join(hooksDir, 'hooks.json'), 'utf8'));
  const pre = (hooks.hooks && hooks.hooks.PreToolUse) || [];
  const wl = pre.find(e => e.id === 'kaola-workflow:write-lane');
  assert.ok(wl && wl.matcher === 'Write|Edit', '#376: gitea hooks.json must register kaola-workflow:write-lane on Write|Edit');
  console.log('testGiteaWriteLaneHookExists: PASSED');
}

testGiteaAdaptive();
testGiteaAdaptiveFreezeChecked();
testGitea237DotPathExtraction();
testGiteaDispatchHookExists();
testGiteaWriteLaneHookExists();

// issue #342: bundle-lane E2E behavioral coverage (mirrors root §#328 modulo forge nouns).
testGiteaBundleClaimCreatesOneFolder();
testGiteaPlannerAttestBackfill();
testGiteaBundleRefusalLeavesNoFolder();
testGiteaBundleDuplicateIssueBlocking();
testGiteaBundleOrientSurfacesBundleIdentity();
testGiteaBundleFinalizeRoadmapCleanup();
testGiteaBundleSingleIssueStateHasNoBundleFields();

run('test-gitea-forge-helpers.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');

console.log('Gitea workflow walkthrough simulation passed');
