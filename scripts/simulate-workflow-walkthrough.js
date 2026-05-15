#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const project = 'simulated-feature';

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
      fs.mkdirSync(path.join(epicTmp, 'kaola-workflow', '.locks'), { recursive: true });
      fs.mkdirSync(path.join(epicTmp, 'kaola-workflow', '.sessions'), { recursive: true });
      fs.mkdirSync(path.join(epicTmp, 'kaola-workflow', 'epic-test-project'), { recursive: true });
      fs.writeFileSync(
        path.join(epicTmp, 'kaola-workflow', 'epic-test-project', 'workflow-state.md'),
        '# Kaola-Workflow State\n\n## Project\nname: epic-test-project\nstatus: active\n\n## Last Updated\n2026-05-14T00:00:00Z\n'
      );

      // Step 1 — Claim
      const sessionId = 'test-session-' + Date.now();
      const claimResult = execFileSync(process.execPath, [
        path.join(root, 'scripts/kaola-workflow-claim.js'),
        'claim', '--session', sessionId, '--project', 'epic-test-project', '--issue', '3'
      ], { cwd: epicTmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });

      // Step 2 — Verify lock file exists
      const lockPath = path.join(epicTmp, 'kaola-workflow', '.locks', 'epic-test-project.lock');
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
    }

    // Epic Case 6: parallel-classifier — sub-tests 6A–6F + 6E'
    {
      const classifierScript = path.join(root, 'scripts', 'kaola-workflow-classifier.js');
      assert(fs.existsSync(classifierScript), 'Epic Case 6: kaola-workflow-classifier.js must exist');

      const epic6Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic6-'));
      try {
        const locksDir = path.join(epic6Tmp, 'kaola-workflow', '.locks');
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
        const locksDir = path.join(kwDir, '.locks');
        const sessionsDir = path.join(kwDir, '.sessions');
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
            lockPath: path.join(workdir, 'kaola-workflow', '.locks', claimProject + '.lock'),
            statePath: path.join(workdir, 'kaola-workflow', claimProject, 'workflow-state.md')
          };
        }

        // 8A: lock and session files must be created with mode 0o600
        if (process.platform !== 'win32') {
          const sessId8a = 'sess-8a-' + Date.now();
          const { lockPath: lp8a } = runClaim(epic8Tmp, sessId8a, 3, 'epic8-proj');
          const sessionFile8a = path.join(epic8Tmp, 'kaola-workflow', '.sessions', sessId8a + '.json');
          assert((fs.statSync(lp8a).mode & 0o777) === 0o600, '8A: lock file mode must be 0o600');
          assert((fs.statSync(sessionFile8a).mode & 0o777) === 0o600, '8A: session file mode must be 0o600');
        }

        // 8D: cmdStatus must skip (or drift-flag) a lock whose session_id contains path separators
        {
          const epic8dTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-epic8d-'));
          try {
            const locksDir8d = path.join(epic8dTmp, 'kaola-workflow', '.locks');
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
            const locksDir8b = path.join(epic8bTmp, 'kaola-workflow', '.locks');
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
            fs.mkdirSync(path.join(epic8gTmp, 'kaola-workflow', '.locks'), { recursive: true });
            fs.mkdirSync(path.join(epic8gTmp, 'kaola-workflow', '.sessions'), { recursive: true });

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
            const lock8ga = JSON.parse(fs.readFileSync(path.join(epic8gTmp, 'kaola-workflow', '.locks', 'proj-8g-a.lock'), 'utf8'));
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
            const lock8gb = JSON.parse(fs.readFileSync(path.join(epic8gTmp, 'kaola-workflow', '.locks', 'proj-8g-b.lock'), 'utf8'));
            assert(lock8gb.runtime === 'codex', '8G-b: lock must include runtime=codex, got: ' + lock8gb.runtime);
          } finally {
            fs.rmSync(epic8gTmp, { recursive: true, force: true });
          }
        }

        // 8G-c: invalid --runtime value must be rejected (exit 1, stderr contains allowlist message)
        {
          const epic8gcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-epic8gc-'));
          try {
            fs.mkdirSync(path.join(epic8gcTmp, 'kaola-workflow', '.locks'), { recursive: true });
            fs.mkdirSync(path.join(epic8gcTmp, 'kaola-workflow', '.sessions'), { recursive: true });
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
            fs.mkdirSync(path.join(epic8gdTmp, 'kaola-workflow', '.locks'), { recursive: true });
            fs.mkdirSync(path.join(epic8gdTmp, 'kaola-workflow', '.sessions'), { recursive: true });
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
            const lock8gd = JSON.parse(fs.readFileSync(path.join(epic8gdTmp, 'kaola-workflow', '.locks', 'proj-8gd.lock'), 'utf8'));
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

        // 8K: session lookup validates current ownership; handoff is explicit.
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

            fs.unlinkSync(path.join(epic8kTmp, 'kaola-workflow', '.locks', 'epic8k.lock'));
            const r8kState = spawnSync(process.execPath, [
              claimScript, 'session', '--project', 'epic8k', '--session', 'sess-8k'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kState.status === 0, '8K-c: matching state-only owner must validate, got ' + r8kState.status + '\nstderr: ' + r8kState.stderr);
            assert(r8kState.stdout.trim() === 'sess-8k', '8K-c: expected sess-8k from workflow-state validation, got: ' + r8kState.stdout);

            const r8kHandoff = spawnSync(process.execPath, [
              claimScript, 'handoff', '--project', 'epic8k', '--session', 'sess-8k-new'
            ], {
              cwd: epic8kTmp,
              encoding: 'utf8',
              env: { ...process.env, HOME: epic8kTmp, KAOLA_WORKFLOW_OFFLINE: '1' }
            });
            assert(r8kHandoff.status === 0, '8K-d: explicit handoff must succeed, got ' + r8kHandoff.status + '\nstderr: ' + r8kHandoff.stderr);
            const handedOffState = fs.readFileSync(path.join(epic8kTmp, 'kaola-workflow', 'epic8k', 'workflow-state.md'), 'utf8');
            assert(handedOffState.includes('session_id: sess-8k-new'), '8K-d: handoff must update workflow-state lease');
          } finally {
            fs.rmSync(epic8kTmp, { recursive: true, force: true });
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

            const lock11 = JSON.parse(fs.readFileSync(path.join(epic8iTmp, 'kaola-workflow', '.locks', 'issue-11.lock'), 'utf8'));
            const lock12 = JSON.parse(fs.readFileSync(path.join(epic8iTmp, 'kaola-workflow', '.locks', 'issue-12.lock'), 'utf8'));
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
            const lock8j = JSON.parse(fs.readFileSync(path.join(epic8jTmp, 'kaola-workflow', '.locks', 'epic8j.lock'), 'utf8'));
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
          fs.mkdirSync(path.join(dir, 'kaola-workflow', '.locks'), { recursive: true });
          fs.mkdirSync(path.join(dir, 'kaola-workflow', '.sessions'), { recursive: true });
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
          const lockPath = path.join(dir, 'kaola-workflow', '.locks', project + '.lock');
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
          const lockExists9a1 = fs.existsSync(path.join(subTmp, 'kaola-workflow', '.locks', 'proj9a1.lock'));
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
          const lockPath9a2 = path.join(subTmp, 'kaola-workflow', '.locks', 'proj9a2.lock');
          assert(fs.existsSync(lockPath9a2), '9A2: lock file must exist after successful claim');
          const lock9a2 = JSON.parse(fs.readFileSync(lockPath9a2, 'utf8'));
          assert(lock9a2.claim_comment_id === '300', '9A2: claim_comment_id must be 300, got ' + lock9a2.claim_comment_id);
        }

        // ── Test 9A3: ticker late-tiebreaker — ticker yields when another session has lower comment ID ──
        {
          const subTmp = path.join(epic9Tmp, '9a3');
          const binDir = path.join(subTmp, 'bin');
          makeKwDirs(subTmp);
          fs.mkdirSync(path.join(subTmp, 'kaola-workflow', '.tickers'), { recursive: true });

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

          const lockPath9a3 = path.join(subTmp, 'kaola-workflow', '.locks', 'proj9a3.lock');
          const pidFile9a3 = path.join(subTmp, 'kaola-workflow', '.tickers', 'sess-9a3-loser.pid');

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
          fs.mkdirSync(path.join(subTmp, 'kaola-workflow', '.tickers'), { recursive: true });

          makeGhShim(binDir, `#!/bin/sh
exit 0
`);

          // Write lock file (no issue/comment to keep ticker's tick() fast)
          writeLock(subTmp, 'proj9b1', 'sess-9b1', { issue_number: null, claim_comment_id: null });

          // Write a PID file with our own (live) PID
          const pidFile9b1 = path.join(subTmp, 'kaola-workflow', '.tickers', 'sess-9b1.pid');
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
          fs.mkdirSync(path.join(subTmp, 'kaola-workflow', '.tickers'), { recursive: true });

          makeGhShim(binDir, `#!/bin/sh
exit 0
`);

          // Write lock file with null issue_number; setTimeout keeps the event loop alive
          writeLock(subTmp, 'proj9b2', 'sess-9b2', { issue_number: null, claim_comment_id: null });

          // Write stale PID file with nonexistent PID
          const pidFile9b2 = path.join(subTmp, 'kaola-workflow', '.tickers', 'sess-9b2.pid');
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
          writeLock(subTmp, 'proj9c1', 'sess-9c1', {
            issue_number: 8,
            claim_comment_id: '555',
            expires: stale25h,
            last_heartbeat: stale25h
          });

          const lockPath9c1 = path.join(subTmp, 'kaola-workflow', '.locks', 'proj9c1.lock');
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

          const lockPath9c2 = path.join(subTmp, 'kaola-workflow', '.locks', 'proj9c2.lock');
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
            fs.mkdirSync(path.join(subTmp, 'kaola-workflow', '.tickers'), { recursive: true });
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
          const lock9f = JSON.parse(fs.readFileSync(path.join(subTmp, 'kaola-workflow', '.locks', 'proj9f.lock'), 'utf8'));
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
            fs.mkdirSync(path.join(subTmpSIGINT, 'kaola-workflow', '.tickers'), { recursive: true });
            makeGhShim(binDir, '#!/bin/sh\nexit 0\n');
            writeLock(subTmpSIGINT, 'proj-sigint', 'sess-sigint', { issue_number: null, claim_comment_id: null });
            const pidFileSIGINT = path.join(subTmpSIGINT, 'kaola-workflow', '.tickers', 'sess-sigint.pid');
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

        fs.mkdirSync(path.join(epic10Tmp, 'kaola-workflow', '.locks'), { recursive: true });
        fs.mkdirSync(path.join(epic10Tmp, 'kaola-workflow', 'projA'), { recursive: true });
        fs.writeFileSync(path.join(epic10Tmp, 'kaola-workflow', '.locks', 'projA.lock'),
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
        'git commit -m',
      ];
      for (const src of guardSources) {
        const text = fs.readFileSync(src, 'utf8');
        for (const needle of required) {
          assert(text.includes(needle),
            'Epic Case 11: ' + path.basename(src) + ' missing guard marker "' + needle + '"');
        }
        assert(text.indexOf('git commit -m') < text.indexOf('kaola-workflow-sink-merge.js'),
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
        const locksDir12 = path.join(epic12Tmp, 'kaola-workflow', '.locks');
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

    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
