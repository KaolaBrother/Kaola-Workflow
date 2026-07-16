#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getCoordRoot, mainRootFromCoord, resolveMainRoot, parsePorcelainPaths, isParkedLanePath, readActiveFolders, removeWorktree, buildClosureReceipt, checkClosureInvariants, checkDispatchAttestations, defaultBranch, appendClosureBlock, persistAttestationToSummary } = require('./kaola-workflow-claim.js');
// #548: the canonical repo-kind discriminator (self-host npm vs consumer). run-chains.js requires
// no sink-merge symbol, so this is non-circular.
const { resolveChains } = require('./kaola-workflow-run-chains.js');

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
// #619(3): test-only — force the push_upstream step's push to THROW, simulating a transient push
// failure. Proves the --sink transaction does NOT false-report push_upstream:done (and eventually
// status:sinked) when the feature branch was never actually backed up on the remote. Never set in
// production; it only makes the push we already run throw.
const FORCE_PUSH_UPSTREAM_FAIL = process.env.KAOLA_WORKFLOW_FORCE_PUSH_UPSTREAM_FAIL === '1';
const REMOTE_TIMEOUT_MS = (() => {
  const n = parseInt(process.env.KAOLA_GH_REMOTE_TIMEOUT_MS || '30000', 10);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 600000) : 30000;
})();
// #666: cap unbounded-in-repo-size git execFileSync calls at 64 MB — Node's execFileSync default
// maxBuffer is 1 MB, and a repo-size-scaling diff/listing can exceed it and crash with ENOBUFS.
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

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

