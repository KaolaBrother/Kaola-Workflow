#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..', '..');

const sinkMr = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr'));
const claimScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js');

function run(script) {
  execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitlab/scripts', script)], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function testFallbackGuardsAfterArchive() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-fallback-archive-'));
  try {
    // Arrange: live project files
    const liveDir = path.join(tmpRoot, 'kaola-workflow', 'fb-project');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '## Project\nname: fb-project\nstatus: active\n## Sink\nbranch: workflow/fb-project\nsink: merge\n');
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
    const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
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
    const appendResult = sinkMr.appendSummary(summaryFile, 'https://gl.example/mr/99', 99);
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

function testAuditAndRepairLabels() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-audit-labels-'));
  const mockScript = path.join(tmp, 'glab-mock.js');
  const marker = path.join(tmp, 'label-removed.marker');

  try {
    // Mock script: handles glab issue list and glab issue update (unlabel)
    fs.writeFileSync(mockScript, [
      "'use strict';",
      "const fs = require('fs');",
      "const args = process.argv.slice(2);",
      "const joined = args.join(' ');",
      "if (joined.includes('issue update') && joined.includes('--unlabel')) {",
      "  fs.writeFileSync(" + JSON.stringify(marker) + ", 'x');",
      "  process.stdout.write('{}\\n');",
      "} else if (joined.includes('issue list')) {",
      "  process.stdout.write('[{\"iid\":99,\"title\":\"stale\",\"web_url\":\"http://x\",\"state\":\"closed\",\"labels\":[\"workflow:in-progress\"]}]\\n');",
      "} else {",
      "  process.stdout.write('{}\\n');",
      "}",
      ""
    ].join('\n'));

    // Sub-case A: audit-labels — lists stale issues without removing
    {
      const r = spawnSync(process.execPath, [claimScript, 'audit-labels'], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
      });
      assert.strictEqual(r.status, 0, 'audit-labels must exit 0, got: ' + r.status + ' stderr: ' + r.stderr);
      const result = JSON.parse(r.stdout);
      assert.strictEqual(result.stale.length, 1, 'audit-labels must return stale.length===1, got: ' + JSON.stringify(result.stale));
      assert(!fs.existsSync(marker), 'audit-labels must NOT write label-removed marker');
    }

    // Sub-case B: repair-labels without --execute — dry run
    {
      const r = spawnSync(process.execPath, [claimScript, 'repair-labels'], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
      });
      assert.strictEqual(r.status, 0, 'repair-labels dry-run must exit 0, got: ' + r.status + ' stderr: ' + r.stderr);
      const result = JSON.parse(r.stdout);
      assert.strictEqual(result.dry_run, true, 'repair-labels without --execute must return dry_run:true, got: ' + result.dry_run);
      assert(Array.isArray(result.would_remove) && result.would_remove.length === 1,
        'repair-labels dry-run must return would_remove with 1 entry, got: ' + JSON.stringify(result.would_remove));
      assert(!fs.existsSync(marker), 'repair-labels dry-run must NOT write label-removed marker');
    }

    // Sub-case C: repair-labels --execute — removes the label
    {
      const r = spawnSync(process.execPath, [claimScript, 'repair-labels', '--execute'], {
        encoding: 'utf8',
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '0', KAOLA_GLAB_MOCK_SCRIPT: mockScript })
      });
      assert.strictEqual(r.status, 0, 'repair-labels --execute must exit 0, got: ' + r.status + ' stderr: ' + r.stderr);
      const result = JSON.parse(r.stdout);
      assert.strictEqual(result.dry_run, false, 'repair-labels --execute must return dry_run:false, got: ' + result.dry_run);
      assert(Array.isArray(result.removed) && result.removed.length === 1,
        'repair-labels --execute must return removed with 1 entry, got: ' + JSON.stringify(result.removed));
      assert(fs.existsSync(marker), 'repair-labels --execute must write label-removed marker');
    }

    console.log('testAuditAndRepairLabels: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testRepairFastEscalation() {
  const repairScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js');

  // --- Assertion 1: ESCALATED fast → full/Phase1 ---
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-repair-fast-esc-'));
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
    assert.strictEqual(result.status, 0, 'gitlab repair should exit 0 for ESCALATED fast, got: ' + result.status + ' stderr: ' + result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.repaired, true, 'gitlab repair must mark repaired:true for ESCALATED fast');
    const state = fs.readFileSync(path.join(projectDir, 'workflow-state.md'), 'utf8');
    assert.ok(state.includes('workflow_path: full'), 'gitlab: ESCALATED fast must rewrite to workflow_path: full');
    assert.ok(state.includes('next_command: /kaola-workflow-phase1 fast-esc'), 'gitlab: ESCALATED fast must route to /kaola-workflow-phase1');
    assert.ok(!state.includes('next_command: /kaola-workflow-fast'), 'gitlab: rewritten state must not retain /kaola-workflow-fast');

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
    assert.strictEqual(result2.status, 0, 'gitlab repair should exit 0 for IN_PROGRESS fast');
    const state2 = fs.readFileSync(path.join(project2Dir, 'workflow-state.md'), 'utf8');
    assert.ok(state2.includes('next_command: /kaola-workflow-fast fast-ok'), 'gitlab: IN_PROGRESS fast must still route to /kaola-workflow-fast');
    assert.ok(!state2.includes('workflow_path: full'), 'gitlab: IN_PROGRESS fast must not redirect to full');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testRepairFastEscalation: PASSED');
}

testFallbackGuardsAfterArchive();
testAuditAndRepairLabels();
testRepairFastEscalation();

run('test-gitlab-forge-helpers.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');

console.log('GitLab workflow walkthrough simulation passed');

