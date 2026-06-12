#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');

function tail30(str) {
  if (!str) return '';
  const lines = str.split('\n');
  return lines.slice(Math.max(0, lines.length - 30)).join('\n');
}

function run(script) {
  try {
    execFileSync(process.execPath, [path.join(root, 'plugins/kaola-workflow-gitea/scripts', script)], {
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

// M4 + M2 (#277): static source-text assertions — the gitea fork claim.js must contain the
// run_posture derivation (M4) and the dispatch-attestation function (M2).
// (#284): Codex lifecycle hooks (SessionStart/PreToolUse/PostToolUse/SubagentStart including
// dispatch-log) are now wired via config/hooks.json + install-codex-agent-profiles.js.
const giteaClaimSrc = fs.readFileSync(
  path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js'), 'utf8');
if (!giteaClaimSrc.includes('run_posture')) {
  throw new Error('M4 (#277): gitea-codex: kaola-gitea-workflow-claim.js must implement run_posture');
}
if (!giteaClaimSrc.includes('claim_planner_attested')) {
  throw new Error('M2 (#277): gitea-codex: kaola-gitea-workflow-claim.js must implement claim_planner_attested (warn-first attestation)');
}

// #284: config/hooks.json must exist, parse, and register the SubagentStart dispatch-log hook.
const hooksConfigPath = path.join(root, 'plugins/kaola-workflow-gitea/config/hooks.json');
if (!fs.existsSync(hooksConfigPath)) {
  throw new Error('#284: plugins/kaola-workflow-gitea/config/hooks.json must exist');
}
let hooksConfig;
try {
  hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));
} catch (e) {
  throw new Error('#284: plugins/kaola-workflow-gitea/config/hooks.json must be valid JSON: ' + e.message);
}
const subagentEntries = (hooksConfig.hooks && hooksConfig.hooks['SubagentStart']) || [];
const dispatchLogEntry = subagentEntries.find(
  e => e.id && e.id.startsWith('kaola-workflow:') &&
       e.hooks && e.hooks.some(h => h.command && h.command.includes('kaola-workflow-subagent-dispatch-log.sh'))
);
if (!dispatchLogEntry) {
  throw new Error(
    '#284: config/hooks.json SubagentStart must have a kaola-workflow: entry whose command references ' +
    'kaola-workflow-subagent-dispatch-log.sh'
  );
}

// #400: adaptive-route scenario — the gitea-codex edition ships the adaptive SKILL pack and a Codex
// claim/startup/resume receipt routes to a SKILL that EXISTS (the pre-#400 dead zone was 0 adaptive
// coverage here). Walk the schema-emitted route -> installed SKILL -> the inherited #405/#392/#369/#380
// wiring tokens, exactly as a Codex runtime would resolve them.
{
  const skillsRoot = path.join(root, 'plugins/kaola-workflow-gitea/skills');
  const schema = require(path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-workflow-adaptive-schema.js'));
  for (const skill of [schema.PLAN_RUN_SKILL, schema.ADAPT_SKILL]) {
    const skillFile = path.join(skillsRoot, skill, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      throw new Error('#400: gitea-codex receipt routes to ' + skill + ' but ' + skillFile + ' is missing (the forge-codex dead zone)');
    }
  }
  const planRun = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-plan-run/SKILL.md'), 'utf8');
  if (!planRun.includes('kaola-gitea-workflow-adaptive-node.js')) {
    throw new Error('#400: gitea-codex plan-run SKILL must call the forge-renamed kaola-gitea-workflow-adaptive-node.js');
  }
  if (!planRun.includes('model_variant_missing') || !planRun.includes('<role>-max')) {
    throw new Error('#405: gitea-codex plan-run SKILL must inherit the <role>-max tier→profile dispatch prose');
  }
  if (!planRun.includes('evidence-binding')) {
    throw new Error('#392: gitea-codex plan-run SKILL must inherit the evidence-binding nonce prose');
  }
  const adapt = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-adapt/SKILL.md'), 'utf8');
  if (!adapt.includes('kaola-gitea-workflow-claim.js') || !adapt.includes('kaola-workflow-plan-run')) {
    throw new Error('#400: gitea-codex adapt SKILL must claim via the forge port and hand off to kaola-workflow-plan-run');
  }
  const next = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-next/SKILL.md'), 'utf8');
  if (!next.includes('workflow-plan.md exists -> kaola-workflow-plan-run') || !next.includes('auto-bundle')) {
    throw new Error('#380: gitea-codex next SKILL must carry the adaptive route + auto-bundle restructure');
  }
  const finalize = fs.readFileSync(path.join(skillsRoot, 'kaola-workflow-finalize/SKILL.md'), 'utf8');
  if (!finalize.includes('--issue-numbers') || !finalize.includes('issue_numbers')) {
    throw new Error('#369: gitea-codex finalize SKILL must wire the bundle member-set flag (--issue-numbers)');
  }
}

run('validate-kaola-workflow-gitea-contracts.js');
run('test-gitea-workflow-scripts.js');
run('test-gitea-sinks.js');

// bundle-426-427-428-430 regression tests ported to gitea-codex edition.
const gtClaimScript = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-claim.js');
const gtAdaptiveNode = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-adaptive-node.js');
const gtPlanVal = path.join(root, 'plugins/kaola-workflow-gitea/scripts/kaola-gitea-workflow-plan-validator.js');
const gtMinimalPlan = [
  '## Meta', 'labels: chore', '',
  '## Nodes', '',
  '| id | role | depends_on | declared_write_set | cardinality | shape |',
  '|---|---|---|---|---|---|',
  '| explore | code-explorer | — | — | 1 | sequence |',
  '| done | finalize | explore | — | 1 | sequence |', ''
].join('\n');
const { spawnSync: gtSpawn } = require('child_process');
const gtOs = require('os');

// #426: verifyArchiveComplete returns archive_incomplete:true; source NOT deleted.
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(gtOs.tmpdir(), 'kw-gtcx-426-')));
  const kwRoot = tmp + '.kw';
  try {
    gtSpawn('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['config', 'user.email', 't@t.t'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['config', 'user.name', 'T'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    gtSpawn('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
    const wtPath = path.join(kwRoot, 'issue-426gtcx');
    fs.mkdirSync(kwRoot, { recursive: true });
    gtSpawn('git', ['worktree', 'add', '-b', 'workflow/issue-426gtcx', '--', wtPath, 'HEAD'],
      { cwd: tmp, encoding: 'utf8' });
    const projDir = path.join(wtPath, 'kaola-workflow', 'issue-426gtcx');
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, 'phase-note.md'), 'partial\n');
    const gtClaim = require(gtClaimScript);
    const result = gtClaim.archiveProjectDir(wtPath, 'issue-426gtcx', 'closed', undefined, {});
    if (!fs.existsSync(projDir)) throw new Error('gitea-codex #426: source dir must NOT be deleted when archive incomplete');
    if (result.archive_incomplete !== true) throw new Error('gitea-codex #426: archive_incomplete must be true, got: ' + JSON.stringify(result));
    if (!Array.isArray(result.missing) || !result.missing.includes('workflow-state.md')) throw new Error('gitea-codex #426: missing must list workflow-state.md, got: ' + JSON.stringify(result.missing));
  } finally {
    try { gtSpawn('git', ['-C', tmp, 'worktree', 'remove', '--force', wtPath], { encoding: 'utf8' }); } catch (_) {}
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(kwRoot, { recursive: true, force: true });
  }
  process.stdout.write('gitea-codex testFinalizeArchiveVerifiesBeforeDelete: PASSED\n');
}

