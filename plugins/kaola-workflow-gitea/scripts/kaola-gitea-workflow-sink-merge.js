#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
const { getCoordRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, checkDispatchAttestations, defaultBranch } = require('./kaola-gitea-workflow-claim');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10);
// #496/#497: test-only fault injection — force the worktree-clean status probe / push_main to throw.
const FORCE_WT_STATUS_FAIL = process.env.KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL === '1';
const FORCE_PUSH_MAIN_FAIL = process.env.KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL === '1';
const SKIP_TESTGATE = process.env.KAOLA_WORKFLOW_SKIP_TESTGATE === '1'; // #350 test-only
const FF_RACE_PUSH_DIR = process.env.KAOLA_WORKFLOW_FF_RACE_PUSH_DIR || ''; // #350 test-only

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

// #476: the closed allowlist of recognized flags. A `-`-prefixed token outside this set is an
// UNRECOGNIZED flag — recorded for a typed unknown_flag refusal (zero mutation) in main(), never
// silently dropped (a dropped flag used to let this destructive script run a full merge+close+delete).
const KNOWN_FLAGS = new Set(['--branch', '--issue', '--issue-numbers', '--project', '--keep-issue-open', '--sink', '--json', '--root', '--help', '-h']);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    // #476: --help/-h is a SAFE no-op (main() prints usage + exits 0 with zero side effects).
    if (argv[i] === '--help' || argv[i] === '-h') { args.help = true; continue; }
    // --sink (#429) is a boolean mode flag read by main() via rawArgv.includes; record it so it is a
    // RECOGNIZED flag here too (else the unknown-flag guard below would false-reject the sink transaction).
    if (argv[i] === '--sink') { args.sink = true; continue; }
    if (argv[i] === '--branch' && argv[i + 1] && !argv[i + 1].startsWith('-')) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1] && !argv[i + 1].startsWith('-')) { args.issue = parseInt(argv[++i], 10); continue; }
    // #369: bundle member set — all-or-nothing closure closes EVERY member, not just --issue.
    // #396.5: dedupe (sorted + unique) so a duplicate member can't land in two buckets.
    if (argv[i] === '--issue-numbers' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      const nums = argv[++i].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
      args.issueNumbers = Array.from(new Set(nums)).sort((a, b) => a - b);
      continue;
    }
    if (argv[i] === '--project' && argv[i + 1] && !argv[i + 1].startsWith('-')) { args.project = argv[++i]; continue; }
    if (argv[i] === '--keep-issue-open') { args.keepIssueOpen = true; continue; } // #336
    // #476: any other `-`-prefixed token that is NOT a recognized flag is unknown. A known flag missing
    // its value (e.g. a bare `--branch`) is NOT flagged here (it is in KNOWN_FLAGS) — it fails its own
    // validation later; only genuinely-unrecognized flags are recorded.
    if (argv[i].startsWith('-') && argv[i] !== '-' && !KNOWN_FLAGS.has(argv[i])) {
      (args.unknownFlags || (args.unknownFlags = [])).push(argv[i]);
      continue;
    }
  }
  return args;
}

// #396.5: returns true iff issue N is already CLOSED on the forge. Any probe error returns false.
function probeIssueClosed(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const st = forge.viewIssue(issueNumber, opts || {});
    return String((st && st.state) || '').toLowerCase() === 'closed';
  } catch (_) { return false; }
}

