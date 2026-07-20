#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const assert = require('assert');

const root = path.resolve(__dirname, '..', '..', '..');

// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// Adaptive is the only workflow path (the fast/full opt-ins were retired); a stale installed_paths
// field is tolerated on read but never written. Set a hermetic HOME so every subprocess inheriting
// process.env sees the canonical config regardless of the dev machine.
const kwSandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sandbox-home-'));
fs.mkdirSync(path.join(kwSandboxHome, '.config', 'kaola-workflow'), { recursive: true });
fs.writeFileSync(
  path.join(kwSandboxHome, '.config', 'kaola-workflow', 'config.json'),
  JSON.stringify({ parallel_mode: 'auto', installed_paths: [] }, null, 2) + '\n'
);
process.env.HOME = kwSandboxHome;
process.env.USERPROFILE = kwSandboxHome;

const sinkMr = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr'));
const claimScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js');

// Retirement of the fast/full paths: a finalize with NO frozen workflow-plan.md now refuses
// adaptive_plan_missing (adaptive is the only workflow path). These fixtures jump straight from
// claim to finalize to exercise terminal archive/closure normalization — not an adaptive run — so
// they seed a minimal FROZEN adaptive workflow-plan.md plus a passing consumer-mode final-validation
// gate. Pass writeSet paths for any real production files committed on the feature branch so a
// tdd-guide node's declared write set attributes them for the finalize sweep. (Historically this
// marked the state `workflow_path: fast` so the retired fast N/A gate skipped verification.)
function seedAdaptiveFinalizeFixture(fixtureRoot, project, writeSet) {
  const glValScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
  const dir = path.join(fixtureRoot, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  const planPath = path.join(dir, 'workflow-plan.md');
  const paths = Array.isArray(writeSet) ? writeSet.filter(Boolean) : [];
  const nodesTable = paths.length ? [
    '| n1 | code-explorer | — | — | 1 | sequence |',
    '| n2 | tdd-guide | n1 | ' + paths.join(' ') + ' | 1 | sequence |',
    '| n3 | code-reviewer | n2 | — | 1 | sequence |',
    '| n4 | finalize | n3 | — | 1 | sequence |',
  ] : [
    '| n1 | code-explorer | — | — | 1 | sequence |',
    '| n2 | finalize | n1 | — | 1 | sequence |',
  ];
  const ledgerRows = paths.length
    ? ['| n1 | complete |', '| n2 | complete |', '| n3 | complete |', '| n4 | complete |']
    : ['| n1 | complete |', '| n2 | complete |'];
  const complianceRows = paths.length ? [
    '| code-explorer (n1) | subagent-invoked | evidence-binding: n1 planless | |',
    '| tdd-guide (n2) | subagent-invoked | evidence-binding: n2 planless | |',
    '| code-reviewer (n3) | subagent-invoked | evidence-binding: n3 planless | |',
    '| finalize (n4) | main-session-direct | evidence-binding: n4 planless | |',
  ] : [
    '| code-explorer (n1) | subagent-invoked | evidence-binding: n1 planless | |',
    '| finalize (n2) | main-session-direct | evidence-binding: n2 planless | |',
  ];
  const tasks = paths.length ? [
    { id: 'n1', role: 'code-explorer', ledger_status: 'complete', status: 'completed' },
    { id: 'n2', role: 'tdd-guide', ledger_status: 'complete', status: 'completed' },
    { id: 'n3', role: 'code-reviewer', ledger_status: 'complete', status: 'completed' },
    { id: 'n4', role: 'finalize', ledger_status: 'complete', status: 'completed' },
  ] : [
    { id: 'n1', role: 'code-explorer', ledger_status: 'complete', status: 'completed' },
    { id: 'n2', role: 'finalize', ledger_status: 'complete', status: 'completed' },
  ];
  const planBody = [
    '# Workflow Plan', '', '## Meta', 'labels: enhancement', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    ...nodesTable, '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    ...ledgerRows, '',
    '## Required Agent Compliance', '',
    '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
    ...complianceRows, ''
  ].join('\n');
  const planHash = require(glValScript).computePlanHash(planBody);
  fs.writeFileSync(planPath, '<!-- plan_hash: ' + planHash + ' -->\n\n' + planBody);
  const glVal = (a) => spawnSync(process.execPath, [glValScript, ...a], { cwd: fixtureRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
  let finalHash = '';
  try { finalHash = JSON.parse(glVal([planPath, '--freeze', '--json']).stdout).planHash || ''; } catch (_) {}
  const sFile = path.join(dir, 'workflow-state.md');
  if (finalHash && fs.existsSync(sFile) && /^active_plan_hash:\s*none\s*$/m.test(fs.readFileSync(sFile, 'utf8'))) {
    const s = fs.readFileSync(sFile, 'utf8')
      .replace(/^plan_hash:\s*none\s*$/m, 'plan_hash: ' + finalHash)
      .replace(/^active_plan_hash:\s*none\s*$/m, 'active_plan_hash: ' + finalHash)
      .replace(/^first_node_id:\s*none\s*$/m, 'first_node_id: n1')
      .replace(/^first_node_role:\s*none\s*$/m, 'first_node_role: code-explorer');
    fs.writeFileSync(sFile, s);
    fs.writeFileSync(path.join(dir, 'workflow-tasks.json'), JSON.stringify({ source_plan_hash: finalHash, tasks }) + '\n');
  }
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  let cand = '';
  try { cand = JSON.parse(glVal([planPath, '--candidate-hash', '--json']).stdout).validated_candidate_hash || ''; } catch (_) {}
  fs.writeFileSync(path.join(dir, '.cache', 'final-validation.md'),
    'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + cand + '\n');
}

function tail30(str) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - 30)).join('\n');
}

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitlab/scripts', script)], {
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
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-fallback-archive-'));
  try {
    // Arrange: live project files
    const liveDir = path.join(tmpRoot, 'kaola-workflow', 'fb-project');
    fs.mkdirSync(liveDir, { recursive: true });
    fs.writeFileSync(path.join(liveDir, 'workflow-state.md'),
      '## Project\nname: fb-project\nstatus: active\n## Sink\nbranch: workflow/fb-project\nsink: merge\n');
    fs.writeFileSync(path.join(liveDir, 'finalization-summary.md'),
      '# Finalization Summary\n## Final Validation\nFinal Validation: pass\n');

    // Simulate cmdFinalize: archive the project dir
    fs.mkdirSync(path.join(tmpRoot, 'kaola-workflow', 'archive'), { recursive: true });
    const archiveDest = path.join(tmpRoot, 'kaola-workflow', 'archive', 'fb-project');
    fs.renameSync(liveDir, archiveDest);

    // #394: snapshot the summary BEFORE the chain (the state file is now LEGITIMATELY mutated by
    // sink-fallback — it flips sink:mr in the archive so the fallback chain has a home). The summary
    // (and any other non-state file) must stay byte-unchanged.
    const summarySnapshot = fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8');

    // Step 0: sink-merge on archived project — must exit 3, no live dir recreated.
    // #394: it now writes a fallback receipt to the ARCHIVE .cache (was "skipping receipt write").
    const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
    const smResult = spawnSync(process.execPath,
      [sinkScript, '--branch', 'workflow/fb-project', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE: 'branch_protected', KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(smResult.status, 3, 'sink-merge on archived project must exit 3');
    assert(!fs.existsSync(liveDir), 'sink-merge must not recreate live dir for archived project');
    assert((smResult.stderr || '').includes('project archived'), 'sink-merge stderr must mention project archived');
    // #394: the fallback receipt now lives in the archive .cache (durable home for the exit-3 chain).
    assert(fs.existsSync(path.join(archiveDest, '.cache', 'sink-fallback.json')),
      '#394: sink-merge writes the fallback receipt to the archive .cache');

    // Step 1: cmdSinkFallback — #394: archived project now OPERATES on the archived state (flips
    // sink:mr there) instead of the old no-op, so the broken fallback chain converges. Returns
    // updated:true + archived:true; the live dir is still never recreated.
    const fbResult = spawnSync(process.execPath,
      [claimScript, 'sink-fallback', '--project', 'fb-project'],
      { cwd: tmpRoot, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.strictEqual(fbResult.status, 0, 'sink-fallback should exit 0 on archived project');
    const fbParsed = JSON.parse(fbResult.stdout);
    assert.strictEqual(fbParsed.updated, true, '#394: sink-fallback now updates the archived state');
    assert.strictEqual(fbParsed.archived, true, '#394: sink-fallback reports it operated on the archive');
    assert.strictEqual(fbParsed.sink, 'mr', '#394: sink flipped to mr in the archived state');
    assert(!fs.existsSync(liveDir), 'live dir must not be recreated by sink-fallback');
    const archivedStateAfter = fs.readFileSync(path.join(archiveDest, 'workflow-state.md'), 'utf8');
    assert(/^sink: mr$/m.test(archivedStateAfter), '#394: the archived state now reads sink: mr');

    // Step 2: appendSummary on the (absent) LIVE path — should return false, not recreate dir.
    const summaryFile = path.join(tmpRoot, 'kaola-workflow', 'fb-project', 'finalization-summary.md');
    const appendResult = sinkMr.appendSummary(summaryFile, 'https://gl.example/mr/99', 99);
    assert.strictEqual(appendResult, false, 'appendSummary should return false on absent live dir');
    assert(!fs.existsSync(path.join(tmpRoot, 'kaola-workflow', 'fb-project')),
      'appendSummary must not recreate live dir');

    // Step 3: the archived SUMMARY (and other non-state artifacts) stays byte-unchanged.
    assert.strictEqual(fs.readFileSync(path.join(archiveDest, 'finalization-summary.md'), 'utf8'), summarySnapshot,
      'archive finalization-summary.md must be unchanged (only workflow-state.md is the #394 fallback target)');

    console.log('testFallbackGuardsAfterArchive: PASSED');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

// #552: the FORGE sink-merge lingering-lane_group fail-closed backstop (hand-port parity with canonical).
// The gitlab sink-merge is a DIVERGENT hand-port with NO byte-parity guard, so this functional test is the
// only regression lock against the hand-port drifting (the #550 lesson: a forge fail-path that no test
// exercises is where drift hides). A clean group completion deletes the lane_group key; a residual key at
// sink time means unmerged leg work, so the sink must refuse and main must NOT advance.
function testGitlabSinkRefusesLingeringLaneGroup() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-552-sink-')));
  const sinkScript = path.join(__dirname, 'kaola-gitlab-workflow-sink-merge.js');
  const lingering = JSON.stringify({ state: 'open', nodes: [{ id: 'B', role: 'tdd-guide' }], lane_group: { group_id: 'lane-9552', members: ['A', 'B'], closed_members: ['A'], legs: { A: { legPath: '.kw/legs/issue-9552/A' }, B: { legPath: '.kw/legs/issue-9552/B' } } } }, null, 2);
  try {
    glInitGitRepo(tmp);
    spawnSync('git', ['checkout', '-b', 'workflow/issue-9552'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'feature.txt'), 'impl');
    spawnSync('git', ['add', 'feature.txt'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'feat: issue 9552'], { cwd: tmp, encoding: 'utf8' });
    spawnSync('git', ['checkout', 'main'], { cwd: tmp, encoding: 'utf8' });
    // RED (live location): a lingering lane_group blocks the sink, main unchanged.
    const liveCache = path.join(tmp, 'kaola-workflow', 'issue-9552', '.cache');
    fs.mkdirSync(liveCache, { recursive: true });
    fs.writeFileSync(path.join(liveCache, 'running-set.json'), lingering);
    const mainBefore = spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim();
    const r1 = spawnSync(process.execPath, [sinkScript, '--branch', 'workflow/issue-9552', '--project', 'issue-9552', '--issue', '9552', '--sink', '--json'], { cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    assert.notStrictEqual(r1.status, 0, 'gitlab #552: sink must refuse (exit non-zero) on a lingering lane_group, got status ' + r1.status);
    const p1 = JSON.parse(String(r1.stdout || '').trim().split('\n').pop());
    assert.strictEqual(p1.reason, 'lingering_lane_group', 'gitlab #552: typed refusal lingering_lane_group, got ' + JSON.stringify(p1));
    assert.strictEqual(spawnSync('git', ['-C', tmp, 'rev-parse', 'main'], { encoding: 'utf8' }).stdout.trim(), mainBefore, 'gitlab #552: main must NOT advance');
    // RED (archive location): dual-location read also fires.
    fs.rmSync(liveCache, { recursive: true, force: true });
    const archCache = path.join(tmp, 'kaola-workflow', 'archive', 'issue-9552', '.cache');
    fs.mkdirSync(archCache, { recursive: true });
    fs.writeFileSync(path.join(archCache, 'running-set.json'), lingering);
    const r2 = spawnSync(process.execPath, [sinkScript, '--branch', 'workflow/issue-9552', '--project', 'issue-9552', '--issue', '9552', '--sink', '--json'], { cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    const p2 = JSON.parse(String(r2.stdout || '').trim().split('\n').pop());
    assert.strictEqual(p2.reason, 'lingering_lane_group', 'gitlab #552: dual-location (archive) refusal, got ' + JSON.stringify(p2));
    // GREEN (no false-positive): a running-set with NO lane_group key must NOT trip the backstop.
    fs.rmSync(archCache, { recursive: true, force: true });
    fs.mkdirSync(liveCache, { recursive: true });
    fs.writeFileSync(path.join(liveCache, 'running-set.json'), JSON.stringify({ state: 'open', nodes: [] }, null, 2));
    const r3 = spawnSync(process.execPath, [sinkScript, '--branch', 'workflow/issue-9552', '--project', 'issue-9552', '--issue', '9552', '--sink', '--json'], { cwd: tmp, encoding: 'utf8', env: { ...process.env, KAOLA_WORKFLOW_OFFLINE: '1' } });
    let p3 = {};
    try { p3 = JSON.parse(String(r3.stdout || '').trim().split('\n').pop()); } catch (_) {}
    assert.notStrictEqual(p3.reason, 'lingering_lane_group', 'gitlab #552 GREEN: a cleared running-set (no lane_group key) must NOT trip the backstop, got ' + JSON.stringify(p3));
    console.log('testGitlabSinkRefusesLingeringLaneGroup: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
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

function testGitlabAdaptive() {
  const repairScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js');
  const valScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-adaptive-'));
  try {
    // #699: claim requires a resolvable claim-anchor git root (buildClaimAnchors); a bare
    // temp dir refuses claim_root_unavailable with empty stdout before any JSON is emitted.
    glInitGitRepo(tmp);
    // #538: adaptive is unconditionally legal — claim always acquires (no switch).
    fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
    let r = JSON.parse(spawnNode(claimScript, ['claim', '--project', 'issue-901', '--workflowPath', 'adaptive'], tmp).stdout);
    assert.strictEqual(r.status, 'acquired', 'gitlab: adaptive claim must acquire (always legal)');
    r = JSON.parse(spawnNode(claimScript, ['claim', '--project', 'issue-902', '--workflowPath', 'adaptive'], tmp).stdout);
    assert.strictEqual(r.status, 'acquired', 'gitlab: second adaptive claim must acquire');
    const claimedState = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-902', 'workflow-state.md'), 'utf8');
    assert.ok(/workflow_path: adaptive/.test(claimedState) && /next_command: \/kaola-workflow-plan-run issue-902/.test(claimedState),
      'gitlab: adaptive claim state must route to plan-run');
    assert.ok(/^run_posture: (worktree|in-place)$/m.test(claimedState),
      'M4 (#277): gitlab adaptive claim state must contain run_posture: worktree or in-place');

    // routeAdaptive: a frozen plan resumes to plan-run, ahead of the phaseN ladder
    const pdir = path.join(tmp, 'kaola-workflow', 'issue-903');
    fs.mkdirSync(pdir, { recursive: true });
    const planPath = path.join(pdir, 'workflow-plan.md');
    fs.writeFileSync(planPath, PLAN);
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
    assert.strictEqual(spawnNode(valScript, [planPath, '--freeze'], tmp).status, 0, 'gitlab: plan freeze must exit 0');
    const repaired = spawnNode(repairScript, ['issue-903'], tmp);
    assert.strictEqual(repaired.status, 0, 'gitlab: adaptive repair must exit 0');
    const st = fs.readFileSync(planPath, 'utf8');
    assert.ok(st.includes('plan_hash:'), 'gitlab: freeze must stamp plan_hash');
    const repairedState = fs.readFileSync(path.join(pdir, 'workflow-state.md'), 'utf8');
    assert.ok(/next_command: \/kaola-workflow-plan-run issue-903/.test(repairedState), 'gitlab: frozen plan must resume to plan-run');

    // tampered plan -> typed refusal (clean dir, no prior state)
    const tdir = path.join(tmp, 'kaola-workflow', 'issue-904');
    fs.mkdirSync(tdir, { recursive: true });
    const tplan = path.join(tdir, 'workflow-plan.md');
    fs.writeFileSync(tplan, PLAN);
    fs.writeFileSync(tplan, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(tplan, 'utf8')) + ' -->\n\n' + fs.readFileSync(tplan, 'utf8'));
    spawnNode(valScript, [tplan, '--freeze'], tmp);
    fs.writeFileSync(tplan, fs.readFileSync(tplan, 'utf8').replace('lib/x.js', 'lib/y.js'));
    const tampered = spawnNode(repairScript, ['issue-904'], tmp);
    assert.ok(/typed refusal/.test(tampered.stdout), 'gitlab: tampered plan must be a typed refusal, got: ' + tampered.stdout);

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
      'refuse', 'gitlab A1: code on the finalize sink must refuse (G1)');
    assert.strictEqual(gateVal(['| n1 | doc-updater | — | Dockerfile | 1 | sequence |', '| d | finalize | n1 | — | 1 | sequence |'], 'chore').result,
      'refuse', 'gitlab A2: slashless root file must require code-reviewer (G1)');
    assert.strictEqual(gateVal(null, null, [
      '# Plan', '', 'labels: chore', '', '## Meta', 'labels: security', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |',
      '|---|---|---|---|---|---|',
      '| n1 | tdd-guide | — | src/h.js | 1 | sequence |',
      '| rv | code-reviewer | n1 | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |', ''
    ].join('\n')).result, 'refuse', 'gitlab B1: decoy labels line outside ## Meta must not drop G2');

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
    ], 'enhancement').result, 'in-grammar', 'gitlab B6: independent branches reusing a label must not sum against FANOUT_CAP');
    assert.strictEqual(gateVal([
      '| root | code-explorer | — | — | 1 | sequence |',
      '| i1 | tdd-guide | root | aaa/1.js | 1 | fanout(impl) |',
      '| i2 | tdd-guide | root | bbb/1.js | 1 | fanout(impl) |',
      '| i3 | tdd-guide | root | ccc/1.js | 1 | fanout(impl) |',
      '| i4 | tdd-guide | root | ddd/1.js | 1 | fanout(impl) |',
      '| i5 | tdd-guide | root | eee/1.js | 1 | fanout(impl) |',
      '| r | code-reviewer | i1,i2,i3,i4,i5 | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitlab B6 control (#303): single-origin over-cap fan-out is in-grammar (runtime concurrency limit, not validity cap)');

    // issue #232 (audit A3): concurrent non-fanout siblings (same parent) writing the EXACT same
    // file must refuse; independent branches (no common ancestor) with identical writes must NOT.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | e | lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | e | lib/foo.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab A3: concurrent siblings writing the same file must refuse');
    assert.strictEqual(gateVal([
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | r2 | lib/foo.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab A3 (v3.20.1): independent-branch EXACT-file overlap is a clobber and must refuse');
    // CONTROL (no over-rotation): independent branches, DIFFERENT files same coarse area -> in-grammar.
    assert.strictEqual(gateVal([
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | src/aaa.js | 1 | sequence |',
      '| b | tdd-guide | r2 | src/bbb.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitlab A3 control: independent branches with different files in the same area stay in-grammar');

    // issue #340: the two freeze-time write-set completeness checks on the GITLAB edition-named
    // port (carries pre-existing #294 drift — port-level asserts are load-bearing). Mech 2 (A4/A5)
    // is a pure graph check (no anchor); mech 1 (A1/A2) is anchor-gated to the repo.
    // A4 (mech-2 refusal): a port parallel to its root-editing node must refuse.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| rootedit | tdd-guide | e | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| port | implementer | e | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
      '| rv | code-reviewer | rootedit,port | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab #340 A4: a port parallel to its root edit must refuse (forge-port ordering gap)');
    // A5 (mech-2 positive): the same port downstream of all its root edits is in-grammar.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| rootedit | tdd-guide | e | scripts/kaola-workflow-claim.js | 1 | sequence |',
      '| port | implementer | rootedit | plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js | 1 | sequence |',
      '| rv | code-reviewer | port | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitlab #340 A5: a port downstream of all its root edits is in-grammar');
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
        'gitlab #340 A1: agent add omitting the surface must refuse naming validate-vendored-agents.js + uninstall.sh, got ' + JSON.stringify(a1));
      fs.rmSync(path.join(tmp, 'scripts', 'validate-vendored-agents.js'));
      const a2 = gateVal([
        '| scout | implementer | e | agents/new-scout.md | 1 | sequence |',
        '| e | code-explorer | — | — | 1 | sequence |',
        '| rv | code-reviewer | scout | — | 1 | sequence |',
        '| d | finalize | rv | — | 1 | sequence |',
      ], 'enhancement');
      assert.strictEqual(a2.result, 'in-grammar', 'gitlab #340 A2: without the anchor the mech-1 check must be inert');
    }

    // issue #234 E1: a stale phaseN next_command on an adaptive project must reconcile to plan-run.
    const e1dir = path.join(tmp, 'kaola-workflow', 'issue-940');
    fs.mkdirSync(e1dir, { recursive: true });
    fs.writeFileSync(path.join(e1dir, 'workflow-state.md'), ['name: issue-940', 'issue_iid: 940', 'status: active', 'phase: adaptive', 'workflow_path: adaptive', 'next_command: /kaola-workflow-phase4 issue-940', ''].join('\n'));
    // #538: resume is unconditionally toggle-agnostic (no switch)
    const e1 = JSON.parse(spawnNode(claimScript, ['resume', '--project', 'issue-940'], tmp).stdout);
    assert.strictEqual(e1.next_command, '/kaola-workflow-plan-run issue-940', 'gitlab E1: stale phaseN on an adaptive project must reconcile to plan-run');

    // issue #234 E2: a durable consent_halt in the Node Ledger surfaces on resume even with no state file.
    const e2dir = path.join(tmp, 'kaola-workflow', 'issue-941');
    fs.mkdirSync(e2dir, { recursive: true });
    const e2plan = path.join(e2dir, 'workflow-plan.md');
    fs.writeFileSync(e2plan, ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| done | finalize | — | — | 1 | sequence |', '', '## Node Ledger', '', '| id | status |', '|---|---|', '| done | pending |', 'consent_halt: pending', ''].join('\n'));
    fs.writeFileSync(e2plan, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(e2plan, 'utf8')) + ' -->\n\n' + fs.readFileSync(e2plan, 'utf8'));
    spawnNode(valScript, [e2plan, '--freeze'], tmp);
    spawnNode(repairScript, ['issue-941'], tmp);
    assert.ok(/consent-halt-surface/.test(fs.readFileSync(path.join(e2dir, 'workflow-state.md'), 'utf8')),
      'gitlab E2: durable Node-Ledger consent must surface on resume with no prior workflow-state.md');

    // issue #235 D8 / #538: authoring-allowed is unconditionally allowed (no switch).
    const ar = JSON.parse(spawnNode(claimScript, ['authoring-allowed', '--project', 'issue-960'], tmp).stdout);
    assert.strictEqual(ar.status, 'authoring_allowed', 'gitlab #538 D8: authoring must always be allowed (unconditional)');

    // v3.20.1 (adversarial-review follow-ups): the fork validator must carry the same fixes.
    // Fix #3 — independent-branch exact-file overlap must refuse (was a #233 regression).
    assert.strictEqual(gateVal([
      '| r1 | code-explorer | — | — | 1 | sequence |',
      '| r2 | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | r1 | src/foo.js | 1 | fanout(impl) |',
      '| b | tdd-guide | r2 | src/foo.js | 1 | fanout(impl) |',
      '| rv | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | rv | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab v3.20.1 #3: independent-branch exact-file overlap must refuse');
    // Fix #1 + #2 — pure barrierCheck on the fork validator.
    const fv = require(valScript);
    const mkL = (nodes, ledger, lbl) => ['# Plan', '', '## Meta', 'labels: ' + (lbl || 'chore'), '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|']
      .concat(nodes).concat(['', '## Node Ledger', '', '| id | status |', '|---|---|']).concat(ledger).join('\n');
    const naT = mkL(['| imp | tdd-guide | — | src/auth/session.js | 1 | sequence |', '| sec | security-reviewer | imp | — | 1 | sequence |', '| done | finalize | sec | — | 1 | sequence |'], ['| imp | n/a |', '| sec | n/a |', '| done | complete |'], 'security');
    assert.strictEqual(fv.barrierCheck(naT, ['src/auth/session.js'], {}).result, 'refuse', 'gitlab v3.20.1 #1: n/a-target sensitive write must refuse');
    const cleanL = mkL(['| imp | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | imp | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| imp | complete |', '| rv | complete |', '| done | complete |'], 'refactor');
    assert.strictEqual(fv.barrierCheck(cleanL, ['test/login.test.js'], {}).result, 'pass', 'gitlab v3.20.1 #2: tests-only sensitive-named path must NOT refuse');

    // v3.21.0 #238: the FORK classifier carries the curated-root claim-overlap (yellow) + ./ canon.
    const fcl = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js'));
    const cdir = path.join(tmp, 'kaola-workflow', 'curated-claimed-238');
    fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, 'workflow-plan.md'), ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | Dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |', ''].join('\n'));
    const fr238 = fcl.classify({ body: 'this change also edits the Dockerfile build stage' }, [{ project: 'curated-claimed-238', project_dir: cdir }]);
    assert.strictEqual(fr238.verdict, 'yellow', 'gitlab #238: curated root (Dockerfile) overlap must be yellow, got ' + JSON.stringify(fr238));
    // v3.21.0: the candidate-side detector must normalize sentence punctuation (trailing '.', leading
    // './') before exact membership, else the fork classifier+schema chain fails open to green.
    for (const body of ['this change also edits the Dockerfile. plus src/server.js', 'tweak ./Dockerfile and src/server.js']) {
      const fr = fcl.classify({ body }, [{ project: 'curated-claimed-238', project_dir: cdir }]);
      assert.strictEqual(fr.verdict, 'yellow', 'gitlab #238/v3.21.0: punctuated curated overlap must be yellow ("' + body + '"), got ' + JSON.stringify(fr));
    }
    // F9 (v3.21.0): the CLAIMED-PROSE side (extractCuratedRootPaths over phase3 prose, NOT the
    // structured fold) must also detect a curated overlap. The fork classifier is a hand-port
    // (non-identical to root), so this is NOT transitively covered — guard it directly. The prose is
    // punctuated ("Dockerfile.") so it also covers the claimed-side normalization.
    const pdir238 = path.join(tmp, 'kaola-workflow', 'prose-curated-238');
    fs.mkdirSync(pdir238, { recursive: true });
    fs.writeFileSync(path.join(pdir238, 'phase3-plan.md'), '# Phase 3\nWe will edit the Dockerfile.\n');
    const frProse = fcl.classify({ body: 'this change also edits the Dockerfile and src/app.js' }, [{ project: 'prose-curated-238', project_dir: pdir238 }]);
    assert.strictEqual(frProse.verdict, 'yellow', 'gitlab F9: claimed-PROSE curated overlap must be yellow, got ' + JSON.stringify(frProse));
    // v3.21.0 re-gate#3: the structured-claimed fold must CANONICALIZE — a lowercase `dockerfile`
    // declaration must intersect a canonical `Dockerfile` candidate (mutation-covers fork classifier:337).
    const lcdir = path.join(tmp, 'kaola-workflow', 'lc-curated-238');
    fs.mkdirSync(lcdir, { recursive: true });
    fs.writeFileSync(path.join(lcdir, 'workflow-plan.md'), ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '', '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|', '| ci | doc-updater | — | dockerfile | 1 | sequence |', '| review | code-reviewer | ci | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |', ''].join('\n'));
    const frLc = fcl.classify({ body: 'this change also edits the Dockerfile build stage' }, [{ project: 'lc-curated-238', project_dir: lcdir }]);
    assert.strictEqual(frLc.verdict, 'yellow', 'gitlab v3.21.0: lowercase structured curated declaration must intersect canonical candidate, got ' + JSON.stringify(frLc));
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| a | tdd-guide | e | ./lib/foo.js | 1 | sequence |',
      '| b | tdd-guide | e | lib//foo.js | 1 | sequence |',
      '| r | code-reviewer | a,b | — | 1 | sequence |',
      '| d | finalize | r | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab v3.21.0: ./lib/foo.js vs lib//foo.js is the same file and must refuse as a clobber');

    // v3.21.0 #239: per-instance own-lane barrier on the FORK validator.
    const perInst = mkL(['| a | tdd-guide | — | aaa/x.js | 1 | fanout(impl) |', '| b | tdd-guide | — | bbb/y.js | 1 | fanout(impl) |', '| rv | code-reviewer | a,b | — | 1 | sequence |', '| done | finalize | rv | — | 1 | sequence |'], ['| a | complete |', '| b | complete |', '| done | complete |'], 'enhancement');
    assert.strictEqual(fv.barrierCheck(perInst, ['aaa/x.js', 'bbb/y.js'], { nodeId: 'a' }).result, 'refuse', 'gitlab #239: per-node overflow into sibling lane must refuse');
    assert.strictEqual(fv.barrierCheck(perInst, ['aaa/x.js'], { nodeId: 'a' }).result, 'pass', 'gitlab #239: per-node own-lane must pass');

    // #334: non-delegable main-session-gate on the FORK validator.
    // in-grammar control: a post-dominating gate freezes.
    assert.strictEqual(gateVal([
      '| e | code-explorer | — | — | 1 | sequence |',
      '| imp | implementer | e | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | imp | — | 1 | sequence |',
      '| vgate | main-session-gate | rv | — | 1 | sequence |',
      '| d | finalize | vgate | — | 1 | sequence |',
    ], 'enhancement').result, 'in-grammar', 'gitlab #334: a post-dominating main-session-gate is in-grammar');
    // G3 freeze refusal: a side-branch gate (does not post-dominate impl).
    { const g3v = gateVal([
        '| e | code-explorer | — | — | 1 | sequence |',
        '| imp | implementer | e | lib/foo.js | 1 | sequence |',
        '| rv | code-reviewer | imp | — | 1 | sequence |',
        '| vgate | main-session-gate | e | — | 1 | sequence |',
        '| d | finalize | rv,vgate | — | 1 | sequence |',
      ], 'enhancement');
      assert.strictEqual(g3v.result, 'refuse', 'gitlab #334: side-branch gate must refuse');
      assert.ok(/G3/.test((g3v.errors || []).join(';')), 'gitlab #334: side-branch gate refusal names G3'); }
    // read-only refusal: a gate declaring a write set.
    assert.strictEqual(gateVal([
      '| imp | implementer | — | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | imp | — | 1 | sequence |',
      '| vgate | main-session-gate | rv | lib/bar.js | 1 | sequence |',
      '| d | finalize | vgate | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab #334: a main-session-gate write set must refuse (read-only)');
    // shape refusal: a gate as a fan-out member.
    assert.strictEqual(gateVal([
      '| imp | implementer | — | lib/foo.js | 1 | sequence |',
      '| rv | code-reviewer | imp | — | 1 | sequence |',
      '| g1 | main-session-gate | rv | — | 1 | fanout(gates) |',
      '| g2 | main-session-gate | rv | — | 1 | fanout(gates) |',
      '| d | finalize | g1,g2 | — | 1 | sequence |',
    ], 'enhancement').result, 'refuse', 'gitlab #334: a main-session-gate fan-out member must refuse (shape)');
    // G3 runtime: impl complete + gate PENDING -> verifyGateExecution unsatisfied + --gate-verify exit 1.
    const g3Nodes = ['| imp | implementer | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | imp | — | 1 | sequence |', '| vgate | main-session-gate | rv | — | 1 | sequence |', '| d | finalize | vgate | — | 1 | sequence |'];
    const g3Pending = mkL(g3Nodes, ['| imp | complete |', '| rv | complete |', '| vgate | pending |', '| d | pending |'], 'chore');
    assert.strictEqual(fv.verifyGateExecution(g3Pending, {}).ok, false, 'gitlab #334: impl complete + gate pending must be unsatisfied (regression scenario)');
    { const projDir = path.join(tmp, 'kaola-workflow', 'issue-334-gl'); fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true });
      const gp = path.join(projDir, 'workflow-plan.md');
      fs.writeFileSync(gp, g3Pending);
      assert.strictEqual(spawnNode(valScript, [gp, '--gate-verify', '--json'], tmp).status, 1, 'gitlab #334: --gate-verify exit 1 when gate pending');
      // n/a -> exit 1.
      fs.writeFileSync(gp, mkL(g3Nodes, ['| imp | complete |', '| rv | complete |', '| vgate | n/a |', '| d | complete |'], 'chore'));
      assert.strictEqual(spawnNode(valScript, [gp, '--gate-verify', '--json'], tmp).status, 1, 'gitlab #334: --gate-verify exit 1 when gate n/a');
      // pass control: gate complete + .cache verdicts -> --gate-verify AND --verdict-check exit 0.
      fs.writeFileSync(gp, mkL(g3Nodes, ['| imp | complete |', '| rv | complete |', '| vgate | complete |', '| d | complete |'], 'chore'));
      fs.writeFileSync(path.join(projDir, '.cache', 'rv.md'), 'verdict: pass\nfindings_blocking: 0\n');
      fs.writeFileSync(path.join(projDir, '.cache', 'vgate.md'), 'verdict: pass\nfindings_blocking: 0\nvisual confirmed\n');
      assert.strictEqual(spawnNode(valScript, [gp, '--gate-verify', '--json'], tmp).status, 0, 'gitlab #334: --gate-verify exit 0 when gate complete + post-dominates');
      assert.strictEqual(spawnNode(valScript, [gp, '--verdict-check', '--json'], tmp).status, 0, 'gitlab #334: --verdict-check exit 0 when gate records verdict: pass'); }

    // #509 (GITLAB port): --verdict-check is SCOPED to CHANGE-GATE adversarial-verifiers. An
    // INVESTIGATION adversarial-verifier (post-dominates no code/sensitive node) is exempt REGARDLESS
    // of shape; a change-gate adversarial-verifier (post-dominates code/sensitive) STILL blocks.
    { const projDir = path.join(tmp, 'kaola-workflow', 'issue-509-gl');
      const mkAv = (nodes, ledger, labels) => { fs.rmSync(path.join(projDir, '.cache'), { recursive: true, force: true }); fs.mkdirSync(path.join(projDir, '.cache'), { recursive: true }); const p = path.join(projDir, 'workflow-plan.md'); fs.writeFileSync(p, mkL(nodes, ledger, labels)); return p; };
      // (a-seq) investigation adversarial-verifier emitting refuted -> PASS (exit 0).
      let p = mkAv(['| probe | code-explorer | — | — | 1 | sequence |', '| assume | knowledge-lookup | probe | — | 1 | sequence |', '| critique | adversarial-verifier | assume | — | 1 | sequence |', '| done | finalize | critique | — | 1 | sequence |'], ['| probe | complete |', '| assume | complete |', '| critique | complete |', '| done | complete |'], 'question');
      fs.writeFileSync(path.join(projDir, '.cache', 'critique.md'), 'verdict: refuted\nfindings_blocking: 2\nwrong\n');
      assert.strictEqual(spawnNode(valScript, [p, '--verdict-check', '--json'], tmp).status, 0, 'gitlab #509(a-seq): investigation adversarial-verifier emitting refuted must PASS --verdict-check (exit 0)');
      // (a-fanout) read-only majority-refute investigation fanout -> PASS (exit 0, exempt by shape-agnostic post-dominance).
      p = mkAv(['| assume | knowledge-lookup | — | — | 1 | sequence |', '| crit1 | adversarial-verifier | assume | — | 1 | fanout(critics) |', '| crit2 | adversarial-verifier | assume | — | 1 | fanout(critics) |', '| crit3 | adversarial-verifier | assume | — | 1 | fanout(critics) |', '| done | finalize | crit1,crit2,crit3 | — | 1 | sequence |'], ['| assume | complete |', '| crit1 | complete |', '| crit2 | complete |', '| crit3 | complete |', '| done | complete |'], 'question');
      fs.writeFileSync(path.join(projDir, '.cache', 'adversarial-verifier-crit1.md'), 'verdict: refuted\nfindings_blocking: 1\n');
      fs.writeFileSync(path.join(projDir, '.cache', 'adversarial-verifier-crit2.md'), 'verdict: refuted\nfindings_blocking: 1\n');
      fs.writeFileSync(path.join(projDir, '.cache', 'adversarial-verifier-crit3.md'), 'verdict: pass\nfindings_blocking: 0\n');
      assert.strictEqual(spawnNode(valScript, [p, '--verdict-check', '--json'], tmp).status, 0, 'gitlab #509(a-fanout): read-only majority-refute investigation fanout must PASS --verdict-check (exit 0)');
      // (b) change-gate adversarial-verifier (post-dominates code) emitting refuted -> STILL BLOCK (exit 1).
      p = mkAv(['| imp | tdd-guide | — | lib/foo.js | 1 | sequence |', '| rv | code-reviewer | imp | — | 1 | sequence |', '| critique | adversarial-verifier | rv | — | 1 | sequence |', '| done | finalize | critique | — | 1 | sequence |'], ['| imp | complete |', '| rv | complete |', '| critique | complete |', '| done | complete |'], 'feature');
      fs.writeFileSync(path.join(projDir, '.cache', 'rv.md'), 'verdict: pass\nfindings_blocking: 0\n');
      fs.writeFileSync(path.join(projDir, '.cache', 'critique.md'), 'verdict: refuted\nfindings_blocking: 3\nbroken\n');
      assert.strictEqual(spawnNode(valScript, [p, '--verdict-check', '--json'], tmp).status, 1, 'gitlab #509(b): a CHANGE-GATE adversarial-verifier (post-dominates code) emitting refuted must STILL BLOCK --verdict-check (exit 1)'); }

    // #501 (GITLAB port): high-blast-radius surfaces require the internal G2 security-reviewer.
    for (const sp of ['.env', '.env.local', 'Dockerfile', '.github/workflows/deploy.yml', '.gitlab-ci.yml']) {
      assert.strictEqual(gateVal(['| impl | tdd-guide | — | ' + sp + ' | 1 | sequence |', '| review | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |'], 'chore').result, 'refuse', 'gitlab #501: sensitive surface "' + sp + '" with no security-reviewer must refuse (G2)');
      assert.strictEqual(gateVal(['| impl | tdd-guide | — | ' + sp + ' | 1 | sequence |', '| review | code-reviewer | impl | — | 1 | sequence |', '| sec | security-reviewer | review | — | 1 | sequence |', '| done | finalize | sec | — | 1 | sequence |'], 'chore').result, 'in-grammar', 'gitlab #501 CONTROL: the sensitive surface "' + sp + '" WITH a security-reviewer must freeze green');
    }
    assert.strictEqual(gateVal(['| impl | tdd-guide | — | src/environment.js, lib/Dockerfileutil.js | 1 | sequence |', '| review | code-reviewer | impl | — | 1 | sequence |', '| done | finalize | review | — | 1 | sequence |'], 'chore').result, 'in-grammar', 'gitlab #501 NEG-CONTROL: benign environment.js / Dockerfileutil.js must NOT be flagged sensitive (no G2)');

    // M2 (#277): warn-first attestation — finalize must emit closure_receipt with
    // claim_planner_attested and finalize_contractor_attested; both 'missing' in offline test
    // (no dispatch-log), but closure_invariants.ok must still be true (warn-first contract).
    // #522: init a git repo in tmp so the finalize gate's attribution sweep can resolve
    // `git diff main...HEAD` (empty diff on main → sweep passes vacuously).
    if (!fs.existsSync(path.join(tmp, '.git'))) glInitGitRepo(tmp);
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
    // #522: seed final-validation.md with verdict: pass (consumer-mode gate). The prior fixture
    // seeded a false-absolute ("chains run at n16.") to test #324 AC3 archive neutralization.
    // With the #522 gate, cmdFinalize reads this BEFORE archiving, so the seed must pass the gate.
    // The #324 AC3 assertion (archived copy does not contain 'No files changed after those runs')
    // still passes because 'verdict: pass\n...' does not contain that string.
    fs.mkdirSync(path.join(m2dir, '.cache'), { recursive: true });
    // #653: the consumer gate also verifies a column-0 validated_candidate_hash binding the verdict
    // to the current code tree — produce it with the validator's --candidate-hash mode.
    const m2Cand = JSON.parse(spawnNode(valScript,
      [path.join(m2dir, 'workflow-plan.md'), '--candidate-hash', '--json'], tmp).stdout).validated_candidate_hash;
    fs.writeFileSync(path.join(m2dir, '.cache', 'final-validation.md'),
      'verdict: pass\nfindings_blocking: 0\nvalidated_candidate_hash: ' + m2Cand + '\n');
    const roadmapM2Dir = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(roadmapM2Dir, { recursive: true });
    fs.writeFileSync(path.join(roadmapM2Dir, 'issue-970.md'),
      'issue: #970\ntitle: t\nstatus: open\nworkflow_project: issue-970\nnext_step: ready\n');
    const m2Result = JSON.parse(spawnNode(claimScript, ['finalize', '--project', 'issue-970'], tmp).stdout);
    assert.strictEqual(m2Result.status, 'closed', 'M2 (#277): gitlab finalize must return status:closed');
    assert.ok(
      m2Result.closure_receipt && 'claim_planner_attested' in m2Result.closure_receipt,
      'M2 (#277): gitlab closure_receipt must have claim_planner_attested field'
    );
    assert.ok(
      m2Result.closure_receipt && 'finalize_contractor_attested' in m2Result.closure_receipt,
      'M2 (#277): gitlab closure_receipt must have finalize_contractor_attested field'
    );
    assert.ok(
      m2Result.closure_receipt.claim_planner_attested === 'missing' ||
      m2Result.closure_receipt.claim_planner_attested === 'attested',
      'M2 (#277): gitlab claim_planner_attested must be missing or attested, got ' + m2Result.closure_receipt.claim_planner_attested
    );
    assert.ok(
      m2Result.closure_receipt.finalize_contractor_attested === 'missing' ||
      m2Result.closure_receipt.finalize_contractor_attested === 'attested',
      'M2 (#277): gitlab finalize_contractor_attested must be missing or attested, got ' + m2Result.closure_receipt.finalize_contractor_attested
    );
    assert.ok(
      m2Result.closure_invariants && m2Result.closure_invariants.ok === true,
      'M2 (#277): gitlab closure_invariants.ok must be true (warn-first: attestation miss is not a hard violation)'
    );
    // #324: archived closure artifacts must not retain pre-run / pre-sink state.
    const m2Archived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-970'));
    assert.strictEqual(m2Archived.length, 1, '#324: gitlab finalize archives issue-970');
    const m2State = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', m2Archived[0], 'workflow-state.md'), 'utf8');
    assert.ok(!/## Pending Gates\n[\s\S]*?workflow-plan/.test(m2State), '#324: gitlab archived state drops pre-run Pending Gates');
    assert.ok(!m2State.includes('last_command: startup'), '#324: gitlab archived state drops last_command: startup');
    assert.ok(m2State.includes('last_command: finalize'), '#324: gitlab archived state normalizes last_command to finalize');
    const m2Summary = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', m2Archived[0], 'finalization-summary.md'), 'utf8');
    assert.ok(!m2Summary.includes('READY FOR FINAL GIT GATE'), '#324: gitlab archived summary neutralizes the pre-sink sentinel');
    const m2FinalVal = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', m2Archived[0], '.cache', 'final-validation.md'), 'utf8');
    assert.ok(!m2FinalVal.includes('No files changed after those runs'), '#324 AC3: gitlab archived final-validation neutralizes the false absolute');
    // #333: archived state must not advertise an active resume command, and plan_hash + Last
    // Updated must be refreshed from the (re-frozen) plan file.
    assert.ok(m2State.includes('next_command: none (archived)'), '#333: gitlab archived next_command neutralized to "none (archived)"');
    assert.ok(!/next_command:.*kaola-workflow-plan-run/.test(m2State), '#333: gitlab archived state drops the active plan-run resume command');
    assert.ok(m2State.includes('plan_hash: ' + FINAL_HASH_970), '#333: gitlab archived plan_hash refreshed from the final plan file, got: ' + m2State);
    assert.ok(!m2State.includes('plan_hash: ' + STALE_HASH_970), '#333: gitlab archived plan_hash drops the stale claim-time hash');
    assert.ok(!m2State.includes('2020-01-01T00:00:00.000Z'), '#333: gitlab archived ## Last Updated refreshed');

    // #338: contractor self-attest back-fill — finalize --attest-contractor-spawn must make
    // finalize_contractor_attested:attested even with no hook/dispatch-log present.
    const csDir = path.join(tmp, 'kaola-workflow', 'issue-9701');
    fs.mkdirSync(csDir, { recursive: true });
    fs.writeFileSync(path.join(csDir, 'workflow-state.md'),
      '## Project\nname: issue-9701\nstatus: active\nissue_number: 9701\n'
      + 'next_command: /kaola-workflow-plan-run issue-9701\n'
      + '## Sink\nbranch: workflow/issue-9701\nsink: merge\n'
      + '## Pending Gates\n- workflow-plan\n\n## Last Evidence\nlast_command: startup\nlast_result: folder_claimed\n');
    seedAdaptiveFinalizeFixture(tmp, 'issue-9701');
    fs.writeFileSync(path.join(roadmapM2Dir, 'issue-9701.md'),
      'issue: #9701\ntitle: t\nstatus: open\nworkflow_project: issue-9701\nnext_step: ready\n');
    const csRun = spawnNode(claimScript, ['finalize', '--project', 'issue-9701', '--attest-contractor-spawn'], tmp);
    assert.strictEqual(csRun.status, 0,
      '#338: gitlab finalize command must exit 0, stdout: ' + csRun.stdout + ' stderr: ' + csRun.stderr);
    const csResult = JSON.parse(csRun.stdout);
    assert.strictEqual(csResult.status, 'closed', '#338: gitlab finalize --attest-contractor-spawn returns status:closed');
    assert.strictEqual(csResult.closure_receipt.finalize_contractor_attested, 'attested',
      '#338: gitlab --attest-contractor-spawn must make finalize_contractor_attested attested, got ' + csResult.closure_receipt.finalize_contractor_attested);
    const csArchived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-9701'));
    const csLog = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', csArchived[0], '.cache', 'dispatch-log.jsonl'), 'utf8');
    assert.ok(csLog.includes('finalize-backfill'), '#338: gitlab archived dispatch-log carries the finalize-backfill marker');

    // #333: --keep-open stamp — last_result: closed_keep_open + issue_disposition: kept-open.
    const koDir = path.join(tmp, 'kaola-workflow', 'issue-971');
    fs.mkdirSync(koDir, { recursive: true });
    fs.writeFileSync(path.join(koDir, 'workflow-state.md'),
      '## Project\nname: issue-971\nstatus: active\nissue_number: 971\n'
      + 'next_command: /kaola-workflow-plan-run issue-971\n'
      + '## Sink\nbranch: workflow/issue-971\nsink: merge\n'
      + '## Pending Gates\n- workflow-plan\n\n## Last Evidence\nlast_command: startup\nlast_result: folder_claimed\n');
    seedAdaptiveFinalizeFixture(tmp, 'issue-971');
    fs.writeFileSync(path.join(roadmapM2Dir, 'issue-971.md'),
      'issue: #971\ntitle: t\nstatus: open\nworkflow_project: issue-971\nnext_step: ready\n');
    const koRun = spawnNode(claimScript, ['finalize', '--project', 'issue-971', '--keep-open'], tmp);
    assert.strictEqual(koRun.status, 0,
      '#333: gitlab keep-open finalize command must exit 0, stdout: ' + koRun.stdout + ' stderr: ' + koRun.stderr);
    const koResult = JSON.parse(koRun.stdout);
    assert.strictEqual(koResult.status, 'closed', '#333: gitlab keep-open finalize returns status:closed');
    assert.strictEqual(koResult.issue_disposition, 'kept-open', '#333: gitlab keep-open JSON issue_disposition is kept-open');
    const koArchived = fs.readdirSync(path.join(tmp, 'kaola-workflow', 'archive')).filter(n => n.startsWith('issue-971'));
    const koState = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'archive', koArchived[0], 'workflow-state.md'), 'utf8');
    assert.ok(koState.includes('last_result: closed_keep_open'), '#333: gitlab keep-open archived last_result is closed_keep_open');
    assert.ok(/^## Closure$/m.test(koState), '#333: gitlab keep-open archived state carries a ## Closure block');
    assert.ok(koState.includes('issue_disposition: kept-open'), '#333: gitlab keep-open ## Closure records issue_disposition: kept-open');

    // #333: a manually archived active state is not proof that pre-rename gates ran.
    // Finalize must refuse without terminal-stamping or appending closure evidence.
    const bsArchiveDir = path.join(tmp, 'kaola-workflow', 'archive', 'issue-972');
    fs.mkdirSync(bsArchiveDir, { recursive: true });
    const bsStatePath = path.join(bsArchiveDir, 'workflow-state.md');
    fs.writeFileSync(bsStatePath,
      '## Project\nname: issue-972\nstatus: active\nissue_number: 972\n'
      + 'next_command: /kaola-workflow-plan-run issue-972\n'
      + '## Sink\nbranch: workflow/issue-972\nsink: merge\n');
    const bsBefore = fs.readFileSync(bsStatePath, 'utf8');
    const bsRun = spawnNode(claimScript, ['finalize', '--project', 'issue-972'], tmp);
    let bsResult = null;
    try { bsResult = JSON.parse(bsRun.stdout); } catch (_) {}
    assert.ok(bsRun.status !== 0 && bsResult && bsResult.reason === 'finalize_gate_unverified'
      && bsResult.inner_reason === 'archive_state_not_closed',
    '#333: gitlab manual archive must refuse through archive_state_not_closed, stdout: '
      + bsRun.stdout + ' stderr: ' + bsRun.stderr);
    const bsState = fs.readFileSync(bsStatePath, 'utf8');
    assert.strictEqual(bsState, bsBefore, '#333: gitlab manual-archive refusal leaves state byte-identical');
    assert.ok(bsState.includes('status: active') && !/^## Closure$/m.test(bsState),
      '#333: gitlab manual-archive refusal neither terminal-stamps nor appends closure evidence');

    // #425: ledger-header freeze-wall on the GITLAB edition validator.
    // A plan with `| node | status |` ledger header must refuse with ledger_header_invalid;
    // --freeze --repair normalizes it and surfaces header_normalized:true.
    {
      const planBodyLh = [
        '# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
        '| impl | tdd-guide | — | lib/foo.js | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |',
        '', '## Node Ledger', '',
        '| node | status |',
        '|---|---|',
        '| impl | pending |',
        '| review | pending |',
        '| done | pending |',
        '',
      ].join('\n');
      const lhv = fv.validatePlan(planBodyLh);
      assert.strictEqual(lhv.result, 'refuse',
        'gitlab #425: plan with `| node |` ledger header must refuse at freeze');
      assert.ok(Array.isArray(lhv.errors) && lhv.errors.some(e => /ledger_header_invalid/.test(e)),
        'gitlab #425: refusal errors must name ledger_header_invalid, got: ' + JSON.stringify(lhv.errors));

      // --repair via CLI normalizes the header and surfaces header_normalized:true.
      const lhPlanPath = path.join(tmp, 'lh-plan.md');
      fs.writeFileSync(lhPlanPath, planBodyLh);
      fs.writeFileSync(lhPlanPath, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(lhPlanPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(lhPlanPath, 'utf8'));
      const lhR = spawnNode(valScript, [lhPlanPath, '--freeze', '--repair', '--json'], tmp);
      assert.strictEqual(lhR.status, 0,
        'gitlab #425: --freeze --repair must exit 0 on a `| node |` header plan, got ' + lhR.status + ' stderr: ' + lhR.stderr);
      const lhOut = JSON.parse(lhR.stdout);
      assert.strictEqual(lhOut.result, 'in-grammar',
        'gitlab #425: --freeze --repair must freeze to in-grammar, got: ' + JSON.stringify(lhOut.result));
      assert.strictEqual(lhOut.header_normalized, true,
        'gitlab #425: --freeze --repair output must include header_normalized:true, got: ' + JSON.stringify(lhOut.header_normalized));
    }

    // #431: generated-aggregator port-split freeze-wall on the GITLAB edition validator.
    // The gitlab validator is a forge port — editionSync is null in its tree (no edition-sync.js
    // in plugins/kaola-workflow-gitlab/scripts/), so the generated_port_split check is intentionally
    // inert. This asserts the zero-false-positive anchor contract for forge installs.
    {
      // Build the write-set string via join() to avoid triggering the forge-script literal guard.
      const codexScriptsPath = ['plugins', 'kaola-workflow', 'scripts', 'kaola-workflow-plan-validator.js'].join('/');
      const splitPlanGl = [
        '# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
        '| id | role | depends_on | declared_write_set | cardinality | shape |',
        '|---|---|---|---|---|---|',
        '| impl | implementer | — | scripts/kaola-workflow-plan-validator.js, ' + codexScriptsPath + ' | 1 | sequence |',
        '| review | code-reviewer | impl | — | 1 | sequence |',
        '| done | finalize | review | — | 1 | sequence |',
        '',
      ].join('\n');
      const glSplit = fv.validatePlan(splitPlanGl);
      assert.ok(!(Array.isArray(glSplit.errors) && glSplit.errors.some(e => /generated_port_split/.test(e))),
        'gitlab #431 anchor: gitlab validator must NOT fire generated_port_split (inert in forge tree), got: ' + JSON.stringify(glSplit.errors));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testGitlabAdaptive: PASSED');
}

// #418.5: adaptive new-behavior smoke — the #408 fused freeze chain on the FORK validator.
// --freeze-checked returns the planHash WITHOUT writing; a subsequent --freeze --governance-ack with
// a STALE hash (plan mutated between the two spawns) must refuse governance_ack_stale and NOT write.
function testGitlabAdaptiveFreezeChecked() {
  const valScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
  const PLAN = [
    '# Workflow Plan', '', '## Meta',
    'plan_schema_version: 2', 'labels: enhancement',
    'code_certifier: r', 'security_certifier: none',
    'inherited_frontier_digest: none', 'inherited_frontier_classes: none',
    'validation_command: node --check index.js',
    'validation_timeout_minutes: 5', '', '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape | gate_claim | gate_surface | gate_aggregation | certifies |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| e | code-explorer | — | — | 1 | sequence | — | — | — | — |',
    '| i | tdd-guide | e | lib/x.js | 1 | sequence | — | — | — | — |',
    '| r | code-reviewer | i | — | 1 | sequence | review-change | code-tree | sequence | — |',
    '| d | finalize | r | — | 1 | sequence | — | — | — | — |', '',
    '## Node Ledger', '', '| id | status |', '|---|---|',
    '| e | pending |', '| i | pending |', '| r | pending |', '| d | pending |', '',
    '## Required Agent Compliance', '', '| Requirement | Status | Evidence | Skip Reason |', '|---|---|---|---|',
    '| code-explorer (e) | pending | | |', '| tdd-guide (i) | pending | | |',
    '| code-reviewer (r) | pending | | |', '| finalize (d) | pending | | |', ''
  ].join('\n');
  function spawnNode(script, args, cwd, env) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }, env || {})
    });
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-freeze-checked-'));
  try {
    const planPath = path.join(tmp, 'workflow-plan.md');
    fs.writeFileSync(planPath, PLAN);
    // SPAWN 1: --freeze-checked validates + returns planHash, does NOT write plan_hash into the file.
    const checked = JSON.parse(spawnNode(valScript, [planPath, '--freeze-checked', '--json'], tmp).stdout);
    assert.strictEqual(checked.result, 'in-grammar', 'gitlab #418.5: --freeze-checked is in-grammar');
    assert.strictEqual(checked.frozen, false, 'gitlab #418.5: --freeze-checked does NOT freeze');
    assert.ok(typeof checked.planHash === 'string' && checked.planHash.length > 0,
      'gitlab #418.5: --freeze-checked returns a planHash');
    assert.ok(!fs.readFileSync(planPath, 'utf8').includes('plan_hash:'),
      'gitlab #418.5: --freeze-checked leaves the file unfrozen (no plan_hash stamped)');
    // Mutate the plan AFTER governance (dodging the ack the operator approved).
    fs.writeFileSync(planPath, fs.readFileSync(planPath, 'utf8').replace('lib/x.js', 'lib/z.js'));
    // SPAWN 2: --freeze --governance-ack <stale hash> must refuse governance_ack_stale, no write.
    const stale = JSON.parse(spawnNode(valScript, [planPath, '--freeze', '--governance-ack', checked.planHash, '--json'], tmp).stdout);
    assert.strictEqual(stale.result, 'refuse', 'gitlab #418.5: stale governance-ack must refuse');
    assert.strictEqual(stale.reason, 'governance_ack_stale', 'gitlab #418.5: refuse reason is governance_ack_stale');
    assert.strictEqual(stale.frozen, false, 'gitlab #418.5: governance_ack_stale must NOT write/freeze');
    assert.ok(!fs.readFileSync(planPath, 'utf8').includes('plan_hash:'),
      'gitlab #418.5: governance_ack_stale leaves the plan unfrozen');
    console.log('testGitlabAdaptiveFreezeChecked: PASSED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ===========================================================================
// issue #342: bundle-lane E2E behavioral coverage for the GitLab edition.
// Mirrors the six root scenarios (simulate-workflow-walkthrough.js §#328) modulo
// forge nouns, driving the REAL gitlab edition CLIs via subprocess (no direct-call
// shims — the #292 io-shim lesson). Each scenario uses its own mkdtempSync root +
// try/finally cleanup. Forbidden-token discipline: the GitHub-CLI binary token must
// never appear here (the gitlab validator scans this file); we use glab-mock.js /
// glab-calls.log and write "mirrors the root walkthrough" in prose.
// ===========================================================================

function glInitGitRepo(tmp) {
  spawnSync('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test User'], { cwd: tmp, encoding: 'utf8' });
  fs.writeFileSync(path.join(tmp, 'README.md'), 'fixture\n');
  spawnSync('git', ['add', 'README.md'], { cwd: tmp, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
}

function glPlantRoadmapIssue(tmp, n) {
  const dir = path.join(tmp, 'kaola-workflow', '.roadmap');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'issue-' + n + '.md'),
    ['issue: #' + n, 'title: bundle test issue ' + n, 'status: open',
     'workflow_project: —', 'next_step: ready', ''].join('\n'));
}

function glWriteProject(tmp, project, files) {
  const dir = path.join(tmp, 'kaola-workflow', project);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
}

// Mirrors the root writeBundleGhMockScript with glab arg shapes (kaola-gitlab-forge.js).
// opts: { logFile, openIssues: number[], closedIssues: number[] }
function writeBundleGlabMockScript(binDir, opts) {
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
    // repo view → gitlab project shape (id feeds projectApiRef, path_with_namespace feeds normalizeProject)
    'if (a.includes("repo view")) { process.stdout.write(JSON.stringify({id:1,path_with_namespace:"test/repo",web_url:"https://gl.invalid/test/repo"}) + "\\n"); process.exit(0); }',
    'const viewM = a.match(/issue view (\\d+)/);',
    'if (viewM) {',
    '  const n = viewM[1];',
    '  const state = closedIssues.has(n) ? "closed" : "opened";',
    '  process.stdout.write(JSON.stringify({iid:parseInt(n),state,title:"issue "+n,description:"",labels:[]}) + "\\n");',
    '  process.exit(0);',
    '}',
    'if (a.includes("issue update") && a.includes("--label")) { const m = a.match(/issue update (\\d+)/); log("label-added:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("issue update") && a.includes("--unlabel")) { const m = a.match(/issue update (\\d+)/); log("label-removed:" + (m ? m[1] : "?")); process.stdout.write("{}\\n"); process.exit(0); }',
    // POST/DELETE must precede the GET /notes check (all three contain /notes).
    'if (a.includes("api") && a.includes("--method POST") && a.includes("/notes")) { log("note:"); process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("api") && a.includes("--method DELETE")) { process.stdout.write("{}\\n"); process.exit(0); }',
    'if (a.includes("api") && a.includes("/notes")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'if (a.includes("issue list")) { process.stdout.write("[]\\n"); process.exit(0); }',
    'process.stdout.write("\\n"); process.exit(0);',
  ].join('\n');
  fs.writeFileSync(path.join(binDir, 'glab-mock.js'), script);
}

// Online runner mirroring the root walkthrough's pattern: spawn the real edition CLI
// with KAOLA_GLAB_MOCK_SCRIPT routed at the mock and adaptive switch ON. Returns the
// full spawnSync result (caller asserts status + parses the last JSON object line).
function glSpawnBundle(args, cwd, binDir, extraEnv) {
  return spawnSync(process.execPath, [claimScript, ...args], {
    cwd, encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, {
      KAOLA_WORKFLOW_OFFLINE: '0',
      KAOLA_WORKTREE_NATIVE: '1',
      KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab-mock.js'),
    }, extraEnv || {})
  });
}

function glLastJson(stdout) {
  const lines = (stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
  assert(lines.length > 0, 'expected a JSON object line, got: ' + stdout);
  return JSON.parse(lines[lines.length - 1]);
}

// S1: explicit bundle claim creates exactly ONE active folder + the three additive
// bundle fields in workflow-state.md. AC#2 + AC#3 E2E guard.
function testGitlabBundleClaimCreatesOneFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-claim-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'glab-calls.log');
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    writeBundleGlabMockScript(binDir, { logFile, openIssues: [42, 47, 53] });

    const result = glSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 0,
      'gitlab #342 S1: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitlab #342 S1: claim must be acquired, got ' + JSON.stringify(out.claim));
    assert.strictEqual(out.bundle_id, 'bundle-42-47-53', 'gitlab #342 S1: bundle_id must be bundle-42-47-53, got ' + JSON.stringify(out.bundle_id));
    assert.ok(Array.isArray(out.issue_numbers) && out.issue_numbers.length === 3,
      'gitlab #342 S1: issue_numbers must have 3 members, got ' + JSON.stringify(out.issue_numbers));

    const kwDir = path.join(tmp, 'kaola-workflow');
    const projects = fs.readdirSync(kwDir).filter(n => !n.startsWith('.') && n !== 'archive' && n !== 'ROADMAP.md');
    assert.ok(projects.length === 1 && projects[0] === 'bundle-42-47-53',
      'gitlab #342 S1: exactly one active folder (bundle-42-47-53) expected, got ' + projects.join(','));

    const state = fs.readFileSync(path.join(kwDir, 'bundle-42-47-53', 'workflow-state.md'), 'utf8');
    assert.ok(/^issue_iid:\s*42\s*$/m.test(state), 'gitlab #342 S1: state must have issue_iid: 42 (## GitLab)');
    assert.ok(/^issue_number:\s*42\s*$/m.test(state), 'gitlab #342 S1: state must have issue_number: 42 (## Sink primary)');
    assert.ok(/^issue_numbers:\s*42,47,53\s*$/m.test(state), 'gitlab #342 S1: state must have issue_numbers: 42,47,53');
    assert.ok(/^bundle_id:\s*bundle-42-47-53\s*$/m.test(state), 'gitlab #342 S1: state must have bundle_id: bundle-42-47-53');
    assert.ok(/^closure_policy:\s*all_or_nothing\s*$/m.test(state), 'gitlab #342 S1: state must have closure_policy: all_or_nothing');
    assert.ok(!/^closure_policy:/m.test(state.replace(/^closure_policy:\s*all_or_nothing\s*$/m, '')),
      'gitlab #342 S1: closure_policy must appear exactly once');
    assert.ok(/^branch:\s*workflow\/gitlab-bundle-42-47-53\s*$/m.test(state),
      'gitlab #342 S1: state must have branch: workflow/gitlab-bundle-42-47-53');

    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const added = calls.filter(c => c.startsWith('label-added:'));
    assert.ok(added.includes('label-added:42'), 'gitlab #342 S1: label added for member 42');
    assert.ok(added.includes('label-added:47'), 'gitlab #342 S1: label added for member 47');
    assert.ok(added.includes('label-added:53'), 'gitlab #342 S1: label added for member 53');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleClaimCreatesOneFolder: PASSED');
}

// #347: --attest-planner-spawn on the forge claim back-fills the planner dispatch-log line (the
// #280 producer, ported here). Without the flag-parse + back-fill the line is never written and the
// forge sink-merge attestation (#300 consumer) is structurally dead on this edition. Behavioral
// proof: a startup claim WITH the flag writes a workflow-planner entry to dispatch-log.jsonl.
function testGitlabPlannerAttestBackfill() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-attest-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'glab-calls.log');
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    writeBundleGlabMockScript(binDir, { logFile, openIssues: [42, 47, 53] });
    const result = glSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive', '--attest-planner-spawn'], tmp, binDir);
    assert.strictEqual(result.status, 0, 'gitlab #347: exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitlab #347: claim must be acquired');
    const dispatchLog = path.join(tmp, 'kaola-workflow', 'bundle-42-47-53', '.cache', 'dispatch-log.jsonl');
    assert.ok(fs.existsSync(dispatchLog), 'gitlab #347: --attest-planner-spawn must create dispatch-log.jsonl at ' + dispatchLog);
    const lines = fs.readFileSync(dispatchLog, 'utf8').split('\n').filter(Boolean);
    const plannerLine = lines.find(l => { try { return JSON.parse(l).agent_type === 'workflow-planner'; } catch (_) { return false; } });
    assert.ok(plannerLine, 'gitlab #347: dispatch-log must carry a workflow-planner back-fill entry, got: ' + lines.join('|'));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabPlannerAttestBackfill: PASSED');
}

// n6 (#653 finding A, gitlab port): a non-empty ATTESTATION WARNING must not live only in stdout
// JSON — cmdFinalize's persistAttestationToSummary transcribes it (and the two column-0 status
// fields) into the archived finalization-summary.md, and appendClosureBlock's ## Closure block
// carries the same fields. Mirrors root's testAttestationWarningPersistence modulo forge nouns.
function testGitlabAttestationWarningPersistence() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-653-attest-')));
  try {
    glInitGitRepo(tmp);
    const project = 'issue-653gl';
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## GitLab', 'issue_iid: 653101', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/' + project, 'issue_number: 653101', 'sink: merge', ''
      ].join('\n')
    });
    glPlantRoadmapIssue(tmp, 653101);
    // This fixture jumps directly from claim state to finalize and intentionally
    // does not author an adaptive plan.
    seedAdaptiveFinalizeFixture(tmp, project);
    // Seed .cache/dispatch-log.jsonl with ONLY a contractor entry (no workflow-planner entry) —
    // the exact inline-bypass scenario the ATTESTATION WARNING exists to catch.
    const cacheDir = path.join(tmp, 'kaola-workflow', project, '.cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'dispatch-log.jsonl'),
      JSON.stringify({ ts: new Date().toISOString(), agent_type: 'contractor', agent_id: 'test-seed', cwd: tmp }) + '\n');

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    assert.strictEqual(result.status, 0,
      'gitlab #653 attestation persistence: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitlab #653 attestation persistence: status must be closed, got ' + JSON.stringify(out.status));
    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #653 attestation persistence: closure_receipt must be present');
    assert.strictEqual(receipt.claim_planner_attested, 'missing',
      'gitlab #653 attestation persistence: claim_planner_attested must be missing, got ' + JSON.stringify(receipt.claim_planner_attested));

    assert.ok(out.dest && fs.existsSync(out.dest), 'gitlab #653 attestation persistence: archive dest must exist');
    const finSummaryPath = path.join(out.dest, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'gitlab #653 attestation persistence: archived finalization-summary.md must exist');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(/^claim_planner_attested:\s*missing\s*$/m.test(finContent),
      'gitlab #653 attestation persistence: finalization-summary.md must carry column-0 claim_planner_attested: missing, got: ' + finContent);
    assert.ok(finContent.includes('ATTESTATION WARNING: no workflow-planner dispatch found in dispatch-log'),
      'gitlab #653 attestation persistence: finalization-summary.md must carry the verbatim ATTESTATION WARNING, got: ' + finContent);

    const stateContent = fs.readFileSync(path.join(out.dest, 'workflow-state.md'), 'utf8');
    assert.ok(/^## Closure$/m.test(stateContent),
      'gitlab #653 attestation persistence: archived workflow-state.md must carry ## Closure');
    assert.ok(/^claim_planner_attested:\s*missing\s*$/m.test(stateContent),
      'gitlab #653 attestation persistence: archived workflow-state.md ## Closure block must carry claim_planner_attested: missing, got: ' + stateContent);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabAttestationWarningPersistence: PASSED');
}

// n6 (#653 finding D3, gitlab port): a selection-evidence.md docked pre-finalize (simulating the
// router's D2 docking) must be probed into closure_receipt.selection_evidence ('present'), and
// survive archival; a claim with no docked file reads 'absent'. Mirrors root's
// testSelectionEvidenceDocking modulo forge nouns.
function testGitlabSelectionEvidenceDocking() {
  const tmpPresent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-653-selev-present-')));
  const tmpAbsent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-653-selev-absent-')));
  try {
    for (const entry of [{ tmp: tmpPresent, seed: true, issue: 653201 }, { tmp: tmpAbsent, seed: false, issue: 653202 }]) {
      const { tmp, seed, issue } = entry;
      glInitGitRepo(tmp);
      const project = 'issue-' + issue + 'gl';
      glWriteProject(tmp, project, {
        'workflow-state.md': [
          '# Kaola-Workflow State', '',
          '## Project', 'name: ' + project, 'status: active', '',
          '## GitLab', 'issue_iid: ' + issue, 'path_with_namespace: test/repo', '',
          '## Sink', 'branch: workflow/' + project, 'issue_number: ' + issue, 'sink: merge', ''
        ].join('\n')
      });
      glPlantRoadmapIssue(tmp, issue);
      seedAdaptiveFinalizeFixture(tmp, project);
      if (seed) {
        const cacheDir = path.join(tmp, 'kaola-workflow', project, '.cache');
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, 'selection-evidence.md'),
          'selection_mode: single-issue\n\n```json\n{"recommended_bundle":{"primary_issue":' + issue + ',"issues":[' + issue + '],"confidence":"low"}}\n```\n');
      }

      const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
        cwd: tmp, encoding: 'utf8', timeout: 60000,
        env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
      });
      assert.strictEqual(result.status, 0,
        'gitlab #653 selection-evidence docking: exit 0 expected (seed=' + seed + '), got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
      const out = glLastJson(result.stdout);
      assert.strictEqual(out.status, 'closed', 'gitlab #653 selection-evidence docking: status must be closed (seed=' + seed + ')');
      const receipt = out.closure_receipt;
      assert.ok(receipt != null, 'gitlab #653 selection-evidence docking: closure_receipt must be present (seed=' + seed + ')');
      assert.strictEqual(receipt.selection_evidence, seed ? 'present' : 'absent',
        'gitlab #653 selection-evidence docking: selection_evidence must be ' + (seed ? 'present' : 'absent') +
        ' (seed=' + seed + '), got ' + JSON.stringify(receipt.selection_evidence));

      if (seed) {
        assert.ok(out.dest && fs.existsSync(out.dest), 'gitlab #653 selection-evidence docking: archive dest must exist');
        assert.ok(fs.existsSync(path.join(out.dest, '.cache', 'selection-evidence.md')),
          'gitlab #653 selection-evidence docking: selection-evidence.md must survive under the archived .cache/');
      }
    }
  } finally {
    fs.rmSync(tmpPresent, { recursive: true, force: true });
    fs.rmSync(tmpAbsent, { recursive: true, force: true });
  }
  console.log('testGitlabSelectionEvidenceDocking: PASSED');
}

