#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const project = 'simulated-feature';

function coordRootFor(dir) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'],
      { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const resolved = path.resolve(dir, raw);
    try { return fs.realpathSync(resolved); } catch (_) { return resolved; }
  } catch (_) {
    return path.join(dir, '.git');
  }
}
function locksDirFor(dir) { return path.join(coordRootFor(dir), 'kaola-workflow', '.locks'); }
function sessionsDirFor(dir) { return path.join(coordRootFor(dir), 'kaola-workflow', '.sessions'); }
function tickersDirFor(dir) { return path.join(coordRootFor(dir), 'kaola-workflow', '.tickers'); }
function readLockFileViaPath(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function stateContent({ phase, phaseName, step, task = 'N/A', nextCommand, fallback = 'no' }) {
  return [
    '# Kaola-Workflow State',
    '',
    '## Project',
    `name: ${project}`,
    'status: active',
    '',
    '## Current Position',
    `phase: ${phase}`,
    `phase_name: ${phaseName}`,
    `step: ${step}`,
    `task: ${task}`,
    `next_command: ${nextCommand}`,
    '',
    '## Pending Gates',
    '- none',
    '',
    '## Ownership Rules',
    'main_session_role: orchestrator',
    phase === 4 ? 'implementation_owner: tdd-guide' : 'implementation_owner: N/A',
    phase === 4 || phase === 6 ? 'fix_owner: tdd-guide or build-error-resolver' : 'fix_owner: N/A',
    `inline_emergency_fallback_authorized: ${fallback}`,
    '',
    '## Last Evidence',
    `phase_file: kaola-workflow/${project}/phase${phase}.md`,
    'cache_file: N/A',
    'last_command: N/A',
    'last_result: N/A',
    '',
    '## Last Updated',
    '2026-05-09T10:00:00Z',
    ''
  ].join('\n');
}

function phaseFile(title, complianceRows) {
  return [
    `# ${title}: ${project}`,
    '',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    ...complianceRows,
    ''
  ].join('\n');
}

function readNextCommand(stateFile) {
  const match = read(stateFile).match(/^next_command:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function assertNext(stateFile, expected) {
  const actual = readNextCommand(stateFile);
  assert(actual === expected, `expected next command ${expected}, got ${actual}`);
}

function assertFileIncludes(file, needle) {
  const content = read(file);
  assert(content.includes(needle), `${file} missing ${needle}`);
}

function assertCommandIncludes(relativePath, needles) {
  const content = fs.readFileSync(path.join(root, relativePath), 'utf8');
  for (const needle of needles) {
    assert(content.includes(needle), `${relativePath} missing ${needle}`);
  }
}

function assertHookOutput(workdir, expectedCommand, expectedStep) {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/kaola-workflow-compact-context.js')], {
    cwd: workdir,
    encoding: 'utf8'
  });
  assert(output.includes(expectedCommand), `hook output missing ${expectedCommand}`);
  assert(output.includes(`Current step: ${expectedStep}`), `hook output missing step ${expectedStep}`);
  assert(output.includes('do not repair inline'), 'hook output missing inline repair guardrail');
}

function runRepair(workdir, projectArg = project) {
  return execFileSync(process.execPath, [path.join(root, 'scripts/kaola-workflow-repair-state.js'), projectArg], {
    cwd: workdir,
    encoding: 'utf8'
  });
}

function assertRepair(workdir, expectedCommand, expectedPhase) {
  const output = runRepair(workdir);
  assert(output.includes('Workflow state repair: wrote') || output.includes('Workflow state repair: repaired stale'), 'repair output must report a write or stale repair');
  assert(output.includes(`Current phase: ${expectedPhase}`), `repair output missing phase ${expectedPhase}`);
  assert(output.includes(`Next command: ${expectedCommand}`), `repair output missing ${expectedCommand}`);
  assertNext(path.join(workdir, 'kaola-workflow', project, 'workflow-state.md'), expectedCommand);
  assertFileIncludes(path.join(workdir, 'kaola-workflow', project, 'workflow-state.md'), 'last_result: state_repaired_from_artifacts');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitExit = (child, timeoutMs) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('exit timeout')), timeoutMs);
  child.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
});

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-walkthrough-'));
  try {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-empty-'));
    try {
      fs.mkdirSync(path.join(emptyRoot, 'kaola-workflow', project), { recursive: true });
      const output = runRepair(emptyRoot, project);
      assert(output.includes('Workflow state repair: skipped - no phase artifacts available for repair'), 'repair must not create state for brand-new work');
      assert(!fs.existsSync(path.join(emptyRoot, 'kaola-workflow', project, 'workflow-state.md')), 'repair created state without phase artifacts');
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }

    const stateOnlyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-stateonly-'));
    try {
      const activeProject = 'phase-one-active';
      const activeDir = path.join(stateOnlyRoot, 'kaola-workflow', activeProject);
      fs.mkdirSync(activeDir, { recursive: true });
      write(path.join(activeDir, 'workflow-state.md'), [
        '# Kaola-Workflow State',
        '',
        '## Project',
        'name: ' + activeProject,
        'status: active',
        '',
        '## Current Position',
        'phase: 1',
        'phase_name: Research',
        'step: requirement-parsing',
        'next_command: /kaola-workflow-phase1 ' + activeProject,
        '',
      ].join('\n'));
      const output = execFileSync(process.execPath, [path.join(root, 'scripts/kaola-workflow-repair-state.js')], {
        cwd: stateOnlyRoot,
        encoding: 'utf8'
      });
      assert(output.includes('Workflow state repair: existing state valid'), 'repair must recognize active workflow-state before phase files exist');
      assert(output.includes('Workflow project: ' + activeProject), 'repair must route the state-only active project');
    } finally {
      fs.rmSync(stateOnlyRoot, { recursive: true, force: true });
    }

    const workflowRoot = path.join(tmp, 'kaola-workflow');
    const projectRoot = path.join(workflowRoot, project);
    const cache = path.join(projectRoot, '.cache');
    const stateFile = path.join(projectRoot, 'workflow-state.md');

    fs.mkdirSync(cache, { recursive: true });
    write(path.join(workflowRoot, 'ROADMAP.md'), '<!-- generated by scripts/kaola-workflow-roadmap.js — do not edit -->\n# Kaola-Workflow Roadmap\n');

    write(stateFile, stateContent({
      phase: 1,
      phaseName: 'Research',
      step: 'requirement-parsing',
      nextCommand: `/kaola-workflow-phase1 ${project}`
    }));
    assertNext(stateFile, `/kaola-workflow-phase1 ${project}`);

    write(path.join(cache, 'code-explorer.md'), 'raw explorer output\n');
    write(path.join(cache, 'docs-lookup.md'), 'N/A - internal patterns sufficient\n');
    write(path.join(projectRoot, 'phase1-research.md'), phaseFile('Phase 1 - Research / Discovery', [
      '| code-explorer | invoked | .cache/code-explorer.md | |',
      '| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient |'
    ]));
    assertFileIncludes(path.join(projectRoot, 'phase1-research.md'), '| code-explorer | invoked | .cache/code-explorer.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase1-research.md'), '| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient |');
    write(stateFile, stateContent({
      phase: 1,
      phaseName: 'Research',
      step: 'complete',
      nextCommand: `/kaola-workflow-phase2 ${project}`
    }));
    assertNext(stateFile, `/kaola-workflow-phase2 ${project}`);

    write(path.join(cache, 'planner.md'), 'raw planner output\n');
    write(path.join(cache, 'advisor-ideation.md'), 'advisor ideation output\n');
    write(path.join(projectRoot, 'phase2-ideation.md'), phaseFile('Phase 2 - Ideation', [
      '| planner | invoked | .cache/planner.md | |',
      '| advisor ideation gate | invoked | .cache/advisor-ideation.md | |'
    ]));
    assertFileIncludes(path.join(projectRoot, 'phase2-ideation.md'), '| planner | invoked | .cache/planner.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase2-ideation.md'), '| advisor ideation gate | invoked | .cache/advisor-ideation.md | |');
    write(stateFile, stateContent({
      phase: 2,
      phaseName: 'Ideation',
      step: 'complete',
      nextCommand: `/kaola-workflow-phase3 ${project}`
    }));
    assertNext(stateFile, `/kaola-workflow-phase3 ${project}`);

    write(path.join(cache, 'architect.md'), 'raw architect output\n');
    write(path.join(cache, 'advisor-plan.md'), 'advisor plan output\n');
    write(path.join(projectRoot, 'phase3-plan.md'), [
      '# Phase 3 - Plan: simulated-feature',
      '',
      '## Task List',
      '',
      '### Task 1: Add greeting',
      '- File: src/greeting.js',
      '- Test File: test/greeting.test.js',
      '- Write Set: src/greeting.js, test/greeting.test.js',
      '- Validate: npm test -- greeting',
      '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| code-architect | invoked | .cache/architect.md | |',
      '| advisor plan gate | invoked | .cache/advisor-plan.md | |',
      '| architect revisions | N/A | .cache/advisor-plan.md | advisor found no gaps |',
      ''
    ].join('\n'));
    assertFileIncludes(path.join(projectRoot, 'phase3-plan.md'), '| code-architect | invoked | .cache/architect.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase3-plan.md'), '| advisor plan gate | invoked | .cache/advisor-plan.md | |');
    write(stateFile, stateContent({
      phase: 3,
      phaseName: 'Plan',
      step: 'complete',
      nextCommand: `/kaola-workflow-phase4 ${project}`
    }));
    assertNext(stateFile, `/kaola-workflow-phase4 ${project}`);

    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `/kaola-workflow-phase4 ${project}`, 4);

    write(path.join(projectRoot, 'phase4-progress.md'), [
      '# Phase 4 - Progress: simulated-feature',
      '',
      '## Operational Guardrails',
      'Main session must not:',
      '- write implementation fixes inline',
      '',
      '## Tasks',
      '| # | Name | Status | Files Modified | Notes |',
      '|---|------|--------|----------------|-------|',
      '| 1 | Add greeting | in_progress | | validation failed |',
      '',
      '## Failure Routing Ledger',
      '| Task | Failing Command | Classification | Routed To | Evidence | Status |',
      '|------|-----------------|----------------|-----------|----------|--------|',
      '| 1 | npm test -- greeting | behavior/test failure | tdd-guide | .cache/tdd-task-1-fix-1.md | routed |',
      '',
      '## Required Agent Compliance',
      '| Requirement | Status | Evidence | Skip Reason |',
      '|-------------|--------|----------|-------------|',
      '| tdd-guide executor task 1 | invoked | .cache/tdd-task-1.md | |',
      ''
    ].join('\n'));
    assertFileIncludes(path.join(projectRoot, 'phase4-progress.md'), '| tdd-guide executor task 1 | invoked | .cache/tdd-task-1.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase4-progress.md'), '| 1 | npm test -- greeting | behavior/test failure | tdd-guide | .cache/tdd-task-1-fix-1.md | routed |');
    write(path.join(cache, 'tdd-task-1.md'), 'RED evidence\nGREEN evidence\n');
    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `/kaola-workflow-phase4 ${project}`, 4);
    assertFileIncludes(stateFile, 'task: 1');
    write(stateFile, stateContent({
      phase: 4,
      phaseName: 'Execute',
      step: 'route-failure',
      task: '1',
      nextCommand: `/kaola-workflow-phase4 ${project}`
    }));
    assertHookOutput(tmp, `/kaola-workflow-phase4 ${project}`, 'route-failure');

    write(path.join(projectRoot, 'phase4-progress.md'), read(path.join(projectRoot, 'phase4-progress.md')).replace(
      '| 1 | Add greeting | in_progress | | validation failed |',
      '| 1 | Add greeting | complete | src/greeting.js, test/greeting.test.js | validation passed |'
    ));
    assertRepair(tmp, `/kaola-workflow-phase5 ${project}`, 5);
    write(stateFile, stateContent({
      phase: 4,
      phaseName: 'Execute',
      step: 'complete',
      nextCommand: `/kaola-workflow-phase5 ${project}`
    }));
    assertNext(stateFile, `/kaola-workflow-phase5 ${project}`);

    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `/kaola-workflow-phase5 ${project}`, 5);

    write(path.join(cache, 'code-reviewer.md'), 'review passed\n');
    write(path.join(projectRoot, 'phase5-review.md'), phaseFile('Phase 5 - Review', [
      '| code-reviewer | invoked | .cache/code-reviewer.md | |',
      '| security-reviewer | N/A | file-risk scan | no sensitive files touched |',
      '| review-fix executors | N/A | .cache/code-reviewer.md | no blocking findings |',
      '| advisor critical gate | N/A | .cache/code-reviewer.md | no critical findings |'
    ]));
    assertFileIncludes(path.join(projectRoot, 'phase5-review.md'), '| code-reviewer | invoked | .cache/code-reviewer.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase5-review.md'), '| security-reviewer | N/A | file-risk scan | no sensitive files touched |');
    write(stateFile, stateContent({
      phase: 5,
      phaseName: 'Review',
      step: 'complete',
      nextCommand: `/kaola-workflow-phase6 ${project}`
    }));
    assertNext(stateFile, `/kaola-workflow-phase6 ${project}`);

    write(path.join(cache, 'doc-updater.md'), 'docs updated\n');
    write(path.join(projectRoot, 'phase6-summary.md'), phaseFile('Phase 6 - Summary', [
      '| doc-updater | invoked | .cache/doc-updater.md | |',
      '| documentation docking | invoked | .cache/doc-docking.md | |',
      '| closure advisor gate | N/A | closure scan | no deferred/conflict/user-decision items |',
      '| final-validation fix executors | N/A | final validation output | no failures |',
      '| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |',
      '| archive completed folder | invoked | kaola-workflow/archive/simulated-feature | |',
      '| final commit and push | invoked | git status --short --branch | clean and synced |'
    ]));
    assertFileIncludes(path.join(projectRoot, 'phase6-summary.md'), '| doc-updater | invoked | .cache/doc-updater.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase6-summary.md'), '| documentation docking | invoked | .cache/doc-docking.md | |');
    assertFileIncludes(path.join(projectRoot, 'phase6-summary.md'), '| closure advisor gate | N/A | closure scan | no deferred/conflict/user-decision items |');
    assertFileIncludes(path.join(projectRoot, 'phase6-summary.md'), '| final-validation fix executors | N/A | final validation output | no failures |');
    write(stateFile, stateContent({
      phase: 6,
      phaseName: 'Finalize',
      step: 'complete',
      nextCommand: `/kaola-workflow-phase6 ${project}`
    }));

    const phaseCommands = [
      'commands/kaola-workflow-phase1.md',
      'commands/kaola-workflow-phase2.md',
      'commands/kaola-workflow-phase3.md',
      'commands/kaola-workflow-phase4.md',
      'commands/kaola-workflow-phase5.md',
      'commands/kaola-workflow-phase6.md'
    ];
    for (const command of phaseCommands) {
      const content = fs.readFileSync(path.join(root, command), 'utf8');
      assert(content.includes('Resume Detection'), `${command} missing Resume Detection section`);
      assert(content.includes('workflow-state.md'), `${command} missing workflow-state.md reference`);
    }

    assertCommandIncludes('commands/kaola-workflow-phase1.md', ['code-explorer', 'docs-lookup']);
    assertCommandIncludes('commands/kaola-workflow-phase2.md', ['planner', 'advisor']);
    assertCommandIncludes('commands/kaola-workflow-phase3.md', ['code-architect', 'advisor']);
    assertCommandIncludes('commands/kaola-workflow-phase4.md', ['tdd-guide', 'build-error-resolver']);
    assertCommandIncludes('commands/kaola-workflow-phase5.md', ['code-reviewer', 'security-reviewer', 'tdd-guide', 'build-error-resolver']);
    assertCommandIncludes('commands/kaola-workflow-phase6.md', ['doc-updater', 'tdd-guide', 'build-error-resolver']);

    // Epic Case 1: claim → heartbeat → status → second-claim-blocked → sweep → release
    const epicTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic1-'));
    try {
      fs.mkdirSync(path.join(locksDirFor(epicTmp)), { recursive: true });
      fs.mkdirSync(path.join(sessionsDirFor(epicTmp)), { recursive: true });
      fs.mkdirSync(path.join(epicTmp, 'kaola-workflow', 'epic-test-project'), { recursive: true });
      fs.writeFileSync(
        path.join(epicTmp, 'kaola-workflow', 'epic-test-project', 'workflow-state.md'),
        '# Kaola-Workflow State\n\n## Project\nname: epic-test-project\nstatus: active\n\n## Last Updated\n2026-05-14T00:00:00Z\n'
      );

      // Step 1 — Claim
      const sessionId = 'a1000000-0000-4000-a000-000000000001';
      const claimResult = execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'claim', '--session', sessionId, '--project', 'epic-test-project', '--issue', '3'
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });

      // Step 2 — Verify lock file exists
      const lockPath = path.join(locksDirFor(epicTmp), 'epic-test-project.lock');
      assert(fs.existsSync(lockPath), 'Epic Case 1: lock file must exist after claim');
      const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert(lock.session_id === sessionId, 'Epic Case 1: lock.session_id must match');
      assert(new Date(lock.expires) > new Date(lock.claimed_at), 'Epic Case 1: expires must be after claimed_at');

      // Step 3 — Heartbeat
      execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'heartbeat', '--session', sessionId
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      const lockAfterHb = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      assert(lockAfterHb.last_heartbeat >= lock.last_heartbeat, 'Epic Case 1: heartbeat must update last_heartbeat');

      // Step 4 — Status --json (consistent: true)
      const statusOut = execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'status', '--session', sessionId, '--json'
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      const statusArr = JSON.parse(statusOut);
      assert(Array.isArray(statusArr) && statusArr.length === 1, 'Epic Case 1: status must return 1 entry');
      assert(statusArr[0].consistent === true, 'Epic Case 1: status must be consistent');
      assert(Array.isArray(statusArr[0].drift) && statusArr[0].drift.length === 0, 'Epic Case 1: drift must be empty');

      // Step 5 — Second claim on same project must exit 2
      let secondClaimExitCode = 0;
      try {
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'other-session-999', '--project', 'epic-test-project', '--issue', '3'
        ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      } catch (e) {
        secondClaimExitCode = e.status || 1;
      }
      assert(secondClaimExitCode === 2, 'Epic Case 1: second claim on locked project must exit 2, got ' + secondClaimExitCode);

      // Step 6 — Sweep must NOT remove the lock (it's < 24h old)
      execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'sweep'
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      assert(fs.existsSync(lockPath), 'Epic Case 1: sweep must not remove a fresh lock');

      // Step 7 — Release
      execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'release', '--session', sessionId
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      assert(!fs.existsSync(lockPath), 'Epic Case 1: lock file must be removed after release');

      // Step 8 — Status after release must return empty array
      const statusAfterRelease = execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'status', '--json'
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      const statusAfterArr = JSON.parse(statusAfterRelease);
      assert(Array.isArray(statusAfterArr) && statusAfterArr.length === 0, 'Epic Case 1: status after release must be empty');

    } finally {
      fs.rmSync(epicTmp, { recursive: true, force: true });
    }

    // Epic Case 2: sink-merge OFFLINE fast-path (alreadyUpToDate = true)
    const epic2Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic2-'));
    try {
      const remoteDir = path.join(epic2Tmp, 'remote.git');
      const workDir = path.join(epic2Tmp, 'work');
      execFileSync('git', ['init', '--bare', remoteDir], { encoding: 'utf8' });
      execFileSync('git', ['init', workDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'README.md'), 'init\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['--git-dir', remoteDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      // Cut feature branch at same HEAD as origin/main — alreadyUpToDate will be true
      execFileSync('git', ['checkout', '-b', 'workflow/issue-99-epic2'], { cwd: workDir, encoding: 'utf8' });
      let epic2ExitCode = 0;
      try {
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
          '--branch', 'workflow/issue-99-epic2', '--issue', '99', '--project', 'epic2'
        ], { cwd: workDir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      } catch (e) {
        epic2ExitCode = e.status || 1;
      }
      assert(epic2ExitCode === 0, 'Epic Case 2: sink-merge must exit 0 on fast-path, got ' + epic2ExitCode);
      const currentBranch2 = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: workDir, encoding: 'utf8' }).trim();
      assert(currentBranch2 === 'main', 'Epic Case 2: worktree must be on main after merge, got ' + currentBranch2);
      let branchExists2 = true;
      try {
        execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-99-epic2'],
          { cwd: workDir, encoding: 'utf8' });
      } catch (_) { branchExists2 = false; }
      assert(!branchExists2, 'Epic Case 2: feature branch must be deleted after merge');
    } finally {
      fs.rmSync(epic2Tmp, { recursive: true, force: true });
    }

    // Epic Case 3: sink-merge rebase path (real rebase + ff-merge)
    const epic3Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic3-'));
    try {
      const remoteDir = path.join(epic3Tmp, 'remote.git');
      const workDir = path.join(epic3Tmp, 'work');
      const siblingDir = path.join(epic3Tmp, 'sibling');
      execFileSync('git', ['init', '--bare', remoteDir], { encoding: 'utf8' });
      execFileSync('git', ['init', workDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'README.md'), 'init\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['--git-dir', remoteDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      // Sibling advances origin/main
      execFileSync('git', ['clone', remoteDir, siblingDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'sibling@test.com'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Sibling'], { cwd: siblingDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(siblingDir, 'sibling.txt'), 'sibling\n');
      execFileSync('git', ['add', 'sibling.txt'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'sibling commit'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'main'], { cwd: siblingDir, encoding: 'utf8' });
      // workDir fetches updated origin/main
      execFileSync('git', ['fetch', 'origin'], { cwd: workDir, encoding: 'utf8' });
      // Cut feature branch at original main (before sibling), add feature commit
      execFileSync('git', ['checkout', '-b', 'workflow/issue-100-epic3'], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'feature.txt'), 'feature\n');
      execFileSync('git', ['add', 'feature.txt'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'feature commit'], { cwd: workDir, encoding: 'utf8' });
      // Run sink-merge OFFLINE=1 (local origin/main ref is fresh from fetch above)
      let epic3ExitCode = 0;
      try {
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
          '--branch', 'workflow/issue-100-epic3', '--issue', '100', '--project', 'epic3'
        ], { cwd: workDir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      } catch (e) {
        epic3ExitCode = e.status || 1;
      }
      assert(epic3ExitCode === 0, 'Epic Case 3: sink-merge must exit 0 after rebase, got ' + epic3ExitCode);
      const currentBranch3 = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: workDir, encoding: 'utf8' }).trim();
      assert(currentBranch3 === 'main', 'Epic Case 3: worktree must be on main, got ' + currentBranch3);
      let branchExists3 = true;
      try {
        execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-100-epic3'],
          { cwd: workDir, encoding: 'utf8' });
      } catch (_) { branchExists3 = false; }
      assert(!branchExists3, 'Epic Case 3: feature branch must be deleted after merge');
    } finally {
      fs.rmSync(epic3Tmp, { recursive: true, force: true });
    }

    // Epic Case 3B: sink-merge checks out requested branch before merge-base/rebase
    const epic3bTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic3b-'));
    try {
      const remoteDir = path.join(epic3bTmp, 'remote.git');
      const workDir = path.join(epic3bTmp, 'work');
      const siblingDir = path.join(epic3bTmp, 'sibling');
      execFileSync('git', ['init', '--bare', remoteDir], { encoding: 'utf8' });
      execFileSync('git', ['init', workDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'README.md'), 'init\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['--git-dir', remoteDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      execFileSync('git', ['checkout', '-b', 'workflow/issue-121-epic3b'], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'feature-3b.txt'), 'feature\n');
      execFileSync('git', ['add', 'feature-3b.txt'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'feature 3b'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['checkout', 'main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['clone', remoteDir, siblingDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'sibling@test.com'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Sibling'], { cwd: siblingDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(siblingDir, 'sibling-3b.txt'), 'sibling\n');
      execFileSync('git', ['add', 'sibling-3b.txt'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'sibling 3b'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'main'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['fetch', 'origin'], { cwd: workDir, encoding: 'utf8' });
      execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
        '--branch', 'workflow/issue-121-epic3b', '--issue', '121', '--project', 'epic3b'
      ], { cwd: workDir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      const currentBranch3b = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: workDir, encoding: 'utf8' }).trim();
      assert(currentBranch3b === 'main', 'Epic Case 3B: worktree must end on main, got ' + currentBranch3b);
      assert(fs.existsSync(path.join(workDir, 'feature-3b.txt')), 'Epic Case 3B: feature file must be merged');
      assert(fs.existsSync(path.join(workDir, 'sibling-3b.txt')), 'Epic Case 3B: rebased main file must be present');
    } finally {
      fs.rmSync(epic3bTmp, { recursive: true, force: true });
    }

    // Epic Case 3C: Phase 6 commit gate simulation includes final changes before sink
    const epic3cTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic3c-'));
    try {
      const remoteDir = path.join(epic3cTmp, 'remote.git');
      const workDir = path.join(epic3cTmp, 'work');
      execFileSync('git', ['init', '--bare', remoteDir], { encoding: 'utf8' });
      execFileSync('git', ['init', workDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'README.md'), 'init\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['--git-dir', remoteDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      execFileSync('git', ['checkout', '-b', 'workflow/issue-122-epic3c'], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'final-change.txt'), 'included by final commit gate\n');
      execFileSync('git', ['add', 'final-change.txt'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'chore: phase6 final gate'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['checkout', 'main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
        '--branch', 'workflow/issue-122-epic3c', '--issue', '122', '--project', 'epic3c'
      ], { cwd: workDir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      assert(fs.existsSync(path.join(workDir, 'final-change.txt')), 'Epic Case 3C: final committed change must be present on main after sink');
      const lastMsg3c = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: workDir, encoding: 'utf8' }).trim();
      assert(lastMsg3c === 'chore: phase6 final gate', 'Epic Case 3C: final commit must be the sink target, got ' + lastMsg3c);
    } finally {
      fs.rmSync(epic3cTmp, { recursive: true, force: true });
    }

    // Epic Case 4: FF race retry exhaustion (FORCE_FF_FAIL=3 == MAX_AUTOMERGE_RETRIES)
    const epic4Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic4-'));
    try {
      const remoteDir = path.join(epic4Tmp, 'remote.git');
      const workDir = path.join(epic4Tmp, 'work');
      const siblingDir = path.join(epic4Tmp, 'sibling');
      execFileSync('git', ['init', '--bare', remoteDir], { encoding: 'utf8' });
      execFileSync('git', ['init', workDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'README.md'), 'init\n');
      execFileSync('git', ['add', 'README.md'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['--git-dir', remoteDir, 'symbolic-ref', 'HEAD', 'refs/heads/main'], { encoding: 'utf8' });
      // Sibling advances origin/main (same setup as Case 3)
      execFileSync('git', ['clone', remoteDir, siblingDir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'sibling@test.com'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Sibling'], { cwd: siblingDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(siblingDir, 'sibling.txt'), 'sibling\n');
      execFileSync('git', ['add', 'sibling.txt'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'sibling commit'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['push', 'origin', 'main'], { cwd: siblingDir, encoding: 'utf8' });
      execFileSync('git', ['fetch', 'origin'], { cwd: workDir, encoding: 'utf8' });
      // Cut feature branch, add feature commit (rebase needed)
      execFileSync('git', ['checkout', '-b', 'workflow/issue-101-epic4'], { cwd: workDir, encoding: 'utf8' });
      fs.writeFileSync(path.join(workDir, 'feature4.txt'), 'feature4\n');
      execFileSync('git', ['add', 'feature4.txt'], { cwd: workDir, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'feature commit epic4'], { cwd: workDir, encoding: 'utf8' });
      // Run sink-merge OFFLINE=1 with FORCE_FF_FAIL=3 — expect exit 2
      let epic4ExitCode = 0;
      try {
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
          '--branch', 'workflow/issue-101-epic4', '--issue', '101', '--project', 'epic4'
        ], { cwd: workDir, encoding: 'utf8', env: {
          ...process.env,
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_WORKFLOW_FORCE_FF_FAIL: '3'
        }});
      } catch (e) {
        epic4ExitCode = e.status || 1;
      }
      assert(epic4ExitCode === 2,
        'Epic Case 4: sink-merge must exit 2 on FF race exhaustion, got ' + epic4ExitCode);
      // Feature branch must NOT be deleted (cleanup step skipped)
      let branchStillExists4 = false;
      try {
        execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/workflow/issue-101-epic4'],
          { cwd: workDir, encoding: 'utf8' });
        branchStillExists4 = true;
      } catch (_) { branchStillExists4 = false; }
      assert(branchStillExists4,
        'Epic Case 4: feature branch must NOT be deleted when FF race exhausted');
    } finally {
      fs.rmSync(epic4Tmp, { recursive: true, force: true });
    }

    // Epic Case 5: kaola-workflow-roadmap.js — generate/migrate/validate/init-issue
    {
      const roadmapScriptPath = path.join(__dirname, 'kaola-workflow-roadmap.js');
      assert(fs.existsSync(roadmapScriptPath), 'Epic Case 5: kaola-workflow-roadmap.js must exist');

      const epic5Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic5-'));
      try {
        const roadmapDir = path.join(epic5Tmp, 'kaola-workflow', '.roadmap');
        const roadmapFilePath = path.join(epic5Tmp, 'kaola-workflow', 'ROADMAP.md');
        fs.mkdirSync(roadmapDir, { recursive: true });

        // Write two fixture per-issue files
        fs.writeFileSync(path.join(roadmapDir, 'issue-5.md'),
          'issue: #5\ntitle: roadmap regenerator\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
        fs.writeFileSync(path.join(roadmapDir, 'issue-6.md'),
          'issue: #6\ntitle: parallelizability classifier\nstatus: open\nworkflow_project: —\nnext_step: blocked by #5\n');

        // Sub-test A: generate produces ROADMAP.md with correct table rows
        execFileSync(process.execPath, [roadmapScriptPath, 'generate'],
          { cwd: epic5Tmp, encoding: 'utf8' });
        assert(fs.existsSync(roadmapFilePath), 'Epic Case 5A: generate must create ROADMAP.md');
        const content1 = fs.readFileSync(roadmapFilePath, 'utf8');
        assert(content1.includes('do not edit'), 'Epic Case 5A: ROADMAP.md must include "do not edit" comment');
        assert(content1.includes('| #5 |'), 'Epic Case 5A: ROADMAP.md must include issue-5 row');
        assert(content1.includes('| #6 |'), 'Epic Case 5A: ROADMAP.md must include issue-6 row');
        assert(content1.includes('roadmap regenerator'), 'Epic Case 5A: ROADMAP.md must include issue-5 title');

        // Sub-test B: second generate is byte-for-byte identical (idempotent)
        const out2 = execFileSync(process.execPath, [roadmapScriptPath, 'generate'],
          { cwd: epic5Tmp, encoding: 'utf8' });
        assert(out2.trim() === 'up-to-date', 'Epic Case 5B: second generate must report up-to-date');
        const content2 = fs.readFileSync(roadmapFilePath, 'utf8');
        assert(content1 === content2, 'Epic Case 5B: ROADMAP.md must be byte-for-byte identical on second generate');

        // Sub-test C: validate exits 0 when ROADMAP.md is current
        let cCode = 0;
        try {
          execFileSync(process.execPath, [roadmapScriptPath, 'validate'],
            { cwd: epic5Tmp, encoding: 'utf8' });
        } catch (e) { cCode = e.status || 1; }
        assert(cCode === 0, 'Epic Case 5C: validate must exit 0 when ROADMAP.md is current');

        // Sub-test D: validate exits 1 when ROADMAP.md is stale
        fs.writeFileSync(roadmapFilePath, '# Stale Roadmap\n');
        let dCode = 0;
        try {
          execFileSync(process.execPath, [roadmapScriptPath, 'validate'],
            { cwd: epic5Tmp, encoding: 'utf8' });
        } catch (e) { dCode = e.status || 1; }
        assert(dCode === 1, 'Epic Case 5D: validate must exit 1 when ROADMAP.md is stale, got ' + dCode);
      } finally {
        fs.rmSync(epic5Tmp, { recursive: true, force: true });
      }

      // Sub-test E: migrate from existing ROADMAP.md table
      const epic5bTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic5b-'));
      try {
        fs.mkdirSync(path.join(epic5bTmp, 'kaola-workflow'), { recursive: true });
        fs.writeFileSync(path.join(epic5bTmp, 'kaola-workflow', 'ROADMAP.md'), [
          '# Kaola-Workflow Roadmap',
          '',
          '## Active Work',
          '',
          '| Issue | Title | Status | Workflow Project | Next Step |',
          '|-------|-------|--------|------------------|-----------|',
          '| #5 | roadmap regenerator | open | — | ready |',
          '| #9 | cross-machine hardening | open | — | ready |',
          '',
          '## Rules',
          '',
          '- placeholder',
          '',
        ].join('\n'));
        const migrateOut1 = execFileSync(process.execPath, [roadmapScriptPath, 'migrate'],
          { cwd: epic5bTmp, encoding: 'utf8' });
        assert(migrateOut1.includes('created: issue-5.md'), 'Epic Case 5E: migrate must create issue-5.md');
        assert(migrateOut1.includes('created: issue-9.md'), 'Epic Case 5E: migrate must create issue-9.md');
        assert(fs.existsSync(path.join(epic5bTmp, 'kaola-workflow', '.roadmap', 'issue-5.md')),
          'Epic Case 5E: issue-5.md must exist after migrate');
        assert(fs.existsSync(path.join(epic5bTmp, 'kaola-workflow', '.roadmap', 'issue-9.md')),
          'Epic Case 5E: issue-9.md must exist after migrate');
        // Second migrate must be idempotent
        const migrateOut2 = execFileSync(process.execPath, [roadmapScriptPath, 'migrate'],
          { cwd: epic5bTmp, encoding: 'utf8' });
        assert(migrateOut2.includes('skip'), 'Epic Case 5E: second migrate must report skipped files');
      } finally {
        fs.rmSync(epic5bTmp, { recursive: true, force: true });
      }

      // Sub-test F: init-issue creates per-issue file; second call is idempotent
      const epic5cTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic5c-'));
      try {
        const initOut1 = execFileSync(process.execPath, [
          roadmapScriptPath, 'init-issue',
          '--issue', '42', '--title', 'my feature',
          '--status', 'open', '--workflow-project', 'test-project', '--next-step', 'ready',
        ], { cwd: epic5cTmp, encoding: 'utf8' });
        assert(initOut1.includes('created: issue-42.md'), 'Epic Case 5F: init-issue must report created');
        const issueFile = path.join(epic5cTmp, 'kaola-workflow', '.roadmap', 'issue-42.md');
        assert(fs.existsSync(issueFile), 'Epic Case 5F: issue-42.md must exist');
        const issueContent = fs.readFileSync(issueFile, 'utf8');
        assert(issueContent.includes('issue: #42'), 'Epic Case 5F: issue file must contain issue: #42');
        assert(issueContent.includes('title: my feature'), 'Epic Case 5F: issue file must contain title');
        assert(issueContent.includes('workflow_project: test-project'),
          'Epic Case 5F: issue file must contain workflow_project');
        // Second call must be idempotent
        const initOut2 = execFileSync(process.execPath, [
          roadmapScriptPath, 'init-issue', '--issue', '42',
        ], { cwd: epic5cTmp, encoding: 'utf8' });
        assert(initOut2.includes('skip: issue-42.md already exists'),
          'Epic Case 5F: second init-issue must report skip');
      } finally {
        fs.rmSync(epic5cTmp, { recursive: true, force: true });
      }

      // Sub-test G: project-name subcommand
      {
        const epic5gTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic5g-'));
        try {
          const roadmapDir5G = path.join(epic5gTmp, 'kaola-workflow', '.roadmap');
          fs.mkdirSync(roadmapDir5G, { recursive: true });

          // 5G-a: workflow_project is a real slug → exit 0, slug on stdout
          execFileSync(process.execPath, [roadmapScriptPath, 'init-issue',
            '--issue', '38', '--title', 'test-issue', '--status', 'open',
            '--workflow-project', 'guard-handoff', '--next-step', 'ready',
          ], { cwd: epic5gTmp, encoding: 'utf8' });
          const out5Ga = execFileSync(process.execPath,
            [roadmapScriptPath, 'project-name', '--issue', '38'],
            { cwd: epic5gTmp, encoding: 'utf8' }).trim();
          assert(out5Ga === 'guard-handoff', 'Epic Case 5G-a: project-name must return slug, got ' + out5Ga);

          // 5G-b: init-issue without --workflow-project → placeholder '—' → exit 1, no stdout
          execFileSync(process.execPath, [roadmapScriptPath, 'init-issue',
            '--issue', '39', '--title', 'no-slug', '--status', 'open', '--next-step', 'ready',
          ], { cwd: epic5gTmp, encoding: 'utf8' });
          let exit5Gb = 0;
          let stdout5Gb = '';
          try {
            stdout5Gb = execFileSync(process.execPath,
              [roadmapScriptPath, 'project-name', '--issue', '39'],
              { cwd: epic5gTmp, encoding: 'utf8' });
          } catch (e) { exit5Gb = e.status || 1; }
          assert(exit5Gb === 1, 'Epic Case 5G-b: placeholder workflow_project must exit 1, got ' + exit5Gb);
          assert(stdout5Gb.trim() === '', 'Epic Case 5G-b: placeholder must produce no stdout');

          // 5G-c: no file for issue 999 → exit 1
          let exit5Gc = 0;
          try {
            execFileSync(process.execPath,
              [roadmapScriptPath, 'project-name', '--issue', '999'],
              { cwd: epic5gTmp, encoding: 'utf8' });
          } catch (e) { exit5Gc = e.status || 1; }
          assert(exit5Gc === 1, 'Epic Case 5G-c: missing file must exit 1, got ' + exit5Gc);

          // 5G-d: blank workflow_project field → exit 1
          const blankIssuePath = path.join(roadmapDir5G, 'issue-40.md');
          fs.writeFileSync(blankIssuePath,
            'issue: #40\ntitle: blank-test\nstatus: open\nworkflow_project: \nnext_step: ready\n');
          let exit5Gd = 0;
          try {
            execFileSync(process.execPath,
              [roadmapScriptPath, 'project-name', '--issue', '40'],
              { cwd: epic5gTmp, encoding: 'utf8' });
          } catch (e) { exit5Gd = e.status || 1; }
          assert(exit5Gd === 1, 'Epic Case 5G-d: blank workflow_project must exit 1, got ' + exit5Gd);
        } finally {
          fs.rmSync(epic5gTmp, { recursive: true, force: true });
        }
      }

      // Sub-test H: buildSinkBranchName unit tests via export guard
      {
        const { buildSinkBranchName } = require(path.join(__dirname, 'kaola-workflow-claim.js'));

        // 5H-1: project equals 'issue-38' fallback → no suffix
        assert(
          buildSinkBranchName(38, 'issue-38') === 'workflow/issue-38',
          'Epic Case 5H-1: issue-N project must produce no suffix, got ' + buildSinkBranchName(38, 'issue-38')
        );

        // 5H-2: normal project slug → appended
        assert(
          buildSinkBranchName(38, 'guard-handoff') === 'workflow/issue-38-guard-handoff',
          'Epic Case 5H-2: slug must be appended, got ' + buildSinkBranchName(38, 'guard-handoff')
        );

        // 5H-3: project already carries issue-N prefix → dedup
        assert(
          buildSinkBranchName(38, 'issue-38-guard') === 'workflow/issue-38-guard',
          'Epic Case 5H-3: existing prefix must not double, got ' + buildSinkBranchName(38, 'issue-38-guard')
        );

        // 5H-4: null issueNumber with fallback branch
        assert(
          buildSinkBranchName(null, 'epic7a', 'workflow/issue-42-epic7a') === 'workflow/issue-42-epic7a',
          'Epic Case 5H-4: null issue must use fallbackBranch, got ' + buildSinkBranchName(null, 'epic7a', 'workflow/issue-42-epic7a')
        );
      }
    }

    // Epic Case 6: parallel-classifier — sub-tests 6A–6F + 6E'
    {
      const classifierScript = path.join(root, 'scripts', 'kaola-workflow-classifier.js');
      assert(fs.existsSync(classifierScript), 'Epic Case 6: kaola-workflow-classifier.js must exist');

      const epic6Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic6-'));
      try {
        const locksDir = locksDirFor(epic6Tmp);
        fs.mkdirSync(locksDir, { recursive: true });
        const roadmapDir = path.join(epic6Tmp, 'kaola-workflow', '.roadmap');
        fs.mkdirSync(roadmapDir, { recursive: true });

        // 6A: green — no locks, no claimed projects → disjoint → green
        fs.writeFileSync(path.join(roadmapDir, 'issue-10.md'),
          'issue: #10\ntitle: add logging\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: \n');
        const out6A = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '10'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6A = JSON.parse(out6A.trim());
        assert(r6A.verdict === 'green', 'Epic Case 6A: green issue must yield green verdict, got ' + r6A.verdict);

        // Setup: add a claimed project with phase3-plan.md referencing commands/ (non-infra)
        const claimedDir = path.join(epic6Tmp, 'kaola-workflow', 'claimed-project');
        fs.mkdirSync(claimedDir, { recursive: true });
        const lockFile6B = JSON.stringify({
          project: 'claimed-project', session_id: 'sess-6b', issue_number: 20,
          claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(),
          last_heartbeat: new Date().toISOString()
        }, null, 2);
        fs.writeFileSync(path.join(locksDir, 'claimed-project.lock'), lockFile6B);
        fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'),
          '# Phase 3\nFiles: commands/workflow-next.md, commands/kaola-workflow-phase1.md\n');

        // 6B: red — candidate body mentions commands/ (same non-infra area as claimed)
        fs.writeFileSync(path.join(roadmapDir, 'issue-11.md'),
          'issue: #11\ntitle: update commands\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: commands/workflow-next.md changes\n');
        const out6B = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '11'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6B = JSON.parse(out6B.trim());
        assert(r6B.verdict === 'red', 'Epic Case 6B: file overlap must yield red verdict, got ' + r6B.verdict);

        // Update claimed to reference scripts/ (shared infra)
        fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'),
          '# Phase 3\nFiles: scripts/kaola-workflow-claim.js\n');

        // 6C: yellow — candidate body mentions scripts/ (shared infra area)
        fs.writeFileSync(path.join(roadmapDir, 'issue-12.md'),
          'issue: #12\ntitle: add script\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: scripts/new-helper.js changes\n');
        const out6C = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '12'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6C = JSON.parse(out6C.trim());
        assert(r6C.verdict === 'yellow', 'Epic Case 6C: shared-infra overlap must yield yellow verdict, got ' + r6C.verdict);
        // Simulate router writing the yellow warning cache file
        const proj6C = 'issue-12';
        fs.mkdirSync(path.join(epic6Tmp, 'kaola-workflow', proj6C, '.cache'), { recursive: true });
        const warningFile6C = path.join(epic6Tmp, 'kaola-workflow', proj6C, '.cache', 'parallel-classifier.md');
        fs.appendFileSync(warningFile6C, 'parallel-classifier: shared-infra warning for issue #12\n');
        const cacheContent6C = fs.readFileSync(warningFile6C, 'utf8');
        assert(cacheContent6C.includes('shared-infra warning'), 'Epic Case 6C: cache file must contain shared-infra warning');

        // 6C2: red — exact shared-infra file overlap must override scripts/ yellow fallback
        fs.writeFileSync(path.join(roadmapDir, 'issue-16.md'),
          'issue: #16\ntitle: exact shared script\nstatus: open\nworkflow_project: —\nnext_step: ready\ntouches:scripts/kaola-workflow-claim.js\n');
        const out6C2 = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '16'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6C2 = JSON.parse(out6C2.trim());
        assert(r6C2.verdict === 'red', 'Epic Case 6C2: exact shared-infra path overlap must yield red, got ' + r6C2.verdict);
        assert(r6C2.reasoning.includes('exact file path'), 'Epic Case 6C2: reasoning must mention exact file path');

        // 6C3: red — plugin copy paths are exact repository paths too
        fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'),
          '# Phase 3\nFiles: plugins/kaola-workflow/scripts/kaola-workflow-claim.js\n');
        fs.writeFileSync(path.join(roadmapDir, 'issue-17.md'),
          'issue: #17\ntitle: exact plugin script\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: plugins/kaola-workflow/scripts/kaola-workflow-claim.js\n');
        const out6C3 = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '17'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6C3 = JSON.parse(out6C3.trim());
        assert(r6C3.verdict === 'red', 'Epic Case 6C3: exact plugin path overlap must yield red, got ' + r6C3.verdict);

        // 6C4: yellow — area-label-only overlap remains a caution, not red
        fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'), '# Phase 3\nNo exact paths\n');
        fs.writeFileSync(path.join(claimedDir, 'phase1-research.md'), 'area:codex-plugin\n');
        fs.writeFileSync(path.join(roadmapDir, 'issue-18.md'),
          'issue: #18\ntitle: area label only\nstatus: open\nworkflow_project: —\nnext_step: ready\narea:codex-plugin\n');
        const out6C4 = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '18'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6C4 = JSON.parse(out6C4.trim());
        assert(r6C4.verdict === 'yellow', 'Epic Case 6C4: area-label-only overlap must yield yellow, got ' + r6C4.verdict);

        // 6C5: red — unknown candidate scope remains conservative while another claim is Phase <= 2
        const earlyDir = path.join(epic6Tmp, 'kaola-workflow', 'early-project');
        fs.mkdirSync(earlyDir, { recursive: true });
        fs.writeFileSync(path.join(locksDir, 'early-project.lock'), JSON.stringify({
          project: 'early-project', session_id: 'sess-6c5', issue_number: 25,
          claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(),
          last_heartbeat: new Date().toISOString()
        }, null, 2));
        fs.writeFileSync(path.join(earlyDir, 'phase1-research.md'), '# Phase 1\nNo files known yet\n');
        fs.writeFileSync(path.join(roadmapDir, 'issue-22.md'),
          'issue: #22\ntitle: no metadata\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
        const out6C5 = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '22'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6C5 = JSON.parse(out6C5.trim());
        assert(r6C5.verdict === 'red', 'Epic Case 6C5: unknown scope with Phase <= 2 claim must yield red, got ' + r6C5.verdict);

        // 6D: OFFLINE + roadmap depends-on → blocked (conservative)
        fs.writeFileSync(path.join(roadmapDir, 'issue-13.md'),
          'issue: #13\ntitle: blocked feature\nstatus: open\nworkflow_project: —\nnext_step: blocked by #20\n');
        const out6D = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '13'],
          { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const r6D = JSON.parse(out6D.trim());
        assert(r6D.verdict === 'blocked', 'Epic Case 6D: OFFLINE + depends-on must yield blocked, got ' + r6D.verdict);
        assert(r6D.reasoning.includes('OFFLINE'), 'Epic Case 6D: reasoning must mention OFFLINE');

        // 6E: online depends-on with dep OPEN → blocked
        // Create gh shim: "issue view 15" returns issue with depends-on:#30; "issue view 30" returns open state
        const ghShimDir = path.join(epic6Tmp, 'bin');
        fs.mkdirSync(ghShimDir, { recursive: true });
        const ghShimPath = path.join(ghShimDir, 'gh');
        const ghShimScript = [
          '#!/bin/sh',
          'ARGS="$@"',
          'case "$ARGS" in',
          '  *"issue view 15"*)',
          '    echo \'{"number":15,"title":"needs open dep","body":"","labels":[{"name":"depends-on:#30"}],"state":"open"}\'',
          '    ;;',
          '  *"issue view 30"*)',
          '    echo \'{"state":"open","closedAt":null}\'',
          '    ;;',
          '  *)',
          '    echo \'[]\' ;;',
          'esac',
        ].join('\n');
        fs.writeFileSync(ghShimPath, ghShimScript);
        fs.chmodSync(ghShimPath, 0o755);
        fs.writeFileSync(path.join(roadmapDir, 'issue-15.md'),
          'issue: #15\ntitle: needs open dep\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
        const out6E = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '15'],
          { cwd: epic6Tmp, encoding: 'utf8',
            env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: ghShimDir + ':' + (process.env.PATH || '') } });
        const r6E = JSON.parse(out6E.trim());
        assert(r6E.verdict === 'blocked', 'Epic Case 6E: online depends-on open must yield blocked, got ' + r6E.verdict);

        // 6E': online depends-on with dep CLOSED → not blocked
        const ghShimScript2 = ghShimScript
          .replace('"state":"open","closedAt":null', '"state":"closed","closedAt":"2026-01-01T00:00:00Z"');
        fs.writeFileSync(ghShimPath, ghShimScript2);
        const out6E2 = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '15'],
          { cwd: epic6Tmp, encoding: 'utf8',
            env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '0', PATH: ghShimDir + ':' + (process.env.PATH || '') } });
        const r6E2 = JSON.parse(out6E2.trim());
        assert(r6E2.verdict !== 'blocked', 'Epic Case 6E\': dep closed must not yield blocked, got ' + r6E2.verdict);

        // 6F: claimed-set filtering — issue already in lock file → exit code 2
        const lockFile6F = JSON.stringify({
          project: 'another-project', session_id: 'sess-6f', issue_number: 10,
          claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(),
          last_heartbeat: new Date().toISOString()
        }, null, 2);
        fs.writeFileSync(path.join(locksDir, 'another-project.lock'), lockFile6F);
        let exit6F = 0;
        try {
          execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '10'],
            { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        } catch (e) { exit6F = e.status || 1; }
        assert(exit6F === 2, 'Epic Case 6F: already-claimed issue must cause exit code 2, got ' + exit6F);

        // 6F2: active workflow-state with issue_number also blocks a duplicate claim
        const stateOnlyDir6F2 = path.join(epic6Tmp, 'kaola-workflow', 'state-only-issue');
        fs.mkdirSync(stateOnlyDir6F2, { recursive: true });
        fs.writeFileSync(path.join(stateOnlyDir6F2, 'workflow-state.md'), [
          '# Kaola-Workflow State',
          '',
          '## Project',
          'name: state-only-issue',
          'status: active',
          '',
          '## Current Position',
          'phase: 1',
          'phase_name: Research',
          'step: requirement-parsing',
          'next_command: /kaola-workflow-phase1 state-only-issue',
          '',
          '## Sink',
          'branch: workflow/issue-14-state-only-issue',
          'issue_number: 14',
          'claimed_at: 2026-05-15T00:00:00.000Z',
          'sink: merge',
          '',
        ].join('\n'));
        let exit6F2 = 0;
        try {
          execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '14'],
            { cwd: epic6Tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
        } catch (e) { exit6F2 = e.status || 1; }
        assert(exit6F2 === 2, 'Epic Case 6F2: active state issue_number must cause exit code 2, got ' + exit6F2);

        // 6G: bootstrap skips a remotely claimed issue and selects the next free issue
        const ghShimBootstrap = [
          '#!/bin/sh',
          'ARGS="$@"',
          'case "$ARGS" in',
          '  *"issue list"*)',
          '    echo \'[{"number":19},{"number":21}]\'',
          '    ;;',
          '  *"issue view 19"*)',
          '    echo \'{"number":19,"title":"remote claimed","body":"scripts/remote.js","labels":[{"name":"workflow:in-progress"}],"state":"open"}\'',
          '    ;;',
          '  *"issue view 21"*)',
          '    echo \'{"number":21,"title":"free issue","body":"commands/free.md","labels":[],"state":"open"}\'',
          '    ;;',
          '  *"repo view"*)',
          '    echo \'{"owner":{"login":"test"},"name":"repo"}\'',
          '    ;;',
          '  *"repos/test/repo/issues/19/comments"*)',
          '    echo \'[{"id":190,"body":"Session claimed by remote <!-- kw:claim sess=remote -->"}]\'',
          '    ;;',
          '  *"repos/test/repo/issues/21/comments"*)',
          '    echo \'[]\'',
          '    ;;',
          '  *"issue comment 21"*)',
          '    echo "https://github.com/test/repo/issues/21#issuecomment-210"',
          '    ;;',
          '  *)',
          '    echo \'[]\' ;;',
          'esac',
        ].join('\n');
        fs.writeFileSync(ghShimPath, ghShimBootstrap);
        fs.chmodSync(ghShimPath, 0o755);
        const claimScript6G = path.join(root, 'scripts', 'kaola-workflow-claim.js');
        const out6G = execFileSync(process.execPath, [
          claimScript6G, 'bootstrap',
          '--session', 'sess-6g',
          '--runtime', 'codex'
        ], {
          cwd: epic6Tmp,
          encoding: 'utf8',
          env: { ...process.env, PATH: ghShimDir + path.delimiter + (process.env.PATH || ''), HOME: epic6Tmp }
        });
        const r6G = JSON.parse(out6G.trim());
        assert(r6G.issue === 21, 'Epic Case 6G: bootstrap must select free issue #21, got #' + r6G.issue);
        assert(fs.existsSync(path.join(locksDir, 'issue-21.lock')), 'Epic Case 6G: issue-21 lock must exist after bootstrap');
        assert(!fs.existsSync(path.join(locksDir, 'issue-19.lock')), 'Epic Case 6G: issue-19 lock must not be created');

        // 6H: red — host-project path src/foo.ts in both candidate and claimed lock → exact overlap
        {
          const epic6HTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic6h-'));
          try {
            const locksDir6H = locksDirFor(epic6HTmp);
            const claimedDir6H = path.join(epic6HTmp, 'kaola-workflow', 'host-claimed');
            fs.mkdirSync(locksDir6H, { recursive: true });
            fs.mkdirSync(claimedDir6H, { recursive: true });
            // Claimed lock is for issue 60; candidate being classified is issue 61
            fs.writeFileSync(path.join(locksDir6H, 'host-claimed.lock'), JSON.stringify({
              project: 'host-claimed', session_id: 'sess-6h', issue_number: 60,
              claimed_at: new Date().toISOString(),
              expires: new Date(Date.now() + 3600000).toISOString(),
              last_heartbeat: new Date().toISOString()
            }, null, 2));
            // Claimed lock's phase3 plan references src/foo.ts
            fs.writeFileSync(path.join(claimedDir6H, 'phase3-plan.md'),
              '# Phase 3\nTouches: src/foo.ts\n');
            const roadmapDir6H = path.join(epic6HTmp, 'kaola-workflow', '.roadmap');
            fs.mkdirSync(roadmapDir6H, { recursive: true });
            // Candidate issue 61 also touches src/foo.ts
            fs.writeFileSync(path.join(roadmapDir6H, 'issue-61.md'),
              'issue: #61\ntitle: host feature\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: Modifies src/foo.ts\n');
            const out6H = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '61'],
              { cwd: epic6HTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
            const r6H = JSON.parse(out6H.trim());
            assert(r6H.verdict === 'red',
              'Epic Case 6H: exact file path overlap on host-project path must yield red, got ' + r6H.verdict);
            assert(r6H.reasoning.includes('exact file path'),
              'Epic Case 6H: reasoning must mention "exact file path", got: ' + r6H.reasoning);
          } finally {
            fs.rmSync(epic6HTmp, { recursive: true, force: true });
          }
        }

        // 6I: green — garbage lock whose projectDir does NOT exist on disk; no path info
        // The ghost lock claims issue 50; we classify a different issue (51) which has no path info.
        // Without the projectDir guard, the conservative-red trigger would fire (claimed lock in phase<=2
        // + no path info on candidate). With the guard in scanClaimedOverlap the ghost lock is skipped
        // and the candidate sees no active claims → green.
        {
          const epic6ITmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic6i-'));
          try {
            const locksDir6I = locksDirFor(epic6ITmp);
            fs.mkdirSync(locksDir6I, { recursive: true });
            fs.writeFileSync(path.join(locksDir6I, 'ghost-project.lock'), JSON.stringify({
              project: 'ghost-project', session_id: 'sess-6i', issue_number: 50,
              claimed_at: new Date().toISOString(),
              expires: new Date(Date.now() + 3600000).toISOString(),
              last_heartbeat: new Date().toISOString()
            }, null, 2));
            const roadmapDir6I = path.join(epic6ITmp, 'kaola-workflow', '.roadmap');
            fs.mkdirSync(roadmapDir6I, { recursive: true });
            // Candidate issue 51 has no path info; ghost lock (issue 50) has no projectDir
            fs.writeFileSync(path.join(roadmapDir6I, 'issue-51.md'),
              'issue: #51\ntitle: no metadata\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
            const out6I = execFileSync(process.execPath, [classifierScript, 'classify', '--issue', '51'],
              { cwd: epic6ITmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
            const r6I = JSON.parse(out6I.trim());
            assert(r6I.verdict === 'green',
              'Epic Case 6I: missing projectDir must skip lock; expected green, got ' + r6I.verdict);
          } finally {
            fs.rmSync(epic6ITmp, { recursive: true, force: true });
          }
        }

        // 6J: ticker orphan-exit — spawned without Claude ancestor self-terminates and removes PID file
        {
          const epic6JTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic6j-'));
          const stderrFile6J = path.join(epic6JTmp, 'ticker-stderr.txt');
          try {
            const claimScript6J = path.join(root, 'scripts', 'kaola-workflow-claim.js');
            const coordRoot6J = path.join(epic6JTmp, '.git');
            fs.mkdirSync(path.join(coordRoot6J, 'kaola-workflow', '.tickers'), { recursive: true });
            const sessionId6J = 'sess-6j-orphan';
            const pidFile6J = path.join(coordRoot6J, 'kaola-workflow', '.tickers', sessionId6J + '.pid');

            // Use (cmd &) subshell pattern: subshell exits immediately after fork,
            // breaking the ancestor chain before walkToClaudePid() runs.
            // Stderr captured to file (not /dev/null) so we can assert the orphan message.
            const spawnScript = [
              `(nohup "${process.execPath}" "${claimScript6J}" ticker`,
              `  --session "${sessionId6J}"`,
              `  --interval 60000`,
              `  </dev/null 2>"${stderrFile6J}" &)`,
              `; sleep 0.05`
            ].join(' ');
            spawnSync('sh', ['-c', spawnScript], {
              cwd: epic6JTmp,
              encoding: 'utf8',
              env: {
                ...process.env,
                KAOLA_WORKFLOW_OFFLINE: '0',
                HOME: epic6JTmp
              }
            });

            // Wait up to 1500ms for ticker to exit and remove its PID file
            let elapsed = 0;
            let pidFileGone = false;
            while (elapsed < 1500) {
              if (!fs.existsSync(pidFile6J)) { pidFileGone = true; break; }
              spawnSync('sh', ['-c', 'sleep 0.1']);
              elapsed += 100;
            }
            assert(pidFileGone,
              'Epic Case 6J: orphaned ticker must remove its PID file within 1500ms; file still exists at ' + pidFile6J);

            // Assert orphan-exit message in captured stderr
            const stderr6J = fs.existsSync(stderrFile6J)
              ? fs.readFileSync(stderrFile6J, 'utf8')
              : '';
            assert(stderr6J.includes('no Claude ancestor at startup'),
              'Epic Case 6J: ticker stderr must contain "no Claude ancestor at startup", got: ' + stderr6J);
          } finally {
            fs.rmSync(epic6JTmp, { recursive: true, force: true });
          }
        }

      } finally {
        fs.rmSync(epic6Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 7: pr-sink — sub-tests 7G, 7A, 7B, 7C, 7D, 7E, 7F
    {
      const claimScript = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const sinkPrScript = path.join(root, 'scripts', 'kaola-workflow-sink-pr.js');
      assert(fs.existsSync(claimScript), 'Epic Case 7: kaola-workflow-claim.js must exist');
      assert(fs.existsSync(sinkPrScript), 'Epic Case 7: kaola-workflow-sink-pr.js must exist');

      const epic7Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic7-'));
      try {
        // Git scaffold: bare remote + work clone
        const remoteDir = path.join(epic7Tmp, 'remote.git');
        const workDir = path.join(epic7Tmp, 'work');
        execFileSync('git', ['init', '--bare', remoteDir]);
        execFileSync('git', ['init', workDir]);
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir });
        execFileSync('git', ['remote', 'add', 'origin', remoteDir], { cwd: workDir });
        fs.writeFileSync(path.join(workDir, '.gitkeep'), '');
        execFileSync('git', ['add', '.gitkeep'], { cwd: workDir });
        execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir });
        execFileSync('git', ['push', 'origin', 'HEAD:main'], { cwd: workDir });

        // kaola-workflow directories
        const kwDir = path.join(workDir, 'kaola-workflow');
        const locksDir = locksDirFor(workDir);
        const sessionsDir = sessionsDirFor(workDir);
        fs.mkdirSync(locksDir, { recursive: true });
        fs.mkdirSync(sessionsDir, { recursive: true });

        // gh shim at epic7Tmp/bin/gh
        const ghShimDir = path.join(epic7Tmp, 'bin');
        fs.mkdirSync(ghShimDir, { recursive: true });
        const ghCallLog = path.join(epic7Tmp, 'gh-calls.log');
        const ghShimPath = path.join(ghShimDir, 'gh');
        fs.writeFileSync(ghShimPath, `#!/bin/sh
echo "$@" >> "${ghCallLog}"
# pr create → return fake URL
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  echo "https://github.com/test/repo/pull/42"
  exit 0
fi
# pr view → return OPEN JSON (default; override in specific tests using a separate shim)
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '{"state":"OPEN","mergedAt":null,"url":"https://github.com/test/repo/pull/42","number":42,"closedAt":null}'
  exit 0
fi
# pr merge → log and succeed
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  exit 0
fi
# issue edit → succeed
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then
  exit 0
fi
exit 0
`);
        fs.chmodSync(ghShimPath, 0o755);

        // Base env: PATH with ghShimDir prepended, HOME isolated to epic7Tmp
        const baseEnv = {
          ...process.env,
          PATH: ghShimDir + path.delimiter + (process.env.PATH || ''),
          HOME: epic7Tmp,
          KAOLA_WORKFLOW_OFFLINE: '1'
        };
        const onlineEnv = {
          ...process.env,
          PATH: ghShimDir + path.delimiter + (process.env.PATH || ''),
          HOME: epic7Tmp
        };

        // Config setup (for pr_auto_merge tests)
        const configDir = path.join(epic7Tmp, '.config', 'kaola-workflow');
        fs.mkdirSync(configDir, { recursive: true });
        // Default config (pr_auto_merge: false)
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ pr_auto_merge: false }));

        // 7G: claim --sink pr → lock.sink === 'pr', workflow-state.md Sink block contains 'sink: pr'
        const projDir7G = path.join(kwDir, 'epic7g');
        fs.mkdirSync(projDir7G, { recursive: true });
        fs.writeFileSync(path.join(projDir7G, 'workflow-state.md'),
          '# Kaola-Workflow State\n\n## Project\nname: epic7g\nstatus: active\n');
        execFileSync(process.execPath, [claimScript, 'claim', '--session', 'sess-7g', '--project', 'epic7g', '--issue', '42', '--sink', 'pr'],
          { cwd: workDir, encoding: 'utf8', env: baseEnv });
        const lock7G = JSON.parse(fs.readFileSync(path.join(locksDir, 'epic7g.lock'), 'utf8'));
        assert(lock7G.sink === 'pr', '7G: lock.sink must be "pr" when --sink pr passed, got ' + lock7G.sink);
        const state7G = fs.readFileSync(path.join(projDir7G, 'workflow-state.md'), 'utf8');
        assert(state7G.includes('sink: pr'), '7G: ## Sink block must contain "sink: pr"');
        // Regression: branch must not double the issue-N segment
        const branch7Gmatch = state7G.match(/^branch: (.+)$/m);
        assert(branch7Gmatch, '7G regression: ## Sink must contain a branch: line');
        assert(!/issue-42-issue-42/.test(branch7Gmatch[1]), '7G regression: branch must not duplicate issue-42 segment, got ' + branch7Gmatch[1]);
        // cleanup for next sub-tests
        fs.unlinkSync(path.join(locksDir, 'epic7g.lock'));

        // 7A: sink=pr + gh shim → gh pr create called, PR URL written to summary + Sink block + lock
        const projDir7A = path.join(kwDir, 'epic7a');
        fs.mkdirSync(projDir7A, { recursive: true });
        fs.writeFileSync(path.join(projDir7A, 'workflow-state.md'),
          '# Kaola-Workflow State\n\n## Project\nname: epic7a\nstatus: active\n\n## Sink\nbranch: workflow/issue-42-epic7a\nissue_number: 42\nclaimed_at: 2026-01-01T00:00:00.000Z\nsink: pr\n');
        // Write lock file (sink-pr.js needs it to patch)
        const lock7A = { project: 'epic7a', session_id: 'sess-7a', sink: 'pr', pr_url: null, pr_number: null,
          issue_number: 42, claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(), last_heartbeat: new Date().toISOString() };
        fs.writeFileSync(path.join(locksDir, 'epic7a.lock'), JSON.stringify(lock7A, null, 2));
        // Create feature branch in workDir
        execFileSync('git', ['checkout', '-b', 'workflow/issue-42-epic7a'], { cwd: workDir });
        execFileSync('git', ['checkout', 'main'], { cwd: workDir });
        // Create phase6-summary.md
        fs.writeFileSync(path.join(projDir7A, 'phase6-summary.md'), '# Phase 6 Summary\n\n');
        // Run sink-pr.js
        execFileSync(process.execPath, [sinkPrScript, '--branch', 'workflow/issue-42-epic7a', '--issue', '42', '--project', 'epic7a'],
          { cwd: workDir, encoding: 'utf8', env: onlineEnv });
        // Assertions
        const summary7A = fs.readFileSync(path.join(projDir7A, 'phase6-summary.md'), 'utf8');
        assert(summary7A.includes('https://github.com/test/repo/pull/42'), '7A: phase6-summary.md must contain PR URL');
        const state7A = fs.readFileSync(path.join(projDir7A, 'workflow-state.md'), 'utf8');
        assert(state7A.includes('pr_url: https://github.com/test/repo/pull/42'), '7A: ## Sink block must contain pr_url');
        const lock7AResult = JSON.parse(fs.readFileSync(path.join(locksDir, 'epic7a.lock'), 'utf8'));
        assert(lock7AResult.pr_url === 'https://github.com/test/repo/pull/42', '7A: lock.pr_url must be set');
        assert(lock7AResult.pr_number === 42, '7A: lock.pr_number must be 42');
        // Regression: Sink branch name must not duplicate the issue-N prefix
        assert(!/issue-42-issue-42/.test(state7A), '7A regression: Sink block must not contain doubled issue-42 segment');
        assert(/^branch: workflow\/issue-42-epic7a$/m.test(state7A), '7A regression: Sink branch must be workflow/issue-42-epic7a');
        // cleanup
        execFileSync('git', ['branch', '-D', 'workflow/issue-42-epic7a'], { cwd: workDir });
        fs.unlinkSync(path.join(locksDir, 'epic7a.lock'));

        // 7B: pr_auto_merge: true → gh pr merge called
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ pr_auto_merge: true }));
        // Reset call log
        if (fs.existsSync(ghCallLog)) fs.unlinkSync(ghCallLog);
        const projDir7B = path.join(kwDir, 'epic7b');
        fs.mkdirSync(projDir7B, { recursive: true });
        fs.writeFileSync(path.join(projDir7B, 'workflow-state.md'),
          '# Kaola-Workflow State\n\n## Sink\nbranch: workflow/issue-43-epic7b\nissue_number: 43\nclaimed_at: 2026-01-01T00:00:00.000Z\nsink: pr\n');
        const lock7B = { project: 'epic7b', session_id: 'sess-7b', sink: 'pr', pr_url: null, pr_number: null,
          issue_number: 43, claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(), last_heartbeat: new Date().toISOString() };
        fs.writeFileSync(path.join(locksDir, 'epic7b.lock'), JSON.stringify(lock7B, null, 2));
        fs.writeFileSync(path.join(projDir7B, 'phase6-summary.md'), '');
        execFileSync('git', ['checkout', '-b', 'workflow/issue-43-epic7b'], { cwd: workDir });
        execFileSync('git', ['checkout', 'main'], { cwd: workDir });
        execFileSync(process.execPath, [sinkPrScript, '--branch', 'workflow/issue-43-epic7b', '--issue', '43', '--project', 'epic7b'],
          { cwd: workDir, encoding: 'utf8', env: onlineEnv });
        const ghCalls7B = fs.existsSync(ghCallLog) ? fs.readFileSync(ghCallLog, 'utf8') : '';
        assert(ghCalls7B.includes('pr merge'), '7B: gh pr merge must be called when pr_auto_merge: true');
        // reset config
        fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ pr_auto_merge: false }));
        execFileSync('git', ['branch', '-D', 'workflow/issue-43-epic7b'], { cwd: workDir });
        fs.unlinkSync(path.join(locksDir, 'epic7b.lock'));

        // 7C: watch-pr sees MERGED → releaseSession called, local branch deleted
        const ghShimMergedPath = path.join(epic7Tmp, 'bin7c');
        fs.mkdirSync(ghShimMergedPath, { recursive: true });
        fs.writeFileSync(path.join(ghShimMergedPath, 'gh'), `#!/bin/sh
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '{"state":"MERGED","mergedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/pull/44","number":44,"closedAt":null}'
  exit 0
fi
exit 0
`);
        fs.chmodSync(path.join(ghShimMergedPath, 'gh'), 0o755);
        const mergedEnv = { ...process.env, PATH: ghShimMergedPath + path.delimiter + (process.env.PATH || ''), HOME: epic7Tmp };

        const projDir7C = path.join(kwDir, 'epic7c');
        fs.mkdirSync(projDir7C, { recursive: true });
        const branch7C = 'workflow/issue-44-epic7c';
        execFileSync('git', ['checkout', '-b', branch7C], { cwd: workDir });
        execFileSync('git', ['checkout', 'main'], { cwd: workDir });
        const lock7C = { project: 'epic7c', session_id: 'sess-7c', sink: 'pr', pr_url: 'https://github.com/test/repo/pull/44', pr_number: 44,
          branch: branch7C, issue_number: 44, claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(), last_heartbeat: new Date().toISOString() };
        fs.writeFileSync(path.join(locksDir, 'epic7c.lock'), JSON.stringify(lock7C, null, 2));
        fs.writeFileSync(path.join(sessionsDir, 'sess-7c.json'), JSON.stringify({ session_id: 'sess-7c' }));
        execFileSync(process.execPath, [claimScript, 'watch-pr'],
          { cwd: workDir, encoding: 'utf8', env: mergedEnv });
        assert(!fs.existsSync(path.join(locksDir, 'epic7c.lock')), '7C: lock file must be removed after MERGED');
        assert(!fs.existsSync(path.join(sessionsDir, 'sess-7c.json')), '7C: session file must be removed after MERGED');
        let branchExists7C = false;
        try { execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch7C], { cwd: workDir }); branchExists7C = true; } catch (_) {}
        assert(!branchExists7C, '7C: local branch must be deleted after MERGED');

        // 7D: watch-pr sees CLOSED (no merge) → releaseSession reason=aborted, branch NOT deleted
        const ghShimClosedPath = path.join(epic7Tmp, 'bin7d');
        fs.mkdirSync(ghShimClosedPath, { recursive: true });
        fs.writeFileSync(path.join(ghShimClosedPath, 'gh'), `#!/bin/sh
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  printf '{"state":"CLOSED","mergedAt":null,"url":"https://github.com/test/repo/pull/45","number":45,"closedAt":"2026-05-15T00:00:00Z"}'
  exit 0
fi
exit 0
`);
        fs.chmodSync(path.join(ghShimClosedPath, 'gh'), 0o755);
        const closedEnv = { ...process.env, PATH: ghShimClosedPath + path.delimiter + (process.env.PATH || ''), HOME: epic7Tmp };

        const projDir7D = path.join(kwDir, 'epic7d');
        fs.mkdirSync(projDir7D, { recursive: true });
        const branch7D = 'workflow/issue-45-epic7d';
        execFileSync('git', ['checkout', '-b', branch7D], { cwd: workDir });
        execFileSync('git', ['checkout', 'main'], { cwd: workDir });
        const lock7D = { project: 'epic7d', session_id: 'sess-7d', sink: 'pr', pr_url: 'https://github.com/test/repo/pull/45', pr_number: 45,
          branch: branch7D, issue_number: 45, claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(), last_heartbeat: new Date().toISOString() };
        fs.writeFileSync(path.join(locksDir, 'epic7d.lock'), JSON.stringify(lock7D, null, 2));
        fs.writeFileSync(path.join(sessionsDir, 'sess-7d.json'), JSON.stringify({ session_id: 'sess-7d' }));
        execFileSync(process.execPath, [claimScript, 'watch-pr'],
          { cwd: workDir, encoding: 'utf8', env: closedEnv });
        assert(!fs.existsSync(path.join(locksDir, 'epic7d.lock')), '7D: lock file must be removed after CLOSED');
        let branchExists7D = false;
        try { execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch7D], { cwd: workDir }); branchExists7D = true; } catch (_) {}
        assert(branchExists7D, '7D: local branch must NOT be deleted after CLOSED-without-merge');
        execFileSync('git', ['branch', '-D', branch7D], { cwd: workDir });

        // 7E: watch-pr sees OPEN → last_heartbeat + expires updated; lock retained
        const projDir7E = path.join(kwDir, 'epic7e');
        fs.mkdirSync(projDir7E, { recursive: true });
        const now7E = new Date();
        const originalExpires7E = new Date(now7E.getTime() - 60000).toISOString(); // 1 minute in the past
        const lock7E = { project: 'epic7e', session_id: 'sess-7e', sink: 'pr', pr_url: 'https://github.com/test/repo/pull/46', pr_number: 46,
          branch: 'workflow/issue-46-epic7e', issue_number: 46, claimed_at: now7E.toISOString(),
          expires: originalExpires7E, last_heartbeat: originalExpires7E };
        fs.writeFileSync(path.join(locksDir, 'epic7e.lock'), JSON.stringify(lock7E, null, 2));
        fs.writeFileSync(path.join(sessionsDir, 'sess-7e.json'), JSON.stringify({ session_id: 'sess-7e' }));
        execFileSync(process.execPath, [claimScript, 'watch-pr'],
          { cwd: workDir, encoding: 'utf8', env: onlineEnv });
        assert(fs.existsSync(path.join(locksDir, 'epic7e.lock')), '7E: lock file must still exist for OPEN PR');
        const lock7EResult = JSON.parse(fs.readFileSync(path.join(locksDir, 'epic7e.lock'), 'utf8'));
        assert(new Date(lock7EResult.expires) > new Date(originalExpires7E), '7E: expires must be updated for OPEN PR');
        assert(new Date(lock7EResult.last_heartbeat) >= new Date(originalExpires7E), '7E: last_heartbeat must be updated for OPEN PR');
        fs.unlinkSync(path.join(locksDir, 'epic7e.lock'));

        // 7F: sink-pr.js OFFLINE → OFFLINE_PLACEHOLDER written, exit 0, no gh calls
        if (fs.existsSync(ghCallLog)) fs.unlinkSync(ghCallLog);
        const projDir7F = path.join(kwDir, 'epic7f');
        fs.mkdirSync(projDir7F, { recursive: true });
        fs.writeFileSync(path.join(projDir7F, 'workflow-state.md'),
          '# Kaola-Workflow State\n\n## Sink\nbranch: workflow/issue-47-epic7f\nissue_number: 47\nclaimed_at: 2026-01-01T00:00:00.000Z\nsink: pr\n');
        const lock7F = { project: 'epic7f', session_id: 'sess-7f', sink: 'pr', pr_url: null, pr_number: null,
          issue_number: 47, claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 3600000).toISOString(), last_heartbeat: new Date().toISOString() };
        fs.writeFileSync(path.join(locksDir, 'epic7f.lock'), JSON.stringify(lock7F, null, 2));
        fs.writeFileSync(path.join(projDir7F, 'phase6-summary.md'), '');
        execFileSync(process.execPath, [sinkPrScript, '--branch', 'workflow/issue-47-epic7f', '--issue', '47', '--project', 'epic7f'],
          { cwd: workDir, encoding: 'utf8', env: baseEnv }); // baseEnv has OFFLINE=1
        const summary7F = fs.readFileSync(path.join(projDir7F, 'phase6-summary.md'), 'utf8');
        assert(summary7F.includes('OFFLINE_PLACEHOLDER'), '7F: phase6-summary.md must contain OFFLINE_PLACEHOLDER');
        const state7F = fs.readFileSync(path.join(projDir7F, 'workflow-state.md'), 'utf8');
        assert(state7F.includes('pr_url: OFFLINE_PLACEHOLDER'), '7F: ## Sink block must contain pr_url: OFFLINE_PLACEHOLDER');
        const ghCalls7F = fs.existsSync(ghCallLog) ? fs.readFileSync(ghCallLog, 'utf8') : '';
        assert(ghCalls7F.trim() === '', '7F: no gh calls must be made in OFFLINE mode, got: ' + ghCalls7F);

      } finally {
        fs.rmSync(epic7Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 8: claim hardening (8A–8E)
    {
      const epic8Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8-'));
      try {
        const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');

        function runClaim(workdir, sessionId, issue, claimProject) {
          const r = spawnSync(process.execPath, [
            claimScript, 'claim',
            '--session', sessionId,
            '--project', claimProject,
            '--issue', String(issue)
          ], {
            cwd: workdir,
            encoding: 'utf8',
            env: { ...process.env, HOME: workdir, KAOLA_WORKFLOW_OFFLINE: '1' }
          });
          if (r.status !== 0) throw new Error('runClaim failed (status ' + r.status + ')\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
          return {
            lockPath: path.join(locksDirFor(workdir), claimProject + '.lock'),
            statePath: path.join(workdir, 'kaola-workflow', claimProject, 'workflow-state.md')
          };
        }

        // 8A: lock and session files must be created with mode 0o600
        if (process.platform !== 'win32') {
          const sessId8a = 'sess-8a-' + Date.now();
          const { lockPath: lp8a } = runClaim(epic8Tmp, sessId8a, 3, 'epic8-proj');
          const sessionFile8a = path.join(sessionsDirFor(epic8Tmp), sessId8a + '.json');
          assert((fs.statSync(lp8a).mode & 0o777) === 0o600, '8A: lock file mode must be 0o600');
          assert((fs.statSync(sessionFile8a).mode & 0o777) === 0o600, '8A: session file mode must be 0o600');
        }

        // 8D: cmdStatus must skip (or drift-flag) a lock whose session_id contains path separators
        {
          const epic8dTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8d-'));
          try {
            const locksDir8d = locksDirFor(epic8dTmp);
            fs.mkdirSync(locksDir8d, { recursive: true });
            const now8d = new Date();
            fs.writeFileSync(
              path.join(locksDir8d, 'epic8d.lock'),
              JSON.stringify({
                project: 'epic8d',
                session_id: '../../../etc/passwd',
                expires: new Date(now8d.getTime() + 30 * 60 * 1000).toISOString(),
                last_heartbeat: now8d.toISOString(),
                claimed_at: now8d.toISOString()
              }, null, 2) + '\n'
            );
            const r8d = spawnSync(process.execPath, [claimScript, 'status', '--json'], {
              cwd: epic8dTmp, encoding: 'utf8',
              env: { ...process.env, HOME: epic8dTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8d.status === 0, '8D: status exits 0 even with unsafe session_id in lock');
            const results8d = JSON.parse(r8d.stdout);
            const entry8d = results8d.find(e => e.lock && e.lock.project === 'epic8d');
            assert(entry8d != null, '8D: status must include entry for epic8d lock');
            assert(entry8d.drift && entry8d.drift.includes('session_id unsafe'), '8D: unsafe session_id entry must have drift ["session_id unsafe"]');
          } finally {
            fs.rmSync(epic8dTmp, { recursive: true, force: true });
          }
        }

        // 8B: heartbeat must warn on stderr when ## Lease section is missing
        {
          const epic8bTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8b-'));
          try {
            const locksDir8b = locksDirFor(epic8bTmp);
            const projDir8b = path.join(epic8bTmp, 'kaola-workflow', 'epic8b');
            fs.mkdirSync(locksDir8b, { recursive: true });
            fs.mkdirSync(projDir8b, { recursive: true });
            const now8b = new Date();
            fs.writeFileSync(
              path.join(locksDir8b, 'epic8b.lock'),
              JSON.stringify({
                project: 'epic8b',
                session_id: 'sess-8b',
                expires: new Date(now8b.getTime() + 30 * 60 * 1000).toISOString(),
                last_heartbeat: now8b.toISOString(),
                claimed_at: now8b.toISOString()
              }, null, 2) + '\n'
            );
            // workflow-state.md has Project and Current Position but deliberately NO ## Lease section
            fs.writeFileSync(
              path.join(projDir8b, 'workflow-state.md'),
              '# Kaola-Workflow State\n\n## Project\nname: epic8b\nstatus: active\n\n## Current Position\nphase: 4\n'
            );
            const r8b = spawnSync(process.execPath, [claimScript, 'heartbeat', '--session', 'sess-8b'], {
              cwd: epic8bTmp, encoding: 'utf8',
              env: { ...process.env, HOME: epic8bTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8b.status === 0, '8B: heartbeat exits 0 even when Lease section missing');
            assert(
              r8b.stderr.includes('updateLeaseInPlace: ## Lease section missing in'),
              '8B: heartbeat must warn when Lease section missing, got stderr: ' + r8b.stderr
            );
          } finally {
            fs.rmSync(epic8bTmp, { recursive: true, force: true });
          }
        }

        // 8C: claim_comment_id must render as 'N/A' in offline mode (regression guard)
        {
          const epic8cTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8c-'));
          try {
            const projDir8c = path.join(epic8cTmp, 'kaola-workflow', 'epic8c');
            fs.mkdirSync(projDir8c, { recursive: true });
            fs.writeFileSync(
              path.join(projDir8c, 'workflow-state.md'),
              '# Kaola-Workflow State\n\n## Project\nname: epic8c\nstatus: active\n\n## Last Updated\n2026-01-01T00:00:00Z\n'
            );
            const sessId8c = 'sess-8c-' + Date.now();
            const { statePath: sp8c } = runClaim(epic8cTmp, sessId8c, 3, 'epic8c');
            const state8c = fs.readFileSync(sp8c, 'utf8');
            const m8c = state8c.match(/^claim_comment_id:\s*(.+)$/m);
            assert(m8c != null, '8C: workflow-state.md must contain claim_comment_id line');
            assert(m8c[1].trim() === 'N/A', '8C: claim_comment_id must be N/A in offline mode, got: ' + m8c[1]);
          } finally {
            fs.rmSync(epic8cTmp, { recursive: true, force: true });
          }
        }

        // 8E: claim-after-release — second claim must refresh issue_number and claimed_at (M1 probe)
        {
          const epic8eTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8e-'));
          try {
            const projDir8e = path.join(epic8eTmp, 'kaola-workflow', 'epic8e');
            fs.mkdirSync(projDir8e, { recursive: true });
            // Standard state file with no Sink/Lease
            fs.writeFileSync(
              path.join(projDir8e, 'workflow-state.md'),
              [
                '# Kaola-Workflow State',
                '',
                '## Project',
                'name: epic8e',
                'status: active',
                '',
                '## Current Position',
                'phase: 3',
                'phase_name: Plan',
                '',
                '## Pending Gates',
                '- none',
                '',
                '## Ownership Rules',
                'main_session_role: orchestrator',
                '',
                '## Last Evidence',
                'phase_file: kaola-workflow/epic8e/phase3-plan.md',
                '',
                '## Last Updated',
                '2026-01-01T00:00:00Z',
              ].join('\n') + '\n'
            );

            // Claim #3 with sessA → "Sink doesn't exist" branch appends Sink+Lease at end
            runClaim(epic8eTmp, 'sess-8e-a', 3, 'epic8e');

            // Release sessA
            spawnSync(process.execPath, [claimScript, 'release', '--session', 'sess-8e-a'], {
              cwd: epic8eTmp, encoding: 'utf8',
              env: { ...process.env, HOME: epic8eTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });

            // Claim #4 with sessB → "Sink already exists" branch: re-claim regex replace path
            runClaim(epic8eTmp, 'sess-8e-b', 4, 'epic8e');

            const content8e = fs.readFileSync(path.join(projDir8e, 'workflow-state.md'), 'utf8');
            assert(content8e.includes('issue_number: 4'), '8E: issue_number must be refreshed to 4');
            assert(/^claimed_at:\s*.+$/m.test(content8e), '8E: claimed_at must be present');
            assert(content8e.includes('## Project'), '8E: ## Project section must be preserved');
            assert(content8e.includes('## Current Position'), '8E: ## Current Position section must be preserved');
            assert((content8e.match(/^## Sink\s*$/mg) || []).length === 1, '8E: exactly one ## Sink');
            assert((content8e.match(/^## Lease\s*$/mg) || []).length === 1, '8E: exactly one ## Lease');
          } finally {
            fs.rmSync(epic8eTmp, { recursive: true, force: true });
          }
        }

        // Test 8F — cmdPatchBranch rejects branch names containing newline (H1 fix)
        {
          const epic8fTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8f-'));
          try {
            runClaim(epic8fTmp, 'sess-8f', 3, 'epic8f');

            const r8f = spawnSync(process.execPath, [
              claimScript, 'patch-branch',
              '--session', 'sess-8f',
              '--project', 'epic8f',
              '--branch', 'main\n## Lease\nsession_id: injected'
            ], {
              cwd: epic8fTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8fTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8f.status !== 0, '8F: patch-branch must reject branch names containing newline');
          } finally {
            fs.rmSync(epic8fTmp, { recursive: true, force: true });
          }
        }

        // Test 8G — runtime field is written to lock file
        {
          const epic8gTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8g-'));
          try {
            fs.mkdirSync(locksDirFor(epic8gTmp), { recursive: true });
            fs.mkdirSync(sessionsDirFor(epic8gTmp), { recursive: true });

            // 8G-a: default runtime ('claude') when --runtime is not passed
            const r8ga = spawnSync(process.execPath, [
              claimScript, 'claim',
              '--session', 'sess-8g-a',
              '--project', 'proj-8g-a'
            ], {
              cwd: epic8gTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8gTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8ga.status === 0, '8G-a: claim must succeed, got ' + r8ga.status + '\nstderr: ' + r8ga.stderr);
            const lock8ga = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic8gTmp), 'proj-8g-a.lock'), 'utf8'));
            assert(lock8ga.runtime === 'claude', '8G-a: lock must include runtime=claude by default, got: ' + lock8ga.runtime);

            // 8G-b: explicit --runtime codex wins
            const r8gb = spawnSync(process.execPath, [
              claimScript, 'claim',
              '--session', 'sess-8g-b',
              '--project', 'proj-8g-b',
              '--runtime', 'codex'
            ], {
              cwd: epic8gTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8gTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8gb.status === 0, '8G-b: claim must succeed, got ' + r8gb.status + '\nstderr: ' + r8gb.stderr);
            const lock8gb = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic8gTmp), 'proj-8g-b.lock'), 'utf8'));
            assert(lock8gb.runtime === 'codex', '8G-b: lock must include runtime=codex, got: ' + lock8gb.runtime);
          } finally {
            fs.rmSync(epic8gTmp, { recursive: true, force: true });
          }
        }

        // 8G-c: invalid --runtime value must be rejected (exit 1, stderr contains allowlist message)
        {
          const epic8gcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8gc-'));
          try {
            fs.mkdirSync(locksDirFor(epic8gcTmp), { recursive: true });
            fs.mkdirSync(sessionsDirFor(epic8gcTmp), { recursive: true });
            const r8gc = spawnSync(process.execPath, [
              path.join(root, 'scripts/kaola-workflow-claim.js'), 'claim',
              '--session', 'sess-8gc',
              '--project', 'proj-8gc',
              '--runtime', 'badvalue'
            ], {
              cwd: epic8gcTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8gcTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8gc.status !== 0, '8G-c: claim must reject invalid --runtime value, got exit 0');
            assert(r8gc.stderr.includes('--runtime must be'), '8G-c: stderr must contain allowlist message, got: ' + r8gc.stderr);
          } finally {
            fs.rmSync(epic8gcTmp, { recursive: true, force: true });
          }
        }

        // 8G-d: bootstrap path propagates runtime default ('claude') when --runtime not supplied
        // Verifies FIX-1: args.runtime || 'claude' in runBootstrapClaim so child never gets "undefined"
        {
          const epic8gdTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8gd-'));
          try {
            // Minimal git repo so getRoot() works
            execFileSync('git', ['init', epic8gdTmp], { encoding: 'utf8' });
            fs.mkdirSync(locksDirFor(epic8gdTmp), { recursive: true });
            fs.mkdirSync(sessionsDirFor(epic8gdTmp), { recursive: true });
            // Directly invoke claim (the bootstrap inner call path) without --runtime
            const r8gd = spawnSync(process.execPath, [
              path.join(root, 'scripts/kaola-workflow-claim.js'), 'claim',
              '--session', 'sess-8gd',
              '--project', 'proj-8gd'
            ], {
              cwd: epic8gdTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8gdTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8gd.status === 0, '8G-d: claim without --runtime must succeed, got ' + r8gd.status + '\nstderr: ' + r8gd.stderr);
            const lock8gd = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic8gdTmp), 'proj-8gd.lock'), 'utf8'));
            assert(lock8gd.runtime === 'claude', '8G-d: lock.runtime must be "claude" (not "undefined"), got: ' + lock8gd.runtime);
          } finally {
            fs.rmSync(epic8gdTmp, { recursive: true, force: true });
          }
        }

        // 8H: brand-new claim creates durable Sink/Lease metadata before Phase 1 rewrites state
        {
          const epic8hTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8h-'));
          try {
            execFileSync('git', ['init', epic8hTmp], { encoding: 'utf8' });
            const r8h = spawnSync(process.execPath, [
              claimScript, 'claim',
              '--session', 'sess-8h',
              '--project', 'epic8h',
              '--issue', '15',
              '--runtime', 'codex'
            ], {
              cwd: epic8hTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8hTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8h.status === 0, '8H: claim must succeed for brand-new project, got ' + r8h.status + '\nstderr: ' + r8h.stderr);
            const state8hPath = path.join(epic8hTmp, 'kaola-workflow', 'epic8h', 'workflow-state.md');
            assert(fs.existsSync(state8hPath), '8H: claim must create workflow-state.md for new project');
            const state8h = fs.readFileSync(state8hPath, 'utf8');
            assert(state8h.includes('## Sink'), '8H: state must contain ## Sink');
            assert(state8h.includes('branch: workflow/issue-15-epic8h'), '8H: state must contain issue branch');
            assert(state8h.includes('## Lease'), '8H: state must contain ## Lease');
            assert(state8h.includes('session_id: sess-8h'), '8H: state must contain lease session_id');
          } finally {
            fs.rmSync(epic8hTmp, { recursive: true, force: true });
          }
        }

        // 8K: session lookup validates current ownership; handoff is explicit and guarded.
        {
          const epic8kTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8k-'));
          try {
            runClaim(epic8kTmp, 'sess-8k', 20, 'epic8k');

            const r8kLock = spawnSync(process.execPath, [
              claimScript, 'session', '--project', 'epic8k', '--session', 'sess-8k'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kLock.status === 0, '8K-a: matching lock owner must validate, got ' + r8kLock.status + '\nstderr: ' + r8kLock.stderr);
            assert(r8kLock.stdout.trim() === 'sess-8k', '8K-a: expected current session sess-8k, got: ' + r8kLock.stdout);

            const r8kIntruder = spawnSync(process.execPath, [
              claimScript, 'session', '--project', 'epic8k', '--session', 'sess-intruder'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kIntruder.status === 2, '8K-b: foreign lock owner must be occupied, got ' + r8kIntruder.status);

            // Create a matching local Claude session JSONL for the current live owner.
            const claudeDir8k = path.join(epic8kTmp, '.claude', 'projects', fs.realpathSync(epic8kTmp).replace(/[\\/]/g, '-'));
            fs.mkdirSync(claudeDir8k, { recursive: true });
            fs.writeFileSync(path.join(claudeDir8k, 'sess-8k.jsonl'), '{}\n');

            const r8kCanHandoff = spawnSync(process.execPath, [
              claimScript, 'can-handoff', '--project', 'epic8k', '--session', 'sess-8k-new'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kCanHandoff.status === 2, '8K-d: can-handoff must reject live owner, got ' + r8kCanHandoff.status);
            assert(r8kCanHandoff.stdout.includes('claude-session-jsonl'),
              '8K-d: can-handoff must report local Claude session evidence, got: ' + r8kCanHandoff.stdout);

            const r8kHandoffRejected = spawnSync(process.execPath, [
              claimScript, 'handoff', '--project', 'epic8k', '--session', 'sess-8k-new'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kHandoffRejected.status === 2,
              '8K-e: default handoff must reject live owner, got ' + r8kHandoffRejected.status + '\nstderr: ' + r8kHandoffRejected.stderr);

            const r8kHandoff = spawnSync(process.execPath, [
              claimScript, 'handoff', '--project', 'epic8k', '--session', 'sess-8k-new', '--force-live-takeover'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kHandoff.status === 0, '8K-f: force handoff must succeed, got ' + r8kHandoff.status + '\nstderr: ' + r8kHandoff.stderr);
            const handedOffState = fs.readFileSync(path.join(epic8kTmp, 'kaola-workflow', 'epic8k', 'workflow-state.md'), 'utf8');
            assert(handedOffState.includes('session_id: sess-8k-new'), '8K-f: force handoff must update workflow-state lease');
            const r8kHandoffReceipt = spawnSync(process.execPath, [
              claimScript, 'verify-startup', '--project', 'epic8k', '--session', 'sess-8k-new'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kHandoffReceipt.status === 0,
              '8K-f: force handoff must write an owned startup receipt, got ' + r8kHandoffReceipt.status + '\nstderr: ' + r8kHandoffReceipt.stderr);

            fs.unlinkSync(path.join(locksDirFor(epic8kTmp), 'epic8k.lock'));
            const r8kState = spawnSync(process.execPath, [
              claimScript, 'session', '--project', 'epic8k', '--session', 'sess-8k-new'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kState.status === 0, '8K-g: matching state-only owner must validate, got ' + r8kState.status + '\nstderr: ' + r8kState.stderr);
            assert(r8kState.stdout.trim() === 'sess-8k-new', '8K-g: expected sess-8k-new from workflow-state validation, got: ' + r8kState.stdout);
          } finally {
            fs.rmSync(epic8kTmp, { recursive: true, force: true });
          }
        }

        // 8L: claim:none receipt cannot silently take over a dead-looking project.
        // Regression for issue #26 Bug 1 (claim:none exemption in startupReceiptHandoffBlocker).
        {
          const epic8lTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8l-'));
          try {
            fs.mkdirSync(locksDirFor(epic8lTmp), { recursive: true });
            fs.mkdirSync(sessionsDirFor(epic8lTmp), { recursive: true });
            fs.mkdirSync(path.join(epic8lTmp, 'kaola-workflow', 'issue-99'), { recursive: true });

            // Owner lock that is fully expired with stale heartbeat and no ticker/JSONL.
            fs.writeFileSync(path.join(locksDirFor(epic8lTmp), 'issue-99.lock'),
              JSON.stringify({
                project: 'issue-99',
                issue_number: 99,
                session_id: 'sess-8l-owner',
                machine_id: 'machine-old',
                expires: '2020-01-01T00:00:00.000Z',
                last_heartbeat: '2020-01-01T00:00:00.000Z',
                runtime: 'claude'
              }, null, 2) + '\n');
            fs.writeFileSync(path.join(epic8lTmp, 'kaola-workflow', 'issue-99', 'workflow-state.md'),
              'status: active\nsession_id: sess-8l-owner\n\n## Lease\nsession_id: sess-8l-owner\n');
            // claim:none startup receipt for the new session.
            fs.writeFileSync(path.join(sessionsDirFor(epic8lTmp), 'sess-8l-new.startup.json'),
              JSON.stringify({
                startup_completed: true,
                session: 'sess-8l-new',
                project: null,
                issue: null,
                selected_issue: null,
                selected_project: null,
                verdict: 'none',
                claim: 'none',
                skipped: [{ issue: 99, verdict: 'skipped', reason: 'already claimed' }]
              }, null, 2) + '\n');

            const r8lCan = spawnSync(process.execPath, [
              claimScript, 'can-handoff', '--project', 'issue-99', '--session', 'sess-8l-new'
            ], {
              cwd: epic8lTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8lTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8lCan.status === 2,
              '8L-a: can-handoff must reject claim:none receipt even when owner looks dead, got ' + r8lCan.status + '\nstdout: ' + r8lCan.stdout);
            assert(r8lCan.stdout.includes('startup-receipt'),
              '8L-a: can-handoff must report startup-receipt blocker for claim:none, got: ' + r8lCan.stdout);

            const r8lDefault = spawnSync(process.execPath, [
              claimScript, 'handoff', '--project', 'issue-99', '--session', 'sess-8l-new'
            ], {
              cwd: epic8lTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8lTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8lDefault.status === 2,
              '8L-b: default handoff must reject claim:none receipt, got ' + r8lDefault.status + '\nstderr: ' + r8lDefault.stderr);

            const r8lForce = spawnSync(process.execPath, [
              claimScript, 'handoff', '--project', 'issue-99', '--session', 'sess-8l-new', '--force-live-takeover'
            ], {
              cwd: epic8lTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8lTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8lForce.status === 0,
              '8L-c: --force-live-takeover must still allow recovery, got ' + r8lForce.status + '\nstderr: ' + r8lForce.stderr);
            const r8lForceState = fs.readFileSync(path.join(epic8lTmp, 'kaola-workflow', 'issue-99', 'workflow-state.md'), 'utf8');
            assert(r8lForceState.includes('session_id: sess-8l-new'),
              '8L-c: forced handoff must update workflow-state lease');
          } finally {
            fs.rmSync(epic8lTmp, { recursive: true, force: true });
          }
        }

        // 8M: liveness lookup must match Claude Code's actual encoding when the
        // repo root contains a '.' segment (regression for issue #26 Bug 2).
        {
          const epic8mParent = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8m-'));
          // Embed a dotted path segment that mirrors real-world worktrees like ".claude-worktrees/".
          const epic8mTmp = path.join(epic8mParent, '.worktree', 'live-owner');
          fs.mkdirSync(epic8mTmp, { recursive: true });
          try {
            runClaim(epic8mTmp, 'sess-8m-owner', 77, 'epic8m');

            // Compute the encoded directory the way Claude Code itself stores JSONL files:
            // replace both path separators AND '.' with '-' from the resolved repo root.
            // Use realpath so macOS symlinks like /var -> /private/var match the child's
            // post-`git rev-parse --show-toplevel` view of the root.
            const claudeEncoded = fs.realpathSync(epic8mTmp).replace(/[./\\]/g, '-');
            const claudeDir8m = path.join(fs.realpathSync(epic8mParent), '.claude', 'projects', claudeEncoded);
            fs.mkdirSync(claudeDir8m, { recursive: true });
            fs.writeFileSync(path.join(claudeDir8m, 'sess-8m-owner.jsonl'), '{}\n');

            const r8mCan = spawnSync(process.execPath, [
              claimScript, 'can-handoff', '--project', 'epic8m', '--session', 'sess-8m-new'
            ], {
              cwd: epic8mTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8mParent, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8mCan.status === 2,
              '8M-a: can-handoff must reject when JSONL exists at the dotted-path encoding, got ' + r8mCan.status + '\nstdout: ' + r8mCan.stdout);
            assert(r8mCan.stdout.includes('claude-session-jsonl'),
              '8M-a: liveness check must find JSONL under Claude-encoded dotted path, got: ' + r8mCan.stdout);
          } finally {
            fs.rmSync(epic8mParent, { recursive: true, force: true });
          }
        }

        // 8I: bootstrap without a preexisting session id claims one issue;
        // a second fresh bootstrap skips the locked issue and claims the next.
        {
          const epic8iTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8i-'));
          try {
            const binDir = path.join(epic8iTmp, 'bin');
            fs.mkdirSync(binDir, { recursive: true });
            const ghPath = path.join(binDir, 'gh');
            fs.writeFileSync(ghPath, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":11},{"number":12}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  printf '{"number":%s,"title":"Issue %s","body":"commands/workflow-next.md","labels":[],"state":"OPEN"}' "$num" "$num"
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  case "$3" in
    11) echo "https://github.com/test/repo/issues/11#issuecomment-1100" ;;
    12) echo "https://github.com/test/repo/issues/12#issuecomment-1200" ;;
  esac
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then
  case "$*" in
    *issues/11/comments*) printf '[]' ; exit 0 ;;
    *issues/12/comments*) printf '[]' ; exit 0 ;;
  esac
fi
exit 0
`);
            fs.chmodSync(ghPath, 0o755);
            const env8i = {
              ...process.env,
              PATH: binDir + path.delimiter + (process.env.PATH || ''),
              HOME: epic8iTmp,
              KAOLA_WORKFLOW_OFFLINE: ''
            };
            delete env8i.KAOLA_SESSION_ID;
            delete env8i.CODEX_THREAD_ID;
            delete env8i.CLAUDE_SESSION_ID;

            const r8i1 = spawnSync(process.execPath, [
              claimScript, 'bootstrap', '--runtime', 'codex'
            ], { cwd: epic8iTmp, encoding: 'utf8', env: env8i });
            assert(r8i1.status === 0, '8I-a: bootstrap without --session must claim issue 11, got ' + r8i1.status + '\nstderr: ' + r8i1.stderr);
            const out8i1 = JSON.parse(r8i1.stdout.trim());
            assert(out8i1.issue === 11, '8I-a: first bootstrap must pick issue 11, got ' + out8i1.issue);
            assert(out8i1.session, '8I-a: bootstrap output must include generated session');

            const r8iOwned = spawnSync(process.execPath, [
              claimScript, 'bootstrap', '--session', out8i1.session, '--runtime', 'codex'
            ], { cwd: epic8iTmp, encoding: 'utf8', env: env8i });
            assert(r8iOwned.status === 0, '8I-owned: same session must resume owned issue, got ' + r8iOwned.status);
            const out8iOwned = JSON.parse(r8iOwned.stdout.trim());
            assert(out8iOwned.verdict === 'owned' && out8iOwned.issue === 11,
              '8I-owned: same session must return owned issue 11, got ' + r8iOwned.stdout);

            const r8i2 = spawnSync(process.execPath, [
              claimScript, 'bootstrap', '--runtime', 'codex'
            ], { cwd: epic8iTmp, encoding: 'utf8', env: env8i });
            assert(r8i2.status === 0, '8I-b: second bootstrap must claim issue 12, got ' + r8i2.status + '\nstderr: ' + r8i2.stderr);
            const out8i2 = JSON.parse(r8i2.stdout.trim());
            assert(out8i2.issue === 12, '8I-b: second bootstrap must skip locked issue 11 and pick 12, got ' + out8i2.issue);
            assert(out8i2.session && out8i2.session !== out8i1.session, '8I-b: second bootstrap must generate an independent session');

            const lock11 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic8iTmp), 'issue-11.lock'), 'utf8'));
            const lock12 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic8iTmp), 'issue-12.lock'), 'utf8'));
            assert(lock11.issue_number === 11 && lock11.session_id === out8i1.session, '8I: issue 11 lock must belong to first generated session');
            assert(lock12.issue_number === 12 && lock12.session_id === out8i2.session, '8I: issue 12 lock must belong to second generated session');
          } finally {
            fs.rmSync(epic8iTmp, { recursive: true, force: true });
          }
        }

        // 8J: remote claim creates/applies workflow:in-progress label and still
        // posts the sentinel comment when assignment fails.
        {
          const epic8jTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8j-'));
          try {
            const binDir = path.join(epic8jTmp, 'bin');
            fs.mkdirSync(binDir, { recursive: true });
            const callLog = path.join(epic8jTmp, 'gh-calls.log');
            const ghPath = path.join(binDir, 'gh');
            fs.writeFileSync(ghPath, `#!/bin/sh
echo "$@" >> "${callLog}"
if [ "$1" = "label" ] && [ "$2" = "create" ]; then
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then
  case "$*" in
    *"--add-assignee @me"*) exit 1 ;;
    *) exit 0 ;;
  esac
fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/19#issuecomment-1900"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then
  printf '[{"id":1900,"body":"Session claimed by sess-8j <!-- kw:claim sess=sess-8j -->"}]'
  exit 0
fi
exit 0
`);
            fs.chmodSync(ghPath, 0o755);
            const r8j = spawnSync(process.execPath, [
              claimScript, 'claim',
              '--session', 'sess-8j',
              '--project', 'epic8j',
              '--issue', '19',
              '--runtime', 'codex'
            ], {
              cwd: epic8jTmp,
              encoding: 'utf8',
              env: {
                ...process.env,
                PATH: binDir + path.delimiter + (process.env.PATH || ''),
                HOME: epic8jTmp,
                KAOLA_WORKFLOW_OFFLINE: ''
              }
            });
            assert(r8j.status === 0, '8J: claim must succeed even when assignee add fails, got ' + r8j.status + '\nstderr: ' + r8j.stderr);
            const log8j = fs.readFileSync(callLog, 'utf8');
            assert(log8j.includes('label create workflow:in-progress'), '8J: claim must create workflow:in-progress label, got: ' + log8j);
            assert(log8j.includes('issue edit 19 --add-label workflow:in-progress'), '8J: claim must add workflow:in-progress label, got: ' + log8j);
            assert(log8j.includes('issue edit 19 --add-assignee @me'), '8J: claim must try to assign @me, got: ' + log8j);
            assert(log8j.includes('issue comment 19'), '8J: claim must still post sentinel comment, got: ' + log8j);
            assert(!log8j.includes('--title'), '8J: claim must not mutate issue title, got: ' + log8j);
            const lock8j = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic8jTmp), 'epic8j.lock'), 'utf8'));
            assert(lock8j.claim_comment_id === '1900', '8J: lock must record sentinel comment id, got: ' + lock8j.claim_comment_id);
          } finally {
            fs.rmSync(epic8jTmp, { recursive: true, force: true });
          }
        }

      } finally {
        fs.rmSync(epic8Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 9: cross-machine hardening (9A1, 9A2, 9B1, 9B2, 9C1, 9C2, 9D)
    {
      const claimScript9 = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const epic9Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic9-'));
      try {
        const PATH = process.env.PATH || '';

        function makeKwDirs(dir) {
          fs.mkdirSync(locksDirFor(dir), { recursive: true });
          fs.mkdirSync(sessionsDirFor(dir), { recursive: true });
        }

        function makeGhShim(binDir, script) {
          fs.mkdirSync(binDir, { recursive: true });
          const p = path.join(binDir, 'gh');
          fs.writeFileSync(p, script);
          fs.chmodSync(p, 0o755);
          return p;
        }

        function writeLock(dir, project, sessionId, overrides) {
          const now = Date.now();
          const lock = Object.assign({
            project: project,
            session_id: sessionId,
            machine_id: 'test-machine',
            claimed_at: new Date(now).toISOString(),
            expires: new Date(now + 2 * 3600 * 1000).toISOString(),
            last_heartbeat: new Date(now).toISOString(),
            issue_number: null,
            claim_comment_id: null,
            sink: 'merge',
            pr_url: null,
            pr_number: null
          }, overrides);
          const lockPath = path.join(locksDirFor(dir), project + '.lock');
          fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
          return lock;
        }

        // ── Test 9A1: tiebreaker — smaller comment ID wins, larger yields ──
        {
          const subTmp = path.join(epic9Tmp, '9a1');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);

          const callLog = path.join(subTmp, 'gh-calls.log');
          makeGhShim(binDir, `#!/bin/sh
echo "$@" >> "${callLog}"
# issue edit → succeed
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then
  exit 0
fi
# issue comment (posting the initial claim) → return loser URL (ID 200)
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  case "$*" in
    *yielded*) exit 0 ;;
    *) echo "https://github.com/test/repo/issues/5#issuecomment-200"; exit 0 ;;
  esac
fi
# repo view → owner/name
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
# api repos/test/repo/issues/5/comments → both comments (winner ID 100, loser ID 200)
if [ "$1" = "api" ]; then
  printf '[{"id":100,"body":"Session claimed by sess-9a1-winner <!-- kw:claim sess=sess-9a1-winner -->"},{"id":200,"body":"Session claimed by sess-9a1-loser <!-- kw:claim sess=sess-9a1-loser -->"}]'
  exit 0
fi
exit 0
`);

          const r9a1 = spawnSync(process.execPath, [
            claimScript9, 'claim',
            '--session', 'sess-9a1-loser',
            '--project', 'proj9a1',
            '--issue', '5'
          ], {
            cwd: subTmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(r9a1.status === 1, '9A1: loser claim must exit 1 (yield), got ' + r9a1.status + '\nstdout:' + r9a1.stdout + '\nstderr:' + r9a1.stderr);
          const lockExists9a1 = fs.existsSync(path.join(locksDirFor(subTmp), 'proj9a1.lock'));
          assert(!lockExists9a1, '9A1: lock file must not exist after yield');
          const callLogContent9a1 = fs.existsSync(callLog) ? fs.readFileSync(callLog, 'utf8') : '';
          assert(callLogContent9a1.includes(':yielded'), '9A1: gh call log must contain :yielded comment, got: ' + callLogContent9a1);
          assert(callLogContent9a1.includes('kw:released reason=tiebreaker-yield'), '9A1: loser claim comment marker must be cleared, got: ' + callLogContent9a1);
          assert(!callLogContent9a1.includes('--remove-label'), '9A1: tiebreaker loser must not remove winner label, got: ' + callLogContent9a1);
          assert(!callLogContent9a1.includes('--remove-assignee'), '9A1: tiebreaker loser must not remove winner assignee, got: ' + callLogContent9a1);
        }

        // ── Test 9A2: tiebreaker — only our own comment present, stay claimed ──
        {
          const subTmp = path.join(epic9Tmp, '9a2');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);

          makeGhShim(binDir, `#!/bin/sh
# issue edit → succeed
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then
  exit 0
fi
# issue comment → return our own comment ID 300
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/6#issuecomment-300"
  exit 0
fi
# repo view → owner/name
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
# api → only our own comment
if [ "$1" = "api" ]; then
  printf '[{"id":300,"body":"Session claimed by sess-9a2 <!-- kw:claim sess=sess-9a2 -->"}]'
  exit 0
fi
exit 0
`);

          const r9a2 = spawnSync(process.execPath, [
            claimScript9, 'claim',
            '--session', 'sess-9a2',
            '--project', 'proj9a2',
            '--issue', '6'
          ], {
            cwd: subTmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(r9a2.status === 0, '9A2: sole-claimer must exit 0, got ' + r9a2.status + '\nstderr:' + r9a2.stderr);
          const lockPath9a2 = path.join(locksDirFor(subTmp), 'proj9a2.lock');
          assert(fs.existsSync(lockPath9a2), '9A2: lock file must exist after successful claim');
          const lock9a2 = JSON.parse(fs.readFileSync(lockPath9a2, 'utf8'));
          assert(lock9a2.claim_comment_id === '300', '9A2: claim_comment_id must be 300, got ' + lock9a2.claim_comment_id);
        }

        // ── Test 9A3: ticker late-tiebreaker — ticker yields when another session has lower comment ID ──
        {
          const subTmp = path.join(epic9Tmp, '9a3');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);
          fs.mkdirSync(tickersDirFor(subTmp), { recursive: true });

          makeGhShim(binDir, `#!/bin/sh
# repo view → owner/name
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
# api repos/.../comments → winner has lower ID 400, loser has ID 500
if [ "$1" = "api" ] && [ "$2" != "--method" ]; then
  printf '[{"id":400,"body":"<!-- kw:claim sess=sess-9a3-winner -->"},{"id":500,"body":"<!-- kw:claim sess=sess-9a3-loser -->"}]'
  exit 0
fi
# issue edit --remove-label and all others → exit 0
exit 0
`);

          // Write lock file for the loser session with a valid claim_comment_id
          writeLock(subTmp, 'proj9a3', 'sess-9a3-loser', {
            issue_number: 10,
            claim_comment_id: '500'
          });

          const lockPath9a3 = path.join(locksDirFor(subTmp), 'proj9a3.lock');
          const pidFile9a3 = path.join(tickersDirFor(subTmp), 'sess-9a3-loser.pid');

          // Spawn ticker with fast interval so tick 1 fires quickly
          const r9a3 = spawnSync(process.execPath, [
            claimScript9, 'ticker',
            '--session', 'sess-9a3-loser',
            '--interval', '50'
          ], {
            cwd: subTmp,
            encoding: 'utf8',
            timeout: 3000,
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(r9a3.status === 0, '9A3: ticker late-yield must self-terminate with exit 0, got status=' + r9a3.status + ' signal=' + r9a3.signal + '\nstderr:' + r9a3.stderr);
          assert(!fs.existsSync(lockPath9a3), '9A3: lock file must be released by ticker late-yield');
          assert(!fs.existsSync(pidFile9a3), '9A3: PID file must be cleaned up by ticker late-yield');
        }

        // ── Test 9B1: ticker idempotency — live PID file → second spawn exits 0 without writing ──
        {
          const subTmp = path.join(epic9Tmp, '9b1');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);
          fs.mkdirSync(tickersDirFor(subTmp), { recursive: true });

          makeGhShim(binDir, `#!/bin/sh
exit 0
`);

          // Write lock file (no issue/comment to keep ticker's tick() fast)
          writeLock(subTmp, 'proj9b1', 'sess-9b1', { issue_number: null, claim_comment_id: null });

          // Write a PID file with our own (live) PID
          const pidFile9b1 = path.join(tickersDirFor(subTmp), 'sess-9b1.pid');
          fs.writeFileSync(pidFile9b1, String(process.pid) + '\n');

          // Spawn ticker — should detect live PID and exit early (idempotency)
          const r9b1 = spawnSync(process.execPath, [
            claimScript9, 'ticker',
            '--session', 'sess-9b1',
            '--interval', '999999999'
          ], {
            cwd: subTmp,
            encoding: 'utf8',
            timeout: 3000,
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(r9b1.status === 0 || r9b1.signal === 'SIGTERM', '9B1: ticker must exit cleanly when live PID found, got status=' + r9b1.status + ' signal=' + r9b1.signal);
          // PID file must still contain our PID (not overwritten)
          const pidContent9b1 = fs.readFileSync(pidFile9b1, 'utf8').trim();
          assert(pidContent9b1 === String(process.pid), '9B1: PID file must not be overwritten, expected ' + process.pid + ' got ' + pidContent9b1);
        }

        // ── Test 9B2: ticker reaps stale PID file and creates new one (async liveness) ──
        {
          const subTmp = path.join(epic9Tmp, '9b2');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);
          fs.mkdirSync(tickersDirFor(subTmp), { recursive: true });

          makeGhShim(binDir, `#!/bin/sh
exit 0
`);

          // Write lock file with null issue_number; setTimeout keeps the event loop alive
          writeLock(subTmp, 'proj9b2', 'sess-9b2', { issue_number: null, claim_comment_id: null });

          // Write stale PID file with nonexistent PID
          const pidFile9b2 = path.join(tickersDirFor(subTmp), 'sess-9b2.pid');
          fs.writeFileSync(pidFile9b2, '99999999\n');

          // Spawn ticker asynchronously so we can probe it while it lives
          const child9b2 = spawn(process.execPath, [
            claimScript9, 'ticker',
            '--session', 'sess-9b2',
            '--interval', '999999999'
          ], {
            cwd: subTmp,
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          try {
            // Poll until PID file changes from '99999999' (100ms × 30 = 3s total)
            let newPid9b2 = null;
            for (let i = 0; i < 30; i++) {
              await sleep(100);
              if (!fs.existsSync(pidFile9b2)) break;
              const raw = fs.readFileSync(pidFile9b2, 'utf8').trim();
              if (raw !== '99999999') {
                const p = parseInt(raw, 10);
                if (Number.isFinite(p) && p > 0) { newPid9b2 = p; break; }
              }
            }
            assert(newPid9b2 !== null, '9B2: stale PID file must be reaped and replaced with live PID within 3s');

            // Liveness assertion: process.kill(pid, 0) throws ESRCH if process is dead
            try {
              process.kill(newPid9b2, 0);
            } catch (e) {
              assert(false, '9B2: ticker process ' + newPid9b2 + ' is not alive after PID reap: ' + e.message);
            }

            // Send SIGTERM; the claim.js SIGTERM handler calls process.exit(0) after unlinking PID file
            process.kill(newPid9b2, 'SIGTERM');
            const result9b2 = await waitExit(child9b2, 3000);
            assert(result9b2.code === 0, '9B2: ticker did not exit cleanly after SIGTERM, code=' + result9b2.code);
            assert(!fs.existsSync(pidFile9b2), '9B2: PID file not removed after SIGTERM');
          } finally {
            try { child9b2.kill('SIGKILL'); } catch (_) {}
          }
        }

        // ── Test 9C1: sweep skips lock with fresh remote comment ──
        {
          const subTmp = path.join(epic9Tmp, '9c1');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);

          makeGhShim(binDir, `#!/bin/sh
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then
  printf '{"updated_at":"${new Date().toISOString()}"}'
  exit 0
fi
exit 0
`);

          const stale25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
          writeLock(subTmp, 'proj9c1', 'c1000000-0000-4000-a000-000000000001', {
            issue_number: 8,
            claim_comment_id: '555',
            expires: stale25h,
            last_heartbeat: stale25h
          });

          const lockPath9c1 = path.join(locksDirFor(subTmp), 'proj9c1.lock');
          spawnSync(process.execPath, [claimScript9, 'sweep'], {
            cwd: subTmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(fs.existsSync(lockPath9c1), '9C1: lock must NOT be swept when remote comment is fresh');
        }

        // ── Test 9C2: sweep releases stale lease (remote comment > 24h old) ──
        {
          const subTmp = path.join(epic9Tmp, '9c2');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);

          const callLog9c2 = path.join(subTmp, 'gh-calls.log');
          const staleTs = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
          makeGhShim(binDir, `#!/bin/sh
echo "$@" >> "${callLog9c2}"
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ] && [ "$2" != "--method" ]; then
  printf '{"updated_at":"${staleTs}"}'
  exit 0
fi
exit 0
`);

          const stale25h = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
          writeLock(subTmp, 'proj9c2', 'sess-9c2', {
            issue_number: 9,
            claim_comment_id: '666',
            expires: stale25h,
            last_heartbeat: stale25h
          });

          const lockPath9c2 = path.join(locksDirFor(subTmp), 'proj9c2.lock');
          spawnSync(process.execPath, [claimScript9, 'sweep'], {
            cwd: subTmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(!fs.existsSync(lockPath9c2), '9C2: lock must be swept when remote comment is stale');
          const callLog9c2Content = fs.existsSync(callLog9c2) ? fs.readFileSync(callLog9c2, 'utf8') : '';
          assert(callLog9c2Content.includes('--remove-assignee'), '9C2: sweep must call --remove-assignee @me');
          assert(callLog9c2Content.includes(':released-stale'), '9C2: sweep must post :released-stale comment');
        }

        // ── Test 9D: release calls --remove-assignee @me ──
        {
          const subTmp = path.join(epic9Tmp, '9d');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);

          const callLog9d = path.join(subTmp, 'gh-calls.log');
          makeGhShim(binDir, `#!/bin/sh
echo "$@" >> "${callLog9d}"
exit 0
`);

          writeLock(subTmp, 'proj9d', 'sess-9d', {
            issue_number: 10,
            claim_comment_id: '777'
          });

          spawnSync(process.execPath, [
            claimScript9, 'release',
            '--session', 'sess-9d'
          ], {
            cwd: subTmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          const callLog9dContent = fs.existsSync(callLog9d) ? fs.readFileSync(callLog9d, 'utf8') : '';
          assert(callLog9dContent.includes('--remove-assignee'), '9D: release must call --remove-assignee @me, got: ' + callLog9dContent);
        }

        // ── Test 9E: ticker heartbeat PATCH preserves claim sentinel and adds heartbeat metadata ──
        await (async function test9EHeartbeatPreservesClaimMarker() {
          const subTmp = fs.mkdtempSync(path.join(epic9Tmp, '9e-'));
          try {
            const binDir = path.join(subTmp, 'bin');
            makeKwDirs(subTmp);
            fs.mkdirSync(tickersDirFor(subTmp), { recursive: true });
            const callLog9e = path.join(subTmp, 'gh-calls.log');
            makeGhShim(binDir, `#!/bin/sh
echo "$@" >> "${callLog9e}"
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ] && [ "$2" != "--method" ]; then
  printf '[{"id":888,"body":"Session claimed by sess-9e <!-- kw:claim sess=sess-9e -->"}]'
  exit 0
fi
exit 0
`);
            writeLock(subTmp, 'proj9e', 'sess-9e', {
              issue_number: 17,
              claim_comment_id: '888'
            });
            const child9e = spawn(process.execPath, [
              claimScript9, 'ticker',
              '--session', 'sess-9e',
              '--interval', '50'
            ], {
              cwd: subTmp,
              env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
            });
            try {
              let log = '';
              for (let i = 0; i < 30; i++) {
                await sleep(100);
                log = fs.existsSync(callLog9e) ? fs.readFileSync(callLog9e, 'utf8') : '';
                if (log.includes('--method PATCH')) break;
              }
              assert(log.includes('--method PATCH'), '9E: ticker must PATCH the claim comment, got: ' + log);
              assert(log.includes('kw:claim sess=sess-9e'), '9E: heartbeat body must preserve kw:claim marker, got: ' + log);
              assert(log.includes('kw:hb ts='), '9E: heartbeat body must include kw:hb timestamp, got: ' + log);
            } finally {
              try { child9e.kill('SIGTERM'); } catch (_) {}
              await waitExit(child9e, 3000).catch(() => {});
            }
          } finally {
            fs.rmSync(subTmp, { recursive: true, force: true });
          }
        })();

        // -- Test 9F: patch-branch updates the claim comment through GitHub API and keeps the claim marker --
        {
          const subTmp = path.join(epic9Tmp, '9f');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);

          const callLog9f = path.join(subTmp, 'gh-calls.log');
          makeGhShim(binDir, `#!/bin/sh
echo "$@" >> "${callLog9f}"
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
exit 0
`);

          writeLock(subTmp, 'proj9f', 'sess-9f', {
            issue_number: 18,
            claim_comment_id: '999',
            branch: 'workflow/issue-18-proj9f-old'
          });

          const state9fDir = path.join(subTmp, 'kaola-workflow', 'proj9f');
          fs.mkdirSync(state9fDir, { recursive: true });
          const state9fPath = path.join(state9fDir, 'workflow-state.md');
          fs.writeFileSync(state9fPath, [
            '# Kaola-Workflow State',
            '',
            '## Sink',
            'branch: workflow/issue-18-proj9f-old',
            'issue_number: 18',
            'claimed_at: 2026-01-01T00:00:00.000Z',
            'sink: merge',
            ''
          ].join('\n'));

          const nextBranch9f = 'workflow/issue-18-proj9f';
          const r9f = spawnSync(process.execPath, [
            claimScript9, 'patch-branch',
            '--session', 'sess-9f',
            '--project', 'proj9f',
            '--branch', nextBranch9f
          ], {
            cwd: subTmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmp }
          });

          assert(r9f.status === 0, '9F: patch-branch must succeed, got ' + r9f.status + '\nstderr:' + r9f.stderr);
          const lock9f = JSON.parse(fs.readFileSync(path.join(locksDirFor(subTmp), 'proj9f.lock'), 'utf8'));
          assert(lock9f.branch === nextBranch9f, '9F: lock branch must be patched');
          const state9f = fs.readFileSync(state9fPath, 'utf8');
          assert(state9f.includes('branch: ' + nextBranch9f), '9F: state branch must be patched');
          const callLog9fContent = fs.existsSync(callLog9f) ? fs.readFileSync(callLog9f, 'utf8') : '';
          assert(callLog9fContent.includes('--method PATCH'), '9F: patch-branch must PATCH claim comment, got: ' + callLog9fContent);
          assert(callLog9fContent.includes('issues/comments/999'), '9F: patch-branch must target claim comment ID, got: ' + callLog9fContent);
          assert(callLog9fContent.includes('kw:claim sess=sess-9f'), '9F: patched comment must preserve kw:claim marker, got: ' + callLog9fContent);
          assert(callLog9fContent.includes('Branch: ' + nextBranch9f), '9F: patched comment must include branch, got: ' + callLog9fContent);
          assert(!callLog9fContent.includes('issue comment --edit'), '9F: patch-branch must not use unsupported gh issue comment --edit, got: ' + callLog9fContent);
        }

        // ── Test LOW-2 SIGINT: ticker removes PID file on SIGINT ──
        await (async function test9B_SIGINT() {
          const subTmpSIGINT = fs.mkdtempSync(path.join(epic9Tmp, 'sigint-'));
          try {
            const binDir = path.join(subTmpSIGINT, 'bin');
            makeKwDirs(subTmpSIGINT);
            fs.mkdirSync(tickersDirFor(subTmpSIGINT), { recursive: true });
            makeGhShim(binDir, '#!/bin/sh\nexit 0\n');
            writeLock(subTmpSIGINT, 'proj-sigint', 'sess-sigint', { issue_number: null, claim_comment_id: null });
            const pidFileSIGINT = path.join(tickersDirFor(subTmpSIGINT), 'sess-sigint.pid');
            const child = spawn(process.execPath, [claimScript9, 'ticker', '--session', 'sess-sigint', '--interval', '999999999'], {
              cwd: subTmpSIGINT,
              env: { ...process.env, PATH: binDir + path.delimiter + PATH, HOME: subTmpSIGINT }
            });
            try {
              let childPid = null;
              for (let i = 0; i < 30; i++) {
                await sleep(100);
                if (fs.existsSync(pidFileSIGINT)) {
                  const raw = fs.readFileSync(pidFileSIGINT, 'utf8').trim();
                  const p = parseInt(raw, 10);
                  if (Number.isFinite(p) && p > 0) { childPid = p; break; }
                }
              }
              assert(childPid !== null, 'SIGINT test: ticker did not write live PID within 3s');
              process.kill(childPid, 'SIGINT');
              const { code } = await waitExit(child, 3000);
              assert(code === 0, 'SIGINT test: ticker exited with code ' + code + ', expected 0');
              assert(!fs.existsSync(pidFileSIGINT), 'SIGINT test: PID file not removed after SIGINT');
            } finally {
              try { child.kill('SIGKILL'); } catch (_) {}
            }
          } finally {
            fs.rmSync(subTmpSIGINT, { recursive: true, force: true });
          }
        })();

      } finally {
        fs.rmSync(epic9Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 10: pre-commit hook blocks cross-session commits.
    // Regression guard against the BASH_COMMAND shadowing bug (10A would silently
    // exit 0 because bash overwrote the variable before the case-match ran).
    {
      const hookPath = path.join(__dirname, '..', 'hooks', 'kaola-workflow-pre-commit.sh');
      assert(fs.existsSync(hookPath), 'Epic Case 10: pre-commit hook must exist');

      const epic10Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic10-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', epic10Tmp]);
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: epic10Tmp });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: epic10Tmp });
        fs.writeFileSync(path.join(epic10Tmp, 'README.md'), 'init\n');
        execFileSync('git', ['add', 'README.md'], { cwd: epic10Tmp });
        execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: epic10Tmp });

        fs.mkdirSync(locksDirFor(epic10Tmp), { recursive: true });
        fs.mkdirSync(path.join(epic10Tmp, 'kaola-workflow', 'projA'), { recursive: true });
        fs.writeFileSync(path.join(locksDirFor(epic10Tmp), 'projA.lock'),
          JSON.stringify({
            project: 'projA',
            session_id: 'sess-owner',
            machine_id: 'm1',
            claimed_at: '2026-05-15T10:00:00Z',
            expires: '2026-05-15T12:00:00Z',
            last_heartbeat: '2026-05-15T10:00:00Z',
            issue_number: 100,
            claim_comment_id: null,
            sink: 'merge'
          }, null, 2) + '\n');

        fs.writeFileSync(path.join(epic10Tmp, 'kaola-workflow', 'projA', 'phase1-research.md'),
          '# Phase 1\n');
        execFileSync('git', ['add', 'kaola-workflow/projA/phase1-research.md'], { cwd: epic10Tmp });

        const hookInput = JSON.stringify({ tool_input: { command: 'git commit -m wip' } });

        // 10A: wrong session must be blocked with exit 2
        const r10A = spawnSync('bash', [hookPath], {
          cwd: epic10Tmp,
          encoding: 'utf8',
          input: hookInput,
          env: { ...process.env, KAOLA_SESSION_ID: 'sess-intruder' }
        });
        assert(r10A.status === 2,
          '10A: hook must exit 2 when a non-owning session tries to commit projA files, got ' + r10A.status +
          '\nstderr: ' + r10A.stderr);
        assert(r10A.stderr.includes('BLOCKED'),
          '10A: stderr must contain BLOCKED marker, got: ' + r10A.stderr);

        // 10B: owning session must pass through (exit 0)
        const r10B = spawnSync('bash', [hookPath], {
          cwd: epic10Tmp,
          encoding: 'utf8',
          input: hookInput,
          env: { ...process.env, KAOLA_SESSION_ID: 'sess-owner' }
        });
        assert(r10B.status === 0,
          '10B: hook must exit 0 for owning session, got ' + r10B.status +
          '\nstderr: ' + r10B.stderr);

        // 10C: non-commit bash command must short-circuit to exit 0 even with wrong session
        const r10C = spawnSync('bash', [hookPath], {
          cwd: epic10Tmp,
          encoding: 'utf8',
          input: JSON.stringify({ tool_input: { command: 'ls -la' } }),
          env: { ...process.env, KAOLA_SESSION_ID: 'sess-intruder' }
        });
        assert(r10C.status === 0,
          '10C: hook must exit 0 for non-commit commands regardless of session, got ' + r10C.status);

        // 10D: missing KAOLA_SESSION_ID must short-circuit to exit 0 (no session to compare)
        const envNoSess = { ...process.env };
        delete envNoSess.KAOLA_SESSION_ID;
        const r10D = spawnSync('bash', [hookPath], {
          cwd: epic10Tmp,
          encoding: 'utf8',
          input: hookInput,
          env: envNoSess
        });
        assert(r10D.status === 0,
          '10D: hook must exit 0 when KAOLA_SESSION_ID is unset, got ' + r10D.status);

        // 10E: split-commit guard — staging files from two different projects must
        // block with exit 2 regardless of session ownership.
        fs.mkdirSync(path.join(epic10Tmp, 'kaola-workflow', 'projB'), { recursive: true });
        fs.writeFileSync(path.join(epic10Tmp, 'kaola-workflow', 'projB', 'phase1-research.md'),
          '# Phase 1 B\n');
        execFileSync('git', ['add', 'kaola-workflow/projB/phase1-research.md'], { cwd: epic10Tmp });
        const r10E = spawnSync('bash', [hookPath], {
          cwd: epic10Tmp,
          encoding: 'utf8',
          input: hookInput,
          env: { ...process.env, KAOLA_SESSION_ID: 'sess-owner' }
        });
        assert(r10E.status === 2,
          '10E: hook must exit 2 when multiple kaola-workflow projects are staged, got ' + r10E.status +
          '\nstderr: ' + r10E.stderr);
        assert(r10E.stderr.includes('split your commit'),
          '10E: stderr must instruct to split the commit, got: ' + r10E.stderr);
      } finally {
        fs.rmSync(epic10Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 11: prompt-level cross-session staging guard must appear in
    // both the Claude Code phase6 command and the Codex finalize skill.
    // Regulators live in prompts; the bash hook is defense-in-depth.
    {
      const guardSources = [
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase6.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills',
          'kaola-workflow-finalize', 'SKILL.md'),
      ];
      const required = [
        'Cross-Session Staging Guard',
        'BLOCKED: cross-session staging',
        'BLOCKED: split your commit',
        'git -C "$ACTIVE_WORKTREE_PATH" commit -m',
      ];
      for (const src of guardSources) {
        const text = fs.readFileSync(src, 'utf8');
        for (const needle of required) {
          assert(text.includes(needle),
            'Epic Case 11: ' + path.basename(src) + ' missing guard marker "' + needle + '"');
        }
        assert(text.indexOf('git -C "$ACTIVE_WORKTREE_PATH" commit -m') < text.indexOf('kaola-workflow-sink-merge.js'),
          'Epic Case 11: commit gate must appear before sink dispatch in ' + path.basename(src));
      }
    }

    // Epic Case 12: cross-session phase matrix. A second session starting while
    // another session is at any workflow phase must skip the occupied issue,
    // must not bypass the lock by using a different project name, and must still
    // be allowed to claim a different issue.
    {
      const claimScript = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const classifierScript = path.join(root, 'scripts', 'kaola-workflow-classifier.js');
      const epic12Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic12-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', epic12Tmp]);
        const locksDir12 = locksDirFor(epic12Tmp);
        const binDir12 = path.join(epic12Tmp, 'bin');
        fs.mkdirSync(locksDir12, { recursive: true });
        fs.mkdirSync(binDir12, { recursive: true });

        const phaseMatrix = [
          { phase: 1, phaseName: 'Research', nextCommand: '/kaola-workflow-phase1' },
          { phase: 2, phaseName: 'Ideation', nextCommand: '/kaola-workflow-phase2' },
          { phase: 3, phaseName: 'Plan', nextCommand: '/kaola-workflow-phase3' },
          { phase: 4, phaseName: 'Execute', nextCommand: '/kaola-workflow-phase4' },
          { phase: 5, phaseName: 'Review', nextCommand: '/kaola-workflow-phase5' },
          { phase: 6, phaseName: 'Finalize', nextCommand: '/kaola-workflow-phase6' },
        ];

        function writeStageProject(baseDir, spec, projectName, issue, sessionId, withLock) {
          const projectDir = path.join(baseDir, 'kaola-workflow', projectName);
          fs.mkdirSync(projectDir, { recursive: true });
          const now = new Date(Date.now() + spec.phase * 1000).toISOString();
          fs.writeFileSync(path.join(projectDir, 'workflow-state.md'), [
            '# Kaola-Workflow State',
            '',
            '## Project',
            'name: ' + projectName,
            'status: active',
            '',
            '## Current Position',
            'phase: ' + spec.phase,
            'phase_name: ' + spec.phaseName,
            'step: phase-' + spec.phase + '-work',
            'next_command: ' + spec.nextCommand + ' ' + projectName,
            'next_skill: kaola-workflow-' + spec.phaseName.toLowerCase() + ' ' + projectName,
            '',
            '## Sink',
            'branch: workflow/issue-' + issue + '-' + projectName,
            'issue_number: ' + issue,
            'claimed_at: ' + now,
            'sink: merge',
            '',
            '## Lease',
            'session_id: ' + sessionId,
            'expires: ' + new Date(Date.now() + 3600000).toISOString(),
            'last_heartbeat: ' + now,
            'claim_comment_id: N/A',
            ''
          ].join('\n'));
          if (spec.phase >= 2) fs.writeFileSync(path.join(projectDir, 'phase1-research.md'), 'area:primary-stage-' + spec.phase + '\n');
          if (spec.phase >= 3) fs.writeFileSync(path.join(projectDir, 'phase2-ideation.md'), '# Phase 2\n');
          if (spec.phase >= 4) fs.writeFileSync(path.join(projectDir, 'phase3-plan.md'), '# Phase 3\nFiles: commands/primary-' + spec.phase + '.md\n');
          if (spec.phase >= 5) fs.writeFileSync(path.join(projectDir, 'phase4-progress.md'), '# Phase 4\n| 1 | done | complete |\n');
          if (spec.phase >= 6) fs.writeFileSync(path.join(projectDir, 'phase5-review.md'), '# Phase 5\nreview passed\n');
          if (withLock) {
            fs.writeFileSync(path.join(locksDir12, projectName + '.lock'), JSON.stringify({
              project: projectName,
              session_id: sessionId,
              machine_id: 'machine-' + spec.phase,
              claimed_at: now,
              expires: new Date(Date.now() + 3600000).toISOString(),
              last_heartbeat: now,
              issue_number: issue,
              claim_comment_id: null,
              sink: 'merge',
              runtime: spec.phase % 2 === 0 ? 'codex' : 'claude'
            }, null, 2) + '\n');
          }
        }

        function writeBootstrapGhShim(sameIssue, freeIssue) {
          const ghPath = path.join(binDir12, 'gh');
          fs.writeFileSync(ghPath, [
            '#!/bin/sh',
            'if [ "$1" = "issue" ] && [ "$2" = "list" ]; then',
            '  printf \'[{"number":' + sameIssue + '},{"number":' + freeIssue + '}]\'',
            '  exit 0',
            'fi',
            'if [ "$1" = "issue" ] && [ "$2" = "view" ]; then',
            '  printf \'{"number":%s,"title":"Issue %s","body":"hooks/free-' + freeIssue + '.js","labels":[],"state":"OPEN"}\' "$3" "$3"',
            '  exit 0',
            'fi',
            'if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi',
            'if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi',
            'if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then',
            '  echo "https://github.com/test/repo/issues/' + freeIssue + '#issuecomment-' + freeIssue + '"',
            '  exit 0',
            'fi',
            'if [ "$1" = "repo" ] && [ "$2" = "view" ]; then',
            '  printf \'{"owner":{"login":"test"},"name":"repo"}\'',
            '  exit 0',
            'fi',
            'if [ "$1" = "api" ]; then printf \'[]\'; exit 0; fi',
            'exit 0',
            ''
          ].join('\n'));
          fs.chmodSync(ghPath, 0o755);
        }

        for (const spec of phaseMatrix) {
          const issue = 300 + spec.phase;
          const freeIssue = 400 + spec.phase;
          const projectName = 'stage-' + spec.phase + '-primary';
          const sessionId = 'sess-stage-' + spec.phase + '-primary';
          writeStageProject(epic12Tmp, spec, projectName, issue, sessionId, true);

          const sessionOut = execFileSync(process.execPath, [
            claimScript, 'session', '--project', projectName, '--session', sessionId
          ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp } }).trim();
          assert(sessionOut === sessionId, '12A phase ' + spec.phase + ': matching session must validate primary owner');

          const duplicateDirect = spawnSync(process.execPath, [
            claimScript, 'claim',
            '--session', 'sess-stage-' + spec.phase + '-intruder',
            '--project', 'stage-' + spec.phase + '-intruder',
            '--issue', String(issue),
            '--runtime', 'codex'
          ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp, KAOLA_WORKFLOW_OFFLINE: '1' } });
          assert(duplicateDirect.status === 2,
            '12B phase ' + spec.phase + ': direct duplicate issue claim must exit 2, got ' + duplicateDirect.status +
            '\nstderr: ' + duplicateDirect.stderr);
          assert(!fs.existsSync(path.join(locksDir12, 'stage-' + spec.phase + '-intruder.lock')),
            '12B phase ' + spec.phase + ': duplicate direct claim must not create intruder lock');

          const duplicateClassify = spawnSync(process.execPath, [
            classifierScript, 'classify', '--issue', String(issue)
          ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp, KAOLA_WORKFLOW_OFFLINE: '1' } });
          assert(duplicateClassify.status === 2,
            '12C phase ' + spec.phase + ': classifier must skip occupied issue, got ' + duplicateClassify.status);

          writeBootstrapGhShim(issue, freeIssue);
          const bootstrap = spawnSync(process.execPath, [
            claimScript, 'bootstrap',
            '--session', 'sess-stage-' + spec.phase + '-secondary',
            '--runtime', 'codex'
          ], {
            cwd: epic12Tmp,
            encoding: 'utf8',
            env: { ...process.env, PATH: binDir12 + path.delimiter + (process.env.PATH || ''), HOME: epic12Tmp, KAOLA_WORKFLOW_OFFLINE: '' }
          });
          assert(bootstrap.status === 0,
            '12D phase ' + spec.phase + ': secondary bootstrap must claim free issue, got ' + bootstrap.status +
            '\nstdout: ' + bootstrap.stdout + '\nstderr: ' + bootstrap.stderr);
          const picked = JSON.parse(bootstrap.stdout.trim());
          assert(picked.issue === freeIssue,
            '12D phase ' + spec.phase + ': secondary bootstrap must skip #' + issue + ' and pick #' + freeIssue + ', got #' + picked.issue);
          assert(fs.existsSync(path.join(locksDir12, projectName + '.lock')),
            '12D phase ' + spec.phase + ': primary lock must remain after secondary bootstrap');
          assert(fs.existsSync(path.join(locksDir12, 'issue-' + freeIssue + '.lock')),
            '12D phase ' + spec.phase + ': secondary lock must exist for free issue');
        }

        for (const spec of phaseMatrix) {
          const issue = 500 + spec.phase;
          const projectName = 'state-only-stage-' + spec.phase;
          const sessionId = 'sess-state-stage-' + spec.phase;
          writeStageProject(epic12Tmp, spec, projectName, issue, sessionId, false);

          const sessionOut = execFileSync(process.execPath, [
            claimScript, 'session', '--project', projectName, '--session', sessionId
          ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp } }).trim();
          assert(sessionOut === sessionId,
            '12E phase ' + spec.phase + ': matching session must validate state-only lease');

          const duplicateDirect = spawnSync(process.execPath, [
            claimScript, 'claim',
            '--session', 'sess-state-stage-' + spec.phase + '-intruder',
            '--project', 'state-only-stage-' + spec.phase + '-intruder',
            '--issue', String(issue)
          ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp, KAOLA_WORKFLOW_OFFLINE: '1' } });
          assert(duplicateDirect.status === 2,
            '12F phase ' + spec.phase + ': direct claim must respect state-only active issue, got ' + duplicateDirect.status);

          const duplicateClassify = spawnSync(process.execPath, [
            classifierScript, 'classify', '--issue', String(issue)
          ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp, KAOLA_WORKFLOW_OFFLINE: '1' } });
          assert(duplicateClassify.status === 2,
            '12G phase ' + spec.phase + ': classifier must respect state-only active issue, got ' + duplicateClassify.status);
        }

        const completeProject = 'completed-stage';
        const completeDir = path.join(epic12Tmp, 'kaola-workflow', completeProject);
        fs.mkdirSync(completeDir, { recursive: true });
        fs.writeFileSync(path.join(completeDir, 'workflow-state.md'), [
          '# Kaola-Workflow State',
          '',
          '## Project',
          'name: ' + completeProject,
          'status: complete',
          '',
          '## Sink',
          'branch: workflow/issue-950-completed-stage',
          'issue_number: 950',
          'claimed_at: 2026-05-15T00:00:00.000Z',
          'sink: merge',
          '',
          '## Lease',
          'session_id: sess-completed',
          ''
        ].join('\n'));
        const completedClaim = spawnSync(process.execPath, [
          claimScript, 'claim',
          '--session', 'sess-completed-reclaim',
          '--project', 'completed-reclaim',
          '--issue', '950'
        ], { cwd: epic12Tmp, encoding: 'utf8', env: { ...process.env, HOME: epic12Tmp, KAOLA_WORKFLOW_OFFLINE: '1' } });
        assert(completedClaim.status === 0,
          '12H: completed workflow-state must not block a fresh claim of the same issue, got ' + completedClaim.status +
          '\nstderr: ' + completedClaim.stderr);
      } finally {
        fs.rmSync(epic12Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 13: true parallel bootstrap coordination.
    // One test injects a lock after classification but before claim to emulate
    // a lost startup race. The second test starts two sessions at once and
    // requires them to split across the two available issues automatically.
    {
      const claimScript = path.join(root, 'scripts', 'kaola-workflow-claim.js');

      const retryTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic13-retry-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', retryTmp]);
        const retryBin = path.join(retryTmp, 'bin');
        const retryLocks = locksDirFor(retryTmp);
        fs.mkdirSync(retryBin, { recursive: true });
        fs.mkdirSync(retryLocks, { recursive: true });
        const retryGh = path.join(retryBin, 'gh');
        fs.writeFileSync(retryGh, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":901},{"number":902}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  if [ "$num" = "901" ]; then
    cat > "${retryLocks}/issue-901.lock" <<'JSON'
{
  "project": "issue-901",
  "session_id": "sess-race-winner",
  "machine_id": "race-machine",
  "claimed_at": "2026-05-15T00:00:00.000Z",
  "expires": "2099-01-01T00:00:00.000Z",
  "last_heartbeat": "2026-05-15T00:00:00.000Z",
  "issue_number": 901,
  "claim_comment_id": null,
  "sink": "merge",
  "runtime": "codex"
}
JSON
  fi
  printf '{"number":%s,"title":"Race %s","body":"commands/race-%s.md","labels":[],"state":"OPEN"}' "$num" "$num" "$num"
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/$3#issuecomment-$3"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then printf '[]'; exit 0; fi
exit 0
`);
        fs.chmodSync(retryGh, 0o755);

        const retryOut = execFileSync(process.execPath, [
          claimScript, 'bootstrap',
          '--session', 'sess-race-retry',
          '--runtime', 'codex'
        ], {
          cwd: retryTmp,
          encoding: 'utf8',
          env: { ...process.env, PATH: retryBin + path.delimiter + (process.env.PATH || ''), HOME: retryTmp }
        });
        const retryPick = JSON.parse(retryOut.trim());
        assert(retryPick.issue === 902,
          '13A: bootstrap must retry after losing issue 901 race and claim issue 902, got: ' + retryOut);
        assert(fs.existsSync(path.join(retryLocks, 'issue-901.lock')), '13A: injected race winner lock must remain');
        assert(fs.existsSync(path.join(retryLocks, 'issue-902.lock')), '13A: retry session lock for issue 902 must exist');
      } finally {
        fs.rmSync(retryTmp, { recursive: true, force: true });
      }

      const parallelTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic13-parallel-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', parallelTmp]);
        const parallelBin = path.join(parallelTmp, 'bin');
        const parallelLocks = locksDirFor(parallelTmp);
        fs.mkdirSync(parallelBin, { recursive: true });
        fs.mkdirSync(parallelLocks, { recursive: true });
        const parallelGh = path.join(parallelBin, 'gh');
        fs.writeFileSync(parallelGh, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":911},{"number":912}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  sleep 0.05
  num="$3"
  printf '{"number":%s,"title":"Parallel %s","body":"commands/parallel-%s.md","labels":[],"state":"OPEN"}' "$num" "$num" "$num"
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/$3#issuecomment-$3"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then printf '[]'; exit 0; fi
exit 0
`);
        fs.chmodSync(parallelGh, 0o755);

        function spawnBootstrap(session) {
          const child = spawn(process.execPath, [
            claimScript, 'bootstrap',
            '--session', session,
            '--runtime', 'codex'
          ], {
            cwd: parallelTmp,
            env: { ...process.env, PATH: parallelBin + path.delimiter + (process.env.PATH || ''), HOME: parallelTmp },
            stdio: ['ignore', 'pipe', 'pipe']
          });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', chunk => { stdout += chunk.toString(); });
          child.stderr.on('data', chunk => { stderr += chunk.toString(); });
          return { child, session, get stdout() { return stdout; }, get stderr() { return stderr; } };
        }

        const a = spawnBootstrap('sess-parallel-a');
        const b = spawnBootstrap('sess-parallel-b');
        const [ra, rb] = await Promise.all([waitExit(a.child, 5000), waitExit(b.child, 5000)]);
        assert(ra.code === 0, '13B: session A bootstrap failed: stdout=' + a.stdout + ' stderr=' + a.stderr);
        assert(rb.code === 0, '13B: session B bootstrap failed: stdout=' + b.stdout + ' stderr=' + b.stderr);
        const picks = [JSON.parse(a.stdout.trim()), JSON.parse(b.stdout.trim())];
        const issueSet = new Set(picks.map(p => p.issue));
        const sessionSet = new Set(picks.map(p => p.session));
        assert(issueSet.has(911) && issueSet.has(912) && issueSet.size === 2,
          '13B: parallel sessions must split across issues 911 and 912, got: ' + JSON.stringify(picks));
        assert(sessionSet.has('sess-parallel-a') && sessionSet.has('sess-parallel-b'),
          '13B: bootstrap output must preserve both session ids, got: ' + JSON.stringify(picks));
        assert(fs.existsSync(path.join(parallelLocks, 'issue-911.lock')), '13B: issue 911 lock missing');
        assert(fs.existsSync(path.join(parallelLocks, 'issue-912.lock')), '13B: issue 912 lock missing');
      } finally {
        fs.rmSync(parallelTmp, { recursive: true, force: true });
      }
    }

    // Epic Case 14: startup transaction syncs issues, writes a receipt, and
    // cannot silently skip claim/bootstrap semantics.
    {
      const claimScript = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const startupTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic14-startup-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', startupTmp]);
        const startupBin = path.join(startupTmp, 'bin');
        fs.mkdirSync(startupBin, { recursive: true });
        const startupGh = path.join(startupBin, 'gh');
        fs.writeFileSync(startupGh, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":201,"title":"queued startup","state":"OPEN","labels":[{"name":"workflow:queued"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/201"},{"number":202,"title":"blocked startup","state":"OPEN","labels":[],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/202"},{"number":203,"title":"next startup","state":"OPEN","labels":[],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/203"}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  case "$num" in
    201) printf '{"number":201,"title":"queued startup","body":"commands/startup-201.md","labels":[],"state":"OPEN"}' ;;
    202) printf '{"number":202,"title":"blocked startup","body":"commands/startup-202.md","labels":[{"name":"depends-on:#201"}],"state":"OPEN"}' ;;
    203) printf '{"number":203,"title":"next startup","body":"commands/startup-203.md","labels":[],"state":"OPEN"}' ;;
    *) printf '{"number":%s,"title":"dep","body":"","labels":[],"state":"OPEN"}' "$num" ;;
  esac
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/$3#issuecomment-$3"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then printf '[]'; exit 0; fi
exit 0
`);
        fs.chmodSync(startupGh, 0o755);
        const env = { ...process.env, PATH: startupBin + path.delimiter + (process.env.PATH || ''), HOME: startupTmp };

        // 14A: agent directs startup to claim issue 201 explicitly
        const first = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-startup-a',
          '--runtime', 'codex',
          '--target-issue', '201'
        ], { cwd: startupTmp, encoding: 'utf8', env }).trim());
        assert(first.startup_completed === true, '14A: startup output must mark startup_completed');
        assert(first.issue === 201 && first.claim === 'acquired',
          '14A: queued issue 201 must be claimed when explicitly targeted, got: ' + JSON.stringify(first));
        assert(first.target_source === 'user_directed',
          '14A: receipt must record target_source: user_directed, got: ' + JSON.stringify(first));
        assert(first.issue_sync === 'ok' && first.roadmap_sync === 'ok',
          '14A: startup must sync issues and roadmap before selection');
        assert(fs.existsSync(path.join(sessionsDirFor(startupTmp), 'sess-startup-a.startup.json')),
          '14A: startup receipt must be written');
        assert(fs.existsSync(path.join(startupTmp, 'kaola-workflow', '.roadmap', 'issue-202.md')),
          '14A: startup must create roadmap file for issue ahead of local roadmap');
        const roadmap = fs.readFileSync(path.join(startupTmp, 'kaola-workflow', 'ROADMAP.md'), 'utf8');
        assert(roadmap.includes('| #201 | queued startup | open |'), '14A: ROADMAP must include synced issue 201');
        assert(fs.existsSync(path.join(locksDirFor(startupTmp), 'issue-201.lock')),
          '14A: startup must claim issue 201');
        const verifyFirst = spawnSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-startup-a',
          '--project', 'issue-201'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(verifyFirst.status === 0,
          '14A: verify-startup must authorize the acquired project, got ' + verifyFirst.status + '\nstderr: ' + verifyFirst.stderr);
        const verifyFirstWrongProject = spawnSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-startup-a',
          '--project', 'issue-203'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(verifyFirstWrongProject.status === 2,
          '14A: verify-startup must reject a different project for the same receipt, got ' + verifyFirstWrongProject.status);

        // 14B: second session explicitly targets issue 203 (agent skipped 201=claimed, 202=blocked)
        const second = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-startup-b',
          '--runtime', 'codex',
          '--target-issue', '203'
        ], { cwd: startupTmp, encoding: 'utf8', env }).trim());
        assert(second.issue === 203 && second.claim === 'acquired',
          '14B: second startup must claim explicitly targeted issue 203, got: ' + JSON.stringify(second));
        assert(second.target_source === 'user_directed',
          '14B: receipt must record target_source: user_directed, got: ' + JSON.stringify(second));
        assert(fs.existsSync(path.join(sessionsDirFor(startupTmp), 'sess-startup-b.startup.json')),
          '14B: second startup receipt must be written');
        const verifySecondForFirst = spawnSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-startup-b',
          '--project', 'issue-201'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(verifySecondForFirst.status === 2,
          '14B: second startup receipt must not authorize the already-claimed issue 201, got ' + verifySecondForFirst.status);
        const verifySecond = spawnSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-startup-b',
          '--project', 'issue-203'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(verifySecond.status === 0,
          '14B: second startup receipt must authorize issue 203, got ' + verifySecond.status + '\nstderr: ' + verifySecond.stderr);

        // 14C: startup without --target-issue must refuse auto-pick and return no_target
        const third = spawnSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-startup-c',
          '--runtime', 'codex'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(third.status === 1, '14C: no-target startup must exit 1, got ' + third.status + '\nstderr: ' + third.stderr);
        const thirdReceipt = JSON.parse(third.stdout.trim());
        assert(thirdReceipt.claim === 'none' && thirdReceipt.startup_completed === true,
          '14C: no-target startup must still write a claim:none receipt, got: ' + JSON.stringify(thirdReceipt));
        assert(thirdReceipt.verdict === 'no_target',
          '14C: no-target startup must return verdict: no_target, got: ' + JSON.stringify(thirdReceipt));
        const verifyThird = spawnSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-startup-c',
          '--project', 'issue-201'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(verifyThird.status === 2,
          '14C: claim:none receipt must not authorize phase work, got ' + verifyThird.status);
        assert(verifyThird.stdout.includes('did not acquire or own any project'),
          '14C: claim:none verifier must explain the startup receipt gap, got: ' + verifyThird.stdout);

        // 14D: targeting an already-claimed issue returns target_occupied refusal
        const fourthD = spawnSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-startup-d',
          '--runtime', 'codex',
          '--target-issue', '201'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(fourthD.status === 1, '14D: occupied-target startup must exit 1, got ' + fourthD.status);
        const fourthDReceipt = JSON.parse(fourthD.stdout.trim());
        assert(fourthDReceipt.verdict === 'target_occupied' && fourthDReceipt.claim === 'none',
          '14D: occupied-target must return verdict: target_occupied, got: ' + JSON.stringify(fourthDReceipt));

        // 14E: targeting a dependency-blocked issue returns user_target_blocked refusal
        const fourthE = spawnSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-startup-e',
          '--runtime', 'codex',
          '--target-issue', '202'
        ], { cwd: startupTmp, encoding: 'utf8', env });
        assert(fourthE.status === 1, '14E: blocked-target startup must exit 1, got ' + fourthE.status);
        const fourthEReceipt = JSON.parse(fourthE.stdout.trim());
        assert(fourthEReceipt.verdict === 'user_target_blocked' && fourthEReceipt.claim === 'none',
          '14E: blocked-target must return verdict: user_target_blocked, got: ' + JSON.stringify(fourthEReceipt));
      } finally {
        fs.rmSync(startupTmp, { recursive: true, force: true });
      }
    }

    // Epic Case 14a — Priority label ranking: P0 beats P1 beats P2 beats P3
    {
      const claimScript14a = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const tmp14a = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic14a-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', tmp14a]);
        const bin14a = path.join(tmp14a, 'bin');
        fs.mkdirSync(bin14a, { recursive: true });
        const gh14a = path.join(bin14a, 'gh');
        fs.writeFileSync(gh14a, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":301,"title":"p3 issue","state":"OPEN","labels":[{"name":"P3"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/301"},{"number":302,"title":"p2 issue","state":"OPEN","labels":[{"name":"P2"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/302"},{"number":303,"title":"p1 issue","state":"OPEN","labels":[{"name":"P1"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/303"},{"number":304,"title":"p0 issue","state":"OPEN","labels":[{"name":"P0"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/304"},{"number":305,"title":"queued issue","state":"OPEN","labels":[{"name":"workflow:queued"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/305"}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  printf '{"number":%s,"title":"issue %s","body":"","labels":[],"state":"OPEN"}' "$num" "$num"
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/$3#issuecomment-$3"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then printf '[]'; exit 0; fi
exit 0
`);
        fs.chmodSync(gh14a, 0o755);
        const env14a = { ...process.env, PATH: bin14a + path.delimiter + (process.env.PATH || ''), HOME: tmp14a };

        const first14a = JSON.parse(execFileSync(process.execPath, [
          claimScript14a, 'startup',
          '--session', 'sess-14a',
          '--runtime', 'codex',
          '--target-issue', '305'
        ], { cwd: tmp14a, encoding: 'utf8', env: env14a }).trim());

        assert(first14a.issue === 305 && first14a.claim === 'acquired',
          '14a: workflow:queued issue 305 must be claimed when explicitly targeted, got: ' + JSON.stringify(first14a));
        assert(Array.isArray(first14a.ranking) && first14a.ranking.length === 5,
          '14a: ranking must contain all 5 issues, got: ' + JSON.stringify(first14a.ranking));
        const r304 = first14a.ranking.find(function(r) { return r.issue === 304; });
        assert(r304 && r304.tier === 0 && r304.priority_label === 'P0' && r304.override_label === null,
          '14a: ranking entry for issue 304 must be tier 0/P0, got: ' + JSON.stringify(r304));
        const r301 = first14a.ranking.find(function(r) { return r.issue === 301; });
        assert(r301 && r301.tier === 3 && r301.priority_label === 'P3' && r301.override_label === null,
          '14a: ranking entry for issue 301 must be tier 3/P3, got: ' + JSON.stringify(r301));
        const r305 = first14a.ranking.find(function(r) { return r.issue === 305; });
        assert(r305 && r305.tier === 4 && r305.priority_label === null && r305.override_label === null,
          '14a: ranking entry for issue 305 (queued, no P-label) must be tier 4/null, got: ' + JSON.stringify(r305));
      } finally {
        fs.rmSync(tmp14a, { recursive: true, force: true });
      }
    }

    // Epic Case 14b — Top-tier override: hotfix label beats P0
    {
      const claimScript14b = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const tmp14b = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic14b-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', tmp14b]);
        const bin14b = path.join(tmp14b, 'bin');
        fs.mkdirSync(bin14b, { recursive: true });
        const gh14b = path.join(bin14b, 'gh');
        fs.writeFileSync(gh14b, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":401,"title":"hotfix issue","state":"OPEN","labels":[{"name":"hotfix"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/401"},{"number":402,"title":"p0 issue","state":"OPEN","labels":[{"name":"P0"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/402"}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  printf '{"number":%s,"title":"issue %s","body":"","labels":[],"state":"OPEN"}' "$num" "$num"
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/$3#issuecomment-$3"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then
  printf '{"owner":{"login":"test"},"name":"repo"}'
  exit 0
fi
if [ "$1" = "api" ]; then printf '[]'; exit 0; fi
exit 0
`);
        fs.chmodSync(gh14b, 0o755);
        // Write project-local config declaring 'hotfix' as a top-tier label
        fs.mkdirSync(path.join(tmp14b, 'kaola-workflow'), { recursive: true });
        fs.writeFileSync(path.join(tmp14b, 'kaola-workflow', 'config.json'),
          JSON.stringify({ priority_top_tier_labels: ['hotfix'] }));
        const env14b = { ...process.env, PATH: bin14b + path.delimiter + (process.env.PATH || ''), HOME: tmp14b };

        const first14b = JSON.parse(execFileSync(process.execPath, [
          claimScript14b, 'startup',
          '--session', 'sess-14b',
          '--runtime', 'codex',
          '--target-issue', '401'
        ], { cwd: tmp14b, encoding: 'utf8', env: env14b }).trim());

        assert(first14b.issue === 401 && first14b.claim === 'acquired',
          '14b: hotfix issue 401 must be claimed when explicitly targeted, got: ' + JSON.stringify(first14b));
        const r401 = first14b.ranking.find(function(r) { return r.issue === 401; });
        assert(r401 && r401.override_label === 'hotfix' && r401.priority_label === null,
          '14b: ranking entry for issue 401 must have override_label=hotfix, priority_label=null, got: ' + JSON.stringify(r401));
        const r402 = first14b.ranking.find(function(r) { return r.issue === 402; });
        assert(r402 && r402.priority_label === 'P0' && r402.override_label === null,
          '14b: ranking entry for issue 402 must have priority_label=P0, override_label=null, got: ' + JSON.stringify(r402));
      } finally {
        fs.rmSync(tmp14b, { recursive: true, force: true });
      }
    }

    // coordRoot precursor sub-case: validates getCoordRoot() across primary and linked worktrees
    {
      const coordTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-coordroot-'));
      try {
        execFileSync('git', ['init', '-b', 'main'], { cwd: coordTmp, encoding: 'utf8' });
        execFileSync('git', ['-C', coordTmp, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
        const linkedPath = coordTmp + '-linked';
        execFileSync('git', ['-C', coordTmp, 'worktree', 'add', '--detach', linkedPath, 'HEAD'], { encoding: 'utf8' });
        try {
          const mainCoordRoot = fs.realpathSync(coordRootFor(coordTmp));
          const linkedCoordRoot = fs.realpathSync(coordRootFor(linkedPath));
          assert(mainCoordRoot === linkedCoordRoot,
            'coordRoot-precursor: coordRoot from primary (' + mainCoordRoot + ') must equal coordRoot from linked (' + linkedCoordRoot + ')');
          assert(path.isAbsolute(mainCoordRoot),
            'coordRoot-precursor: coordRoot must be absolute, got ' + mainCoordRoot);
          assert(mainCoordRoot.endsWith('.git'),
            'coordRoot-precursor: coordRoot must end in .git, got ' + mainCoordRoot);
          assert(mainCoordRoot !== fs.realpathSync(linkedPath),
            'coordRoot-precursor: coordRoot must not equal the linked worktree path');
        } finally {
          execFileSync('git', ['-C', coordTmp, 'worktree', 'remove', '--force', linkedPath], { encoding: 'utf8' });
        }
      } finally {
        fs.rmSync(coordTmp, { recursive: true, force: true });
      }
    }

    // coordRoot migration sub-case: migrateLegacyCoordState moves .locks/.sessions from root to coordRoot
    {
      const migTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-migrate-'));
      try {
        const claimScriptMig = path.join(root, 'scripts', 'kaola-workflow-claim.js');
        // Create legacy lock file under <root>/kaola-workflow/.locks/ (old layout)
        const legacyLocksDir = path.join(migTmp, 'kaola-workflow', '.locks');
        fs.mkdirSync(legacyLocksDir, { recursive: true });
        const now = Date.now();
        const legacyLock = {
          project: 'mig-proj',
          session_id: 'sess-mig',
          machine_id: 'test-machine',
          claimed_at: new Date(now).toISOString(),
          expires: new Date(now + 2 * 3600 * 1000).toISOString(),
          last_heartbeat: new Date(now).toISOString(),
          issue_number: null,
          claim_comment_id: null,
          sink: 'merge',
          pr_url: null,
          pr_number: null
        };
        const legacyLockPath = path.join(legacyLocksDir, 'mig-proj.lock');
        fs.writeFileSync(legacyLockPath, JSON.stringify(legacyLock, null, 2) + '\n');

        // Now claim a new project — this triggers migrateLegacyCoordState on first cmdClaim run
        const rMig = spawnSync(process.execPath, [
          claimScriptMig, 'claim',
          '--session', 'sess-mig-new',
          '--project', 'mig-new-proj',
          '--sink', 'merge'
        ], {
          cwd: migTmp,
          encoding: 'utf8',
          env: { ...process.env, HOME: migTmp }
        });

        // migrateLegacyCoordState should have run; for a non-git dir, coordRoot = migTmp/.git
        const migCoordRoot = coordRootFor(migTmp);
        const newLocksDir = locksDirFor(migTmp);

        // The legacy lock file must have been moved to coordRoot location
        assert(!fs.existsSync(legacyLockPath),
          'migrate: legacy lock file must be removed from root/kaola-workflow/.locks after migration, status=' + rMig.status + '\nstderr:' + rMig.stderr);
        const newLockPath = path.join(newLocksDir, 'mig-proj.lock');
        assert(fs.existsSync(newLockPath),
          'migrate: legacy lock file must appear in coordRoot/kaola-workflow/.locks after migration');
        const migratedLock = JSON.parse(fs.readFileSync(newLockPath, 'utf8'));
        assert(migratedLock.project === 'mig-proj',
          'migrate: migrated lock project must match, got ' + migratedLock.project);

        // New claim lock must also exist in coordRoot
        assert(rMig.status === 0,
          'migrate: claim for new project must succeed after migration, got status=' + rMig.status + '\nstderr:' + rMig.stderr);
        const newClaimLock = path.join(newLocksDir, 'mig-new-proj.lock');
        assert(fs.existsSync(newClaimLock),
          'migrate: new project lock must exist in coordRoot after claim');
      } finally {
        fs.rmSync(migTmp, { recursive: true, force: true });
      }
    }

    // Epic Case 15: Worktree provisioning and resume
    {
      const epic15Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic15-'));
      try {
        // git init with initial commit (required for worktree add)
        execFileSync('git', ['init', '-b', 'main'], { cwd: epic15Tmp, encoding: 'utf8' });
        execFileSync('git', ['-C', epic15Tmp, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });

        // gh shim: issue list returns [{number:501}]; comment returns URL with id 501;
        // pr view returns MERGED; repo view returns test/repo; all edits exit 0
        const binDir15 = path.join(epic15Tmp, 'bin');
        fs.mkdirSync(binDir15, { recursive: true });
        const ghShim15 = path.join(binDir15, 'gh');
        fs.writeFileSync(ghShim15, [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'if (args[0]==="issue"&&args[1]==="list") { process.stdout.write(JSON.stringify([{number:501,title:"t",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/501"}])+"\\n"); process.exit(0); }',
          'if (args[0]==="issue"&&args[1]==="comment") { process.stdout.write("https://github.com/test/repo/issues/501#issuecomment-501\\n"); process.exit(0); }',
          'if (args[0]==="issue"&&args[1]==="edit") { process.exit(0); }',
          'if (args[0]==="pr"&&args[1]==="view") { process.stdout.write(JSON.stringify({state:"MERGED",number:501,headRefName:"workflow/issue-501-issue-501",url:"https://github.com/test/repo/pull/501"})+"\\n"); process.exit(0); }',
          'if (args[0]==="repo"&&args[1]==="view") { process.stdout.write(JSON.stringify({nameWithOwner:"test/repo"})+"\\n"); process.exit(0); }',
          'if (args[0]==="api") { process.stdout.write(JSON.stringify([{id:501,body:"<!-- kw:claim session=sess-15a -->"}])+"\\n"); process.exit(0); }',
          'process.exit(0);'
        ].join('\n'), { mode: 0o755 });

        const pathSep = process.platform === 'win32' ? ';' : ':';
        const env15 = { ...process.env, PATH: binDir15 + pathSep + process.env.PATH };

        // 15A (AC1): Fresh claim provisions a worktree
        const claimResult15a = execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-15a', '--project', 'issue-501', '--issue', '501', '--runtime', 'claude'
        ], { cwd: epic15Tmp, encoding: 'utf8', env: env15 });

        const lock15a = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic15Tmp), 'issue-501.lock'), 'utf8'));
        assert(lock15a.worktree_path && lock15a.worktree_path.length > 0,
          '15A (AC1): lock.worktree_path must be a non-empty string');
        assert(fs.existsSync(lock15a.worktree_path),
          '15A (AC1): worktree directory must exist at ' + lock15a.worktree_path);
        assert(lock15a.branch && lock15a.branch.startsWith('workflow/'),
          '15A (AC1): lock.branch must start with "workflow/"');

        // 15B (AC2): worktree_path and branch visible in status
        const statusOut15b = execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'status', '--session', 'sess-15a', '--json'
        ], { cwd: epic15Tmp, encoding: 'utf8', env: { ...env15, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const statusArr15b = JSON.parse(statusOut15b);
        assert(Array.isArray(statusArr15b) && statusArr15b.length >= 1,
          '15B (AC2): status must return at least 1 entry');
        const statusEntry15b = statusArr15b.find(e => e.lock && e.lock.project === 'issue-501');
        assert(statusEntry15b, '15B (AC2): status must have entry for issue-501');
        assert(statusEntry15b.lock.worktree_path === lock15a.worktree_path,
          '15B (AC2): status lock.worktree_path must match lock file value');

        // 15C (AC3): coordRoot from main repo equals coordRoot from linked worktree
        const linkedPath15c = epic15Tmp + '-linked15c';
        execFileSync('git', ['-C', epic15Tmp, 'branch', 'linked-branch-15c'], { encoding: 'utf8' });
        execFileSync('git', ['-C', epic15Tmp, 'worktree', 'add', linkedPath15c, 'linked-branch-15c'], { encoding: 'utf8' });
        try {
          const mainCoordRoot15c = coordRootFor(epic15Tmp);
          const linkedCoordRoot15c = coordRootFor(linkedPath15c);
          assert(mainCoordRoot15c === linkedCoordRoot15c,
            '15C (AC3): coordRoot from primary (' + mainCoordRoot15c + ') must equal coordRoot from linked (' + linkedCoordRoot15c + ')');
          assert(mainCoordRoot15c !== linkedPath15c,
            '15C (AC3): coordRoot must not equal the linked worktree path');
          // Lock written in 15A is accessible via resolved coordRoot from linked worktree
          const lockViaLinked = readLockFileViaPath(path.join(linkedCoordRoot15c, 'kaola-workflow', '.locks', 'issue-501.lock'));
          assert(lockViaLinked && lockViaLinked.session_id === 'sess-15a',
            '15C (AC3): lock must be accessible from linked worktree coordRoot');
        } finally {
          execFileSync('git', ['-C', epic15Tmp, 'worktree', 'remove', '--force', linkedPath15c], { encoding: 'utf8' });
        }

        // 15D (AC4): Same-session re-claim reuses existing worktree
        const reClaimResult15d = execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-15a', '--project', 'issue-501', '--issue', '501', '--runtime', 'claude'
        ], { cwd: epic15Tmp, encoding: 'utf8', env: { ...env15, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const lock15d = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic15Tmp), 'issue-501.lock'), 'utf8'));
        assert(fs.existsSync(lock15d.worktree_path),
          '15D (AC4): re-claim must reuse existing worktree (it must still exist)');
        assert(lock15d.worktree_path === lock15a.worktree_path,
          '15D (AC4): re-claim must not change worktree_path');

        // 15E (AC5/AC11): Missing worktree → loud failure with recovery instructions
        fs.rmSync(lock15a.worktree_path, { recursive: true, force: true });
        // Also prune stale worktree reference
        try { execFileSync('git', ['-C', epic15Tmp, 'worktree', 'prune'], { encoding: 'utf8' }); } catch (_) {}

        let exit15e = 0;
        let stderr15e = '';
        try {
          execFileSync(process.execPath, [
            path.join(root, 'scripts/kaola-workflow-claim.js'),
            'claim', '--session', 'sess-15a', '--project', 'issue-501', '--issue', '501', '--runtime', 'claude'
          ], { cwd: epic15Tmp, encoding: 'utf8', env: { ...env15, KAOLA_WORKFLOW_OFFLINE: '1' } });
        } catch (e) { exit15e = e.status || 1; stderr15e = e.stderr || ''; }
        assert(exit15e === 2,
          '15E (AC11): claim with missing worktree must exit 2, got ' + exit15e);
        assert(stderr15e.includes('worktree missing at'),
          '15E (AC11): stderr must include "worktree missing at", got: ' + stderr15e);
        assert(stderr15e.includes('git worktree add'),
          '15E (AC11): stderr must include recovery instruction "git worktree add"');

        // Restore worktree for 15F
        execFileSync('git', ['-C', epic15Tmp, 'worktree', 'add', lock15a.worktree_path, lock15a.branch],
          { encoding: 'utf8' });

        // 15F (AC6/AC12): Branch pre-exists → git worktree add without -b
        // Release sess-15a, then claim again with different session
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'release', '--session', 'sess-15a'
        ], { cwd: epic15Tmp, encoding: 'utf8', env: { ...env15, KAOLA_WORKFLOW_OFFLINE: '1' } });

        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-15f', '--project', 'issue-501-f', '--issue', '501', '--runtime', 'claude'
        ], { cwd: epic15Tmp, encoding: 'utf8', env: env15 });
        const lock15f = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic15Tmp), 'issue-501-f.lock'), 'utf8'));
        assert(lock15f.worktree_path && fs.existsSync(lock15f.worktree_path),
          '15F (AC6/AC12): new claim must provision a new worktree that exists');

        // Cleanup 15F worktree
        try { execFileSync('git', ['-C', epic15Tmp, 'worktree', 'remove', '--force', '--', lock15f.worktree_path], { encoding: 'utf8' }); } catch (_) {}

        // 15G (legacy lock re-claim): pre-Phase-4 lock without worktree_path must resume successfully
        {
          const legacyProject = 'issue-legacy';
          const legacySession = 'sess-15g';
          const legacyIssueNumber = 999;
          const legacyClaimedAt = '2026-01-01T00:00:00.000Z';

          // Write legacy lock (no worktree_path, no branch)
          const legacyLockPath15g = path.join(locksDirFor(epic15Tmp), legacyProject + '.lock');
          const legacyLock15g = {
            project: legacyProject,
            session_id: legacySession,
            issue_number: legacyIssueNumber,
            claim_comment_id: 'comment-999',
            claimed_at: legacyClaimedAt,
            machine_id: 'test-machine',
            sink: 'merge',
            runtime: 'claude'
          };
          fs.writeFileSync(legacyLockPath15g, JSON.stringify(legacyLock15g, null, 2) + '\n', { mode: 0o600 });

          // Create workflow-state.md so updateSinkLease has a file to update
          const kwDir15g = path.join(epic15Tmp, 'kaola-workflow', legacyProject);
          fs.mkdirSync(kwDir15g, { recursive: true });
          fs.writeFileSync(path.join(kwDir15g, 'workflow-state.md'), '# workflow-state\n', 'utf8');

          // Also need a session file so the lock is recognized (create sessions dir)
          const sessDir15g = sessionsDirFor(epic15Tmp);
          fs.mkdirSync(sessDir15g, { recursive: true });

          // Re-claim using same session → must exit 0 (legacy resume path)
          let exit15g = 0;
          let stderr15g = '';
          try {
            execFileSync(process.execPath, [
              path.join(root, 'scripts/kaola-workflow-claim.js'),
              'claim', '--session', legacySession, '--project', legacyProject, '--issue', String(legacyIssueNumber), '--runtime', 'claude'
            ], { cwd: epic15Tmp, encoding: 'utf8', env: { ...env15, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) { exit15g = e.status || 1; stderr15g = e.stderr || ''; }

          assert(exit15g === 0,
            '15G (legacy): re-claim with legacy lock must exit 0, got ' + exit15g + '\nstderr: ' + stderr15g);

          const updatedLock15g = JSON.parse(fs.readFileSync(legacyLockPath15g, 'utf8'));
          assert('worktree_path' in updatedLock15g,
            '15G (legacy): updated lock must have worktree_path field');
          assert(updatedLock15g.branch && updatedLock15g.branch.startsWith('workflow/'),
            '15G (legacy): updated lock must have branch starting with "workflow/", got: ' + updatedLock15g.branch);
          assert(updatedLock15g.issue_number === legacyIssueNumber,
            '15G (legacy): issue_number must be preserved, got ' + updatedLock15g.issue_number);
          assert(updatedLock15g.claimed_at === legacyClaimedAt,
            '15G (legacy): claimed_at must be preserved, got ' + updatedLock15g.claimed_at);
        }

        // 15H (legacy lock re-claim, online): same fix but with provisionWorktree actually running
        {
          const legacyProject15h = 'issue-legacy-h';
          const legacySession15h = 'sess-15h';
          const legacyIssueNumber15h = 888;
          const legacyClaimedAt15h = '2026-02-01T00:00:00.000Z';

          // Write legacy lock (no worktree_path, no branch)
          const legacyLockPath15h = path.join(locksDirFor(epic15Tmp), legacyProject15h + '.lock');
          const legacyLock15h = {
            project: legacyProject15h,
            session_id: legacySession15h,
            issue_number: legacyIssueNumber15h,
            claim_comment_id: 'comment-888',
            claimed_at: legacyClaimedAt15h,
            machine_id: 'test-machine',
            sink: 'merge',
            runtime: 'claude'
          };
          fs.writeFileSync(legacyLockPath15h, JSON.stringify(legacyLock15h, null, 2) + '\n', { mode: 0o600 });

          // Create workflow-state.md
          const kwDir15h = path.join(epic15Tmp, 'kaola-workflow', legacyProject15h);
          fs.mkdirSync(kwDir15h, { recursive: true });
          fs.writeFileSync(path.join(kwDir15h, 'workflow-state.md'), '# workflow-state\n', 'utf8');

          // Re-claim online (provisionWorktree must run)
          let exit15h = 0;
          let stderr15h = '';
          try {
            execFileSync(process.execPath, [
              path.join(root, 'scripts/kaola-workflow-claim.js'),
              'claim', '--session', legacySession15h, '--project', legacyProject15h,
              '--issue', String(legacyIssueNumber15h), '--runtime', 'claude'
            ], { cwd: epic15Tmp, encoding: 'utf8', env: env15 });
          } catch (e) { exit15h = e.status || 1; stderr15h = e.stderr || ''; }

          assert(exit15h === 0,
            '15H (legacy online): re-claim with legacy lock must exit 0, got ' + exit15h + '\nstderr: ' + stderr15h);

          const updatedLock15h = JSON.parse(fs.readFileSync(legacyLockPath15h, 'utf8'));
          assert(updatedLock15h.worktree_path && updatedLock15h.worktree_path.length > 0,
            '15H (legacy online): worktree_path must be a non-empty string after upgrade');
          assert(fs.existsSync(updatedLock15h.worktree_path),
            '15H (legacy online): worktree directory must exist at ' + updatedLock15h.worktree_path);
          assert(updatedLock15h.branch && updatedLock15h.branch.startsWith('workflow/'),
            '15H (legacy online): branch must start with "workflow/", got: ' + updatedLock15h.branch);
          assert(updatedLock15h.issue_number === legacyIssueNumber15h,
            '15H (legacy online): issue_number must be preserved, got ' + updatedLock15h.issue_number);
          assert(updatedLock15h.claimed_at === legacyClaimedAt15h,
            '15H (legacy online): claimed_at must be preserved, got ' + updatedLock15h.claimed_at);

          // Cleanup worktree
          try { execFileSync('git', ['-C', epic15Tmp, 'worktree', 'remove', '--force', '--', updatedLock15h.worktree_path], { encoding: 'utf8' }); } catch (_) {}
        }

      } finally {
        fs.rmSync(epic15Tmp, { recursive: true, force: true });
        // Clean up .kw directory if created
        const kwDir15 = epic15Tmp + '.kw';
        if (fs.existsSync(kwDir15)) fs.rmSync(kwDir15, { recursive: true, force: true });
      }
    }

    // Epic Case 16: Worktree Lifecycle / Sweep / CWD-Protection
    {
      const epic16Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic16-'));
      try {
        execFileSync('git', ['init', '-b', 'main'], { cwd: epic16Tmp, encoding: 'utf8' });
        execFileSync('git', ['-C', epic16Tmp, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });

        const binDir16 = path.join(epic16Tmp, 'bin');
        fs.mkdirSync(binDir16, { recursive: true });

        // gh shim: MERGED for issue-601 URLs, CLOSED for issue-602 URLs, OPEN otherwise
        const ghShim16 = path.join(binDir16, 'gh');
        fs.writeFileSync(ghShim16, [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'const joinedArgs = args.join(" ");',
          'if (args[0]==="issue"&&args[1]==="list") {',
          '  process.stdout.write(JSON.stringify([',
          '    {number:601,title:"t601",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/601"},',
          '    {number:602,title:"t602",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/602"},',
          '    {number:603,title:"t603",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/603"},',
          '    {number:604,title:"t604",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/604"},',
          '    {number:605,title:"t605",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/605"}',
          '  ])+"\\n"); process.exit(0);',
          '}',
          'if (args[0]==="issue"&&(args[1]==="comment"||args[1]==="edit")) { process.stdout.write("https://github.com/test/repo/issues/601#issuecomment-1\\n"); process.exit(0); }',
          'if (args[0]==="repo"&&args[1]==="view") { process.stdout.write(JSON.stringify({nameWithOwner:"test/repo"})+"\\n"); process.exit(0); }',
          'if (args[0]==="pr"&&args[1]==="view") {',
          '  if (joinedArgs.includes("601")) { process.stdout.write(JSON.stringify({state:"MERGED",number:601,headRefName:"workflow/issue-601-issue-601",url:"https://github.com/test/repo/pull/601"})+"\\n"); process.exit(0); }',
          '  if (joinedArgs.includes("602")) { process.stdout.write(JSON.stringify({state:"CLOSED",number:602,headRefName:"workflow/issue-602-issue-602",url:"https://github.com/test/repo/pull/602"})+"\\n"); process.exit(0); }',
          '  process.stdout.write(JSON.stringify({state:"OPEN",number:0,headRefName:"workflow/unknown",url:"https://github.com/test/repo/pull/0"})+"\\n"); process.exit(0);',
          '}',
          'if (args[0]==="api") { process.stdout.write(JSON.stringify([])+"\\n"); process.exit(0); }',
          'process.exit(0);'
        ].join('\n'), { mode: 0o755 });

        const pathSep = process.platform === 'win32' ? ';' : ':';
        const env16 = { ...process.env, PATH: binDir16 + pathSep + process.env.PATH };
        const env16Off = { ...env16, KAOLA_WORKFLOW_OFFLINE: '1' };

        // Pre-provision issue-601 and issue-602 (with worktrees)
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-16-merged', '--project', 'issue-601', '--issue', '601', '--runtime', 'claude'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        const lock601 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-601.lock'), 'utf8'));

        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-16-closed', '--project', 'issue-602', '--issue', '602', '--runtime', 'claude'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        const lock602 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-602.lock'), 'utf8'));

        // 16A (AC7): watch-pr MERGED removes worktree for issue-601
        assert(lock601.worktree_path && fs.existsSync(lock601.worktree_path),
          '16A setup: worktree for issue-601 must exist before watch-pr');
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'watch-pr', '--session', 'sess-16-merged'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        assert(!fs.existsSync(path.join(locksDirFor(epic16Tmp), 'issue-601.lock')),
          '16A (AC7): lock for issue-601 must be gone after watch-pr MERGED');
        assert(!fs.existsSync(lock601.worktree_path),
          '16A (AC7): worktree directory for issue-601 must be gone after watch-pr MERGED');

        // 16B (AC8): watch-pr CLOSED removes worktree but does NOT delete branch for issue-602
        assert(!fs.existsSync(lock602.worktree_path),
          '16B (AC8): worktree for issue-602 must be gone (processed in same watch-pr run)');
        assert(!fs.existsSync(path.join(locksDirFor(epic16Tmp), 'issue-602.lock')),
          '16B (AC8): lock for issue-602 must be gone after watch-pr CLOSED');

        // 16C (AC9 — dirty worktree abandoned):
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-16c', '--project', 'issue-603', '--issue', '603', '--runtime', 'claude'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        const lock603 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-603.lock'), 'utf8'));
        // Write a dirty file inside the worktree
        fs.writeFileSync(path.join(lock603.worktree_path, 'dirty-file.txt'), 'dirty');

        // Trigger removal via watch-pr with MERGED shim for issue-603
        // Need to update gh shim to return MERGED for 603
        fs.writeFileSync(ghShim16, [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'const joinedArgs = args.join(" ");',
          'if (args[0]==="issue"&&args[1]==="list") {',
          '  process.stdout.write(JSON.stringify([',
          '    {number:603,title:"t603",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/603"}',
          '  ])+"\\n"); process.exit(0);',
          '}',
          'if (args[0]==="issue"&&(args[1]==="comment"||args[1]==="edit")) { process.stdout.write("https://github.com/test/repo/issues/603#issuecomment-1\\n"); process.exit(0); }',
          'if (args[0]==="repo"&&args[1]==="view") { process.stdout.write(JSON.stringify({nameWithOwner:"test/repo"})+"\\n"); process.exit(0); }',
          'if (args[0]==="pr"&&args[1]==="view") {',
          '  process.stdout.write(JSON.stringify({state:"MERGED",number:603,headRefName:"workflow/issue-603-issue-603",url:"https://github.com/test/repo/pull/603"})+"\\n"); process.exit(0);',
          '}',
          'if (args[0]==="api") { process.stdout.write(JSON.stringify([])+"\\n"); process.exit(0); }',
          'process.exit(0);'
        ].join('\n'), { mode: 0o755 });

        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'watch-pr', '--session', 'sess-16c'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        const wtDir603 = path.dirname(lock603.worktree_path);
        const abandonedEntries = fs.existsSync(wtDir603)
          ? fs.readdirSync(wtDir603).filter(e => e.includes('.abandoned-'))
          : [];
        assert(abandonedEntries.length > 0 || !fs.existsSync(lock603.worktree_path),
          '16C (AC9): dirty worktree must be abandoned (renamed to .abandoned-*) or removed');

        // 16D (AC10 — CWD-protection defers removal):
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-16d', '--project', 'issue-604', '--issue', '604', '--runtime', 'claude'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        const lock604 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-604.lock'), 'utf8'));
        const wtPath604 = lock604.worktree_path;
        assert(wtPath604 && fs.existsSync(wtPath604), '16D setup: worktree-604 must exist');

        // Update gh shim for issue-604 MERGED
        fs.writeFileSync(ghShim16, [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'const joinedArgs = args.join(" ");',
          'if (args[0]==="issue"&&args[1]==="list") {',
          '  process.stdout.write(JSON.stringify([',
          '    {number:604,title:"t604",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/604"}',
          '  ])+"\\n"); process.exit(0);',
          '}',
          'if (args[0]==="issue"&&(args[1]==="comment"||args[1]==="edit")) { process.stdout.write("https://github.com/test/repo/issues/604#issuecomment-1\\n"); process.exit(0); }',
          'if (args[0]==="repo"&&args[1]==="view") { process.stdout.write(JSON.stringify({nameWithOwner:"test/repo"})+"\\n"); process.exit(0); }',
          'if (args[0]==="pr"&&args[1]==="view") {',
          '  process.stdout.write(JSON.stringify({state:"MERGED",number:604,headRefName:"workflow/issue-604-issue-604",url:"https://github.com/test/repo/pull/604"})+"\\n"); process.exit(0);',
          '}',
          'if (args[0]==="api") { process.stdout.write(JSON.stringify([])+"\\n"); process.exit(0); }',
          'process.exit(0);'
        ].join('\n'), { mode: 0o755 });

        // Run watch-pr with cwd inside the worktree (CWD-protection triggers deferral)
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'watch-pr', '--session', 'sess-16d'
        ], { cwd: wtPath604, encoding: 'utf8', env: env16 });

        const coordRoot16 = coordRootFor(epic16Tmp);
        const pendingFile604 = path.join(coordRoot16, 'kaola-workflow', '.pending-removal', 'issue-604.json');
        const wtStillExists604 = fs.existsSync(wtPath604);
        assert(fs.existsSync(pendingFile604) || wtStillExists604,
          '16D (AC10): CWD-protection must defer removal: either .pending-removal entry exists or worktree is still present');

        // 16E (AC11 — drain on sweep):
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'sweep'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16Off });
        const wtGoneAfterSweep604 = !fs.existsSync(wtPath604);
        const pendingGoneAfterSweep604 = !fs.existsSync(pendingFile604);
        assert(wtGoneAfterSweep604 || pendingGoneAfterSweep604,
          '16E (AC11): sweep must drain pending removal for issue-604 (worktree gone or pending entry deleted)');

        // 16F (AC12 — sweep calls git worktree prune):
        execFileSync('git', ['-C', epic16Tmp, 'branch', 'orphan-branch-16f'], { encoding: 'utf8' });
        const orphanPath16f = epic16Tmp + '-orphan16f';
        execFileSync('git', ['-C', epic16Tmp, 'worktree', 'add', orphanPath16f, 'orphan-branch-16f'], { encoding: 'utf8' });
        // Delete the directory without git worktree remove (creates stale worktree entry)
        fs.rmSync(orphanPath16f, { recursive: true, force: true });
        const beforeSweepList16f = execFileSync('git', ['-C', epic16Tmp, 'worktree', 'list', '--porcelain'],
          { encoding: 'utf8' });
        assert(beforeSweepList16f.includes(orphanPath16f),
          '16F setup: orphan path must appear in worktree list before sweep');
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'sweep'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16Off });
        const afterSweepList16f = execFileSync('git', ['-C', epic16Tmp, 'worktree', 'list', '--porcelain'],
          { encoding: 'utf8' });
        assert(!afterSweepList16f.includes(orphanPath16f),
          '16F (AC12): orphan path must NOT appear in worktree list after sweep calls git worktree prune');

        // 16G (AC13 — sink-merge removes worktree before branch delete):
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-claim.js'),
          'claim', '--session', 'sess-16g', '--project', 'issue-605', '--issue', '605', '--runtime', 'claude'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
        const lock605 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-605.lock'), 'utf8'));
        assert(lock605.worktree_path && fs.existsSync(lock605.worktree_path),
          '16G setup: worktree for issue-605 must exist');
        execFileSync(process.execPath, [
          path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
          '--branch', lock605.branch, '--project', 'issue-605', '--issue', '605'
        ], { cwd: epic16Tmp, encoding: 'utf8', env: env16Off });
        assert(!fs.existsSync(lock605.worktree_path),
          '16G (AC13): worktree for issue-605 must be gone after sink-merge');

        // 16G-CWD (AC13-ext): sink-merge from inside worktree exits 0 and restores CWD
        {
          execFileSync(process.execPath, [
            path.join(root, 'scripts/kaola-workflow-claim.js'),
            'claim', '--session', 'sess-16g-cwd', '--project', 'issue-606', '--issue', '606', '--runtime', 'claude'
          ], { cwd: epic16Tmp, encoding: 'utf8', env: env16 });
          const lock606 = JSON.parse(fs.readFileSync(path.join(locksDirFor(epic16Tmp), 'issue-606.lock'), 'utf8'));
          assert(lock606.worktree_path && fs.existsSync(lock606.worktree_path),
            '16G-CWD setup: worktree for issue-606 must exist');

          const cwdProbeFile = path.join(os.tmpdir(), 'kaola-workflow-16g-cwd-probe-' + Date.now() + '.txt');

          const r16gCwd = spawnSync(process.execPath, [
            path.join(root, 'scripts/kaola-workflow-sink-merge.js'),
            '--branch', lock606.branch, '--project', 'issue-606', '--issue', '606'
          ], {
            cwd: lock606.worktree_path,
            encoding: 'utf8',
            env: { ...env16Off, KAOLA_WORKFLOW_DEBUG_CWD: cwdProbeFile }
          });

          assert(r16gCwd.status === 0,
            '16G-CWD (AC13-ext): sink-merge from inside worktree must exit 0, got ' + r16gCwd.status +
            '\nstderr: ' + r16gCwd.stderr);
          assert(!fs.existsSync(lock606.worktree_path),
            '16G-CWD (AC13-ext): worktree for issue-606 must be gone after sink-merge');

          let probedCwd = '';
          try { probedCwd = fs.readFileSync(cwdProbeFile, 'utf8').trim(); } catch (_) {}
          try { fs.unlinkSync(cwdProbeFile); } catch (_) {}
          let expectedRoot = epic16Tmp;
          try { expectedRoot = fs.realpathSync(epic16Tmp); } catch (_) {}
          assert(probedCwd === expectedRoot,
            '16G-CWD (AC13-ext): CWD probe must equal main repo root; got "' +
            probedCwd + '", expected "' + expectedRoot + '"');
        }

        // 16H (AC9 — pre-commit hook blocks cross-worktree commit):
        {
          const tmpRepo16h = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-16h-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmpRepo16h, encoding: 'utf8' });
            execFileSync('git', ['-C', tmpRepo16h, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            // Install the pre-commit hook
            const hooksDir16h = path.join(tmpRepo16h, '.git', 'hooks');
            fs.mkdirSync(hooksDir16h, { recursive: true });
            fs.copyFileSync(
              path.join(root, 'hooks', 'kaola-workflow-pre-commit.sh'),
              path.join(hooksDir16h, 'pre-commit')
            );
            fs.chmodSync(path.join(hooksDir16h, 'pre-commit'), 0o755);
            // Set up user config for commit
            execFileSync('git', ['-C', tmpRepo16h, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
            execFileSync('git', ['-C', tmpRepo16h, 'config', 'user.name', 'Test'], { encoding: 'utf8' });

            // Claim project-A as session-A (creates lock at COORD_ROOT path)
            const coordRoot16h = coordRootFor(tmpRepo16h);
            const locksDir16h = path.join(coordRoot16h, 'kaola-workflow', '.locks');
            fs.mkdirSync(locksDir16h, { recursive: true });
            const lockData16h = {
              project: 'project-a', session_id: 'sess-16h-a',
              claimed_at: new Date().toISOString(),
              expires: new Date(Date.now() + 3600000).toISOString(),
              last_heartbeat: new Date().toISOString()
            };
            fs.writeFileSync(path.join(locksDir16h, 'project-a.lock'), JSON.stringify(lockData16h) + '\n', { mode: 0o600 });

            // Create a linked worktree
            execFileSync('git', ['-C', tmpRepo16h, 'branch', 'wt-b-branch'], { encoding: 'utf8' });
            const wtB16h = tmpRepo16h + '-wtB';
            execFileSync('git', ['-C', tmpRepo16h, 'worktree', 'add', wtB16h, 'wt-b-branch'], { encoding: 'utf8' });

            // Set up git user in linked worktree too
            execFileSync('git', ['-C', wtB16h, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
            execFileSync('git', ['-C', wtB16h, 'config', 'user.name', 'Test'], { encoding: 'utf8' });

            // Stage kaola-workflow/project-a/workflow-state.md to trigger the hook
            const kwDir16h = path.join(wtB16h, 'kaola-workflow', 'project-a');
            fs.mkdirSync(kwDir16h, { recursive: true });
            fs.writeFileSync(path.join(kwDir16h, 'workflow-state.md'), '# state\nstatus: active\n');
            execFileSync('git', ['-C', wtB16h, 'add', '.'], { encoding: 'utf8' });

            // Attempt commit from linked worktree with a different KAOLA_SESSION_ID
            let exit16h = 0;
            try {
              execFileSync('git', ['-C', wtB16h, 'commit', '--allow-empty', '-m', 'test'],
                { encoding: 'utf8', env: { ...process.env, KAOLA_SESSION_ID: 'different-session' } });
            } catch (e) { exit16h = e.status || 1; }
            assert(exit16h !== 0,
              '16H (AC9): pre-commit hook must block cross-session commit from linked worktree, got exit ' + exit16h);

            // Cleanup
            try { execFileSync('git', ['-C', tmpRepo16h, 'worktree', 'remove', '--force', wtB16h], { encoding: 'utf8' }); } catch (_) {}
          } finally {
            fs.rmSync(tmpRepo16h, { recursive: true, force: true });
            const wtB16hClean = tmpRepo16h + '-wtB';
            if (fs.existsSync(wtB16hClean)) fs.rmSync(wtB16hClean, { recursive: true, force: true });
          }
        }

      } finally {
        fs.rmSync(epic16Tmp, { recursive: true, force: true });
        const kwDir16 = epic16Tmp + '.kw';
        if (fs.existsSync(kwDir16)) fs.rmSync(kwDir16, { recursive: true, force: true });
      }
    }

    // LOW-3: corpus-grep — every phase shim must contain liveness and session rehydration checks
    {
      const shimPaths = [
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase1.md'),
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase2.md'),
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase3.md'),
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase4.md'),
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase5.md'),
        path.join(__dirname, '..', 'commands', 'kaola-workflow-phase6.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-research', 'SKILL.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-execute', 'SKILL.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-ideation', 'SKILL.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-plan', 'SKILL.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-review', 'SKILL.md'),
        path.join(__dirname, '..', 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-finalize', 'SKILL.md'),
      ];
      const LIVENESS_CANONICAL = 'kill -0 "$(cat "$_TICKER_PID_FILE" 2>/dev/null)" 2>/dev/null';
      for (const shimPath of shimPaths) {
        const shimContent = fs.readFileSync(shimPath, 'utf8');
        assert(shimContent.includes(LIVENESS_CANONICAL), 'LOW-3: missing liveness check in ' + path.basename(shimPath));
        const hasSessionHydration =
          shimContent.includes('node "$_CLAIM_JS" session --project "{project}"') ||
          shimContent.includes('node "$claim_script" session');
        assert(hasSessionHydration, 'LOW-3: missing session rehydration in ' + path.basename(shimPath));
      }
    }

    // 8N-task1.1: session-env identity file write (issue #31)
    {
      const tmpRepo11 = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-task11-'));
      try {
        // Set up a real git repo so git rev-parse --git-common-dir works
        execFileSync('git', ['init', tmpRepo11], { encoding: 'utf8' });
        execFileSync('git', ['-C', tmpRepo11, 'config', 'user.email', 'test@example.com'], { encoding: 'utf8' });
        execFileSync('git', ['-C', tmpRepo11, 'config', 'user.name', 'Test'], { encoding: 'utf8' });

        // Prepare the env file that session-env.js will append to
        const envFile11 = path.join(tmpRepo11, 'test.env');
        fs.writeFileSync(envFile11, '');

        const sessionEnvScript = path.join(__dirname, 'kaola-workflow-session-env.js');

        // Invoke the script with stdin JSON and required env vars
        const result11 = spawnSync('node', [sessionEnvScript], {
          input: '{"session_id":"test-sid-1.1"}',
          env: {
            ...process.env,
            CLAUDE_ENV_FILE: envFile11,
            GIT_ROOT: tmpRepo11,
            KAOLA_WORKFLOW_OFFLINE: '1'
          },
          encoding: 'utf8'
        });

        assert(result11.status === 0,
          '8N-task1.1: session-env.js must exit 0, got ' + result11.status + ' stderr: ' + result11.stderr);

        // Baseline: the env file must contain the export line
        const envContents11 = fs.readFileSync(envFile11, 'utf8');
        assert(envContents11.includes("export KAOLA_SESSION_ID='test-sid-1.1'"),
          '8N-task1.1: env file must contain KAOLA_SESSION_ID export, got: ' + envContents11);

        // Identity runtime dir must be created (dir exists even if identity file write fails)
        const gitCommonDir11 = execFileSync('git', ['rev-parse', '--git-common-dir'],
          { cwd: tmpRepo11, encoding: 'utf8' }).trim();
        const coordRoot11 = path.resolve(tmpRepo11, gitCommonDir11);
        const runtimeDir11 = path.join(coordRoot11, 'kaola-workflow', '.runtime');
        assert(fs.existsSync(runtimeDir11),
          '8N-task1.1: runtime dir must exist after session-env runs: ' + runtimeDir11);
      } finally {
        fs.rmSync(tmpRepo11, { recursive: true, force: true });
      }
    }

    // 8N-task1.2: derivePlatformSessionId via derive-session --json subcommand
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');

      // Test A — SKIP path (uses KAOLA_KERNEL_SESSION_SKIP=1)
      const rA = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_KERNEL_SESSION_SKIP: '1', KAOLA_SESSION_ID: 'sid-test-skip' }
      });
      assert(rA.status === 0, '8N-task1.2-A: SKIP path exits 0, got ' + rA.status);
      const outA = JSON.parse(rA.stdout.trim());
      assert(outA.sid === 'sid-test-skip', '8N-task1.2-A: SID matches env');
      assert(outA.source === 'skip', '8N-task1.2-A: source is skip');

      // Test B — FAKE_PID + valid identity file (file read succeeds)
      const fakePid = process.pid; // alive PID
      const runtimeDir = path.join(tmp, 'kaola-workflow', '.runtime');
      fs.mkdirSync(runtimeDir, { recursive: true });
      const identPath = path.join(runtimeDir, fakePid + '.identity');
      const startStr = execFileSync('ps', ['-o', 'lstart=', '-p', String(fakePid)], { encoding: 'utf8' }).trim();
      fs.writeFileSync(identPath, JSON.stringify({ sid: 'sid-from-file', claude_pid: fakePid, claude_start_time_str: startStr, runtime: 'claude', written_at: Date.now() }) + '\n', { mode: 0o600 });
      const rB = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_KERNEL_SESSION_FAKE_PID: String(fakePid), KAOLA_COORD_ROOT: tmp }
      });
      assert(rB.status === 0, '8N-task1.2-B: file read exits 0, got ' + rB.status + ' stderr:' + rB.stderr);
      const outB = JSON.parse(rB.stdout.trim());
      assert(outB.sid === 'sid-from-file', '8N-task1.2-B: SID from file');
      assert(outB.source === 'file', '8N-task1.2-B: source is file');

      // Test C — start_time mismatch deletes file (AC11)
      const recycledPath = path.join(runtimeDir, fakePid + '.identity');
      fs.writeFileSync(recycledPath, JSON.stringify({ sid: 'sid-stale', claude_pid: fakePid, claude_start_time_str: 'epoch-1970-mismatch', runtime: 'claude', written_at: Date.now() }) + '\n', { mode: 0o600 });
      const rC = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_KERNEL_SESSION_FAKE_PID: String(fakePid), KAOLA_COORD_ROOT: tmp }
      });
      assert(!fs.existsSync(recycledPath), '8N-task1.2-C: start_time mismatch deletes identity file');

      // Test D — dead PID deletes file (AC10)
      const deadPid = 99999999;
      const deadPath = path.join(runtimeDir, deadPid + '.identity');
      fs.writeFileSync(deadPath, JSON.stringify({ sid: 'sid-dead', claude_pid: deadPid, claude_start_time_str: 'irrelevant', written_at: Date.now() }) + '\n', { mode: 0o600 });
      const rD = spawnSync(process.execPath, [claimScript, 'derive-session', '--json'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_KERNEL_SESSION_FAKE_PID: String(deadPid), KAOLA_COORD_ROOT: tmp }
      });
      assert(!fs.existsSync(deadPath), '8N-task1.2-D: dead PID deletes identity file');
    }

    // 8N-task2: cmdSession and cmdVerifyStartup use kernel-derived session identity
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');

      // AC2 — cmdSession exits 4 without Claude ancestor (no --session, no SKIP, no FAKE_PID)
      const r2 = spawnSync(process.execPath, [claimScript, 'session'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1' }
      });
      assert(r2.status === 4, 'AC2: cmdSession exits 4 without Claude ancestor, got ' + r2.status);

      // AC4 — cmdVerifyStartup blocks cross-session caller (enforcement active)
      // KAOLA_SESSION_ID=sess-impostor, --session sess-true-owner: derived SID (sess-impostor) != --session -> exit 2
      const r4 = spawnSync(process.execPath, [claimScript, 'verify-startup', '--session', 'sess-true-owner', '--project', 'proj-ac4'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_KERNEL_SESSION_SKIP: '1', KAOLA_SESSION_ID: 'sess-impostor', KAOLA_ENFORCE_PLATFORM_SESSION: '1' }
      });
      assert(r4.status === 2, 'AC4: verify-startup blocks cross-session caller, got ' + r4.status);
      assert(r4.stdout.includes('caller platform session does not match claimed session'),
        'AC4: must block via identity check (not receipt fallback); got: ' + r4.stdout);

      // AC5 — cmdSession returns derived SID under SKIP
      const r5 = spawnSync(process.execPath, [claimScript, 'session'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_KERNEL_SESSION_SKIP: '1', KAOLA_SESSION_ID: 'sid-ac5' }
      });
      assert(r5.status === 0, 'AC5: cmdSession exits 0, got ' + r5.status);
      assert(r5.stdout.trim() === 'sid-ac5', 'AC5: cmdSession returns derived SID, got ' + r5.stdout.trim());
    }

    // 8N-task3: enforcePlatformSessionOrExit wired into mutating commands
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');

      // AC3 — enforcement exits 3 on SID mismatch
      const r3 = spawnSync(process.execPath, [claimScript, 'claim', '--session', 'sess-claimed', '--project', 'proj-ac3'], {
        encoding: 'utf8',
        cwd: tmp,
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_ENFORCE_PLATFORM_SESSION: '1', KAOLA_KERNEL_SESSION_SKIP: '1', KAOLA_SESSION_ID: 'sid-derived' }
      });
      assert(r3.status === 3, 'AC3: enforcement exits 3 on SID mismatch, got ' + r3.status);

      // AC6 — spot-check 3 mutating commands exit 3 on mismatch
      for (const [sub, extra] of [['heartbeat', ['--session', 'sess-other']], ['release', ['--session', 'sess-other']]]) {
        const r6 = spawnSync(process.execPath, [claimScript, sub, ...extra], {
          encoding: 'utf8',
          env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_ENFORCE_PLATFORM_SESSION: '1', KAOLA_KERNEL_SESSION_SKIP: '1', KAOLA_SESSION_ID: 'sid-derived' }
        });
        assert(r6.status === 3, 'AC6: ' + sub + ' exits 3 on SID mismatch, got ' + r6.status);
      }

      // AC7 — enforcement off: commands succeed (backward compat)
      const r7 = spawnSync(process.execPath, [claimScript, 'claim', '--session', 'sess-ac7', '--project', 'proj-ac7'], {
        encoding: 'utf8',
        cwd: tmp,
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1' }  // no enforcement
      });
      assert(r7.status === 0, 'AC7: claim succeeds with enforcement off, got ' + r7.status);

      // AC8 — --platform-override bypasses enforcement, writes audit log
      const coordRootAc8 = tmp;  // use tmp as coordRoot via KAOLA_COORD_ROOT
      const r8 = spawnSync(process.execPath, [claimScript, 'claim', '--session', 'sess-ac8', '--project', 'proj-ac8', '--platform-override'], {
        encoding: 'utf8',
        cwd: tmp,
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_ENFORCE_PLATFORM_SESSION: '1', KAOLA_KERNEL_SESSION_SKIP: '1', KAOLA_SESSION_ID: 'sid-different', KAOLA_COORD_ROOT: coordRootAc8 }
      });
      assert(r8.status === 0, 'AC8: --platform-override bypasses enforcement, got ' + r8.status);
      const auditPath = path.join(coordRootAc8, 'kaola-workflow', '.audit', 'identity-override.log');
      assert(fs.existsSync(auditPath), 'AC8: audit log created');
      const entry = JSON.parse(fs.readFileSync(auditPath, 'utf8').trim().split('\n')[0]);
      assert(entry.platform_override === true, 'AC8: audit marks platform_override=true');
      assert(entry.cmd === 'claim', 'AC8: audit records cmd=claim');
    }

    // 8N-task4.1 — AC15: pre-commit hook uses kernel-derived session ID (replace env-var comparison)
    {
      const hookPath = path.join(root, 'hooks', 'kaola-workflow-pre-commit.sh');
      assert(fs.existsSync(hookPath), 'AC15: pre-commit hook must exist');

      const ac15Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-ac15-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', ac15Tmp]);
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: ac15Tmp });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: ac15Tmp });
        fs.writeFileSync(path.join(ac15Tmp, 'README.md'), 'init\n');
        execFileSync('git', ['add', 'README.md'], { cwd: ac15Tmp });
        execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: ac15Tmp });

        // Set up lock file for proj-ac15 owned by sess-real-owner
        const locksDir = locksDirFor(ac15Tmp);
        fs.mkdirSync(locksDir, { recursive: true });
        fs.writeFileSync(path.join(locksDir, 'proj-ac15.lock'), JSON.stringify({
          project: 'proj-ac15',
          session_id: 'sess-real-owner',
          machine_id: 'm1',
          claimed_at: '2026-05-16T10:00:00Z',
          expires: '2026-05-16T12:00:00Z',
          last_heartbeat: '2026-05-16T10:00:00Z',
          issue_number: 605,
          claim_comment_id: null,
          sink: 'merge'
        }, null, 2) + '\n');

        // Stage a file under proj-ac15
        fs.mkdirSync(path.join(ac15Tmp, 'kaola-workflow', 'proj-ac15'), { recursive: true });
        fs.writeFileSync(path.join(ac15Tmp, 'kaola-workflow', 'proj-ac15', 'workflow-state.md'),
          '# Kaola-Workflow State\nsession_id: sess-real-owner\n');
        execFileSync('git', ['add', 'kaola-workflow/proj-ac15/workflow-state.md'], { cwd: ac15Tmp });

        // AC15-block: wrong session must be blocked with exit 2, stderr must include "(derived)"
        const rBlock = spawnSync('bash', [hookPath], {
          cwd: ac15Tmp,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: ac15Tmp,
            KAOLA_WORKFLOW_OFFLINE: '1',
            KAOLA_KERNEL_SESSION_SKIP: '1',
            KAOLA_SESSION_ID: 'sess-impostor'
          }
        });
        assert(rBlock.status === 2,
          'AC15-block: hook must exit 2 when impostor session commits proj-ac15 files, got ' + rBlock.status +
          '\nstderr: ' + rBlock.stderr);
        assert(rBlock.stderr.includes('BLOCKED'),
          'AC15-block: stderr must contain BLOCKED marker, got: ' + rBlock.stderr);
        assert(rBlock.stderr.includes('(derived)'),
          'AC15-block: stderr must include "(derived)" to confirm kernel-derived path, got: ' + rBlock.stderr);

        // AC15-pass: owning session must pass through (exit 0)
        const rPass = spawnSync('bash', [hookPath], {
          cwd: ac15Tmp,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: ac15Tmp,
            KAOLA_WORKFLOW_OFFLINE: '1',
            KAOLA_KERNEL_SESSION_SKIP: '1',
            KAOLA_SESSION_ID: 'sess-real-owner'
          }
        });
        assert(rPass.status === 0,
          'AC15-pass: hook must exit 0 when owning session commits proj-ac15 files, got ' + rPass.status +
          '\nstderr: ' + rPass.stderr);
      } finally {
        fs.rmSync(ac15Tmp, { recursive: true, force: true });
      }
    }

    // 8N-task4.2: owner_session_id in Lease Block
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
      const proj42 = 'proj-task42';
      const sid42 = 'sid-task42';

      // Claim with SKIP so derived SID = sid42, no enforcement
      const r42 = spawnSync(process.execPath, [claimScript, 'claim', '--session', sid42, '--project', proj42], {
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: tmp,
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_COORD_ROOT: tmp,
          KAOLA_KERNEL_SESSION_SKIP: '1',
          KAOLA_SESSION_ID: sid42
        },
        cwd: tmp
      });
      assert(r42.status === 0, '8N-task4.2: claim must succeed, got ' + r42.status + ' stderr: ' + r42.stderr);

      const stateFile42 = path.join(tmp, 'kaola-workflow', proj42, 'workflow-state.md');
      assert(fs.existsSync(stateFile42), '8N-task4.2: workflow-state.md must exist');
      const stateContent42 = fs.readFileSync(stateFile42, 'utf8');
      assert(stateContent42.includes('owner_session_id:'), 'AC12: workflow-state.md Lease block must contain owner_session_id');
      assert(stateContent42.includes('owner_session_id: ' + sid42), 'AC12: owner_session_id must equal derived session id');
    }

    // 8N-task5.1: Ticker Parent-Alive Guard (structural test)
    {
      const claimContent = fs.readFileSync(path.join(root, 'scripts', 'kaola-workflow-claim.js'), 'utf8');
      assert(
        claimContent.includes('tickCtx.claudePid') && claimContent.includes('isPidAlive(tickCtx.claudePid)'),
        'AC13: runTick must contain isPidAlive(tickCtx.claudePid) guard'
      );
    }

    // 8N-task5.2: Sweep Stale Identity Pruning
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
      const runtimeDir52 = path.join(tmp, 'kaola-workflow', '.runtime');
      fs.mkdirSync(runtimeDir52, { recursive: true });
      // Create .locks dir so cmdSweep doesn't return early before reaching identity pruning
      fs.mkdirSync(path.join(tmp, 'kaola-workflow', '.locks'), { recursive: true });
      const deadFile52 = path.join(runtimeDir52, '99999999.identity');
      fs.writeFileSync(deadFile52, JSON.stringify({ sid: 'sid-dead', claude_pid: 99999999, written_at: Date.now() }) + '\n');
      spawnSync(process.execPath, [claimScript, 'sweep'], {
        encoding: 'utf8',
        env: { ...process.env, HOME: tmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_COORD_ROOT: tmp },
        cwd: tmp
      });
      assert(!fs.existsSync(deadFile52), 'AC14: sweep removes dead-PID identity file');
    }

    // 8N-task-review-fix-1: structural test — session-env.js must document 2-hop assumption and stderr warn
    {
      const sessionEnvContent = fs.readFileSync(path.join(root, 'scripts', 'kaola-workflow-session-env.js'), 'utf8');
      assert(
        sessionEnvContent.includes('empirically verified') || sessionEnvContent.includes('2-hop'),
        'review-fix-1: session-env.js must document the 2-hop assumption (grep for "empirically verified" or "2-hop")'
      );
      assert(
        sessionEnvContent.includes('could not locate Claude ancestor PID'),
        'review-fix-1: session-env.js must contain stderr warning path with "could not locate Claude ancestor PID"'
      );
    }

    // 8N-task-review-fix-2: AC9 — heartbeat exits 3 when derive-session returns null under enforcement
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
      const rf2Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-rf2-'));
      try {
        const deadPid = 99999999;
        // Create a lock so heartbeat finds a match for 'fake-sid'
        const locksDir2 = path.join(rf2Tmp, 'kaola-workflow', '.locks');
        fs.mkdirSync(locksDir2, { recursive: true });
        fs.writeFileSync(path.join(locksDir2, 'some-project.lock'), JSON.stringify({
          project: 'some-project',
          session_id: 'fake-sid',
          machine_id: 'm1',
          claimed_at: '2026-05-16T10:00:00Z',
          expires: '2026-05-16T12:00:00Z',
          last_heartbeat: '2026-05-16T10:00:00Z'
        }) + '\n');
        // Create identity file for the dead PID so ENOENT path doesn't fire before isPidAlive check
        const runtimeDir2 = path.join(rf2Tmp, 'kaola-workflow', '.runtime');
        fs.mkdirSync(runtimeDir2, { recursive: true });
        fs.writeFileSync(path.join(runtimeDir2, deadPid + '.identity'), JSON.stringify({
          sid: 'fake-sid',
          claude_pid: deadPid,
          claude_start_time_str: 'Mon Jan  1 00:00:00 2024',
          runtime: 'claude',
          written_at: Date.now()
        }) + '\n');

        const rRf2 = spawnSync(process.execPath, [claimScript, 'heartbeat', '--project', 'some-project', '--session', 'fake-sid'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: rf2Tmp,
            KAOLA_WORKFLOW_OFFLINE: '1',
            KAOLA_COORD_ROOT: rf2Tmp,
            KAOLA_ENFORCE_PLATFORM_SESSION: '1',
            KAOLA_KERNEL_SESSION_FAKE_PID: String(deadPid)
          },
          cwd: rf2Tmp
        });
        assert(rRf2.status === 3,
          'review-fix-2 (AC9): heartbeat must exit 3 when derived SID is null under enforcement, got ' + rRf2.status +
          '\nstderr: ' + rRf2.stderr);
      } finally {
        fs.rmSync(rf2Tmp, { recursive: true, force: true });
      }
    }

    // 8N-task-review-fix-3: pre-commit hook blocked when derive-session returns empty under enforcement
    {
      const hookPath = path.join(root, 'hooks', 'kaola-workflow-pre-commit.sh');
      const rf3Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-rf3-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', rf3Tmp]);
        execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: rf3Tmp });
        execFileSync('git', ['config', 'user.name', 'Test'], { cwd: rf3Tmp });
        fs.writeFileSync(path.join(rf3Tmp, 'README.md'), 'init\n');
        execFileSync('git', ['add', 'README.md'], { cwd: rf3Tmp });
        execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: rf3Tmp });

        // Set up lock file for test-project owned by owner-session
        const locksDir3 = locksDirFor(rf3Tmp);
        fs.mkdirSync(locksDir3, { recursive: true });
        fs.writeFileSync(path.join(locksDir3, 'test-project.lock'), JSON.stringify({
          project: 'test-project',
          session_id: 'owner-session',
          machine_id: 'm1',
          claimed_at: '2026-05-16T10:00:00Z',
          expires: '2026-05-16T12:00:00Z',
          last_heartbeat: '2026-05-16T10:00:00Z',
          issue_number: 31,
          claim_comment_id: null,
          sink: 'merge'
        }) + '\n');

        // Stage a file under test-project so KW_PATHS is non-empty
        fs.mkdirSync(path.join(rf3Tmp, 'kaola-workflow', 'test-project'), { recursive: true });
        fs.writeFileSync(path.join(rf3Tmp, 'kaola-workflow', 'test-project', 'workflow-state.md'),
          '# Kaola-Workflow State\nsession_id: owner-session\n');
        execFileSync('git', ['add', 'kaola-workflow/test-project/workflow-state.md'], { cwd: rf3Tmp });

        // Run hook: no KAOLA_KERNEL_SESSION_SKIP so derive-session returns empty (no Claude ancestor in test subprocess)
        // With KAOLA_ENFORCE_PLATFORM_SESSION=1 and empty derive-session, must exit 2 (blocked)
        const rRf3 = spawnSync('bash', [hookPath], {
          cwd: rf3Tmp,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: rf3Tmp,
            KAOLA_WORKFLOW_OFFLINE: '1',
            KAOLA_ENFORCE_PLATFORM_SESSION: '1',
            KAOLA_SESSION_ID: 'some-session'
          }
        });
        assert(rRf3.status === 2,
          'review-fix-3: pre-commit hook must exit 2 (blocked) when derive-session empty under enforcement, got ' + rRf3.status +
          '\nstderr: ' + rRf3.stderr);
        assert(rRf3.stderr.includes('BLOCKED'),
          'review-fix-3: stderr must contain BLOCKED, got: ' + rRf3.stderr);
        assert(rRf3.stderr.includes('derive-session returned no identity'),
          'review-fix-3: stderr must include enforcement-specific message "derive-session returned no identity", got: ' + rRf3.stderr);
      } finally {
        fs.rmSync(rf3Tmp, { recursive: true, force: true });
      }
    }

    // 8N-task-security-fix-1: structural test — every KAOLA_KERNEL_SESSION_SKIP check must use strict '1' form
    {
      const claimContent = fs.readFileSync(path.join(root, 'scripts', 'kaola-workflow-claim.js'), 'utf8');
      const lines = claimContent.split('\n');
      const badLines = lines.filter(line => {
        if (!line.includes('KAOLA_KERNEL_SESSION_SKIP')) return false;
        // Reject lines using truthy check: !process.env.KAOLA_KERNEL_SESSION_SKIP (without === '1')
        // or process.env.KAOLA_KERNEL_SESSION_SKIP without strict comparison
        if (line.includes('!process.env.KAOLA_KERNEL_SESSION_SKIP')) return true;
        // Must contain === '1' or !== '1' (strict comparison)
        if (!line.includes("=== '1'") && !line.includes("!== '1'")) return true;
        return false;
      });
      assert(badLines.length === 0,
        'security-fix-1: all KAOLA_KERNEL_SESSION_SKIP checks must use strict === \'1\' or !== \'1\' comparison. Bad lines:\n' +
        badLines.map(l => '  ' + l.trim()).join('\n'));
    }

    // 8N-task-security-fix-2: isSafeName validation rejects malformed SID containing newline
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
      const sf2Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-sf2-'));
      try {
        const fakePid = process.pid;
        const startStr = execFileSync('ps', ['-o', 'lstart=', '-p', String(fakePid)], { encoding: 'utf8' }).trim();
        const runtimeDir = path.join(sf2Tmp, 'kaola-workflow', '.runtime');
        fs.mkdirSync(runtimeDir, { recursive: true });
        const identPath = path.join(runtimeDir, fakePid + '.identity');
        // SID contains a newline — must fail isSafeName validation
        const malformedSid = 'bad\ninjection';
        fs.writeFileSync(identPath, JSON.stringify({
          sid: malformedSid,
          claude_pid: fakePid,
          claude_start_time_str: startStr,
          runtime: 'claude',
          written_at: Date.now()
        }) + '\n', { mode: 0o600 });

        const rSf2 = spawnSync(process.execPath, [claimScript, 'derive-session'], {
          encoding: 'utf8',
          env: {
            ...process.env,
            KAOLA_COORD_ROOT: sf2Tmp,
            KAOLA_KERNEL_SESSION_FAKE_PID: String(fakePid),
            KAOLA_WORKFLOW_OFFLINE: '1'
          }
        });
        // Invalid SID must be rejected: either empty stdout or non-zero exit
        const stdoutTrimmed = rSf2.stdout.trim();
        assert(
          rSf2.status !== 0 || stdoutTrimmed === '' || !stdoutTrimmed.includes('bad'),
          'security-fix-2: derive-session must reject malformed SID containing newline, got status=' +
          rSf2.status + ' stdout=' + JSON.stringify(rSf2.stdout)
        );
        // Specifically: must NOT output the newline-containing SID
        assert(
          !stdoutTrimmed.includes('bad\ninjection') && !stdoutTrimmed.includes('bad'),
          'security-fix-2: output must not contain the malformed SID, got: ' + JSON.stringify(rSf2.stdout)
        );
      } finally {
        fs.rmSync(sf2Tmp, { recursive: true, force: true });
      }
    }

    // Gap3-B: synthetic session sweep — isSyntheticTestSession predicate
    {
      const sweepTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-sweep-'));
      try {
        const locksDir = path.join(sweepTmp, 'kaola-workflow', '.locks');
        fs.mkdirSync(locksDir, { recursive: true });
        // Synthetic session (non-UUID4) — should be swept
        const syntheticLock = { project: 'proj-synthetic', session_id: 'synthetic-test-sid',
          machine_id: 'm1', claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          last_heartbeat: new Date().toISOString(), issue_number: null, claim_comment_id: null, sink: 'merge' };
        fs.writeFileSync(path.join(locksDir, 'proj-synthetic.lock'), JSON.stringify(syntheticLock, null, 2) + '\n');
        // Real UUID4 session with fresh timestamps — must NOT be swept
        const realSid = '12345678-1234-4234-89ab-123456789abc';
        const realLock = { project: 'proj-real', session_id: realSid, machine_id: 'm1',
          claimed_at: new Date().toISOString(), expires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          last_heartbeat: new Date().toISOString(), issue_number: null, claim_comment_id: null, sink: 'merge' };
        fs.writeFileSync(path.join(locksDir, 'proj-real.lock'), JSON.stringify(realLock, null, 2) + '\n');
        const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
        spawnSync(process.execPath, [claimScript, 'sweep'], {
          encoding: 'utf8', cwd: sweepTmp,
          env: { ...process.env, HOME: sweepTmp, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_COORD_ROOT: sweepTmp }
        });
        assert(!fs.existsSync(path.join(locksDir, 'proj-synthetic.lock')), 'Gap3-B: synthetic-session lock must be swept');
        assert(fs.existsSync(path.join(locksDir, 'proj-real.lock')), 'Gap3-B: UUID4-session lock with fresh timestamps must NOT be swept');
      } finally {
        fs.rmSync(sweepTmp, { recursive: true, force: true });
      }
    }

    // Gap1+2 structural assertions: verify phase files contain required patterns
    {
      const phase6Path = path.join(root, 'commands', 'kaola-workflow-phase6.md');
      const skillPath = path.join(root, 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-finalize', 'SKILL.md');
      for (const [label, filePath] of [['phase6.md', phase6Path], ['SKILL.md', skillPath]]) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert(content.includes('ACTIVE_WORKTREE_PATH='), label + ': must contain ACTIVE_WORKTREE_PATH= assignment');
        assert(content.includes('Mirror MUST run after'), label + ': must contain Mirror MUST run after comment');
        assert(content.includes('git -C "$ACTIVE_WORKTREE_PATH"'), label + ': must contain git -C "$ACTIVE_WORKTREE_PATH"');
      }
    }

    // Issue-34-A: cmdFinalize archives and writes status:closed
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
      const finalizeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-finalize-'));
      try {
        const locksDir34a = path.join(finalizeTmp, 'kaola-workflow', '.locks');
        const projDir34a = path.join(finalizeTmp, 'kaola-workflow', 'test-proj');
        fs.mkdirSync(locksDir34a, { recursive: true });
        fs.mkdirSync(projDir34a, { recursive: true });

        // Write workflow-state.md
        fs.writeFileSync(path.join(projDir34a, 'workflow-state.md'),
          '# Kaola-Workflow State\n\nstatus: active\nstep: plan\n');

        // Write lock file owned by test-session-a
        const lockData34a = {
          project: 'test-proj',
          session_id: 'test-session-a',
          machine_id: 'm1',
          claimed_at: new Date().toISOString(),
          expires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          last_heartbeat: new Date().toISOString(),
          issue_number: null,
          claim_comment_id: null,
          sink: 'merge'
        };
        fs.writeFileSync(path.join(locksDir34a, 'test-proj.lock'), JSON.stringify(lockData34a, null, 2) + '\n');

        // Run finalize
        const finalizeOut = execFileSync(process.execPath, [
          claimScript, 'finalize', '--project', 'test-proj', '--session', 'test-session-a'
        ], {
          cwd: finalizeTmp,
          encoding: 'utf8',
          env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_COORD_ROOT: finalizeTmp }
        });

        // Assert 1: archive/test-proj/workflow-state.md exists with status:closed and step:complete
        const archivedState34a = path.join(finalizeTmp, 'kaola-workflow', 'archive', 'test-proj', 'workflow-state.md');
        assert(fs.existsSync(archivedState34a), '34-A: archive/test-proj/workflow-state.md must exist');
        const archivedContent34a = fs.readFileSync(archivedState34a, 'utf8');
        assert(archivedContent34a.includes('status: closed'), '34-A: archived state must contain status: closed');
        assert(archivedContent34a.includes('step: complete'), '34-A: archived state must contain step: complete');

        // Assert 2: kaola-workflow/test-proj/ does NOT exist
        assert(!fs.existsSync(projDir34a), '34-A: kaola-workflow/test-proj/ must not exist after finalize');
        assert(fs.existsSync(path.join(locksDir34a, 'test-proj.lock')), '34-A: lock file must survive finalize (required for idempotency check)');

        // Assert 3: stdout JSON has archived: true
        const finalizeJson34a = JSON.parse(finalizeOut.trim());
        assert(finalizeJson34a.archived === true, '34-A: stdout JSON must have archived: true');

        // Sub-case: already done (source missing) → exit 0, stdout has {already: true}
        // Lock file still exists, project dir is gone — this is the "already done" state
        const finalizeOut2 = execFileSync(process.execPath, [
          claimScript, 'finalize', '--project', 'test-proj', '--session', 'test-session-a'
        ], {
          cwd: finalizeTmp,
          encoding: 'utf8',
          env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_COORD_ROOT: finalizeTmp }
        });
        const finalizeJson2 = JSON.parse(finalizeOut2.trim());
        assert(finalizeJson2.already === true, '34-A already-done: stdout must have {already: true}');

        // Sub-case: wrong session → exit non-zero
        // Re-create project dir and lock for wrong session test
        fs.mkdirSync(projDir34a, { recursive: true });
        fs.writeFileSync(path.join(projDir34a, 'workflow-state.md'),
          '# Kaola-Workflow State\n\nstatus: active\nstep: plan\n');
        // Lock is still owned by test-session-a (from earlier write); try with wrong session
        let wrongSessionExit = 0;
        try {
          execFileSync(process.execPath, [
            claimScript, 'finalize', '--project', 'test-proj', '--session', 'wrong-session-z'
          ], {
            cwd: finalizeTmp,
            encoding: 'utf8',
            env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_COORD_ROOT: finalizeTmp }
          });
        } catch (e) {
          wrongSessionExit = e.status || 1;
        }
        assert(wrongSessionExit !== 0, '34-A wrong-session: must exit non-zero, got ' + wrongSessionExit);

      } finally {
        fs.rmSync(finalizeTmp, { recursive: true, force: true });
      }
    }

    // Issue-34-B: sweep second pass GC
    {
      const claimScript = path.join(root, 'scripts/kaola-workflow-claim.js');
      const sweepTmp34b = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-sweep34b-'));
      try {
        const locksDir34b = path.join(sweepTmp34b, 'kaola-workflow', '.locks');
        fs.mkdirSync(locksDir34b, { recursive: true });

        // orphan-proj: status:active, expires 31min ago, no lock file, only workflow-state.md
        const orphanDir = path.join(sweepTmp34b, 'kaola-workflow', 'orphan-proj');
        fs.mkdirSync(orphanDir, { recursive: true });
        fs.writeFileSync(path.join(orphanDir, 'workflow-state.md'),
          '# Kaola-Workflow State\n\nstatus: active\nexpires: ' +
          new Date(Date.now() - 31 * 60 * 1000).toISOString() + '\n');

        // live-proj: status:active, expires 30min future, no lock
        const liveDir = path.join(sweepTmp34b, 'kaola-workflow', 'live-proj');
        fs.mkdirSync(liveDir, { recursive: true });
        fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
          '# Kaola-Workflow State\n\nstatus: active\nexpires: ' +
          new Date(Date.now() + 30 * 60 * 1000).toISOString() + '\n');

        // in-flight-proj: status:active, expires 31min ago, no lock, has phase1-research.md
        const inflightDir = path.join(sweepTmp34b, 'kaola-workflow', 'in-flight-proj');
        fs.mkdirSync(inflightDir, { recursive: true });
        fs.writeFileSync(path.join(inflightDir, 'workflow-state.md'),
          '# Kaola-Workflow State\n\nstatus: active\nexpires: ' +
          new Date(Date.now() - 31 * 60 * 1000).toISOString() + '\n');
        fs.writeFileSync(path.join(inflightDir, 'phase1-research.md'), '# Phase 1\n');

        // Run sweep
        execFileSync(process.execPath, [claimScript, 'sweep'], {
          cwd: sweepTmp34b,
          encoding: 'utf8',
          env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_COORD_ROOT: sweepTmp34b }
        });

        // Assert 1: archive/orphan-proj/workflow-state.md exists with status: abandoned
        const archivedOrphan = path.join(sweepTmp34b, 'kaola-workflow', 'archive', 'orphan-proj', 'workflow-state.md');
        assert(fs.existsSync(archivedOrphan), '34-B: archive/orphan-proj/workflow-state.md must exist');
        const orphanContent = fs.readFileSync(archivedOrphan, 'utf8');
        assert(orphanContent.includes('status: abandoned'), '34-B: orphan archived state must contain status: abandoned');
        assert(orphanContent.includes('step: complete'), '34-B: orphan archived state must contain step: complete');

        // Assert 2: kaola-workflow/orphan-proj/ does NOT exist
        assert(!fs.existsSync(orphanDir), '34-B: kaola-workflow/orphan-proj/ must not exist after sweep');

        // Assert 3: kaola-workflow/live-proj/ still exists
        assert(fs.existsSync(liveDir), '34-B: kaola-workflow/live-proj/ must still exist (not expired)');

        // Assert 4: kaola-workflow/in-flight-proj/ still exists (phase-artifacts-empty guard)
        assert(fs.existsSync(inflightDir), '34-B: kaola-workflow/in-flight-proj/ must still exist (has phase artifacts)');

      } finally {
        fs.rmSync(sweepTmp34b, { recursive: true, force: true });
      }
    }

    // Issue-34-C: structural check — finalize invocation in docs
    {
      const phase6Path = path.join(root, 'commands', 'kaola-workflow-phase6.md');
      const skillPath = path.join(root, 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-finalize', 'SKILL.md');
      for (const [label, filePath] of [['phase6.md', phase6Path], ['SKILL.md', skillPath]]) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert(content.includes('finalize'), label + ' 34-C: must contain "finalize"');
        const step8bIdx = content.indexOf('Step 8b');
        const commitIdx = content.indexOf('git -C "$ACTIVE_WORKTREE_PATH" add');
        assert(step8bIdx !== -1, label + ' 34-C: must contain "Step 8b"');
        assert(commitIdx !== -1, label + ' 34-C: must contain git -C add line');
        assert(step8bIdx < commitIdx, label + ' 34-C: Step 8b must appear before the git add commit gate');
      }
    }

    // Epic Case 17: Worktree-native subcommands (pick-next, resume, worktree-status, worktree-finalize)
    {
      const epic17Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic17-'));
      try {
        execFileSync('git', ['init', '-b', 'main'], { cwd: epic17Tmp, encoding: 'utf8' });
        execFileSync('git', ['-C', epic17Tmp, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });

        // Create kaola-workflow/ dir (needed for ROADMAP.md offline fallback and artifact copy)
        fs.mkdirSync(path.join(epic17Tmp, 'kaola-workflow'), { recursive: true });

        // gh shim: issue list returns issue 701
        const binDir17 = path.join(epic17Tmp, 'bin');
        fs.mkdirSync(binDir17, { recursive: true });
        const ghShim17 = path.join(binDir17, 'gh');
        fs.writeFileSync(ghShim17, [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'if (args[0]==="issue"&&args[1]==="list") { process.stdout.write(JSON.stringify([{number:701,title:"worktree-native",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/701"}])+"\\n"); process.exit(0); }',
          'if (args[0]==="issue"&&args[1]==="edit") { process.exit(0); }',
          'if (args[0]==="issue"&&args[1]==="view") { process.stdout.write(JSON.stringify({state:"open",number:701,title:"worktree-native",labels:[],assignees:[],url:"https://github.com/test/repo/issues/701"})+"\\n"); process.exit(0); }',
          'process.exit(0);'
        ].join('\n'), { mode: 0o755 });

        const pathSep = process.platform === 'win32' ? ';' : ':';
        const env17 = { ...process.env, PATH: binDir17 + pathSep + process.env.PATH };
        const env17Offline = { ...env17, KAOLA_WORKFLOW_OFFLINE: '1' };
        const claimJS = path.join(root, 'scripts/kaola-workflow-claim.js');

        // 17A: pick-next acquires issue 701 when explicitly targeted by agent
        const pickOut17a = execFileSync(process.execPath, [claimJS, 'pick-next',
          '--session', 'sess-epic17', '--runtime', 'claude', '--target-issue', '701'],
          { cwd: epic17Tmp, encoding: 'utf8', env: env17 });
        const pick17a = JSON.parse(pickOut17a.trim());
        assert(pick17a.verdict === 'acquired', '17A: verdict must be acquired, got ' + JSON.stringify(pick17a));
        assert(pick17a.issue === 701, '17A: issue must be 701, got ' + pick17a.issue);
        assert(pick17a.branch && pick17a.branch.startsWith('workflow/'),
          '17A: branch must start with workflow/, got ' + pick17a.branch);
        assert(fs.existsSync(pick17a.worktree_path),
          '17A: worktree_path must exist on disk: ' + pick17a.worktree_path);

        // 17B: second pick-next by the same session returns 'owned' — the owned-check short-circuits
        // before issue selection, correctly reflecting that sess-epic17 already holds issue-701.
        // (Pre-B6 this returned 'none' via branch dedup; post-B6 the owned-check takes precedence.)
        fs.writeFileSync(path.join(epic17Tmp, 'kaola-workflow', 'ROADMAP.md'), '## Open Issues\n- #701 worktree-native\n');
        const pickOut17b = execFileSync(process.execPath, [claimJS, 'pick-next',
          '--session', 'sess-epic17', '--runtime', 'claude'],
          { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
        const pick17b = JSON.parse(pickOut17b.trim());
        assert(pick17b.verdict === 'owned', '17B: second pick-next by same session must return owned (owned-check), got ' + JSON.stringify(pick17b));
        assert(pick17b.project === 'issue-701', '17B: project must be issue-701, got ' + pick17b.project);

        // 17C: worktree-status lists the worktree
        const statusOut17c = execFileSync(process.execPath, [claimJS, 'worktree-status'],
          { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
        const status17c = JSON.parse(statusOut17c.trim());
        assert(Array.isArray(status17c) && status17c.length >= 1,
          '17C: worktree-status must return array with at least 1 entry, got ' + JSON.stringify(status17c));
        const entry17c = status17c.find(e => e.branch === pick17a.branch);
        assert(entry17c, '17C: worktree-status must have entry for ' + pick17a.branch);
        assert(entry17c.worktree_path === pick17a.worktree_path,
          '17C: worktree_path must match pick-next output');

        // 17D: resume with no phase artifacts routes to phase1
        const resumeOut17d = execFileSync(process.execPath, [claimJS, 'resume',
          '--project', pick17a.project],
          { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
        const resume17d = JSON.parse(resumeOut17d.trim());
        assert(resume17d.resumed === true, '17D: resume must return resumed:true, got ' + JSON.stringify(resume17d));
        assert(resume17d.next_command && resume17d.next_command.includes('phase1'),
          '17D: next_command must include phase1, got ' + resume17d.next_command);

        // 17E: resume with phase3-plan.md present routes to phase4
        const projDir17e = path.join(epic17Tmp, 'kaola-workflow', pick17a.project);
        fs.mkdirSync(projDir17e, { recursive: true });
        fs.writeFileSync(path.join(projDir17e, 'phase3-plan.md'), '# Phase 3\n');
        const resumeOut17e = execFileSync(process.execPath, [claimJS, 'resume',
          '--project', pick17a.project],
          { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
        const resume17e = JSON.parse(resumeOut17e.trim());
        assert(resume17e.next_command && resume17e.next_command.includes('phase4'),
          '17E: next_command must include phase4, got ' + resume17e.next_command);

        // 17F setup: write artifacts and configure git identity for commit tests
        // Write a second artifact so the copy has something to sync
        fs.writeFileSync(path.join(projDir17e, 'workflow-state.md'), '# state\n');
        // Git identity needed for commit
        execFileSync('git', ['-C', epic17Tmp, 'config', 'user.email', 'test@test.com'], { encoding: 'utf8' });
        execFileSync('git', ['-C', epic17Tmp, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
        // Configure git identity in the issue worktree too
        execFileSync('git', ['-C', pick17a.worktree_path, 'config', 'user.email', 'test@test.com'], { encoding: 'utf8' });
        execFileSync('git', ['-C', pick17a.worktree_path, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
        // Give the worktree branch an initial commit (required for git add + commit)
        execFileSync('git', ['-C', pick17a.worktree_path, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });

        // Case 17K: COORD_ROOT resolved correctly from inside issue worktree
        // (runs before 17F terminal cleanup so the worktree is still alive)
        const coordRootFromWT = execFileSync('bash', ['-c',
          'git worktree list --porcelain | awk \'/^worktree /{print substr($0,10); exit}\''
        ], { cwd: pick17a.worktree_path, encoding: 'utf8' }).trim();
        assert(coordRootFromWT === fs.realpathSync(epic17Tmp),
          '17K: COORD_ROOT from inside worktree should be main repo root, got ' + coordRootFromWT +
          ' expected ' + fs.realpathSync(epic17Tmp));

        // 17G: resume without --project on main branch returns resumed:false
        {
          const resumeOut17g = execFileSync(process.execPath, [claimJS, 'resume'],
            { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
          const resume17g = JSON.parse(resumeOut17g.trim());
          assert(resume17g.resumed === false,
            '17G: resume with no workflow branch must return resumed:false, got ' + JSON.stringify(resume17g));
          assert(resume17g.reason === 'cannot determine project',
            '17G: reason must be cannot determine project, got ' + resume17g.reason);
        }

        // 17H: worktree-finalize with no provisioned worktree exits non-zero
        {
          let threw17h = false;
          try {
            execFileSync(process.execPath,
              [claimJS, 'worktree-finalize', '--project', 'issue-999'],
              { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline, stdio: ['ignore', 'pipe', 'pipe'] });
          } catch (_) {
            threw17h = true;
          }
          assert(threw17h, '17H: worktree-finalize with no provisioned worktree must throw');
        }

        // Case 17L: verify-startup authorized after pick-next
        // (runs before 17I/17J/17M so the project dir is not yet archived by any successful finalize)
        {
          // Compute coordRoot the same way the production code does:
          // git rev-parse --git-common-dir (relative), resolved against root
          const gitCommonDir17l = execFileSync('git', ['rev-parse', '--git-common-dir'],
            { cwd: epic17Tmp, encoding: 'utf8' }).trim();
          const coordRoot17l = path.resolve(epic17Tmp, gitCommonDir17l);
          // Read lock written by pick-next — this is the ground truth for the 24h expiry check.
          // (The 17F setup step overwrote workflow-state.md with '# state\n', so we source
          // expiry data from the lock file rather than the state file to avoid circular assertions.)
          const lockFile17l = path.join(coordRoot17l, 'kaola-workflow', '.locks', pick17a.project + '.lock');
          const lockData17l = JSON.parse(fs.readFileSync(lockFile17l, 'utf8'));

          // Run verify-startup — should return authorized:true because pick-next wrote the startup receipt
          const verifyOut17l = execFileSync(process.execPath,
            [claimJS, 'verify-startup', '--session', 'sess-epic17', '--project', pick17a.project],
            { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
          const verify17l = JSON.parse(verifyOut17l.trim());
          assert(verify17l.authorized === true,
            '17L: verify-startup must return authorized:true, got ' + JSON.stringify(verify17l));

          // workflow-state.md must exist (pick-next creates it; 17F setup clobbered content but not existence)
          const stateFile17l = path.join(epic17Tmp, 'kaola-workflow', pick17a.project, 'workflow-state.md');
          assert(fs.existsSync(stateFile17l),
            '17L: workflow-state.md must exist at ' + stateFile17l);

          // Lock must have expires > 20h from now — verifies pick-next set the 24h lease
          const expiresTs17l = new Date(lockData17l.expires).getTime();
          assert(expiresTs17l > Date.now() + 20 * 60 * 60 * 1000,
            '17L: lock expires must be more than 20h from now (24h lease set by pick-next), got ' + lockData17l.expires);
        }

        // 17I: worktree-finalize with staged uncommitted file in kaola-workflow/{project}/ errors
        {
          const dirtyFile = path.join(pick17a.worktree_path, 'kaola-workflow', pick17a.project, 'dirty-staged.md');
          fs.mkdirSync(path.dirname(dirtyFile), { recursive: true });
          fs.writeFileSync(dirtyFile, '# dirty\n');
          execFileSync('git', ['-C', pick17a.worktree_path, 'add',
            'kaola-workflow/' + pick17a.project + '/dirty-staged.md'], { encoding: 'utf8' });
          let threw17i = false;
          try {
            execFileSync(process.execPath,
              [claimJS, 'worktree-finalize', '--project', pick17a.project],
              { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline, stdio: ['ignore', 'pipe', 'pipe'] });
          } catch (_) {
            threw17i = true;
          }
          assert(threw17i, '17I: worktree-finalize with staged changes must throw');
          // Restore clean state for 17J
          execFileSync('git', ['-C', pick17a.worktree_path, 'restore', '--staged',
            'kaola-workflow/' + pick17a.project + '/dirty-staged.md'], { encoding: 'utf8' });
          fs.rmSync(dirtyFile, { force: true });
        }

        // 17J: worktree-finalize with new main-worktree artifact changes HEAD SHA
        // cwd is pick17a.worktree_path so removeWorktree defers (CWD inside worktree),
        // allowing the worktree to remain alive for 17M and 17F terminal cleanup.
        // archiveProjectDir runs and archives kaola-workflow/{project}/ to archive/.
        {
          const headBefore17j = execFileSync('git', ['-C', pick17a.worktree_path, 'rev-parse', 'HEAD'],
            { encoding: 'utf8' }).trim();
          fs.writeFileSync(path.join(projDir17e, 'phase4-progress.md'), '# Phase 4\n');
          const finalizeOut17j = execFileSync(process.execPath,
            [claimJS, 'worktree-finalize', '--project', pick17a.project],
            { cwd: pick17a.worktree_path, encoding: 'utf8', env: env17Offline });
          JSON.parse(finalizeOut17j.trim()); // must be valid JSON
          const headAfter17j = execFileSync('git', ['-C', pick17a.worktree_path, 'rev-parse', 'HEAD'],
            { encoding: 'utf8' }).trim();
          assert(headBefore17j !== headAfter17j,
            '17J: HEAD must change after finalize with new artifact');
        }

        // 17M: worktree-finalize called with cwd INSIDE the linked worktree
        // projDir17e was archived by 17J; recreate it with a fresh artifact before running.
        // archiveProjectDir is idempotent on a fresh src dir, so 17M archives the recreated dir.
        {
          fs.mkdirSync(projDir17e, { recursive: true });
          fs.writeFileSync(path.join(projDir17e, 'phase3-plan.md'), '# Phase 3 M\n');
          const finalizeOut17m = execFileSync(process.execPath,
            [claimJS, 'worktree-finalize', '--project', pick17a.project],
            { cwd: pick17a.worktree_path, encoding: 'utf8', env: env17Offline });
          const result17m = JSON.parse(finalizeOut17m.trim());
          assert(result17m.verdict === 'finalized',
            '17M: verdict must be finalized, got ' + JSON.stringify(result17m));
          assert(!result17m.worktree_path.includes('.kw.kw/'),
            '17M: worktree_path must not contain double-nested .kw.kw/, got ' + result17m.worktree_path);
        }

        // 17F: worktree-finalize terminal cleanup — archives project dir, removes worktree
        // 17K/17G/17H/17L/17I/17J/17M all ran with worktree alive; 17F runs from main cwd to
        // trigger actual worktree removal (not deferred). projDir17e was archived by 17M so we
        // recreate it with a sentinel artifact before finalize (commitWorktreeArtifacts needs srcDir).
        // archiveProjectDir archives the recreated dir; removeWorktree actually removes the worktree.
        {
          fs.mkdirSync(projDir17e, { recursive: true });
          fs.writeFileSync(path.join(projDir17e, 'phase3-plan.md'), '# Phase 3 final\n');
          const finalizeOut17f = execFileSync(process.execPath, [claimJS, 'worktree-finalize',
            '--project', pick17a.project],
            { cwd: epic17Tmp, encoding: 'utf8', env: env17Offline });
          const finalize17f = JSON.parse(finalizeOut17f.trim());
          assert(finalize17f.verdict === 'finalized', '17F: verdict must be finalized, got ' + JSON.stringify(finalize17f));
          // Assert phase3-plan.md was committed to the worktree branch by 17M (verifiable via git even after worktree removal)
          const showOut17f = execFileSync('git', ['-C', epic17Tmp, 'show',
            finalize17f.branch + ':kaola-workflow/' + pick17a.project + '/phase3-plan.md'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
          assert(showOut17f.trim().length > 0,
            '17F: phase3-plan.md must be committed to worktree branch after finalize');
          // E14: assert cleanup was attempted (removal field present and valid)
          assert(finalize17f.removal === 'removed' || finalize17f.removal === 'deferred',
            '17F: removal must be removed or deferred, got ' + finalize17f.removal);
          // E14: assert archive directory exists (17J archived project dir into archive/)
          const archiveDir17f = path.join(epic17Tmp, 'kaola-workflow', 'archive', pick17a.project);
          assert(fs.existsSync(archiveDir17f) || finalize17f.removal === 'deferred',
            '17F: archive dir must exist or removal must be deferred, archive path: ' + archiveDir17f);
        }

        // Case 17N: sweep GCs an expired pick-next worktree lock
        // (lock file survives 17F since worktree-finalize omits --session, so releaseSession is not called)
        {
          // coordRoot is computed the same way as production code
          const gitCommonDir17n = execFileSync('git', ['rev-parse', '--git-common-dir'],
            { cwd: epic17Tmp, encoding: 'utf8' }).trim();
          const coordRoot17n = path.resolve(epic17Tmp, gitCommonDir17n);
          const lockPath17n = path.join(coordRoot17n, 'kaola-workflow', '.locks', pick17a.project + '.lock');
          const lockJson17n = JSON.parse(fs.readFileSync(lockPath17n, 'utf8'));
          // Mark as synthetic so sweep GCs it unconditionally (non-synthetic sessions require
          // both shouldSweep and isRemoteStale, which cannot be satisfied in the test env)
          const expiredLock17n = Object.assign({}, lockJson17n, {
            session_id: 'synthetic-expired-17n',
            expires: new Date(Date.now() - 60 * 60 * 1000).toISOString()
          });
          fs.writeFileSync(lockPath17n, JSON.stringify(expiredLock17n, null, 2) + '\n', { mode: 0o600 });

          // Run sweep ONLINE (env17, no OFFLINE flag) so sweep's GC pass runs
          execFileSync(process.execPath, [claimJS, 'sweep'],
            { cwd: epic17Tmp, encoding: 'utf8', env: env17 });

          assert(!fs.existsSync(lockPath17n),
            '17N: sweep must GC the expired synthetic lock, but lock file still exists at ' + lockPath17n);
        }

        // 17P: cmdStatus CLOSED issue → drift has 'issue closed'
        {
          const tmp17p = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17p-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17p, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17p, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            const bin17p = path.join(tmp17p, 'bin');
            fs.mkdirSync(bin17p);
            fs.writeFileSync(path.join(bin17p, 'gh'), [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="view") { process.stdout.write(JSON.stringify({state:"CLOSED",number:811,labels:[],assignees:[],title:"closed-test",url:""})+"\\n"); process.exit(0); }',
              'process.exit(0);'
            ].join('\n'), { mode: 0o755 });
            const pathSep17p = process.platform === 'win32' ? ';' : ':';
            const env17p = { ...process.env, PATH: bin17p + pathSep17p + process.env.PATH };
            const gcd17p = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd: tmp17p, encoding: 'utf8' }).trim();
            const coordRoot17p = path.resolve(tmp17p, gcd17p);
            const locksDir17p = path.join(coordRoot17p, 'kaola-workflow', '.locks');
            fs.mkdirSync(locksDir17p, { recursive: true });
            const lock17p = { project: 'issue-811', issue_number: 811, session_id: 'sess-17p', branch: 'workflow/issue-811', expires: new Date(Date.now() + 86400000).toISOString(), worktree_path: null };
            fs.writeFileSync(path.join(locksDir17p, 'issue-811.lock'), JSON.stringify(lock17p, null, 2) + '\n', { mode: 0o600 });
            const statusOut17p = execFileSync(process.execPath, [claimJS, 'status', '--session', 'sess-17p'],
              { cwd: tmp17p, encoding: 'utf8', env: env17p });
            const status17p = JSON.parse(statusOut17p.trim());
            assert(Array.isArray(status17p) && status17p.length >= 1, '17P: status must return array with entries');
            const entry17p = status17p.find(e => e.lock && e.lock.project === 'issue-811');
            assert(entry17p, '17P: must have entry for issue-811');
            assert(Array.isArray(entry17p.drift) && entry17p.drift.includes('issue closed'),
              '17P: drift must contain "issue closed" for CLOSED issue, got ' + JSON.stringify(entry17p.drift));
          } finally {
            try { fs.rmSync(tmp17p, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17Q1: cmdWorktreeStatus CLOSED issue → entry has closed: true
        {
          const tmp17q1 = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17q1-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17q1, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17q1, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            const bin17q1Open = path.join(tmp17q1, 'bin-open');
            const bin17q1Closed = path.join(tmp17q1, 'bin-closed');
            fs.mkdirSync(bin17q1Open);
            fs.mkdirSync(bin17q1Closed);
            const pathSep17q1 = process.platform === 'win32' ? ';' : ':';
            // gh shim: issue 812 is OPEN (for pick-next)
            fs.writeFileSync(path.join(bin17q1Open, 'gh'), [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="list") { process.stdout.write(JSON.stringify([{number:812,title:"open-wt",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:""}])+"\\n"); process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="view") { process.stdout.write(JSON.stringify({state:"open",number:812,labels:[],assignees:[],title:"open-wt",url:""})+"\\n"); process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="edit") { process.exit(0); }',
              'process.exit(0);'
            ].join('\n'), { mode: 0o755 });
            // gh shim: issue 812 is CLOSED (for worktree-status)
            fs.writeFileSync(path.join(bin17q1Closed, 'gh'), [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="view") { process.stdout.write(JSON.stringify({state:"CLOSED",number:812,labels:[],assignees:[],title:"closed-wt",url:""})+"\\n"); process.exit(0); }',
              'process.exit(0);'
            ].join('\n'), { mode: 0o755 });
            const envOpen17q1 = { ...process.env, PATH: bin17q1Open + pathSep17q1 + process.env.PATH };
            const envClosed17q1 = { ...process.env, PATH: bin17q1Closed + pathSep17q1 + process.env.PATH };
            // First claim while issue is OPEN
            const pickOut17q1 = execFileSync(process.execPath, [claimJS, 'pick-next',
              '--session', 'sess-17q1', '--runtime', 'claude', '--target-issue', '812'],
              { cwd: tmp17q1, encoding: 'utf8', env: envOpen17q1 });
            const pick17q1 = JSON.parse(pickOut17q1.trim());
            assert(pick17q1.verdict === 'acquired', '17Q1: pick-next must acquire issue 812, got ' + JSON.stringify(pick17q1));
            // Now run worktree-status with CLOSED gh shim
            const wsOut17q1 = execFileSync(process.execPath, [claimJS, 'worktree-status'],
              { cwd: tmp17q1, encoding: 'utf8', env: envClosed17q1 });
            const ws17q1 = JSON.parse(wsOut17q1.trim());
            assert(Array.isArray(ws17q1), '17Q1: worktree-status must return array');
            const wt17q1 = ws17q1.find(e => e.branch && e.branch.includes('812'));
            assert(wt17q1, '17Q1: must have entry for issue-812 worktree');
            assert(wt17q1.closed === true, '17Q1: entry must have closed:true for CLOSED issue, got closed=' + wt17q1.closed);
          } finally {
            try {
              execFileSync('git', ['-C', tmp17q1, 'worktree', 'prune'], { encoding: 'utf8', stdio: 'ignore' });
            } catch (_) {}
            try { fs.rmSync(path.join(path.dirname(tmp17q1), path.basename(tmp17q1) + '.kw'), { recursive: true, force: true }); } catch (_) {}
            try { fs.rmSync(tmp17q1, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17Q2: cmdWorktreeStatus unregistered dir in *.kw/ → entry with registered:false
        {
          const tmp17q2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17q2-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17q2, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17q2, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            // Manually create an unregistered dir in the *.kw/ parent
            const kwParent17q2 = path.join(path.dirname(tmp17q2), path.basename(tmp17q2) + '.kw');
            const unregDir17q2 = path.join(kwParent17q2, 'issue-999');
            fs.mkdirSync(unregDir17q2, { recursive: true });
            const wsOut17q2 = execFileSync(process.execPath, [claimJS, 'worktree-status'],
              { cwd: tmp17q2, encoding: 'utf8', env: env17Offline });
            const ws17q2 = JSON.parse(wsOut17q2.trim());
            assert(Array.isArray(ws17q2), '17Q2: worktree-status must return array');
            const unreg17q2 = ws17q2.find(e => e.registered === false && e.worktree_path && e.worktree_path.includes('issue-999'));
            assert(unreg17q2, '17Q2: must surface unregistered issue-999 dir with registered:false, got ' + JSON.stringify(ws17q2));
          } finally {
            const kwParent17q2c = path.join(path.dirname(tmp17q2), path.basename(tmp17q2) + '.kw');
            try { fs.rmSync(kwParent17q2c, { recursive: true, force: true }); } catch (_) {}
            try { fs.rmSync(tmp17q2, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17R+: resume with pending phase4-progress.md → routes to phase4
        // 17R-: resume with all-done phase4-progress.md → routes to phase5
        {
          const tmp17r = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17r-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17r, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17r, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            const projDir17r = path.join(tmp17r, 'kaola-workflow', 'issue-713');
            fs.mkdirSync(projDir17r, { recursive: true });
            // Write phase4-progress.md with a pending row
            fs.writeFileSync(path.join(projDir17r, 'phase4-progress.md'),
              '# Phase 4\n## Tasks\n| # | Name | Status |\n|---|------|--------|\n| 1 | task1 | pending |\n');
            const resumeOut17rPlus = execFileSync(process.execPath, [claimJS, 'resume', '--project', 'issue-713'],
              { cwd: tmp17r, encoding: 'utf8', env: env17Offline });
            const resume17rPlus = JSON.parse(resumeOut17rPlus.trim());
            assert(resume17rPlus.resumed === true, '17R+: resume must return resumed:true');
            assert(resume17rPlus.next_command && resume17rPlus.next_command.includes('phase4'),
              '17R+: next_command must route to phase4 when tasks pending, got ' + resume17rPlus.next_command);
            // Now rewrite with all-done rows
            fs.writeFileSync(path.join(projDir17r, 'phase4-progress.md'),
              '# Phase 4\n## Tasks\n| # | Name | Status |\n|---|------|--------|\n| 1 | task1 | complete |\n');
            const resumeOut17rMinus = execFileSync(process.execPath, [claimJS, 'resume', '--project', 'issue-713'],
              { cwd: tmp17r, encoding: 'utf8', env: env17Offline });
            const resume17rMinus = JSON.parse(resumeOut17rMinus.trim());
            assert(resume17rMinus.resumed === true, '17R-: resume must return resumed:true');
            assert(resume17rMinus.next_command && resume17rMinus.next_command.includes('phase5'),
              '17R-: next_command must route to phase5 when all tasks done, got ' + resume17rMinus.next_command);
          } finally {
            try { fs.rmSync(tmp17r, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17S: SKILL.md static assertion — SINK_KIND= line appears before cmdFinalize node call
        {
          const skillMd17s = path.join(root, 'plugins', 'kaola-workflow', 'skills', 'kaola-workflow-finalize', 'SKILL.md');
          const skillContent17s = fs.readFileSync(skillMd17s, 'utf8');
          const lines17s = skillContent17s.split('\n');
          const sinkKindIdx = lines17s.findIndex(l => l.includes('SINK_KIND='));
          const finalizeCallIdx = lines17s.findIndex(l => l.includes('node "$CLAIM_JS" finalize') || l.includes('node "$claim_script" finalize') || (l.includes('node ') && l.includes('finalize')));
          assert(sinkKindIdx !== -1, '17S: SINK_KIND= must be found in finalize SKILL.md');
          assert(finalizeCallIdx !== -1, '17S: cmdFinalize node call must be found in finalize SKILL.md');
          assert(sinkKindIdx < finalizeCallIdx,
            '17S: SINK_KIND= (line ' + sinkKindIdx + ') must appear before cmdFinalize call (line ' + finalizeCallIdx + ')');
        }

        // 17T+: removeWorktree last sibling → parent *.kw/ removed
        // 17T-: removeWorktree with sibling → parent *.kw/ retained
        {
          const tmp17t = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17t-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17t, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17t, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17t, 'config', 'user.email', 'test@test.com'], { encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17t, 'config', 'user.name', 'Test'], { encoding: 'utf8' });
            const bin17t = path.join(tmp17t, 'bin');
            fs.mkdirSync(bin17t);
            const pathSep17t = process.platform === 'win32' ? ';' : ':';
            const makeGhShim = (issues) => [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="list") { process.stdout.write(' + JSON.stringify(JSON.stringify(issues)) + '+"\\n"); process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="edit") { process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="view") { const n=parseInt(a[2]||a[a.indexOf("--json")-1]||"0"); const f=' + JSON.stringify(issues) + '.find(i=>i.number===n)||{state:"open",number:n,labels:[],assignees:[],title:"t",url:""}; process.stdout.write(JSON.stringify(f)+"\\n"); process.exit(0); }',
              'process.exit(0);'
            ].join('\n');
            const issues17t = [{number:821,title:"t1",state:"open",labels:[{name:"area:frontend"}],assignees:[],updatedAt:"2026-01-01",url:""},{number:822,title:"t2",state:"open",labels:[{name:"area:backend"}],assignees:[],updatedAt:"2026-01-01",url:""}];
            fs.writeFileSync(path.join(bin17t, 'gh'), makeGhShim(issues17t), { mode: 0o755 });
            const env17t = { ...process.env, PATH: bin17t + pathSep17t + process.env.PATH };
            // Provision two worktrees
            const pickOut17t1 = execFileSync(process.execPath, [claimJS, 'pick-next',
              '--session', 'sess-17t1', '--runtime', 'claude', '--target-issue', '821'],
              { cwd: tmp17t, encoding: 'utf8', env: env17t });
            const pick17t1 = JSON.parse(pickOut17t1.trim());
            assert(pick17t1.verdict === 'acquired', '17T setup: must acquire issue 821');
            const pickOut17t2 = execFileSync(process.execPath, [claimJS, 'pick-next',
              '--session', 'sess-17t2', '--runtime', 'claude', '--target-issue', '822'],
              { cwd: tmp17t, encoding: 'utf8', env: env17t });
            const pick17t2 = JSON.parse(pickOut17t2.trim());
            assert(pick17t2.verdict === 'acquired', '17T setup: must acquire issue 822');
            const kwParent17t = path.dirname(pick17t1.worktree_path);
            assert(kwParent17t === path.dirname(pick17t2.worktree_path), '17T: both worktrees must share same *.kw/ parent');
            // 17T-: release first worktree — sibling still exists → parent retained
            execFileSync(process.execPath, [claimJS, 'worktree-finalize', '--project', pick17t1.project],
              { cwd: tmp17t, encoding: 'utf8', env: { ...env17t, KAOLA_WORKFLOW_OFFLINE: '1' } });
            assert(fs.existsSync(kwParent17t),
              '17T-: parent *.kw/ must be retained when sibling worktree remains, kwParent=' + kwParent17t);
            // 17T+: release second (last) worktree → parent should be removed
            execFileSync(process.execPath, [claimJS, 'worktree-finalize', '--project', pick17t2.project],
              { cwd: tmp17t, encoding: 'utf8', env: { ...env17t, KAOLA_WORKFLOW_OFFLINE: '1' } });
            assert(!fs.existsSync(kwParent17t),
              '17T+: parent *.kw/ must be removed after last worktree removed, kwParent=' + kwParent17t);
          } finally {
            const kwParent17tc = path.join(path.dirname(tmp17t), path.basename(tmp17t) + '.kw');
            try {
              execFileSync('git', ['-C', tmp17t, 'worktree', 'prune'], { encoding: 'utf8', stdio: 'ignore' });
            } catch (_) {}
            try { fs.rmSync(kwParent17tc, { recursive: true, force: true }); } catch (_) {}
            try { fs.rmSync(tmp17t, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17U: cmdSweep removes .abandoned-<old-ISO> dir but retains .abandoned-<fresh-ISO> dir
        {
          const tmp17u = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17u-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17u, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17u, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            // Use git rev-parse --show-toplevel to get the resolved root (macOS /var→/private/var)
            const resolvedRoot17u = execFileSync('git', ['rev-parse', '--show-toplevel'],
              { cwd: tmp17u, encoding: 'utf8' }).trim();
            const kwParent17u = path.join(path.dirname(resolvedRoot17u), path.basename(resolvedRoot17u) + '.kw');
            fs.mkdirSync(kwParent17u, { recursive: true });
            // Create .locks dir so cmdSweep doesn't early-exit at !fs.existsSync(dir)
            const gcd17u = execFileSync('git', ['rev-parse', '--git-common-dir'],
              { cwd: tmp17u, encoding: 'utf8' }).trim();
            const coordRoot17u = path.resolve(resolvedRoot17u, gcd17u);
            fs.mkdirSync(path.join(coordRoot17u, 'kaola-workflow', '.locks'), { recursive: true });
            // Old abandoned dir — suffix > 30min ago
            const oldTime = new Date(Date.now() - 35 * 60 * 1000);
            const oldSuffix = oldTime.toISOString().replace(/[:.]/g, '-');
            const oldAbandonedDir = path.join(kwParent17u, 'issue-831.' + 'abandoned-' + oldSuffix);
            fs.mkdirSync(oldAbandonedDir);
            // Assert parse round-trip works: parse old suffix and verify age > 30min
            const parsedOld = new Date(oldSuffix.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z')).getTime();
            assert(!isNaN(parsedOld), '17U: old suffix must parse to valid timestamp');
            assert(Date.now() - parsedOld > 30 * 60 * 1000, '17U: old suffix age must be > 30min');
            // Fresh abandoned dir — suffix < 30min ago
            const freshTime = new Date(Date.now() - 2 * 60 * 1000);
            const freshSuffix = freshTime.toISOString().replace(/[:.]/g, '-');
            const freshAbandonedDir = path.join(kwParent17u, 'issue-831.' + 'abandoned-' + freshSuffix);
            fs.mkdirSync(freshAbandonedDir);
            // Run sweep
            const bin17u = path.join(tmp17u, 'bin');
            fs.mkdirSync(bin17u);
            fs.writeFileSync(path.join(bin17u, 'gh'), '#!/usr/bin/env node\nprocess.exit(0);', { mode: 0o755 });
            const pathSep17u = process.platform === 'win32' ? ';' : ':';
            const env17u = { ...process.env, PATH: bin17u + pathSep17u + process.env.PATH };
            execFileSync(process.execPath, [claimJS, 'sweep'],
              { cwd: tmp17u, encoding: 'utf8', env: env17u });
            assert(!fs.existsSync(oldAbandonedDir),
              '17U: old abandoned dir (>30min) must be removed by sweep, path=' + oldAbandonedDir);
            assert(fs.existsSync(freshAbandonedDir),
              '17U: fresh abandoned dir (<30min) must be retained, path=' + freshAbandonedDir);
          } finally {
            // Clean up both the symlink-resolved path and the original tmp path
            try {
              const resolvedTmp17u = execFileSync('git', ['rev-parse', '--show-toplevel'],
                { cwd: tmp17u, encoding: 'utf8' }).trim();
              const kwParent17uc = path.join(path.dirname(resolvedTmp17u), path.basename(resolvedTmp17u) + '.kw');
              try { fs.rmSync(kwParent17uc, { recursive: true, force: true }); } catch (_) {}
            } catch (_) {
              const kwParent17uc = path.join(path.dirname(tmp17u), path.basename(tmp17u) + '.kw');
              try { fs.rmSync(kwParent17uc, { recursive: true, force: true }); } catch (_) {}
            }
            try { fs.rmSync(tmp17u, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17V: startup acquired receipt includes non-null worktree_path
        {
          const tmp17v = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17v-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17v, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17v, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            const bin17v = path.join(tmp17v, 'bin');
            fs.mkdirSync(bin17v);
            const pathSep17v = process.platform === 'win32' ? ';' : ':';
            fs.writeFileSync(path.join(bin17v, 'gh'), [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="list") { process.stdout.write(JSON.stringify([{number:841,title:"startup-wt",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:""}])+"\\n"); process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="edit") { process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="view") { process.stdout.write(JSON.stringify({state:"open",number:841,title:"startup-wt",labels:[],assignees:[],url:""})+"\\n"); process.exit(0); }',
              'process.exit(0);'
            ].join('\n'), { mode: 0o755 });
            const env17v = { ...process.env, PATH: bin17v + pathSep17v + process.env.PATH };
            // Use pick-next (which writes startup receipt and augments stdout with worktree_path)
            const pickOut17v = execFileSync(process.execPath, [claimJS, 'pick-next',
              '--session', 'sess-17v', '--runtime', 'claude', '--target-issue', '841'],
              { cwd: tmp17v, encoding: 'utf8', env: env17v });
            const receipt17v = JSON.parse(pickOut17v.trim());
            assert(receipt17v.verdict === 'acquired', '17V: pick-next must acquire issue 841');
            assert(typeof receipt17v.worktree_path === 'string' && receipt17v.worktree_path.length > 0,
              '17V: receipt must include non-empty worktree_path, got ' + receipt17v.worktree_path);
            assert(fs.existsSync(receipt17v.worktree_path),
              '17V: receipt.worktree_path must exist on disk: ' + receipt17v.worktree_path);
          } finally {
            const kwParent17vc = path.join(path.dirname(tmp17v), path.basename(tmp17v) + '.kw');
            try {
              execFileSync('git', ['-C', tmp17v, 'worktree', 'prune'], { encoding: 'utf8', stdio: 'ignore' });
            } catch (_) {}
            try { fs.rmSync(kwParent17vc, { recursive: true, force: true }); } catch (_) {}
            try { fs.rmSync(tmp17v, { recursive: true, force: true }); } catch (_) {}
          }
        }

        // 17W: startup owned receipt includes worktree_path read from lock file (direct startup, not pick-next)
        {
          // Positive case: lock has non-null worktree_path → receipt.worktree_path equals lock value
          const tmp17w = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17w-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17w, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17w, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            const bin17w = path.join(tmp17w, 'bin');
            fs.mkdirSync(bin17w);
            const pathSep17w = process.platform === 'win32' ? ';' : ':';
            // gh shim: fetchOpenIssueRecords runs before ownership check; return empty list to avoid classifier overhead
            fs.writeFileSync(path.join(bin17w, 'gh'), [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="list") { process.stdout.write("[]\\n"); process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="edit") { process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="view") { process.stdout.write(JSON.stringify({state:"open",number:99,title:"owned-wt",labels:[],assignees:[],url:""})+"\\n"); process.exit(0); }',
              'process.exit(0);'
            ].join('\n'), { mode: 0o755 });
            const env17w = {
              ...process.env,
              PATH: bin17w + pathSep17w + process.env.PATH,
              KAOLA_KERNEL_SESSION_SKIP: '1'
            };
            // Compute coordRoot for this repo and write the lock file directly
            const coordRoot17w = coordRootFor(tmp17w);
            const locksDir17w = path.join(coordRoot17w, 'kaola-workflow', '.locks');
            fs.mkdirSync(locksDir17w, { recursive: true });
            const sessionsDir17w = path.join(coordRoot17w, 'kaola-workflow', '.sessions');
            fs.mkdirSync(sessionsDir17w, { recursive: true });
            const expectedWtPath17w = '/tmp/test-wt-path/issue-99';
            const now17w = new Date();
            const lockData17w = {
              project: 'issue-99',
              session_id: 'sess-17w',
              machine_id: 'test-machine',
              claimed_at: now17w.toISOString(),
              expires: new Date(now17w.getTime() + 30 * 60 * 1000).toISOString(),
              last_heartbeat: now17w.toISOString(),
              issue_number: 99,
              claim_comment_id: null,
              sink: 'merge',
              pr_url: null,
              pr_number: null,
              runtime: 'claude',
              worktree_path: expectedWtPath17w,
              branch: 'workflow/issue-99',
              owner_session_id: 'sess-17w'
            };
            fs.writeFileSync(path.join(locksDir17w, 'issue-99.lock'), JSON.stringify(lockData17w));
            // Call startup directly — must reach owned branch because session already owns issue-99
            const startupOut17w = execFileSync(process.execPath, [
              claimJS, 'startup', '--session', 'sess-17w', '--runtime', 'claude', '--target-issue', '99'
            ], { cwd: tmp17w, encoding: 'utf8', env: env17w });
            const receipt17w = JSON.parse(startupOut17w.trim());
            assert(receipt17w.verdict === 'owned',
              '17W: startup must return verdict=owned for pre-existing lock, got ' + receipt17w.verdict);
            assert(receipt17w.claim === 'owned',
              '17W: startup receipt claim must be owned, got ' + receipt17w.claim);
            assert(receipt17w.worktree_path === expectedWtPath17w,
              '17W: startup owned receipt must include worktree_path from lock file, got ' + receipt17w.worktree_path);
          } finally {
            try { fs.rmSync(tmp17w, { recursive: true, force: true }); } catch (_) {}
          }

          // Negative case: lock has worktree_path:null → receipt.worktree_path is null
          const tmp17wn = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-17wn-'));
          try {
            execFileSync('git', ['init', '-b', 'main'], { cwd: tmp17wn, encoding: 'utf8' });
            execFileSync('git', ['-C', tmp17wn, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
            const bin17wn = path.join(tmp17wn, 'bin');
            fs.mkdirSync(bin17wn);
            const pathSep17wn = process.platform === 'win32' ? ';' : ':';
            fs.writeFileSync(path.join(bin17wn, 'gh'), [
              '#!/usr/bin/env node',
              'const a = process.argv.slice(2);',
              'if (a[0]==="issue"&&a[1]==="list") { process.stdout.write("[]\\n"); process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="edit") { process.exit(0); }',
              'if (a[0]==="issue"&&a[1]==="view") { process.stdout.write(JSON.stringify({state:"open",number:99,title:"owned-wt-null",labels:[],assignees:[],url:""})+"\\n"); process.exit(0); }',
              'process.exit(0);'
            ].join('\n'), { mode: 0o755 });
            const env17wn = {
              ...process.env,
              PATH: bin17wn + pathSep17wn + process.env.PATH,
              KAOLA_KERNEL_SESSION_SKIP: '1'
            };
            const coordRoot17wn = coordRootFor(tmp17wn);
            const locksDir17wn = path.join(coordRoot17wn, 'kaola-workflow', '.locks');
            fs.mkdirSync(locksDir17wn, { recursive: true });
            const sessionsDir17wn = path.join(coordRoot17wn, 'kaola-workflow', '.sessions');
            fs.mkdirSync(sessionsDir17wn, { recursive: true });
            const now17wn = new Date();
            const lockData17wn = {
              project: 'issue-99',
              session_id: 'sess-17wn',
              machine_id: 'test-machine',
              claimed_at: now17wn.toISOString(),
              expires: new Date(now17wn.getTime() + 30 * 60 * 1000).toISOString(),
              last_heartbeat: now17wn.toISOString(),
              issue_number: 99,
              claim_comment_id: null,
              sink: 'merge',
              pr_url: null,
              pr_number: null,
              runtime: 'claude',
              worktree_path: null,
              branch: null,
              owner_session_id: 'sess-17wn'
            };
            fs.writeFileSync(path.join(locksDir17wn, 'issue-99.lock'), JSON.stringify(lockData17wn));
            const startupOut17wn = execFileSync(process.execPath, [
              claimJS, 'startup', '--session', 'sess-17wn', '--runtime', 'claude', '--target-issue', '99'
            ], { cwd: tmp17wn, encoding: 'utf8', env: env17wn });
            const receipt17wn = JSON.parse(startupOut17wn.trim());
            assert(receipt17wn.verdict === 'owned',
              '17W-neg: startup must return verdict=owned for pre-existing lock with null worktree_path, got ' + receipt17wn.verdict);
            assert(receipt17wn.claim === 'owned',
              '17W-neg: startup receipt claim must be owned, got ' + receipt17wn.claim);
            assert(receipt17wn.worktree_path === null,
              '17W-neg: startup owned receipt must have worktree_path=null when lock has null, got ' + receipt17wn.worktree_path);
          } finally {
            try { fs.rmSync(tmp17wn, { recursive: true, force: true }); } catch (_) {}
          }
        }

      } finally {
        // Prune worktrees before rm to avoid git lock issues
        try { execFileSync('git', ['-C', epic17Tmp, 'worktree', 'prune'], { encoding: 'utf8' }); } catch (_) {}
        // Also clean up the sibling .kw directory created by worktreePathFor
        try {
          const kwDir = path.dirname(pick17a.worktree_path);
          if (fs.existsSync(kwDir)) fs.rmSync(kwDir, { recursive: true, force: true });
        } catch (_) {}
        fs.rmSync(epic17Tmp, { recursive: true, force: true });
      }
    }

    // Epic Case 14c — analyzeIssue() returns advisory struct; no auto-pick triggered
    {
      const { analyzeIssue } = require(path.join(root, 'scripts', 'kaola-workflow-claim.js'));

      // Basic issue: short body, no anti labels
      const simpleIssue = { number: 501, title: 'Fix typo in README', body: 'Line 42 has a typo.', labels: [{ name: 'typo' }] };
      const simpleResult = analyzeIssue(simpleIssue, null);
      assert(simpleResult !== null, '14c: analyzeIssue must not return null for a valid issue');
      assert(typeof simpleResult.priority_tier === 'number', '14c: priority_tier must be a number, got ' + JSON.stringify(simpleResult));
      assert('priority_label' in simpleResult, '14c: priority_label field must be present');
      assert('override_label' in simpleResult, '14c: override_label field must be present');
      assert(simpleResult.recommended_path === 'fast' || simpleResult.recommended_path === 'full',
        '14c: recommended_path must be fast or full, got ' + simpleResult.recommended_path);
      assert(Array.isArray(simpleResult.path_signals), '14c: path_signals must be an array');
      assert(simpleResult.path_confidence === 'high' || simpleResult.path_confidence === 'medium',
        '14c: path_confidence must be high or medium, got ' + simpleResult.path_confidence);
      // Typo label is a pro-fast signal; short body also scores; should recommend fast
      assert(simpleResult.recommended_path === 'fast',
        '14c: short typo issue must recommend fast path, got ' + simpleResult.recommended_path);
      assert(simpleResult.path_signals.includes('label:docs/chore'),
        '14c: typo label must appear in path_signals, got ' + JSON.stringify(simpleResult.path_signals));

      // Top-tier label: priority:critical overrides parsePriorityTier
      const criticalIssue = { number: 502, title: 'Critical outage', body: '', labels: [{ name: 'priority:critical' }] };
      const criticalResult = analyzeIssue(criticalIssue, null);
      assert(criticalResult.priority_tier === 0, '14c: priority:critical must set priority_tier=0, got ' + criticalResult.priority_tier);
      assert(criticalResult.override_label === 'priority:critical', '14c: override_label must be the matched top-tier label');

      // Anti-veto: architecture label forces full path
      const archIssue = { number: 503, title: 'Redesign auth layer', body: 'Major changes needed.', labels: [{ name: 'architecture' }] };
      const archResult = analyzeIssue(archIssue, null);
      assert(archResult.recommended_path === 'full', '14c: architecture label must veto fast path');
      assert(archResult.path_signals.includes('anti:veto'), '14c: anti:veto must appear in path_signals for architecture label');

      // Null-guard: analyzeIssue(null) must return null
      const nullResult = analyzeIssue(null, null);
      assert(nullResult === null, '14c: analyzeIssue(null) must return null, got ' + JSON.stringify(nullResult));

      // Negative: analyzeIssue has no side effects; require it twice without claim side effects
      const a1 = analyzeIssue(simpleIssue, null);
      const a2 = analyzeIssue(simpleIssue, null);
      assert(JSON.stringify(a1) === JSON.stringify(a2), '14c: analyzeIssue must be pure/deterministic');
    }

    // Epic Case 14d — computeRecovery() returns correct enum; no auto-claim follows
    {
      const { computeRecovery } = require(path.join(root, 'scripts', 'kaola-workflow-claim.js'));

      // skipped non-empty, blocked empty → advance_project
      const r1 = computeRecovery([{ issue: 99 }], []);
      assert(r1 === 'advance_project',
        '14d: skipped=[x], blocked=[] must return advance_project, got ' + r1);

      // blocked non-empty → consult_advisor
      const r2 = computeRecovery([], [{ issue: 100 }]);
      assert(r2 === 'consult_advisor',
        '14d: skipped=[], blocked=[y] must return consult_advisor, got ' + r2);

      // both empty → prompt_user
      const r3 = computeRecovery([], []);
      assert(r3 === 'prompt_user',
        '14d: skipped=[], blocked=[] must return prompt_user, got ' + r3);

      // undefined guards: computeRecovery(undefined, undefined) must not throw
      const r4 = computeRecovery(undefined, undefined);
      assert(r4 === 'prompt_user',
        '14d: undefined args must default to empty arrays → prompt_user, got ' + r4);

      // skipped+blocked both non-empty → consult_advisor (blocked takes priority)
      const r5 = computeRecovery([{ issue: 99 }], [{ issue: 100 }]);
      assert(r5 === 'consult_advisor',
        '14d: skipped=[x], blocked=[y] must return consult_advisor, got ' + r5);
    }

    // Case 8M — claim:none startup receipt has recovery field; no subsequent auto-claim
    {
      const claimScript8m = path.join(root, 'scripts', 'kaola-workflow-claim.js');
      const tmp8m = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8m-'));
      try {
        execFileSync('git', ['init', '-q', '-b', 'main', tmp8m]);
        // Offline mode with empty roadmap → startup has no issues to claim → claim:none
        const env8m = {
          ...process.env,
          HOME: tmp8m,
          KAOLA_WORKFLOW_OFFLINE: '1',
          KAOLA_KERNEL_SESSION_SKIP: '1'
        };
        const r8m = spawnSync(process.execPath, [
          claimScript8m, 'startup',
          '--session', 'sess-8m',
          '--runtime', 'claude'
        ], { cwd: tmp8m, encoding: 'utf8', env: env8m });

        assert(r8m.status === 1, '8M: startup without --target-issue must exit 1, got ' + r8m.status);
        const receipt8m = JSON.parse(r8m.stdout.trim());
        assert(receipt8m.claim === 'none', '8M: claim must be none, got ' + receipt8m.claim);
        assert(receipt8m.verdict === 'no_target',
          '8M: startup without --target-issue must return verdict: no_target, got: ' + JSON.stringify(receipt8m));
        assert(!('analysis' in receipt8m),
          '8M: claim:none receipt must NOT have analysis field, got: ' + JSON.stringify(receipt8m));
        // Negative: no subsequent auto-claim — the receipt exit code is 1 and stdout is claim:none;
        // cmdStartup returns immediately after writing the receipt (verified by absence of lock file)
        const lockDir8m = locksDirFor(tmp8m);
        const lockFiles8m = fs.existsSync(lockDir8m) ? fs.readdirSync(lockDir8m) : [];
        assert(lockFiles8m.length === 0,
          '8M: no lock file must exist after claim:none startup, got: ' + JSON.stringify(lockFiles8m));
      } finally {
        fs.rmSync(tmp8m, { recursive: true, force: true });
      }
    }

    // Case 15a — KAOLA_PATH env var controls workflow_path in acquired startup receipt
    // Each sub-case uses its own fresh repo so the classifier sees no interference
    {
      const claimScript15a = path.join(root, 'scripts', 'kaola-workflow-claim.js');

      function make15aRepo(suffix) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-case15a' + suffix + '-'));
        execFileSync('git', ['init', '-q', '-b', 'main', tmpDir]);
        const binDir = path.join(tmpDir, 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const ghScript = path.join(binDir, 'gh');
        fs.writeFileSync(ghScript, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":601,"title":"workflow path test","state":"OPEN","labels":[{"name":"workflow:queued"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/601"}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  printf '{"number":601,"title":"workflow path test","body":"Fix typo in README.md line 42","labels":[{"name":"workflow:queued"}],"state":"OPEN"}'
  exit 0
fi
if [ "$1" = "label" ] && [ "$2" = "create" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "edit" ]; then exit 0; fi
if [ "$1" = "issue" ] && [ "$2" = "comment" ]; then
  echo "https://github.com/test/repo/issues/$3#issuecomment-$3"
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "view" ]; then printf '{"owner":{"login":"test"},"name":"repo"}'; exit 0; fi
if [ "$1" = "api" ]; then printf '[]'; exit 0; fi
exit 0
`);
        fs.chmodSync(ghScript, 0o755);
        return { tmpDir, env: { ...process.env, PATH: binDir + path.delimiter + (process.env.PATH || ''), HOME: tmpDir, KAOLA_KERNEL_SESSION_SKIP: '1' } };
      }

      // Sub-case 1: KAOLA_PATH=fast → workflow_path must be 'fast'
      const ctx1 = make15aRepo('a');
      try {
        const r15a1 = JSON.parse(execFileSync(process.execPath, [
          claimScript15a, 'startup', '--session', 'sess-15a-1', '--runtime', 'claude', '--target-issue', '601'
        ], { cwd: ctx1.tmpDir, encoding: 'utf8', env: { ...ctx1.env, KAOLA_PATH: 'fast' } }).trim());
        assert(r15a1.claim === 'acquired', '15a-1: must acquire an issue, got ' + r15a1.claim);
        assert(r15a1.workflow_path === 'fast',
          '15a-1: KAOLA_PATH=fast must produce workflow_path=fast in receipt, got ' + r15a1.workflow_path);
      } finally {
        fs.rmSync(ctx1.tmpDir, { recursive: true, force: true });
      }

      // Sub-case 2: no KAOLA_PATH → workflow_path must be 'full'
      const ctx2 = make15aRepo('b');
      try {
        const env2 = { ...ctx2.env };
        delete env2.KAOLA_PATH;
        const r15a2 = JSON.parse(execFileSync(process.execPath, [
          claimScript15a, 'startup', '--session', 'sess-15a-2', '--runtime', 'claude', '--target-issue', '601'
        ], { cwd: ctx2.tmpDir, encoding: 'utf8', env: env2 }).trim());
        assert(r15a2.claim === 'acquired', '15a-2: must acquire an issue, got ' + r15a2.claim);
        assert(r15a2.workflow_path === 'full',
          '15a-2: absent KAOLA_PATH must produce workflow_path=full in receipt, got ' + r15a2.workflow_path);
      } finally {
        fs.rmSync(ctx2.tmpDir, { recursive: true, force: true });
      }

      // Sub-case 3: KAOLA_PATH=invalid → workflow_path must be 'full' (strict equality; only 'fast' maps)
      const ctx3 = make15aRepo('c');
      try {
        const r15a3 = JSON.parse(execFileSync(process.execPath, [
          claimScript15a, 'startup', '--session', 'sess-15a-3', '--runtime', 'claude', '--target-issue', '601'
        ], { cwd: ctx3.tmpDir, encoding: 'utf8', env: { ...ctx3.env, KAOLA_PATH: 'invalid' } }).trim());
        assert(r15a3.claim === 'acquired', '15a-3: must acquire an issue, got ' + r15a3.claim);
        assert(r15a3.workflow_path === 'full',
          '15a-3: invalid KAOLA_PATH must produce workflow_path=full in receipt, got ' + r15a3.workflow_path);
      } finally {
        fs.rmSync(ctx3.tmpDir, { recursive: true, force: true });
      }

      // Sub-case 4: claim:owned resume preserves workflow_path from workflow-state.md
      const ctx4 = make15aRepo('d');
      try {
        // First startup: acquire with KAOLA_PATH=fast (agent selects target issue)
        const r15a4acq = JSON.parse(execFileSync(process.execPath, [
          claimScript15a, 'startup', '--session', 'sess-15a-4', '--runtime', 'claude', '--target-issue', '601'
        ], { cwd: ctx4.tmpDir, encoding: 'utf8', env: { ...ctx4.env, KAOLA_PATH: 'fast' } }).trim());
        assert(r15a4acq.claim === 'acquired', '15a-4: first startup must acquire, got ' + r15a4acq.claim);
        assert(r15a4acq.workflow_path === 'fast', '15a-4: first receipt must have workflow_path=fast, got ' + r15a4acq.workflow_path);
        // Simulate fast path writing workflow_path to workflow-state.md
        const project4 = r15a4acq.selected_project;
        const stateDir4 = path.join(ctx4.tmpDir, 'kaola-workflow', project4);
        fs.mkdirSync(stateDir4, { recursive: true });
        fs.writeFileSync(path.join(stateDir4, 'workflow-state.md'),
          'status: active\nphase: fast\nworkflow_path: fast\n\n## Lease\nsession_id: sess-15a-4\n');
        // Second startup (same session, same project): must return claim:owned with workflow_path preserved
        const r15a4own = JSON.parse(execFileSync(process.execPath, [
          claimScript15a, 'startup', '--session', 'sess-15a-4', '--runtime', 'claude'
        ], {
          cwd: ctx4.tmpDir, encoding: 'utf8',
          env: (function() { const e = { ...ctx4.env }; delete e.KAOLA_PATH; return e; })()
        }).trim());
        assert(r15a4own.claim === 'owned', '15a-4: resume startup must return claim:owned, got ' + r15a4own.claim);
        assert(r15a4own.workflow_path === 'fast',
          '15a-4: claim:owned resume must preserve workflow_path=fast from state file, got ' + r15a4own.workflow_path);
      } finally {
        fs.rmSync(ctx4.tmpDir, { recursive: true, force: true });
      }
    }

    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try {
      const cwdKw = path.join(process.cwd(), 'kaola-workflow');
      if (fs.existsSync(cwdKw)) {
        for (const d of fs.readdirSync(cwdKw)) {
          if (/^proj-ac/.test(d)) {
            fs.rmSync(path.join(cwdKw, d), { recursive: true, force: true });
          }
        }
      }
    } catch (_) {}
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
