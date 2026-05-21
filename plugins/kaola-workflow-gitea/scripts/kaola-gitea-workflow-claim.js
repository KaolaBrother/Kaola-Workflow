#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
const classifier = require('./kaola-gitea-workflow-classifier');
const {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  readActiveFolders
} = require('./kaola-gitea-workflow-active-folders');
const roadmapModule = require('./kaola-gitea-workflow-roadmap');

const CLAIM_LABEL = forge.CLAIM_LABEL || 'workflow:in-progress';
const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--json') { args.json = true; continue; }
    if (key === '--force') { args.force = true; continue; }
    if (key === '--keep-worktree') { args.keepWorktree = true; continue; }
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
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + data.project,
    'status: ' + (data.status || 'active'),
    '',
    '## Current Position',
    'phase: ' + (isFast ? 'fast' : (data.phase || 1)),
    'phase_name: ' + (isFast ? 'Fast' : (data.phase_name || 'Research')),
    'workflow_path: ' + workflowPath,
    'step: ' + (data.step || 'start'),
    'next_command: ' + (data.next_command || (isFast ? '/kaola-workflow-fast ' + data.project : '/kaola-workflow-phase1 ' + data.project)),
    'next_skill: ' + (data.next_skill || (isFast ? 'kaola-workflow-fast ' + data.project : 'kaola-workflow-research ' + data.project)),
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    isFast ? '- fast-summary' : '- phase1-research',
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
  if (issueIid == null) return;
  try {
    if (projectInfo && projectInfo.full_name) {
      forge.updateIssueLabels(projectInfo, issueIid, { remove: [CLAIM_LABEL] });
    }
  } catch (_) {}
  try {
    if (reason && projectInfo && projectInfo.full_name) {
      forge.createIssueComment(projectInfo, issueIid, 'Kaola-Workflow advisory claim cleared: ' + reason);
    }
  } catch (_) {}
}

function classifyIssue(root, issueIid) {
  try {
    return classifier.classifyIssue(issueIid, root);
  } catch (_) {
    return { verdict: 'green', reasoning: 'classifier failed open' };
  }
}

function activeByIssue(root, issueIid) {
  return readActiveFolders(root).find(folder => folder.issue_iid === issueIid) || null;
}

function activeByProject(root, project) {
  return readActiveFolders(root).find(folder => folder.project === project) || null;
}

function listOpenIssues() {
  try {
    return forge.listIssues({ state: 'open', perPage: 100 })
      .filter(issue => issue.state === 'open')
      .sort((a, b) => Number(a.issue_iid || a.number) - Number(b.issue_iid || b.number));
  } catch (_) {
    return [];
  }
}

function claimProject(root, args) {
  const issueIid = args.issue || args.targetIssue || null;
  const project = args.project || projectNameForIssue(root, issueIid);
  assert(isSafeName(project), 'unsafe project name');
  if (issueIid != null && issueIsClosed(issueIid)) {
    return { status: 'user_target_closed', issue: issueIid, project, reasoning: 'Gitea issue #' + issueIid + ' is closed' };
  }
  const existing = issueIid != null ? activeByIssue(root, issueIid) : activeByProject(root, project);
  if (existing) return { status: 'owned', issue: existing.issue_iid, project: existing.project, folder: existing };

  const dir = projectDir(root, project);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === 'EEXIST') return { status: 'target_occupied', issue: issueIid, project, reasoning: 'local project folder exists' };
    throw e;
  }

  const branch = buildBranchName(issueIid, project, args.branch);
  let worktreePath = '';
  if (hasGitHistory(root)) {
    try { worktreePath = provisionWorktree(root, project, branch).path; } catch (_) { worktreePath = ''; }
  }
  const projectInfo = discoverProjectSafe();
  writeState(root, {
    project,
    issue_iid: issueIid,
    branch,
    sink: args.sink || process.env.KAOLA_SINK || 'merge',
    worktree_path: worktreePath,
    workflow_path: args.workflowPath || process.env.KAOLA_PATH || 'full',
    status: 'active',
    full_name: projectInfo.full_name,
    project_html_url: projectInfo.html_url
  });
  postAdvisoryClaim(issueIid, project, projectInfo);
  return { status: 'acquired', verdict: 'green', claim: 'acquired', issue: issueIid, project, branch, worktree_path: worktreePath };
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
    next_command: folder.next_command || ('/kaola-workflow-phase' + (folder.phase || 1) + ' ' + folder.project)
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
  if (statusValue === 'closed') {
    try {
      if (Number.isInteger(archiveIssueNumber) && archiveIssueNumber > 0) {
        const roadmapFilePath = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
        try { fs.unlinkSync(roadmapFilePath); }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      roadmapModule.regenerateRoadmap(root);
    } catch (_) { /* roadmap mirror cleanup is non-fatal; archive already completed */ }
  }
  return { archived: true, dest };
}

function cmdFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  const projectInfo = folder ? { full_name: folder.full_name, html_url: folder.project_html_url } : discoverProjectSafe();
  const result = archiveProjectDir(root, args.project, 'closed');
  if (!args.keepWorktree) {
    try { removeWorktree(root, args.project, folder); } catch (_) {}
  } else {
    let mainRoot2, linkedRoot2;
    try {
      mainRoot2 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
      linkedRoot2 = fs.realpathSync(root);
    } catch (_) { mainRoot2 = null; }
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      execFileSync('git', ['-C', root, 'add', '-A', 'kaola-workflow/'],
        { encoding: 'utf8', stdio: 'inherit' });
      execFileSync('git', ['-C', root, 'commit', '-m', 'chore: archive ' + args.project],
        { encoding: 'utf8', stdio: 'inherit' });
    }
  }
  clearAdvisoryClaim(folder && folder.issue_iid, 'finalized', projectInfo);
  output(Object.assign({ status: 'closed' }, result));
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

function cmdStaleWorktreeCheck() {
  const root = getRoot();
  const activeFolders = readActiveFolders(root);
  const activeSet = new Set(activeFolders.map(f => f.issue_number).filter(n => n != null));

  const registeredWorktrees = listWorkflowWorktrees(root);
  const staleWorktrees = [];
  const activeWorktrees = [];
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
      staleWorktrees.push({
        path: wt.worktree,
        branch: wt.branch,
        head: wt.HEAD,
        issue_number: issueNumber,
        state: worktreeDirtyState(wt.worktree)
      });
    } else {
      activeWorktrees.push({ path: wt.worktree, branch: wt.branch, issue_number: issueNumber });
    }
  }

  let localBranches = [];
  try {
    const raw = execFileSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)',
      'refs/heads/workflow/gitea-issue-*'], { encoding: 'utf8' }).trim();
    localBranches = raw ? raw.split('\n') : [];
  } catch (_) {}

  const staleBranches = [];
  for (const branch of localBranches) {
    if (branchesWithWorktree.has(branch)) continue;
    const issueNumber = extractIssueNumber(branch);
    if (issueNumber == null) continue;

    const projectName = 'issue-' + issueNumber;
    const isArchived = fs.existsSync(path.join(root, 'kaola-workflow', 'archive', projectName));
    const isClosed = OFFLINE ? false : issueIsClosed(issueNumber);
    const inActiveSet = activeSet.has(issueNumber);

    if ((isClosed || isArchived) && !inActiveSet) {
      staleBranches.push({ branch, issue_number: issueNumber });
    }
  }

  output({ stale_worktrees: staleWorktrees, stale_branches: staleBranches,
    active_worktrees: activeWorktrees, count: staleWorktrees.length + staleBranches.length });
}

function prNumberFromFolder(folder) {
  const direct = parseInt(folder.pr_number, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(folder.pr_url || '').match(/\/pulls\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function watchMergeRequests(root, args) {
  let watched = 0;
  for (const folder of readActiveFolders(root, { excludeClosedIssues: false })) {
    if (args.issue && folder.issue_iid !== args.issue) continue;
    if (folder.sink !== 'pr') continue;
    const prNumber = prNumberFromFolder(folder);
    if (!prNumber) continue;
    watched++;
    let state = '';
    try { state = forge.viewPullRequest(prNumber).state || ''; } catch (_) { continue; }
    if (state === 'merged') {
      archiveProjectDir(root, folder.project, 'closed');
      try { removeWorktree(root, folder.project, folder); } catch (_) {}
      clearAdvisoryClaim(folder.issue_iid, 'pr merged', { full_name: folder.full_name, html_url: folder.project_html_url });
    } else if (state === 'closed') {
      archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
      try { removeWorktree(root, folder.project, folder); } catch (_) {}
      clearAdvisoryClaim(folder.issue_iid, 'pr closed', { full_name: folder.full_name, html_url: folder.project_html_url });
    }
  }
  return { watched };
}

function cmdWatchPr() {
  if (OFFLINE) { output({ watched: 0, offline: true }); return; }
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const result = watchMergeRequests(root, args);
  const watched = result.watched;
  output({ watched });
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

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-gitea-workflow-claim.js <claim|release|status|patch-branch|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|watch-pr|stale-worktree-check>');
  if (sub === 'claim') return cmdClaim();
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
  throw new Error('unknown subcommand: ' + sub);
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  archiveProjectDir,
  buildBranchName,
  claimExplicitTarget,
  claimProject,
  getCoordRoot,
  listOpenIssues,
  partitionActiveAndDrift,
  projectNameForIssue,
  provisionWorktree,
  readActiveFolders,
  removeWorktree,
  watchMergeRequests,
  worktreePathFor
};
