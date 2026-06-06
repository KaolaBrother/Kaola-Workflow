#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
const classifier = require('./kaola-gitea-workflow-classifier');
// issue #227 (adaptive path): forge-neutral constants + toggle resolution.
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');

// Read the shared global config (read-only; never creates the file). Returns {} on any
// error so the strict `=== true` on-test in resolveEnableAdaptive falls to OFF.
function readAdaptiveConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ...adaptiveSchema.CONFIG_REL_PATH), 'utf8'));
  } catch (_) {
    return {};
  }
}
const {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  probeIssueState,
  readActiveFolders
} = require('./kaola-gitea-workflow-active-folders');
const roadmapModule = require('./kaola-gitea-workflow-roadmap');
const closureContract = require('./kaola-workflow-closure-contract');

const CLAIM_LABEL = forge.CLAIM_LABEL || 'workflow:in-progress';
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE !== '0';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--json') { args.json = true; continue; }
    if (key === '--force') { args.force = true; continue; }
    if (key === '--keep-worktree') { args.keepWorktree = true; continue; }
    if (key === '--execute') { args.execute = true; continue; }
    if (key === '--archive') { args.archive = true; continue; }
    if (key === '--export')  { args.export = true; continue; }
    if (key === '--keep-branch') { args.keepBranch = true; continue; }
    if (key.startsWith('--') && val !== undefined && !val.startsWith('--')) {
      const name = key.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[name] = val;
      i++;
    }
  }
  for (const key of ['issue', 'targetIssue', 'prNumber']) {
    if (args[key] != null) args[key] = parseInt(args[key], 10);
  }
  return args;
}

function projectNameForIssue(root, issueIid) {
  const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issueIid + '.md');
  try {
    const name = field(fs.readFileSync(roadmapFile, 'utf8'), 'workflow_project');
    if (name && name !== '—' && isSafeName(name)) return name;
  } catch (_) {}
  return 'issue-' + issueIid;
}

function buildBranchName(issueIid, project, fallback) {
  if (fallback) return fallback;
  return Number.isFinite(issueIid) && issueIid > 0 ? 'workflow/gitea-issue-' + issueIid : 'workflow/gitea-' + project;
}

function getCoordRoot(root) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return path.resolve(root, raw);
  } catch (_) {
    return path.join(root, '.git');
  }
}

function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}

function worktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project);
}

function hasGitHistory(root) {
  try {
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}

function branchExists(root, branch) {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/' + branch], { cwd: root });
    return true;
  } catch (_) {
    return false;
  }
}

function worktreeRegistered(root, wtPath) {
  try {
    return execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' }).includes('worktree ' + wtPath + '\n');
  } catch (_) {
    return false;
  }
}

function provisionWorktree(root, project, branch) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  const wtPath = worktreePathFor(root, project);
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  if (worktreeRegistered(mainRoot, wtPath)) return { path: wtPath, branch };
  if (fs.existsSync(wtPath)) return { path: wtPath, branch };
  if (branchExists(mainRoot, branch)) {
    execFileSync('git', ['worktree', 'add', '--', wtPath, branch], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
  } else {
    execFileSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { cwd: mainRoot, stdio: ['ignore', 'ignore', 'ignore'] });
  }
  return { path: wtPath, branch };
}

function removeWorktree(root, project, folder) {
  const wtPath = (folder && folder.worktree_path) || worktreePathFor(root, project);
  if (!wtPath || !fs.existsSync(wtPath)) return { removed: false, reason: 'missing' };
  try {
    execFileSync('git', ['worktree', 'remove', '--force', '--', wtPath], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore']
    });
    return { removed: true, path: wtPath };
  } catch (_) {
    return { removed: false, path: wtPath };
  }
}

