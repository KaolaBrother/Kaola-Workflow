#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const forge = require('./kaola-gitea-forge');
const { getCoordRoot, readActiveFolders, removeWorktree, worktreePathFor, buildClosureReceipt, checkClosureInvariants, checkDispatchAttestations, defaultBranch } = require('./kaola-gitea-workflow-claim');
// #548: the canonical repo-kind discriminator (self-host npm vs consumer). run-chains requires
// no sink-merge symbol, so this is non-circular.
const { resolveChains } = require('./kaola-gitea-workflow-run-chains');

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10);
// #496/#497/#506: test-only fault injection — force the worktree-list / worktree-clean status probe / push_main to throw.
const FORCE_WT_LIST_FAIL = process.env.KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL === '1';
const FORCE_WT_STATUS_FAIL = process.env.KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL === '1';
const FORCE_PUSH_MAIN_FAIL = process.env.KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL === '1';
// #619(3): test-only — force the push_upstream step's push to THROW. Never set in production.
const FORCE_PUSH_UPSTREAM_FAIL = process.env.KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL === '1';
const SKIP_TESTGATE = process.env.KAOLA_WORKFLOW_SKIP_TESTGATE === '1'; // #350 test-only
const FF_RACE_PUSH_DIR = process.env.KAOLA_WORKFLOW_FF_RACE_PUSH_DIR || ''; // #350 test-only
// #666: cap unbounded-in-repo-size git execFileSync calls at 64 MB — Node's execFileSync default
// maxBuffer is 1 MB, and a repo-size-scaling diff/listing can exceed it and crash with ENOBUFS.
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

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
  // #506: the outer `git worktree list` probe is the first gate before the inner status probe.
  // A transient fault here must FAIL CLOSED — a probe that cannot enumerate worktrees cannot
  // prove there is nothing to guard. One bounded retry absorbs a momentary fault before refusing.
  let list = null;
  let listErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (FORCE_WT_LIST_FAIL) throw new Error('[TEST ONLY] KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL — worktree list probe forced to fail');
      list = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
      listErr = null;
      break;
    } catch (e) { listErr = e; }
  }
  if (listErr) {
    throw new Error(
      'sink-merge refused: `git worktree list` for branch ' + branch + ' could not be executed (worktree list probe failed). ' +
      'Cannot enumerate worktrees to verify the linked worktree is absent or clean before `git worktree remove --force`. ' +
      'Resolve the transient fault and re-run sink-merge.\n' +
      'Probe error: ' + (listErr.message || String(listErr))
    );
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
      { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
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
//
// #548: consumer-aware. The gate is `npm test` ONLY on the self-host (npm) edition; a consumer
// (non-npm) product repo has no `test:kaola-workflow:*` chain script, so `npm test` would error or
// run an unrelated script on every origin-advance rebase. Repo kind is the SAME discriminator the
// plan validator (#475) and run-chains use: resolveChains() probed at the GIT TOP-LEVEL (not just
// mainRoot — an intermediate dir could misclassify a real self-host as a consumer, the fail-OPEN
// #475 fixed). On a consumer repo we run NO suite here: finalize already validated the pre-sink
// tree (#475), and a clean rebase onto an advanced base is the only delta — a rebase CONFLICT
// already fails loudly above.
function runTestGate(mainRoot) {
  if (OFFLINE || SKIP_TESTGATE) return;
  let pkgRoot = mainRoot;
  try { pkgRoot = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim() || mainRoot; } catch (_) { pkgRoot = mainRoot; }
  const res = resolveChains(pkgRoot);
  if (res && res.error) return; // consumer repo — no npm edition chains; nothing to run.
  execFileSync('npm', ['test'], { cwd: mainRoot, encoding: 'utf8', stdio: 'inherit' });
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
  // #617: capture the feature branch's commit SHA now, before Step 9 below deletes the branch
  // ref — this is "the recorded implementation commit" the remote-closed-after-publish invariant
  // (wired into checkClosureInvariants below) verifies is an ancestor of defBranch before the
  // receipt is allowed to report a genuine close.
  let implCommitSha = null;
  try {
    implCommitSha = execFileSync('git', ['-C', mainRoot, 'rev-parse', args.branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {}
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
        try {
          forge.closeIssue(args.issue, forgeOpts);
          // #619(2): a close call exiting without error does not PROVE the issue is closed (a rare
          // forge/API race can leave it open) — the old code trusted it unconditionally and only
          // probed in the catch branch below. Probe the live state on the success path too.
          if (probeIssueClosed(args.issue, forgeOpts)) { remoteIssueClosed = 'closed'; }
          else {
            remoteIssueClosed = 'failed';
            process.stderr.write('sink-merge: WARNING: issue close reported success for ' + args.issue + ' but the issue is still OPEN; receipt.remote_issue_closed=failed. Manually run: tea issues close ' + args.issue + '\n');
          }
        }
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
        // #619(2): probe the live state on the success path too — a non-throwing close is not proof.
        if (probeIssueClosed(n, forgeOpts)) {
          closed.push(n);
          try { forge.updateIssueLabels(projectInfo, n, Object.assign({ remove: [forge.CLAIM_LABEL] }, forgeOpts)); } catch (_) {}
        } else {
          failed.push(n);
          process.stderr.write('sink-merge: WARNING: bundle member issue close reported success for ' + n + ' but the issue is still OPEN; recorded in failed_issue_closures.\n');
        }
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
  // #617: wire the remote-closed-after-publish invariant — verify the captured branch SHA is an
  // ancestor of defBranch before trusting this receipt's close.
  const invariants = checkClosureInvariants(mainRoot, receipt, archiveDest, { implRef: implCommitSha, sinkTarget: defBranch });

  // #619(1): a failed issue close must fail CLOSED, not silently report status:'merged' (mirroring
  // the --sink transaction's closure-step refusal, the #497 pattern). The merge into defBranch
  // already happened by this point in the legacy (non---sink) pipeline (irreversible); this is
  // purely truthful reporting: a close that genuinely failed on the forge must never look like a
  // completed sink. `closeWasAttempted` excludes OFFLINE / keep-open / no-issue-passed, where
  // remoteIssueClosed's default 'failed' init value does not represent a real failure.
  const closeWasAttempted = !OFFLINE && !keepIssueOpen &&
    (args.issue != null || (Array.isArray(args.issueNumbers) && args.issueNumbers.length > 0));
  const closeFailed = bundleBuckets
    ? bundleBuckets.failed_issue_closures.length > 0
    : (closeWasAttempted && remoteIssueClosed === 'failed');
  if (closeFailed) {
    const out = {
      result: 'refuse',
      reason: 'sink_incomplete',
      step: 'closure',
      remote_issue_closed: remoteIssueClosed,
      branch: args.branch,
      closure_receipt: receipt,
      closure_invariants: invariants,
      detail: 'the merge landed on ' + defBranch + ' but the issue close failed on the forge (receipt.remote_issue_closed=' +
        remoteIssueClosed + '). Refusing to report status:merged — a failed issue close must not look like a ' +
        'completed sink. Manually close the issue(s) (`tea issues close <N>`), then reconcile state.',
    };
    if (bundleBuckets) {
      out.closed_issues = bundleBuckets.closed_issues;
      out.failed_issue_closures = bundleBuckets.failed_issue_closures;
    }
    process.stdout.write(JSON.stringify(out) + '\n');
    return { exitCode: 1 };
  }

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
  // #561: lane-group backstop on the legacy (non---sink) main-advance path too — mirror the --sink
  // path's sinkPreflight backstop. A residual lane_group means surviving legs' committed work is NOT on
  // the feature branch (#552 crash-window); advancing main here would silently lose it. Pure read, zero
  // mutation, FIRST in the precondition block. Emit the SAME typed refusal the --sink path emits.
  const laneGroupRefusal = lingeringLaneGroupRefusal(mainRoot, args.project);
  if (laneGroupRefusal) {
    process.stdout.write(JSON.stringify({
      result: 'refuse',
      reason: laneGroupRefusal.reason || 'lingering_lane_group',
      detail: laneGroupRefusal.detail,
    }) + '\n');
    process.exitCode = 1;
    return;
  }
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
  // #619(1): postMergeCleanup can now also return { exitCode: 1 } (a failed-close sink_incomplete
  // refusal) alongside the pre-existing { exitCode: 3 } (merge-impossible fallback) — generalize
  // from the exact-3 check to any returned exitCode.
  if (cleanupResult && cleanupResult.exitCode) {
    return { exitCode: cleanupResult.exitCode };
  }

  return { merged: true };
}

// ---------------------------------------------------------------------------
// #429: --sink transaction — resumable step-receipt based merge pipeline (Gitea port)
// ---------------------------------------------------------------------------

const SINK_ABORT_AFTER = process.env.KAOLA_WORKFLOW_SINK_ABORT_AFTER || '';
// #617: 'closure' (the issue-close step) runs LAST, after 'push_main' — matching the #429
// transaction direction (an issue must never close before its implementation is verified
// published). Before this fix closure ran three steps too early (before archive_commit/push_main),
// so a crash between closure and push_main left an issue closed while the merge never reached the
// remote — the exact 2026-07-06 incident.
// #619(4): 'worktree_sync' was removed — it always ran AFTER the 'merge' step's worktree removal,
// so its own `git worktree list` scan could never find a match (wtPath was always null) and its
// stepDone() recorded a no-op receipt attestation every run. The copy it used to attempt now
// happens inline in the 'merge' step, BEFORE the worktree is removed (see the merge step below).
const SINK_STEPS = ['preflight', 'push_upstream', 'merge', 'finalize', 'stash_restore', 'archive_commit', 'push_main', 'closure'];

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

// #653: dispose the sink-receipt.json / sink-fallback.json transaction journals at TERMINAL
// SUCCESS — they exist on disk only for crash-resume, never as tracked or lingering debris.
// Per-file try/catch: a failed unlink must never fail an otherwise-successful sink. Returns true
// iff no candidate journal remains on disk afterward.
function disposeSinkJournals(mainRoot, project) {
  const candidates = [
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json'),
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-fallback.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-fallback.json'),
  ];
  let allDisposed = true;
  for (const p of candidates) {
    try { fs.unlinkSync(p); } catch (e) {
      if (e && e.code === 'ENOENT') continue;
      allDisposed = false;
      process.stderr.write('sink-merge --sink: WARNING: failed to dispose sink journal ' + p + ': ' + (e.message || String(e)) + '\n');
    }
  }
  return allDisposed;
}

// #518: cycle-identity guard — stamp branch_head at init; on resume, if steps.merge is 'done'
// and branch_head diverges from the current tip (new cycle, same branch name reused), reinitialize
// all steps to pending so the merge actually runs. Genuine mid-cycle resumes (branch_head matches
// current tip) are NOT disturbed.
function loadOrInitReceipt(mainRoot, project, branch, issueNumber, issueNumbers, defBranch) {
  const receiptPath = resolveSinkReceiptPath(mainRoot, project);
  if (fs.existsSync(receiptPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (r && r.steps) {
        // #518: cycle-identity check — only applies when merge is already recorded as done
        // (the stale-receipt scenario: prior cycle completed, new cycle reuses same branch name).
        if (r.steps.merge === 'done') {
          let currentHead = null;
          try { currentHead = execFileSync('git', ['-C', mainRoot, 'rev-parse', branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) {}
          const priorHead = r.branch_head || null;
          const isNewCycle = !currentHead || !priorHead || currentHead !== priorHead;
          if (isNewCycle) {
            // Stale all-done receipt from a prior cycle — reinitialize steps to pending so
            // the merge runs fresh. Return newCycle:true so runSinkTransaction defers the first
            // disk write until after the merge-step checkout (the stale file remains on disk,
            // unmodified, so git checkout <branch> does not abort with "local changes would be
            // overwritten" when the receipt is a tracked file shared by both branches).
            const freshSteps = {};
            for (const s of SINK_STEPS) freshSteps[s] = 'pending';
            const freshReceipt = {
              project, branch,
              issue_number: issueNumber || r.issue_number || null,
              issue_numbers: issueNumbers && issueNumbers.length ? issueNumbers : (issueNumber ? [issueNumber] : (r.issue_numbers || [])),
              resolved_default_branch: defBranch || r.resolved_default_branch,
              branch_head: currentHead || null,
              started_at: new Date().toISOString(), updated_at: new Date().toISOString(),
              stash_ref: null, removed_duplicates: [],
              steps: freshSteps
            };
            return { receipt: freshReceipt, receiptPath, newCycle: true };
          }
        }
        return { receipt: r, receiptPath };
      }
    } catch (_) {}
  }
  // No existing receipt — initialize fresh. Stamp branch_head for future cycle-identity checks.
  let branchHead = null;
  try { branchHead = execFileSync('git', ['-C', mainRoot, 'rev-parse', branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) {}
  const steps = {};
  for (const s of SINK_STEPS) steps[s] = 'pending';
  const receipt = {
    project, branch, issue_number: issueNumber || null,
    issue_numbers: issueNumbers && issueNumbers.length ? issueNumbers : (issueNumber ? [issueNumber] : []),
    resolved_default_branch: defBranch,
    branch_head: branchHead,
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

// #552: fail-closed backstop against the lane-group crash-window desync. A clean write-parallel group
// completion DELETES the running-set lane_group key (adaptive-node closeGroupMember last-member path); a
// residual key at sink time means the group never synthesized + merged its legs, so surviving legs' committed
// work is NOT on the branch and advancing main would be the #552 silent loss. Dual-location read (live +
// post-finalize archive), pure read, zero mutation; returns a typed refusal or null.
function lingeringLaneGroupRefusal(mainRoot, project) {
  const locations = [
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'running-set.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'running-set.json'),
  ];
  for (const rsPath of locations) {
    let rs;
    try { rs = JSON.parse(fs.readFileSync(rsPath, 'utf8')); } catch (_) { continue; } // absent/unreadable: try next
    const lg = rs && rs.lane_group;
    const members = (lg && Array.isArray(lg.members)) ? lg.members : [];
    if (lg && members.length > 0) {
      const legCount = (lg.legs && typeof lg.legs === 'object') ? Object.keys(lg.legs).length : 0;
      return {
        ok: false,
        reason: 'lingering_lane_group',
        detail: 'running-set.json (' + rsPath + ') still carries a lane_group "' + (lg.group_id || '(unknown)') +
          '" with ' + members.length + ' member(s) and ' + legCount + ' leg(s). A clean write-parallel group ' +
          'completion DELETES the lane_group key; a residual key means the group never ran its synthesizer + ' +
          'group barrier (the #552 crash-window desync), so surviving legs\' committed work is NOT on the feature ' +
          'branch. Refusing to sink — main must not advance with code missing. Run reconcile-running-set, resume ' +
          'the adaptive run so the last member synthesizes + merges all legs, then re-run --sink.',
      };
    }
  }
  return null;
}

function sinkPreflight(mainRoot, project, branch, issueNumbers) {
  // #552: lane-group backstop FIRST — a pure read, zero mutation, BEFORE the dirty-tree scan/stash.
  const laneGroupRefusal = lingeringLaneGroupRefusal(mainRoot, project);
  if (laneGroupRefusal) return laneGroupRefusal;

  // #562: worktree-clean data-loss guard — the --sink merge step force-removes the linked worktree with
  // NO clean precondition, so a dirty worktree's uncommitted work would be destroyed. Mirror the legacy
  // path's assertWorktreeClean. It throws on a dirty OR unprobeable worktree (fail-closed); convert to
  // the typed refusal sinkPreflight returns. Resume-safe: an already-removed worktree returns cleanly.
  try {
    assertWorktreeClean(mainRoot, branch);
  } catch (err) {
    return { ok: false, reason: 'worktree_dirty', detail: err.message };
  }

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
    // #518: the sink's own receipt file (live OR archive path) is sink-owned — exempt it.
    // It may appear as ?? (untracked) or D  (tracked deletion from a prior loadOrInitReceipt).
    const sinkReceiptPaths = new Set([
      'kaola-workflow/' + project + '/.cache/sink-receipt.json',
      'kaola-workflow/archive/' + project + '/.cache/sink-receipt.json',
    ]);
    if (sinkReceiptPaths.has(filePath)) continue;
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
  const { receipt, receiptPath, newCycle } = loadOrInitReceipt(mainRoot, args.project, args.branch, args.issue, args.issueNumbers, defBranch);
  const stepDone = (step) => {
    receipt.steps[step] = 'done'; receipt.updated_at = new Date().toISOString();
    // #518: for a new-cycle reinit, skip writing the receipt at the preflight step —
    // the stale receipt is a committed tracked file on both main and the feature branch;
    // writing it before git checkout <branch> in the merge step causes a checkout conflict.
    if (step === 'preflight' && newCycle) return;
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
        process.stdout.write(JSON.stringify({ result: 'refuse', reason: preResult.reason || 'sink_blocked', ...(preResult.foreign_dirt ? { foreign_dirt: preResult.foreign_dirt } : {}), detail: preResult.detail }) + '\n');
        process.exitCode = 1; return;
      }
      if (preResult.stashRef) receipt.stash_ref = preResult.stashRef;
      if (preResult.removedDuplicates) receipt.removed_duplicates = preResult.removedDuplicates;
      stepDone('preflight'); continue;
    }
    if (step === 'push_upstream') {
      if (!OFFLINE) {
        try {
          if (FORCE_PUSH_UPSTREAM_FAIL) throw new Error('[TEST ONLY] KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL — push upstream forced to fail');
          execFileSync('git', ['-C', mainRoot, 'push', '-u', 'origin', args.branch], { encoding: 'utf8' });
        } catch (_) {
          // Already pushed, or the push failed transiently — the parity check below is the
          // authoritative signal, not this exit code.
        }
        // #619(3): the old code swallowed every push failure and unconditionally recorded
        // stepDone — a genuinely failed push left the branch un-backed-up on the remote while the
        // receipt attested push_upstream:done. Verify branch@{u} parity (mirrors
        // assertBranchPushedToUpstream's ahead-count check) instead of trusting the push exit code.
        let parityOk = false;
        try {
          const upstream = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', args.branch + '@{u}'],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          const ahead = parseInt(
            execFileSync('git', ['-C', mainRoot, 'rev-list', '--count', upstream + '..' + args.branch], { encoding: 'utf8' }).trim(),
            10
          );
          parityOk = ahead === 0;
        } catch (_) { parityOk = false; }
        if (!parityOk) {
          receipt.push_upstream = 'failed';
          receipt.updated_at = new Date().toISOString();
          writeSinkReceipt(receiptPath, receipt);
          process.stderr.write('sink-merge --sink: push upstream failed: branch ' + args.branch + ' is not at parity with its upstream after push.\n');
          process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'sink_incomplete', step: 'push_upstream', push_upstream: 'failed', branch: args.branch, detail: '`git push -u origin ' + args.branch + '` did not verifiably reach parity with its upstream — the feature branch may not be backed up on the remote. Refusing to report status:sinked. The push_upstream step is left NOT done so a re-run retries it. Resolve the push fault (or push manually: git push -u origin ' + args.branch + ') and re-run --sink.' }) + '\n');
          process.exitCode = 1; return;
        }
      }
      stepDone('push_upstream'); continue;
    }
    if (step === 'merge') {
      // #619(4): capture (stage) the linked worktree's project folder BEFORE removing the
      // worktree, then land the staged copy into mainRoot only AFTER checkout — and only when the
      // branch itself does NOT already track kaola-workflow/<project>/ there. The old code ran a
      // SEPARATE worktree_sync step AFTER this removal (and after the branch's own worktree
      // registration was gone), so it could never find a matching `git worktree list` block —
      // wtPath was always null and its stepDone() recorded a no-op every single time. Landing the
      // copy straight into mainRoot BEFORE checkout (an earlier version of this fix) regressed:
      // when the branch commits kaola-workflow/<project>/ itself (a worktree-native run that
      // commits live state), an untracked pre-checkout copy at that exact path collides with the
      // SAME tracked path and `git checkout` refuses to overwrite it. Staging first, then landing
      // only when mainProjDir is still absent post-checkout, mirrors the original worktree_sync
      // guard (`!fs.existsSync(mainProjDir)`) safely.
      let wtStageDir = null;
      try {
        const folder = readActiveFolders(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project);
        let wtPath = null;
        try { wtPath = (folder && folder.worktree_path) || worktreePathFor(mainRoot, args.project); } catch (_) {}
        if (wtPath && fs.existsSync(wtPath)) {
          const wtProjDir = path.join(wtPath, 'kaola-workflow', args.project);
          if (fs.existsSync(wtProjDir)) {
            try {
              wtStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wtsync-'));
              sinkCopyDir(wtProjDir, wtStageDir);
            } catch (_) { wtStageDir = null; }
          }
        }
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
      // Land the staged worktree-only content now that checkout has resolved whether the branch
      // itself tracks kaola-workflow/<project>/ — copy only when it's still absent; else discard.
      if (wtStageDir) {
        try {
          const mainProjDir = path.join(mainRoot, 'kaola-workflow', args.project);
          if (!fs.existsSync(mainProjDir)) sinkCopyDir(wtStageDir, mainProjDir);
        } catch (_) {}
        try { fs.rmSync(wtStageDir, { recursive: true, force: true }); } catch (_) {}
      }
      stepDone('merge'); continue;
    }
    if (step === 'finalize') {
      try { const { archiveProjectDir } = require('./kaola-gitea-workflow-claim'); archiveProjectDir(mainRoot, args.project, 'closed', undefined, { keepWorktree: false }); } catch (e) { if (e instanceof TypeError || e instanceof ReferenceError) throw e; /* #555: re-throw a missing-export programmer error (the #550 drift class); swallow only archive-already-exists idempotency */ }
      stepDone('finalize'); continue;
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
        // #520: exclude crash-resume journals from staging (must persist on disk, must not be committed).
        const exRcpt = ':(exclude)kaola-workflow/archive/' + args.project + '/.cache/sink-receipt.json';
        const exFb = ':(exclude)kaola-workflow/archive/' + args.project + '/.cache/sink-fallback.json';
        try { execFileSync('git', ['-C', mainRoot, 'add', '--', ps, exRcpt, exFb], { encoding: 'utf8' }); } catch (_) {}
        let hasStaged = false;
        try { execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--quiet', '--', ps], { stdio: 'ignore' }); }
        catch (e) { if (e && e.status === 1) hasStaged = true; }
        // #521: the COMMIT-side :(exclude) is defensive against a state the live --sink flow cannot
        // currently reach (`git commit -- <ps>` would re-sweep an already-tracked, modified journal,
        // but a pre-tracked band makes archiveProjectDir suffix the dest so the commit never fires
        // with a tracked journal). Kept (do NOT drop as redundant). See #521 for the reachability matrix.
        if (hasStaged) { try { execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: archive ' + args.project + ' [sink]', '--', ps, exRcpt, exFb], { encoding: 'utf8' }); } catch (_) {} }
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
      stepDone('push_main');
      // #517: keep-open verification — if keepIssueOpen was set, the merge commit body may have
      // contained a "close/fix/resolve #N" keyword that caused the forge to auto-close the issue at
      // push time. Post-push, probe the live issue state; if it is now CLOSED, reopen it (tea issues
      // edit --state open) and record the event in the receipt so callers can detect + audit it.
      if (!OFFLINE && args.keepIssueOpen && args.issue != null) {
        try {
          if (probeIssueClosed(args.issue, {})) {
            forge.teaExec(['issues', 'edit', '--state', 'open', String(args.issue)], {});
            receipt.remote_issue_closed = 'reopened_after_autoclose';
            receipt.updated_at = new Date().toISOString();
            writeSinkReceipt(receiptPath, receipt);
          }
        } catch (_) {}
      }
      continue;
    }
    if (step === 'closure') {
      // #617: remote-closed-after-publish HARD GATE. SINK_STEPS now runs 'merge' + 'push_main'
      // BEFORE this step, so the branch should already be an ancestor of defBranch by
      // construction. Verify it explicitly and refuse LOUD (non-zero exit + a RED receipt field)
      // rather than trust the ordering alone: a resumed/stale receipt, or any future reordering
      // bug, must never be able to close an issue before the merge is verified actually published.
      // This is the exact assertion the 2026-07-06 incident needed.
      // NOTE: resolve the branch's CURRENT tip here (not receipt.branch_head, which is stamped at
      // receipt init BEFORE the 'merge' step's doRebase runs) — a rebase rewrites the branch's
      // commits, orphaning the pre-rebase SHA even though the (rebased) content did land on
      // defBranch. The branch ref itself still exists at this point (teardown runs only after
      // the whole step loop completes), so re-resolving it here is safe and always current.
      {
        let implRef = null;
        try {
          implRef = execFileSync('git', ['-C', mainRoot, 'rev-parse', args.branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        } catch (_) {}
        let published = false;
        if (implRef) {
          try {
            execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', implRef, defBranch], { encoding: 'utf8', stdio: 'ignore' });
            published = true;
          } catch (_) { published = false; }
        }
        receipt.remote_closed_after_publish = published ? 'verified' : 'failed';
        if (published) {
          // #631: stamp a NEW, ADDITIVE published_head once the live tip resolves as published —
          // this NEVER mutates branch_head (stamped once at receipt init; load-bearing for the
          // #518 cycle-identity guard). branch_head can go stale after doRebase rewrites the
          // branch's commits; published_head is the FRESH tip resolved here, letting a caller
          // (cmdVerifySink) tell a rebased-but-genuinely-published branch apart from a truly
          // unpublished one without disturbing branch_head.
          receipt.published_head = implRef;
        }
        if (!published) {
          receipt.updated_at = new Date().toISOString();
          writeSinkReceipt(receiptPath, receipt);
          process.stdout.write(JSON.stringify({
            result: 'refuse',
            reason: 'remote_closed_after_publish_unverified',
            branch: args.branch,
            default_branch: defBranch,
            detail: 'refusing to close any issue: the recorded implementation commit (' + (implRef || '(unknown)') +
              ') is not an ancestor of ' + defBranch + ' — the merge was never verified as actually published. ' +
              'No issue was closed. The closure step is left NOT done so a re-run retries it once the merge state is resolved.',
          }) + '\n');
          process.exitCode = 1;
          return;
        }
      }
      // Gitea: use forge.closeIssue / forge.updateIssueLabels (tea CLI nouns)
      // #497: a HARD close failure (a member that genuinely won't close AND is not already-closed)
      // must NOT report status:sinked. Bucket each member into closed/failed, record
      // remote_issue_closed in the receipt, and on ANY genuine failure do NOT stepDone — emit a
      // non-sinked refusal so the caller can retry.
      // #592: the gate used to be `args.issue != null` only — a bundle sink invoked with ONLY
      // `--issue-numbers A,B` (no primary `--issue`) tripped this gate false, skipping the ENTIRE
      // close loop, yet execution still fell through to stepDone('closure') below — the receipt
      // reported closure:done having closed zero issues. Run the loop whenever a primary OR any
      // bundle member is present.
      if (!OFFLINE && (args.issue != null || (Array.isArray(args.issueNumbers) && args.issueNumbers.length > 0)) && !args.keepIssueOpen) {
        const closed = [];
        const failed = [];
        const closeOne = (n) => {
          if (probeIssueClosed(n, {})) { closed.push(n); return; }
          try {
            forge.closeIssue(n, {});
            // #619(2): probe the live state on the success path too — a non-throwing close is not
            // proof the issue is actually closed (a rare forge/API race can leave it open).
            if (probeIssueClosed(n, {})) { closed.push(n); }
            else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: close reported success for ' + n + ' but the issue is still OPEN\n'); }
          }
          catch (e) {
            if (probeIssueClosed(n, {})) { closed.push(n); }
            else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: PR/issue close failed for ' + n + '; manually run: tea issues close ' + n + '\n'); }
          }
        };
        if (args.issue != null) {
          closeOne(args.issue);
          try { forge.updateIssueLabels(null, args.issue, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
        }
        // Bundle members — includes the no-primary bundle shape (#592): when args.issue is
        // absent, every member in args.issueNumbers is closed (none is "the primary" to skip).
        if (Array.isArray(args.issueNumbers) && args.issueNumbers.length > (args.issue != null ? 1 : 0)) {
          for (const n of args.issueNumbers) {
            if (n === args.issue) continue;
            closeOne(n);
            try { forge.updateIssueLabels(null, n, { remove: [forge.CLAIM_LABEL] }); } catch (_) {}
          }
        }
        // #592: record the actually-closed set on the receipt (both the success and failure
        // paths) so a resume can VERIFY-then-retry against it rather than silently skip.
        if (closed.length > 0) receipt.closed_issues = closed.slice().sort((a, b) => a - b);
        // #497: only the FAILURE path refuses — SUCCESS still falls straight through to
        // stepDone('closure') below (now carrying receipt.closed_issues per #592).
        if (failed.length > 0) {
          receipt.remote_issue_closed = 'partial'; receipt.updated_at = new Date().toISOString(); writeSinkReceipt(receiptPath, receipt);
          process.stdout.write(JSON.stringify({ result: 'refuse', reason: 'sink_incomplete', step: 'closure', remote_issue_closed: 'partial', closed_issues: closed.sort((a, b) => a - b), failed_issue_closures: failed.sort((a, b) => a - b), branch: args.branch, detail: 'the merge landed but ' + failed.length + ' issue(s) could not be closed on the forge (' + failed.join(', ') + '). Refusing to report status:sinked. The closure step is left NOT done so a re-run retries it. Manually close the issue(s) or resolve the forge fault, then re-run --sink.' }) + '\n');
          process.exitCode = 1; return;
        }
      }
      stepDone('closure'); continue;
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
  // #653: dispose the crash-resume journals now that finalReceipt is captured — strictly after
  // every step, the freshness guard, and teardown, so an earlier crash leaves the journal intact.
  const journalDisposed = disposeSinkJournals(mainRoot, args.project);
  process.stdout.write(JSON.stringify({ result: 'ok', status: 'sinked', journal_disposed: journalDisposed, receipt: finalReceipt }) + '\n');
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