// #517/#694: reopen issue N on the forge. The single forge-noun site for reopen — used by the
// push_main #517 auto-close reopen AND the #694 keep-open END-STATE guard. Throws on failure so the
// caller can distinguish a confirmed reopen from a failed one.
function reopenIssue(issueNumber, opts) {
  if (OFFLINE || issueNumber == null) return;
  ghExec(['issue', 'reopen', String(issueNumber)], opts || {});
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

// mainRootFromCoord is now imported from kaola-workflow-claim.js (#579 shared resolver).

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

function assertCleanWorktree(mainRoot, ownedProjects) {
  // Use --untracked-files=no to ignore untracked files (e.g. kaola-workflow/ state dirs already
  // excluded). #579: ownedProjects param added for API consistency with the parked-aware design;
  // --untracked-files=no already excludes all untracked lane dirs so the parked filter is a
  // secondary defense for any tracked modifications outside owned projects.
  const rawStatus = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
  if (!rawStatus) return;
  const owned = Array.isArray(ownedProjects) ? ownedProjects : [];
  const relevant = parsePorcelainPaths(rawStatus).filter(p => !isParkedLanePath(p, owned));
  assert(!relevant.length, 'Worktree must be clean before sink-merge checks out the requested branch');
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
// #579: ownedProjects param added — passed through to the inner status check; ignored for the
// list probe since --untracked-files=no excludes all untracked lane dirs.
function assertWorktreeClean(mainRoot, branch, ownedProjects) {
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
        status = execFileSync('git', ['-C', wt, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER }).trim();
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
  // #617: capture the feature branch's commit SHA now, before Step 9 below deletes the branch
  // ref — this is "the recorded implementation commit" the remote-closed-after-publish invariant
  // (wired into checkClosureInvariants below) verifies is an ancestor of defBranch before the
  // receipt is allowed to report a genuine close.
  let implCommitSha = null;
  try {
    implCommitSha = execFileSync('git', ['-C', mainRoot, 'rev-parse', args.branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_) {}
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
        try {
          ghExec(['issue', 'close', String(args.issue), '--comment', 'Merged via sink-merge.'], forgeOpts);
          // #619(2): `gh issue close` exiting 0 does not PROVE the issue is closed (a rare forge/API
          // race can leave it open) — the old code trusted the exit code unconditionally and only
          // probed in the catch branch below. Probe the live state on the success path too.
          if (probeIssueClosed(args.issue, forgeOpts)) { remoteIssueClosed = 'closed'; }
          else {
            remoteIssueClosed = 'failed';
            process.stderr.write('sink-merge: WARNING: gh issue close exited 0 for ' + args.issue + ' but the issue is still OPEN; receipt.remote_issue_closed=failed. Manually run: gh issue close ' + args.issue + '\n');
          }
        }
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
        // #619(2): probe the live state on the success path too — an exit-0 close is not proof.
        if (probeIssueClosed(n, forgeOpts)) {
          closed.push(n);
          try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
        } else {
          failed.push(n);
          process.stderr.write('sink-merge: WARNING: gh issue close exited 0 for bundle member ' + n + ' but the issue is still OPEN; recorded in failed_issue_closures.\n');
        }
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
  // #617: wire the remote-closed-after-publish invariant — verify the captured branch SHA is an
  // ancestor of defBranch before trusting this receipt's close.
  const invariants = checkClosureInvariants(mainRoot, receipt, archiveDest, { implRef: implCommitSha, sinkTarget: defBranch });

  // #619(1): a failed issue close must fail CLOSED, not silently report status:'merged' exit 0 —
  // mirror the --sink transaction's closure-step refusal (the #497 pattern). The merge into
  // defBranch already happened by this point in the legacy (non---sink) pipeline (irreversible);
  // this is purely truthful reporting: a close that genuinely failed on the forge must never look
  // like a completed sink. `closeWasAttempted` excludes the OFFLINE / keep-open / no-issue-passed
  // cases, where remoteIssueClosed's default 'failed' init value does not represent a real failure.
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
        'completed sink. Manually close the issue(s) (`gh issue close <N>`), then reconcile state.',
    };
    if (bundleBuckets) {
      out.closed_issues = bundleBuckets.closed_issues;
      out.failed_issue_closures = bundleBuckets.failed_issue_closures;
    }
    process.stdout.write(JSON.stringify(out) + '\n');
    return { exitCode: 1 };
  }

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

// #429: write a sink-receipt.json atomically (temp+rename) to avoid corruption on crash.
function writeSinkReceipt(receiptPath, receipt) {
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const tmp = receiptPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(receipt, null, 2) + '\n');
  fs.renameSync(tmp, receiptPath);
}

// #653: dispose of the sink-receipt.json / sink-fallback.json transaction journals once the sink
// has reached TERMINAL SUCCESS. They exist on disk only for crash-resume (#429) and the #484
// freshness guard — a terminally successful sink must never leave them behind as debris a later
// "clean and synced" check might mistake for a deliverable and commit (the exact #520 trap, one
// step later in the file's lifecycle). Checks all 4 candidate locations (live + archive, receipt +
// fallback) since either may be stale residue from an earlier cycle. Per-file try/catch: a failed
// unlink must never fail an otherwise-successful sink — the deliverable already landed on
// defBranch by the time this runs. Returns true iff no candidate journal remains on disk afterward.
function disposeSinkJournals(mainRoot, project, archiveDestRel) {
  const candidates = [
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-receipt.json'),
    path.join(mainRoot, 'kaola-workflow', project, '.cache', 'sink-fallback.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-receipt.json'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, '.cache', 'sink-fallback.json'),
  ];
  // #700/#694: the actual archive destination is collision-suffixed (archive/<project>.archived-<ts>/)
  // when archive/<project>/ already exists; its .cache journals escape the four plain candidates above
  // (the one live way a receipt survives into an archive — the shared root cause with #694's stale
  // cross-run resume). Add the recorded dest AND sweep EVERY suffixed archive folder so a prior
  // cycle's residual receipt is disposed too, not just the current run's.
  if (archiveDestRel) {
    candidates.push(path.join(mainRoot, archiveDestRel, '.cache', 'sink-receipt.json'));
    candidates.push(path.join(mainRoot, archiveDestRel, '.cache', 'sink-fallback.json'));
  }
  try {
    const archiveBase = path.join(mainRoot, 'kaola-workflow', 'archive');
    for (const entry of fs.readdirSync(archiveBase)) {
      if (entry.startsWith(project + '.archived-')) {
        candidates.push(path.join(archiveBase, entry, '.cache', 'sink-receipt.json'));
        candidates.push(path.join(archiveBase, entry, '.cache', 'sink-fallback.json'));
      }
    }
  } catch (_) { /* archive dir absent — nothing suffixed to sweep */ }
  let allDisposed = true;
  for (const p of candidates) {
    try {
      fs.unlinkSync(p);
    } catch (e) {
      if (e && e.code === 'ENOENT') continue; // already absent — not a failure
      allDisposed = false;
      process.stderr.write('sink-merge --sink: WARNING: failed to dispose sink journal ' + p + ': ' + (e.message || String(e)) + '\n');
    }
  }
  return allDisposed;
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

// #694: read the CURRENT run's claim_ts from workflow-state.md. The claim block (## Sink) carries a
// per-run `claim_ts:` written at claim time (kaola-workflow-claim.js). A project name is stable
// across runs (derived from the roadmap's workflow_project field), so the SAME project can be
// re-claimed by a later run; the newest claim_ts across every state location is the current run's.
// Scans the live folder, the plain archive, AND every collision-suffixed archive
// (archive/<project>.archived-<ts>/) so a resumed cross-cycle receipt can be told apart from the
// current claim. Returns the newest ISO claim_ts string (ISO-8601 sorts lexicographically) or null.
function readCurrentClaimTs(mainRoot, project, branch) {
  if (!isSafeName(project)) return null;
  const stamps = [];
  const collect = (raw) => {
    if (!raw) return;
    const m = raw.match(/^claim_ts:\s*(.+?)\s*$/m);
    if (m && m[1].trim()) stamps.push(m[1].trim());
  };
  // At --sink time the CURRENT run's state lives on the feature branch (the live folder for a
  // sole-archiver sink, or the archived folder for a pre-finalized sink) — main's working tree still
  // reflects the default branch. Read the branch ref FIRST so the current claim_ts is seen even
  // before the merge lands it in the working tree.
  if (branch) {
    for (const rel of ['kaola-workflow/' + project + '/workflow-state.md', 'kaola-workflow/archive/' + project + '/workflow-state.md']) {
      try { collect(execFileSync('git', ['-C', mainRoot, 'show', branch + ':' + rel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (_) {}
    }
  }
  // Working-tree state files (live, plain archive, and every collision-suffixed archive).
  const wtFiles = [
    path.join(mainRoot, 'kaola-workflow', project, 'workflow-state.md'),
    path.join(mainRoot, 'kaola-workflow', 'archive', project, 'workflow-state.md'),
  ];
  try {
    const archiveBase = path.join(mainRoot, 'kaola-workflow', 'archive');
    for (const entry of fs.readdirSync(archiveBase)) {
      if (entry.startsWith(project + '.archived-')) wtFiles.push(path.join(archiveBase, entry, 'workflow-state.md'));
    }
  } catch (_) { /* archive dir absent — only live/plain candidates */ }
  for (const f of wtFiles) { try { collect(fs.readFileSync(f, 'utf8')); } catch (_) {} }
  let newest = null;
  for (const ts of stamps) if (!newest || ts > newest) newest = ts; // ISO-8601 sorts lexicographically
  return newest;
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
function loadOrInitReceipt(mainRoot, project, branch, issueNumber, issueNumbers, defBranch, keepIssueOpen) {
  const receiptPath = resolveSinkReceiptPath(mainRoot, project);
  // #694: the current run's claim_ts — used to detect a receipt left behind by an EARLIER run of
  // the same (reused) project name, so we never replay its recorded steps (incl. closure).
  const currentClaimTs = readCurrentClaimTs(mainRoot, project, branch);
  const resolveBranchHead = () => {
    try { return execFileSync('git', ['-C', mainRoot, 'rev-parse', branch], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (_) { return null; }
  };
  // DRY fresh-receipt builder — one shape for the no-receipt init, the #518 cycle-identity reinit,
  // and the #694 cross-run reinit. Always stamps keep_open_requested (this run's intent) + claim_ts
  // so a later resume can detect BOTH a keep-open flag flip and a cross-run resume.
  const makeFresh = (currentHead, priorReceipt, extra) => {
    const steps = {};
    for (const s of SINK_STEPS) steps[s] = 'pending';
    const pr = priorReceipt || {};
    return Object.assign({
      project, branch,
      issue_number: issueNumber || pr.issue_number || null,
      issue_numbers: issueNumbers && issueNumbers.length ? issueNumbers : (issueNumber ? [issueNumber] : (pr.issue_numbers || [])),
      resolved_default_branch: defBranch || pr.resolved_default_branch,
      branch_head: currentHead || null,
      keep_open_requested: !!keepIssueOpen,
      claim_ts: currentClaimTs || null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stash_ref: null,
      removed_duplicates: [],
      steps
    }, extra || {});
  };
  if (fs.existsSync(receiptPath)) {
    try {
      const r = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      if (r && r.steps) {
        // #694: cross-run staleness FIRST. A receipt whose recorded claim_ts (or, for a pre-#694
        // receipt shape, its started_at) PREDATES the current run's claim_ts belongs to an earlier
        // run of the same project — reinitialize so the pipeline re-runs fresh under THIS run's
        // flags (its recorded steps, including a prior `closure: done`, are NOT replayed). Fail
        // loud on stderr. Gated on a resolvable current claim_ts (no marker → fall through to the
        // #518 guard, no regression). newCycle:true defers the first disk write past the merge
        // checkout (the stale receipt may be a tracked file shared by both branches).
        const receiptStamp = r.claim_ts || r.started_at || null;
        if (currentClaimTs && receiptStamp && receiptStamp < currentClaimTs) {
          process.stderr.write('sink-merge --sink: cross-run stale receipt detected — receipt stamp ' + receiptStamp +
            ' predates the current claim_ts ' + currentClaimTs + '. Reinitializing sink steps; the prior run\'s recorded ' +
            'steps (including closure) are NOT replayed and this run\'s --keep-issue-open intent is honored.\n');
          const freshReceipt = makeFresh(resolveBranchHead(), r, { cross_run_reinit: true });
          return { receipt: freshReceipt, receiptPath, newCycle: true };
        }
        // #518: cycle-identity check — only applies when merge is already recorded as done
        // (the stale-receipt scenario: prior cycle completed, new cycle reuses same branch name).
        if (r.steps.merge === 'done') {
          const currentHead = resolveBranchHead();
          const priorHead = r.branch_head || null;
          const isNewCycle = !currentHead || !priorHead || currentHead !== priorHead;
          if (isNewCycle) {
            // Stale all-done receipt from a prior cycle — reinitialize steps to pending so
            // the merge runs fresh. Return newCycle:true so runSinkTransaction defers the first
            // disk write until after the merge-step checkout (the stale file remains on disk,
            // unmodified, so git checkout <branch> does not abort with "local changes would be
            // overwritten" when the receipt is a tracked file shared by both branches).
            const freshReceipt = makeFresh(currentHead, r);
            return { receipt: freshReceipt, receiptPath, newCycle: true };
          }
        }
        return { receipt: r, receiptPath };
      }
    } catch (_) {}
  }
  // No existing receipt — initialize fresh. Stamp branch_head for future cycle-identity checks.
  return { receipt: makeFresh(resolveBranchHead(), null), receiptPath };
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

// #552: fail-closed backstop against the lane-group crash-window desync. A clean write-parallel group
// completion DELETES the running-set lane_group key (adaptive-node closeGroupMember last-member path: it
// runs the synthesizer + group barrier, merges every leg into the feature branch, then drops the key). So
// a lane_group key that STILL EXISTS at sink time means a group never cleanly synthesized + merged its legs
// — the surviving legs' committed work is NOT on the branch. Advancing main here would be the #552 silent
// loss (a green run merges with code missing). Read running-set.json from BOTH the LIVE project dir AND the
// post-finalize ARCHIVE dir (sink-merge runs from main root AFTER cmdFinalize archives — mirrors the
// resolveSinkReceiptPath dual-location), and refuse if either carries a non-empty lane_group. Pure read,
// zero mutation; returns a typed refusal object or null. Scoped to a NON-EMPTY lane_group key (a cleared
// run deletes the key, not empties it) so a normal completed run's leftover running-set.json never false-trips.
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

// #429: preflight — classify the dirty tree into three buckets and handle them.
// Returns { ok: true, stashRef, removedDuplicates } on success, or
// { ok: false, reason: 'sink_blocked', foreign_dirt: [...] } on foreign dirt, or
// { ok: false, reason: 'lingering_lane_group', detail } on the #552 backstop, or
// { ok: false, reason: 'worktree_dirty', detail } on the #562 dirty/unprobeable worktree guard.
// INVARIANT: if foreign_dirt is non-empty, NO mutation occurs.
function sinkPreflight(mainRoot, project, branch, issueNumbers) {
  // #552: lane-group backstop FIRST — a pure read, zero mutation, BEFORE the dirty-tree scan/stash.
  const laneGroupRefusal = lingeringLaneGroupRefusal(mainRoot, project);
  if (laneGroupRefusal) return laneGroupRefusal;

  // #562: worktree-clean data-loss guard — mirror the legacy path's assertWorktreeClean (:1461). The
  // --sink merge step force-removes the linked worktree (removeWorktree → `git worktree remove --force`)
  // with NO clean precondition, so a dirty worktree's uncommitted work would be silently destroyed — the
  // exact #496/#506 data-loss hazard the legacy path already guards. assertWorktreeClean throws on a
  // dirty OR unprobeable worktree (fail-closed); convert that to the typed refusal sinkPreflight returns
  // so runSinkTransaction's preflight handler surfaces result:'refuse' + exit 1 with ZERO mutation.
  // Resume-safe: an already-removed worktree matches no `worktree list` block and returns cleanly.
  try {
    assertWorktreeClean(mainRoot, branch, [project]);
  } catch (err) {
    return { ok: false, reason: 'worktree_dirty', detail: err.message };
  }

  const porcelain = execFileSync('git', ['-C', mainRoot, 'status', '--porcelain', '-uall'], { encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER });
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

// #700: persist the SAME terminal metadata cmdFinalize writes — the ## Closure state block
// (appendClosureBlock) + the ## Attestation summary block (persistAttestationToSummary) — into the
// archive dest, for a --sink that is the SOLE archiver (no prior cmdFinalize --keep-worktree already
// wrote them). Without this, the sink's own archiveProjectDir archives a folder with NO terminal
// metadata (a latent gap that bites exactly when the sink is the only archiver). Attestation reflects
// the REAL dispatch-log probe (checkDispatchAttestations) — never a fabricated contractor attestation
// for inline execution. Both writers are presence-guarded / idempotent (a dest already carrying the
// blocks is a no-op), and the disposition/label/invariant fields are honestly PENDING here: the sink's
// own closure + verify steps (later) perform the real close and record the authoritative verdict.
// Fail-soft — metadata persistence must never abort an otherwise-successful sink; only a programmer
// error (a missing/renamed claim.js export, the #550 cross-edition drift class) rethrows.
function persistSinkClosureMetadata(mainRoot, args, sinkReceipt, archiveResult) {
  const dest = archiveResult && archiveResult.dest;
  if (!dest) return;
  try {
    const keepOpen = !!args.keepIssueOpen || sinkReceipt.keep_open_requested === true;
    const closureReceipt = buildClosureReceipt(args.project, args.issue != null ? args.issue : null, {
      archive: 'closed',
      roadmap_source_removed: archiveResult.roadmap_source_removed,
      roadmap_regenerated: archiveResult.roadmap_regenerated,
    });
    // Real attestation probe — archive .cache first (archiveProjectDir already moved the live cache
    // there), live .cache fallback. NO fabrication: an inline-executed sink with no dispatch-log
    // records 'missing', exactly as cmdFinalize would.
    checkDispatchAttestations([
      path.join(dest, '.cache'),
      path.join(mainRoot, 'kaola-workflow', args.project, '.cache')
    ], closureReceipt);
    persistAttestationToSummary(dest, closureReceipt);
    appendClosureBlock(dest, {
      issueDisposition: keepOpen ? 'kept-open' : 'close-pending',
      claimLabelRemoved: 'close-pending',
      worktreeRemoved: 'removed',
      closureInvariants: 'pending',
      claimPlannerAttested: closureReceipt.claim_planner_attested,
      finalizeContractorAttested: closureReceipt.finalize_contractor_attested
    });
  } catch (e) {
    if (e instanceof TypeError || e instanceof ReferenceError) throw e;
  }
}

// #429: the main --sink transaction.
function runSinkTransaction(rawArgs, mainRoot, defBranch) {
  const args = rawArgs;

  // Resolve the receipt path and load/init the receipt.
  // newCycle=true means loadOrInitReceipt detected a stale prior-cycle receipt and reinit'd — the
  // stale file remains on disk (unmodified) so git checkout <branch> in the merge step does not
  // abort; the first disk write is therefore deferred to stepDone('merge').
  const { receipt, receiptPath, newCycle } = loadOrInitReceipt(mainRoot, args.project, args.branch,
    args.issue, args.issueNumbers, defBranch, args.keepIssueOpen);

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
    if (receipt.steps[step] === 'done') {
      // #694: a recorded `closure: done` from a prior invocation is NOT evidence about THIS run's
      // keep-open intent. If the receipt recorded a keep-open intent that differs from the current
      // invocation's, the closure step must be re-evaluated live (never replay a stale close/keep
      // decision). Every other done step is skipped as before. (The cross-run reinit in
      // loadOrInitReceipt already covers a full cross-run resume; this covers a same-cycle flag flip.)
      // Both sides are boolean-normalized: a legacy receipt with NO keep_open_requested field
      // (undefined) must read as false so a plain close resume is not spuriously re-run.
      if (step === 'closure' && !!receipt.keep_open_requested !== !!args.keepIssueOpen) {
        process.stderr.write('sink-merge --sink: keep-open intent changed since the recorded closure step (receipt ' +
          (!!receipt.keep_open_requested) + ' -> current ' + !!args.keepIssueOpen + ') — re-evaluating closure live.\n');
        receipt.keep_open_requested = !!args.keepIssueOpen;
      } else {
        continue;
      }
    }

    if (step === 'preflight') {
      // Re-derive issue numbers in case they changed
      const memberSet = deriveMemberSet(mainRoot, args.project, args.issueNumbers);
      args.issueNumbers = memberSet.members;
      args.member_source = memberSet.source;

      const preResult = sinkPreflight(mainRoot, args.project, args.branch, args.issueNumbers);
      if (!preResult.ok) {
        // sink_blocked (foreign dirt) OR lingering_lane_group (#552): emit the TYPED refusal + exit 1.
        const out = {
          result: 'refuse',
          reason: preResult.reason || 'sink_blocked',
          ...(preResult.foreign_dirt ? { foreign_dirt: preResult.foreign_dirt } : {}),
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
          process.stdout.write(JSON.stringify({
            result: 'refuse',
            reason: 'sink_incomplete',
            step: 'push_upstream',
            push_upstream: 'failed',
            branch: args.branch,
            detail: '`git push -u origin ' + args.branch + '` did not verifiably reach parity with its upstream — the feature branch may not be backed up on the remote. Refusing to report status:sinked. The push_upstream step is left NOT done so a re-run retries it. Resolve the push fault (or push manually: git push -u origin ' + args.branch + ') and re-run --sink.',
          }) + '\n');
          process.exitCode = 1;
          return;
        }
      }
      stepDone('push_upstream');
      continue;
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
      // SAME tracked path and `git checkout` refuses to overwrite it ("untracked working tree
      // files would be overwritten"). Staging first, then landing only when mainProjDir is still
      // absent post-checkout, mirrors the original worktree_sync guard (`!fs.existsSync(mainProjDir)`)
      // safely — genuinely worktree-only (untracked) content, e.g. a .cache/ crash-resume journal,
      // still survives; branch-tracked content wins exactly as checkout already resolved it.
      let wtStageDir = null;
      try {
        const { removeWorktree: removeWt, readActiveFolders: readAF, worktreePathFor: wtPathFor } = require('./kaola-workflow-claim.js');
        const folder = readAF(mainRoot, { excludeClosedIssues: false }).find(f => f.project === args.project);
        let wtPath = null;
        try { wtPath = (folder && folder.worktree_path) || wtPathFor(mainRoot, args.project); } catch (_) {}
        if (wtPath && fs.existsSync(wtPath)) {
          const wtProjDir = path.join(wtPath, 'kaola-workflow', args.project);
          if (fs.existsSync(wtProjDir)) {
            try {
              wtStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kw-wtsync-'));
              sinkCopyDir(wtProjDir, wtStageDir);
            } catch (_) { wtStageDir = null; }
          }
        }
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
      // Land the staged worktree-only content now that checkout has resolved whether the branch
      // itself tracks kaola-workflow/<project>/ — copy only when it's still absent; else discard
      // the stage (the branch-tracked content already won and is authoritative).
      if (wtStageDir) {
        try {
          const mainProjDir = path.join(mainRoot, 'kaola-workflow', args.project);
          if (!fs.existsSync(mainProjDir)) sinkCopyDir(wtStageDir, mainProjDir);
        } catch (_) {}
        try { fs.rmSync(wtStageDir, { recursive: true, force: true }); } catch (_) {}
      }
      stepDone('merge');
      continue;
    }

    if (step === 'finalize') {
      // Invoke archiveProjectDir from claim.js to archive the project. It is idempotent
      // (already_finalized early-return when archive exists).
      try {
        const { archiveProjectDir } = require('./kaola-workflow-claim.js');
        const archiveResult = archiveProjectDir(mainRoot, args.project, 'closed', undefined, { keepWorktree: false });
        // #700: carry the ACTUAL archive destination (possibly collision-suffixed to
        // archive/<project>.archived-<ts>/ when archive/<project>/ already exists) through the
        // receipt, so archive_commit stages/commits the exact dir — not a hardcoded plain path that
        // stages nothing — and disposeSinkJournals / the receipt-exclusion pathspec target it too.
        // A source-missing return (the keep-worktree flow already archived + committed on the branch)
        // has no dest; archive_commit then falls back to the plain path (already at HEAD post-merge).
        if (archiveResult && archiveResult.dest) {
          receipt.archive_dest = path.relative(mainRoot, archiveResult.dest).split(path.sep).join('/');
          // #700: this sink is the SOLE archiver — persist the same ## Closure + ## Attestation blocks
          // cmdFinalize writes (real attestation probe, no fabrication) so the archive is not left
          // without terminal metadata. No-op when the dest already carries them (keep-worktree flow).
          persistSinkClosureMetadata(mainRoot, args, receipt, archiveResult);
        }
      } catch (e) {
        // #555: a missing/renamed export (TypeError) or undefined reference (ReferenceError) is a PROGRAMMER
        // error (the #550 cross-edition export-drift class — a forge port could omit archiveProjectDir) and
        // must fail LOUD, not be masked into a silent skip of the project archive. Only the expected
        // idempotency case (archive may already exist on a crash-resume) is swallowed.
        if (e instanceof TypeError || e instanceof ReferenceError) throw e;
      }
      stepDone('finalize');
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
      // #700: stage/commit the ACTUAL archive destination recorded by the finalize step. A
      // collision-suffixed archive/<project>.archived-<ts>/ (chosen when archive/<project>/ already
      // exists) escapes the hardcoded plain path: `git add` of the plain path stages nothing, the
      // diff-quiet guard then skips the commit, yet stepDone ran unconditionally — so the suffixed
      // archive + roadmap-source removal + regenerated ROADMAP.md never got committed.
      const archiveRel = (receipt.archive_dest || ('kaola-workflow/archive/' + args.project)).replace(/\/+$/, '');
      const archiveDir = path.join(mainRoot, archiveRel);
      const projectPathspec = archiveRel + '/';
      // #520/#700: exclude crash-resume journals from staging — disposable scratch files that must
      // persist on disk for crash-resume (#429) and the #484 freshness guard but must NEVER be
      // committed into main. Scoped to the ACTUAL dest .cache (the plain path missed a suffixed one).
      // Exclude BOTH the archive-dest journals AND the live-folder journals: the resolved receipt
      // path can sit in the live project .cache (which the sole-archiver staging below sweeps via
      // livePathspec), and a journal must never be committed into the tracked tree (#520).
      const excludeReceipt = ':(exclude)' + projectPathspec + '.cache/sink-receipt.json';
      const excludeFallback = ':(exclude)' + projectPathspec + '.cache/sink-fallback.json';
      const excludeLiveReceipt = ':(exclude)kaola-workflow/' + args.project + '/.cache/sink-receipt.json';
      const excludeLiveFallback = ':(exclude)kaola-workflow/' + args.project + '/.cache/sink-fallback.json';
      // #700: the archive commit must also carry the roadmap-source removal + regenerated ROADMAP.md
      // that archiveProjectDir performed in the working tree (the sole-archiver case), so main's HEAD
      // is not left dirty. Scope to THIS sink's own roadmap files (never a foreign issue's): each
      // member source (staged as a deletion for a close, preserved for keep-open) + the mirror. A
      // member with no roadmap source is filtered out so a stale pathspec can't abort staging.
      const memberNums = (Array.isArray(args.issueNumbers) && args.issueNumbers.length)
        ? args.issueNumbers
        : (args.issue != null ? [args.issue] : []);
      const roadmapPathspecs = [];
      for (const n of memberNums) roadmapPathspecs.push('kaola-workflow/.roadmap/issue-' + n + '.md');
      roadmapPathspecs.push('kaola-workflow/ROADMAP.md');
      // #700: the sole-archiver rename moves the LIVE folder (kaola-workflow/<project>/) into the
      // suffixed archive. When that live folder was tracked (committed on the branch, then merged into
      // main), its removal must be committed too — else main is left with a staged/unstaged deletion
      // after status:sinked. Include the live pathspec only when tracked at HEAD (the keep-worktree
      // flow's live folder was in the worktree, never main-tracked → nothing to stage).
      const livePathspec = 'kaola-workflow/' + args.project + '/';
      let liveTracked = false;
      try { const t = execFileSync('git', ['-C', mainRoot, 'ls-tree', '--name-only', 'HEAD', '--', livePathspec], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); liveTracked = t.length > 0; } catch (_) { liveTracked = false; }
      // Only stage a roadmap path that is present (keep-open / regenerated mirror) OR tracked at HEAD
      // (a close deletion) — a bare pathspec that matches nothing would abort `git add`/`git commit`.
      const stagedRoadmap = roadmapPathspecs.filter(rp => {
        if (fs.existsSync(path.join(mainRoot, rp))) return true;
        try { execFileSync('git', ['-C', mainRoot, 'cat-file', '-e', 'HEAD:' + rp], { stdio: ['ignore', 'ignore', 'ignore'] }); return true; } catch (_) { return false; }
      });
      const commitPaths = [projectPathspec].concat(stagedRoadmap, liveTracked ? [livePathspec] : []);
      const excludes = [excludeReceipt, excludeFallback, excludeLiveReceipt, excludeLiveFallback];
      if (fs.existsSync(archiveDir)) {
        try {
          execFileSync('git', ['-C', mainRoot, 'add', '--', ...commitPaths, ...excludes], { encoding: 'utf8' });
        } catch (_) {}
        let hasStaged = false;
        try {
          execFileSync('git', ['-C', mainRoot, 'diff', '--cached', '--quiet', '--', ...commitPaths, ...excludes], { stdio: 'ignore' });
        } catch (e) {
          if (e && e.status === 1) hasStaged = true;
        }
        if (hasStaged) {
          // #521: the COMMIT-side :(exclude) is defensive — `git commit -- <ps>` would re-sweep an
          // already-tracked modified journal even after an exclude-aware `git add`. Kept so the guard
          // holds if a future change ever modifies a tracked non-receipt band file at archive_commit.
          try {
            execFileSync('git', ['-C', mainRoot, 'commit', '-m', 'chore: archive ' + args.project + ' [sink]', '--', ...commitPaths, ...excludes],
              { encoding: 'utf8' });
          } catch (_) {}
        }
      }
      // #700: do NOT stepDone unless the archive THIS sink produced is COMMITTED or ALREADY present
      // at HEAD. The guard is scoped to receipt.archive_dest being set — i.e. the finalize step's
      // archiveProjectDir actually archived a folder (the sole-archiver case). When it is unset, this
      // sink archived nothing: the keep-worktree flow legitimately has the archive at HEAD from the
      // merge, and a genuinely-absent archive (no live folder, nothing to archive) must proceed as
      // before #700 — never a false refusal. A set dest that is neither committed nor at HEAD means
      // the archive/roadmap changes never landed (a collision-suffixed dest escaping the commit) →
      // resumable sink_incomplete (leave the step NOT done so a re-run retries it).
      let archiveAtHead = false;
      try {
        const t = execFileSync('git', ['-C', mainRoot, 'cat-file', '-t', 'HEAD:' + archiveRel], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        archiveAtHead = (t === 'tree');
      } catch (_) { archiveAtHead = false; }
      if (receipt.archive_dest && !archiveAtHead) {
        receipt.archive_commit = 'failed';
        receipt.updated_at = new Date().toISOString();
        writeSinkReceipt(receiptPath, receipt);
        process.stdout.write(JSON.stringify({
          result: 'refuse',
          reason: 'sink_incomplete',
          step: 'archive_commit',
          archive_dest: archiveRel,
          branch: args.branch,
          default_branch: defBranch,
          detail: 'the archive directory (' + archiveRel + ') is neither committed nor present at ' + defBranch + ' HEAD — the archive + roadmap-source removal + regenerated ROADMAP.md never landed in a commit (a collision-suffixed dest escaping the archive commit, #700). Refusing to report status:sinked. The archive_commit step is left NOT done so a re-run retries it.',
        }) + '\n');
        process.exitCode = 1;
        return;
      }
      // Update receipt path to archive location if it moved (now the ACTUAL, possibly suffixed dest).
      const archiveReceiptPath = path.join(archiveDir, '.cache', 'sink-receipt.json');
      if (!fs.existsSync(receiptPath) && fs.existsSync(path.dirname(archiveReceiptPath))) {
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
            reopenIssue(args.issue, {});
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
          // branch's commits (a mid-flight rebase orphans the pre-rebase SHA even though the
          // rebased content did land on defBranch); published_head is the FRESH tip resolved
          // here, letting a caller (cmdVerifySink) distinguish a rebased-but-genuinely-published
          // branch from a truly unpublished one without disturbing branch_head.
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
      // Close issue(s) — reuse postMergeCleanup's probe-before-close (#427) + bundle close (#369).
      // OFFLINE: skip.
      // #497: a HARD close failure (a member that genuinely won't close AND is not already-closed)
      // must NOT report status:sinked. The old code only warned (and bundle members swallowed with a
      // bare catch), then ran stepDone('closure') unconditionally. Instead: bucket each member into
      // closed/failed (mirroring postMergeCleanup), record remote_issue_closed in the receipt, and on
      // ANY genuine failure do NOT stepDone — emit a non-sinked refusal so the caller can retry.
      // #592: the gate used to be `args.issue != null` only — a bundle sink invoked with ONLY
      // `--issue-numbers A,B` (no primary `--issue`) tripped this gate false, skipping the ENTIRE
      // close loop, yet execution still fell through to stepDone('closure') below — the receipt
      // reported closure:done having closed zero issues. Run the loop whenever a primary OR any
      // bundle member is present.
      if (!OFFLINE && (args.issue != null || (Array.isArray(args.issueNumbers) && args.issueNumbers.length > 0))) {
        const forgeOpts = { cwd: mainRoot };
        const keepIssueOpen = !!args.keepIssueOpen;
        if (!keepIssueOpen) {
          const closed = [];
          const failed = [];
          const closeOne = (n, comment) => {
            if (probeIssueClosed(n, forgeOpts)) { closed.push(n); return; }
            try {
              ghExec(['issue', 'close', String(n), '--comment', comment], forgeOpts);
              // #619(2): probe the live state on the success path too — an exit-0 close is not proof
              // the issue is actually closed (a rare forge/API race can leave it open).
              if (probeIssueClosed(n, forgeOpts)) { closed.push(n); }
              else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: gh issue close exited 0 for ' + n + ' but the issue is still OPEN\n'); }
            }
            catch (e) {
              // #396.5: an already-closed issue exits 1 — re-probe to classify it a SUCCESS, not failure.
              if (probeIssueClosed(n, forgeOpts)) { closed.push(n); }
              else { failed.push(n); process.stderr.write('sink-merge --sink: WARNING: issue close failed for ' + n + '\n'); }
            }
          };
          if (args.issue != null) {
            closeOne(args.issue, 'Merged via sink-merge --sink.');
            try { ghExec(['issue', 'edit', String(args.issue), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
          }
          // Bundle members — includes the no-primary bundle shape (#592): when args.issue is
          // absent, every member in args.issueNumbers is closed (none is "the primary" to skip).
          if (Array.isArray(args.issueNumbers) && args.issueNumbers.length > (args.issue != null ? 1 : 0)) {
            for (const n of args.issueNumbers) {
              if (n === args.issue) continue;
              const comment = args.issue != null
                ? 'Merged via sink-merge --sink (bundle member).'
                : 'Merged via sink-merge --sink.';
              closeOne(n, comment);
              try { ghExec(['issue', 'edit', String(n), '--remove-label', 'workflow:in-progress'], forgeOpts); } catch (_) {}
            }
          }
          // #592: record the actually-closed set on the receipt (both the success and failure
          // paths) so a resume can VERIFY-then-retry against it rather than silently skip.
          if (closed.length > 0) receipt.closed_issues = closed.slice().sort((a, b) => a - b);
          // #497: only the FAILURE path refuses — SUCCESS still falls straight through to
          // stepDone('closure') below (now carrying receipt.closed_issues per #592).
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

  // #694: keep-open END-STATE guard — the keep-open mirror of the remote_closed_after_publish
  // verification. Runs on EVERY path to terminal success regardless of which steps were skipped: a
  // stale/resumed receipt could skip the closure step's live keep-open handling AND the push_main
  // #517 auto-close reopen, so neither alone is sufficient. If keep-open is in force and the issue is
  // CONFIRMED closed on the forge at this point (a close-keyword commit auto-closed it, or a replayed
  // close ran), reopen it; if it is STILL closed after the reopen attempt, refuse sink_incomplete
  // (resumable) rather than report a clean sink over a silently-retired epic. Intent is determined
  // defense-in-depth: the live flag OR the receipt's recorded keep_open_requested OR the archived
  // issue_action: comment_keep_open (mirrors postMergeCleanup's archived-state honor). Probe error /
  // not-confirmed-closed proceeds (an unprobeable forge must not block a legitimate sink); only a
  // POSITIVE still-closed after reopen refuses.
  {
    let keepOpen = !!args.keepIssueOpen || receipt.keep_open_requested === true;
    if (!keepOpen && args.issue != null) {
      const stateCandidates = [];
      if (receipt.archive_dest) stateCandidates.push(path.join(mainRoot, receipt.archive_dest, 'workflow-state.md'));
      stateCandidates.push(path.join(mainRoot, 'kaola-workflow', 'archive', args.project, 'workflow-state.md'));
      for (const sc of stateCandidates) {
        try {
          if (/^issue_action:\s*comment_keep_open\s*$/m.test(fs.readFileSync(sc, 'utf8'))) { keepOpen = true; break; }
        } catch (_) {}
      }
    }
    // Trust the push_main #517 reopen when it already ran this invocation (receipt already records
    // reopened_after_autoclose): that is the DESIGNATED reopen point. This terminal guard is a
    // BACKSTOP for paths that SKIPPED push_main — a stale/resumed receipt where the #517 reopen never
    // ran — so it only re-probes + refuses when push_main did not already handle the auto-close.
    if (!OFFLINE && keepOpen && args.issue != null && receipt.remote_issue_closed !== 'reopened_after_autoclose') {
      let stillClosed = false;
      try {
        if (probeIssueClosed(args.issue, {})) {
          try { reopenIssue(args.issue, {}); } catch (_) {}
          stillClosed = probeIssueClosed(args.issue, {});
          if (!stillClosed) {
            receipt.remote_issue_closed = 'reopened_after_autoclose';
            receipt.updated_at = new Date().toISOString();
            writeSinkReceipt(receiptPath, receipt);
          }
        }
      } catch (_) { stillClosed = false; } // probe/reopen fault: cannot PROVE closed → do not refuse
      if (stillClosed) {
        receipt.remote_issue_closed = 'failed';
        receipt.updated_at = new Date().toISOString();
        writeSinkReceipt(receiptPath, receipt);
        process.stdout.write(JSON.stringify({
          result: 'refuse',
          reason: 'sink_incomplete',
          step: 'keep_open_verify',
          keep_open_requested: true,
          remote_issue_closed: 'failed',
          issue: args.issue,
          branch: args.branch,
          detail: 'keep-open was in force but issue #' + args.issue + ' is CLOSED on the forge after push (a close-keyword commit likely auto-closed it) and could not be reopened. Refusing to report status:sinked — a kept-open epic must not be silently retired. Reopen the issue (or resolve the forge fault), then re-run --sink.',
        }) + '\n');
        process.exitCode = 1;
        return;
      }
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
  // #653: terminal success — dispose the crash-resume journals now that finalReceipt has been
  // captured into memory. This sits strictly after every SINK_STEPS entry, the #484 ancestry
  // guard, and worktree/branch teardown, so any earlier crash (or the freshness-guard refusal
  // above) leaves the journal untouched on disk for a resumed run to find.
  const journalDisposed = disposeSinkJournals(mainRoot, args.project, receipt.archive_dest);
  process.stdout.write(JSON.stringify({ result: 'ok', status: 'sinked', journal_disposed: journalDisposed, receipt: finalReceipt }) + '\n');
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
  // #561: lane-group backstop on the legacy (non---sink) main-advance path too — mirror the --sink
  // path's sinkPreflight backstop (:858). A residual lane_group means surviving legs' committed work
  // is NOT on the feature branch (#552 crash-window desync); advancing main here would silently lose
  // it. Pure read, zero mutation, FIRST in the precondition block. Emit the SAME typed refusal the
  // --sink path emits (:1031-1040) — callers parse the typed JSON, so do NOT bare-throw.
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
  assertCleanWorktree(mainRoot, [args.project]);
  assertNoLiveWorkflowFolder(mainRoot, args.project, args.branch);
  if (!OFFLINE) assertBranchPushedToUpstream(mainRoot, args.branch);
  if (!OFFLINE) assertBranchHasNonWorkflowChanges(mainRoot, args.branch, defBranch);
  assertWorktreeClean(mainRoot, args.branch, [args.project]);

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
  // #619(1): postMergeCleanup can now also return { exitCode: 1 } (a failed-close sink_incomplete
  // refusal) alongside the pre-existing { exitCode: 3 } (merge-impossible fallback) — generalize
  // from the exact-3 check to any returned exitCode.
  if (cleanupResult && cleanupResult.exitCode) { process.exitCode = cleanupResult.exitCode; return; }
}

if (require.main === module) {
  try { main(); } catch (err) { process.stderr.write(err.message + '\n'); process.exitCode = 1; }
}

module.exports = { classifyMergeError, assertBranchHasNonWorkflowChanges };