function stashWorktree(wtPath, issueNumber) {
  try {
    execFileSync('git', ['-C', wtPath, 'stash', 'push', '-u', '-m', 'kaola-cleanup-issue-' + issueNumber],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}

function exportWorktreeDiff(root, wtPath, issueNumber) {
  try {
    const exportsDir = path.join(root, 'kaola-workflow', 'archive', 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const untrackedOut = execFileSync('git', ['-C', wtPath, 'ls-files', '-z', '--others', '--exclude-standard'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const untrackedFiles = untrackedOut.split('\x00').filter(Boolean);
    const patchPath = path.join(exportsDir, 'issue-' + issueNumber + '-' + ts + '.patch');
    const diff = execFileSync('git', ['-C', wtPath, 'diff', 'HEAD'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    fs.writeFileSync(patchPath, diff);
    const artifacts = [patchPath];
    if (untrackedFiles.length > 0) {
      const untrackedDir = path.join(exportsDir, 'issue-' + issueNumber + '-' + ts + '-untracked');
      for (const file of untrackedFiles) {
        const src = path.join(wtPath, file);
        if (fs.lstatSync(src).isSymbolicLink()) continue;
        const dest = path.join(untrackedDir, file);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
      }
      artifacts.push(untrackedDir);
    }
    return artifacts;
  } catch (_) {
    return null;
  }
}

function removeBranch(root, branch) {
  try {
    execFileSync('git', ['-C', root, 'branch', '-D', branch],
      { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}

function extractIssueNumber(branch) {
  const m = String(branch || '').match(/^workflow\/gitea-issue-(\d+)$/);
  return m ? Number(m[1]) : null;
}

function worktreeDirtyState(wtPath) {
  try {
    if (!fs.existsSync(wtPath)) return 'missing';
    const out = execFileSync('git', ['-C', wtPath, 'status', '--porcelain'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.trim().length > 0 ? 'dirty' : 'clean';
  } catch (_) {
    return 'missing';
  }
}

function projectDir(root, project) {
  return path.join(root, 'kaola-workflow', project);
}

function stateFile(root, project) {
  return path.join(projectDir(root, project), 'workflow-state.md');
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function discoverProjectSafe() {
  try {
    return forge.discoverProject();
  } catch (_) {
    return {};
  }
}

function writeState(root, data) {
  const workflowPath = data.workflow_path || 'full';
  const isFast = workflowPath === 'fast';
  // issue #227: adaptive runs resume via the plan-run executor, not the phaseN ladder.
  // Toggle-agnostic — an already-frozen plan must emit plan-run regardless of the switch.
  const isAdaptive = workflowPath === adaptiveSchema.ADAPTIVE_PATH;
  const adaptiveCommand = adaptiveSchema.PLAN_RUN_COMMAND + ' ' + data.project;
  const adaptiveSkill = adaptiveSchema.PLAN_RUN_SKILL + ' ' + data.project;
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + data.project,
    'status: ' + (data.status || 'active'),
    '',
    '## Current Position',
    'phase: ' + (isFast ? 'fast' : isAdaptive ? 'adaptive' : (data.phase || 1)),
    'phase_name: ' + (isFast ? 'Fast' : isAdaptive ? 'Adaptive' : (data.phase_name || 'Research')),
    'workflow_path: ' + workflowPath,
    'runtime: ' + (data.runtime || 'claude'),
    'step: ' + (data.step || 'start'),
    'next_command: ' + (data.next_command || (isFast ? '/kaola-workflow-fast ' + data.project : isAdaptive ? adaptiveCommand : '/kaola-workflow-phase1 ' + data.project)),
    'next_skill: ' + (data.next_skill || (isFast ? 'kaola-workflow-fast ' + data.project : isAdaptive ? adaptiveSkill : 'kaola-workflow-research ' + data.project)),
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    isFast ? '- fast-summary' : isAdaptive ? '- workflow-plan' : '- phase1-research',
    '',
    '## Last Evidence',
    'phase_file: N/A',
    'cache_file: N/A',
    'last_command: startup',
    'last_result: ' + (data.last_result || 'folder_claimed'),
    '',
    '## Last Updated',
    new Date().toISOString(),
    '',
    '## Gitea',
    'issue_number: ' + (data.issue_iid || ''),
    'full_name: ' + (data.full_name || ''),
    'project_html_url: ' + (data.project_html_url || ''),
    '',
    '## Sink',
    'branch: ' + data.branch,
    'issue_number: ' + (data.issue_iid || ''),
    'sink: ' + (data.sink || 'merge')
  ];
  if (data.worktree_path) lines.push('worktree_path: ' + data.worktree_path);
  if (data.worktree_error) lines.push('worktree_error: ' + data.worktree_error);
  if (data.pr_url) lines.push('pr_url: ' + data.pr_url);
  if (data.pr_number) lines.push('pr_number: ' + data.pr_number);
  writeFile(stateFile(root, data.project), lines.join('\n') + '\n');
}

function updateState(root, project, updater) {
  const file = stateFile(root, project);
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) {}
  writeFile(file, updater(content));
}

function postAdvisoryClaim(issueIid, project, projectInfo) {
  if (issueIid == null) return;
  if (!projectInfo || !projectInfo.full_name) return;
  try { forge.ensureLabel(projectInfo, { name: CLAIM_LABEL, color: '#e6b8a2' }); } catch (_) {}
  try { forge.updateIssueLabels(projectInfo, issueIid, { add: [CLAIM_LABEL] }); } catch (_) {}
  try {
    forge.createIssueComment(projectInfo, issueIid, '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local Gitea work for `' + project + '`.');
  } catch (_) {}
}

function clearAdvisoryClaim(issueIid, reason, projectInfo) {
  if (OFFLINE || issueIid == null) return 'skipped_offline';
  let status = 'failed';
  try {
    if (projectInfo && projectInfo.full_name) {
      forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] });
      status = 'removed';
    }
  } catch (_) {}
  try {
    if (reason && projectInfo && projectInfo.full_name) {
      forge.createIssueComment(projectInfo, issueIid, 'Kaola-Workflow advisory claim cleared: ' + reason);
    }
  } catch (_) {}
  return status;
}

function classifyIssue(root, issueIid) {
  try {
    return classifier.classifyIssue(issueIid, root);
  } catch (_) {
    return { verdict: 'target_unavailable', reasoning: 'classifier failed (Gitea)' };
  }
}

function activeByIssue(root, issueIid) {
  return readActiveFolders(root).find(folder => folder.issue_iid === issueIid) || null;
}

function activeByProject(root, project) {
  return readActiveFolders(root).find(folder => folder.project === project) || null;
}

function readPriorityConfig(root) {
  const file = path.join(root, 'kaola-workflow', 'config.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.priority_top_tier_labels) ? parsed.priority_top_tier_labels : ['P0', 'P1'];
  } catch (_) { return ['P0', 'P1']; }
}

function priorityTier(issue, topTierLabels) {
  const labels = issue.labels || [];
  for (const label of labels) {
    if (/^P\d+$/i.test(label)) return { tier: parseInt(label.slice(1), 10), priority_label: label };
  }
  if (labels.some(label => topTierLabels.includes(label))) return { tier: 1, priority_label: labels.find(label => topTierLabels.includes(label)) };
  return { tier: 99, priority_label: '' };
}

function listOpenIssues(root) {
  try {
    const topTierLabels = readPriorityConfig(root);
    return forge.listIssues({ state: 'open', perPage: 100 })
      .filter(issue => issue.state === 'open')
      .sort((a, b) => {
        const at = priorityTier(a, topTierLabels).tier;
        const bt = priorityTier(b, topTierLabels).tier;
        return at - bt || Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number);
      });
  } catch (_) { return []; }
}

function claimProject(root, args) {
  const issueIid = args.issue || args.targetIssue || null;
  const project = args.project || projectNameForIssue(root, issueIid);
  assert(isSafeName(project), 'unsafe project name');
  const existing = issueIid != null ? activeByIssue(root, issueIid) : activeByProject(root, project);
  if (existing) return { status: 'owned', issue: existing.issue_iid, project: existing.project, folder: existing };

  // issue #227: the single shared toggle guard for NEW claims (covers cmdClaim and
  // cmdStartup -> claimExplicitTarget). Whitelist {fast, full} when the adaptive switch
  // is OFF, {fast, full, adaptive} when ON. An adaptive claim under an OFF switch is a
  // TYPED REFUSAL (#44) — never a silent downgrade. Resume of a frozen plan does not
  // pass here (the `existing` early-return handles re-claims), so this gates SELECTION only.
  const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full';
  const adaptiveEnabled = adaptiveSchema.resolveEnableAdaptive(readAdaptiveConfig(), process.env);
  if (!adaptiveSchema.isLegalWorkflowPath(requestedPath, adaptiveEnabled)) {
    const legal = (adaptiveEnabled ? adaptiveSchema.WORKFLOW_PATHS : adaptiveSchema.WORKFLOW_PATHS_NO_ADAPTIVE).join(', ');
    return {
      status: 'workflow_path_refused',
      claim: 'none',
      issue: issueIid,
      project,
      reasoning: 'workflow_path "' + requestedPath + '" is not permitted (adaptive switch is ' +
        (adaptiveEnabled ? 'ON' : 'OFF') + '); legal values: ' + legal +
        '. Refusing to silently downgrade (#44).'
    };
  }

  if (issueIid != null) {
    const probe = probeIssueState(issueIid);
    if (probe.state === 'closed') {
      return { status: 'user_target_closed', issue: issueIid, project, reasoning: 'Gitea issue #' + issueIid + ' is closed' };
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return { status: 'target_unavailable', claim: 'none', issue: issueIid, project, reasoning: 'tea issue #' + issueIid + ' state probe failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
    }
  }

  const dir = projectDir(root, project);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === 'EEXIST') {
      if (fs.existsSync(stateFile(root, project))) {
        return { status: 'target_occupied', issue: issueIid, project, reasoning: 'local project folder exists' };
      }
      // orphaned stateless dir (crash between mkdir and writeState) — fall through and reclaim
    } else { throw e; }
  }

  const branch = buildBranchName(issueIid, project, args.branch);
  let worktreePath = '';
  let worktreeError = '';
  // Worktree provisioning is ON by default (full/fast paths operate inside it via Phase 4's
  // ACTIVE_WORKTREE_PATH), but FORCED OFF for the adaptive path: its orchestrator (plan-run) does not
  // yet cd into the worktree, so provisioning one would strand the implementation in the repo-root tree
  // and risk finalizing an empty branch. Re-enable for adaptive once the executor operates in the
  // worktree (tracked follow-up). Set KAOLA_WORKTREE_NATIVE=0 to opt out entirely.
  if (!OFFLINE && WORKTREE_NATIVE && requestedPath !== adaptiveSchema.ADAPTIVE_PATH && hasGitHistory(root)) {
    try { worktreePath = provisionWorktree(root, project, branch).path; } catch (_) { worktreeError = (_ && _.message) || String(_); }
  }
  const projectInfo = discoverProjectSafe();
  writeState(root, {
    project,
    issue_iid: issueIid,
    branch,
    sink: args.sink || process.env.KAOLA_SINK || 'merge',
    worktree_path: worktreePath,
    worktree_error: worktreeError,
    workflow_path: args.workflowPath || process.env.KAOLA_PATH || 'full',
    runtime: args.runtime || 'claude',
    status: 'active',
    full_name: projectInfo.full_name,
    project_html_url: projectInfo.html_url
  });
  postAdvisoryClaim(issueIid, project, projectInfo);
  return Object.assign({ status: 'acquired', verdict: 'green', claim: 'acquired', issue: issueIid, project, branch, worktree_path: worktreePath }, worktreeError ? { worktree_error: worktreeError } : {});
}

function claimExplicitTarget(root, args) {
  const targetIssue = args.targetIssue || args.issue;
  if (!Number.isFinite(targetIssue) || targetIssue <= 0) {
    return { status: 'no_target', claim: 'none', project: null, issue: null, reasoning: '--target-issue <N> required' };
  }
  const classified = classifyIssue(root, targetIssue);
  if (classified.verdict === 'blocked') {
    return { status: 'user_target_blocked', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'red') {
    return { status: 'user_target_red', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'target_unavailable') {
    return { status: 'target_unavailable', claim: 'none', issue: targetIssue, project: projectNameForIssue(root, targetIssue), reasoning: classified.reasoning };
  }
  if (classified.verdict === 'target_unverified') {
    return {
      status: 'target_unverified',
      claim: 'none',
      issue: targetIssue,
      project: projectNameForIssue(root, targetIssue),
      reasoning: classified.reasoning
    };
  }
  return claimProject(root, Object.assign({}, args, { issue: targetIssue, project: args.project || projectNameForIssue(root, targetIssue) }));
}

function output(obj, code) {
  process.stdout.write(JSON.stringify(obj) + '\n');
  if (code) process.exitCode = code;
}

function cmdClaim() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  output(claimProject(root, args));
}

// issue #235 (audit D8): HARD guard at the /kaola-workflow-adapt authoring entry. Reads the SAME
// switch as claimProject and emits a TYPED refusal when OFF. Forge-neutral + stateless so the body
// is byte-identical across all four editions. The validator stays toggle-agnostic — switch read HERE.
function cmdAuthoringAllowed() {
  const args = parseArgs(process.argv.slice(3));
  const adaptiveEnabled = adaptiveSchema.resolveEnableAdaptive(readAdaptiveConfig(), process.env);
  if (!adaptiveEnabled) {
    output({
      status: 'authoring_refused',
      allowed: false,
      project: args.project || null,
      reasoning: 'adaptive switch is OFF; refusing to author/freeze a workflow-plan.md. ' +
        'Refusing to silently author an adaptive plan under an OFF switch (#44).'
    });
    return;
  }
  output({ status: 'authoring_allowed', allowed: true, project: args.project || null });
}

function cmdStartup() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const target = args.targetIssue || args.issue;
  if (!target) {
    output({ verdict: 'no_target', claim: 'none', project: null, issue: null }, 1);
    return;
  }
  const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: target }));
  output(Object.assign({
    verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
    claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
    selected_project: result.project || null,
    selected_issue: result.issue || null,
    target_source: 'user_directed',
    worktree_path: result.folder ? (result.folder.worktree_path || '') : (result.worktree_path || '')
  }, result), result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
}

function cmdPickNext() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const target = args.targetIssue || args.issue;
  if (target) {
    const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: target }));
    output(Object.assign({
      verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
      claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
      selected_project: result.project || null,
      selected_issue: result.issue || null,
      target_source: 'user_directed'
    }, result), result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
    return;
  }
  output({ verdict: 'no_target', claim: 'none', project: null, issue: null }, 1);
}

function resumeFallbackCommand(root, folder) {
  let isFast = false;
  let isAdaptive = false;
  try {
    const sf = path.join(root, 'kaola-workflow', folder.project, 'workflow-state.md');
    const content = fs.readFileSync(sf, 'utf8');
    isFast = /^(?:workflow_path|phase):\s*fast\s*$/m.test(content);
    // issue #227: adaptive resumes via the plan-run executor, never the phaseN ladder. Toggle-agnostic.
    isAdaptive = /^(?:workflow_path|phase):\s*adaptive\s*$/m.test(content);
  } catch (_) {}
  if (isAdaptive) return adaptiveSchema.PLAN_RUN_COMMAND + ' ' + folder.project;
  return (isFast ? '/kaola-workflow-fast ' : '/kaola-workflow-phase' + (folder.phase || 1) + ' ') + folder.project;
}

// #234 E1: reconcile the persisted next_command against the project's true path before trusting it.
// Adaptive (state field or a workflow-plan.md) -> FORCE plan-run, ignore a stale phaseN. The
// NON-adaptive path keeps its pre-existing contract (trust persisted, else reconstruct): a full/fast
// next_command legitimately points FORWARD of `phase:` (phase5 complete -> next_command /phase6), so
// it must NOT be overridden by phase-derived reconstruction. Toggle-agnostic.
function reconcileNextCommand(root, folder) {
  let content = '';
  try {
    content = fs.readFileSync(path.join(root, 'kaola-workflow', folder.project, 'workflow-state.md'), 'utf8');
  } catch (_) {}
  const planExists = fs.existsSync(path.join(root, 'kaola-workflow', folder.project, adaptiveSchema.PLAN_FILE));
  const isAdaptive = /^(?:workflow_path|phase):\s*adaptive\s*$/m.test(content) || planExists;
  if (isAdaptive) return adaptiveSchema.PLAN_RUN_COMMAND + ' ' + folder.project;
  return folder.next_command || resumeFallbackCommand(root, folder);
}

function cmdResume() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const folder = args.project ? activeByProject(root, args.project) : readActiveFolders(root)[0];
  if (!folder) { output({ resumed: false, reason: '--project or active folder required' }, 1); return; }
  output({
    resumed: true,
    project: folder.project,
    issue: folder.issue_iid,
    phase: folder.phase,
    next_command: reconcileNextCommand(root, folder)
  });
}

