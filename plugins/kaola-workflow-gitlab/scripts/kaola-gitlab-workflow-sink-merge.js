#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitlab-forge');
const { getCoordRoot, readActiveFolders, removeWorktree } = require('./kaola-gitlab-workflow-claim');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10);

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function getRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_) {
    return process.cwd();
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
  }
  return args;
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':\\s*(.+)$', 'm'));
  return match ? match[1].trim() : '';
}

function resolveProjectFile(root, project, basename) {
  const live = path.join(root, 'kaola-workflow', project, basename);
  if (fs.existsSync(live)) return live;
  const archived = path.join(root, 'kaola-workflow', 'archive', project, basename);
  if (fs.existsSync(archived)) return archived;
  return live; // let caller's try/catch handle missing
}

function readProjectInfo(root, project) {
  const stateFile = resolveProjectFile(root, project, 'workflow-state.md');
  let content = '';
  try { content = fs.readFileSync(stateFile, 'utf8'); } catch (_) {}
  return {
    project_id: Number(field(content, 'project_id')) || null,
    path_with_namespace: field(content, 'path_with_namespace'),
    web_url: field(content, 'project_web_url')
  };
}

function finalValidationPassed(root, project) {
  const summaryFile = resolveProjectFile(root, project, 'phase6-summary.md');
  let summary = '';
  try { summary = fs.readFileSync(summaryFile, 'utf8'); } catch (_) { return false; }
  return /Final Validation/i.test(summary) && /pass/i.test(summary) && !/blocked|failed/i.test(summary);
}

