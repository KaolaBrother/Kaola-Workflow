#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  field,
  getRoot,
  isSafeName,
  issueIsClosed,
  probeIssueState,
  readActiveFolders
} = require('./kaola-workflow-active-folders');

const roadmapModule = require('./kaola-workflow-roadmap');
const closureContract = require('./kaola-workflow-closure-contract');
// issue #227 (adaptive path): forge-neutral constants + toggle resolution.
const adaptiveSchema = require('./kaola-workflow-adaptive-schema');

// Read the shared global config (the same ~/.config/kaola-workflow/config.json the
// classifiers read). Read-only here — never creates the file. Returns {} on any
// error so the strict `=== true` on-test in resolveEnableAdaptive falls to OFF.
function readAdaptiveConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ...adaptiveSchema.CONFIG_REL_PATH), 'utf8'));
  } catch (_) {
    return {};
  }
}

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const WORKTREE_NATIVE = process.env.KAOLA_WORKTREE_NATIVE !== '0';
const CLAIM_LABEL = 'workflow:in-progress';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// M4 (#277): derive run_posture from the actual provisioning outcome.
// worktreePath truthy => 'worktree'; falsy => 'in-place'.
// Pure / unit-testable; no env reads.
function deriveRunPosture(worktreePath) {
  return worktreePath ? 'worktree' : 'in-place';
}

// M2 (#277 Phase 2): WARN-FIRST dispatch-log attestation checker.
// logDirCandidates: ordered array of directory paths that may contain
// dispatch-log.jsonl; the first existing file wins. Mutates receipt
// fields + receipt.warnings in-place; never throws; never modifies
// closure_invariants.violations (warn-first contract).
function checkDispatchAttestations(logDirCandidates, receipt) {
  let logPath = null;
  for (const dir of (logDirCandidates || [])) {
    if (!dir) continue;
    const candidate = path.join(dir, 'dispatch-log.jsonl');
    try {
      if (fs.existsSync(candidate)) { logPath = candidate; break; }
    } catch (_) {}
  }
  if (!logPath) {
    // Detector inactive: Codex, pre-hook installs, and this repo's own runs all hit here.
    receipt.claim_planner_attested = 'missing';
    receipt.finalize_contractor_attested = 'missing';
    receipt.warnings.push('attestation: dispatch-log not found (SubagentStart hook not installed) — detector inactive');
    return;
  }
  // Log found — parse and check each seam.
  let lines = [];
  try {
    lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  } catch (e) {
    receipt.claim_planner_attested = 'failed';
    receipt.finalize_contractor_attested = 'failed';
    receipt.warnings.push('attestation: failed to read dispatch-log (' + String(e && e.message) + ')');
    return;
  }
  let sawPlanner = false;
  let sawContractor = false;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry && entry.agent_type === 'workflow-planner') sawPlanner = true;
      if (entry && entry.agent_type === 'contractor') sawContractor = true;
    } catch (_) {}
  }
  receipt.claim_planner_attested = sawPlanner ? 'attested' : 'missing';
  receipt.finalize_contractor_attested = sawContractor ? 'attested' : 'missing';
  if (!sawPlanner) {
    receipt.warnings.push('ATTESTATION WARNING: no workflow-planner dispatch found in dispatch-log — claim/author seam may have been run inline by main session');
  }
  if (!sawContractor) {
    receipt.warnings.push('ATTESTATION WARNING: no contractor dispatch found in dispatch-log — finalize seam may have been run inline by main session');
  }
}

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
    // M1 (#280): planner self-attest flag; a boolean flag like --json/--force.
    if (key === '--attest-planner-spawn') { args.attestPlannerSpawn = true; continue; }
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

function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8' }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8' }, opts || {})).trim();
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

function readPriorityConfig(root) {
  const file = path.join(root, 'kaola-workflow', 'config.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed.priority_top_tier_labels) ? parsed.priority_top_tier_labels : ['P0', 'P1'];
  } catch (_) {
    return ['P0', 'P1'];
  }
}

function labelName(label) {
  return String((label && label.name) || label || '');
}

function priorityTier(issue, topTierLabels) {
  const labels = (issue.labels || []).map(labelName);
  for (const label of labels) {
    if (/^P\d+$/i.test(label)) return { tier: parseInt(label.slice(1), 10), priority_label: label };
  }
  if (labels.some(label => topTierLabels.includes(label))) return { tier: 1, priority_label: labels.find(label => topTierLabels.includes(label)) };
  return { tier: 99, priority_label: '' };
}

function listOpenIssues(root) {
  if (OFFLINE) return [];
  try {
    const raw = ghExec(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,labels,updatedAt,url']);
    const issues = JSON.parse(raw || '[]');
    const topTierLabels = readPriorityConfig(root);
    return issues.sort((a, b) => {
      const at = priorityTier(a, topTierLabels).tier;
      const bt = priorityTier(b, topTierLabels).tier;
      return at - bt || Number(a.number) - Number(b.number);
    });
  } catch (_) {
    return [];
  }
}

function projectNameForIssue(root, issueNumber) {
  const roadmapFile = path.join(root, 'kaola-workflow', '.roadmap', 'issue-' + issueNumber + '.md');
  try {
    const name = field(fs.readFileSync(roadmapFile, 'utf8'), 'workflow_project');
    if (name && name !== '—' && isSafeName(name)) return name;
  } catch (_) {}
  return 'issue-' + issueNumber;
}

function buildBranchName(issueNumber, project, fallback) {
  if (fallback) return fallback;
  return Number.isFinite(issueNumber) && issueNumber > 0 ? 'workflow/issue-' + issueNumber : 'workflow/' + project;
}

function worktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(mainRoot, '.kw', 'worktrees', project);
}