function archiveProjectDir(root, project, statusValue, suffix) {
  assert(isSafeName(project), 'unsafe project name');
  const src = projectDir(root, project);
  if (!fs.existsSync(src)) return { skipped: 'source-missing' };
  const state = stateFile(root, project);
  let archiveIssueNumber = null;
  try {
    let content = fs.readFileSync(state, 'utf8');
    archiveIssueNumber = parseInt(field(content, 'issue_number'), 10);
    content = content.replace(/^status:\s*.*$/m, 'status: ' + statusValue);
    if (!/^status:/m.test(content)) content += '\nstatus: ' + statusValue + '\n';
    content = content.replace(/^step:\s*.*$/m, 'step: complete');
    if (!/^step:/m.test(content)) content += '\nstep: complete\n';
    fs.writeFileSync(state, content);
  } catch (_) {}
  const archiveBase = path.join(root, 'kaola-workflow', 'archive');
  fs.mkdirSync(archiveBase, { recursive: true });
  let dest = path.join(archiveBase, project + (suffix || ''));
  if (fs.existsSync(dest)) dest += '.archived-' + new Date().toISOString().replace(/[:.]/g, '-');
  fs.renameSync(src, dest);
  let mainRoot, linkedRoot;
  try {
    mainRoot = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
    linkedRoot = fs.realpathSync(root);
  } catch (_) { mainRoot = null; }
  if (mainRoot && mainRoot !== linkedRoot) {
    const mainLive = path.join(mainRoot, 'kaola-workflow', project);
    if (fs.existsSync(mainLive)) fs.rmSync(mainLive, { recursive: true, force: true });
  }
  let roadmapSourceRemoved = 'absent';
  let roadmapRegenerated = 'skipped';
  if (statusValue === 'closed') {
    if (Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
      const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
      try {
        fs.unlinkSync(roadmapFilePath);
        roadmapSourceRemoved = 'removed';
      } catch (e) {
        roadmapSourceRemoved = (e.code === 'ENOENT') ? 'absent' : 'failed';
      }
    }
    try {
      roadmapModule.regenerateRoadmap(root);
      roadmapRegenerated = 'regenerated';
    } catch (_) {
      roadmapRegenerated = 'failed';
    }
  }
  return { archived: true, dest, roadmap_source_removed: roadmapSourceRemoved, roadmap_regenerated: roadmapRegenerated };
}

function checkClosureInvariants(root, receipt, archiveDest) {
  const violations = [];
  const issueNumber = receipt.issue_number;
  const abandoned = receipt && receipt.archive === 'abandoned';
  if (!abandoned && Number.isInteger(issueNumber) && issueNumber > 0) {
    const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issueNumber + '.md');
    if (fs.existsSync(roadmapFile)) {
      const inv = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'roadmap-source-absent');
      violations.push({ id: 'roadmap-source-absent', description: inv ? inv.description : 'roadmap source file still present' });
    }
    const roadmapMirror = path.join(root, 'kaola-workflow', 'ROADMAP.md');
    try {
      const content = fs.readFileSync(roadmapMirror, 'utf8');
      if (content.includes('#' + issueNumber + ' ') || content.includes('#' + issueNumber + '\n') || content.includes('#' + issueNumber + ')')) {
        const inv = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'roadmap-mirror-clean');
        violations.push({ id: 'roadmap-mirror-clean', description: inv ? inv.description : 'ROADMAP.md still lists issue as active' });
      }
    } catch (_) {}
  }
  // outside issueNumber guard: 'skipped_offline' must not violate even when issueNumber is null
  const labelStatus = receipt.claim_label_removed;
  if (labelStatus !== 'skipped_offline' && labelStatus !== 'removed' && labelStatus !== 'already_absent') {
    const invLabel = closureContract.CLOSURE_INVARIANTS.find(i => i.id === 'in-progress-label-removed');
    violations.push({ id: 'in-progress-label-removed', description: invLabel ? invLabel.description : 'workflow:in-progress label was not removed after closure' });
  }
  // active-folder-absent: no live folder for this project should exist after archive
  if (receipt.project) {
    try {
      const active = readActiveFolders(root);
      if (active.some(function(f) { return f.project === receipt.project; })) {
        const invAf = closureContract.CLOSURE_INVARIANTS.find(function(i) { return i.id === 'active-folder-absent'; });
        violations.push({ id: 'active-folder-absent', description: invAf ? invAf.description : 'active workflow folder still exists after closure' });
      }
    } catch (_) {}
  }
  // archive-state-closed: skip when archiveDest absent (mirrors offline-skip pattern)
  if (archiveDest) {
    try {
      const stateFilePath = path.join(archiveDest, 'workflow-state.md');
      if (fs.existsSync(stateFilePath)) {
        const stateContent = fs.readFileSync(stateFilePath, 'utf8');
        const status = field(stateContent, 'status');
        if (status !== 'closed' && status !== 'abandoned') {
          const invAs = closureContract.CLOSURE_INVARIANTS.find(function(i) { return i.id === 'archive-state-closed'; });
          violations.push({ id: 'archive-state-closed', description: invAs ? invAs.description : 'archived workflow-state.md does not show closed or abandoned status' });
        }
      }
    } catch (_) {}
  }
  // branch-worktree-resolved: neither worktree nor branch removal should have failed
  if (receipt.worktree_removed === 'failed' || receipt.branch_removed === 'failed') {
    const invBw = closureContract.CLOSURE_INVARIANTS.find(function(i) { return i.id === 'branch-worktree-resolved'; });
    violations.push({ id: 'branch-worktree-resolved', description: invBw ? invBw.description : 'worktree or branch removal failed during closure' });
  }
  return { ok: violations.length === 0, violations };
}

