#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getCoordRoot, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, checkDispatchAttestations, defaultBranch } = require('./kaola-workflow-claim.js');

const OFFLINE = process.env.KAOLA_WORKFLOW_OFFLINE === '1';
const FORCE_FF_FAIL = parseInt(process.env.KAOLA_WORKFLOW_FORCE_FF_FAIL || '0', 10);
// #350: test-only — skip the npm-test gate that doRebase / the FF-loop re-rebase run after a
// rebase, so an integration test can exercise the re-rebase race without recursively invoking
// the whole suite. Never set in production.
const SKIP_TESTGATE = process.env.KAOLA_WORKFLOW_SKIP_TESTGATE === '1';
// #350: test-only — a directory (a prepared clone) whose pending commit is pushed to
// origin/<defBranch> ONCE before the first FF, simulating an origin advance mid-flight. Never
// set in production; the operation is a fixed `git push`, not arbitrary exec.
const FF_RACE_PUSH_DIR = process.env.KAOLA_WORKFLOW_FF_RACE_PUSH_DIR || '';
const FORCE_MERGE_IMPOSSIBLE = process.env.KAOLA_WORKFLOW_FORCE_MERGE_IMPOSSIBLE || '';
// #496: test-only — force the assertWorktreeClean status probe to THROW, simulating a transient
// git-status fault (index.lock held / EAGAIN / EMFILE). Proves the guard fails CLOSED. Never set in
// production; it only makes a probe we already run throw.
const FORCE_WT_STATUS_FAIL = process.env.KAOLA_WORKFLOW_FORCE_WT_STATUS_FAIL === '1';
// #506: test-only — force the assertWorktreeClean outer `git worktree list` probe to THROW,
// simulating a transient fault in enumeration. Proves the outer guard fails CLOSED. Never set in
// production; it only makes the probe we already run throw.
const FORCE_WT_LIST_FAIL = process.env.KAOLA_WORKFLOW_FORCE_WT_LIST_FAIL === '1';
// #497: test-only — force the push_main step to THROW, simulating a transient push failure. Proves
// the --sink transaction does NOT false-report status:sinked when the deliverable never reached the
// remote. Never set in production; it only makes the push we already run throw.
const FORCE_PUSH_MAIN_FAIL = process.env.KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL === '1';
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

// #396.5: returns true iff issue N is already CLOSED on the forge. Used to classify a `gh issue
// close` that exited 1 (idempotent re-run after a push→close crash): an already-closed issue is a
// SUCCESS, not a failed closure. Any probe error returns false (fail toward 'failed' — never claim
// a member closed without evidence).
function probeIssueClosed(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return false;
  try {
    const out = ghExec(['issue', 'view', String(issueNumber), '--json', 'state', '--jq', '.state'], opts);
    return String(out || '').trim().toLowerCase() === 'closed';
  } catch (_) { return false; }
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
    // #476: value flags must NOT greedily swallow a `--`-prefixed token as their value — else
    // `--project --help` (or `--branch --bogus`) consumes the flag as a value and the help/unknown gate
    // never fires, letting the destructive transaction run. A real value (branch name, project, issue
    // number) never starts with `--`, so requiring `!next.startsWith('--')` is safe AND closes the hole
    // (the `--`-token then falls through to the --help / unknown-flag handling). Mirrors claim.js.
    if (argv[i] === '--branch' && argv[i + 1] && !argv[i + 1].startsWith('-')) { args.branch = argv[++i]; continue; }
    if (argv[i] === '--issue' && argv[i + 1] && !argv[i + 1].startsWith('-')) { args.issue = parseInt(argv[++i], 10); continue; }
    // #369: bundle member set — all-or-nothing closure closes EVERY member, not just --issue.
    // #396.5: dedupe (claim.js's parser dedupes; sink-merge's did not, so a duplicate member could
    // land in TWO buckets). Sorted + unique, mirroring claim.js parseArgs.
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

const MAX_AUTOMERGE_RETRIES = 3;

function assertCleanWorktree(mainRoot) {
  // Use --untracked-files=no to ignore untracked files (e.g. kaola-workflow/ state dirs)
  // Only staged and unstaged changes to tracked files block the checkout.
  const status = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
  assert(!status, 'Worktree must be clean before sink-merge checks out the requested branch');
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
// sink that was about to refuse (dirty main root / live folder / unpushed) first DESTROYED the
// worktree, taking any uncommitted work with it. This guard runs before the destructive removal so
// a refused sink leaves the worktree (and its uncommitted file) intact.
function assertWorktreeClean(mainRoot, branch) {
  // #506: the outer `git worktree list` probe is the first gate before the inner status probe.
  // A transient fault here (e.g. corrupt worktree metadata, EAGAIN) must FAIL CLOSED — a probe
  // that cannot enumerate worktrees cannot prove there is nothing to guard. One bounded retry
  // absorbs a momentary fault before refusing.
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
    // #496: this status probe is the ONLY gate before a destructive `git worktree remove --force`.
    // It must FAIL CLOSED: a probe that cannot PROVE the worktree clean (transient git fault —
    // index.lock held, EAGAIN, EMFILE) is treated as DIRTY and refuses, never swallowed as clean.
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
  // AC7 (#264): refuse a sink whose entire diff vs origin/<defBranch> is kaola-workflow/**
  // bookkeeping — the branch carries no implementation. Skip when the base is unresolvable (mirror
  // alreadyUpToDate: no integration base to diff against → cannot judge, do not block).
  const baseRef = 'origin/' + defBranch;
  let base;
  try {
    base = execFileSync('git', ['-C', mainRoot, 'rev-parse', '--verify', baseRef],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) { return; } // base missing → skip (same posture as merge-base skip-check)
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
    // #397.2: after a conflict re-run, attempt 1 already pushed the PRE-rebase tip, so a plain
    // `git push` is guaranteed a non-fast-forward rejection. The correct push is force-with-lease.
    'Push before merging: git push --force-with-lease origin ' + branch + '\n' +
    '(a plain `git push` is rejected non-fast-forward if attempt 1 already pushed a pre-rebase tip).\n\n' +
    'Unpushed commits:\n  ' + commits.split('\n').join('\n  ')
  );
}

// Step 4 — post-rebase validation gate. Skipped OFFLINE (callers own their own validation) or
// under the #350 test-gate-skip hook (so an integration test can exercise the re-rebase race
// without recursively running the whole suite).
function runTestGate(mainRoot) {
  if (!OFFLINE && !SKIP_TESTGATE) {
    execFileSync('npm', ['test'], { cwd: mainRoot, encoding: 'utf8', stdio: 'inherit' });
  }
}

// Steps 3–4: rebase onto origin/<defBranch> and run post-rebase tests.
function doRebase(args, alreadyUpToDate, mainRoot, defBranch) {
  // Step 3 — Rebase (inline error message; no external file needed)
  if (!alreadyUpToDate) {
    try {
      execFileSync('git', ['-C', mainRoot, 'rebase', 'origin/' + defBranch], { encoding: 'utf8' });
    } catch (e) {
      throw new Error(
        'Rebase failed: ' + e.message + '\n' +
        'Remediation:\n' +
        '  1. Run: git rebase --abort\n' +
        '  2. Resolve conflicts manually on the feature branch\n' +
        '  3. Re-run: git rebase origin/' + defBranch + '\n' +
        // #397.2: if attempt 1 already pushed (assertBranchPushedToUpstream self-heal / a prior run),
        // the post-rebase push must be force-with-lease — a plain push is rejected non-fast-forward.
        '  4. Push the rebased branch: git push --force-with-lease origin ' + args.branch + '\n' +
        '  5. Re-invoke sink-merge after conflicts are resolved\n' +
        '  Note: Step 0 already removed the linked worktree (often your cwd); resolve in ' + mainRoot + '.\n' +
        'For further guidance, see the conflict remediation section in ' +
        'https://github.com/kaolabrother/Kaola-Workflow/blob/main/README.md'
      );
    }
    // Step 4 — Post-rebase validation (skipped OFFLINE / under the test-gate-skip hook).
    runTestGate(mainRoot);
  }
}

// Steps 5–6: FF-only merge loop with retry on race. Returns false when retries exhausted.
// #350: the default branch is resolved (defBranch), not hardcoded as 'main', and on an FF
// failure the feature branch is RE-REBASED onto the updated origin tip before retrying — the
// only race that makes an FF fail is origin/<defBranch> advancing after the initial rebase, and
// the pre-#350 loop retried the IDENTICAL ff-only merge without re-rebasing (so it could never
// succeed for its own target race — the loop was dead weight). On final failure the main root is
// restored to the default branch (the FF attempts leave it on the feature branch).
function ffMergeLoop(args, mainRoot, defBranch) {
  let retries = 0;
  let forcedFailCount = 0;

  const giveUp = () => {
    process.stderr.write('FF race: exhausted ' + MAX_AUTOMERGE_RETRIES + ' retries. Aborting.\n');
    process.stderr.write('Manual resolution: ensure no concurrent pushes to ' + defBranch + ' and re-run sink-merge.\n');
    try { execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' }); } catch (_) {}
    return false;
  };

  // Re-fetch + re-rebase the feature branch onto origin/<defBranch>, then re-run the test gate
  // (the base moved). Returns false on a rebase conflict or a failed gate (caller gives up).
  const reRebaseFeature = () => {
    if (OFFLINE) return true; // no origin to re-rebase against — retry the FF as-is.
    try {
      execFileSync('git', ['-C', mainRoot, 'fetch', 'origin'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'rebase', 'origin/' + defBranch], { encoding: 'utf8' });
    } catch (_) {
      try { execFileSync('git', ['-C', mainRoot, 'rebase', '--abort'], { encoding: 'utf8' }); } catch (_) {}
      // #397.2: state the worktree/cwd disposition. Step 0 already removed the linked worktree (often
      // the operator's cwd), and main is left checked out on the feature branch mid-recovery. After
      // resolving, push with --force-with-lease (a plain push is rejected non-fast-forward).
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
    // #350 test-only: a one-shot mid-flight race hook — push a prepared clone's commit to
    // origin/<defBranch> BEFORE the first pull/FF, deterministically reproducing "origin advanced
    // after the initial rebase". Fixed operation (git push from a test-provided dir), never set in
    // production. Lets the re-rebase recovery below be exercised as the load-bearing path.
    if (FF_RACE_PUSH_DIR && !raceHookFired) {
      raceHookFired = true;
      try { execFileSync('git', ['-C', FF_RACE_PUSH_DIR, 'push', 'origin', defBranch], { encoding: 'utf8' }); } catch (_) {}
    }
    // Step 5 — Pull latest default branch (skip if OFFLINE)
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'pull', '--ff-only'], { encoding: 'utf8' });
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
    }

    // Step 6 — FF-only merge onto the default branch
    execFileSync('git', ['-C', mainRoot, 'checkout', defBranch], { encoding: 'utf8' });

    // FORCE_FF_FAIL: test-only — make first FORCE_FF_FAIL attempts fail without calling git merge.
    if (forcedFailCount < FORCE_FF_FAIL) {
      forcedFailCount++;
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp();
      if (!reRebaseFeature()) return giveUp();
      continue;
    }

    let mergeSuccess = false;
    try {
      execFileSync('git', ['-C', mainRoot, 'merge', '--ff-only', '--', args.branch], { encoding: 'utf8' });
      mergeSuccess = true;
    } catch (_) {
      retries++;
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      if (retries >= MAX_AUTOMERGE_RETRIES) return giveUp();
      if (!reRebaseFeature()) return giveUp();
      continue;
    }

    if (mergeSuccess) return true;
  }
}

function postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch) {
  // Step 7 — Push (with merge-impossible auto-fallback)
  try {
    if (FORCE_MERGE_IMPOSSIBLE) {
      throw new Error('synthetic merge-impossible: ' + FORCE_MERGE_IMPOSSIBLE);
    }
    if (!OFFLINE) {
      execFileSync('git', ['-C', mainRoot, 'push', 'origin', defBranch], { encoding: 'utf8' });
    }
  } catch (e) {
    const token = classifyMergeError(e.stderr || e.message || '');
    if (token === null) {
      // Transient / unclassified error — re-throw, caller exits 1
      throw e;
    }
    // Classified merge-impossible: reset local main, write the fallback receipt, signal exit 3.
    // #394: the STANDARD lane archives the project BEFORE sink-merge runs, so the LIVE .cache is
    // gone and the old code "skipped receipt write" → the exit-3 choreography pointed the operator
    // at a sink-fallback.json that never existed, claim.js sink-fallback no-op'd, and sink-pr.js
    // crashed on the missing live folder (online, AFTER `gh pr create` → an orphaned open PR
    // invisible to every tracking surface). Now: when archived, write the receipt to the ARCHIVE
    // .cache so the fallback chain has a durable home; when live, keep writing to the live .cache.
    const liveProjectDir = path.join(mainRoot, 'kaola-workflow', args.project);
    const archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
    const wasArchived = !fs.existsSync(liveProjectDir) && fs.existsSync(archiveDir);
    try {
      execFileSync('git', ['-C', mainRoot, 'reset', '--hard', 'origin/' + defBranch], { encoding: 'utf8' });
    } catch (_) {}
    const receiptPath = wasArchived
      ? path.join(archiveDir, '.cache', 'sink-fallback.json')
      : path.join(liveProjectDir, '.cache', 'sink-fallback.json');
    if (wasArchived) {
      // keep the operator-facing breadcrumb, but the receipt now exists (in the archive .cache).
      process.stderr.write('sink-merge: project archived (' + args.project + ') — fallback receipt written to archive .cache\n');
    }
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(
      receiptPath,
      JSON.stringify({
        project: args.project,
        branch: args.branch,
        issue_number: args.issue || null,
        // #394: the fallback sink (sink-pr) needs the resolved default branch + the full member set,
        // which it cannot re-derive once the live folder is archived.
        resolved_default_branch: defBranch,
        issue_numbers: Array.isArray(args.issueNumbers) && args.issueNumbers.length ? args.issueNumbers : (args.issue ? [args.issue] : []),
        archived: wasArchived,
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
      // #427: probe before attempting close — if cmdFinalize already closed the issue, skip the
      // close call entirely (avoids a guaranteed exit-1 error in the normal finalize→sink flow).
      if (probeIssueClosed(args.issue, forgeOpts)) {
        remoteIssueClosed = 'already_closed';
        process.stderr.write('sink-merge: Issue #' + args.issue + ' already closed by cmdFinalize, skipping close.\n');
      } else {
        try { ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.'], forgeOpts); remoteIssueClosed = 'closed'; }
        catch (e) {
          // #396.5: a `gh issue close` on an ALREADY-CLOSED issue exits 1 (re-run after a push→close
          // crash). Probe before declaring failure — an already-closed issue is a SUCCESS (idempotent),
          // not a failed closure. Only a genuinely-still-open / unavailable issue is 'failed'.
          if (probeIssueClosed(args.issue, forgeOpts)) { remoteIssueClosed = 'already_closed'; }
          else { remoteIssueClosed = 'failed'; process.stderr.write('sink-merge: WARNING: issue close failed for ' + args.issue + '; receipt.remote_issue_closed=failed. Manually run: gh issue close ' + args.issue + '\n'); }
        }
      }
    }
    // Claim-label removal runs in BOTH modes (claim release is wanted on keep-open).
    try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress'], forgeOpts); claimLabelRemoved = 'removed'; } catch (_) { claimLabelRemoved = 'failed'; }

    // #403.6: keep-open BUNDLE arm. The close loop below is gated `!keepIssueOpen`, so on a keep-open
    // bundle the NON-PRIMARY members got no comment and no member-label removal — the old code relied
    // entirely on cmdFinalize's earlier per-member clearAdvisoryClaim. Make the keep-open arm
    // explicitly per-member (comment + label removal) so the division of labor is not implicit.
    if (keepIssueOpen && Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
      for (const n of args.issueNumbers) {
        if (n === args.issue) continue; // primary handled above
        try { ghExec(['issue', 'comment', String(n), '--body', 'Merged via sink-merge (bundle member). Issue intentionally kept open (partial-close terminal); residual scope remains tracked here.'], forgeOpts); } catch (_) {}
        try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
      }
    }
  }

  // #369 BUNDLE all-or-nothing closure: close EVERY member of issue_numbers, not just the primary.
  // Gated on a real bundle (issue_numbers.length > 1) so single-issue output is byte-unchanged (AC7).
  // Each member lands in exactly ONE bucket (no silent-neither, AC2): closed_issues (closed/already)
  // or failed_issue_closures (close failed online). Keep-open bundles are not closed (only commented).
  let bundleBuckets = null;
  if (!OFFLINE && !keepIssueOpen && Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
    const forgeOpts = { cwd: mainRoot };
    const closed = [], failed = [];
    // The primary (args.issue) was already closed above — bucket it by the recorded token.
    if (args.issue != null) {
      if (remoteIssueClosed === 'closed' || remoteIssueClosed === 'already_closed') closed.push(args.issue);
      else failed.push(args.issue);
    }
    for (const n of args.issueNumbers) {
      if (n === args.issue) continue; // primary handled above
      try {
        ghExec(['issue', 'close', String(n), '--comment', 'Merged via sink-merge (bundle member).'], forgeOpts);
        closed.push(n);
        try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
      } catch (e) {
        // #396.5: classify already-closed (idempotent re-run after a push→close crash) as a SUCCESS,
        // not a failed closure — `gh issue close` exits 1 on a closed issue. Probe to disambiguate.
        if (probeIssueClosed(n, forgeOpts)) {
          closed.push(n);
          try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
        } else {
          failed.push(n);
          process.stderr.write('sink-merge: WARNING: bundle member issue close failed for ' + n + '; recorded in failed_issue_closures. Manually run: gh issue close ' + n + '\n');
        }
      }
    }
    bundleBuckets = { closed_issues: closed.sort((a, b) => a - b), failed_issue_closures: failed.sort((a, b) => a - b), open_issues: [] };
    // Truthful ONLINE token: all closed → 'closed'; any failure → 'partial' (never 'skipped_offline').
    remoteIssueClosed = failed.length === 0 ? 'closed' : 'partial';
  }
  // Step 9 — Delete branch (worktree was removed in step 0)
  // #397.1: after a re-rebase race recovery the LOCAL feature branch diverges from its upstream, so
  // `git branch -d` refuses ("not fully merged to refs/remotes/origin/<branch>") on EVERY successful
  // race recovery → branch_removed:'failed' + a spurious branch-worktree-resolved violation + a
  // leftover local branch. Fix: (1) delete the REMOTE branch first (always succeeded before; the
  // re-rebase doesn't affect it), then (2) verify the local branch is an ancestor of the resolved
  // default branch (the work IS merged) and force-delete with `-D` — safe because we proved it's
  // merged into defBranch, not relying on the upstream-tracking ref `-d` checks.
  if (!OFFLINE) {
    try { execFileSync('git', ['-C', mainRoot, 'push', 'origin', '--delete', '--', args.branch], { encoding: 'utf8' }); }
    catch (_) {}
  }
  let mergedIntoDefault = false;
  try {
    execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch], { encoding: 'utf8' });
    mergedIntoDefault = true; // exit 0 → branch tip is an ancestor of defBranch (fully merged)
  } catch (_) { mergedIntoDefault = false; }
  if (mergedIntoDefault) {
    try { execFileSync('git', ['-C', mainRoot, 'branch', '-D', '--', args.branch], { encoding: 'utf8' }); branchRemoved = 'removed'; } catch (_) { branchRemoved = 'failed'; }
  } else {
    // Not provably merged — fall back to the safe `-d` (refuses on unmerged work).
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
  // M2 (#280): WARN-FIRST dispatch attestation check, archive-first (matching cmdFinalize).
  // cmdFinalize archives .cache/ before sink-merge runs, so the live path is absent;
  // check archive candidate first, then live as fallback. emptyReceipt 'failed' defaults
  // are overwritten here so a real dispatch-log (with both lines) yields 'attested'.
  checkDispatchAttestations([
    path.join(archiveDest, '.cache'),
    path.join(mainRoot, 'kaola-workflow', args.project, '.cache')
  ], receipt);
  // #369: post-attach the bundle per-member buckets (the builder filters to CLOSURE_RECEIPT_FIELDS,
  // so these arrays are attached here) BEFORE the invariant check so remote-members-closed can see them.
  if (bundleBuckets) {
    receipt.closed_issues = bundleBuckets.closed_issues;
    receipt.failed_issue_closures = bundleBuckets.failed_issue_closures;
    receipt.open_issues = bundleBuckets.open_issues;
  }
  const invariants = checkClosureInvariants(mainRoot, receipt, archiveDest);
  // #393a: surface where the member set came from (flag / state_fallback / none) so a caller can see
  // that a flag-less bundle sink derived its members from state rather than silently closing only the
  // primary.
  const emit = { status: 'merged', closure_receipt: receipt, closure_invariants: invariants };
  if (args.member_source) emit.member_source = args.member_source;
  process.stdout.write(JSON.stringify(emit) + '\n');
}

// #393a: derive the bundle member set when --issue-numbers is ABSENT. The flag was caller-trust-only
// — a bundle sink run WITHOUT it closed only the primary (the exact #369 "clean receipt over open
// members" bug, reachable by flag omission). Read issue_numbers from the LIVE state, then the ARCHIVE
// state (the standard finalize lane archives before sink-merge runs). Resolution:
//   - flag present + state absent/equal  → flag wins (source 'flag')
//   - flag absent + state present        → use state (source 'state_fallback')
//   - flag present + state DIFFERS        → flag wins, but WARN (source 'flag', mismatch:true)
//   - SINGLE-ISSUE (no issue_numbers line anywhere) → []  (source 'none') → the length>1 close-loop
//     gate never trips → byte-identical single-issue output (no misfire).
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
  return null; // no issue_numbers line on any state → single-issue (or unknown)
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
  return { members: [], source: 'none', mismatch: false }; // single-issue: no misfire (length>1 gate never trips)
}

// ---------------------------------------------------------------------------
// #429: --sink transaction — resumable step-receipt based merge pipeline
// ---------------------------------------------------------------------------

// #429: test-only hook — abort the --sink transaction after a named step completes.
// Set KAOLA_WORKFLOW_SINK_ABORT_AFTER=<step> to simulate a crash between steps.
// Never set in production.
const SINK_ABORT_AFTER = process.env.KAOLA_WORKFLOW_SINK_ABORT_AFTER || '';

// #429: ordered step names for the sink-receipt.json.
const SINK_STEPS = ['preflight', 'push_upstream', 'merge', 'worktree_sync', 'finalize', 'closure', 'stash_restore', 'archive_commit', 'push_main'];

// #429: write a sink-receipt.json atomically (temp+rename) to avoid corruption on crash.
function writeSinkReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tmp = receiptPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(receipt, null, 2) + '\n');
  fs.renameSync(tmp, receiptPath);
}