// #427: offline bundle finalize emits closure.skipped_offline with member issue numbers.
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(gtOs.tmpdir(), 'kw-gtcx-427-')));
  const project = 'bundle-42-47';
  try {
    gtSpawn('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['config', 'user.email', 't@t.t'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['config', 'user.name', 'T'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    gtSpawn('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
    const dir = path.join(tmp, 'kaola-workflow', project);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: ' + project, 'status: active', '',
      '## Pending Gates', '- none', '', '## Last Updated', new Date().toISOString(), '',
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42', 'issue_numbers: 42,47', 'bundle_id: ' + project,
      'closure_policy: all_or_nothing', 'sink: pr', 'run_posture: in-place', ''
    ].join('\n'));
    for (const n of [42, 47]) {
      const rd = path.join(tmp, 'kaola-workflow', '.roadmap');
      fs.mkdirSync(rd, { recursive: true });
      fs.writeFileSync(path.join(rd, 'issue-' + n + '.md'),
        'issue: #' + n + '\ntitle: t\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
    }
    const r = gtSpawn(process.execPath, [gtClaimScript, 'finalize', '--project', project], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1', KAOLA_WORKTREE_NATIVE: '0' })
    });
    if (r.status !== 0) throw new Error('gitea-codex #427: finalize exit 0 expected, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const lines = (r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    if (!lines.length) throw new Error('gitea-codex #427: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    if (out.status !== 'closed') throw new Error('gitea-codex #427: status must be closed, got ' + JSON.stringify(out.status));
    const closure = out.closure_receipt && out.closure_receipt.closure;
    if (!closure) throw new Error('gitea-codex #427: closure_receipt.closure must be present');
    if (!Array.isArray(closure.skipped_offline) || !closure.skipped_offline.includes(42) || !closure.skipped_offline.includes(47))
      throw new Error('gitea-codex #427: closure.skipped_offline must include 42 and 47, got: ' + JSON.stringify(closure.skipped_offline));
    if (!Array.isArray(closure.closed) || closure.closed.length !== 0)
      throw new Error('gitea-codex #427: closure.closed must be empty, got: ' + JSON.stringify(closure.closed));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  process.stdout.write('gitea-codex testFinalizeClosesIssueBundleMembers: PASSED\n');
}