function buildClosureReceipt(project, issueNumber, steps) {
  const receipt = closureContract.emptyReceipt(project, issueNumber);
  const fields = closureContract.CLOSURE_RECEIPT_FIELDS;
  if (steps && typeof steps === 'object') {
    for (const key of Object.keys(steps)) {
      if (key === 'warnings') continue;
      if (Object.prototype.hasOwnProperty.call(fields, key)) {
        receipt[key] = steps[key];
      }
    }
    if (Array.isArray(steps.warnings)) {
      for (const w of steps.warnings) receipt.warnings.push(w);
    }
  }
  return receipt;
}

function cmdFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  const projectInfo = folder ? { full_name: folder.full_name, html_url: folder.project_html_url } : discoverProjectSafe();
  const result = archiveProjectDir(root, args.project, 'closed');
  let worktreeRemoved = 'failed';
  if (!args.keepWorktree) {
    try {
      const wtResult = removeWorktree(root, args.project, folder);
      if (wtResult && wtResult.removed === true) worktreeRemoved = 'removed';
      else if (wtResult && wtResult.removed === false && wtResult.reason === 'missing') worktreeRemoved = 'missing';
      else if (wtResult && wtResult.removed === false) worktreeRemoved = 'failed';
    } catch (_) { worktreeRemoved = 'failed'; }
  } else {
    worktreeRemoved = 'kept';
    let mainRoot2, linkedRoot2;
    try {
      mainRoot2 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
      linkedRoot2 = fs.realpathSync(root);
    } catch (_) { mainRoot2 = null; }
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      try {
        execFileSync('git', ['-C', root, 'add', '-A', 'kaola-workflow/'],
          { encoding: 'utf8', stdio: 'inherit' });
        execFileSync('git', ['-C', root, 'diff', '--cached', '--quiet'],
          { stdio: 'ignore' });
      } catch (_) {
        execFileSync('git', ['-C', root, 'commit', '-m', 'chore: archive ' + args.project],
          { encoding: 'utf8', stdio: 'inherit' });
      }
    }
  }
  let issueNumber = folder && folder.issue_iid;
  // null-folder fallback: archiveProjectDir ran first, so dest is the archive path
  if (issueNumber == null && result.dest) {
    try {
      const statePath = path.join(result.dest, 'workflow-state.md');
      if (fs.existsSync(statePath)) {
        const n = parseInt(field(fs.readFileSync(statePath, 'utf8'), 'issue_number'), 10);
        issueNumber = Number.isFinite(n) ? n : null;
      }
    } catch (_) {}
  }
  const claimLabelRemoved = clearAdvisoryClaim(issueNumber, 'finalized', projectInfo);
  let remoteIssueClosed = 'skipped_offline';
  if (!OFFLINE && issueNumber) {
    try {
      const probe = probeIssueState(issueNumber);
      remoteIssueClosed = (probe.state === 'closed') ? 'already_closed' : 'skipped_offline';
    } catch (_) { remoteIssueClosed = 'skipped_offline'; }
  }
  const closureReceipt = buildClosureReceipt(args.project, issueNumber, {
    archive: result.skipped ? 'skipped' : (result.archived ? 'closed' : 'failed'),
    roadmap_source_removed: result.roadmap_source_removed,
    roadmap_regenerated: result.roadmap_regenerated,
    remote_issue_closed: remoteIssueClosed,
    claim_label_removed: claimLabelRemoved,
    worktree_removed: worktreeRemoved,
    branch_removed: 'kept'
  });
  const invariantResult = checkClosureInvariants(root, closureReceipt, result.dest);
  output(Object.assign({ status: 'closed' }, result, {
    claim_label_removed: claimLabelRemoved,
    closure_receipt: closureReceipt,
    closure_invariants: invariantResult
  }));
}

function cwdInside(target) {
  const cwd = fs.realpathSync(process.cwd());
  const real = fs.realpathSync(target);
  return cwd === real || cwd.startsWith(real + path.sep);
}

function cmdRelease() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const folder = args.project ? activeByProject(root, args.project) : (args.issue ? activeByIssue(root, args.issue) : null);
  if (!folder) { output({ released: false, reason: '--project or --issue must name an active folder' }, 1); return; }
  if (cwdInside(folder.project_dir)) {
    output({ released: false, reason: 'refusing to discard current working directory' }, 1);
    return;
  }
  const result = archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
  try { removeWorktree(root, folder.project, folder); } catch (_) {}
  clearAdvisoryClaim(folder.issue_iid, args.reason || 'discarded', { full_name: folder.full_name, html_url: folder.project_html_url });
  output(Object.assign({ released: true, project: folder.project }, result));
}

// Partition active folders into current and drift (closed-issue) groups.
// Exported for in-process forge stub testing in unit tests.
function partitionActiveAndDrift(root) {
  const all = readActiveFolders(root, { excludeClosedIssues: false });
  const active = [], drift = [];
  for (const folder of all) {
    if (folder.issue_iid != null && issueIsClosed(folder.issue_iid)) drift.push(folder);
    else active.push(folder);
  }
  return { active, drift };
}

function cmdStatus() {
  const root = getRoot();
  const { active, drift } = partitionActiveAndDrift(root);
  output({ active, drift, count: active.length });
}

function cmdPatchBranch() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(args.branch, '--branch required');
  assert(isSafeName(args.project), 'unsafe project name');
  assert(activeByProject(root, args.project), 'patch-branch requires an existing active folder');
  updateState(root, args.project, content => {
    if (/^branch:/m.test(content)) return content.replace(/^branch:.*$/m, 'branch: ' + args.branch);
    return content + '\n## Sink\nbranch: ' + args.branch + '\n';
  });
  output({ patched: true, project: args.project, branch: args.branch });
}

function listWorkflowWorktrees(root) {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
    return out.split('\n\n').filter(Boolean).map(block => {
      const entry = {};
      for (const line of block.split('\n')) {
        const idx = line.indexOf(' ');
        if (idx > 0) entry[line.slice(0, idx)] = line.slice(idx + 1);
      }
      return entry;
    }).filter(entry => (entry.branch || '').includes('workflow/gitea-issue-'));
  } catch (_) {
    return [];
  }
}

function cmdWorktreeStatus() {
  output({ worktrees: listWorkflowWorktrees(getRoot()) });
}

function collectStale(root) {
  const activeFolders = readActiveFolders(root);
  const activeSet = new Set(activeFolders.map(f => f.issue_number).filter(n => n != null));

  const registeredWorktrees = listWorkflowWorktrees(root);
  const stale_worktrees = [];
  const active_worktrees = [];
  const branchesWithWorktree = new Set();

  for (const wt of registeredWorktrees) {
    // listWorkflowWorktrees returns branch as refs/heads/... — strip for regex matching
    const shortBranch = String(wt.branch || '').replace(/^refs\/heads\//, '');
    const issueNumber = extractIssueNumber(shortBranch);
    if (issueNumber == null) continue;
    branchesWithWorktree.add(shortBranch);

    const projectName = 'issue-' + issueNumber;
    const isArchived = fs.existsSync(path.join(root, 'kaola-workflow', 'archive', projectName));
    const isClosed = OFFLINE ? false : issueIsClosed(issueNumber);
    const inActiveSet = activeSet.has(issueNumber);

    if ((isClosed || isArchived) && !inActiveSet) {
      stale_worktrees.push({
        path: wt.worktree,
        branch: wt.branch,
        head: wt.HEAD,
        issue_number: issueNumber,
        state: worktreeDirtyState(wt.worktree)
      });
    } else {
      active_worktrees.push({ path: wt.worktree, branch: wt.branch, issue_number: issueNumber });
    }
  }

  let localBranches = [];
  try {
    const raw = execFileSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)',
      'refs/heads/workflow/gitea-issue-*'], { encoding: 'utf8' }).trim();
    localBranches = raw ? raw.split('\n') : [];
  } catch (_) {}

  const stale_branches = [];
  for (const branch of localBranches) {
    if (branchesWithWorktree.has(branch)) continue;
    const issueNumber = extractIssueNumber(branch);
    if (issueNumber == null) continue;

    const projectName = 'issue-' + issueNumber;
    const isArchived = fs.existsSync(path.join(root, 'kaola-workflow', 'archive', projectName));
    const isClosed = OFFLINE ? false : issueIsClosed(issueNumber);
    const inActiveSet = activeSet.has(issueNumber);

    if ((isClosed || isArchived) && !inActiveSet) {
      stale_branches.push({ branch, issue_number: issueNumber });
    }
  }

  return { stale_worktrees, stale_branches, active_worktrees };
}