// #429: locate the sink-receipt.json — live project .cache first, archive .cache fallback.
function resolveSinkReceiptPath(mainRoot, project) {
  const live = path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json');
  const archive = path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json');
  if (fs.existsSync(live)) return live;
  if (fs.existsSync(archive)) return archive;
  // Default: write to live (or archive if live project dir is absent)
  const liveDir = path.join(mainRoot, 'kaola-workflow', project);
  if (fs.existsSync(liveDir)) return live;
  return archive;
}

// #429: load or initialize the sink receipt.
// #518: cycle-identity guard — stamp branch_head at init; on resume, if steps.merge is 'done'
// and branch_head diverges from the current tip (new cycle, same branch name reused), reinitialize
// all steps to pending so the merge actually runs. Genuine mid-cycle resumes (branch_head matches
// current tip) are NOT disturbed.
// Returns { receipt, receiptPath, newCycle } where newCycle=true signals a stale-cycle reinit.
// A newCycle receipt must NOT be written to disk before the merge-step git checkout — the stale
// receipt may be a committed tracked file on both main and the feature branch; modifying it before
// `git checkout <branch>` causes a checkout conflict. The first disk write is deferred to the
// merge step, after which the checked-out content matches main and the overwrite is safe.
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
              started_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              stash_ref: null,
              removed_duplicates: [],
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
    project,
    branch,
    issue_number: issueNumber || null,
    issue_numbers: issueNumbers && issueNumbers.length ? issueNumbers : (issueNumber ? [issueNumber] : []),
    resolved_default_branch: defBranch,
    branch_head: branchHead,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stash_ref: null,
    removed_duplicates: [],
    steps
  };
  return { receipt, receiptPath };
}