// S2: a refused bundle claim (closed member #47) leaves NO active folder and applies
// ZERO labels (pre-mutation refusal). AC#5 + AC#6 guard.
function testGitlabBundleRefusalLeavesNoFolder() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-refuse-')));
  const binDir = path.join(tmp, 'bin');
  const logFile = path.join(tmp, 'glab-calls.log');
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    writeBundleGlabMockScript(binDir, { logFile, openIssues: [42, 53], closedIssues: [47] });

    const result = glSpawnBundle(['startup', '--target-issues', '42,47,53', '--workflow-path', 'adaptive'], tmp, binDir);
    assert.strictEqual(result.status, 1,
      'gitlab #342 S2: exit 1 expected for closed member, got ' + result.status + '\nstdout: ' + result.stdout);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'target_set_has_closed_issue',
      'gitlab #342 S2: status must be target_set_has_closed_issue, got ' + JSON.stringify(out.status));
    assert.strictEqual(out.issue, 47, 'gitlab #342 S2: refused on issue 47, got ' + JSON.stringify(out.issue));

    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', 'bundle-42-47-53')),
      'gitlab #342 S2: no bundle-42-47-53 folder must exist after refusal');
    const calls = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean) : [];
    const labelsAdded = calls.filter(c => c.startsWith('label-added:'));
    assert.strictEqual(labelsAdded.length, 0,
      'gitlab #342 S2: no labels must be applied after pre-mutation refusal, got: ' + labelsAdded.join(', '));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleRefusalLeavesNoFolder: PASSED');
}

// S3: a live bundle [42,47,53] blocks (a) a direct single-issue claim of member 47 and
// (b) an overlapping bundle claim [47,77]. Offline. AC#8 duplicate-block guard.
function testGitlabBundleDuplicateIssueBlocking() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-dup-')));
  try {
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 77);
    glWriteProject(tmp, 'bundle-42-47-53', {
      'workflow-state.md': [
        'name: bundle-42-47-53', 'status: active', 'phase: adaptive',
        'issue_iid: 42', 'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: bundle-42-47-53', 'closure_policy: all_or_nothing',
        'branch: workflow/gitlab-bundle-42-47-53', 'sink: merge', ''
      ].join('\n')
    });

    const offlineEnv = { KAOLA_WORKFLOW_OFFLINE: '1' };
    const r1 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '47'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    const o1 = JSON.parse(r1.stdout);
    assert.ok(o1.claim === 'owned' || o1.claim === 'none',
      'gitlab #342 S3 (a): claim must be owned or none for live bundle member 47, got ' + JSON.stringify(o1.claim));
    if (o1.claim === 'owned') {
      assert.strictEqual(o1.project, 'bundle-42-47-53',
        'gitlab #342 S3 (a): owned claim must resolve to bundle-42-47-53, got ' + JSON.stringify(o1.project));
    }

    const r2 = spawnSync(process.execPath, [claimScript, 'startup', '--target-issues', '47,77', '--workflow-path', 'adaptive'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, offlineEnv) });
    assert.strictEqual(r2.status, 1,
      'gitlab #342 S3 (b): overlapping bundle [47,77] must exit 1, got ' + r2.status + '\nstdout: ' + r2.stdout);
    const o2 = JSON.parse(r2.stdout);
    assert.strictEqual(o2.status, 'target_set_conflicts_active_work',
      'gitlab #342 S3 (b): status must be target_set_conflicts_active_work, got ' + JSON.stringify(o2.status));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleDuplicateIssueBlocking: PASSED');
}