function cmdStaleWorktreeCheck() {
  const root = getRoot();
  const r = collectStale(root);
  output({ ...r, count: r.stale_worktrees.length + r.stale_branches.length });
}

function cmdStaleWorktreeCleanup() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const { stale_worktrees, stale_branches } = collectStale(root);

  // Refuse entire run if cwd is inside any candidate worktree
  for (const wt of stale_worktrees) {
    if (fs.existsSync(wt.path) && cwdInside(wt.path)) {
      output({ cleanup: false, reason: 'refusing to operate from inside a target worktree: ' + wt.path }, 1);
      return;
    }
  }

  const dryRun = !args.execute;
  const buckets = { removed: [], deleted_branch: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };
  const dryBuckets = { would_remove: [], would_delete_branch: [], skipped_dirty: [] };
  const removedBranches = new Set();

  for (const wt of stale_worktrees) {
    const branch = wt.branch.replace(/^refs\/heads\//, '');
    const state = wt.state; // 'clean' | 'dirty' | 'missing'

    if (state === 'dirty' && !(args.archive || args.export || args.force)) {
      (dryRun ? dryBuckets : buckets).skipped_dirty.push(wt.path);
      continue;
    }

    if (dryRun) {
      dryBuckets.would_remove.push(wt.path);
      if (!args.keepBranch) dryBuckets.would_delete_branch.push(branch);
      continue;
    }

    // EXECUTE path
    if (state === 'dirty') {
      if (args.archive) {
        if (stashWorktree(wt.path, wt.issue_number)) {
          buckets.stashed.push(wt.path);
        } else {
          buckets.failed_preserve.push(wt.path);
          continue;
        }
      } else if (args.export) {
        const p = exportWorktreeDiff(root, wt.path, wt.issue_number);
        if (p) {
          buckets.exported.push(...p);
        } else {
          buckets.failed_preserve.push(wt.path);
          continue;
        }
      }
      // --force: no pre-step; removeWorktree passes --force to git
    }

    // For missing-path worktrees, prune the stale registration instead of remove
    if (state === 'missing') {
      try {
        execFileSync('git', ['-C', root, 'worktree', 'prune'], { stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_) {}
      buckets.removed.push(wt.path);
      removedBranches.add(branch);
    } else {
      const rmResult = removeWorktree(root, 'issue-' + wt.issue_number, { worktree_path: wt.path });
      if (rmResult.removed) {
        buckets.removed.push(wt.path);
        removedBranches.add(branch);
      }
    }
  }

  // Branch deletion: worktree-removed branches + loose stale_branches
  const candidateBranches = [...new Set([...removedBranches, ...stale_branches.map(b => b.branch)])];
  for (const branch of candidateBranches) {
    if (args.keepBranch) continue;
    if (dryRun) {
      if (!dryBuckets.would_delete_branch.includes(branch)) dryBuckets.would_delete_branch.push(branch);
      continue;
    }
    // Guard: re-scan; refuse if worktree still references this branch
    const stillRegistered = listWorkflowWorktrees(root).some(
      w => w.branch.replace(/^refs\/heads\//, '') === branch
    );
    if (stillRegistered) continue;
    if (!branchExists(root, branch)) continue;
    if (removeBranch(root, branch)) buckets.deleted_branch.push(branch);
  }

  if (dryRun) {
    output({ dry_run: true, ...dryBuckets });
  } else {
    output({ dry_run: false, ...buckets });
  }
}

function prNumberFromFolder(folder) {
  const direct = parseInt(folder.pr_number, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(folder.pr_url || '').match(/\/pulls\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function watchMergeRequests(root, args) {
  let watched = 0;
  const warnings = [];
  const cleanups = [];
  for (const folder of readActiveFolders(root, { excludeClosedIssues: false })) {
    if (args.issue && folder.issue_iid !== args.issue) continue;
    if (folder.sink !== 'pr') continue;
    const prNumber = prNumberFromFolder(folder);
    if (!prNumber) continue;
    watched++;
    let state = '';
    try { state = forge.viewPullRequest(prNumber).state || ''; } catch (_) { continue; }
    if (state === 'merged') {
      const archiveResult = archiveProjectDir(root, folder.project, 'closed');
      if (archiveResult && (archiveResult.roadmap_source_removed === 'failed' || archiveResult.roadmap_regenerated === 'failed')) {
        warnings.push({ folder: folder.project, roadmap_source_removed: archiveResult.roadmap_source_removed, roadmap_regenerated: archiveResult.roadmap_regenerated });
      }
      let worktreeRemoved = 'failed';
      try {
        const wtResult = removeWorktree(root, folder.project, folder);
        if (wtResult && wtResult.removed === true) worktreeRemoved = 'removed';
        else if (wtResult && wtResult.removed === false && wtResult.reason === 'missing') worktreeRemoved = 'missing';
        else if (wtResult && wtResult.removed === false) worktreeRemoved = 'failed';
      } catch (_) { worktreeRemoved = 'failed'; }
      const claimLabelStatus = clearAdvisoryClaim(folder.issue_iid, 'pr merged', { full_name: folder.full_name, html_url: folder.project_html_url });
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_iid, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'closed' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        remote_issue_closed: 'skipped_offline',
        claim_label_removed: claimLabelStatus,
        worktree_removed: worktreeRemoved,
        branch_removed: 'kept'
      });
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus, receipt: folderReceipt, closure_invariants: folderInvariants });
    } else if (state === 'closed') {
      const archiveResult = archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
      let worktreeRemoved = 'failed';
      try {
        const wtResult = removeWorktree(root, folder.project, folder);
        if (wtResult && wtResult.removed === true) worktreeRemoved = 'removed';
        else if (wtResult && wtResult.removed === false && wtResult.reason === 'missing') worktreeRemoved = 'missing';
        else if (wtResult && wtResult.removed === false) worktreeRemoved = 'failed';
      } catch (_) { worktreeRemoved = 'failed'; }
      const claimLabelStatus = clearAdvisoryClaim(folder.issue_iid, 'pr closed', { full_name: folder.full_name, html_url: folder.project_html_url });
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_iid, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'abandoned' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        remote_issue_closed: 'skipped_offline',
        claim_label_removed: claimLabelStatus,
        worktree_removed: worktreeRemoved,
        branch_removed: 'kept'
      });
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus, receipt: folderReceipt, closure_invariants: folderInvariants });
    }
  }
  return { watched, warnings, cleanups };
}

