#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const pluginRoot = path.resolve(__dirname, '..');
const repairScript = path.join(pluginRoot, 'scripts', 'kaola-workflow-repair-state.js');
const installAgentsScript = path.join(pluginRoot, 'scripts', 'install-codex-agent-profiles.js');
const project = 'simulated-feature';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const waitExit = (child, timeoutMs) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('exit timeout')), timeoutMs);
  child.on('exit', (code, signal) => { clearTimeout(t); resolve({ code, signal }); });
});

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

async function main() {
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
      fs.mkdirSync(path.join(case5Dir, '.git', 'kaola-workflow', '.locks'), { recursive: true });
      fs.mkdirSync(path.join(case5Dir, '.git', 'kaola-workflow', '.sessions'), { recursive: true });

      // Case 5a: claim project-alpha with runtime:claude
      const sidAlpha = 'aaaaaaaa-0000-0000-0000-000000000001';
      execFileSync(process.execPath, [
        claimScript, 'claim',
        '--session', sidAlpha,
        '--project', 'project-alpha',
        '--runtime', 'claude'
      ], { cwd: case5Dir, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });

      const lockAlpha = JSON.parse(fs.readFileSync(
        path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-alpha.lock'), 'utf8'
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
        path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-beta.lock'), 'utf8'
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
          const locksDir = path.join(classifierDir, '.git', 'kaola-workflow', '.locks');
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

      // Case 5e2-h: red — host-project path src/foo.ts overlap on generalized FILE_PATH_REGEX
      {
        const case5e2hDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-plugin-5e2h-'));
        try {
          const locksDir = path.join(case5e2hDir, '.git', 'kaola-workflow', '.locks');
          const roadmapDir = path.join(case5e2hDir, 'kaola-workflow', '.roadmap');
          const claimedDir = path.join(case5e2hDir, 'kaola-workflow', 'host-claimed');
          fs.mkdirSync(locksDir, { recursive: true });
          fs.mkdirSync(roadmapDir, { recursive: true });
          fs.mkdirSync(claimedDir, { recursive: true });
          // Claimed lock is for issue 60; candidate being classified is issue 61
          fs.writeFileSync(path.join(locksDir, 'host-claimed.lock'), JSON.stringify({
            project: 'host-claimed', session_id: 'sess-5e2h', issue_number: 60,
            claimed_at: new Date().toISOString(),
            expires: new Date(Date.now() + 3600000).toISOString(),
            last_heartbeat: new Date().toISOString()
          }, null, 2));
          // Claimed lock's phase3 plan references src/foo.ts
          fs.writeFileSync(path.join(claimedDir, 'phase3-plan.md'),
            '# Phase 3\nTouches: src/foo.ts\n');
          // Candidate issue 61 also touches src/foo.ts
          fs.writeFileSync(path.join(roadmapDir, 'issue-61.md'),
            'issue: #61\ntitle: host feature\nstatus: open\nworkflow_project: —\nnext_step: ready\nbody: Modifies src/foo.ts\n');
          const r5e2h = JSON.parse(execFileSync(process.execPath, [
            classifierScript, 'classify', '--issue', '61'
          ], { cwd: case5e2hDir, encoding: 'utf8', env: { ...process.env, HOME: case5e2hDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim());
          assert(r5e2h.verdict === 'red',
            'Case 5e2-h: exact host-path overlap (src/foo.ts) must yield red, got: ' + r5e2h.verdict);
          assert(r5e2h.reasoning.includes('exact file path'),
            'Case 5e2-h: reasoning must mention "exact file path", got: ' + r5e2h.reasoning);
        } finally {
          fs.rmSync(case5e2hDir, { recursive: true, force: true });
        }
      }

      // Case 5e2-i: green — ghost lock (projectDir missing) must be skipped; no path info → green
      {
        const case5e2iDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-plugin-5e2i-'));
        try {
          const locksDir = path.join(case5e2iDir, '.git', 'kaola-workflow', '.locks');
          const roadmapDir = path.join(case5e2iDir, 'kaola-workflow', '.roadmap');
          fs.mkdirSync(locksDir, { recursive: true });
          fs.mkdirSync(roadmapDir, { recursive: true });
          // Ghost lock claims issue 50; projectDir 'ghost-project' is NOT created
          fs.writeFileSync(path.join(locksDir, 'ghost-project.lock'), JSON.stringify({
            project: 'ghost-project', session_id: 'sess-5e2i', issue_number: 50,
            claimed_at: new Date().toISOString(),
            expires: new Date(Date.now() + 3600000).toISOString(),
            last_heartbeat: new Date().toISOString()
          }, null, 2));
          // Candidate issue 51 has no path info
          fs.writeFileSync(path.join(roadmapDir, 'issue-51.md'),
            'issue: #51\ntitle: no metadata\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
          const r5e2i = JSON.parse(execFileSync(process.execPath, [
            classifierScript, 'classify', '--issue', '51'
          ], { cwd: case5e2iDir, encoding: 'utf8', env: { ...process.env, HOME: case5e2iDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim());
          assert(r5e2i.verdict === 'green',
            'Case 5e2-i: ghost lock (projectDir missing) must be skipped; expected green, got: ' + r5e2i.verdict);
        } finally {
          fs.rmSync(case5e2iDir, { recursive: true, force: true });
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

      // Case 5g: session lookup validates the current owner; handoff is explicit and guarded.
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

          const claudeDir5g = path.join(case5gDir, '.claude', 'projects', fs.realpathSync(case5gDir).replace(/[\\/]/g, '-'));
          fs.mkdirSync(claudeDir5g, { recursive: true });
          write(path.join(claudeDir5g, 'sess-plugin-5g.jsonl'), '{}\n');

          let canHandoffCode = 0;
          let canHandoffOut = '';
          try {
            canHandoffOut = execFileSync(process.execPath, [
              claimScript, 'can-handoff', '--project', 'plugin-session', '--session', 'sess-plugin-5g-new'
            ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) {
            canHandoffCode = e.status || 1;
            canHandoffOut = e.stdout || '';
          }
          assert(canHandoffCode === 2, 'Case 5g-d: can-handoff must reject live owner, got: ' + canHandoffCode);
          assert(canHandoffOut.includes('claude-session-jsonl'),
            'Case 5g-d: can-handoff must report local Claude session evidence, got: ' + canHandoffOut);

          let rejectedCode = 0;
          try {
            execFileSync(process.execPath, [
              claimScript, 'handoff', '--project', 'plugin-session', '--session', 'sess-plugin-5g-new'
            ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) { rejectedCode = e.status || 1; }
          assert(rejectedCode === 2, 'Case 5g-e: default handoff must reject live owner, got: ' + rejectedCode);

          const handoff = execFileSync(process.execPath, [
            claimScript, 'handoff', '--project', 'plugin-session', '--session', 'sess-plugin-5g-new', '--force-live-takeover'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          assert(JSON.parse(handoff).session === 'sess-plugin-5g-new', 'Case 5g-f: force handoff must return new session');
          const handoffReceipt = execFileSync(process.execPath, [
            claimScript, 'verify-startup', '--project', 'plugin-session', '--session', 'sess-plugin-5g-new'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim();
          assert(JSON.parse(handoffReceipt).authorized === true,
            'Case 5g-f: force handoff must write an owned startup receipt, got: ' + handoffReceipt);

          fs.unlinkSync(path.join(case5gDir, '.git', 'kaola-workflow', '.locks', 'plugin-session.lock'));
          const fromState = execFileSync(process.execPath, [
            claimScript, 'session', '--project', 'plugin-session', '--session', 'sess-plugin-5g-new'
          ], { cwd: case5gDir, encoding: 'utf8', env: { ...process.env, HOME: case5gDir, KAOLA_WORKFLOW_OFFLINE: '1' } }).trim();
          assert(fromState === 'sess-plugin-5g-new', 'Case 5g-g: matching state-only owner must validate, got: ' + fromState);
        } finally {
          fs.rmSync(case5gDir, { recursive: true, force: true });
        }
      }

      // Case 5i: claim:none receipt cannot silently take over a dead-looking project.
      // Regression for issue #26 Bug 1 (claim:none exemption in startupReceiptHandoffBlocker).
      {
        const case5iDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-case5i-'));
        try {
          fs.mkdirSync(path.join(case5iDir, '.git', 'kaola-workflow', '.locks'), { recursive: true });
          fs.mkdirSync(path.join(case5iDir, '.git', 'kaola-workflow', '.sessions'), { recursive: true });
          fs.mkdirSync(path.join(case5iDir, 'kaola-workflow', 'issue-99'), { recursive: true });

          write(path.join(case5iDir, '.git', 'kaola-workflow', '.locks', 'issue-99.lock'),
            JSON.stringify({
              project: 'issue-99',
              issue_number: 99,
              session_id: 'sess-5i-owner',
              machine_id: 'machine-old',
              expires: '2020-01-01T00:00:00.000Z',
              last_heartbeat: '2020-01-01T00:00:00.000Z',
              runtime: 'claude'
            }, null, 2) + '\n');
          write(path.join(case5iDir, 'kaola-workflow', 'issue-99', 'workflow-state.md'),
            'status: active\nsession_id: sess-5i-owner\n\n## Lease\nsession_id: sess-5i-owner\n');
          write(path.join(case5iDir, '.git', 'kaola-workflow', '.sessions', 'sess-5i-new.startup.json'),
            JSON.stringify({
              startup_completed: true,
              session: 'sess-5i-new',
              project: null,
              issue: null,
              selected_issue: null,
              selected_project: null,
              verdict: 'none',
              claim: 'none',
              skipped: [{ issue: 99, verdict: 'skipped', reason: 'already claimed' }]
            }, null, 2) + '\n');

          let r5iCanCode = 0;
          let r5iCanOut = '';
          try {
            r5iCanOut = execFileSync(process.execPath, [
              claimScript, 'can-handoff', '--project', 'issue-99', '--session', 'sess-5i-new'
            ], { cwd: case5iDir, encoding: 'utf8', env: { ...process.env, HOME: case5iDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) { r5iCanCode = e.status || 1; r5iCanOut = e.stdout || ''; }
          assert(r5iCanCode === 2,
            'Case 5i-a: can-handoff must reject claim:none receipt even when owner looks dead, got ' + r5iCanCode + '\nstdout: ' + r5iCanOut);
          assert(r5iCanOut.includes('startup-receipt'),
            'Case 5i-a: can-handoff must report startup-receipt blocker for claim:none, got: ' + r5iCanOut);

          let r5iDefaultCode = 0;
          try {
            execFileSync(process.execPath, [
              claimScript, 'handoff', '--project', 'issue-99', '--session', 'sess-5i-new'
            ], { cwd: case5iDir, encoding: 'utf8', env: { ...process.env, HOME: case5iDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) { r5iDefaultCode = e.status || 1; }
          assert(r5iDefaultCode === 2,
            'Case 5i-b: default handoff must reject claim:none receipt, got ' + r5iDefaultCode);

          execFileSync(process.execPath, [
            claimScript, 'handoff', '--project', 'issue-99', '--session', 'sess-5i-new', '--force-live-takeover'
          ], { cwd: case5iDir, encoding: 'utf8', env: { ...process.env, HOME: case5iDir, KAOLA_WORKFLOW_OFFLINE: '1' } });
          const r5iForceState = fs.readFileSync(path.join(case5iDir, 'kaola-workflow', 'issue-99', 'workflow-state.md'), 'utf8');
          assert(r5iForceState.includes('session_id: sess-5i-new'),
            'Case 5i-c: forced handoff must update workflow-state lease');
        } finally {
          fs.rmSync(case5iDir, { recursive: true, force: true });
        }
      }

      // Case 5j: liveness lookup must match Claude Code's encoding when the repo
      // root contains a '.' segment (regression for issue #26 Bug 2).
      {
        const case5jParent = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-case5j-'));
        const case5jDir = path.join(case5jParent, '.worktree', 'live-owner');
        fs.mkdirSync(case5jDir, { recursive: true });
        try {
          execFileSync('git', ['init', case5jDir], { encoding: 'utf8' });
          execFileSync('git', ['-C', case5jDir, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
          execFileSync(process.execPath, [
            claimScript, 'claim',
            '--session', 'sess-5j-owner',
            '--issue', '77',
            '--project', 'plugin5j',
            '--branch', 'workflow/issue-77-plugin5j'
          ], { cwd: case5jDir, encoding: 'utf8', env: { ...process.env, HOME: case5jDir, KAOLA_WORKFLOW_OFFLINE: '1' } });

          // Encode the way Claude Code stores its JSONL: realpath + '/', '\\', '.' -> '-'.
          const claudeEncoded = fs.realpathSync(case5jDir).replace(/[./\\]/g, '-');
          const claudeDir5j = path.join(fs.realpathSync(case5jParent), '.claude', 'projects', claudeEncoded);
          fs.mkdirSync(claudeDir5j, { recursive: true });
          write(path.join(claudeDir5j, 'sess-5j-owner.jsonl'), '{}\n');

          let r5jCanCode = 0;
          let r5jCanOut = '';
          try {
            r5jCanOut = execFileSync(process.execPath, [
              claimScript, 'can-handoff', '--project', 'plugin5j', '--session', 'sess-5j-new'
            ], { cwd: case5jDir, encoding: 'utf8', env: { ...process.env, HOME: case5jParent, KAOLA_WORKFLOW_OFFLINE: '1' } });
          } catch (e) { r5jCanCode = e.status || 1; r5jCanOut = e.stdout || ''; }
          assert(r5jCanCode === 2,
            'Case 5j-a: can-handoff must reject when JSONL exists at the dotted-path encoding, got ' + r5jCanCode + '\nstdout: ' + r5jCanOut);
          assert(r5jCanOut.includes('claude-session-jsonl'),
            'Case 5j-a: liveness check must find JSONL under Claude-encoded dotted path, got: ' + r5jCanOut);
        } finally {
          fs.rmSync(case5jParent, { recursive: true, force: true });
        }
      }

      // Case 5h: cross-session phase matrix for the Codex plugin scripts.
      {
        const matrixDir = path.join(case5Dir, 'matrix');
        const matrixLocks = path.join(matrixDir, '.git', 'kaola-workflow', '.locks');
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

      // Case 5i: real parallel bootstrap coordination and claim-race retry.
      {
        const retryDir = path.join(case5Dir, 'retry-race');
        const retryBin = path.join(retryDir, 'bin');
        const retryLocks = path.join(retryDir, '.git', 'kaola-workflow', '.locks');
        fs.mkdirSync(retryBin, { recursive: true });
        fs.mkdirSync(retryLocks, { recursive: true });
        execFileSync('git', ['init', retryDir], { encoding: 'utf8' });
        const retryGh = path.join(retryBin, 'gh');
        write(retryGh, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":931},{"number":932}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  if [ "$num" = "931" ]; then
    cat > "${retryLocks}/issue-931.lock" <<'JSON'
{
  "project": "issue-931",
  "session_id": "sess-plugin-race-winner",
  "machine_id": "plugin-race-machine",
  "claimed_at": "2026-05-15T00:00:00.000Z",
  "expires": "2099-01-01T00:00:00.000Z",
  "last_heartbeat": "2026-05-15T00:00:00.000Z",
  "issue_number": 931,
  "claim_comment_id": null,
  "sink": "merge",
  "runtime": "codex"
}
JSON
  fi
  printf '{"number":%s,"title":"Plugin Race %s","body":"commands/plugin-race-%s.md","labels":[],"state":"OPEN"}' "$num" "$num" "$num"
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
        const retryPick = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'bootstrap',
          '--session', 'sess-plugin-race-retry',
          '--runtime', 'codex'
        ], {
          cwd: retryDir,
          encoding: 'utf8',
          env: { ...process.env, PATH: retryBin + path.delimiter + (process.env.PATH || ''), HOME: retryDir }
        }).trim());
        assert(retryPick.issue === 932,
          'Case 5i-a: plugin bootstrap must retry after issue 931 race and claim 932, got #' + retryPick.issue);
        assert(fs.existsSync(path.join(retryLocks, 'issue-931.lock')), 'Case 5i-a: injected race winner lock must remain');
        assert(fs.existsSync(path.join(retryLocks, 'issue-932.lock')), 'Case 5i-a: retry lock for issue 932 must exist');

        const parallelDir = path.join(case5Dir, 'parallel-bootstrap');
        const parallelBin = path.join(parallelDir, 'bin');
        const parallelLocks = path.join(parallelDir, '.git', 'kaola-workflow', '.locks');
        fs.mkdirSync(parallelBin, { recursive: true });
        fs.mkdirSync(parallelLocks, { recursive: true });
        execFileSync('git', ['init', parallelDir], { encoding: 'utf8' });
        const parallelGh = path.join(parallelBin, 'gh');
        write(parallelGh, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":941},{"number":942}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  sleep 0.05
  num="$3"
  printf '{"number":%s,"title":"Plugin Parallel %s","body":"commands/plugin-parallel-%s.md","labels":[],"state":"OPEN"}' "$num" "$num" "$num"
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
            cwd: parallelDir,
            env: { ...process.env, PATH: parallelBin + path.delimiter + (process.env.PATH || ''), HOME: parallelDir },
            stdio: ['ignore', 'pipe', 'pipe']
          });
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', chunk => { stdout += chunk.toString(); });
          child.stderr.on('data', chunk => { stderr += chunk.toString(); });
          return { child, session, get stdout() { return stdout; }, get stderr() { return stderr; } };
        }

        const a = spawnBootstrap('sess-plugin-parallel-a');
        const b = spawnBootstrap('sess-plugin-parallel-b');
        const [ra, rb] = await Promise.all([waitExit(a.child, 5000), waitExit(b.child, 5000)]);
        assert(ra.code === 0, 'Case 5i-b: plugin session A failed: stdout=' + a.stdout + ' stderr=' + a.stderr);
        assert(rb.code === 0, 'Case 5i-b: plugin session B failed: stdout=' + b.stdout + ' stderr=' + b.stderr);
        const picks = [JSON.parse(a.stdout.trim()), JSON.parse(b.stdout.trim())];
        const issues = new Set(picks.map(p => p.issue));
        const sessions = new Set(picks.map(p => p.session));
        assert(issues.has(941) && issues.has(942) && issues.size === 2,
          'Case 5i-b: plugin parallel sessions must split issues 941 and 942, got: ' + JSON.stringify(picks));
        assert(sessions.has('sess-plugin-parallel-a') && sessions.has('sess-plugin-parallel-b'),
          'Case 5i-b: plugin parallel output must preserve session ids, got: ' + JSON.stringify(picks));
        assert(fs.existsSync(path.join(parallelLocks, 'issue-941.lock')), 'Case 5i-b: issue 941 lock missing');
        assert(fs.existsSync(path.join(parallelLocks, 'issue-942.lock')), 'Case 5i-b: issue 942 lock missing');
      }

      // Case 5k: startup transaction syncs issue roadmap, writes receipt,
      // records skipped claimed issues, and skips dependency-blocked issues.
      {
        const startupDir = path.join(case5Dir, 'startup-transaction');
        const startupBin = path.join(startupDir, 'bin');
        fs.mkdirSync(startupBin, { recursive: true });
        execFileSync('git', ['init', startupDir], { encoding: 'utf8' });
        const startupGh = path.join(startupBin, 'gh');
        write(startupGh, `#!/bin/sh
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then
  printf '[{"number":951,"title":"plugin queued startup","state":"OPEN","labels":[{"name":"workflow:queued"}],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/951"},{"number":952,"title":"plugin blocked startup","state":"OPEN","labels":[],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/952"},{"number":953,"title":"plugin next startup","state":"OPEN","labels":[],"updatedAt":"2026-05-15T00:00:00Z","url":"https://github.com/test/repo/issues/953"}]'
  exit 0
fi
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  num="$3"
  case "$num" in
    951) printf '{"number":951,"title":"plugin queued startup","body":"plugins/kaola-workflow/skills/startup-951.md","labels":[],"state":"OPEN"}' ;;
    952) printf '{"number":952,"title":"plugin blocked startup","body":"plugins/kaola-workflow/skills/startup-952.md","labels":[{"name":"depends-on:#951"}],"state":"OPEN"}' ;;
    953) printf '{"number":953,"title":"plugin next startup","body":"plugins/kaola-workflow/skills/startup-953.md","labels":[],"state":"OPEN"}' ;;
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
        const startupEnv = { ...process.env, PATH: startupBin + path.delimiter + (process.env.PATH || ''), HOME: startupDir };
        const first = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-plugin-startup-a',
          '--runtime', 'codex',
          '--target-issue', '951'
        ], { cwd: startupDir, encoding: 'utf8', env: startupEnv }).trim());
        assert(first.startup_completed === true && first.issue === 951 && first.claim === 'acquired',
          'Case 5k-a: startup must claim explicitly targeted issue 951 and report receipt fields, got: ' + JSON.stringify(first));
        assert(first.issue_sync === 'ok' && first.roadmap_sync === 'ok',
          'Case 5k-a: startup must sync plugin roadmap, got: ' + JSON.stringify(first));
        assert(fs.existsSync(path.join(startupDir, '.git', 'kaola-workflow', '.sessions', 'sess-plugin-startup-a.startup.json')),
          'Case 5k-a: startup receipt missing');
        assert(fs.existsSync(path.join(startupDir, 'kaola-workflow', '.roadmap', 'issue-952.md')),
          'Case 5k-a: issue-ahead-of-roadmap file missing');
        const verifyFirst = execFileSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-plugin-startup-a',
          '--project', 'issue-951'
        ], { cwd: startupDir, encoding: 'utf8', env: startupEnv }).trim();
        assert(JSON.parse(verifyFirst).authorized === true,
          'Case 5k-a: verify-startup must authorize the acquired project, got: ' + verifyFirst);
        let verifyWrongCode = 0;
        try {
          execFileSync(process.execPath, [
            claimScript, 'verify-startup',
            '--session', 'sess-plugin-startup-a',
            '--project', 'issue-953'
          ], { cwd: startupDir, encoding: 'utf8', env: startupEnv });
        } catch (e) { verifyWrongCode = e.status || 1; }
        assert(verifyWrongCode === 2,
          'Case 5k-a: verify-startup must reject a different project for the same receipt, got: ' + verifyWrongCode);
        const second = JSON.parse(execFileSync(process.execPath, [
          claimScript, 'startup',
          '--session', 'sess-plugin-startup-b',
          '--runtime', 'codex',
          '--target-issue', '953'
        ], { cwd: startupDir, encoding: 'utf8', env: startupEnv }).trim());
        assert(second.issue === 953 && second.claim === 'acquired',
          'Case 5k-b: second startup must claim explicitly targeted issue 953, got: ' + JSON.stringify(second));
        assert(second.target_source === 'user_directed',
          'Case 5k-b: receipt must record target_source: user_directed, got: ' + JSON.stringify(second));
        let verifySecondForFirstCode = 0;
        try {
          execFileSync(process.execPath, [
            claimScript, 'verify-startup',
            '--session', 'sess-plugin-startup-b',
            '--project', 'issue-951'
          ], { cwd: startupDir, encoding: 'utf8', env: startupEnv });
        } catch (e) { verifySecondForFirstCode = e.status || 1; }
        assert(verifySecondForFirstCode === 2,
          'Case 5k-b: second startup receipt must not authorize issue 951, got: ' + verifySecondForFirstCode);
        const verifySecond = execFileSync(process.execPath, [
          claimScript, 'verify-startup',
          '--session', 'sess-plugin-startup-b',
          '--project', 'issue-953'
        ], { cwd: startupDir, encoding: 'utf8', env: startupEnv }).trim();
        assert(JSON.parse(verifySecond).authorized === true,
          'Case 5k-b: second startup receipt must authorize issue 953, got: ' + verifySecond);

        let thirdCode = 0;
        let thirdStdout = '';
        try {
          thirdStdout = execFileSync(process.execPath, [
            claimScript, 'startup',
            '--session', 'sess-plugin-startup-c',
            '--runtime', 'codex'
          ], { cwd: startupDir, encoding: 'utf8', env: startupEnv });
        } catch (e) {
          thirdCode = e.status || 1;
          thirdStdout = e.stdout || '';
        }
        assert(thirdCode === 1, 'Case 5k-c: no-target startup must exit 1, got: ' + thirdCode);
        const thirdReceipt = JSON.parse(thirdStdout.trim());
        assert(thirdReceipt.claim === 'none' && thirdReceipt.startup_completed === true,
          'Case 5k-c: no-target startup must write a claim:none receipt, got: ' + JSON.stringify(thirdReceipt));
        assert(thirdReceipt.verdict === 'no_target',
          'Case 5k-c: no-target startup must return verdict: no_target, got: ' + JSON.stringify(thirdReceipt));
        let verifyThirdCode = 0;
        let verifyThirdOut = '';
        try {
          verifyThirdOut = execFileSync(process.execPath, [
            claimScript, 'verify-startup',
            '--session', 'sess-plugin-startup-c',
            '--project', 'issue-951'
          ], { cwd: startupDir, encoding: 'utf8', env: startupEnv });
        } catch (e) {
          verifyThirdCode = e.status || 1;
          verifyThirdOut = e.stdout || '';
        }
        assert(verifyThirdCode === 2, 'Case 5k-c: claim:none receipt must not authorize phase work, got: ' + verifyThirdCode);
        assert(verifyThirdOut.includes('did not acquire or own any project'),
          'Case 5k-c: claim:none verifier must explain the startup receipt gap, got: ' + verifyThirdOut);
      }

      // Case 5j: locks are isolated by project — all claimed projects must still exist independently
      assert(fs.existsSync(path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-alpha.lock')),
        'Case 5j: project-alpha lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-beta.lock')),
        'Case 5j: project-beta lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'issue-11.lock')),
        'Case 5j: issue-11 lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'issue-12.lock')),
        'Case 5j: issue-12 lock must still exist');
      assert(fs.existsSync(path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-label.lock')),
        'Case 5j: project-label lock must still exist');

      const finalAlpha = JSON.parse(fs.readFileSync(
        path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-alpha.lock'), 'utf8'
      ));
      const finalBeta = JSON.parse(fs.readFileSync(
        path.join(case5Dir, '.git', 'kaola-workflow', '.locks', 'project-beta.lock'), 'utf8'
      ));
      assert(finalAlpha.runtime !== finalBeta.runtime, 'Case 5j: locks must have different runtime fields');
    } finally {
      fs.rmSync(case5Dir, { recursive: true, force: true });
    }

    // Case 5l: pick-next + worktree-status round-trip with issue 801
    {
      const case5lDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-plugin-5l-'));
      try {
        execFileSync('git', ['init', '-b', 'main'], { cwd: case5lDir, encoding: 'utf8' });
        execFileSync('git', ['-C', case5lDir, 'commit', '--allow-empty', '-m', 'init'], { encoding: 'utf8' });
        fs.mkdirSync(path.join(case5lDir, 'kaola-workflow'), { recursive: true });

        const binDir5l = path.join(case5lDir, 'bin');
        fs.mkdirSync(binDir5l, { recursive: true });
        const ghShim5l = path.join(binDir5l, 'gh');
        fs.writeFileSync(ghShim5l, [
          '#!/usr/bin/env node',
          'const args = process.argv.slice(2);',
          'if (args[0]==="issue"&&args[1]==="list") { process.stdout.write(JSON.stringify([{number:801,title:"plugin-case-5l",state:"open",labels:[],assignees:[],updatedAt:"2026-01-01",url:"https://github.com/test/repo/issues/801"}])+"\\n"); process.exit(0); }',
          'if (args[0]==="issue"&&args[1]==="edit") { process.exit(0); }',
          'if (args[0]==="issue"&&args[1]==="view") { process.stdout.write(JSON.stringify({state:"open",number:801,title:"plugin-case-5l",labels:[],assignees:[],url:"https://github.com/test/repo/issues/801"})+"\\n"); process.exit(0); }',
          'process.exit(0);'
        ].join('\n'), { mode: 0o755 });

        const pathSep = process.platform === 'win32' ? ';' : ':';
        const env5l = { ...process.env, PATH: binDir5l + pathSep + process.env.PATH };

        // pick-next acquires issue 801
        const pickOut5l = execFileSync(process.execPath, [claimScript, 'pick-next',
          '--session', 'sess-plugin-5l', '--runtime', 'claude'],
          { cwd: case5lDir, encoding: 'utf8', env: env5l });
        const pick5l = JSON.parse(pickOut5l.trim());
        assert(pick5l.verdict === 'acquired', 'Case 5l: pick-next verdict must be acquired, got ' + JSON.stringify(pick5l));
        assert(pick5l.issue === 801, 'Case 5l: pick-next issue must be 801, got ' + pick5l.issue);
        assert(fs.existsSync(pick5l.worktree_path), 'Case 5l: worktree_path must exist: ' + pick5l.worktree_path);

        // worktree-status returns matching entry
        const statusOut5l = execFileSync(process.execPath, [claimScript, 'worktree-status'],
          { cwd: case5lDir, encoding: 'utf8', env: { ...env5l, KAOLA_WORKFLOW_OFFLINE: '1' } });
        const status5l = JSON.parse(statusOut5l.trim());
        assert(Array.isArray(status5l) && status5l.length >= 1,
          'Case 5l: worktree-status must return at least 1 entry');
        const entry5l = status5l.find(e => e.branch === pick5l.branch);
        assert(entry5l, 'Case 5l: worktree-status must have entry for ' + pick5l.branch);
        assert(entry5l.worktree_path === pick5l.worktree_path, 'Case 5l: worktree_path must match pick-next output');

      } finally {
        try { execFileSync('git', ['-C', case5lDir, 'worktree', 'prune'], { encoding: 'utf8' }); } catch (_) {}
        // Also clean up the sibling .kw directory created by worktreePathFor
        try {
          const kwDir = case5lDir + '.kw';
          if (fs.existsSync(kwDir)) fs.rmSync(kwDir, { recursive: true, force: true });
        } catch (_) {}
        fs.rmSync(case5lDir, { recursive: true, force: true });
      }
    }

    // 6J: ticker orphan-exit — spawned without Claude ancestor self-terminates and removes PID file
    {
      const epic6JTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kaola-workflow-plugin-epic6j-'));
      const stderrFile6J = path.join(epic6JTmp, 'ticker-stderr.txt');
      try {
        const claimScript6J = path.join(pluginRoot, 'scripts', 'kaola-workflow-claim.js');
        const coordRoot6J = path.join(epic6JTmp, '.git');
        fs.mkdirSync(path.join(coordRoot6J, 'kaola-workflow', '.tickers'), { recursive: true });
        const sessionId6J = 'sess-6j-orphan';
        const pidFile6J = path.join(coordRoot6J, 'kaola-workflow', '.tickers', sessionId6J + '.pid');

        // Use (cmd &) subshell pattern: subshell exits immediately after fork,
        // breaking the ancestor chain before walkToClaudePid() runs.
        // Stderr captured to file so we can assert the orphan message.
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
          'Plugin Case 6J: orphaned ticker must remove its PID file within 1500ms; file still exists at ' + pidFile6J);

        // Assert orphan-exit message in captured stderr
        const stderr6J = fs.existsSync(stderrFile6J)
          ? fs.readFileSync(stderrFile6J, 'utf8')
          : '';
        assert(stderr6J.includes('no Claude ancestor at startup'),
          'Plugin Case 6J: ticker stderr must contain "no Claude ancestor at startup", got: ' + stderr6J);
      } finally {
        fs.rmSync(epic6JTmp, { recursive: true, force: true });
      }
    }

    console.log('Kaola-Workflow walkthrough simulation passed');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