// #429: copy a directory tree (inline, same as copyDir in claim.js — no import needed).
function sinkCopyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) sinkCopyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// #429: preflight — classify the dirty tree into three buckets and handle them.
// Returns { ok: true, stashRef, removedDuplicates } on success, or
// { ok: false, reason: 'sink_blocked', foreign_dirt: [...] } on foreign dirt.
// INVARIANT: if foreign_dirt is non-empty, NO mutation occurs.
function sinkPreflight(mainRoot, project, branch, issueNumbers) {
  const porcelain = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '-uall'], { encoding: 'utf8' });
  const lines = porcelain.split('\n').filter(Boolean);

  // Collect registered worktree paths so we can exclude them from foreign-dirt classification.
  // Registered worktrees show up as untracked dirs in git status -uall if not gitignored.
  const worktreePaths = new Set();
  try {
    const list = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    for (const block of list.split(/\n\n+/)) {
      const m = block.match(/^worktree (.+)$/m);
      if (m) {
        // Convert to a path relative to mainRoot for comparison with porcelain output
        const absWt = m[1];
        try {
          const rel = require('path').relative(mainRoot, absWt);
          // Only track paths that are inside the main root (sibling worktrees are outside)
          if (!rel.startsWith('..')) worktreePaths.add(rel.replace(/\\/g, '/'));
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Issue numbers as a Set for quick lookup (roadmap-source matching)
  const issueSet = new Set((issueNumbers || []).map(n => String(n)));

  // Three buckets
  const roadmapSources = [];   // bucket 1: auto-stash
  const projDuplicates = [];   // bucket 2: byte-superset verify+remove
  const foreignDirt = [];       // bucket 3: refuse

  for (const line of lines) {
    // porcelain v1: XY path (or XY old -> new for renames)
    const xy = line.slice(0, 2);
    let filePath = line.slice(3).trim();
    // Handle rename notation "old -> new"
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ')[1].trim();
    }

    // Bucket 1: claim-time roadmap source for THIS sink's issue numbers
    // Pattern: kaola-workflow/.roadmap/issue-N.md where N ∈ issueNumbers
    const roadmapMatch = filePath.match(/^kaola-workflow\/\.roadmap\/issue-(\d+)\.md$/);
    if (roadmapMatch && issueSet.has(roadmapMatch[1])) {
      roadmapSources.push(filePath);
      continue;
    }

    // Bucket 2: untracked project-state duplicate — only for THIS project, only if untracked (??)
    const projStateFiles = [
      'kaola-workflow/' + project + '/workflow-plan.md',
      'kaola-workflow/' + project + '/workflow-state.md',
      'kaola-workflow/' + project + '/workflow-tasks.json',
      'kaola-workflow/' + project + '/.cache/dispatch-log.jsonl'
    ];
    if (xy === '??' && projStateFiles.includes(filePath)) {
      // Verify byte-superset: the branch must carry this file
      let branchHas = false;
      try {
        execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', branch + ':' + filePath],
          { encoding: 'utf8', stdio: ['ignore', 'ignore', 'ignore'] });
        branchHas = true;
      } catch (_) {}
      if (branchHas) {
        projDuplicates.push(filePath);
        continue;
      }
    }

    // #518: the sink's own receipt file (live OR archive path) is sink-owned. It may appear as
    // untracked (??) if the project is active, or as a tracked deletion (D ) if loadOrInitReceipt
    // detected a stale prior-cycle receipt (and the stale receipt was committed by archive_commit
    // in a prior sink). Either way it must NOT be treated as foreign dirt — the sink will overwrite
    // it. We exempt it unconditionally here; the actual write is handled by writeSinkReceipt.
    const sinkReceiptPaths = new Set([
      'kaola-workflow/' + project + '/.cache/sink-receipt.json',
      'kaola-workflow/archive/' + project + '/.cache/sink-receipt.json',
    ]);
    if (sinkReceiptPaths.has(filePath)) continue;

    // Exclude registered linked worktrees — they appear as untracked dirs in git status -uall
    // but are managed by git and not owned by any issue. Their presence is expected during a
    // parallel-issue sink and must NOT block the sink.
    const isWorktreePath = worktreePaths.has(filePath) ||
      Array.from(worktreePaths).some(wt => filePath === wt + '/' || filePath.startsWith(wt + '/'));
    if (isWorktreePath) continue;

    // Bucket 3: foreign dirt — anything else
    foreignDirt.push(filePath);
  }

  // If ANY bucket-3 paths exist, refuse with ZERO mutation
  if (foreignDirt.length > 0) {
    return {
      ok: false,
      reason: 'sink_blocked',
      foreign_dirt: foreignDirt,
      detail: 'main checkout carries changes not owned by this sink; resolve (commit/stash/restore) before re-running. This sink never touches another project\'s files.'
    };
  }

  // Safe to mutate: handle bucket 1 (stash) and bucket 2 (remove duplicates)
  let stashRef = null;
  if (roadmapSources.length > 0) {
    try {
      execFileSync('git', ['-C', mainRoot, 'stash', 'push', '-m', 'kw-sink-' + project, '--', ...roadmapSources],
        { encoding: 'utf8' });
      // Capture the stash ref
      try {
        const stashList = execFileSync('git', ['-C', mainRoot, 'stash', 'list', '--format=%gd %gs'], { encoding: 'utf8' });
        const stashLine = stashList.split('\n').find(l => l.includes('kw-sink-' + project));
        if (stashLine) stashRef = stashLine.split(' ')[0];
      } catch (_) { stashRef = 'stash@{0}'; }
    } catch (_) {
      // Stash failed — treat files as already handled (they may already be stashed)
    }
  }

  const removedDuplicates = [];
  for (const dup of projDuplicates) {
    try {
      fs.unlinkSync(path.join(mainRoot, dup));
      removedDuplicates.push(dup);
    } catch (_) {}
  }

  return { ok: true, stashRef, removedDuplicates };
}

// #429: the main --sink transaction.
function runSinkTransaction(rawArgs, mainRoot, defBranch) {
  const args = rawArgs;

  // Resolve the receipt path and load/init the receipt.
  // newCycle=true means loadOrInitReceipt detected a stale prior-cycle receipt and reinit'd — the
  // stale file remains on disk (unmodified) so git checkout <branch> in the merge step does not
  // abort; the first disk write is therefore deferred to stepDone('merge').
  const { receipt, receiptPath, newCycle } = loadOrInitReceipt(mainRoot, args.project, args.branch,
    args.issue, args.issueNumbers, defBranch);

  // Helper: mark a step done and persist
  const stepDone = (step) => {
    receipt.steps[step] = 'done';
    receipt.updated_at = new Date().toISOString();
    // #518: for a new-cycle reinit, skip writing the receipt at the preflight step.
    // The stale receipt is a committed tracked file on both main and the feature branch.
    // Writing it (with new content) before git checkout <branch> in the merge step would
    // modify a tracked file that the feature branch also has, causing checkout to abort with
    // "your local changes would be overwritten". First write is deferred to merge step.
    if (step === 'preflight' && newCycle) return;
    writeSinkReceipt(receiptPath, receipt);
    // #429 test-only abort hook
    if (SINK_ABORT_AFTER && SINK_ABORT_AFTER === step) {
      process.stderr.write('[TEST ONLY] KAOLA_WORKFLOW_SINK_ABORT_AFTER=' + step + ' — aborting sink transaction\n');
      process.exitCode = 99;
      process.exit(99);
    }
  };

  // Walk SINK_STEPS in order; skip 'done' steps
  for (const step of SINK_STEPS) {
    if (receipt.steps[step] === 'done') continue;

    if (step === 'preflight') {
      // Re-derive issue numbers in case they changed
      const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
      args.issueNumbers = memberSet.members;
      args.member_source = memberSet.source;

      const preResult = sinkPreflight(mainRoot, args.project, args.branch, args.issueNumbers);
      if (!preResult.ok) {
        // sink_blocked: emit structured refusal and exit 1
        const out = {
          result: 'refuse',
          reason: 'sink_blocked',
          foreign_dirt: preResult.foreign_dirt,
          detail: preResult.detail
        };
        process.stdout.write(JSON.stringify(out) + '\n');
        process.exitCode = 1;
        return;
      }
      // Record preflight outcomes in receipt
      if (preResult.stashRef) receipt.stash_ref = preResult.stashRef;
      if (preResult.removedDuplicates) receipt.removed_duplicates = preResult.removedDuplicates;
      stepDone('preflight');
      continue;
    }

    if (step === 'push_upstream') {
      // Push the feature branch to upstream (idempotent)
      if (!OFFLINE) {
        try {
          execFileSync('git', ['-C', mainRoot, 'push', '-u', 'origin', args.branch], { encoding: 'utf8' });
        } catch (_) {
          // Already pushed or no remote — acceptable
        }
      }
      stepDone('push_upstream');
      continue;
    }

    if (step === 'merge') {
      // Remove the linked worktree FIRST so we can check out the feature branch in mainRoot.
      // The worktree_sync step (which copies worktree→main) must run BEFORE merge if needed.
      // In the --sink transaction, the worktree_sync step runs AFTER merge; on first run the
      // worktree is still present here so we must remove it before checking out the branch.
      try {
        const { removeWorktree: removeWt, readActiveFolders: readAF } = require('./kaola-workflow-claim.js');
        const folder = readAF(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project);
        removeWt(mainRoot, args.project, folder);
      } catch (_) {}

      // Resolve merge base for up-to-date check
      const originRef = 'origin/' + defBranch;
      let alreadyUpToDate = false;
      try {
        const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', originRef],
          { encoding: 'utf8' }).trim();
        const originHead = execFileSync('git', ['-C', mainRoot, 'rev-parse', originRef],
          { encoding: 'utf8' }).trim();
        alreadyUpToDate = (mergeBase === originHead);
      } catch (_) { alreadyUpToDate = true; }

      // Check out feature branch (worktree now removed, branch ref freed)
      execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });
      doRebase(args, alreadyUpToDate, mainRoot, defBranch);
      if (!ffMergeLoop(args, mainRoot, defBranch)) {
        process.stderr.write('sink-merge --sink: FF merge failed after retries\n');
        process.exitCode = 2;
        return;
      }
      stepDone('merge');
      continue;
    }

    if (step === 'worktree_sync') {
      // Sync the worktree project folder → main project folder (inline copyDir)
      // Find the linked worktree path for this project
      let wtPath = null;
      try {
        const list = execFileSync('git', ['-C', mainRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
        for (const block of list.split(/\n\n+/)) {
          const pathLine = block.match(/^worktree (.+)$/m);
          const branchLine = block.match(/^branch refs\/heads\/(.+)$/m);
          if (pathLine && branchLine && branchLine[1] === args.branch) {
            wtPath = pathLine[1];
            break;
          }
        }
      } catch (_) {}
      if (wtPath) {
        const wtProjDir = path.join(wtPath, 'kaola-workflow', args.project);
        const mainProjDir = path.join(mainRoot, 'kaola-workflow', args.project);
        if (fs.existsSync(wtProjDir) && !fs.existsSync(mainProjDir)) {
          sinkCopyDir(wtProjDir, mainProjDir);
        }
      }
      stepDone('worktree_sync');
      continue;
    }

    if (step === 'finalize') {
      // Invoke archiveProjectDir from claim.js to archive the project. It is idempotent
      // (already_finalized early-return when archive exists).
      try {
        const { archiveProjectDir } = require('./kaola-workflow-claim.js');
        archiveProjectDir(mainRoot, args.project, 'closed', undefined, { keepWorktree: false });
      } catch (_) {
        // Archive may already exist (crash-resume idempotency) — swallow
      }
      stepDone('finalize');
      continue;
    }

    if (step === 'closure') {
      // Close issue(s) — reuse postMergeCleanup's probe-before-close (#427) + bundle close (#369).
      // OFFLINE: skip.
      // #497: a HARD close failure (a member that genuinely won't close AND is not already-closed)
      // must NOT report status:sinked. The old code only warned (and bundle members swallowed with a
      // bare catch), then ran stepDone('closure') unconditionally. Instead: bucket each member into
      // closed/failed (mirroring postMergeCleanup), record remote_issue_closed in the receipt, and on
      // ANY genuine failure do NOT stepDone — emit a non-sinked refusal so the caller can retry.
      if (!OFFLINE && args.issue != null) {
        const forgeOpts = { cwd: mainRoot };
        const keepIssueOpen = !!args.keepIssueOpen;
        if (!keepIssueOpen) {
          const closed = [];
          const failed = [];
          const closeOne = (n, comment) => {
            if (probeIssueClosed(n, forgeOpts)) { closed.push(n); return; }
            try { ghExec(['issue', 'close', String(n), '--comment', comment], forgeOpts); closed.push(n); }
            catch (e) {
              // #396.5: an already-closed issue exits 1 — re-probe to classify it a SUCCESS, not failure.
              if (probeIssueClosed(n, forgeOpts)) { closed.push(n); }
              else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: issue close failed for ' + n + '\n'); }
            }
          };
          closeOne(args.issue, 'Merged via sink-merge --sink.');
          try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
          // Bundle members
          if (Array.isArray(args.issueNumbers) && args.issueNumbers.length > 1) {
            for (const n of args.issueNumbers) {
              if (n === args.issue) continue;
              closeOne(n, 'Merged via sink-merge --sink (bundle member).');
              try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
            }
          }
          // #497: only the FAILURE path records into the receipt + refuses — SUCCESS stays
          // byte-equivalent (it falls straight through to stepDone('closure'), no extra field).
          if (failed.length > 0) {
            receipt.remote_issue_closed = 'partial';
            receipt.updated_at = new Date().toISOString();
            writeSinkReceipt(receiptPath, receipt);
            process.stdout.write(JSON.stringify({
              result: 'refuse',
              reason: 'sink_incomplete',
              step: 'closure',
              remote_issue_closed: 'partial',
              closed_issues: closed.sort((a, b) => a - b),
              failed_issue_closures: failed.sort((a, b) => a - b),
              branch: args.branch,
              detail: 'the merge landed but ' + failed.length + ' issue(s) could not be closed on the forge (' + failed.join(', ') + '). Refusing to report status:sinked. The closure step is left NOT done so a re-run retries it. Manually close the issue(s) or resolve the forge fault, then re-run --sink.',
            }) + '\n');
            process.exitCode = 1;
            return;
          }
        }
      }
      stepDone('closure');
      continue;
    }

    if (step === 'stash_restore') {
      // Restore the stashed roadmap source if a stash was recorded
      if (receipt.stash_ref) {
        try {
          // Verify the stash still exists
          const stashList = execFileSync('git', ['-C', mainRoot, 'stash', 'list', '--format=%gd %gs'], { encoding: 'utf8' });
          const stillExists = stashList.split('\n').some(l => l.includes('kw-sink-' + args.project));
          if (stillExists) {
            execFileSync('git', ['-C', mainRoot, 'stash', 'pop', receipt.stash_ref], { encoding: 'utf8' });
          }
        } catch (_) {
          // Already popped or missing — idempotent skip
        }
      }
      stepDone('stash_restore');
      continue;
    }

    if (step === 'archive_commit') {
      // Stage and commit the archive folder on main (analogous to cmdWorktreeFinalize's commit)
      const archiveDir = path.join(mainRoot, 'kaola-workflow', 'archive', args.project);
      if (fs.existsSync(archiveDir)) {
        const projectPathspec = 'kaola-workflow/archive/' + args.project + '/';
        // #520: exclude crash-resume journals from staging — they are disposable scratch files that
        // must persist on disk for crash-resume (#429) and the #484 freshness guard, but must NEVER
        // be committed into main (they pollute the tracked tree and require recurring manual cleanup).
        const excludeReceipt = ':(exclude)kaola-workflow/archive/' + args.project + '/.cache/sink-receipt.json';
        const excludeFallback = ':(exclude)kaola-workflow/archive/' + args.project + '/.cache/sink-fallback.json';
        try {
          execFileSync('git', ['-C', mainRoot, 'add', '--', projectPathspec, excludeReceipt, excludeFallback], { encoding: 'utf8' });
        } catch (_) {}
        let hasStaged = false;
        try {
          execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--quiet', '--', projectPathspec], { stdio: 'ignore' });
        } catch (e) {
          if (e && e.status === 1) hasStaged = true;
        }
        if (hasStaged) {
          try {
            execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: archive ' + args.project + ' [sink]', '--', projectPathspec, excludeReceipt, excludeFallback],
              { encoding: 'utf8' });
          } catch (_) {}
        }
      }
      // Update receipt path to archive location if it moved
      const archiveReceiptPath = path.join(mainRoot, 'kaola-workflow', 'archive', args.project, '.cache', 'sink-receipt.json');
      if (!fs.existsSync(receiptPath) && fs.existsSync(path.dirname(archiveReceiptPath))) {
        // Re-write receipt to archive location
        writeSinkReceipt(archiveReceiptPath, receipt);
      }
      stepDone('archive_commit');
      continue;
    }

    if (step === 'push_main') {
      // Push main (defBranch) — already-pushed is a no-op.
      // #497: a HARD push failure must NOT report status:sinked. The deliverable advanced LOCALLY but
      // never reached the remote; the old code only warned then ran stepDone('push_main'), so the run
      // fell through to status:sinked (the #484 freshness guard checks branch ANCESTRY, which holds on
      // a local FF merge regardless of push) and a re-run skipped the already-`done` push → never
      // retried. Instead: record the outcome in the receipt, do NOT stepDone, and emit a non-sinked
      // refusal so the caller can detect + retry. The branch is preserved (we return before teardown).
      if (!OFFLINE) {
        try {
          if (FORCE_PUSH_MAIN_FAIL) throw new Error('[TEST ONLY] KAOLA_WORKFLOW_FORCE_PUSH_MAIN_FAIL — push main forced to fail');
          execFileSync('git', ['-C', mainRoot, 'push', 'origin', defBranch], { encoding: 'utf8' });
        } catch (e) {
          receipt.push_main = 'failed';
          receipt.updated_at = new Date().toISOString();
          writeSinkReceipt(receiptPath, receipt);
          process.stderr.write('sink-merge --sink: push main failed: ' + (e.message || String(e)) + '\n');
          process.stdout.write(JSON.stringify({
            result: 'refuse',
            reason: 'sink_incomplete',
            step: 'push_main',
            push_main: 'failed',
            branch: args.branch,
            default_branch: defBranch,
            detail: 'the merge landed on the LOCAL ' + defBranch + ' but `git push origin ' + defBranch + '` failed — the deliverable is NOT on the remote. Refusing to report status:sinked (a transient push failure must not look like a completed sink). The push step is left NOT done so a re-run retries it. Resolve the push fault and re-run --sink.',
          }) + '\n');
          process.exitCode = 1;
          return;
        }
      }
      stepDone('push_main');
      // #517: keep-open verification — if keepIssueOpen was set, the merge commit body may have
      // contained a "close/fix/resolve #N" keyword that caused GitHub to auto-close the issue at
      // push time. Post-push, probe the live issue state; if it is now CLOSED, reopen it and record
      // the event in the receipt so callers can detect + audit it.
      if (!OFFLINE && args.keepIssueOpen && args.issue != null) {
        try {
          if (probeIssueClosed(args.issue, {})) {
            ghExec(['issue', 'reopen', String(args.issue)], {});
            receipt.remote_issue_closed = 'reopened_after_autoclose';
            receipt.updated_at = new Date().toISOString();
            writeSinkReceipt(receiptPath, receipt);
          }
        } catch (_) {}
      }
      continue;
    }
  }

  // #484 FRESHNESS GUARD. A stale all-`done` sink-receipt resumed from the tracked
  // archive/<project>/.cache/ fallback (resolveSinkReceiptPath) makes the step loop skip merge +
  // push_main and fall through to status:sinked WITHOUT the branch ever landing on the default branch —
  // main silently not advanced, the deliverable lost. Before any teardown or success emission, assert
  // the branch tip IS an ancestor of the resolved default branch (the merge actually applied).
  // OFFLINE-safe: the merge step merges into the LOCAL defBranch, so ancestry holds regardless of
  // push_main. A non-ancestor (or a branch that no longer exists) is a stale / never-applied receipt →
  // typed refusal stale_sink_receipt; never a false status:sinked.
  {
    let merged = false;
    try {
      execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch], { encoding: 'utf8', stdio: 'ignore' });
      merged = true;
    } catch (_) { merged = false; }
    if (!merged) {
      process.stdout.write(JSON.stringify({
        result: 'refuse',
        reason: 'stale_sink_receipt',
        branch: args.branch,
        default_branch: defBranch,
        detail: 'all sink steps report "done" but branch "' + args.branch + '" is NOT an ancestor of "' + defBranch + '" — the merge was never applied (a stale receipt resumed from kaola-workflow/archive/' + args.project + '/.cache/sink-receipt.json). Refusing to report status:sinked (main would silently not advance and the deliverable would be lost). Reset the receipt steps or remove the stale archived sink-receipt.json, then re-run --sink so the branch actually merges.',
      }) + '\n');
      process.exitCode = 1;
      return;
    }
  }

  // All steps done — remove the worktree
  try {
    const { removeWorktree: removeWt, readActiveFolders: readAF } = require('./kaola-workflow-claim.js');
    const folder = readAF(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project);
    removeWt(mainRoot, args.project, folder);
  } catch (_) {}

  // Clean up the feature branch
  if (!OFFLINE) {
    try { execFileSync('git', ['-C', mainRoot, 'push', 'origin', '--delete', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  }
  try {
    execFileSync('git', ['-C', mainRoot, 'merge-base', '--is-ancestor', args.branch, defBranch],
      { encoding: 'utf8', stdio: 'ignore' });
    try { execFileSync('git', ['-C', mainRoot, 'branch', '-D', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  } catch (_) {
    try { execFileSync('git', ['-C', mainRoot, 'branch', '-d', '--', args.branch], { encoding: 'utf8' }); } catch (_) {}
  }

  // Emit success
  const finalReceipt = JSON.parse(fs.existsSync(receiptPath)
    ? fs.readFileSync(receiptPath, 'utf8')
    : JSON.stringify(receipt));
  process.stdout.write(JSON.stringify({ result: 'ok', status: 'sinked', receipt: finalReceipt }) + '\n');
}

const SINK_USAGE = 'usage: kaola-workflow-sink-merge.js --branch B --project P [--issue N] [--issue-numbers A,B] [--keep-issue-open] [--sink]\n'
  + '  --sink         run the full sink TRANSACTION (merge → close → delete branch → remove worktree).\n'
  + '  --help, -h     print this usage and exit (no side effects).';

function main() {
  const rawArgv = process.argv.slice(2);
  // #476: --help/-h is a SAFE no-op — print usage + exit 0 with ZERO side effects. This script's
  // default action is a DESTRUCTIVE merge/close/delete; a help probe must never run it (the
  // KaolaTerminal issue-85 orphan was triggered by `sink-merge ... --help` running to completion).
  // Checked on the RAW argv BEFORE parseArgs (mirroring claim.js): a value flag must not be able to
  // SWALLOW the help token — `--issue-numbers -h` would otherwise consume `-h` as a value (it is not
  // `--`-prefixed) and the post-parse `args.help` gate would be silently bypassed.
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

  // #429: --sink mode routes to the resumable transaction, bypassing the legacy pipeline.
  // The transaction owns its own preflight (sink_blocked), step-receipt, and idempotent steps.
  if (isSinkMode) {
    const coordRoot = getCoordRoot();
    const mainRoot = mainRootFromCoord(coordRoot);
    const defBranch = defaultBranch(mainRoot);
    try { process.chdir(os.tmpdir()); } catch (_) {}
    // Derive member set for the --sink transaction
    const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
    args.issueNumbers = memberSet.members;
    args.member_source = memberSet.source;
    runSinkTransaction(args, mainRoot, defBranch);
    return;
  }

  // #346: resolve roots, then run ALL preconditions BEFORE the destructive worktree removal. The
  // old Step 0 ran `removeWorktree --force` FIRST (for cwd-independence convenience), so a sink
  // about to refuse (dirty main root / live folder / unpushed / dirty worktree) had already
  // destroyed the worktree — taking any uncommitted work with it. Now the worktree is removed ONLY
  // after every precondition proves the sink can proceed.
  const coordRoot = getCoordRoot();
  const mainRoot = mainRootFromCoord(coordRoot);
  // #393a: derive the member set BEFORE the destructive worktree removal (the live/archive state is
  // still readable). When --issue-numbers is absent, fall back to the state's issue_numbers so a
  // bundle sink without the flag still closes every member. Single-issue (no issue_numbers line)
  // returns [] → the length>1 close-loop gate never trips → byte-identical single-issue output.
  const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
  args.issueNumbers = memberSet.members;
  args.member_source = memberSet.source;
  // #350: resolve the integration/default branch (origin/HEAD), falling back to 'main'. Repos
  // whose default branch is master/other no longer break sink-merge.
  const defBranch = defaultBranch(mainRoot);
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

  // Pre-chdir to a path OUTSIDE any worktree: `git worktree remove` refuses when cwd is inside the
  // worktree being removed, and chdir-to-tmpdir (not mainRoot) forces every git call to pass
  // `-C mainRoot` explicitly — keeping the script's cwd-independence under test.
  try { process.chdir(os.tmpdir()); } catch (e) {
    process.stderr.write('sink-merge: could not chdir before worktree removal: ' + e.message + '\n');
  }

  // Step 1 — git fetch (skip if OFFLINE; fatal throw on error)
  if (!OFFLINE) {
    execFileSync('git', ['-C', mainRoot, 'fetch', 'origin'], { encoding: 'utf8' });
  }

  // Step 2 — preconditions, ALL run before any destructive step (#346). Each is checkout-independent
  // (operates on mainRoot / the branch ref, not the working tree). Any failure throws → exit 1, ZERO
  // mutation, worktree intact. assertWorktreeClean is the data-loss guard: it refuses if the linked
  // worktree carries uncommitted work, so a refused sink never destroys that work.
  assertCleanWorktree(mainRoot);
  assertNoLiveWorkflowFolder(mainRoot, args.project, args.branch);
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);
  if (!OFFLINE) assertBranchHasNonWorkflowChanges(mainRoot, args.branch, defBranch);
  assertWorktreeClean(mainRoot, args.branch);

  // Step 3 — Remove the worktree (only now that every precondition passed) so the branch can be
  // checked out in the main root below.
  {
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

  // Step 4 — check out the feature branch (worktree now removed, branch ref freed).
  execFileSync('git', ['-C', mainRoot, 'checkout', args.branch], { encoding: 'utf8' });

  // Step 2 — Merge-base skip-check
  // If origin/<defBranch> doesn't exist (e.g. no remote, or OFFLINE with no cached ref),
  // treat as already up-to-date so the rebase is skipped.
  const originRef = 'origin/' + defBranch;
  let alreadyUpToDate = false;
  try {
    const mergeBase = execFileSync('git', ['-C', mainRoot, 'merge-base', 'HEAD', originRef],
      { encoding: 'utf8' }).trim();
    const originHead = execFileSync('git', ['-C', mainRoot, 'rev-parse', originRef],
      { encoding: 'utf8' }).trim();
    alreadyUpToDate = (mergeBase === originHead);
  } catch (_) {
    // origin/<defBranch> not resolvable — treat as up-to-date (no drift to rebase against)
    alreadyUpToDate = true;
  }

  doRebase(args, alreadyUpToDate, mainRoot, defBranch);

  if (!ffMergeLoop(args, mainRoot, defBranch)) {
    process.exitCode = 2;
    return;
  }

  const cleanupResult = postMergeCleanup(args, mainRoot, wtRemovedStatus, defBranch);
  if (cleanupResult && cleanupResult.exitCode === 3) { process.exitCode = 3; return; }
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges };
