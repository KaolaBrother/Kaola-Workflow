#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

// #538: KAOLA_ENABLE_ADAPTIVE is retired — adaptive is the unconditional default (no switch).
// Hermetic HOME is set by test-gitlab-workflow-scripts.js (seeded with installed_paths:[]);
// child scripts inherit the HOME already set in that module's module-top sandbox.

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

// M4 + M2 (#277): static source-text assertions — the gitlab fork claim.js must contain the
// run_posture derivation (M4) and the dispatch-attestation function (M2).
// #284: Codex lifecycle hooks (SessionStart/PreToolUse/PostToolUse/SubagentStart) are now wired
// via plugins/kaola-workflow-gitlab/config/hooks.json; M1 dispatch-log hook ships in this release.
const gitlabClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js'), 'utf8');
if (!gitlabClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement run_posture');
}
if (!gitlabClaimSrc.includes('claim_planner_attested')) {
  throw new Error('M2 (#277): gitlab-codex: kaola-gitlab-workflow-claim.js must implement claim_planner_attested (warn-first attestation)');
}
// n6 (#653 finding A + D3, gitlab-codex mirror): the ported claim.js must carry the attestation-
// warning persistence + selection-evidence probe added by the root #653 mirror.
if (!gitlabClaimSrc.includes('## Attestation')) {
  throw new Error('#653: gitlab-codex: kaola-gitlab-workflow-claim.js must implement attestation-warning persistence (## Attestation)');
}
if (!gitlabClaimSrc.includes('selection_evidence')) {
  throw new Error('#653: gitlab-codex: kaola-gitlab-workflow-claim.js must implement the selection_evidence probe');
}

// #284: static assertion — config/hooks.json must exist, parse, and register the SubagentStart
// dispatch-log hook (M1), proving the Codex lifecycle hook producer is wired in this edition.
const hooksJsonPath = path.join(root, 'plugins/kaola-workflow-gitlab/config/hooks.json');
if (!fs.existsSync(hooksJsonPath)) {
  throw new Error('#284: plugins/kaola-workflow-gitlab/config/hooks.json must exist');
}
let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksJsonPath, 'utf8'));
} catch (e) {
  throw new Error('#284: plugins/kaola-workflow-gitlab/config/hooks.json must parse as valid JSON: ' + e.message);
}
const subagentEntries = (hooksConfig.hooks && hooksConfig.hooks['SubagentStart']) || [];
const dispatchLogEntry = subagentEntries.find(
  e => e.id && e.id.startsWith('kaola-workflow:') &&
       (e.hooks || []).some(h => h.command && h.command.includes('kaola-workflow-subagent-dispatch-log.sh'))
);
if (!dispatchLogEntry) {
  throw new Error(
    '#284: config/hooks.json SubagentStart must contain a kaola-workflow: entry whose command references kaola-workflow-subagent-dispatch-log.sh'
  );
}

// #400: adaptive-route scenario — the gitlab-codex edition ships the adaptive SKILL pack and a Codex
// claim/startup/resume receipt routes to a SKILL that EXISTS (the pre-#400 dead zone was 0 adaptive
// coverage here). Walk the schema-emitted route -> installed SKILL -> the inherited #405/#392/#369/#380
// wiring tokens, exactly as a Codex runtime would resolve them.
{
  const skillsRoot = path.join(root, 'plugins/kaola-workflow-gitlab/skills');
  const schema = require(path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-workflow-adaptive-schema.js'));
  // The two adaptive route targets the byte-identical schema emits must resolve to installed SKILLs.
  for (const skill of [schema.PLAN_RUN_SKILL, schema.ADAPT_SKILL]) {
    const skillFile = path.join(skillsRoot, skill, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      throw new Error('#400: gitlab-codex receipt routes to ' + skill + ' but ' + skillFile + ' is missing (the forge-codex dead zone)');
    }
  }
  const planRun = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-plan-run/SKILL.md'), 'utf8');
  // forge-renamed executor + #392 evidence-binding nonce (#405 -max dispatch retired).
  if (!planRun.includes('kaola-gitlab-workflow-adaptive-node.js')) {
    throw new Error('#400: gitlab-codex plan-run SKILL must call the forge-renamed kaola-gitlab-workflow-adaptive-node.js');
  }
  if (!planRun.includes('evidence-binding')) {
    throw new Error('#392: gitlab-codex plan-run SKILL must inherit the evidence-binding nonce prose');
  }
  const adapt = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-adapt/SKILL.md'), 'utf8');
  if (!adapt.includes('kaola-gitlab-workflow-claim.js') || !adapt.includes('kaola-workflow-plan-run')) {
    throw new Error('#400: gitlab-codex adapt SKILL must claim via the forge port and hand off to kaola-workflow-plan-run');
  }
  // The next SKILL routes a frozen plan to plan-run and a fresh adaptive run to the adapt front end (#380).
  const next = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-next/SKILL.md'), 'utf8');
  if (!next.includes('workflow-plan.md exists -> kaola-workflow-plan-run') || !next.includes('auto-bundle')) {
    throw new Error('#380: gitlab-codex next SKILL must carry the adaptive route + auto-bundle restructure');
  }
  // The finalize SKILL wires the #369 bundle member-set flag.
  const finalize = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-finalize/SKILL.md'), 'utf8');
  if (!finalize.includes('--issue-numbers') || !finalize.includes('issue_numbers')) {
    throw new Error('#369: gitlab-codex finalize SKILL must wire the bundle member-set flag (--issue-numbers)');
  }
}

run('validate-kaola-workflow-gitlab-contracts.js');
run('test-gitlab-workflow-scripts.js');
run('test-gitlab-sinks.js');

// bundle-426-427-428-430 regression tests ported to gitlab-codex edition.
const glClaimScript = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-claim.js');
const glAdaptiveNode = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-adaptive-node.js');
const glPlanVal = path.join(root, 'plugins/kaola-workflow-gitlab/scripts/kaola-gitlab-workflow-plan-validator.js');
const glMinimalPlan = [
  '## Meta', 'labels: chore', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| done | finalize | explore | — | 1 | sequence |', ''
].join('\n');
const { spawnSync: glSpawn } = require('child_process');
const glOs = require('os');

// #426: verifyArchiveComplete returns archive_incomplete:true; source NOT deleted.
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(glOs.tmpdir(), 'kw-glcx-426-')));
  const kwRoot = tmp + '.kw';
  try {
    glSpawn('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['config', 'user.email', 't@t.t'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['config', 'user.name', 'T'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    glSpawn('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
    const wtPath = path.join(kwRoot, 'issue-426glcx');
    fs.mkdirSync(kwRoot, { recursive: true });
    glSpawn('git', ['worktree', 'add', '-b', 'workflow/issue-426glcx', '--', wtPath, 'HEAD'],
      { cwd: tmp, encoding: 'utf8' });
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426glcx');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'phase-note.md'), 'partial\n');
    const glClaim = require(glClaimScript);
    const result = glClaim.archiveProjectDir(wtPath, 'issue-426glcx', 'closed', undefined, {});
    if (!fs.existsSync(projDir)) throw new Error('gitlab-codex #426: source dir must NOT be deleted when archive incomplete');
    if (result.archive_incomplete !== true) throw new Error('gitlab-codex #426: archive_incomplete must be true, got: ' + JSON.stringify(result));
    if (result.snapshot_error !== 'state_missing') throw new Error('gitlab-codex #426: malformed source must fail the authority preflight (same contract as the canonical twin), got: ' + JSON.stringify(result));
  } finally {
    try { glSpawn('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  process.stdout.write('gitlab-codex testFinalizeArchiveVerifiesBeforeDelete: PASSED\n');
}

// #427: offline bundle finalize emits closure.skipped_offline with member issue numbers.
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(glOs.tmpdir(), 'kw-glcx-427-')));
  const project = 'bundle-42-47';
  try {
    glSpawn('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['config', 'user.email', 't@t.t'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['config', 'user.name', 'T'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    glSpawn('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
    const dir = path.join(tmp, 'kaola-workflow', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Pending Gates', '- none', '', '## Last Updated', new Date().toISOString(), '',
      '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42', 'issue_numbers: 42,47', 'bundle_id: ' + project,
      'closure_policy: all_or_nothing', 'sink: merge', 'run_posture: in-place', ''
    ].join('\n'));
    for (const n of [42, 47]) {
      const rd = path.join(tmp, 'kaola-workflow', '.roadmap');
      fs.mkdirSync(rd, { recursive: true });
      fs.writeFileSync(path.join(rd, 'issue-' + n + '.md'),
        'issue: #' + n + '\ntitle: t\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
    }
    const r = glSpawn(process.execPath, [glClaimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' })
    });
    if (r.status !== 0) throw new Error('gitlab-codex #427: finalize exit 0 expected, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const lines = (r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    if (!lines.length) throw new Error('gitlab-codex #427: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    if (out.status !== 'closed') throw new Error('gitlab-codex #427: status must be closed, got ' + JSON.stringify(out.status));
    const closure = out.closure_receipt && out.closure_receipt.closure;
    if (!closure) throw new Error('gitlab-codex #427: closure_receipt.closure must be present');
    if (!Array.isArray(closure.skipped_offline) || !closure.skipped_offline.includes(42) || !closure.skipped_offline.includes(47))
      throw new Error('gitlab-codex #427: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline));
    if (!Array.isArray(closure.closed) || closure.closed.length !== 0)
      throw new Error('gitlab-codex #427: closure.closed must be empty, got: ' + JSON.stringify(closure.closed));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  process.stdout.write('gitlab-codex testFinalizeClosesIssueBundleMembers: PASSED\n');
}

// #428: closure_receipt carries roadmap_removed_by_root; source file removed.
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(glOs.tmpdir(), 'kw-glcx-428-')));
  try {
    glSpawn('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['config', 'user.email', 't@t.t'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['config', 'user.name', 'T'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    glSpawn('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    glSpawn('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
    const dir = path.join(tmp, 'kaola-workflow', 'issue-428glcx');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: issue-428glcx', 'status: active', '',
      '## GitLab', 'issue_iid: 428', 'path_with_namespace: test/repo', '',
      '## Sink', 'branch: workflow/issue-428glcx', 'issue_number: 428', 'sink: merge', ''
    ].join('\n'));
    const rd = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(path.join(rd, 'issue-428.md'),
      'issue: #428\ntitle: t\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
    const r = glSpawn(process.execPath, [glClaimScript, 'finalize', '--project', 'issue-428glcx'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    if (r.status !== 0) throw new Error('gitlab-codex #428: finalize exit 0 expected, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const lines = (r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    if (!lines.length) throw new Error('gitlab-codex #428: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    if (out.status !== 'closed') throw new Error('gitlab-codex #428: status must be closed');
    const receipt = out.closure_receipt;
    if (!receipt) throw new Error('gitlab-codex #428: closure_receipt must be present');
    if (receipt.roadmap_removed === undefined && receipt.roadmap_removed_by_root === undefined)
      throw new Error('gitlab-codex #428: closure_receipt must carry roadmap_removed or roadmap_removed_by_root');
    if (fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-428.md')))
      throw new Error('gitlab-codex #428: .roadmap/issue-428.md must be removed after finalize');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  process.stdout.write('gitlab-codex testFinalizeRoadmapResidueDetection: PASSED\n');
}

// #430: orient refuses with bundle_state_incoherent when bundle_id / issue_numbers mismatch.
{
  // (a) issue_numbers absent
  const tA = fs.mkdtempSync(path.join(glOs.tmpdir(), 'kw-glcx-430a-'));
  fs.mkdirSync(path.join(tA, 'kaola-workflow'), { recursive: true });
  try {
    const project = 'bundle-42-47';
    const dir = path.join(tA, 'kaola-workflow', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
      '## Pending Gates', '- workflow-plan', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
      '## Sink', 'branch: workflow/gitlab-' + project,
      'issue_number: 42', 'bundle_id: ' + project,
      'closure_policy: all_or_nothing', 'sink: merge', ''
    ].join('\n'));
    const planPath = path.join(dir, 'workflow-plan.md');
    fs.writeFileSync(planPath, '# Workflow Plan — ' + project + '\n' + glMinimalPlan);
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + require(glPlanVal).computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
    const fr = glSpawn(process.execPath, [glPlanVal, planPath, '--freeze'],
      { cwd: tA, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (fr.status !== 0) throw new Error('gitlab-codex #430 (a): freeze must exit 0, stderr: ' + fr.stderr);
    const r = glSpawn(process.execPath, [glAdaptiveNode, 'orient', '--project', project, '--json'],
      { cwd: tA, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (r.status === 0) throw new Error('gitlab-codex #430 (a): orient must exit non-zero, got 0\nstdout: ' + r.stdout);
    const o = JSON.parse(r.stdout);
    if (o.result !== 'refuse') throw new Error('gitlab-codex #430 (a): result must be refuse, got ' + JSON.stringify(o.result));
    if (o.reason !== 'bundle_state_incoherent') throw new Error('gitlab-codex #430 (a): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
  } finally { fs.rmSync(tA, { recursive: true, force: true }); }

  // (b) bundle_id mismatches issue_numbers
  const tB = fs.mkdtempSync(path.join(glOs.tmpdir(), 'kw-glcx-430b-'));
  fs.mkdirSync(path.join(tB, 'kaola-workflow'), { recursive: true });
  try {
    const project = 'bundle-42-47';
    const dir = path.join(tB, 'kaola-workflow', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Current Position', 'phase: adaptive', 'workflow_path: adaptive',
      'step: start', 'next_command: /kaola-workflow-plan-run ' + project, '',
      '## Pending Gates', '- workflow-plan', '',
      '## Last Evidence', 'last_command: startup', 'last_result: folder_claimed', '',
      '## GitLab', 'issue_iid: 42', 'path_with_namespace: test/repo', '',
      '## Sink', 'branch: workflow/gitlab-' + project,
      'issue_number: 42', 'issue_numbers: 42,53', 'bundle_id: bundle-42-47',
      'closure_policy: all_or_nothing', 'sink: merge', ''
    ].join('\n'));
    const planPath = path.join(dir, 'workflow-plan.md');
    fs.writeFileSync(planPath, '# Workflow Plan — ' + project + '\n' + glMinimalPlan);
    fs.writeFileSync(planPath, '<!-- plan_hash: ' + require(glPlanVal).computePlanHash(fs.readFileSync(planPath, 'utf8')) + ' -->\n\n' + fs.readFileSync(planPath, 'utf8'));
    const fr = glSpawn(process.execPath, [glPlanVal, planPath, '--freeze'],
      { cwd: tB, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (fr.status !== 0) throw new Error('gitlab-codex #430 (b): freeze must exit 0, stderr: ' + fr.stderr);
    const r = glSpawn(process.execPath, [glAdaptiveNode, 'orient', '--project', project, '--json'],
      { cwd: tB, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (r.status === 0) throw new Error('gitlab-codex #430 (b): orient must exit non-zero, got 0\nstdout: ' + r.stdout);
    const o = JSON.parse(r.stdout);
    if (o.result !== 'refuse') throw new Error('gitlab-codex #430 (b): result must be refuse, got ' + JSON.stringify(o.result));
    if (o.reason !== 'bundle_state_incoherent') throw new Error('gitlab-codex #430 (b): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
  } finally { fs.rmSync(tB, { recursive: true, force: true }); }

  process.stdout.write('gitlab-codex testBundleStateIncoherent: PASSED\n');
}

console.log('GitLab Codex workflow walkthrough simulation passed');