// S4: adaptive orient on a bundle project surfaces bundleId / issueNumbers / primaryIssue /
// closurePolicy. Offline. AC#14 (orient surface) guard.
function testGitlabBundleOrientSurfacesBundleIdentity() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-orient-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  const adaptiveNodeScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js');
  const valScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
  try {
    const project = 'bundle-42-47-53';
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- workflow-plan', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/gitlab-' + project,
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing', 'sink: merge', ''
      ].join('\n')
    });

    // Plant + freeze a 2-node adaptive plan with the EDITION validator (mirrors testGitlabAdaptive).
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
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
    const fr = spawnSync(process.execPath, [valScript, planPath, '--freeze'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert.strictEqual(fr.status, 0, 'gitlab #342 S4: plan freeze must exit 0, stderr: ' + fr.stderr);

    const result = spawnSync(process.execPath, [adaptiveNodeScript, 'orient', '--project', project, '--json'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert.strictEqual(result.status, 0,
      'gitlab #342 S4: orient exit 0 expected, got ' + result.status + '\nstderr: ' + result.stderr);
    const out = JSON.parse(result.stdout.trim().split('\n').filter(l => l.trim().startsWith('{')).pop());
    assert.strictEqual(out.bundleId, 'bundle-42-47-53', 'gitlab #342 S4: bundleId must be bundle-42-47-53, got ' + JSON.stringify(out.bundleId));
    assert.ok(Array.isArray(out.issueNumbers) && out.issueNumbers.length === 3 &&
      out.issueNumbers[0] === 42 && out.issueNumbers[1] === 47 && out.issueNumbers[2] === 53,
      'gitlab #342 S4: issueNumbers must be [42,47,53], got ' + JSON.stringify(out.issueNumbers));
    assert.strictEqual(out.primaryIssue, 42, 'gitlab #342 S4: primaryIssue must be 42, got ' + JSON.stringify(out.primaryIssue));
    assert.strictEqual(out.closurePolicy, 'all_or_nothing', 'gitlab #342 S4: closurePolicy must be all_or_nothing, got ' + JSON.stringify(out.closurePolicy));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleOrientSurfacesBundleIdentity: PASSED');
}

// S5: finalize on a bundle project removes ALL member .roadmap/issue-N.md files, regenerates
// the mirror once, archives ONE folder, and the closure receipt carries the bundle fields.
// THIS IS THE SCENARIO THAT WOULD HAVE CAUGHT THE #328 CR1 FORGE-FINALIZATION DEFECT.
// AC#11 + AC#12 + AC#13 E2E guard.
function testGitlabBundleFinalizeRoadmapCleanup() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-finalize-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-42-47-53';
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/gitlab-' + project,
        'issue_number: 42', 'issue_numbers: 42,47,53',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);
    glPlantRoadmapIssue(tmp, 53);
    fs.writeFileSync(path.join(tmp, 'kaola-workflow', 'ROADMAP.md'), [
      '# Kaola-Workflow Roadmap', '',
      '| Issue | Title | Status |', '|-------|-------|--------|',
      '| #42 | Test 42 | active |', '| #47 | Test 47 | active |', '| #53 | Test 53 | active |', ''
    ].join('\n'));
    writeBundleGlabMockScript(binDir, { closedIssues: [42, 47, 53] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab-mock.js'),
      })
    });
    assert.strictEqual(result.status, 0,
      'gitlab #342 S5: finalize exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitlab #342 S5: status must be closed, got ' + JSON.stringify(out.status));
    assert.ok(out.closure_receipt && out.closure_receipt.roadmap_regenerated === 'regenerated',
      'gitlab #342 S5: receipt.roadmap_regenerated must be "regenerated", got ' +
      JSON.stringify(out.closure_receipt && out.closure_receipt.roadmap_regenerated));

    for (const n of [42, 47, 53]) {
      assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-' + n + '.md')),
        'gitlab #342 S5: issue-' + n + '.md roadmap source must be removed after finalize');
    }
    assert.ok(out.dest && fs.existsSync(out.dest), 'gitlab #342 S5: archive folder must exist at dest');
    assert.ok(!fs.existsSync(path.join(tmp, 'kaola-workflow', project)),
      'gitlab #342 S5: live project folder must be gone after finalize');

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #342 S5: closure_receipt must be present');
    assert.ok(Array.isArray(receipt.roadmap_sources_removed) && receipt.roadmap_sources_removed.length === 3,
      'gitlab #342 S5: roadmap_sources_removed must have 3 entries, got ' + JSON.stringify(receipt.roadmap_sources_removed));
    for (const n of [42, 47, 53]) {
      assert.ok(receipt.roadmap_sources_removed.includes('issue-' + n + '.md'),
        'gitlab #342 S5: roadmap_sources_removed must include issue-' + n + '.md');
    }
    assert.ok(Array.isArray(receipt.closed_issues), 'gitlab #342 S5: receipt must have closed_issues array');
    assert.ok(Array.isArray(receipt.failed_issue_closures) && receipt.failed_issue_closures.length === 0,
      'gitlab #342 S5: failed_issue_closures must be empty when all probes succeed, got ' + JSON.stringify(receipt.failed_issue_closures));
    assert.ok(Array.isArray(receipt.issue_numbers) && receipt.issue_numbers.length === 3,
      'gitlab #342 S5: receipt must have issue_numbers with 3 members, got ' + JSON.stringify(receipt.issue_numbers));

    const inv = out.closure_invariants;
    assert.ok(inv && inv.ok === true,
      'gitlab #342 S5: closure_invariants must pass; violations: ' + JSON.stringify(inv && inv.violations));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleFinalizeRoadmapCleanup: PASSED');
}

// S6: AC#1 contamination guard — a single-issue claim must NOT write the bundle fields. Offline.
function testGitlabBundleSingleIssueStateHasNoBundleFields() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-bundle-single-'));
  fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
  try {
    glInitGitRepo(tmp);
    glPlantRoadmapIssue(tmp, 601);
    const r = spawnSync(process.execPath, [claimScript, 'startup', '--target-issue', '601'],
      { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.claim, 'acquired', 'gitlab #342 S6: single-issue startup must acquire, got ' + JSON.stringify(out.claim));
    const state = fs.readFileSync(path.join(tmp, 'kaola-workflow', 'issue-601', 'workflow-state.md'), 'utf8');
    assert.ok(!/^issue_numbers:/m.test(state), 'gitlab #342 S6: single-issue state must NOT contain issue_numbers line');
    assert.ok(!/^bundle_id:/m.test(state), 'gitlab #342 S6: single-issue state must NOT contain bundle_id line');
    assert.ok(!/^closure_policy:/m.test(state), 'gitlab #342 S6: single-issue state must NOT contain closure_policy line');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log('testGitlabBundleSingleIssueStateHasNoBundleFields: PASSED');
}

// issue #237: the leading-dot FILE_PATH_REGEX widening must hold on the FORK classifier too —
// a dot-leading CI/supply-chain path is captured (so cross-project claim-overlap can see it on
// both the candidate and claimed sides) while bare-word prose still does not over-match.
function testGitlab237DotPathExtraction() {
  const classifier = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-classifier.js'));
  const got = classifier.extractFilePaths('this issue rewrites .github/workflows/deploy.yml for CI');
  assert.ok(got.has('.github/workflows/deploy.yml'),
    'gitlab #237: dot-leading CI path must be extracted, got: ' + JSON.stringify([...got]));
  const prose = classifier.extractFilePaths('use Node.js version 3.19.1 with package.json and config.json');
  assert.strictEqual(prose.size, 0,
    'gitlab #237: bare-word prose must NOT over-match into paths, got: ' + JSON.stringify([...prose]));
  console.log('testGitlab237DotPathExtraction: PASSED');
}

// M1 (#277): dispatch-log hook must be installed in the gitlab plugin hooks directory.
function testGitlabDispatchHookExists() {
  const hooksDir = path.join(root, 'plugins/kaola-workflow-gitlab/hooks');
  const dispatchLog = path.join(hooksDir, 'kaola-workflow-subagent-dispatch-log.sh');
  assert.ok(fs.existsSync(dispatchLog), 'M1 (#277): gitlab hooks/kaola-workflow-subagent-dispatch-log.sh must exist');
  const hooksJson = path.join(hooksDir, 'hooks.json');
  assert.ok(fs.existsSync(hooksJson), 'M1 (#277): gitlab hooks/hooks.json must exist');
  const hooks = JSON.parse(fs.readFileSync(hooksJson, 'utf8'));
  const subagentHooks = (hooks.hooks && hooks.hooks.SubagentStart) || [];
  assert.ok(
    subagentHooks.some(e => e.id === 'kaola-workflow:subagent-dispatch-log'),
    'M1 (#277): gitlab hooks.json must have a SubagentStart entry with id: kaola-workflow:subagent-dispatch-log'
  );
  console.log('testGitlabDispatchHookExists: PASSED');
}

// issue #283: repair-state must use finalization-summary.md (not phase6-summary.md) as the
// completion signal, emit stage: finalization / stage_name: Finalization / next_command:
// /kaola-workflow-finalize for the terminal routine, and the one-way migration must convert
// a legacy active folder (phase6-summary.md→finalization-summary.md, state fields rewritten).
function testRepairFinalizationRoute() {
  const repairScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-repair-state.js');
  const { reconstruct } = require(repairScript);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-repair-finalization-'));
  const workflowDir = path.join(tmp, 'kaola-workflow');
  fs.mkdirSync(workflowDir, { recursive: true });

  function writeProject(projectName, files) {
    const projectDir = path.join(workflowDir, projectName);
    fs.mkdirSync(projectDir, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(projectDir, name), content);
    }
  }

  function statePath(projectName) {
    return path.join(workflowDir, projectName, 'workflow-state.md');
  }

  function readState(projectName) {
    return fs.readFileSync(statePath(projectName), 'utf8');
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

    // --- R3: one-way migration converts legacy active folder ---
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

// issue #283: sink-mr must read/write finalization-summary.md (not phase6-summary.md).
function testSinkMrUsesFinalizationSummary() {
  const sinkMrScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-sink-mr.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-sink-mr-fin-'));
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
      'sink: merge',
      ''
    ].join('\n'));
    // Plant finalization-summary.md (the new canonical file)
    fs.writeFileSync(path.join(kwDir, 'finalization-summary.md'), '# Finalization Summary\n');
    execFileSync('git', ['-C', tmp, 'add', '-A'], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', tmp, 'commit', '-m', 'initial'], { encoding: 'utf8', stdio: 'pipe' });

    const result = spawnSync(process.execPath, [
      sinkMrScript,
      '--branch', 'workflow/issue-2830',
      '--project', 'issue-2830',
      '--issue', '2830'
    ], {
      cwd: tmp,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }),
      encoding: 'utf8'
    });
    assert.strictEqual(result.status, 0,
      'sink-mr (finalization-summary) offline should exit 0, got ' + result.status + '. stderr: ' + result.stderr);

    // finalization-summary.md must exist and contain MR URL
    const finSummaryPath = path.join(kwDir, 'finalization-summary.md');
    assert.ok(fs.existsSync(finSummaryPath),
      'sink-mr must write to finalization-summary.md, not phase6-summary.md');
    const finContent = fs.readFileSync(finSummaryPath, 'utf8');
    assert.ok(finContent.includes('MR URL:'),
      'finalization-summary.md must contain MR URL after sink-mr, got: ' + finContent);

    // phase6-summary.md must NOT be created
    assert.ok(!fs.existsSync(path.join(kwDir, 'phase6-summary.md')),
      'sink-mr must NOT create phase6-summary.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('testSinkMrUsesFinalizationSummary: PASSED');
}

testFallbackGuardsAfterArchive();
testGitlabSinkRefusesLingeringLaneGroup();
testAuditAndRepairLabels();
testRepairFinalizationRoute();
testSinkMrUsesFinalizationSummary();
testGitlabAdaptive();
testGitlabAdaptiveFreezeChecked();
testGitlab237DotPathExtraction();
testGitlabDispatchHookExists();

// issue #342: bundle-lane E2E behavioral coverage (mirrors root §#328 modulo forge nouns).
testGitlabBundleClaimCreatesOneFolder();
testGitlabPlannerAttestBackfill();
testGitlabAttestationWarningPersistence();
testGitlabSelectionEvidenceDocking();
testGitlabBundleRefusalLeavesNoFolder();
testGitlabBundleDuplicateIssueBlocking();
testGitlabBundleOrientSurfacesBundleIdentity();
testGitlabBundleFinalizeRoadmapCleanup();
testGitlabBundleSingleIssueStateHasNoBundleFields();

// bundle-426-427-428-430 regression tests (mirrors root walkthrough §testFinalizeArchiveVerifiesBeforeDelete etc.).
testGitlabFinalizeArchiveVerifiesBeforeDelete();
testGitlabFinalizeClosesIssueBundleMembers();
testGitlabBundleFinalizeAllOpenCloseIsPending();  // #508
testGitlabFinalizeRoadmapResidueDetection();
testGitlabBundleStateIncoherent();

// bundle-424-432-433 n9-walkthrough (gitlab edition):
// evidence seeding (D-433-01 §2) and doc-updater .md-target barrier (D-424-01 allowband).
testGitlabBundle424432433NodeSeeding();

run('test-gitlab-forge-helpers.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');
run('test-gitlab-run-chains.js');  // #550: forge run-chains failing-path (isTransientFetchStderr export must be callable)

console.log('GitLab workflow walkthrough simulation passed');

// ---------------------------------------------------------------------------
// #426: verifyArchiveComplete + copy-then-verify-then-delete ordering.
// Source dir must survive when archive is missing workflow-state.md.
// ---------------------------------------------------------------------------
function testGitlabFinalizeArchiveVerifiesBeforeDelete() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-archive-verify-')));
  const kwRoot = tmp + '.kw';
  try {
    glInitGitRepo(tmp);
    const wtPath = path.join(kwRoot, 'issue-426gl');
    fs.mkdirSync(kwRoot, { recursive: true });
    spawnSync('git', ['worktree', 'add', '-b', 'workflow/issue-426gl', '--', wtPath, 'HEAD'], {
      cwd: tmp, encoding: 'utf8'
    });
    // Project dir with NO workflow-state.md.
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426gl');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'phase-note.md'), 'partial\n');

    const claim = require(claimScript);
    const result = claim.archiveProjectDir(wtPath, 'issue-426gl', 'closed', undefined, {});

    assert.ok(
      fs.existsSync(projDir),
      'gitlab #426: source dir must NOT be deleted when archive is incomplete'
    );
    assert.strictEqual(result.archive_incomplete, true,
      'gitlab #426: archiveProjectDir must return archive_incomplete:true, got: ' + JSON.stringify(result));
    assert.strictEqual(result.snapshot_error, 'state_missing',
      'gitlab #426: malformed source (no workflow-state.md) must fail the epoch-authority preflight before copy/delete, got: ' + JSON.stringify(result));
    console.log('testGitlabFinalizeArchiveVerifiesBeforeDelete: PASSED');
  } finally {
    try { spawnSync('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// #427: finalize offline on a bundle project emits closure_receipt.closure.skipped_offline.
// ---------------------------------------------------------------------------
function testGitlabFinalizeClosesIssueBundleMembers() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-427-closure-')));
  const project = 'bundle-42-47';
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/' + project,
        'issue_number: 42',
        'issue_numbers: 42,47',
        'bundle_id: ' + project,
        'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    seedAdaptiveFinalizeFixture(tmp, project);
    glPlantRoadmapIssue(tmp, 42);
    glPlantRoadmapIssue(tmp, 47);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' })
    });

    assert.strictEqual(result.status, 0,
      'gitlab #427 offline bundle close: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitlab #427 offline bundle close: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed',
      'gitlab #427 offline bundle close: status must be closed, got ' + JSON.stringify(out.status));
    const closure = out.closure_receipt && out.closure_receipt.closure;
    assert.ok(closure != null, 'gitlab #427: closure_receipt.closure must be present');
    assert.ok(
      Array.isArray(closure.skipped_offline) && closure.skipped_offline.includes(42) && closure.skipped_offline.includes(47),
      'gitlab #427: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline)
    );
    assert.ok(
      Array.isArray(closure.closed) && closure.closed.length === 0,
      'gitlab #427: closure.closed must be empty offline, got: ' + JSON.stringify(closure.closed)
    );
    console.log('testGitlabFinalizeClosesIssueBundleMembers: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #508: bundle finalize on merge-lane (--keep-worktree): when all bundle members probe
// as OPEN online, the close is deferred to sink-merge and remote_issue_closed must be
// 'close_pending' (not 'partial') and closed_issues must be []. Parity test for the
// gitlab edition (mirrors claude testBundleFinalizeAllOpenCloseIsPending).
// ---------------------------------------------------------------------------
function testGitlabBundleFinalizeAllOpenCloseIsPending() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-508-fin-')));
  const binDir = path.join(tmp, 'bin');
  const project = 'bundle-508-71-72';
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, project, {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: ' + project, 'status: active', '',
        '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
        'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
        '## Pending Gates', '- none', '',
        '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
        '## Last Updated', new Date().toISOString(), '',
        '## GitLab', 'issue_iid: 71', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/gitlab-' + project,
        'issue_number: 71', 'issue_numbers: 71,72',
        'bundle_id: ' + project, 'closure_policy: all_or_nothing',
        'sink: merge', 'run_posture: in-place', ''
      ].join('\n')
    });
    glPlantRoadmapIssue(tmp, 71);
    glPlantRoadmapIssue(tmp, 72);
    // Both members probe as OPEN (close deferred to sink-merge on merge-lane).
    writeBundleGlabMockScript(binDir, { openIssues: [71, 72] });

    // Seed the frozen adaptive plan + passing gate LAST (after every code-band write).
    seedAdaptiveFinalizeFixture(tmp, project);
    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', project, '--keep-worktree'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, {
        KAOLA_WORKFLOW_OFFLINE: '0',
        KAOLA_WORKTREE_NATIVE: '0',
        KAOLA_GLAB_MOCK_SCRIPT: path.join(binDir, 'glab-mock.js'),
      })
    });

    assert.strictEqual(result.status, 0,
      'gitlab #508 finalize: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const out = glLastJson(result.stdout);
    assert.strictEqual(out.status, 'closed', 'gitlab #508 finalize: status must be closed, got ' + JSON.stringify(out.status));

    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #508 finalize: closure_receipt must be present');
    assert.strictEqual(receipt.remote_issue_closed, 'close_pending',
      'gitlab #508 finalize: remote_issue_closed must be close_pending (all members open, deferred to sink-merge), got ' + JSON.stringify(receipt.remote_issue_closed));
    assert.ok(Array.isArray(receipt.closed_issues) && receipt.closed_issues.length === 0,
      'gitlab #508 finalize: closed_issues must be [] (no pre-sink remote close), got ' + JSON.stringify(receipt.closed_issues));
    assert.ok(Array.isArray(receipt.open_issues) && receipt.open_issues.length === 2,
      'gitlab #508 finalize: open_issues must contain both members (no pre-sink close fired), got ' + JSON.stringify(receipt.open_issues));
    assert.ok(receipt.open_issues.includes(71) && receipt.open_issues.includes(72),
      'gitlab #508 finalize: open_issues must include both 71 and 72, got ' + JSON.stringify(receipt.open_issues));

    console.log('testGitlabBundleFinalizeAllOpenCloseIsPending: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #428: closure_receipt carries roadmap_removed_by_root (dual-root map); source removed.
// ---------------------------------------------------------------------------
function testGitlabFinalizeRoadmapResidueDetection() {
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-428-residue-')));
  try {
    glInitGitRepo(tmp);
    glWriteProject(tmp, 'issue-428gl', {
      'workflow-state.md': [
        '# Kaola-Workflow State', '',
        '## Project', 'name: issue-428gl', 'status: active', '',
        '## GitLab', 'issue_iid: 428', 'path_with_namespace: test/repo', '',
        '## Sink', 'branch: workflow/issue-428gl', 'issue_number: 428', 'sink: merge', ''
      ].join('\n')
    });
    seedAdaptiveFinalizeFixture(tmp, 'issue-428gl');
    glPlantRoadmapIssue(tmp, 428);

    const result = spawnSync(process.execPath, [claimScript, 'finalize', '--project', 'issue-428gl'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });

    assert.strictEqual(result.status, 0,
      'gitlab #428 residue: exit 0 expected, got ' + result.status + '\nstdout: ' + result.stdout + '\nstderr: ' + result.stderr);
    const lines = (result.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    assert.ok(lines.length > 0, 'gitlab #428 residue: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    assert.strictEqual(out.status, 'closed', 'gitlab #428 residue: status must be closed');
    const receipt = out.closure_receipt;
    assert.ok(receipt != null, 'gitlab #428 residue: closure_receipt must be present');
    assert.ok(
      receipt.roadmap_removed !== undefined || receipt.roadmap_removed_by_root !== undefined,
      'gitlab #428 residue: closure_receipt must carry roadmap_removed or roadmap_removed_by_root'
    );
    assert.ok(
      !fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-428.md')),
      'gitlab #428 residue: .roadmap/issue-428.md must be removed after finalize'
    );
    console.log('testGitlabFinalizeRoadmapResidueDetection: PASSED');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// #430: orient refuses with bundle_state_incoherent when bundle_id / issue_numbers mismatch.
// ---------------------------------------------------------------------------
function testGitlabBundleStateIncoherent() {
  const adaptiveNodeScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js');
  const valScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
  const minimalPlan = [
    '## Meta', 'labels: chore', '',
    '## Nodes', '',
    '| id | role | depends_on | declared_write_set | cardinality | shape |',
    '|---|---|---|---|---|---|',
    '| explore | code-explorer | — | — | 1 | sequence |',
    '| done | finalize | explore | — | 1 | sequence |', ''
  ];

  // (a) bundle_id present, issue_numbers absent.
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-430a-'));
    fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
    try {
      const project = 'bundle-42-47';
      glWriteProject(tmp, project, {
        'workflow-state.md': [
          '# Kaola-Workflow State', '',
          '## Project', 'name: ' + project, 'status: active', '',
          '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
          'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
          '## Pending Gates', '- workflow-plan', '',
          '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
          '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
          '## Sink', 'branch: workflow/gitlab-' + project,
          'issue_number: 42',
          'bundle_id: ' + project,   // NO issue_numbers
          'closure_policy: all_or_nothing', 'sink: merge', ''
        ].join('\n')
      });
      const planPath = path.join(tmp, 'kaola-workflow', project, 'workflow-plan.md');
      fs.writeFileSync(planPath, ['# Workflow Plan — ' + project, ''].concat(minimalPlan).join('\n'));
      fs.writeFileSync(planPath, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
      const fr = spawnSync(process.execPath, [valScript, planPath, '--freeze'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert.strictEqual(fr.status, 0, 'gitlab #430 (a): freeze exit 0, stderr: ' + fr.stderr);

      const r = spawnSync(process.execPath, [adaptiveNodeScript, 'orient', '--project', project, '--json'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert.ok(r.status !== 0,
        'gitlab #430 (a): orient must exit non-zero when bundle_id present but issue_numbers absent, got ' + r.status);
      const o = JSON.parse(r.stdout);
      assert.strictEqual(o.result, 'refuse', 'gitlab #430 (a): result must be refuse, got ' + JSON.stringify(o.result));
      assert.strictEqual(o.reason, 'bundle_state_incoherent',
        'gitlab #430 (a): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  // (b) bundle_id mismatches issue_numbers.
  { const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-430b-'));
    fs.mkdirSync(path.join(tmp, 'kaola-workflow'), { recursive: true });
    try {
      const project = 'bundle-42-47';
      glWriteProject(tmp, project, {
        'workflow-state.md': [
          '# Kaola-Workflow State', '',
          '## Project', 'name: ' + project, 'status: active', '',
          '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
          'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
          '## Pending Gates', '- workflow-plan', '',
          '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
          '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
          '## Sink', 'branch: workflow/gitlab-' + project,
          'issue_number: 42',
          'issue_numbers: 42,53',      // says 42,53 → expected bundle-42-53
          'bundle_id: bundle-42-47',   // MISMATCH
          'closure_policy: all_or_nothing', 'sink: merge', ''
        ].join('\n')
      });
      const planPath = path.join(tmp, 'kaola-workflow', project, 'workflow-plan.md');
      fs.writeFileSync(planPath, ['# Workflow Plan — ' + project, ''].concat(minimalPlan).join('\n'));
      fs.writeFileSync(planPath, '<!-- plan_hash: ' + require(valScript).computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
      const fr = spawnSync(process.execPath, [valScript, planPath, '--freeze'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert.strictEqual(fr.status, 0, 'gitlab #430 (b): freeze exit 0, stderr: ' + fr.stderr);

      const r = spawnSync(process.execPath, [adaptiveNodeScript, 'orient', '--project', project, '--json'],
        { cwd: tmp, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert.ok(r.status !== 0,
        'gitlab #430 (b): orient must exit non-zero when bundle_id mismatches issue_numbers, got ' + r.status);
      const o = JSON.parse(r.stdout);
      assert.strictEqual(o.result, 'refuse', 'gitlab #430 (b): result must be refuse, got ' + JSON.stringify(o.result));
      assert.strictEqual(o.reason, 'bundle_state_incoherent',
        'gitlab #430 (b): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  console.log('testGitlabBundleStateIncoherent: PASSED');
}

// ---------------------------------------------------------------------------
// bundle #424/#432/#433 n4-node-evidence + n9-walkthrough (gitlab edition):
// evidence seeding (D-433-01 §2) and doc-updater .md-target barrier (D-424-01 allowband).
// Mirrors scripts/ testBundle424432433NodeSeeding with gitlab edition substitutions.
// ---------------------------------------------------------------------------
function testGitlabBundle424432433NodeSeeding() {
  const pvScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
  const nodeScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js');
  const pv = require(pvScript);

  // --- scenario 7: doc-updater .md targets (pure barrierCheck) -------
  {
    const PLAN_DOC = ['# Plan', '', '## Meta', 'labels: chore', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| doc | doc-updater | — | docs/guide.md, README.md | 1 | sequence |',
      '| done | finalize | doc | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| doc | in_progress |', '| done | pending |', ''].join('\n');

    // (7a) declared docs/guide.md + README.md are in the allowband → barrier must PASS.
    const r7a = pv.barrierCheck(PLAN_DOC, ['docs/guide.md', 'README.md'], { nodeId: 'doc' });
    assert.strictEqual(r7a.result, 'pass',
      'gitlab #424 (7a): doc-updater writing docs/guide.md + README.md must pass the barrier, got ' + JSON.stringify(r7a));

    // (7b) undeclared docs/ depth still in allowband → pass.
    const r7b = pv.barrierCheck(PLAN_DOC, ['docs/arch/design.md'], { nodeId: 'doc' });
    assert.strictEqual(r7b.result, 'pass',
      'gitlab #424 (7b): undeclared docs/arch/design.md (allowband) must pass the barrier, got ' + JSON.stringify(r7b));

    // (7c) behavioral agents/*.md OUTSIDE allowband → write_set_overflow.
    const r7c = pv.barrierCheck(PLAN_DOC, ['agents/workflow-planner.md'], { nodeId: 'doc' });
    assert.ok(r7c.result === 'refuse' && r7c.reason === 'write_set_overflow',
      'gitlab #424 (7c): agents/*.md outside allowband must refuse write_set_overflow, got ' + JSON.stringify(r7c));
  }

  // --- scenario 6: evidence seeding via open-next CLI (requires a git repo) ----
  {
    const SEED_PLAN = ['# Workflow Plan — issue #433-seed-gl', '', '## Meta', 'labels: enhancement', '', '## Nodes', '',
      '| id | role | depends_on | declared_write_set | cardinality | shape |', '|---|---|---|---|---|---|',
      '| n1 | tdd-guide | — | lib/impl.js | 1 | sequence |',
      '| rv | code-reviewer | n1 | — | 1 | sequence |',
      '| done | finalize | rv | — | 1 | sequence |', '',
      '## Node Ledger', '', '| id | status |', '|---|---|',
      '| n1 | pending |', '| rv | pending |', '| done | pending |', ''].join('\n');

    const grepo = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-gl-433seed-'));
    glInitGitRepo(grepo);
    spawnSync('git', ['checkout', '-b', 'workflow/issue-433-seed-gl'], { cwd: grepo, encoding: 'utf8' });
    const proj = path.join(grepo, 'kaola-workflow', 'issue-433-seed-gl');
    fs.mkdirSync(proj, { recursive: true });
    const planPath = path.join(proj, 'workflow-plan.md');
    fs.writeFileSync(planPath, SEED_PLAN);
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + pv.computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
    const fz = spawnSync(process.execPath, [pvScript, planPath, '--freeze'],
      { cwd: grepo, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    assert.strictEqual(fz.status, 0, 'gitlab #433 (6): freeze should exit 0, got ' + fz.status + ' ' + fz.stderr);
    spawnSync('git', ['add', '-A'], { cwd: grepo, encoding: 'utf8' });
    spawnSync('git', ['commit', '-m', 'frozen plan'], { cwd: grepo, encoding: 'utf8' });
    const cacheDir = path.join(proj, '.cache');

    try {
      // (6a) open-next seeds .cache/n1.md with the evidence-binding header + role stubs.
      const on = spawnSync(process.execPath,
        [nodeScript, 'open-next', '--project', 'issue-433-seed-gl', '--json'],
        { cwd: grepo, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      assert.strictEqual(on.status, 0, 'gitlab #433 (6a): open-next must exit 0, got ' + on.status + '\nstderr: ' + on.stderr + '\nstdout: ' + on.stdout);
      const onOut = JSON.parse(on.stdout);
      assert.strictEqual(onOut.result, 'ok', 'gitlab #433 (6a): open-next result must be ok, got ' + JSON.stringify(onOut));
      assert.ok(onOut.opened && onOut.opened.id === 'n1', 'gitlab #433 (6a): opened.id must be n1, got ' + JSON.stringify(onOut.opened));

      // (6b) The seeded evidence file must exist with the expected binding line.
      const evidencePath = path.join(cacheDir, 'n1.md');
      assert.ok(fs.existsSync(evidencePath), 'gitlab #433 (6b): open-next must create .cache/n1.md');
      const evidenceContent = fs.readFileSync(evidencePath, 'utf8');
      const firstLine = evidenceContent.split('\n')[0];
      assert.ok(/^evidence-binding: n1 [0-9a-f]{12}$/.test(firstLine),
        'gitlab #433 (6b): first line must be "evidence-binding: n1 <12-hex-nonce>", got ' + JSON.stringify(firstLine));

      // (6c) tdd-guide role stubs present.
      assert.ok(/^RED: /m.test(evidenceContent) || /^<!-- RED/.test(evidenceContent),
        'gitlab #433 (6c): tdd-guide stub must contain RED token');
      assert.ok(/^GREEN: /m.test(evidenceContent) || /^<!-- GREEN/.test(evidenceContent),
        'gitlab #433 (6c): tdd-guide stub must contain GREEN token');

      // (6d) JSON response carries evidence_file + required_tokens.
      assert.strictEqual(onOut.opened.evidence_file, '.cache/n1.md',
        'gitlab #433 (6d): opened.evidence_file must be .cache/n1.md, got ' + JSON.stringify(onOut.opened.evidence_file));
      assert.ok(Array.isArray(onOut.opened.required_tokens) && onOut.opened.required_tokens.includes('RED'),
        'gitlab #433 (6d): required_tokens must include RED for tdd-guide, got ' + JSON.stringify(onOut.opened.required_tokens));

      // (6e) Crash-resume: a second open-next must not overwrite the evidence file.
      const contentBefore = fs.readFileSync(evidencePath, 'utf8');
      spawnSync(process.execPath,
        [nodeScript, 'open-next', '--project', 'issue-433-seed-gl', '--json'],
        { cwd: grepo, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
      const contentAfter = fs.readFileSync(evidencePath, 'utf8');
      assert.strictEqual(contentBefore, contentAfter,
        'gitlab #433 (6e): crash-resume open-next must NOT overwrite the seeded evidence file');
    } finally {
      fs.rmSync(grepo, { recursive: true, force: true });
    }
  }

  console.log('testGitlabBundle424432433NodeSeeding: PASSED');
}