// #428: closure_receipt carries roadmap_removed_by_root; source file removed.
{
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(gtOs.tmpdir(), 'kw-gtcx-428-')));
  try {
    gtSpawn('git', ['init', '-b', 'main'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['config', 'user.email', 't@t.t'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['config', 'user.name', 'T'], { cwd: tmp, encoding: 'utf8' });
    fs.writeFileSync(path.join(tmp, 'README.md'), 'x');
    gtSpawn('git', ['add', '-A'], { cwd: tmp, encoding: 'utf8' });
    gtSpawn('git', ['commit', '-m', 'init'], { cwd: tmp, encoding: 'utf8' });
    const dir = path.join(tmp, 'kaola-workflow', 'issue-428gtcx');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'workflow-state.md'), [
      '# Kaola-Workflow State', '', '## Project', 'name: issue-428gtcx', 'status: active', '',
      '## Sink', 'branch: workflow/issue-428gtcx', 'issue_number: 428', 'sink: pr', ''
    ].join('\n'));
    const rd = path.join(tmp, 'kaola-workflow', '.roadmap');
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(path.join(rd, 'issue-428.md'),
      'issue: #428\ntitle: t\nstatus: open\nworkflow_project: —\nnext_step: ready\n');
    const r = gtSpawn(process.execPath, [gtClaimScript, 'finalize', '--project', 'issue-428gtcx'], {
      cwd: tmp, encoding: 'utf8', timeout: 60000,
      env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' })
    });
    if (r.status !== 0) throw new Error('gitea-codex #428: finalize exit 0 expected, got ' + r.status + '\nstdout: ' + r.stdout + '\nstderr: ' + r.stderr);
    const lines = (r.stdout || '').trim().split('\n').filter(l => l.trim().startsWith('{'));
    if (!lines.length) throw new Error('gitea-codex #428: expected JSON output');
    const out = JSON.parse(lines[lines.length - 1]);
    if (out.status !== 'closed') throw new Error('gitea-codex #428: status must be closed');
    const receipt = out.closure_receipt;
    if (!receipt) throw new Error('gitea-codex #428: closure_receipt must be present');
    if (receipt.roadmap_removed === undefined && receipt.roadmap_removed_by_root === undefined)
      throw new Error('gitea-codex #428: closure_receipt must carry roadmap_removed or roadmap_removed_by_root');
    if (fs.existsSync(path.join(tmp, 'kaola-workflow', '.roadmap', 'issue-428.md')))
      throw new Error('gitea-codex #428: .roadmap/issue-428.md must be removed after finalize');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  process.stdout.write('gitea-codex testFinalizeRoadmapResidueDetection: PASSED\n');
}

// #430: orient refuses with bundle_state_incoherent when bundle_id / issue_numbers mismatch.
{
  // (a) issue_numbers absent
  const tA = fs.mkdtempSync(path.join(gtOs.tmpdir(), 'kw-gtcx-430a-'));
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
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42', 'bundle_id: ' + project,
      'closure_policy: all_or_nothing', 'sink: pr', ''
    ].join('\n'));
    const planPath = path.join(dir, 'workflow-plan.md');
    fs.writeFileSync(planPath, '# Workflow Plan — ' + project + '\n' + gtMinimalPlan);
    const fr = gtSpawn(process.execPath, [gtPlanVal, planPath, '--freeze'],
      { cwd: tA, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (fr.status !== 0) throw new Error('gitea-codex #430 (a): freeze must exit 0, stderr: ' + fr.stderr);
    const r = gtSpawn(process.execPath, [gtAdaptiveNode, 'orient', '--project', project, '--json'],
      { cwd: tA, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (r.status === 0) throw new Error('gitea-codex #430 (a): orient must exit non-zero, got 0\nstdout: ' + r.stdout);
    const o = JSON.parse(r.stdout);
    if (o.result !== 'refuse') throw new Error('gitea-codex #430 (a): result must be refuse, got ' + JSON.stringify(o.result));
    if (o.reason !== 'bundle_state_incoherent') throw new Error('gitea-codex #430 (a): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
  } finally { fs.rmSync(tA, { recursive: true, force: true }); }

  // (b) bundle_id mismatches issue_numbers
  const tB = fs.mkdtempSync(path.join(gtOs.tmpdir(), 'kw-gtcx-430b-'));
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
      '## Sink', 'branch: workflow/' + project,
      'issue_number: 42', 'issue_numbers: 42,53', 'bundle_id: bundle-42-47',
      'closure_policy: all_or_nothing', 'sink: pr', ''
    ].join('\n'));
    const planPath = path.join(dir, 'workflow-plan.md');
    fs.writeFileSync(planPath, '# Workflow Plan — ' + project + '\n' + gtMinimalPlan);
    const fr = gtSpawn(process.execPath, [gtPlanVal, planPath, '--freeze'],
      { cwd: tB, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (fr.status !== 0) throw new Error('gitea-codex #430 (b): freeze must exit 0, stderr: ' + fr.stderr);
    const r = gtSpawn(process.execPath, [gtAdaptiveNode, 'orient', '--project', project, '--json'],
      { cwd: tB, encoding: 'utf8', env: Object.assign({}, process.env, { KAOLA_WORKFLOW_OFFLINE: '1' }) });
    if (r.status === 0) throw new Error('gitea-codex #430 (b): orient must exit non-zero, got 0\nstdout: ' + r.stdout);
    const o = JSON.parse(r.stdout);
    if (o.result !== 'refuse') throw new Error('gitea-codex #430 (b): result must be refuse, got ' + JSON.stringify(o.result));
    if (o.reason !== 'bundle_state_incoherent') throw new Error('gitea-codex #430 (b): reason must be bundle_state_incoherent, got ' + JSON.stringify(o.reason));
  } finally { fs.rmSync(tB, { recursive: true, force: true }); }

  process.stdout.write('gitea-codex testBundleStateIncoherent: PASSED\n');
}

console.log('Gitea Codex workflow walkthrough simulation passed');