// #393a: derive the bundle member set when --issue-numbers is ABSENT (flag was caller-trust-only).
function readStateIssueNumbers(mainRoot, project) {
  const candidates = [
    path.join(mainRoot, 'kaola-workflow', project, 'workflow-state.md'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, 'workflow-state.md'),
  ];
  for (const f of candidates) {
    let raw = '';
    try { raw = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const m = raw.match(/^issue_numbers:\s*(.+)\s*$/m);
    if (!m) continue;
    const nums = m[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
    if (nums.length) return Array.from(new Set(nums)).sort((a, b) => a - b);
  }
  return null;
}

function deriveMemberSet(mainRoot, project, cliIssueNumbers) {
  const fromFlag = Array.isArray(cliIssueNumbers) && cliIssueNumbers.length ? cliIssueNumbers : null;
  const fromState = readStateIssueNumbers(mainRoot, project);
  if (fromFlag) {
    if (fromState && fromState.join(',') !== fromFlag.join(',')) {
      process.stderr.write('sink-merge: WARNING: --issue-numbers (' + fromFlag.join(',') +
        ') differs from state issue_numbers (' + fromState.join(',') + ') — flag wins.\n');
      return { members: fromFlag, source: 'flag', mismatch: true };
    }
    return { members: fromFlag, source: 'flag', mismatch: false };
  }
  if (fromState) {
    process.stderr.write('sink-merge: --issue-numbers absent — derived bundle member set from state: ' + fromState.join(',') + '\n');
    return { members: fromState, source: 'state_fallback', mismatch: false };
  }
  return { members: [], source: 'none', mismatch: false };
}

function field(content, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp('^' + escaped + ':[ \\t]*(.+)$', 'm'));
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
  const full_name = field(content, 'full_name');
  const html_url = field(content, 'project_html_url');
  if (full_name) return { full_name, html_url };
  // Fallback: discover from git remote — MUST be wrapped in try/catch
  try { return forge.discoverProject(); } catch (_) { return { full_name: '', html_url: '' }; }
}

function finalValidationPassed(root, project) {
  const summaryFile = resolveProjectFile(root, project, 'finalization-summary.md');
  let summary = '';
  try { summary = fs.readFileSync(summaryFile, 'utf8'); } catch (_) { return false; }
  return /Final Validation/i.test(summary) && /pass/i.test(summary) && !/blocked|failed/i.test(summary);
}

function assertCleanWorktree(gitExec) {
  const status = gitExec('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  assert(!status, 'Worktree must be clean before direct merge sink runs');
}

function assertNoLiveWorkflowFolder(mainRoot, project, branch) {
  const gitPath = 'kaola-workflow/' + project + '/workflow-state.md';
  // #346: scope the probe to the BRANCH tip (was `HEAD:`) so this precondition can run BEFORE
  // the destructive worktree removal + checkout. After checkout HEAD === branch, so `<branch>:`
  // is equivalent to the old `HEAD:` form; before checkout it correctly inspects the branch.
  const ref = (branch ? branch : 'HEAD') + ':' + gitPath;
  let committed = false;
  try {
    execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', ref],
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

// #346: refuse — with ZERO mutation — when the linked worktree that has `branch` checked out
// carries uncommitted work. Step 0 used to `removeWorktree --force` BEFORE the preconditions, so a
// sink about to refuse first DESTROYED the worktree and any uncommitted work in it. This guard runs
// before the destructive removal so a refused sink leaves the worktree (and its file) intact.
function assertWorktreeClean(mainRoot, branch) {
  let list;
  try {
    list = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  } catch (_) {
    return;
  }
  for (const block of list.split(/\n\n+/)) {
    const pathLine = block.match(/^worktree (.+)$/m);
    const branchLine = block.match(/^branch refs\/heads\/(.+)$/m);
    if (!pathLine || !branchLine || branchLine[1] !== branch) continue;
    const wt = pathLine[1];
    // #496: the ONLY gate before a destructive worktree removal — fail CLOSED. A probe that cannot
    // PROVE the worktree clean (transient git fault) is treated as DIRTY, never swallowed as clean.
    // One bounded retry absorbs a momentary fault before refusing.
    let status = '';
    let probeErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (FORCE_WT_STATUS_FAIL) throw new Error('[TEST ONLY] KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL — status probe forced to fail');
        status = execFileSync('git', ['-C', wt, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
        probeErr = null;
        break;
      } catch (e) {
        probeErr = e;
      }
    }
    if (probeErr) {
      throw new Error(
        'sink-merge refused: the worktree clean state for branch ' + branch + ' (' + wt + ') ' +
        'could not be verified (git status probe failed). Treating an unverifiable worktree as DIRTY ' +
        'to avoid destroying uncommitted work in a `git worktree remove --force`. Resolve the transient ' +
        'fault (e.g. a held index.lock) and re-run sink-merge.\n' +
        'Probe error: ' + (probeErr.message || String(probeErr))
      );
    }
    if (status) {
      throw new Error(
        'sink-merge refused: the linked worktree for branch ' + branch + ' (' + wt + ') has uncommitted changes.\n' +
        'Removing it (Step 0) would destroy that work. Commit or discard the worktree changes, then re-run sink-merge.\n' +
        'Uncommitted:\n  ' + status.split('\n').join('\n  ')
      );
    }
    return;
  }
}

function assertBranchHasNonWorkflowChanges(mainRoot, branch, defBranch) {
  // AC7 (#264): refuse a sink whose entire diff vs origin/main is kaola-workflow/** bookkeeping —
  // the branch carries no implementation. Skip when origin/main is unresolvable (mirror
  // alreadyUpToDate: no integration base to diff against → cannot judge, do not block).
  let base;
  try {
    base = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--verify', 'origin/' + defBranch],
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
    // #397.2: after a conflict re-run, attempt 1 already pushed the PRE-rebase tip, so a plain push is
    // rejected non-fast-forward. The correct push is force-with-lease.
    'Push before merging: git push --force-with-lease origin ' + branch + '\n' +
    '(a plain `git push` is rejected non-fast-forward if attempt 1 already pushed a pre-rebase tip).\n\n' +
    'Unpushed commits:\n  ' + commits.split('\n').join('\n  ')
  );
}

// #397.4: fastForwardMain is reached ONLY from the legacy `runDirectMerge({skipGit})` test path (the
// live merge path is the default-branch-resolved ffMergeLoop). The hardcoded 'main'/'origin/main'
// literals (canonical has zero post-#350) are removed — the default branch is resolved.
function fastForwardMain(args, opts) {
  const options = opts || {};
  const gitExec = options.gitExec || execFileSync;
  if (options.skipGit) return;
  const defBranch = options.defBranch || defaultBranch(mainRootFromCoord(getCoordRoot(options.root || getRoot())));
  gitExec('git', ['fetch', 'origin'], { encoding: 'utf8' });
  assertCleanWorktree(gitExec);
  gitExec('git', ['checkout', args.branch], { encoding: 'utf8' });
  gitExec('git', ['rebase', 'origin/' + defBranch], { encoding: 'utf8' });
  gitExec('git', ['checkout', defBranch], { encoding: 'utf8' });
  gitExec('git', ['pull', '--ff-only'], { encoding: 'utf8' });
  gitExec('git', ['merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
  gitExec('git', ['push', 'origin', defBranch], { encoding: 'utf8' });
}

function closeLinkedIssue(root, project, issueIid, opts) {
  const options = opts || {};
  if (issueIid == null) return null;
  assert(finalValidationPassed(root, project), 'Final validation evidence is required before closing the linked Gitea issue');
  const projectInfo = options.projectInfo || readProjectInfo(root, project);
  const comment = forge.createIssueComment(projectInfo, issueIid, 'Merged via Gitea direct merge sink after final validation passed.', options);
  const closed = forge.closeIssue(issueIid, options);
  try { forge.updateIssueLabels(projectInfo, issueIid, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
  return { comment_id: comment && comment.id, issue: closed };
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

// #350: post-rebase test gate (skipped OFFLINE / under the test-gate-skip hook).
function runTestGate(mainRoot) {
  if (!OFFLINE && !SKIP_TESTGATE) {
    execFileSync('npm', ['test'], { cwd: mainRoot, encoding: 'utf8', stdio: 'inherit' });
  }
}

function doRebase(args, alreadyUpToDate, mainRoot, defBranch) {
  if (!alreadyUpToDate) {
    try {
      execFileSync('git', ['-C', mainRoot, 'rebase', 'origin/' + defBranch], { encoding: 'utf8' });
    } catch (e) {
      try { execFileSync('git', ['-C', mainRoot, 'rebase', '--abort'], { encoding: 'utf8' }); } catch (_) {}
      throw new Error(
        'Rebase failed: ' + e.message + '\n' +
        'Remediation:\n' +
        '  1. Run: git rebase --abort\n' +
        '  2. Resolve conflicts manually on the feature branch\n' +
        '  3. Re-run: git rebase origin/' + defBranch + '\n' +
        // #397.2: post-rebase push must be force-with-lease; Step 0 already removed the linked worktree.
        '  4. Push the rebased branch: git push --force-with-lease origin ' + args.branch + '\n' +
        '  5. Re-invoke sink-merge after conflicts are resolved\n' +
        '  Note: Step 0 already removed the linked worktree (often your cwd); resolve in ' + mainRoot + '.'
      );
    }
    runTestGate(mainRoot);
  }
}

function ffMergeLoop(args, mainRoot, defBranch) {
  let retries = 0;
  let forcedFailCount = 0;
  const giveUp = () => {
    process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
    try { execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' }); } catch (_) {}
    return false;
  };
  // #350: re-fetch + re-rebase the feature branch onto the updated origin tip before retrying — the
  // only race that makes an FF fail is origin/<defBranch> advancing after the initial rebase, and
  // the pre-#350 loop retried the IDENTICAL ff-only merge without re-rebasing (dead weight).
  const reRebaseFeature = () => {
    if (OFFLINE) return true;
    try {
      execFileSync('git', ['-C', mainRoot, 'fetch', 'origin'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'rebase', 'origin/' + defBranch], { encoding: 'utf8' });
    } catch (_) {
      try { execFileSync('git', ['-C', mainRoot, 'rebase', '--abort'], { encoding: 'utf8' }); } catch (_) {}
      // #397.2: state the worktree/cwd disposition + force-with-lease push.
      process.stderr.write('FF race: re-rebase onto origin/' + defBranch + ' conflicted — manual resolution required.\n' +
        '  Note: the linked worktree was already removed (Step 0); resolve in ' + mainRoot + ' (now on branch ' + args.branch + ').\n' +
        '  After resolving, run: git push --force-with-lease origin ' + args.branch + '\n');
      return false;
    }
    try { runTestGate(mainRoot); } catch (_) {
      process.stderr.write('FF race: test gate failed after re-rebase onto origin/' + defBranch + '.\n');
      return false;
    }
    return true;
  };
  let raceHookFired = false;
  while (true) {
    // #350 test-only one-shot mid-flight race hook (fixed git push from a prepared clone dir).
    if (FF_RACE_PUSH_DIR && !raceHookFired) {
      raceHookFired = true;
      try { execFileSync('git', ['-C', FF_RACE_PUSH_DIR, 'push', 'origin', defBranch], { encoding: 'utf8' }); } catch (_) {}
    }
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'pull', '--ff-only'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
    }
    execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' });
    if (forcedFailCount < FORCE_FF_FAIL) {
      forcedFailCount++;
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp();
      if (!reRebaseFeature()) return giveUp();
      continue;
    }
    try {
      execFileSync('git', ['-C', mainRoot, 'merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
      return true;
    } catch (_) {
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp();
      if (!reRebaseFeature()) return giveUp();
    }
  }
}

function postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch) {
  // Step 7 — Push (with merge-impossible fallback)
  try {
    if (process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE) {
      throw new Error('synthetic merge-impossible: ' + process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE);
    }
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'push', 'origin', defBranch], { encoding: 'utf8' });
    }
  } catch (e) {
    const token = classifyMergeError(e);
    if (token === null) throw e;
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/' + defBranch], { encoding: 'utf8' });
    } catch (_) {}
    // #394: write the fallback receipt to the ARCHIVE .cache when archived (the STANDARD lane
    // archives before this sink runs, so the live .cache is gone — the old "skipping receipt write"
    // broke the exit-3 chain); keep the live .cache write when the folder is still live.
    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
    const archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
    const wasArchived = !fs.existsSync(liveProjectDir) && fs.existsSync(archiveDir);
    const receiptPath = wasArchived
      ? path.join(archiveDir, '.cache', 'sink-fallback.json')
      : path.join(liveProjectDir, '.cache', 'sink-fallback.json');
    if (wasArchived) {
      process.stderr.write('sink-merge: project archived (' + args.project + ') — fallback receipt written to archive .cache\n');
    }
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify({
      project: args.project,
      branch: args.branch,
      issue_number: args.issue != null ? args.issue : null,
      // #394: the fallback sink (sink-pr) needs the resolved default branch + full member set.
      resolved_default_branch: defBranch,
      issue_numbers: Array.isArray(args.issueNumbers) && args.issueNumbers.length ? args.issueNumbers : (args.issue ? [args.issue] : []),
      archived: wasArchived,
      reason: token,
      timestamp: new Date().toISOString()
    }, null, 2) + '\n');
    return { exitCode: 3 };
  }
  // Success path — track cleanup outcomes for closure receipt
  let remoteIssueClosed = OFFLINE ? 'skipped_offline' : 'failed';
  let claimLabelRemoved = OFFLINE ? 'skipped_offline' : 'failed';
  let branchRemoved = 'failed';
  const worktreeRemoved = wtRemovedStatus || 'failed';

  // Step 8 — Close issue — or, on a keep-open run, comment WITHOUT closing
  // #336: keep-open consistency guard — never close an issue whose archived state says keep-open,
  // even when the flag was not passed. The FF merge already put the archived state on main's
  // HEAD/working tree, which is exactly where postMergeCleanup executes; an accidental close of a
  // keep-open issue is the one irreversible step, hence defense-in-depth.
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
    const root = mainRoot;
    const forgeOpts = { execOptions: { cwd: mainRoot } };
    if (keepIssueOpen) {
      // #336: mechanical keep-open comment. Body contains no close/fix/resolve #N substring.
      try { forge.createIssueComment(readProjectInfo(root, args.project), args.issue, 'Merged via Gitea direct merge sink. Issue intentionally kept open (partial-close terminal); residual scope remains tracked here.', forgeOpts); } catch (_) {}
    } else {
      // #427: probe before attempting close — if cmdFinalize already closed the issue, skip the
      // close call entirely (avoids a guaranteed exit-1 error in the normal finalize→sink flow).
      if (probeIssueClosed(args.issue, forgeOpts)) {
        remoteIssueClosed = 'already_closed';
        process.stderr.write('sink-merge: Issue #' + args.issue + ' already closed by cmdFinalize, skipping close.\n');
      } else {
        try { forge.createIssueComment(readProjectInfo(root, args.project), args.issue, 'Merged via Gitea direct merge sink.', forgeOpts); } catch (_) {}
        try { forge.closeIssue(args.issue, forgeOpts); remoteIssueClosed = 'closed'; }
        catch (e) {
          // #396.5: a close that exits as failure on an ALREADY-CLOSED issue (idempotent re-run) is a SUCCESS.
          if (probeIssueClosed(args.issue, forgeOpts)) { remoteIssueClosed = 'already_closed'; }
          else { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: tea issues close ' + args.issue + '\n'); }
        }
      }
    }
    // Claim-label removal runs in BOTH modes (claim release is wanted on keep-open).
    try { forge.updateIssueLabels(readProjectInfo(root, args.project), args.issue, Object.assign({ remove: [forge.CLAIM_LABEL] }, forgeOpts)); claimLabelRemoved = 'removed'; } catch (_) { claimLabelRemoved = 'failed'; }

    // #403.6: keep-open BUNDLE arm — per-member comment + label removal (the close loop is gated
    // !keepIssueOpen, so non-primary keep-open members otherwise got nothing).
    if (keepIssueOpen && Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
      const projectInfoKO = readProjectInfo(root, args.project);
      for (const n of args.issueNumbers) {
        if (n === args.issue) continue;
        try { forge.createIssueComment(projectInfoKO, n, 'Merged via Gitea direct merge sink (bundle member). Issue intentionally kept open (partial-close terminal); residual scope remains tracked here.', forgeOpts); } catch (_) {}
        try { forge.updateIssueLabels(projectInfoKO, n, Object.assign({ remove: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
      }
    }
  }

  // #369 BUNDLE all-or-nothing closure: close EVERY member of issue_numbers, not just the primary.
  // Gated on a real bundle (length > 1) so single-issue output is byte-unchanged (AC7). Each member
  // lands in exactly ONE bucket (no silent-neither): closed_issues or failed_issue_closures.
  let bundleBuckets = null;
  if (!OFFLINE && !keepIssueOpen && Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
    const forgeOpts = { execOptions: { cwd: mainRoot } };
    const projectInfo = readProjectInfo(mainRoot, args.project);
    const closed = [], failed = [];
    if (args.issue != null) {
      if (remoteIssueClosed === 'closed' || remoteIssueClosed === 'already_closed') closed.push(args.issue);
      else failed.push(args.issue);
    }
    for (const n of args.issueNumbers) {
      if (n === args.issue) continue; // primary handled above
      try {
        forge.createIssueComment(projectInfo, n, 'Merged via Gitea direct merge sink (bundle member).', forgeOpts);
        forge.closeIssue(n, forgeOpts);
        closed.push(n);
        try { forge.updateIssueLabels(projectInfo, n, Object.assign({ remove: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
      } catch (e) {
        // #396.5: classify already-closed (idempotent re-run) as SUCCESS, not a failed closure.
        if (probeIssueClosed(n, forgeOpts)) {
          closed.push(n);
          try { forge.updateIssueLabels(projectInfo, n, Object.assign({ remove: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
        } else {
          failed.push(n);
          process.stderr.write('sink-merge: WARNING: bundle member issue close failed for ' + n + '; recorded in failed_issue_closures. Manually run: tea issues close ' + n + '\n');
        }
      }
    }
    bundleBuckets = { closed_issues: closed.sort((a, b) => a - b), failed_issue_closures: failed.sort((a, b) => a - b), open_issues: [] };
    remoteIssueClosed = failed.length === 0 ? 'closed' : 'partial';
  }
  // Step 9 — Delete branch
  // #397.1: delete the REMOTE branch first, then verify the local branch is merged into defBranch and
  // force-delete with -D (post-race-recovery local branch diverges from upstream → plain `-d` refuses).
  if (!OFFLINE) {
    try { execFileSync('git', ['-C', mainRoot, 'push', 'origin', '--delete', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  }
  let mergedIntoDefault = false;
  try {
    execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch], { encoding: 'utf8' });
    mergedIntoDefault = true;
  } catch (_) { mergedIntoDefault = false; }
  if (mergedIntoDefault) {
    try { execFileSync('git', ['-C', mainRoot, 'branch', '-D', '--', args.branch], { encoding: 'utf8' }); branchRemoved = 'removed'; } catch (_) { branchRemoved = 'failed'; }
  } else {
    try { execFileSync('git', ['-C', mainRoot, 'branch', '-d', '--', args.branch], { encoding: 'utf8' }); branchRemoved = 'removed'; } catch (_) { branchRemoved = 'failed'; }
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
  // M2 (#280 port #300): WARN-FIRST dispatch attestation check, archive-first (matching cmdFinalize).
  // cmdFinalize archives .cache/ before sink-merge runs, so the live path is absent;
  // check archive candidate first, then live as fallback. emptyReceipt 'failed' defaults
  // are overwritten here so a real dispatch-log (with both lines) yields 'attested'.
  checkDispatchAttestations([
    path.join(archiveDest, '.cache'),
    path.join(mainRoot, 'kaola-workflow', args.project, '.cache')
  ], receipt);
  // #369: post-attach the bundle per-member buckets BEFORE the invariant check.
  if (bundleBuckets) {
    receipt.closed_issues = bundleBuckets.closed_issues;
    receipt.failed_issue_closures = bundleBuckets.failed_issue_closures;
    receipt.open_issues = bundleBuckets.open_issues;
  }
  const invariants = checkClosureInvariants(mainRoot, receipt, archiveDest);
  // #393a: surface the member-set source.
  const emit = { status: 'merged', closure_receipt: receipt, closure_invariants: invariants };
  if (args.member_source) emit.member_source = args.member_source;
  process.stdout.write(JSON.stringify(emit) + '\n');
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
  // #336: keep-open is meaningless without an issue to keep open.
  assert(!args.keepIssueOpen || args.issue != null,
    'sink-merge: --keep-issue-open requires --issue N (there is no issue to keep open)');
  const root = options.root || getRoot();
  assert(finalValidationPassed(root, args.project), 'Final validation evidence is required before direct merge sink runs');

  if (options.skipGit) {
    fastForwardMain(args, options);
    // #336: keep-open — the legacy direct path must not close the linked issue either.
    const closeResult = args.keepIssueOpen ? null : closeLinkedIssue(root, args.project, args.issue, options);
    return { merged: true, close: closeResult };
  }

  // New pipeline
  const mainRoot = mainRootFromCoord(getCoordRoot(root));
  // #393a: derive the member set BEFORE the destructive worktree removal — when --issue-numbers is
  // absent, fall back to the state's issue_numbers so a flag-less bundle sink still closes every member.
  const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
  args.issueNumbers = memberSet.members;
  args.member_source = memberSet.source;
  const defBranch = defaultBranch(mainRoot); // #350: resolve origin/HEAD, not hardcoded main

  // Early-exit: if project is already archived, return exit 3 without touching git.
  // AND (not OR): live dir present means project is not yet archived; archiveProjectDir
  // uses fs.renameSync so both dirs co-existing is an impossible/transient state.
  const _liveDir = path.join(mainRoot, 'kaola-workflow', args.project);
  const _archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
  if (!fs.existsSync(_liveDir) && fs.existsSync(_archiveDir)) {
    process.stderr.write('sink-merge: project archived (' + args.project + ') — fallback receipt written to archive .cache\n');
    // #394: write the durable fallback receipt to the ARCHIVE .cache so the exit-3 fallback chain
    // (sink-fallback → sink-pr) has a home (the early-exit returned exit 3 with NO receipt before).
    try {
      const receiptPath = path.join(_archiveDir, '.cache', 'sink-fallback.json');
      fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
      fs.writeFileSync(receiptPath, JSON.stringify({
        project: args.project,
        branch: args.branch,
        issue_number: args.issue != null ? args.issue : null,
        resolved_default_branch: defBranch,
        issue_numbers: Array.isArray(args.issueNumbers) && args.issueNumbers.length ? args.issueNumbers : (args.issue ? [args.issue] : []),
        archived: true,
        reason: 'archived_before_sink',
        timestamp: new Date().toISOString()
      }, null, 2) + '\n');
    } catch (_) {}
    return { exitCode: 3 };
  }

  // #346: register the exit hook + chdir, run ALL preconditions, and ONLY THEN removeWorktree.
  // The old Step 0 ran removeWorktree FIRST, so a sink about to refuse first destroyed the worktree
  // and any uncommitted work in it.
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
  let wtRemovedStatus = 'failed';

  // Step 1 — Fetch
  if (!OFFLINE) {
    execFileSync('git', ['-C', mainRoot, 'fetch', 'origin'], { encoding: 'utf8' });
  }

  // Step 2 — preconditions, ALL before any destructive step (#346). Each is checkout-independent
  // (operates on mainRoot / the branch ref). Any failure throws → exit 1, ZERO mutation, worktree
  // intact. assertWorktreeClean is the data-loss guard.
  const status = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  assert(!status, 'Worktree must be clean before direct merge sink runs');
  assertNoLiveWorkflowFolder(mainRoot, args.project, args.branch);
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);
  if (!OFFLINE) assertBranchHasNonWorkflowChanges(mainRoot, args.branch, defBranch);
  assertWorktreeClean(mainRoot, args.branch);

  // Step 3 — Remove the worktree (only now that every precondition passed) so the branch can be
  // checked out below.
  let folder;
  try { folder = readActiveFolders(mainRoot, { excludeClosedIssues: false }).find(item => item.project === args.project); } catch (_) {}
  let wtResult;
  try { wtResult = removeWorktree(mainRoot, args.project, folder); } catch (_) {}
  if (wtResult) {
    if (wtResult.removed === true) wtRemovedStatus = 'removed';
    else if (wtResult.removed === false && wtResult.reason === 'missing') wtRemovedStatus = 'missing';
    else wtRemovedStatus = 'failed';
  }

  // Step 4 — Checkout branch (worktree now removed, branch ref freed)
  execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });

  // Step 2 — Merge-base skip-check (try-catch: if origin/main absent, treat as up-to-date)
  let alreadyUpToDate = false;
  try {
    const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', 'origin/' + defBranch], { encoding: 'utf8' }).trim();
    const originMain = execFileSync('git', ['-C', mainRoot, 'rev-parse', 'origin/' + defBranch], { encoding: 'utf8' }).trim();
    alreadyUpToDate = (mergeBase === originMain);
  } catch (_) {
    alreadyUpToDate = true;
  }

  doRebase(args, alreadyUpToDate, mainRoot, defBranch);

  if (!ffMergeLoop(args, mainRoot, defBranch)) {
    return { exitCode: 2 };
  }

  const cleanupResult = postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch);
  if (cleanupResult && cleanupResult.exitCode === 3) {
    return { exitCode: 3 };
  }

  return { merged: true };
}

// ---------------------------------------------------------------------------
// #429: --sink transaction — resumable step-receipt based merge pipeline (Gitea port)
// ---------------------------------------------------------------------------

const SINK_ABORT_AFTER = process.env.KAOLA_WORKFLOW_SINK_ABORT_AFTER || '';
const SINK_STEPS = ['preflight', 'push_upstream', 'merge', 'worktree_sync', 'finalize', 'closure', 'stash_restore', 'archive_commit', 'push_main'];

function writeSinkReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tmp2 = receiptPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp2, JSON.stringify(receipt, null, 2) + '\n');
  fs.renameSync(tmp2, receiptPath);
}

function resolveSinkReceiptPath(mainRoot, project) {
  const live = path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json');
  const archive = path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json');
  if (fs.existsSync(live)) return live;
  if (fs.existsSync(archive)) return archive;
  const liveDir = path.join(mainRoot, 'kaola-workflow', project);
  if (fs.existsSync(liveDir)) return live;
  return archive;
}

function loadOrInitReceipt(mainRoot, project, branch, issueNumber, issueNumbers, defBranch) {
  const receiptPath = resolveSinkReceiptPath(mainRoot, project);
  if (fs.existsSync(receiptPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (r && r.steps) return { receipt: r, receiptPath };
    } catch (_) {}
  }
  const steps = {};
  for (const s of SINK_STEPS) steps[s] = 'pending';
  const receipt = {
    project, branch, issue_number: issueNumber || null,
    issue_numbers: issueNumbers && issueNumbers.length ? issueNumbers : (issueNumber ? [issueNumber] : []),
    resolved_default_branch: defBranch,
    started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    stash_ref: null, removed_duplicates: [], steps
  };
  return { receipt, receiptPath };
}

function sinkCopyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) sinkCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function sinkPreflight(mainRoot, project, branch, issueNumbers) {
  const porcelain = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '-uall'], { encoding: 'utf8' });
  const lines = porcelain.split('\n').filter(Boolean);
  const worktreePaths = new Set();
  try {
    const list = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    for (const block of list.split(/\n\n+/)) {
      const m = block.match(/^worktree (.+)$/m);
      if (m) {
        try {
          const rel = path.relative(mainRoot, m[1]);
          if (!rel.startsWith('..')) worktreePaths.add(rel.replace(/\\/g, '/'));
        } catch (_) {}
      }
    }
  } catch (_) {}
  const issueSet = new Set((issueNumbers || []).map(n => String(n)));
  const roadmapSources = [], projDuplicates = [], foreignDirt = [];
  for (const line of lines) {
    const xy = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    if (filePath.includes(' -> ')) filePath = filePath.split(' -> ')[1].trim();
    const roadmapMatch = filePath.match(/^kaola-workflow\/\.roadmap\/issue-(\d+)\.md$/);
    if (roadmapMatch && issueSet.has(roadmapMatch[1])) { roadmapSources.push(filePath); continue; }
    const projStateFiles = [
      'kaola-workflow/' + project + '/workflow-plan.md', 'kaola-workflow/' + project + '/workflow-state.md',
      'kaola-workflow/' + project + '/workflow-tasks.json', 'kaola-workflow/' + project + '/.cache/dispatch-log.jsonl'
    ];
    if (xy === '??' && projStateFiles.includes(filePath)) {
      let branchHas = false;
      try { execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', branch + ':' + filePath], { stdio: 'ignore' }); branchHas = true; } catch (_) {}
      if (branchHas) { projDuplicates.push(filePath); continue; }
    }
    const isWorktreePath = worktreePaths.has(filePath) || Array.from(worktreePaths).some(wt => filePath === wt + '/' || filePath.startsWith(wt + '/'));
    if (isWorktreePath) continue;
    foreignDirt.push(filePath);
  }
  if (foreignDirt.length > 0) {
    return { ok: false, reason: 'sink_blocked', foreign_dirt: foreignDirt, detail: 'main checkout carries changes not owned by this sink; resolve before re-running. This sink never touches another project\'s files.' };
  }
  let stashRef = null;
  if (roadmapSources.length > 0) {
    try {
      execFileSync('git', ['-C', mainRoot, 'stash', 'push', '-m', 'kw-sink-' + project, '--', ...roadmapSources], { encoding: 'utf8' });
      try {
        const stashList = execFileSync('git', ['-C', mainRoot, 'stash', 'list', '--format=%gd %gs'], { encoding: 'utf8' });
        const stashLine = stashList.split('\n').find(l => l.includes('kw-sink-' + project));
        if (stashLine) stashRef = stashLine.split(' ')[0];
      } catch (_) { stashRef = 'stash@{0}'; }
    } catch (_) {}
  }
  const removedDuplicates = [];
  for (const dup of projDuplicates) {
    try { fs.unlinkSync(path.join(mainRoot, dup)); removedDuplicates.push(dup); } catch (_) {}
  }
  return { ok: true, stashRef, removedDuplicates };
}

function runSinkTransaction(args, mainRoot, defBranch) {
  const { receipt, receiptPath } = loadOrInitReceipt(mainRoot, args.project, args.branch, args.issue, args.issueNumbers, defBranch);
  const stepDone = (step) => {
    receipt.steps[step] = 'done'; receipt.updated_at = new Date().toISOString();
    writeSinkReceipt(receiptPath, receipt);
    if (SINK_ABORT_AFTER && SINK_ABORT_AFTER === step) {
      process.stderr.write('[TEST ONLY] KAOLA_WORKFLOW_SINK_ABORT_AFTER=' + step + ' — aborting sink transaction\n');
      process.exitCode = 99; process.exit(99);
    }
  };
  for (const step of SINK_STEPS) {
    if (receipt.steps[step] === 'done') continue;
    if (step === 'preflight') {
      const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
      args.issueNumbers = memberSet.members; args.member_source = memberSet.source;
      const preResult = sinkPreflight(mainRoot, args.project, args.branch, args.issueNumbers);
      if (!preResult.ok) {
        process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'sink_blocked', foreign_dirt: preResult.foreign_dirt, detail: preResult.detail }) + '\n');
        process.exitCode = 1; return;
      }
      if (preResult.stashRef) receipt.stash_ref = preResult.stashRef;
      if (preResult.removedDuplicates) receipt.removed_duplicates = preResult.removedDuplicates;
      stepDone('preflight'); continue;
    }
    if (step === 'push_upstream') {
      if (!OFFLINE) { try { execFileSync('git', ['-C', mainRoot, 'push', '-u', 'origin', args.branch], { encoding: 'utf8' }); } catch (_) {} }
      stepDone('push_upstream'); continue;
    }
    if (step === 'merge') {
      try {
        const folder = readActiveFolders(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project);
        removeWorktree(mainRoot, args.project, folder);
      } catch (_) {}
      const originRef = 'origin/' + defBranch;
      let alreadyUpToDate = false;
      try {
        const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', originRef], { encoding: 'utf8' }).trim();
        const originHead = execFileSync('git', ['-C', mainRoot, 'rev-parse', originRef], { encoding: 'utf8' }).trim();
        alreadyUpToDate = (mergeBase === originHead);
      } catch (_) { alreadyUpToDate = true; }
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      doRebase(args, alreadyUpToDate, mainRoot, defBranch);
      if (!ffMergeLoop(args, mainRoot, defBranch)) { process.stderr.write('sink-merge --sink: FF merge failed\n'); process.exitCode = 2; return; }
      stepDone('merge'); continue;
    }
    if (step === 'worktree_sync') {
      let wtPath = null;
      try {
        const list = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
        for (const block of list.split(/\n\n+/)) {
          const pL = block.match(/^worktree (.+)$/m); const bL = block.match(/^branch refs\/heads\/(.+)$/m);
          if (pL && bL && bL[1] === args.branch) { wtPath = pL[1]; break; }
        }
      } catch (_) {}
      if (wtPath) {
        const wtProjDir = path.join(wtPath, 'kaola-workflow', args.project);
        const mainProjDir = path.join(mainRoot, 'kaola-workflow', args.project);
        if (fs.existsSync(wtProjDir) && !fs.existsSync(mainProjDir)) sinkCopyDir(wtProjDir, mainProjDir);
      }
      stepDone('worktree_sync'); continue;
    }
    if (step === 'finalize') {
      try { const { archiveProjectDir } = require('./kaola-gitea-workflow-claim'); archiveProjectDir(mainRoot, args.project, 'closed', undefined, { keepWorktree: false }); } catch (_) {}
      stepDone('finalize'); continue;
    }
    if (step === 'closure') {
      // Gitea: use forge.closeIssue / forge.updateIssueLabels (tea CLI nouns)
      // #497: a HARD close failure (a member that genuinely won't close AND is not already-closed)
      // must NOT report status:sinked. Bucket each member into closed/failed, record
      // remote_issue_closed in the receipt, and on ANY genuine failure do NOT stepDone — emit a
      // non-sinked refusal so the caller can retry.
      if (!OFFLINE && args.issue != null && !args.keepIssueOpen) {
        const closed = [];
        const failed = [];
        const closeOne = (n) => {
          if (probeIssueClosed(n, {})) { closed.push(n); return; }
          try { forge.closeIssue(n, {}); closed.push(n); }
          catch (e) {
            if (probeIssueClosed(n, {})) { closed.push(n); }
            else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: PR/issue close failed for ' + n + '; manually run: tea issues close ' + n + '\n'); }
          }
        };
        closeOne(args.issue);
        try { forge.updateIssueLabels(null, args.issue, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
        if (Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
          for (const n of args.issueNumbers) {
            if (n === args.issue) continue;
            closeOne(n);
            try { forge.updateIssueLabels(null, n, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
          }
        }
        // #497: only the FAILURE path records into the receipt + refuses — SUCCESS stays byte-equivalent.
        if (failed.length > 0) {
          receipt.remote_issue_closed = 'partial'; receipt.updated_at = new Date().toISOString(); writeSinkReceipt(receiptPath, receipt);
          process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'sink_incomplete', step: 'closure', remote_issue_closed: 'partial', closed_issues: closed.sort((a, b) => a - b), failed_issue_closures: failed.sort((a, b) => a - b), branch: args.branch, detail: 'the merge landed but ' + failed.length + ' issue(s) could not be closed on the forge (' + failed.join(', ') + '). Refusing to report status:sinked. The closure step is left NOT done so a re-run retries it. Manually close the issue(s) or resolve the forge fault, then re-run --sink.' }) + '\n');
          process.exitCode = 1; return;
        }
      }
      stepDone('closure'); continue;
    }
    if (step === 'stash_restore') {
      if (receipt.stash_ref) {
        try {
          const stashList = execFileSync('git', ['-C', mainRoot, 'stash', 'list', '--format=%gd %gs'], { encoding: 'utf8' });
          if (stashList.split('\n').some(l => l.includes('kw-sink-' + args.project))) {
            execFileSync('git', ['-C', mainRoot, 'stash', 'pop', receipt.stash_ref], { encoding: 'utf8' });
          }
        } catch (_) {}
      }
      stepDone('stash_restore'); continue;
    }
    if (step === 'archive_commit') {
      const archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
      if (fs.existsSync(archiveDir)) {
        const ps = 'kaola-workflow/archive/' + args.project + '/';
        try { execFileSync('git', ['-C', mainRoot, 'add', '--', ps], { encoding: 'utf8' }); } catch (_) {}
        let hasStaged = false;
        try { execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--quiet', '--', ps], { stdio: 'ignore' }); }
        catch (e) { if (e && e.status === 1) hasStaged = true; }
        if (hasStaged) { try { execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: archive ' + args.project + ' [sink]', '--', ps], { encoding: 'utf8' }); } catch (_) {} }
      }
      const archRcptPath = path.join(mainRoot, 'kaola-workflow', 'archive', args.project, '.cache', 'sink-receipt.json');
      if (!fs.existsSync(receiptPath) && fs.existsSync(path.dirname(archRcptPath))) writeSinkReceipt(archRcptPath, receipt);
      stepDone('archive_commit'); continue;
    }
    if (step === 'push_main') {
      // #497: a HARD push failure must NOT report status:sinked (the deliverable advanced LOCALLY but
      // never reached the remote; the #484 freshness guard checks branch ancestry, which holds on a
      // local FF merge regardless of push). Record the outcome, do NOT stepDone, emit a non-sinked
      // refusal so the caller can detect + retry. Branch is preserved (return before teardown).
      if (!OFFLINE) {
        try {
          if (FORCE_PUSH_MAIN_FAIL) throw new Error('[TEST ONLY] KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL — push main forced to fail');
          execFileSync('git', ['-C', mainRoot, 'push', 'origin', defBranch], { encoding: 'utf8' });
        } catch (e) {
          receipt.push_main = 'failed'; receipt.updated_at = new Date().toISOString(); writeSinkReceipt(receiptPath, receipt);
          process.stderr.write('sink-merge --sink: push main failed: ' + (e.message || String(e)) + '\n');
          process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'sink_incomplete', step: 'push_main', push_main: 'failed', branch: args.branch, default_branch: defBranch, detail: 'the merge landed on the LOCAL ' + defBranch + ' but `git push origin ' + defBranch + '` failed — the deliverable is NOT on the remote. Refusing to report status:sinked (a transient push failure must not look like a completed sink). The push step is left NOT done so a re-run retries it. Resolve the push fault and re-run --sink.' }) + '\n');
          process.exitCode = 1; return;
        }
      }
      stepDone('push_main'); continue;
    }
  }
  // #484 FRESHNESS GUARD: a stale all-`done` receipt resumed from the tracked archive/<project>/.cache/
  // fallback skips merge + push_main and would fall through to status:sinked WITHOUT the branch ever
  // landing on the default branch (main silently not advanced, deliverable lost). Before any teardown or
  // success emission, assert the branch tip IS an ancestor of the resolved default branch (the merge
  // actually applied). OFFLINE-safe (the merge merges into the LOCAL defBranch). Non-ancestor / missing
  // branch ⇒ typed refusal stale_sink_receipt, never a false status:sinked.
  {
    let merged = false;
    try { execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch], { stdio: 'ignore' }); merged = true; } catch (_) { merged = false; }
    if (!merged) {
      process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'stale_sink_receipt', branch: args.branch, default_branch: defBranch, detail: 'all sink steps report "done" but branch "' + args.branch + '" is NOT an ancestor of "' + defBranch + '" — the merge was never applied (a stale receipt resumed from kaola-workflow/archive/' + args.project + '/.cache/sink-receipt.json). Refusing to report status:sinked (main would silently not advance and the deliverable would be lost). Reset the receipt steps or remove the stale archived sink-receipt.json, then re-run --sink so the branch actually merges.' }) + '\n');
      process.exitCode = 1; return;
    }
  }
  // Cleanup: remove worktree + branch
  try { const folder = readActiveFolders(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project); removeWorktree(mainRoot, args.project, folder); } catch (_) {}
  if (!OFFLINE) { try { execFileSync('git', ['-C', mainRoot, 'push', 'origin', '--delete', '--', args.branch], { encoding: 'utf8' }); } catch (_) {} }
  try {
    execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch], { stdio: 'ignore' });
    try { execFileSync('git', ['-C', mainRoot, 'branch', '-D', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  } catch (_) { try { execFileSync('git', ['-C', mainRoot, 'branch', '-d', '--', args.branch], { encoding: 'utf8' }); } catch (_) {} }
  const finalReceipt = JSON.parse(fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath, 'utf8') : JSON.stringify(receipt));
  process.stdout.write(JSON.stringify({ result: 'ok', status: 'sinked', receipt: finalReceipt }) + '\n');
}

const SINK_USAGE = 'usage: kaola-gitea-workflow-sink-merge.js --branch B --project P [--issue N] [--issue-numbers A,B] [--keep-issue-open] [--sink]\n'
  + '  --sink         run the full sink TRANSACTION (merge → close → delete branch → remove worktree).\n'
  + '  --help, -h     print this usage and exit (no side effects).';

function main() {
  const rawArgv = process.argv.slice(2);
  // #476: --help/-h is a SAFE no-op — checked on the RAW argv BEFORE parseArgs (mirroring claim.js) so a
  // value flag cannot SWALLOW the help token (`--issue-numbers -h` would otherwise consume -h as a value,
  // bypassing the post-parse args.help gate). Print usage + exit 0 with ZERO side effects (this script's
  // default action is a DESTRUCTIVE merge/close/delete; a help probe must never run it).
  if (rawArgv.includes('--help') || rawArgv.includes('-h')) { process.stdout.write(SINK_USAGE + '\n'); return; }
  const args = parseArgs(rawArgv);
  // #476: reject UNRECOGNIZED flags with a typed unknown_flag refusal and ZERO mutation, before any
  // side effect — an unknown flag must never fall through into the destructive transaction.
  if (args.unknownFlags && args.unknownFlags.length) {
    const hint = 'Unrecognized flag(s): ' + args.unknownFlags.join(', ') + '. Refusing with zero side effects — run `--help` for usage.';
    process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'unknown_flag', unknownFlags: args.unknownFlags, operator_hint: hint }) + '\n');
    process.exitCode = 1; return;
  }
  // #429: detect --sink flag before routing to the transaction.
  const isSinkMode = rawArgv.includes('--sink');
  if (isSinkMode) {
    const root = getRoot();
    const mainRoot = mainRootFromCoord(getCoordRoot(root));
    const defBranch = defaultBranch(mainRoot);
    try { process.chdir(os.tmpdir()); } catch (_) {}
    const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
    args.issueNumbers = memberSet.members; args.member_source = memberSet.source;
    runSinkTransaction(args, mainRoot, defBranch);
    return;
  }
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
  runDirectMerge,
  assertBranchHasNonWorkflowChanges
};