function cmdWatchPr() {
  if (OFFLINE) { output({ watched: 0, offline: true }); return; }
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const { watched, warnings, cleanups } = watchMergeRequests(root, args);
  const emit = { watched };
  if (warnings && warnings.length > 0) emit.warnings = warnings;
  if (cleanups && cleanups.length > 0) emit.cleanups = cleanups;
  output(emit);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function cmdWorktreeFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  assert(folder && folder.worktree_path, 'worktree-finalize: active folder has no worktree_path');
  copyDir(folder.project_dir, path.join(folder.worktree_path, 'kaola-workflow', folder.project));
  try {
    execFileSync('git', ['-C', folder.worktree_path, 'add', 'kaola-workflow/' + folder.project + '/'], { stdio: 'inherit' });
    execFileSync('git', ['-C', folder.worktree_path, 'diff', '--cached', '--quiet'], { stdio: 'ignore' });
  } catch (_) {
    execFileSync('git', ['-C', folder.worktree_path, 'commit', '-m', 'chore: finalize ' + folder.project], { stdio: 'inherit' });
  }
  output({ finalized: true, project: folder.project, worktree_path: folder.worktree_path });
}

function cmdSinkFallback() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  assert(isSafeName(args.project), 'unsafe project name');
  const archivePath = path.join(root, 'kaola-workflow', 'archive', args.project);
  if (!fs.existsSync(projectDir(root, args.project)) || fs.existsSync(archivePath)) {
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  const reason = args.reason || 'merge fallback';
  updateState(root, args.project, content => content
    .replace(/^sink:.*$/m, 'sink: pr')
    .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
  output({ updated: true, project: args.project, sink: 'pr', reason });
}

function cmdAuditLabels() {
  if (OFFLINE) { output({ stale: [], offline: true }); return; }
  const stale = forge.listIssues({ state: 'closed', labels: [CLAIM_LABEL] })
    .map(it => ({ number: it.number, title: it.title, url: it.web_url }));
  output({ stale, count: stale.length });
}

function cmdRepairLabels() {
  const args = parseArgs(process.argv.slice(3));
  if (OFFLINE) { output({ dry_run: false, offline: true, removed: [], failed: [] }); return; }
  const stale = forge.listIssues({ state: 'closed', labels: [CLAIM_LABEL] })
    .map(it => ({ number: it.number, title: it.title, url: it.web_url }));
  const dryRun = !args.execute;
  if (dryRun) { output({ dry_run: true, would_remove: stale }); return; }
  const projectInfo = discoverProjectSafe();
  const removed = [], failed = [];
  for (const it of stale) {
    try { forge.updateIssueLabels(projectInfo, it.number, { remove: [CLAIM_LABEL] }); removed.push(it.number); }
    catch (_) { failed.push(it.number); }
  }
  output({ dry_run: false, removed, failed });
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-gitea-workflow-claim.js <claim|authoring-allowed|release|status|patch-branch|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-pr|stale-worktree-check|stale-worktree-cleanup|audit-labels|repair-labels>');
  if (sub === 'claim') return cmdClaim();
  if (sub === 'authoring-allowed') return cmdAuthoringAllowed();
  if (sub === 'release' || sub === 'discard') return cmdRelease();
  if (sub === 'status') return cmdStatus();
  if (sub === 'patch-branch') return cmdPatchBranch();
  if (sub === 'watch-pr') return cmdWatchPr();
  if (sub === 'bootstrap' || sub === 'startup') return cmdStartup();
  if (sub === 'finalize') return cmdFinalize();
  if (sub === 'pick-next') return cmdPickNext();
  if (sub === 'resume') return cmdResume();
  if (sub === 'worktree-status') return cmdWorktreeStatus();
  if (sub === 'worktree-finalize') return cmdWorktreeFinalize();
  if (sub === 'sink-fallback') return cmdSinkFallback();
  if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();
  if (sub === 'stale-worktree-cleanup') return cmdStaleWorktreeCleanup();
  if (sub === 'audit-labels') return cmdAuditLabels();
  if (sub === 'repair-labels') return cmdRepairLabels();
  throw new Error('unknown subcommand: ' + sub);
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  archiveProjectDir,
  buildBranchName,
  buildClosureReceipt,
  checkClosureInvariants,
  claimExplicitTarget,
  claimProject,
  cmdAuditLabels,
  cmdRepairLabels,
  collectStale,
  cmdStaleWorktreeCleanup,
  getCoordRoot,
  listOpenIssues,
  partitionActiveAndDrift,
  projectNameForIssue,
  provisionWorktree,
  readActiveFolders,
  readPriorityConfig,
  removeWorktree,
  watchMergeRequests,
  worktreePathFor
};
