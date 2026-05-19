#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitlab-forge');
const classifier = require('./kaola-gitlab-workflow-classifier');
const {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  readActiveFolders
} = require('./kaola-gitlab-workflow-active-folders');

const CLAIM_LABEL = forge.CLAIM_LABEL || 'workflow:in-progress';

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
  for (const key of ['issue', 'targetIssue', 'mrIid']) {
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
  return Number.isFinite(issueIid) && issueIid > 0 ? 'workflow/gitlab-issue-' + issueIid : 'workflow/gitlab-' + project;
}

function worktreePathFor(root, project) {
  return path.join(path.dirname(root), path.basename(root) + '.kw', project);
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
  const wtPath = worktreePathFor(root, project);
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  if (worktreeRegistered(root, wtPath)) return { path: wtPath, branch };
  if (fs.existsSync(wtPath)) return { path: wtPath, branch };
  if (branchExists(root, branch)) {
    execFileSync('git', ['worktree', 'add', '--', wtPath, branch], { cwd: root, stdio: 'inherit' });
  } else {
    execFileSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], { cwd: root, stdio: 'inherit' });
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
  const lines = [
    '# Kaola-Workflow State',
    '',
    '## Project',
    'name: ' + data.project,
    'status: ' + (data.status || 'active'),
    '',
    '## Current Position',
    'phase: ' + (data.phase || 1),
    'phase_name: ' + (data.phase_name || 'Research'),
    'step: ' + (data.step || 'start'),
    'next_command: ' + (data.next_command || ('/kaola-workflow-phase1 ' + data.project)),
    'next_skill: ' + (data.next_skill || ('kaola-workflow-research ' + data.project)),
    'main_session_role: orchestrator',
    'implementation_owner: N/A',
    'fix_owner: N/A',
    'inline_emergency_fallback_authorized: no',
    '',
    '## Pending Gates',
    '- phase1-research',
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
    '## GitLab',
    'issue_iid: ' + (data.issue_iid || ''),
    'project_id: ' + (data.project_id || ''),
    'path_with_namespace: ' + (data.path_with_namespace || ''),
    'project_web_url: ' + (data.project_web_url || ''),
    '',
    '## Sink',
    'branch: ' + data.branch,
    'issue_number: ' + (data.issue_iid || ''),
    'sink: ' + (data.sink || 'merge')
  ];
  if (data.worktree_path) lines.push('worktree_path: ' + data.worktree_path);
  if (data.mr_url) lines.push('mr_url: ' + data.mr_url);
  if (data.mr_iid) lines.push('mr_iid: ' + data.mr_iid);
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
  try { forge.updateIssue(issueIid, { labels: [CLAIM_LABEL] }); } catch (_) {}
  try {
    if (projectInfo && (projectInfo.project_id || projectInfo.path_with_namespace)) {
      forge.createIssueNote(projectInfo, issueIid, '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local GitLab work for `' + project + '`.');
    }
  } catch (_) {}
}

