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

run('test-gitea-forge-helpers.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');

console.log('Gitea workflow walkthrough simulation passed');