function legacySiblingWorktreePathFor(root, project) {
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  return path.join(path.dirname(mainRoot), path.basename(mainRoot) + '.kw', project);
}

function extractIssueNumber(branch) {
  const m = branch.match(/workflow\/issue-(\d+)/);
  return m ? Number(m[1]) : null;
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

function hasGitHistory(root) {
  try {
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch (_) {
    return false;
  }
}

function inPlaceHead(root) {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return ''; }
}

function treeDirty(root) {
  try {
    return execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().length > 0;
  } catch (_) { return false; }
}

function defaultBranch(root) {
  try {
    const ref = execFileSync('git', ['-C', root, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return ref.replace(/^origin\//, '');
  } catch (_) { return 'main'; }
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
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
    return out.includes('worktree ' + wtPath + '\n');
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
    execFileSync('git', ['worktree', 'add', '--', wtPath, branch], {
      cwd: mainRoot,
      stdio: ['ignore', 'ignore', 'ignore']
    });
  } else {
    execFileSync('git', ['worktree', 'add', '-b', branch, '--', wtPath, 'HEAD'], {
      cwd: mainRoot,
      stdio: ['ignore', 'ignore', 'ignore']
    });
  }
  return { path: wtPath, branch };
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

function writeState(root, data) {
  const workflowPath = data.workflow_path || 'full';
  const isFast = workflowPath === 'fast';
  // issue #227: adaptive runs resume via the kaola-workflow-plan-run executor, not
  // the phaseN ladder. This default is TOGGLE-AGNOSTIC — an already-frozen plan must
  // emit the plan-run command regardless of the switch (else a flip-OFF would orphan
  // the frozen plan into a phaseN misroute).
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
    '## Sink',
    'branch: ' + data.branch,
    'issue_number: ' + (data.issue_number || ''),
    'sink: ' + (data.sink || 'merge'),
    'run_posture: ' + deriveRunPosture(data.worktree_path)
  ];
  if (data.worktree_path) lines.push('worktree_path: ' + data.worktree_path);
  if (data.worktree_error) lines.push('worktree_error: ' + data.worktree_error);
  if (data.base_branch) lines.push('base_branch: ' + data.base_branch);
  if (data.pr_url) lines.push('pr_url: ' + data.pr_url);
  if (data.pr_number) lines.push('pr_number: ' + data.pr_number);
  writeFile(stateFile(root, data.project), lines.join('\n') + '\n');
}

function updateState(root, project, updater) {
  const file = stateFile(root, project);
  let content = '';
  try { content = fs.readFileSync(file, 'utf8'); } catch (_) {}
  const updated = updater(content);
  writeFile(file, updated);
}

function postAdvisoryClaim(issueNumber, project) {
  if (OFFLINE || issueNumber == null) return;
  try { ghExec(['label', 'create', CLAIM_LABEL, '--color', 'f9d0c4', '--description', 'Kaola-Workflow active work marker']); } catch (_) {}
  try { ghExec(['issue', 'edit', String(issueNumber), '--add-label', CLAIM_LABEL]); } catch (_) {}
  try { ghExec(['issue', 'comment', String(issueNumber), '--body', '<!-- kw:claim project=' + project + ' -->\nKaola-Workflow started local work for `' + project + '`.']); } catch (_) {}
}

function removeLegacyStateBlocks(content) {
  const retiredBlock = '## ' + 'Lease';
  const retiredFields = [
    'sess' + 'ion_id',
    'owner_' + 'sess' + 'ion_id',
    'last_' + 'heart' + 'beat',
    'claim_comment_id',
    'expires'
  ];
  const blockPattern = new RegExp('\\n?' + retiredBlock + '\\s*\\n[\\s\\S]*?(?=\\n## |\\s*$)', 'g');
  const fieldPattern = new RegExp('^(' + retiredFields.join('|') + '):.*$\\n?', 'gm');
  return String(content || '')
    .replace(blockPattern, '')
    .replace(fieldPattern, '');
}

function clearAdvisoryClaim(issueNumber, reason, project) {
  if (OFFLINE || issueNumber == null) return 'skipped_offline';
  let status = 'failed';
  try {
    ghExec(['issue', 'edit', String(issueNumber), '--remove-label', CLAIM_LABEL]);
    status = 'removed';
  } catch (_) {}
  if (reason) {
    try { ghExec(['issue', 'comment', String(issueNumber), '--body', 'Kaola-Workflow advisory claim cleared: ' + reason]); } catch (_) {}
  }
  // Delete the project-scoped kw:claim marker comment so the remote-claim detector
  // no longer blocks re-claiming this issue after discard/release/finalize (#275).
  try {
    const raw = ghExec(['api', 'repos/{owner}/{repo}/issues/' + String(issueNumber) + '/comments']);
    const comments = JSON.parse(raw || '[]');
    const marker = project ? ('<!-- kw:claim project=' + project + ' -->') : null;
    for (const comment of comments) {
      if (!comment || !comment.body || !comment.id) continue;
      if (marker ? comment.body.includes(marker) : /<!--\s*kw:claim\s+project=/.test(comment.body)) {
        try { ghExec(['api', '--method', 'DELETE', 'repos/{owner}/{repo}/issues/comments/' + String(comment.id)]); } catch (_) {}
      }
    }
  } catch (_) {}
  return status;
}

function classifyIssue(root, issueNumber) {
  const classifier = path.join(__dirname, 'kaola-workflow-classifier.js');
  if (!fs.existsSync(classifier)) return { verdict: 'target_unavailable', reasoning: 'classifier unavailable (packaging error)' };
  try {
    const raw = execFileSync(process.execPath, [classifier, 'classify', '--issue', String(issueNumber), '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000
    }).trim();
    return raw ? JSON.parse(raw) : { verdict: 'target_unavailable', reasoning: 'classifier returned empty output (contract bug)' };
  } catch (e) {
    if (e.status === 2) return { verdict: 'owned', reasoning: 'active local folder already exists' };
    return { verdict: 'target_unavailable', reasoning: 'classifier failed (subprocess error)' };
  }
}

function activeByIssue(root, issueNumber) {
  return readActiveFolders(root).find(folder => folder.issue_number === issueNumber) || null;
}

function activeByProject(root, project) {
  return readActiveFolders(root).find(folder => folder.project === project) || null;
}

function claimProject(root, args) {
  const issueNumber = args.issue || args.targetIssue || null;
  const project = args.project || projectNameForIssue(root, issueNumber);
  assert(isSafeName(project), 'unsafe project name');
  const existing = issueNumber != null ? activeByIssue(root, issueNumber) : activeByProject(root, project);
  if (existing) return { status: 'owned', issue: existing.issue_number, project: existing.project, folder: existing };

  // issue #227: the single shared toggle guard for NEW claims (covers cmdClaim and
  // cmdStartup -> claimExplicitTarget). Whitelist the persisted workflow_path:
  // {fast, full} when the adaptive switch is OFF, {fast, full, adaptive} when ON.
  // An adaptive claim under an OFF switch is a TYPED REFUSAL (#44) — never a silent
  // downgrade to full. Resume of an already-frozen plan does NOT pass here (the
  // `existing` early-return above handles re-claims), so this gates SELECTION only.
  const requestedPath = args.workflowPath || process.env.KAOLA_PATH || 'full';
  const adaptiveEnabled = adaptiveSchema.resolveEnableAdaptive(readAdaptiveConfig(), process.env);
  if (!adaptiveSchema.isLegalWorkflowPath(requestedPath, adaptiveEnabled)) {
    const legal = (adaptiveEnabled ? adaptiveSchema.WORKFLOW_PATHS : adaptiveSchema.WORKFLOW_PATHS_NO_ADAPTIVE).join(', ');
    return {
      status: 'workflow_path_refused',
      claim: 'none',
      issue: issueNumber,
      project,
      reasoning: 'workflow_path "' + requestedPath + '" is not permitted (adaptive switch is ' +
        (adaptiveEnabled ? 'ON' : 'OFF') + '); legal values: ' + legal +
        '. Refusing to silently downgrade (#44).'
    };
  }

  if (issueNumber != null) {
    const probe = probeIssueState(issueNumber);
    if (probe.state === 'closed') {
      return { status: 'user_target_closed', issue: issueNumber, project, reasoning: 'GitHub issue #' + issueNumber + ' is closed' };
    }
    if (!OFFLINE && probe.state === 'unavailable') {
      return { status: 'target_unavailable', claim: 'none', issue: issueNumber, project, reasoning: 'gh issue #' + issueNumber + ' state probe failed; refusing to claim outside KAOLA_WORKFLOW_OFFLINE=1' };
    }
  }

  // Hoist branch name computation before mkdir so the dirty-tree gate and in-place checkout block
  // can reference it without orphaning a created folder on refusal.
  const branch = buildBranchName(issueNumber, project, args.branch);

  // Dirty-tree gate: refuse in-place branch creation if the working tree has uncommitted changes.
  // Fires ONLY when NATIVE=0 (in-place mode), online, with git history, and HEAD not detached.
  // Detached HEAD is NOT refused here — it falls to record-only below.
  const headBranch = inPlaceHead(root);
  const wouldInPlace = !OFFLINE && hasGitHistory(root) && !WORKTREE_NATIVE;
  if (wouldInPlace && headBranch !== 'HEAD' && headBranch !== '' && treeDirty(root)) {
    return { status: 'dirty_tree_refused', claim: 'none', issue: issueNumber, project,
      reasoning: 'working tree has uncommitted changes; refusing to create in-place feature branch (KAOLA_WORKTREE_NATIVE=0). Commit or stash, or use a worktree.' };
  }

  const dir = projectDir(root, project);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  try {
    fs.mkdirSync(dir);
  } catch (e) {
    if (e.code === 'EEXIST') {
      if (fs.existsSync(stateFile(root, project))) {
        return { status: 'target_occupied', issue: issueNumber, project, reasoning: 'local project folder exists' };
      }
      // orphaned stateless dir (crash between mkdir and writeState) — fall through and reclaim
    } else { throw e; }
  }

  let worktreePath = '';
  let worktreeError = '';
  // Worktree provisioning is ON by default. All workflow paths (full, fast, adaptive) provision a
  // repo-local hidden worktree at <root>/.kw/worktrees/<project> (#264). The executor (plan-run)
  // operates in the worktree via the ACTIVE_WORKTREE_PATH resolver, so adaptive runs now provision
  // per #264. Set KAOLA_WORKTREE_NATIVE=0 to opt out entirely.
  if (!OFFLINE && WORKTREE_NATIVE && hasGitHistory(root)) {
    try { worktreePath = provisionWorktree(root, project, branch).path; } catch (e) { worktreeError = (e && e.message) || String(e); }
  }

  // In-place branch creation: NATIVE=0 + online + git history -> create/checkout feature branch.
  // Parallel to the worktree block above; mutually exclusive by WORKTREE_NATIVE vs !WORKTREE_NATIVE.
  let baseBranch = '';
  let inPlaceNote = '';
  if (wouldInPlace) {
    if (headBranch === 'HEAD' || headBranch === '') {
      inPlaceNote = 'detached HEAD: skipped in-place branch creation (record-only)';
    } else {
      try {
        if (branchExists(root, branch)) {
          execFileSync('git', ['-C', root, 'checkout', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
        } else {
          execFileSync('git', ['-C', root, 'checkout', '-b', branch], { stdio: ['ignore', 'ignore', 'ignore'] });
        }
        baseBranch = (headBranch && headBranch !== 'HEAD' && headBranch !== branch) ? headBranch : '';
      } catch (e) {
        inPlaceNote = 'in-place branch checkout failed: ' + ((e && e.message) || String(e));
      }
    }
  }

  writeState(root, {
    project,
    issue_number: issueNumber,
    branch,
    sink: args.sink || process.env.KAOLA_SINK || 'merge',
    worktree_path: worktreePath,
    worktree_error: worktreeError,
    base_branch: baseBranch,
    workflow_path: args.workflowPath || process.env.KAOLA_PATH || 'full',
    runtime: args.runtime || 'claude',
    status: 'active'
  });
  postAdvisoryClaim(issueNumber, project);
  // M1 (#280): planner self-attest back-fill.
  // The SubagentStart hook logs dispatched agents to .cache/dispatch-log.jsonl but cannot
  // log the planner's OWN spawn (no project state file exists at that moment — this claim
  // creates it). When --attest-planner-spawn is supplied by the planner's own startup
  // invocation, back-fill a workflow-planner entry so checkDispatchAttestations sees it.
  // Gated strictly on the flag: a main-session inline bypass (no flag) writes nothing →
  // claim_planner_attested stays missing/failed (inline-bypass detector still fires).
  // Wrapped in try/catch: attestation is warn-first and must NEVER block the claim.
  if (args.attestPlannerSpawn) {
    try {
      const cacheDir = path.join(root, 'kaola-workflow', project, '.cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const entry = JSON.stringify({ ts, agent_type: 'workflow-planner', agent_id: 'claim-backfill', cwd: root });
      fs.appendFileSync(path.join(cacheDir, 'dispatch-log.jsonl'), entry + '\n');
    } catch (_) { /* fail-open: attestation is warn-first */ }
  }
  return Object.assign(
    { status: 'acquired', verdict: 'green', claim: 'acquired', issue: issueNumber, project, branch, worktree_path: worktreePath },
    worktreeError ? { worktree_error: worktreeError } : {},
    baseBranch ? { base_branch: baseBranch } : {},
    inPlaceNote ? { inPlaceNote } : {}
  );
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

// issue #235 (audit D8): a HARD guard at the /kaola-workflow-adapt AUTHORING entry. The adapt
// command calls this BEFORE authoring/freezing a workflow-plan.md, so authoring can no longer
// proceed via a prose-only gate. It reads the SAME switch as claimProject (the only other
// switch-reader) and emits a TYPED refusal when OFF, mirroring the claimProject refusal family.
// Forge-neutral + stateless (no gh/glab, no issue field, no folder requirement) so the body is
// byte-identical across all four editions. The VALIDATOR stays toggle-agnostic — the switch is
// read HERE, never in validatePlan / freezePlan / revalidateForResume.
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
  if (target) return cmdStartup();
  output({ verdict: 'no_target', claim: 'none', project: null, issue: null }, 1);
}

function resumeFallbackCommand(root, folder) {
  let isFast = false;
  let isAdaptive = false;
  try {
    const sf = path.join(root, 'kaola-workflow', folder.project, 'workflow-state.md');
    const content = fs.readFileSync(sf, 'utf8');
    isFast = /^(?:workflow_path|phase):\s*fast\s*$/m.test(content);
    // issue #227: an adaptive project resumes via the plan-run executor, NEVER the
    // phaseN ladder. Toggle-agnostic (resume ignores the install switch, like routeAdaptive).
    isAdaptive = /^(?:workflow_path|phase):\s*adaptive\s*$/m.test(content);
  } catch (_) {}
  if (isAdaptive) return adaptiveSchema.PLAN_RUN_COMMAND + ' ' + folder.project;
  return (isFast ? '/kaola-workflow-fast ' : '/kaola-workflow-phase' + (folder.phase || 1) + ' ') + folder.project;
}

// #234 E1: reconcile the PERSISTED next_command against the project's true path before trusting it.
// A present-but-stale value (e.g. a residual `/kaola-workflow-phase4` on a project that is actually
// adaptive) must NOT bypass the fallback: when the project is adaptive (workflow_path/phase says so,
// or a workflow-plan.md exists) FORCE plan-run and ignore the stale phaseN, matching routeAdaptive's
// artifact-first stance (#44: never silently ride the phaseN ladder). The NON-adaptive path keeps its
// pre-existing contract (trust the persisted command, else reconstruct) — a full/fast next_command
// legitimately points FORWARD of the `phase:` field (e.g. phase5 complete writes phase: 5 +
// next_command: /kaola-workflow-phase6), so it must NOT be overridden by phase-derived reconstruction.
// Toggle-agnostic: never reads resolveEnableAdaptive (resume must work even when the switch is OFF).
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

// Detect the crash state where archiveProjectDir ran but the implementation commit was
// not made yet. Pure read — no mutations. Returns:
//   { incomplete: true,  reason: 'archived_impl_uncommitted' }  — crash state, resumable
//   { incomplete: false, reason: 'already_finalized' }          — clean, nothing to resume
//   null                                                         — archive dir absent, not applicable
function archiveDirDirty(root, project) {
  try {
    const out = execFileSync('git', ['-C', root, 'status', '--porcelain', '--', path.join('kaola-workflow', 'archive', project)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().length > 0;
  } catch (_) { return false; }
}
function detectFinalizeIncomplete(root, project) {
  if (!project) return null;
  const archiveDir = path.join(root, 'kaola-workflow', 'archive', project);
  if (!fs.existsSync(archiveDir)) return null;
  if (archiveDirDirty(root, project)) return { incomplete: true, reason: 'archived_impl_uncommitted' };
  return { incomplete: false, reason: 'already_finalized' };
}

function cmdResume() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  const folder = args.project ? activeByProject(root, args.project) : readActiveFolders(root)[0];
  if (!folder) {
    if (args.project) {
      const archiveCheck = detectFinalizeIncomplete(root, args.project);
      if (archiveCheck !== null) {
        if (archiveCheck.incomplete) {
          output({ resumed: true, project: args.project, reason: 'finalize_incomplete', next_command: 'finalize --keep-worktree' });
          return;
        } else {
          output({ resumed: false, reason: 'already_finalized', project: args.project }, 1);
          return;
        }
      }
    }
    output({ resumed: false, reason: 'no active workflow project' }, 1);
    return;
  }
  output({
    resumed: true,
    project: folder.project,
    issue: folder.issue_number,
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
    content = removeLegacyStateBlocks(content);
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
      // #297: reconcile MAIN-repo staged roadmap source. On a worktree run,
      // adaptive-handoff Step 5 creates this file in MAIN and `git add`s it
      // WITHOUT committing (worktree was forked before the file existed on HEAD).
      // fs.unlinkSync above only touches the worktree-local path; the MAIN index
      // still holds a staged ADD that trips sink-merge.js:73 clean check.
      // Must be a git index operation — unlink alone leaves the staged add/delete.
      // Gate: only fire when the file is NOT on MAIN's HEAD (staged-ADD-only orphan
      // case). If it IS on HEAD, the worktree's own archive commit handles deletion
      // on the feature branch; running `git rm --cached` against MAIN would stage a
      // spurious D entry and trip the same sink-merge.js:73 clean check.
      if (mainRoot && mainRoot !== linkedRoot) {
        try {
          const mainRoadmapRel = path.join('kaola-workflow', '.roadmap', 'issue-' + archiveIssueNumber + '.md');
          let onHead = false;
          try {
            execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', 'HEAD:' + mainRoadmapRel],
              { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
            onHead = true;
          } catch (_) { onHead = false; }
          if (!onHead) {
            execFileSync('git', ['-C', mainRoot, 'rm', '--cached', '--force', '--ignore-unmatch', mainRoadmapRel],
              { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
            const mainRoadmapAbs = path.join(mainRoot, mainRoadmapRel);
            try { fs.unlinkSync(mainRoadmapAbs); } catch (e2) { if (e2.code !== 'ENOENT') throw e2; }
          }
        } catch (_) {}
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
      const stateFile = path.join(archiveDest, 'workflow-state.md');
      if (fs.existsSync(stateFile)) {
        const stateContent = fs.readFileSync(stateFile, 'utf8');
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

function cmdFinalize() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  assert(args.project, '--project required');
  const folder = activeByProject(root, args.project);
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
    // When called from a linked worktree with --keep-worktree, commit the archive
    // so the feature branch HEAD no longer has the live folder (required by sink-merge guard).
    let mainRoot2, linkedRoot2;
    try {
      mainRoot2 = fs.realpathSync(mainRootFromCoord(getCoordRoot(root)));
      linkedRoot2 = fs.realpathSync(root);
    } catch (_) { mainRoot2 = null; }
    if (mainRoot2 && mainRoot2 !== linkedRoot2) {
      try {
        execFileSync('git', ['-C', root, 'rm', '-r', '--cached', '--ignore-unmatch', '--', 'kaola-workflow/' + args.project],
          { encoding: 'utf8', stdio: 'inherit' });
        const candidatePaths = ['kaola-workflow/.roadmap', 'kaola-workflow/ROADMAP.md'];
        if (result.dest) candidatePaths.unshift(path.relative(root, result.dest));
        else if (result.skipped === 'source-missing') candidatePaths.unshift(path.join('kaola-workflow', 'archive', args.project));
        const existingPaths = candidatePaths.filter(p => fs.existsSync(path.join(root, p)));
        if (existingPaths.length > 0) {
          execFileSync('git', ['-C', root, 'add', '-A', '--', ...existingPaths],
            { encoding: 'utf8', stdio: 'inherit' });
        }
        execFileSync('git', ['-C', root, 'diff', '--cached', '--quiet'],
          { stdio: 'ignore' });
      } catch (_) {
        execFileSync('git', ['-C', root, 'commit', '-m', 'chore: archive ' + args.project],
          { encoding: 'utf8', stdio: 'inherit' });
      }
    }
  }
  let issueNumber = folder && folder.issue_number;
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
  const claimLabelRemoved = clearAdvisoryClaim(issueNumber, 'finalized', args.project);
  let remoteIssueClosed = 'skipped_offline';
  if (!OFFLINE && issueNumber) {
    try {
      const viewOut = ghExec(['issue', 'view', String(issueNumber), '--json', 'state', '--jq', '.state']);
      remoteIssueClosed = (viewOut && viewOut.trim().toLowerCase() === 'closed') ? 'already_closed' : 'skipped_offline';
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
  // M2 (#277 Phase 2): WARN-FIRST attestation check.
  // archiveProjectDir runs first (line ~863) and renames the live folder to result.dest,
  // so the live cache is gone; check the archive candidate first, then live as fallback.
  const liveCacheDir = path.join(root, 'kaola-workflow', args.project, '.cache');
  const archiveCacheDir = result.dest ? path.join(result.dest, '.cache') : null;
  checkDispatchAttestations([archiveCacheDir, liveCacheDir], closureReceipt);
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
  if (cwdInside(folder.project_dir)) { output({ released: false, reason: 'refusing to discard current working directory' }, 1); return; }

  // Read base_branch BEFORE archiveProjectDir moves the state file.
  let savedBaseBranch = '';
  try { savedBaseBranch = field(fs.readFileSync(folder.state_file, 'utf8'), 'base_branch'); } catch (_) {}

  const result = archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
  try { removeWorktree(root, folder.project, folder); } catch (_) {}

  // In-place branch restore: if this project created a feature branch (NATIVE=0 path),
  // checkout base/default BEFORE deleting the feature branch (git refuses deleting current branch).
  const featureBranch = folder.branch;
  let restoreNote = '';
  if (featureBranch && branchExists(root, featureBranch)) {
    try {
      const cur = inPlaceHead(root);
      const dirty = treeDirty(root);
      const target = savedBaseBranch || defaultBranch(root);
      if (cur === featureBranch) {
        if (dirty) {
          restoreNote = 'tree dirty while on feature branch; skipped base restore + branch delete';
        } else if (target) {
          execFileSync('git', ['-C', root, 'checkout', target], { stdio: ['ignore', 'ignore', 'ignore'] });
          removeBranch(root, featureBranch);
        } else {
          restoreNote = 'no base_branch and no resolvable default; skipped branch delete';
        }
      } else {
        removeBranch(root, featureBranch);
      }
    } catch (_) { /* defensive: discard must not throw */ }
  }

  clearAdvisoryClaim(folder.issue_number, args.reason || 'discarded', folder.project);
  output(Object.assign({ released: true, project: folder.project }, result, restoreNote ? { restore_note: restoreNote } : {}));
}

function cmdStatus() {
  const root = getRoot();
  const all = readActiveFolders(root, { excludeClosedIssues: false });
  const active = [];
  const drift = [];
  for (const folder of all) {
    if (folder.issue_number != null && issueIsClosed(folder.issue_number)) {
      drift.push(folder);
    } else {
      active.push(folder);
    }
  }
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
      const lines = block.split('\n');
      const entry = {};
      for (const line of lines) {
        const idx = line.indexOf(' ');
        if (idx > 0) entry[line.slice(0, idx)] = line.slice(idx + 1);
      }
      return entry;
    }).filter(entry => (entry.branch || '').includes('workflow/issue-'));
  } catch (_) {
    return [];
  }
}

function cmdWorktreeStatus() {
  const root = getRoot();
  output({ worktrees: listWorkflowWorktrees(root) });
}

function collectStale(root) {
  const activeFolders = readActiveFolders(root);
  const activeSet = new Set(activeFolders.map(f => f.issue_number).filter(n => n != null));

  const registeredWorktrees = listWorkflowWorktrees(root);
  const stale_worktrees = [];
  const active_worktrees = [];
  const branchesWithWorktree = new Set();

  for (const wt of registeredWorktrees) {
    const issueNumber = extractIssueNumber(wt.branch);
    if (issueNumber == null) continue;
    branchesWithWorktree.add(wt.branch.replace(/^refs\/heads\//, ''));

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
    const raw = execFileSync('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/workflow/'],
      { encoding: 'utf8' }).trim();
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

function cmdAuditLabels() {
  if (OFFLINE) { output({ stale: [], offline: true }); return; }
  const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
  const stale = raw ? JSON.parse(raw) : [];
  output({ stale, count: stale.length });
}

function cmdRepairLabels() {
  const args = parseArgs(process.argv.slice(3));
  if (OFFLINE) { output({ dry_run: false, offline: true, removed: [], failed: [] }); return; }
  const raw = ghExec(['issue', 'list', '--state', 'closed', '--label', CLAIM_LABEL, '--json', 'number,title,url']);
  const stale = raw ? JSON.parse(raw) : [];
  const dryRun = !args.execute;
  if (dryRun) { output({ dry_run: true, would_remove: stale }); return; }
  const removed = [], failed = [];
  for (const it of stale) {
    try {
      ghExec(['issue', 'edit', String(it.number), '--remove-label', CLAIM_LABEL]);
      removed.push(it.number);
    } catch (_) { failed.push(it.number); }
  }
  output({ dry_run: false, removed, failed });
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
    .replace(/^sink:.*$/m, 'sink: pr')
    .replace(/^last_result:.*$/m, 'last_result: sink_fallback: ' + reason));
  output({ updated: true, project: args.project, sink: 'pr', reason });
}

function cmdWatchPr() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  if (OFFLINE) { output({ watched: 0, offline: true }); return; }
  let watched = 0;
  const warnings = [];
  const cleanups = [];
  for (const folder of readActiveFolders(root, { excludeClosedIssues: false })) {
    if (args.issue && folder.issue_number !== args.issue) continue;
    if (folder.sink !== 'pr' || !folder.pr_url) continue;
    watched++;
    let state = '';
    try {
      const raw = ghExec(['pr', 'view', folder.pr_url, '--json', 'state,number']);
      state = String(JSON.parse(raw).state || '').toUpperCase();
    } catch (_) { continue; }
    if (state === 'MERGED') {
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
      const claimLabelStatus = clearAdvisoryClaim(folder.issue_number, 'pr merged', folder.project);
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_number, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'closed' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        remote_issue_closed: 'skipped_offline',
        claim_label_removed: claimLabelStatus,
        worktree_removed: worktreeRemoved,
        branch_removed: 'kept'
      });
      const liveCacheDir = path.join(root, 'kaola-workflow', folder.project, '.cache');
      const archiveCacheDir = archiveResult && archiveResult.dest ? path.join(archiveResult.dest, '.cache') : null;
      checkDispatchAttestations([archiveCacheDir, liveCacheDir], folderReceipt);
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus, receipt: folderReceipt, closure_invariants: folderInvariants });
    } else if (state === 'CLOSED') {
      const archiveResult = archiveProjectDir(root, folder.project, 'abandoned', '.discarded-' + new Date().toISOString().replace(/[:.]/g, '-'));
      let worktreeRemoved = 'failed';
      try {
        const wtResult = removeWorktree(root, folder.project, folder);
        if (wtResult && wtResult.removed === true) worktreeRemoved = 'removed';
        else if (wtResult && wtResult.removed === false && wtResult.reason === 'missing') worktreeRemoved = 'missing';
        else if (wtResult && wtResult.removed === false) worktreeRemoved = 'failed';
      } catch (_) { worktreeRemoved = 'failed'; }
      const claimLabelStatus = clearAdvisoryClaim(folder.issue_number, 'pr closed', folder.project);
      const folderReceipt = buildClosureReceipt(folder.project, folder.issue_number, {
        archive: archiveResult.skipped ? 'skipped' : (archiveResult.archived ? 'abandoned' : 'failed'),
        roadmap_source_removed: archiveResult ? archiveResult.roadmap_source_removed : 'failed',
        roadmap_regenerated: archiveResult ? archiveResult.roadmap_regenerated : 'failed',
        remote_issue_closed: 'skipped_offline',
        claim_label_removed: claimLabelStatus,
        worktree_removed: worktreeRemoved,
        branch_removed: 'kept'
      });
      const liveCacheDir = path.join(root, 'kaola-workflow', folder.project, '.cache');
      const archiveCacheDir = archiveResult && archiveResult.dest ? path.join(archiveResult.dest, '.cache') : null;
      checkDispatchAttestations([archiveCacheDir, liveCacheDir], folderReceipt);
      const folderInvariants = checkClosureInvariants(root, folderReceipt, archiveResult ? archiveResult.dest : undefined);
      cleanups.push({ folder: folder.project, claim_label_removed: claimLabelStatus, receipt: folderReceipt, closure_invariants: folderInvariants });
    }
  }
  const emit = { watched };
  if (warnings.length > 0) emit.warnings = warnings;
  if (cleanups.length > 0) emit.cleanups = cleanups;
  output(emit);
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

// cmdLegacyWorktreeCleanup — AC3 (#264): discover and remove worktrees that were provisioned
// under the OLD sibling-container path (<parent>/<repo>.kw/<project>). Dedicated subcommand,
// NOT folded into cmdStaleWorktreeCleanup (which targets issue-closed/archived staleness).
// Dry-run is the DEFAULT; real removal only with --execute.
// Never silently destroys dirty worktrees (AC4): requires --archive, --export, or --force.
function cmdLegacyWorktreeCleanup() {
  const root = getRoot();
  const args = parseArgs(process.argv.slice(3));
  // Legacy container is the old sibling path: <parent>/<repo>.kw/
  const legacyContainerDir = path.dirname(legacySiblingWorktreePathFor(root, 'x'));

  // Enumerate ALL registered worktrees (not just workflow/issue-* branches) and
  // filter to those whose path is under the legacy container.
  let allWorktrees = [];
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
    allWorktrees = out.split('\n\n').filter(Boolean).map(block => {
      const lines = block.split('\n');
      const entry = {};
      for (const line of lines) {
        const idx = line.indexOf(' ');
        if (idx > 0) entry[line.slice(0, idx)] = line.slice(idx + 1);
      }
      return entry;
    });
  } catch (_) {}

  // Resolve legacy container to realpath for reliable prefix-match
  let legacyContainerReal = legacyContainerDir;
  try { legacyContainerReal = fs.realpathSync(legacyContainerDir); } catch (_) {}

  const legacyWorktrees = allWorktrees.filter(wt => {
    if (!wt.worktree) return false;
    // Skip the main worktree itself
    let wtReal = wt.worktree;
    try { wtReal = fs.realpathSync(wt.worktree); } catch (_) {}
    return wtReal === legacyContainerReal ||
      wtReal.startsWith(legacyContainerReal + path.sep);
  });

  // Refuse entire run if cwd is inside any candidate legacy worktree
  for (const wt of legacyWorktrees) {
    if (fs.existsSync(wt.worktree) && cwdInside(wt.worktree)) {
      output({ cleanup: false, reason: 'refusing to operate from inside a target legacy worktree: ' + wt.worktree }, 1);
      return;
    }
  }

  const dryRun = !args.execute;
  const buckets = { removed: [], skipped_dirty: [], stashed: [], exported: [], failed_preserve: [] };
  const dryBuckets = { would_remove: [], skipped_dirty: [] };

  for (const wt of legacyWorktrees) {
    const wtPath = wt.worktree;
    const branch = (wt.branch || '').replace(/^refs\/heads\//, '');
    const state = worktreeDirtyState(wtPath);

    if (state === 'dirty' && !(args.archive || args.export || args.force)) {
      (dryRun ? dryBuckets : buckets).skipped_dirty.push(wtPath);
      continue;
    }

    if (dryRun) {
      dryBuckets.would_remove.push(wtPath);
      continue;
    }

    // EXECUTE path
    if (state === 'dirty') {
      if (args.archive) {
        const issueNum = extractIssueNumber(branch) || 0;
        if (stashWorktree(wtPath, issueNum)) {
          buckets.stashed.push(wtPath);
        } else {
          buckets.failed_preserve.push(wtPath);
          continue;
        }
      } else if (args.export) {
        const issueNum = extractIssueNumber(branch) || 0;
        const p = exportWorktreeDiff(root, wtPath, issueNum);
        if (p) {
          buckets.exported.push(...p);
        } else {
          buckets.failed_preserve.push(wtPath);
          continue;
        }
      }
      // --force: straight removal (no pre-step)
    }

    // For missing-path worktrees, prune the stale registration
    if (state === 'missing') {
      try {
        execFileSync('git', ['-C', root, 'worktree', 'prune'], { stdio: ['ignore', 'ignore', 'ignore'] });
      } catch (_) {}
      buckets.removed.push(wtPath);
    } else {
      const rmResult = removeWorktree(root, branch || wtPath, { worktree_path: wtPath });
      if (rmResult.removed) {
        buckets.removed.push(wtPath);
      }
    }
  }

  // After removal, if legacy container is now empty, remove it
  if (!dryRun) {
    try {
      if (fs.existsSync(legacyContainerDir)) {
        fs.rmdirSync(legacyContainerDir); // refuses if non-empty — desired safety
        buckets.removed_container = legacyContainerDir;
      }
    } catch (_) {
      buckets.container_not_empty = legacyContainerDir;
    }
  }

  if (dryRun) {
    output({ dry_run: true, ...dryBuckets });
  } else {
    output({ dry_run: false, ...buckets });
  }
}

function main() {
  const sub = process.argv[2];
  assert(sub, 'usage: kaola-workflow-claim.js <claim|authoring-allowed|release|status|patch-branch|watch-pr|bootstrap|startup|finalize|pick-next|resume|worktree-status|worktree-finalize|sink-fallback|stale-worktree-check|stale-worktree-cleanup|legacy-worktree-cleanup|audit-labels|repair-labels>');
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
  if (sub === 'stale-worktree-check') return cmdStaleWorktreeCheck();
  if (sub === 'stale-worktree-cleanup') return cmdStaleWorktreeCleanup();
  if (sub === 'legacy-worktree-cleanup') return cmdLegacyWorktreeCleanup();
  if (sub === 'worktree-finalize') return cmdWorktreeFinalize();
  if (sub === 'sink-fallback') return cmdSinkFallback();
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
  checkDispatchAttestations,
  claimExplicitTarget,
  claimProject,
  collectStale,
  cmdAuditLabels,
  cmdLegacyWorktreeCleanup,
  cmdRepairLabels,
  cmdStaleWorktreeCleanup,
  deriveRunPosture,
  getCoordRoot,
  legacySiblingWorktreePathFor,
  projectNameForIssue,
  provisionWorktree,
  readActiveFolders,
  readPriorityConfig,
  removeWorktree,
  worktreePathFor
};