function assertCleanWorktree(gitExec) {
  const status = gitExec('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  assert(!status, 'Worktree must be clean before direct merge sink runs');
}

function assertNoLiveWorkflowFolder(mainRoot, project) {
  const gitPath = 'kaola-workflow/' + project + '/workflow-state.md';
  let committed = false;
  try {
    execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', 'HEAD:' + gitPath],
      { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
    committed = true;
  } catch (_) {
    committed = false;
  }
  if (committed) {
    throw new Error(
      'sink-merge refused: kaola-workflow/' + project + '/workflow-state.md still exists on branch HEAD.\n' +
      'Run finalize before sink-merge, then recommit. Two remediation paths:\n' +
      '  Path A (worktree available): cd <worktree> && node <claim.js> finalize --project ' + project + ' --keep-worktree\n' +
      '    then git add kaola-workflow/ && git commit -m "chore: archive ' + project + '" on the feature branch\n' +
      '  Path B (worktree gone): git rm -r kaola-workflow/' + project + '/ on the feature branch, commit, then re-run sink-merge'
    );
  }
}

function assertBranchPushedToUpstream(mainRoot, branch) {
  let upstream;
  try {
    upstream = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', branch + '@{u}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    throw new Error(
      "Branch '" + branch + "' has no upstream tracking ref.\n" +
      'Push and set upstream before merging: git push -u origin ' + branch
    );
  }
  const ahead = parseInt(
    execFileSync('git', ['-C', mainRoot, 'rev-list', '--count', upstream + '..' + branch], { encoding: 'utf8' }).trim(),
    10
  );
  if (!ahead) return;
  const commits = execFileSync('git', ['-C', mainRoot, 'log', '--format=%h %s', '-n', '5', upstream + '..' + branch],
    { encoding: 'utf8' }).trim();
  throw new Error(
    "Branch '" + branch + "' has " + ahead + " unpushed commit(s) ahead of '" + upstream + "'.\n" +
    'Push before merging: git push origin ' + branch + '\n\n' +
    'Unpushed commits:\n  ' + commits.split('\n').join('\n  ')
  );
}

function fastForwardMain(args, opts) {
  const options = opts || {};
  const gitExec = options.gitExec || execFileSync;
  if (options.skipGit) return;
  // single-pass merge (legacy only)
  gitExec('git', ['fetch', 'origin'], { encoding: 'utf8' });
  assertCleanWorktree(gitExec);
  gitExec('git', ['checkout', args.branch], { encoding: 'utf8' });
  gitExec('git', ['rebase', 'origin/main'], { encoding: 'utf8' });
  gitExec('git', ['checkout', 'main'], { encoding: 'utf8' });
  gitExec('git', ['pull', '--ff-only'], { encoding: 'utf8' });
  gitExec('git', ['merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
  gitExec('git', ['push', 'origin', 'main'], { encoding: 'utf8' });
}

function closeLinkedIssue(root, project, issueIid, opts) {
  const options = opts || {};
  if (issueIid == null) return null;
  assert(finalValidationPassed(root, project), 'Final validation evidence is required before closing the linked GitLab issue');
  const projectInfo = options.projectInfo || readProjectInfo(root, project);
  const note = forge.createIssueNote(projectInfo, issueIid, 'Merged via GitLab direct merge sink after final validation passed.');
  const closed = forge.closeIssue(issueIid);
  try { forge.updateIssue(issueIid, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
  return { note_id: note && note.id, issue: closed };
}

function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}

function classifyMergeError(e) {
  const token = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE;
  if (token) return token;
  const msg = (e.stderr || e.message || '');
  if (/permission denied|403|not authorized|not allowed to push|not allowed to merge/i.test(msg)) return 'permission_denied';
  if (/protected branch|pre-receive hook declined/i.test(msg)) return 'branch_protected';
  if (/rejected/.test(msg) && /non-fast-forward/.test(msg)) return 'non_fast_forward';
  if (/conflicts with target/i.test(msg)) return 'non_fast_forward';
  return null;
}

const MAX_AUTOMERGE_RETRIES = 3;

function doRebase(args, alreadyUpToDate, mainRoot) {
  if (!alreadyUpToDate) {
    try {
      execFileSync('git', ['-C', mainRoot, 'rebase', 'origin/main'], { encoding: 'utf8' });
    } catch (e) {
      try { execFileSync('git', ['-C', mainRoot, 'rebase', '--abort'], { encoding: 'utf8' }); } catch (_) {}
      throw new Error(
        'Rebase failed: ' + e.message + '\n' +
        'Remediation:\n' +
        '  1. Run: git rebase --abort\n' +
        '  2. Resolve conflicts manually on the feature branch\n' +
        '  3. Re-run: git rebase origin/main\n' +
        '  4. Re-invoke sink-merge after conflicts are resolved'
      );
    }
  }
  if (!alreadyUpToDate && !OFFLINE) {
    execFileSync('npm', ['test'], { cwd: mainRoot, encoding: 'utf8', stdio: 'inherit' });
  }
}

function ffMergeLoop(args, mainRoot) {
  let retries = 0;
  let forcedFailCount = 0;
  while (true) {
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'pull', '--ff-only'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
    }
    execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' });
    if (forcedFailCount < FORCE_FF_FAIL) {
      forcedFailCount++;
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) {
        process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
        return false;
      }
      continue;
    }
    try {
      execFileSync('git', ['-C', mainRoot, 'merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
      return true;
    } catch (_) {
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) {
        process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
        return false;
      }
    }
  }
}

function postMergeCleanup(args, mainRoot) {
  // Step 7 — Push (with merge-impossible fallback)
  try {
    if (process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE) {
      throw new Error('synthetic merge-impossible: ' + process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE);
    }
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'push', 'origin', 'main'], { encoding: 'utf8' });
    }
  } catch (e) {
    const token = classifyMergeError(e);
    if (token === null) throw e;
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' });
    } catch (_) {}
    // AND (same rationale as runDirectMerge early-exit): atomic rename means both dirs
    // cannot co-exist; defense-in-depth guard for the post-merge cleanup receipt write.
    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
    const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
    if (!fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir)) {
      process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
      return { exitCode: 3 };
    }
    const receiptPath = path.join(liveProjectDir, '.cache', 'sink-fallback.json');
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify({
      project: args.project,
      branch: args.branch,
      issue_number: args.issue != null ? args.issue : null,
      reason: token,
      timestamp: new Date().toISOString()
    }, null, 2) + '\n');
    return { exitCode: 3 };
  }
  // Step 8 — Close issue (GitLab-specific: forge API)
  if (!OFFLINE && args.issue != null) {
    const root = mainRoot; // mainRoot is used as root context
    try { forge.createIssueNote(readProjectInfo(root, args.project), args.issue, 'Merged via GitLab direct merge sink.'); } catch (_) {}
    try { forge.closeIssue(args.issue); } catch (_) {}
    try { forge.updateIssue(args.issue, { unlabels: [forge.CLAIM_LABEL] }); } catch (_) {}
  }
  // Step 9 — Delete branch
  try { execFileSync('git', ['-C', mainRoot, 'branch', '-d', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  if (!OFFLINE) {
    try { execFileSync('git', ['-C', mainRoot, 'push', 'origin', '--delete', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  }
}

function runDirectMerge(args, opts) {
  const options = opts || {};
  assert(
    args.branch && args.branch !== 'TBD' &&
    !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid or TBD'
  );
  assert(args.project && isSafeName(args.project), '--project must be a safe folder name');
  if (args.issue != null) assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  const root = options.root || getRoot();
  assert(finalValidationPassed(root, args.project), 'Final validation evidence is required before direct merge sink runs');

  if (options.skipGit) {
    // Legacy path (existing tests use this)
    fastForwardMain(args, options);
    const closeResult = closeLinkedIssue(root, args.project, args.issue, options);
    return { merged: true, close: closeResult };
  }

  // New pipeline
  const mainRoot = mainRootFromCoord(getCoordRoot(root));

  // Early-exit: if project is already archived, return exit 3 without touching git.
  // AND (not OR): live dir present means project is not yet archived; archiveProjectDir
  // uses fs.renameSync so both dirs co-existing is an impossible/transient state.
  const _liveDir = path.join(mainRoot, 'kaola-workflow', args.project);
  const _archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
  if (!fs.existsSync(_liveDir) && fs.existsSync(_archiveDir)) {
    process.stderr.write('sink-merge: project archived (' + args.project + '), skipping merge\n');
    return { exitCode: 3 };
  }

  // Step 0 — Register exit hook FIRST, then chdir + removeWorktree
  process.on('exit', () => {
    try { process.chdir(mainRoot); } catch (_) {}
    if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
      try {
        const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
        if (fs.existsSync(path.dirname(_p))) fs.writeFileSync(_p, process.cwd());
      } catch (_) {}
    }
  });
  try { process.chdir(os.tmpdir()); } catch (e) {
    process.stderr.write('sink-merge: could not chdir before worktree removal: ' + e.message + '\n');
  }
  let folder;
  try { folder = readActiveFolders(mainRoot, { excludeClosedIssues: false }).find(item => item.project === args.project); } catch (_) {}
  try { removeWorktree(mainRoot, args.project, folder); } catch (_) {}

  // Step 1 — Fetch
  if (!OFFLINE) {
    execFileSync('git', ['-C', mainRoot, 'fetch', 'origin'], { encoding: 'utf8' });
  }

  const status = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  assert(!status, 'Worktree must be clean before direct merge sink runs');

  // Checkout branch
  execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
  assertNoLiveWorkflowFolder(mainRoot, args.project);
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);

  // Step 2 — Merge-base skip-check (try-catch: if origin/main absent, treat as up-to-date)
  let alreadyUpToDate = false;
  try {
    const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8' }).trim();
    const originMain = execFileSync('git', ['-C', mainRoot, 'rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
    alreadyUpToDate = (mergeBase === originMain);
  } catch (_) {
    alreadyUpToDate = true;
  }

  doRebase(args, alreadyUpToDate, mainRoot);

  if (!ffMergeLoop(args, mainRoot)) {
    return { exitCode: 2 };
  }

  const cleanupResult = postMergeCleanup(args, mainRoot);
  if (cleanupResult && cleanupResult.exitCode === 3) {
    return { exitCode: 3 };
  }

  return { merged: true };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runDirectMerge(args);
  if (result && result.exitCode != null) {
    process.exitCode = result.exitCode;
  }
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = {
  classifyMergeError,
  closeLinkedIssue,
  fastForwardMain,
  finalValidationPassed,
  runDirectMerge
};
