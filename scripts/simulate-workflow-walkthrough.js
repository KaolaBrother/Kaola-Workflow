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
    '# Claude Workflow State',
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
    `phase_file: claude-workflow/${project}/phase${phase}.md`,
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
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/claude-workflow-compact-context.js')], {
    cwd: workdir,
    encoding: 'utf8'
  });
  assert(output.includes(expectedCommand), `hook output missing ${expectedCommand}`);
  assert(output.includes(`Current step: ${expectedStep}`), `hook output missing step ${expectedStep}`);
  assert(output.includes('do not repair inline'), 'hook output missing inline repair guardrail');
}

function runRepair(workdir, projectArg = project) {
  return execFileSync(process.execPath, [path.join(root, 'scripts/claude-workflow-repair-state.js'), projectArg], {
    cwd: workdir,
    encoding: 'utf8'
  });
}

function assertRepair(workdir, expectedCommand, expectedPhase) {
  const output = runRepair(workdir);
  assert(output.includes('Workflow state repair: wrote') || output.includes('Workflow state repair: repaired stale'), 'repair output must report a write or stale repair');
  assert(output.includes(`Current phase: ${expectedPhase}`), `repair output missing phase ${expectedPhase}`);
  assert(output.includes(`Next command: ${expectedCommand}`), `repair output missing ${expectedCommand}`);
  assertNext(path.join(workdir, 'claude-workflow', project, 'workflow-state.md'), expectedCommand);
  assertFileIncludes(path.join(workdir, 'claude-workflow', project, 'workflow-state.md'), 'last_result: state_repaired_from_artifacts');
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-workflow-walkthrough-'));
  try {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-workflow-empty-'));
    try {
      fs.mkdirSync(path.join(emptyRoot, 'claude-workflow', project), { recursive: true });
      const output = runRepair(emptyRoot, project);
      assert(output.includes('Workflow state repair: skipped - no phase artifacts available for repair'), 'repair must not create state for brand-new work');
      assert(!fs.existsSync(path.join(emptyRoot, 'claude-workflow', project, 'workflow-state.md')), 'repair created state without phase artifacts');
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }

    const workflowRoot = path.join(tmp, 'claude-workflow');
    const projectRoot = path.join(workflowRoot, project);
    const cache = path.join(projectRoot, '.cache');
    const stateFile = path.join(projectRoot, 'workflow-state.md');

    fs.mkdirSync(cache, { recursive: true });
    write(path.join(workflowRoot, 'ROADMAP.md'), '# Roadmap\n');

    write(stateFile, stateContent({
      phase: 1,
      phaseName: 'Research',
      step: 'requirement-parsing',
      nextCommand: `/claude-workflow-phase1 ${project}`
    }));
    assertNext(stateFile, `/claude-workflow-phase1 ${project}`);

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
      nextCommand: `/claude-workflow-phase2 ${project}`
    }));
    assertNext(stateFile, `/claude-workflow-phase2 ${project}`);

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
      nextCommand: `/claude-workflow-phase3 ${project}`
    }));
    assertNext(stateFile, `/claude-workflow-phase3 ${project}`);

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
      nextCommand: `/claude-workflow-phase4 ${project}`
    }));
    assertNext(stateFile, `/claude-workflow-phase4 ${project}`);

    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `/claude-workflow-phase4 ${project}`, 4);

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
    assertRepair(tmp, `/claude-workflow-phase4 ${project}`, 4);
    assertFileIncludes(stateFile, 'task: 1');
    write(stateFile, stateContent({
      phase: 4,
      phaseName: 'Execute',
      step: 'route-failure',
      task: '1',
      nextCommand: `/claude-workflow-phase4 ${project}`
    }));
    assertHookOutput(tmp, `/claude-workflow-phase4 ${project}`, 'route-failure');

    write(path.join(projectRoot, 'phase4-progress.md'), read(path.join(projectRoot, 'phase4-progress.md')).replace(
      '| 1 | Add greeting | in_progress | | validation failed |',
      '| 1 | Add greeting | complete | src/greeting.js, test/greeting.test.js | validation passed |'
    ));
    assertRepair(tmp, `/claude-workflow-phase5 ${project}`, 5);
    write(stateFile, stateContent({
      phase: 4,
      phaseName: 'Execute',
      step: 'complete',
      nextCommand: `/claude-workflow-phase5 ${project}`
    }));
    assertNext(stateFile, `/claude-workflow-phase5 ${project}`);

    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `/claude-workflow-phase5 ${project}`, 5);

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
      nextCommand: `/claude-workflow-phase6 ${project}`
    }));
    assertNext(stateFile, `/claude-workflow-phase6 ${project}`);

    write(path.join(cache, 'doc-updater.md'), 'docs updated\n');
    write(path.join(projectRoot, 'phase6-summary.md'), phaseFile('Phase 6 - Summary', [
      '| doc-updater | invoked | .cache/doc-updater.md | |',
      '| documentation docking | invoked | .cache/doc-docking.md | |',
      '| closure advisor gate | N/A | closure scan | no deferred/conflict/user-decision items |',
      '| final-validation fix executors | N/A | final validation output | no failures |',
      '| roadmap refresh | invoked | claude-workflow/ROADMAP.md | |',
      '| archive completed folder | invoked | claude-workflow/archive/simulated-feature | |',
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
      nextCommand: `/claude-workflow-phase6 ${project}`
    }));

    const phaseCommands = [
      'commands/claude-workflow-phase1.md',
      'commands/claude-workflow-phase2.md',
      'commands/claude-workflow-phase3.md',
      'commands/claude-workflow-phase4.md',
      'commands/claude-workflow-phase5.md',
      'commands/claude-workflow-phase6.md'
    ];
    for (const command of phaseCommands) {
      const content = fs.readFileSync(path.join(root, command), 'utf8');
      assert(content.includes('Resume Detection'), `${command} missing Resume Detection section`);
      assert(content.includes('workflow-state.md'), `${command} missing workflow-state.md reference`);
    }

    assertCommandIncludes('commands/claude-workflow-phase1.md', ['code-explorer', 'docs-lookup']);
    assertCommandIncludes('commands/claude-workflow-phase2.md', ['planner', 'advisor']);
    assertCommandIncludes('commands/claude-workflow-phase3.md', ['code-architect', 'advisor']);
    assertCommandIncludes('commands/claude-workflow-phase4.md', ['tdd-guide', 'build-error-resolver']);
    assertCommandIncludes('commands/claude-workflow-phase5.md', ['code-reviewer', 'security-reviewer', 'tdd-guide', 'build-error-resolver']);
    assertCommandIncludes('commands/claude-workflow-phase6.md', ['doc-updater', 'tdd-guide', 'build-error-resolver']);

    console.log('Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
