#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pluginRoot = path.resolve(__dirname, '..');
const repairScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-repair-state.js');
const installAgentsScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const project = 'simulated-feature';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function runRepair(workdir, projectArg = project) {
  return execFileSync(process.execPath, [repairScript, projectArg], {
    cwd: workdir,
    encoding: 'utf8'
  });
}

function runInstallAgents(workdir) {
  return execFileSync(process.execPath, [installAgentsScript, workdir], {
    cwd: workdir,
    encoding: 'utf8'
  });
}

function nextSkill(stateFile) {
  const match = read(stateFile).match(/^next_skill:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function assertNext(stateFile, expected) {
  const actual = nextSkill(stateFile);
  assert(actual === expected, `expected next_skill ${expected}, got ${actual}`);
}

function phaseFile(title, rows) {
  return [
    `# ${title}: ${project}`,
    '',
    '## Required Agent Compliance',
    '| Requirement | Status | Evidence | Skip Reason |',
    '|-------------|--------|----------|-------------|',
    ...rows,
    ''
  ].join('\n');
}

function assertRepair(workdir, expectedSkill, expectedPhase) {
  const output = runRepair(workdir);
  assert(output.includes('Workflow state repair: wrote') || output.includes('Workflow state repair: repaired stale'), 'repair output must report a write or stale repair');
  assert(output.includes(`Current phase: ${expectedPhase}`), `repair output missing phase ${expectedPhase}`);
  assert(output.includes(`Next skill: ${expectedSkill}`), `repair output missing ${expectedSkill}`);
  const stateFile = path.join(workdir, 'kaola-workflow', project, 'workflow-state.md');
  assertNext(stateFile, expectedSkill);
  assert(read(stateFile).includes('last_result: state_repaired_from_artifacts'), 'state must record repair provenance');
}

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-walkthrough-'));
  try {
    const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-agents-'));
    try {
      const firstInstall = runInstallAgents(installRoot);
      const secondInstall = runInstallAgents(installRoot);
      const configFile = path.join(installRoot, '.codex', 'config.toml');
      const config = read(configFile);
      assert(firstInstall.includes('copied 9 profiles'), 'agent installer must copy all profiles');
      assert(secondInstall.includes('copied 9 profiles'), 'agent installer must be repeatable');
      assert(config.includes('[agents.code-explorer]'), 'agent config missing code-explorer role');
      assert(config.includes('config_file = "./agents/kaola-workflow/tdd-guide.toml"'), 'agent config missing tdd-guide file');
      assert((config.match(/BEGIN kaola-workflow agents/g) || []).length === 1, 'agent installer must not duplicate managed block');
      assert(fs.existsSync(path.join(installRoot, '.codex', 'agents', 'kaola-workflow', 'security-reviewer.toml')), 'agent installer missing copied security profile');
    } finally {
      fs.rmSync(installRoot, { recursive: true, force: true });
    }

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
        'next_skill: kaola-workflow-research ' + activeProject,
        '',
      ].join('\n'));
      const output = execFileSync(process.execPath, [repairScript], {
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
    write(path.join(workflowRoot, 'ROADMAP.md'), '# Kaola-Workflow Roadmap\n');

    write(path.join(cache, 'code-explorer.md'), 'raw research output\n');
    write(path.join(cache, 'docs-lookup.md'), 'N/A - internal patterns sufficient\n');
    write(path.join(projectRoot, 'phase1-research.md'), phaseFile('Phase 1 - Research', [
      '| code-explorer | invoked | .cache/code-explorer.md | |',
      '| docs-lookup | N/A | .cache/docs-lookup.md | internal patterns sufficient |'
    ]));
    assertRepair(tmp, `kaola-workflow-ideation ${project}`, 2);

    write(path.join(cache, 'planner.md'), 'approach analysis\n');
    write(path.join(cache, 'advisor-ideation.md'), 'advisor gate\n');
    write(path.join(projectRoot, 'phase2-ideation.md'), phaseFile('Phase 2 - Ideation', [
      '| planner | invoked | .cache/planner.md | |',
      '| advisor ideation gate | invoked | .cache/advisor-ideation.md | |'
    ]));
    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `kaola-workflow-plan ${project}`, 3);

    write(path.join(cache, 'architect.md'), 'blueprint\n');
    write(path.join(cache, 'advisor-plan.md'), 'plan review\n');
    write(path.join(projectRoot, 'phase3-plan.md'), [
      '# Phase 3 - Plan: simulated-feature',
      '',
      '## Task List',
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
      '| blueprint revisions | N/A | .cache/advisor-plan.md | advisor found no gaps |',
      ''
    ].join('\n'));
    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `kaola-workflow-execute ${project}`, 4);

    write(path.join(projectRoot, 'phase4-progress.md'), [
      '# Phase 4 - Progress: simulated-feature',
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
    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `kaola-workflow-execute ${project}`, 4);

    write(path.join(projectRoot, 'phase4-progress.md'), read(path.join(projectRoot, 'phase4-progress.md')).replace(
      '| 1 | Add greeting | in_progress | | validation failed |',
      '| 1 | Add greeting | complete | src/greeting.js, test/greeting.test.js | validation passed |'
    ));
    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `kaola-workflow-review ${project}`, 5);

    write(path.join(cache, 'code-reviewer.md'), 'review passed\n');
    write(path.join(projectRoot, 'phase5-review.md'), phaseFile('Phase 5 - Review', [
      '| quality review | invoked | .cache/code-reviewer.md | |',
      '| security review | N/A | file-risk scan | no sensitive files touched |',
      '| review-fix executors | N/A | .cache/code-reviewer.md | no blocking findings |'
    ]));
    fs.rmSync(stateFile, { force: true });
    assertRepair(tmp, `kaola-workflow-finalize ${project}`, 6);

    write(path.join(cache, 'final-validation.md'), 'validation passed\n');
    write(path.join(cache, 'doc-docking.md'), 'DOCKED\n');
    write(path.join(projectRoot, 'phase6-summary.md'), phaseFile('Phase 6 - Summary', [
      '| final validation | invoked | .cache/final-validation.md | |',
      '| documentation docking | invoked | .cache/doc-docking.md | |',
      '| roadmap refresh | invoked | kaola-workflow/ROADMAP.md | |',
      '| archive completed folder | invoked | kaola-workflow/archive/simulated-feature | |',
      '| final commit and push | invoked | git status --short --branch | clean and synced |'
    ]));
    const finalOutput = runRepair(tmp, project);
    assert(finalOutput.includes('workflow is complete'), 'complete workflow should not be repaired again');

    // Case 5: cross-runtime co-work, two distinct projects
    const claimScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
    const classifierScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-classifier.js');
    const case5Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-case5-'));
    try {
      execFileSync('git', ['init', case5Dir], { encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: case5Dir, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: case5Dir, encoding: 'utf8' });
      fs.mkdirSync(path.join(case5Dir, 'kaola-workflow', '.locks'), { recursive: true });
      fs.mkdirSync(path.join(case5Dir, 'kaola-workflow', '.sessions'), { recursive: true });

      // Case 5a: claim project-alpha with runtime:claude
      const sidAlpha = 'aaaaaaaa-0000-0000-0000-000000000001';
      execFileSync(process.execPath, [
        claimScript, 'claim',
        '--session', sidAlpha,
        '--project', 'project-alpha',
        '--runtime', 'claude'
      ], { cwd: case5Dir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });

      const lockAlpha = JSON.parse(fs.readFileSync(
        path.join(case5Dir, 'kaola-workflow', '.locks', 'project-alpha.lock'), 'utf8'
      ));
      assert(lockAlpha.runtime === 'claude', 'Case 5a: project-alpha lock must have runtime=claude, got: ' + lockAlpha.runtime);
      assert(lockAlpha.project === 'project-alpha', 'Case 5a: project field must match');

      // Case 5b: claim project-beta with runtime:codex (different project, should succeed)
      const sidBeta = 'bbbbbbbb-0000-0000-0000-000000000002';
      execFileSync(process.execPath, [
        claimScript, 'claim',
        '--session', sidBeta,
        '--project', 'project-beta',
        '--runtime', 'codex'
      ], { cwd: case5Dir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });

      const lockBeta = JSON.parse(fs.readFileSync(
        path.join(case5Dir, 'kaola-workflow', '.locks', 'project-beta.lock'), 'utf8'
      ));
      assert(lockBeta.runtime === 'codex', 'Case 5b: project-beta lock must have runtime=codex, got: ' + lockBeta.runtime);
      assert(lockBeta.project === 'project-beta', 'Case 5b: project field must match');

      // Case 5c: double-claim on project-alpha must exit 2
      const sidAlpha2 = 'cccccccc-0000-0000-0000-000000000003';
      let doubleClaimExitCode = 0;
      try {
        execFileSync(process.execPath, [
          claimScript, 'claim',
          '--session', sidAlpha2,
          '--project', 'project-alpha',
          '--runtime', 'claude'
        ], { cwd: case5Dir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      } catch (e) {
        doubleClaimExitCode = e.status;
      }
      assert(doubleClaimExitCode === 2, 'Case 5c: double-claim on project-alpha must exit 2, got: ' + doubleClaimExitCode);

      // Case 5d: bootstrap with no open issues exits 1 (OFFLINE mode)
      const sidBootstrap = 'dddddddd-0000-0000-0000-000000000004';
      let bootstrapExitCode = 0;
      try {
        execFileSync(process.execPath, [
          claimScript, 'bootstrap',
          '--session', sidBootstrap,
          '--runtime', 'codex'
        ], { cwd: case5Dir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
      } catch (e) {
        bootstrapExitCode = e.status;
      }
      assert(bootstrapExitCode === 1, 'Case 5d: bootstrap with no open issues must exit 1, got: ' + bootstrapExitCode);

      // Case 5e: bootstrap without a preexisting session id claims one issue;
      // a second fresh bootstrap skips the locked issue and claims the next.
      {
        const binDir = path.join(case5Dir, 'bin');
        fs.mkdirSync(binDir, { recursive: true });
        const ghPath = path.join(binDir, 'gh');
        fs.writeFileSync(ghPath, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":11},{"number":12}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  printf '{"number":%s,"title":"Issue %s","body":"plugins/kaola-workflow/skills/kaola-workflow-next/SKILL.md","labels":[],"state":"OPEN"}' "$num" "$num"
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
        const env5e = {
          ...process.env,
          PATH: binDir + path.delimiter + (process.env.PATH || ''),
          HOME: case5Dir,
          KAOLA_WORKFLOW_OFFLINE: ''
        };
        delete env5e.KAOLA_SESSION_ID;
        delete env5e.CODEX_THREAD_ID;
        delete env5e.CLAUDE_SESSION_ID;

        const out5e1 = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'bootstrap', '--runtime', 'codex'
        ], { cwd: case5Dir, encoding: 'utf8', env: env5e }).trim());
        assert(out5e1.issue === 11, 'Case 5e-a: first bootstrap must pick issue 11, got: ' + out5e1.issue);
        assert(out5e1.session, 'Case 5e-a: bootstrap output must include generated session');

        const out5eOwned = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'bootstrap', '--session', out5e1.session, '--runtime', 'codex'
        ], { cwd: case5Dir, encoding: 'utf8', env: env5e }).trim());
        assert(out5eOwned.verdict === 'owned' && out5eOwned.issue === 11,
          'Case 5e-owned: same session must resume owned issue 11, got: ' + JSON.stringify(out5eOwned));

        const out5e2 = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'bootstrap', '--runtime', 'codex'
        ], { cwd: case5Dir, encoding: 'utf8', env: env5e }).trim());
        assert(out5e2.issue === 12, 'Case 5e-b: second bootstrap must skip locked issue 11 and pick 12, got: ' + out5e2.issue);
        assert(out5e2.session && out5e2.session !== out5e1.session, 'Case 5e-b: second bootstrap must generate an independent session');
      }

      // Case 5e2: packaged classifier exact-path behavior.
      {
        const classifierDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-case5e2-'));
        try {
          const locksDir = path.join(classifierDir, 'kaola-workflow', '.locks');
          const roadmapDir = path.join(classifierDir, 'kaola-workflow', '.roadmap');
          const claimedDir = path.join(classifierDir, 'kaola-workflow', 'claimed-plugin');
          fs.mkdirSync(locksDir, { recursive: true });
          fs.mkdirSync(roadmapDir, { recursive: true });
          fs.mkdirSync(claimedDir, { recursive: true });
          fs.writeFileSync(path.join(locksDir, 'claimed-plugin.lock'), JSON.stringify({
            project: 'claimed-plugin',
            session_id: 'sess-plugin-classifier',
            issue_number: 30,
            claimed_at: new Date().toISOString(),
            expires: new Date(Date.now() + 3600000).toISOString(),
            last_heartbeat: new Date().toISOString()
          }, null, 2));

          fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'),
            '# Phase 3\nFiles: scripts/kaola-workflow-claim.js\n');
          fs.writeFileSync(path.join(roadmapDir, 'issue-31.md'),
            'issue: #31\ntitle: exact script touch\nstatus: open\nworkflow_project: —\nnext_step: ready\ntouches:scripts/kaola-workflow-claim.js\n');
          const exactScript = JSON.parse(execFileSync(process.execPath, [
            classifierScript, 'classify', '--issue', '31'
          ], { cwd: classifierDir, encoding: 'utf8', env: { ...process.env, HOME: classifierDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim());
          assert(exactScript.verdict === 'red',
            'Case 5e2-a: exact shared script path must yield red, got: ' + exactScript.verdict);

          fs.writeFileSync(path.join(roadmapDir, 'issue-32.md'),
            'issue: #32\ntitle: different script touch\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: scripts/new-helper.js\n');
          const differentScript = JSON.parse(execFileSync(process.execPath, [
            classifierScript, 'classify', '--issue', '32'
          ], { cwd: classifierDir, encoding: 'utf8', env: { ...process.env, HOME: classifierDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim());
          assert(differentScript.verdict === 'yellow',
            'Case 5e2-b: different shared script path must remain yellow, got: ' + differentScript.verdict);

          fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'),
            '# Phase 3\nFiles: plugins/kaola-workflow/scripts/kaola-workflow-claim.js\n');
          fs.writeFileSync(path.join(roadmapDir, 'issue-33.md'),
            'issue: #33\ntitle: exact plugin touch\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: plugins/kaola-workflow/scripts/kaola-workflow-claim.js\n');
          const exactPlugin = JSON.parse(execFileSync(process.execPath, [
            classifierScript, 'classify', '--issue', '33'
          ], { cwd: classifierDir, encoding: 'utf8', env: { ...process.env, HOME: classifierDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim());
          assert(exactPlugin.verdict === 'red',
            'Case 5e2-c: exact plugin path must yield red, got: ' + exactPlugin.verdict);
        } finally {
          fs.rmSync(classifierDir, { recursive: true, force: true });
        }
      }

      // Case 5f: remote claim creates/applies workflow:in-progress label and
      // still posts the sentinel comment when assignment fails.
      {
        const binDir = path.join(case5Dir, 'bin-label');
        fs.mkdirSync(binDir, { recursive: true });
        const callLog = path.join(case5Dir, 'gh-label-calls.log');
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
  printf '[{"id":1900,"body":"Session claimed by sess-label <!-- kw:claim sess=sess-label -->"}]'
  exit 0
fi
exit 0
`);
        fs.chmodSync(ghPath, 0o755);
        execFileSync(process.execPath, [
          claimScript, 'claim',
          '--session', 'sess-label',
          '--project', 'project-label',
          '--issue', '19',
          '--runtime', 'codex'
        ], {
          cwd: case5Dir,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: binDir + path.delimiter + (process.env.PATH || ''),
            HOME: case5Dir,
            KAOLA_WORKFLOW_OFFLINE: ''
          }
        });
        const log = fs.readFileSync(callLog, 'utf8');
        assert(log.includes('label create workflow:in-progress'), 'Case 5f: claim must create workflow:in-progress label, got: ' + log);
        assert(log.includes('issue edit 19 --add-label workflow:in-progress'), 'Case 5f: claim must add workflow:in-progress label, got: ' + log);
        assert(log.includes('issue edit 19 --add-assignee @me'), 'Case 5f: claim must try to assign @me, got: ' + log);
        assert(log.includes('issue comment 19'), 'Case 5f: claim must still post sentinel comment, got: ' + log);
        assert(!log.includes('--title'), 'Case 5f: claim must not mutate issue title, got: ' + log);
      }

      // Case 5g: session lookup validates the current owner; handoff is explicit.
      {
        const case5gDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-case5g-'));
        try {
          execFileSync(process.execPath, [
            claimScript, 'claim',
            '--session', 'sess-plugin-5g',
            '--project', 'plugin-session',
            '--issue', '21',
            '--runtime', 'codex'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } });

          const fromLock = execFileSync(process.execPath, [
            claimScript, 'session', '--project', 'plugin-session', '--session', 'sess-plugin-5g'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim();
          assert(fromLock === 'sess-plugin-5g', 'Case 5g-a: matching lock owner must validate, got: ' + fromLock);

          let intruderCode = 0;
          try {
            execFileSync(process.execPath, [
              claimScript, 'session', '--project', 'plugin-session', '--session', 'sess-plugin-intruder'
            ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) { intruderCode = e.status || 1; }
          assert(intruderCode === 2, 'Case 5g-b: foreign owner must be occupied, got: ' + intruderCode);

          fs.unlinkSync(path.join(case5gDir, 'kaola-workflow', '.locks', 'plugin-session.lock'));
          const fromState = execFileSync(process.execPath, [
            claimScript, 'session', '--project', 'plugin-session', '--session', 'sess-plugin-5g'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim();
          assert(fromState === 'sess-plugin-5g', 'Case 5g-c: matching state-only owner must validate, got: ' + fromState);

          const handoff = execFileSync(process.execPath, [
            claimScript, 'handoff', '--project', 'plugin-session', '--session', 'sess-plugin-5g-new'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          assert(JSON.parse(handoff).session === 'sess-plugin-5g-new', 'Case 5g-d: handoff must return new session');
        } finally {
          fs.rmSync(case5gDir, { recursive: true, force: true });
        }
      }

      // Case 5h: cross-session phase matrix for the Codex plugin scripts.
      {
        const matrixDir = path.join(case5Dir, 'matrix');
        const matrixLocks = path.join(matrixDir, 'kaola-workflow', '.locks');
        const matrixBin = path.join(matrixDir, 'bin');
        fs.mkdirSync(matrixLocks, { recursive: true });
        fs.mkdirSync(matrixBin, { recursive: true });
        execFileSync('git', ['init', matrixDir], { encoding: 'utf8' });

        const phaseMatrix = [
          { phase: 1, phaseName: 'Research', nextSkill: 'kaola-workflow-research' },
          { phase: 2, phaseName: 'Ideation', nextSkill: 'kaola-workflow-ideation' },
          { phase: 3, phaseName: 'Plan', nextSkill: 'kaola-workflow-plan' },
          { phase: 4, phaseName: 'Execute', nextSkill: 'kaola-workflow-execute' },
          { phase: 5, phaseName: 'Review', nextSkill: 'kaola-workflow-review' },
          { phase: 6, phaseName: 'Finalize', nextSkill: 'kaola-workflow-finalize' },
        ];

        function writeStageProject(baseDir, spec, projectName, issue, sessionId, withLock) {
          const projectDir = path.join(baseDir, 'kaola-workflow', projectName);
          fs.mkdirSync(projectDir, { recursive: true });
          const now = new Date(Date.now() + spec.phase * 1000).toISOString();
          write(path.join(projectDir, 'workflow-state.md'), [
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
            'next_skill: ' + spec.nextSkill + ' ' + projectName,
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
          if (spec.phase >= 2) write(path.join(projectDir, 'phase1-research.md'), 'area:codex-stage-' + spec.phase + '\n');
          if (spec.phase >= 3) write(path.join(projectDir, 'phase2-ideation.md'), '# Phase 2\n');
          if (spec.phase >= 4) write(path.join(projectDir, 'phase3-plan.md'), '# Phase 3\nFiles: commands/codex-primary-' + spec.phase + '.md\n');
          if (spec.phase >= 5) write(path.join(projectDir, 'phase4-progress.md'), '# Phase 4\ncomplete\n');
          if (spec.phase >= 6) write(path.join(projectDir, 'phase5-review.md'), '# Phase 5\nreview passed\n');
          if (withLock) {
            write(path.join(matrixLocks, projectName + '.lock'), JSON.stringify({
              project: projectName,
              session_id: sessionId,
              machine_id: 'codex-machine-' + spec.phase,
              claimed_at: now,
              expires: new Date(Date.now() + 3600000).toISOString(),
              last_heartbeat: now,
              issue_number: issue,
              claim_comment_id: null,
              sink: 'merge',
              runtime: 'codex'
            }, null, 2) + '\n');
          }
        }

        function exitCode(args, env) {
          try {
            execFileSync(process.execPath, args, { cwd: matrixDir, encoding: 'utf8', env });
            return 0;
          } catch (e) {
            return e.status || 1;
          }
        }

        function writeBootstrapGhShim(sameIssue, freeIssue) {
          const ghPath = path.join(matrixBin, 'gh');
          write(ghPath, [
            '#!/bin/sh',
            'if [ "$1" = "issue" ] && [ "$2" = "list" ]; then',
            '  printf \'[{"number":' + sameIssue + '},{"number":' + freeIssue + '}]\'',
            '  exit 0',
            'fi',
            'if [ "$1" = "issue" ] && [ "$2" = "view" ]; then',
            '  printf \'{"number":%s,"title":"Issue %s","body":"hooks/codex-free-' + freeIssue + '.js","labels":[],"state":"OPEN"}\' "$3" "$3"',
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
          const issue = 600 + spec.phase;
          const freeIssue = 700 + spec.phase;
          const projectName = 'codex-stage-' + spec.phase + '-primary';
          const sessionId = 'sess-codex-stage-' + spec.phase;
          writeStageProject(matrixDir, spec, projectName, issue, sessionId, true);

          const sessionOut = execFileSync(process.execPath, [
            claimScript, 'session', '--project', projectName, '--session', sessionId
          ], { cwd: matrixDir, encoding: 'utf8', env: { ...process.env, HOME: matrixDir } }).trim();
          assert(sessionOut === sessionId, 'Case 5h phase ' + spec.phase + ': matching session must validate primary owner');

          const duplicateClaimCode = exitCode([
            claimScript, 'claim',
            '--session', 'sess-codex-stage-' + spec.phase + '-intruder',
            '--project', 'codex-stage-' + spec.phase + '-intruder',
            '--issue', String(issue),
            '--runtime', 'claude'
          ], { ...process.env, HOME: matrixDir, KAOLA_WORKFLOW_OFFLINE: '1' });
          assert(duplicateClaimCode === 2,
            'Case 5h phase ' + spec.phase + ': direct duplicate issue claim must exit 2, got ' + duplicateClaimCode);

          const duplicateClassifyCode = exitCode([
            classifierScript, 'classify', '--issue', String(issue)
          ], { ...process.env, HOME: matrixDir, KAOLA_WORKFLOW_OFFLINE: '1' });
          assert(duplicateClassifyCode === 2,
            'Case 5h phase ' + spec.phase + ': classifier must skip occupied issue, got ' + duplicateClassifyCode);

          writeBootstrapGhShim(issue, freeIssue);
          const picked = JSON.parse(execFileSync(process.execPath, [
            claimScript, 'bootstrap',
            '--session', 'sess-codex-stage-' + spec.phase + '-secondary',
            '--runtime', 'codex'
          ], {
            cwd: matrixDir,
            encoding: 'utf8',
            env: { ...process.env, PATH: matrixBin + path.delimiter + (process.env.PATH || ''), HOME: matrixDir, KAOLA_WORKFLOW_OFFLINE: '' }
          }).trim());
          assert(picked.issue === freeIssue,
            'Case 5h phase ' + spec.phase + ': secondary bootstrap must pick free issue #' + freeIssue + ', got #' + picked.issue);
          assert(fs.existsSync(path.join(matrixLocks, projectName + '.lock')),
            'Case 5h phase ' + spec.phase + ': primary lock must remain');
          assert(fs.existsSync(path.join(matrixLocks, 'issue-' + freeIssue + '.lock')),
            'Case 5h phase ' + spec.phase + ': secondary free lock must exist');
        }

        for (const spec of phaseMatrix) {
          const issue = 800 + spec.phase;
          const projectName = 'codex-state-stage-' + spec.phase;
          const sessionId = 'sess-codex-state-stage-' + spec.phase;
          writeStageProject(matrixDir, spec, projectName, issue, sessionId, false);
          const sessionOut = execFileSync(process.execPath, [
            claimScript, 'session', '--project', projectName, '--session', sessionId
          ], { cwd: matrixDir, encoding: 'utf8', env: { ...process.env, HOME: matrixDir } }).trim();
          assert(sessionOut === sessionId,
            'Case 5h state-only phase ' + spec.phase + ': matching session must validate workflow-state lease');
          const duplicateClaimCode = exitCode([
            claimScript, 'claim',
            '--session', 'sess-codex-state-stage-' + spec.phase + '-intruder',
            '--project', 'codex-state-stage-' + spec.phase + '-intruder',
            '--issue', String(issue)
          ], { ...process.env, HOME: matrixDir, KAOLA_WORKFLOW_OFFLINE: '1' });
          assert(duplicateClaimCode === 2,
            'Case 5h state-only phase ' + spec.phase + ': direct claim must respect state-only active issue, got ' + duplicateClaimCode);
        }

        const completeDir = path.join(matrixDir, 'kaola-workflow', 'codex-complete');
        write(path.join(completeDir, 'workflow-state.md'), [
          '# Kaola-Workflow State',
          '',
          '## Project',
          'name: codex-complete',
          'status: complete',
          '',
          '## Sink',
          'issue_number: 950',
          ''
        ].join('\n'));
        const completedClaimCode = exitCode([
          claimScript, 'claim',
          '--session', 'sess-codex-completed-reclaim',
          '--project', 'codex-completed-reclaim',
          '--issue', '950'
        ], { ...process.env, HOME: matrixDir, KAOLA_WORKFLOW_OFFLINE: '1' });
        assert(completedClaimCode === 0,
          'Case 5h: completed workflow-state must not block fresh claim, got ' + completedClaimCode);
      }

      // Case 5i: locks are isolated by project — all claimed projects must still exist independently
      assert(fs.existsSync(path.join(case5Dir, 'kaola-workflow', '.locks', 'project-alpha.lock')),
        'Case 5i: project-alpha lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, 'kaola-workflow', '.locks', 'project-beta.lock')),
        'Case 5i: project-beta lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, 'kaola-workflow', '.locks', 'issue-11.lock')),
        'Case 5i: issue-11 lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, 'kaola-workflow', '.locks', 'issue-12.lock')),
        'Case 5i: issue-12 lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, 'kaola-workflow', '.locks', 'project-label.lock')),
        'Case 5i: project-label lock must still exist');

      const finalAlpha = JSON.parse(fs.readFileSync(
        path.join(case5Dir, 'kaola-workflow', '.locks', 'project-alpha.lock'), 'utf8'
      ));
      const finalBeta = JSON.parse(fs.readFileSync(
        path.join(case5Dir, 'kaola-workflow', '.locks', 'project-beta.lock'), 'utf8'
      ));
      assert(finalAlpha.runtime !== finalBeta.runtime, 'Case 5i: locks must have different runtime fields');
    } finally {
      fs.rmSync(case5Dir, { recursive: true, force: true });
    }

    console.log('Kaola-Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main();