function clearAdvisoryClaim(issueIid, reason, projectInfo) {
  if (issueIid == null) return;
  try { forge.updateIssue(issueIid, { unlabels: [CLAIM_LABEL] }); } catch (_) {}
  try {
    if (reason && projectInfo && (projectInfo.project_id || projectInfo.path_with_namespace)) {
      forge.createIssueNote(projectInfo, issueIid, 'Kaola-Workflow advisory claim cleared: ' + reason);
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
    return forge.listIssues({ state: 'opened', perPage: 100 })
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
    return { status: 'user_target_closed', issue: issueIid, project, reasoning: 'GitLab issue #' + issueIid + ' is closed' };
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
    status: 'active',
    project_id: projectInfo.project_id,
    path_with_namespace: projectInfo.path_with_namespace,
    project_web_url: projectInfo.web_url
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
    const folders = readActiveFolders(root);
    if (folders.length === 1) {
      output({ verdict: 'owned', claim: 'owned', project: folders[0].project, issue: folders[0].issue_iid, selected_project: folders[0].project, selected_issue: folders[0].issue_iid, worktree_path: folders[0].worktree_path || '' });
      return;
    }
    output({ verdict: 'no_target', claim: 'none', project: null, issue: null }, 1);
    return;
  }
  const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: target }));
  output(Object.assign({
    verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
    claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
    selected_project: result.project || null,
    selected_issue: result.issue || null,
    target_source: 'user_directed'
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
  const folders = readActiveFolders(root);
  if (folders.length === 1) {
    output({ verdict: 'owned', claim: 'owned', project: folders[0].project, issue: folders[0].issue_iid, selected_project: folders[0].project, selected_issue: folders[0].issue_iid, worktree_path: folders[0].worktree_path || '' });
    return;
  }
  const issue = listOpenIssues()[0];
  if (!issue) {
    output({ verdict: 'no_target', claim: 'none', project: null, issue: null }, 1);
    return;
  }
  const result = claimExplicitTarget(root, Object.assign({}, args, { targetIssue: issue.issue_iid || issue.number }));
  output(Object.assign({
    verdict: result.status === 'acquired' ? (result.verdict || 'green') : result.status,
    claim: result.status === 'acquired' ? 'acquired' : (result.status === 'owned' ? 'owned' : 'none'),
    selected_project: result.project || null,
    selected_issue: result.issue || null,
    target_source: 'gitlab_open_issues'
  }, result), result.status === 'acquired' || result.status === 'owned' ? 0 : 1);
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

function getCoordRoot(root) {
  try {
    const raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: root || getRoot(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return path.resolve(root || getRoot(), raw);
  } catch (_) {
    return path.join(root || getRoot(), '.git');
  }
}

function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}

function archiveProjectDir(root, project, statusValue, suffix) {
  assert(isSafeName(project), 'unsafe project name');
  const src = projectDir(root, project);
  if (!fs.existsSync(src)) return { skipped: 'source-missing' };
  const state = stateFile(root, project);
  try {
    let content = fs.readFileSync(state, 'utf8');
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
  return { archived: true, dest };
}

function cmdFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
  const projectInfo = folder ? { project_id: folder.project_id, path_with_namespace: folder.path_with_namespace } : discoverProjectSafe();
  const result = archiveProjectDir(root, args.project, 'closed');
  if (!args.keepWorktree) {
    try { removeWorktree(root, args.project, folder); } catch (_) {}
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
  clearAdvisoryClaim(folder.issue_iid, args.reason || 'discarded', { project_id: folder.project_id, path_with_namespace: folder.path_with_namespace });
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
    }).filter(entry => (entry.branch || '').includes('workflow/gitlab-issue-'));
  } catch (_) {
    return [];
  }
}

function cmdWorktreeStatus() {
  output({ worktrees: listWorkflowWorktrees(getRoot()) });
}

function mrIidFromFolder(folder) {
  const direct = parseInt(folder.mr_iid, 10);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(folder.mr_url || '').match(/merge_requests\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function watchMergeRequests(root, args) {
  let watched = 0;
  for (const folder of readActiveFolders(root, { excludeClosedIssues: false })) {
    if (args.issue && folder.issue_iid !== args.issue) continue;
    if (folder.sink !== 'mr') continue;
    const mrIid = mrIidFromFolder(folder);
    if (!mrIid) continue;
    watched++;
    let state = '';
    try { state = forge.viewMergeRequest(mrIid).state || ''; } catch (_) { continue; }
    if (state === 'merged') {
      archiveProjectDir(root, folder.project, 'closed');
      try { removeWorktree(root, folder.project, folder); } catch (_) {}
      clearAdvisoryClaim(folder.issue_iid, 'mr merged', { project_id: folder.project_id, path_with_namespace: folder.path_with_namespace });
    } else if (state === 'closed') {
      archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
      try { removeWorktree(root, folder.project, folder); } catch (_) {}
      clearAdvisoryClaim(folder.issue_iid, 'mr closed', { project_id: folder.project_id, path_with_namespace: folder.path_with_namespace });
    }
  }
  return { watched };
}

function cmdWatchMr() {
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
  if (!fs.existsSync(projectDir(root, args.project))) {
    output({ updated: false, project: args.project, reason: 'project archived' });
    return;
  }
  const reason = args.reason || 'merge fallback';
  updateState(root, args.project, content => content
    .replace(/^sink:.*$/m, 'sink: mr')
    .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
  output({ updated: true, project: args.project, sink: 'mr', reason });
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-gitlab-workflow-claim.js <claim|release|status|patch-branch|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback>');
  if (sub === 'claim') return cmdClaim();
  if (sub === 'release' || sub === 'discard') return cmdRelease();
  if (sub === 'status') return cmdStatus();
  if (sub === 'patch-branch') return cmdPatchBranch();
  if (sub === 'watch-mr') return cmdWatchMr();
  if (sub === 'startup') return cmdStartup();
  if (sub === 'finalize') return cmdFinalize();
  if (sub === 'pick-next') return cmdPickNext();
  if (sub === 'resume') return cmdResume();
  if (sub === 'worktree-status') return cmdWorktreeStatus();
  if (sub === 'worktree-finalize') return cmdWorktreeFinalize();
  if (sub === 'sink-fallback') return cmdSinkFallback();
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
