#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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

function main() {
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

    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
