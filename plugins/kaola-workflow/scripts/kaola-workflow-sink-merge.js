#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getCoordRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, checkDispatchAttestations } = require('./kaola-workflow-claim.js');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10);
const FORCE_MERGE_IMPOSSIBLE = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE || '';
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function isSafeName(name) {
  return typeof name === 'string' && name.length > 0 &&
    !name.includes('/') && !name.includes('\\') &&
    !name.includes('\0') && name !== '.' && name !== '..';
}

function ghExec(args, opts) {
  if (OFFLINE) return '';
  const mock = process.env.KAOLA_GH_MOCK_SCRIPT;
  if (mock) return execFileSync(process.execPath, [mock, ...args], Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
  return execFileSync('gh', args, Object.assign({ encoding: 'utf8', timeout: REMOTE_TIMEOUT_MS }, opts || {})).trim();
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

function mainRootFromCoord(coordRoot) {
  return path.basename(coordRoot) === '.git' ? path.dirname(coordRoot) : coordRoot;
}

function classifyMergeError(stderr) {
  if (FORCE_MERGE_IMPOSSIBLE) {
    process.stderr.write('[TEST ONLY] KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE=' + FORCE_MERGE_IMPOSSIBLE + ' — push bypassed\n');
    return FORCE_MERGE_IMPOSSIBLE;
  }
  if (/protected branch|GH006/i.test(stderr)) return 'branch_protected';
  if (/rejected/.test(stderr) && /non-fast-forward/.test(stderr)) return 'non_fast_forward';
  if (/permission denied|403|not authorized/i.test(stderr)) return 'permission_denied';
  if (/conflicts with target/i.test(stderr)) return 'non_fast_forward';
  return null;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--branch' && argv[i + 1]) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1]) { args.issue = parseInt(argv[++i], 10); continue; }
    if (argv[i] === '--project' && argv[i + 1]) { args.project = argv[++i]; continue; }
    if (argv[i] === '--keep-issue-open') { args.keepIssueOpen = true; continue; } // #336
  }
  return args;
}

const MAX_AUTOMERGE_RETRIES = 3;

function assertCleanWorktree(mainRoot) {
  // Use --untracked-files=no to ignore untracked files (e.g. kaola-workflow/ state dirs)
  // Only staged and unstaged changes to tracked files block the checkout.
  const status = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  assert(!status, 'Worktree must be clean before sink-merge checks out the requested branch');
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

function assertBranchHasNonWorkflowChanges(mainRoot, branch) {
  // AC7 (#264): refuse a sink whose entire diff vs origin/main is kaola-workflow/** bookkeeping —
  // the branch carries no implementation. Skip when origin/main is unresolvable (mirror
  // alreadyUpToDate: no integration base to diff against → cannot judge, do not block).
  let base;
  try {
    base = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--verify', 'origin/main'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return; } // origin/main missing → skip (same posture as merge-base skip-check)
  let files;
  try {
    const out = execFileSync('git', ['-C', mainRoot, 'diff', '--name-only', base + '...' + branch],
      { encoding: 'utf8' });
    files = out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (_) { return; } // diff failed → do not fabricate a refusal
  if (files.length === 0) return; // no changes at all — leave to the existing up-to-date / FF logic
  const allWorkflow = files.every(f => f.startsWith('kaola-workflow/'));
  if (allWorkflow) {
    throw new Error(
      'sink-merge refused: branch ' + branch + ' has no implementation changes beyond origin/main.\n' +
      'Every changed file is a kaola-workflow/** workflow artifact:\n  ' + files.join('\n  ') + '\n' +
      'A workflow branch must carry the implementation it claims to deliver. If this is intentional\n' +
      '(docs/roadmap-only change), include the real changed files in the final commit before sinking.'
    );
  }
}

function assertBranchPushedToUpstream(mainRoot, branch) {
  let upstream;
  try {
    upstream = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', branch + '@{u}'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {
    // #323: a worktree-native run can reach the sink with a local-only workflow branch that was
    // never pushed. Self-heal: push + set upstream, then return — after `push -u` the branch is at
    // parity with its new upstream, so the ahead-count check below has nothing to do. Fail-CLOSED:
    // if the push fails (e.g. no `origin` remote), re-throw the original guidance so an un-backed-up
    // branch is never silently merged.
    try {
      execFileSync('git', ['-C', mainRoot, 'push', '-u', 'origin', branch], { encoding: 'utf8' });
      return;
    } catch (pushErr) {
      throw new Error(
        "Branch '" + branch + "' has no upstream tracking ref, and `git push -u origin " + branch + "` failed.\n" +
        'Push and set upstream before merging: git push -u origin ' + branch + '\n' +
        'Underlying push error: ' + (pushErr && pushErr.message ? pushErr.message : String(pushErr))
      );
    }
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

// Steps 3–4: rebase onto origin/main and run post-rebase tests.
function doRebase(args, alreadyUpToDate, mainRoot) {
  // Step 3 — Rebase (inline error message; no external file needed)
  if (!alreadyUpToDate) {
    try {
      execFileSync('git', ['-C', mainRoot, 'rebase', 'origin/main'], { encoding: 'utf8' });
    } catch (e) {
      throw new Error(
        'Rebase failed: ' + e.message + '\n' +
        'Remediation:\n' +
        '  1. Run: git rebase --abort\n' +
        '  2. Resolve conflicts manually on the feature branch\n' +
        '  3. Re-run: git rebase origin/main\n' +
        '  4. Re-invoke sink-merge after conflicts are resolved\n' +
        'For further guidance, see the conflict remediation section in ' +
        'https://github.com/kaolabrother/Kaola-Workflow/blob/main/README.md'
      );
    }
  }

  // Step 4 — Post-rebase validation
  // Skip when OFFLINE (mirrors Steps 1/5/7/8/9 — C-refined-A). Callers in OFFLINE mode own their own validation.
  if (!alreadyUpToDate && !OFFLINE) {
    execFileSync('npm', ['test'], { cwd: mainRoot, encoding: 'utf8', stdio: 'inherit' });
  }
}

// Steps 5–6: FF-only merge loop with retry on race. Returns false when retries exhausted.
function ffMergeLoop(args, mainRoot) {
  let retries = 0;
  let forcedFailCount = 0;
  while (true) {
    // Step 5 — Pull latest main (skip if OFFLINE)
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'pull', '--ff-only'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
    }

    // Step 6 — FF-only merge onto main
    execFileSync('git', ['-C', mainRoot, 'checkout', 'main'], { encoding: 'utf8' });

    // FORCE_FF_FAIL: test-only — make first FORCE_FF_FAIL attempts fail without calling git merge
    if (forcedFailCount < FORCE_FF_FAIL) {
      forcedFailCount++;
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) {
        process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
        process.stderr.write('Manual resolution: ensure no concurrent pushes to main and re-run sink-merge.\n');
        return false;
      }
      continue;
    }

    let mergeSuccess = false;
    try {
      execFileSync('git', ['-C', mainRoot, 'merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
      mergeSuccess = true;
    } catch (_) {
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) {
        process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
        process.stderr.write('Manual resolution: ensure no concurrent pushes to main and re-run sink-merge.\n');
        return false;
      }
      continue;
    }

    if (mergeSuccess) return true;
  }
}

function postMergeCleanup(args, mainRoot, wtRemovedStatus) {
  // Step 7 — Push (with merge-impossible auto-fallback)
  try {
    if (FORCE_MERGE_IMPOSSIBLE) {
      throw new Error('synthetic merge-impossible: ' + FORCE_MERGE_IMPOSSIBLE);
    }
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'push', 'origin', 'main'], { encoding: 'utf8' });
    }
  } catch (e) {
    const token = classifyMergeError(e.stderr || e.message || '');
    if (token === null) {
      // Transient / unclassified error — re-throw, caller exits 1
      throw e;
    }
    // Classified merge-impossible: reset local main, write receipt (skipped when project was already archived), signal exit 3
    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
    const archiveProjectDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
    const wasArchived = !fs.existsSync(liveProjectDir) && fs.existsSync(archiveProjectDir);
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/main'], { encoding: 'utf8' });
    } catch (_) {}
    if (wasArchived) {
      process.stderr.write('sink-merge: project archived (' + args.project + '), skipping receipt write\n');
      return { exitCode: 3 };
    }
    const receiptPath = path.join(
      mainRoot,
      'kaola-workflow', args.project, '.cache', 'sink-fallback.json'
    );
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(
      receiptPath,
      JSON.stringify({
        project: args.project,
        branch: args.branch,
        issue_number: args.issue || null,
        reason: token,
        timestamp: new Date().toISOString()
      }, null, 2) + '\n'
    );
    return { exitCode: 3 };
  }
  // Success path — track cleanup outcomes for closure receipt
  let remoteIssueClosed = OFFLINE ? 'skipped_offline' : 'failed';
  let claimLabelRemoved = OFFLINE ? 'skipped_offline' : 'failed';
  let branchRemoved = 'failed';
  const worktreeRemoved = wtRemovedStatus || 'failed';

  // Step 8 — Close issue (or, on a keep-open run, comment WITHOUT closing)
  // #336: keep-open consistency guard — never close an issue whose archived state says
  // keep-open, even when the flag was not passed. The FF merge already put the archived
  // state on main's HEAD/working tree, which is exactly where postMergeCleanup executes; an
  // accidental close of a keep-open issue is the one irreversible step, hence defense-in-depth.
  let keepIssueOpen = !!args.keepIssueOpen;
  if (!keepIssueOpen && args.issue != null) {
    try {
      const archivedState = fs.readFileSync(path.join(mainRoot, 'kaola-workflow', 'archive', args.project, 'workflow-state.md'), 'utf8');
      if (/^issue_action:\s*comment_keep_open\s*$/m.test(archivedState)) {
        keepIssueOpen = true;
        process.stderr.write('sink-merge: honoring archived issue_action: comment_keep_open (flag not passed) — issue ' + args.issue + ' will NOT be closed\n');
      }
    } catch (_) {}
  }
  if (keepIssueOpen) remoteIssueClosed = 'kept_open';
  if (!OFFLINE && args.issue != null) {
    const forgeOpts = { cwd: mainRoot };
    if (keepIssueOpen) {
      // #336: mechanical keep-open comment. The body deliberately contains no
      // close/fix/resolve #N substring (would auto-close the issue on forges that scan it).
      try { ghExec(['issue', 'comment', String(args.issue), '--body', 'Merged via sink-merge. Issue intentionally kept open (partial-close terminal); residual scope remains tracked here.'], forgeOpts); }
      catch (_) { /* best-effort; decision token already recorded */ }
    } else {
      try { ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.'], forgeOpts); remoteIssueClosed = 'closed'; }
      catch (e) { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: gh issue close ' + args.issue + '\n'); }
    }
    // Claim-label removal runs in BOTH modes (claim release is wanted on keep-open).
    try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress'], forgeOpts); claimLabelRemoved = 'removed'; } catch (_) { claimLabelRemoved = 'failed'; }
  }
  // Step 9 — Delete branch (worktree was removed in step 0)
  try { execFileSync('git', ['-C', mainRoot, 'branch', '-d', '--', args.branch], { encoding: 'utf8' }); branchRemoved = 'removed'; } catch (_) { branchRemoved = 'failed'; }
  if (!OFFLINE) {
    try { execFileSync('git', ['-C', mainRoot, 'push', 'origin', '--delete', '--', args.branch], { encoding: 'utf8' }); }
    catch (_) {}
  }

  // Emit closure receipt
  const archiveDest = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
  const archiveField = fs.existsSync(archiveDest) ? 'closed' : 'failed';
  const roadmapSourceFile = path.join(mainRoot, 'kaola-workflow', '.roadmap', 'issue-' + args.issue + '.md');
  // #336: keep-open inverts the existence test — the source MUST survive ('kept'), else 'failed'.
  const roadmapSourceField = keepIssueOpen
    ? (fs.existsSync(roadmapSourceFile) ? 'kept' : 'failed')
    : (!fs.existsSync(roadmapSourceFile) ? 'absent' : 'failed');

  const receipt = buildClosureReceipt(args.project, args.issue, {
    archive: archiveField,
    roadmap_source_removed: roadmapSourceField,
    roadmap_regenerated: 'skipped',
    remote_issue_closed: remoteIssueClosed,
    claim_label_removed: claimLabelRemoved,
    worktree_removed: worktreeRemoved,
    branch_removed: branchRemoved
  });
  // M2 (#280): WARN-FIRST dispatch attestation check, archive-first (matching cmdFinalize).
  // cmdFinalize archives .cache/ before sink-merge runs, so the live path is absent;
  // check archive candidate first, then live as fallback. emptyReceipt 'failed' defaults
  // are overwritten here so a real dispatch-log (with both lines) yields 'attested'.
  checkDispatchAttestations([
    path.join(archiveDest, '.cache'),
    path.join(mainRoot, 'kaola-workflow', args.project, '.cache')
  ], receipt);
  const invariants = checkClosureInvariants(mainRoot, receipt, archiveDest);
  process.stdout.write(JSON.stringify({ status: 'merged', closure_receipt: receipt, closure_invariants: invariants }) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(
    args.branch && args.branch !== 'TBD' &&
    !args.branch.startsWith('-') && !args.branch.includes('\0') &&
    args.branch !== '.' && args.branch !== '..',
    '--branch is invalid or TBD'
  );
  assert(args.project && isSafeName(args.project), '--project must be a safe folder name');
  if (args.issue != null) {
    assert(Number.isFinite(args.issue) && args.issue > 0, '--issue must be a positive integer');
  }
  // #336: keep-open is meaningless without an issue to keep open.
  assert(!args.keepIssueOpen || args.issue != null,
    'sink-merge: --keep-issue-open requires --issue N (there is no issue to keep open)');

  // Step 0 — Remove worktree (if any) so the branch can be checked out below
  const coordRoot = getCoordRoot();
  const mainRoot = mainRootFromCoord(coordRoot);
  let wtRemovedStatus = 'failed';
  process.on('exit', () => {
    try { process.chdir(mainRoot); } catch (_) {}
    if (process.env.KAOLA_WORKFLOW_DEBUG_CWD) {
      try {
        const _p = process.env.KAOLA_WORKFLOW_DEBUG_CWD;
        if (fs.existsSync(path.dirname(_p))) fs.writeFileSync(_p, process.cwd());
      } catch (_) {}
    }
  });
  {
    // Pre-chdir to a path OUTSIDE any worktree before removeWorktree:
    // `git worktree remove` refuses when cwd is inside the worktree being removed.
    // We chdir to tmpdir (not mainRoot) so that every subsequent git call must
    // pass `-C mainRoot` explicitly — otherwise it operates on a non-repo cwd
    // and fails fast. Keeps the script's cwd-independence under test.
    try { process.chdir(os.tmpdir()); } catch (e) {
      process.stderr.write('sink-merge: could not chdir before worktree removal: ' + e.message + '\n');
    }

    const folder = readActiveFolders(mainRoot, { excludeClosedIssues: false })
      .find(item => item.project === args.project);
    // Always attempt removeWorktree — even when folder is archived (not found in active folders),
    // the worktree may still be registered. removeWorktree falls back to worktreePathFor when
    // folder is undefined, which computes the canonical sibling .kw path and removes it.
    let wtResult;
    try { wtResult = removeWorktree(mainRoot, args.project, folder); } catch (_) {}
    if (wtResult) {
      if (wtResult.removed === true) wtRemovedStatus = 'removed';
      else if (wtResult.removed === false && wtResult.reason === 'missing') wtRemovedStatus = 'missing';
      else wtRemovedStatus = 'failed';
    }
  }

  // Step 1 — git fetch (skip if OFFLINE; fatal throw on error)
  if (!OFFLINE) {
    execFileSync('git', ['-C', mainRoot, 'fetch', 'origin'], { encoding: 'utf8' });
  }

  assertCleanWorktree(mainRoot);
  execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
  assertNoLiveWorkflowFolder(mainRoot, args.project);
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);
  if (!OFFLINE) assertBranchHasNonWorkflowChanges(mainRoot, args.branch);

  // Step 2 — Merge-base skip-check
  // If origin/main doesn't exist (e.g. no remote, or OFFLINE with no cached ref),
  // treat as already up-to-date so the rebase is skipped.
  let alreadyUpToDate = false;
  try {
    const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', 'origin/main'],
      { encoding: 'utf8' }).trim();
    const originMain = execFileSync('git', ['-C', mainRoot, 'rev-parse', 'origin/main'],
      { encoding: 'utf8' }).trim();
    alreadyUpToDate = (mergeBase === originMain);
  } catch (_) {
    // origin/main not resolvable — treat as up-to-date (no drift to rebase against)
    alreadyUpToDate = true;
  }

  doRebase(args, alreadyUpToDate, mainRoot);

  if (!ffMergeLoop(args, mainRoot)) {
    process.exitCode = 2;
    return;
  }

  const cleanupResult = postMergeCleanup(args, mainRoot, wtRemovedStatus);
  if (cleanupResult && cleanupResult.exitCode === 3) { process.exitCode = 3; return; }
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges };
